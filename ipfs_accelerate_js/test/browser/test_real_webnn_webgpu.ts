import { ResourcePoolBridge } from "../../src/browser/resource_pool/resource_pool_bridge";

type Platform = "webgpu" | "webnn";
type BrowserName = "chrome" | "firefox" | "edge";
type ModelType = "text" | "vision" | "audio" | "multimodal";

interface RealWebAccelerationArgs {
  platform: Platform;
  browser: BrowserName;
  model: string;
  modelType: ModelType;
  input?: string;
  inputImage?: string;
  inputAudio?: string;
  bits?: 2 | 4 | 8 | 16;
  mixedPrecision?: boolean;
  showBrowser?: boolean;
}

interface BridgeOptions {
  maxConnections: number;
  browser: BrowserName;
  enableGpu: boolean;
  enableCpu: boolean;
  headless: boolean;
  cleanupInterval: number;
}

interface ModelConfiguration {
  modelId: string;
  modelName: string;
  backend: Platform;
  family: ModelType;
  modelPath: string;
  quantization: {
    bits?: 2 | 4 | 8 | 16;
    mixed: boolean;
    experimental: boolean;
  };
}

type InferenceInput =
  | string
  | { image: string }
  | { audio: string }
  | { image: string; text: string };

export function createBridgeOptions(args: RealWebAccelerationArgs): BridgeOptions {
  return {
    maxConnections: 1,
    browser: args.browser,
    enableGpu: args.platform === "webgpu",
    enableCpu: args.platform === "webnn",
    headless: !args.showBrowser,
    cleanupInterval: 60,
  };
}

export function createModelConfiguration(args: RealWebAccelerationArgs): ModelConfiguration {
  return {
    modelId: args.model,
    modelName: args.model,
    backend: args.platform,
    family: args.modelType,
    modelPath: `https://huggingface.co/${args.model}/resolve/main/model.onnx`,
    quantization: {
      bits: args.bits,
      mixed: Boolean(args.mixedPrecision),
      experimental: false,
    },
  };
}

export function createInferenceInput(args: RealWebAccelerationArgs): InferenceInput {
  switch (args.modelType) {
    case "text":
      return args.input ?? "This is a test input for WebNN/WebGPU implementation.";
    case "vision":
      if (!args.inputImage) {
        throw new Error("Vision models require inputImage.");
      }
      return { image: args.inputImage };
    case "audio":
      if (!args.inputAudio) {
        throw new Error("Audio models require inputAudio.");
      }
      return { audio: args.inputAudio };
    case "multimodal":
      if (!args.inputImage) {
        throw new Error("Multimodal models require inputImage.");
      }
      return {
        image: args.inputImage,
        text: args.input ?? "What's in this image?",
      };
  }
}

describe("real WebNN/WebGPU browser test configuration", () => {
  const baseArgs: RealWebAccelerationArgs = {
    platform: "webgpu",
    browser: "chrome",
    model: "bert-base-uncased",
    modelType: "text",
  };

  it("creates resource pool bridge options for WebGPU", () => {
    expect(createBridgeOptions(baseArgs)).toEqual({
      maxConnections: 1,
      browser: "chrome",
      enableGpu: true,
      enableCpu: false,
      headless: true,
      cleanupInterval: 60,
    });
  });

  it("creates resource pool bridge options for WebNN", () => {
    expect(
      createBridgeOptions({
        ...baseArgs,
        platform: "webnn",
        browser: "edge",
        showBrowser: true,
      }),
    ).toEqual({
      maxConnections: 1,
      browser: "edge",
      enableGpu: false,
      enableCpu: true,
      headless: false,
      cleanupInterval: 60,
    });
  });

  it("creates the expected Hugging Face model configuration", () => {
    expect(
      createModelConfiguration({
        ...baseArgs,
        bits: 4,
        mixedPrecision: true,
      }),
    ).toEqual({
      modelId: "bert-base-uncased",
      modelName: "bert-base-uncased",
      backend: "webgpu",
      family: "text",
      modelPath: "https://huggingface.co/bert-base-uncased/resolve/main/model.onnx",
      quantization: {
        bits: 4,
        mixed: true,
        experimental: false,
      },
    });
  });

  it("builds inference input for each supported model family", () => {
    expect(createInferenceInput(baseArgs)).toBe(
      "This is a test input for WebNN/WebGPU implementation.",
    );
    expect(createInferenceInput({ ...baseArgs, modelType: "vision", inputImage: "test.jpg" })).toEqual({
      image: "test.jpg",
    });
    expect(createInferenceInput({ ...baseArgs, modelType: "audio", inputAudio: "test.mp3" })).toEqual({
      audio: "test.mp3",
    });
    expect(createInferenceInput({ ...baseArgs, modelType: "multimodal", inputImage: "test.jpg" })).toEqual({
      image: "test.jpg",
      text: "What's in this image?",
    });
  });

  it("rejects missing media inputs before browser setup", () => {
    expect(() => createInferenceInput({ ...baseArgs, modelType: "vision" })).toThrow(
      "Vision models require inputImage.",
    );
    expect(() => createInferenceInput({ ...baseArgs, modelType: "audio" })).toThrow(
      "Audio models require inputAudio.",
    );
    expect(() => createInferenceInput({ ...baseArgs, modelType: "multimodal" })).toThrow(
      "Multimodal models require inputImage.",
    );
  });

  it("keeps the ResourcePoolBridge import usable from browser tests", async () => {
    const bridge = new ResourcePoolBridge(createBridgeOptions(baseArgs));

    await expect(bridge.initialize()).resolves.toBeUndefined();
    await expect(bridge.execute(createInferenceInput(baseArgs))).resolves.toEqual({ success: true });

    expect(() => bridge.dispose()).not.toThrow();
  });
});
