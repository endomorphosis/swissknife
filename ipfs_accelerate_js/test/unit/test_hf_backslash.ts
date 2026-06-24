const convertedSource = "test_hf_backslash.py";
const literalToken = "\\";

interface GeneratedConversionMetadata {
  source: string;
  kind: "escaped-literal-token";
  token: string;
  generatedModelTest: boolean;
  reason: string;
}

const conversionMetadata: GeneratedConversionMetadata = {
  source: convertedSource,
  kind: "escaped-literal-token",
  token: literalToken,
  generatedModelTest: false,
  reason: "A standalone backslash is syntax metadata, not a Hugging Face model id.",
};

describe("test_hf_backslash conversion", () => {
  it("records the backslash as an escaped literal instead of a generated model test", () => {
    expect(conversionMetadata).toEqual({
      source: "test_hf_backslash.py",
      kind: "escaped-literal-token",
      token: "\\",
      generatedModelTest: false,
      reason: "A standalone backslash is syntax metadata, not a Hugging Face model id.",
    });
  });

  it("keeps the converted source metadata parseable", () => {
    expect(convertedSource).toMatch(/^test_hf_backslash\.py$/);
    expect(literalToken).toBe("\\");
    expect(literalToken).toHaveLength(1);
  });
});

export {};
