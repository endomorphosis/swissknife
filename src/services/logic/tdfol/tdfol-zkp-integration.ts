/**
 * ZKP-TDFOL Integration — T-202
 *
 * Port of ipfs_datasets_py/logic/TDFOL/zkp_integration.py
 *
 * Provides a unified prover that combines standard TDFOL proving with
 * zero-knowledge proof generation through an injected or browser-native ZKP
 * backend. The default ZKP backend is a browser/WASM Schnorr Fiat-Shamir proof
 * of knowledge; it is not a Groth16 semantic circuit.
 */

import { BrowserSchnorrZkpBackend, BROWSER_SCHNORR_BACKEND_ID } from '../../zkp/zkp-browser-schnorr.js';
import { TDFOLKnowledgeBase } from './tdfol-core.js';
import { parseTdfolSafe } from './tdfol-parser.js';
import { ProofStatus, TDFOLProver } from './tdfol-prover.js';

// ---------------------------------------------------------------------------
// Proof result types
// ---------------------------------------------------------------------------

/** Lightweight placeholder for a zero-knowledge proof object. */
export interface ZKPProofData {
  readonly proofBytes: Uint8Array;
  readonly publicInputs: unknown[];
  readonly backend: string;
  readonly securityLevel: number;
  readonly metadata?: Record<string, unknown>;
}

/** Unified proof result covering both standard TDFOL and ZKP paths. */
export interface UnifiedProofResult {
  /** Whether the formula was successfully proved. */
  isProved: boolean;
  /** Formula that was attempted (string representation). */
  formula: string;
  /** Proving method: 'tdfol_standard' | 'tdfol_zkp' | 'hybrid' | 'failed'. */
  method: string;
  /** Wall-clock time to generate the proof (seconds). */
  proofTime: number;

  // Standard TDFOL fields
  /** Ordered proof steps (null for ZKP). */
  proofSteps: string[] | null;
  /** Inference rules applied (null for ZKP). */
  inferenceRules: string[] | null;

  // ZKP fields
  /** ZKP proof data (null for standard). */
  zkpProof: ZKPProofData | null;
  /** True if axioms are hidden via ZKP. */
  isPrivate: boolean;
  /** ZKP backend name used. */
  backend: string | null;
  /** Security bits (0 for standard). */
  securityLevel: number;

  // Caching
  cacheHit: boolean;
  cacheCid: string | null;

  metadata: Record<string, unknown>;
}

export interface TDFOLZKPBackend {
  readonly backendId: string;
  readonly securityLevel: number;
  prove(formulaText: string, options?: { privateAxioms?: boolean; timeout?: number }): Promise<ZKPProofData>;
  verify(proof: ZKPProofData, formulaText: string): Promise<boolean>;
}

class BrowserSchnorrTDFOLBackend implements TDFOLZKPBackend {
  readonly backendId = BROWSER_SCHNORR_BACKEND_ID;
  readonly securityLevel = 128;
  private readonly backend = new BrowserSchnorrZkpBackend();

  async prove(formulaText: string): Promise<ZKPProofData> {
    const proof = await this.backend.generateProof(JSON.stringify({
      statement: formulaText,
      publicInputs: { formulaLength: formulaText.length },
      privateWitness: { formulaText },
    }));
    const payload = proof.payload();
    return {
      proofBytes: proof.proofData,
      publicInputs: [payload.publicInputs, payload.publicKey],
      backend: this.backendId,
      securityLevel: this.securityLevel,
      metadata: proof.metadata,
    };
  }

  async verify(proof: ZKPProofData, formulaText: string): Promise<boolean> {
    if (proof.backend !== this.backendId) return false;
    const proofText = bytesToString(proof.proofBytes);
    const parsed = JSON.parse(proofText) as { statement?: unknown };
    if (parsed.statement !== formulaText) return false;
    return this.backend.verifyProof(proofText);
  }
}

// ---------------------------------------------------------------------------
// ZKP configuration + options
// ---------------------------------------------------------------------------

export interface ZKPTDFOLProverOptions {
  /**
   * Whether ZKP mode is enabled.  When false only standard proving is used.
   * @default false
   */
  enableZkp?: boolean;
  /**
   * ZKP backend identifier.
   * @default 'browser-schnorr-wasm'
   */
  zkpBackend?: string;
  /**
   * Optional real ZKP backend. If omitted and ZKP is enabled, the browser/WASM
   * Schnorr backend is used.
   */
  zkpEngine?: TDFOLZKPBackend;
  /**
   * Security bits for the ZKP backend.
   * @default 128
   */
  zkpSecurityLevel?: number;
  /**
   * What to do when ZKP fails: 'standard' (fall back) | 'none' (error).
   * @default 'standard'
   */
  zkpFallback?: 'standard' | 'none';
  /**
   * Enable an in-memory proof cache keyed by formula text + method.
   * @default true
   */
  enableCache?: boolean;
}

export interface ProveOptions {
  /**
   * Try ZKP first (requires enableZkp=true).
   * @default false
   */
  preferZkp?: boolean;
  /**
   * Keep axioms private (forces ZKP; implies preferZkp=true).
   * @default false
   */
  privateAxioms?: boolean;
  /**
   * Proof timeout in seconds.  The simulated backend ignores this but it is
   * forwarded to real backends.
   * @default 60
   */
  timeout?: number;
}

// ---------------------------------------------------------------------------
// Minimal in-memory proof cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  result: UnifiedProofResult;
  insertedAt: number; // ms since epoch
}

class ProofCache {
  private readonly store = new Map<string, CacheEntry>();
  constructor(
    private readonly maxSize: number,
    private readonly ttlMs: number,
  ) {}

  get(key: string): UnifiedProofResult | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.insertedAt > this.ttlMs) {
      this.store.delete(key);
      return null;
    }
    return entry.result;
  }

  set(key: string, result: UnifiedProofResult): void {
    if (this.store.size >= this.maxSize) {
      // Evict oldest entry
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(key, { result, insertedAt: Date.now() });
  }
}

// ---------------------------------------------------------------------------
// ZKPTDFOLProver
// ---------------------------------------------------------------------------

/** Proving statistics. */
export interface ZKPTDFOLProverStats {
  standardProofs: number;
  zkpProofs: number;
  hybridProofs: number;
  zkpFailures: number;
  cacheHits: number;
  totalTimeMs: number;
}

/**
 * TDFOL prover with optional zero-knowledge proof support.
 *
 * TypeScript port of `ZKPTDFOLProver` from
 * `ipfs_datasets_py/logic/TDFOL/zkp_integration.py`.
 *
 * Modes of operation:
 * - **Standard only** (default): traditional forward-chaining TDFOL reasoning.
 * - **ZKP** (enableZkp + preferZkp): proof committed to a ZKP backend.
 * - **Hybrid**: try ZKP first, fall back to standard if ZKP fails.
 *
 * @example
 * ```ts
 * const prover = new ZKPTDFOLProver({
 *   enableZkp: true,
 *   zkpBackend: 'browser-schnorr-wasm',
 *   zkpFallback: 'standard',
 * });
 * const result = await prover.prove('P(x) ∧ Q(x)', { preferZkp: true });
 * console.log(result.method); // 'tdfol_zkp' or 'tdfol_standard'
 * ```
 */
export class ZKPTDFOLProver {
  private readonly enableZkp: boolean;
  private readonly zkpBackend: string;
  private readonly zkpSecurityLevel: number;
  private readonly zkpFallback: 'standard' | 'none';
  private readonly zkpEngine: TDFOLZKPBackend | null;
  private readonly cache: ProofCache | null;

  private readonly stats: ZKPTDFOLProverStats = {
    standardProofs: 0,
    zkpProofs: 0,
    hybridProofs: 0,
    zkpFailures: 0,
    cacheHits: 0,
    totalTimeMs: 0,
  };

  constructor(opts: ZKPTDFOLProverOptions = {}) {
    this.enableZkp = opts.enableZkp ?? false;
    this.zkpEngine = this.enableZkp ? (opts.zkpEngine ?? new BrowserSchnorrTDFOLBackend()) : null;
    this.zkpBackend = opts.zkpBackend ?? this.zkpEngine?.backendId ?? BROWSER_SCHNORR_BACKEND_ID;
    this.zkpSecurityLevel = opts.zkpSecurityLevel ?? this.zkpEngine?.securityLevel ?? 128;
    this.zkpFallback = opts.zkpFallback ?? 'standard';
    const enableCache = opts.enableCache ?? true;

    if (this.enableZkp && opts.zkpBackend && !opts.zkpEngine && opts.zkpBackend !== BROWSER_SCHNORR_BACKEND_ID) {
      throw new Error(`ZKP backend '${opts.zkpBackend}' requires an injected real TDFOLZKPBackend.`);
    }

    if (this.enableZkp && !this.zkpEngine) {
      throw new Error(
        `ZKP backend '${this.zkpBackend}' is unavailable. Inject a real TDFOLZKPBackend.`,
      );
    }

    this.cache = enableCache ? new ProofCache(10_000, 3_600_000) : null;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Prove a formula, optionally using ZKP.
   *
   * @param formula - Formula string (or object with `.toString()`).
   * @param opts - Proving options.
   */
  async prove(formula: unknown, opts: ProveOptions = {}): Promise<UnifiedProofResult> {
    const t0 = performance.now();
    const formulaText = typeof formula === 'string' ? formula : String(formula);
    const preferZkp = opts.preferZkp ?? false;
    const privateAxioms = opts.privateAxioms ?? false;

    if (privateAxioms && !this.enableZkp) {
      throw new Error('privateAxioms=true requires enableZkp=true');
    }

    // Check cache
    const cacheKey = `${formulaText}::${preferZkp || privateAxioms ? 'zkp' : 'std'}`;
    const cached = this.cache?.get(cacheKey) ?? null;
    if (cached) {
      this.stats.cacheHits++;
      return { ...cached, cacheHit: true };
    }

    const useZkp = (preferZkp || privateAxioms) && this.enableZkp;

    if (useZkp) {
      try {
        const result = await this._proveWithZkp(formulaText, t0, privateAxioms);
        this.stats.zkpProofs++;
        this.cache?.set(cacheKey, result);
        return result;
      } catch (err) {
        this.stats.zkpFailures++;
        if (this.zkpFallback === 'none' || privateAxioms) {
          throw err;
        }
        // Fall through to standard proving
        this.stats.hybridProofs++;
      }
    }

    const result = this._proveStandard(formulaText, t0);
    this.stats.standardProofs++;
    this.cache?.set(cacheKey, result);
    return result;
  }

  /**
   * Verify a ZKP proof against a formula.
   *
   * @param proof - ZKP proof data from a prior `prove()` call.
   * @param formula - Original formula string.
   */
  async verifyZkp(proof: ZKPProofData, formula: string): Promise<boolean> {
    if (!this.zkpEngine) {
      throw new Error('ZKP is not enabled');
    }
    return this.zkpEngine.verify(proof, formula);
  }

  /** Current cumulative statistics. */
  getStats(): Readonly<ZKPTDFOLProverStats> {
    return { ...this.stats };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async _proveWithZkp(formulaText: string, t0: number, isPrivate: boolean): Promise<UnifiedProofResult> {
    if (!this.zkpEngine) throw new Error('ZKP engine unavailable');
    const proof = await this.zkpEngine.prove(formulaText, { privateAxioms: isPrivate });
    const verified = await this.zkpEngine.verify(proof, formulaText);
    if (!verified) throw new Error(`ZKP proof failed verification for backend ${proof.backend}`);
    const proofTime = (performance.now() - t0) / 1000;
    this.stats.totalTimeMs += performance.now() - t0;
    return {
      isProved: verified,
      formula: formulaText,
      method: 'tdfol_zkp',
      proofTime,
      proofSteps: null,
      inferenceRules: null,
      zkpProof: proof,
      isPrivate,
      backend: this.zkpBackend,
      securityLevel: this.zkpSecurityLevel,
      cacheHit: false,
      cacheCid: null,
      metadata: { backend: this.zkpBackend, proofMetadata: proof.metadata ?? {} },
    };
  }

  private _proveStandard(formulaText: string, t0: number): UnifiedProofResult {
    const parsed = parseTdfolSafe(formulaText);
    const elapsed = performance.now() - t0;
    this.stats.totalTimeMs += elapsed;
    if (!parsed) {
      return {
        isProved: false,
        formula: formulaText,
        method: 'failed',
        proofTime: elapsed / 1000,
        proofSteps: [],
        inferenceRules: [],
        zkpProof: null,
        isPrivate: false,
        backend: null,
        securityLevel: 0,
        cacheHit: false,
        cacheCid: null,
        metadata: { error: 'TDFOL parse failed' },
      };
    }
    const kb = new TDFOLKnowledgeBase();
    kb.addAxiom(parsed);
    const proved = new TDFOLProver(kb, { strategySelector: null }).prove(parsed);
    const isProved = proved.status === ProofStatus.PROVED;
    const proofSteps = proved.proofSteps.map(step => `${step.justification}: ${step.formula.toStr()}`);
    const inferenceRules = proved.proofSteps.map(step => step.justification);
    return {
      isProved,
      formula: formulaText,
      method: isProved ? 'tdfol_standard' : 'failed',
      proofTime: elapsed / 1000,
      proofSteps,
      inferenceRules,
      zkpProof: null,
      isPrivate: false,
      backend: null,
      securityLevel: 0,
      cacheHit: false,
      cacheCid: null,
      metadata: { nativeStatus: proved.status, nativeMethod: proved.method, message: proved.message ?? null },
    };
  }
}

function bytesToString(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  return Array.from(bytes, byte => String.fromCharCode(byte)).join('');
}
