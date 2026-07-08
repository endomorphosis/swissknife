/**
 * Logic validators and BoundedCache — common utilities.
 *
 * Mirrors:
 *   ipfs_datasets_py/logic/common/validators.py (277L)
 *   ipfs_datasets_py/logic/common/bounded_cache.py (233L)
 *
 * Sprint 21, T-109.
 */

// ---------------------------------------------------------------------------
// Constants (from validators.py)
// ---------------------------------------------------------------------------

export const MAX_FORMULA_LENGTH      = 10_000;
export const MAX_AXIOM_COUNT         = 1_000;
export const MAX_AXIOM_LENGTH        = 5_000;
export const MAX_TIMEOUT_MS          = 60_000;
export const MIN_TIMEOUT_MS          = 1;

export const SUPPORTED_LOGIC_SYSTEMS = new Set([
  'propositional', 'fol', 'modal', 'temporal', 'deontic',
  'tdfol', 'dcec', 'z3', 'cvc5', 'coq', 'lean4', 'lurk',
]);

export const SUPPORTED_FORMULA_FORMATS = new Set([
  'smt-lib2', 'tptp', 'lean4', 'coq', 'prolog', 'dcec', 'tdfol', 'fol',
]);

// ---------------------------------------------------------------------------
// ValidationResult
// ---------------------------------------------------------------------------

export interface ValidationResult {
  readonly valid:    boolean;
  readonly errors:   string[];
  readonly warnings: string[];
}

// ---------------------------------------------------------------------------
// Validators (mirrors validators.py)
// ---------------------------------------------------------------------------

/**
 * Validate a formula string for length and basic structure.
 * Python ref: `validate_formula_string(formula)`.
 */
export function validateFormulaString(formula: unknown): ValidationResult {
  const errors: string[]   = [];
  const warnings: string[] = [];

  if (typeof formula !== 'string') {
    return { valid: false, errors: ['formula must be a string'], warnings };
  }
  if (formula.trim().length === 0) {
    errors.push('formula string is empty');
  }
  if (formula.length > MAX_FORMULA_LENGTH) {
    errors.push(`formula string exceeds maximum length (${MAX_FORMULA_LENGTH} chars)`);
  }
  // Bracket balance check
  const opens  = (formula.match(/\(/g) ?? []).length;
  const closes = (formula.match(/\)/g) ?? []).length;
  if (opens !== closes) {
    warnings.push(`unbalanced parentheses: ${opens} open, ${closes} close`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a list of axioms.
 * Python ref: `validate_axiom_list(axioms)`.
 */
export function validateAxiomList(axioms: unknown): ValidationResult {
  const errors: string[]   = [];
  const warnings: string[] = [];

  if (!Array.isArray(axioms)) {
    return { valid: false, errors: ['axioms must be an array'], warnings };
  }
  if (axioms.length > MAX_AXIOM_COUNT) {
    errors.push(`axiom count (${axioms.length}) exceeds maximum (${MAX_AXIOM_COUNT})`);
  }
  for (let i = 0; i < axioms.length; i++) {
    const ax = axioms[i];
    if (typeof ax !== 'string') {
      errors.push(`axiom[${i}] must be a string`);
    } else if (ax.length > MAX_AXIOM_LENGTH) {
      warnings.push(`axiom[${i}] exceeds recommended length`);
    } else if (ax.trim().length === 0) {
      warnings.push(`axiom[${i}] is empty`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a logic system identifier.
 * Python ref: `validate_logic_system(system)`.
 */
export function validateLogicSystem(system: unknown): ValidationResult {
  if (typeof system !== 'string' || !system.trim()) {
    return { valid: false, errors: ['logic system must be a non-empty string'], warnings: [] };
  }
  const normalised = system.trim().toLowerCase();
  if (!SUPPORTED_LOGIC_SYSTEMS.has(normalised)) {
    return {
      valid:    false,
      errors:   [`unsupported logic system: '${system}'`],
      warnings: [`supported systems: ${[...SUPPORTED_LOGIC_SYSTEMS].sort().join(', ')}`],
    };
  }
  return { valid: true, errors: [], warnings: [] };
}

/**
 * Validate and clamp a timeout value in milliseconds.
 * Python ref: `validate_timeout_ms(timeout_ms)`.
 */
export function validateTimeoutMs(ms: unknown): number {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return 5_000;
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.round(ms)));
}

// ---------------------------------------------------------------------------
// BoundedCache (mirrors bounded_cache.py)
// ---------------------------------------------------------------------------

interface CacheEntryInternal<T> {
  value:       T;
  expiresAt:   number | null;
  accessCount: number;
  createdAt:   number;
}

export interface CacheStats {
  readonly size:       number;
  readonly maxSize:    number;
  readonly hits:       number;
  readonly misses:     number;
  readonly evictions:  number;
  readonly hit_rate:   number;
}

/**
 * Generic bounded cache with LRU-style eviction and optional TTL.
 *
 * Python ref: `BoundedCache[T]` in `common/bounded_cache.py`.
 *
 * Usage:
 * ```ts
 * const cache = new BoundedCache<string>({ maxSize: 100, ttlMs: 60_000 });
 * cache.set('key', 'value');
 * const v = cache.get('key'); // 'value'
 * ```
 */
export class BoundedCache<T> {
  private readonly _store     = new Map<string, CacheEntryInternal<T>>();
  private readonly _maxSize:  number;
  private readonly _ttlMs:    number | null;
  private _hits     = 0;
  private _misses   = 0;
  private _evictions = 0;

  constructor(opts: { maxSize?: number; ttlMs?: number | null } = {}) {
    this._maxSize = opts.maxSize ?? 256;
    this._ttlMs   = opts.ttlMs  ?? null;
  }

  set(key: string, value: T): void {
    // Evict oldest entry if at capacity
    if (this._store.size >= this._maxSize && !this._store.has(key)) {
      const oldest = this._store.keys().next().value;
      if (oldest !== undefined) {
        this._store.delete(oldest);
        this._evictions++;
      }
    }
    const expiresAt = this._ttlMs !== null ? Date.now() + this._ttlMs : null;
    this._store.set(key, { value, expiresAt, accessCount: 0, createdAt: Date.now() });
  }

  get(key: string): T | undefined {
    const entry = this._store.get(key);
    if (!entry) { this._misses++; return undefined; }

    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this._store.delete(key);
      this._misses++;
      return undefined;
    }

    entry.accessCount++;
    this._hits++;
    return entry.value;
  }

  has(key: string): boolean {
    const entry = this._store.get(key);
    if (!entry) return false;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this._store.delete(key);
  }

  clear(): void {
    this._store.clear();
  }

  get size(): number {
    return this._store.size;
  }

  stats(): CacheStats {
    const total = this._hits + this._misses;
    return {
      size:      this._store.size,
      maxSize:   this._maxSize,
      hits:      this._hits,
      misses:    this._misses,
      evictions: this._evictions,
      hit_rate:  total > 0 ? this._hits / total : 0,
    };
  }
}
