type BloomDevice = "cpu" | "cuda" | "mps";
type BloomDependency = "transformers" | "tokenizers>=0.13.0";

interface BloomModelInfo {
  description: string;
  className: "BloomForCausalLM";
  task: "text-generation";
  contextLength: number;
}

interface BloomHardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface BloomGenerationConfig {
  maxNewTokens: number;
  doSample: boolean;
  temperature: number;
  topP: number;
  topK: number;
  repetitionPenalty: number;
}

interface BloomPipelineResult {
  model: string;
  device: BloomDevice;
  task: "text-generation";
  className: "BloomForCausalLM";
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: BloomDependency[];
  pipelineMissingDeps?: BloomDependency[];
  generationConfig?: BloomGenerationConfig;
  outputPreview?: string;
}

const BLOOM_MODELS_REGISTRY: Record<string, BloomModelInfo> = {
  "bigscience/bloom-560m": {
    description: "BLOOM 560M parameter multilingual causal language model",
    className: "BloomForCausalLM",
    task: "text-generation",
    contextLength: 2048,
  },
  "bigscience/bloom-1b1": {
    description: "BLOOM 1.1B parameter multilingual causal language model",
    className: "BloomForCausalLM",
    task: "text-generation",
    contextLength: 2048,
  },
  "bigscience/bloomz-560m": {
    description: "Instruction-tuned BLOOMZ 560M causal language model",
    className: "BloomForCausalLM",
    task: "text-generation",
    contextLength: 2048,
  },
};

const DEFAULT_BLOOM_PROMPT = "BLOOM is a language model that";
const DEFAULT_BLOOM_GENERATION_CONFIG: BloomGenerationConfig = {
  maxNewTokens: 50,
  doSample: true,
  temperature: 0.7,
  topP: 0.9,
  topK: 50,
  repetitionPenalty: 1.1,
};

function selectBloomDevice(capabilities: BloomHardwareCapabilities): BloomDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadBloomModelInfo(modelId = "bigscience/bloom-560m"): BloomModelInfo {
  const modelInfo = BLOOM_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown BLOOM model: ${modelId}`);
  }

  return modelInfo;
}

function previewBloomOutput(output: unknown, maxLength = 200): string {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

function createBloomPipelineResult(
  modelId: string,
  capabilities: BloomHardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "tokenizers", boolean>>,
  output: unknown,
  generationConfig: BloomGenerationConfig = DEFAULT_BLOOM_GENERATION_CONFIG,
): BloomPipelineResult {
  const modelInfo = loadBloomModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectBloomDevice(capabilities),
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
      pipelineMissingDeps: ["tokenizers>=0.13.0"],
    };
  }

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    generationConfig,
    outputPreview: previewBloomOutput(output),
  };
}

class BloomMockHandler {
  readonly implementationType = "MOCK";

  generate(prompt: string, maxNewTokens = DEFAULT_BLOOM_GENERATION_CONFIG.maxNewTokens): {
    text: string;
    implementationType: "MOCK";
    generatedTokens: number;
  } {
    const generatedTokens = Math.max(0, Math.min(maxNewTokens, DEFAULT_BLOOM_GENERATION_CONFIG.maxNewTokens));

    return {
      text: `${prompt} can generate multilingual continuations for deterministic tests.`,
      implementationType: this.implementationType,
      generatedTokens,
    };
  }
}

describe("BLOOM model conversion fixture", () => {
  it("keeps the BLOOM model registry from the Python source", () => {
    expect(Object.keys(BLOOM_MODELS_REGISTRY)).toEqual([
      "bigscience/bloom-560m",
      "bigscience/bloom-1b1",
      "bigscience/bloomz-560m",
    ]);
    expect(loadBloomModelInfo("bigscience/bloom-560m")).toEqual({
      description: "BLOOM 560M parameter multilingual causal language model",
      className: "BloomForCausalLM",
      task: "text-generation",
      contextLength: 2048,
    });
    expect(loadBloomModelInfo("bigscience/bloomz-560m").description).toContain("Instruction-tuned");
  });

  it("rejects unknown BLOOM model identifiers explicitly", () => {
    expect(() => loadBloomModelInfo("bigscience/bloom")).toThrow("Unknown BLOOM model: bigscience/bloom");
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectBloomDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectBloomDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectBloomDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createBloomPipelineResult(
      "bigscience/bloom-560m",
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
    const result = createBloomPipelineResult(
      "bigscience/bloom-560m",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: false },
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["tokenizers>=0.13.0"],
    });
  });

  it("builds a successful pipeline result with BLOOM generation settings", () => {
    const result = createBloomPipelineResult(
      "bigscience/bloomz-560m",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: true },
      [{ generated_text: `${DEFAULT_BLOOM_PROMPT} ${"continues ".repeat(40)}` }],
    );

    expect(result).toMatchObject({
      model: "bigscience/bloomz-560m",
      device: "cpu",
      task: "text-generation",
      className: "BloomForCausalLM",
      pipelineSuccess: true,
      pipelineErrorType: "none",
      generationConfig: DEFAULT_BLOOM_GENERATION_CONFIG,
    });
    expect(result.outputPreview).toHaveLength(203);
    expect(result.outputPreview?.endsWith("...")).toBe(true);
  });

  it("provides a deterministic mock text-generation handler", () => {
    const handler = new BloomMockHandler();

    expect(handler.generate(DEFAULT_BLOOM_PROMPT, 8)).toEqual({
      text: "BLOOM is a language model that can generate multilingual continuations for deterministic tests.",
      implementationType: "MOCK",
      generatedTokens: 8,
    });
    expect(handler.generate(DEFAULT_BLOOM_PROMPT, 500).generatedTokens).toBe(50);
    expect(handler.generate(DEFAULT_BLOOM_PROMPT, -1).generatedTokens).toBe(0);
  });
});
