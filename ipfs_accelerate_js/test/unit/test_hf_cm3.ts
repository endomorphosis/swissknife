type Cm3Device = "cpu" | "cuda" | "mps";
type Cm3Dependency = "transformers" | "pillow>=8.0.0" | "requests>=2.25.0" | "accelerate>=0.12.0";

interface Cm3ModelInfo {
  description: string;
  className: "Cm3LeonForConditionalGeneration";
  task: "text-to-image";
}

interface Cm3HardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface Cm3PipelineResult {
  model: string;
  device: Cm3Device;
  task: "text-to-image";
  className: "Cm3LeonForConditionalGeneration";
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: Cm3Dependency[];
  pipelineMissingDeps?: Cm3Dependency[];
  inputPreview?: string;
  outputPreview?: string;
}

const DEFAULT_CM3_MODEL_ID = "facebook/cm3leon-7b";
const DEFAULT_CM3_TEXT = "A cat wearing sunglasses and a leather jacket";

const CM3_MODELS_REGISTRY: Record<string, Cm3ModelInfo> = {
  [DEFAULT_CM3_MODEL_ID]: {
    description: "CM3Leon 7B model",
    className: "Cm3LeonForConditionalGeneration",
    task: "text-to-image",
  },
};

function selectCm3Device(capabilities: Cm3HardwareCapabilities): Cm3Device {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadCm3ModelInfo(modelId = DEFAULT_CM3_MODEL_ID): Cm3ModelInfo {
  const modelInfo = CM3_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown CM3 model: ${modelId}`);
  }

  return modelInfo;
}

function normalizeCm3Prompt(prompt = DEFAULT_CM3_TEXT): string {
  const normalized = prompt.trim();

  if (!normalized) {
    throw new Error("CM3 prompt must not be empty");
  }

  return normalized;
}

function previewValue(value: unknown, maxLength = 200): string {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

function createCm3PipelineResult(
  modelId: string,
  capabilities: Cm3HardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "image" | "accelerate", boolean>>,
  prompt: string,
  output: unknown,
): Cm3PipelineResult {
  const modelInfo = loadCm3ModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectCm3Device(capabilities),
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

  if (!dependencies.image) {
    return {
      ...baseResult,
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["pillow>=8.0.0", "requests>=2.25.0"],
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

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    inputPreview: previewValue(normalizeCm3Prompt(prompt)),
    outputPreview: previewValue(output),
  };
}

describe("CM3 model conversion fixture", () => {
  it("keeps the CM3 model registry from the Python source", () => {
    expect(Object.keys(CM3_MODELS_REGISTRY)).toEqual([DEFAULT_CM3_MODEL_ID]);
    expect(loadCm3ModelInfo()).toEqual({
      description: "CM3Leon 7B model",
      className: "Cm3LeonForConditionalGeneration",
      task: "text-to-image",
    });
  });

  it("rejects unknown CM3 model identifiers explicitly", () => {
    expect(() => loadCm3ModelInfo("facebook/cm3leon-unknown")).toThrow(
      "Unknown CM3 model: facebook/cm3leon-unknown",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectCm3Device({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectCm3Device({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectCm3Device({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("normalizes text prompts and rejects blank input", () => {
    expect(normalizeCm3Prompt(`  ${DEFAULT_CM3_TEXT}  `)).toBe(DEFAULT_CM3_TEXT);
    expect(() => normalizeCm3Prompt("   ")).toThrow("CM3 prompt must not be empty");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createCm3PipelineResult(
      DEFAULT_CM3_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: false, image: true, accelerate: true },
      DEFAULT_CM3_TEXT,
      {},
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing image dependencies separately", () => {
    const result = createCm3PipelineResult(
      DEFAULT_CM3_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, image: false, accelerate: true },
      DEFAULT_CM3_TEXT,
      {},
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["pillow>=8.0.0", "requests>=2.25.0"],
    });
  });

  it("reports missing accelerate separately from image loading support", () => {
    const result = createCm3PipelineResult(
      DEFAULT_CM3_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, image: true, accelerate: false },
      DEFAULT_CM3_TEXT,
      {},
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["accelerate>=0.12.0"],
    });
  });

  it("creates a successful pipeline summary with bounded previews", () => {
    const result = createCm3PipelineResult(
      DEFAULT_CM3_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, image: true, accelerate: true },
      `  ${DEFAULT_CM3_TEXT}  `,
      { image: "x".repeat(250), format: "png" },
    );

    expect(result).toMatchObject({
      model: DEFAULT_CM3_MODEL_ID,
      device: "cpu",
      task: "text-to-image",
      className: "Cm3LeonForConditionalGeneration",
      pipelineSuccess: true,
      pipelineErrorType: "none",
      inputPreview: DEFAULT_CM3_TEXT,
    });
    expect(result.outputPreview).toHaveLength(203);
    expect(result.outputPreview?.endsWith("...")).toBe(true);
  });
});

export {};
