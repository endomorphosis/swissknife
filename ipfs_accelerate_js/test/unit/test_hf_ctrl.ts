type CtrlTask = "audio-classification";
type CtrlClassName = "CtrlModel";
type CtrlDevice = "cpu" | "cuda" | "mps";
type CtrlDependency = "transformers" | "librosa>=0.8.0" | "soundfile>=0.10.0";

interface HardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface CtrlModelInfo {
  description: string;
  className: CtrlClassName;
  task: CtrlTask;
}

interface CtrlPipelineResult {
  model: string;
  device: CtrlDevice;
  task: CtrlTask;
  className: CtrlClassName;
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: CtrlDependency[];
  pipelineMissingDeps?: CtrlDependency[];
}

const DEFAULT_CTRL_MODEL_ID = "ctrl-base";
const DEFAULT_SAMPLE_RATE = 16_000;

const CTRL_MODELS_REGISTRY: Record<string, CtrlModelInfo> = {
  [DEFAULT_CTRL_MODEL_ID]: {
    description: "CTRL models",
    className: "CtrlModel",
    task: "audio-classification",
  },
};

function selectPreferredDevice(capabilities: HardwareCapabilities): CtrlDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadCtrlModelInfo(modelId = DEFAULT_CTRL_MODEL_ID): CtrlModelInfo {
  const modelInfo = CTRL_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown CTRL model: ${modelId}`);
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
): CtrlPipelineResult {
  const modelInfo = loadCtrlModelInfo(modelId);
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

  const missingDeps: CtrlDependency[] = [];

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

describe("CTRL model conversion fixture", () => {
  it("keeps the CTRL registry metadata from the Python source", () => {
    expect(Object.keys(CTRL_MODELS_REGISTRY)).toEqual(["ctrl-base"]);
    expect(loadCtrlModelInfo()).toEqual({
      description: "CTRL models",
      className: "CtrlModel",
      task: "audio-classification",
    });
  });

  it("rejects unknown CTRL model identifiers explicitly", () => {
    expect(() => loadCtrlModelInfo("ctrl-unknown")).toThrow("Unknown CTRL model: ctrl-unknown");
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
      DEFAULT_CTRL_MODEL_ID,
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
      DEFAULT_CTRL_MODEL_ID,
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
      createPipelineResult(DEFAULT_CTRL_MODEL_ID, { cpu: true, cuda: false, mps: false }, {
        transformers: true,
        librosa: true,
        soundfile: true,
      }),
    ).toMatchObject({
      model: DEFAULT_CTRL_MODEL_ID,
      device: "cpu",
      task: "audio-classification",
      className: "CtrlModel",
      pipelineSuccess: true,
      pipelineErrorType: "none",
    });
  });
});

export {};
