import { describe, expect, it } from "@jest/globals";

type ModelType = "text_embedding" | "text_generation" | "vision" | "audio" | "multimodal";
type HardwarePlatform = "cpu" | "cuda" | "rocm" | "mps" | "openvino" | "qnn" | "webnn" | "webgpu";

interface TestConfiguration {
  modelName: string;
  modelType: ModelType;
  hardware: HardwarePlatform;
  batchSize: number;
  expectedInformationGain: number;
  uncertainty: number;
  diversity: number;
  selectionOrder?: number;
}

type HardwareConstraints = Partial<Record<HardwarePlatform, number>>;
type HardwareAvailability = Partial<Record<HardwarePlatform, number>>;

class TestBatchGenerator {
  private readonly modelTypes: ModelType[] = [
    "text_embedding",
    "text_generation",
    "vision",
    "audio",
    "multimodal",
  ];

  private readonly hardwarePlatforms: HardwarePlatform[] = [
    "cpu",
    "cuda",
    "rocm",
    "mps",
    "openvino",
    "qnn",
    "webnn",
    "webgpu",
  ];

  private readonly batchSizes = [1, 2, 4];

  readonly configurations: TestConfiguration[];

  constructor() {
    this.configurations = this.generateTestConfigurations();
  }

  suggestTestBatch(
    configurations: TestConfiguration[],
    batchSize = 10,
    ensureDiversity = true,
    hardwareConstraints?: HardwareConstraints,
    hardwareAvailability?: HardwareAvailability,
    diversityWeight = 0.5,
  ): TestConfiguration[] {
    const scoredConfigurations = hardwareAvailability
      ? this.applyHardwareAvailability(configurations, hardwareAvailability)
      : configurations.map((configuration) => ({ ...configuration }));

    if (scoredConfigurations.length <= batchSize) {
      return scoredConfigurations;
    }

    if (!ensureDiversity) {
      return this.applyHardwareConstraints(
        this.sortByInformationGain(scoredConfigurations),
        batchSize,
        hardwareConstraints,
      );
    }

    return this.sampleDiverseBatch(
      scoredConfigurations,
      batchSize,
      diversityWeight,
      hardwareConstraints,
    );
  }

  private generateTestConfigurations(): TestConfiguration[] {
    const configurations: TestConfiguration[] = [];

    this.modelTypes.forEach((modelType, modelIndex) => {
      this.hardwarePlatforms.forEach((hardware, hardwareIndex) => {
        this.batchSizes.forEach((batchSize, batchIndex) => {
          configurations.push({
            modelName: `example_${modelType}_model`,
            modelType,
            hardware,
            batchSize,
            expectedInformationGain: Number(
              (0.1 + modelIndex * 0.11 + hardwareIndex * 0.025 + batchIndex * 0.015).toFixed(3),
            ),
            uncertainty: Number((0.15 + batchIndex * 0.2).toFixed(3)),
            diversity: Number((0.2 + hardwareIndex * 0.05).toFixed(3)),
          });
        });
      });
    });

    return this.sortByInformationGain(configurations).slice(0, 50);
  }

  private applyHardwareAvailability(
    configurations: TestConfiguration[],
    hardwareAvailability: HardwareAvailability,
  ): TestConfiguration[] {
    return configurations.map((configuration) => ({
      ...configuration,
      expectedInformationGain:
        configuration.expectedInformationGain *
        (hardwareAvailability[configuration.hardware] ?? 1),
    }));
  }

  private applyHardwareConstraints(
    configurations: TestConfiguration[],
    batchSize: number,
    hardwareConstraints?: HardwareConstraints,
  ): TestConfiguration[] {
    const selected: TestConfiguration[] = [];
    const hardwareCounts = new Map<HardwarePlatform, number>();

    for (const configuration of configurations) {
      const limit = hardwareConstraints?.[configuration.hardware];
      const currentCount = hardwareCounts.get(configuration.hardware) ?? 0;

      if (limit !== undefined && currentCount >= limit) {
        continue;
      }

      selected.push({ ...configuration });
      hardwareCounts.set(configuration.hardware, currentCount + 1);

      if (selected.length >= batchSize) {
        break;
      }
    }

    return selected;
  }

  private sampleDiverseBatch(
    configurations: TestConfiguration[],
    batchSize: number,
    diversityWeight: number,
    hardwareConstraints?: HardwareConstraints,
  ): TestConfiguration[] {
    const selected: TestConfiguration[] = [];
    const remaining = this.sortByInformationGain(configurations);
    const hardwareCounts = new Map<HardwarePlatform, number>();
    const maxScore = Math.max(...remaining.map((configuration) => configuration.expectedInformationGain), 1);

    while (selected.length < batchSize && remaining.length > 0) {
      let bestIndex = -1;
      let bestScore = Number.NEGATIVE_INFINITY;

      remaining.forEach((candidate, index) => {
        const limit = hardwareConstraints?.[candidate.hardware];
        const hardwareCount = hardwareCounts.get(candidate.hardware) ?? 0;

        if (limit !== undefined && hardwareCount >= limit) {
          return;
        }

        const normalizedScore = candidate.expectedInformationGain / maxScore;
        const diversityScore = selected.length === 0 ? 0 : this.nearestDiversityDistance(candidate, selected);
        const combinedScore = (1 - diversityWeight) * normalizedScore + diversityWeight * diversityScore;

        if (combinedScore > bestScore) {
          bestScore = combinedScore;
          bestIndex = index;
        }
      });

      if (bestIndex === -1) {
        break;
      }

      const [nextConfiguration] = remaining.splice(bestIndex, 1);
      selected.push({ ...nextConfiguration, selectionOrder: selected.length + 1 });
      hardwareCounts.set(
        nextConfiguration.hardware,
        (hardwareCounts.get(nextConfiguration.hardware) ?? 0) + 1,
      );
    }

    return selected;
  }

  private nearestDiversityDistance(
    candidate: TestConfiguration,
    selectedConfigurations: TestConfiguration[],
  ): number {
    return Math.min(
      ...selectedConfigurations.map((selected) => {
        const categoricalDistance =
          Number(candidate.modelType !== selected.modelType) +
          Number(candidate.hardware !== selected.hardware);
        const batchDistance = Math.abs(candidate.batchSize - selected.batchSize) / 4;
        const uncertaintyDistance = Math.abs(candidate.uncertainty - selected.uncertainty);
        const diversityDistance = Math.abs(candidate.diversity - selected.diversity);

        return Math.min(
          (categoricalDistance + batchDistance + uncertaintyDistance + diversityDistance) / 4,
          1,
        );
      }),
    );
  }

  private sortByInformationGain(configurations: TestConfiguration[]): TestConfiguration[] {
    return [...configurations].sort(
      (left, right) => right.expectedInformationGain - left.expectedInformationGain,
    );
  }
}

function countByHardware(configurations: TestConfiguration[]): Map<HardwarePlatform, number> {
  return configurations.reduce((counts, configuration) => {
    counts.set(configuration.hardware, (counts.get(configuration.hardware) ?? 0) + 1);
    return counts;
  }, new Map<HardwarePlatform, number>());
}

describe("minimal batch generator", () => {
  it("generates a diverse batch with bounded size and selection order", () => {
    const batchGenerator = new TestBatchGenerator();

    const batch = batchGenerator.suggestTestBatch(batchGenerator.configurations, 10, true);

    expect(batch).toHaveLength(10);
    expect(batch.map((configuration) => configuration.selectionOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(batch.map((configuration) => configuration.modelType)).size).toBeGreaterThan(1);
    expect(new Set(batch.map((configuration) => configuration.hardware)).size).toBeGreaterThan(1);
  });

  it("enforces hardware limits during diverse sampling", () => {
    const batchGenerator = new TestBatchGenerator();
    const hardwareConstraints: HardwareConstraints = {
      cpu: 2,
      cuda: 3,
      openvino: 1,
      webgpu: 1,
    };

    const batch = batchGenerator.suggestTestBatch(
      batchGenerator.configurations,
      10,
      true,
      hardwareConstraints,
    );
    const hardwareCounts = countByHardware(batch);

    Object.entries(hardwareConstraints).forEach(([hardware, limit]) => {
      expect(hardwareCounts.get(hardware as HardwarePlatform) ?? 0).toBeLessThanOrEqual(limit);
    });
  });

  it("uses availability weights before selecting a non-diverse batch", () => {
    const batchGenerator = new TestBatchGenerator();

    const batch = batchGenerator.suggestTestBatch(
      batchGenerator.configurations,
      5,
      false,
      undefined,
      { webgpu: 0.01, qnn: 0.01, cpu: 1 },
    );

    expect(batch).toHaveLength(5);
    expect(batch.some((configuration) => configuration.hardware === "webgpu")).toBe(false);
    expect(batch.some((configuration) => configuration.hardware === "qnn")).toBe(false);
  });

  it("returns all configurations when requested batch size exceeds the input", () => {
    const batchGenerator = new TestBatchGenerator();
    const smallInput = batchGenerator.configurations.slice(0, 3);

    const batch = batchGenerator.suggestTestBatch(smallInput, 10);

    expect(batch).toEqual(smallInput);
  });
});
