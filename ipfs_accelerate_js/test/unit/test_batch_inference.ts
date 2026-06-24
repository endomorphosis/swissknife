type BatchInput = string;

type BatchOutput = {
  input: BatchInput;
  index: number;
  modelType: ModelType;
};

type ModelType = "text" | "vision" | "audio";

type BatchHandler = (inputs: BatchInput[]) => BatchOutput[];
type NormalizedBatchHandler = (inputs: BatchInput | BatchInput[]) => BatchOutput[];

const DEFAULT_BATCH_SIZES = [1, 2, 4, 8, 16];

function generateTextBatch(batchSize: number): BatchInput[] {
  return Array.from({ length: batchSize }, (_, index) => `The quick brown fox sample ${index + 1}`);
}

function generateImageBatch(batchSize: number): BatchInput[] {
  return Array.from({ length: batchSize }, () => "test_data/test.jpg");
}

function generateAudioBatch(batchSize: number): BatchInput[] {
  return Array.from({ length: batchSize }, () => "test_data/test.mp3");
}

function normalizeBatch(inputs: BatchInput | BatchInput[], batchSize: number): {
  originalCount: number;
  inputsForHandler: BatchInput[];
} {
  const normalizedInputs = Array.isArray(inputs) ? inputs : [inputs];
  const originalCount = Math.min(normalizedInputs.length, batchSize);
  const inputsForHandler = normalizedInputs.slice(0, batchSize);

  while (inputsForHandler.length < batchSize && inputsForHandler.length > 0) {
    inputsForHandler.push(inputsForHandler[0]);
  }

  return {
    originalCount,
    inputsForHandler,
  };
}

function createBatchHandler(handler: BatchHandler, modelType: ModelType, batchSize: number): NormalizedBatchHandler {
  if (batchSize < 1) {
    throw new Error("batchSize must be at least 1");
  }

  return (inputs: BatchInput | BatchInput[]) => {
    const { originalCount, inputsForHandler } = normalizeBatch(inputs, batchSize);

    if (modelType === "text") {
      return handler(inputsForHandler).slice(0, originalCount);
    }

    return inputsForHandler
      .slice(0, originalCount)
      .flatMap((input) => handler([input]));
  };
}

function createMockHandler(modelType: ModelType, calls: BatchInput[][]): BatchHandler {
  return (inputs: BatchInput[]) => {
    calls.push([...inputs]);

    return inputs.map((input, index) => ({
      input,
      index,
      modelType,
    }));
  };
}

function measureBatchInference(
  handler: NormalizedBatchHandler,
  inputs: BatchInput | BatchInput[],
  batchSize: number,
  platform: string,
) {
  const startedAt = performance.now();
  const outputs = handler(inputs);
  const inputCount = Array.isArray(inputs) ? inputs.length : 1;
  const durationMs = Math.max(performance.now() - startedAt, 0);

  return {
    status: "Success" as const,
    batchSize,
    platform,
    inputCount,
    outputCount: outputs.length,
    durationMs,
    inputsPerSecond: durationMs > 0 ? inputCount / (durationMs / 1000) : inputCount,
  };
}

describe("batch inference conversion fixture", () => {
  it("keeps the default batch sizes from the Python source", () => {
    expect(DEFAULT_BATCH_SIZES).toEqual([1, 2, 4, 8, 16]);
  });

  it("generates deterministic sample batches for text, image, and audio models", () => {
    expect(generateTextBatch(2)).toEqual(["The quick brown fox sample 1", "The quick brown fox sample 2"]);
    expect(generateImageBatch(2)).toEqual(["test_data/test.jpg", "test_data/test.jpg"]);
    expect(generateAudioBatch(2)).toEqual(["test_data/test.mp3", "test_data/test.mp3"]);
  });

  it("pads short text batches for fixed-size handlers without returning padded outputs", () => {
    const calls: BatchInput[][] = [];
    const handler = createBatchHandler(createMockHandler("text", calls), "text", 4);

    const outputs = handler(["alpha", "beta"]);

    expect(calls).toEqual([["alpha", "beta", "alpha", "alpha"]]);
    expect(outputs.map((output) => output.input)).toEqual(["alpha", "beta"]);
  });

  it("truncates oversized batches to the configured batch size", () => {
    const calls: BatchInput[][] = [];
    const handler = createBatchHandler(createMockHandler("text", calls), "text", 2);

    const outputs = handler(["alpha", "beta", "gamma"]);

    expect(calls).toEqual([["alpha", "beta"]]);
    expect(outputs.map((output) => output.input)).toEqual(["alpha", "beta"]);
  });

  it("runs non-text models item by item after normalizing batch size", () => {
    const calls: BatchInput[][] = [];
    const handler = createBatchHandler(createMockHandler("vision", calls), "vision", 3);

    const outputs = handler(["image-a.jpg", "image-b.jpg"]);

    expect(calls).toEqual([["image-a.jpg"], ["image-b.jpg"]]);
    expect(outputs).toEqual([
      { input: "image-a.jpg", index: 0, modelType: "vision" },
      { input: "image-b.jpg", index: 0, modelType: "vision" },
    ]);
  });

  it("accepts a single input and records successful batch metrics", () => {
    const calls: BatchInput[][] = [];
    const handler = createBatchHandler(createMockHandler("audio", calls), "audio", 2);

    const metrics = measureBatchInference(handler, "clip.mp3", 2, "cpu");

    expect(calls).toEqual([["clip.mp3"]]);
    expect(metrics).toMatchObject({
      status: "Success",
      batchSize: 2,
      platform: "cpu",
      inputCount: 1,
      outputCount: 1,
    });
    expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
    expect(metrics.inputsPerSecond).toBeGreaterThanOrEqual(1);
  });

  it("rejects invalid batch sizes explicitly", () => {
    expect(() => createBatchHandler(createMockHandler("text", []), "text", 0)).toThrow(
      "batchSize must be at least 1",
    );
  });
});
