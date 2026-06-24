import { describe, expect, it } from "@jest/globals";

type BrowserCapabilities = {
  browser: string;
  webnnAvailable: boolean;
  webgpuAvailable: boolean;
  hardwareAcceleration: boolean;
  device?: string;
  error?: string;
};

type AccelerationResult = {
  browser: string;
  model: string;
  batchSize: number;
  cpuTimeMs?: number;
  webnnTimeMs?: number;
  speedup?: number;
  simulated: boolean;
  error?: string;
};

type FallbackResult = {
  browser: string;
  webnnDisabled: boolean;
  gracefulFallback: boolean;
  errorHandling: boolean;
  fallbackPerformance?: string;
  error?: string;
};

type CrossBrowserResults = {
  system: {
    platform: string;
    platformVersion: string;
    processor: string;
  };
  browsers: Record<string, BrowserCapabilities>;
  acceleration: Record<string, Record<string, Record<string, AccelerationResult>>>;
  fallbacks: Record<string, FallbackResult>;
};

const SUPPORTED_BROWSERS = ["chrome", "edge", "safari", "firefox"] as const;
const DEFAULT_BATCH_SIZES = [1, 2, 4, 8];

function extractLineValue(output: string, label: string): string | undefined {
  const line = output.split(/\r?\n/).find((candidate) => candidate.includes(label));

  return line?.split(label)[1]?.trim();
}

function parseFirstNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/-?\d+(?:\.\d+)?/);

  return match ? Number(match[0]) : undefined;
}

function parseBrowserCapabilities(browser: string, output: string): BrowserCapabilities {
  return {
    browser,
    webnnAvailable: output.includes("WebNN: Available"),
    webgpuAvailable: output.includes("WebGPU: Available"),
    hardwareAcceleration: output.includes("Hardware Acceleration: Enabled"),
    device: extractLineValue(output, "Device:"),
  };
}

function parseAccelerationResult(
  browser: string,
  model: string,
  batchSize: number,
  output: string,
): AccelerationResult {
  const simulationValue = extractLineValue(output, "Simulation:");

  return {
    browser,
    model,
    batchSize,
    cpuTimeMs: parseFirstNumber(extractLineValue(output, "CPU Time:")),
    webnnTimeMs: parseFirstNumber(extractLineValue(output, "WebNN Time:")),
    speedup: parseFirstNumber(extractLineValue(output, "Speedup:")),
    simulated: simulationValue ? /true/i.test(simulationValue) : false,
  };
}

function parseFallbackResult(browser: string, output: string): FallbackResult {
  return {
    browser,
    webnnDisabled: true,
    gracefulFallback: output.includes("Fallback to CPU: Success"),
    errorHandling: output.includes("Error properly handled"),
    fallbackPerformance: extractLineValue(output, "Fallback Performance:"),
  };
}

function disableWebNNFlag(browser: string): string {
  return browser === "safari" ? "--disable-web-api-webnn" : "--disable-webnn";
}

function buildCapabilityCommand(browser: string): string[] {
  return ["./run_browser_capability_check.sh", `--browser=${browser}`];
}

function buildBenchmarkCommand(browser: string, model: string, batchSize: number): string[] {
  return [
    "./run_webnn_benchmark.sh",
    `--browser=${browser}`,
    `--model=${model}`,
    `--batch-size=${batchSize}`,
  ];
}

function buildFallbackCommand(browser: string): string[] {
  return [
    "./run_browser_capability_check.sh",
    `--browser=${browser}`,
    `--extra-args=${disableWebNNFlag(browser)}`,
  ];
}

function generateMarkdownReport(results: CrossBrowserResults): string {
  const lines = [
    "# WebNN Cross-Browser Verification Report",
    "",
    "## System Information",
    "",
    `- Platform: ${results.system.platform}`,
    `- Platform Version: ${results.system.platformVersion}`,
    `- Processor: ${results.system.processor}`,
    "",
    "## Browser WebNN Capabilities",
    "",
    "| Browser | WebNN Available | WebGPU Available | Hardware Acceleration | Device |",
    "|---------|-----------------|------------------|-----------------------|--------|",
  ];

  for (const [browser, capabilities] of Object.entries(results.browsers)) {
    lines.push(
      `| ${browser} | ${capabilities.webnnAvailable ? "yes" : "no"} | ${
        capabilities.webgpuAvailable ? "yes" : "no"
      } | ${capabilities.hardwareAcceleration ? "yes" : "no"} | ${
        capabilities.device ?? "N/A"
      } |`,
    );
  }

  lines.push("", "## Hardware Acceleration Performance", "");

  for (const [browser, models] of Object.entries(results.acceleration)) {
    lines.push(`### ${browser}`, "");

    for (const [model, batchResults] of Object.entries(models)) {
      lines.push(
        `#### Model: ${model}`,
        "",
        "| Batch Size | CPU Time (ms) | WebNN Time (ms) | Speedup | Simulated |",
        "|------------|---------------|-----------------|---------|-----------|",
      );

      for (const [batchSize, result] of Object.entries(batchResults)) {
        if (result.error) {
          lines.push(`| ${batchSize} | Error: ${result.error} | - | - | - |`);
        } else {
          lines.push(
            `| ${batchSize} | ${result.cpuTimeMs ?? "N/A"} | ${
              result.webnnTimeMs ?? "N/A"
            } | ${result.speedup ?? "N/A"}x | ${result.simulated ? "yes" : "no"} |`,
          );
        }
      }

      lines.push("");
    }
  }

  lines.push(
    "## Fallback Behavior",
    "",
    "| Browser | Graceful Fallback | Error Handling | Notes |",
    "|---------|-------------------|----------------|-------|",
  );

  for (const [browser, fallback] of Object.entries(results.fallbacks)) {
    lines.push(
      `| ${browser} | ${fallback.gracefulFallback ? "yes" : "no"} | ${
        fallback.errorHandling ? "yes" : "no"
      } | ${fallback.error ? `Error: ${fallback.error}` : fallback.fallbackPerformance ?? "N/A"} |`,
    );
  }

  return `${lines.join("\n")}\n`;
}

describe("WebNN cross-browser verification helpers", () => {
  it("keeps the supported browser and batch defaults explicit", () => {
    expect(SUPPORTED_BROWSERS).toEqual(["chrome", "edge", "safari", "firefox"]);
    expect(DEFAULT_BATCH_SIZES).toEqual([1, 2, 4, 8]);
  });

  it("builds the shell commands expected by the browser verification scripts", () => {
    expect(buildCapabilityCommand("edge")).toEqual([
      "./run_browser_capability_check.sh",
      "--browser=edge",
    ]);
    expect(buildBenchmarkCommand("chrome", "prajjwal1/bert-tiny", 4)).toEqual([
      "./run_webnn_benchmark.sh",
      "--browser=chrome",
      "--model=prajjwal1/bert-tiny",
      "--batch-size=4",
    ]);
    expect(buildFallbackCommand("safari")).toEqual([
      "./run_browser_capability_check.sh",
      "--browser=safari",
      "--extra-args=--disable-web-api-webnn",
    ]);
  });

  it("parses browser capability output without relying on browser automation", () => {
    const result = parseBrowserCapabilities(
      "edge",
      [
        "Browser: Edge",
        "WebNN: Available",
        "WebGPU: Available",
        "Hardware Acceleration: Enabled",
        "Device: Intel NPU",
      ].join("\n"),
    );

    expect(result).toEqual({
      browser: "edge",
      webnnAvailable: true,
      webgpuAvailable: true,
      hardwareAcceleration: true,
      device: "Intel NPU",
    });
  });

  it("parses benchmark output metrics and simulation state", () => {
    const result = parseAccelerationResult(
      "chrome",
      "prajjwal1/bert-tiny",
      2,
      [
        "CPU Time: 28.5 ms",
        "WebNN Time: 9.25 ms",
        "Speedup: 3.08x",
        "Simulation: False",
      ].join("\n"),
    );

    expect(result).toEqual({
      browser: "chrome",
      model: "prajjwal1/bert-tiny",
      batchSize: 2,
      cpuTimeMs: 28.5,
      webnnTimeMs: 9.25,
      speedup: 3.08,
      simulated: false,
    });
  });

  it("parses WebNN fallback behavior output", () => {
    expect(
      parseFallbackResult(
        "firefox",
        [
          "Fallback to CPU: Success",
          "Error properly handled",
          "Fallback Performance: 42 ms",
        ].join("\n"),
      ),
    ).toEqual({
      browser: "firefox",
      webnnDisabled: true,
      gracefulFallback: true,
      errorHandling: true,
      fallbackPerformance: "42 ms",
    });
  });

  it("generates a stable markdown report from collected cross-browser results", () => {
    const report = generateMarkdownReport({
      system: {
        platform: "Linux",
        platformVersion: "6.8.0",
        processor: "x64",
      },
      browsers: {
        edge: parseBrowserCapabilities(
          "edge",
          "WebNN: Available\nWebGPU: Available\nHardware Acceleration: Enabled\nDevice: NPU",
        ),
      },
      acceleration: {
        edge: {
          "prajjwal1/bert-tiny": {
            "1": parseAccelerationResult(
              "edge",
              "prajjwal1/bert-tiny",
              1,
              "CPU Time: 12 ms\nWebNN Time: 4 ms\nSpeedup: 3x",
            ),
          },
        },
      },
      fallbacks: {
        edge: parseFallbackResult(
          "edge",
          "Fallback to CPU: Success\nError properly handled\nFallback Performance: 15 ms",
        ),
      },
    });

    expect(report).toContain("# WebNN Cross-Browser Verification Report");
    expect(report).toContain("| edge | yes | yes | yes | NPU |");
    expect(report).toContain("| 1 | 12 | 4 | 3x | no |");
    expect(report).toContain("| edge | yes | yes | 15 ms |");
  });
});
