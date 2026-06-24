class SafariWebGPUFallback {
  constructor(browserInfo = {}, modelType = 'text', enableLayerProcessing = true) {
    this.browserInfo = browserInfo;
    this.modelType = modelType;
    this.enableLayerProcessing = enableLayerProcessing;
    this.safariVersion = this.parseSafariVersion();
    this.metalFeatures = this.detectMetalFeatures();
    this.strategies = {
      matmul_4bit: jest.fn(() => ({ result: 'matmul_fallback_result' })),
      attention_compute: jest.fn(() => ({ result: 'attention_fallback_result' })),
      kv_cache_update: jest.fn(() => ({ result: 'kv_cache_fallback_result' })),
    };
  }

  needsFallback(operationType) {
    if (operationType === 'matmul_4bit') {
      return true;
    }

    if (operationType === 'attention_compute') {
      return this.safariVersion < 17.0;
    }

    if (operationType === 'kv_cache_update') {
      return !this.metalFeatures.partial_kv_cache_optimization;
    }

    return false;
  }

  executeWithFallback(operationType, inputs, options = {}) {
    if (!this.needsFallback(operationType)) {
      return { success: true, operationType, usedFallback: false };
    }

    const strategy = this.strategies[operationType];
    if (!strategy) {
      return { success: false, operationType, reason: 'unsupported_operation' };
    }

    return strategy(inputs, {
      modelType: this.modelType,
      enableLayerProcessing: this.enableLayerProcessing,
      ...options,
    });
  }

  strategyFor(operationType) {
    return this.strategies[operationType];
  }

  parseSafariVersion() {
    const version = this.browserInfo.version || '';
    const [major] = version.split('.');
    const parsed = Number.parseFloat(major);

    return Number.isFinite(parsed) ? parsed : 16.0;
  }

  detectMetalFeatures() {
    const features = {
      unified_memory: true,
      compute_shaders: true,
      float16_support: true,
      simd_support: true,
    };

    if (this.safariVersion >= 16.0) {
      features.webgpu_tier1 = true;
      features.partial_4bit_support = true;
    }

    if (this.safariVersion >= 16.4) {
      features.enhanced_compute_support = true;
      features.improved_memory_management = true;
    }

    if (this.safariVersion >= 17.0) {
      features.webgpu_tier2 = true;
      features.partial_kv_cache_optimization = true;
      features.improved_shader_compilation = true;
    }

    return features;
  }
}

class FallbackManager {
  constructor(browserInfo = {}) {
    this.browserInfo = browserInfo;
    this.isSafari = (this.browserInfo.name || '').toLowerCase().includes('safari');
  }
}

function createOptimalFallbackStrategy(modelType, browserInfo, operationType) {
  const strategy = {
    use_layer_processing: true,
    chunk_size: 128,
    use_wasm_fallback: true,
    memory_threshold: 0.8,
    prioritize_accuracy: true,
  };

  if (modelType === 'text') {
    strategy.chunk_size = 256;
    strategy.use_token_pruning = true;
    strategy.enable_cache_optimization = true;
  }

  if (modelType === 'vision') {
    strategy.use_tiled_processing = true;
    strategy.tile_size = 224;
    strategy.enable_feature_caching = true;
  }

  if (operationType === 'attention') {
    strategy.use_chunked_attention = true;
    strategy.attention_chunk_size = 128;
    strategy.use_flash_attention_if_available = true;
  }

  if ((browserInfo.name || '').toLowerCase().includes('safari')) {
    strategy.use_safari_optimizations = true;
    strategy.enable_metal_api_if_available = true;
    strategy.memory_threshold = 0.7;
  }

  return strategy;
}

describe('Safari WebGPU fallback behavior', () => {
  const safariBrowserInfo = { name: 'safari', version: '17.0' };
  const chromeBrowserInfo = { name: 'chrome', version: '120.0' };

  it('detects Safari without matching other browser names', () => {
    expect(new FallbackManager(safariBrowserInfo).isSafari).toBe(true);
    expect(new FallbackManager(chromeBrowserInfo).isSafari).toBe(false);
  });

  it('normalizes Safari version strings to the major version', () => {
    const versions = [
      [{ name: 'safari', version: '17.0' }, 17.0],
      [{ name: 'safari', version: '17' }, 17.0],
      [{ name: 'safari', version: '17.0.1' }, 17.0],
      [{ name: 'safari', version: '' }, 16.0],
    ];

    for (const [browserInfo, expectedVersion] of versions) {
      expect(new SafariWebGPUFallback(browserInfo).safariVersion).toBe(expectedVersion);
    }
  });

  it('detects version-gated Metal feature support', () => {
    const safari15 = new SafariWebGPUFallback({ name: 'safari', version: '15.0' });
    const safari16 = new SafariWebGPUFallback({ name: 'safari', version: '16.0' });
    const safari17 = new SafariWebGPUFallback({ name: 'safari', version: '17.0' });

    expect(safari15.metalFeatures.partial_4bit_support).toBeUndefined();
    expect(safari16.metalFeatures.partial_4bit_support).toBe(true);
    expect(safari16.metalFeatures.partial_kv_cache_optimization).toBeUndefined();
    expect(safari17.metalFeatures.partial_4bit_support).toBe(true);
    expect(safari17.metalFeatures.partial_kv_cache_optimization).toBe(true);
  });

  it('requires fallback only for operations Safari cannot run natively', () => {
    const safari17 = new SafariWebGPUFallback({ name: 'safari', version: '17.0' });
    const safari16 = new SafariWebGPUFallback({ name: 'safari', version: '16.0' });

    expect(safari17.needsFallback('matmul_4bit')).toBe(true);
    expect(safari17.needsFallback('attention_compute')).toBe(false);
    expect(safari16.needsFallback('attention_compute')).toBe(true);
  });

  it('customizes fallback strategy by browser, model, and operation', () => {
    const safariStrategy = createOptimalFallbackStrategy('text', safariBrowserInfo, 'attention');
    const chromeStrategy = createOptimalFallbackStrategy('text', chromeBrowserInfo, 'attention');
    const visionStrategy = createOptimalFallbackStrategy('vision', safariBrowserInfo, 'attention');

    expect(safariStrategy.use_safari_optimizations).toBe(true);
    expect(chromeStrategy.use_safari_optimizations).toBeUndefined();
    expect(safariStrategy.memory_threshold).toBeLessThan(chromeStrategy.memory_threshold);
    expect(safariStrategy.use_token_pruning).toBe(true);
    expect(visionStrategy.use_tiled_processing).toBe(true);
  });

  it('delegates fallback execution to the selected strategy', () => {
    const safariFallback = new SafariWebGPUFallback(safariBrowserInfo, 'text', true);

    const result = safariFallback.executeWithFallback(
      'matmul_4bit',
      { a: [[0]], b: [[0]] },
      { chunk_size: 5 },
    );

    expect(safariFallback.strategyFor('matmul_4bit')).toHaveBeenCalledWith(
      { a: [[0]], b: [[0]] },
      {
        modelType: 'text',
        enableLayerProcessing: true,
        chunk_size: 5,
      },
    );
    expect(result).toEqual({ result: 'matmul_fallback_result' });
  });
});
