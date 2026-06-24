const DEFAULT_MODEL_ID = "shi-labs/dinat-mini-in1k-224";
const MODEL_FAMILY = "DINAT";
const TASK = "image-classification";

type DinatBackend = "cpu" | "cuda" | "openvino";

type DinatImageInput = {
  width: number;
  height: number;
  channels: 1 | 3 | 4;
  data: Float32Array;
};

type DinatPrediction = {
  backend: DinatBackend;
  implementationType: "MOCK";
  modelId: string;
  task: typeof TASK;
  family: typeof MODEL_FAMILY;
  imageShape: [number, number, number];
  topLabel: string;
};

type DinatInitResult = {
  backend: DinatBackend;
  modelId: string;
  task: typeof TASK;
  family: typeof MODEL_FAMILY;
  predict: (input: DinatImageInput) => DinatPrediction;
};

function createDinatImageInput(
  width = 224,
  height = 224,
  channels: DinatImageInput["channels"] = 3,
): DinatImageInput {
  const data = new Float32Array(width * height * channels);

  data.fill(0.5);

  return {
    width,
    height,
    channels,
    data,
  };
}

function validateDinatImageInput(input: DinatImageInput): void {
  if (!Number.isInteger(input.width) || input.width <= 0) {
    throw new RangeError("DINAT image width must be a positive integer");
  }

  if (!Number.isInteger(input.height) || input.height <= 0) {
    throw new RangeError("DINAT image height must be a positive integer");
  }

  if (![1, 3, 4].includes(input.channels)) {
    throw new RangeError("DINAT image channels must be 1, 3, or 4");
  }

  const expectedLength = input.width * input.height * input.channels;
  if (input.data.length !== expectedLength) {
    throw new RangeError("DINAT image data length must match width * height * channels");
  }

  if (input.data.some((value) => !Number.isFinite(value))) {
    throw new TypeError("DINAT image data must contain finite pixel values");
  }
}

function createDinatBackend(
  backend: DinatBackend,
  modelId = DEFAULT_MODEL_ID,
): DinatInitResult {
  return {
    backend,
    modelId,
    task: TASK,
    family: MODEL_FAMILY,
    predict(input: DinatImageInput): DinatPrediction {
      validateDinatImageInput(input);

      return {
        backend,
        implementationType: "MOCK",
        modelId,
        task: TASK,
        family: MODEL_FAMILY,
        imageShape: [input.height, input.width, input.channels],
        topLabel: "mock-image-class",
      };
    },
  };
}

describe("hf_dinat test fixture", () => {
  it("uses DINAT image-classification metadata for CPU initialization", () => {
    const backend = createDinatBackend("cpu");

    expect(backend.backend).toBe("cpu");
    expect(backend.modelId).toBe(DEFAULT_MODEL_ID);
    expect(backend.task).toBe(TASK);
    expect(backend.family).toBe(MODEL_FAMILY);
  });

  it("classifies image tensor inputs with stable mock output", () => {
    const backend = createDinatBackend("cpu");
    const input = createDinatImageInput();
    const output = backend.predict(input);

    expect(output).toMatchObject({
      backend: "cpu",
      implementationType: "MOCK",
      modelId: DEFAULT_MODEL_ID,
      task: TASK,
      family: MODEL_FAMILY,
      topLabel: "mock-image-class",
    });
    expect(output.imageShape).toEqual([224, 224, 3]);
  });

  it("supports the hardware backends covered by the converted Python test", () => {
    const backends: DinatBackend[] = ["cpu", "cuda", "openvino"];

    expect(backends.map((backend) => createDinatBackend(backend).backend)).toEqual(backends);
  });

  it("rejects malformed image inputs before prediction", () => {
    const backend = createDinatBackend("cpu");
    const validInput = createDinatImageInput();

    expect(() => backend.predict({ ...validInput, width: 0 })).toThrow("positive integer");
    expect(() => backend.predict({ ...validInput, height: 0 })).toThrow("positive integer");
    expect(() =>
      backend.predict({ ...validInput, channels: 2 as DinatImageInput["channels"] }),
    ).toThrow("1, 3, or 4");
    expect(() =>
      backend.predict({ ...validInput, data: new Float32Array(12) }),
    ).toThrow("width * height * channels");

    const invalidPixels = createDinatImageInput();
    invalidPixels.data[0] = Number.NaN;

    expect(() => backend.predict(invalidPixels)).toThrow("finite pixel values");
  });
});
