type MetricName = "throughput" | "latency" | "memory";

interface PerformanceSample {
  modelName: string;
  hardwareType: string;
  batchSize: number;
  versionTag: string;
  timestamp: Date;
  throughput: number;
  latency: number;
  memory: number;
}

interface Regression {
  modelName: string;
  hardwareType: string;
  metric: MetricName;
  baseline: number;
  current: number;
  percentChange: number;
  severity: "minor" | "major";
}

const metricDirection: Record<MetricName, "higher-is-better" | "lower-is-better"> = {
  throughput: "higher-is-better",
  latency: "lower-is-better",
  memory: "lower-is-better",
};

function groupKey(sample: Pick<PerformanceSample, "modelName" | "hardwareType" | "batchSize">): string {
  return `${sample.modelName}:${sample.hardwareType}:${sample.batchSize}`;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function metricValue(sample: PerformanceSample, metric: MetricName): number {
  return sample[metric];
}

function createPerformanceSamples(): PerformanceSample[] {
  const start = Date.UTC(2025, 2, 1);
  const combinations = [
    { modelName: "bert-base-uncased", hardwareType: "cuda", baseThroughput: 100, baseLatency: 10 },
    { modelName: "bert-base-uncased", hardwareType: "webgpu", baseThroughput: 35, baseLatency: 30 },
    { modelName: "vit-base", hardwareType: "cuda", baseThroughput: 200, baseLatency: 5 },
  ];

  return combinations.flatMap((combination) =>
    Array.from({ length: 8 }, (_, index) => {
      const regressed = combination.modelName === "bert-base-uncased" && combination.hardwareType === "cuda" && index >= 6;
      const trend = 1 + index * 0.01;

      return {
        modelName: combination.modelName,
        hardwareType: combination.hardwareType,
        batchSize: 1,
        versionTag: `v1.${Math.floor(index / 4)}.0`,
        timestamp: new Date(start + index * 24 * 60 * 60 * 1000),
        throughput: combination.baseThroughput * trend * (regressed ? 0.74 : 1),
        latency: combination.baseLatency * (2 - trend) * (regressed ? 1.32 : 1),
        memory: 1024 + index * 2,
      };
    }),
  );
}

function detectRegressions(samples: PerformanceSample[], metric: MetricName, windowSize: number, threshold: number): Regression[] {
  const groups = new Map<string, PerformanceSample[]>();

  for (const sample of samples) {
    const key = groupKey(sample);
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }

  const regressions: Regression[] = [];

  for (const group of groups.values()) {
    const sorted = [...group].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
    if (sorted.length < windowSize + 1) {
      continue;
    }

    const baselineWindow = sorted.slice(0, windowSize);
    const current = sorted[sorted.length - 1];
    const baseline = average(baselineWindow.map((sample) => metricValue(sample, metric)));
    const currentValue = metricValue(current, metric);
    const rawChange = (currentValue - baseline) / baseline;
    const regressionChange = metricDirection[metric] === "higher-is-better" ? -rawChange : rawChange;

    if (regressionChange >= threshold) {
      regressions.push({
        modelName: current.modelName,
        hardwareType: current.hardwareType,
        metric,
        baseline,
        current: currentValue,
        percentChange: regressionChange * 100,
        severity: regressionChange >= threshold * 2 ? "major" : "minor",
      });
    }
  }

  return regressions;
}

function summarizeTrend(samples: PerformanceSample[], metric: MetricName): { first: number; last: number; direction: "up" | "down" | "flat" } {
  const sorted = [...samples].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
  const first = metricValue(sorted[0], metric);
  const last = metricValue(sorted[sorted.length - 1], metric);

  return {
    first,
    last,
    direction: last > first ? "up" : last < first ? "down" : "flat",
  };
}

function buildRegressionReport(regressions: Regression[]): Array<Record<string, string | number>> {
  return regressions.map((regression) => ({
    model: regression.modelName,
    hardware: regression.hardwareType,
    metric: regression.metric,
    baseline: Number(regression.baseline.toFixed(2)),
    current: Number(regression.current.toFixed(2)),
    percentChange: Number(regression.percentChange.toFixed(2)),
    severity: regression.severity,
  }));
}

describe("time-series performance tracking", () => {
  it("creates deterministic sample data across models, hardware, timestamps, and versions", () => {
    const samples = createPerformanceSamples();

    expect(samples).toHaveLength(24);
    expect(new Set(samples.map(groupKey))).toEqual(
      new Set(["bert-base-uncased:cuda:1", "bert-base-uncased:webgpu:1", "vit-base:cuda:1"]),
    );
    expect(new Set(samples.map((sample) => sample.versionTag))).toEqual(new Set(["v1.0.0", "v1.1.0"]));
    expect(samples[0].timestamp.toISOString()).toBe("2025-03-01T00:00:00.000Z");
  });

  it("detects throughput and latency regressions for the affected model-hardware series only", () => {
    const samples = createPerformanceSamples();

    const throughputRegressions = detectRegressions(samples, "throughput", 5, 0.1);
    const latencyRegressions = detectRegressions(samples, "latency", 5, 0.1);

    expect(throughputRegressions).toHaveLength(1);
    expect(throughputRegressions[0]).toMatchObject({
      modelName: "bert-base-uncased",
      hardwareType: "cuda",
      metric: "throughput",
      severity: "major",
    });
    expect(latencyRegressions).toHaveLength(1);
    expect(latencyRegressions[0]).toMatchObject({
      modelName: "bert-base-uncased",
      hardwareType: "cuda",
      metric: "latency",
      severity: "major",
    });
  });

  it("does not flag improving or stable series as regressions", () => {
    const samples = createPerformanceSamples().filter((sample) => groupKey(sample) !== "bert-base-uncased:cuda:1");

    expect(detectRegressions(samples, "throughput", 5, 0.1)).toEqual([]);
    expect(detectRegressions(samples, "latency", 5, 0.1)).toEqual([]);
  });

  it("summarizes trends and builds report rows for downstream dashboards", () => {
    const samples = createPerformanceSamples();
    const vitCuda = samples.filter((sample) => groupKey(sample) === "vit-base:cuda:1");
    const regressions = detectRegressions(samples, "throughput", 5, 0.1);

    expect(summarizeTrend(vitCuda, "throughput")).toEqual({
      first: 200,
      last: 214,
      direction: "up",
    });
    expect(buildRegressionReport(regressions)).toEqual([
      {
        model: "bert-base-uncased",
        hardware: "cuda",
        metric: "throughput",
        baseline: 102,
        current: 79.18,
        percentChange: 22.37,
        severity: "major",
      },
    ]);
  });
});
