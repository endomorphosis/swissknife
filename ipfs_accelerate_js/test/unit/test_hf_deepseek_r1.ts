const DEFAULT_DEEPSEEK_R1_MODEL_ID = "deepseek-ai/deepseek-llm-1.3b-base";
const DEFAULT_DEEPSEEK_R1_PROMPT = "DeepSeek-R1 can reason through";

const DEEPSEEK_R1_MODEL_INFO = {
  description: "DeepSeek-R1 causal language model conversion fixture",
  className: "DeepseekForCausalLM",
  task: "text-generation",
  primaryModel: DEFAULT_DEEPSEEK_R1_MODEL_ID,
  alternativeModels: [
    "deepseek-ai/deepseek-coder-1.3b-base",
    "deepseek-ai/deepseek-llm-7b-base",
    "deepseek-ai/deepseek-llm-7b-chat",
    "deepseek-ai/deepseek-math-7b-instruct",
    "deepseek-ai/deepseek-vl-7b-chat",
    "deepseek-ai/deepseek-llm-7b",
    "deepseek-ai/deepseek-coder-6.7b-base",
    "deepseek-ai/deepseek-coder-6.7b-instruct",
  ],
};

function selectDeepSeekR1Device(capabilities) {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadDeepSeekR1ModelInfo(modelId = DEFAULT_DEEPSEEK_R1_MODEL_ID) {
  if (modelId === DEEPSEEK_R1_MODEL_INFO.primaryModel) {
    return DEEPSEEK_R1_MODEL_INFO;
  }

  if (DEEPSEEK_R1_MODEL_INFO.alternativeModels.includes(modelId)) {
    return DEEPSEEK_R1_MODEL_INFO;
  }

  throw new Error(`Unknown DeepSeek-R1 model: ${modelId}`);
}

function normalizePrompt(prompt = DEFAULT_DEEPSEEK_R1_PROMPT) {
  const normalizedPrompt = prompt.trim();

  if (!normalizedPrompt) {
    throw new Error("DeepSeek-R1 prompt must not be blank");
  }

  return normalizedPrompt;
}

function previewGeneratedText(output, maxLength = 200) {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

function createDeepSeekR1PipelineResult(modelId, capabilities, dependencies, output) {
  const modelInfo = loadDeepSeekR1ModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectDeepSeekR1Device(capabilities),
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
    outputPreview: previewGeneratedText(output),
  };
}

class DeepSeekR1MockCudaHandler {
  constructor() {
    this.implementationType = "MOCK";
    this.device = "cuda:0 (mock)";
  }

  generate(prompt, options = {}) {
    const normalizedPrompt = normalizePrompt(prompt);

    return {
      generatedText: `${normalizedPrompt} with a deterministic mock response.`,
      implementationType: this.implementationType,
      device: this.device,
      generationOptions: {
        maxNewTokens: options.maxNewTokens ?? 50,
        temperature: options.temperature ?? 0.7,
        topP: options.topP ?? 0.95,
      },
    };
  }
}

describe("DeepSeek-R1 model conversion fixture", () => {
  it("keeps the DeepSeek-R1 model metadata from the Python source", () => {
    expect(loadDeepSeekR1ModelInfo()).toEqual(DEEPSEEK_R1_MODEL_INFO);
    expect(DEEPSEEK_R1_MODEL_INFO).toMatchObject({
      className: "DeepseekForCausalLM",
      task: "text-generation",
      primaryModel: "deepseek-ai/deepseek-llm-1.3b-base",
    });
    expect(DEEPSEEK_R1_MODEL_INFO.alternativeModels).toContain("deepseek-ai/deepseek-coder-6.7b-instruct");
  });

  it("accepts known alternative model identifiers and rejects unknown models", () => {
    expect(loadDeepSeekR1ModelInfo("deepseek-ai/deepseek-llm-7b-chat")).toBe(DEEPSEEK_R1_MODEL_INFO);
    expect(() => loadDeepSeekR1ModelInfo("deepseek-ai/not-r1")).toThrow(
      "Unknown DeepSeek-R1 model: deepseek-ai/not-r1",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectDeepSeekR1Device({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectDeepSeekR1Device({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectDeepSeekR1Device({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createDeepSeekR1PipelineResult(
      DEFAULT_DEEPSEEK_R1_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
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
    const result = createDeepSeekR1PipelineResult(
      DEFAULT_DEEPSEEK_R1_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
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
    const result = createDeepSeekR1PipelineResult(
      DEFAULT_DEEPSEEK_R1_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: true, accelerate: true },
      "x".repeat(240),
    );

    expect(result).toMatchObject({
      model: DEFAULT_DEEPSEEK_R1_MODEL_ID,
      device: "cpu",
      task: "text-generation",
      className: "DeepseekForCausalLM",
      pipelineSuccess: true,
      pipelineErrorType: "none",
    });
    expect(result.outputPreview).toHaveLength(203);
    expect(result.outputPreview.endsWith("...")).toBe(true);
  });

  it("provides a deterministic mock CUDA text-generation handler", () => {
    const handler = new DeepSeekR1MockCudaHandler();

    expect(handler.generate("  Explain cache locality ", { maxNewTokens: 32, temperature: 0 })).toEqual({
      generatedText: "Explain cache locality with a deterministic mock response.",
      implementationType: "MOCK",
      device: "cuda:0 (mock)",
      generationOptions: {
        maxNewTokens: 32,
        temperature: 0,
        topP: 0.95,
      },
    });
    expect(() => handler.generate("   ")).toThrow("DeepSeek-R1 prompt must not be blank");
  });
});
