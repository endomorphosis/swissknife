type BarkDevice = "cpu" | "cuda" | "mps";
type BarkDependency = "transformers" | "librosa>=0.8.0" | "soundfile>=0.10.0";

interface BarkModelInfo {
  description: string;
  className: "BarkModel";
  task: "text-to-audio";
}

interface BarkHardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface BarkAudioOutput {
  audio: Float32Array;
  samplingRate: 16000 | 24000;
  implementationType: "MOCK";
}

interface BarkPipelineResult {
  model: string;
  device: BarkDevice;
  task: "text-to-audio";
  className: "BarkModel";
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: BarkDependency[];
  pipelineMissingDeps?: BarkDependency[];
  inputPreview?: string;
  outputPreview?: string;
}

const BARK_MODELS_REGISTRY: Record<string, BarkModelInfo> = {
  "suno/bark-small": {
    description: "Bark Small model",
    className: "BarkModel",
    task: "text-to-audio",
  },
};

const DEFAULT_BARK_TEXT = "Hello, my name is Suno. And, I love to sing.";

function selectBarkDevice(capabilities: BarkHardwareCapabilities): BarkDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadBarkModelInfo(modelId = "suno/bark-small"): BarkModelInfo {
  const modelInfo = BARK_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown Bark model: ${modelId}`);
  }

  return modelInfo;
}

function normalizeBarkText(text = DEFAULT_BARK_TEXT): string {
  const normalized = text.trim();

  if (!normalized) {
    throw new Error("Bark text input must not be empty");
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

function createBarkPipelineResult(
  modelId: string,
  capabilities: BarkHardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "audio", boolean>>,
  text: string,
  output: unknown,
): BarkPipelineResult {
  const modelInfo = loadBarkModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectBarkDevice(capabilities),
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

  if (!dependencies.audio) {
    return {
      ...baseResult,
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["librosa>=0.8.0", "soundfile>=0.10.0"],
    };
  }

  const normalizedText = normalizeBarkText(text);

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    inputPreview: previewValue(normalizedText),
    outputPreview: previewValue(output),
  };
}

class BarkMockHandler {
  readonly implementationType = "MOCK";

  synthesize(text = DEFAULT_BARK_TEXT): BarkAudioOutput {
    const normalizedText = normalizeBarkText(text);
    const durationSamples = Math.max(1600, normalizedText.length * 80);
    const audio = new Float32Array(durationSamples);

    audio[0] = Number((normalizedText.length / 100).toFixed(3));

    return {
      audio,
      samplingRate: 24000,
      implementationType: this.implementationType,
    };
  }
}

describe("Bark model conversion fixture", () => {
  it("keeps the Bark model registry from the Python source", () => {
    expect(Object.keys(BARK_MODELS_REGISTRY)).toEqual(["suno/bark-small"]);
    expect(loadBarkModelInfo()).toEqual({
      description: "Bark Small model",
      className: "BarkModel",
      task: "text-to-audio",
    });
  });

  it("rejects unknown Bark model identifiers explicitly", () => {
    expect(() => loadBarkModelInfo("suno/bark")).toThrow("Unknown Bark model: suno/bark");
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectBarkDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectBarkDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectBarkDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createBarkPipelineResult(
      "suno/bark-small",
      { cpu: true, cuda: false, mps: false },
      { transformers: false, audio: true },
      DEFAULT_BARK_TEXT,
      {},
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing audio libraries separately from core transformers", () => {
    const result = createBarkPipelineResult(
      "suno/bark-small",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, audio: false },
      DEFAULT_BARK_TEXT,
      {},
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["librosa>=0.8.0", "soundfile>=0.10.0"],
    });
  });

  it("creates a stable successful pipeline summary", () => {
    const output = new BarkMockHandler().synthesize(DEFAULT_BARK_TEXT);
    const result = createBarkPipelineResult(
      "suno/bark-small",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, audio: true },
      `  ${DEFAULT_BARK_TEXT}  `,
      {
        samplingRate: output.samplingRate,
        samples: output.audio.length,
        implementationType: output.implementationType,
      },
    );

    expect(result).toMatchObject({
      model: "suno/bark-small",
      device: "cpu",
      task: "text-to-audio",
      className: "BarkModel",
      pipelineSuccess: true,
      pipelineErrorType: "none",
      inputPreview: DEFAULT_BARK_TEXT,
    });
    expect(result.outputPreview).toContain("\"samplingRate\":24000");
  });

  it("validates text before mock synthesis", () => {
    const handler = new BarkMockHandler();

    expect(() => handler.synthesize("   ")).toThrow("Bark text input must not be empty");
    expect(handler.synthesize("short phrase")).toMatchObject({
      samplingRate: 24000,
      implementationType: "MOCK",
    });
  });
});
