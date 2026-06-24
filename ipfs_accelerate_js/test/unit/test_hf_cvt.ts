interface CvtModelRegistryEntry {
  description: string;
  className: "CvtModel";
  task: "image-classification";
}

const cvtModelsRegistry: Record<string, CvtModelRegistryEntry> = {
  "microsoft/cvt-13": {
    description: "CVT image classification model",
    className: "CvtModel",
    task: "image-classification",
  },
};

function getCvtModelInfo(modelId = "microsoft/cvt-13"): CvtModelRegistryEntry {
  const modelInfo = cvtModelsRegistry[modelId];

  if (!modelInfo) {
    throw new Error(`Unsupported CVT model: ${modelId}`);
  }

  return modelInfo;
}

describe("hf_cvt conversion metadata", () => {
  it("keeps the default CVT model registry entry parseable", () => {
    expect(getCvtModelInfo()).toEqual({
      description: "CVT image classification model",
      className: "CvtModel",
      task: "image-classification",
    });
  });

  it("rejects unknown CVT model ids", () => {
    expect(() => getCvtModelInfo("unknown/cvt")).toThrow("Unsupported CVT model: unknown/cvt");
  });
});

export {};
