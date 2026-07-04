/**
 * Prometheus metrics export for circuit breaker and structured logging.
 *
 * TypeScript port of ipfs_datasets_py/logic/observability/metrics_prometheus.py.
 */

export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

export class CallMetrics {
  totalCalls = 0;
  successfulCalls = 0;
  failedCalls = 0;
  latencies: number[] = [];
  stateTransitions: Array<[number, string]> = [];
  lastFailureTime: number | null = null;
  currentState = CircuitBreakerState.CLOSED;

  toDict(): Record<string, unknown> {
    return {
      total_calls: this.totalCalls,
      successful_calls: this.successfulCalls,
      failed_calls: this.failedCalls,
      latencies: [...this.latencies],
      state_transitions: this.stateTransitions.map(([timestamp, state]) => [timestamp, state]),
      last_failure_time: this.lastFailureTime,
      current_state: this.currentState,
    };
  }
}

export class PrometheusMetricsCollector {
  private readonly metrics = new Map<string, CallMetrics>();
  private readonly logMetrics = new Map<string, Record<string, number>>();
  private readonly maxLatencySamples: number;

  constructor(maxLatencySamples = 1000) {
    this.maxLatencySamples = maxLatencySamples;
  }

  recordCircuitBreakerCall(component: string, latency: number, success: boolean, timestamp?: number): void {
    const metrics = this.ensureMetrics(component);
    metrics.totalCalls += 1;
    if (success) metrics.successfulCalls += 1;
    else {
      metrics.failedCalls += 1;
      metrics.lastFailureTime = timestamp ?? Date.now() / 1000;
    }
    if (metrics.latencies.length >= this.maxLatencySamples) metrics.latencies.shift();
    metrics.latencies.push(latency);
  }

  recordCircuitBreakerState(component: string, state: string, timestamp?: number): void {
    const metrics = this.ensureMetrics(component);
    metrics.currentState = state as CircuitBreakerState;
    metrics.stateTransitions.push([timestamp ?? Date.now() / 1000, state]);
    if (metrics.stateTransitions.length > 100) metrics.stateTransitions.shift();
  }

  recordLogEntry(component: string, level = 'info'): void {
    const metrics = this.ensureLogMetrics(component);
    metrics.total_entries += 1;
    const key = `${level.toLowerCase()}_entries`;
    if (key in metrics) metrics[key] += 1;
  }

  getLatencyPercentiles(component: string, percentiles: number[] = [50, 95, 99]): Record<string, number> {
    const latencies = [...(this.metrics.get(component)?.latencies ?? [])].sort((a, b) => a - b);
    if (!latencies.length) return Object.fromEntries(percentiles.map(p => [`p${p}`, 0.0]));
    return Object.fromEntries(percentiles.map(percentile => {
      const index = Math.min(latencies.length - 1, Math.max(0, Math.ceil((percentile / 100) * latencies.length) - 1));
      return [`p${percentile}`, latencies[index]];
    }));
  }

  getFailureRate(component: string): number {
    const metrics = this.ensureMetrics(component);
    return metrics.totalCalls === 0 ? 0 : (metrics.failedCalls / metrics.totalCalls) * 100;
  }

  getSuccessRate(component: string): number {
    return 100 - this.getFailureRate(component);
  }

  getMetricsSummary(component: string): Record<string, unknown> {
    const metrics = this.ensureMetrics(component);
    const latencies = metrics.latencies;
    const avg = latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0;
    return {
      component,
      total_calls: metrics.totalCalls,
      successful_calls: metrics.successfulCalls,
      failed_calls: metrics.failedCalls,
      success_rate: this.getSuccessRate(component),
      failure_rate: this.getFailureRate(component),
      avg_latency: avg,
      min_latency: latencies.length ? Math.min(...latencies) : 0,
      max_latency: latencies.length ? Math.max(...latencies) : 0,
      current_state: metrics.currentState,
      last_failure_time: metrics.lastFailureTime,
      latency_percentiles: this.getLatencyPercentiles(component),
    };
  }

  exportPrometheusFormat(): string {
    const lines: string[] = [
      '# HELP circuit_breaker_calls_total Total calls to circuit breaker',
      '# TYPE circuit_breaker_calls_total counter',
    ];
    for (const [component, metrics] of this.metrics) {
      lines.push(`circuit_breaker_calls_total{component="${component}"} ${metrics.totalCalls}`);
    }
    lines.push('', '# HELP circuit_breaker_calls_success Successful calls to circuit breaker');
    lines.push('# TYPE circuit_breaker_calls_success counter');
    for (const [component, metrics] of this.metrics) {
      lines.push(`circuit_breaker_calls_success{component="${component}"} ${metrics.successfulCalls}`);
    }
    lines.push('', '# HELP circuit_breaker_calls_failed Failed calls to circuit breaker');
    lines.push('# TYPE circuit_breaker_calls_failed counter');
    for (const [component, metrics] of this.metrics) {
      lines.push(`circuit_breaker_calls_failed{component="${component}"} ${metrics.failedCalls}`);
    }
    lines.push('', '# HELP circuit_breaker_failure_rate Failure rate percentage');
    lines.push('# TYPE circuit_breaker_failure_rate gauge');
    for (const component of this.metrics.keys()) {
      lines.push(`circuit_breaker_failure_rate{component="${component}"} ${this.getFailureRate(component).toFixed(2)}`);
    }
    lines.push('', '# HELP circuit_breaker_state Current circuit breaker state');
    lines.push('# TYPE circuit_breaker_state gauge');
    const stateMap: Record<string, number> = { closed: 0, open: 1, half_open: 2 };
    for (const [component, metrics] of this.metrics) {
      lines.push(`circuit_breaker_state{component="${component}",state="${metrics.currentState}"} ${stateMap[metrics.currentState] ?? 0}`);
    }
    lines.push('', '# HELP log_entries_total Total log entries recorded');
    lines.push('# TYPE log_entries_total counter');
    for (const [component, metrics] of this.logMetrics) {
      lines.push(`log_entries_total{component="${component}"} ${metrics.total_entries}`);
    }
    lines.push('', '# HELP log_entries_by_level Log entries by level');
    lines.push('# TYPE log_entries_by_level counter');
    for (const [component, metrics] of this.logMetrics) {
      for (const level of ['debug', 'info', 'warning', 'error']) {
        lines.push(`log_entries_by_level{component="${component}",level="${level}"} ${metrics[`${level}_entries`] ?? 0}`);
      }
    }
    return lines.join('\n');
  }

  getComponents(): Set<string> {
    return new Set(this.metrics.keys());
  }

  resetComponent(component: string): void {
    this.metrics.delete(component);
    this.logMetrics.delete(component);
  }

  resetAll(): void {
    this.metrics.clear();
    this.logMetrics.clear();
  }

  record_circuit_breaker_call = this.recordCircuitBreakerCall.bind(this);
  record_circuit_breaker_state = this.recordCircuitBreakerState.bind(this);
  record_log_entry = this.recordLogEntry.bind(this);
  get_latency_percentiles = this.getLatencyPercentiles.bind(this);
  get_failure_rate = this.getFailureRate.bind(this);
  get_success_rate = this.getSuccessRate.bind(this);
  get_metrics_summary = this.getMetricsSummary.bind(this);
  export_prometheus_format = this.exportPrometheusFormat.bind(this);
  get_components = this.getComponents.bind(this);
  reset_component = this.resetComponent.bind(this);
  reset_all = this.resetAll.bind(this);

  private ensureMetrics(component: string): CallMetrics {
    const existing = this.metrics.get(component);
    if (existing) return existing;
    const created = new CallMetrics();
    this.metrics.set(component, created);
    return created;
  }

  private ensureLogMetrics(component: string): Record<string, number> {
    const existing = this.logMetrics.get(component);
    if (existing) return existing;
    const created = {
      total_entries: 0,
      error_entries: 0,
      warning_entries: 0,
      info_entries: 0,
      debug_entries: 0,
    };
    this.logMetrics.set(component, created);
    return created;
  }
}

let defaultCollector: PrometheusMetricsCollector | null = null;

export function getPrometheusCollector(): PrometheusMetricsCollector {
  if (!defaultCollector) defaultCollector = new PrometheusMetricsCollector();
  return defaultCollector;
}

export const get_prometheus_collector = getPrometheusCollector;
