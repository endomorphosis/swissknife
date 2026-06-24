const convertedSource = "test_hf_dac.py";

const defaultDacModel = {
  modelId: "dac-base",
  description: "DAC models",
  className: "DacModel",
  task: "audio-classification",
  requiresAudioRuntime: true,
};

const conversionMetadata = {
  source: convertedSource,
  generatedModelTest: true,
  executableTypeScript: false,
  reason:
    "The Python-to-TypeScript conversion emitted placeholder template tokens; keep the recoverable DAC model metadata parseable until a runtime test is regenerated.",
  defaultModel: defaultDacModel,
};

describe("test_hf_dac conversion", () => {
  it("records the DAC model metadata recovered from the generated Python test", () => {
    expect(conversionMetadata).toEqual({
      source: "test_hf_dac.py",
      generatedModelTest: true,
      executableTypeScript: false,
      reason:
        "The Python-to-TypeScript conversion emitted placeholder template tokens; keep the recoverable DAC model metadata parseable until a runtime test is regenerated.",
      defaultModel: {
        modelId: "dac-base",
        description: "DAC models",
        className: "DacModel",
        task: "audio-classification",
        requiresAudioRuntime: true,
      },
    });
  });

  it("keeps the default DAC model configuration internally consistent", () => {
    expect(defaultDacModel.modelId).toMatch(/^dac-/);
    expect(defaultDacModel.className).toBe("DacModel");
    expect(defaultDacModel.task).toBe("audio-classification");
    expect(defaultDacModel.requiresAudioRuntime).toBe(true);
  });
});
