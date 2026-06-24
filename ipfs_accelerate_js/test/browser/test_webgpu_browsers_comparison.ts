type BrowserName = 'chrome' | 'firefox' | 'edge' | 'safari';

interface WebGPUOptimizationSet {
  computeShaders: boolean;
  parallelLoading: boolean;
  shaderPrecompile: boolean;
}

interface BrowserComparisonOptions {
  browsers?: BrowserName[];
  models?: string[];
  batchSizes?: number[];
  enableComputeShaders?: boolean;
  enableParallelLoading?: boolean;
  enableShaderPrecompile?: boolean;
  allOptimizations?: boolean;
  timeoutSeconds?: number;
  outputDir?: string;
  dbPath?: string;
}

interface NormalizedBrowserComparisonOptions {
  browsers: BrowserName[];
  models: string[];
  batchSizes: number[];
  optimizations: WebGPUOptimizationSet;
  timeoutSeconds: number;
  outputDir: string;
  dbPath?: string;
}

interface BrowserCapabilities {
  adapterInfo?: string;
  browser: BrowserName;
  error: string | null;
  gpuDevice?: string;
  hardwareAcceleration: boolean;
  supportedFeatures?: string[];
  webgpuAvailable: boolean;
}

interface WebGPUPerformanceResult {
  batchSize: number;
  browser: BrowserName;
  error: string | null;
  firstInferenceTimeMs?: number;
  inferenceTimeMs?: number;
  loadingTimeMs?: number;
  memoryUsageMb?: number;
  model: string;
  optimizations: WebGPUOptimizationSet;
  performanceVsBestPct?: number;
  relativePerformance?: number;
  shaderCompilationTimeMs?: number;
  simulated: boolean;
  throughputItemsPerSec?: number;
}

interface BrowserComparisonResult {
  batchSize: number;
  bestBrowser?: BrowserName;
  bestInferenceTimeMs?: number;
  browsers: Partial<Record<BrowserName, WebGPUPerformanceResult>>;
  model: string;
  optimizations: WebGPUOptimizationSet;
}

const DEFAULT_BROWSERS: BrowserName[] = ['chrome', 'firefox'];
const DEFAULT_MODELS = ['whisper-tiny'];
const DEFAULT_BATCH_SIZES = [1, 4];
const DEFAULT_OUTPUT_DIR = './webgpu_browser_comparison_results';
const DEFAULT_TIMEOUT_SECONDS = 600;

function normalizeComparisonOptions(
  options: BrowserComparisonOptions = {},
): NormalizedBrowserComparisonOptions {
  const allOptimizations = options.allOptimizations ?? false;

  return {
    browsers: options.browsers ?? DEFAULT_BROWSERS,
    models: options.models ?? DEFAULT_MODELS,
    batchSizes: options.batchSizes ?? DEFAULT_BATCH_SIZES,
    optimizations: {
      computeShaders: (options.enableComputeShaders ?? false) || allOptimizations,
      parallelLoading: (options.enableParallelLoading ?? false) || allOptimizations,
      shaderPrecompile: (options.enableShaderPrecompile ?? false) || allOptimizations,
    },
    timeoutSeconds: options.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
    outputDir: options.outputDir ?? DEFAULT_OUTPUT_DIR,
    dbPath: options.dbPath,
  };
}

function buildCapabilityCommand(browser: BrowserName): string[] {
  return ['./run_browser_capability_check.sh', `--browser=${browser}`, '--webgpu-details'];
}

function buildPerformanceCommand(
  browser: BrowserName,
  model: string,
  batchSize: number,
  optimizations: WebGPUOptimizationSet,
): string[] {
  const command = [
    './run_web_platform_tests.sh',
    `--browser=${browser}`,
    `--model=${model}`,
    `--batch-size=${batchSize}`,
    '--platform=webgpu',
    '--performance-details',
  ];

  if (optimizations.computeShaders) {
    command.push('--enable-compute-shaders');
  }

  if (optimizations.parallelLoading) {
    command.push('--enable-parallel-loading');
  }

  if (optimizations.shaderPrecompile) {
    command.push('--enable-shader-precompile');
  }

  return command;
}

function parseSectionLines(output: string, heading: string): string[] {
  const lines = output.split('\n');
  const headingIndex = lines.findIndex((line) => line.includes(heading));

  if (headingIndex < 0) {
    return [];
  }

  const sectionLines: string[] = [];

  for (const line of lines.slice(headingIndex + 1)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('---')) {
      break;
    }

    sectionLines.push(trimmed);
  }

  return sectionLines;
}

function parseNumberAfterLabel(output: string, label: string): number | undefined {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = output.match(new RegExp(`${escapedLabel}\\s*([-+]?\\d*\\.?\\d+)`));

  return match ? Number(match[1]) : undefined;
}

function parseBrowserCapabilities(output: string, browser: BrowserName): BrowserCapabilities {
  const gpuDeviceMatch = output.match(/GPU Device:\s*(.+)/);
  const adapterInfo = parseSectionLines(output, 'Adapter Info:');
  const supportedFeatures = parseSectionLines(output, 'Supported Features:');

  return {
    browser,
    error: null,
    gpuDevice: gpuDeviceMatch?.[1].trim(),
    hardwareAcceleration: output.includes('Hardware Acceleration: Enabled'),
    webgpuAvailable: output.includes('WebGPU: Available'),
    ...(adapterInfo.length > 0 ? { adapterInfo: adapterInfo.join('\n') } : {}),
    ...(supportedFeatures.length > 0 ? { supportedFeatures } : {}),
  };
}

function parseWebGPUPerformanceOutput(
  output: string,
  browser: BrowserName,
  model: string,
  batchSize: number,
  optimizations: WebGPUOptimizationSet,
): WebGPUPerformanceResult {
  return {
    batchSize,
    browser,
    error: null,
    firstInferenceTimeMs: parseNumberAfterLabel(output, 'First Inference Time:'),
    inferenceTimeMs: parseNumberAfterLabel(output, 'Inference Time:'),
    loadingTimeMs: parseNumberAfterLabel(output, 'Loading Time:'),
    memoryUsageMb: parseNumberAfterLabel(output, 'Memory Usage:'),
    model,
    optimizations,
    shaderCompilationTimeMs: parseNumberAfterLabel(output, 'Shader Compilation Time:'),
    simulated: /Simulation:\s*True/i.test(output),
    throughputItemsPerSec: parseNumberAfterLabel(output, 'Throughput:'),
  };
}

function calculateSpeedup(baselineMs: number | undefined, optimizedMs: number | undefined) {
  if (!baselineMs || !optimizedMs || baselineMs <= 0 || optimizedMs <= 0) {
    return undefined;
  }

  return {
    baselineTimeMs: baselineMs,
    improvementPct: ((baselineMs - optimizedMs) / baselineMs) * 100,
    optimizedTimeMs: optimizedMs,
    speedup: baselineMs / optimizedMs,
  };
}

function compareBrowserPerformance(
  model: string,
  batchSize: number,
  optimizations: WebGPUOptimizationSet,
  browserResults: WebGPUPerformanceResult[],
): BrowserComparisonResult {
  const browsers = Object.fromEntries(
    browserResults.map((result) => [result.browser, { ...result }]),
  ) as Partial<Record<BrowserName, WebGPUPerformanceResult>>;
  const successfulResults = Object.values(browsers).filter(
    (result): result is WebGPUPerformanceResult => Boolean(result && !result.error && result.inferenceTimeMs),
  );
  const bestResult = successfulResults.reduce<WebGPUPerformanceResult | undefined>(
    (best, result) =>
      !best || (result.inferenceTimeMs as number) < (best.inferenceTimeMs as number) ? result : best,
    undefined,
  );

  if (!bestResult?.inferenceTimeMs) {
    return {
      batchSize,
      browsers,
      model,
      optimizations,
    };
  }

  for (const result of successfulResults) {
    const relativePerformance = bestResult.inferenceTimeMs / (result.inferenceTimeMs as number);

    browsers[result.browser] = {
      ...result,
      performanceVsBestPct: (relativePerformance - 1) * 100,
      relativePerformance,
    };
  }

  return {
    batchSize,
    bestBrowser: bestResult.browser,
    bestInferenceTimeMs: bestResult.inferenceTimeMs,
    browsers,
    model,
    optimizations,
  };
}

function formatOptimizationLabel(optimizations: WebGPUOptimizationSet): string {
  const enabled = [
    optimizations.computeShaders ? 'compute shaders' : undefined,
    optimizations.parallelLoading ? 'parallel loading' : undefined,
    optimizations.shaderPrecompile ? 'shader precompilation' : undefined,
  ].filter(Boolean);

  return enabled.length > 0 ? enabled.join(', ') : 'no optimizations';
}

describe('WebGPU browser comparison helpers', () => {
  const noOptimizations: WebGPUOptimizationSet = {
    computeShaders: false,
    parallelLoading: false,
    shaderPrecompile: false,
  };

  it('normalizes comparison options to the documented defaults', () => {
    expect(normalizeComparisonOptions()).toEqual({
      browsers: ['chrome', 'firefox'],
      batchSizes: [1, 4],
      dbPath: undefined,
      models: ['whisper-tiny'],
      optimizations: noOptimizations,
      outputDir: './webgpu_browser_comparison_results',
      timeoutSeconds: 600,
    });
  });

  it('enables every optimization when allOptimizations is requested', () => {
    expect(normalizeComparisonOptions({ allOptimizations: true }).optimizations).toEqual({
      computeShaders: true,
      parallelLoading: true,
      shaderPrecompile: true,
    });
  });

  it('builds browser capability and performance commands with optimization flags', () => {
    const optimizations = {
      computeShaders: true,
      parallelLoading: true,
      shaderPrecompile: false,
    };

    expect(buildCapabilityCommand('firefox')).toEqual([
      './run_browser_capability_check.sh',
      '--browser=firefox',
      '--webgpu-details',
    ]);
    expect(buildPerformanceCommand('firefox', 'whisper-tiny', 4, optimizations)).toEqual([
      './run_web_platform_tests.sh',
      '--browser=firefox',
      '--model=whisper-tiny',
      '--batch-size=4',
      '--platform=webgpu',
      '--performance-details',
      '--enable-compute-shaders',
      '--enable-parallel-loading',
    ]);
  });

  it('parses WebGPU capability output without swallowing section headings', () => {
    const capabilities = parseBrowserCapabilities(
      [
        'WebGPU: Available',
        'Hardware Acceleration: Enabled',
        'GPU Device: Apple M3',
        'Adapter Info:',
        'vendor: Apple',
        'architecture: unified-memory',
        '---',
        'Supported Features:',
        'timestamp-query',
        'shader-f16',
      ].join('\n'),
      'safari',
    );

    expect(capabilities).toEqual({
      adapterInfo: 'vendor: Apple\narchitecture: unified-memory',
      browser: 'safari',
      error: null,
      gpuDevice: 'Apple M3',
      hardwareAcceleration: true,
      supportedFeatures: ['timestamp-query', 'shader-f16'],
      webgpuAvailable: true,
    });
  });

  it('parses performance metrics from benchmark output', () => {
    expect(
      parseWebGPUPerformanceOutput(
        [
          'Inference Time: 42.5 ms',
          'Loading Time: 100.25 ms',
          'First Inference Time: 75 ms',
          'Shader Compilation Time: 14.5 ms',
          'Memory Usage: 512 MB',
          'Throughput: 23.75 items/sec',
          'Simulation: True',
        ].join('\n'),
        'chrome',
        'openai/clip-vit-base-patch32',
        1,
        noOptimizations,
      ),
    ).toMatchObject({
      batchSize: 1,
      browser: 'chrome',
      error: null,
      firstInferenceTimeMs: 75,
      inferenceTimeMs: 42.5,
      loadingTimeMs: 100.25,
      memoryUsageMb: 512,
      model: 'openai/clip-vit-base-patch32',
      shaderCompilationTimeMs: 14.5,
      simulated: true,
      throughputItemsPerSec: 23.75,
    });
  });

  it('calculates speedups only when baseline and optimized timings are valid', () => {
    expect(calculateSpeedup(200, 125)).toEqual({
      baselineTimeMs: 200,
      improvementPct: 37.5,
      optimizedTimeMs: 125,
      speedup: 1.6,
    });
    expect(calculateSpeedup(0, 125)).toBeUndefined();
    expect(calculateSpeedup(200, undefined)).toBeUndefined();
  });

  it('ranks successful browser results and annotates performance against the best browser', () => {
    const comparison = compareBrowserPerformance('whisper-tiny', 1, noOptimizations, [
      {
        batchSize: 1,
        browser: 'chrome',
        error: null,
        inferenceTimeMs: 50,
        model: 'whisper-tiny',
        optimizations: noOptimizations,
        simulated: false,
      },
      {
        batchSize: 1,
        browser: 'firefox',
        error: null,
        inferenceTimeMs: 40,
        model: 'whisper-tiny',
        optimizations: noOptimizations,
        simulated: false,
      },
      {
        batchSize: 1,
        browser: 'edge',
        error: 'Timeout',
        model: 'whisper-tiny',
        optimizations: noOptimizations,
        simulated: false,
      },
    ]);

    expect(comparison.bestBrowser).toBe('firefox');
    expect(comparison.bestInferenceTimeMs).toBe(40);
    expect(comparison.browsers.firefox).toMatchObject({
      performanceVsBestPct: 0,
      relativePerformance: 1,
    });
    expect(comparison.browsers.chrome).toMatchObject({
      performanceVsBestPct: -19.999999999999996,
      relativePerformance: 0.8,
    });
    expect(comparison.browsers.edge).toMatchObject({
      error: 'Timeout',
      performanceVsBestPct: undefined,
      relativePerformance: undefined,
    });
  });

  it('formats optimization labels for comparison reports', () => {
    expect(formatOptimizationLabel(noOptimizations)).toBe('no optimizations');
    expect(
      formatOptimizationLabel({
        computeShaders: true,
        parallelLoading: false,
        shaderPrecompile: true,
      }),
    ).toBe('compute shaders, shader precompilation');
  });
});
