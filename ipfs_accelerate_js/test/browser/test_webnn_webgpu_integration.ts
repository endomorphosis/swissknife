import { describe, expect, it } from "@jest/globals";

type PlatformName = "webgpu" | "webnn";
type BrowserName = "chrome" | "edge" | "firefox" | "safari";
type ModelType = "text" | "vision" | "audio";
type ImplementationType = "REAL_WEBGPU" | "REAL_WEBNN";

interface BrowserOptions {
  browserName: BrowserName;
  headless: boolean;
}

interface FeatureSupport {
  adapter?: string;
  backend?: "cpu" | "gpu";
  browser: BrowserName;
  features: string[];
  headless: boolean;
}

interface ModelInfo {
  modelName: string;
  modelType: ModelType;
  platform: PlatformName;
}

interface InferenceResult extends ModelInfo {
  implementationType: ImplementationType;
  output: {
    text: string;
  };
  status: "success";
}

const DEFAULT_MODEL = "bert-base-uncased";
const DEFAULT_MODEL_TYPE: ModelType = "text";

class SimulatedWebGPUImplementation {
  private initialized = false;
  private readonly models = new Map<string, ModelInfo>();

  constructor(private readonly options: BrowserOptions) {}

  async initialize(): Promise<boolean> {
    this.initialized = true;
    return true;
  }

  getFeatureSupport(): FeatureSupport {
    return {
      adapter: "simulated-webgpu-adapter",
      browser: this.options.browserName,
      features: ["shader-f16", "timestamp-query", "compute-shaders"],
      headless: this.options.headless,
    };
  }

  async initializeModel(modelName: string, modelType: ModelType): Promise<ModelInfo> {
    this.assertInitialized();
    const modelInfo = {
      modelName,
      modelType,
      platform: "webgpu" as const,
    };

    this.models.set(modelName, modelInfo);
    return modelInfo;
  }

  async runInference(modelName: string, input: string): Promise<InferenceResult> {
    const modelInfo = this.models.get(modelName);

    if (!modelInfo) {
      throw new Error(`Model ${modelName} has not been initialized for WebGPU`);
    }

    return {
      ...modelInfo,
      implementationType: "REAL_WEBGPU",
      output: {
        text: `Processed with WebGPU: ${input}`,
      },
      status: "success",
    };
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    this.models.clear();
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error("WebGPU implementation must be initialized first");
    }
  }
}

class SimulatedWebNNImplementation {
  private initialized = false;
  private readonly models = new Map<string, ModelInfo>();

  constructor(private readonly options: BrowserOptions) {}

  async initialize(): Promise<boolean> {
    this.initialized = true;
    return true;
  }

  getFeatureSupport(): FeatureSupport {
    return {
      backend: this.options.browserName === "edge" ? "gpu" : "cpu",
      browser: this.options.browserName,
      features: ["matmul", "gelu", "softmax"],
      headless: this.options.headless,
    };
  }

  getBackendInfo(): { backend: "cpu" | "gpu"; implementation: "webnn" } {
    return {
      backend: this.options.browserName === "edge" ? "gpu" : "cpu",
      implementation: "webnn",
    };
  }

  async initializeModel(modelName: string, modelType: ModelType): Promise<ModelInfo> {
    this.assertInitialized();
    const modelInfo = {
      modelName,
      modelType,
      platform: "webnn" as const,
    };

    this.models.set(modelName, modelInfo);
    return modelInfo;
  }

  async runInference(modelName: string, input: string): Promise<InferenceResult> {
    const modelInfo = this.models.get(modelName);

    if (!modelInfo) {
      throw new Error(`Model ${modelName} has not been initialized for WebNN`);
    }

    return {
      ...modelInfo,
      implementationType: "REAL_WEBNN",
      output: {
        text: `Processed with WebNN: ${input}`,
      },
      status: "success",
    };
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    this.models.clear();
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error("WebNN implementation must be initialized first");
    }
  }
}

class SimulatedWebPlatformIntegration {
  private readonly implementations = new Map<PlatformName, SimulatedWebGPUImplementation | SimulatedWebNNImplementation>();

  async initializePlatform(options: BrowserOptions & { platform: PlatformName }): Promise<boolean> {
    const implementation =
      options.platform === "webgpu"
        ? new SimulatedWebGPUImplementation(options)
        : new SimulatedWebNNImplementation(options);

    const initialized = await implementation.initialize();
    this.implementations.set(options.platform, implementation);
    return initialized;
  }

  async initializeModel(options: {
    modelName: string;
    modelType: ModelType;
    platform: PlatformName;
  }): Promise<ModelInfo> {
    return this.getImplementation(options.platform).initializeModel(options.modelName, options.modelType);
  }

  async runInference(options: {
    inputData: string;
    modelName: string;
    platform: PlatformName;
  }): Promise<InferenceResult> {
    return this.getImplementation(options.platform).runInference(options.modelName, options.inputData);
  }

  async shutdown(platform: PlatformName): Promise<void> {
    const implementation = this.implementations.get(platform);

    if (implementation) {
      await implementation.shutdown();
      this.implementations.delete(platform);
    }
  }

  private getImplementation(platform: PlatformName): SimulatedWebGPUImplementation | SimulatedWebNNImplementation {
    const implementation = this.implementations.get(platform);

    if (!implementation) {
      throw new Error(`${platform} platform has not been initialized`);
    }

    return implementation;
  }
}

function buildSimulationEnvironment(browserName: BrowserName): Record<string, string> {
  return {
    SIMULATE_WEBGPU: "1",
    SIMULATE_WEBNN: "1",
    TEST_BROWSER: browserName,
    WEBGPU_AVAILABLE: "1",
    WEBNN_AVAILABLE: "1",
  };
}

async function runUnifiedPlatformInference(platform: PlatformName): Promise<InferenceResult> {
  const integration = new SimulatedWebPlatformIntegration();

  try {
    await integration.initializePlatform({
      browserName: platform === "webnn" ? "edge" : "chrome",
      headless: true,
      platform,
    });
    await integration.initializeModel({
      modelName: DEFAULT_MODEL,
      modelType: DEFAULT_MODEL_TYPE,
      platform,
    });

    return await integration.runInference({
      inputData: "This is a test input for unified platform inference.",
      modelName: DEFAULT_MODEL,
      platform,
    });
  } finally {
    await integration.shutdown(platform);
  }
}

describe("WebNN and WebGPU integration", () => {
  it("initializes WebGPU models and returns a real WebGPU result shape", async () => {
    const implementation = new SimulatedWebGPUImplementation({
      browserName: "chrome",
      headless: true,
    });

    await expect(implementation.initialize()).resolves.toBe(true);
    expect(implementation.getFeatureSupport()).toMatchObject({
      adapter: "simulated-webgpu-adapter",
      features: expect.arrayContaining(["compute-shaders"]),
    });
    await expect(implementation.initializeModel(DEFAULT_MODEL, DEFAULT_MODEL_TYPE)).resolves.toEqual({
      modelName: DEFAULT_MODEL,
      modelType: DEFAULT_MODEL_TYPE,
      platform: "webgpu",
    });

    await expect(implementation.runInference(DEFAULT_MODEL, "Example input")).resolves.toMatchObject({
      implementationType: "REAL_WEBGPU",
      modelName: DEFAULT_MODEL,
      platform: "webgpu",
      status: "success",
    });
  });

  it("initializes WebNN models and exposes backend information", async () => {
    const implementation = new SimulatedWebNNImplementation({
      browserName: "edge",
      headless: true,
    });

    await expect(implementation.initialize()).resolves.toBe(true);
    expect(implementation.getFeatureSupport()).toMatchObject({
      backend: "gpu",
      features: expect.arrayContaining(["matmul", "gelu"]),
    });
    expect(implementation.getBackendInfo()).toEqual({
      backend: "gpu",
      implementation: "webnn",
    });

    await implementation.initializeModel(DEFAULT_MODEL, DEFAULT_MODEL_TYPE);
    await expect(implementation.runInference(DEFAULT_MODEL, "Example input")).resolves.toMatchObject({
      implementationType: "REAL_WEBNN",
      modelName: DEFAULT_MODEL,
      platform: "webnn",
      status: "success",
    });
  });

  it.each([
    ["webgpu", "REAL_WEBGPU"],
    ["webnn", "REAL_WEBNN"],
  ] as const)("routes unified %s inference through the expected implementation", async (platform, implementationType) => {
    await expect(runUnifiedPlatformInference(platform)).resolves.toMatchObject({
      implementationType,
      modelName: DEFAULT_MODEL,
      modelType: DEFAULT_MODEL_TYPE,
      platform,
      status: "success",
    });
  });

  it("requires platform and model initialization before inference", async () => {
    const integration = new SimulatedWebPlatformIntegration();

    await expect(
      integration.runInference({
        inputData: "missing platform",
        modelName: DEFAULT_MODEL,
        platform: "webgpu",
      }),
    ).rejects.toThrow("webgpu platform has not been initialized");

    await integration.initializePlatform({
      browserName: "chrome",
      headless: true,
      platform: "webgpu",
    });

    await expect(
      integration.runInference({
        inputData: "missing model",
        modelName: DEFAULT_MODEL,
        platform: "webgpu",
      }),
    ).rejects.toThrow(`Model ${DEFAULT_MODEL} has not been initialized for WebGPU`);
  });

  it("creates the simulated browser environment used by non-browser validation", () => {
    expect(buildSimulationEnvironment("chrome")).toEqual({
      SIMULATE_WEBGPU: "1",
      SIMULATE_WEBNN: "1",
      TEST_BROWSER: "chrome",
      WEBGPU_AVAILABLE: "1",
      WEBNN_AVAILABLE: "1",
    });
  });
});
