const AUDIO_MODELS = {
  whisper: "openai/whisper-tiny",
  wav2vec2: "facebook/wav2vec2-base-960h",
  clap: "laion/clap-htsat-fused",
};

const FIREFOX_AUDIO_WORKGROUP = { x: 256, y: 1, z: 1 };
const CHROME_AUDIO_WORKGROUP = { x: 128, y: 2, z: 1 };

function createAudioComputeShaderConfig(
  model,
  browser,
  computeShadersEnabled = true,
) {
  return {
    browser,
    model,
    computeShadersEnabled,
    shaderPrecompileEnabled: computeShadersEnabled,
    workgroupSize:
      browser === "firefox" ? FIREFOX_AUDIO_WORKGROUP : CHROME_AUDIO_WORKGROUP,
  };
}

function calculateImprovementPercent(baselineMs, optimizedMs) {
  if (baselineMs <= 0) {
    throw new Error("baselineMs must be greater than zero");
  }

  return ((baselineMs - optimizedMs) / baselineMs) * 100;
}

describe("Firefox WebGPU audio compute shader configuration", () => {
  it("tracks the supported audio model fixtures", () => {
    expect(AUDIO_MODELS).toEqual({
      whisper: "openai/whisper-tiny",
      wav2vec2: "facebook/wav2vec2-base-960h",
      clap: "laion/clap-htsat-fused",
    });
  });

  it("uses Firefox's audio-optimized 256x1x1 workgroup", () => {
    expect(createAudioComputeShaderConfig("whisper", "firefox")).toMatchObject({
      browser: "firefox",
      model: "whisper",
      computeShadersEnabled: true,
      shaderPrecompileEnabled: true,
      workgroupSize: { x: 256, y: 1, z: 1 },
    });
  });

  it("keeps Chrome on the balanced comparison workgroup", () => {
    expect(createAudioComputeShaderConfig("wav2vec2", "chrome")).toMatchObject({
      browser: "chrome",
      model: "wav2vec2",
      workgroupSize: { x: 128, y: 2, z: 1 },
    });
  });

  it("disables shader precompilation when compute shaders are disabled", () => {
    expect(
      createAudioComputeShaderConfig("clap", "firefox", false),
    ).toMatchObject({
      computeShadersEnabled: false,
      shaderPrecompileEnabled: false,
      workgroupSize: { x: 256, y: 1, z: 1 },
    });
  });

  it("calculates benchmark improvement from baseline and optimized timings", () => {
    expect(calculateImprovementPercent(100, 74)).toBeCloseTo(26);
    expect(() => calculateImprovementPercent(0, 74)).toThrow(
      "baselineMs must be greater than zero",
    );
  });
});
