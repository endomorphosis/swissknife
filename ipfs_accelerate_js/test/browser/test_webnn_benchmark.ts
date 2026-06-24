import { describe, expect, it, jest } from '@jest/globals';

type WebNNStatus =
  | 'unknown'
  | 'initialization_failed'
  | 'not_supported'
  | 'simulation'
  | 'real_hardware';

interface BenchmarkMetrics {
  averageLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  throughputItemsPerSecond: number;
  isSimulation?: boolean;
}

interface BenchmarkResults {
  model: string;
  browser: string;
  batchSize: number;
  webnnStatus: WebNNStatus;
  webnnPerformance: BenchmarkMetrics | null;
  cpuPerformance: BenchmarkMetrics | null;
  speedup: number | null;
}

interface WebNNInferenceResult {
  isSimulation?: boolean;
}

interface WebNNBenchmarkImplementation {
  initialize(): Promise<boolean>;
  getFeatureSupport(): { webnn?: boolean };
  initializeModel(modelName: string, modelType: 'text'): Promise<unknown>;
  runInference(modelName: string, input: string): Promise<WebNNInferenceResult>;
  shutdown(): Promise<void>;
}

function createEmptyResults(
  model: string,
  browser: string,
  batchSize: number
): BenchmarkResults {
  return {
    model,
    browser,
    batchSize,
    webnnStatus: 'unknown',
    webnnPerformance: null,
    cpuPerformance: null,
    speedup: null
  };
}

function calculateMetrics(
  latencies: number[],
  isSimulation?: boolean
): BenchmarkMetrics {
  if (latencies.length === 0) {
    throw new Error('Cannot calculate benchmark metrics without latencies.');
  }

  const averageLatencyMs =
    latencies.reduce((total, latency) => total + latency, 0) / latencies.length;

  return {
    averageLatencyMs,
    minLatencyMs: Math.min(...latencies),
    maxLatencyMs: Math.max(...latencies),
    throughputItemsPerSecond: 1000 / averageLatencyMs,
    ...(isSimulation === undefined ? {} : { isSimulation })
  };
}

async function runWebNNBenchmark(options: {
  modelName: string;
  browser: string;
  batchSize: number;
  iterations: number;
  implementation: WebNNBenchmarkImplementation;
  now: () => number;
  runCpuInference: () => Promise<void>;
}): Promise<BenchmarkResults> {
  const {
    modelName,
    browser,
    batchSize,
    iterations,
    implementation,
    now,
    runCpuInference
  } = options;
  const results = createEmptyResults(modelName, browser, batchSize);
  const testInput =
    'This is a sample input for benchmarking model performance with WebNN.';

  try {
    if (!(await implementation.initialize())) {
      results.webnnStatus = 'initialization_failed';
      return results;
    }

    if (!implementation.getFeatureSupport().webnn) {
      results.webnnStatus = 'not_supported';
      return results;
    }

    const modelInfo = await implementation.initializeModel(modelName, 'text');
    if (!modelInfo) {
      results.webnnStatus = 'initialization_failed';
      return results;
    }

    for (let i = 0; i < 3; i += 1) {
      await implementation.runInference(modelName, testInput);
    }

    const webnnLatencies: number[] = [];
    let lastWebNNResult: WebNNInferenceResult | null = null;

    for (let i = 0; i < iterations; i += 1) {
      const startTime = now();
      lastWebNNResult = await implementation.runInference(modelName, testInput);
      webnnLatencies.push(now() - startTime);
    }

    const isSimulation = lastWebNNResult?.isSimulation ?? true;
    results.webnnStatus = isSimulation ? 'simulation' : 'real_hardware';
    results.webnnPerformance = calculateMetrics(webnnLatencies, isSimulation);

    const cpuLatencies: number[] = [];
    for (let i = 0; i < iterations; i += 1) {
      const startTime = now();
      await runCpuInference();
      cpuLatencies.push(now() - startTime);
    }

    results.cpuPerformance = calculateMetrics(cpuLatencies);
    results.speedup =
      results.cpuPerformance.averageLatencyMs /
      results.webnnPerformance.averageLatencyMs;

    return results;
  } finally {
    await implementation.shutdown();
  }
}

function createMockImplementation(
  overrides: Partial<WebNNBenchmarkImplementation> = {}
): WebNNBenchmarkImplementation {
  return {
    initialize: jest.fn(async () => true),
    getFeatureSupport: jest.fn(() => ({ webnn: true })),
    initializeModel: jest.fn(async () => ({ initialized: true })),
    runInference: jest.fn(async () => ({ isSimulation: false })),
    shutdown: jest.fn(async () => undefined),
    ...overrides
  };
}

describe('WebNN benchmark result handling', () => {
  it('calculates WebNN, CPU, and speedup metrics from measured latencies', async () => {
    const implementation = createMockImplementation();
    const timestamps = [
      0, 12, 12, 30, 30, 54,
      54, 154, 154, 274, 274, 424
    ];

    const results = await runWebNNBenchmark({
      modelName: 'bert-base-uncased',
      browser: 'chrome',
      batchSize: 1,
      iterations: 3,
      implementation,
      now: jest.fn(() => timestamps.shift() ?? 424),
      runCpuInference: jest.fn(async () => undefined)
    });

    expect(results.webnnStatus).toBe('real_hardware');
    expect(results.webnnPerformance).toMatchObject({
      averageLatencyMs: 18,
      minLatencyMs: 12,
      maxLatencyMs: 24,
      throughputItemsPerSecond: 1000 / 18,
      isSimulation: false
    });
    expect(results.cpuPerformance).toMatchObject({
      averageLatencyMs: 123.33333333333333,
      minLatencyMs: 100,
      maxLatencyMs: 150
    });
    expect(results.speedup).toBeCloseTo(6.85185, 5);
    expect(implementation.shutdown).toHaveBeenCalledTimes(1);
  });

  it('marks unsupported browsers without running model setup', async () => {
    const implementation = createMockImplementation({
      getFeatureSupport: jest.fn(() => ({ webnn: false }))
    });

    const results = await runWebNNBenchmark({
      modelName: 'bert-base-uncased',
      browser: 'firefox',
      batchSize: 1,
      iterations: 3,
      implementation,
      now: jest.fn(() => 0),
      runCpuInference: jest.fn(async () => undefined)
    });

    expect(results.webnnStatus).toBe('not_supported');
    expect(results.webnnPerformance).toBeNull();
    expect(results.cpuPerformance).toBeNull();
    expect(implementation.initializeModel).not.toHaveBeenCalled();
    expect(implementation.shutdown).toHaveBeenCalledTimes(1);
  });
});
