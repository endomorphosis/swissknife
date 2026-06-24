import { describe, expect, it } from "@jest/globals";

type Platform = "cpu" | "cuda" | "rocm" | "npu" | "webnn" | "webgpu";
type Precision = "fp16" | "int8" | "int4";

interface PlatformSize {
  fp16Mb: number;
  int8Mb: number;
  int4Mb: number;
}

interface ModelDetails {
  fullName: string;
  path: string;
  type: "text";
  promptTemplate: string;
  sizes: Record<"cpu" | "cuda" | "webgpu", PlatformSize>;
}

interface PrecisionResult {
  precision: Precision;
  executionTimeMs: number;
  memoryMb: number;
  memoryReductionPercent: number;
  accuracyLossPercent: number;
}

interface PlatformComparison {
  platform: Platform;
  results: Record<Precision, PrecisionResult>;
}

const MODEL_DETAILS: Record<string, ModelDetails> = {
  llama: {
    fullName: "llama-3-8b",
    path: "models/llama-3-8b",
    type: "text",
    promptTemplate: "### User: {prompt}\n\n### Assistant:",
    sizes: {
      cpu: { fp16Mb: 16000, int8Mb: 8000, int4Mb: 4000 },
      cuda: { fp16Mb: 16000, int8Mb: 8000, int4Mb: 4000 },
      webgpu: { fp16Mb: 16000, int8Mb: 8000, int4Mb: 4000 },
    },
  },
  qwen2: {
    fullName: "qwen2-7b",
    path: "models/qwen2-7b",
    type: "text",
    promptTemplate: "<|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant\n",
    sizes: {
      cpu: { fp16Mb: 14000, int8Mb: 7000, int4Mb: 3500 },
      cuda: { fp16Mb: 14000, int8Mb: 7000, int4Mb: 3500 },
      webgpu: { fp16Mb: 14000, int8Mb: 7000, int4Mb: 3500 },
    },
  },
  t5: {
    fullName: "t5-large",
    path: "models/t5-large",
    type: "text",
    promptTemplate: "{prompt}",
    sizes: {
      cpu: { fp16Mb: 1500, int8Mb: 750, int4Mb: 375 },
      cuda: { fp16Mb: 1500, int8Mb: 750, int4Mb: 375 },
      webgpu: { fp16Mb: 1500, int8Mb: 750, int4Mb: 375 },
    },
  },
  bert: {
    fullName: "bert-base-uncased",
    path: "models/bert-base-uncased",
    type: "text",
    promptTemplate: "{prompt}",
    sizes: {
      cpu: { fp16Mb: 500, int8Mb: 250, int4Mb: 125 },
      cuda: { fp16Mb: 500, int8Mb: 250, int4Mb: 125 },
      webgpu: { fp16Mb: 500, int8Mb: 250, int4Mb: 125 },
    },
  },
};

const DEFAULT_MODEL_SIZES: ModelDetails["sizes"] = {
  cpu: { fp16Mb: 1000, int8Mb: 500, int4Mb: 250 },
  cuda: { fp16Mb: 1000, int8Mb: 500, int4Mb: 250 },
  webgpu: { fp16Mb: 1000, int8Mb: 500, int4Mb: 250 },
};

const PLATFORM_SPEED_FACTOR: Record<Platform, number> = {
  cpu: 1,
  cuda: 0.32,
  rocm: 0.36,
  npu: 0.42,
  webnn: 0.58,
  webgpu: 0.48,
};

const PRECISION_SPEED_FACTOR: Record<Precision, number> = {
  fp16: 1,
  int8: 0.68,
  int4: 0.44,
};

const ACCURACY_LOSS_PERCENT: Record<Precision, number> = {
  fp16: 0,
  int8: 0.5,
  int4: 1.5,
};

function getModelDetails(modelName: string): ModelDetails {
  const knownModel = MODEL_DETAILS[modelName.toLowerCase()];

  if (knownModel) {
    return knownModel;
  }

  return {
    fullName: modelName,
    path: `models/${modelName}`,
    type: "text",
    promptTemplate: "{prompt}",
    sizes: DEFAULT_MODEL_SIZES,
  };
}

function resolvePlatforms(
  requested: Platform[],
  isAvailable: (platform: Platform) => boolean,
): Platform[] {
  return requested.filter(isAvailable);
}

function sizesForPlatform(model: ModelDetails, platform: Platform): PlatformSize {
  if (platform === "cuda" || platform === "cpu" || platform === "webgpu") {
    return model.sizes[platform];
  }

  return model.sizes.webgpu;
}

function memoryForPrecision(sizes: PlatformSize, precision: Precision): number {
  switch (precision) {
    case "fp16":
      return sizes.fp16Mb;
    case "int8":
      return sizes.int8Mb;
    case "int4":
      return sizes.int4Mb;
  }
}

function comparePrecisionsOnPlatform(platform: Platform, model: ModelDetails): PlatformComparison {
  const sizes = sizesForPlatform(model, platform);
  const baselineMs = sizes.fp16Mb * PLATFORM_SPEED_FACTOR[platform] * 0.5;
  const entries = (["fp16", "int8", "int4"] as Precision[]).map((precision) => {
    const memoryMb = memoryForPrecision(sizes, precision);

    return [
      precision,
      {
        precision,
        executionTimeMs: Math.round(baselineMs * PRECISION_SPEED_FACTOR[precision]),
        memoryMb,
        memoryReductionPercent: Math.round((1 - memoryMb / sizes.fp16Mb) * 100),
        accuracyLossPercent: ACCURACY_LOSS_PERCENT[precision],
      },
    ] as const;
  });

  return {
    platform,
    results: Object.fromEntries(entries) as Record<Precision, PrecisionResult>,
  };
}

function buildCompatibilityMatrix(comparisons: PlatformComparison[]) {
  return comparisons.reduce(
    (matrix, comparison) => {
      const int4 = comparison.results.int4;

      matrix.hardware.push(comparison.platform);
      matrix.memoryReduction[comparison.platform] = int4.memoryReductionPercent;
      matrix.performanceImprovement[comparison.platform] =
        comparison.results.fp16.executionTimeMs / int4.executionTimeMs;
      matrix.accuracyImpact[comparison.platform] = int4.accuracyLossPercent;

      return matrix;
    },
    {
      hardware: [] as Platform[],
      memoryReduction: {} as Partial<Record<Platform, number>>,
      performanceImprovement: {} as Partial<Record<Platform, number>>,
      accuracyImpact: {} as Partial<Record<Platform, number>>,
    },
  );
}

describe("cross-platform 4-bit quantization helpers", () => {
  it("resolves known model defaults and deterministic fallback details", () => {
    expect(getModelDetails("LLAMA")).toMatchObject({
      fullName: "llama-3-8b",
      path: "models/llama-3-8b",
      type: "text",
    });

    expect(getModelDetails("custom-model")).toMatchObject({
      fullName: "custom-model",
      path: "models/custom-model",
      promptTemplate: "{prompt}",
      sizes: DEFAULT_MODEL_SIZES,
    });
  });

  it("filters requested platforms to the currently available hardware", () => {
    const available = new Set<Platform>(["cpu", "webnn", "webgpu"]);

    expect(
      resolvePlatforms(["cpu", "cuda", "webnn", "webgpu"], (platform) =>
        available.has(platform),
      ),
    ).toEqual(["cpu", "webnn", "webgpu"]);
  });

  it("compares fp16, int8, and int4 memory and accuracy on a platform", () => {
    const comparison = comparePrecisionsOnPlatform("webgpu", getModelDetails("bert"));

    expect(comparison.results.fp16).toMatchObject({
      memoryMb: 500,
      memoryReductionPercent: 0,
      accuracyLossPercent: 0,
    });
    expect(comparison.results.int8).toMatchObject({
      memoryMb: 250,
      memoryReductionPercent: 50,
      accuracyLossPercent: 0.5,
    });
    expect(comparison.results.int4).toMatchObject({
      memoryMb: 125,
      memoryReductionPercent: 75,
      accuracyLossPercent: 1.5,
    });
  });

  it("aggregates cross-platform int4 metrics into a compatibility matrix", () => {
    const model = getModelDetails("qwen2");
    const comparisons = ["cpu", "webnn", "webgpu"].map((platform) =>
      comparePrecisionsOnPlatform(platform as Platform, model),
    );
    const matrix = buildCompatibilityMatrix(comparisons);

    expect(matrix.hardware).toEqual(["cpu", "webnn", "webgpu"]);
    expect(matrix.memoryReduction).toEqual({
      cpu: 75,
      webnn: 75,
      webgpu: 75,
    });
    expect(matrix.accuracyImpact).toEqual({
      cpu: 1.5,
      webnn: 1.5,
      webgpu: 1.5,
    });
    expect(matrix.performanceImprovement.webgpu).toBeGreaterThan(2);
  });
});
