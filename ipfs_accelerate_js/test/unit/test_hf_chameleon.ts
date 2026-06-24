type ChameleonTask = "multimodal-generation";
type ChameleonClassName = "ChameleonForConditionalGeneration";
type ChameleonDependency = "transformers" | "Pillow>=9.0.0";
type ChameleonDevice = "cpu" | "cuda" | "mps";

interface ChameleonModelInfo {
  description: string;
  className: ChameleonClassName;
  task: ChameleonTask;
}

interface HardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface ChameleonPipelineResult {
  model: string;
  device: ChameleonDevice;
  task: ChameleonTask;
  className: ChameleonClassName;
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: ChameleonDependency[];
  pipelineMissingDeps?: ChameleonDependency[];
  outputPreview?: string;
}

const CHAMELEON_MODELS_REGISTRY: Record<string, ChameleonModelInfo> = {
  "facebook/chameleon-7b": {
    description: "Chameleon 7B multimodal model",
    className: "ChameleonForConditionalGeneration",
    task: "multimodal-generation",
  },
  "facebook/chameleon-30b": {
    description: "Chameleon 30B multimodal model",
    className: "ChameleonForConditionalGeneration",
    task: "multimodal-generation",
  },
};

function selectChameleonDevice(capabilities: HardwareCapabilities): ChameleonDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadChameleonModelInfo(modelId = "facebook/chameleon-7b"): ChameleonModelInfo {
  const modelInfo = CHAMELEON_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown Chameleon model: ${modelId}`);
  }

  return modelInfo;
}

function createChameleonPipelineResult(
  modelId: string,
  capabilities: HardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "pillow", boolean>>,
  output: unknown,
): ChameleonPipelineResult {
  const modelInfo = loadChameleonModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectChameleonDevice(capabilities),
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

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    outputPreview: previewPipelineOutput(output),
  };
}

function previewPipelineOutput(output: unknown, maxLength = 200): string {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

describe("Chameleon model conversion fixture", () => {
  it("keeps the Chameleon model registry parseable", () => {
    expect(Object.keys(CHAMELEON_MODELS_REGISTRY)).toEqual([
      "facebook/chameleon-7b",
      "facebook/chameleon-30b",
    ]);
    expect(loadChameleonModelInfo()).toEqual({
      description: "Chameleon 7B multimodal model",
      className: "ChameleonForConditionalGeneration",
      task: "multimodal-generation",
    });
  });

  it("rejects unknown Chameleon model identifiers explicitly", () => {
    expect(() => loadChameleonModelInfo("facebook/chameleon-base")).toThrow(
      "Unknown Chameleon model: facebook/chameleon-base",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectChameleonDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectChameleonDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectChameleonDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createChameleonPipelineResult(
      "facebook/chameleon-7b",
      { cpu: true, cuda: false, mps: false },
      { transformers: false, pillow: true },
      "unused",
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing image support separately from core transformers", () => {
    const result = createChameleonPipelineResult(
      "facebook/chameleon-7b",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pillow: false },
      "unused",
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["Pillow>=9.0.0"],
    });
  });

  it("builds a successful multimodal result with a bounded output preview", () => {
    const longCaption = new Array(31).join("generated ");
    const result = createChameleonPipelineResult(
      "facebook/chameleon-30b",
      { cpu: true, cuda: true, mps: false },
      { transformers: true, pillow: true },
      { text: longCaption, imageTokens: 64 },
    );

    expect(result).toMatchObject({
      model: "facebook/chameleon-30b",
      device: "cuda",
      task: "multimodal-generation",
      className: "ChameleonForConditionalGeneration",
      pipelineSuccess: true,
      pipelineErrorType: "none",
    });
    expect(result.outputPreview).toHaveLength(203);
    expect(result.outputPreview?.slice(-3)).toBe("...");
  });
});
