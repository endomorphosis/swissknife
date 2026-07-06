/**
 * proof-execution-engine-types.ts
 *
 * Type definitions for the proof execution engine.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/reasoning/proof_execution_engine_types.py
 *
 * Provides:
 *   ProofStatus   — SUCCESS | FAILURE | TIMEOUT | ERROR | UNSUPPORTED
 *   ProofResult   — result of one proof execution
 *   makeProofResult() — factory function
 */

// ---------------------------------------------------------------------------
// ProofStatus
// ---------------------------------------------------------------------------

export enum ProofStatus {
  SUCCESS     = 'success',
  FAILURE     = 'failure',
  TIMEOUT     = 'timeout',
  ERROR       = 'error',
  UNSUPPORTED = 'unsupported',
}

// ---------------------------------------------------------------------------
// ProofResult
// ---------------------------------------------------------------------------

export class ProofResult {
  readonly prover: string;
  readonly statement: string;
  readonly status: ProofStatus;
  readonly proof: string | null;
  readonly timeMs: number;
  readonly statistics: Record<string, unknown>;
  readonly errorMessage: string | null;

  constructor(opts: {
    prover: string;
    statement: string;
    status: ProofStatus;
    proof?: string | null;
    timeMs?: number;
    statistics?: Record<string, unknown>;
    errorMessage?: string | null;
  }) {
    this.prover = opts.prover;
    this.statement = opts.statement;
    this.status = opts.status;
    this.proof = opts.proof ?? null;
    this.timeMs = opts.timeMs ?? 0;
    this.statistics = opts.statistics ?? {};
    this.errorMessage = opts.errorMessage ?? null;
  }

  get isProved(): boolean { return this.status === ProofStatus.SUCCESS; }
  get failed(): boolean { return this.status === ProofStatus.FAILURE || this.status === ProofStatus.ERROR; }

  toDict(): Record<string, unknown> {
    return {
      prover: this.prover,
      statement: this.statement.slice(0, 80),
      status: this.status,
      proof: this.proof,
      time_ms: this.timeMs,
      statistics: this.statistics,
      error_message: this.errorMessage,
      is_proved: this.isProved,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function makeProofResult(
  prover: string,
  statement: string,
  opts: Partial<Omit<ProofResult, 'prover' | 'statement' | 'isProved' | 'failed' | 'toDict'>> = {},
): ProofResult {
  return new ProofResult({
    prover, statement,
    status: opts.status ?? ProofStatus.FAILURE,
    proof: opts.proof,
    timeMs: opts.timeMs,
    statistics: opts.statistics,
    errorMessage: opts.errorMessage,
  });
}
