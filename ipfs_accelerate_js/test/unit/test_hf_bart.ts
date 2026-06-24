type BartTask = "summarization" | "text-classification";
type BartClassName = "BartForConditionalGeneration" | "BartForSequenceClassification";
type BartDependency = "transformers" | "tokenizers>=0.11.0";
type BartDevice = "cpu" | "cuda" | "mps";

interface BartModelInfo {
  description: string;
  className: BartClassName;
  task: BartTask;
}

interface HardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface BartPipelineResult {
  model: string;
  device: BartDevice;
  task: BartTask;
  className: BartClassName;
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: BartDependency[];
  pipelineMissingDeps?: BartDependency[];
  outputPreview?: string;
}

const BART_MODELS_REGISTRY: Record<string, BartModelInfo> = {
  "facebook/bart-large-cnn": {
    description: "BART large model fine-tuned on CNN/Daily Mail",
    className: "BartForConditionalGeneration",
    task: "summarization",
  },
  "facebook/bart-large-xsum": {
    description: "BART large model fine-tuned on XSum",
    className: "BartForConditionalGeneration",
    task: "summarization",
  },
  "facebook/bart-large-mnli": {
    description: "BART large model fine-tuned on MNLI",
    className: "BartForSequenceClassification",
    task: "text-classification",
  },
};

const DEFAULT_TEST_TEXT =
  "The tower is 324 metres tall, about the same height as an 81-storey building. Its base is square, " +
  "measuring 125 metres on each side. During its construction, the Eiffel Tower surpassed the Washington " +
  "Monument to become the tallest human-made structure in the world.";

function selectPreferredDevice(capabilities: HardwareCapabilities): BartDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadBartModelInfo(modelId = "facebook/bart-large-cnn"): BartModelInfo {
  const modelInfo = BART_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown BART model: ${modelId}`);
  }

  return modelInfo;
}

function createPipelineResult(
  modelId: string,
  capabilities: HardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "tokenizers", boolean>>,
  output: unknown,
): BartPipelineResult {
  const modelInfo = loadBartModelInfo(modelId);
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
      pipelineMissingDeps: ["tokenizers>=0.11.0"],
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

describe("BART model conversion fixture", () => {
  it("keeps the BART model registry from the Python source", () => {
    expect(Object.keys(BART_MODELS_REGISTRY)).toEqual([
      "facebook/bart-large-cnn",
      "facebook/bart-large-xsum",
      "facebook/bart-large-mnli",
    ]);
    expect(loadBartModelInfo("facebook/bart-large-cnn")).toEqual({
      description: "BART large model fine-tuned on CNN/Daily Mail",
      className: "BartForConditionalGeneration",
      task: "summarization",
    });
    expect(loadBartModelInfo("facebook/bart-large-mnli").task).toBe("text-classification");
  });

  it("rejects unknown BART model identifiers explicitly", () => {
    expect(() => loadBartModelInfo("facebook/bart-base")).toThrow("Unknown BART model: facebook/bart-base");
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectPreferredDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createPipelineResult(
      "facebook/bart-large-cnn",
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
      "facebook/bart-large-cnn",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: false },
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["tokenizers>=0.11.0"],
    });
  });

  it("builds a successful pipeline result with a bounded output preview", () => {
    const result = createPipelineResult(
      "facebook/bart-large-xsum",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: true },
      [{ summary_text: `${DEFAULT_TEST_TEXT} ${DEFAULT_TEST_TEXT}` }],
    );

    expect(result).toMatchObject({
      model: "facebook/bart-large-xsum",
      device: "cpu",
      task: "summarization",
      className: "BartForConditionalGeneration",
      pipelineSuccess: true,
      pipelineErrorType: "none",
    });
    expect(result.outputPreview).toHaveLength(203);
    expect(result.outputPreview?.endsWith("...")).toBe(true);
  });
});
