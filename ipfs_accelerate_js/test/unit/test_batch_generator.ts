const MODEL_TYPES = ["text_embedding", "text_generation", "vision", "audio", "multimodal"];
const HARDWARE_PLATFORMS = [
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

function createTestConfigurations() {
  let id = 0;

  return MODEL_TYPES.flatMap((modelType, modelIndex) =>
    HARDWARE_PLATFORMS.flatMap((hardware, hardwareIndex) =>
      BATCH_SIZES.map((batchSize) => {
        const batchRank = Math.log2(batchSize) + 1;
        const expectedInformationGain = Number(
          ((modelIndex + 1) * 0.3 + (hardwareIndex + 1) * 0.2 + batchRank * 0.1).toFixed(3),
        );

        return {
          id: id++,
          modelType,
          hardware,
          batchSize,
          expectedInformationGain,
        };
      }),
    ),
  );
}

function scoreConfiguration(config, hardwareAvailability = {}) {
  return config.expectedInformationGain * (hardwareAvailability[config.hardware] ?? 1);
}

function isWithinHardwareConstraints(config, selected, hardwareConstraints = {}) {
  const maxForHardware = hardwareConstraints[config.hardware];

  if (maxForHardware === undefined) {
    return true;
  }

  return selected.filter((selectedConfig) => selectedConfig.hardware === config.hardware).length < maxForHardware;
}

function diversityScore(config, selected) {
  if (selected.length === 0) {
    return 1;
  }

  const coveredDimensions = [
    selected.some((selectedConfig) => selectedConfig.modelType === config.modelType),
    selected.some((selectedConfig) => selectedConfig.hardware === config.hardware),
    selected.some((selectedConfig) => selectedConfig.batchSize === config.batchSize),
  ];

  return coveredDimensions.filter((alreadyCovered) => !alreadyCovered).length / coveredDimensions.length;
}

function suggestTestBatch(configurations, options = {}) {
  const batchSize = options.batchSize ?? 10;
  const ensureDiversity = options.ensureDiversity ?? true;
  const diversityWeight = options.diversityWeight ?? 0.5;
  const hardwareAvailability = options.hardwareAvailability ?? {};
  const hardwareConstraints = options.hardwareConstraints ?? {};

  const sortedByScore = [...configurations].sort(
    (left, right) => scoreConfiguration(right, hardwareAvailability) - scoreConfiguration(left, hardwareAvailability),
  );

  if (!ensureDiversity) {
    const selected = sortedByScore.reduce((batch, config) => {
      if (batch.length < batchSize && isWithinHardwareConstraints(config, batch, hardwareConstraints)) {
        batch.push(config);
      }

      return batch;
    }, []);

    return withSelectionOrder(selected);
  }

  const diverseSelection = [];
  const remaining = [...sortedByScore];

  while (diverseSelection.length < batchSize && remaining.length > 0) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;

    remaining.forEach((config, index) => {
      if (!isWithinHardwareConstraints(config, diverseSelection, hardwareConstraints)) {
        return;
      }

      const weightedScore =
        scoreConfiguration(config, hardwareAvailability) * (1 - diversityWeight) +
        diversityScore(config, diverseSelection) * diversityWeight;

      if (weightedScore > bestScore) {
        bestScore = weightedScore;
        bestIndex = index;
      }
    });

    if (bestIndex === -1) {
      break;
    }

    const [bestConfig] = remaining.splice(bestIndex, 1);
    diverseSelection.push(bestConfig);
  }

  return withSelectionOrder(diverseSelection);
}

function withSelectionOrder(configurations) {
  return configurations.map((config, index) => ({
    ...config,
    selectionOrder: index + 1,
  }));
}

describe("batch generator", () => {
  it("creates a deterministic configuration grid for batch generation", () => {
    const configurations = createTestConfigurations();

    expect(configurations).toHaveLength(MODEL_TYPES.length * HARDWARE_PLATFORMS.length * BATCH_SIZES.length);
    expect(configurations[0]).toEqual({
      id: 0,
      modelType: "text_embedding",
      hardware: "cpu",
      batchSize: 1,
      expectedInformationGain: 0.6,
    });
    expect(new Set(configurations.map((config) => config.id)).size).toBe(configurations.length);
  });

  it("returns at most the requested batch size and records selection order", () => {
    const batch = suggestTestBatch(createTestConfigurations(), {
      batchSize: 10,
      ensureDiversity: true,
    });

    expect(batch).toHaveLength(10);
    expect(batch.map((config) => config.selectionOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("selects highest scoring configurations when diversity is disabled", () => {
    const batch = suggestTestBatch(createTestConfigurations(), {
      batchSize: 3,
      ensureDiversity: false,
    });

    expect(batch.map((config) => `${config.modelType}:${config.hardware}:${config.batchSize}`)).toEqual([
      "multimodal:webgpu:64",
      "multimodal:webgpu:32",
      "multimodal:webnn:64",
    ]);
  });

  it("respects hardware constraints", () => {
    const batch = suggestTestBatch(createTestConfigurations(), {
      batchSize: 8,
      ensureDiversity: false,
      hardwareConstraints: {
        webgpu: 1,
        webnn: 2,
      },
    });

    expect(batch.filter((config) => config.hardware === "webgpu")).toHaveLength(1);
    expect(batch.filter((config) => config.hardware === "webnn")).toHaveLength(2);
    expect(batch).toHaveLength(8);
  });

  it("uses hardware availability to change ranking", () => {
    const batch = suggestTestBatch(createTestConfigurations(), {
      batchSize: 1,
      ensureDiversity: false,
      hardwareAvailability: {
        webgpu: 0,
        webnn: 0,
        qnn: 0,
      },
    });

    expect(batch).toHaveLength(1);
    expect(batch[0].hardware).toBe("openvino");
  });

  it("can trade score for diversity across model types and hardware", () => {
    const batch = suggestTestBatch(createTestConfigurations(), {
      batchSize: 6,
      ensureDiversity: true,
      diversityWeight: 0.9,
    });

    expect(new Set(batch.map((config) => config.modelType)).size).toBeGreaterThan(1);
    expect(new Set(batch.map((config) => config.hardware)).size).toBeGreaterThan(1);
    expect(batch).toHaveLength(6);
  });
});
