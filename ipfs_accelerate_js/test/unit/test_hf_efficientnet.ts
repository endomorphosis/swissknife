const EFFICIENTNET_MODEL_REGISTRY = {
  "efficientnet-base": {
    className: "EfficientnetModel",
    description: "EfficientNet image classification model",
    task: "image-classification",
  },
};

function selectPreferredDevice(capabilities) {
  if (capabilities.cuda) {
    return "cuda";
  }

  if (capabilities.mps) {
    return "mps";
  }

  if (capabilities.openvino) {
    return "openvino";
  }

  return "cpu";
}

function createEfficientnetHarness(
  modelId = "efficientnet-base",
  capabilities = {
    cpu: true,
    cuda: false,
    mps: false,
    openvino: false,
  },
) {
  const modelInfo = EFFICIENTNET_MODEL_REGISTRY[modelId];

  if (!modelInfo) {
    throw new RangeError(`Unknown EfficientNet model: ${modelId}`);
  }

  return {
    modelId,
    className: modelInfo.className,
    description: modelInfo.description,
    task: modelInfo.task,
    preferredDevice: selectPreferredDevice(capabilities),
    createPipelineResult(hasTransformers) {
      if (!hasTransformers) {
        return {
          model: modelId,
          device: selectPreferredDevice(capabilities),
          task: modelInfo.task,
          class: modelInfo.className,
          pipelineSuccess: false,
          pipelineErrorType: "missing_dependency",
          pipelineMissingCore: ["transformers"],
        };
      }

      return {
        model: modelId,
        device: selectPreferredDevice(capabilities),
        task: modelInfo.task,
        class: modelInfo.className,
        pipelineSuccess: true,
        pipelineErrorType: "none",
      };
    },
  };
}

describe("EfficientNet model harness", () => {
  it("uses valid EfficientNet metadata for image classification", () => {
    const harness = createEfficientnetHarness();

    expect(harness.modelId).toBe("efficientnet-base");
    expect(harness.className).toBe("EfficientnetModel");
    expect(harness.description).toContain("EfficientNet");
    expect(harness.task).toBe("image-classification");
  });

  it("prefers accelerated hardware before falling back to CPU", () => {
    expect(
      createEfficientnetHarness("efficientnet-base", {
        cpu: true,
        cuda: true,
        mps: true,
        openvino: true,
      }).preferredDevice,
    ).toBe("cuda");
    expect(
      createEfficientnetHarness("efficientnet-base", {
        cpu: true,
        cuda: false,
        mps: true,
        openvino: true,
      }).preferredDevice,
    ).toBe("mps");
    expect(createEfficientnetHarness().preferredDevice).toBe("cpu");
  });

  it("reports missing transformer dependencies without attempting inference", () => {
    const result = createEfficientnetHarness().createPipelineResult(false);

    expect(result).toMatchObject({
      model: "efficientnet-base",
      device: "cpu",
      task: "image-classification",
      class: "EfficientnetModel",
      pipelineSuccess: false,
      pipelineErrorType: "missing_dependency",
      pipelineMissingCore: ["transformers"],
    });
  });

  it("rejects unknown EfficientNet model IDs", () => {
    expect(() => createEfficientnetHarness("not-a-real-model")).toThrow(
      "Unknown EfficientNet model",
    );
  });
});
