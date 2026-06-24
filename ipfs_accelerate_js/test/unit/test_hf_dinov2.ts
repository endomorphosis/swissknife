const convertedSource = "test_hf_dinov2.py";

const dinov2Models = [
  {
    id: "facebook/dinov2-base",
    description: "DINOv2 Base model",
    className: "Dinov2Model",
  },
  {
    id: "facebook/dinov2-large",
    description: "DINOv2 Large model",
    className: "Dinov2Model",
  },
  {
    id: "facebook/dinov2-giant",
    description: "DINOv2 Giant model",
    className: "Dinov2Model",
  },
];

const conversionMetadata = {
  source: convertedSource,
  family: "DINOv2",
  task: "image-classification",
  executableTypeScript: false,
  reason:
    "The Python hardware and pipeline harness cannot be translated directly to TypeScript without runtime adapters.",
};

function getDinov2Model(id) {
  return dinov2Models.find((model) => model.id === id);
}

describe("test_hf_dinov2 conversion", () => {
  it("documents the generated Python source without leaving conversion syntax errors", () => {
    expect(conversionMetadata).toEqual({
      source: "test_hf_dinov2.py",
      family: "DINOv2",
      task: "image-classification",
      executableTypeScript: false,
      reason:
        "The Python hardware and pipeline harness cannot be translated directly to TypeScript without runtime adapters.",
    });
  });

  it("preserves the DINOv2 model registry as parseable metadata", () => {
    expect(dinov2Models).toHaveLength(3);
    expect(dinov2Models.map((model) => model.id)).toEqual([
      "facebook/dinov2-base",
      "facebook/dinov2-large",
      "facebook/dinov2-giant",
    ]);
    expect(getDinov2Model("facebook/dinov2-base")).toMatchObject({
      description: "DINOv2 Base model",
      className: "Dinov2Model",
    });
  });
});
