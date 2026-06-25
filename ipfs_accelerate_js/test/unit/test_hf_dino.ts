type DinoDevice = "cpu" | "cuda" | "mps";
type DinoDependency = "transformers" | "pillow>=8.0.0" | "requests>=2.25.0";

interface DinoModelInfo {
  description: string;
  className: "DinoForImageClassification";
  task: "image-classification";
}

interface DinoHardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface DinoImageInput {
  width: number;
  height: number;
  channels: 3;
  source: "url" | "buffer" | "fixture";
}

interface DinoPipelineResult {
  model: string;
  device: DinoDevice;
  task: "image-classification";
  className: "DinoForImageClassification";
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: DinoDependency[];
  pipelineMissingDeps?: DinoDependency[];
  inputSummary?: string;
  outputPreview?: string;
}

const DEFAULT_DINO_MODEL_ID = "facebook/dino-vitb16";
const DEFAULT_DINO_IMAGE: DinoImageInput = {
  width: 224,
  height: 224,
  channels: 3,
  source: "fixture",
};

const DINO_MODELS_REGISTRY: Record<string, DinoModelInfo> = {
  [DEFAULT_DINO_MODEL_ID]: {
    description: "DINO ViT-B/16 model",
    className: "DinoForImageClassification",
    task: "image-classification",
  },
  "facebook/dino-vits16": {
    description: "DINO ViT-S/16 model",
    className: "DinoForImageClassification",
    task: "image-classification",
  },
};

function selectDinoDevice(capabilities: DinoHardwareCapabilities): DinoDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadDinoModelInfo(modelId = DEFAULT_DINO_MODEL_ID): DinoModelInfo {
  const modelInfo = DINO_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown DINO model: ${modelId}`);
  }

  return modelInfo;
}

function normalizeDinoImage(input: Partial<DinoImageInput> = {}): DinoImageInput {
  const width = input.width ?? DEFAULT_DINO_IMAGE.width;
  const height = input.height ?? DEFAULT_DINO_IMAGE.height;

  if (width <= 0 || height <= 0) {
    throw new Error("DINO image dimensions must be positive");
  }

  return {
    width,
    height,
    channels: 3,
    source: input.source ?? DEFAULT_DINO_IMAGE.source,
  };
}

function summarizeDinoImage(input: DinoImageInput): string {
  return `${input.width}x${input.height} RGB image (${input.source})`;
}

function previewDinoOutput(output: unknown, maxLength = 200): string {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

function createDinoPipelineResult(
  modelId: string,
  capabilities: DinoHardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "pillow" | "requests", boolean>>,
  input: Partial<DinoImageInput>,
  output: unknown,
): DinoPipelineResult {
  const modelInfo = loadDinoModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectDinoDevice(capabilities),
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

  const missingImageDeps: DinoDependency[] = [];

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

  const normalizedInput = normalizeDinoImage(input);

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    inputSummary: summarizeDinoImage(normalizedInput),
    outputPreview: previewDinoOutput(output),
  };
}

class DinoMockHandler {
  readonly implementationType = "MOCK";

  classify(input: Partial<DinoImageInput> = {}): {
    logits: number[];
    implementationType: "MOCK";
    inputSummary: string;
  } {
    const normalizedInput = normalizeDinoImage(input);
    const areaRatio = (normalizedInput.width * normalizedInput.height) / (224 * 224);

    return {
      logits: [Number(areaRatio.toFixed(3)), 0.31, 0.08],
      implementationType: this.implementationType,
      inputSummary: summarizeDinoImage(normalizedInput),
    };
  }
}

describe("DINO model conversion fixture", () => {
  it("keeps the DINO model registry from the Python source", () => {
    expect(Object.keys(DINO_MODELS_REGISTRY)).toEqual([
      "facebook/dino-vitb16",
      "facebook/dino-vits16",
    ]);
    expect(loadDinoModelInfo()).toEqual({
      description: "DINO ViT-B/16 model",
      className: "DinoForImageClassification",
      task: "image-classification",
    });
  });

  it("rejects unknown DINO model identifiers explicitly", () => {
    expect(() => loadDinoModelInfo("facebook/dino-vitl16")).toThrow(
      "Unknown DINO model: facebook/dino-vitl16",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectDinoDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectDinoDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectDinoDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("normalizes image input and rejects invalid dimensions", () => {
    expect(normalizeDinoImage()).toEqual(DEFAULT_DINO_IMAGE);
    expect(normalizeDinoImage({ width: 384, source: "url" })).toEqual({
      width: 384,
      height: 224,
      channels: 3,
      source: "url",
    });
    expect(() => normalizeDinoImage({ height: 0 })).toThrow("DINO image dimensions must be positive");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createDinoPipelineResult(
      DEFAULT_DINO_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: false, pillow: true, requests: true },
      DEFAULT_DINO_IMAGE,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing image loading dependencies separately from core transformers", () => {
    const result = createDinoPipelineResult(
      DEFAULT_DINO_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pillow: false, requests: false },
      DEFAULT_DINO_IMAGE,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["pillow>=8.0.0", "requests>=2.25.0"],
    });
  });

  it("builds a successful image-classification result", () => {
    const result = createDinoPipelineResult(
      "facebook/dino-vits16",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pillow: true, requests: true },
      { width: 384, height: 384, source: "url" },
      [{ label: "tabby cat", score: 0.98 }],
    );

    expect(result).toMatchObject({
      model: "facebook/dino-vits16",
      device: "cpu",
      task: "image-classification",
      className: "DinoForImageClassification",
      pipelineSuccess: true,
      pipelineErrorType: "none",
      inputSummary: "384x384 RGB image (url)",
    });
    expect(result.outputPreview).toBe('[{"label":"tabby cat","score":0.98}]');
  });

  it("provides a deterministic mock image-classification handler", () => {
    const handler = new DinoMockHandler();

    expect(handler.classify({ width: 112, height: 112 })).toEqual({
      logits: [0.25, 0.31, 0.08],
      implementationType: "MOCK",
      inputSummary: "112x112 RGB image (fixture)",
    });
  });
});

export {};
