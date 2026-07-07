/**
 * Prometheus Metrics + CEC Base Parser + CEC Error Handling + TDFOL NL Context — T-292–T-295 (Sprint 63)
 */

import { PatternMatcher, PatternType, PatternMatch } from '../shared/tdfol-nl-patterns.js';

// ---------------------------------------------------------------------------
// T-292 — Prometheus Metrics
// ---------------------------------------------------------------------------

export enum CircuitBreakerState { CLOSED='closed', OPEN='open', HALF_OPEN='half_open' }

export interface CallMetrics {
  calls:      number;
  errors:     number;
  totalMs:    number;
  p99Ms:      number;
  labels:     Record<string,string>;
}

export class PrometheusMetricsCollector {
  private readonly metrics = new Map<string, { values: number[]; errors: number; labels: Record<string,string> }>();
  private readonly counters = new Map<string, number>();
  private readonly gauges   = new Map<string, number>();

  record(name: string, durationMs: number, labels: Record<string,string> = {}, error = false): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    const existing = this.metrics.get(key) ?? { values: [], errors: 0, labels };
    existing.values.push(durationMs);
    if (error) existing.errors++;
    this.metrics.set(key, existing);
  }

  incrementCounter(name: string, labels: Record<string,string> = {}): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  setGauge(name: string, value: number, labels: Record<string,string> = {}): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    this.gauges.set(key, value);
  }

  getMetrics(name: string, labels: Record<string,string> = {}): CallMetrics | null {
    const key = `${name}:${JSON.stringify(labels)}`;
    const m = this.metrics.get(key);
    if (!m || m.values.length === 0) return null;
    const sorted = [...m.values].sort((a, b) => a - b);
    const total  = sorted.reduce((s, v) => s + v, 0);
    const p99    = sorted[Math.floor(sorted.length * 0.99)] ?? sorted[sorted.length - 1];
    return { calls: sorted.length, errors: m.errors, totalMs: total, p99Ms: p99, labels };
  }

  format(): string {
    const lines: string[] = [];
    for (const [key, m] of this.metrics) {
      const [name] = key.split(':');
      const avg = m.values.length > 0 ? m.values.reduce((s, v) => s + v, 0) / m.values.length : 0;
      lines.push(`# HELP ${name} Duration in ms`);
      lines.push(`${name}_total ${m.values.length}`);
      lines.push(`${name}_errors ${m.errors}`);
      lines.push(`${name}_avg_ms ${avg.toFixed(2)}`);
    }
    for (const [key, v] of this.counters) {
      const [name] = key.split(':');
      lines.push(`${name}_counter ${v}`);
    }
    for (const [key, v] of this.gauges) {
      const [name] = key.split(':');
      lines.push(`${name}_gauge ${v}`);
    }
    return lines.join('\n');
  }

  reset(): void { this.metrics.clear(); this.counters.clear(); this.gauges.clear(); }
}

let _prometheusCollector: PrometheusMetricsCollector | null = null;
export function getPrometheusCollector(): PrometheusMetricsCollector {
  if (!_prometheusCollector) _prometheusCollector = new PrometheusMetricsCollector();
  return _prometheusCollector;
}

// ---------------------------------------------------------------------------
// T-293 — CEC Base Parser
// ---------------------------------------------------------------------------

export interface CECParseResult {
  text:       string;
  clauses:    Array<{ clauseType: string; actor: string|null; action: string; confidence: number }>;
  confidence: number;
  language:   string;
  errors:     string[];
}

export abstract class BaseParser {
  protected readonly matcher: PatternMatcher;
  constructor(protected readonly language: string = 'en') {
    this.matcher = new PatternMatcher();
  }

  abstract getLanguage(): string;

  parse(text: string): CECParseResult {
    const matches = this.matcher.match(text);
    const clauses = matches.map(m => {
      let clauseType = 'unknown';
      if (m.pattern.type === PatternType.OBLIGATION)   clauseType = 'obligation';
      else if (m.pattern.type === PatternType.PERMISSION)  clauseType = 'permission';
      else if (m.pattern.type === PatternType.PROHIBITION) clauseType = 'prohibition';
      return { clauseType, actor: m.entities['agent'] ?? null, action: m.entities['action'] ?? m.text, confidence: m.confidence };
    }).filter(c => c.clauseType !== 'unknown');

    const confidence = clauses.length > 0
      ? clauses.reduce((s, c) => s + c.confidence, 0) / clauses.length : 0;

    return { text, clauses, confidence, language: this.getLanguage(), errors: clauses.length === 0 ? ['No clauses extracted'] : [] };
  }

  parseAll(texts: string[]): CECParseResult[] { return texts.map(t => this.parse(t)); }
}

class EnglishParser extends BaseParser {
  constructor() { super('en'); }
  getLanguage(): string { return 'en'; }
}

export function getParser(language: string): BaseParser {
  switch (language.toLowerCase()) {
    case 'en': case 'english': return new EnglishParser();
    default: return new EnglishParser(); // fallback to English
  }
}

// ---------------------------------------------------------------------------
// T-294 — CEC Error Handling
// ---------------------------------------------------------------------------

export class ProofError extends Error {
  constructor(message: string, public readonly formula?: string) { super(message); this.name = 'ProofError'; }
}

export class ParseError extends Error {
  constructor(message: string, public readonly text?: string) { super(message); this.name = 'ParseError'; }
}

export function handleProofError(err: unknown, formula?: string): never {
  if (err instanceof ProofError) throw err;
  const msg = err instanceof Error ? err.message : String(err);
  throw new ProofError(`Proof failed: ${msg}`, formula);
}

export function handleParseError(err: unknown, text?: string): never {
  if (err instanceof ParseError) throw err;
  const msg = err instanceof Error ? err.message : String(err);
  throw new ParseError(`Parse failed: ${msg}`, text);
}

export function withErrorContext<T>(context: string, fn: () => T): T {
  try { return fn(); }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[${context}] ${msg}`);
  }
}

export async function withErrorContextAsync<T>(context: string, fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[${context}] ${msg}`);
  }
}

export function safeCall<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

export async function safeCallAsync<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

export function formatErrorMessage(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

export function validateNotNull<T>(value: T | null | undefined, name: string): T {
  if (value === null || value === undefined) throw new Error(`${name} must not be null/undefined`);
  return value;
}

// ---------------------------------------------------------------------------
// T-295 — TDFOL NL Context
// ---------------------------------------------------------------------------

export interface TDFOLEntity { name: string; type: string; mentions: number[]; properties: Record<string,unknown> }
export function makeTDFOLEntity(name: string, type: string): TDFOLEntity {
  return { name, type, mentions: [], properties: {} };
}

export class NLContext {
  private readonly entities = new Map<string, TDFOLEntity>();
  private _focus: TDFOLEntity | null = null;
  readonly history: string[] = [];
  position = 0;

  addEntity(entity: TDFOLEntity): void { this.entities.set(entity.name.toLowerCase(), entity); }
  getEntity(name: string): TDFOLEntity | null { return this.entities.get(name.toLowerCase()) ?? null; }
  setFocus(entity: TDFOLEntity): void { this._focus = entity; }
  getFocus(): TDFOLEntity | null { return this._focus; }
  getAllEntities(): TDFOLEntity[] { return [...this.entities.values()]; }

  update(text: string): void {
    this.history.push(text);
    this.position++;
    for (const m of text.matchAll(/\b([A-Z][a-z]+)\b/g)) {
      const name = m[1];
      const existing = this.entities.get(name.toLowerCase()) ?? makeTDFOLEntity(name, 'entity');
      existing.mentions.push(this.position);
      this.entities.set(name.toLowerCase(), existing);
      this._focus = existing;
    }
  }

  reset(): void { this.entities.clear(); this._focus = null; this.history.length = 0; this.position = 0; }
}

export class ContextResolver {
  private readonly pronouns = new Set(['he', 'she', 'it', 'they', 'him', 'her', 'them', 'his', 'its', 'their']);

  resolve(text: string, ctx: NLContext): string {
    return text.split(/\s+/).map(w => {
      if (this.pronouns.has(w.toLowerCase())) {
        const e = ctx.getFocus();
        return e ? e.name : w;
      }
      return w;
    }).join(' ');
  }

  update(text: string, ctx: NLContext): void { ctx.update(text); }
}
