type BrosTask = "token-classification" | "key-information-extraction";
type BrosClassName =
  | "BrosModel"
  | "BrosForTokenClassification"
  | "BrosSpadeEEForTokenClassification"
  | "BrosSpadeELForTokenClassification";
type BrosDependency = "transformers" | "torch" | "tokenizers";
type BrosDevice = "cpu" | "cuda" | "mps";

interface HardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface BrosModelInfo {
  description: string;
  className: BrosClassName;
  task: BrosTask;
  requiresBbox: boolean;
}

interface BrosPipelineInput {
  inputIds: number[];
  bbox: Array<[number, number, number, number]>;
  attentionMask: number[];
  boxFirstTokenMask?: boolean[];
}

interface BrosPipelineResult {
  model: string;
  device: BrosDevice;
  task: BrosTask;
  className: BrosClassName;
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency" | "invalid_input";
  pipelineMissingCore?: BrosDependency[];
  pipelineMissingDeps?: BrosDependency[];
  inputTokenCount?: number;
}

const DEFAULT_BROS_MODEL_ID = "jinho8345/bros-base-uncased";
const DEFAULT_DOCUMENT_WORDS = ["Invoice", "total", "$42.00"];

const BROS_MODELS_REGISTRY: Record<string, BrosModelInfo> = {
  [DEFAULT_BROS_MODEL_ID]: {
    description: "BROS base model for document key information extraction",
    className: "BrosModel",
    task: "key-information-extraction",
    requiresBbox: true,
  },
  "jinho8345/bros-base-uncased-token-classification": {
    description: "BROS base model with token classification head",
    className: "BrosForTokenClassification",
    task: "token-classification",
    requiresBbox: true,
  },
};

function selectPreferredDevice(capabilities: HardwareCapabilities): BrosDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadBrosModelInfo(modelId = DEFAULT_BROS_MODEL_ID): BrosModelInfo {
  const modelInfo = BROS_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown BROS model: ${modelId}`);
  }

  return modelInfo;
}

function normalizeBbox(
  bbox: [number, number, number, number],
  documentWidth: number,
  documentHeight: number,
): [number, number, number, number] {
  const [x0, y0, x1, y1] = bbox;

  return [x0 / documentWidth, y0 / documentHeight, x1 / documentWidth, y1 / documentHeight];
}

function createBoxFirstTokenMask(words: string[], maxSequenceLength: number): boolean[] {
  const mask = Array.from({ length: maxSequenceLength }, () => false);
  let cursor = 1;

  for (const word of words) {
    if (cursor >= maxSequenceLength - 1) {
      break;
    }

    mask[cursor] = true;
    cursor += tokenizeWord(word).length;
  }

  return mask;
}

function tokenizeWord(word: string): string[] {
  return word.trim().split(/\s+/).filter(Boolean);
}

function createPipelineInput(words = DEFAULT_DOCUMENT_WORDS): BrosPipelineInput {
  const contentTokenCount = words.flatMap(tokenizeWord).length;
  const inputIds = Array.from({ length: contentTokenCount + 2 }, (_, index) => index + 101);
  const bbox = words.map((_, index) =>
    normalizeBbox([10, 20 + index * 30, 210, 45 + index * 30], 1000, 1000),
  );

  return {
    inputIds,
    bbox,
    attentionMask: Array.from({ length: inputIds.length }, () => 1),
    boxFirstTokenMask: createBoxFirstTokenMask(words, inputIds.length),
  };
}

function createPipelineResult(
  modelId: string,
  capabilities: HardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "torch" | "tokenizers", boolean>>,
  input: BrosPipelineInput,
): BrosPipelineResult {
  const modelInfo = loadBrosModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectPreferredDevice(capabilities),
    task: modelInfo.task,
    className: modelInfo.className,
  };

  if (!dependencies.transformers || !dependencies.torch) {
    return {
      ...baseResult,
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: [
        ...(!dependencies.transformers ? ["transformers" as const] : []),
        ...(!dependencies.torch ? ["torch" as const] : []),
      ],
    };
  }

  if (!dependencies.tokenizers) {
    return {
      ...baseResult,
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["tokenizers"],
    };
  }

  if (modelInfo.requiresBbox && input.bbox.length === 0) {
    return {
      ...baseResult,
      pipelineSuccess: false,
      pipelineErrorType: "invalid_input",
    };
  }

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    inputTokenCount: input.inputIds.length,
  };
}

describe("BROS model conversion fixture", () => {
  it("keeps the BROS model registry from the Python source", () => {
    expect(Object.keys(BROS_MODELS_REGISTRY)).toEqual([
      "jinho8345/bros-base-uncased",
      "jinho8345/bros-base-uncased-token-classification",
    ]);
    expect(loadBrosModelInfo()).toEqual({
      description: "BROS base model for document key information extraction",
      className: "BrosModel",
      task: "key-information-extraction",
      requiresBbox: true,
    });
    expect(loadBrosModelInfo("jinho8345/bros-base-uncased-token-classification").className).toBe(
      "BrosForTokenClassification",
    );
  });

  it("rejects unknown BROS model identifiers explicitly", () => {
    expect(() => loadBrosModelInfo("jinho8345/bros-large-uncased")).toThrow(
      "Unknown BROS model: jinho8345/bros-large-uncased",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectPreferredDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("builds normalized BROS layout inputs with first-token masks", () => {
    const input = createPipelineInput(["Invoice", "total"]);

    expect(input.inputIds).toHaveLength(4);
    expect(input.attentionMask).toEqual([1, 1, 1, 1]);
    expect(input.bbox).toEqual([
      [0.01, 0.02, 0.21, 0.045],
      [0.01, 0.05, 0.21, 0.075],
    ]);
    expect(input.boxFirstTokenMask).toEqual([false, true, true, false]);
  });

  it("reports missing transformers and torch as core dependency failures", () => {
    const result = createPipelineResult(
      DEFAULT_BROS_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: false, torch: false, tokenizers: true },
      createPipelineInput(),
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers", "torch"],
    });
  });

  it("reports missing tokenizers separately from core runtime dependencies", () => {
    const result = createPipelineResult(
      DEFAULT_BROS_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, torch: true, tokenizers: false },
      createPipelineInput(),
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["tokenizers"],
    });
  });

  it("requires bounding boxes for BROS pipeline inputs", () => {
    const result = createPipelineResult(
      DEFAULT_BROS_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, torch: true, tokenizers: true },
      {
        inputIds: [101, 102],
        bbox: [],
        attentionMask: [1, 1],
      },
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "invalid_input",
    });
  });

  it("builds a successful pipeline result for valid BROS inputs", () => {
    const result = createPipelineResult(
      DEFAULT_BROS_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, torch: true, tokenizers: true },
      createPipelineInput(),
    );

    expect(result).toEqual({
      model: DEFAULT_BROS_MODEL_ID,
      device: "cpu",
      task: "key-information-extraction",
      className: "BrosModel",
      pipelineSuccess: true,
      pipelineErrorType: "none",
      inputTokenCount: 5,
    });
  });
});
