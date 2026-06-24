type ModelType = "text_embedding" | "text_generation" | "vision" | "audio" | "multimodal";

type HardwarePlatform = "cpu" | "cuda" | "rocm" | "mps" | "openvino" | "qnn" | "webnn" | "webgpu";

interface TestConfiguration {
  id: string;
  modelType: ModelType;
  hardwarePlatform: HardwarePlatform;
  batchSize: number;
  expectedInformationGain: number;
}

interface BatchSuggestionOptions {
  ensureDiversity?: boolean;
  hardwareAvailability?: Partial<Record<HardwarePlatform, number>>;
  hardwareConstraints?: Partial<Record<HardwarePlatform, number>>;
  diversityWeight?: number;
}

const MODEL_TYPES: ModelType[] = ["text_embedding", "text_generation", "vision", "audio", "multimodal"];

const HARDWARE_PLATFORMS: HardwarePlatform[] = [
  "cpu",
  "cuda",
  "rocm",
  "mps",
  "openvino",
  "qnn",
  "webnn",
  "webgpu",
];

const BATCH_SIZES = [1, 2, 4, 8, 16, 32, 64];

function createConfiguration(
  modelType: ModelType,
  hardwarePlatform: HardwarePlatform,
  batchSize: number,
): TestConfiguration {
  const modelRank = MODEL_TYPES.indexOf(modelType) + 1;
  const hardwareRank = HARDWARE_PLATFORMS.indexOf(hardwarePlatform) + 1;
  const batchRank = Math.log2(batchSize) + 1;
  const expectedInformationGain = Number((modelRank * 0.3 + hardwareRank * 0.2 + batchRank * 0.1).toFixed(3));

  return {
    id: `${modelType}:${hardwarePlatform}:${batchSize}`,
    modelType,
    hardwarePlatform,
    batchSize,
    expectedInformationGain,
  };
}

function generateTestConfigurations(): TestConfiguration[] {
  return MODEL_TYPES.flatMap((modelType) =>
    HARDWARE_PLATFORMS.flatMap((hardwarePlatform) =>
      BATCH_SIZES.map((batchSize) => createConfiguration(modelType, hardwarePlatform, batchSize)),
    ),
  );
}

function scoreConfiguration(
  config: TestConfiguration,
  hardwareAvailability: BatchSuggestionOptions["hardwareAvailability"] = {},
): number {
  const availability = hardwareAvailability[config.hardwarePlatform] ?? 1;

  return config.expectedInformationGain * availability;
}

function isWithinHardwareConstraints(
  config: TestConfiguration,
  selected: TestConfiguration[],
  hardwareConstraints: BatchSuggestionOptions["hardwareConstraints"] = {},
): boolean {
  const maxForHardware = hardwareConstraints[config.hardwarePlatform];

  if (maxForHardware === undefined) {
    return true;
  }

  const selectedForHardware = selected.filter(
    (selectedConfig) => selectedConfig.hardwarePlatform === config.hardwarePlatform,
  ).length;

  return selectedForHardware < maxForHardware;
}

function diversityScore(config: TestConfiguration, selected: TestConfiguration[]): number {
  if (selected.length === 0) {
    return 1;
  }

  const hasModelType = selected.some((selectedConfig) => selectedConfig.modelType === config.modelType);
  const hasHardware = selected.some((selectedConfig) => selectedConfig.hardwarePlatform === config.hardwarePlatform);
  const hasBatchSize = selected.some((selectedConfig) => selectedConfig.batchSize === config.batchSize);

  return [hasModelType, hasHardware, hasBatchSize].filter((alreadySelected) => !alreadySelected).length / 3;
}

function suggestTestBatch(
  configurations: TestConfiguration[],
  batchSize = 10,
  options: BatchSuggestionOptions = {},
): TestConfiguration[] {
  const ensureDiversity = options.ensureDiversity ?? true;
  const diversityWeight = options.diversityWeight ?? 0.5;
  const hardwareAvailability = options.hardwareAvailability ?? {};
  const hardwareConstraints = options.hardwareConstraints ?? {};

  if (configurations.length <= batchSize) {
    return [...configurations];
  }

  const sortedByScore = [...configurations].sort(
    (left, right) => scoreConfiguration(right, hardwareAvailability) - scoreConfiguration(left, hardwareAvailability),
  );

  if (!ensureDiversity) {
    return sortedByScore.reduce<TestConfiguration[]>((selected, config) => {
      if (selected.length < batchSize && isWithinHardwareConstraints(config, selected, hardwareConstraints)) {
        selected.push(config);
      }

      return selected;
    }, []);
  }

  const selected: TestConfiguration[] = [];
  const remaining = [...sortedByScore];

  while (selected.length < batchSize && remaining.length > 0) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;

    remaining.forEach((config, index) => {
      if (!isWithinHardwareConstraints(config, selected, hardwareConstraints)) {
        return;
      }

      const weightedScore =
        scoreConfiguration(config, hardwareAvailability) * (1 - diversityWeight) +
        diversityScore(config, selected) * diversityWeight;

      if (weightedScore > bestScore) {
        bestScore = weightedScore;
        bestIndex = index;
      }
    });

    if (bestIndex === -1) {
      break;
    }

    const [bestConfig] = remaining.splice(bestIndex, 1);
    selected.push(bestConfig);
  }

  return selected;
}

describe("minimal batch generator", () => {
  it("generates the expected deterministic configuration grid", () => {
    const configurations = generateTestConfigurations();

    expect(configurations).toHaveLength(MODEL_TYPES.length * HARDWARE_PLATFORMS.length * BATCH_SIZES.length);
    expect(configurations[0]).toEqual({
      id: "text_embedding:cpu:1",
      modelType: "text_embedding",
      hardwarePlatform: "cpu",
      batchSize: 1,
      expectedInformationGain: 0.6,
    });
    expect(new Set(configurations.map((config) => config.id)).size).toBe(configurations.length);
  });

  it("selects the highest scoring configurations when diversity is disabled", () => {
    const batch = suggestTestBatch(generateTestConfigurations(), 3, {
      ensureDiversity: false,
    });

    expect(batch.map((config) => config.id)).toEqual([
      "multimodal:webgpu:64",
      "multimodal:webgpu:32",
      "multimodal:webnn:64",
    ]);
  });

  it("applies hardware availability to ranking", () => {
    const batch = suggestTestBatch(generateTestConfigurations(), 1, {
      ensureDiversity: false,
      hardwareAvailability: {
        webgpu: 0,
        webnn: 0,
        qnn: 0,
      },
    });

    expect(batch).toHaveLength(1);
    expect(batch[0].hardwarePlatform).toBe("openvino");
  });

  it("respects per-hardware constraints", () => {
    const batch = suggestTestBatch(generateTestConfigurations(), 5, {
      ensureDiversity: false,
      hardwareConstraints: {
        webgpu: 1,
        qnn: 1,
      },
    });

    expect(batch.filter((config) => config.hardwarePlatform === "webgpu")).toHaveLength(1);
    expect(batch.filter((config) => config.hardwarePlatform === "qnn")).toHaveLength(1);
    expect(batch).toHaveLength(5);
  });

  it("can trade score for diversity across model types and hardware", () => {
    const batch = suggestTestBatch(generateTestConfigurations(), 5, {
      diversityWeight: 0.9,
    });

    expect(new Set(batch.map((config) => config.modelType)).size).toBeGreaterThan(1);
    expect(new Set(batch.map((config) => config.hardwarePlatform)).size).toBeGreaterThan(1);
    expect(batch).toHaveLength(5);
  });
});
