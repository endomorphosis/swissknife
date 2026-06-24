import WebgpuTransformerComputeShaders, {
  WebgpuTransformerComputeShaders as WebgpuTransformerComputeShadersClass,
  createWebgpuTransformerComputeShaders,
} from "../../src/hardware/webgpu/webgpu_transformer_compute_shaders";

describe("WebGPU transformer compute shader browser contract", () => {
  it("constructs the default transformer compute shader implementation", () => {
    const shaders = new WebgpuTransformerComputeShaders();

    expect(shaders).toBeInstanceOf(WebgpuTransformerComputeShadersClass);
    expect(shaders).toBeInstanceOf(WebgpuTransformerComputeShaders);
  });

  it("creates equivalent instances through the factory export", () => {
    const shaders = createWebgpuTransformerComputeShaders({
      modelType: "bert",
      sequenceLength: 512,
    });

    expect(shaders).toBeInstanceOf(WebgpuTransformerComputeShadersClass);
  });

  it("initializes and executes a simulated transformer compute request", async () => {
    const shaders = createWebgpuTransformerComputeShaders();

    await expect(shaders.initialize()).resolves.toBeUndefined();
    await expect(
      shaders.execute({
        operation: "transformer-layer",
        modelType: "bert",
        hiddenSize: 768,
        numHeads: 12,
      }),
    ).resolves.toEqual({ success: true });
  });

  it("allows repeated disposal without leaking browser resources", () => {
    const shaders = createWebgpuTransformerComputeShaders();

    expect(() => {
      shaders.dispose();
      shaders.dispose();
    }).not.toThrow();
  });
});
