const BIG_BIRD_MODELS_REGISTRY = {
  "google/bigbird-roberta-base": {
    description: "BigBird RoBERTa base model for masked language modeling",
    className: "BigBirdForMaskedLM",
    task: "fill-mask",
  },
  "google/bigbird-base-trivia-itc": {
    description: "BigBird base model fine-tuned for question answering",
    className: "BigBirdForQuestionAnswering",
    task: "question-answering",
  },
};

const DEFAULT_TEST_TEXT =
  "BigBird uses sparse attention so it can process much longer sequences than dense-attention transformers.";

function selectPreferredDevice(capabilities) {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadBigBirdModelInfo(modelId = "google/bigbird-roberta-base") {
  const modelInfo = BIG_BIRD_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown BigBird model: ${modelId}`);
  }

  return modelInfo;
}

function createPipelineResult(modelId, capabilities, dependencies, output) {
  const modelInfo = loadBigBirdModelInfo(modelId);
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

  if (!dependencies.tokenizers) {
    return {
      ...baseResult,
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["tokenizers>=0.11.0"],
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

describe("BigBird model conversion fixture", () => {
  it("keeps the BigBird model registry from the Python source", () => {
    expect(Object.keys(BIG_BIRD_MODELS_REGISTRY)).toEqual([
      "google/bigbird-roberta-base",
      "google/bigbird-base-trivia-itc",
    ]);
    expect(loadBigBirdModelInfo("google/bigbird-roberta-base")).toEqual({
      description: "BigBird RoBERTa base model for masked language modeling",
      className: "BigBirdForMaskedLM",
      task: "fill-mask",
    });
    expect(loadBigBirdModelInfo("google/bigbird-base-trivia-itc").task).toBe("question-answering");
  });

  it("rejects unknown BigBird model identifiers explicitly", () => {
    expect(() => loadBigBirdModelInfo("google/bigbird-unknown")).toThrow(
      "Unknown BigBird model: google/bigbird-unknown",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectPreferredDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createPipelineResult(
      "google/bigbird-roberta-base",
      { cpu: true, cuda: false, mps: false },
      { transformers: false, tokenizers: true },
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing tokenizers separately from core transformers", () => {
    const result = createPipelineResult(
      "google/bigbird-roberta-base",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: false },
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["tokenizers>=0.11.0"],
    });
  });

  it("builds a successful pipeline result with a bounded output preview", () => {
    const longAnswer = `${DEFAULT_TEST_TEXT} ${"attention ".repeat(40)}`;
    const result = createPipelineResult(
      "google/bigbird-base-trivia-itc",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: true },
      { answer: longAnswer, score: 0.94 },
    );

    expect(result).toMatchObject({
      model: "google/bigbird-base-trivia-itc",
      device: "cpu",
      task: "question-answering",
      className: "BigBirdForQuestionAnswering",
      pipelineSuccess: true,
      pipelineErrorType: "none",
    });
    expect(result.outputPreview).toHaveLength(203);
    expect(result.outputPreview.endsWith("...")).toBe(true);
  });
});
