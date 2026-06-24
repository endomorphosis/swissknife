const DEFAULT_DEEPSEEK_DISTIL_MODEL_ID = "deepseek-ai/deepseek-llm-1.3b-base";
const DEFAULT_DEEPSEEK_DISTIL_PROMPT =
  "Compare the efficiency gains from DeepSeek Distil compared to the original model.";

const DEEPSEEK_DISTIL_MODEL_INFO = {
  description: "DeepSeek-Distil causal language model conversion fixture",
  className: "DeepseekForCausalLM",
  task: "text-generation",
  primaryModel: DEFAULT_DEEPSEEK_DISTIL_MODEL_ID,
  alternativeModels: [
    "deepseek-ai/deepseek-coder-1.3b-base",
    "deepseek-ai/deepseek-llm-7b-base",
    "deepseek-ai/deepseek-coder-6.7b-base",
    "deepseek-ai/deepseek-math-7b-instruct",
  ],
};

const DEEPSEEK_DISTIL_TINY_CONFIG = {
  architectures: ["DeepseekForCausalLM"],
  bosTokenId: 1,
  eosTokenId: 2,
  hiddenAct: "silu",
  hiddenSize: 512,
  intermediateSize: 1024,
  maxPositionEmbeddings: 512,
  modelType: "deepseek",
  numAttentionHeads: 8,
  numHiddenLayers: 2,
  numKeyValueHeads: 8,
  padTokenId: 0,
  rmsNormEps: 1e-5,
  tieWordEmbeddings: false,
  torchDtype: "float32",
  vocabSize: 32000,
};

function selectDeepSeekDistilDevice(capabilities) {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.openvino) {
    return "openvino";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadDeepSeekDistilModelInfo(modelId = DEFAULT_DEEPSEEK_DISTIL_MODEL_ID) {
  if (modelId === DEEPSEEK_DISTIL_MODEL_INFO.primaryModel) {
    return DEEPSEEK_DISTIL_MODEL_INFO;
  }

  if (DEEPSEEK_DISTIL_MODEL_INFO.alternativeModels.includes(modelId)) {
    return DEEPSEEK_DISTIL_MODEL_INFO;
  }

  throw new Error(`Unknown DeepSeek-Distil model: ${modelId}`);
}

function normalizeDeepSeekDistilPrompt(prompt = DEFAULT_DEEPSEEK_DISTIL_PROMPT) {
  const normalizedPrompt = prompt.trim();

  if (!normalizedPrompt) {
    throw new Error("DeepSeek-Distil prompt must not be blank");
  }

  return normalizedPrompt;
}

function previewDeepSeekDistilText(output, maxLength = 200) {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

function createDeepSeekDistilPipelineResult(modelId, capabilities, dependencies, output) {
  const modelInfo = loadDeepSeekDistilModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectDeepSeekDistilDevice(capabilities),
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

  const missingDeps = [];

  if (!dependencies.tokenizers) {
    missingDeps.push("tokenizers>=0.11.0");
  }

  if (!dependencies.accelerate) {
    missingDeps.push("accelerate>=0.12.0");
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
    outputPreview: previewDeepSeekDistilText(output),
  };
}

function createDeepSeekDistilLocalConfig(overrides = {}) {
  return {
    ...DEEPSEEK_DISTIL_TINY_CONFIG,
    ...overrides,
  };
}

class DeepSeekDistilMockCudaHandler {
  constructor() {
    this.implementationType = "MOCK";
    this.device = "cuda:0 (mock)";
  }

  generate(prompt, options = {}) {
    const normalizedPrompt = normalizeDeepSeekDistilPrompt(prompt);

    return {
      generatedText: `${normalizedPrompt} DeepSeek Distil provides faster inference with lower memory use.`,
      implementationType: this.implementationType,
      device: this.device,
      generationOptions: {
        maxNewTokens: options.maxNewTokens ?? 50,
        temperature: options.temperature ?? 0.7,
        topP: options.topP ?? 0.95,
        topK: options.topK ?? 50,
      },
    };
  }
}

describe("DeepSeek-Distil model conversion fixture", () => {
  it("keeps the DeepSeek-Distil model metadata from the Python source", () => {
    expect(loadDeepSeekDistilModelInfo()).toEqual(DEEPSEEK_DISTIL_MODEL_INFO);
    expect(DEEPSEEK_DISTIL_MODEL_INFO).toMatchObject({
      className: "DeepseekForCausalLM",
      task: "text-generation",
      primaryModel: "deepseek-ai/deepseek-llm-1.3b-base",
    });
    expect(DEEPSEEK_DISTIL_MODEL_INFO.alternativeModels).toEqual([
      "deepseek-ai/deepseek-coder-1.3b-base",
      "deepseek-ai/deepseek-llm-7b-base",
      "deepseek-ai/deepseek-coder-6.7b-base",
      "deepseek-ai/deepseek-math-7b-instruct",
    ]);
  });

  it("accepts known alternative model identifiers and rejects unknown models", () => {
    expect(loadDeepSeekDistilModelInfo("deepseek-ai/deepseek-coder-6.7b-base")).toBe(
      DEEPSEEK_DISTIL_MODEL_INFO,
    );
    expect(() => loadDeepSeekDistilModelInfo("deepseek-ai/not-distilled")).toThrow(
      "Unknown DeepSeek-Distil model: deepseek-ai/not-distilled",
    );
  });

  it("selects CUDA before OpenVINO, MPS, and CPU", () => {
    expect(selectDeepSeekDistilDevice({ cpu: true, cuda: true, openvino: true, mps: true })).toBe("cuda");
    expect(selectDeepSeekDistilDevice({ cpu: true, cuda: false, openvino: true, mps: true })).toBe(
      "openvino",
    );
    expect(selectDeepSeekDistilDevice({ cpu: true, cuda: false, openvino: false, mps: true })).toBe("mps");
    expect(selectDeepSeekDistilDevice({ cpu: true, cuda: false, openvino: false, mps: false })).toBe("cpu");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createDeepSeekDistilPipelineResult(
      DEFAULT_DEEPSEEK_DISTIL_MODEL_ID,
      { cpu: true, cuda: false, openvino: false, mps: false },
      { transformers: false, tokenizers: true, accelerate: true },
      "",
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing text-generation support dependencies separately", () => {
    const result = createDeepSeekDistilPipelineResult(
      DEFAULT_DEEPSEEK_DISTIL_MODEL_ID,
      { cpu: true, cuda: false, openvino: false, mps: false },
      { transformers: true, tokenizers: false, accelerate: false },
      "",
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["tokenizers>=0.11.0", "accelerate>=0.12.0"],
    });
  });

  it("builds a successful text-generation result when dependencies are available", () => {
    const result = createDeepSeekDistilPipelineResult(
      DEFAULT_DEEPSEEK_DISTIL_MODEL_ID,
      { cpu: true, cuda: false, openvino: false, mps: false },
      { transformers: true, tokenizers: true, accelerate: true },
      "x".repeat(240),
    );

    expect(result).toMatchObject({
      model: DEFAULT_DEEPSEEK_DISTIL_MODEL_ID,
      device: "cpu",
      task: "text-generation",
      className: "DeepseekForCausalLM",
      pipelineSuccess: true,
      pipelineErrorType: "none",
    });
    expect(result.outputPreview).toHaveLength(203);
    expect(result.outputPreview.endsWith("...")).toBe(true);
  });

  it("creates a tiny local DeepSeek config for fallback tests", () => {
    expect(createDeepSeekDistilLocalConfig()).toMatchObject({
      architectures: ["DeepseekForCausalLM"],
      hiddenSize: 512,
      numHiddenLayers: 2,
      modelType: "deepseek",
      vocabSize: 32000,
    });
    expect(createDeepSeekDistilLocalConfig({ hiddenSize: 128, numHiddenLayers: 1 })).toMatchObject({
      hiddenSize: 128,
      numHiddenLayers: 1,
      intermediateSize: 1024,
    });
  });

  it("provides a deterministic mock CUDA text-generation handler", () => {
    const handler = new DeepSeekDistilMockCudaHandler();

    expect(handler.generate("  Explain distillation speedups ", { maxNewTokens: 32, temperature: 0 })).toEqual({
      generatedText:
        "Explain distillation speedups DeepSeek Distil provides faster inference with lower memory use.",
      implementationType: "MOCK",
      device: "cuda:0 (mock)",
      generationOptions: {
        maxNewTokens: 32,
        temperature: 0,
        topP: 0.95,
        topK: 50,
      },
    });
    expect(() => handler.generate("   ")).toThrow("DeepSeek-Distil prompt must not be blank");
  });
});

export {};
