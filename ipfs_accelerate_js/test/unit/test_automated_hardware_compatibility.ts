const DEFAULT_TEST_MODELS = {
  embedding: ["prajjwal1/bert-tiny", "distilbert-base-uncased"],
  text_generation: ["gpt2", "google/t5-efficient-tiny"],
  vision: ["google/vit-base-patch16-224", "facebook/dinov2-small"],
  audio: ["openai/whisper-tiny", "facebook/wav2vec2-base"],
  multimodal: ["openai/clip-vit-base-patch32", "vinvino02/glpn-tiny"],
};

const ALL_PLATFORMS = [
  "cpu",
  "cuda",
  "rocm",
  "mps",
  "openvino",
  "webnn",
  "webgpu",
  "qualcomm",
];

function selectTestPlatforms(availablePlatforms) {
  const acceleratorPlatforms = ALL_PLATFORMS.filter(
    (platform) => platform !== "cpu" && availablePlatforms[platform] === true,
  );

  return ["cpu", ...acceleratorPlatforms];
}

function statusForResult(result) {
  if (result.error) {
    return "error";
  }

  if (!result.success) {
    return "incompatible";
  }

  if (result.actualDevice && result.actualDevice !== result.hardwarePlatform) {
    return "device_mismatch";
  }

  return "compatible";
}

function familyLevelForStatus(status) {
  switch (status) {
    case "compatible":
      return "high";
    case "device_mismatch":
      return "medium";
    case "incompatible":
      return "low";
    case "error":
    case "unknown":
    default:
      return "unknown";
  }
}

function capabilityLevelForScore(score) {
  if (score >= 0.8) {
    return "high";
  }

  if (score >= 0.5) {
    return "medium";
  }

  if (score > 0) {
    return "low";
  }

  return "unknown";
}

class AutomatedHardwareCompatibilityTester {
  constructor(testModels = DEFAULT_TEST_MODELS, testRunner = null) {
    if (!testRunner) {
      throw new Error("A hardware test runner is required for unit tests");
    }

    this.testModels = testModels;
    this.testRunner = testRunner;
  }

  runCompatibilityTests(availablePlatforms) {
    const testPlatforms = selectTestPlatforms(availablePlatforms);
    const compatibilityMatrix = this.createUnknownMatrix(testPlatforms);
    const detailedResults = {};
    const allTests = [];

    for (const [family, models] of Object.entries(this.testModels)) {
      for (const modelName of models) {
        detailedResults[modelName] = {};

        for (const platform of testPlatforms) {
          const result = this.testRunner(modelName, family, platform);
          detailedResults[modelName][platform] = result;
          allTests.push(result);
          compatibilityMatrix[family][platform] = statusForResult(result);
        }
      }
    }

    return {
      availableHardware: testPlatforms,
      compatibilityMatrix,
      modelFamilyCompatibility: this.buildFamilyCompatibility(compatibilityMatrix),
      hardwarePlatformCapabilities: this.buildPlatformCapabilities(testPlatforms, allTests),
      detailedResults,
      allTests,
    };
  }

  createUnknownMatrix(platforms) {
    const matrix = {};

    for (const family of Object.keys(this.testModels)) {
      matrix[family] = {};

      for (const platform of platforms) {
        matrix[family][platform] = "unknown";
      }
    }

    return matrix;
  }

  buildFamilyCompatibility(matrix) {
    const familyCompatibility = {};

    for (const [family, platforms] of Object.entries(matrix)) {
      familyCompatibility[family] = {};

      for (const [platform, status] of Object.entries(platforms)) {
        familyCompatibility[family][platform] = familyLevelForStatus(status);
      }
    }

    return familyCompatibility;
  }

  buildPlatformCapabilities(platforms, allTests) {
    const capabilities = {};

    for (const platform of platforms) {
      const platformResults = allTests.filter((result) => result.hardwarePlatform === platform);
      const successCount = platformResults.filter((result) => result.success).length;
      const totalCount = platformResults.length;
      const compatibilityScore = totalCount === 0 ? 0 : successCount / totalCount;

      capabilities[platform] = {
        compatibilityScore,
        capabilityLevel: capabilityLevelForScore(compatibilityScore),
        successCount,
        totalCount,
      };
    }

    return capabilities;
  }
}

describe("AutomatedHardwareCompatibilityTester", () => {
  const focusedModels = {
    embedding: ["bert-tiny"],
    text_generation: [],
    vision: [],
    audio: [],
    multimodal: [],
  };

  it("always includes CPU as a baseline and skips unavailable accelerators", () => {
    const calls = [];
    const tester = new AutomatedHardwareCompatibilityTester(
      focusedModels,
      (modelName, modelFamily, hardwarePlatform) => {
        calls.push([modelName, modelFamily, hardwarePlatform]);

        return {
          modelName,
          modelFamily,
          hardwarePlatform,
          success: true,
        };
      },
    );

    const results = tester.runCompatibilityTests({
      cpu: false,
      cuda: true,
      webgpu: false,
    });

    expect(results.availableHardware).toEqual(["cpu", "cuda"]);
    expect(calls).toEqual([
      ["bert-tiny", "embedding", "cpu"],
      ["bert-tiny", "embedding", "cuda"],
    ]);
  });

  it("maps detailed test outcomes into family compatibility levels", () => {
    const tester = new AutomatedHardwareCompatibilityTester(
      focusedModels,
      (modelName, modelFamily, hardwarePlatform) => {
        const byPlatform = {
          cpu: { success: true },
          cuda: { success: true, actualDevice: "cpu" },
          rocm: { success: false },
          mps: { success: false, error: "backend unavailable" },
          openvino: { success: true },
          webnn: { success: true },
          webgpu: { success: true },
          qualcomm: { success: true },
        };

        return {
          modelName,
          modelFamily,
          hardwarePlatform,
          ...byPlatform[hardwarePlatform],
        };
      },
    );

    const results = tester.runCompatibilityTests({
      cuda: true,
      rocm: true,
      mps: true,
    });

    expect(results.compatibilityMatrix.embedding).toMatchObject({
      cpu: "compatible",
      cuda: "device_mismatch",
      rocm: "incompatible",
      mps: "error",
    });
    expect(results.modelFamilyCompatibility.embedding).toMatchObject({
      cpu: "high",
      cuda: "medium",
      rocm: "low",
      mps: "unknown",
    });
  });

  it("aggregates platform capability scores from all model test results", () => {
    const models = {
      ...focusedModels,
      embedding: ["bert-tiny", "distilbert"],
    };
    const tester = new AutomatedHardwareCompatibilityTester(
      models,
      (modelName, modelFamily, hardwarePlatform) => ({
        modelName,
        modelFamily,
        hardwarePlatform,
        success: hardwarePlatform === "cpu" || modelName === "bert-tiny",
      }),
    );

    const results = tester.runCompatibilityTests({ cuda: true });

    expect(results.hardwarePlatformCapabilities.cpu).toEqual({
      compatibilityScore: 1,
      capabilityLevel: "high",
      successCount: 2,
      totalCount: 2,
    });
    expect(results.hardwarePlatformCapabilities.cuda).toEqual({
      compatibilityScore: 0.5,
      capabilityLevel: "medium",
      successCount: 1,
      totalCount: 2,
    });
  });
});
