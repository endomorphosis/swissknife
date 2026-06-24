type DeepseekDevice = "cpu" | "cuda" | "mps";
type DeepseekDependency = "transformers" | "tokenizers>=0.11.0" | "accelerate>=0.12.0";

interface DeepseekModelInfo {
  description: string;
  className: "DeepSeekForCausalLM";
  task: "text-generation";
  contextLength: number;
}

interface DeepseekHardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface DeepseekGenerationConfig {
  maxNewTokens: number;
  doSample: boolean;
  temperature: number;
  topP: number;
}

interface DeepseekPipelineResult {
  model: string;
  device: DeepseekDevice;
  task: "text-generation";
  className: "DeepSeekForCausalLM";
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: DeepseekDependency[];
  pipelineMissingDeps?: DeepseekDependency[];
  generationConfig?: DeepseekGenerationConfig;
  inputPreview?: string;
  outputPreview?: string;
}

const DEEPSEEK_MODELS_REGISTRY: Record<string, DeepseekModelInfo> = {
  "deepseek-ai/deepseek-llm-7b-base": {
    description: "DeepSeek 7B base model",
    className: "DeepSeekForCausalLM",
    task: "text-generation",
    contextLength: 4096,
  },
};

const DEFAULT_DEEPSEEK_PROMPT = "DeepSeek is a model that can";
const DEFAULT_DEEPSEEK_GENERATION_CONFIG: DeepseekGenerationConfig = {
  maxNewTokens: 50,
  doSample: true,
  temperature: 0.7,
  topP: 0.9,
};

function selectDeepseekDevice(capabilities: DeepseekHardwareCapabilities): DeepseekDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadDeepseekModelInfo(modelId = "deepseek-ai/deepseek-llm-7b-base"): DeepseekModelInfo {
  const modelInfo = DEEPSEEK_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown DeepSeek model: ${modelId}`);
  }

  return modelInfo;
}

function normalizeDeepseekPrompt(prompt = DEFAULT_DEEPSEEK_PROMPT): string {
  const normalized = prompt.trim();

  if (!normalized) {
    throw new Error("DeepSeek prompt must not be empty");
  }

  return normalized;
}

function previewDeepseekValue(value: unknown, maxLength = 200): string {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

function createDeepseekPipelineResult(
  modelId: string,
  capabilities: DeepseekHardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "tokenizers" | "accelerate", boolean>>,
  prompt: string,
  output: unknown,
  generationConfig: DeepseekGenerationConfig = DEFAULT_DEEPSEEK_GENERATION_CONFIG,
): DeepseekPipelineResult {
  const modelInfo = loadDeepseekModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectDeepseekDevice(capabilities),
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

  if (!dependencies.accelerate) {
    return {
      ...baseResult,
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["accelerate>=0.12.0"],
    };
  }

  const normalizedPrompt = normalizeDeepseekPrompt(prompt);

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    generationConfig,
    inputPreview: previewDeepseekValue(normalizedPrompt),
    outputPreview: previewDeepseekValue(output),
  };
}

class DeepseekMockHandler {
  readonly implementationType = "MOCK";

  generate(prompt = DEFAULT_DEEPSEEK_PROMPT, maxNewTokens = DEFAULT_DEEPSEEK_GENERATION_CONFIG.maxNewTokens): {
    generatedText: string;
    implementationType: "MOCK";
    generatedTokens: number;
  } {
    const normalizedPrompt = normalizeDeepseekPrompt(prompt);
    const generatedTokens = Math.max(0, Math.min(maxNewTokens, DEFAULT_DEEPSEEK_GENERATION_CONFIG.maxNewTokens));

    return {
      generatedText: `${normalizedPrompt} produce deterministic text-generation fixtures.`,
      implementationType: this.implementationType,
      generatedTokens,
    };
  }
}

describe("DeepSeek model conversion fixture", () => {
  it("keeps the DeepSeek model registry from the Python source", () => {
    expect(Object.keys(DEEPSEEK_MODELS_REGISTRY)).toEqual(["deepseek-ai/deepseek-llm-7b-base"]);
    expect(loadDeepseekModelInfo()).toEqual({
      description: "DeepSeek 7B base model",
      className: "DeepSeekForCausalLM",
      task: "text-generation",
      contextLength: 4096,
    });
  });

  it("rejects unknown DeepSeek model identifiers explicitly", () => {
    expect(() => loadDeepseekModelInfo("deepseek-ai/deepseek-llm")).toThrow(
      "Unknown DeepSeek model: deepseek-ai/deepseek-llm",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectDeepseekDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectDeepseekDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectDeepseekDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createDeepseekPipelineResult(
      "deepseek-ai/deepseek-llm-7b-base",
      { cpu: true, cuda: false, mps: false },
      { transformers: false, tokenizers: true, accelerate: true },
      DEFAULT_DEEPSEEK_PROMPT,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing tokenizers separately from core transformers", () => {
    const result = createDeepseekPipelineResult(
      "deepseek-ai/deepseek-llm-7b-base",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: false, accelerate: true },
      DEFAULT_DEEPSEEK_PROMPT,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["tokenizers>=0.11.0"],
    });
  });

  it("reports missing accelerate separately from tokenizer support", () => {
    const result = createDeepseekPipelineResult(
      "deepseek-ai/deepseek-llm-7b-base",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: true, accelerate: false },
      DEFAULT_DEEPSEEK_PROMPT,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["accelerate>=0.12.0"],
    });
  });

  it("builds a successful pipeline result with DeepSeek generation settings", () => {
    const result = createDeepseekPipelineResult(
      "deepseek-ai/deepseek-llm-7b-base",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: true, accelerate: true },
      `  ${DEFAULT_DEEPSEEK_PROMPT}  `,
      [{ generated_text: `${DEFAULT_DEEPSEEK_PROMPT} ${"continues ".repeat(40)}` }],
    );

    expect(result).toMatchObject({
      model: "deepseek-ai/deepseek-llm-7b-base",
      device: "cpu",
      task: "text-generation",
      className: "DeepSeekForCausalLM",
      pipelineSuccess: true,
      pipelineErrorType: "none",
      generationConfig: DEFAULT_DEEPSEEK_GENERATION_CONFIG,
      inputPreview: DEFAULT_DEEPSEEK_PROMPT,
    });
    expect(result.outputPreview).toHaveLength(203);
    expect(result.outputPreview?.endsWith("...")).toBe(true);
  });

  it("provides a deterministic mock text-generation handler", () => {
    const handler = new DeepseekMockHandler();

    expect(handler.generate(DEFAULT_DEEPSEEK_PROMPT, 8)).toEqual({
      generatedText: "DeepSeek is a model that can produce deterministic text-generation fixtures.",
      implementationType: "MOCK",
      generatedTokens: 8,
    });
    expect(handler.generate(DEFAULT_DEEPSEEK_PROMPT, 500).generatedTokens).toBe(50);
    expect(handler.generate(DEFAULT_DEEPSEEK_PROMPT, -1).generatedTokens).toBe(0);
    expect(() => handler.generate("   ")).toThrow("DeepSeek prompt must not be empty");
  });
});
