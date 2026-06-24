const CONVNEXT_FIXTURE = {
  familyName: "ConvNeXT",
  description: "ConvNeXT vision models",
  defaultModel: "facebook/convnext-base-224",
  testClass: "TestConvNextModels",
  moduleName: "test_hf_convnext",
  tasks: ["image-classification"],
  imageUrl: "http://images.cocodataset.org/val2017/000000039769.jpg",
  dependencies: ["transformers", "pillow", "requests"],
  models: {
    "facebook/convnext-base-224": {
      description: "ConvNeXT Base (224x224)",
      className: "ConvNextForImageClassification",
    },
    "facebook/convnext-large-224": {
      description: "ConvNeXT Large (224x224)",
      className: "ConvNextForImageClassification",
    },
  },
};

function listConvNextModels() {
  return Object.keys(CONVNEXT_FIXTURE.models);
}

function getConvNextModelInfo(modelId = CONVNEXT_FIXTURE.defaultModel) {
  const modelInfo = CONVNEXT_FIXTURE.models[modelId];

  if (!modelInfo) {
    throw new Error(`Unknown ConvNeXT model: ${modelId}`);
  }

  return modelInfo;
}

function buildPipelineArgs(modelId = CONVNEXT_FIXTURE.defaultModel, device = "cpu") {
  const modelInfo = getConvNextModelInfo(modelId);

  return {
    task: CONVNEXT_FIXTURE.tasks[0],
    model: modelId,
    className: modelInfo.className,
    device,
    input: CONVNEXT_FIXTURE.imageUrl,
  };
}

describe("ConvNeXT generated model fixture", () => {
  it("keeps the converted registry metadata parseable", () => {
    expect(CONVNEXT_FIXTURE).toMatchObject({
      familyName: "ConvNeXT",
      description: "ConvNeXT vision models",
      defaultModel: "facebook/convnext-base-224",
      testClass: "TestConvNextModels",
      moduleName: "test_hf_convnext",
      tasks: ["image-classification"],
      dependencies: ["transformers", "pillow", "requests"],
    });
  });

  it("lists both ConvNeXT image-classification models from the generated source", () => {
    expect(listConvNextModels()).toEqual([
      "facebook/convnext-base-224",
      "facebook/convnext-large-224",
    ]);
    expect(getConvNextModelInfo("facebook/convnext-large-224")).toEqual({
      description: "ConvNeXT Large (224x224)",
      className: "ConvNextForImageClassification",
    });
  });

  it("uses the base model and COCO image URL for default pipeline args", () => {
    expect(buildPipelineArgs()).toEqual({
      task: "image-classification",
      model: "facebook/convnext-base-224",
      className: "ConvNextForImageClassification",
      device: "cpu",
      input: "http://images.cocodataset.org/val2017/000000039769.jpg",
    });
  });

  it("allows an explicit registered model and device", () => {
    expect(buildPipelineArgs("facebook/convnext-large-224", "cuda")).toMatchObject({
      model: "facebook/convnext-large-224",
      device: "cuda",
      className: "ConvNextForImageClassification",
    });
  });

  it("rejects unknown ConvNeXT model ids explicitly", () => {
    expect(() => getConvNextModelInfo("facebook/convnext-tiny-224")).toThrow(
      "Unknown ConvNeXT model: facebook/convnext-tiny-224",
    );
  });
});
