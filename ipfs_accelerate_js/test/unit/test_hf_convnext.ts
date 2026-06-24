type ConvNextDevice = "cpu" | "cuda" | "mps";
type ConvNextDependency = "transformers" | "pillow>=8.0.0" | "requests>=2.25.0";

interface ConvNextModelInfo {
  description: string;
  className: "ConvNextForImageClassification";
  task: "image-classification";
  imageSize: number;
}

interface ConvNextHardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface ConvNextImageInput {
  width: number;
  height: number;
  channels: 3;
  source: "url" | "buffer" | "fixture";
}

interface ConvNextPipelineResult {
  model: string;
  device: ConvNextDevice;
  task: "image-classification";
  className: "ConvNextForImageClassification";
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: ConvNextDependency[];
  pipelineMissingDeps?: ConvNextDependency[];
  inputSummary?: string;
  outputPreview?: string;
}

const DEFAULT_CONVNEXT_MODEL_ID = "facebook/convnext-base-224";
const DEFAULT_CONVNEXT_IMAGE: ConvNextImageInput = {
  width: 224,
  height: 224,
  channels: 3,
  source: "fixture",
};

const CONVNEXT_MODELS_REGISTRY: Record<string, ConvNextModelInfo> = {
  [DEFAULT_CONVNEXT_MODEL_ID]: {
    description: "ConvNeXT Base (224x224)",
    className: "ConvNextForImageClassification",
    task: "image-classification",
    imageSize: 224,
  },
  "facebook/convnext-large-224": {
    description: "ConvNeXT Large (224x224)",
    className: "ConvNextForImageClassification",
    task: "image-classification",
    imageSize: 224,
  },
};

function selectConvNextDevice(capabilities: ConvNextHardwareCapabilities): ConvNextDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadConvNextModelInfo(modelId = DEFAULT_CONVNEXT_MODEL_ID): ConvNextModelInfo {
  const modelInfo = CONVNEXT_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown ConvNeXT model: ${modelId}`);
  }

  return modelInfo;
}

function normalizeConvNextImage(input: Partial<ConvNextImageInput> = {}): ConvNextImageInput {
  const width = input.width ?? DEFAULT_CONVNEXT_IMAGE.width;
  const height = input.height ?? DEFAULT_CONVNEXT_IMAGE.height;

  if (width <= 0 || height <= 0) {
    throw new Error("ConvNeXT image dimensions must be positive");
  }

  return {
    width,
    height,
    channels: 3,
    source: input.source ?? DEFAULT_CONVNEXT_IMAGE.source,
  };
}

function summarizeConvNextImage(input: ConvNextImageInput): string {
  return `${input.width}x${input.height} RGB image (${input.source})`;
}

function previewConvNextOutput(output: unknown, maxLength = 200): string {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

function createConvNextPipelineResult(
  modelId: string,
  capabilities: ConvNextHardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "pillow" | "requests", boolean>>,
  input: Partial<ConvNextImageInput>,
  output: unknown,
): ConvNextPipelineResult {
  const modelInfo = loadConvNextModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectConvNextDevice(capabilities),
    task: modelInfo.task,
    className: modelInfo.className,
  };

  if (!dependencies.transformers) {
    return {
      ...baseResult,
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    };
  }

  const missingImageDeps: ConvNextDependency[] = [];

  if (!dependencies.pillow) {
    missingImageDeps.push("pillow>=8.0.0");
  }

  if (!dependencies.requests) {
    missingImageDeps.push("requests>=2.25.0");
  }

  if (missingImageDeps.length > 0) {
    return {
      ...baseResult,
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: missingImageDeps,
    };
  }

  const normalizedInput = normalizeConvNextImage(input);

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    inputSummary: summarizeConvNextImage(normalizedInput),
    outputPreview: previewConvNextOutput(output),
  };
}

class ConvNextMockHandler {
  readonly implementationType = "MOCK";

  classify(input: Partial<ConvNextImageInput> = {}): {
    logits: number[];
    implementationType: "MOCK";
    inputSummary: string;
  } {
    const normalizedInput = normalizeConvNextImage(input);
    const areaRatio = (normalizedInput.width * normalizedInput.height) / (224 * 224);

    return {
      logits: [Number(areaRatio.toFixed(3)), 0.15, 0.05],
      implementationType: this.implementationType,
      inputSummary: summarizeConvNextImage(normalizedInput),
    };
  }
}

describe("ConvNeXT model conversion fixture", () => {
  it("keeps the ConvNeXT model registry from the Python source", () => {
    expect(Object.keys(CONVNEXT_MODELS_REGISTRY)).toEqual([
      "facebook/convnext-base-224",
      "facebook/convnext-large-224",
    ]);
    expect(loadConvNextModelInfo()).toEqual({
      description: "ConvNeXT Base (224x224)",
      className: "ConvNextForImageClassification",
      task: "image-classification",
      imageSize: 224,
    });
  });

  it("rejects unknown ConvNeXT model identifiers explicitly", () => {
    expect(() => loadConvNextModelInfo("facebook/convnext-tiny-224")).toThrow(
      "Unknown ConvNeXT model: facebook/convnext-tiny-224",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectConvNextDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectConvNextDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectConvNextDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("normalizes image input and rejects invalid dimensions", () => {
    expect(normalizeConvNextImage()).toEqual(DEFAULT_CONVNEXT_IMAGE);
    expect(normalizeConvNextImage({ width: 384, source: "url" })).toEqual({
      width: 384,
      height: 224,
      channels: 3,
      source: "url",
    });
    expect(() => normalizeConvNextImage({ height: 0 })).toThrow("ConvNeXT image dimensions must be positive");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createConvNextPipelineResult(
      DEFAULT_CONVNEXT_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: false, pillow: true, requests: true },
      DEFAULT_CONVNEXT_IMAGE,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing image loading dependencies separately from core transformers", () => {
    const result = createConvNextPipelineResult(
      DEFAULT_CONVNEXT_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pillow: false, requests: false },
      DEFAULT_CONVNEXT_IMAGE,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["pillow>=8.0.0", "requests>=2.25.0"],
    });
  });

  it("builds a successful image-classification result", () => {
    const result = createConvNextPipelineResult(
      "facebook/convnext-large-224",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pillow: true, requests: true },
      { width: 384, height: 384, source: "url" },
      [{ label: "tabby cat", score: 0.98 }],
    );

    expect(result).toMatchObject({
      model: "facebook/convnext-large-224",
      device: "cpu",
      task: "image-classification",
      className: "ConvNextForImageClassification",
      pipelineSuccess: true,
      pipelineErrorType: "none",
      inputSummary: "384x384 RGB image (url)",
    });
    expect(result.outputPreview).toBe('[{"label":"tabby cat","score":0.98}]');
  });

  it("provides a deterministic mock image-classification handler", () => {
    const handler = new ConvNextMockHandler();

    expect(handler.classify({ width: 112, height: 112, source: "buffer" })).toEqual({
      logits: [0.25, 0.15, 0.05],
      implementationType: "MOCK",
      inputSummary: "112x112 RGB image (buffer)",
    });
  });
});

export {};
