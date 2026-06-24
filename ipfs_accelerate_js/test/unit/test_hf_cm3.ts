const DEFAULT_CM3_MODEL_ID = "facebook/cm3leon-7b";
const DEFAULT_TEST_TEXT = "A cat wearing sunglasses and a leather jacket";
const DEFAULT_TEST_IMAGE_URL = "http://images.cocodataset.org/val2017/000000039769.jpg";

const CM3_MODELS_REGISTRY = {
  [DEFAULT_CM3_MODEL_ID]: {
    description: "CM3Leon 7B model",
    className: "Cm3LeonForConditionalGeneration",
    task: "text-to-image",
  },
};

function selectPreferredDevice(capabilities) {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadCm3ModelInfo(modelId = DEFAULT_CM3_MODEL_ID) {
  const modelInfo = CM3_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown CM3 model: ${modelId}`);
  }

  return modelInfo;
}

function createPipelineResult(modelId, capabilities, dependencies, output) {
  const modelInfo = loadCm3ModelInfo(modelId);
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

  if (!dependencies.pil || !dependencies.requests) {
    return {
      ...baseResult,
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["pillow>=8.0.0", "requests>=2.25.0"],
    };
  }

  if (!dependencies.accelerate) {
    return {
      ...baseResult,
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["accelerate>=0.12.0"],
    };
  }

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    outputPreview: previewPipelineOutput(output),
  };
}

function previewPipelineOutput(output, maxLength = 200) {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

describe("CM3 model conversion fixture", () => {
  it("keeps the CM3 registry and default prompts from the Python source", () => {
    expect(Object.keys(CM3_MODELS_REGISTRY)).toEqual([DEFAULT_CM3_MODEL_ID]);
    expect(loadCm3ModelInfo()).toEqual({
      description: "CM3Leon 7B model",
      className: "Cm3LeonForConditionalGeneration",
      task: "text-to-image",
    });
    expect(DEFAULT_TEST_TEXT).toBe("A cat wearing sunglasses and a leather jacket");
    expect(DEFAULT_TEST_IMAGE_URL).toBe("http://images.cocodataset.org/val2017/000000039769.jpg");
  });

  it("rejects unknown CM3 model identifiers explicitly", () => {
    expect(() => loadCm3ModelInfo("facebook/cm3leon-13b")).toThrow("Unknown CM3 model: facebook/cm3leon-13b");
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectPreferredDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createPipelineResult(
      DEFAULT_CM3_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: false, pil: true, requests: true, accelerate: true },
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing image dependencies separately from core transformers", () => {
    const result = createPipelineResult(
      DEFAULT_CM3_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pil: false, requests: true, accelerate: true },
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["pillow>=8.0.0", "requests>=2.25.0"],
    });
  });

  it("reports missing accelerate separately from image dependencies", () => {
    const result = createPipelineResult(
      DEFAULT_CM3_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pil: true, requests: true, accelerate: false },
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["accelerate>=0.12.0"],
    });
  });

  it("builds a successful pipeline result with a bounded output preview", () => {
    const result = createPipelineResult(
      DEFAULT_CM3_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pil: true, requests: true, accelerate: true },
      [{ image: `${DEFAULT_TEST_TEXT} `.repeat(6).trim() }],
    );

    expect(result).toMatchObject({
      model: DEFAULT_CM3_MODEL_ID,
      device: "cpu",
      task: "text-to-image",
      className: "Cm3LeonForConditionalGeneration",
      pipelineSuccess: true,
      pipelineErrorType: "none",
    });
    expect(result.outputPreview).toHaveLength(203);
    expect(result.outputPreview.endsWith("...")).toBe(true);
  });
});
