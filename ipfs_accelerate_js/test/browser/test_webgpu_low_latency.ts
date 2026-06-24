import WebgpuLowLatencyOptimizer, {
  createWebgpuLowLatencyOptimizer,
  WebgpuLowLatencyOptimizer as NamedWebgpuLowLatencyOptimizer,
} from "../../src/hardware/webgpu/webgpu_low_latency_optimizer";

describe("WebgpuLowLatencyOptimizer", () => {
  it("exports the optimizer class as both named and default APIs", () => {
    expect(WebgpuLowLatencyOptimizer).toBe(NamedWebgpuLowLatencyOptimizer);
  });

  it("creates optimizer instances through the constructor and factory", () => {
    const constructed = new WebgpuLowLatencyOptimizer({
      latencyOptimized: true,
      streamBufferSize: 1,
    });
    const created = createWebgpuLowLatencyOptimizer({
      latencyOptimized: true,
      streamBufferSize: 1,
    });

    expect(constructed).toBeInstanceOf(WebgpuLowLatencyOptimizer);
    expect(created).toBeInstanceOf(WebgpuLowLatencyOptimizer);
  });

  it("supports the current async lifecycle contract", async () => {
    const optimizer = createWebgpuLowLatencyOptimizer({
      browser: "chrome",
      deviceProfile: "mid_range",
    });

    await expect(optimizer.initialize()).resolves.toBeUndefined();
    await expect(
      optimizer.execute({
        prompt: "stream this response",
        latencyOptimized: true,
      }),
    ).resolves.toEqual({ success: true });
    expect(() => optimizer.dispose()).not.toThrow();
  });
});
