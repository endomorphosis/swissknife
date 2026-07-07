/**
 * CEC ZKP Integration — T-260 (Sprint 58)
 *
 * Port of CEC/native/cec_zkp_integration.py (574L)
 *
 * Hybrid CEC prover that can use standard forward-chaining or zero-knowledge
 * proofs (ZKP) for privacy-preserving reasoning.
 */

import { Groth16Backend, type ZKPBackendProtocol } from '../../zkp/zkp-backends';

// ---------------------------------------------------------------------------
// ProvingMethod
// ---------------------------------------------------------------------------

export enum ProvingMethod {
  STANDARD = 'standard',
  ZKP      = 'zkp',
  HYBRID   = 'hybrid',
}

// ---------------------------------------------------------------------------
// UnifiedCECProofResult
// ---------------------------------------------------------------------------

export interface UnifiedCECProofResult {
  isProved:    boolean;
  method:      ProvingMethod;
  proofTime:   number;       // seconds
  /** ZKP proof data (null for STANDARD method). */
  zkpProof:    Record<string, unknown> | null;
  /** Whether axioms are hidden (ZKP only). */
  isPrivate:   boolean;
  confidence:  number;
  formula:     string;
  metadata:    Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Simulated ZKP backend for CEC
// ---------------------------------------------------------------------------

class CECZKPBackend {
  constructor(private readonly backend: ZKPBackendProtocol) {}

  async provePrivate(formula: string, axioms: string[]): Promise<{ proof: Record<string, unknown>; isProved: boolean }> {
    const witness = JSON.stringify({ formula, axioms: axioms.map((_, i) => `axiom_${i}`) });
    const proof = await this.backend.generateProof(witness);
    const proofDict = proof.toDict();
    const backend = String((proofDict['metadata'] as Record<string, unknown> | undefined)?.['backend'] ?? '').trim().toLowerCase();
    return {
      proof: proofDict,
      isProved: backend !== 'simulated',
    };
  }

  async verify(proof: Record<string, unknown>, formula: string): Promise<boolean> {
    return this.backend.verifyProof(JSON.stringify(proof));
  }
}

// ---------------------------------------------------------------------------
// ZKPCECProver
// ---------------------------------------------------------------------------

export interface ZKPCECProverStats {
  standardProofs: number;
  zkpProofs:      number;
  hybridProofs:   number;
  failures:       number;
  cacheHits:      number;
  totalTimeMs:    number;
}

/**
 * DCEC prover with hybrid standard + ZKP support.
 *
 * TypeScript port of `ZKPCECProver` from
 * `ipfs_datasets_py/logic/CEC/native/cec_zkp_integration.py`.
 *
 * @example
 * ```ts
 * const prover = new ZKPCECProver({ enableZkp: true, method: ProvingMethod.HYBRID });
 * const result = await prover.prove('O(pay)', ['O(pay→settle)', 'pay']);
 * ```
 */
export class ZKPCECProver {
  private readonly enableZkp: boolean;
  private readonly method: ProvingMethod;
  private readonly zkpBackend: CECZKPBackend | null;
  private readonly cache: Map<string, UnifiedCECProofResult> | null;
  private readonly stats: ZKPCECProverStats = {
    standardProofs: 0, zkpProofs: 0, hybridProofs: 0, failures: 0, cacheHits: 0, totalTimeMs: 0,
  };

  constructor(opts: {
    enableZkp?: boolean;
    method?: ProvingMethod;
    enableCache?: boolean;
    zkpBackend?: ZKPBackendProtocol;
  } = {}) {
    this.enableZkp = opts.enableZkp ?? false;
    this.method    = opts.method    ?? ProvingMethod.STANDARD;
    this.zkpBackend = this.enableZkp
      ? new CECZKPBackend(opts.zkpBackend ?? new Groth16Backend(null))
      : null;
    this.cache = (opts.enableCache ?? true) ? new Map() : null;
  }

  /** Prove `formula` from `axioms`. */
  async prove(formula: string, axioms: string[] = []): Promise<UnifiedCECProofResult> {
    const t0 = performance.now();
    const cacheKey = `${formula}|${axioms.join(',')}|${this.method}`;
    const cached = this.cache?.get(cacheKey);
    if (cached) { this.stats.cacheHits++; return cached; }

    let result: UnifiedCECProofResult;
    switch (this.method) {
      case ProvingMethod.ZKP:
        result = await this._proveZKP(formula, axioms, t0);
        break;
      case ProvingMethod.HYBRID:
        result = await this._proveHybrid(formula, axioms, t0);
        break;
      default:
        result = this._proveStandard(formula, axioms, t0);
    }

    this.stats.totalTimeMs += performance.now() - t0;
    if (result.isProved) {
      if (result.method === ProvingMethod.ZKP)    this.stats.zkpProofs++;
      else if (result.method === ProvingMethod.HYBRID) this.stats.hybridProofs++;
      else this.stats.standardProofs++;
    } else {
      this.stats.failures++;
    }

    this.cache?.set(cacheKey, result);
    return result;
  }

  /** Verify a ZKP proof for `formula`. */
  async verifyZkp(proof: Record<string, unknown>, formula: string): Promise<boolean> {
    if (!this.zkpBackend) throw new Error('ZKP is not enabled');
    return this.zkpBackend.verify(proof, formula);
  }

  getStats(): Readonly<ZKPCECProverStats> { return { ...this.stats }; }

  // -------------------------------------------------------------------------

  private _proveStandard(formula: string, axioms: string[], t0: number): UnifiedCECProofResult {
    const known = new Set<string>(axioms);
    let proved = known.has(formula);

    if (!proved) {
      let changed = true;
      while (changed) {
        changed = false;
        for (const a of [...known]) {
          const idx = a.indexOf('→');
          if (idx < 0) continue;
          const ant = a.slice(0, idx).trim(), cons = a.slice(idx + 1).trim();
          if (known.has(ant) && !known.has(cons)) {
            known.add(cons); changed = true;
            if (cons === formula) { proved = true; break; }
          }
        }
        if (proved) break;
      }
    }

    return {
      isProved: proved, method: ProvingMethod.STANDARD,
      proofTime: (performance.now() - t0) / 1000,
      zkpProof: null, isPrivate: false,
      confidence: proved ? 0.9 : 0,
      formula, metadata: {},
    };
  }

  private async _proveZKP(formula: string, axioms: string[], t0: number): Promise<UnifiedCECProofResult> {
    if (!this.zkpBackend) throw new Error('ZKP is not enabled');
    const { proof, isProved } = await this.zkpBackend.provePrivate(formula, axioms);
    const backend = String((proof['metadata'] as Record<string, unknown> | undefined)?.['backend'] ?? 'unknown');
    return {
      isProved, method: ProvingMethod.ZKP,
      proofTime: (performance.now() - t0) / 1000,
      zkpProof: proof, isPrivate: true,
      confidence: isProved ? 0.85 : 0,
      formula, metadata: { backend },
    };
  }

  private async _proveHybrid(formula: string, axioms: string[], t0: number): Promise<UnifiedCECProofResult> {
    // Try standard first
    const std = this._proveStandard(formula, axioms, t0);
    if (std.isProved) return { ...std, method: ProvingMethod.HYBRID };
    // Fall back to ZKP if enabled
    if (this.zkpBackend) {
      const zkp = await this._proveZKP(formula, axioms, t0);
      return { ...zkp, method: ProvingMethod.HYBRID };
    }
    return { ...std, method: ProvingMethod.HYBRID };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a hybrid prover (standard + simulated ZKP). */
export function createHybridProver(enableZkp = true): ZKPCECProver {
  return new ZKPCECProver({ enableZkp, method: ProvingMethod.HYBRID, enableCache: true });
}
