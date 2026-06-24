import { automated_hardware_selection } from "../../src/utils/automated_hardware_selection";

describe("automated_hardware_selection", () => {
  it("returns a selector with an executable hardware-selection contract", async () => {
    const selector = automated_hardware_selection({
      modelFamily: "embedding",
      modelName: "bert-base-uncased",
      mode: "inference",
      availableHardware: ["cpu", "cuda", "openvino"],
    });

    expect(selector).toEqual({
      execute: expect.any(Function),
      dispose: expect.any(Function),
    });

    await expect(selector.execute({ batchSize: 1 })).resolves.toEqual({
      success: true,
    });

    expect(() => selector.dispose()).not.toThrow();
  });
});
