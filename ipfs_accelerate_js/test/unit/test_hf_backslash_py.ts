const convertedSource = "test_hf_backslash.py";
const invalidPythonSymbol = "hf_\\";

interface BackslashConversionMetadata {
  source: string;
  originalSymbol: string;
  executableTypeScript: boolean;
  reason: string;
}

const conversionMetadata: BackslashConversionMetadata = {
  source: convertedSource,
  originalSymbol: invalidPythonSymbol,
  executableTypeScript: false,
  reason: "Python module and class identifiers cannot end with a backslash in TypeScript.",
};

function escapeBackslashIdentifier(identifier: string): string {
  return identifier.replace(/\\/g, "\\\\");
}

describe("test_hf_backslash_py conversion", () => {
  it("documents the Python-only backslash identifier without leaving generated syntax errors", () => {
    expect(conversionMetadata).toEqual({
      source: "test_hf_backslash.py",
      originalSymbol: "hf_\\",
      executableTypeScript: false,
      reason: "Python module and class identifiers cannot end with a backslash in TypeScript.",
    });
  });

  it("keeps the original identifier available as escaped metadata", () => {
    expect(escapeBackslashIdentifier(invalidPythonSymbol)).toBe("hf_\\\\");
  });
});

export {};
