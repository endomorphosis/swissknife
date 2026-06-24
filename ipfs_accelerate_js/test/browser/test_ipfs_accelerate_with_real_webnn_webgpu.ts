const AUDIO_MODEL_PATTERNS = ["whisper", "wav2vec", "clap"];
const VISION_MODEL_PATTERNS = ["vit", "clip", "detr", "resnet"];

function detectModelType(modelName) {
  const normalized = modelName.toLowerCase();

  if (AUDIO_MODEL_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "audio";
  }

  if (VISION_MODEL_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "vision";
  }

  return "text";
}

function buildRealHardwareEnvironment(options) {
  const environment = {
    USE_BROWSER_AUTOMATION: "1",
    WEBGPU_SIMULATION: options.allowSimulation ? "1" : "0",
    WEBNN_SIMULATION: options.allowSimulation ? "1" : "0",
  };

  if (options.browser === "firefox" && options.optimizeAudio && detectModelType(options.model) === "audio") {
    environment.USE_FIREFOX_WEBGPU = "1";
    environment.MOZ_WEBGPU_ADVANCED_COMPUTE = "1";
    environment.WEBGPU_COMPUTE_SHADERS_ENABLED = "1";
  }

  return environment;
}

function buildAccelerationConfig(options) {
  const config = {
    platform: options.platform,
    browser: options.browser,
    modelType: detectModelType(options.model),
    useRealHardware: !options.allowSimulation,
    environment: buildRealHardwareEnvironment(options),
  };

  if (options.quantizationBits) {
    config.quantization = {
      bits: options.quantizationBits,
      mixedPrecision: options.quantizationBits < 16,
    };
  }

  return config;
}

function summarizeRunMetrics(options, timings) {
  return {
    model: options.model,
    platform: options.platform,
    browser: options.browser,
    modelType: detectModelType(options.model),
    realImplementation: !options.allowSimulation,
    ipfsTimeMs: timings.ipfsTimeMs,
    inferenceTimeMs: timings.inferenceTimeMs,
    accelerationSpeedup: timings.inferenceTimeMs / timings.ipfsTimeMs,
  };
}

describe("IPFS acceleration with real WebNN/WebGPU configuration", () => {
  it("forces browser automation and disables WebNN/WebGPU simulation by default", () => {
    const config = buildAccelerationConfig({
      browser: "chrome",
      platform: "webgpu",
      model: "bert-base-uncased",
    });

    expect(config.useRealHardware).toBe(true);
    expect(config.environment).toEqual({
      USE_BROWSER_AUTOMATION: "1",
      WEBGPU_SIMULATION: "0",
      WEBNN_SIMULATION: "0",
    });
  });

  it("keeps simulation explicit when a caller opts into simulated hardware", () => {
    const config = buildAccelerationConfig({
      browser: "edge",
      platform: "webnn",
      model: "bert-base-uncased",
      allowSimulation: true,
    });

    expect(config.useRealHardware).toBe(false);
    expect(config.environment.WEBGPU_SIMULATION).toBe("1");
    expect(config.environment.WEBNN_SIMULATION).toBe("1");
  });

  it("enables Firefox compute shader flags only for optimized audio models", () => {
    const audioConfig = buildAccelerationConfig({
      browser: "firefox",
      platform: "webgpu",
      model: "whisper-tiny",
      optimizeAudio: true,
    });
    const textConfig = buildAccelerationConfig({
      browser: "firefox",
      platform: "webgpu",
      model: "bert-base-uncased",
      optimizeAudio: true,
    });

    expect(audioConfig.modelType).toBe("audio");
    expect(audioConfig.environment).toMatchObject({
      USE_FIREFOX_WEBGPU: "1",
      MOZ_WEBGPU_ADVANCED_COMPUTE: "1",
      WEBGPU_COMPUTE_SHADERS_ENABLED: "1",
    });
    expect(textConfig.modelType).toBe("text");
    expect(textConfig.environment.USE_FIREFOX_WEBGPU).toBeUndefined();
  });

  it("classifies common text, vision, and audio model names for test input selection", () => {
    expect(detectModelType("prajjwal1/bert-tiny")).toBe("text");
    expect(detectModelType("google/vit-base-patch16-224")).toBe("vision");
    expect(detectModelType("openai/whisper-tiny")).toBe("audio");
  });

  it("carries quantization settings into the acceleration config", () => {
    const config = buildAccelerationConfig({
      browser: "safari",
      platform: "webgpu",
      model: "google/vit-base-patch16-224",
      quantizationBits: 4,
    });

    expect(config.quantization).toEqual({
      bits: 4,
      mixedPrecision: true,
    });
  });

  it("creates a stable result summary for database persistence", () => {
    const metrics = summarizeRunMetrics(
      {
        browser: "chrome",
        platform: "webgpu",
        model: "bert-base-uncased",
      },
      {
        ipfsTimeMs: 25,
        inferenceTimeMs: 100,
      },
    );

    expect(metrics).toEqual({
      model: "bert-base-uncased",
      platform: "webgpu",
      browser: "chrome",
      modelType: "text",
      realImplementation: true,
      ipfsTimeMs: 25,
      inferenceTimeMs: 100,
      accelerationSpeedup: 4,
    });
  });
});
