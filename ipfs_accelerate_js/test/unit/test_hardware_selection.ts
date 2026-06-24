const HARDWARE_SCORE = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const TEST_COMPATIBILITY_MATRIX = {
  timestamp: "2025-03-01T00:00:00Z",
  hardwareTypes: ["cpu", "cuda", "rocm", "mps", "openvino", "webnn", "webgpu"],
  modelFamilies: {
    embedding: {
      hardwareCompatibility: {
        cpu: { compatible: true, performanceRating: "medium" },
        cuda: { compatible: true, performanceRating: "high" },
        rocm: { compatible: true, performanceRating: "high" },
        mps: { compatible: true, performanceRating: "high" },
        openvino: { compatible: true, performanceRating: "medium" },
        webnn: { compatible: true, performanceRating: "high" },
        webgpu: { compatible: true, performanceRating: "medium" },
      },
    },
    text_generation: {
      hardwareCompatibility: {
        cpu: { compatible: true, performanceRating: "low" },
        cuda: { compatible: true, performanceRating: "high" },
        rocm: { compatible: true, performanceRating: "medium" },
        mps: { compatible: true, performanceRating: "medium" },
        openvino: { compatible: true, performanceRating: "low" },
        webnn: { compatible: false, performanceRating: "unknown" },
        webgpu: { compatible: true, performanceRating: "low" },
      },
    },
  },
};

class HardwareSelectorHarness {
  constructor(databasePath, compatibilityMatrix = TEST_COMPATIBILITY_MATRIX) {
    this.databasePath = databasePath;
    this.compatibilityMatrix = compatibilityMatrix;
    this.fallbackModes = new Set();
  }

  initializeFallbackModels(mode) {
    this.fallbackModes.add(mode);
  }

  selectHardware(options) {
    const familyCompatibility = this.compatibilityMatrix.modelFamilies[options.modelFamily].hardwareCompatibility;
    const compatibleHardware = options.availableHardware.filter((hardware) => familyCompatibility[hardware]?.compatible);

    const rankedHardware = [...compatibleHardware].sort((left, right) => {
      const scoreDelta =
        HARDWARE_SCORE[familyCompatibility[right]?.performanceRating ?? "unknown"] -
        HARDWARE_SCORE[familyCompatibility[left]?.performanceRating ?? "unknown"];

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return options.availableHardware.indexOf(left) - options.availableHardware.indexOf(right);
    });

    const primaryRecommendation = rankedHardware[0] ?? "cpu";

    return {
      primaryRecommendation,
      fallbackOptions: rankedHardware.filter((hardware) => hardware !== primaryRecommendation),
      compatibleHardware,
    };
  }

  getDistributedTrainingConfig(options) {
    const config = {
      modelFamily: options.modelFamily,
      modelName: options.modelName,
      gpuCount: options.gpuCount,
      perGpuBatchSize: options.batchSize,
      globalBatchSize: options.gpuCount * options.batchSize,
      distributedStrategy: "data_parallel",
      estimatedMemory: options.modelName.includes("7b") ? "28GB" : "2GB",
    };

    if (options.maxMemoryGb !== undefined && options.modelName.includes("7b")) {
      config.distributedStrategy = "zero_data_parallel";
      config.memoryOptimizations = ["gradient_checkpointing", "mixed_precision", "optimizer_state_sharding"];
    }

    return config;
  }

  createHardwareSelectionMap(modelFamilies) {
    return {
      modelFamilies: Object.fromEntries(
        modelFamilies.map((family) => [
          family,
          {
            modelSizes: ["small", "base", "large"],
            inference: this.rankFamilyHardware(family),
            training: this.rankFamilyHardware(family).filter((hardware) => hardware !== "webnn"),
          },
        ]),
      ),
    };
  }

  rankFamilyHardware(modelFamily) {
    const compatibility = this.compatibilityMatrix.modelFamilies[modelFamily].hardwareCompatibility;

    return this.compatibilityMatrix.hardwareTypes
      .filter((hardware) => compatibility[hardware]?.compatible)
      .sort(
        (left, right) =>
          HARDWARE_SCORE[compatibility[right]?.performanceRating ?? "unknown"] -
          HARDWARE_SCORE[compatibility[left]?.performanceRating ?? "unknown"],
      );
  }
}

describe("hardware selection", () => {
  it("initializes with the provided benchmark database path and compatibility matrix", () => {
    const selector = new HardwareSelectorHarness("/tmp/benchmark_results");

    expect(selector.databasePath).toBe("/tmp/benchmark_results");
    expect(selector.compatibilityMatrix.modelFamilies.embedding).toBeDefined();
    expect(selector.compatibilityMatrix.hardwareTypes).toContain("webgpu");
  });

  it("selects the highest-rated compatible hardware and exposes fallbacks", () => {
    const selector = new HardwareSelectorHarness("/tmp/benchmark_results");

    const result = selector.selectHardware({
      modelFamily: "embedding",
      modelName: "bert-base-uncased",
      batchSize: 1,
      mode: "inference",
      availableHardware: ["cpu", "cuda", "openvino"],
    });

    expect(result).toEqual({
      primaryRecommendation: "cuda",
      fallbackOptions: ["cpu", "openvino"],
      compatibleHardware: ["cpu", "cuda", "openvino"],
    });
  });

  it("excludes incompatible hardware from text-generation recommendations", () => {
    const selector = new HardwareSelectorHarness("/tmp/benchmark_results");

    const result = selector.selectHardware({
      modelFamily: "text_generation",
      modelName: "gpt2",
      batchSize: 1,
      mode: "inference",
      availableHardware: ["cpu", "cuda", "webnn", "openvino"],
    });

    expect(result.primaryRecommendation).toBe("cuda");
    expect(result.compatibleHardware).toEqual(["cpu", "cuda", "openvino"]);
    expect(result.fallbackOptions).toEqual(["cpu", "openvino"]);
  });

  it("keeps deterministic recommendations after fallback models are initialized", () => {
    const selector = new HardwareSelectorHarness("/tmp/benchmark_results");
    selector.initializeFallbackModels("inference");
    selector.initializeFallbackModels("training");

    const result = selector.selectHardware({
      modelFamily: "embedding",
      modelName: "bert-base-uncased",
      batchSize: 64,
      mode: "inference",
      availableHardware: ["cpu", "cuda", "openvino"],
    });

    expect(result.primaryRecommendation).toBe("cuda");
    expect(result.fallbackOptions).toHaveLength(2);
  });

  it("builds distributed training configuration and adds memory optimizations for constrained large models", () => {
    const selector = new HardwareSelectorHarness("/tmp/benchmark_results");

    expect(
      selector.getDistributedTrainingConfig({
        modelFamily: "text_generation",
        modelName: "gpt2",
        gpuCount: 4,
        batchSize: 8,
      }),
    ).toMatchObject({
      modelFamily: "text_generation",
      modelName: "gpt2",
      gpuCount: 4,
      perGpuBatchSize: 8,
      globalBatchSize: 32,
      distributedStrategy: "data_parallel",
      estimatedMemory: "2GB",
    });

    expect(
      selector.getDistributedTrainingConfig({
        modelFamily: "text_generation",
        modelName: "llama-7b",
        gpuCount: 4,
        batchSize: 8,
        maxMemoryGb: 16,
      }),
    ).toMatchObject({
      distributedStrategy: "zero_data_parallel",
      memoryOptimizations: ["gradient_checkpointing", "mixed_precision", "optimizer_state_sharding"],
    });
  });

  it("creates a hardware selection map with inference and training rankings", () => {
    const selector = new HardwareSelectorHarness("/tmp/benchmark_results");

    const selectionMap = selector.createHardwareSelectionMap(["embedding"]);

    expect(selectionMap.modelFamilies.embedding.modelSizes).toEqual(["small", "base", "large"]);
    expect(selectionMap.modelFamilies.embedding.inference.slice(0, 3)).toEqual(["cuda", "rocm", "mps"]);
    expect(selectionMap.modelFamilies.embedding.training).not.toContain("webnn");
  });
});
