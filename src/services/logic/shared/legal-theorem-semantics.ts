/**
 * legal-theorem-semantics.ts
 *
 * TDFOL_v1 legal theorem semantic operations — PORT-194 (part 2 of 2).
 * TypeScript port of:
 *   ipfs_datasets_py/logic/zkp/legal_theorem_semantics.py
 *
 * Provides:
 *   LegalTheoremSemantics   — semantic enrichment of TDFOL theorems
 *   deriveTdfolV1Trace()    — forward-chain derivation returning full trace + semantic metadata
 *   legalTheoremToCircuit() — translate a legal theorem into circuit-ready form
 */

import { createHash } from 'crypto';
import {
  buildTdfolV1TraceWitness,
  TDFOLTraceWitness,
  TDFOLTraceNotDerivableError,
  TDFOLTraceBoundExceededError,
} from '../../zkp-trace.js';
import {
  canonicalizeAxiomSet,
  axiomSetAccumulatorCommitment,
  deriveCircuitV2Inputs,
  CircuitV2Derivation,
} from './canonicalization.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NormModality = 'O' | 'P' | 'F' | 'DEF' | 'APP' | 'EXEMPT';

export interface LegalTheoremSemantic {
  readonly theorem:            string;
  readonly axioms:             string[];
  readonly normModality:       NormModality | null;
  readonly actor:              string | null;
  readonly action:             string | null;
  readonly semanticLabel:      string;
  readonly tdfolV1Derivable:   boolean;
  readonly accumulatorCommitment: string;
}

export interface TraceDerivation {
  readonly theorem:       string;
  readonly axioms:        string[];
  readonly trace:         TDFOLTraceWitness | null;
  readonly circuit:       CircuitV2Derivation;
  readonly semantic:      LegalTheoremSemantic;
  readonly derivedAt:     number;
}

// ---------------------------------------------------------------------------
// Semantic extraction helpers
// ---------------------------------------------------------------------------

const MODALITY_RE = /^[OPF]\(|^Obligatory|^Permitted|^Forbidden/;
const ACTOR_RE    = /\(([A-Z][A-Za-z0-9_]+),/;
const ACTION_RE   = /,\s*([A-Za-z][A-Za-z0-9_]+)\)/;

function extractModality(theorem: string): NormModality | null {
  if (theorem.startsWith('O('))      return 'O';
  if (theorem.startsWith('P('))      return 'P';
  if (theorem.startsWith('F('))      return 'F';
  if (theorem.startsWith('DEF('))    return 'DEF';
  if (theorem.startsWith('APP('))    return 'APP';
  if (theorem.startsWith('EXEMPT(')) return 'EXEMPT';
  return null;
}

function extractActor(theorem: string): string | null {
  return ACTOR_RE.exec(theorem)?.[1] ?? null;
}

function extractAction(theorem: string): string | null {
  return ACTION_RE.exec(theorem)?.[1] ?? null;
}

function semanticLabel(theorem: string): string {
  const m = extractModality(theorem);
  const actor  = extractActor(theorem)  ?? '?';
  const action = extractAction(theorem) ?? '?';
  if (!m) return `proposition: ${theorem.slice(0, 40)}`;
  const labels: Record<NormModality, string> = {
    O: 'obligation', P: 'permission', F: 'prohibition',
    DEF: 'definition', APP: 'applicability', EXEMPT: 'exemption',
  };
  return `${labels[m] ?? m}: ${actor} → ${action}`;
}

// ---------------------------------------------------------------------------
// LegalTheoremSemantics
// ---------------------------------------------------------------------------

/**
 * Semantic enrichment of TDFOL theorems for circuit_v2.
 *
 * PORT-194: mirrors `LegalTheoremSemantics` from `legal_theorem_semantics.py`.
 */
export class LegalTheoremSemantics {
  /**
   * Derive a full TDFOL_v1 trace with semantic metadata for a theorem + axioms.
   *
   * This is the primary entry point for circuit_v2 input preparation.
   */
  derive(theorem: string, axioms: string[]): TraceDerivation {
    const canonAxioms = canonicalizeAxiomSet(axioms);
    const circuit = deriveCircuitV2Inputs(theorem, canonAxioms);
    const accCommitment = axiomSetAccumulatorCommitment(canonAxioms);

    let trace: TDFOLTraceWitness | null = null;
    if (circuit.derivable) {
      try {
        trace = buildTdfolV1TraceWitness(canonAxioms, theorem);
      } catch { /* non-critical */ }
    }

    const semantic: LegalTheoremSemantic = {
      theorem,
      axioms:                 canonAxioms,
      normModality:           extractModality(theorem),
      actor:                  extractActor(theorem),
      action:                 extractAction(theorem),
      semanticLabel:          semanticLabel(theorem),
      tdfolV1Derivable:       circuit.derivable,
      accumulatorCommitment:  accCommitment,
    };

    return { theorem, axioms: canonAxioms, trace, circuit, semantic, derivedAt: Date.now() };
  }

  /**
   * Batch derivation for a list of theorems sharing the same axiom set.
   */
  deriveBatch(theorems: string[], axioms: string[]): TraceDerivation[] {
    return theorems.map(thm => this.derive(thm, axioms));
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

const _semantics = new LegalTheoremSemantics();

/**
 * Forward-chain derivation returning full trace + semantic metadata.
 * PORT-194: primary accessor for `derive_tdfol_v1_trace` Python parity.
 */
export function deriveTdfolV1Trace(theorem: string, axioms: string[]): TraceDerivation {
  return _semantics.derive(theorem, axioms);
}

/**
 * Translate a legal theorem into circuit_v2-ready inputs.
 */
export function legalTheoremToCircuit(theorem: string, axioms: string[]): CircuitV2Derivation {
  return deriveCircuitV2Inputs(theorem, axioms);
}
