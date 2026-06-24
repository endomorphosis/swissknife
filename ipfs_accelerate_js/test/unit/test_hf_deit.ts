type DeitDevice = "cpu" | "cuda" | "openvino";
type DeitDependency = "transformers" | "image-processor";

interface DeitHardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  openvino: boolean;
}

interface DeitImageInput {
  width: number;
  height: number;
  channels: 3;
}

interface DeitModelInfo {
  className: "DeiTForImageClassification";
  task: "image-classification";
  imageSize: 224;
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

const DEIT_MODELS_REGISTRY: Record<string, DeitModelInfo> = {
  [DEFAULT_DEIT_MODEL_ID]: {
    className: "DeiTForImageClassification",
    task: "image-classification",
    imageSize: 224,
  },
};

function selectDeitDevice(capabilities: DeitHardwareCapabilities): DeitDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.openvino) {
    return "openvino";
  }

  return "cpu";
}

function loadDeitModelInfo(modelId = DEFAULT_DEIT_MODEL_ID): DeitModelInfo {
  const modelInfo = DEIT_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown DEiT model: ${modelId}`);
  }

  return modelInfo;
}

function normalizeDeitImage(input: Partial<DeitImageInput> = {}): DeitImageInput {
  const width = input.width ?? DEFAULT_DEIT_IMAGE.width;
  const height = input.height ?? DEFAULT_DEIT_IMAGE.height;

  if (width <= 0 || height <= 0) {
    throw new Error("DEiT image dimensions must be positive");
  }

  return {
    width,
    height,
    channels: 3,
  };
}

function summarizeDeitImage(input: DeitImageInput): string {
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
  dependencies: Partial<Record<"transformers" | "imageProcessor", boolean>>,
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

  if (!dependencies.imageProcessor) {
    return {
      ...baseResult,
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["image-processor"],
    };
  }

  const normalizedInput = normalizeDeitImage(input);

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    inputSummary: summarizeDeitImage(normalizedInput),
    outputPreview: previewDeitOutput(output),
  };
}

class DeitMockHandler {
  readonly implementationType = "MOCK";

  classify(input: Partial<DeitImageInput> = {}): {
    logits: number[];
    implementationType: "MOCK";
    inputSummary: string;
  } {
    const normalizedInput = normalizeDeitImage(input);
    const scale = (normalizedInput.width * normalizedInput.height) / (224 * 224);

    return {
      logits: [Number(scale.toFixed(3)), 0.2, 0.05],
      implementationType: this.implementationType,
      inputSummary: summarizeDeitImage(normalizedInput),
    };
  }
}

describe("DEiT model conversion fixture", () => {
  it("keeps the DEiT model registry from the Python source", () => {
    expect(Object.keys(DEIT_MODELS_REGISTRY)).toEqual([DEFAULT_DEIT_MODEL_ID]);
    expect(loadDeitModelInfo()).toEqual({
      className: "DeiTForImageClassification",
      task: "image-classification",
      imageSize: 224,
    });
  });

  it("rejects unknown DEiT model identifiers explicitly", () => {
    expect(() => loadDeitModelInfo("facebook/deit-unknown")).toThrow(
      "Unknown DEiT model: facebook/deit-unknown",
    );
  });

  it("selects CUDA before OpenVINO and falls back to CPU", () => {
    expect(selectDeitDevice({ cpu: true, cuda: true, openvino: true })).toBe("cuda");
    expect(selectDeitDevice({ cpu: true, cuda: false, openvino: true })).toBe("openvino");
    expect(selectDeitDevice({ cpu: true, cuda: false, openvino: false })).toBe("cpu");
  });

  it("normalizes image input and rejects invalid dimensions", () => {
    expect(normalizeDeitImage()).toEqual(DEFAULT_DEIT_IMAGE);
    expect(normalizeDeitImage({ width: 384 })).toEqual({ width: 384, height: 224, channels: 3 });
    expect(() => normalizeDeitImage({ width: -1 })).toThrow("DEiT image dimensions must be positive");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createDeitPipelineResult(
      DEFAULT_DEIT_MODEL_ID,
      { cpu: true, cuda: false, openvino: false },
      { transformers: false, imageProcessor: true },
      DEFAULT_DEIT_IMAGE,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing image processing support separately from core transformers", () => {
    const result = createDeitPipelineResult(
      DEFAULT_DEIT_MODEL_ID,
      { cpu: true, cuda: false, openvino: false },
      { transformers: true, imageProcessor: false },
      DEFAULT_DEIT_IMAGE,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["image-processor"],
    });
  });

  it("builds a successful image-classification result", () => {
    const result = createDeitPipelineResult(
      DEFAULT_DEIT_MODEL_ID,
      { cpu: true, cuda: false, openvino: false },
      { transformers: true, imageProcessor: true },
      { width: 384, height: 384 },
      [{ label: "tabby", score: 0.99 }],
    );

    expect(result).toMatchObject({
      model: DEFAULT_DEIT_MODEL_ID,
      device: "cpu",
      task: "image-classification",
      className: "DeiTForImageClassification",
      pipelineSuccess: true,
      pipelineErrorType: "none",
      inputSummary: "384x384 RGB image",
    });
    expect(result.outputPreview).toBe('[{"label":"tabby","score":0.99}]');
  });

  it("provides a deterministic mock image-classification handler", () => {
    const handler = new DeitMockHandler();

    expect(handler.classify({ width: 112, height: 112 })).toEqual({
      logits: [0.25, 0.2, 0.05],
      implementationType: "MOCK",
      inputSummary: "112x112 RGB image",
    });
  });
});

export {};
