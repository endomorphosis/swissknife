/**
 * CVC5 Prover Bridge — T-249
 *
 * Port of ipfs_datasets_py/logic/external_provers/smt/cvc5_prover_bridge.py
 *
 * TypeScript interface layer for the CVC5 SMT solver.  Delegates to the
 * WasmProverHub when available; returns UNKNOWN otherwise.
 */

import type { Formula } from '../logic/tdfol/tdfol-core.js';
import { TDFOLToZ3Converter } from './z3-prover-bridge.js';

// ---------------------------------------------------------------------------
// CVC5ProofResult
// ---------------------------------------------------------------------------

export interface CVC5ProofResult {
  isValid:     boolean;
  isSat:       boolean;
  isUnsat:     boolean;
  model:       Record<string, unknown> | null;
  proof:       unknown | null;
  reason:      'sat' | 'unsat' | 'valid' | 'unknown' | 'timeout' | 'error';
  proofTime:   number;
  cvc5Result:  unknown | null;
}

export function cvc5Proved(result: CVC5ProofResult): boolean { return result.isValid; }

// ---------------------------------------------------------------------------
// TDFOLToCVC5Converter (string-based stub)
// ---------------------------------------------------------------------------

/**
 * Best-effort TDFOL → CVC5 SMT-LIB2 string converter.
 */
export class TDFOLToCVC5Converter extends TDFOLToZ3Converter {
  /** CVC5 and Z3 both consume SMT-LIB2, so the AST serializer is shared. */
}

// ---------------------------------------------------------------------------
// CVC5ProverBridge
// ---------------------------------------------------------------------------

export interface CVC5BridgeStats {
  queriesTotal: number;
  valid: number;
  unknown: number;
  errors: number;
  cacheHits: number;
  totalTimeMs: number;
}

/**
 * Bridge to the CVC5 SMT solver.
 *
 * TypeScript port of `CVC5ProverBridge` from
 * `ipfs_datasets_py/logic/external_provers/smt/cvc5_prover_bridge.py`.
 */
export class CVC5ProverBridge {
  private readonly converter = new TDFOLToCVC5Converter();
  private readonly cache: Map<string, CVC5ProofResult> | null;
  private readonly stats: CVC5BridgeStats = {
    queriesTotal: 0, valid: 0, unknown: 0, errors: 0, cacheHits: 0, totalTimeMs: 0,
  };

  constructor(readonly timeout = 5.0, readonly enableCache = true) {
    this.cache = enableCache ? new Map() : null;
  }

  async prove(formula: string | Formula, axioms: Array<string | Formula> = [], timeout?: number): Promise<CVC5ProofResult> {
    const t0 = performance.now();
    const formulaText = typeof formula === 'string' ? formula : this.converter.toSmtLib(formula, axioms);
    const axiomText = axioms.map(a => typeof a === 'string' ? a : this.converter.convertFormula(a));
    const cacheKey = `${formulaText}|${axiomText.join(',')}`;
    const cached = this.cache?.get(cacheKey);
    if (cached) { this.stats.cacheHits++; return cached; }

    this.stats.queriesTotal++;
    const result = await this._query(formulaText, axiomText, timeout ?? this.timeout);
    this.stats.totalTimeMs += performance.now() - t0;
    if (result.isValid) this.stats.valid++;
    else if (result.reason === 'error') this.stats.errors++;
    else this.stats.unknown++;

    this.cache?.set(cacheKey, result);
    return result;
  }

  async check(formula: string): Promise<string> {
    return (await this.prove(formula)).reason;
  }

  isAvailable(): boolean {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { WasmProverHub } = require('./wasm-prover-hub');
      const hub = new WasmProverHub();
      return hub.getAvailableProvers().includes('cvc5');
    } catch { return false; }
  }

  getStats(): Readonly<CVC5BridgeStats> { return { ...this.stats }; }
  clearCache(): void { this.cache?.clear(); }

  // -------------------------------------------------------------------------

  private async _query(formula: string, axioms: string[], timeoutSecs: number): Promise<CVC5ProofResult> {
    const t0 = performance.now();
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { WasmProverHub } = require('./wasm-prover-hub');
      const hub = new WasmProverHub();
      await hub.initialize();
      if (hub.getAvailableProvers().includes('cvc5')) {
        const r = await Promise.race([
          hub.prove('cvc5', formula, axioms),
          new Promise<null>(res => setTimeout(res, timeoutSecs * 1000)),
        ]);
        if (!r) return this._timeoutResult(t0);
        return { isValid: r.isProved, isSat: r.isProved, isUnsat: !r.isProved, model: null, proof: null, reason: r.isProved ? 'valid' : 'unknown', proofTime: (performance.now() - t0) / 1000, cvc5Result: null };
      }
    } catch { /* no CVC5 available */ }
    return { isValid: false, isSat: false, isUnsat: false, model: null, proof: null, reason: 'unknown', proofTime: (performance.now() - t0) / 1000, cvc5Result: null };
  }

  private _timeoutResult(t0: number): CVC5ProofResult {
    return { isValid: false, isSat: false, isUnsat: false, model: null, proof: null, reason: 'timeout', proofTime: (performance.now() - t0) / 1000, cvc5Result: null };
  }
}

/** Returns true if CVC5 is detectable in the current runtime. */
export function ensureCVC5Available(): boolean {
  return new CVC5ProverBridge().isAvailable();
}
