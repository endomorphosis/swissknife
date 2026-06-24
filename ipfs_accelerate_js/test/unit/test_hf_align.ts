const DEFAULT_ALIGN_MODEL_ID = "MIT/ast-finetuned-audioset-10-10-0.4593";
const ALIGN_SAMPLE_RATE = 16_000;

const ALIGN_MODELS_REGISTRY = {
  [DEFAULT_ALIGN_MODEL_ID]: {
    description: "Audio Spectrogram Transformer model finetuned on AudioSet",
    className: "ASTForAudioClassification",
    task: "audio-classification",
    sampleRate: ALIGN_SAMPLE_RATE,
    requiredDependencies: ["transformers", "librosa>=0.8.0", "soundfile>=0.10.0"],
  },
  "facebook/ast-audioset": {
    description: "Audio Spectrogram Transformer pretrained on AudioSet",
    className: "ASTForAudioClassification",
    task: "audio-classification",
    sampleRate: ALIGN_SAMPLE_RATE,
    requiredDependencies: ["transformers", "librosa>=0.8.0", "soundfile>=0.10.0"],
  },
  "sensetime/ast-finetuned-speech-commands-v2": {
    description: "Audio Spectrogram Transformer finetuned on Speech Commands V2",
    className: "ASTForAudioClassification",
    task: "audio-classification",
    sampleRate: ALIGN_SAMPLE_RATE,
    requiredDependencies: ["transformers", "librosa>=0.8.0", "soundfile>=0.10.0"],
  },
};

function choosePreferredDevice(capabilities) {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function createSilentAudio(sampleRate = ALIGN_SAMPLE_RATE) {
  return new Float32Array(sampleRate);
}

function createAlignTestConfig(
  modelId = DEFAULT_ALIGN_MODEL_ID,
  capabilities = {
    cpu: true,
    cuda: false,
    mps: false,
    openvino: false,
  },
) {
  const resolvedModelId = modelId in ALIGN_MODELS_REGISTRY ? modelId : DEFAULT_ALIGN_MODEL_ID;

  return {
    modelId: resolvedModelId,
    modelInfo: ALIGN_MODELS_REGISTRY[resolvedModelId],
    preferredDevice: choosePreferredDevice(capabilities),
    pipelineInput: createSilentAudio(ALIGN_MODELS_REGISTRY[resolvedModelId].sampleRate),
  };
}

function getMissingDependencies(modelInfo, availableDependencies) {
  return modelInfo.requiredDependencies.filter((dependency) => {
    const packageName = dependency.split(">=")[0];

    return !availableDependencies[packageName];
  });
}

describe("test_hf_align conversion fixture", () => {
  it("keeps the converted ALIGN-family registry parseable", () => {
    expect(Object.keys(ALIGN_MODELS_REGISTRY)).toEqual([
      "MIT/ast-finetuned-audioset-10-10-0.4593",
      "facebook/ast-audioset",
      "sensetime/ast-finetuned-speech-commands-v2",
    ]);

    expect(ALIGN_MODELS_REGISTRY[DEFAULT_ALIGN_MODEL_ID]).toMatchObject({
      className: "ASTForAudioClassification",
      task: "audio-classification",
      sampleRate: 16_000,
    });
  });

  it("falls back to the default model when an unknown model id is requested", () => {
    const config = createAlignTestConfig("unknown/align-model");

    expect(config.modelId).toBe(DEFAULT_ALIGN_MODEL_ID);
    expect(config.modelInfo.description).toContain("Audio Spectrogram Transformer");
  });

  it("selects accelerator devices before CPU", () => {
    expect(
      createAlignTestConfig(DEFAULT_ALIGN_MODEL_ID, {
        cpu: true,
        cuda: true,
        mps: true,
        openvino: false,
      }).preferredDevice,
    ).toBe("cuda");

    expect(
      createAlignTestConfig(DEFAULT_ALIGN_MODEL_ID, {
        cpu: true,
        cuda: false,
        mps: true,
        openvino: false,
      }).preferredDevice,
    ).toBe("mps");

    expect(createAlignTestConfig().preferredDevice).toBe("cpu");
  });

  it("creates deterministic silent audio input for pipeline tests", () => {
    const config = createAlignTestConfig("facebook/ast-audioset");

    expect(config.pipelineInput).toBeInstanceOf(Float32Array);
    expect(config.pipelineInput).toHaveLength(ALIGN_SAMPLE_RATE);
    expect(Array.from(config.pipelineInput.slice(0, 4))).toEqual([0, 0, 0, 0]);
  });

  it("reports missing transformer and audio dependencies explicitly", () => {
    const missingDependencies = getMissingDependencies(ALIGN_MODELS_REGISTRY[DEFAULT_ALIGN_MODEL_ID], {
      transformers: true,
      librosa: false,
      soundfile: false,
    });

    expect(missingDependencies).toEqual(["librosa>=0.8.0", "soundfile>=0.10.0"]);
  });
});
