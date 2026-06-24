type CpmantTask = "audio-classification";
type CpmantClassName = "CpmantModel";
type CpmantDevice = "cpu" | "cuda" | "mps";
type CpmantDependency = "transformers" | "librosa>=0.8.0" | "soundfile>=0.10.0";

interface HardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface CpmantModelInfo {
  description: string;
  className: CpmantClassName;
  task: CpmantTask;
}

interface CpmantPipelineResult {
  model: string;
  device: CpmantDevice;
  task: CpmantTask;
  className: CpmantClassName;
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: CpmantDependency[];
  pipelineMissingDeps?: CpmantDependency[];
}

const DEFAULT_CPMANT_MODEL_ID = "cpmant-base";
const DEFAULT_SAMPLE_RATE = 16_000;

const CPMANT_MODELS_REGISTRY: Record<string, CpmantModelInfo> = {
  [DEFAULT_CPMANT_MODEL_ID]: {
    description: "CPMANT models",
    className: "CpmantModel",
    task: "audio-classification",
  },
};

function selectPreferredDevice(capabilities: HardwareCapabilities): CpmantDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadCpmantModelInfo(modelId = DEFAULT_CPMANT_MODEL_ID): CpmantModelInfo {
  const modelInfo = CPMANT_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown CPMANT model: ${modelId}`);
  }

  return modelInfo;
}

function createAudioFixture(sampleRate = DEFAULT_SAMPLE_RATE): { sampleRate: number; samples: number[] } {
  return {
    sampleRate,
    samples: Array.from({ length: sampleRate }, () => 0),
  };
}

function createPipelineResult(
  modelId: string,
  capabilities: HardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "librosa" | "soundfile", boolean>>,
): CpmantPipelineResult {
  const modelInfo = loadCpmantModelInfo(modelId);
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

  const missingDeps: CpmantDependency[] = [];

  if (!dependencies.librosa) {
    missingDeps.push("librosa>=0.8.0");
  }

  if (!dependencies.soundfile) {
    missingDeps.push("soundfile>=0.10.0");
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
  };
}

describe("CPMANT model conversion fixture", () => {
  it("keeps the CPMANT registry metadata from the Python source", () => {
    expect(Object.keys(CPMANT_MODELS_REGISTRY)).toEqual(["cpmant-base"]);
    expect(loadCpmantModelInfo()).toEqual({
      description: "CPMANT models",
      className: "CpmantModel",
      task: "audio-classification",
    });
  });

  it("rejects unknown CPMANT model identifiers explicitly", () => {
    expect(() => loadCpmantModelInfo("cpmant-unknown")).toThrow(
      "Unknown CPMANT model: cpmant-unknown",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectPreferredDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("uses a one-second silent audio fixture when no file input is available", () => {
    expect(createAudioFixture()).toEqual({
      sampleRate: DEFAULT_SAMPLE_RATE,
      samples: expect.arrayContaining([0]),
    });
    expect(createAudioFixture().samples).toHaveLength(DEFAULT_SAMPLE_RATE);
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createPipelineResult(
      DEFAULT_CPMANT_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: false, librosa: true, soundfile: true },
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing audio loading dependencies separately", () => {
    const result = createPipelineResult(
      DEFAULT_CPMANT_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, librosa: false, soundfile: false },
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["librosa>=0.8.0", "soundfile>=0.10.0"],
    });
  });

  it("marks the pipeline result successful when dependencies are available", () => {
    expect(
      createPipelineResult(DEFAULT_CPMANT_MODEL_ID, { cpu: true, cuda: false, mps: false }, {
        transformers: true,
        librosa: true,
        soundfile: true,
      }),
    ).toMatchObject({
      model: DEFAULT_CPMANT_MODEL_ID,
      device: "cpu",
      task: "audio-classification",
      className: "CpmantModel",
      pipelineSuccess: true,
      pipelineErrorType: "none",
    });
  });
});

export {};
