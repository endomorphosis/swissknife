import { describe, expect, it } from "@jest/globals";

type BrowserName = "firefox" | "chrome";
type AudioModelName = "whisper" | "wav2vec2" | "clap";

interface PerformanceMetrics {
  avgInferenceTimeMs?: number;
  improvementPercentage?: number;
  firefoxImprovement?: number;
  outperformsChromeBy?: number;
}

interface AudioModelRun {
  success: boolean;
  model: AudioModelName;
  browser: BrowserName;
  computeShaders: boolean;
  performance: PerformanceMetrics;
  error?: string;
}

interface BrowserComparison {
  model: AudioModelName;
  tests: Array<AudioModelRun & { name: string }>;
  firefoxComputeImprovement?: number;
  chromeComputeImprovement?: number;
  firefoxVsChromeAdvantage?: number;
}

interface FirefoxWebGPUEnvironment {
  WEBGPU_ENABLED: "1";
  WEBGPU_SIMULATION: "1";
  WEBGPU_AVAILABLE: "1";
  BROWSER_PREFERENCE: BrowserName;
  WEBGPU_COMPUTE_SHADERS_ENABLED?: "1";
  WEBGPU_SHADER_PRECOMPILE_ENABLED?: "1";
  MOZ_WEBGPU_ADVANCED_COMPUTE?: "1";
}

const TEST_MODELS: Record<AudioModelName, string> = {
  whisper: "openai/whisper-tiny",
  wav2vec2: "facebook/wav2vec2-base-960h",
  clap: "laion/clap-htsat-fused",
};

function setupFirefoxWebGPUEnvironment(options: {
  browser?: BrowserName;
  computeShaders?: boolean;
  shaderPrecompile?: boolean;
} = {}): FirefoxWebGPUEnvironment {
  const browser = options.browser ?? "firefox";
  const computeShaders = options.computeShaders ?? true;
  const shaderPrecompile = options.shaderPrecompile ?? true;

  return {
    WEBGPU_ENABLED: "1",
    WEBGPU_SIMULATION: "1",
    WEBGPU_AVAILABLE: "1",
    BROWSER_PREFERENCE: browser,
    ...(computeShaders ? { WEBGPU_COMPUTE_SHADERS_ENABLED: "1" as const } : {}),
    ...(shaderPrecompile ? { WEBGPU_SHADER_PRECOMPILE_ENABLED: "1" as const } : {}),
    ...(browser === "firefox" && computeShaders ? { MOZ_WEBGPU_ADVANCED_COMPUTE: "1" as const } : {}),
  };
}

function parsePerformanceMetrics(
  output: string,
  model: AudioModelName,
  browser: BrowserName,
  computeShaders: boolean,
): AudioModelRun {
  const metrics: PerformanceMetrics = {};
  const avgTimeMatch = output.match(/Average inference time:\s*([0-9]+(?:\.[0-9]+)?)\s*ms/i);
  const improvementMatch = output.match(/Improvement:\s*([0-9]+(?:\.[0-9]+)?)%/i);
  const firefoxImprovementMatch = output.match(/Firefox improvement:\s*([0-9]+(?:\.[0-9]+)?)%/i);
  const chromeComparisonMatch = output.match(/Outperforms by ~?\s*([0-9]+(?:\.[0-9]+)?)%/i);

  if (avgTimeMatch) {
    metrics.avgInferenceTimeMs = Number(avgTimeMatch[1]);
  }
  if (improvementMatch) {
    metrics.improvementPercentage = Number(improvementMatch[1]);
  }
  if (firefoxImprovementMatch) {
    metrics.firefoxImprovement = Number(firefoxImprovementMatch[1]);
  }
  if (chromeComparisonMatch) {
    metrics.outperformsChromeBy = Number(chromeComparisonMatch[1]);
  }

  return {
    success: true,
    model,
    browser,
    computeShaders,
    performance: metrics,
  };
}

function averageRuns(runs: AudioModelRun[]): AudioModelRun {
  if (runs.length === 0) {
    throw new Error("Cannot average an empty result set.");
  }

  const first = runs[0];
  const metricNames = new Set(runs.flatMap((run) => Object.keys(run.performance) as Array<keyof PerformanceMetrics>));
  const performance: PerformanceMetrics = {};

  for (const metricName of metricNames) {
    const values = runs
      .map((run) => run.performance[metricName])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    if (values.length > 0) {
      performance[metricName] = values.reduce((total, value) => total + value, 0) / values.length;
    }
  }

  return {
    success: runs.every((run) => run.success),
    model: first.model,
    browser: first.browser,
    computeShaders: first.computeShaders,
    performance,
  };
}

function calculateComparativeMetrics(results: BrowserComparison): BrowserComparison {
  const findResult = (browser: BrowserName, computeShaders: boolean) =>
    results.tests.find((test) => test.browser === browser && test.computeShaders === computeShaders);

  const firefoxWithCompute = findResult("firefox", true);
  const firefoxWithoutCompute = findResult("firefox", false);
  const chromeWithCompute = findResult("chrome", true);
  const chromeWithoutCompute = findResult("chrome", false);

  const withImprovement = { ...results };

  if (firefoxWithCompute?.performance.avgInferenceTimeMs && firefoxWithoutCompute?.performance.avgInferenceTimeMs) {
    withImprovement.firefoxComputeImprovement =
      ((firefoxWithoutCompute.performance.avgInferenceTimeMs - firefoxWithCompute.performance.avgInferenceTimeMs) /
        firefoxWithoutCompute.performance.avgInferenceTimeMs) *
      100;
  }

  if (chromeWithCompute?.performance.avgInferenceTimeMs && chromeWithoutCompute?.performance.avgInferenceTimeMs) {
    withImprovement.chromeComputeImprovement =
      ((chromeWithoutCompute.performance.avgInferenceTimeMs - chromeWithCompute.performance.avgInferenceTimeMs) /
        chromeWithoutCompute.performance.avgInferenceTimeMs) *
      100;
  }

  if (firefoxWithCompute?.performance.avgInferenceTimeMs && chromeWithCompute?.performance.avgInferenceTimeMs) {
    withImprovement.firefoxVsChromeAdvantage =
      ((chromeWithCompute.performance.avgInferenceTimeMs - firefoxWithCompute.performance.avgInferenceTimeMs) /
        chromeWithCompute.performance.avgInferenceTimeMs) *
      100;
  }

  return withImprovement;
}

describe("Firefox WebGPU compute shader tests", () => {
  it("configures Firefox-specific WebGPU compute shader flags", () => {
    expect(setupFirefoxWebGPUEnvironment()).toEqual({
      WEBGPU_ENABLED: "1",
      WEBGPU_SIMULATION: "1",
      WEBGPU_AVAILABLE: "1",
      BROWSER_PREFERENCE: "firefox",
      WEBGPU_COMPUTE_SHADERS_ENABLED: "1",
      WEBGPU_SHADER_PRECOMPILE_ENABLED: "1",
      MOZ_WEBGPU_ADVANCED_COMPUTE: "1",
    });

    expect(setupFirefoxWebGPUEnvironment({ browser: "chrome", computeShaders: false })).toEqual({
      WEBGPU_ENABLED: "1",
      WEBGPU_SIMULATION: "1",
      WEBGPU_AVAILABLE: "1",
      BROWSER_PREFERENCE: "chrome",
      WEBGPU_SHADER_PRECOMPILE_ENABLED: "1",
    });
  });

  it("parses benchmark output from the audio compute shader runner", () => {
    const metrics = parsePerformanceMetrics(
      [
        "Average inference time: 42.5 ms",
        "Improvement: 55.0%",
        "Firefox improvement: 55.0%",
        "Outperforms by ~20.5%",
      ].join("\n"),
      "whisper",
      "firefox",
      true,
    );

    expect(metrics).toEqual({
      success: true,
      model: "whisper",
      browser: "firefox",
      computeShaders: true,
      performance: {
        avgInferenceTimeMs: 42.5,
        improvementPercentage: 55,
        firefoxImprovement: 55,
        outperformsChromeBy: 20.5,
      },
    });
  });

  it("averages repeated runs without losing browser or model metadata", () => {
    const average = averageRuns([
      {
        success: true,
        model: "wav2vec2",
        browser: "firefox",
        computeShaders: true,
        performance: { avgInferenceTimeMs: 40, firefoxImprovement: 50 },
      },
      {
        success: true,
        model: "wav2vec2",
        browser: "firefox",
        computeShaders: true,
        performance: { avgInferenceTimeMs: 44, firefoxImprovement: 58 },
      },
    ]);

    expect(average).toEqual({
      success: true,
      model: "wav2vec2",
      browser: "firefox",
      computeShaders: true,
      performance: {
        avgInferenceTimeMs: 42,
        firefoxImprovement: 54,
      },
    });
  });

  it("calculates Firefox and Chrome compute shader comparisons", () => {
    const comparison = calculateComparativeMetrics({
      model: "clap",
      tests: [
        {
          name: "Firefox with compute shaders",
          success: true,
          model: "clap",
          browser: "firefox",
          computeShaders: true,
          performance: { avgInferenceTimeMs: 45 },
        },
        {
          name: "Firefox without compute shaders",
          success: true,
          model: "clap",
          browser: "firefox",
          computeShaders: false,
          performance: { avgInferenceTimeMs: 100 },
        },
        {
          name: "Chrome with compute shaders",
          success: true,
          model: "clap",
          browser: "chrome",
          computeShaders: true,
          performance: { avgInferenceTimeMs: 60 },
        },
        {
          name: "Chrome without compute shaders",
          success: true,
          model: "clap",
          browser: "chrome",
          computeShaders: false,
          performance: { avgInferenceTimeMs: 100 },
        },
      ],
    });

    expect(comparison.firefoxComputeImprovement).toBeCloseTo(55);
    expect(comparison.chromeComputeImprovement).toBeCloseTo(40);
    expect(comparison.firefoxVsChromeAdvantage).toBeCloseTo(25);
  });

  it("keeps the expected audio model aliases available", () => {
    expect(TEST_MODELS).toEqual({
      whisper: "openai/whisper-tiny",
      wav2vec2: "facebook/wav2vec2-base-960h",
      clap: "laion/clap-htsat-fused",
    });
  });
});
