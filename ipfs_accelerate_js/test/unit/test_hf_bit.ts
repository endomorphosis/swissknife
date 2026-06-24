type BitTask = "image-classification";
type BitClassName = "ViTForImageClassification" | "DeiTForImageClassification";
type BitDependency = "transformers" | "PIL" | "requests";
type BitDevice = "cpu" | "cuda" | "mps";

interface BitModelInfo {
  description: string;
  className: BitClassName;
  task: BitTask;
}

interface HardwareCapabilities {
  cpu: boolean;
  cuda: boolean;
  mps: boolean;
}

interface BitPipelineResult {
  model: string;
  device: BitDevice;
  task: BitTask;
  className: BitClassName;
  pipelineSuccess: boolean;
  pipelineErrorType: "none" | "missing_dependency";
  pipelineMissingCore?: BitDependency[];
  pipelineMissingDeps?: BitDependency[];
  input?: {
    kind: "image-url";
    value: string;
  };
  outputPreview?: string;
}

const DEFAULT_BIT_MODEL_ID = "google/vit-base-patch16-224";
const DEFAULT_IMAGE_URL = "http://images.cocodataset.org/val2017/000000039769.jpg";

const BIT_MODELS_REGISTRY: Record<string, BitModelInfo> = {
  "google/vit-base-patch16-224": {
    description: "ViT Base model (patch size 16, image size 224)",
    className: "ViTForImageClassification",
    task: "image-classification",
  },
  "facebook/deit-base-patch16-224": {
    description: "DeiT Base model (patch size 16, image size 224)",
    className: "DeiTForImageClassification",
    task: "image-classification",
  },
};

function selectPreferredDevice(capabilities: HardwareCapabilities): BitDevice {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  return "cpu";
}

function loadBitModelInfo(modelId = DEFAULT_BIT_MODEL_ID): BitModelInfo {
  return BIT_MODELS_REGISTRY[modelId] ?? BIT_MODELS_REGISTRY[DEFAULT_BIT_MODEL_ID];
}

function createImageInput(imageUrl = DEFAULT_IMAGE_URL): BitPipelineResult["input"] {
  return {
    kind: "image-url",
    value: imageUrl,
  };
}

function createPipelineResult(
  modelId: string,
  capabilities: HardwareCapabilities,
  dependencies: Partial<Record<"transformers" | "pil" | "requests", boolean>>,
  output: unknown,
): BitPipelineResult {
  const modelInfo = loadBitModelInfo(modelId);
  const resolvedModelId = modelId in BIT_MODELS_REGISTRY ? modelId : DEFAULT_BIT_MODEL_ID;
  const baseResult = {
    model: resolvedModelId,
    device: selectPreferredDevice(capabilities),
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

  const missingImageDependencies: BitDependency[] = [];

  if (!dependencies.pil) {
    missingImageDependencies.push("PIL");
  }

  if (!dependencies.requests) {
    missingImageDependencies.push("requests");
  }

  if (missingImageDependencies.length > 0) {
    return {
      ...baseResult,
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: missingImageDependencies,
    };
  }

  return {
    ...baseResult,
    pipelineSuccess: true,
    pipelineErrorType: "none",
    input: createImageInput(),
    outputPreview: previewPipelineOutput(output),
  };
}

function previewPipelineOutput(output: unknown, maxLength = 200): string {
  const serialized = typeof output === "string" ? output : JSON.stringify(output);

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}...`;
}

describe("BIT model conversion fixture", () => {
  it("keeps the vision model registry from the Python source", () => {
    expect(Object.keys(BIT_MODELS_REGISTRY)).toEqual([
      "google/vit-base-patch16-224",
      "facebook/deit-base-patch16-224",
    ]);
    expect(loadBitModelInfo("google/vit-base-patch16-224")).toEqual({
      description: "ViT Base model (patch size 16, image size 224)",
      className: "ViTForImageClassification",
      task: "image-classification",
    });
    expect(loadBitModelInfo("facebook/deit-base-patch16-224").className).toBe("DeiTForImageClassification");
  });

  it("falls back to the default model for unknown identifiers", () => {
    expect(loadBitModelInfo("unknown/bit-model")).toEqual(BIT_MODELS_REGISTRY[DEFAULT_BIT_MODEL_ID]);
  });

  it("selects CUDA before MPS and falls back to CPU", () => {
    expect(selectPreferredDevice({ cpu: true, cuda: true, mps: true })).toBe("cuda");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: true })).toBe("mps");
    expect(selectPreferredDevice({ cpu: true, cuda: false, mps: false })).toBe("cpu");
  });

  it("creates deterministic image-url pipeline input metadata", () => {
    expect(createImageInput()).toEqual({
      kind: "image-url",
      value: "http://images.cocodataset.org/val2017/000000039769.jpg",
    });
  });

  it("reports missing transformers as a core dependency failure", () => {
    const result = createPipelineResult(
      "google/vit-base-patch16-224",
      { cpu: true, cuda: false, mps: false },
      { transformers: false, pil: true, requests: true },
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("reports missing image dependencies separately from transformers", () => {
    const result = createPipelineResult(
      "facebook/deit-base-patch16-224",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pil: false, requests: false },
      [],
    );

    expect(result).toMatchObject({
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingDeps: ["PIL", "requests"],
    });
  });

  it("builds a successful pipeline result with a bounded output preview", () => {
    const result = createPipelineResult(
      "unknown/bit-model",
      { cpu: true, cuda: false, mps: false },
      { transformers: true, pil: true, requests: true },
      [{ label: "tabby cat", score: 0.98, detail: "x".repeat(220) }],
    );

    expect(result).toMatchObject({
      model: DEFAULT_BIT_MODEL_ID,
      device: "cpu",
      task: "image-classification",
      className: "ViTForImageClassification",
      pipelineSuccess: true,
      pipelineErrorType: "none",
      input: createImageInput(),
    });
    expect(result.outputPreview).toHaveLength(203);
    expect(result.outputPreview?.endsWith("...")).toBe(true);
  });
});

export {};
