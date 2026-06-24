import WebgpuComputeShaders, {
  WebgpuComputeShaders as WebgpuComputeShadersClass,
  createWebgpuComputeShaders,
} from "../../src/hardware/webgpu/webgpu_compute_shaders";

describe("WebGPU compute shader browser contract", () => {
  it("constructs the default compute shader implementation", () => {
    const shaders = new WebgpuComputeShaders();

    expect(shaders).toBeInstanceOf(WebgpuComputeShadersClass);
    expect(shaders).toBeInstanceOf(WebgpuComputeShaders);
  });

  it("creates equivalent instances through the factory export", () => {
    const shaders = createWebgpuComputeShaders({ bits: 4, adaptivePrecision: true });

    expect(shaders).toBeInstanceOf(WebgpuComputeShadersClass);
  });

  it("initializes and executes a simulated compute shader request", async () => {
    const shaders = createWebgpuComputeShaders();

    await expect(shaders.initialize()).resolves.toBeUndefined();
    await expect(
      shaders.execute({
        operation: "matmul",
        bits: 4,
        browser: "chrome",
      }),
    ).resolves.toEqual({ success: true });
  });

  it("allows repeated disposal without leaking browser resources", () => {
    const shaders = createWebgpuComputeShaders();

    expect(() => {
      shaders.dispose();
      shaders.dispose();
    }).not.toThrow();
  });
});
