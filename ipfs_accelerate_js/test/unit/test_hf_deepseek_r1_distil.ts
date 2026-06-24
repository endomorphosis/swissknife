const DEFAULT_DEEPSEEK_R1_DISTIL_MODEL_ID = "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B";
const DEFAULT_DEEPSEEK_R1_DISTIL_PROMPT = "Solve this reasoning problem step by step";

const DEEPSEEK_R1_DISTIL_MODEL_INFO = {
  description: "DeepSeek-R1 Distill causal language model conversion fixture",
  className: "DeepseekForCausalLM",
  task: "text-generation",
  primaryModel: DEFAULT_DEEPSEEK_R1_DISTIL_MODEL_ID,
  alternativeModels: [
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B",
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
    "deepseek-ai/DeepSeek-R1-Distill-Llama-8B",
    "deepseek-ai/DeepSeek-R1-Distill-Llama-70B",
  ],
};

function selectDeepSeekR1DistilDevice(capabilities) {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadDeepSeekR1DistilModelInfo(modelId = DEFAULT_DEEPSEEK_R1_DISTIL_MODEL_ID) {
  if (modelId === DEEPSEEK_R1_DISTIL_MODEL_INFO.primaryModel) {
    return DEEPSEEK_R1_DISTIL_MODEL_INFO;
  }

  if (DEEPSEEK_R1_DISTIL_MODEL_INFO.alternativeModels.includes(modelId)) {
    return DEEPSEEK_R1_DISTIL_MODEL_INFO;
  }

  throw new Error(`Unknown DeepSeek-R1 Distill model: ${modelId}`);
}

function normalizeReasoningPrompt(prompt = DEFAULT_DEEPSEEK_R1_DISTIL_PROMPT) {
  const normalizedPrompt = prompt.trim();

  if (!normalizedPrompt) {
    throw new Error("DeepSeek-R1 Distill prompt must not be blank");
  }

  return normalizedPrompt;
}

function previewGeneratedReasoning(output, maxLength = 200) {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

function createDeepSeekR1DistilPipelineResult(modelId, capabilities, dependencies, output) {
  const modelInfo = loadDeepSeekR1DistilModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectDeepSeekR1DistilDevice(capabilities),
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
    outputPreview: previewGeneratedReasoning(output),
  };
}

class DeepSeekR1DistilMockCudaHandler {
  constructor() {
    this.implementationType = "MOCK";
    this.device = "cuda:0 (mock)";
  }

  generate(prompt, options = {}) {
    const normalizedPrompt = normalizeReasoningPrompt(prompt);

    return {
      generatedText: `${normalizedPrompt}\n\nTherefore, the deterministic mock answer follows.`,
      implementationType: this.implementationType,
      device: this.device,
      generationOptions: {
        maxNewTokens: options.maxNewTokens ?? 128,
        temperature: options.temperature ?? 0.6,
        topP: options.topP ?? 0.95,
      },
    };
  }
}

describe("DeepSeek-R1 Distill model conversion fixture", () => {
  it("keeps the DeepSeek-R1 Distill model metadata from the Python source", () => {
    expect(loadDeepSeekR1DistilModelInfo()).toEqual(DEEPSEEK_R1_DISTIL_MODEL_INFO);
    expect(DEEPSEEK_R1_DISTIL_MODEL_INFO).toMatchObject({
      className: "DeepseekForCausalLM",
      task: "text-generation",
      primaryModel: "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B",
    });
    expect(DEEPSEEK_R1_DISTIL_MODEL_INFO.alternativeModels).toContain(
      "deepseek-ai/DeepSeek-R1-Distill-Llama-70B",
    );
  });

  it("accepts known alternative model identifiers and rejects unknown models", () => {
    expect(loadDeepSeekR1DistilModelInfo("deepseek-ai/DeepSeek-R1-Distill-Qwen-32B")).toBe(
      DEEPSEEK_R1_DISTIL_MODEL_INFO,
    );
    expect(() => loadDeepSeekR1DistilModelInfo("deepseek-ai/not-r1-distill")).toThrow(
      "Unknown DeepSeek-R1 Distill model: deepseek-ai/not-r1-distill",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectDeepSeekR1DistilDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectDeepSeekR1DistilDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectDeepSeekR1DistilDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createDeepSeekR1DistilPipelineResult(
      DEFAULT_DEEPSEEK_R1_DISTIL_MODEL_ID,
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
    const result = createDeepSeekR1DistilPipelineResult(
      DEFAULT_DEEPSEEK_R1_DISTIL_MODEL_ID,
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
    const result = createDeepSeekR1DistilPipelineResult(
      DEFAULT_DEEPSEEK_R1_DISTIL_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: true, accelerate: true },
      "x".repeat(240),
    );

    expect(result).toMatchObject({
      model: DEFAULT_DEEPSEEK_R1_DISTIL_MODEL_ID,
      device: "cpu",
      task: "text-generation",
      className: "DeepseekForCausalLM",
      pipelineSuccess: true,
      pipelineErrorType: "none",
    });
    expect(result.outputPreview).toHaveLength(203);
    expect(result.outputPreview.endsWith("...")).toBe(true);
  });

  it("provides a deterministic mock CUDA reasoning handler", () => {
    const handler = new DeepSeekR1DistilMockCudaHandler();

    expect(handler.generate("  Explain why 2 + 2 = 4 ", { maxNewTokens: 32, temperature: 0 })).toEqual({
      generatedText: "Explain why 2 + 2 = 4\n\nTherefore, the deterministic mock answer follows.",
      implementationType: "MOCK",
      device: "cuda:0 (mock)",
      generationOptions: {
        maxNewTokens: 32,
        temperature: 0,
        topP: 0.95,
      },
    });
    expect(() => handler.generate("   ")).toThrow("DeepSeek-R1 Distill prompt must not be blank");
  });
});
