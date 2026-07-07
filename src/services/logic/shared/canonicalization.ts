/**
 * canonicalization.ts
 *
 * Canonical form utilities for ZKP circuit inputs — PORT-194 (part 1 of 2).
 * TypeScript port of:
 *   ipfs_datasets_py/logic/zkp/canonicalization.py
 *
 * Provides:
 *   canonicalizeAxiomSet()         — deterministic canonical form of an axiom set
 *   axiomSetAccumulatorCommitment() — Merkle-style accumulator commitment
 *   canonicalPublicInputsV2()      — build circuit_v2 public inputs from trace
 *   deriveCircuitV2Inputs()        — full circuit_v2 input derivation
 */

import { createHash } from 'crypto';
import {
  buildTdfolV1TraceWitness,
  theoremHashHex,
  toNoirTraceFieldInputs,
  TDFOLTraceNotDerivableError,
  TDFOLTraceBoundExceededError,
} from '../../zkp-trace.js';

// ---------------------------------------------------------------------------
// Canonical axiom set
// ---------------------------------------------------------------------------

/**
 * Return a deterministic canonical representation of an axiom set.
 *
 * - Each axiom is trimmed and normalised (internal whitespace collapsed).
 * - Duplicates removed.
 * - Sorted lexicographically.
 */
export function canonicalizeAxiomSet(axioms: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const ax of axioms) {
    const canon = ax.trim().replace(/\s+/g, ' ');
    if (!seen.has(canon)) {
      seen.add(canon);
      result.push(canon);
    }
  }
  return result.sort();
}

// ---------------------------------------------------------------------------
// Axiom-set accumulator commitment
// ---------------------------------------------------------------------------

function hashLeaf(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function hashPair(a: Buffer, b: Buffer): Buffer {
  return createHash('sha256').update(a).update(b).digest();
}

/**
 * Compute a Merkle-style accumulator commitment for an axiom set.
 *
 * Identical to the Python `axiom_set_accumulator_commitment()` in
 * `canonicalization.py`.  The set is canonicalized first so the commitment
 * is order-independent.
 */
export function axiomSetAccumulatorCommitment(axioms: string[]): string {
  const canon = canonicalizeAxiomSet(axioms);
  if (canon.length === 0) {
    return createHash('sha256').update('empty').digest('hex');
  }
  let layer = canon.map(hashLeaf);
  while (layer.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 < layer.length) {
        next.push(hashPair(layer[i]!, layer[i + 1]!));
      } else {
        next.push(hashPair(layer[i]!, layer[i]!)); // odd leaf doubled
      }
    }
    layer = next;
  }
  return layer[0]!.toString('hex');
}

// ---------------------------------------------------------------------------
// Circuit_v2 public inputs
// ---------------------------------------------------------------------------

export interface CircuitV2PublicInputs {
  readonly theorem_hash:          string;
  readonly axioms_commitment:     string;
  readonly accumulator_commitment: string;
  readonly tdfol_v1_trace_root:   string;
  readonly circuit_id:            string;
  readonly circuit_version:       number;
  readonly ruleset_id:            string;
}

export interface CircuitV2Derivation {
  readonly publicInputs: CircuitV2PublicInputs;
  readonly traceFieldInputs: Record<string, unknown>;
  readonly derivable: boolean;
  readonly error: string | null;
}

/**
 * Derive the full circuit_v2 input set from a theorem and axioms.
 *
 * PORT-194: exposes the TDFOL_v1 accumulator commitment and forward-chain
 * trace that `circuit_v2` requires but previously lacked.
 */
export function deriveCircuitV2Inputs(
  theorem: string,
  axioms: string[],
): CircuitV2Derivation {
  const canonAxioms = canonicalizeAxiomSet(axioms);
  const accumCommitment = axiomSetAccumulatorCommitment(canonAxioms);
  const thmHash = theoremHashHex(theorem);

  let traceFieldInputs: Record<string, unknown> = {};
  let tdfol_v1_trace_root = '';
  let error: string | null = null;
  let derivable = false;

  try {
    const witness = buildTdfolV1TraceWitness(canonAxioms, theorem);
    traceFieldInputs = toNoirTraceFieldInputs(witness);
    tdfol_v1_trace_root = witness.axiomsCommitment; // reuse sorted-axioms hash
    derivable = true;
  } catch (e) {
    if (e instanceof TDFOLTraceNotDerivableError) {
      error = `not derivable: ${e.message}`;
    } else if (e instanceof TDFOLTraceBoundExceededError) {
      error = `trace bound exceeded: ${e.message}`;
    } else {
      error = String(e);
    }
    tdfol_v1_trace_root = accumCommitment;
  }

  const publicInputs: CircuitV2PublicInputs = {
    theorem_hash:           thmHash,
    axioms_commitment:      canonAxioms.slice().sort().join('\n').length > 0
      ? createHash('sha256').update(canonAxioms.join('\n')).digest('hex')
      : '',
    accumulator_commitment: accumCommitment,
    tdfol_v1_trace_root,
    circuit_id:             'circuit_v2',
    circuit_version:        2,
    ruleset_id:             'TDFOL_v1',
  };

  return { publicInputs, traceFieldInputs, derivable, error };
}
