/**
 * Security Core Utilities — PORT-203
 *
 * Consolidates input validation, fixed-window rate limiting, and a generic
 * append-only audit log for logic services.
 */

import { sha256Hex } from '../shared/browser-crypto.js';

export interface SecurityValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface InputValidatorOptions {
  maxTextLength?: number;
  maxFormulaLength?: number;
  blockedPatterns?: RegExp[];
}

export class SecurityValidationError extends Error {
  constructor(message: string, readonly result: SecurityValidationResult) {
    super(message);
    this.name = 'SecurityValidationError';
  }
}

export class InputValidator {
  private readonly maxTextLength: number;
  private readonly maxFormulaLength: number;
  private readonly blockedPatterns: RegExp[];

  constructor(opts: InputValidatorOptions = {}) {
    this.maxTextLength = opts.maxTextLength ?? 100_000;
    this.maxFormulaLength = opts.maxFormulaLength ?? 10_000;
    this.blockedPatterns = opts.blockedPatterns ?? [
      /<script\b/i,
      /\b(?:rm\s+-rf|curl\s+[^|]+\|\s*(?:sh|bash))\b/i,
    ];
  }

  validateText(text: unknown): SecurityValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (typeof text !== 'string') {
      return { valid: false, errors: ['text must be a string'], warnings };
    }
    if (text.length > this.maxTextLength) errors.push(`text exceeds maximum length ${this.maxTextLength}`);
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(text)) warnings.push(`text matched blocked pattern ${pattern.source}`);
    }
    return { valid: errors.length === 0, errors, warnings };
  }

  validateFormula(formula: unknown): SecurityValidationResult {
    const result = this.validateText(formula);
    if (!result.valid || typeof formula !== 'string') return result;
    if (!formula.trim()) result.errors.push('formula must not be empty');
    if (formula.length > this.maxFormulaLength) result.errors.push(`formula exceeds maximum length ${this.maxFormulaLength}`);

    let depth = 0;
    for (const ch of formula) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (depth < 0) {
        result.errors.push('unbalanced parentheses');
        break;
      }
    }
    if (depth > 0) result.errors.push('unbalanced parentheses');
    result.valid = result.errors.length === 0;
    return result;
  }

  assertValidText(text: unknown): string {
    const result = this.validateText(text);
    if (!result.valid) throw new SecurityValidationError(result.errors.join('; '), result);
    return text as string;
  }

  assertValidFormula(formula: unknown): string {
    const result = this.validateFormula(formula);
    if (!result.valid) throw new SecurityValidationError(result.errors.join('; '), result);
    return formula as string;
  }

  sanitizeText(text: string): string {
    return text.replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim();
  }
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  clock?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
}

export class RateLimitExceeded extends Error {
  constructor(readonly result: RateLimitResult, key = 'global') {
    super(`Rate limit exceeded for ${key}; retry after ${result.retryAfterMs}ms`);
    this.name = 'RateLimitExceeded';
  }
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private readonly clock: () => number;

  constructor(private readonly config: RateLimitConfig = { maxRequests: 100, windowMs: 60_000 }) {
    this.clock = config.clock ?? (() => Date.now());
  }

  check(key = 'global'): RateLimitResult {
    const now = this.clock();
    let bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + this.config.windowMs };
      this.buckets.set(key, bucket);
    }
    const allowed = bucket.count < this.config.maxRequests;
    if (allowed) bucket.count++;
    return {
      allowed,
      remaining: Math.max(0, this.config.maxRequests - bucket.count),
      resetAt: bucket.resetAt,
      retryAfterMs: allowed ? 0 : Math.max(0, bucket.resetAt - now),
    };
  }

  enforce(key = 'global'): RateLimitResult {
    const result = this.check(key);
    if (!result.allowed) throw new RateLimitExceeded(result, key);
    return result;
  }

  reset(key?: string): void {
    if (key === undefined) this.buckets.clear();
    else this.buckets.delete(key);
  }
}

export function rateLimit<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limiter = getGlobalRateLimiter(),
  keyForArgs: (...args: Parameters<T>) => string = () => 'global',
): T {
  return ((...args: Parameters<T>) => {
    limiter.enforce(keyForArgs(...args));
    return fn(...args);
  }) as T;
}

let globalRateLimiter: FixedWindowRateLimiter | null = null;

export function getGlobalRateLimiter(config?: RateLimitConfig): FixedWindowRateLimiter {
  if (!globalRateLimiter) globalRateLimiter = new FixedWindowRateLimiter(config);
  return globalRateLimiter;
}

export function resetGlobalRateLimiter(): void {
  globalRateLimiter = null;
}

export interface AuditLogEntry<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  sequence: number;
  timestamp: number;
  action: string;
  subject: string;
  actor?: string;
  payload: TPayload;
  previousHash: string | null;
  entryHash: string;
}

export interface AuditLogFilter {
  action?: string;
  subject?: string;
  actor?: string;
  since?: number;
  until?: number;
}

export class AuditLog<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  private readonly entries: AuditLogEntry<TPayload>[] = [];
  private sequence = 0;

  constructor(private readonly maxEntries = 10_000) {}

  record(opts: {
    action: string;
    subject: string;
    actor?: string;
    payload?: TPayload;
    timestamp?: number;
  }): AuditLogEntry<TPayload> {
    const previousHash = this.entries.at(-1)?.entryHash ?? null;
    const entry: AuditLogEntry<TPayload> = {
      sequence: ++this.sequence,
      timestamp: opts.timestamp ?? Date.now(),
      action: opts.action,
      subject: opts.subject,
      actor: opts.actor,
      payload: opts.payload ?? ({} as TPayload),
      previousHash,
      entryHash: '',
    };
    entry.entryHash = hashAuditEntry(entry);
    if (this.entries.length >= this.maxEntries) this.entries.shift();
    this.entries.push(entry);
    return entry;
  }

  query(filter: AuditLogFilter = {}): AuditLogEntry<TPayload>[] {
    return this.entries.filter(entry => (
      (filter.action === undefined || entry.action === filter.action) &&
      (filter.subject === undefined || entry.subject === filter.subject) &&
      (filter.actor === undefined || entry.actor === filter.actor) &&
      (filter.since === undefined || entry.timestamp >= filter.since) &&
      (filter.until === undefined || entry.timestamp <= filter.until)
    ));
  }

  export(): AuditLogEntry<TPayload>[] {
    return [...this.entries];
  }

  replay(handler: (entry: AuditLogEntry<TPayload>) => void, filter: AuditLogFilter = {}): number {
    const selected = this.query(filter);
    selected.forEach(handler);
    return selected.length;
  }

  verifyIntegrity(): boolean {
    let previous: string | null = null;
    for (const entry of this.entries) {
      if (entry.previousHash !== previous) return false;
      if (hashAuditEntry(entry) !== entry.entryHash) return false;
      previous = entry.entryHash;
    }
    return true;
  }

  clear(): void {
    this.entries.length = 0;
  }

  get size(): number {
    return this.entries.length;
  }
}

let globalAuditLog: AuditLog | null = null;

export function getSecurityAuditLog(): AuditLog {
  if (!globalAuditLog) globalAuditLog = new AuditLog();
  return globalAuditLog;
}

export function resetSecurityAuditLog(): void {
  globalAuditLog = null;
}

function hashAuditEntry(entry: AuditLogEntry): string {
  const { entryHash: _omit, ...hashable } = entry;
  return sha256Hex(stableStringify(hashable));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`;
}
