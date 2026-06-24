type BrowserName = "chrome" | "edge" | "firefox" | "safari";
type PlatformName = "desktop" | "mobile";
type BackendName = "cpu" | "gpu" | "npu";
type ModelType = "text" | "vision";

interface BrowserEnvironment {
  browser: BrowserName;
  version: number;
  platform?: PlatformName;
}

interface WebNNCapabilities {
  available: boolean;
  backends: BackendName[];
  mobileOptimized: boolean;
  operators: string[];
  preferredBackend: BackendName | "none";
}

interface AcceleratorConfig {
  modelPath: string;
  modelType: ModelType;
  useWebGPU: boolean;
  useWebNN: boolean;
  webnnPreferredBackend: BackendName | "none";
}

const CORE_WEBNN_OPERATORS = ["matmul", "conv2d", "relu", "gelu", "softmax", "add", "clamp"];
const EDGE_EXTRA_OPERATORS = ["split"];

function getWebNNCapabilities(environment: BrowserEnvironment): WebNNCapabilities {
  const platform = environment.platform ?? "desktop";

  if (environment.browser === "edge" && environment.version >= 113) {
    return {
      available: true,
      backends: platform === "mobile" ? ["cpu", "npu"] : ["gpu", "cpu"],
      mobileOptimized: platform === "mobile",
      operators: [...CORE_WEBNN_OPERATORS, ...EDGE_EXTRA_OPERATORS],
      preferredBackend: platform === "mobile" ? "npu" : "gpu",
    };
  }

  if (environment.browser === "chrome" && environment.version >= 121) {
    return {
      available: true,
      backends: ["gpu", "cpu"],
      mobileOptimized: platform === "mobile",
      operators: CORE_WEBNN_OPERATORS,
      preferredBackend: "gpu",
    };
  }

  return {
    available: false,
    backends: [],
    mobileOptimized: false,
    operators: [],
    preferredBackend: "none",
  };
}

function isWebNNSupported(environment: BrowserEnvironment): boolean {
  return getWebNNCapabilities(environment).available;
}

function checkWebNNOperatorSupport(
  environment: BrowserEnvironment,
  operators: string[],
): Record<string, boolean> {
  const supportedOperators = new Set(getWebNNCapabilities(environment).operators);

  return operators.reduce<Record<string, boolean>>((support, operator) => {
    support[operator] = supportedOperators.has(operator);
    return support;
  }, {});
}

function getOptimalWebNNConfig(
  environment: BrowserEnvironment,
  options: { modelPath: string; modelType: ModelType; webGPUAvailable?: boolean },
): AcceleratorConfig {
  const capabilities = getWebNNCapabilities(environment);
  const useWebGPU = options.webGPUAvailable ?? true;

  return {
    modelPath: options.modelPath,
    modelType: options.modelType,
    useWebGPU,
    useWebNN: capabilities.available && !useWebGPU,
    webnnPreferredBackend: capabilities.available ? capabilities.preferredBackend : "none",
  };
}

function createMockWebNNInference(environment: BrowserEnvironment, modelType: ModelType) {
  const capabilities = getWebNNCapabilities(environment);

  return {
    run(input: unknown) {
      return {
        backend: capabilities.preferredBackend,
        input,
        modelType,
        usedWebNN: capabilities.available,
      };
    },
    getPerformanceMetrics() {
      return {
        averageInferenceTimeMs: capabilities.available ? 12 : 48,
        fallbackOps: capabilities.available ? 0 : CORE_WEBNN_OPERATORS.length,
        supportedOps: capabilities.operators.length,
      };
    },
  };
}

describe("WebNN implementation browser contract", () => {
  it("detects WebNN support and backend preferences by browser version", () => {
    expect(isWebNNSupported({ browser: "edge", version: 122 })).toBe(true);
    expect(isWebNNSupported({ browser: "chrome", version: 121 })).toBe(true);
    expect(isWebNNSupported({ browser: "chrome", version: 110 })).toBe(false);
    expect(isWebNNSupported({ browser: "safari", version: 17 })).toBe(false);

    expect(getWebNNCapabilities({ browser: "edge", version: 122 }).preferredBackend).toBe("gpu");
    expect(getWebNNCapabilities({ browser: "edge", version: 122, platform: "mobile" })).toMatchObject({
      backends: ["cpu", "npu"],
      mobileOptimized: true,
      preferredBackend: "npu",
    });
  });

  it("reports operator support from the active browser capabilities", () => {
    expect(
      checkWebNNOperatorSupport({ browser: "edge", version: 122 }, ["matmul", "split", "gru"]),
    ).toEqual({
      gru: false,
      matmul: true,
      split: true,
    });

    expect(checkWebNNOperatorSupport({ browser: "chrome", version: 110 }, ["matmul"])).toEqual({
      matmul: false,
    });
  });

  it("uses WebNN when WebGPU is unavailable and the browser supports WebNN", () => {
    expect(
      getOptimalWebNNConfig(
        { browser: "edge", version: 122 },
        {
          modelPath: "models/bert-base",
          modelType: "text",
          webGPUAvailable: false,
        },
      ),
    ).toEqual({
      modelPath: "models/bert-base",
      modelType: "text",
      useWebGPU: false,
      useWebNN: true,
      webnnPreferredBackend: "gpu",
    });
  });

  it("keeps WebNN disabled when neither browser support nor fallback requires it", () => {
    expect(
      getOptimalWebNNConfig(
        { browser: "firefox", version: 122 },
        {
          modelPath: "models/vit-base",
          modelType: "vision",
          webGPUAvailable: false,
        },
      ),
    ).toMatchObject({
      useWebGPU: false,
      useWebNN: false,
      webnnPreferredBackend: "none",
    });
  });

  it("returns deterministic inference and performance summaries for supported and fallback paths", () => {
    const edgeInference = createMockWebNNInference({ browser: "edge", version: 122 }, "text");
    expect(edgeInference.run("Example input text")).toEqual({
      backend: "gpu",
      input: "Example input text",
      modelType: "text",
      usedWebNN: true,
    });
    expect(edgeInference.getPerformanceMetrics()).toEqual({
      averageInferenceTimeMs: 12,
      fallbackOps: 0,
      supportedOps: 8,
    });

    const safariInference = createMockWebNNInference({ browser: "safari", version: 17 }, "vision");
    expect(safariInference.getPerformanceMetrics()).toEqual({
      averageInferenceTimeMs: 48,
      fallbackOps: CORE_WEBNN_OPERATORS.length,
      supportedOps: 0,
    });
  });
});
