import { describe, expect, it } from "@jest/globals";

type BrowserName = "firefox" | "chrome";
type AudioModelName = "whisper" | "wav2vec2" | "clap";

interface ComputeShaderConfig {
  browserPreference: BrowserName;
  computeShadersEnabled: boolean;
  shaderPrecompileEnabled: boolean;
  workgroupSize: [number, number, number];
}

interface PerformanceMetrics {
  avgInferenceTimeMs?: number;
  improvementPercentage?: number;
  firefoxImprovement?: number;
  outperformsChromeBy?: number;
}

const TEST_MODELS: Record<AudioModelName, string> = {
  whisper: "openai/whisper-tiny",
  wav2vec2: "facebook/wav2vec2-base-960h",
  clap: "laion/clap-htsat-fused",
};

function createComputeShaderConfig(
  browser: BrowserName,
  computeShadersEnabled = true,
  shaderPrecompileEnabled = true,
): ComputeShaderConfig {
  return {
    browserPreference: browser,
    computeShadersEnabled,
    shaderPrecompileEnabled,
    workgroupSize:
      browser === "firefox" && computeShadersEnabled ? [256, 1, 1] : [128, 2, 1],
  };
}

function parsePerformanceMetrics(output: string): PerformanceMetrics {
  const patterns = {
    avgInferenceTimeMs: /Average inference time:\s*(\d+(?:\.\d+)?)\s*ms/i,
    improvementPercentage: /Improvement:\s*(\d+(?:\.\d+)?)%/i,
    firefoxImprovement: /Firefox improvement:\s*(\d+(?:\.\d+)?)%/i,
    outperformsChromeBy: /Outperforms by ~?(\d+(?:\.\d+)?)%/i,
  } satisfies Record<keyof PerformanceMetrics, RegExp>;

  return Object.fromEntries(
    Object.entries(patterns).flatMap(([key, pattern]) => {
      const match = output.match(pattern);
      return match ? [[key, Number(match[1])]] : [];
    }),
  ) as PerformanceMetrics;
}

function averagePerformanceMetrics(results: PerformanceMetrics[]): PerformanceMetrics {
  const totals = new Map<keyof PerformanceMetrics, { sum: number; count: number }>();

  for (const result of results) {
    for (const [key, value] of Object.entries(result) as [
      keyof PerformanceMetrics,
      number | undefined,
    ][]) {
      if (typeof value !== "number") {
        continue;
      }

      const current = totals.get(key) ?? { sum: 0, count: 0 };
      current.sum += value;
      current.count += 1;
      totals.set(key, current);
    }
  }

  return Object.fromEntries(
    Array.from(totals.entries()).map(([key, value]) => [
      key,
      value.sum / value.count,
    ]),
  ) as PerformanceMetrics;
}

describe("Firefox WebGPU compute shader configuration", () => {
  it("keeps Firefox audio models on the optimized 256x1x1 workgroup", () => {
    for (const modelName of Object.keys(TEST_MODELS) as AudioModelName[]) {
      const config = createComputeShaderConfig("firefox");

      expect(TEST_MODELS[modelName]).toMatch(/\//);
      expect(config).toMatchObject({
        browserPreference: "firefox",
        computeShadersEnabled: true,
        shaderPrecompileEnabled: true,
        workgroupSize: [256, 1, 1],
      });
    }
  });

  it("uses the comparison workgroup when Firefox compute shaders are disabled", () => {
    expect(createComputeShaderConfig("firefox", false)).toMatchObject({
      browserPreference: "firefox",
      computeShadersEnabled: false,
      workgroupSize: [128, 2, 1],
    });
  });

  it("uses Chrome's comparison workgroup for non-Firefox runs", () => {
    expect(createComputeShaderConfig("chrome")).toMatchObject({
      browserPreference: "chrome",
      computeShadersEnabled: true,
      workgroupSize: [128, 2, 1],
    });
  });
});

describe("Firefox WebGPU performance output parsing", () => {
  it("extracts the metrics emitted by the audio compute shader benchmark", () => {
    expect(
      parsePerformanceMetrics(`
        Average inference time: 47.5 ms
        Improvement: 55.0%
        Firefox improvement: 26.2%
        Outperforms by ~20.4%
      `),
    ).toEqual({
      avgInferenceTimeMs: 47.5,
      improvementPercentage: 55,
      firefoxImprovement: 26.2,
      outperformsChromeBy: 20.4,
    });
  });

  it("averages only metrics that were present in successful benchmark output", () => {
    expect(
      averagePerformanceMetrics([
        { avgInferenceTimeMs: 50, firefoxImprovement: 24 },
        { avgInferenceTimeMs: 46, firefoxImprovement: 28, outperformsChromeBy: 20 },
        { outperformsChromeBy: 22 },
      ]),
    ).toEqual({
      avgInferenceTimeMs: 48,
      firefoxImprovement: 26,
      outperformsChromeBy: 21,
    });
  });
});
