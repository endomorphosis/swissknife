type EsmDevice = "cpu" | "cuda" | "mps";
type EsmDependency = "transformers" | "tokenizers>=0.11.0";

interface EsmModelInfo {
  description: string;
  className: "EsmForProteinFolding";
  task: "protein-folding";
}

interface EsmHardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface EsmPipelineResult {
  model: string;
  device: EsmDevice;
  task: "protein-folding";
  className: "EsmForProteinFolding";
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: EsmDependency[];
  pipelineMissingDeps?: EsmDependency[];
  outputPreview?: string;
}

const ESM_MODELS_REGISTRY: Record<string, EsmModelInfo> = {
  "facebook/esm2_t33_650M_UR50D": {
    description: "ESM-2 model with 33 layers and 650M parameters",
    className: "EsmForProteinFolding",
    task: "protein-folding",
  },
  "facebook/esm2_t6_8M_UR50D": {
    description: "ESM-2 model with 6 layers and 8M parameters",
    className: "EsmForProteinFolding",
    task: "protein-folding",
  },
};

const DEFAULT_ESM_SEQUENCE = "MKTVRQERLKSIVRILERSKEPVSGAQLAEELSVSRQVIVQDIAYLRSLGYNIVATPRGYVLAGG";

function selectEsmDevice(capabilities: EsmHardwareCapabilities): EsmDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadEsmModelInfo(modelId = "facebook/esm2_t33_650M_UR50D"): EsmModelInfo {
  const modelInfo = ESM_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown ESM model: ${modelId}`);
  }

  return modelInfo;
}

function previewEsmOutput(output: unknown, maxLength = 200): string {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

function createEsmPipelineResult(
  modelId: string,
  capabilities: EsmHardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "tokenizers", boolean>>,
  output: unknown,
): EsmPipelineResult {
  const modelInfo = loadEsmModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectEsmDevice(capabilities),
    task: modelInfo.task,
    className: modelInfo.className,
  };

  if (!dependencies.transformers) {
    return {
      ...baseResult,
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    };
  }

  if (!dependencies.tokenizers) {
    return {
      ...baseResult,
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["tokenizers>=0.11.0"],
    };
  }

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    outputPreview: previewEsmOutput(output),
  };
}

describe("ESM model conversion fixture", () => {
  it("keeps the ESM model registry from the Python source", () => {
    expect(Object.keys(ESM_MODELS_REGISTRY)).toEqual([
      "facebook/esm2_t33_650M_UR50D",
      "facebook/esm2_t6_8M_UR50D",
    ]);
    expect(loadEsmModelInfo("facebook/esm2_t33_650M_UR50D")).toEqual({
      description: "ESM-2 model with 33 layers and 650M parameters",
      className: "EsmForProteinFolding",
      task: "protein-folding",
    });
    expect(loadEsmModelInfo("facebook/esm2_t6_8M_UR50D").description).toContain("8M parameters");
  });

  it("rejects unknown ESM model identifiers explicitly", () => {
    expect(() => loadEsmModelInfo("facebook/esm2_t12_35M_UR50D")).toThrow(
      "Unknown ESM model: facebook/esm2_t12_35M_UR50D",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectEsmDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectEsmDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectEsmDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createEsmPipelineResult(
      "facebook/esm2_t33_650M_UR50D",
      { cpu: true, cuda: false, mps: false },
      { transformers: false, tokenizers: true },
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing tokenizers separately from core transformers", () => {
    const result = createEsmPipelineResult(
      "facebook/esm2_t33_650M_UR50D",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: false },
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["tokenizers>=0.11.0"],
    });
  });

  it("builds a successful protein-folding pipeline result with a bounded output preview", () => {
    const result = createEsmPipelineResult(
      "facebook/esm2_t6_8M_UR50D",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, tokenizers: true },
      {
        sequence: DEFAULT_ESM_SEQUENCE,
        positions: Array.from({ length: 80 }, (_, index) => ({
          residue: DEFAULT_ESM_SEQUENCE[index % DEFAULT_ESM_SEQUENCE.length],
          coordinates: [index, index + 0.1, index + 0.2],
        })),
      },
    );

    expect(result).toMatchObject({
      model: "facebook/esm2_t6_8M_UR50D",
      device: "cpu",
      task: "protein-folding",
      className: "EsmForProteinFolding",
      pipelineSuccess: true,
      pipelineErrorType: "none",
    });
    expect(result.outputPreview).toHaveLength(203);
    expect(result.outputPreview?.endsWith("...")).toBe(true);
  });
});
