type Claude3HaikuDevice = "cpu" | "cuda" | "mps";
type Claude3HaikuDependency = "transformers" | "tokenizers>=0.11.0" | "accelerate>=0.12.0";

interface Claude3HaikuModelInfo {
  description: string;
  className: "Claude3Model";
  task: "text-generation";
  contextWindow: number;
}

interface Claude3HaikuHardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface Claude3HaikuGenerationConfig {
  maxNewTokens: number;
  temperature: number;
  topP: number;
}

interface Claude3HaikuPipelineResult {
  model: string;
  device: Claude3HaikuDevice;
  task: "text-generation";
  className: "Claude3Model";
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: Claude3HaikuDependency[];
  pipelineMissingDeps?: Claude3HaikuDependency[];
  inputPreview?: string;
  outputPreview?: string;
  generationConfig?: Claude3HaikuGenerationConfig;
}

const CLAUDE3_HAIKU_MODELS_REGISTRY: Record<string, Claude3HaikuModelInfo> = {
  "anthropic/claude-3-haiku-20240307": {
    description: "Claude 3 Haiku model",
    className: "Claude3Model",
    task: "text-generation",
    contextWindow: 200000,
  },
};

const DEFAULT_CLAUDE3_HAIKU_MODEL = "anthropic/claude-3-haiku-20240307";
const DEFAULT_CLAUDE3_HAIKU_PROMPT = "Explain the key differences between Claude 3 Haiku and Claude 3 Sonnet";
const DEFAULT_CLAUDE3_HAIKU_GENERATION_CONFIG: Claude3HaikuGenerationConfig = {
  maxNewTokens: 128,
  temperature: 0.2,
  topP: 0.9,
};

function selectClaude3HaikuDevice(capabilities: Claude3HaikuHardwareCapabilities): Claude3HaikuDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadClaude3HaikuModelInfo(modelId = DEFAULT_CLAUDE3_HAIKU_MODEL): Claude3HaikuModelInfo {
  const modelInfo = CLAUDE3_HAIKU_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown Claude 3 Haiku model: ${modelId}`);
  }

  return modelInfo;
}

function normalizeClaude3HaikuPrompt(prompt = DEFAULT_CLAUDE3_HAIKU_PROMPT): string {
  const normalized = prompt.trim();

  if (!normalized) {
    throw new Error("Claude 3 Haiku prompt must not be empty");
  }

  return normalized;
}

function previewClaude3HaikuValue(value: unknown, maxLength = 200): string {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

function createClaude3HaikuPipelineResult(
  modelId: string,
  capabilities: Claude3HaikuHardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "tokenizers" | "accelerate", boolean>>,
  prompt: string,
  output: unknown,
  generationConfig: Claude3HaikuGenerationConfig = DEFAULT_CLAUDE3_HAIKU_GENERATION_CONFIG,
): Claude3HaikuPipelineResult {
  const modelInfo = loadClaude3HaikuModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectClaude3HaikuDevice(capabilities),
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

  const normalizedPrompt = normalizeClaude3HaikuPrompt(prompt);

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    inputPreview: previewClaude3HaikuValue(normalizedPrompt),
    outputPreview: previewClaude3HaikuValue(output),
    generationConfig,
  };
}

class Claude3HaikuMockHandler {
  readonly implementationType = "MOCK";

  generate(prompt = DEFAULT_CLAUDE3_HAIKU_PROMPT, maxNewTokens = DEFAULT_CLAUDE3_HAIKU_GENERATION_CONFIG.maxNewTokens): {
    text: string;
    implementationType: "MOCK";
    generatedTokens: number;
  } {
    const normalizedPrompt = normalizeClaude3HaikuPrompt(prompt);
    const generatedTokens = Math.max(0, Math.min(maxNewTokens, DEFAULT_CLAUDE3_HAIKU_GENERATION_CONFIG.maxNewTokens));

    return {
      text: `${normalizedPrompt} Claude 3 Haiku prioritizes lower latency and lower cost for concise responses.`,
      implementationType: this.implementationType,
      generatedTokens,
    };
  }
}

describe("Claude 3 Haiku model conversion fixture", () => {
  it("keeps the Claude 3 Haiku model registry from the Python source", () => {
    expect(Object.keys(CLAUDE3_HAIKU_MODELS_REGISTRY)).toEqual([DEFAULT_CLAUDE3_HAIKU_MODEL]);
    expect(loadClaude3HaikuModelInfo()).toEqual({
      description: "Claude 3 Haiku model",
      className: "Claude3Model",
      task: "text-generation",
      contextWindow: 200000,
    });
  });

  it("rejects unknown Claude 3 Haiku model identifiers explicitly", () => {
    expect(() => loadClaude3HaikuModelInfo("anthropic/claude-3-sonnet-20240229")).toThrow(
      "Unknown Claude 3 Haiku model: anthropic/claude-3-sonnet-20240229",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectClaude3HaikuDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectClaude3HaikuDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectClaude3HaikuDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createClaude3HaikuPipelineResult(
      DEFAULT_CLAUDE3_HAIKU_MODEL,
      { cpu: true, cuda: false, mps: false },
      { transformers: false, tokenizers: true, accelerate: true },
      DEFAULT_CLAUDE3_HAIKU_PROMPT,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing tokenizers separately from core transformers", () => {
    const result = createClaude3HaikuPipelineResult(
      DEFAULT_CLAUDE3_HAIKU_MODEL,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: false, accelerate: true },
      DEFAULT_CLAUDE3_HAIKU_PROMPT,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["tokenizers>=0.11.0"],
    });
  });

  it("reports missing accelerate as a runtime dependency failure", () => {
    const result = createClaude3HaikuPipelineResult(
      DEFAULT_CLAUDE3_HAIKU_MODEL,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: true, accelerate: false },
      DEFAULT_CLAUDE3_HAIKU_PROMPT,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["accelerate>=0.12.0"],
    });
  });

  it("builds a successful pipeline result with generation settings", () => {
    const result = createClaude3HaikuPipelineResult(
      DEFAULT_CLAUDE3_HAIKU_MODEL,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: true, accelerate: true },
      DEFAULT_CLAUDE3_HAIKU_PROMPT,
      [{ generated_text: `${"short answer ".repeat(30)}` }],
    );

    expect(result).toMatchObject({
      model: DEFAULT_CLAUDE3_HAIKU_MODEL,
      device: "cpu",
      task: "text-generation",
      className: "Claude3Model",
      pipelineSuccess: true,
      pipelineErrorType: "none",
      inputPreview: DEFAULT_CLAUDE3_HAIKU_PROMPT,
      generationConfig: DEFAULT_CLAUDE3_HAIKU_GENERATION_CONFIG,
    });
    expect(result.outputPreview).toHaveLength(203);
    expect(result.outputPreview?.endsWith("...")).toBe(true);
  });

  it("provides a deterministic mock text-generation handler", () => {
    const handler = new Claude3HaikuMockHandler();

    expect(handler.generate(DEFAULT_CLAUDE3_HAIKU_PROMPT, 12)).toEqual({
      text:
        "Explain the key differences between Claude 3 Haiku and Claude 3 Sonnet " +
        "Claude 3 Haiku prioritizes lower latency and lower cost for concise responses.",
      implementationType: "MOCK",
      generatedTokens: 12,
    });
    expect(handler.generate(DEFAULT_CLAUDE3_HAIKU_PROMPT, 500).generatedTokens).toBe(128);
    expect(handler.generate(DEFAULT_CLAUDE3_HAIKU_PROMPT, -1).generatedTokens).toBe(0);
    expect(() => handler.generate("   ")).toThrow("Claude 3 Haiku prompt must not be empty");
  });
});
