type Blip2Task = "image-to-text";
type Blip2ClassName = "Blip2ForConditionalGeneration";
type Blip2Device = "cpu" | "cuda" | "mps";
type Blip2Dependency = "transformers" | "pillow>=8.0.0" | "requests>=2.25.0";

interface HardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface Blip2ModelInfo {
  description: string;
  className: Blip2ClassName;
  task: Blip2Task;
}

interface Blip2PipelineResult {
  model: string;
  device: Blip2Device;
  task: Blip2Task;
  className: Blip2ClassName;
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: Blip2Dependency[];
  pipelineMissingDeps?: Blip2Dependency[];
}

const DEFAULT_BLIP2_MODEL_ID = "Salesforce/blip2-opt-2.7b";
const DEFAULT_TEST_IMAGE_URL = "http://images.cocodataset.org/val2017/000000039769.jpg";
const DEFAULT_PROMPT = "Question: What is shown in the image? Answer:";

const BLIP2_MODELS_REGISTRY: Record<string, Blip2ModelInfo> = {
  [DEFAULT_BLIP2_MODEL_ID]: {
    description: "BLIP-2 with OPT 2.7B",
    className: "Blip2ForConditionalGeneration",
    task: "image-to-text",
  },
  "Salesforce/blip2-flan-t5-xl": {
    description: "BLIP-2 with Flan-T5 XL",
    className: "Blip2ForConditionalGeneration",
    task: "image-to-text",
  },
};

function selectPreferredDevice(capabilities: HardwareCapabilities): Blip2Device {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadBlip2ModelInfo(modelId = DEFAULT_BLIP2_MODEL_ID): Blip2ModelInfo {
  const modelInfo = BLIP2_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown BLIP-2 model: ${modelId}`);
  }

  return modelInfo;
}

function createPipelineInput(modelId = DEFAULT_BLIP2_MODEL_ID): { image: string; prompt: string } {
  loadBlip2ModelInfo(modelId);

  return {
    image: DEFAULT_TEST_IMAGE_URL,
    prompt: DEFAULT_PROMPT,
  };
}

function createPipelineResult(
  modelId: string,
  capabilities: HardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "pillow" | "requests", boolean>>,
): Blip2PipelineResult {
  const modelInfo = loadBlip2ModelInfo(modelId);
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

  const missingDeps: Blip2Dependency[] = [];

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

describe("BLIP-2 model conversion fixture", () => {
  it("keeps the BLIP-2 model registry from the Python source", () => {
    expect(Object.keys(BLIP2_MODELS_REGISTRY)).toEqual([
      "Salesforce/blip2-opt-2.7b",
      "Salesforce/blip2-flan-t5-xl",
    ]);
    expect(loadBlip2ModelInfo()).toEqual({
      description: "BLIP-2 with OPT 2.7B",
      className: "Blip2ForConditionalGeneration",
      task: "image-to-text",
    });
    expect(loadBlip2ModelInfo("Salesforce/blip2-flan-t5-xl")).toMatchObject({
      description: "BLIP-2 with Flan-T5 XL",
      className: "Blip2ForConditionalGeneration",
    });
  });

  it("rejects unknown BLIP-2 model identifiers explicitly", () => {
    expect(() => loadBlip2ModelInfo("Salesforce/blip2-unknown")).toThrow(
      "Unknown BLIP-2 model: Salesforce/blip2-unknown",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectPreferredDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("uses image-plus-prompt input for BLIP-2 generation", () => {
    expect(createPipelineInput()).toEqual({
      image: DEFAULT_TEST_IMAGE_URL,
      prompt: DEFAULT_PROMPT,
    });
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createPipelineResult(
      DEFAULT_BLIP2_MODEL_ID,
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
      "Salesforce/blip2-flan-t5-xl",
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
      createPipelineResult(DEFAULT_BLIP2_MODEL_ID, { cpu: true, cuda: false, mps: false }, {
        transformers: true,
        pillow: true,
        requests: true,
      }),
    ).toMatchObject({
      model: DEFAULT_BLIP2_MODEL_ID,
      device: "cpu",
      task: "image-to-text",
      className: "Blip2ForConditionalGeneration",
      pipelineSuccess: true,
      pipelineErrorType: "none",
    });
  });
});

export {};
