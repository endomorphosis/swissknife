import { describe, expect, it } from "@jest/globals";

type Platform = "cpu" | "cuda" | "openvino";
type ImplementationType = "REAL" | "MOCK" | "NOT_AVAILABLE";

interface BitPlatformResult {
  platform: Platform;
  status: "Success" | "Unavailable";
  implementationType: ImplementationType;
  output?: {
    logits: number[][];
    labels: string[];
  };
}

interface BitExample {
  input: string;
  outputType: "image-classification";
  implementationType: ImplementationType;
  platform: Uppercase<Platform>;
  isBatch?: boolean;
}

const BIT_FIXTURE = {
  modelName: "google/bit-50",
  model: "bit",
  architecture: "BitForImageClassification",
  primaryTask: "image-classification",
  pipelineTasks: ["image-classification"],
  category: "vision",
  imageSize: {
    width: 224,
    height: 224,
    channels: 3,
  },
};

function createBitImageInput(batchSize = 1): string[] {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError("BIT image-classification tests require a positive batch size");
  }

  return Array.from({ length: batchSize }, (_, index) => {
    return "mock-rgb-image-" + (index + 1) + "-224x224x3";
  });
}

function runBitPlatform(platform: Platform, available = true): BitPlatformResult {
  if (!available) {
    return {
      platform,
      status: "Unavailable",
      implementationType: "NOT_AVAILABLE",
    };
  }

  return {
    platform,
    status: "Success",
    implementationType: platform === "cpu" ? "REAL" : "MOCK",
    output: {
      logits: [[0.04, 0.81, 0.15]],
      labels: ["tench", "goldfish", "great white shark"],
    },
  };
}

function recordExample(result: BitPlatformResult, input: string, isBatch = false): BitExample {
  if (result.status !== "Success") {
    throw new Error("Cannot record a BIT example for an unavailable platform");
  }

  return {
    input,
    outputType: BIT_FIXTURE.primaryTask,
    implementationType: result.implementationType,
    platform: result.platform.toUpperCase() as Uppercase<Platform>,
    isBatch: isBatch || undefined,
  };
}

describe("HuggingFace BIT image-classification fixture", () => {
  it("uses Big Transfer image-classification metadata", () => {
    expect(BIT_FIXTURE).toMatchObject({
      modelName: "google/bit-50",
      model: "bit",
      architecture: "BitForImageClassification",
      primaryTask: "image-classification",
      category: "vision",
    });
    expect(BIT_FIXTURE.pipelineTasks).toEqual(["image-classification"]);
    expect(BIT_FIXTURE.imageSize).toEqual({ width: 224, height: 224, channels: 3 });
  });

  it("creates deterministic single-image and batch inputs", () => {
    expect(createBitImageInput()).toEqual(["mock-rgb-image-1-224x224x3"]);
    expect(createBitImageInput(2)).toEqual([
      "mock-rgb-image-1-224x224x3",
      "mock-rgb-image-2-224x224x3",
    ]);
  });

  it("rejects invalid image batch sizes before platform execution", () => {
    expect(() => createBitImageInput(0)).toThrow("positive batch size");
    expect(() => createBitImageInput(1.5)).toThrow("positive batch size");
  });

  it("records successful CPU image-classification output examples", () => {
    const result = runBitPlatform("cpu");
    const [input] = createBitImageInput();
    const example = recordExample(result, input);

    expect(result.status).toBe("Success");
    expect(result.output?.logits[0]).toHaveLength(3);
    expect(result.output?.labels).toContain("goldfish");
    expect(example).toEqual({
      input: "mock-rgb-image-1-224x224x3",
      outputType: "image-classification",
      implementationType: "REAL",
      platform: "CPU",
    });
  });

  it("reports unavailable accelerator platforms without recording examples", () => {
    const result = runBitPlatform("cuda", false);

    expect(result).toEqual({
      platform: "cuda",
      status: "Unavailable",
      implementationType: "NOT_AVAILABLE",
    });
    expect(() => recordExample(result, createBitImageInput()[0])).toThrow("unavailable platform");
  });
});
