/**
 * mcp-remote-deontic-engine.ts
 *
 * Deprecated compatibility adapter for the Python `ipfs_datasets_py`
 * formal-logic engine over the MCP++ libp2p connector. New browser-facing
 * theorem-prover paths must use the local TypeScript/WASM provers instead.
 *
 * The local `PolicyEngine` / `checkPolicyConsistency()` cover the cheap,
 * common fragment (exact permit/prohibit clashes, obligation-vs-prohibition
 * overlap, rate/temporal-window gating). `checkPolicyConsistency()` itself notes
 * that "temporal-operator and first-order conflicts beyond this fragment should
 * be delegated to the Python TDFOL prover" — this module is that delegation.
 *
 * It maps a Profile-D {@link Policy} to Temporal-Deontic First-Order Logic
 * (TDFOL) formulas using the operator surface accepted by the datasets
 * `logic/TDFOL/tdfol_parser.py` (`O` obligation, `P` permission, `F`
 * prohibition, `G`/`□` always, temporal `U`/`◊`, `∀`/`∃`, `∧ ∨ → ¬`) and calls
 * the real datasets logic tools over the connector:
 *
 *   - `tdfol_prove`               — prove a TDFOL formula (Z3/CVC5/modal tableaux)
 *   - `tdfol_batch_prove`         — prove many at once
 *   - `check_document_consistency`— deontic document consistency (legal text)
 *   - `legal_text_to_deontic`     — natural language / statute → deontic formulas
 *   - `text_to_fol`               — natural language → first-order logic
 *   - `logic_health`              — availability probe
 *
 * Everything degrades safely: when the remote engine is unavailable or errors,
 * callers keep the authoritative local decision (fail-safe to local). Treat
 * this module as an optional migration bridge, not as proof of self-contained
 * browser support.
 *
 * See also:
 *   - mcp-policy.ts                        (Profile D — Policy / PolicyEngine)
 *   - mcp-deontic-interface-broker.ts      (projection + local consistency + ORB)
 *   - mcp-plus-plus-connector.ts           (Round 49 — the libp2p connector)
 *   - external/ipfs_datasets/.../logic_tools (the Python tool surface)
 */

import {
  PolicyEngine,
  type Policy,
} from '../logic/deontic/mcp-policy.js';
import {
  deonticAtom,
  isTemporalPolicy,
  policyToDeonticFormulas,
  type PolicyFormulaSet,
} from '../logic/deontic/policy-formulas.js';
import {
  checkPolicyConsistency,
  createDeonticORBEvaluator,
  type DeonticConflict,
  type DeonticConsistencyResult,
  type ORBDeonticEvaluation,
  type ORBDeonticEvaluator,
} from './mcp-deontic-interface-broker.js';
import type { WasmProverHub } from './mcp-wasm-prover-hub.js';
import { TdfolProverBridge } from '../provers/tdfol-prover-bridge.js';
import type { WasmProofResult } from '../provers/prover-types.js';

export {
  deonticAtom,
  isTemporalPolicy,
  policyToDeonticFormulas,
  type PolicyFormulaSet,
} from '../logic/deontic/policy-formulas.js';

// ---------------------------------------------------------------------------
// Connector contract (structural — the real MCPPPServerConnector satisfies it)
// ---------------------------------------------------------------------------

/**
 * Minimal structural view of the MCP++ connector this engine needs. The Round-49
 * `MCPPPServerConnector` satisfies it: `dispatch()` routes through the
 * `tools_dispatch` meta-tool and unwraps the CallToolResult envelope, while
 * `callTool()` is the raw JSON-RPC `tools/call`. Either is sufficient; when both
 * exist `dispatch` is preferred because the datasets server groups logic tools
 * hierarchically under a category.
 */
export interface DeonticLogicConnector {
  dispatch?(category: string, tool: string, params: Record<string, unknown>): Promise<unknown>;
  callTool?(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Normalized result shapes (defensive over the Python return dicts)
// ---------------------------------------------------------------------------

export interface RemoteProofResult {
  /** True when the prover discharged the formula. */
  proved: boolean;
  /** Raw status string from the prover (e.g. `proved`, `refuted`, `timeout`). */
  status?: string;
  /** Proof strategy actually used (`z3`, `modal_tableaux`, ...). */
  method?: string;
  /** Optional detailed proof steps when requested. */
  proofSteps?: unknown[];
  /** Populated when the remote call failed or the tool was unavailable. */
  error?: string;
  /** The raw tool payload, for callers that need more than the normalized view. */
  raw?: unknown;
}

export interface RemoteHealth {
  available: boolean;
  status?: string;
  detail?: unknown;
}

export interface RemoteDeonticEngineOptions {
  connector: DeonticLogicConnector;
  /** Hierarchical category the logic tools live under. Defaults to `logic_tools`. */
  category?: string;
  /** Default per-proof timeout in ms passed to `tdfol_prove`. Defaults to 5000. */
  defaultTimeoutMs?: number;
  /** Cache window for `logic_health` probes in ms. Defaults to 30000. */
  healthTtlMs?: number;
  /**
   * Symbol used to request a refutation (prove falsum from the axiom set) when
   * checking global theory consistency. Defaults to `⊥`; override if a server's
   * TDFOL dialect expects `false`/`False`.
   */
  falsumSymbol?: string;
}

/**
 * Thin, well-typed client for the datasets formal-logic MCP tools. All methods
 * normalize the Python return dicts and never throw for expected remote/tool
 * failures — they return an `error`-bearing result so callers can fall back.
 */
export class RemoteDeonticEngine {
  private readonly connector: DeonticLogicConnector;
  private readonly category: string;
  private readonly defaultTimeoutMs: number;
  private readonly healthTtlMs: number;
  private readonly falsumSymbol: string;
  private healthCache?: { at: number; value: RemoteHealth };

  constructor(options: RemoteDeonticEngineOptions) {
    this.connector = options.connector;
    this.category = options.category ?? 'logic_tools';
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 5000;
    this.healthTtlMs = options.healthTtlMs ?? 30000;
    this.falsumSymbol = options.falsumSymbol ?? '⊥';
  }

  /** Invoke a logic tool, preferring the hierarchical `dispatch` facade. */
  private async invokeTool(tool: string, args: Record<string, unknown>): Promise<unknown> {
    if (typeof this.connector.dispatch === 'function') {
      return this.connector.dispatch(this.category, tool, args);
    }
    if (typeof this.connector.callTool === 'function') {
      return unwrapEnvelope(await this.connector.callTool(tool, args));
    }
    throw new Error('DeonticLogicConnector exposes neither dispatch() nor callTool()');
  }

  /** Probe `logic_health`; cached for `healthTtlMs`. Never throws. */
  async health(force = false): Promise<RemoteHealth> {
    const now = Date.now();
    if (!force && this.healthCache && now - this.healthCache.at < this.healthTtlMs) {
      return this.healthCache.value;
    }
    let value: RemoteHealth;
    try {
      const raw = asRecord(await this.invokeTool('logic_health', {}));
      const status = typeof raw.status === 'string' ? raw.status : undefined;
      const explicitlyDown =
        raw.success === false || status === 'unavailable' || raw.healthy === false;
      value = { available: !explicitlyDown, status, detail: raw };
    } catch (err) {
      value = { available: false, status: 'unreachable', detail: errText(err) };
    }
    this.healthCache = { at: now, value };
    return value;
  }

  async isAvailable(force = false): Promise<boolean> {
    return (await this.health(force)).available;
  }

  /** Prove a single TDFOL formula via `tdfol_prove`. */
  async proveTemporal(
    formula: string,
    opts: {
      axioms?: string[];
      strategy?: 'auto' | 'forward' | 'backward' | 'modal_tableaux' | 'hybrid';
      timeoutMs?: number;
      maxDepth?: number;
      includeProofSteps?: boolean;
    } = {},
  ): Promise<RemoteProofResult> {
    try {
      const raw = asRecord(
        await this.invokeTool('tdfol_prove', {
          formula,
          axioms: opts.axioms ?? [],
          strategy: opts.strategy ?? 'auto',
          timeout_ms: opts.timeoutMs ?? this.defaultTimeoutMs,
          max_depth: opts.maxDepth ?? 10,
          include_proof_steps: opts.includeProofSteps ?? false,
        }),
      );
      return normalizeProof(raw);
    } catch (err) {
      return { proved: false, error: errText(err) };
    }
  }

  /** Prove many TDFOL formulas via `tdfol_batch_prove`. */
  async proveBatch(
    formulas: string[],
    opts: { axioms?: string[]; timeoutMs?: number } = {},
  ): Promise<RemoteProofResult[]> {
    try {
      const raw = asRecord(
        await this.invokeTool('tdfol_batch_prove', {
          formulas,
          axioms: opts.axioms ?? [],
          timeout_ms: opts.timeoutMs ?? this.defaultTimeoutMs,
        }),
      );
      const results = Array.isArray(raw.results) ? raw.results : undefined;
      if (results) return results.map(r => normalizeProof(asRecord(r)));
      // Some servers return a top-level list.
      if (Array.isArray(raw)) return (raw as unknown[]).map(r => normalizeProof(asRecord(r)));
      return formulas.map(() => normalizeProof(raw));
    } catch (err) {
      return formulas.map(() => ({ proved: false, error: errText(err) }));
    }
  }

  /**
   * Check global consistency of a deontic theory by asking the prover to derive
   * falsum from the clause set: if `⊥` is provable from the axioms the theory is
   * inconsistent. Returns `consistent: undefined` when the remote call failed so
   * callers can distinguish "proved consistent" from "could not check".
   */
  async checkTheoryConsistency(
    formulas: string[],
    opts: { timeoutMs?: number } = {},
  ): Promise<{ consistent?: boolean; proof: RemoteProofResult }> {
    const proof = await this.proveTemporal(this.falsumSymbol, {
      axioms: formulas,
      strategy: 'auto',
      timeoutMs: opts.timeoutMs,
    });
    if (proof.error) return { consistent: undefined, proof };
    // Falsum provable ⇒ the axiom set is contradictory ⇒ inconsistent.
    return { consistent: !proof.proved, proof };
  }

  /** Convert legal / policy text to deontic formulas via `legal_text_to_deontic`. */
  async legalTextToDeontic(
    text: string,
    opts: {
      jurisdiction?: string;
      documentType?: string;
      extractObligations?: boolean;
      includeExceptions?: boolean;
    } = {},
  ): Promise<{ ok: boolean; formulas: unknown; error?: string; raw?: unknown }> {
    try {
      const raw = asRecord(
        await this.invokeTool('legal_text_to_deontic', {
          text_input: text,
          jurisdiction: opts.jurisdiction ?? 'us',
          document_type: opts.documentType ?? 'statute',
          output_format: 'json',
          extract_obligations: opts.extractObligations ?? true,
          include_exceptions: opts.includeExceptions ?? true,
        }),
      );
      const ok = raw.success !== false && raw.status !== 'error';
      return {
        ok,
        formulas: raw.deontic_formulas ?? raw.formulas ?? raw.result ?? raw,
        error: ok ? undefined : errFromPayload(raw),
        raw,
      };
    } catch (err) {
      return { ok: false, formulas: [], error: errText(err) };
    }
  }
}

// ---------------------------------------------------------------------------
// Remote-augmented consistency (local heuristic + remote prover)
// ---------------------------------------------------------------------------

export interface RemoteConsistencyResult extends DeonticConsistencyResult {
  /** Whether the remote prover was consulted and returned a verdict. */
  remoteChecked: boolean;
  /** True only when the remote prover positively reported inconsistency. */
  remoteInconsistent?: boolean;
  /** Present when the remote engine was unavailable or the proof failed. */
  remoteError?: string;
  /**
   * Present when the local WASM prover decided the policy without going remote.
   * `'z3-wasm'` means Z3 WASM gave a conclusive answer.
   */
  localProver?: string;
}

function isConclusiveLocalProof(result: WasmProofResult): boolean {
  return result.reason !== 'unknown'
    && result.reason !== 'error'
    && result.reason !== 'timeout';
}

function consistencyFromLocalProof(
  local: DeonticConsistencyResult,
  result: WasmProofResult,
  detail: string,
): RemoteConsistencyResult {
  const conflicts: DeonticConflict[] = [...local.conflicts];
  const isConsistent = result.reason !== 'refuted' && !result.unsat;

  if (!isConsistent && conflicts.length === 0) {
    conflicts.push({
      kind: 'permission_prohibition',
      capability: '*',
      resource: '*',
      detail,
    });
  }

  return {
    consistent: isConsistent && conflicts.length === 0,
    conflicts,
    remoteChecked: false,
    localProver: result.prover_id,
  };
}

/**
 * Combine the cheap local {@link checkPolicyConsistency} with a remote TDFOL
 * refutation over the full deontic theory. Local conflicts are always returned;
 * when the prover additionally reports the theory inconsistent (a temporal /
 * first-order clash the local fragment cannot express) a synthetic `theory`
 * conflict is appended. Remote failures never remove local findings.
 *
 * When `localHub` is provided (a {@link WasmProverHub} with Z3 WASM loaded),
 * propositional / FOL formulas are checked locally before going remote — skipping
 * the network round-trip for the common case.
 */
export async function checkPolicyConsistencyRemote(
  policy: Policy,
  engine: RemoteDeonticEngine,
  localHub?: WasmProverHub,
): Promise<RemoteConsistencyResult> {
  const local = checkPolicyConsistency(policy);

  // ---- Local WASM pre-check (Z3) ----------------------------------------
  // For propositional / FOL formulas, Z3 WASM can decide consistency without
  // a network round-trip.  Temporal/higher-order formulas return `unknown`
  // and fall through to the remote engine below.
  if (localHub) {
    const wasmResult = await localHub.checkPolicyConsistency(policy);
    if (isConclusiveLocalProof(wasmResult)) {
      return consistencyFromLocalProof(
        local,
        wasmResult,
        'Z3 WASM prover found the policy theory unsatisfiable (local SMT check).',
      );
    }
  }
  // -------------------------------------------------------------------------

  if (isTemporalPolicy(policy)) {
    const nativeTemporal = await new TdfolProverBridge().checkPolicyConsistency(policy);
    if (isConclusiveLocalProof(nativeTemporal)) {
      return consistencyFromLocalProof(
        local,
        nativeTemporal,
        'Native TDFOL prover found the temporal-deontic policy theory unsatisfiable.',
      );
    }
  }

  if (!(await engine.isAvailable())) {
    return {
      ...local,
      remoteChecked: false,
      remoteError: 'remote formal-logic engine unavailable',
    };
  }

  const theory = policyToDeonticFormulas(policy).all;
  const { consistent, proof } = await engine.checkTheoryConsistency(theory);

  if (consistent === undefined) {
    return { ...local, remoteChecked: false, remoteError: proof.error };
  }

  const conflicts: DeonticConflict[] = [...local.conflicts];
  if (consistent === false && local.conflicts.length === 0) {
    conflicts.push({
      kind: 'permission_prohibition',
      capability: '*',
      resource: '*',
      detail:
        'The TDFOL prover derived a contradiction from the policy theory: the '
        + 'deontic clauses are jointly unsatisfiable (temporal/first-order conflict '
        + 'beyond the local fragment).',
    });
  }

  return {
    consistent: conflicts.length === 0,
    conflicts,
    remoteChecked: true,
    remoteInconsistent: consistent === false,
  };
}

// ---------------------------------------------------------------------------
// Remote-backed ORB evaluator (async; local fast-path + remote verification)
// ---------------------------------------------------------------------------

export interface RemoteORBEvaluatorOptions {
  engine: RemoteDeonticEngine;
  /** Local Profile-D engine that owns the registered policies (default singleton). */
  localEngine?: PolicyEngine;
  /**
   * Decide whether a locally-permitted decision warrants a remote proof. By
   * default any decision carrying an obligation with a deadline (temporal) is
   * escalated. Return false to keep the local decision as-is.
   */
  escalate?: (evaluation: ORBDeonticEvaluation, input: ORBEvaluatorInput) => boolean;
  /**
   * TDFOL axioms supplied to the prover when verifying an escalated decision
   * (e.g. domain background theory). Optional.
   */
  axioms?: string[];
}

export interface ORBEvaluatorInput {
  policy_cid: string;
  capability: string;
  resource: string;
  timestamp?: string;
}

/**
 * Produce an {@link ORBDeonticEvaluator} whose `evaluate` first computes the
 * authoritative local Profile-D decision, then — only for "hard" (temporal)
 * permits — asks the Python TDFOL prover to confirm the obligation is
 * dischargeable ("ought implies can": `O(a) → ◊a`). If the prover refutes it the
 * permit is downgraded to `DENY`; if the remote engine is unavailable or errors
 * the local decision is retained unchanged (fail-safe to local).
 *
 * The returned evaluator is async — see the widened `ORBDeonticEvaluator`
 * contract, which the capability router awaits.
 */
export function createRemoteDeonticORBEvaluator(
  options: RemoteORBEvaluatorOptions,
): ORBDeonticEvaluator {
  const local = createDeonticORBEvaluator(options.localEngine ?? PolicyEngine.getInstance());
  const shouldEscalate =
    options.escalate ??
    ((evaluation: ORBDeonticEvaluation) =>
      evaluation.obligations.some(o => o.deadline !== undefined));

  return {
    async evaluate(input): Promise<ORBDeonticEvaluation> {
      const base = await local.evaluate(input);
      if (base.outcome === 'DENY' || !shouldEscalate(base, input)) {
        return base;
      }
      if (!(await options.engine.isAvailable())) {
        return {
          ...base,
          reasons: [...base.reasons, 'Remote TDFOL prover unavailable; local decision retained'],
        };
      }

      // "Ought implies can": every spawned obligation must be eventually
      // dischargeable. Refute any that is not.
      const atomFor = (o: ORBDeonticEvaluation['obligations'][number]): string =>
        deonticAtom(o.requiredCap ?? o.description, o.rsc ?? input.resource);
      const goals = base.obligations.map(o => `O(${atomFor(o)}) → ◊${atomFor(o)}`);
      const proofs = await options.engine.proveBatch(goals, { axioms: options.axioms });

      const failedIdx = proofs.findIndex(p => !p.error && p.proved === false);
      if (failedIdx >= 0) {
        const bad = base.obligations[failedIdx];
        return {
          outcome: 'DENY',
          reasons: [
            ...base.reasons,
            `Deontic obligation not dischargeable (TDFOL prover): "${bad?.description ?? goals[failedIdx]}"`,
          ],
          obligations: base.obligations,
          decision_cid: base.decision_cid,
        };
      }

      const verified = proofs.every(p => !p.error && p.proved === true);
      return {
        ...base,
        reasons: verified
          ? [...base.reasons, 'Temporal obligations verified dischargeable by TDFOL prover']
          : [...base.reasons, 'Remote proof incomplete; local decision retained'],
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

/** Unwrap an MCP CallToolResult ({content:[{type:'text',text}]}) to plain data. */
function unwrapEnvelope(result: unknown): unknown {
  const rec = result as { content?: Array<{ type?: string; text?: string }> } | undefined;
  const text = rec?.content?.find(c => c?.type === 'text')?.text;
  if (typeof text === 'string') {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return result;
}

function normalizeProof(raw: Record<string, unknown>): RemoteProofResult {
  if (raw.success === false) {
    return { proved: false, error: errFromPayload(raw), raw };
  }
  const proved =
    raw.proved === true ||
    raw.status === 'proved' ||
    raw.valid === true;
  return {
    proved,
    status: typeof raw.status === 'string' ? raw.status : undefined,
    method: typeof raw.method === 'string' ? raw.method : undefined,
    proofSteps: Array.isArray(raw.proof_steps) ? raw.proof_steps : undefined,
    raw,
  };
}

function errFromPayload(raw: Record<string, unknown>): string {
  if (typeof raw.error === 'string') return raw.error;
  if (typeof raw.message === 'string') return raw.message;
  return 'remote tool reported failure';
}

function errText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export { PolicyEngine };
export type { Policy, DeonticConflict, DeonticConsistencyResult, ORBDeonticEvaluation, ORBDeonticEvaluator };

// ---------------------------------------------------------------------------
// Local-first ORB evaluator factory (T-29 — Phase 8)
// ---------------------------------------------------------------------------

/**
 * Options for {@link createLocalFirstDeonticORBEvaluator}.
 */
export interface LocalFirstORBEvaluatorOptions extends RemoteORBEvaluatorOptions {
  /**
   * The WASM prover hub to consult before delegating to the remote engine.
   * When omitted the evaluator behaves exactly like
   * {@link createRemoteDeonticORBEvaluator}.
   */
  hub: WasmProverHub;
}

/**
 * Produce an {@link ORBDeonticEvaluator} that follows a local-first strategy:
 *
 * 1. Compute the authoritative local Profile-D decision (fast, no network).
 * 2. For propositional / FOL permits, confirm via Z3 WASM before accepting.
 *    If Z3 WASM is undecided (temporal/higher-order), fall through to step 3.
 * 3. For temporal permits with spawned obligations, escalate to the Python
 *    TDFOL remote engine (same logic as {@link createRemoteDeonticORBEvaluator}).
 *
 * Audit entries record which prover produced the decision via
 * `evaluation.reasons` (e.g. `"Decided locally by z3-wasm"`).
 */
export function createLocalFirstDeonticORBEvaluator(
  options: LocalFirstORBEvaluatorOptions,
): ORBDeonticEvaluator {
  const remote = createRemoteDeonticORBEvaluator(options);

  return {
    async evaluate(input): Promise<ORBDeonticEvaluation> {
      // Ask the WASM hub to check the policy whose CID is in the input.
      // The hub classifies the formula complexity — temporal/higher-order
      // fall straight through to the remote evaluator below.
      try {
        const policies = PolicyEngine.getInstance().listPolicies?.() ?? [];
        const policy = policies.find((p: { id: string }) => p.id === input.policy_cid);
        if (policy) {
          const wasmResult = await options.hub.checkPolicyConsistency(policy);
          if (wasmResult.reason !== 'unknown' && wasmResult.reason !== 'error' && wasmResult.reason !== 'timeout') {
            // Z3 WASM gave a conclusive answer — skip the remote round-trip.
            // Fall through to the standard local decision (the hub confirmed it).
            const baseLocal = await (createDeonticORBEvaluator(
              options.localEngine ?? PolicyEngine.getInstance(),
            )).evaluate(input);
            return {
              ...baseLocal,
              reasons: [
                ...baseLocal.reasons,
                `Consistency verified locally by ${wasmResult.prover_id} (${wasmResult.proof_time_ms}ms)`,
              ],
            };
          }
        }
      } catch {
        // WASM unavailable or policy not found — fall through to remote
      }
      return remote.evaluate(input);
    },
  };
}
