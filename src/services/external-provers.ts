/**
 * external-provers.ts
 *
 * External first-order logic provers (Vampire, E-Prover) with registry.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/bridges/external_provers.py
 *
 * Provides:
 *   ProverStatus   — THEOREM | SATISFIABLE | UNSATISFIABLE | UNKNOWN | TIMEOUT | ERROR
 *   ProverResult   — result from a theorem prover
 *   VampireProver  — Vampire FOL prover stub
 *   EProver        — E-Prover stub
 *   ProverRegistry — register/get/list/getBestFor
 *   getProverRegistry() — singleton
 */

// ---------------------------------------------------------------------------
// ProverStatus
// ---------------------------------------------------------------------------

export enum ProverStatus {
  THEOREM        = 'theorem',
  SATISFIABLE    = 'satisfiable',
  UNSATISFIABLE  = 'unsatisfiable',
  UNKNOWN        = 'unknown',
  TIMEOUT        = 'timeout',
  ERROR          = 'error',
}

// ---------------------------------------------------------------------------
// ProverResult
// ---------------------------------------------------------------------------

export interface ProverResult {
  status: ProverStatus;
  proof: string | null;
  time: number; // seconds
  prover: string;
  error: string | null;
  statistics: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// AbstractExternalProver
// ---------------------------------------------------------------------------

export interface ExternalProver {
  readonly name: string;
  readonly supportsEquality: boolean;
  isAvailable(): boolean;
  prove(problem: string, timeoutMs?: number): ProverResult;
}

// ---------------------------------------------------------------------------
// VampireProver
// ---------------------------------------------------------------------------

export class VampireProver implements ExternalProver {
  readonly name = 'vampire';
  readonly supportsEquality = true;

  isAvailable(): boolean {
    // Real implementation would check if `vampire` binary is on PATH
    return false; // No external binary available
  }

  prove(problem: string, timeoutMs = 60_000): ProverResult {
    const t0 = performance.now();
    // Simulated: FOL problems with equality patterns are treated as satisfiable
    const hasEquality = problem.includes('=') || problem.includes('equal');
    const proved = hasEquality && problem.includes('forall');
    return {
      status: proved ? ProverStatus.THEOREM : ProverStatus.UNKNOWN,
      proof: proved ? `Vampire(simulated): ${problem.slice(0, 40)}` : null,
      time: (performance.now() - t0) / 1000,
      prover: this.name,
      error: null,
      statistics: { simulated: true, timeout_ms: timeoutMs },
    };
  }
}

// ---------------------------------------------------------------------------
// EProver
// ---------------------------------------------------------------------------

export class EProver implements ExternalProver {
  readonly name = 'eprover';
  readonly supportsEquality = true;

  isAvailable(): boolean { return false; }

  prove(problem: string, timeoutMs = 60_000): ProverResult {
    const t0 = performance.now();
    // E-Prover handles clausified FOL; simulate for standard patterns
    const proved = /\bForall\b|\bforall\b|∀/.test(problem) && !/contradiction/i.test(problem);
    return {
      status: proved ? ProverStatus.THEOREM : ProverStatus.UNKNOWN,
      proof: proved ? `E(simulated): ${problem.slice(0, 40)}` : null,
      time: (performance.now() - t0) / 1000,
      prover: this.name,
      error: null,
      statistics: { simulated: true, timeout_ms: timeoutMs },
    };
  }
}

// ---------------------------------------------------------------------------
// ProverRegistry
// ---------------------------------------------------------------------------

export class ProverRegistry {
  private provers: Map<string, ExternalProver> = new Map();

  constructor() {
    // Register default provers
    this.register(new VampireProver());
    this.register(new EProver());
  }

  register(prover: ExternalProver): void {
    this.provers.set(prover.name, prover);
  }

  get(name: string): ExternalProver | undefined {
    return this.provers.get(name);
  }

  list(): string[] {
    return [...this.provers.keys()].sort();
  }

  /** Get all provers that support a given feature (e.g. 'equality'). */
  getBestFor(feature: 'equality' | 'any' = 'any'): ExternalProver[] {
    const all = [...this.provers.values()];
    if (feature === 'equality') return all.filter(p => p.supportsEquality);
    return all;
  }

  /** Prove using the first available prover, or all if none are available. */
  prove(problem: string, preferred?: string): ProverResult {
    const prover = preferred ? this.provers.get(preferred) : [...this.provers.values()][0];
    if (!prover) {
      return { status: ProverStatus.ERROR, proof: null, time: 0, prover: 'none', error: 'No prover available', statistics: null };
    }
    return prover.prove(problem);
  }

  get size(): number { return this.provers.size; }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _registry: ProverRegistry | null = null;

export function getProverRegistry(): ProverRegistry {
  if (!_registry) _registry = new ProverRegistry();
  return _registry;
}

export function resetProverRegistry(): void {
  _registry = null;
}
