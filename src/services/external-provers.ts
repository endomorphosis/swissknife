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
 *   VampireProver  — Vampire FOL prover adapter
 *   EProver        — E-Prover adapter
 *   ProverRegistry — register/get/list/getBestFor
 *   getProverRegistry() — singleton
 */

import { spawnSync } from 'node:child_process';
import { createTptpProblem, parseSzsStatus } from './tptp-problem.js';

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

export interface ProverProcessResult {
  stdout: string;
  stderr: string;
  status: number | null;
  signal?: string | null;
  error?: string;
}

export type ProverRunner = (command: string, args: string[], input: string, timeoutMs: number) => ProverProcessResult;

export interface ExternalProverOptions {
  binary?: string;
  runner?: ProverRunner;
  availabilityCheck?: () => boolean;
  allowSimulatedFallback?: boolean;
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
  private readonly binary: string;
  private readonly runner: ProverRunner;
  private readonly allowSimulatedFallback: boolean;

  constructor(private readonly opts: ExternalProverOptions = {}) {
    this.binary = opts.binary ?? 'vampire';
    this.runner = opts.runner ?? defaultRunner;
    this.allowSimulatedFallback = opts.allowSimulatedFallback ?? false;
  }

  isAvailable(): boolean {
    return this.opts.availabilityCheck ? this.opts.availabilityCheck() : commandAvailable(this.binary, ['--version']);
  }

  prove(problem: string, timeoutMs = 60_000): ProverResult {
    const t0 = performance.now();
    if (this.isAvailable()) {
      return runExternalProver({
        prover: this.name,
        command: this.binary,
        args: ['--mode', 'casc', '--input_syntax', 'tptp', '--proof', 'tptp', '--time_limit', String(Math.max(1, Math.ceil(timeoutMs / 1000)))],
        input: ensureTptpProblem(problem),
        timeoutMs,
        startedAt: t0,
        runner: this.runner,
      });
    }
    if (!this.allowSimulatedFallback) {
      return unavailableResult(this.name, t0, `${this.binary} binary not found`);
    }
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
  private readonly binary: string;
  private readonly runner: ProverRunner;
  private readonly allowSimulatedFallback: boolean;

  constructor(private readonly opts: ExternalProverOptions = {}) {
    this.binary = opts.binary ?? 'eprover';
    this.runner = opts.runner ?? defaultRunner;
    this.allowSimulatedFallback = opts.allowSimulatedFallback ?? false;
  }

  isAvailable(): boolean {
    return this.opts.availabilityCheck ? this.opts.availabilityCheck() : commandAvailable(this.binary, ['--version']);
  }

  prove(problem: string, timeoutMs = 60_000): ProverResult {
    const t0 = performance.now();
    if (this.isAvailable()) {
      return runExternalProver({
        prover: this.name,
        command: this.binary,
        args: ['--auto', '--tstp-in', '--tstp-out', `--cpu-limit=${Math.max(1, Math.ceil(timeoutMs / 1000))}`],
        input: ensureTptpProblem(problem),
        timeoutMs,
        startedAt: t0,
        runner: this.runner,
      });
    }
    if (!this.allowSimulatedFallback) {
      return unavailableResult(this.name, t0, `${this.binary} binary not found`);
    }
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

function runExternalProver(opts: {
  prover: string;
  command: string;
  args: string[];
  input: string;
  timeoutMs: number;
  startedAt: number;
  runner: ProverRunner;
}): ProverResult {
  const result = opts.runner(opts.command, opts.args, opts.input, opts.timeoutMs);
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  const status = mapSzsStatus(parseSzsStatus(output), result.status, result.error);
  const timedOut = result.signal === 'SIGTERM' || /timed?\s*out/i.test(result.error ?? '') || /ResourceOut|Timeout/i.test(output);
  return {
    status: timedOut ? ProverStatus.TIMEOUT : status,
    proof: status === ProverStatus.THEOREM || status === ProverStatus.UNSATISFIABLE ? output || null : null,
    time: (performance.now() - opts.startedAt) / 1000,
    prover: opts.prover,
    error: result.error ?? (result.status && result.status !== 0 && !output ? `process exited ${result.status}` : null),
    statistics: {
      simulated: false,
      command: opts.command,
      args: opts.args,
      exit_status: result.status,
      timeout_ms: opts.timeoutMs,
      szs_status: parseSzsStatus(output) ?? null,
    },
  };
}

function defaultRunner(command: string, args: string[], input: string, timeoutMs: number): ProverProcessResult {
  const result = spawnSync(command, args, {
    input,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
    status: result.status,
    signal: result.signal,
    error: result.error?.message,
  };
}

function commandAvailable(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 2_000 });
  return !result.error && (result.status === 0 || result.status === null);
}

function ensureTptpProblem(problem: string): string {
  return /^\s*(?:fof|cnf)\(/i.test(problem)
    ? problem
    : createTptpProblem({ name: 'external_problem', conjectures: [problem] });
}

function mapSzsStatus(szsStatus: string | undefined, exitStatus: number | null, error?: string): ProverStatus {
  if (error) return ProverStatus.ERROR;
  switch ((szsStatus ?? '').toLowerCase()) {
    case 'theorem':
    case 'contradictoryaxioms':
      return ProverStatus.THEOREM;
    case 'unsatisfiable':
      return ProverStatus.UNSATISFIABLE;
    case 'satisfiable':
    case 'countersatisfiable':
      return ProverStatus.SATISFIABLE;
    case 'timeout':
    case 'resourceout':
      return ProverStatus.TIMEOUT;
    case 'gaveup':
    case 'unknown':
      return ProverStatus.UNKNOWN;
    default:
      return exitStatus && exitStatus !== 0 ? ProverStatus.ERROR : ProverStatus.UNKNOWN;
  }
}

function unavailableResult(prover: string, startedAt: number, error: string): ProverResult {
  return {
    status: ProverStatus.ERROR,
    proof: null,
    time: (performance.now() - startedAt) / 1000,
    prover,
    error,
    statistics: { simulated: false, unavailable: true },
  };
}
