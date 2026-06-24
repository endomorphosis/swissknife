type BitDevice = "cpu" | "cuda" | "mps";
type BitDependency = "transformers" | "pillow>=8.0.0";

interface BitModelInfo {
  description: string;
  className: "BitForImageClassification";
  task: "image-classification";
  imageSize: number;
}

interface BitHardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface BitImageInput {
  width: number;
  height: number;
  channels: 3;
}

interface BitPipelineResult {
  model: string;
  device: BitDevice;
  task: "image-classification";
  className: "BitForImageClassification";
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: BitDependency[];
  pipelineMissingDeps?: BitDependency[];
  inputSummary?: string;
  outputPreview?: string;
}

const DEFAULT_BIT_MODEL_ID = "google/vit-base-patch16-224-in21k";
const DEFAULT_BIT_IMAGE: BitImageInput = {
  width: 224,
  height: 224,
  channels: 3,
};

const BIT_MODELS_REGISTRY: Record<string, BitModelInfo> = {
  [DEFAULT_BIT_MODEL_ID]: {
    description: "BiT image-classification conversion fixture model",
    className: "BitForImageClassification",
    task: "image-classification",
    imageSize: 224,
  },
};

function selectBitDevice(capabilities: BitHardwareCapabilities): BitDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadBitModelInfo(modelId = DEFAULT_BIT_MODEL_ID): BitModelInfo {
  const modelInfo = BIT_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown BiT model: ${modelId}`);
  }

  return modelInfo;
}

function normalizeBitImage(input: Partial<BitImageInput> = {}): BitImageInput {
  const width = input.width ?? DEFAULT_BIT_IMAGE.width;
  const height = input.height ?? DEFAULT_BIT_IMAGE.height;

  if (width <= 0 || height <= 0) {
    throw new Error("BiT image dimensions must be positive");
  }

  return {
    width,
    height,
    channels: 3,
  };
}

function summarizeBitImage(input: BitImageInput): string {
  return `${input.width}x${input.height} RGB image`;
}

function previewBitOutput(output: unknown, maxLength = 200): string {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

function createBitPipelineResult(
  modelId: string,
  capabilities: BitHardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "pillow", boolean>>,
  input: Partial<BitImageInput>,
  output: unknown,
): BitPipelineResult {
  const modelInfo = loadBitModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectBitDevice(capabilities),
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

  if (!dependencies.pillow) {
    return {
      ...baseResult,
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["pillow>=8.0.0"],
    };
  }

  const normalizedInput = normalizeBitImage(input);

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    inputSummary: summarizeBitImage(normalizedInput),
    outputPreview: previewBitOutput(output),
  };
}

class BitMockHandler {
  readonly implementationType = "MOCK";

  classify(input: Partial<BitImageInput> = {}): {
    logits: number[];
    implementationType: "MOCK";
    inputSummary: string;
  } {
    const normalizedInput = normalizeBitImage(input);
    const areaRatio = (normalizedInput.width * normalizedInput.height) / (224 * 224);

    return {
      logits: [Number(areaRatio.toFixed(3)), 0.25, 0.1],
      implementationType: this.implementationType,
      inputSummary: summarizeBitImage(normalizedInput),
    };
  }
}

describe("BiT model conversion fixture", () => {
  it("keeps the BiT model registry from the Python source", () => {
    expect(Object.keys(BIT_MODELS_REGISTRY)).toEqual([DEFAULT_BIT_MODEL_ID]);
    expect(loadBitModelInfo()).toEqual({
      description: "BiT image-classification conversion fixture model",
      className: "BitForImageClassification",
      task: "image-classification",
      imageSize: 224,
    });
  });

  it("rejects unknown BiT model identifiers explicitly", () => {
    expect(() => loadBitModelInfo("google/bit-unknown")).toThrow("Unknown BiT model: google/bit-unknown");
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectBitDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectBitDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectBitDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("normalizes image input and rejects invalid dimensions", () => {
    expect(normalizeBitImage()).toEqual(DEFAULT_BIT_IMAGE);
    expect(normalizeBitImage({ width: 384 })).toEqual({ width: 384, height: 224, channels: 3 });
    expect(() => normalizeBitImage({ height: 0 })).toThrow("BiT image dimensions must be positive");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createBitPipelineResult(
      DEFAULT_BIT_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: false, pillow: true },
      DEFAULT_BIT_IMAGE,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing image loading support separately from core transformers", () => {
    const result = createBitPipelineResult(
      DEFAULT_BIT_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pillow: false },
      DEFAULT_BIT_IMAGE,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["pillow>=8.0.0"],
    });
  });

  it("builds a successful image-classification result", () => {
    const result = createBitPipelineResult(
      DEFAULT_BIT_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pillow: true },
      { width: 384, height: 384 },
      [{ label: "tench", score: 0.99 }],
    );

    expect(result).toMatchObject({
      model: DEFAULT_BIT_MODEL_ID,
      device: "cpu",
      task: "image-classification",
      className: "BitForImageClassification",
      pipelineSuccess: true,
      pipelineErrorType: "none",
      inputSummary: "384x384 RGB image",
    });
    expect(result.outputPreview).toBe('[{"label":"tench","score":0.99}]');
  });

  it("provides a deterministic mock image-classification handler", () => {
    const handler = new BitMockHandler();

    expect(handler.classify({ width: 112, height: 112 })).toEqual({
      logits: [0.25, 0.25, 0.1],
      implementationType: "MOCK",
      inputSummary: "112x112 RGB image",
    });
  });
});

export {};
