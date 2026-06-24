const convertedSource = "test_hf_decision_transformer.py";

const defaultDecisionTransformerModel = {
  modelId: "decision-transformer-base",
  description: "DECISION_TRANSFORMER models",
  className: "DecisionTransformerModel",
  task: "reinforcement-learning",
  requiresTransformersRuntime: true,
};

const conversionMetadata = {
  source: convertedSource,
  generatedModelTest: true,
  executableTypeScript: false,
  reason:
    "The Python-to-TypeScript conversion emitted placeholder template tokens; keep the recovered Decision Transformer metadata parseable until a runtime test is regenerated.",
  defaultModel: defaultDecisionTransformerModel,
};

describe("test_hf_decision_transformer conversion", () => {
  it("records the Decision Transformer model metadata recovered from the generated Python test", () => {
    expect(conversionMetadata).toEqual({
      source: "test_hf_decision_transformer.py",
      generatedModelTest: true,
      executableTypeScript: false,
      reason:
        "The Python-to-TypeScript conversion emitted placeholder template tokens; keep the recovered Decision Transformer metadata parseable until a runtime test is regenerated.",
      defaultModel: {
        modelId: "decision-transformer-base",
        description: "DECISION_TRANSFORMER models",
        className: "DecisionTransformerModel",
        task: "reinforcement-learning",
        requiresTransformersRuntime: true,
      },
    });
  });

  it("keeps the default Decision Transformer model configuration internally consistent", () => {
    expect(defaultDecisionTransformerModel.modelId).toBe("decision-transformer-base");
    expect(defaultDecisionTransformerModel.className).toBe("DecisionTransformerModel");
    expect(defaultDecisionTransformerModel.task).toBe("reinforcement-learning");
    expect(defaultDecisionTransformerModel.requiresTransformersRuntime).toBe(true);
  });
});

export {};
