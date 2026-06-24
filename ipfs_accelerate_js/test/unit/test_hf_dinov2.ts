type Dinov2Device = "cpu" | "cuda" | "mps";
type Dinov2Dependency = "transformers" | "pillow>=8.0.0" | "requests>=2.25.0";

interface Dinov2ModelInfo {
  description: string;
  className: "Dinov2Model";
  task: "image-classification";
  imageSize: number;
}

interface Dinov2HardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface Dinov2ImageInput {
  width: number;
  height: number;
  channels: 3;
  source: "url" | "buffer" | "fixture";
}

interface Dinov2PipelineResult {
  model: string;
  device: Dinov2Device;
  task: "image-classification";
  className: "Dinov2Model";
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: Dinov2Dependency[];
  pipelineMissingDeps?: Dinov2Dependency[];
  inputSummary?: string;
  outputPreview?: string;
}

const DEFAULT_DINOV2_MODEL_ID = "facebook/dinov2-base";
const DEFAULT_DINOV2_IMAGE: Dinov2ImageInput = {
  width: 224,
  height: 224,
  channels: 3,
  source: "fixture",
};

const DINOV2_MODELS_REGISTRY: Record<string, Dinov2ModelInfo> = {
  [DEFAULT_DINOV2_MODEL_ID]: {
    description: "DINOv2 Base model",
    className: "Dinov2Model",
    task: "image-classification",
    imageSize: 224,
  },
  "facebook/dinov2-large": {
    description: "DINOv2 Large model",
    className: "Dinov2Model",
    task: "image-classification",
    imageSize: 224,
  },
  "facebook/dinov2-giant": {
    description: "DINOv2 Giant model",
    className: "Dinov2Model",
    task: "image-classification",
    imageSize: 224,
  },
};

function selectDinov2Device(capabilities: Dinov2HardwareCapabilities): Dinov2Device {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadDinov2ModelInfo(modelId = DEFAULT_DINOV2_MODEL_ID): Dinov2ModelInfo {
  const modelInfo = DINOV2_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown DINOv2 model: ${modelId}`);
  }

  return modelInfo;
}

function normalizeDinov2Image(input: Partial<Dinov2ImageInput> = {}): Dinov2ImageInput {
  const width = input.width ?? DEFAULT_DINOV2_IMAGE.width;
  const height = input.height ?? DEFAULT_DINOV2_IMAGE.height;

  if (width <= 0 || height <= 0) {
    throw new Error("DINOv2 image dimensions must be positive");
  }

  return {
    width,
    height,
    channels: 3,
    source: input.source ?? DEFAULT_DINOV2_IMAGE.source,
  };
}

function summarizeDinov2Image(input: Dinov2ImageInput): string {
  return `${input.width}x${input.height} RGB image (${input.source})`;
}

function previewDinov2Output(output: unknown, maxLength = 200): string {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

function createDinov2PipelineResult(
  modelId: string,
  capabilities: Dinov2HardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "pillow" | "requests", boolean>>,
  input: Partial<Dinov2ImageInput>,
  output: unknown,
): Dinov2PipelineResult {
  const modelInfo = loadDinov2ModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectDinov2Device(capabilities),
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

  const missingImageDeps: Dinov2Dependency[] = [];

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

  const normalizedInput = normalizeDinov2Image(input);

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    inputSummary: summarizeDinov2Image(normalizedInput),
    outputPreview: previewDinov2Output(output),
  };
}

class Dinov2MockHandler {
  readonly implementationType = "MOCK";

  classify(input: Partial<Dinov2ImageInput> = {}): {
    logits: number[];
    implementationType: "MOCK";
    inputSummary: string;
  } {
    const normalizedInput = normalizeDinov2Image(input);
    const areaRatio = (normalizedInput.width * normalizedInput.height) / (224 * 224);

    return {
      logits: [Number(areaRatio.toFixed(3)), 0.22, 0.04],
      implementationType: this.implementationType,
      inputSummary: summarizeDinov2Image(normalizedInput),
    };
  }
}

describe("DINOv2 model conversion fixture", () => {
  it("keeps the DINOv2 model registry from the Python source", () => {
    expect(Object.keys(DINOV2_MODELS_REGISTRY)).toEqual([
      "facebook/dinov2-base",
      "facebook/dinov2-large",
      "facebook/dinov2-giant",
    ]);
    expect(loadDinov2ModelInfo()).toEqual({
      description: "DINOv2 Base model",
      className: "Dinov2Model",
      task: "image-classification",
      imageSize: 224,
    });
  });

  it("rejects unknown DINOv2 model identifiers explicitly", () => {
    expect(() => loadDinov2ModelInfo("facebook/dinov2-small")).toThrow(
      "Unknown DINOv2 model: facebook/dinov2-small",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectDinov2Device({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectDinov2Device({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectDinov2Device({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("normalizes image input and rejects invalid dimensions", () => {
    expect(normalizeDinov2Image()).toEqual(DEFAULT_DINOV2_IMAGE);
    expect(normalizeDinov2Image({ width: 384, source: "url" })).toEqual({
      width: 384,
      height: 224,
      channels: 3,
      source: "url",
    });
    expect(() => normalizeDinov2Image({ height: 0 })).toThrow("DINOv2 image dimensions must be positive");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createDinov2PipelineResult(
      DEFAULT_DINOV2_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: false, pillow: true, requests: true },
      DEFAULT_DINOV2_IMAGE,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing image loading dependencies separately from core transformers", () => {
    const result = createDinov2PipelineResult(
      DEFAULT_DINOV2_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pillow: false, requests: false },
      DEFAULT_DINOV2_IMAGE,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["pillow>=8.0.0", "requests>=2.25.0"],
    });
  });

  it("builds a successful image-classification result", () => {
    const result = createDinov2PipelineResult(
      "facebook/dinov2-large",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pillow: true, requests: true },
      { width: 384, height: 384, source: "url" },
      [{ label: "tabby cat", score: 0.98 }],
    );

    expect(result).toMatchObject({
      model: "facebook/dinov2-large",
      device: "cpu",
      task: "image-classification",
      className: "Dinov2Model",
      pipelineSuccess: true,
      pipelineErrorType: "none",
      inputSummary: "384x384 RGB image (url)",
    });
    expect(result.outputPreview).toBe('[{"label":"tabby cat","score":0.98}]');
  });

  it("provides a deterministic mock image-classification handler", () => {
    const handler = new Dinov2MockHandler();

    expect(handler.classify({ width: 112, height: 112 })).toEqual({
      logits: [0.25, 0.22, 0.04],
      implementationType: "MOCK",
      inputSummary: "112x112 RGB image (fixture)",
    });
  });
});

export {};
