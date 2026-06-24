import { describe, expect, it } from "@jest/globals";

type Platform = "cpu" | "cuda" | "rocm" | "npu" | "webnn" | "webgpu";
type PrecisionFormat = "fp16" | "int8" | "int4";

interface ModelDetails {
  fullName: string;
  path: string;
  type: "text";
  promptTemplate: string;
}

interface InferenceOptions {
  model: string;
  modelPath?: string;
  hardware?: Platform[];
  allPlatforms?: boolean;
  crossPlatform?: boolean;
  mixedPrecision?: boolean;
  specializedKernels?: boolean;
  browserSpecific?: boolean;
  targetBrowser?: "chrome" | "firefox" | "edge" | "safari";
}

interface InferenceConfig {
  modelPath: string;
  modelType: string;
  quantizationBits: number;
  activationBits: number;
  mixedPrecision: boolean;
  specializedKernels: boolean;
  browserSpecific: boolean;
  targetBrowser?: string;
}

interface PlatformHandler {
  platform: Platform;
  config: InferenceConfig;
  native4Bit: boolean;
  expectedMemoryReduction: number;
}

const DEFAULT_PROMPTS = [
  "What are the benefits of 4-bit quantization for large language models?",
  "Explain how WebGPU enables efficient matrix multiplication for transformers.",
  "Compare the performance of quantized models across different hardware platforms.",
  "What are the tradeoffs between model size and inference speed?",
  "How does mixed precision execution improve accuracy for critical model components?",
];

const MODEL_DETAILS: Record<string, ModelDetails> = {
  llama: {
    fullName: "llama-3-8b",
    path: "models/llama-3-8b",
    type: "text",
    promptTemplate: "### User: {prompt}\n\n### Assistant:",
  },
  qwen2: {
    fullName: "qwen2-7b",
    path: "models/qwen2-7b",
    type: "text",
    promptTemplate: "<|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant\n",
  },
  t5: {
    fullName: "t5-large",
    path: "models/t5-large",
    type: "text",
    promptTemplate: "{prompt}",
  },
  bert: {
    fullName: "bert-base-uncased",
    path: "models/bert-base-uncased",
    type: "text",
    promptTemplate: "{prompt}",
  },
};

function getModelDetails(modelName: string): ModelDetails {
  const knownModel = MODEL_DETAILS[modelName.toLowerCase()];

  if (knownModel) {
    return knownModel;
  }

  return {
    fullName: modelName,
    path: "models/" + modelName,
    type: "text",
    promptTemplate: "{prompt}",
  };
}

function setupTestPrompts(customPrompts?: string[]): string[] {
  if (!customPrompts || customPrompts.length === 0) {
    return DEFAULT_PROMPTS;
  }

  return customPrompts;
}

function resolvePlatforms(
  options: InferenceOptions,
  isAvailable: (platform: Platform) => boolean,
): Platform[] {
  let requested: Platform[];

  if (options.allPlatforms) {
    requested = ["cpu", "cuda", "rocm", "npu", "webnn", "webgpu"];
  } else if (options.crossPlatform) {
    requested = ["cpu", "cuda", "webnn", "webgpu"];
  } else {
    requested = options.hardware ?? ["cpu", "webgpu"];
  }

  return requested.filter(isAvailable);
}

function estimateMemoryReduction(sourceBits: number, targetBits: number): number {
  return 1 - targetBits / sourceBits;
}

function createWebGPU4BitConfig(options: InferenceOptions): InferenceConfig {
  const modelDetails = getModelDetails(options.model);

  return {
    modelPath: options.modelPath ?? modelDetails.path,
    modelType: modelDetails.type,
    quantizationBits: 4,
    activationBits: options.mixedPrecision === false ? 4 : 16,
    mixedPrecision: options.mixedPrecision !== false,
    specializedKernels: options.specializedKernels !== false,
    browserSpecific: options.browserSpecific !== false,
    targetBrowser: options.targetBrowser,
  };
}

function createPlatformHandler(platform: Platform, options: InferenceOptions): PlatformHandler {
  const webgpuConfig = createWebGPU4BitConfig(options);

  if (platform === "webgpu") {
    return {
      platform,
      config: webgpuConfig,
      native4Bit: true,
      expectedMemoryReduction: estimateMemoryReduction(16, 4),
    };
  }

  if (platform === "webnn") {
    return {
      platform,
      config: {
        ...webgpuConfig,
        quantizationBits: 8,
        activationBits: 16,
        mixedPrecision: false,
        specializedKernels: false,
      },
      native4Bit: false,
      expectedMemoryReduction: estimateMemoryReduction(16, 8),
    };
  }

  return {
    platform,
    config: {
      ...webgpuConfig,
      quantizationBits: 16,
      activationBits: 16,
      mixedPrecision: false,
      specializedKernels: false,
      browserSpecific: false,
    },
    native4Bit: false,
    expectedMemoryReduction: 0,
  };
}

function comparePrecisionFormats(baselineMemoryMb: number) {
  const formats: Record<PrecisionFormat, { bits: number; relativeAccuracy: number }> = {
    fp16: { bits: 16, relativeAccuracy: 1 },
    int8: { bits: 8, relativeAccuracy: 0.995 },
    int4: { bits: 4, relativeAccuracy: 0.985 },
  };

  return Object.entries(formats).map(([format, settings]) => ({
    format: format as PrecisionFormat,
    memoryMb: baselineMemoryMb * (settings.bits / 16),
    memoryReduction: estimateMemoryReduction(16, settings.bits),
    relativeAccuracy: settings.relativeAccuracy,
  }));
}

describe("WebGPU 4-bit inference test helpers", () => {
  it("resolves known model defaults and unknown model paths", () => {
    expect(getModelDetails("llama")).toEqual({
      fullName: "llama-3-8b",
      path: "models/llama-3-8b",
      type: "text",
      promptTemplate: "### User: {prompt}\n\n### Assistant:",
    });

    expect(getModelDetails("custom-model")).toEqual({
      fullName: "custom-model",
      path: "models/custom-model",
      type: "text",
      promptTemplate: "{prompt}",
    });
  });

  it("uses default prompts unless custom prompts are supplied", () => {
    expect(setupTestPrompts()).toHaveLength(5);
    expect(setupTestPrompts(["hello"])).toEqual(["hello"]);
  });

  it("filters requested platforms by availability", () => {
    const available = new Set<Platform>(["cpu", "webnn", "webgpu"]);
    const platforms = resolvePlatforms(
      { model: "llama", allPlatforms: true },
      (platform) => available.has(platform),
    );

    expect(platforms).toEqual(["cpu", "webnn", "webgpu"]);
  });

  it("builds a WebGPU handler with 4-bit weights and mixed precision activations", () => {
    const handler = createPlatformHandler("webgpu", {
      model: "qwen2",
      targetBrowser: "chrome",
    });

    expect(handler).toMatchObject({
      platform: "webgpu",
      native4Bit: true,
      expectedMemoryReduction: 0.75,
    });
    expect(handler.config).toMatchObject({
      modelPath: "models/qwen2-7b",
      quantizationBits: 4,
      activationBits: 16,
      mixedPrecision: true,
      specializedKernels: true,
      browserSpecific: true,
      targetBrowser: "chrome",
    });
  });

  it("uses 8-bit WebNN fallback because WebNN does not natively expose 4-bit inference", () => {
    const handler = createPlatformHandler("webnn", { model: "bert" });

    expect(handler.native4Bit).toBe(false);
    expect(handler.config.quantizationBits).toBe(8);
    expect(handler.expectedMemoryReduction).toBe(0.5);
  });

  it("reports the expected 75 percent memory reduction for int4 precision", () => {
    const comparison = comparePrecisionFormats(1024);
    const int4 = comparison.find((result) => result.format === "int4");
    const int8 = comparison.find((result) => result.format === "int8");

    expect(int4).toMatchObject({
      memoryMb: 256,
      memoryReduction: 0.75,
      relativeAccuracy: 0.985,
    });
    expect(int8).toMatchObject({
      memoryMb: 512,
      memoryReduction: 0.5,
      relativeAccuracy: 0.995,
    });
  });
});
