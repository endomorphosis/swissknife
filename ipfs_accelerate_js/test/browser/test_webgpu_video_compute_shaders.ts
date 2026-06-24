import WebgpuVideoComputeShaders, {
  WebgpuVideoComputeShaders as WebgpuVideoComputeShadersClass,
  createWebgpuVideoComputeShaders,
} from "../../src/hardware/webgpu/webgpu_video_compute_shaders";

describe("WebGPU video compute shader browser contract", () => {
  it("constructs the default video compute shader implementation", () => {
    const shaders = new WebgpuVideoComputeShaders();

    expect(shaders).toBeInstanceOf(WebgpuVideoComputeShadersClass);
    expect(shaders).toBeInstanceOf(WebgpuVideoComputeShaders);
  });

  it("creates equivalent instances through the factory export", () => {
    const shaders = createWebgpuVideoComputeShaders({
      modelType: "xclip",
      frameCount: 8,
    });

    expect(shaders).toBeInstanceOf(WebgpuVideoComputeShadersClass);
  });

  it("initializes and executes a simulated video compute shader request", async () => {
    const shaders = createWebgpuVideoComputeShaders();

    await expect(shaders.initialize()).resolves.toBeUndefined();
    await expect(
      shaders.execute({
        modelType: "xclip",
        frames: 8,
        operation: "temporal_fusion",
      }),
    ).resolves.toEqual({ success: true });
  });

  it("allows repeated disposal without leaking browser resources", () => {
    const shaders = createWebgpuVideoComputeShaders();

    expect(() => {
      shaders.dispose();
      shaders.dispose();
    }).not.toThrow();
  });
});
