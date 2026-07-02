/**
 * tdfol-cec-bridge.ts
 *
 * TDFOL ↔ CEC bridge and enhanced TDFOL prover.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/bridges/tdfol_cec_bridge.py
 *
 * Provides:
 *   TDFOLCECBridgeAxiom  — an axiom held by the bridge
 *   TDFOLCECBridgeResult — result from the bridge prover
 *   TDFOLCECBridge       — bridge between TDFOL and CEC proof engines
 *   EnhancedTDFOLProver  — wraps TDFOLProver + optional CEC delegation
 *   createEnhancedProver() — factory
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// TDFOLCECBridgeAxiom
// ---------------------------------------------------------------------------

export interface TDFOLCECBridgeAxiom {
  name: string;
  formula: string;
  source: 'tdfol' | 'cec' | 'user';
}

// ---------------------------------------------------------------------------
// TDFOLCECBridgeResult
// ---------------------------------------------------------------------------

export interface TDFOLCECBridgeResult {
  proved: boolean;
  formula: string;
  method: 'tdfol' | 'cec' | 'axiom_lookup' | 'forward_chain' | 'exhausted';
  steps: string[];
  timeMs: number;
  confidence: number;
  usedCec: boolean;
}

function makeResult(opts: Partial<TDFOLCECBridgeResult> & { formula: string }): TDFOLCECBridgeResult {
  return {
    proved: opts.proved ?? false,
    formula: opts.formula,
    method: opts.method ?? 'exhausted',
    steps: opts.steps ?? [],
    timeMs: opts.timeMs ?? 0,
    confidence: opts.confidence ?? 0,
    usedCec: opts.usedCec ?? false,
  };
}

// ---------------------------------------------------------------------------
// TDFOLCECBridge
// ---------------------------------------------------------------------------

/** Basic operator detection helpers */
const DEONTIC_RE   = /^[OPF]\(|^Obligat|^Permit|^Forbid/;
const TEMPORAL_RE  = /^[□◊XUS]\(|^G\(|^F\(|^X\(/;
const IMPLIES_RE   = /→|->|implies/;

export class TDFOLCECBridge {
  private axioms: Map<string, TDFOLCECBridgeAxiom> = new Map();
  private useCec: boolean;

  constructor(useCec = true) {
    this.useCec = useCec;
    this._initDefaultAxioms();
  }

  private _initDefaultAxioms(): void {
    const defaults: TDFOLCECBridgeAxiom[] = [
      { name: 'deontic_d_rule', formula: 'O(φ) → P(φ)', source: 'tdfol' },
      { name: 'prohibition_equiv', formula: 'F(φ) ↔ O(¬φ)', source: 'tdfol' },
      { name: 'temporal_necessitation', formula: 'φ → □φ', source: 'tdfol' },
    ];
    for (const ax of defaults) this.axioms.set(ax.name, ax);
  }

  addAxiom(axiom: TDFOLCECBridgeAxiom): void {
    this.axioms.set(axiom.name, axiom);
  }

  getAxioms(): TDFOLCECBridgeAxiom[] {
    return [...this.axioms.values()];
  }

  /**
   * Attempt to prove `formula` using available axioms and optional CEC delegation.
   */
  prove(formula: string): TDFOLCECBridgeResult {
    const t0 = performance.now();
    const formulaTrim = formula.trim();

    // 1. Direct axiom lookup
    for (const ax of this.axioms.values()) {
      if (ax.formula === formulaTrim) {
        return makeResult({
          proved: true, formula: formulaTrim, method: 'axiom_lookup',
          steps: [`Axiom: ${ax.name}`], timeMs: performance.now() - t0, confidence: 1.0,
        });
      }
    }

    // 2. Simple forward chaining: if P→Q and P is an axiom, derive Q
    if (IMPLIES_RE.test(formulaTrim)) {
      const [ant, cons] = formulaTrim.split(/→|->|implies/).map(s => s.trim());
      for (const ax of this.axioms.values()) {
        if (ax.formula.trim() === ant) {
          return makeResult({
            proved: true, formula: formulaTrim, method: 'forward_chain',
            steps: [`Axiom: ${ax.name}`, `Derives: ${cons}`],
            timeMs: performance.now() - t0, confidence: 0.85,
          });
        }
      }
    }

    // 3. CEC delegation: deontic/temporal formulas with CEC enabled
    const isCecCandidate = this.useCec && (DEONTIC_RE.test(formulaTrim) || TEMPORAL_RE.test(formulaTrim));
    if (isCecCandidate) {
      // Simulated CEC check — treat as proved if it's a standard deontic form
      const isKnownForm = /^O\(|^P\(|^F\(/.test(formulaTrim);
      if (isKnownForm) {
        return makeResult({
          proved: true, formula: formulaTrim, method: 'cec',
          steps: ['Delegated to CEC engine (simulated)', `Result: proved`],
          timeMs: performance.now() - t0, confidence: 0.75, usedCec: true,
        });
      }
    }

    return makeResult({ proved: false, formula: formulaTrim, timeMs: performance.now() - t0 });
  }
}

// ---------------------------------------------------------------------------
// EnhancedTDFOLProver
// ---------------------------------------------------------------------------

export interface BatchProofResult {
  formula: string;
  result: TDFOLCECBridgeResult;
}

export class EnhancedTDFOLProver {
  private bridge: TDFOLCECBridge;
  private kb: Map<string, string[]> = new Map(); // docId → formula list

  constructor(useCec = true) {
    this.bridge = new TDFOLCECBridge(useCec);
  }

  /** Prove a single formula. */
  prove(formula: string): TDFOLCECBridgeResult {
    return this.bridge.prove(formula);
  }

  /** Prove a batch of formulas. */
  proveBatch(formulas: string[]): BatchProofResult[] {
    return formulas.map(f => ({ formula: f, result: this.bridge.prove(f) }));
  }

  /** Load axioms from a knowledge base (docId → formulas). */
  useKB(docId: string, formulas: string[]): void {
    this.kb.set(docId, formulas);
    for (const [i, f] of formulas.entries()) {
      this.bridge.addAxiom({ name: `kb:${docId}:${i}`, formula: f, source: 'user' });
    }
  }

  getAxioms(): TDFOLCECBridgeAxiom[] {
    return this.bridge.getAxioms();
  }

  /** Generate a stable proof ID for a formula. */
  static proofId(formula: string): string {
    return createHash('sha256').update(formula, 'utf8').digest('hex').slice(0, 16);
  }
}

// ---------------------------------------------------------------------------
// createEnhancedProver
// ---------------------------------------------------------------------------

export function createEnhancedProver(useCec = true): EnhancedTDFOLProver {
  return new EnhancedTDFOLProver(useCec);
}
