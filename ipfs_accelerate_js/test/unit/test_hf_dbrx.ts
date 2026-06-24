type DbrxTask = "text-generation";
type DbrxClassName = "DbrxForCausalLM";
type DbrxDependency = "transformers" | "tokenizers>=0.15.0";
type DbrxDevice = "cpu" | "cuda" | "mps";

interface DbrxModelInfo {
  description: string;
  className: DbrxClassName;
  task: DbrxTask;
}

interface HardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface DbrxPipelineResult {
  model: string;
  device: DbrxDevice;
  task: DbrxTask;
  className: DbrxClassName;
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: DbrxDependency[];
  pipelineMissingDeps?: DbrxDependency[];
  outputPreview?: string;
}

const DEFAULT_DBRX_MODEL_ID = "databricks/dbrx-base";

const DBRX_MODELS_REGISTRY: Record<string, DbrxModelInfo> = {
  "databricks/dbrx-base": {
    description: "DBRX base mixture-of-experts causal language model",
    className: "DbrxForCausalLM",
    task: "text-generation",
  },
  "databricks/dbrx-instruct": {
    description: "DBRX instruction-tuned mixture-of-experts causal language model",
    className: "DbrxForCausalLM",
    task: "text-generation",
  },
};

const DEFAULT_TEST_PROMPT = "Explain why deterministic conversion fixtures are useful for model tests.";

function selectPreferredDevice(capabilities: HardwareCapabilities): DbrxDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadDbrxModelInfo(modelId = DEFAULT_DBRX_MODEL_ID): DbrxModelInfo {
  const modelInfo = DBRX_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown DBRX model: ${modelId}`);
  }

  return modelInfo;
}

function createPipelineResult(
  modelId: string,
  capabilities: HardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "tokenizers", boolean>>,
  output: unknown,
): DbrxPipelineResult {
  const modelInfo = loadDbrxModelInfo(modelId);
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
      pipelineMissingDeps: ["tokenizers>=0.15.0"],
    };
  }

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    outputPreview: previewPipelineOutput(output),
  };
}

function previewPipelineOutput(output: unknown, maxLength = 200): string {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

describe("DBRX model conversion fixture", () => {
  it("defines DBRX registry entries as supported causal language models", () => {
    expect(Object.keys(DBRX_MODELS_REGISTRY)).toEqual(["databricks/dbrx-base", "databricks/dbrx-instruct"]);
    expect(loadDbrxModelInfo()).toEqual({
      description: "DBRX base mixture-of-experts causal language model",
      className: "DbrxForCausalLM",
      task: "text-generation",
    });
    expect(loadDbrxModelInfo("databricks/dbrx-instruct").task).toBe("text-generation");
  });

  it("rejects unknown DBRX model identifiers explicitly", () => {
    expect(() => loadDbrxModelInfo("dbrx-base")).toThrow("Unknown DBRX model: dbrx-base");
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectPreferredDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createPipelineResult(
      DEFAULT_DBRX_MODEL_ID,
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
      DEFAULT_DBRX_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: false },
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["tokenizers>=0.15.0"],
    });
  });

  it("builds a successful pipeline result with a bounded output preview", () => {
    const result = createPipelineResult(
      "databricks/dbrx-instruct",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: true },
      [{ generated_text: `${DEFAULT_TEST_PROMPT} ${DEFAULT_TEST_PROMPT} ${DEFAULT_TEST_PROMPT}` }],
    );

    expect(result).toMatchObject({
      model: "databricks/dbrx-instruct",
      device: "cpu",
      task: "text-generation",
      className: "DbrxForCausalLM",
      pipelineSuccess: true,
      pipelineErrorType: "none",
    });
    expect(result.outputPreview).toHaveLength(203);
    expect(result.outputPreview?.endsWith("...")).toBe(true);
  });
});
