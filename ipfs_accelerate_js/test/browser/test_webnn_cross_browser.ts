import { describe, expect, it, jest } from '@jest/globals';

type BrowserName = 'chrome' | 'edge' | 'safari' | 'firefox';

interface CommandResult {
  stdout: string;
}

interface CommandError extends Error {
  stdout?: string;
}

interface CommandRunner {
  run(command: string, args: string[], timeoutMs: number): Promise<CommandResult>;
}

interface BrowserCapabilities {
  browser: BrowserName;
  webnnAvailable: boolean;
  webgpuAvailable: boolean;
  hardwareAcceleration: boolean;
  device?: string;
  error: string | null;
  output?: string;
}

interface AccelerationResult {
  browser: BrowserName;
  model: string;
  batchSize: number;
  cpuTimeMs?: number;
  webnnTimeMs?: number;
  speedup?: number;
  simulated: boolean;
  error: string | null;
  output?: string;
}

interface FallbackResult {
  browser: BrowserName;
  webnnDisabled: boolean;
  gracefulFallback: boolean;
  errorHandling: boolean;
  fallbackPerformance?: string;
  error: string | null;
  output?: string;
}

interface WebNNCrossBrowserResults {
  timestamp: number;
  browsers: Record<BrowserName, BrowserCapabilities>;
  acceleration: Partial<Record<BrowserName, Record<string, Record<number, AccelerationResult>>>>;
  fallbacks: Record<BrowserName, FallbackResult>;
}

const DEFAULT_BATCH_SIZES = [1, 2, 4, 8];
const DEFAULT_MODELS = ['prajjwal1/bert-tiny'];
const SUPPORTED_BROWSERS: BrowserName[] = ['chrome', 'edge', 'safari', 'firefox'];

function parseNumberAfterLabel(output: string, label: string): number | undefined {
  const line = output
    .split('\n')
    .find((candidate) => candidate.toLowerCase().includes(label.toLowerCase()));
  if (!line) {
    return undefined;
  }

  const numericValue = line
    .slice(line.toLowerCase().indexOf(label.toLowerCase()) + label.length)
    .trim()
    .match(/-?\d+(?:\.\d+)?/);

  return numericValue ? Number(numericValue[0]) : undefined;
}

function parseValueAfterLabel(output: string, label: string): string | undefined {
  const line = output
    .split('\n')
    .find((candidate) => candidate.toLowerCase().includes(label.toLowerCase()));

  if (!line) {
    return undefined;
  }

  return line.slice(line.toLowerCase().indexOf(label.toLowerCase()) + label.length).trim();
}

function formatCommandError(error: unknown): { error: string; output?: string } {
  if (error instanceof Error) {
    const commandError = error as CommandError;
    return {
      error: commandError.message,
      ...(commandError.stdout ? { output: commandError.stdout } : {})
    };
  }

  return { error: String(error) };
}

function getFallbackDisableFlag(browser: BrowserName): string {
  return browser === 'safari' ? '--disable-web-api-webnn' : '--disable-webnn';
}

async function testBrowserCapabilities(options: {
  browser: BrowserName;
  runner: CommandRunner;
  timeoutMs: number;
}): Promise<BrowserCapabilities> {
  const { browser, runner, timeoutMs } = options;

  try {
    const { stdout } = await runner.run(
      './run_browser_capability_check.sh',
      [`--browser=${browser}`],
      timeoutMs
    );

    return {
      browser,
      webnnAvailable: stdout.includes('WebNN: Available'),
      webgpuAvailable: stdout.includes('WebGPU: Available'),
      hardwareAcceleration: stdout.includes('Hardware Acceleration: Enabled'),
      ...(parseValueAfterLabel(stdout, 'Device:') ? { device: parseValueAfterLabel(stdout, 'Device:') } : {}),
      error: null
    };
  } catch (error) {
    return {
      browser,
      webnnAvailable: false,
      webgpuAvailable: false,
      hardwareAcceleration: false,
      ...formatCommandError(error)
    };
  }
}

async function testHardwareAcceleration(options: {
  browser: BrowserName;
  model: string;
  batchSize: number;
  runner: CommandRunner;
  timeoutMs: number;
}): Promise<AccelerationResult> {
  const { browser, model, batchSize, runner, timeoutMs } = options;

  try {
    const { stdout } = await runner.run(
      './run_webnn_benchmark.sh',
      [`--browser=${browser}`, `--model=${model}`, `--batch-size=${batchSize}`],
      timeoutMs
    );

    return {
      browser,
      model,
      batchSize,
      ...(parseNumberAfterLabel(stdout, 'CPU Time:') !== undefined
        ? { cpuTimeMs: parseNumberAfterLabel(stdout, 'CPU Time:') }
        : {}),
      ...(parseNumberAfterLabel(stdout, 'WebNN Time:') !== undefined
        ? { webnnTimeMs: parseNumberAfterLabel(stdout, 'WebNN Time:') }
        : {}),
      ...(parseNumberAfterLabel(stdout, 'Speedup:') !== undefined
        ? { speedup: parseNumberAfterLabel(stdout, 'Speedup:') }
        : {}),
      simulated: parseValueAfterLabel(stdout, 'Simulation:')?.toLowerCase() === 'true',
      error: null
    };
  } catch (error) {
    return {
      browser,
      model,
      batchSize,
      simulated: false,
      ...formatCommandError(error)
    };
  }
}

async function testFallbackBehavior(options: {
  browser: BrowserName;
  runner: CommandRunner;
  timeoutMs: number;
}): Promise<FallbackResult> {
  const { browser, runner, timeoutMs } = options;

  try {
    const { stdout } = await runner.run(
      './run_browser_capability_check.sh',
      [`--browser=${browser}`, `--extra-args=${getFallbackDisableFlag(browser)}`],
      timeoutMs
    );

    return {
      browser,
      webnnDisabled: true,
      gracefulFallback: stdout.includes('Fallback to CPU: Success'),
      errorHandling: stdout.includes('Error properly handled'),
      ...(parseValueAfterLabel(stdout, 'Fallback Performance:')
        ? { fallbackPerformance: parseValueAfterLabel(stdout, 'Fallback Performance:') }
        : {}),
      error: null
    };
  } catch (error) {
    return {
      browser,
      webnnDisabled: true,
      gracefulFallback: false,
      errorHandling: false,
      ...formatCommandError(error)
    };
  }
}

async function runCrossBrowserWebNNVerification(options: {
  browsers?: BrowserName[];
  models?: string[];
  batchSizes?: number[];
  runner: CommandRunner;
  now: () => number;
  timeoutMs: number;
}): Promise<WebNNCrossBrowserResults> {
  const browsers = options.browsers ?? ['edge'];
  const models = options.models ?? DEFAULT_MODELS;
  const batchSizes = options.batchSizes ?? DEFAULT_BATCH_SIZES;
  const results: WebNNCrossBrowserResults = {
    timestamp: options.now(),
    browsers: {} as Record<BrowserName, BrowserCapabilities>,
    acceleration: {},
    fallbacks: {} as Record<BrowserName, FallbackResult>
  };

  for (const browser of browsers) {
    results.browsers[browser] = await testBrowserCapabilities({
      browser,
      runner: options.runner,
      timeoutMs: options.timeoutMs
    });
  }

  for (const browser of browsers) {
    if (!results.browsers[browser].webnnAvailable) {
      continue;
    }

    results.acceleration[browser] = {};
    for (const model of models) {
      results.acceleration[browser][model] = {};
      for (const batchSize of batchSizes) {
        results.acceleration[browser][model][batchSize] = await testHardwareAcceleration({
          browser,
          model,
          batchSize,
          runner: options.runner,
          timeoutMs: options.timeoutMs
        });
      }
    }
  }

  for (const browser of browsers) {
    results.fallbacks[browser] = await testFallbackBehavior({
      browser,
      runner: options.runner,
      timeoutMs: options.timeoutMs
    });
  }

  return results;
}

function generateMarkdownReport(results: WebNNCrossBrowserResults): string {
  const capabilityRows = Object.values(results.browsers)
    .map((capability) =>
      [
        capability.browser,
        capability.webnnAvailable ? 'yes' : 'no',
        capability.webgpuAvailable ? 'yes' : 'no',
        capability.hardwareAcceleration ? 'yes' : 'no',
        capability.device ?? 'N/A'
      ].join(' | ')
    )
    .join('\n');

  const fallbackRows = Object.values(results.fallbacks)
    .map((fallback) =>
      [
        fallback.browser,
        fallback.gracefulFallback ? 'yes' : 'no',
        fallback.errorHandling ? 'yes' : 'no',
        fallback.fallbackPerformance ?? fallback.error ?? 'N/A'
      ].join(' | ')
    )
    .join('\n');

  return [
    '# WebNN Cross-Browser Verification Report',
    '',
    '## Browser WebNN Capabilities',
    '',
    'Browser | WebNN Available | WebGPU Available | Hardware Acceleration | Device',
    '--- | --- | --- | --- | ---',
    capabilityRows,
    '',
    '## Fallback Behavior',
    '',
    'Browser | Graceful Fallback | Error Handling | Notes',
    '--- | --- | --- | ---',
    fallbackRows
  ].join('\n');
}

function createMockRunner(responses: Record<string, string | Error>): CommandRunner {
  return {
    run: jest.fn(async (command: string, args: string[]) => {
      const key = [command, ...args].join(' ');
      const response = responses[key];
      if (response instanceof Error) {
        throw response;
      }

      return { stdout: response ?? '' };
    })
  };
}

describe('WebNN cross-browser verification', () => {
  it('parses browser capabilities from the capability script output', async () => {
    const runner = createMockRunner({
      './run_browser_capability_check.sh --browser=edge': [
        'WebNN: Available',
        'WebGPU: Available',
        'Hardware Acceleration: Enabled',
        'Device: Intel Arc'
      ].join('\n')
    });

    await expect(
      testBrowserCapabilities({ browser: 'edge', runner, timeoutMs: 300000 })
    ).resolves.toEqual({
      browser: 'edge',
      webnnAvailable: true,
      webgpuAvailable: true,
      hardwareAcceleration: true,
      device: 'Intel Arc',
      error: null
    });
  });

  it('builds WebNN benchmark command arguments and parses performance metrics', async () => {
    const runner = createMockRunner({
      './run_webnn_benchmark.sh --browser=chrome --model=prajjwal1/bert-tiny --batch-size=4': [
        'CPU Time: 42.5 ms',
        'WebNN Time: 11.25 ms',
        'Speedup: 3.78x',
        'Simulation: False'
      ].join('\n')
    });

    await expect(
      testHardwareAcceleration({
        browser: 'chrome',
        model: 'prajjwal1/bert-tiny',
        batchSize: 4,
        runner,
        timeoutMs: 300000
      })
    ).resolves.toMatchObject({
      browser: 'chrome',
      model: 'prajjwal1/bert-tiny',
      batchSize: 4,
      cpuTimeMs: 42.5,
      webnnTimeMs: 11.25,
      speedup: 3.78,
      simulated: false,
      error: null
    });
  });

  it('uses the Safari-specific WebNN disable flag when checking fallback behavior', async () => {
    const runner = createMockRunner({
      './run_browser_capability_check.sh --browser=safari --extra-args=--disable-web-api-webnn': [
        'Fallback to CPU: Success',
        'Error properly handled',
        'Fallback Performance: 88 ms'
      ].join('\n')
    });

    await expect(
      testFallbackBehavior({ browser: 'safari', runner, timeoutMs: 300000 })
    ).resolves.toEqual({
      browser: 'safari',
      webnnDisabled: true,
      gracefulFallback: true,
      errorHandling: true,
      fallbackPerformance: '88 ms',
      error: null
    });
  });

  it('skips acceleration benchmarks for browsers without WebNN support', async () => {
    const runner = createMockRunner({
      './run_browser_capability_check.sh --browser=firefox': 'WebNN: Unavailable',
      './run_browser_capability_check.sh --browser=firefox --extra-args=--disable-webnn':
        'Error properly handled'
    });

    const results = await runCrossBrowserWebNNVerification({
      browsers: ['firefox'],
      models: ['prajjwal1/bert-tiny'],
      batchSizes: [1],
      runner,
      now: () => 123,
      timeoutMs: 300000
    });

    expect(results.timestamp).toBe(123);
    expect(results.browsers.firefox.webnnAvailable).toBe(false);
    expect(results.acceleration.firefox).toBeUndefined();
    expect(results.fallbacks.firefox).toMatchObject({
      browser: 'firefox',
      webnnDisabled: true,
      gracefulFallback: false,
      errorHandling: true
    });
  });

  it('generates a stable markdown summary from collected results', () => {
    const markdown = generateMarkdownReport({
      timestamp: 123,
      browsers: {
        edge: {
          browser: 'edge',
          webnnAvailable: true,
          webgpuAvailable: true,
          hardwareAcceleration: true,
          device: 'NPU',
          error: null
        }
      } as Record<BrowserName, BrowserCapabilities>,
      acceleration: {},
      fallbacks: {
        edge: {
          browser: 'edge',
          webnnDisabled: true,
          gracefulFallback: true,
          errorHandling: true,
          fallbackPerformance: '90 ms',
          error: null
        }
      } as Record<BrowserName, FallbackResult>
    });

    expect(markdown).toContain('edge | yes | yes | yes | NPU');
    expect(markdown).toContain('edge | yes | yes | 90 ms');
  });

  it('keeps the supported browser list explicit for all-browser runs', () => {
    expect(SUPPORTED_BROWSERS).toEqual(['chrome', 'edge', 'safari', 'firefox']);
  });
});
