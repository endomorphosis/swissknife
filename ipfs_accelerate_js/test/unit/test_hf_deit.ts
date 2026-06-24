type DeitDevice = "cpu" | "cuda" | "mps";
type DeitDependency = "transformers" | "Pillow>=8.0.0";

interface DeitModelInfo {
  description: string;
  className: "DeiTForImageClassification";
  task: "image-classification";
  primaryModel: string;
  imageSize: 224;
  patchSize: 16;
  numLabels: 1000;
}

interface DeitHardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface DeitImageInput {
  width: number;
  height: number;
  channels: 3;
}

interface DeitPipelineResult {
  model: string;
  device: DeitDevice;
  task: "image-classification";
  className: "DeiTForImageClassification";
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: DeitDependency[];
  pipelineMissingDeps?: DeitDependency[];
  inputSummary?: string;
  outputPreview?: string;
}

const DEFAULT_DEIT_MODEL_ID = "facebook/deit-base-patch16-224";
const DEFAULT_DEIT_IMAGE: DeitImageInput = {
  width: 224,
  height: 224,
  channels: 3,
};

const DEIT_MODEL_REGISTRY: Record<string, DeitModelInfo> = {
  [DEFAULT_DEIT_MODEL_ID]: {
    description: "Data-efficient Image Transformer base image classification model",
    className: "DeiTForImageClassification",
    task: "image-classification",
    primaryModel: DEFAULT_DEIT_MODEL_ID,
    imageSize: 224,
    patchSize: 16,
    numLabels: 1000,
  },
};

function selectDeitDevice(capabilities: DeitHardwareCapabilities): DeitDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadDeitModelInfo(modelId = DEFAULT_DEIT_MODEL_ID): DeitModelInfo {
  const modelInfo = DEIT_MODEL_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown DeiT model: ${modelId}`);
  }

  return modelInfo;
}

function normalizeDeitImageInput(input: Partial<DeitImageInput> = {}): DeitImageInput {
  const width = input.width ?? DEFAULT_DEIT_IMAGE.width;
  const height = input.height ?? DEFAULT_DEIT_IMAGE.height;

  if (width <= 0 || height <= 0) {
    throw new Error("DeiT image dimensions must be positive");
  }

  return {
    width,
    height,
    channels: 3,
  };
}

function summarizeDeitImageInput(input: DeitImageInput): string {
  return `${input.width}x${input.height} RGB image`;
}

function previewDeitOutput(output: unknown, maxLength = 200): string {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

function createDeitPipelineResult(
  modelId: string,
  capabilities: DeitHardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "pillow", boolean>>,
  input: Partial<DeitImageInput>,
  output: unknown,
): DeitPipelineResult {
  const modelInfo = loadDeitModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectDeitDevice(capabilities),
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
      pipelineMissingDeps: ["Pillow>=8.0.0"],
    };
  }

  const normalizedInput = normalizeDeitImageInput(input);

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    inputSummary: summarizeDeitImageInput(normalizedInput),
    outputPreview: previewDeitOutput(output),
  };
}

class DeitMockClassificationHandler {
  readonly implementationType = "MOCK";

  classify(input: Partial<DeitImageInput> = {}): {
    label: string;
    score: number;
    implementationType: "MOCK";
    inputSummary: string;
  } {
    const normalizedInput = normalizeDeitImageInput(input);
    const areaRatio = (normalizedInput.width * normalizedInput.height) / (224 * 224);

    return {
      label: "tabby cat",
      score: Number(Math.min(areaRatio, 1).toFixed(3)),
      implementationType: this.implementationType,
      inputSummary: summarizeDeitImageInput(normalizedInput),
    };
  }
}

describe("DeiT model conversion fixture", () => {
  it("keeps the DeiT model registry from the Python source", () => {
    expect(Object.keys(DEIT_MODEL_REGISTRY)).toEqual([DEFAULT_DEIT_MODEL_ID]);
    expect(loadDeitModelInfo()).toEqual({
      description: "Data-efficient Image Transformer base image classification model",
      className: "DeiTForImageClassification",
      task: "image-classification",
      primaryModel: DEFAULT_DEIT_MODEL_ID,
      imageSize: 224,
      patchSize: 16,
      numLabels: 1000,
    });
  });

  it("rejects unknown DeiT model identifiers explicitly", () => {
    expect(() => loadDeitModelInfo("facebook/deit-tiny-patch16-224")).toThrow(
      "Unknown DeiT model: facebook/deit-tiny-patch16-224",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectDeitDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectDeitDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectDeitDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createDeitPipelineResult(
      DEFAULT_DEIT_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: false, pillow: true },
      DEFAULT_DEIT_IMAGE,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing image support separately from core transformers", () => {
    const result = createDeitPipelineResult(
      DEFAULT_DEIT_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pillow: false },
      DEFAULT_DEIT_IMAGE,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["Pillow>=8.0.0"],
    });
  });

  it("builds a successful image-classification result when dependencies are available", () => {
    const result = createDeitPipelineResult(
      DEFAULT_DEIT_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pillow: true },
      { width: 384, height: 256, channels: 3 },
      [{ label: "tabby cat", score: 0.97, logits: Array.from({ length: 80 }, (_, index) => index) }],
    );

    expect(result).toMatchObject({
      model: DEFAULT_DEIT_MODEL_ID,
      device: "cpu",
      task: "image-classification",
      className: "DeiTForImageClassification",
      pipelineSuccess: true,
      pipelineErrorType: "none",
      inputSummary: "384x256 RGB image",
    });
    expect(result.outputPreview).toHaveLength(203);
    expect(result.outputPreview?.endsWith("...")).toBe(true);
  });

  it("normalizes image input and validates dimensions", () => {
    expect(normalizeDeitImageInput()).toEqual(DEFAULT_DEIT_IMAGE);
    expect(normalizeDeitImageInput({ width: 112 })).toEqual({ width: 112, height: 224, channels: 3 });
    expect(() => normalizeDeitImageInput({ width: 0, height: 224 })).toThrow(
      "DeiT image dimensions must be positive",
    );
  });

  it("provides a deterministic mock image-classification handler", () => {
    const handler = new DeitMockClassificationHandler();

    expect(handler.classify({ width: 112, height: 112, channels: 3 })).toEqual({
      label: "tabby cat",
      score: 0.25,
      implementationType: "MOCK",
      inputSummary: "112x112 RGB image",
    });
  });
});
