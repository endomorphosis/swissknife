/**
 * OpenTelemetry Integration — T-277 (Sprint 61)
 * Port of observability/otel_integration.py (435L)
 */

export enum SpanStatus { OK='ok', ERROR='error', UNSET='unset' }

export enum EventType {
  PROOF_START='proof_start', PROOF_END='proof_end', PARSE='parse',
  CACHE_HIT='cache_hit', CACHE_MISS='cache_miss', ERROR='error',
  FORMULA_VALIDATED='formula_validated', NL_CONVERTED='nl_converted',
}

export interface SpanEvent { name: string; timestamp: number; attributes: Record<string,unknown> }

export class Span {
  private readonly events: SpanEvent[] = [];
  private readonly attributes: Record<string,unknown> = {};
  private _endTime?: number;
  status: SpanStatus = SpanStatus.UNSET;

  constructor(
    readonly spanId: string,
    readonly name: string,
    readonly traceId: string,
    readonly startTime: number = Date.now(),
  ) {}

  addEvent(name: string, attributes: Record<string,unknown> = {}): void {
    this.events.push({ name, timestamp: Date.now(), attributes });
  }

  setAttribute(key: string, value: unknown): void { this.attributes[key] = value; }

  end(status?: SpanStatus): void {
    this._endTime = Date.now();
    if (status) this.status = status;
    else if (this.status === SpanStatus.UNSET) this.status = SpanStatus.OK;
  }

  get durationMs(): number { return this._endTime ? this._endTime - this.startTime : Date.now() - this.startTime; }
  get isFinished(): boolean { return this._endTime !== undefined; }

  toDict(): Record<string,unknown> {
    return {
      spanId: this.spanId, name: this.name, traceId: this.traceId,
      startTime: this.startTime, endTime: this._endTime,
      durationMs: this.durationMs, status: this.status,
      attributes: this.attributes, events: this.events,
    };
  }
}

export class Trace {
  private readonly spans = new Map<string, Span>();
  constructor(readonly traceId: string) {}
  addSpan(span: Span): void { this.spans.set(span.spanId, span); }
  getSpan(spanId: string): Span | null { return this.spans.get(spanId) ?? null; }
  getSpans(): Span[] { return [...this.spans.values()]; }
  toDict(): Record<string,unknown> {
    return { traceId: this.traceId, spans: [...this.spans.values()].map(s => s.toDict()) };
  }
}

export interface OTelTracerStats { totalSpans: number; activeSpans: number; totalTraces: number; avgDurationMs: number }

export class OTelTracer {
  private readonly traces = new Map<string, Trace>();
  private readonly active = new Map<string, Span>();
  private spanCounter = 0;
  private traceCounter = 0;
  private readonly stats: OTelTracerStats = { totalSpans: 0, activeSpans: 0, totalTraces: 0, avgDurationMs: 0 };

  private _newTraceId(): string { return `trace-${++this.traceCounter}-${Date.now()}`; }
  private _newSpanId():  string { return `span-${++this.spanCounter}`; }

  startSpan(name: string, traceId?: string): Span {
    const tid = traceId ?? this._newTraceId();
    if (!this.traces.has(tid)) { this.traces.set(tid, new Trace(tid)); this.stats.totalTraces++; }
    const span = new Span(this._newSpanId(), name, tid);
    this.traces.get(tid)!.addSpan(span);
    this.active.set(span.spanId, span);
    this.stats.totalSpans++;
    this.stats.activeSpans++;
    return span;
  }

  endSpan(span: Span, status?: SpanStatus): void {
    span.end(status);
    this.active.delete(span.spanId);
    this.stats.activeSpans = Math.max(0, this.stats.activeSpans - 1);
    const n = this.stats.totalSpans;
    this.stats.avgDurationMs = ((n - 1) * this.stats.avgDurationMs + span.durationMs) / n;
  }

  getTrace(traceId: string): Trace | null { return this.traces.get(traceId) ?? null; }
  getStats(): Readonly<OTelTracerStats> { return { ...this.stats }; }
}

export function setupOtelTracer(serviceName: string): OTelTracer {
  const tracer = new OTelTracer();
  return tracer;
}
