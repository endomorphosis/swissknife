import { describe, expect, it } from "@jest/globals";

type BrowserName = "chrome" | "edge" | "firefox" | "safari";
type PlatformName = "webgpu" | "webnn";
type QuantizationBits = 2 | 4 | 8 | 16;

interface QuantizationRunOptions {
  platform: PlatformName;
  browser?: BrowserName;
  model?: string;
  bits?: QuantizationBits;
  mixedPrecision?: boolean;
  experimentalPrecision?: boolean;
}

interface QuantizationInferenceOptions {
  use_quantization: boolean;
  bits: QuantizationBits;
  scheme: "symmetric";
  mixed_precision: boolean;
  experimental_precision?: boolean;
}

interface QuantizationRunConfig {
  platform: PlatformName;
  browser: BrowserName;
  model: string;
  modelType: "text";
  headless: true;
  implementation: "RealWebGPUImplementation" | "RealWebNNImplementation";
  inferenceOptions: QuantizationInferenceOptions;
  warnings: string[];
}

interface QuantizationMetrics {
  quantization_bits?: QuantizationBits;
  inference_time_ms?: number;
  memory_usage_mb?: number;
}

interface InferenceResult {
  implementation_type?: string;
  is_simulation?: boolean;
  performance_metrics?: QuantizationMetrics;
}

const DEFAULT_MODEL = "bert-base-uncased";
const DEFAULT_BROWSER: BrowserName = "chrome";

function defaultBitsForPlatform(platform: PlatformName): QuantizationBits {
  return platform === "webgpu" ? 4 : 8;
}

function normalizeWebNNBits(
  bits: QuantizationBits,
  experimentalPrecision: boolean,
): { bits: QuantizationBits; warnings: string[] } {
  if (bits >= 8) {
    return { bits, warnings: [] };
  }

  if (experimentalPrecision) {
    return {
      bits,
      warnings: [
        `WebNN ${bits}-bit quantization is experimental; browser support may reject the request.`,
      ],
    };
  }

  return {
    bits: 8,
    warnings: [
      `WebNN does not officially expose ${bits}-bit quantization; using 8-bit fallback.`,
    ],
  };
}

function createQuantizationRunConfig(options: QuantizationRunOptions): QuantizationRunConfig {
  const platform = options.platform;
  const requestedBits = options.bits ?? defaultBitsForPlatform(platform);
  const mixedPrecision = options.mixedPrecision ?? false;
  const experimentalPrecision = options.experimentalPrecision ?? false;

  const normalized =
    platform === "webnn"
      ? normalizeWebNNBits(requestedBits, experimentalPrecision)
      : { bits: requestedBits, warnings: [] };

  return {
    platform,
    browser: options.browser ?? DEFAULT_BROWSER,
    model: options.model ?? DEFAULT_MODEL,
    modelType: "text",
    headless: true,
    implementation: platform === "webgpu" ? "RealWebGPUImplementation" : "RealWebNNImplementation",
    inferenceOptions: {
      use_quantization: true,
      bits: normalized.bits,
      scheme: "symmetric",
      mixed_precision: mixedPrecision,
      ...(platform === "webnn" ? { experimental_precision: experimentalPrecision } : {}),
    },
    warnings: normalized.warnings,
  };
}

function summarizeQuantizedInference(config: QuantizationRunConfig, result: InferenceResult) {
  const metrics = result.performance_metrics ?? {};
  const reportedBits = metrics.quantization_bits;
  const effectiveBits = reportedBits ?? config.inferenceOptions.bits;

  return {
    platform: config.platform,
    browser: config.browser,
    model: config.model,
    requestedBits: config.inferenceOptions.bits,
    reportedBits,
    effectiveBits,
    quantizationVerified: reportedBits === config.inferenceOptions.bits,
    realHardwareAcceleration: result.is_simulation === false,
    implementationType: result.implementation_type,
  };
}

describe("simplified WebNN and WebGPU quantization setup", () => {
  it("uses 4-bit symmetric quantization for WebGPU by default", () => {
    const config = createQuantizationRunConfig({
      platform: "webgpu",
      browser: "firefox",
      mixedPrecision: true,
    });

    expect(config).toMatchObject({
      platform: "webgpu",
      browser: "firefox",
      model: DEFAULT_MODEL,
      modelType: "text",
      headless: true,
      implementation: "RealWebGPUImplementation",
      warnings: [],
    });
    expect(config.inferenceOptions).toEqual({
      use_quantization: true,
      bits: 4,
      scheme: "symmetric",
      mixed_precision: true,
    });
  });

  it("uses 8-bit symmetric quantization for WebNN by default", () => {
    const config = createQuantizationRunConfig({
      platform: "webnn",
      browser: "edge",
    });

    expect(config).toMatchObject({
      platform: "webnn",
      browser: "edge",
      implementation: "RealWebNNImplementation",
      warnings: [],
    });
    expect(config.inferenceOptions).toEqual({
      use_quantization: true,
      bits: 8,
      scheme: "symmetric",
      mixed_precision: false,
      experimental_precision: false,
    });
  });

  it("falls back to 8-bit WebNN quantization unless lower precision is explicitly experimental", () => {
    const fallback = createQuantizationRunConfig({
      platform: "webnn",
      bits: 4,
    });
    const experimental = createQuantizationRunConfig({
      platform: "webnn",
      bits: 4,
      experimentalPrecision: true,
    });

    expect(fallback.inferenceOptions.bits).toBe(8);
    expect(fallback.warnings).toEqual([
      "WebNN does not officially expose 4-bit quantization; using 8-bit fallback.",
    ]);
    expect(experimental.inferenceOptions.bits).toBe(4);
    expect(experimental.inferenceOptions.experimental_precision).toBe(true);
    expect(experimental.warnings).toEqual([
      "WebNN 4-bit quantization is experimental; browser support may reject the request.",
    ]);
  });

  it("keeps caller-selected model, browser, and mixed precision settings", () => {
    const config = createQuantizationRunConfig({
      platform: "webgpu",
      browser: "safari",
      model: "prajjwal1/bert-tiny",
      bits: 8,
      mixedPrecision: false,
    });

    expect(config.model).toBe("prajjwal1/bert-tiny");
    expect(config.browser).toBe("safari");
    expect(config.inferenceOptions).toMatchObject({
      bits: 8,
      mixed_precision: false,
    });
  });

  it("summarizes reported quantization metrics and simulation status", () => {
    const config = createQuantizationRunConfig({
      platform: "webgpu",
      bits: 4,
    });
    const summary = summarizeQuantizedInference(config, {
      implementation_type: "REAL_WEBGPU",
      is_simulation: false,
      performance_metrics: {
        quantization_bits: 4,
        inference_time_ms: 18,
        memory_usage_mb: 256,
      },
    });

    expect(summary).toEqual({
      platform: "webgpu",
      browser: DEFAULT_BROWSER,
      model: DEFAULT_MODEL,
      requestedBits: 4,
      reportedBits: 4,
      effectiveBits: 4,
      quantizationVerified: true,
      realHardwareAcceleration: true,
      implementationType: "REAL_WEBGPU",
    });
  });
});
