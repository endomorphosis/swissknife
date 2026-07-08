/**
 * Prometheus Metrics Exporter — PORT-202
 *
 * Port of ipfs_datasets_py/logic/observability/metrics_prometheus.py.
 *
 * Dependency-free Prometheus text exposition collector/exporter for logic
 * services. This complements otel-integration.ts and structured-logging.ts.
 */

export type MetricType = 'counter' | 'gauge' | 'histogram';
export type MetricLabels = Record<string, string | number | boolean>;

export interface MetricSample {
  name: string;
  type: MetricType;
  value: number;
  labels: MetricLabels;
  help?: string;
  timestamp?: number;
}

interface HistogramState {
  buckets: number[];
  counts: number[];
  sum: number;
  count: number;
  labels: MetricLabels;
  help?: string;
}

const DEFAULT_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

export class PrometheusExporter {
  private readonly counters = new Map<string, MetricSample>();
  private readonly gauges = new Map<string, MetricSample>();
  private readonly histograms = new Map<string, HistogramState>();

  incrementCounter(name: string, value = 1, labels: MetricLabels = {}, help?: string): void {
    const key = metricKey(name, labels);
    const existing = this.counters.get(key);
    this.counters.set(key, {
      name,
      type: 'counter',
      value: (existing?.value ?? 0) + value,
      labels,
      help: help ?? existing?.help,
      timestamp: Date.now(),
    });
  }

  setGauge(name: string, value: number, labels: MetricLabels = {}, help?: string): void {
    this.gauges.set(metricKey(name, labels), { name, type: 'gauge', value, labels, help, timestamp: Date.now() });
  }

  observeHistogram(name: string, value: number, labels: MetricLabels = {}, buckets = DEFAULT_BUCKETS, help?: string): void {
    const key = metricKey(name, labels);
    const state = this.histograms.get(key) ?? {
      buckets: [...buckets].sort((a, b) => a - b),
      counts: Array.from({ length: buckets.length }, () => 0),
      sum: 0,
      count: 0,
      labels,
      help,
    };
    for (let i = 0; i < state.buckets.length; i++) {
      if (value <= state.buckets[i]!) state.counts[i]!++;
    }
    state.sum += value;
    state.count++;
    state.help = help ?? state.help;
    this.histograms.set(key, state);
  }

  recordDuration(name: string, durationMs: number, labels: MetricLabels = {}): void {
    this.observeHistogram(`${name}_duration_ms`, durationMs, labels, DEFAULT_BUCKETS, 'Operation duration in milliseconds');
  }

  collect(): MetricSample[] {
    return [...this.counters.values(), ...this.gauges.values()];
  }

  exportText(): string {
    const lines: string[] = [];
    const emittedHeaders = new Set<string>();

    for (const sample of this.collect()) {
      emitHeader(lines, emittedHeaders, sample.name, sample.type, sample.help);
      lines.push(`${sample.name}${formatLabels(sample.labels)} ${formatNumber(sample.value)}`);
    }

    for (const [key, histogram] of this.histograms) {
      const name = key.slice(0, key.indexOf('{'));
      emitHeader(lines, emittedHeaders, name, 'histogram', histogram.help);
      for (let i = 0; i < histogram.buckets.length; i++) {
        lines.push(`${name}_bucket${formatLabels({ ...histogram.labels, le: histogram.buckets[i]! })} ${histogram.counts[i]}`);
      }
      lines.push(`${name}_bucket${formatLabels({ ...histogram.labels, le: '+Inf' })} ${histogram.count}`);
      lines.push(`${name}_sum${formatLabels(histogram.labels)} ${formatNumber(histogram.sum)}`);
      lines.push(`${name}_count${formatLabels(histogram.labels)} ${histogram.count}`);
    }

    return lines.join('\n') + (lines.length ? '\n' : '');
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

let globalExporter: PrometheusExporter | null = null;

export function getPrometheusExporter(): PrometheusExporter {
  if (!globalExporter) globalExporter = new PrometheusExporter();
  return globalExporter;
}

export function exportPrometheusMetrics(exporter = getPrometheusExporter()): string {
  return exporter.exportText();
}

export function metricKey(name: string, labels: MetricLabels = {}): string {
  return `${sanitizeMetricName(name)}{${Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${String(v)}`).join(',')}}`;
}

function emitHeader(lines: string[], emitted: Set<string>, name: string, type: MetricType, help?: string): void {
  const safeName = sanitizeMetricName(name);
  if (emitted.has(safeName)) return;
  lines.push(`# HELP ${safeName} ${escapeHelp(help ?? safeName)}`);
  lines.push(`# TYPE ${safeName} ${type}`);
  emitted.add(safeName);
}

function formatLabels(labels: MetricLabels): string {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return '';
  return `{${entries.map(([key, value]) => `${sanitizeLabelName(key)}="${escapeLabel(String(value))}"`).join(',')}}`;
}

function sanitizeMetricName(name: string): string {
  return name.replace(/[^A-Za-z0-9_:]/g, '_').replace(/^[^A-Za-z_:]+/, '_');
}

function sanitizeLabelName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^[^A-Za-z_]+/, '_');
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function escapeHelp(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}
