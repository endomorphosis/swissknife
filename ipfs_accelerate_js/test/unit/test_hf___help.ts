const convertedSource = "test_hf___help.py";
const cliFlag = "--help";

interface GeneratedConversionMetadata {
  source: string;
  kind: "cli-option";
  option: string;
  generatedModelTest: boolean;
  emitsUsage: boolean;
}

const conversionMetadata: GeneratedConversionMetadata = {
  source: convertedSource,
  kind: "cli-option",
  option: cliFlag,
  generatedModelTest: false,
  emitsUsage: true,
};

describe("test_hf___help conversion", () => {
  it("records --help as a CLI option instead of a generated model test", () => {
    expect(conversionMetadata).toEqual({
      source: "test_hf___help.py",
      kind: "cli-option",
      option: "--help",
      generatedModelTest: false,
      emitsUsage: true,
    });
  });

  it("keeps the converted source metadata parseable", () => {
    expect(convertedSource).toMatch(/^test_hf___help\.py$/);
    expect(cliFlag).toMatch(/^--[a-z-]+$/);
  });
});

export {};
