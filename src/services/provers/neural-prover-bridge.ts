/**
 * NeuralProverBridge — LLM-guided proof sketch verifier (T-38, T-57).
 *
 * Phase 7 (P2).  Mirrors Python's SymbolicAI prover bridge
 * (`ipfs_datasets_py/logic/external_provers/neural/symbolicai_prover_bridge.py`).
 *
 * Strategy:
 *   1. Send the deontic formula (as a natural-language + formal description)
 *      to an LLM tool via the MCP++ connector (the same one used for the
 *      Python TDFOL remote engine).
 *   2. Parse the returned proof sketch (Lean 4 `theorem … by …` block, Coq
 *      `Proof. … Qed.` block, or a structured JSON reasoning object).
 *   3. Verify the sketch locally using `Lean4WasmBridge` or `CoqJsCoqBridge`
 *      before returning `proved: true`.  An LLM-only result without local
 *      verification is reported as `reason: 'unknown'` (not trusted).
 *
 * The connector is injected at construction time — the bridge itself makes no
 * network calls and is therefore testable with a mock connector.
 *
 * Reference:
 *   ipfs_datasets_py/logic/external_provers/neural/symbolicai_prover_bridge.py
 */

import type { WasmProofResult } from './prover-types.js';
import type { Policy } from '../logic/deontic/mcp-policy.js';
import { Lean4WasmBridge } from './lean4-wasm-bridge.js';
import { CoqJsCoqBridge } from './coq-jscoq-bridge.js';

// ---------------------------------------------------------------------------
// Connector contract (structural — same shape as DeonticLogicConnector)
// ---------------------------------------------------------------------------

/** Minimal structural view of the MCP++ connector the neural prover needs. */
export interface NeuralProverConnector {
  dispatch?: (category: string, tool: string, params?: Record<string, unknown>) => Promise<unknown>;
  callTool?: (tool: string, params?: Record<string, unknown>) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// LLM tool names
// ---------------------------------------------------------------------------

/** Default LLM tool name for deontic proof sketch generation. */
export const DEFAULT_PROOF_SKETCH_TOOL = 'llm_deontic_proof_sketch';

// ---------------------------------------------------------------------------
// Prompt template
// ---------------------------------------------------------------------------

function buildProofPrompt(policy: Policy, formulaDescription: string): string {
  return [
    'You are a formal verification assistant. Given the following MCP++ deontic policy,',
    'produce a valid Lean 4 theorem and proof (or state "refuted:" with an explanation).',
    '',
    `Policy ID: ${policy.id} v${policy.version}`,
    `Permissions: ${(policy.permissions ?? []).map(p => `${p.cap} on ${p.rsc}`).join(', ') || 'none'}`,
    `Prohibitions: ${(policy.prohibitions ?? []).map(p => `${p.cap} on ${p.rsc}`).join(', ') || 'none'}`,
    `Obligations: ${(policy.obligations ?? []).map(o => o.description).join(', ') || 'none'}`,
    '',
    `Formal goal: ${formulaDescription}`,
    '',
    'Respond with ONLY one of:',
    '  lean4: <Lean 4 proof source ending with Qed or := trivial>',
    '  coq: <Coq proof ending with Qed.>',
    '  refuted: <short reason>',
    '  unknown: <short reason why you cannot prove or refute>',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Proof sketch parser
// ---------------------------------------------------------------------------

export interface ProofSketch {
  kind: 'lean4' | 'coq' | 'refuted' | 'unknown';
  source?: string;
  reason?: string;
  raw: string;
}

export function parseProofSketch(raw: string): ProofSketch {
  const trimmed = raw.trim();

  const lean4Match = trimmed.match(/^lean4:\s*([\s\S]+)/i);
  if (lean4Match) return { kind: 'lean4', source: lean4Match[1].trim(), raw };

  const coqMatch = trimmed.match(/^coq:\s*([\s\S]+)/i);
  if (coqMatch) return { kind: 'coq', source: coqMatch[1].trim(), raw };

  const refutedMatch = trimmed.match(/^refuted:\s*(.*)/i);
  if (refutedMatch) return { kind: 'refuted', reason: refutedMatch[1].trim(), raw };

  const unknownMatch = trimmed.match(/^unknown:\s*(.*)/i);
  if (unknownMatch) return { kind: 'unknown', reason: unknownMatch[1].trim(), raw };

  // Fall through: unrecognised format → unknown
  return { kind: 'unknown', reason: 'LLM response did not follow the expected format', raw };
}

// ---------------------------------------------------------------------------
// NeuralProverBridge
// ---------------------------------------------------------------------------

export interface NeuralProverBridgeOptions {
  /** MCP++ connector to use for the LLM tool call. */
  connector: NeuralProverConnector;
  /** Tool name to call for proof sketch generation. Default: `DEFAULT_PROOF_SKETCH_TOOL`. */
  sketchTool?: string;
  /** Lean 4 bridge for local sketch verification. If omitted, a new one is created. */
  lean4Bridge?: Lean4WasmBridge;
  /** Coq bridge for local sketch verification. If omitted, a new one is created. */
  coqBridge?: CoqJsCoqBridge;
  /** Timeout for the LLM tool call (ms). Default: 30_000. */
  llmTimeoutMs?: number;
  /** Timeout for the local verifier (ms). Default: 10_000. */
  verifyTimeoutMs?: number;
}

export class NeuralProverBridge {
  private readonly connector: NeuralProverConnector;
  private readonly sketchTool: string;
  private lean4Bridge?: Lean4WasmBridge;
  private coqBridge?: CoqJsCoqBridge;
  private readonly llmTimeoutMs: number;
  private readonly verifyTimeoutMs: number;

  constructor(opts: NeuralProverBridgeOptions) {
    this.connector = opts.connector;
    this.sketchTool = opts.sketchTool ?? DEFAULT_PROOF_SKETCH_TOOL;
    this.lean4Bridge = opts.lean4Bridge;
    this.coqBridge = opts.coqBridge;
    this.llmTimeoutMs = opts.llmTimeoutMs ?? 30_000;
    this.verifyTimeoutMs = opts.verifyTimeoutMs ?? 10_000;
  }

  // ---------------------------------------------------------------------------
  // Main API
  // ---------------------------------------------------------------------------

  /**
   * Attempt to prove the consistency of `policy` using an LLM-generated sketch
   * verified locally.
   *
   * Returns:
   * - `proved: true` when the LLM produces a Lean 4 / Coq proof that
   *   verifies locally.
   * - `reason: 'refuted'` when the LLM explicitly refutes the formula.
   * - `reason: 'unknown'` when the LLM sketch is not locally verifiable
   *   (treat as ambiguous; fall through to remote TDFOL).
   */
  async checkPolicyConsistency(
    policy: Policy,
    formulaDescription = 'The policy is internally consistent (no permission/prohibition clash)',
  ): Promise<WasmProofResult> {
    const start = Date.now();

    // Step 1 — request a proof sketch from the LLM
    let rawSketch: string;
    try {
      rawSketch = await this._callLLM(policy, formulaDescription);
    } catch (err) {
      return {
        proved: false, sat: false, unsat: false,
        reason: 'error', prover_id: 'neural',
        proof_time_ms: Date.now() - start,
        meta: { error: `LLM call failed: ${String(err)}` },
      };
    }

    const sketch = parseProofSketch(rawSketch);

    // Step 2 — verify the sketch locally
    if (sketch.kind === 'refuted') {
      return {
        proved: false, sat: false, unsat: true,
        reason: 'refuted', prover_id: 'neural',
        proof_time_ms: Date.now() - start,
        meta: { llm_reason: sketch.reason, raw_sketch: rawSketch.slice(0, 500) },
      };
    }

    if (sketch.kind === 'unknown' || !sketch.source) {
      return {
        proved: false, sat: false, unsat: false,
        reason: 'unknown', prover_id: 'neural',
        proof_time_ms: Date.now() - start,
        meta: { llm_reason: sketch.reason, raw_sketch: rawSketch.slice(0, 500) },
      };
    }

    // Step 3 — local verification
    if (sketch.kind === 'lean4') {
      return this._verifyWithLean4(sketch.source, start);
    }
    if (sketch.kind === 'coq') {
      return this._verifyWithCoq(sketch.source, start);
    }

    return {
      proved: false, sat: false, unsat: false,
      reason: 'unknown', prover_id: 'neural',
      proof_time_ms: Date.now() - start,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async _callLLM(policy: Policy, formulaDescription: string): Promise<string> {
    const prompt = buildProofPrompt(policy, formulaDescription);
    const params = { prompt, max_tokens: 1024, temperature: 0.0 };

    let result: unknown;
    if (typeof this.connector.dispatch === 'function') {
      result = await this.connector.dispatch('llm', this.sketchTool, params);
    } else if (typeof this.connector.callTool === 'function') {
      result = await this.connector.callTool(this.sketchTool, params);
    } else {
      throw new Error('NeuralProverBridge: connector has no dispatch() or callTool() method');
    }

    return extractText(result) ?? JSON.stringify(result);
  }

  private async _ensureLean4(): Promise<Lean4WasmBridge> {
    if (!this.lean4Bridge) {
      this.lean4Bridge = await Lean4WasmBridge.create();
    }
    return this.lean4Bridge;
  }

  private async _ensureCoq(): Promise<CoqJsCoqBridge> {
    if (!this.coqBridge) {
      this.coqBridge = await CoqJsCoqBridge.create();
    }
    return this.coqBridge;
  }

  private async _verifyWithLean4(source: string, start: number): Promise<WasmProofResult> {
    try {
      const bridge = await this._ensureLean4();
      const result = await bridge.prove(source, this.verifyTimeoutMs);
      return {
        ...result,
        prover_id: 'neural',
        meta: { ...(result.meta ?? {}), verified_by: 'lean4', sketch_source: source.slice(0, 300) },
      };
    } catch (err) {
      return {
        proved: false, sat: false, unsat: false,
        reason: 'error', prover_id: 'neural',
        proof_time_ms: Date.now() - start,
        meta: { error: String(err) },
      };
    }
  }

  private async _verifyWithCoq(source: string, start: number): Promise<WasmProofResult> {
    try {
      const bridge = await this._ensureCoq();
      const result = await bridge.prove(source, this.verifyTimeoutMs);
      return {
        ...result,
        prover_id: 'neural',
        meta: { ...(result.meta ?? {}), verified_by: 'coq', sketch_source: source.slice(0, 300) },
      };
    } catch (err) {
      return {
        proved: false, sat: false, unsat: false,
        reason: 'error', prover_id: 'neural',
        proof_time_ms: Date.now() - start,
        meta: { error: String(err) },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.text === 'string') return v.text;
    if (typeof v.content === 'string') return v.content;
    if (typeof v.result === 'string') return v.result;
    if (Array.isArray(v.content)) {
      const textBlock = v.content.find(
        (b: unknown) => b && typeof b === 'object' && (b as Record<string, unknown>).type === 'text',
      ) as Record<string, unknown> | undefined;
      if (textBlock && typeof textBlock.text === 'string') return textBlock.text;
    }
  }
  return null;
}

// PORT-040: confidence + explain + suggest_proof_strategy API
export interface NeuralProofExplanation {
  confidence:  number;   // 0.0–1.0
  reasoning:   string;   // human-readable explanation
  strategy:    string;   // suggested prover strategy
  steps:       string[]; // proof sketch steps
}

export function explainProof(
  formula:   string,
  proofResult: { proved: boolean; reason: string; meta?: Record<string, unknown> },
): NeuralProofExplanation {
  const conf  = proofResult.proved ? 0.9 : proofResult.reason === 'unknown' ? 0.3 : 0.1;
  const strat = formula.match(/[OPF]\(/) ? 'dcec-tableaux'
              : formula.match(/[□◊]/)     ? 'modal-tableaux'
              : formula.match(/[∀∃]/)     ? 'cvc5-fo'
              :                             'z3-prop';
  return {
    confidence: conf,
    reasoning:  `Formula classified as ${strat}. Result: ${proofResult.reason}.`,
    strategy:   strat,
    steps:      proofResult.meta?.['proof_steps'] as string[] ?? [],
  };
}

export function suggestProofStrategy(formula: string): string {
  if (/[OPF]\(/.test(formula))         return 'dcec-native';
  if (/[□◊]/.test(formula))             return 'modal-tableaux';
  if (/[∀∃]/.test(formula))             return 'cvc5-wasm';
  if (formula.length < 50)              return 'z3-wasm';
  return 'sequential-all';
}
