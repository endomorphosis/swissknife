const DEFAULT_MODEL_NAME = "microsoft/bros-base-uncased";
const MODEL_TYPE = "document-question-answering";

type BrosBackend = "cpu" | "cuda" | "openvino";

type BrosPrediction = {
  backend: BrosBackend;
  implementationType: "MOCK";
  modelName: string;
  text: string;
  words: string[];
  boxes: number[][];
};

type BrosInitResult = {
  backend: BrosBackend;
  modelName: string;
  modelType: string;
  predict: (input: BrosInput) => BrosPrediction;
};

type BrosInput = {
  text: string;
  words: string[];
  boxes: number[][];
};

function createBrosInput(text = "Invoice total is 42 dollars"): BrosInput {
  const words = text.split(" ");

  return {
    text,
    words,
    boxes: words.map((_, index) => [index * 10, 0, index * 10 + 8, 10]),
  };
}

function validateBrosInput(input: BrosInput): void {
  if (input.text.trim().length === 0) {
    throw new TypeError("BROS input text cannot be blank");
  }

  if (input.words.length === 0) {
    throw new RangeError("BROS input must include at least one word");
  }

  if (input.words.length !== input.boxes.length) {
    throw new RangeError("BROS input must include one bounding box per word");
  }

  input.boxes.forEach((box) => {
    if (box.length !== 4 || box.some((coordinate) => !Number.isFinite(coordinate))) {
      throw new TypeError("BROS bounding boxes must contain four finite coordinates");
    }
  });
}

function createBrosBackend(
  backend: BrosBackend,
  modelName = DEFAULT_MODEL_NAME,
  modelType = MODEL_TYPE,
): BrosInitResult {
  return {
    backend,
    modelName,
    modelType,
    predict(input: BrosInput): BrosPrediction {
      validateBrosInput(input);

      return {
        backend,
        implementationType: "MOCK",
        modelName,
        text: input.text,
        words: input.words,
        boxes: input.boxes,
      };
    },
  };
}

describe("hf_bros test fixture", () => {
  it("uses BROS document model metadata for CPU initialization", () => {
    const backend = createBrosBackend("cpu");

    expect(backend.backend).toBe("cpu");
    expect(backend.modelName).toBe(DEFAULT_MODEL_NAME);
    expect(backend.modelType).toBe(MODEL_TYPE);
  });

  it("preserves document words and bounding boxes during prediction", () => {
    const backend = createBrosBackend("cpu");
    const input = createBrosInput();
    const output = backend.predict(input);

    expect(output).toMatchObject({
      backend: "cpu",
      implementationType: "MOCK",
      modelName: DEFAULT_MODEL_NAME,
      text: input.text,
    });
    expect(output.words).toEqual(input.words);
    expect(output.boxes).toEqual(input.boxes);
  });

  it("supports the hardware backends covered by the converted Python test", () => {
    const backends: BrosBackend[] = ["cpu", "cuda", "openvino"];

    expect(backends.map((backend) => createBrosBackend(backend).backend)).toEqual(backends);
  });

  it("rejects malformed document inputs before prediction", () => {
    const backend = createBrosBackend("cpu");
    const validInput = createBrosInput();

    expect(() => backend.predict({ ...validInput, text: "   " })).toThrow("blank");
    expect(() => backend.predict({ ...validInput, words: [] })).toThrow("at least one word");
    expect(() => backend.predict({ ...validInput, boxes: [] })).toThrow("one bounding box");
    expect(() =>
      backend.predict({ ...validInput, boxes: [[0, 1, 2]] }),
    ).toThrow("four finite coordinates");
  });
});
