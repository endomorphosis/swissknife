const MODEL_DETAILS = {
  llama: {
    full_name: 'llama-3-8b',
    path: 'models/llama-3-8b',
    type: 'text',
    prompt_template: '### User: {prompt}\n\n### Assistant:',
    sizes: {
      cpu: { fp16: 16000, int8: 8000, int4: 4000 },
      cuda: { fp16: 16000, int8: 8000, int4: 4000 },
      webgpu: { fp16: 16000, int8: 8000, int4: 4000 },
    },
  },
  t5: {
    full_name: 't5-large',
    path: 'models/t5-large',
    type: 'text',
    prompt_template: '{prompt}',
    sizes: {
      cpu: { fp16: 1500, int8: 750, int4: 375 },
      cuda: { fp16: 1500, int8: 750, int4: 375 },
      webgpu: { fp16: 1500, int8: 750, int4: 375 },
    },
  },
};

const AVAILABLE_PLATFORMS = new Set(['cpu', 'cuda', 'webgpu']);

function getModelDetails(modelName) {
  return (
    MODEL_DETAILS[modelName.toLowerCase()] ?? {
      full_name: modelName,
      path: `models/${modelName}`,
      type: 'text',
      prompt_template: '{prompt}',
      sizes: {
        cpu: { fp16: 1000, int8: 500, int4: 250 },
        cuda: { fp16: 1000, int8: 500, int4: 250 },
        webgpu: { fp16: 1000, int8: 500, int4: 250 },
      },
    }
  );
}

function comparePrecisionsOnPlatform(platform, modelDetails) {
  const platformSizes = modelDetails.sizes[platform] ?? modelDetails.sizes.cpu;
  const speedMultiplier = platform === 'cuda' ? 0.35 : platform === 'webgpu' ? 0.55 : 1;
  const fp16Time = 1000 * speedMultiplier;

  return {
    fp16: {
      execution_time_ms: fp16Time,
      memory_usage_mb: platformSizes.fp16,
      memory_reduction_percent: 0,
      accuracy_loss_percent: 0,
    },
    int8: {
      execution_time_ms: fp16Time * 0.7,
      memory_usage_mb: platformSizes.int8,
      memory_reduction_percent: 50,
      accuracy_loss_percent: 0.5,
    },
    int4: {
      execution_time_ms: fp16Time * 0.45,
      memory_usage_mb: platformSizes.int4,
      memory_reduction_percent: 75,
      accuracy_loss_percent: 1.5,
    },
  };
}

function compare4BitAcrossPlatforms(options) {
  const modelDetails = getModelDetails(options.model);
  const requestedPlatforms = options.allPlatforms ? Array.from(AVAILABLE_PLATFORMS) : options.hardware;
  const platforms = requestedPlatforms.filter((platform) => AVAILABLE_PLATFORMS.has(platform));
  const results = {
    model: modelDetails.full_name,
    platforms: {},
    comparison: {},
    matrix: {
      hardware: [],
      browsers: [],
      memory_reduction: {},
      performance_improvement: {},
      accuracy_impact: {},
    },
  };

  for (const platform of platforms) {
    const precisionResults = comparePrecisionsOnPlatform(platform, modelDetails);
    const speedup = precisionResults.fp16.execution_time_ms / precisionResults.int4.execution_time_ms;

    results.platforms[platform] = precisionResults;
    results.matrix.hardware.push(platform);
    results.matrix.memory_reduction[platform] = precisionResults.int4.memory_reduction_percent;
    results.matrix.performance_improvement[platform] = speedup;
    results.matrix.accuracy_impact[platform] = precisionResults.int4.accuracy_loss_percent;
  }

  if (options.crossBrowser && platforms.includes('webgpu')) {
    for (const browser of ['chrome', 'firefox', 'edge']) {
      const key = `webgpu_${browser}`;
      const browserResults = comparePrecisionsOnPlatform('webgpu', modelDetails);

      results.platforms[key] = browserResults;
      results.matrix.browsers.push(browser);
      results.matrix.memory_reduction[key] = browserResults.int4.memory_reduction_percent;
      results.matrix.performance_improvement[key] =
        browserResults.fp16.execution_time_ms / browserResults.int4.execution_time_ms;
      results.matrix.accuracy_impact[key] = browserResults.int4.accuracy_loss_percent;
    }
  }

  const int4Times = Object.fromEntries(
    Object.entries(results.platforms).map(([platform, precisionResults]) => [
      platform,
      precisionResults.int4.execution_time_ms,
    ]),
  );
  const baseTime = Math.max(...Object.values(int4Times));

  for (const [platform, timeMs] of Object.entries(int4Times)) {
    results.comparison[platform] = baseTime / timeMs;
  }

  return results;
}

describe('cross-platform 4-bit quantization comparison', () => {
  it('builds model defaults without malformed generated template literals', () => {
    const unknownModel = getModelDetails('custom-llm');

    expect(unknownModel.path).toBe('models/custom-llm');
    expect(unknownModel.prompt_template).toBe('{prompt}');
    expect(unknownModel.sizes.webgpu.int4).toBe(250);
  });

  it('filters unavailable hardware and records INT4 comparison metrics', () => {
    const results = compare4BitAcrossPlatforms({
      model: 'llama',
      hardware: ['cpu', 'cuda', 'rocm', 'webgpu'],
    });

    expect(results.model).toBe('llama-3-8b');
    expect(results.matrix.hardware).toEqual(['cpu', 'cuda', 'webgpu']);
    expect(results.platforms.rocm).toBeUndefined();
    expect(results.matrix.memory_reduction.cpu).toBe(75);
    expect(results.matrix.accuracy_impact.cuda).toBe(1.5);
    expect(results.matrix.performance_improvement.webgpu).toBeCloseTo(2.222, 3);
    expect(results.comparison.cuda).toBeGreaterThan(results.comparison.cpu);
  });

  it('adds browser compatibility rows only when WebGPU is part of the run', () => {
    const withoutWebGpu = compare4BitAcrossPlatforms({
      model: 't5',
      hardware: ['cpu'],
      crossBrowser: true,
    });
    const withWebGpu = compare4BitAcrossPlatforms({
      model: 't5',
      hardware: ['webgpu'],
      crossBrowser: true,
    });

    expect(withoutWebGpu.matrix.browsers).toEqual([]);
    expect(withWebGpu.matrix.browsers).toEqual(['chrome', 'firefox', 'edge']);
    expect(withWebGpu.platforms.webgpu_firefox.int4.memory_usage_mb).toBe(375);
  });
});
