type BlipTask = "image-to-text" | "visual-question-answering";
type BlipClassName = "BlipForConditionalGeneration" | "BlipForQuestionAnswering";
type BlipDevice = "cpu" | "cuda" | "mps";
type BlipDependency = "transformers" | "pillow>=8.0.0" | "requests>=2.25.0";

interface HardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface BlipModelInfo {
  description: string;
  className: BlipClassName;
  task: BlipTask;
}

interface BlipPipelineResult {
  model: string;
  device: BlipDevice;
  task: BlipTask;
  className: BlipClassName;
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: BlipDependency[];
  pipelineMissingDeps?: BlipDependency[];
}

const DEFAULT_BLIP_MODEL_ID = "Salesforce/blip-image-captioning-base";
const DEFAULT_TEST_IMAGE_URL = "http://images.cocodataset.org/val2017/000000039769.jpg";
const DEFAULT_VQA_QUESTION = "How many cats are in the image?";

const BLIP_MODELS_REGISTRY: Record<string, BlipModelInfo> = {
  [DEFAULT_BLIP_MODEL_ID]: {
    description: "BLIP base model for image captioning",
    className: "BlipForConditionalGeneration",
    task: "image-to-text",
  },
  "Salesforce/blip-vqa-base": {
    description: "BLIP base model for visual question answering",
    className: "BlipForQuestionAnswering",
    task: "visual-question-answering",
  },
};

function selectPreferredDevice(capabilities: HardwareCapabilities): BlipDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadBlipModelInfo(modelId = DEFAULT_BLIP_MODEL_ID): BlipModelInfo {
  const modelInfo = BLIP_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown BLIP model: ${modelId}`);
  }

  return modelInfo;
}

function createPipelineInput(modelId = DEFAULT_BLIP_MODEL_ID): string | { image: string; question: string } {
  const modelInfo = loadBlipModelInfo(modelId);

  if (modelInfo.task === "visual-question-answering") {
    return {
      image: DEFAULT_TEST_IMAGE_URL,
      question: DEFAULT_VQA_QUESTION,
    };
  }

  return DEFAULT_TEST_IMAGE_URL;
}

function createPipelineResult(
  modelId: string,
  capabilities: HardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "pillow" | "requests", boolean>>,
): BlipPipelineResult {
  const modelInfo = loadBlipModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectPreferredDevice(capabilities),
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

  const missingDeps: BlipDependency[] = [];

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

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
  };
}

describe("BLIP model conversion fixture", () => {
  it("keeps the BLIP model registry from the Python source", () => {
    expect(Object.keys(BLIP_MODELS_REGISTRY)).toEqual([
      "Salesforce/blip-image-captioning-base",
      "Salesforce/blip-vqa-base",
    ]);
    expect(loadBlipModelInfo()).toEqual({
      description: "BLIP base model for image captioning",
      className: "BlipForConditionalGeneration",
      task: "image-to-text",
    });
    expect(loadBlipModelInfo("Salesforce/blip-vqa-base")).toMatchObject({
      className: "BlipForQuestionAnswering",
      task: "visual-question-answering",
    });
  });

  it("rejects unknown BLIP model identifiers explicitly", () => {
    expect(() => loadBlipModelInfo("Salesforce/blip-unknown")).toThrow(
      "Unknown BLIP model: Salesforce/blip-unknown",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectPreferredDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("uses image-only input for captioning and image-plus-question input for VQA", () => {
    expect(createPipelineInput()).toBe(DEFAULT_TEST_IMAGE_URL);
    expect(createPipelineInput("Salesforce/blip-vqa-base")).toEqual({
      image: DEFAULT_TEST_IMAGE_URL,
      question: DEFAULT_VQA_QUESTION,
    });
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createPipelineResult(
      DEFAULT_BLIP_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: false, pillow: true, requests: true },
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing image loading dependencies separately", () => {
    const result = createPipelineResult(
      "Salesforce/blip-vqa-base",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pillow: false, requests: false },
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["pillow>=8.0.0", "requests>=2.25.0"],
    });
  });

  it("marks the pipeline result successful when dependencies are available", () => {
    expect(
      createPipelineResult(DEFAULT_BLIP_MODEL_ID, { cpu: true, cuda: false, mps: false }, {
        transformers: true,
        pillow: true,
        requests: true,
      }),
    ).toMatchObject({
      model: DEFAULT_BLIP_MODEL_ID,
      device: "cpu",
      task: "image-to-text",
      className: "BlipForConditionalGeneration",
      pipelineSuccess: true,
      pipelineErrorType: "none",
    });
  });
});

export {};
