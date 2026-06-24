const convertedSource = "test_hf___list_only.py";
const cliFlag = "--list-only";

interface GeneratedConversionMetadata {
  source: string;
  kind: "cli-option";
  option: string;
  generatedModelTest: boolean;
}

const conversionMetadata: GeneratedConversionMetadata = {
  source: convertedSource,
  kind: "cli-option",
  option: cliFlag,
  generatedModelTest: false,
};

describe("test_hf___list_only conversion", () => {
  it("records --list-only as a CLI option instead of a generated model test", () => {
    expect(conversionMetadata).toEqual({
      source: "test_hf___list_only.py",
      kind: "cli-option",
      option: "--list-only",
      generatedModelTest: false,
    });
  });

  it("keeps the converted source metadata parseable", () => {
    expect(convertedSource).toMatch(/^test_hf___list_only\.py$/);
    expect(cliFlag).toMatch(/^--[a-z-]+$/);
  });
});

export {};
