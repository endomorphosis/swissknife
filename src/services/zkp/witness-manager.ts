/**
 * witness-manager.ts
 *
 * ZKP witness orchestration — PORT-195 (part 1 of 4).
 * TypeScript port of:
 *   ipfs_datasets_py/logic/zkp/witness_manager.py (264L)
 *
 * Provides:
 *   WitnessInput       — raw input data for a circuit
 *   WitnessJson        — fully computed witness (public + private)
 *   WitnessManager     — computes + validates witnesses for ZKP circuits
 *   computeWitness()   — module-level helper
 */

import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WitnessInput {
  readonly statement:  string;
  readonly axiomSet:   string[];
  readonly proofTrace: Record<string, unknown>[];
  readonly context:    Record<string, unknown>;
}

export interface WitnessJson {
  readonly publicInputs:  Record<string, string>;
  readonly privateInputs: Record<string, string>;
  readonly witness:       string[];
  readonly witnessHash:   string;
  readonly computedAt:    number;
}

export interface WitnessStats {
  totalComputed: number;
  valid: number;
  invalid: number;
  avgWitnessSize: number;
}

// ---------------------------------------------------------------------------
// Witness computation helpers
// ---------------------------------------------------------------------------

function hashField(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function axiomCommitment(axioms: string[]): string {
  return createHash('sha256')
    .update(axioms.slice().sort().join('||'))
    .digest('hex');
}

function traceCommitment(trace: Record<string, unknown>[]): string {
  return createHash('sha256')
    .update(JSON.stringify(trace))
    .digest('hex');
}

// ---------------------------------------------------------------------------
// WitnessManager
// ---------------------------------------------------------------------------

/**
 * Orchestrates witness computation and validation for ZKP circuits.
 *
 * PORT-195: mirrors `WitnessManager` from `witness_manager.py`.
 */
export class WitnessManager {
  private readonly stats: WitnessStats = {
    totalComputed: 0,
    valid: 0,
    invalid: 0,
    avgWitnessSize: 0,
  };

  /**
   * Compute a circuit witness from proof inputs.
   *
   * Public inputs: statement hash, axiom commitment, trace commitment.
   * Private inputs: axiom hashes, step hashes, context hash.
   */
  computeWitness(input: WitnessInput): WitnessJson {
    const stmtHash  = hashField(input.statement);
    const axiomComm = axiomCommitment(input.axiomSet);
    const traceComm = traceCommitment(input.proofTrace);
    const ctxHash   = hashField(JSON.stringify(input.context));

    const publicInputs: Record<string, string> = {
      statement_hash:    stmtHash,
      axiom_commitment:  axiomComm,
      trace_commitment:  traceComm,
    };

    const privateInputs: Record<string, string> = {
      context_hash: ctxHash,
      ...Object.fromEntries(
        input.axiomSet.map((ax, i) => [`axiom_${i}`, hashField(ax)]),
      ),
      ...Object.fromEntries(
        input.proofTrace.map((step, i) => [`step_${i}`, hashField(JSON.stringify(step))]),
      ),
    };

    const witness = [
      ...Object.values(publicInputs),
      ...Object.values(privateInputs),
    ];

    const witnessHash = createHash('sha256')
      .update(witness.join('|'))
      .digest('hex');

    this.stats.totalComputed++;
    this.stats.valid++;
    this.stats.avgWitnessSize += (witness.length - this.stats.avgWitnessSize) / this.stats.totalComputed;

    return { publicInputs, privateInputs, witness, witnessHash, computedAt: Date.now() };
  }

  /**
   * Validate that a witness is internally consistent.
   */
  validateWitness(witnessJson: WitnessJson): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!witnessJson.witnessHash) errors.push('missing witnessHash');
    if (!witnessJson.publicInputs['statement_hash']) errors.push('missing statement_hash in publicInputs');
    if (!witnessJson.publicInputs['axiom_commitment']) errors.push('missing axiom_commitment');
    if (witnessJson.witness.length === 0) errors.push('witness array is empty');

    // Recompute hash
    const expected = createHash('sha256')
      .update(witnessJson.witness.join('|'))
      .digest('hex');
    if (expected !== witnessJson.witnessHash) errors.push('witnessHash mismatch');

    if (errors.length > 0) this.stats.invalid++;
    return { valid: errors.length === 0, errors };
  }

  /**
   * Re-derive public inputs from a statement and axiom set
   * (used to verify circuit inputs before proof generation).
   */
  derivePublicInputs(statement: string, axiomSet: string[]): Record<string, string> {
    return {
      statement_hash:   hashField(statement),
      axiom_commitment: axiomCommitment(axiomSet),
    };
  }

  getStats(): Readonly<WitnessStats> { return { ...this.stats }; }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

const _manager = new WitnessManager();

export function computeWitness(input: WitnessInput): WitnessJson {
  return _manager.computeWitness(input);
}

export function validateWitness(w: WitnessJson): { valid: boolean; errors: string[] } {
  return _manager.validateWitness(w);
}

export function derivePublicInputs(statement: string, axiomSet: string[]): Record<string, string> {
  return _manager.derivePublicInputs(statement, axiomSet);
}
