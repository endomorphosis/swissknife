import { describe, expect, it } from "@jest/globals";

type PrecisionBits = 4 | 8 | 16;

interface KvCacheConfig {
  batchSize: number;
  numHeads: number;
  headDim: number;
  maxSeqLength: number;
  bits: PrecisionBits;
  slidingWindow?: number;
}

interface CacheEntry {
  position: number;
  key: Float32Array;
  value: Float32Array;
  accessCount: number;
}

interface ShaderConfig {
  seqLength: number;
  numHeads: number;
  headDim: number;
  use4Bit: boolean;
  causal: boolean;
}

const BYTES_PER_FLOAT = 4;

function estimateKvCacheBytes(config: KvCacheConfig): number {
  const valueCount = config.batchSize * config.numHeads * config.maxSeqLength * config.headDim * 2;
  const uncompressedBytes = valueCount * BYTES_PER_FLOAT;

  return uncompressedBytes * (config.bits / 32);
}

function cacheSlotForPosition(position: number, config: KvCacheConfig): number {
  return config.slidingWindow ? position % config.slidingWindow : position;
}

class KvCacheManager {
  private readonly entries = new Map<number, CacheEntry>();

  constructor(private readonly config: KvCacheConfig) {}

  update(position: number, key: Float32Array, value: Float32Array): void {
    if (key.length !== this.config.headDim || value.length !== this.config.headDim) {
      throw new RangeError(`Expected key/value vectors with ${this.config.headDim} elements`);
    }

    const slot = cacheSlotForPosition(position, this.config);

    this.entries.set(slot, {
      position,
      key,
      value,
      accessCount: 0,
    });
  }

  get(position: number): CacheEntry | undefined {
    const entry = this.entries.get(cacheSlotForPosition(position, this.config));

    if (!entry || entry.position !== position) {
      return undefined;
    }

    entry.accessCount += 1;
    return entry;
  }

  prune(maxEntries: number): number[] {
    const keep = [...this.entries.values()]
      .sort((left, right) => right.accessCount - left.accessCount || right.position - left.position)
      .slice(0, maxEntries);
    const keepSlots = new Set(keep.map((entry) => cacheSlotForPosition(entry.position, this.config)));
    const removed: number[] = [];

    for (const [slot, entry] of this.entries) {
      if (!keepSlots.has(slot)) {
        removed.push(entry.position);
        this.entries.delete(slot);
      }
    }

    return removed.sort((left, right) => left - right);
  }

  positions(): number[] {
    return [...this.entries.values()].map((entry) => entry.position).sort((left, right) => left - right);
  }
}

function generateKvCacheShaders(config: ShaderConfig) {
  const storageType = config.use4Bit ? "u32" : "f32";
  const valuesPerWord = config.use4Bit ? 8 : 1;
  const causalGuard = config.causal ? "if (token_index > query_position) { return; }" : "";

  return {
    kvAccess: {
      entryPoint: "main_kv_cache_access",
      workgroupSize: [64, 1, 1] as const,
      configuration: config,
      shaderCode: [
        `const HEAD_DIM: u32 = ${config.headDim}u;`,
        `const VALUES_PER_WORD: u32 = ${valuesPerWord}u;`,
        `@group(0) @binding(0) var<storage, read> kv_cache: array<${storageType}>;`,
        "@compute @workgroup_size(64, 1, 1)",
        "fn main_kv_cache_access(@builtin(global_invocation_id) id: vec3<u32>) {",
        "  let token_index = id.x;",
        "  let query_position = id.y;",
        `  ${causalGuard}`,
        "}",
      ].join("\n"),
    },
    kvUpdate: {
      entryPoint: "main_kv_cache_update",
      workgroupSize: [64, 1, 1] as const,
      configuration: config,
      shaderCode: [
        `const NUM_HEADS: u32 = ${config.numHeads}u;`,
        `const SEQ_LENGTH: u32 = ${config.seqLength}u;`,
        `@group(0) @binding(1) var<storage, read_write> kv_cache: array<${storageType}>;`,
        "@compute @workgroup_size(64, 1, 1)",
        "fn main_kv_cache_update(@builtin(global_invocation_id) id: vec3<u32>) {",
        "  let cache_offset = id.x + id.y * SEQ_LENGTH;",
        "  _ = cache_offset;",
        "}",
      ].join("\n"),
    },
  };
}

describe("WebGPU KV cache optimization browser contract", () => {
  it("estimates quantized KV-cache memory savings from precision width", () => {
    const baseConfig = {
      batchSize: 1,
      numHeads: 8,
      headDim: 64,
      maxSeqLength: 512,
    };

    expect(estimateKvCacheBytes({ ...baseConfig, bits: 16 })).toBe(1_048_576);
    expect(estimateKvCacheBytes({ ...baseConfig, bits: 8 })).toBe(524_288);
    expect(estimateKvCacheBytes({ ...baseConfig, bits: 4 })).toBe(262_144);
  });

  it("uses sliding-window slots so newer tokens replace expired positions", () => {
    const manager = new KvCacheManager({
      batchSize: 1,
      numHeads: 2,
      headDim: 4,
      maxSeqLength: 16,
      bits: 4,
      slidingWindow: 4,
    });

    for (let position = 0; position < 6; position += 1) {
      manager.update(position, Float32Array.of(position, 1, 2, 3), Float32Array.of(position, 4, 5, 6));
    }

    expect(manager.get(0)).toBeUndefined();
    expect(manager.get(1)).toBeUndefined();
    expect(manager.get(2)?.key[0]).toBe(2);
    expect(manager.get(5)?.value[0]).toBe(5);
    expect(manager.positions()).toEqual([2, 3, 4, 5]);
  });

  it("prunes least-used cache entries while retaining frequently accessed tokens", () => {
    const manager = new KvCacheManager({
      batchSize: 1,
      numHeads: 2,
      headDim: 2,
      maxSeqLength: 8,
      bits: 8,
    });

    for (let position = 0; position < 6; position += 1) {
      manager.update(position, Float32Array.of(position, 0), Float32Array.of(position, 1));
    }

    manager.get(1);
    manager.get(1);
    manager.get(4);

    expect(manager.prune(3)).toEqual([0, 2, 3]);
    expect(manager.positions()).toEqual([1, 4, 5]);
  });

  it("generates WGSL shader metadata for 4-bit causal KV access and updates", () => {
    const shaders = generateKvCacheShaders({
      seqLength: 2048,
      numHeads: 32,
      headDim: 128,
      use4Bit: true,
      causal: true,
    });

    expect(shaders.kvAccess.entryPoint).toBe("main_kv_cache_access");
    expect(shaders.kvUpdate.entryPoint).toBe("main_kv_cache_update");
    expect(shaders.kvAccess.shaderCode).toContain("array<u32>");
    expect(shaders.kvAccess.shaderCode).toContain("const VALUES_PER_WORD: u32 = 8u;");
    expect(shaders.kvAccess.shaderCode).toContain("if (token_index > query_position)");
    expect(shaders.kvUpdate.shaderCode).toContain("const SEQ_LENGTH: u32 = 2048u;");
    expect(shaders.kvAccess.shaderCode).not.toContain("$1");
    expect(shaders.kvUpdate.shaderCode).not.toContain("Complex template literal");
  });
});
