type BigBirdPegasusTask = "fill-mask";
type BigBirdPegasusClassName = "Bigbird_pegasusModel";
type BigBirdPegasusDevice = "cpu" | "cuda" | "mps";
type BigBirdPegasusDependency = "transformers";

interface HardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface BigBirdPegasusModelInfo {
  description: string;
  className: BigBirdPegasusClassName;
  task: BigBirdPegasusTask;
}

interface BigBirdPegasusPipelineResult {
  model: string;
  device: BigBirdPegasusDevice;
  task: BigBirdPegasusTask;
  className: BigBirdPegasusClassName;
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: BigBirdPegasusDependency[];
  pipelineLoadTimeMs?: number;
  outputPreview?: string;
}

const DEFAULT_BIGBIRD_PEGASUS_MODEL_ID = "bigbird_pegasus-base";
const DEFAULT_TEST_TEXT = "The man worked as a [MASK].";

const BIGBIRD_PEGASUS_MODELS_REGISTRY: Record<string, BigBirdPegasusModelInfo> = {
  [DEFAULT_BIGBIRD_PEGASUS_MODEL_ID]: {
    description: "bigbird_pegasus base model",
    className: "Bigbird_pegasusModel",
    task: "fill-mask",
  },
};

function selectPreferredDevice(capabilities: HardwareCapabilities): BigBirdPegasusDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadBigBirdPegasusModelInfo(modelId = DEFAULT_BIGBIRD_PEGASUS_MODEL_ID): BigBirdPegasusModelInfo {
  const modelInfo = BIGBIRD_PEGASUS_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown BigBird-Pegasus model: ${modelId}`);
  }

  return modelInfo;
}

function createPipelineInput(modelId = DEFAULT_BIGBIRD_PEGASUS_MODEL_ID): string {
  loadBigBirdPegasusModelInfo(modelId);

  return DEFAULT_TEST_TEXT;
}

function createPipelineResult(
  modelId: string,
  capabilities: HardwareCapabilities,
  dependencies: Partial<Record<"transformers", boolean>>,
  output: unknown,
  loadTimeMs = 0,
): BigBirdPegasusPipelineResult {
  const modelInfo = loadBigBirdPegasusModelInfo(modelId);
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

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    pipelineLoadTimeMs: loadTimeMs,
    outputPreview: previewPipelineOutput(output),
  };
}

function createRunSummary(
  modelId: string,
  capabilities: HardwareCapabilities,
  dependencies: Partial<Record<"transformers", boolean>>,
): {
  results: { pipeline: BigBirdPegasusPipelineResult };
  hardware: HardwareCapabilities;
  metadata: Pick<BigBirdPegasusPipelineResult, "model" | "task" | "className">;
} {
  const pipeline = createPipelineResult(
    modelId,
    capabilities,
    dependencies,
    [{ token_str: "carpenter", score: 0.42 }],
    12,
  );

  return {
    results: { pipeline },
    hardware: capabilities,
    metadata: {
      model: pipeline.model,
      task: pipeline.task,
      className: pipeline.className,
    },
  };
}

function previewPipelineOutput(output: unknown, maxLength = 200): string {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

describe("BigBird-Pegasus model conversion fixture", () => {
  it("keeps the BigBird-Pegasus model registry from the Python source", () => {
    expect(Object.keys(BIGBIRD_PEGASUS_MODELS_REGISTRY)).toEqual(["bigbird_pegasus-base"]);
    expect(loadBigBirdPegasusModelInfo()).toEqual({
      description: "bigbird_pegasus base model",
      className: "Bigbird_pegasusModel",
      task: "fill-mask",
    });
  });

  it("rejects unknown BigBird-Pegasus model identifiers explicitly", () => {
    expect(() => loadBigBirdPegasusModelInfo("bigbird-pegasus-base")).toThrow(
      "Unknown BigBird-Pegasus model: bigbird-pegasus-base",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectPreferredDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("uses the masked text input expected by the source fixture", () => {
    expect(createPipelineInput()).toBe("The man worked as a [MASK].");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createPipelineResult(
      DEFAULT_BIGBIRD_PEGASUS_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: false },
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("builds a successful pipeline result with a bounded output preview", () => {
    const result = createPipelineResult(
      DEFAULT_BIGBIRD_PEGASUS_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true },
      [{ token_str: `${DEFAULT_TEST_TEXT} ${DEFAULT_TEST_TEXT} ${DEFAULT_TEST_TEXT}` }],
      24,
    );

    expect(result).toMatchObject({
      model: DEFAULT_BIGBIRD_PEGASUS_MODEL_ID,
      device: "cpu",
      task: "fill-mask",
      className: "Bigbird_pegasusModel",
      pipelineSuccess: true,
      pipelineErrorType: "none",
      pipelineLoadTimeMs: 24,
    });
    expect(result.outputPreview).toHaveLength(203);
    expect(result.outputPreview?.endsWith("...")).toBe(true);
  });

  it("returns the run summary shape used by the original command-line fixture", () => {
    expect(
      createRunSummary(
        DEFAULT_BIGBIRD_PEGASUS_MODEL_ID,
        { cpu: true, cuda: false, mps: false },
        { transformers: true },
      ),
    ).toMatchObject({
      results: {
        pipeline: {
          pipelineSuccess: true,
          pipelineErrorType: "none",
        },
      },
      hardware: { cpu: true, cuda: false, mps: false },
      metadata: {
        model: DEFAULT_BIGBIRD_PEGASUS_MODEL_ID,
        task: "fill-mask",
        className: "Bigbird_pegasusModel",
      },
    });
  });
});

export {};
