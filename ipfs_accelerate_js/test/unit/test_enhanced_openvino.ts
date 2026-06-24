type OpenVINOPrecision = "FP32" | "FP16" | "INT8";
type OpenVINOModelType = "text";

interface OpenVINOModelConfig {
  device: string;
  modelType: OpenVINOModelType;
  precision: OpenVINOPrecision;
  modelFormat?: "ONNX";
  modelPath?: string;
  useOptimum?: boolean;
  calibrationData?: CalibrationSample[];
}

interface CalibrationSample {
  inputIds: number[];
  attentionMask: number[];
}

interface InferenceMetrics {
  status: "success" | "error";
  latencyMs: number;
  throughputItemsPerSec: number;
  memoryUsageMb: number;
}

const DEFAULT_MODEL_NAME = "bert-base-uncased";
const DEFAULT_DEVICE = "CPU";

const calibrationTexts = [
  "The quick brown fox jumps over the lazy dog.",
  "OpenVINO provides hardware acceleration for deep learning models.",
  "INT8 quantization can significantly improve performance.",
  "Deep learning frameworks optimize inference on various hardware platforms.",
  "Model compression techniques reduce memory footprint while maintaining accuracy.",
];

function createOptimumConfig(modelName = DEFAULT_MODEL_NAME, device = DEFAULT_DEVICE) {
  return {
    modelName,
    config: {
      device,
      modelType: "text",
      precision: "FP32",
      useOptimum: true,
    } satisfies OpenVINOModelConfig,
  };
}

function createCalibrationData(texts = calibrationTexts): CalibrationSample[] {
  return texts.map((text) => {
    const tokenCount = text.split(/\s+/).length;

    return {
      inputIds: Array.from({ length: tokenCount }, (_, index) => index + 101),
      attentionMask: Array.from({ length: tokenCount }, () => 1),
    };
  });
}

function createQuantizedModelConfigs(modelPath: string, device = DEFAULT_DEVICE) {
  const calibrationData = createCalibrationData();
  const baseConfig = {
    device,
    modelType: "text",
    modelFormat: "ONNX",
    modelPath,
  } satisfies Pick<OpenVINOModelConfig, "device" | "modelType" | "modelFormat" | "modelPath">;
  const fp32: OpenVINOModelConfig = {
    ...baseConfig,
    precision: "FP32",
  };
  const int8: OpenVINOModelConfig = {
    ...baseConfig,
    precision: "INT8",
    calibrationData,
  };

  return {
    fp32,
    int8,
  };
}

function summarizePrecisionMetrics(results: Record<OpenVINOPrecision, InferenceMetrics>) {
  const baselineLatency = results.FP32.latencyMs;

  return Object.entries(results).map(([precision, metrics]) => ({
    precision: precision as OpenVINOPrecision,
    latencyMs: metrics.latencyMs,
    throughputItemsPerSec: metrics.throughputItemsPerSec,
    memoryUsageMb: metrics.memoryUsageMb,
    speedupVsFp32: baselineLatency / metrics.latencyMs,
  }));
}

describe("enhanced OpenVINO conversion fixture", () => {
  it("keeps optimum.intel model loading explicit for text models", () => {
    const result = createOptimumConfig();

    expect(result).toEqual({
      modelName: "bert-base-uncased",
      config: {
        device: "CPU",
        modelType: "text",
        precision: "FP32",
        useOptimum: true,
      },
    });
  });

  it("builds deterministic calibration data for INT8 quantization", () => {
    const calibrationData = createCalibrationData(["short sample", "another test sample"]);

    expect(calibrationData).toEqual([
      {
        inputIds: [101, 102],
        attentionMask: [1, 1],
      },
      {
        inputIds: [101, 102, 103],
        attentionMask: [1, 1, 1],
      },
    ]);
  });

  it("separates FP32 and INT8 ONNX configs while sharing model location", () => {
    const configs = createQuantizedModelConfigs("/tmp/model.onnx");

    expect(configs.fp32).toMatchObject({
      device: "CPU",
      modelType: "text",
      precision: "FP32",
      modelFormat: "ONNX",
      modelPath: "/tmp/model.onnx",
    });
    expect(configs.fp32.calibrationData).toBeUndefined();

    expect(configs.int8).toMatchObject({
      device: "CPU",
      modelType: "text",
      precision: "INT8",
      modelFormat: "ONNX",
      modelPath: "/tmp/model.onnx",
    });
    expect(configs.int8.calibrationData).toHaveLength(calibrationTexts.length);
  });

  it("summarizes precision metrics relative to the FP32 baseline", () => {
    const summary = summarizePrecisionMetrics({
      FP32: {
        status: "success",
        latencyMs: 20,
        throughputItemsPerSec: 50,
        memoryUsageMb: 512,
      },
      FP16: {
        status: "success",
        latencyMs: 12.5,
        throughputItemsPerSec: 80,
        memoryUsageMb: 384,
      },
      INT8: {
        status: "success",
        latencyMs: 10,
        throughputItemsPerSec: 100,
        memoryUsageMb: 256,
      },
    });

    expect(summary).toEqual([
      {
        precision: "FP32",
        latencyMs: 20,
        throughputItemsPerSec: 50,
        memoryUsageMb: 512,
        speedupVsFp32: 1,
      },
      {
        precision: "FP16",
        latencyMs: 12.5,
        throughputItemsPerSec: 80,
        memoryUsageMb: 384,
        speedupVsFp32: 1.6,
      },
      {
        precision: "INT8",
        latencyMs: 10,
        throughputItemsPerSec: 100,
        memoryUsageMb: 256,
        speedupVsFp32: 2,
      },
    ]);
  });
});

export {};
