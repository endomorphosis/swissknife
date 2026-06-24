import { describe, expect, it } from "@jest/globals";

type BrowserName = "chrome" | "firefox" | "edge" | "safari";
type OperationType = "matmul" | "attention" | "kv_cache" | "mlp";
type PrecisionBits = 2 | 3 | 4 | 8 | 16;

interface WorkgroupConfig {
  x: number;
  y: number;
  z: number;
}

interface FeatureSupport {
  sharedMemory: boolean;
  subgroupOperations: boolean;
  fp16: boolean;
}

interface ShaderConfig {
  operation: OperationType;
  bits: PrecisionBits;
  browser: BrowserName;
  adaptivePrecision: boolean;
  blockSize?: number;
}

interface OptimizedShader {
  shaderCode: string;
  config: Required<ShaderConfig>;
  featureSupport: FeatureSupport;
  workgroupConfig: WorkgroupConfig;
}

const DEFAULT_BLOCK_SIZE = 64;

const WORKGROUPS: Record<BrowserName, Record<OperationType, WorkgroupConfig>> = {
  chrome: {
    matmul: { x: 8, y: 8, z: 1 },
    attention: { x: 128, y: 1, z: 1 },
    kv_cache: { x: 64, y: 1, z: 1 },
    mlp: { x: 8, y: 8, z: 1 },
  },
  edge: {
    matmul: { x: 8, y: 8, z: 1 },
    attention: { x: 128, y: 1, z: 1 },
    kv_cache: { x: 64, y: 1, z: 1 },
    mlp: { x: 8, y: 8, z: 1 },
  },
  firefox: {
    matmul: { x: 16, y: 4, z: 1 },
    attention: { x: 256, y: 1, z: 1 },
    kv_cache: { x: 128, y: 1, z: 1 },
    mlp: { x: 16, y: 4, z: 1 },
  },
  safari: {
    matmul: { x: 4, y: 4, z: 1 },
    attention: { x: 64, y: 1, z: 1 },
    kv_cache: { x: 32, y: 1, z: 1 },
    mlp: { x: 4, y: 4, z: 1 },
  },
};

const FEATURES: Record<BrowserName, FeatureSupport> = {
  chrome: { sharedMemory: true, subgroupOperations: true, fp16: true },
  edge: { sharedMemory: true, subgroupOperations: true, fp16: true },
  firefox: { sharedMemory: true, subgroupOperations: true, fp16: true },
  safari: { sharedMemory: false, subgroupOperations: false, fp16: true },
};

function getWorkgroupConfig(browser: BrowserName, operation: OperationType): WorkgroupConfig {
  return WORKGROUPS[browser][operation];
}

function getFeatureSupport(browser: BrowserName): FeatureSupport {
  return FEATURES[browser];
}

function validatePrecisionBits(bits: number): asserts bits is PrecisionBits {
  if (![2, 3, 4, 8, 16].includes(bits)) {
    throw new RangeError(`Unsupported precision bits: ${bits}`);
  }
}

function normalizeConfig(config: ShaderConfig): Required<ShaderConfig> {
  validatePrecisionBits(config.bits);

  return {
    ...config,
    blockSize: config.blockSize ?? DEFAULT_BLOCK_SIZE,
  };
}

function shaderBody(operation: OperationType): string {
  switch (operation) {
    case "matmul":
      return "  // multiply packed 4-bit weights by fp16 activations";
    case "attention":
      return "  // apply adaptive precision attention scores";
    case "kv_cache":
      return "  // update quantized key/value cache pages";
    case "mlp":
      return "  // run quantized MLP projection";
  }
}

function generateComputeShader(config: ShaderConfig): string {
  const normalized = normalizeConfig(config);
  const workgroup = getWorkgroupConfig(normalized.browser, normalized.operation);
  const features = getFeatureSupport(normalized.browser);
  const precisionMode = normalized.adaptivePrecision ? "adaptive" : "fixed";

  return [
    `// ${normalized.browser} ${normalized.operation} ${normalized.bits}-bit ${precisionMode} precision`,
    `const BLOCK_SIZE: u32 = ${normalized.blockSize}u;`,
    `const USE_SHARED_MEMORY: bool = ${features.sharedMemory};`,
    `@compute @workgroup_size(${workgroup.x}, ${workgroup.y}, ${workgroup.z})`,
    "fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {",
    shaderBody(normalized.operation),
    "  _ = global_id;",
    "}",
  ].join("\n");
}

function getBrowserOptimizedShader(config: ShaderConfig): OptimizedShader {
  const normalized = normalizeConfig(config);

  return {
    shaderCode: generateComputeShader(normalized),
    config: normalized,
    featureSupport: getFeatureSupport(normalized.browser),
    workgroupConfig: getWorkgroupConfig(normalized.browser, normalized.operation),
  };
}

function estimateQuantizedMemory(bytesAtFp16: number, bits: PrecisionBits): number {
  return bytesAtFp16 * (bits / 16);
}

describe("WebGPU compute shader helpers", () => {
  it("generates a valid matmul WGSL compute entrypoint without conversion placeholders", () => {
    const shader = generateComputeShader({
      operation: "matmul",
      bits: 4,
      browser: "chrome",
      adaptivePrecision: true,
    });

    expect(shader).toContain("@compute @workgroup_size(8, 8, 1)");
    expect(shader).toContain("const BLOCK_SIZE: u32 = 64u;");
    expect(shader).toContain("multiply packed 4-bit weights");
    expect(shader).not.toContain("$1");
    expect(shader).not.toContain("Complex template literal");
  });

  it("returns browser-specific workgroups for the same operation", () => {
    expect(getWorkgroupConfig("chrome", "attention")).toEqual({ x: 128, y: 1, z: 1 });
    expect(getWorkgroupConfig("firefox", "attention")).toEqual({ x: 256, y: 1, z: 1 });
    expect(getWorkgroupConfig("safari", "attention")).toEqual({ x: 64, y: 1, z: 1 });
  });

  it("carries Safari feature limits into optimized shader output", () => {
    const optimized = getBrowserOptimizedShader({
      operation: "kv_cache",
      bits: 4,
      browser: "safari",
      adaptivePrecision: true,
    });

    expect(optimized.featureSupport).toMatchObject({
      sharedMemory: false,
      subgroupOperations: false,
      fp16: true,
    });
    expect(optimized.shaderCode).toContain("const USE_SHARED_MEMORY: bool = false;");
    expect(optimized.workgroupConfig).toEqual({ x: 32, y: 1, z: 1 });
  });

  it("preserves requested precision settings in optimized shader metadata", () => {
    const optimized = getBrowserOptimizedShader({
      operation: "mlp",
      bits: 3,
      browser: "firefox",
      adaptivePrecision: false,
      blockSize: 128,
    });

    expect(optimized.config).toEqual({
      operation: "mlp",
      bits: 3,
      browser: "firefox",
      adaptivePrecision: false,
      blockSize: 128,
    });
    expect(optimized.shaderCode).toContain("firefox mlp 3-bit fixed precision");
    expect(optimized.shaderCode).toContain("const BLOCK_SIZE: u32 = 128u;");
  });

  it("rejects unsupported precision widths before shader generation", () => {
    expect(() =>
      generateComputeShader({
        operation: "matmul",
        bits: 5 as PrecisionBits,
        browser: "chrome",
        adaptivePrecision: true,
      }),
    ).toThrow("Unsupported precision bits: 5");
  });

  it("estimates memory reduction for adaptive low-bit inference", () => {
    expect(estimateQuantizedMemory(1024, 4)).toBe(256);
    expect(estimateQuantizedMemory(1024, 8)).toBe(512);
    expect(estimateQuantizedMemory(1024, 16)).toBe(1024);
  });
});
