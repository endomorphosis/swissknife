import { describe, expect, it, jest } from "@jest/globals";

type Platform = "webgpu" | "webnn";
type BrowserName = "chrome" | "firefox" | "edge" | "safari";
type QuantizationBits = 2 | 4 | 8 | 16;
type QuantizationScheme = "symmetric" | "asymmetric";

interface QuantizationRequest {
  platform: Platform;
  browser: BrowserName;
  model: string;
  bits?: QuantizationBits;
  mixedPrecision?: boolean;
  experimentalPrecision?: boolean;
}

interface InferenceOptions {
  useQuantization: true;
  bits: QuantizationBits;
  scheme: QuantizationScheme;
  mixedPrecision: boolean;
  experimentalPrecision?: boolean;
}

interface QuantizedInferenceResult {
  performanceMetrics?: {
    quantizationBits?: QuantizationBits;
  };
  isSimulation?: boolean;
}

interface BrowserImplementation {
  initialize(): Promise<boolean>;
  getFeatureSupport(): Record<string, boolean>;
  initializeModel(model: string, modelType: "text"): Promise<unknown>;
  runInference(
    model: string,
    input: string,
    options: InferenceOptions,
  ): Promise<QuantizedInferenceResult | null>;
  shutdown(): Promise<void>;
}

interface QuantizationPlan {
  platform: Platform;
  browser: BrowserName;
  model: string;
  options: InferenceOptions;
  warnings: string[];
}

interface QuantizedTestResult {
  ok: boolean;
  platform: Platform;
  quantizationBits: QuantizationBits;
  usedSimulation: boolean;
  warningCount: number;
}

function defaultBitsFor(platform: Platform): QuantizationBits {
  return platform === "webgpu" ? 4 : 8;
}

function createQuantizationPlan(request: QuantizationRequest): QuantizationPlan {
  const bits = request.bits ?? defaultBitsFor(request.platform);
  const warnings: string[] = [];

  if (request.platform === "webnn" && bits < 8) {
    if (request.experimentalPrecision) {
      warnings.push(
        `WebNN ${bits}-bit quantization requires experimental precision mode.`,
      );
    } else {
      warnings.push("WebNN defaults to 8-bit quantization without experimental precision.");
    }
  }

  return {
    platform: request.platform,
    browser: request.browser,
    model: request.model,
    options: {
      useQuantization: true,
      bits: request.platform === "webnn" && bits < 8 && !request.experimentalPrecision ? 8 : bits,
      scheme: "symmetric",
      mixedPrecision: request.mixedPrecision ?? false,
      ...(request.experimentalPrecision === undefined
        ? {}
        : { experimentalPrecision: request.experimentalPrecision }),
    },
    warnings,
  };
}

function isQuantizationReported(
  result: QuantizedInferenceResult,
  expectedBits: QuantizationBits,
): boolean {
  return result.performanceMetrics?.quantizationBits === expectedBits;
}

async function runQuantizedBrowserInference(
  implementation: BrowserImplementation,
  request: QuantizationRequest,
): Promise<QuantizedTestResult> {
  const plan = createQuantizationPlan(request);

  try {
    if (!(await implementation.initialize())) {
      return {
        ok: false,
        platform: plan.platform,
        quantizationBits: plan.options.bits,
        usedSimulation: true,
        warningCount: plan.warnings.length,
      };
    }

    const featureSupport = implementation.getFeatureSupport();
    if (!featureSupport[plan.platform]) {
      return {
        ok: false,
        platform: plan.platform,
        quantizationBits: plan.options.bits,
        usedSimulation: true,
        warningCount: plan.warnings.length,
      };
    }

    const modelInfo = await implementation.initializeModel(plan.model, "text");
    if (!modelInfo) {
      return {
        ok: false,
        platform: plan.platform,
        quantizationBits: plan.options.bits,
        usedSimulation: true,
        warningCount: plan.warnings.length,
      };
    }

    const result = await implementation.runInference(
      plan.model,
      "This is a test.",
      plan.options,
    );

    return {
      ok: Boolean(result && isQuantizationReported(result, plan.options.bits)),
      platform: plan.platform,
      quantizationBits: plan.options.bits,
      usedSimulation: result?.isSimulation ?? true,
      warningCount: plan.warnings.length,
    };
  } finally {
    await implementation.shutdown();
  }
}

function createImplementation(
  platform: Platform,
  overrides: Partial<BrowserImplementation> = {},
): BrowserImplementation {
  return {
    initialize: jest.fn(async () => true),
    getFeatureSupport: jest.fn(() => ({ [platform]: true })),
    initializeModel: jest.fn(async () => ({ initialized: true })),
    runInference: jest.fn(async (_model, _input, options) => ({
      performanceMetrics: {
        quantizationBits: options.bits,
      },
      isSimulation: false,
    })),
    shutdown: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe("simplified WebNN/WebGPU quantization flow", () => {
  it("uses 4-bit quantization for WebGPU by default", () => {
    const plan = createQuantizationPlan({
      platform: "webgpu",
      browser: "chrome",
      model: "bert-base-uncased",
    });

    expect(plan.options).toEqual({
      useQuantization: true,
      bits: 4,
      scheme: "symmetric",
      mixedPrecision: false,
    });
    expect(plan.warnings).toEqual([]);
  });

  it("uses 8-bit quantization for WebNN unless experimental lower precision is requested", () => {
    const defaultPlan = createQuantizationPlan({
      platform: "webnn",
      browser: "edge",
      model: "bert-base-uncased",
    });
    const fallbackPlan = createQuantizationPlan({
      platform: "webnn",
      browser: "edge",
      model: "bert-base-uncased",
      bits: 4,
    });
    const experimentalPlan = createQuantizationPlan({
      platform: "webnn",
      browser: "edge",
      model: "bert-base-uncased",
      bits: 4,
      experimentalPrecision: true,
    });

    expect(defaultPlan.options.bits).toBe(8);
    expect(fallbackPlan.options.bits).toBe(8);
    expect(fallbackPlan.warnings).toHaveLength(1);
    expect(experimentalPlan.options.bits).toBe(4);
    expect(experimentalPlan.options.experimentalPrecision).toBe(true);
  });

  it("passes quantization settings through WebGPU inference and reports real hardware", async () => {
    const implementation = createImplementation("webgpu");
    const result = await runQuantizedBrowserInference(implementation, {
      platform: "webgpu",
      browser: "firefox",
      model: "bert-base-uncased",
      mixedPrecision: true,
    });

    expect(result).toEqual({
      ok: true,
      platform: "webgpu",
      quantizationBits: 4,
      usedSimulation: false,
      warningCount: 0,
    });
    expect(implementation.runInference).toHaveBeenCalledWith(
      "bert-base-uncased",
      "This is a test.",
      {
        useQuantization: true,
        bits: 4,
        scheme: "symmetric",
        mixedPrecision: true,
      },
    );
    expect(implementation.shutdown).toHaveBeenCalledTimes(1);
  });

  it("treats missing quantization metrics as a failed validation", async () => {
    const implementation = createImplementation("webnn", {
      runInference: jest.fn(async () => ({ isSimulation: true })),
    });

    const result = await runQuantizedBrowserInference(implementation, {
      platform: "webnn",
      browser: "edge",
      model: "bert-base-uncased",
    });

    expect(result).toEqual({
      ok: false,
      platform: "webnn",
      quantizationBits: 8,
      usedSimulation: true,
      warningCount: 0,
    });
    expect(implementation.shutdown).toHaveBeenCalledTimes(1);
  });

  it("does not run inference when the selected platform is unsupported", async () => {
    const implementation = createImplementation("webgpu", {
      getFeatureSupport: jest.fn(() => ({ webgpu: false })),
    });

    const result = await runQuantizedBrowserInference(implementation, {
      platform: "webgpu",
      browser: "safari",
      model: "bert-base-uncased",
    });

    expect(result.ok).toBe(false);
    expect(implementation.initializeModel).not.toHaveBeenCalled();
    expect(implementation.runInference).not.toHaveBeenCalled();
    expect(implementation.shutdown).toHaveBeenCalledTimes(1);
  });
});
