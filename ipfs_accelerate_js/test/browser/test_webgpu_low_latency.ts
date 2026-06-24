import WebgpuLowLatencyOptimizer, {
  WebgpuLowLatencyOptimizer as WebgpuLowLatencyOptimizerClass,
  createWebgpuLowLatencyOptimizer,
} from "../../src/hardware/webgpu/webgpu_low_latency_optimizer";
import { webgpu_low_latency_optimizer } from "../../src/optimization/techniques/webgpu_low_latency_optimizer";

describe("WebGPU low-latency optimizer browser contract", () => {
  it("constructs the default low-latency optimizer implementation", () => {
    const optimizer = new WebgpuLowLatencyOptimizer();

    expect(optimizer).toBeInstanceOf(WebgpuLowLatencyOptimizerClass);
    expect(optimizer).toBeInstanceOf(WebgpuLowLatencyOptimizer);
  });

  it("creates equivalent instances through the factory export", () => {
    const optimizer = createWebgpuLowLatencyOptimizer({
      browser: "firefox",
      latencyOptimized: true,
    });

    expect(optimizer).toBeInstanceOf(WebgpuLowLatencyOptimizerClass);
  });

  it("initializes and executes a simulated low-latency request", async () => {
    const optimizer = createWebgpuLowLatencyOptimizer({
      streamBufferSize: 1,
      prefillOptimized: true,
    });

    await expect(optimizer.initialize()).resolves.toBeUndefined();
    await expect(
      optimizer.execute({
        prompt: "hello",
        maxNewTokens: 4,
      }),
    ).resolves.toEqual({ success: true });
  });

  it("exposes the optimization technique helper contract", async () => {
    const optimizer = webgpu_low_latency_optimizer({
      browser: "chrome",
      deviceProfile: "integrated",
    });

    await expect(
      optimizer.execute({
        operation: "stream-token",
      }),
    ).resolves.toEqual({ success: true });
    expect(() => optimizer.dispose()).not.toThrow();
  });

  it("allows repeated disposal without leaking browser resources", () => {
    const optimizer = createWebgpuLowLatencyOptimizer();

    expect(() => {
      optimizer.dispose();
      optimizer.dispose();
    }).not.toThrow();
  });
});
