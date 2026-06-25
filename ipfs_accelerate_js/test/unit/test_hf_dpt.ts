type DptDevice = "cpu" | "cuda" | "openvino";
type DptTask = "depth-estimation";
type DptClassName = "DPTForDepthEstimation";
type DptProcessorClassName = "DPTImageProcessor";
type DptDependency = "transformers" | "pillow>=8.0.0" | "requests>=2.25.0";

interface DptHardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  openvino: boolean;
}

interface DptModelInfo {
  description: string;
  className: DptClassName;
  processorClassName: DptProcessorClassName;
  task: DptTask;
}

interface DptImageInput {
  imageUrl: string;
  width: number;
  height: number;
  channels: 3;
}

interface DptPipelineResult {
  model: string;
  device: DptDevice;
  task: DptTask;
  className: DptClassName;
  processorClassName: DptProcessorClassName;
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: DptDependency[];
  pipelineMissingDeps?: DptDependency[];
  inputSummary?: string;
  outputPreview?: string;
}

const DEFAULT_DPT_MODEL_ID = "Intel/dpt-large";
const DEFAULT_DPT_IMAGE_URL = "http://images.cocodataset.org/val2017/000000039769.jpg";
const DEFAULT_DPT_IMAGE: DptImageInput = {
  imageUrl: DEFAULT_DPT_IMAGE_URL,
  width: 384,
  height: 384,
  channels: 3,
};

const DPT_MODELS_REGISTRY: Record<string, DptModelInfo> = {
  [DEFAULT_DPT_MODEL_ID]: {
    description: "DPT large model for monocular depth estimation",
    className: "DPTForDepthEstimation",
    processorClassName: "DPTImageProcessor",
    task: "depth-estimation",
  },
  "Intel/dpt-hybrid-midas": {
    description: "DPT hybrid MiDaS model for monocular depth estimation",
    className: "DPTForDepthEstimation",
    processorClassName: "DPTImageProcessor",
    task: "depth-estimation",
  },
};

function selectDptDevice(capabilities: DptHardwareCapabilities): DptDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.openvino) {
    return "openvino";
  }

  return "cpu";
}

function loadDptModelInfo(modelId = DEFAULT_DPT_MODEL_ID): DptModelInfo {
  const modelInfo = DPT_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown DPT model: ${modelId}`);
  }

  return modelInfo;
}

function normalizeDptImage(input: Partial<DptImageInput> = {}): DptImageInput {
  const imageUrl = input.imageUrl?.trim() || DEFAULT_DPT_IMAGE.imageUrl;
  const width = input.width ?? DEFAULT_DPT_IMAGE.width;
  const height = input.height ?? DEFAULT_DPT_IMAGE.height;

  if (!/^https?:\/\//.test(imageUrl)) {
    throw new Error("DPT image URL must be absolute");
  }

  if (width <= 0 || height <= 0) {
    throw new Error("DPT image dimensions must be positive");
  }

  return {
    imageUrl,
    width,
    height,
    channels: 3,
  };
}

function summarizeDptImage(input: DptImageInput): string {
  return `${input.width}x${input.height} RGB image | ${input.imageUrl}`;
}

function previewDptOutput(output: unknown, maxLength = 200): string {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

function createDptPipelineResult(
  modelId: string,
  capabilities: DptHardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "pillow" | "requests", boolean>>,
  input: Partial<DptImageInput>,
  output: unknown,
): DptPipelineResult {
  const modelInfo = loadDptModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectDptDevice(capabilities),
    task: modelInfo.task,
    className: modelInfo.className,
    processorClassName: modelInfo.processorClassName,
  };

  if (!dependencies.transformers) {
    return {
      ...baseResult,
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    };
  }

  const missingDeps: DptDependency[] = [];

  if (!dependencies.pillow) {
    missingDeps.push("pillow>=8.0.0");
  }

  if (!dependencies.requests) {
    missingDeps.push("requests>=2.25.0");
  }

  if (missingDeps.length > 0) {
    return {
      ...baseResult,
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: missingDeps,
    };
  }

  const normalizedInput = normalizeDptImage(input);

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    inputSummary: summarizeDptImage(normalizedInput),
    outputPreview: previewDptOutput(output),
  };
}

class DptMockDepthEstimationHandler {
  readonly implementationType = "MOCK";

  estimate(input: Partial<DptImageInput> = {}): {
    depthMap: { width: number; height: number; minDepth: number; maxDepth: number };
    implementationType: "MOCK";
    inputSummary: string;
  } {
    const normalizedInput = normalizeDptImage(input);
    const scale = (normalizedInput.width * normalizedInput.height) / (384 * 384);

    return {
      depthMap: {
        width: normalizedInput.width,
        height: normalizedInput.height,
        minDepth: 0,
        maxDepth: Number(scale.toFixed(3)),
      },
      implementationType: this.implementationType,
      inputSummary: summarizeDptImage(normalizedInput),
    };
  }
}

describe("DPT model conversion fixture", () => {
  it("keeps the DPT model registry from the Python source", () => {
    expect(Object.keys(DPT_MODELS_REGISTRY)).toEqual(["Intel/dpt-large", "Intel/dpt-hybrid-midas"]);
    expect(loadDptModelInfo()).toEqual({
      description: "DPT large model for monocular depth estimation",
      className: "DPTForDepthEstimation",
      processorClassName: "DPTImageProcessor",
      task: "depth-estimation",
    });
  });

  it("rejects unknown DPT model identifiers explicitly", () => {
    expect(() => loadDptModelInfo("Intel/dpt-unknown")).toThrow("Unknown DPT model: Intel/dpt-unknown");
  });

  it("selects CUDA before OpenVINO and falls back to CPU", () => {
    expect(selectDptDevice({ cpu: true, cuda: true, openvino: true })).toBe("cuda");
    expect(selectDptDevice({ cpu: true, cuda: false, openvino: true })).toBe("openvino");
    expect(selectDptDevice({ cpu: true, cuda: false, openvino: false })).toBe("cpu");
  });

  it("normalizes image input and rejects invalid values", () => {
    expect(normalizeDptImage()).toEqual(DEFAULT_DPT_IMAGE);
    expect(normalizeDptImage({ width: 512 })).toEqual({
      imageUrl: DEFAULT_DPT_IMAGE_URL,
      width: 512,
      height: 384,
      channels: 3,
    });
    expect(() => normalizeDptImage({ imageUrl: "fixtures/depth.png" })).toThrow(
      "DPT image URL must be absolute",
    );
    expect(() => normalizeDptImage({ height: 0 })).toThrow("DPT image dimensions must be positive");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createDptPipelineResult(
      DEFAULT_DPT_MODEL_ID,
      { cpu: true, cuda: false, openvino: false },
      { transformers: false, pillow: true, requests: true },
      DEFAULT_DPT_IMAGE,
      {},
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing image loading dependencies separately", () => {
    const result = createDptPipelineResult(
      "Intel/dpt-hybrid-midas",
      { cpu: true, cuda: false, openvino: false },
      { transformers: true, pillow: false, requests: false },
      DEFAULT_DPT_IMAGE,
      {},
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["pillow>=8.0.0", "requests>=2.25.0"],
    });
  });

  it("builds a successful depth-estimation result", () => {
    const result = createDptPipelineResult(
      DEFAULT_DPT_MODEL_ID,
      { cpu: true, cuda: false, openvino: false },
      { transformers: true, pillow: true, requests: true },
      { width: 512, height: 256 },
      { predictedDepthShape: [1, 256, 512], depthRange: [0, 8.25] },
    );

    expect(result).toMatchObject({
      model: DEFAULT_DPT_MODEL_ID,
      device: "cpu",
      task: "depth-estimation",
      className: "DPTForDepthEstimation",
      processorClassName: "DPTImageProcessor",
      pipelineSuccess: true,
      pipelineErrorType: "none",
      inputSummary: `512x256 RGB image | ${DEFAULT_DPT_IMAGE_URL}`,
      outputPreview: "{\"predictedDepthShape\":[1,256,512],\"depthRange\":[0,8.25]}",
    });
  });

  it("provides a deterministic mock depth-estimation handler", () => {
    const handler = new DptMockDepthEstimationHandler();

    expect(handler.estimate({ width: 192, height: 192 })).toEqual({
      depthMap: {
        width: 192,
        height: 192,
        minDepth: 0,
        maxDepth: 0.25,
      },
      implementationType: "MOCK",
      inputSummary: `192x192 RGB image | ${DEFAULT_DPT_IMAGE_URL}`,
    });
  });
});

export {};
