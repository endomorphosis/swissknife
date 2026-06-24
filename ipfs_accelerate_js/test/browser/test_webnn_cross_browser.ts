describe("WebNN cross-browser verification helpers", () => {
  const SUPPORTED_BROWSERS = ["chrome", "edge", "safari", "firefox"];
  const DEFAULT_BROWSER = "edge";
  const DEFAULT_MODELS = ["prajjwal1/bert-tiny"];
  const SUPPORTED_MODELS = ["prajjwal1/bert-tiny", "t5-small", "vit-base"];
  const DEFAULT_BATCH_SIZES = [1, 2, 4, 8];

  function resolveBrowsers(options) {
    if (options.allBrowsers) {
      return [...SUPPORTED_BROWSERS];
    }

    return [options.browser ?? DEFAULT_BROWSER];
  }

  function resolveModels(options) {
    if (options.models?.length) {
      return options.models;
    }

    if (options.model) {
      return [options.model];
    }

    return [...DEFAULT_MODELS];
  }

  function resolveBatchSizes(options) {
    return options.batchSizes?.length ? options.batchSizes : [...DEFAULT_BATCH_SIZES];
  }

  function parseCapabilityOutput(browser, output) {
    const deviceLine = output
      .split(/\r?\n/)
      .find((line) => line.trim().startsWith("Device:"));

    return {
      browser,
      webnnAvailable: output.includes("WebNN: Available"),
      webgpuAvailable: output.includes("WebGPU: Available"),
      hardwareAcceleration: output.includes("Hardware Acceleration: Enabled"),
      device: deviceLine?.split("Device:")[1]?.trim(),
      error: null,
    };
  }

  function parseBenchmarkOutput(browser, model, batchSize, output) {
    return {
      browser,
      model,
      batchSize,
      cpuTimeMs: parseMetric(output, "CPU Time"),
      webnnTimeMs: parseMetric(output, "WebNN Time"),
      speedup: parseSpeedup(output),
      simulated: output.includes("SIMULATION") || output.includes("simulated"),
      error: null,
    };
  }

  function parseFallbackOutput(browser, output) {
    const performanceLine = output
      .split(/\r?\n/)
      .find((line) => line.trim().startsWith("Fallback Performance:"));

    return {
      browser,
      disableFlag: getDisableWebNNFlag(browser),
      webnnDisabled: true,
      gracefulFallback: output.includes("Fallback to CPU: Success"),
      errorHandling: output.includes("Error properly handled"),
      fallbackPerformance: performanceLine?.split("Fallback Performance:")[1]?.trim(),
      error: null,
    };
  }

  function parseMetric(output, label) {
    const match = output.match(new RegExp(`${label}:\\s*([0-9]+(?:\\.[0-9]+)?)\\s*ms`, "i"));
    return match ? Number(match[1]) : undefined;
  }

  function parseSpeedup(output) {
    const match = output.match(/Speedup:\s*([0-9]+(?:\.[0-9]+)?)x/i);
    return match ? Number(match[1]) : undefined;
  }

  function getDisableWebNNFlag(browser) {
    if (browser === "edge" || browser === "chrome") {
      return "--disable-features=WebNN";
    }

    return "--disable-webnn";
  }

  function buildCapabilityCommand(browser) {
    return ["./run_browser_capability_check.sh", browser];
  }

  function buildBenchmarkCommand(browser, model, batchSize) {
    return ["./run_webnn_benchmark.sh", browser, model, String(batchSize)];
  }

  function buildFallbackCommand(browser) {
    return ["./run_browser_capability_check.sh", browser, getDisableWebNNFlag(browser)];
  }

  function createVerificationMatrix(options) {
    const browsers = resolveBrowsers(options);
    const models = resolveModels(options);
    const batchSizes = resolveBatchSizes(options);

    return browsers.flatMap((browser) =>
      models.flatMap((model) =>
        batchSizes.map((batchSize) => ({
          browser,
          model,
          batchSize,
          capabilityCommand: buildCapabilityCommand(browser),
          benchmarkCommand: buildBenchmarkCommand(browser, model, batchSize),
          fallbackCommand: buildFallbackCommand(browser),
        })),
      ),
    );
  }

  function summarizeBenchmark(result) {
    return {
      browser: result.browser,
      model: result.model,
      batchSize: result.batchSize,
      accelerated: Boolean(result.webnnTimeMs && result.cpuTimeMs && result.webnnTimeMs < result.cpuTimeMs),
      speedup: result.speedup ?? null,
      simulated: result.simulated,
      error: result.error,
    };
  }

  function buildMarkdownReport(capabilities, benchmarks, fallbacks) {
    const capabilityRows = capabilities.map((capability) =>
      [
        capability.browser,
        capability.webnnAvailable ? "yes" : "no",
        capability.webgpuAvailable ? "yes" : "no",
        capability.hardwareAcceleration ? "yes" : "no",
        capability.device ?? "N/A",
      ].join(" | "),
    );
    const benchmarkRows = benchmarks.map((benchmark) =>
      [
        benchmark.browser,
        benchmark.model,
        benchmark.batchSize,
        benchmark.cpuTimeMs ?? "N/A",
        benchmark.webnnTimeMs ?? "N/A",
        benchmark.speedup ?? "N/A",
        benchmark.simulated ? "yes" : "no",
      ].join(" | "),
    );
    const fallbackRows = fallbacks.map((fallback) =>
      [
        fallback.browser,
        fallback.gracefulFallback ? "yes" : "no",
        fallback.errorHandling ? "yes" : "no",
        fallback.fallbackPerformance ?? "N/A",
      ].join(" | "),
    );

    return [
      "# WebNN Cross-Browser Verification Report",
      "",
      "## Browser WebNN Capabilities",
      "Browser | WebNN | WebGPU | Hardware Acceleration | Device",
      "--- | --- | --- | --- | ---",
      ...capabilityRows,
      "",
      "## Hardware Acceleration Performance",
      "Browser | Model | Batch Size | CPU Time ms | WebNN Time ms | Speedup | Simulated",
      "--- | --- | --- | --- | --- | --- | ---",
      ...benchmarkRows,
      "",
      "## Fallback Behavior",
      "Browser | Graceful Fallback | Error Handling | Notes",
      "--- | --- | --- | ---",
      ...fallbackRows,
    ].join("\n");
  }

  it("defaults to Edge, the tiny BERT model, and standard batch sizes", () => {
    expect(resolveBrowsers({})).toEqual(["edge"]);
    expect(resolveModels({})).toEqual(["prajjwal1/bert-tiny"]);
    expect(resolveBatchSizes({})).toEqual([1, 2, 4, 8]);
  });

  it("expands all supported browsers while preserving explicit models and batch sizes", () => {
    const matrix = createVerificationMatrix({
      allBrowsers: true,
      models: SUPPORTED_MODELS,
      batchSizes: [1],
    });

    expect(matrix).toHaveLength(SUPPORTED_BROWSERS.length * SUPPORTED_MODELS.length);
    expect(matrix[0]).toMatchObject({
      browser: "chrome",
      model: "prajjwal1/bert-tiny",
      batchSize: 1,
      capabilityCommand: ["./run_browser_capability_check.sh", "chrome"],
      benchmarkCommand: ["./run_webnn_benchmark.sh", "chrome", "prajjwal1/bert-tiny", "1"],
    });
  });

  it("parses browser capability output including hardware device details", () => {
    const capability = parseCapabilityOutput(
      "edge",
      [
        "WebNN: Available",
        "WebGPU: Available",
        "Hardware Acceleration: Enabled",
        "Device: Intel NPU",
      ].join("\n"),
    );

    expect(capability).toEqual({
      browser: "edge",
      webnnAvailable: true,
      webgpuAvailable: true,
      hardwareAcceleration: true,
      device: "Intel NPU",
      error: null,
    });
  });

  it("parses benchmark output without requiring simulation", () => {
    const result = parseBenchmarkOutput(
      "chrome",
      "prajjwal1/bert-tiny",
      2,
      ["CPU Time: 24.5 ms", "WebNN Time: 8.1 ms", "Speedup: 3.02x"].join("\n"),
    );

    expect(result).toMatchObject({
      browser: "chrome",
      model: "prajjwal1/bert-tiny",
      batchSize: 2,
      cpuTimeMs: 24.5,
      webnnTimeMs: 8.1,
      speedup: 3.02,
      simulated: false,
    });
    expect(summarizeBenchmark(result).accelerated).toBe(true);
  });

  it("uses Chromium feature flags when checking WebNN fallback behavior", () => {
    expect(buildFallbackCommand("edge")).toEqual([
      "./run_browser_capability_check.sh",
      "edge",
      "--disable-features=WebNN",
    ]);
    expect(buildFallbackCommand("safari")).toEqual([
      "./run_browser_capability_check.sh",
      "safari",
      "--disable-webnn",
    ]);
  });

  it("parses fallback output and includes it in the report", () => {
    const fallback = parseFallbackOutput(
      "firefox",
      ["Fallback to CPU: Success", "Error properly handled", "Fallback Performance: 41 ms"].join("\n"),
    );
    const report = buildMarkdownReport(
      [
        {
          browser: "firefox",
          webnnAvailable: false,
          webgpuAvailable: true,
          hardwareAcceleration: false,
          error: null,
        },
      ],
      [
        {
          browser: "firefox",
          model: "prajjwal1/bert-tiny",
          batchSize: 1,
          simulated: true,
          error: null,
        },
      ],
      [fallback],
    );

    expect(fallback).toMatchObject({
      browser: "firefox",
      disableFlag: "--disable-webnn",
      webnnDisabled: true,
      gracefulFallback: true,
      errorHandling: true,
      fallbackPerformance: "41 ms",
    });
    expect(report).toContain("# WebNN Cross-Browser Verification Report");
    expect(report).toContain("firefox | yes | yes | 41 ms");
  });
});
