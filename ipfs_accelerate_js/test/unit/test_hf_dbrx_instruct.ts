type DbrxInstructTask = "text-generation";
type DbrxInstructClassName = "DbrxForCausalLM";
type DbrxInstructDependency = "transformers" | "tokenizers>=0.15.0";
type DbrxInstructDevice = "cpu" | "cuda" | "mps";

interface DbrxInstructModelInfo {
  description: string;
  className: DbrxInstructClassName;
  task: DbrxInstructTask;
  instructionTuned: boolean;
}

interface HardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface DbrxInstructPipelineResult {
  model: string;
  device: DbrxInstructDevice;
  task: DbrxInstructTask;
  className: DbrxInstructClassName;
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: DbrxInstructDependency[];
  pipelineMissingDeps?: DbrxInstructDependency[];
  promptPreview?: string;
  outputPreview?: string;
}

const DEFAULT_DBRX_INSTRUCT_MODEL_ID = "databricks/dbrx-instruct";
const DEFAULT_INSTRUCTION_PROMPT = "Write a concise deployment checklist for a TypeScript model test.";

const DBRX_INSTRUCT_MODELS_REGISTRY: Record<string, DbrxInstructModelInfo> = {
  "databricks/dbrx-instruct": {
    description: "DBRX instruction-tuned mixture-of-experts causal language model",
    className: "DbrxForCausalLM",
    task: "text-generation",
    instructionTuned: true,
  },
};

function selectPreferredDevice(capabilities: HardwareCapabilities): DbrxInstructDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadDbrxInstructModelInfo(modelId = DEFAULT_DBRX_INSTRUCT_MODEL_ID): DbrxInstructModelInfo {
  const modelInfo = DBRX_INSTRUCT_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown DBRX Instruct model: ${modelId}`);
  }

  return modelInfo;
}

function createPipelineResult(
  modelId: string,
  capabilities: HardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "tokenizers", boolean>>,
  prompt: string,
  output: unknown,
): DbrxInstructPipelineResult {
  const modelInfo = loadDbrxInstructModelInfo(modelId);
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
    promptPreview: previewText(prompt),
    outputPreview: previewText(output),
  };
}

function previewText(value: unknown, maxLength = 200): string {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

describe("DBRX Instruct model conversion fixture", () => {
  it("defines the DBRX Instruct registry entry as an instruction-tuned causal language model", () => {
    expect(Object.keys(DBRX_INSTRUCT_MODELS_REGISTRY)).toEqual(["databricks/dbrx-instruct"]);
    expect(loadDbrxInstructModelInfo()).toEqual({
      description: "DBRX instruction-tuned mixture-of-experts causal language model",
      className: "DbrxForCausalLM",
      task: "text-generation",
      instructionTuned: true,
    });
  });

  it("rejects non-instruct and unknown model identifiers explicitly", () => {
    expect(() => loadDbrxInstructModelInfo("databricks/dbrx-base")).toThrow(
      "Unknown DBRX Instruct model: databricks/dbrx-base",
    );
    expect(() => loadDbrxInstructModelInfo("dbrx-instruct-base")).toThrow(
      "Unknown DBRX Instruct model: dbrx-instruct-base",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectPreferredDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createPipelineResult(
      DEFAULT_DBRX_INSTRUCT_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: false, tokenizers: true },
      DEFAULT_INSTRUCTION_PROMPT,
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
      DEFAULT_DBRX_INSTRUCT_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: false },
      DEFAULT_INSTRUCTION_PROMPT,
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["tokenizers>=0.15.0"],
    });
  });

  it("builds a successful pipeline result with bounded prompt and output previews", () => {
    const result = createPipelineResult(
      DEFAULT_DBRX_INSTRUCT_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: true },
      `${DEFAULT_INSTRUCTION_PROMPT} ${DEFAULT_INSTRUCTION_PROMPT} ${DEFAULT_INSTRUCTION_PROMPT}`,
      [{ generated_text: `${DEFAULT_INSTRUCTION_PROMPT} ${DEFAULT_INSTRUCTION_PROMPT} ${DEFAULT_INSTRUCTION_PROMPT}` }],
    );

    expect(result).toMatchObject({
      model: "databricks/dbrx-instruct",
      device: "cpu",
      task: "text-generation",
      className: "DbrxForCausalLM",
      pipelineSuccess: true,
      pipelineErrorType: "none",
    });
    expect(result.promptPreview).toHaveLength(203);
    expect(result.promptPreview?.endsWith("...")).toBe(true);
    expect(result.outputPreview).toHaveLength(203);
    expect(result.outputPreview?.endsWith("...")).toBe(true);
  });
});
