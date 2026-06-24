const DATA2VEC_TEXT_MODEL_ID = "facebook/data2vec-text-base";
const DATA2VEC_TEXT_TASK = "feature-extraction";
const DATA2VEC_TEXT_HIDDEN_SIZE = 768;

function normalizeTextInput(input) {
  const texts = Array.isArray(input) ? input : [input];

  if (texts.length === 0) {
    throw new RangeError("Data2Vec text input must include at least one value");
  }

  texts.forEach((text) => {
    if (text.trim().length === 0) {
      throw new TypeError("Data2Vec text input cannot include blank text");
    }
  });

  return texts;
}

function deterministicTextEmbedding(text, dimension = DATA2VEC_TEXT_HIDDEN_SIZE) {
  let hash = 2166136261;

  for (const char of text) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return Array.from({ length: dimension }, (_, index) => {
    const byte = (hash >>> ((index % 4) * 8)) & 0xff;
    return Number(((byte / 255) * 2 - 1).toFixed(6));
  });
}

function createData2VecTextFixture() {
  let disposed = false;

  return {
    modelId: DATA2VEC_TEXT_MODEL_ID,
    task: DATA2VEC_TEXT_TASK,
    hiddenSize: DATA2VEC_TEXT_HIDDEN_SIZE,
    async extractFeatures(input) {
      if (disposed) {
        throw new Error("Data2Vec text fixture has been disposed");
      }

      return normalizeTextInput(input).map((text) =>
        deterministicTextEmbedding(text, DATA2VEC_TEXT_HIDDEN_SIZE),
      );
    },
    dispose() {
      disposed = true;
    },
  };
}

describe("Data2Vec text fixture", () => {
  it("uses Data2Vec text model metadata", () => {
    const fixture = createData2VecTextFixture();

    expect(fixture.modelId).toBe(DATA2VEC_TEXT_MODEL_ID);
    expect(fixture.task).toBe("feature-extraction");
    expect(fixture.hiddenSize).toBe(DATA2VEC_TEXT_HIDDEN_SIZE);
  });

  it("returns a stable 768-dimensional embedding for one text input", async () => {
    const fixture = createData2VecTextFixture();
    const output = await fixture.extractFeatures("This is a test input for the model.");

    expect(output).toHaveLength(1);
    expect(output[0]).toHaveLength(DATA2VEC_TEXT_HIDDEN_SIZE);
    expect(output[0]).toEqual(
      deterministicTextEmbedding("This is a test input for the model."),
    );
  });

  it("preserves batch size and embedding width for multiple text inputs", async () => {
    const fixture = createData2VecTextFixture();
    const output = await fixture.extractFeatures([
      "This is a test input for the model.",
      "A second sentence exercises batch feature extraction.",
    ]);

    expect(output).toHaveLength(2);
    expect(output.every((embedding) => embedding.length === DATA2VEC_TEXT_HIDDEN_SIZE)).toBe(
      true,
    );
    expect(output[0]).not.toEqual(output[1]);
  });

  it("rejects empty batches and blank text before feature extraction", async () => {
    const fixture = createData2VecTextFixture();

    await expect(fixture.extractFeatures([])).rejects.toThrow("at least one value");
    await expect(fixture.extractFeatures(["valid text", "   "])).rejects.toThrow("blank text");
  });

  it("does not allow feature extraction after disposal", async () => {
    const fixture = createData2VecTextFixture();

    fixture.dispose();

    await expect(fixture.extractFeatures("text after dispose")).rejects.toThrow("disposed");
  });
});
