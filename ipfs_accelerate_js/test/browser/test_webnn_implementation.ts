import { describe, expect, it } from "@jest/globals";

type BrowserName = "chrome" | "edge" | "firefox" | "safari";
type ModelType = "text" | "vision";
type BackendName = "webgpu" | "webnn-gpu" | "webnn-cpu" | "cpu";

interface BrowserEnvironment {
  browser: BrowserName;
  version: number;
  platform?: "desktop" | "mobile";
  webgpuAvailable?: boolean;
}

interface WebNNCapabilities {
  available: boolean;
  cpuBackend: boolean;
  gpuBackend: boolean;
  npuBackend: boolean;
  mobileOptimized: boolean;
  preferredBackend: BackendName;
  operators: string[];
}

interface InferenceMetrics {
  initializationTimeMs: number;
  firstInferenceTimeMs: number;
  averageInferenceTimeMs: number;
  supportedOps: string[];
  fallbackOps: string[];
}

interface WebPlatformConfig {
  useWebGPU: boolean;
  useWebNN: boolean;
  webnnGPUBackend: boolean;
  webnnCPUBackend: boolean;
  webnnPreferredBackend: BackendName;
}

const WEBNN_OPERATORS = [
  "matmul",
  "conv2d",
  "relu",
  "gelu",
  "softmax",
  "add",
  "clamp",
  "split",
];

function getWebNNCapabilities(env: BrowserEnvironment): WebNNCapabilities {
  const isChromiumWebNN =
    (env.browser === "edge" || env.browser === "chrome") && env.version >= 113;
  const isMobile = env.platform === "mobile";

  return {
    available: isChromiumWebNN,
    cpuBackend: isChromiumWebNN,
    gpuBackend: isChromiumWebNN && env.browser === "edge" && !isMobile,
    npuBackend: isChromiumWebNN && env.browser === "edge" && isMobile,
    mobileOptimized: isChromiumWebNN && isMobile,
    preferredBackend:
      isChromiumWebNN && env.browser === "edge" && !isMobile
        ? "webnn-gpu"
        : isChromiumWebNN
          ? "webnn-cpu"
          : "cpu",
    operators: isChromiumWebNN ? WEBNN_OPERATORS : [],
  };
}

function isWebNNSupported(env: BrowserEnvironment): boolean {
  return getWebNNCapabilities(env).available;
}

function checkWebNNOperatorSupport(
  requestedOperators: string[],
  capabilities: WebNNCapabilities
): Record<string, boolean> {
  const supported = new Set(capabilities.operators);

  return Object.fromEntries(
    requestedOperators.map((operator) => [operator, supported.has(operator)])
  );
}

function getOptimalConfig(env: BrowserEnvironment): WebPlatformConfig {
  const capabilities = getWebNNCapabilities(env);
  const useWebGPU = env.webgpuAvailable ?? true;
  const useWebNN = !useWebGPU && capabilities.available;

  return {
    useWebGPU,
    useWebNN,
    webnnGPUBackend: useWebNN && capabilities.gpuBackend,
    webnnCPUBackend: useWebNN && capabilities.cpuBackend,
    webnnPreferredBackend: useWebNN ? capabilities.preferredBackend : "cpu",
  };
}

class WebNNInference {
  private readonly capabilities: WebNNCapabilities;
  private calls = 0;

  constructor(private readonly env: BrowserEnvironment, private readonly modelType: ModelType) {
    this.capabilities = getWebNNCapabilities(env);
  }

  run(input: unknown): { backend: BackendName; modelType: ModelType; input: unknown; ok: true } {
    this.calls += 1;

    return {
      backend: this.capabilities.available ? this.capabilities.preferredBackend : "cpu",
      modelType: this.modelType,
      input,
      ok: true,
    };
  }

  getPerformanceMetrics(): InferenceMetrics {
    const supportedOps = this.capabilities.operators;

    return {
      initializationTimeMs: this.capabilities.available ? 8 : 1,
      firstInferenceTimeMs: this.capabilities.available ? 15 : 45,
      averageInferenceTimeMs: this.capabilities.available ? 12 : 40,
      supportedOps,
      fallbackOps: WEBNN_OPERATORS.filter((operator) => !supportedOps.includes(operator)),
    };
  }

  getCallCount(): number {
    return this.calls;
  }
}

class WebPlatformAccelerator {
  private readonly config: WebPlatformConfig;
  private inference: WebNNInference | null = null;

  constructor(
    private readonly env: BrowserEnvironment,
    private readonly modelType: ModelType,
    config: WebPlatformConfig = getOptimalConfig(env)
  ) {
    this.config = config;
  }

  getConfig(): WebPlatformConfig {
    return this.config;
  }

  getFeatureUsage(): Record<BackendName, boolean> {
    return {
      webgpu: this.config.useWebGPU,
      "webnn-gpu": this.config.useWebNN && this.config.webnnGPUBackend,
      "webnn-cpu": this.config.useWebNN && this.config.webnnCPUBackend,
      cpu: !this.config.useWebGPU && !this.config.useWebNN,
    };
  }

  createEndpoint(): (input: unknown) => ReturnType<WebNNInference["run"]> {
    this.inference = new WebNNInference(this.env, this.modelType);
    return (input: unknown) => this.inference!.run(input);
  }

  getPerformanceMetrics(): InferenceMetrics {
    return (
      this.inference?.getPerformanceMetrics() ?? {
        initializationTimeMs: 0,
        firstInferenceTimeMs: 0,
        averageInferenceTimeMs: 0,
        supportedOps: [],
        fallbackOps: WEBNN_OPERATORS,
      }
    );
  }
}

describe("WebNN implementation capability handling", () => {
  it("detects Chromium WebNN support and reports operator coverage", () => {
    const env: BrowserEnvironment = {
      browser: "edge",
      version: 120,
      platform: "desktop",
    };
    const capabilities = getWebNNCapabilities(env);

    expect(isWebNNSupported(env)).toBe(true);
    expect(capabilities).toMatchObject({
      available: true,
      cpuBackend: true,
      gpuBackend: true,
      npuBackend: false,
      mobileOptimized: false,
      preferredBackend: "webnn-gpu",
    });
    expect(checkWebNNOperatorSupport(["matmul", "gelu", "resize"], capabilities)).toEqual({
      matmul: true,
      gelu: true,
      resize: false,
    });
  });

  it("marks unsupported browsers without leaking stale operator support", () => {
    const capabilities = getWebNNCapabilities({
      browser: "firefox",
      version: 126,
    });

    expect(capabilities.available).toBe(false);
    expect(capabilities.operators).toEqual([]);
    expect(checkWebNNOperatorSupport(["matmul", "relu"], capabilities)).toEqual({
      matmul: false,
      relu: false,
    });
  });
});

describe("WebNN inference and unified web fallback", () => {
  it("returns WebNN-backed text and vision inference metrics when supported", () => {
    const env: BrowserEnvironment = {
      browser: "edge",
      version: 120,
      platform: "desktop",
    };
    const textInference = new WebNNInference(env, "text");
    const visionInference = new WebNNInference(env, "vision");

    expect(textInference.run("Example input text")).toMatchObject({
      backend: "webnn-gpu",
      modelType: "text",
      ok: true,
    });
    expect(visionInference.run({ image: "placeholder_image" })).toMatchObject({
      backend: "webnn-gpu",
      modelType: "vision",
      ok: true,
    });
    expect(textInference.getCallCount()).toBe(1);
    expect(textInference.getPerformanceMetrics()).toMatchObject({
      initializationTimeMs: 8,
      averageInferenceTimeMs: 12,
      fallbackOps: [],
    });
  });

  it("selects WebNN when WebGPU is unavailable and falls back to CPU otherwise", () => {
    expect(
      getOptimalConfig({
        browser: "edge",
        version: 120,
        platform: "desktop",
        webgpuAvailable: false,
      })
    ).toEqual({
      useWebGPU: false,
      useWebNN: true,
      webnnGPUBackend: true,
      webnnCPUBackend: true,
      webnnPreferredBackend: "webnn-gpu",
    });

    expect(
      getOptimalConfig({
        browser: "safari",
        version: 17,
        platform: "desktop",
        webgpuAvailable: false,
      })
    ).toEqual({
      useWebGPU: false,
      useWebNN: false,
      webnnGPUBackend: false,
      webnnCPUBackend: false,
      webnnPreferredBackend: "cpu",
    });
  });

  it("exposes unified accelerator configuration, endpoint, and feature usage", () => {
    const accelerator = new WebPlatformAccelerator(
      {
        browser: "edge",
        version: 120,
        platform: "desktop",
        webgpuAvailable: false,
      },
      "text"
    );
    const endpoint = accelerator.createEndpoint();

    expect(accelerator.getConfig().useWebNN).toBe(true);
    expect(accelerator.getFeatureUsage()).toEqual({
      webgpu: false,
      "webnn-gpu": true,
      "webnn-cpu": true,
      cpu: false,
    });
    expect(endpoint("Example input text")).toMatchObject({
      backend: "webnn-gpu",
      modelType: "text",
      ok: true,
    });
    expect(accelerator.getPerformanceMetrics().supportedOps).toEqual(WEBNN_OPERATORS);
  });
});
