type CodeGenTask = "text-generation";
type CodeGenClassName = "AutoModelForCausalLM";
type CodeGenDevice = "cpu" | "cuda";
type CodeGenDependency = "transformers" | "torch";

interface HardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
}

interface CodeGenModelInfo {
  description: string;
  className: CodeGenClassName;
  task: CodeGenTask;
}

interface CodeGenPipelineResult {
  model: string;
  device: CodeGenDevice;
  task: CodeGenTask;
  className: CodeGenClassName;
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: CodeGenDependency[];
  generatedText?: string;
  tokenCount?: number;
}

const DEFAULT_CODEGEN_MODEL_ID = "Salesforce/codegen-350M-mono";
const DEFAULT_PROMPT = "def fibonacci(n):";

const CODEGEN_MODELS_REGISTRY: Record<string, CodeGenModelInfo> = {
  [DEFAULT_CODEGEN_MODEL_ID]: {
    description: "CodeGen 350M mono model for Python code generation",
    className: "AutoModelForCausalLM",
    task: "text-generation",
  },
  "Salesforce/codegen-350M-multi": {
    description: "CodeGen 350M multilingual model for code generation",
    className: "AutoModelForCausalLM",
    task: "text-generation",
  },
};

function selectPreferredDevice(capabilities: HardwareCapabilities, forceCpu = false): CodeGenDevice {
  if (capabilities.cuda && !forceCpu) {
    return "cuda";
  }

  return "cpu";
}

function loadCodeGenModelInfo(modelId = DEFAULT_CODEGEN_MODEL_ID): CodeGenModelInfo {
  const modelInfo = CODEGEN_MODELS_REGISTRY[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown CodeGen model: ${modelId}`);
  }

  return modelInfo;
}

function createGeneratedCode(prompt: string): string {
  const trimmedPrompt = prompt.trim();

  if (trimmedPrompt.includes("fibonacci")) {
    return [
      trimmedPrompt,
      "    if n <= 1:",
      "        return n",
      "    return fibonacci(n - 1) + fibonacci(n - 2)",
    ].join("\n");
  }

  if (trimmedPrompt.includes("sort")) {
    return [trimmedPrompt, "    return sorted(items)"].join("\n");
  }

  return [trimmedPrompt, "    return None"].join("\n");
}

function createPipelineResult(
  modelId: string,
  capabilities: HardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "torch", boolean>>,
  prompt = DEFAULT_PROMPT,
  forceCpu = false,
): CodeGenPipelineResult {
  const modelInfo = loadCodeGenModelInfo(modelId);
  const baseResult = {
    model: modelId,
    device: selectPreferredDevice(capabilities, forceCpu),
    task: modelInfo.task,
    className: modelInfo.className,
  };
  const missingCore: CodeGenDependency[] = [];

  if (!dependencies.transformers) {
    missingCore.push("transformers");
  }

  if (!dependencies.torch) {
    missingCore.push("torch");
  }

  if (missingCore.length > 0) {
    return {
      ...baseResult,
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: missingCore,
    };
  }

  const generatedText = createGeneratedCode(prompt);

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    generatedText,
    tokenCount: generatedText.split(/\s+/).length,
  };
}

describe("CodeGen model conversion fixture", () => {
  it("keeps the CodeGen model registry from the Python source", () => {
    expect(Object.keys(CODEGEN_MODELS_REGISTRY)).toEqual([
      "Salesforce/codegen-350M-mono",
      "Salesforce/codegen-350M-multi",
    ]);
    expect(loadCodeGenModelInfo()).toEqual({
      description: "CodeGen 350M mono model for Python code generation",
      className: "AutoModelForCausalLM",
      task: "text-generation",
    });
  });

  it("rejects unknown CodeGen model identifiers explicitly", () => {
    expect(() => loadCodeGenModelInfo("Salesforce/codegen-unknown")).toThrow(
      "Unknown CodeGen model: Salesforce/codegen-unknown",
    );
  });

  it("selects CUDA unless CPU is forced", () => {
    expect(selectPreferredDevice({ cpu: true, cuda: true })).toBe("cuda");
    expect(selectPreferredDevice({ cpu: true, cuda: true }, true)).toBe("cpu");
    expect(selectPreferredDevice({ cpu: true, cuda: false })).toBe("cpu");
  });

  it("reports missing runtime dependencies as core failures", () => {
    const result = createPipelineResult(
      DEFAULT_CODEGEN_MODEL_ID,
      { cpu: true, cuda: false },
      { transformers: false, torch: false },
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers", "torch"],
    });
  });

  it("builds a deterministic code generation result when dependencies are available", () => {
    const result = createPipelineResult(
      DEFAULT_CODEGEN_MODEL_ID,
      { cpu: true, cuda: false },
      { transformers: true, torch: true },
      "def sort_items(items):",
    );

    expect(result).toMatchObject({
      model: DEFAULT_CODEGEN_MODEL_ID,
      device: "cpu",
      task: "text-generation",
      className: "AutoModelForCausalLM",
      pipelineSuccess: true,
      pipelineErrorType: "none",
      generatedText: "def sort_items(items):\n    return sorted(items)",
    });
    expect(result.tokenCount).toBeGreaterThan(2);
  });
});

export {};
