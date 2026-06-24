type BrowserName = 'chrome' | 'firefox' | 'edge' | 'safari';
type PlatformName = 'webnn' | 'webgpu' | 'all';
type ModelType = 'audio' | 'text' | 'vision';

interface RealAccelerationOptions {
  browser: BrowserName;
  platform: PlatformName;
  optimizeAudio?: boolean;
}

interface WebImplementationLike {
  simulationMode?: boolean;
  simulation_mode?: boolean;
  features?: Record<string, unknown>;
}

const REAL_ACCELERATION_ENV = {
  WEBNN_SIMULATION: '0',
  WEBGPU_SIMULATION: '0',
  USE_BROWSER_AUTOMATION: '1',
} as const;

const FIREFOX_AUDIO_ENV = {
  USE_FIREFOX_WEBGPU: '1',
  MOZ_WEBGPU_ADVANCED_COMPUTE: '1',
  WEBGPU_COMPUTE_SHADERS_ENABLED: '1',
} as const;

function buildRealAccelerationEnvironment(
  options: RealAccelerationOptions,
): Record<string, string> {
  return {
    ...REAL_ACCELERATION_ENV,
    ...(options.browser === 'firefox' && options.optimizeAudio ? FIREFOX_AUDIO_ENV : {}),
  };
}

function getRuntimePlatform(platform: PlatformName): Exclude<PlatformName, 'all'> {
  return platform === 'all' ? 'webgpu' : platform;
}

function detectModelType(modelName: string): ModelType {
  const normalizedModelName = modelName.toLowerCase();

  if (normalizedModelName.includes('whisper')) {
    return 'audio';
  }

  if (normalizedModelName.includes('vit') || normalizedModelName.includes('clip')) {
    return 'vision';
  }

  return 'text';
}

function isRealImplementation(implementation: WebImplementationLike): boolean {
  return !(implementation.simulationMode ?? implementation.simulation_mode ?? true);
}

describe('IPFS real WebNN/WebGPU acceleration test configuration', () => {
  it('forces real browser-backed WebNN and WebGPU implementations', () => {
    expect(
      buildRealAccelerationEnvironment({
        browser: 'edge',
        platform: 'webnn',
      }),
    ).toEqual(REAL_ACCELERATION_ENV);
  });

  it('enables Firefox WebGPU audio optimizations only when requested', () => {
    expect(
      buildRealAccelerationEnvironment({
        browser: 'firefox',
        platform: 'webgpu',
        optimizeAudio: true,
      }),
    ).toMatchObject(FIREFOX_AUDIO_ENV);

    expect(
      buildRealAccelerationEnvironment({
        browser: 'chrome',
        platform: 'webgpu',
        optimizeAudio: true,
      }),
    ).not.toHaveProperty('USE_FIREFOX_WEBGPU');
  });

  it('uses WebGPU as the concrete runtime when all platforms are requested', () => {
    expect(getRuntimePlatform('all')).toBe('webgpu');
    expect(getRuntimePlatform('webnn')).toBe('webnn');
  });

  it.each([
    ['whisper-tiny', 'audio'],
    ['vit-base-patch16-224', 'vision'],
    ['openai/clip-vit-base-patch32', 'vision'],
    ['bert-base-uncased', 'text'],
  ] as const)('classifies %s as a %s model', (modelName, expectedType) => {
    expect(detectModelType(modelName)).toBe(expectedType);
  });

  it('treats simulation mode as not real hardware acceleration', () => {
    expect(isRealImplementation({ simulationMode: false })).toBe(true);
    expect(isRealImplementation({ simulation_mode: false })).toBe(true);
    expect(isRealImplementation({ simulationMode: true })).toBe(false);
    expect(isRealImplementation({})).toBe(false);
  });
});

export {};
