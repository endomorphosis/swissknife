/**
 * LLM Circuit Breaker — T-241
 *
 * Port of ipfs_datasets_py/logic/security/llm_circuit_breaker.py
 *
 * Prevents cascading LLM API failures by implementing the standard
 * CLOSED → OPEN → HALF_OPEN → CLOSED circuit breaker pattern.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export enum CircuitState {
  CLOSED    = 'closed',     // Normal operation
  OPEN      = 'open',       // Failing fast (too many failures)
  HALF_OPEN = 'half_open',  // Testing recovery
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export interface CircuitBreakerMetrics {
  successCount:         number;
  failureCount:         number;
  totalCalls:           number;
  lastFailureTime:      number | null;   // Unix timestamp ms
  lastSuccessTime:      number | null;
  consecutiveSuccesses: number;
  consecutiveFailures:  number;
  stateTransitions:     number;
  failureRate:          number;
  avgLatencyMs:         number;
}

// ---------------------------------------------------------------------------
// CircuitBreakerOpenError
// ---------------------------------------------------------------------------

export class CircuitBreakerOpenError extends Error {
  constructor(
    message = 'Circuit breaker is OPEN',
    public readonly breakerName?: string,
  ) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

// ---------------------------------------------------------------------------
// LLMCircuitBreaker
// ---------------------------------------------------------------------------

export interface CircuitBreakerOptions {
  /** Consecutive failures before opening circuit. Default: 5. */
  failureThreshold?: number;
  /** Seconds in OPEN state before switching to HALF_OPEN. Default: 60. */
  timeoutSeconds?: number;
  /** Consecutive successes in HALF_OPEN to close circuit. Default: 2. */
  successThreshold?: number;
  /** Fallback value/function invoked when circuit is OPEN. */
  fallback?: (() => unknown) | null;
  /** Circuit breaker name (for logging/registry). */
  name?: string;
}

/**
 * Circuit breaker for LLM / external API calls.
 *
 * TypeScript port of `LLMCircuitBreaker` from
 * `ipfs_datasets_py/logic/security/llm_circuit_breaker.py`.
 *
 * @example
 * ```ts
 * const breaker = new LLMCircuitBreaker({ failureThreshold: 3, timeoutSeconds: 30 });
 * const result = await breaker.call(() => fetch('/llm-api'));
 * ```
 */
export class LLMCircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private lastStateChangeMs = Date.now();
  private successCount = 0;
  private failureCount = 0;
  private totalCalls = 0;
  private consecutiveSuccesses = 0;
  private consecutiveFailures = 0;
  private stateTransitions = 0;
  private lastFailureMs: number | null = null;
  private lastSuccessMs: number | null = null;
  private readonly latencies: number[] = [];

  private readonly failureThreshold: number;
  private readonly timeoutMs: number;
  private readonly successThreshold: number;
  private readonly fallback: (() => unknown) | null;
  readonly name: string;

  constructor(opts: CircuitBreakerOptions = {}) {
    const ft = opts.failureThreshold ?? 5;
    const ts = opts.timeoutSeconds   ?? 60;
    const st = opts.successThreshold ?? 2;
    if (ft < 1) throw new Error('failureThreshold must be >= 1');
    if (ts <= 0) throw new Error('timeoutSeconds must be > 0');
    if (st < 1) throw new Error('successThreshold must be >= 1');
    this.failureThreshold = ft;
    this.timeoutMs        = ts * 1000;
    this.successThreshold = st;
    this.fallback         = opts.fallback ?? null;
    this.name             = opts.name ?? 'llm_circuit_breaker';
  }

  // -------------------------------------------------------------------------
  // Core call
  // -------------------------------------------------------------------------

  /**
   * Execute `fn` through the circuit breaker.
   *
   * Throws `CircuitBreakerOpenError` if the circuit is OPEN and no fallback
   * is configured.
   */
  async call<T>(fn: () => Promise<T> | T): Promise<T> {
    this._maybeTransitionToHalfOpen();

    if (this.state === CircuitState.OPEN) {
      if (this.fallback) return this.fallback() as T;
      throw new CircuitBreakerOpenError(`Circuit '${this.name}' is OPEN`, this.name);
    }

    const t0 = performance.now();
    this.totalCalls++;

    try {
      const result = await Promise.resolve(fn());
      this._recordSuccess(performance.now() - t0);
      return result;
    } catch (err) {
      this._recordFailure();
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // State accessors
  // -------------------------------------------------------------------------

  getState(): CircuitState { return this.state; }

  getMetrics(): CircuitBreakerMetrics {
    return {
      successCount:         this.successCount,
      failureCount:         this.failureCount,
      totalCalls:           this.totalCalls,
      lastFailureTime:      this.lastFailureMs,
      lastSuccessTime:      this.lastSuccessMs,
      consecutiveSuccesses: this.consecutiveSuccesses,
      consecutiveFailures:  this.consecutiveFailures,
      stateTransitions:     this.stateTransitions,
      failureRate:          this.totalCalls > 0 ? this.failureCount / this.totalCalls : 0,
      avgLatencyMs:         this.latencies.length > 0 ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length : 0,
    };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.lastStateChangeMs = Date.now();
    this.successCount = 0;
    this.failureCount = 0;
    this.totalCalls = 0;
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures = 0;
    this.stateTransitions = 0;
    this.lastFailureMs = null;
    this.lastSuccessMs = null;
    this.latencies.length = 0;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _recordSuccess(latencyMs: number): void {
    this.successCount++;
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;
    this.lastSuccessMs = Date.now();
    this.latencies.push(latencyMs);
    if (this.latencies.length > 100) this.latencies.shift();

    if (this.state === CircuitState.HALF_OPEN && this.consecutiveSuccesses >= this.successThreshold) {
      this._transition(CircuitState.CLOSED);
    }
  }

  private _recordFailure(): void {
    this.failureCount++;
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureMs = Date.now();

    if (this.state !== CircuitState.OPEN && this.consecutiveFailures >= this.failureThreshold) {
      this._transition(CircuitState.OPEN);
    }
  }

  private _maybeTransitionToHalfOpen(): void {
    if (this.state === CircuitState.OPEN && Date.now() - this.lastStateChangeMs >= this.timeoutMs) {
      this._transition(CircuitState.HALF_OPEN);
    }
  }

  private _transition(newState: CircuitState): void {
    this.state = newState;
    this.lastStateChangeMs = Date.now();
    this.stateTransitions++;
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures = 0;
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const _registry = new Map<string, LLMCircuitBreaker>();

/** Get (or create) a named circuit breaker from the global registry. */
export function getCircuitBreaker(name: string, opts: CircuitBreakerOptions = {}): LLMCircuitBreaker {
  if (!_registry.has(name)) {
    _registry.set(name, new LLMCircuitBreaker({ ...opts, name }));
  }
  return _registry.get(name)!;
}

/** Reset all registered circuit breakers. Returns the count reset. */
export function resetAllCircuitBreakers(): number {
  const count = _registry.size;
  for (const cb of _registry.values()) cb.reset();
  return count;
}

/** Get stats for all registered circuit breakers. */
export function getAllCircuitBreakerStats(): Record<string, CircuitBreakerMetrics & { state: string }> {
  const out: Record<string, CircuitBreakerMetrics & { state: string }> = {};
  for (const [name, cb] of _registry.entries()) {
    out[name] = { ...cb.getMetrics(), state: cb.getState() };
  }
  return out;
}
