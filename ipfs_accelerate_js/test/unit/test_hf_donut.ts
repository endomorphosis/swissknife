type DonutTask = "document-question-answering";
type DonutClassName = "DonutProcessor";
type DonutDevice = "cpu" | "cuda" | "mps";
type DonutDependency = "transformers" | "pillow>=8.0.0" | "requests>=2.25.0";

interface DonutHardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface DonutModelInfo {
  description: string;
  className: DonutClassName;
  task: DonutTask;
}

interface DonutPipelineInput {
  imageUrl: string;
  question: string;
}

interface DonutPipelineResult {
  model: string;
  device: DonutDevice;
  task: DonutTask;
  className: DonutClassName;
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: DonutDependency[];
  pipelineMissingDeps?: DonutDependency[];
  inputSummary?: string;
  outputPreview?: string;
}

const DEFAULT_DONUT_MODEL_ID = "naver-clova-ix/donut-base-finetuned-docvqa";
const DEFAULT_DONUT_IMAGE_URL =
  "https://huggingface.co/datasets/hf-internal-testing/fixtures_docvqa/resolve/main/document.png";
const DEFAULT_DONUT_QUESTION = "What is the document title?";

const DONUT_MODELS_REGISTRY: Record<string, DonutModelInfo> = {
  [DEFAULT_DONUT_MODEL_ID]: {
    description: "Donut base model finetuned for document VQA",
    className: "DonutProcessor",
    task: "document-question-answering",
  },
  "naver-clova-ix/donut-base-finetuned-cord-v2": {
    description: "Donut base model finetuned for receipt parsing (CORD)",
    className: "DonutProcessor",
    task: "document-question-answering",
  },
};

function selectDonutDevice(capabilities: DonutHardwareCapabilities): DonutDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadDonutModelInfo(modelId = DEFAULT_DONUT_MODEL_ID): DonutModelInfo {
  const modelInfo = DONUT_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown Donut model: ${modelId}`);
  }

  return modelInfo;
}

function createDonutPipelineInput(input: Partial<DonutPipelineInput> = {}): DonutPipelineInput {
  const imageUrl = input.imageUrl?.trim() || DEFAULT_DONUT_IMAGE_URL;
  const question = input.question?.trim() || DEFAULT_DONUT_QUESTION;

  if (!/^https?:\/\//.test(imageUrl)) {
    throw new Error("Donut pipeline image URL must be absolute");
  }

  return {
    imageUrl,
    question,
  };
}

function previewDonutOutput(output: unknown, maxLength = 200): string {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

function createDonutPipelineResult(
  modelId: string,
  capabilities: DonutHardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "pillow" | "requests", boolean>>,
  input: Partial<DonutPipelineInput>,
  output: unknown,
): DonutPipelineResult {
  const modelInfo = loadDonutModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectDonutDevice(capabilities),
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

  const missingDeps: DonutDependency[] = [];

  if (!dependencies.pillow) {
    missingDeps.push("pillow>=8.0.0");
  }

  if (!dependencies.requests) {
    missingDeps.push("requests>=2.25.0");
  }

  if (missingDeps.length > 0) {
    return {
      ...baseResult,
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: missingDeps,
    };
  }

  const normalizedInput = createDonutPipelineInput(input);

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    inputSummary: `${normalizedInput.question} | ${normalizedInput.imageUrl}`,
    outputPreview: previewDonutOutput(output),
  };
}

class DonutMockDocumentQuestionAnsweringHandler {
  readonly implementationType = "MOCK";

  answer(input: Partial<DonutPipelineInput> = {}): {
    answer: string;
    implementationType: "MOCK";
    question: string;
    imageUrl: string;
  } {
    const normalizedInput = createDonutPipelineInput(input);

    return {
      answer: `mock answer for: ${normalizedInput.question}`,
      implementationType: this.implementationType,
      question: normalizedInput.question,
      imageUrl: normalizedInput.imageUrl,
    };
  }
}

describe("Donut model conversion fixture", () => {
  it("keeps the Donut model registry from the Python source", () => {
    expect(Object.keys(DONUT_MODELS_REGISTRY)).toEqual([
      "naver-clova-ix/donut-base-finetuned-docvqa",
      "naver-clova-ix/donut-base-finetuned-cord-v2",
    ]);
    expect(loadDonutModelInfo()).toEqual({
      description: "Donut base model finetuned for document VQA",
      className: "DonutProcessor",
      task: "document-question-answering",
    });
  });

  it("rejects unknown Donut model identifiers explicitly", () => {
    expect(() => loadDonutModelInfo("naver-clova-ix/donut-unknown")).toThrow(
      "Unknown Donut model: naver-clova-ix/donut-unknown",
    );
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectDonutDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectDonutDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectDonutDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("uses an absolute hosted document image and a non-empty question", () => {
    expect(createDonutPipelineInput()).toEqual({
      imageUrl: DEFAULT_DONUT_IMAGE_URL,
      question: DEFAULT_DONUT_QUESTION,
    });
    expect(() => createDonutPipelineInput({ imageUrl: "fixtures/document.png" })).toThrow(
      "Donut pipeline image URL must be absolute",
    );
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createDonutPipelineResult(
      DEFAULT_DONUT_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: false, pillow: true, requests: true },
      {},
      {},
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing image loading dependencies separately", () => {
    const result = createDonutPipelineResult(
      "naver-clova-ix/donut-base-finetuned-cord-v2",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pillow: false, requests: false },
      {},
      {},
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["pillow>=8.0.0", "requests>=2.25.0"],
    });
  });

  it("builds a successful document question answering result", () => {
    const result = createDonutPipelineResult(
      DEFAULT_DONUT_MODEL_ID,
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pillow: true, requests: true },
      { question: "What is the total?" },
      { answer: "123.45", confidence: 0.98 },
    );

    expect(result).toMatchObject({
      model: DEFAULT_DONUT_MODEL_ID,
      device: "cpu",
      task: "document-question-answering",
      className: "DonutProcessor",
      pipelineSuccess: true,
      pipelineErrorType: "none",
      inputSummary: `What is the total? | ${DEFAULT_DONUT_IMAGE_URL}`,
      outputPreview: "{\"answer\":\"123.45\",\"confidence\":0.98}",
    });
  });

  it("provides a deterministic mock document question answering handler", () => {
    const handler = new DonutMockDocumentQuestionAnsweringHandler();

    expect(handler.answer({ question: "What is the invoice number?" })).toEqual({
      answer: "mock answer for: What is the invoice number?",
      implementationType: "MOCK",
      question: "What is the invoice number?",
      imageUrl: DEFAULT_DONUT_IMAGE_URL,
    });
  });
});

export {};
