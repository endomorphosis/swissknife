const DEFAULT_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2";
const DEFAULT_EMBEDDING_DIMENSION = 384;

function normalizeInputs(input) {
  const values = Array.isArray(input) ? input : [input];

  if (values.length === 0) {
    throw new RangeError("Default embedding input must include at least one text value");
  }

  values.forEach((value) => {
    if (value.trim().length === 0) {
      throw new TypeError("Default embedding input cannot include blank text");
    }
  });

  return values;
}

function deterministicEmbedding(text, dimension = DEFAULT_EMBEDDING_DIMENSION) {
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

function createDefaultEmbedFixture() {
  let disposed = false;

  return {
    modelName: DEFAULT_MODEL_NAME,
    embeddingDimension: DEFAULT_EMBEDDING_DIMENSION,
    async execute(input) {
      if (disposed) {
        throw new Error("Default embedding fixture has been disposed");
      }

      return normalizeInputs(input).map((text) =>
        deterministicEmbedding(text, DEFAULT_EMBEDDING_DIMENSION),
      );
    },
    dispose() {
      disposed = true;
    },
  };
}

describe("default embedding fixture", () => {
  it("uses the MiniLM-compatible default model metadata", () => {
    const fixture = createDefaultEmbedFixture();

    expect(fixture.modelName).toBe(DEFAULT_MODEL_NAME);
    expect(fixture.embeddingDimension).toBe(384);
  });

  it("returns a stable 384-dimensional embedding for one text input", async () => {
    const fixture = createDefaultEmbedFixture();
    const output = await fixture.execute("The quick brown fox jumps over the lazy dog");

    expect(output).toHaveLength(1);
    expect(output[0]).toHaveLength(DEFAULT_EMBEDDING_DIMENSION);
    expect(output[0]).toEqual(
      deterministicEmbedding("The quick brown fox jumps over the lazy dog"),
    );
  });

  it("preserves batch size and embedding width for multiple text inputs", async () => {
    const fixture = createDefaultEmbedFixture();
    const output = await fixture.execute([
      "The quick brown fox jumps over the lazy dog",
      "A fast auburn canine leaps above the sleepy hound",
    ]);

    expect(output).toHaveLength(2);
    expect(output.every((embedding) => embedding.length === DEFAULT_EMBEDDING_DIMENSION)).toBe(
      true,
    );
    expect(output[0]).not.toEqual(output[1]);
  });

  it("rejects empty batches and blank text before embedding", async () => {
    const fixture = createDefaultEmbedFixture();

    await expect(fixture.execute([])).rejects.toThrow("at least one text value");
    await expect(fixture.execute(["valid text", "   "])).rejects.toThrow("blank text");
  });

  it("does not allow execution after disposal", async () => {
    const fixture = createDefaultEmbedFixture();

    fixture.dispose();

    await expect(fixture.execute("text after dispose")).rejects.toThrow("disposed");
  });
});
