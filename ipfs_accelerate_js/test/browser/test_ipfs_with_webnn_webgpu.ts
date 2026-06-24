type AccelerationPlatform = 'webnn' | 'webgpu';
type BrowserName = 'chrome' | 'firefox' | 'edge' | 'safari';
type ModelType = 'audio' | 'text' | 'text_embedding' | 'vision' | 'unknown';

interface AccelerationOptions {
  browser?: BrowserName;
  computeShaders?: boolean;
  dbPath?: string;
  enableIpfs?: boolean;
  headless?: boolean;
  mixedPrecision?: boolean;
  modelName: string;
  modelType?: ModelType;
  parallelLoading?: boolean;
  platform?: AccelerationPlatform;
  precision?: 2 | 3 | 4 | 8 | 16 | 32;
  precompileShaders?: boolean;
  useResourcePool?: boolean;
}

interface NormalizedAccelerationOptions {
  browser?: BrowserName;
  computeShaders: boolean;
  dbPath?: string;
  enableIpfs: boolean;
  headless: boolean;
  mixedPrecision: boolean;
  modelName: string;
  modelType: ModelType;
  parallelLoading: boolean;
  platform: AccelerationPlatform;
  precision: 2 | 3 | 4 | 8 | 16 | 32;
  precompileShaders: boolean;
  useResourcePool: boolean;
}

interface AccelerationResult {
  browser?: BrowserName;
  inferenceTime: number;
  inputs: Record<string, unknown>;
  ipfsAccelerated: boolean;
  modelName: string;
  modelType: ModelType;
  platform: AccelerationPlatform;
  status: 'success';
  totalTestTime: number;
  useResourcePool: boolean;
}

const TEXT_INPUT_IDS = [101, 2023, 2003, 1037, 3231, 102];
const TEXT_ATTENTION_MASK = [1, 1, 1, 1, 1, 1];

function inferModelType(modelName: string): ModelType {
  const normalizedName = modelName.toLowerCase();

  if (normalizedName.includes('whisper') || normalizedName.includes('wav2vec')) {
    return 'audio';
  }

  if (normalizedName.includes('clip') || normalizedName.includes('vit')) {
    return 'vision';
  }

  if (normalizedName.includes('bert')) {
    return 'text_embedding';
  }

  if (normalizedName.includes('t5') || normalizedName.includes('llama')) {
    return 'text';
  }

  return 'unknown';
}

function createTestInputs(modelName: string): { inputs: Record<string, unknown>; modelType: ModelType } {
  const modelType = inferModelType(modelName);

  if (modelType === 'audio') {
    return {
      inputs: {
        input_features: Array.from({ length: 3000 }, () => 0.5),
      },
      modelType,
    };
  }

  if (modelType === 'vision') {
    return {
      inputs: {
        pixel_values: Array.from({ length: 224 }, () =>
          Array.from({ length: 224 }, () => [0.5, 0.5, 0.5]),
        ),
      },
      modelType,
    };
  }

  if (modelType === 'text' || modelType === 'text_embedding') {
    return {
      inputs: {
        attention_mask: TEXT_ATTENTION_MASK,
        input_ids: TEXT_INPUT_IDS,
      },
      modelType,
    };
  }

  return {
    inputs: {
      inputs: [0.5, 0.5, 0.5],
    },
    modelType,
  };
}

function normalizeAccelerationOptions(options: AccelerationOptions): NormalizedAccelerationOptions {
  return {
    browser: options.browser,
    computeShaders: options.computeShaders ?? false,
    dbPath: options.dbPath,
    enableIpfs: options.enableIpfs ?? true,
    headless: options.headless ?? true,
    mixedPrecision: options.mixedPrecision ?? false,
    modelName: options.modelName,
    modelType: options.modelType ?? inferModelType(options.modelName),
    parallelLoading: options.parallelLoading ?? false,
    platform: options.platform ?? 'webgpu',
    precision: options.precision ?? 16,
    precompileShaders: options.precompileShaders ?? false,
    useResourcePool: options.useResourcePool ?? true,
  };
}

async function runSingleModelTest(
  options: AccelerationOptions,
  accelerateWithBrowser: (
    options: NormalizedAccelerationOptions & { inputs: Record<string, unknown> },
  ) => Promise<Omit<AccelerationResult, 'totalTestTime'>>,
): Promise<AccelerationResult> {
  const startedAt = Date.now();
  const normalizedOptions = normalizeAccelerationOptions(options);
  const { inputs } = createTestInputs(normalizedOptions.modelName);
  const accelerationResult = await accelerateWithBrowser({
    ...normalizedOptions,
    inputs,
  });

  return {
    ...accelerationResult,
    totalTestTime: (Date.now() - startedAt) / 1000,
  };
}

async function runConcurrentModelTests(
  models: string[],
  options: Omit<AccelerationOptions, 'modelName'>,
  accelerateWithBrowser: (
    options: NormalizedAccelerationOptions & { inputs: Record<string, unknown> },
  ) => Promise<Omit<AccelerationResult, 'totalTestTime'>>,
): Promise<AccelerationResult[]> {
  return Promise.all(
    models.map((modelName) => runSingleModelTest({ ...options, modelName }, accelerateWithBrowser)),
  );
}

describe('IPFS acceleration with WebNN/WebGPU browser integration', () => {
  it('creates representative inputs for text, vision, audio, and fallback models', () => {
    expect(createTestInputs('bert-base-uncased')).toEqual({
      inputs: {
        attention_mask: TEXT_ATTENTION_MASK,
        input_ids: TEXT_INPUT_IDS,
      },
      modelType: 'text_embedding',
    });

    const visionInputs = createTestInputs('vit-base-patch16-224');
    expect(visionInputs.modelType).toBe('vision');
    expect(visionInputs.inputs.pixel_values).toHaveLength(224);
    expect((visionInputs.inputs.pixel_values as number[][][])[0][0]).toEqual([0.5, 0.5, 0.5]);

    const audioInputs = createTestInputs('whisper-tiny');
    expect(audioInputs.modelType).toBe('audio');
    expect(audioInputs.inputs.input_features).toHaveLength(3000);

    expect(createTestInputs('custom-model')).toEqual({
      inputs: {
        inputs: [0.5, 0.5, 0.5],
      },
      modelType: 'unknown',
    });
  });

  it('normalizes browser acceleration options to the documented defaults', () => {
    expect(normalizeAccelerationOptions({ modelName: 'bert-base-uncased' })).toEqual({
      browser: undefined,
      computeShaders: false,
      dbPath: undefined,
      enableIpfs: true,
      headless: true,
      mixedPrecision: false,
      modelName: 'bert-base-uncased',
      modelType: 'text_embedding',
      parallelLoading: false,
      platform: 'webgpu',
      precision: 16,
      precompileShaders: false,
      useResourcePool: true,
    });
  });

  it('passes IPFS, resource-pool, and hardware options to the browser accelerator', async () => {
    const accelerateWithBrowser = jest.fn(async (options) => ({
      browser: options.browser,
      inferenceTime: 0.01,
      inputs: options.inputs,
      ipfsAccelerated: options.enableIpfs,
      modelName: options.modelName,
      modelType: options.modelType,
      platform: options.platform,
      status: 'success' as const,
      useResourcePool: options.useResourcePool,
    }));

    const result = await runSingleModelTest(
      {
        browser: 'firefox',
        computeShaders: true,
        enableIpfs: false,
        mixedPrecision: true,
        modelName: 'whisper-tiny',
        platform: 'webgpu',
        precision: 8,
        precompileShaders: true,
        useResourcePool: false,
      },
      accelerateWithBrowser,
    );

    expect(accelerateWithBrowser).toHaveBeenCalledWith(
      expect.objectContaining({
        browser: 'firefox',
        computeShaders: true,
        enableIpfs: false,
        inputs: expect.objectContaining({ input_features: expect.any(Array) }),
        mixedPrecision: true,
        modelName: 'whisper-tiny',
        modelType: 'audio',
        platform: 'webgpu',
        precision: 8,
        precompileShaders: true,
        useResourcePool: false,
      }),
    );
    expect(result).toMatchObject({
      browser: 'firefox',
      ipfsAccelerated: false,
      modelName: 'whisper-tiny',
      modelType: 'audio',
      platform: 'webgpu',
      status: 'success',
      useResourcePool: false,
    });
    expect(result.totalTestTime).toBeGreaterThanOrEqual(0);
  });

  it('runs each requested model once when concurrent execution is enabled', async () => {
    const accelerateWithBrowser = jest.fn(async (options) => ({
      browser: options.browser,
      inferenceTime: 0.01,
      inputs: options.inputs,
      ipfsAccelerated: options.enableIpfs,
      modelName: options.modelName,
      modelType: options.modelType,
      platform: options.platform,
      status: 'success' as const,
      useResourcePool: options.useResourcePool,
    }));

    const results = await runConcurrentModelTests(
      ['bert-base-uncased', 'vit-base-patch16-224', 'whisper-tiny'],
      {
        browser: 'chrome',
        platform: 'webgpu',
      },
      accelerateWithBrowser,
    );

    expect(accelerateWithBrowser).toHaveBeenCalledTimes(3);
    expect(results.map((result) => result.modelName)).toEqual([
      'bert-base-uncased',
      'vit-base-patch16-224',
      'whisper-tiny',
    ]);
    expect(results.map((result) => result.modelType)).toEqual(['text_embedding', 'vision', 'audio']);
  });
});
