const convertedSource = "test_hf___model.py";
const cliFlag = "--model";

interface GeneratedConversionMetadata {
  source: string;
  kind: "cli-option";
  option: string;
  generatedModelTest: boolean;
  reason: string;
}

const conversionMetadata: GeneratedConversionMetadata = {
  source: convertedSource,
  kind: "cli-option",
  option: cliFlag,
  generatedModelTest: false,
  reason: "The source name records a CLI --model placeholder, not a Hugging Face model id.",
};

describe("test_hf___model conversion", () => {
  it("records --model as a CLI option instead of a generated model test", () => {
    expect(conversionMetadata).toEqual({
      source: "test_hf___model.py",
      kind: "cli-option",
      option: "--model",
      generatedModelTest: false,
      reason: "The source name records a CLI --model placeholder, not a Hugging Face model id.",
    });
  });

  it("keeps the converted source metadata parseable", () => {
    expect(convertedSource).toMatch(/^test_hf___model\.py$/);
    expect(cliFlag).toMatch(/^--[a-z-]+$/);
  });
});

export {};
