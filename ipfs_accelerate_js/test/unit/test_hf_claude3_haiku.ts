type Claude3HaikuTask = "text-generation";
type Claude3HaikuClassName = "Claude3Model";
type Claude3HaikuDevice = "cpu" | "cuda" | "mps";
type Claude3HaikuDependency = "transformers" | "tokenizers>=0.11.0" | "accelerate>=0.12.0";

interface HardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface Claude3HaikuModelInfo {
  description: string;
  className: Claude3HaikuClassName;
  task: Claude3HaikuTask;
}

interface Claude3HaikuPipelineResult {
  model: string;
  device: Claude3HaikuDevice;
  task: Claude3HaikuTask;
  className: Claude3HaikuClassName;
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: Claude3HaikuDependency[];
  pipelineMissingDeps?: Claude3HaikuDependency[];
  outputPreview?: string;
}

const DEFAULT_CLAUDE3_HAIKU_MODEL_ID = "anthropic/claude-3-haiku-20240307";
const DEFAULT_TEST_TEXT = "Explain the key differences between Claude 3 Haiku and Claude 3 Sonnet";

const CLAUDE3_HAIKU_MODELS_REGISTRY: Record<string, Claude3HaikuModelInfo> = {
  [DEFAULT_CLAUDE3_HAIKU_MODEL_ID]: {
    description: "Claude 3 Haiku model",
    className: "Claude3Model",
    task: "text-generation",
  },
};

function selectPreferredDevice(capabilities: HardwareCapabilities): Claude3HaikuDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadClaude3HaikuModelInfo(modelId = DEFAULT_CLAUDE3_HAIKU_MODEL_ID): Claude3HaikuModelInfo {
  const modelInfo = CLAUDE3_HAIKU_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown Claude 3 Haiku model: ${modelId}`);
  }

  return modelInfo;
}

function previewPipelineOutput(output: unknown, maxLength = 200): string {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

function createPipelineResult(
  modelId: string,
  capabilities: HardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "tokenizers" | "accelerate", boolean>>,
  output: unknown,
): Claude3HaikuPipelineResult {
  const modelInfo = loadClaude3HaikuModelInfo(modelId);
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

  const missingDeps: Claude3HaikuDependency[] = [];

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
    outputPreview: previewPipelineOutput(output),
  };
}

describe("Claude 3 Haiku model conversion fixture", () => {
  it("keeps the Claude 3 Haiku model registry from the Python source", () => {
    expect(Object.keys(CLAUDE3_HAIKU_MODELS_REGISTRY)).toEqual([DEFAULT_CLAUDE3_HAIKU_MODEL_ID]);
    expect(loadClaude3HaikuModelInfo()).toEqual({
      description: "Claude 3 Haiku model",
      className: "Claude3Model",
      task: "text-generation",
    });
  });

  it("rejects unknown Claude 3 Haiku model identifiers explicitly", () => {
    expect(() => loadClaude3HaikuModelInfo("anthropic/claude-3-sonnet-20240229")).toThrow(
      "Unknown Claude 3 Haiku model: anthropic/claude-3-sonnet-20240229",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectPreferredDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("keeps the source prompt as a lightweight text-generation input", () => {
    expect(DEFAULT_TEST_TEXT).toBe("Explain the key differences between Claude 3 Haiku and Claude 3 Sonnet");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createPipelineResult(
      DEFAULT_CLAUDE3_HAIKU_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: false, tokenizers: true, accelerate: true },
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing tokenizer and accelerator dependencies separately", () => {
    const result = createPipelineResult(
      DEFAULT_CLAUDE3_HAIKU_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: false, accelerate: false },
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["tokenizers>=0.11.0", "accelerate>=0.12.0"],
    });
  });

  it("builds a successful pipeline result with a bounded output preview", () => {
    const result = createPipelineResult(
      DEFAULT_CLAUDE3_HAIKU_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: true, accelerate: true },
      [{ generated_text: `${DEFAULT_TEST_TEXT} ${DEFAULT_TEST_TEXT} ${DEFAULT_TEST_TEXT}` }],
    );

    expect(result).toMatchObject({
      model: DEFAULT_CLAUDE3_HAIKU_MODEL_ID,
      device: "cpu",
      task: "text-generation",
      className: "Claude3Model",
      pipelineSuccess: true,
      pipelineErrorType: "none",
    });
    expect(result.outputPreview).toBeDefined();
    expect(result.outputPreview!.length).toBeLessThanOrEqual(203);
  });
});
