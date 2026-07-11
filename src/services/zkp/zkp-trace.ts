/**
 * ZKP Trace Witness — T-236
 *
 * Port of ipfs_datasets_py/logic/zkp/provekit/trace.py
 *
 * Bounded TDFOL_v1 derivation trace witness for the ProveKit circuit.
 * Converts TDFOL forward-chaining derivation traces into Noir field inputs.
 *
 * Security note: trace_steps contains private axiom/atom data.
 * Only use toPublicMetadata() in external-facing contexts.
 */

import { sha256Hex } from '../shared/shared-browser-crypto.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_TRACE_STEPS = 64;
export const CIRCUIT_REF = 'provekit_tdfol_v1_trace@v1';
export const CIRCUIT_VERSION = 1;
export const RULESET_ID = 'TDFOL_v1';

const STEP_KIND_FACT = 0;
const STEP_KIND_MODUS_PONENS = 1;

// ---------------------------------------------------------------------------
// Custom error types
// ---------------------------------------------------------------------------

/** Raised when the theorem is not derivable from the supplied axioms. */
export class TDFOLTraceNotDerivableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TDFOLTraceNotDerivableError';
  }
}

/** Raised when the trace length exceeds MAX_TRACE_STEPS. */
export class TDFOLTraceBoundExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TDFOLTraceBoundExceededError';
  }
}

/** Raised when a TDFOLTraceWitness fails internal consistency checks. */
export class TDFOLTraceSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TDFOLTraceSchemaError';
  }
}

// ---------------------------------------------------------------------------
// Hashing helpers
// ---------------------------------------------------------------------------

/**
 * Convert a SHA-256 hex digest to a BN254 scalar field integer
 * (upper 128 bits mod the BN254 field prime, approximated via BigInt).
 */
function hexToFieldInt(hex: string): bigint {
  // BN254 field prime (approximate; real use requires bn254 library)
  const BN254_PRIME = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
  const full = BigInt('0x' + hex);
  return full % BN254_PRIME;
}

function sha256FieldInt(text: string): bigint {
  return hexToFieldInt(sha256Hex(text));
}

/** Canonical theorem hash (SHA-256 of the canonicalized theorem string). */
export function theoremHashHex(theorem: string): string {
  return sha256Hex(theorem.trim());
}

// ---------------------------------------------------------------------------
// TDFOLTraceStep
// ---------------------------------------------------------------------------

/** One step in a TDFOL_v1 forward-chaining derivation trace. */
export interface TDFOLTraceStep {
  /** `'fact'` for a direct axiom; `'modus_ponens'` for a derived atom. */
  readonly kind: 'fact' | 'modus_ponens';
  /** The atom that becomes known at this step. */
  readonly atom: string;
  /** For `modus_ponens`: the triggering antecedent atom; `null` for `fact`. */
  readonly antecedent: string | null;
  /** Zero-based position in the full trace. */
  readonly stepIndex: number;
}

/** Validate and construct a TDFOLTraceStep. */
export function makeTraceStep(
  kind: 'fact' | 'modus_ponens',
  atom: string,
  antecedent: string | null,
  stepIndex: number,
): TDFOLTraceStep {
  if (kind !== 'fact' && kind !== 'modus_ponens') {
    throw new TDFOLTraceSchemaError(`kind must be 'fact' or 'modus_ponens', got '${kind}'`);
  }
  if (!atom) throw new TDFOLTraceSchemaError('atom must be a non-empty string');
  if (kind === 'fact' && antecedent !== null) throw new TDFOLTraceSchemaError('fact step must have antecedent=null');
  if (kind === 'modus_ponens' && !antecedent) throw new TDFOLTraceSchemaError('modus_ponens step must have a non-empty antecedent');
  if (stepIndex < 0) throw new TDFOLTraceSchemaError('stepIndex must be non-negative');
  return { kind, atom, antecedent, stepIndex };
}

/** Returns the integer code for a step kind (for Noir field encoding). */
export function stepKindCode(step: TDFOLTraceStep): number {
  return step.kind === 'fact' ? STEP_KIND_FACT : STEP_KIND_MODUS_PONENS;
}

/** Serialise a step to a public dict (atom text replaced with hash). */
export function traceStepToDict(step: TDFOLTraceStep): Record<string, unknown> {
  return {
    kind: step.kind,
    atomHash: sha256Hex(step.atom),
    antecedentHash: step.antecedent ? sha256Hex(step.antecedent) : null,
    stepIndex: step.stepIndex,
  };
}

// ---------------------------------------------------------------------------
// TDFOLTraceWitness
// ---------------------------------------------------------------------------

/** Bounded TDFOL_v1 trace witness for the ProveKit circuit. */
export interface TDFOLTraceWitness {
  /** Canonical theorem string (private — use theoremHash in public contexts). */
  readonly theorem: string;
  /** SHA-256 hex of the canonicalized theorem. */
  readonly theoremHash: string;
  /** SHA-256 hex commitment over the canonical axiom set. */
  readonly axiomsCommitment: string;
  /** Ordered derivation steps (length === traceLength). */
  readonly traceSteps: readonly TDFOLTraceStep[];
  /** Number of actual derivation steps (public). */
  readonly traceLength: number;
  /** Canonical circuit reference string. */
  readonly circuitRef: string;
  /** Numeric circuit version. */
  readonly circuitVersion: number;
  /** Ruleset identifier. */
  readonly rulesetId: string;
}

// ---------------------------------------------------------------------------
// build_tdfol_v1_trace_witness
// ---------------------------------------------------------------------------

/**
 * Build a `TDFOLTraceWitness` by forward-chaining over `axioms` to derive
 * `theorem`.
 *
 * Throws:
 *  - `TDFOLTraceNotDerivableError` if theorem is not derivable.
 *  - `TDFOLTraceBoundExceededError` if more than MAX_TRACE_STEPS are needed.
 *
 * @param axioms   List of axiom strings (the private KB).
 * @param theorem  The theorem to prove.
 */
export function buildTdfolV1TraceWitness(axioms: string[], theorem: string): TDFOLTraceWitness {
  const canonThm = theorem.trim();
  const known = new Set<string>(axioms.map(a => a.trim()));
  const steps: TDFOLTraceStep[] = [];

  // Record all initial facts as trace steps
  for (const axiom of axioms) {
    if (steps.length >= MAX_TRACE_STEPS) throw new TDFOLTraceBoundExceededError(`Trace exceeds MAX_TRACE_STEPS=${MAX_TRACE_STEPS}`);
    steps.push(makeTraceStep('fact', axiom.trim(), null, steps.length));
  }

  // Forward-chaining modus ponens
  let changed = true;
  while (changed && !known.has(canonThm)) {
    changed = false;
    for (const a of [...known]) {
      const arrowIdx = a.indexOf('→');
      if (arrowIdx < 0) continue;
      const ant = a.slice(0, arrowIdx).trim();
      const cons = a.slice(arrowIdx + 1).trim();
      if (known.has(ant) && !known.has(cons)) {
        if (steps.length >= MAX_TRACE_STEPS) throw new TDFOLTraceBoundExceededError(`Trace exceeds MAX_TRACE_STEPS=${MAX_TRACE_STEPS}`);
        known.add(cons);
        steps.push(makeTraceStep('modus_ponens', cons, ant, steps.length));
        changed = true;
      }
    }
  }

  if (!known.has(canonThm)) {
    throw new TDFOLTraceNotDerivableError(`'${canonThm}' is not derivable from the given axioms`);
  }

  // Build axioms commitment
  const sortedAxioms = [...axioms].map(a => a.trim()).sort().join('\n');
  const axiomsCommitment = sha256Hex(sortedAxioms);

  return {
    theorem: canonThm,
    theoremHash: theoremHashHex(canonThm),
    axiomsCommitment,
    traceSteps: steps,
    traceLength: steps.length,
    circuitRef: CIRCUIT_REF,
    circuitVersion: CIRCUIT_VERSION,
    rulesetId: RULESET_ID,
  };
}

// ---------------------------------------------------------------------------
// validate_tdfol_v1_trace_witness
// ---------------------------------------------------------------------------

/**
 * Validate an existing `TDFOLTraceWitness` for internal consistency.
 *
 * Throws `TDFOLTraceSchemaError` on any inconsistency.
 */
export function validateTdfolV1TraceWitness(witness: TDFOLTraceWitness): void {
  if (!witness.theorem) throw new TDFOLTraceSchemaError('theorem must be non-empty');
  const expectedHash = theoremHashHex(witness.theorem);
  if (witness.theoremHash !== expectedHash) {
    throw new TDFOLTraceSchemaError('theoremHash does not match SHA-256 of theorem');
  }
  if (witness.traceLength > MAX_TRACE_STEPS) {
    throw new TDFOLTraceBoundExceededError(`traceLength ${witness.traceLength} > MAX_TRACE_STEPS=${MAX_TRACE_STEPS}`);
  }
  if (witness.traceSteps.length !== witness.traceLength) {
    throw new TDFOLTraceSchemaError(`traceSteps.length ${witness.traceSteps.length} !== traceLength ${witness.traceLength}`);
  }
  if (!witness.circuitRef) throw new TDFOLTraceSchemaError('circuitRef must be non-empty');
  if (!witness.rulesetId) throw new TDFOLTraceSchemaError('rulesetId must be non-empty');
  if (witness.circuitVersion < 0) throw new TDFOLTraceSchemaError('circuitVersion must be non-negative');
}

// ---------------------------------------------------------------------------
// Noir field encoding
// ---------------------------------------------------------------------------

/**
 * Return deterministic BN254 scalar-field inputs for the Noir trace circuit.
 * Padded to MAX_TRACE_STEPS zero-valued steps.
 */
export function toNoirTraceFieldInputs(witness: TDFOLTraceWitness): Record<string, unknown> {
  const encoded = witness.traceSteps.map(step => ({
    kind: stepKindCode(step),
    atomField: sha256FieldInt(step.atom).toString(),
    antecedentField: step.antecedent ? sha256FieldInt(step.antecedent).toString() : '0',
  }));

  // Pad
  while (encoded.length < MAX_TRACE_STEPS) {
    encoded.push({ kind: 0, atomField: '0', antecedentField: '0' });
  }

  return {
    theoremHashField: hexToFieldInt(witness.theoremHash).toString(),
    axiomsCommitmentField: hexToFieldInt(witness.axiomsCommitment).toString(),
    traceLength: witness.traceLength,
    traceSteps: encoded,
  };
}

/** Return a public-safe dict (no private axiom or atom text). */
export function toPublicMetadata(witness: TDFOLTraceWitness): Record<string, unknown> {
  return {
    circuitRef: witness.circuitRef,
    circuitVersion: witness.circuitVersion,
    rulesetId: witness.rulesetId,
    theoremHash: witness.theoremHash,
    axiomsCommitment: witness.axiomsCommitment,
    traceLength: witness.traceLength,
    traceSteps: witness.traceSteps.map(traceStepToDict),
  };
}
