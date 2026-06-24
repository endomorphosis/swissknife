type DetaDevice = "cpu" | "cuda" | "mps";
type DetaDependency = "transformers" | "pillow>=8.0.0" | "requests>=2.25.0";

interface DetaModelInfo {
  description: string;
  className: "DetaForObjectDetection";
  task: "object-detection";
  imageSize: number;
}

interface DetaHardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface DetaImageInput {
  width: number;
  height: number;
  channels: 3;
  source: "url" | "buffer" | "fixture";
}

interface DetaDetection {
  label: string;
  score: number;
  box: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
}

interface DetaPipelineResult {
  model: string;
  device: DetaDevice;
  task: "object-detection";
  className: "DetaForObjectDetection";
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: DetaDependency[];
  pipelineMissingDeps?: DetaDependency[];
  inputSummary?: string;
  outputPreview?: string;
}

const DEFAULT_DETA_MODEL_ID = "jozhang97/deta-resnet-50";
const DEFAULT_DETA_IMAGE: DetaImageInput = {
  width: 800,
  height: 533,
  channels: 3,
  source: "fixture",
};

const DETA_MODELS_REGISTRY: Record<string, DetaModelInfo> = {
  [DEFAULT_DETA_MODEL_ID]: {
    description: "DETA ResNet-50 object detection model",
    className: "DetaForObjectDetection",
    task: "object-detection",
    imageSize: 800,
  },
};

function selectDetaDevice(capabilities: DetaHardwareCapabilities): DetaDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadDetaModelInfo(modelId = DEFAULT_DETA_MODEL_ID): DetaModelInfo {
  const modelInfo = DETA_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown DETA model: ${modelId}`);
  }

  return modelInfo;
}

function normalizeDetaImage(input: Partial<DetaImageInput> = {}): DetaImageInput {
  const width = input.width ?? DEFAULT_DETA_IMAGE.width;
  const height = input.height ?? DEFAULT_DETA_IMAGE.height;

  if (width <= 0 || height <= 0) {
    throw new Error("DETA image dimensions must be positive");
  }

  return {
    width,
    height,
    channels: 3,
    source: input.source ?? DEFAULT_DETA_IMAGE.source,
  };
}

function summarizeDetaImage(input: DetaImageInput): string {
  return `${input.width}x${input.height} RGB image (${input.source})`;
}

function previewDetaOutput(output: unknown, maxLength = 200): string {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

function createDetaPipelineResult(
  modelId: string,
  capabilities: DetaHardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "pillow" | "requests", boolean>>,
  input: Partial<DetaImageInput>,
  output: unknown,
): DetaPipelineResult {
  const modelInfo = loadDetaModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectDetaDevice(capabilities),
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

  const missingImageDeps: DetaDependency[] = [];

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

  const normalizedInput = normalizeDetaImage(input);

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    inputSummary: summarizeDetaImage(normalizedInput),
    outputPreview: previewDetaOutput(output),
  };
}

class DetaMockHandler {
  readonly implementationType = "MOCK";

  detect(input: Partial<DetaImageInput> = {}): {
    detections: DetaDetection[];
    implementationType: "MOCK";
    inputSummary: string;
  } {
    const normalizedInput = normalizeDetaImage(input);
    const scale = Number((normalizedInput.width / DEFAULT_DETA_IMAGE.width).toFixed(3));

    return {
      detections: [
        {
          label: "object",
          score: 0.91,
          box: {
            xmin: 10,
            ymin: 20,
            xmax: Math.round(160 * scale),
            ymax: Math.round(220 * scale),
          },
        },
      ],
      implementationType: this.implementationType,
      inputSummary: summarizeDetaImage(normalizedInput),
    };
  }
}

describe("DETA model conversion fixture", () => {
  it("keeps a DETA object detection registry entry", () => {
    expect(Object.keys(DETA_MODELS_REGISTRY)).toEqual(["jozhang97/deta-resnet-50"]);
    expect(loadDetaModelInfo()).toEqual({
      description: "DETA ResNet-50 object detection model",
      className: "DetaForObjectDetection",
      task: "object-detection",
      imageSize: 800,
    });
  });

  it("rejects unknown DETA model identifiers explicitly", () => {
    expect(() => loadDetaModelInfo("deta-base")).toThrow("Unknown DETA model: deta-base");
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectDetaDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectDetaDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectDetaDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("normalizes image input and rejects invalid dimensions", () => {
    expect(normalizeDetaImage()).toEqual(DEFAULT_DETA_IMAGE);
    expect(normalizeDetaImage({ width: 1024, source: "url" })).toEqual({
      width: 1024,
      height: 533,
      channels: 3,
      source: "url",
    });
    expect(() => normalizeDetaImage({ width: -1 })).toThrow("DETA image dimensions must be positive");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createDetaPipelineResult(
      DEFAULT_DETA_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: false, pillow: true, requests: true },
      {},
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing image dependencies separately from core transformers", () => {
    const result = createDetaPipelineResult(
      DEFAULT_DETA_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pillow: false, requests: false },
      {},
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["pillow>=8.0.0", "requests>=2.25.0"],
    });
  });

  it("creates a stable successful object detection summary", () => {
    const output = new DetaMockHandler().detect({ width: 1000, height: 600, source: "buffer" });
    const result = createDetaPipelineResult(
      DEFAULT_DETA_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pillow: true, requests: true },
      { width: 1000, height: 600, source: "buffer" },
      output.detections,
    );

    expect(result).toMatchObject({
      model: DEFAULT_DETA_MODEL_ID,
      device: "cpu",
      task: "object-detection",
      className: "DetaForObjectDetection",
      pipelineSuccess: true,
      pipelineErrorType: "none",
      inputSummary: "1000x600 RGB image (buffer)",
    });
    expect(result.outputPreview).toContain('"label":"object"');
  });

  it("bounds long output previews", () => {
    const preview = previewDetaOutput(
      Array.from({ length: 20 }, (_, index) => ({
        label: `object-${index}`,
        score: 0.9,
        box: { xmin: index, ymin: index, xmax: index + 10, ymax: index + 20 },
      })),
    );

    expect(preview).toHaveLength(203);
    expect(preview.endsWith("...")).toBe(true);
  });
});
