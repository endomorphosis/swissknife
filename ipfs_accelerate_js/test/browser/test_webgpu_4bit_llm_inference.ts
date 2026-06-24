type ModelSize = 'tiny' | 'small' | '7b';
type ModelType = 'llama' | 'qwen2';

interface LlmModelConfig {
  name: string;
  hiddenSize: number;
  intermediateSize: number;
  attentionHeads: number;
  hiddenLayers: number;
  params: string;
  parameterCount: number;
  contextLength: number;
}

interface FeatureFlags {
  enableKvCache: boolean;
  specializedComputeShaders: boolean;
  firefoxOptimizations: boolean;
  safariCompatibility: boolean;
  reinforcementLearning: boolean;
}

interface SimulationResult {
  modelName: string;
  memory: {
    fp16Mb: number;
    int4Mb: number;
    reductionRatio: number;
  };
  performance: {
    baselineTokensPerSecond: number;
    optimizedTokensPerSecond: number;
    speedupRatio: number;
  };
  kvCache: {
    enabled: boolean;
    estimatedCacheMb: number;
    maxContextLength: number;
  };
  enabledFeatureCount: number;
}

const LLM_MODEL_CONFIGS: Record<ModelType, Record<ModelSize, LlmModelConfig>> = {
  llama: {
    tiny: {
      name: 'TinyLlama/TinyLlama-1.1B-Chat-v1.0',
      hiddenSize: 768,
      intermediateSize: 2048,
      attentionHeads: 12,
      hiddenLayers: 12,
      params: '1.1B',
      parameterCount: 1_100_000_000,
      contextLength: 2048,
    },
    small: {
      name: 'openlm-research/open_llama_3b_v2',
      hiddenSize: 2048,
      intermediateSize: 5504,
      attentionHeads: 32,
      hiddenLayers: 26,
      params: '3B',
      parameterCount: 3_000_000_000,
      contextLength: 2048,
    },
    '7b': {
      name: 'meta-llama/Llama-2-7b-chat-hf',
      hiddenSize: 4096,
      intermediateSize: 11008,
      attentionHeads: 32,
      hiddenLayers: 32,
      params: '7B',
      parameterCount: 7_000_000_000,
      contextLength: 4096,
    },
  },
  qwen2: {
    tiny: {
      name: 'Qwen/Qwen2-0.5B-Instruct',
      hiddenSize: 512,
      intermediateSize: 1360,
      attentionHeads: 8,
      hiddenLayers: 8,
      params: '0.5B',
      parameterCount: 500_000_000,
      contextLength: 2048,
    },
    small: {
      name: 'Qwen/Qwen2-1.5B-Instruct',
      hiddenSize: 1536,
      intermediateSize: 4096,
      attentionHeads: 16,
      hiddenLayers: 24,
      params: '1.5B',
      parameterCount: 1_500_000_000,
      contextLength: 2048,
    },
    '7b': {
      name: 'Qwen/Qwen2-7B-Instruct',
      hiddenSize: 3072,
      intermediateSize: 8192,
      attentionHeads: 32,
      hiddenLayers: 32,
      params: '7B',
      parameterCount: 7_000_000_000,
      contextLength: 8192,
    },
  },
};

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  enableKvCache: true,
  specializedComputeShaders: true,
  firefoxOptimizations: false,
  safariCompatibility: false,
  reinforcementLearning: false,
};

function estimateWeightMemoryMb(parameterCount: number, bitsPerWeight: number): number {
  return (parameterCount * bitsPerWeight) / 8 / 1024 / 1024;
}

function estimateKvCacheMb(config: LlmModelConfig, enabled: boolean): number {
  if (!enabled) {
    return 0;
  }

  const bytesPerFp16Value = 2;
  const keyAndValueTensors = 2;
  const totalBytes =
    config.hiddenLayers * config.contextLength * config.hiddenSize * keyAndValueTensors * bytesPerFp16Value;

  return totalBytes / 1024 / 1024;
}

function simulateWebGpu4BitLlmInference(
  modelType: ModelType,
  modelSize: ModelSize,
  flags: Partial<FeatureFlags> = {},
): SimulationResult {
  const modelConfig = LLM_MODEL_CONFIGS[modelType]?.[modelSize];

  if (!modelConfig) {
    throw new Error(`Unsupported model configuration: ${modelType}/${modelSize}`);
  }

  const featureFlags = { ...DEFAULT_FEATURE_FLAGS, ...flags };
  const fp16Mb = estimateWeightMemoryMb(modelConfig.parameterCount, 16);
  const int4Mb = estimateWeightMemoryMb(modelConfig.parameterCount, 4);
  const enabledFeatureCount = Object.values(featureFlags).filter(Boolean).length;
  const computeShaderMultiplier = featureFlags.specializedComputeShaders ? 1.35 : 1;
  const kvCacheMultiplier = featureFlags.enableKvCache ? 1.2 : 1;
  const browserMultiplier = featureFlags.firefoxOptimizations || featureFlags.safariCompatibility ? 1.08 : 1;
  const autotuningMultiplier = featureFlags.reinforcementLearning ? 1.04 : 1;
  const baselineTokensPerSecond = 12;
  const optimizedTokensPerSecond =
    baselineTokensPerSecond * 1.6 * computeShaderMultiplier * kvCacheMultiplier * browserMultiplier * autotuningMultiplier;

  return {
    modelName: modelConfig.name,
    memory: {
      fp16Mb,
      int4Mb,
      reductionRatio: 1 - int4Mb / fp16Mb,
    },
    performance: {
      baselineTokensPerSecond,
      optimizedTokensPerSecond,
      speedupRatio: optimizedTokensPerSecond / baselineTokensPerSecond,
    },
    kvCache: {
      enabled: featureFlags.enableKvCache,
      estimatedCacheMb: estimateKvCacheMb(modelConfig, featureFlags.enableKvCache),
      maxContextLength: modelConfig.contextLength,
    },
    enabledFeatureCount,
  };
}

describe('WebGPU 4-bit LLM inference simulation', () => {
  it('keeps model configuration coverage for Llama and Qwen2 families', () => {
    expect(Object.keys(LLM_MODEL_CONFIGS)).toEqual(['llama', 'qwen2']);
    expect(LLM_MODEL_CONFIGS.llama['7b']).toMatchObject({
      hiddenSize: 4096,
      hiddenLayers: 32,
      params: '7B',
    });
    expect(LLM_MODEL_CONFIGS.qwen2['7b']).toMatchObject({
      hiddenSize: 3072,
      contextLength: 8192,
      params: '7B',
    });
  });

  it('models the expected 75 percent memory reduction for 4-bit weights', () => {
    const result = simulateWebGpu4BitLlmInference('llama', 'tiny');

    expect(result.memory.fp16Mb).toBeGreaterThan(result.memory.int4Mb);
    expect(result.memory.reductionRatio).toBeCloseTo(0.75, 5);
  });

  it('tracks KV-cache memory separately from quantized model weights', () => {
    const withCache = simulateWebGpu4BitLlmInference('qwen2', 'small', { enableKvCache: true });
    const withoutCache = simulateWebGpu4BitLlmInference('qwen2', 'small', { enableKvCache: false });

    expect(withCache.kvCache.estimatedCacheMb).toBeGreaterThan(0);
    expect(withoutCache.kvCache.estimatedCacheMb).toBe(0);
    expect(withCache.memory.int4Mb).toBe(withoutCache.memory.int4Mb);
  });

  it('accounts for optional browser and autotuning optimizations', () => {
    const baseline = simulateWebGpu4BitLlmInference('llama', 'small', {
      firefoxOptimizations: false,
      reinforcementLearning: false,
      safariCompatibility: false,
    });
    const optimized = simulateWebGpu4BitLlmInference('llama', 'small', {
      firefoxOptimizations: true,
      reinforcementLearning: true,
    });

    expect(optimized.enabledFeatureCount).toBeGreaterThan(baseline.enabledFeatureCount);
    expect(optimized.performance.speedupRatio).toBeGreaterThan(baseline.performance.speedupRatio);
    expect(baseline.performance.speedupRatio).toBeGreaterThanOrEqual(1.6);
  });

  it('rejects unsupported model combinations explicitly', () => {
    expect(() => simulateWebGpu4BitLlmInference('llama', 'medium' as ModelSize)).toThrow(
      'Unsupported model configuration: llama/medium',
    );
  });
});
