const DEFAULT_DEEPSEEK_CODER_MODEL_ID = "deepseek-ai/deepseek-coder-1.3b-base";
const DEFAULT_DEEPSEEK_CODER_PROMPT = "function fibonacci(n) {";

const DEEPSEEK_CODER_MODEL_INFO = {
  description: "DeepSeek Coder causal language model conversion fixture",
  className: "DeepseekForCausalLM",
  task: "text-generation",
  primaryModel: DEFAULT_DEEPSEEK_CODER_MODEL_ID,
  alternativeModels: [
    "deepseek-ai/deepseek-coder-1.3b-instruct",
    "deepseek-ai/deepseek-coder-5.7bmqa-base",
    "deepseek-ai/deepseek-coder-6.7b-base",
    "deepseek-ai/deepseek-coder-6.7b-instruct",
    "deepseek-ai/deepseek-coder-33b-base",
    "deepseek-ai/deepseek-coder-33b-instruct",
  ],
};

function selectDeepSeekCoderDevice(capabilities) {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadDeepSeekCoderModelInfo(modelId = DEFAULT_DEEPSEEK_CODER_MODEL_ID) {
  if (modelId === DEEPSEEK_CODER_MODEL_INFO.primaryModel) {
    return DEEPSEEK_CODER_MODEL_INFO;
  }

  if (DEEPSEEK_CODER_MODEL_INFO.alternativeModels.includes(modelId)) {
    return DEEPSEEK_CODER_MODEL_INFO;
  }

  throw new Error(`Unknown DeepSeek Coder model: ${modelId}`);
}

function normalizeCodePrompt(prompt = DEFAULT_DEEPSEEK_CODER_PROMPT) {
  const normalizedPrompt = prompt.trim();

  if (!normalizedPrompt) {
    throw new Error("DeepSeek Coder prompt must not be blank");
  }

  return normalizedPrompt;
}

function previewGeneratedCode(output, maxLength = 200) {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

function createDeepSeekCoderPipelineResult(modelId, capabilities, dependencies, output) {
  const modelInfo = loadDeepSeekCoderModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectDeepSeekCoderDevice(capabilities),
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
    outputPreview: previewGeneratedCode(output),
  };
}

class DeepSeekCoderMockCudaHandler {
  constructor() {
    this.implementationType = "MOCK";
    this.device = "cuda:0 (mock)";
  }

  generate(prompt, options = {}) {
    const normalizedPrompt = normalizeCodePrompt(prompt);
    const language = options.language ?? "typescript";

    return {
      generatedText: `${normalizedPrompt}\n  // deterministic ${language} completion\n}`,
      implementationType: this.implementationType,
      device: this.device,
      generationOptions: {
        language,
        maxNewTokens: options.maxNewTokens ?? 80,
        temperature: options.temperature ?? 0.2,
        topP: options.topP ?? 0.95,
      },
    };
  }
}

describe("DeepSeek Coder model conversion fixture", () => {
  it("keeps the DeepSeek Coder model metadata from the Python source", () => {
    expect(loadDeepSeekCoderModelInfo()).toEqual(DEEPSEEK_CODER_MODEL_INFO);
    expect(DEEPSEEK_CODER_MODEL_INFO).toMatchObject({
      className: "DeepseekForCausalLM",
      task: "text-generation",
      primaryModel: "deepseek-ai/deepseek-coder-1.3b-base",
    });
    expect(DEEPSEEK_CODER_MODEL_INFO.alternativeModels).toContain("deepseek-ai/deepseek-coder-6.7b-instruct");
  });

  it("accepts known alternative model identifiers and rejects unknown models", () => {
    expect(loadDeepSeekCoderModelInfo("deepseek-ai/deepseek-coder-33b-instruct")).toBe(
      DEEPSEEK_CODER_MODEL_INFO,
    );
    expect(() => loadDeepSeekCoderModelInfo("deepseek-ai/not-coder")).toThrow(
      "Unknown DeepSeek Coder model: deepseek-ai/not-coder",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectDeepSeekCoderDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectDeepSeekCoderDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectDeepSeekCoderDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createDeepSeekCoderPipelineResult(
      DEFAULT_DEEPSEEK_CODER_MODEL_ID,
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
    const result = createDeepSeekCoderPipelineResult(
      DEFAULT_DEEPSEEK_CODER_MODEL_ID,
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
    const result = createDeepSeekCoderPipelineResult(
      DEFAULT_DEEPSEEK_CODER_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: true, accelerate: true },
      "x".repeat(240),
    );

    expect(result).toMatchObject({
      model: DEFAULT_DEEPSEEK_CODER_MODEL_ID,
      device: "cpu",
      task: "text-generation",
      className: "DeepseekForCausalLM",
      pipelineSuccess: true,
      pipelineErrorType: "none",
    });
    expect(result.outputPreview).toHaveLength(203);
    expect(result.outputPreview.endsWith("...")).toBe(true);
  });

  it("provides a deterministic mock CUDA code-generation handler", () => {
    const handler = new DeepSeekCoderMockCudaHandler();

    expect(handler.generate("  function add(a, b) { ", { maxNewTokens: 32, temperature: 0 })).toEqual({
      generatedText: "function add(a, b) {\n  // deterministic typescript completion\n}",
      implementationType: "MOCK",
      device: "cuda:0 (mock)",
      generationOptions: {
        language: "typescript",
        maxNewTokens: 32,
        temperature: 0,
        topP: 0.95,
      },
    });
    expect(() => handler.generate("   ")).toThrow("DeepSeek Coder prompt must not be blank");
  });
});
