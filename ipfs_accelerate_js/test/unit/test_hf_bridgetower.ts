type BridgeTowerDevice = "cpu" | "cuda" | "mps";
type BridgeTowerDependency = "transformers" | "Pillow>=9.0.0";

interface BridgeTowerModelInfo {
  description: string;
  className: "BridgeTowerModel";
  task: "feature-extraction";
  modalities: readonly ["text", "image"];
}

interface BridgeTowerHardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface BridgeTowerInput {
  text: string;
  image: {
    width: number;
    height: number;
    channels: 3;
  };
}

interface BridgeTowerPipelineResult {
  model: string;
  device: BridgeTowerDevice;
  task: "feature-extraction";
  className: "BridgeTowerModel";
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: BridgeTowerDependency[];
  pipelineMissingDeps?: BridgeTowerDependency[];
  inputSummary?: string;
  outputPreview?: string;
}

const BRIDGETOWER_MODELS_REGISTRY: Record<string, BridgeTowerModelInfo> = {
  "bridgetower-base": {
    description: "BRIDGETOWER base vision-language feature extraction model",
    className: "BridgeTowerModel",
    task: "feature-extraction",
    modalities: ["text", "image"],
  },
};

const DEFAULT_BRIDGETOWER_INPUT: BridgeTowerInput = {
  text: "This is a test input for the model.",
  image: {
    width: 224,
    height: 224,
    channels: 3,
  },
};

function selectBridgeTowerDevice(capabilities: BridgeTowerHardwareCapabilities): BridgeTowerDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadBridgeTowerModelInfo(modelId = "bridgetower-base"): BridgeTowerModelInfo {
  const modelInfo = BRIDGETOWER_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown BRIDGETOWER model: ${modelId}`);
  }

  return modelInfo;
}

function normalizeBridgeTowerInput(input: Partial<BridgeTowerInput> = {}): BridgeTowerInput {
  const image = input.image ?? DEFAULT_BRIDGETOWER_INPUT.image;
  const text = input.text?.trim() || DEFAULT_BRIDGETOWER_INPUT.text;

  if (image.width <= 0 || image.height <= 0) {
    throw new Error("BridgeTower image dimensions must be positive");
  }

  return {
    text,
    image: {
      width: image.width,
      height: image.height,
      channels: 3,
    },
  };
}

function summarizeBridgeTowerInput(input: BridgeTowerInput): string {
  return `${input.text} | ${input.image.width}x${input.image.height} RGB image`;
}

function previewBridgeTowerOutput(output: unknown, maxLength = 200): string {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

function createBridgeTowerPipelineResult(
  modelId: string,
  capabilities: BridgeTowerHardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "pillow", boolean>>,
  input: Partial<BridgeTowerInput>,
  output: unknown,
): BridgeTowerPipelineResult {
  const modelInfo = loadBridgeTowerModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectBridgeTowerDevice(capabilities),
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
      pipelineMissingDeps: ["Pillow>=9.0.0"],
    };
  }

  const normalizedInput = normalizeBridgeTowerInput(input);

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    inputSummary: summarizeBridgeTowerInput(normalizedInput),
    outputPreview: previewBridgeTowerOutput(output),
  };
}

class BridgeTowerMockHandler {
  readonly implementationType = "MOCK";

  embed(input: Partial<BridgeTowerInput> = {}): {
    embedding: number[];
    implementationType: "MOCK";
    inputSummary: string;
  } {
    const normalizedInput = normalizeBridgeTowerInput(input);
    const textSignal = Math.min(normalizedInput.text.length, 100) / 100;
    const imageSignal = (normalizedInput.image.width * normalizedInput.image.height) / (224 * 224);

    return {
      embedding: [Number(textSignal.toFixed(3)), Number(imageSignal.toFixed(3)), 1],
      implementationType: this.implementationType,
      inputSummary: summarizeBridgeTowerInput(normalizedInput),
    };
  }
}

describe("BridgeTower model conversion fixture", () => {
  it("keeps the BridgeTower model registry from the Python source", () => {
    expect(Object.keys(BRIDGETOWER_MODELS_REGISTRY)).toEqual(["bridgetower-base"]);
    expect(loadBridgeTowerModelInfo()).toEqual({
      description: "BRIDGETOWER base vision-language feature extraction model",
      className: "BridgeTowerModel",
      task: "feature-extraction",
      modalities: ["text", "image"],
    });
  });

  it("rejects unknown BridgeTower model identifiers explicitly", () => {
    expect(() => loadBridgeTowerModelInfo("BridgeTower/bridgetower-large-itm-mlm")).toThrow(
      "Unknown BRIDGETOWER model: BridgeTower/bridgetower-large-itm-mlm",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectBridgeTowerDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectBridgeTowerDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectBridgeTowerDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createBridgeTowerPipelineResult(
      "bridgetower-base",
      { cpu: true, cuda: false, mps: false },
      { transformers: false, pillow: true },
      DEFAULT_BRIDGETOWER_INPUT,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing image support separately from core transformers", () => {
    const result = createBridgeTowerPipelineResult(
      "bridgetower-base",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pillow: false },
      DEFAULT_BRIDGETOWER_INPUT,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["Pillow>=9.0.0"],
    });
  });

  it("builds a successful feature-extraction result with multimodal input", () => {
    const result = createBridgeTowerPipelineResult(
      "bridgetower-base",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pillow: true },
      { text: "A caption paired with a test image.", image: { width: 384, height: 256, channels: 3 } },
      [{ embedding: Array.from({ length: 80 }, (_, index) => Number((index / 100).toFixed(2))) }],
    );

    expect(result).toMatchObject({
      model: "bridgetower-base",
      device: "cpu",
      task: "feature-extraction",
      className: "BridgeTowerModel",
      pipelineSuccess: true,
      pipelineErrorType: "none",
      inputSummary: "A caption paired with a test image. | 384x256 RGB image",
    });
    expect(result.outputPreview).toHaveLength(203);
    expect(result.outputPreview?.endsWith("...")).toBe(true);
  });

  it("normalizes input and validates image dimensions", () => {
    expect(normalizeBridgeTowerInput({ text: "  " })).toEqual(DEFAULT_BRIDGETOWER_INPUT);
    expect(() => normalizeBridgeTowerInput({ image: { width: 0, height: 224, channels: 3 } })).toThrow(
      "BridgeTower image dimensions must be positive",
    );
  });

  it("provides a deterministic mock feature-extraction handler", () => {
    const handler = new BridgeTowerMockHandler();

    expect(handler.embed({ text: "paired", image: { width: 112, height: 112, channels: 3 } })).toEqual({
      embedding: [0.06, 0.25, 1],
      implementationType: "MOCK",
      inputSummary: "paired | 112x112 RGB image",
    });
  });
});
