/**
 * ucan-policy-bridge.ts
 *
 * UCAN policy bridge: NL text → deontic policy → delegation tokens → evaluation.
 * TypeScript port of ipfs_datasets_py/logic/integration/ucan_policy_bridge.py
 *
 * Provides:
 *   BridgeCompileResult     — result of compileNl()
 *   BridgeEvaluationResult  — result of evaluate()
 *   SignedPolicyResult       — result of sign()
 *   UCANPolicyBridge         — orchestrates compile + evaluate + sign
 *   compileAndEvaluate()     — convenience wrapper
 */

import { sha256Hex } from '../../shared/shared-browser-crypto.js';

// ---------------------------------------------------------------------------
// DelegationToken (minimal stub)
// ---------------------------------------------------------------------------

export interface DelegationToken {
  cid: string;
  issuer: string;
  audience: string;
  capability: string;
  expiration?: number;
  notBefore?: number;
}

function stubDelegationToken(capability: string, issuer: string, audience: string): DelegationToken {
  const cid = `ucan:${sha256Hex(`${issuer}:${audience}:${capability}`).slice(0, 16)}`;
  return { cid, issuer, audience, capability };
}

// ---------------------------------------------------------------------------
// BridgeCompileResult
// ---------------------------------------------------------------------------

export class BridgeCompileResult {
  success = false;
  policyCid = '';
  delegationTokens: DelegationToken[] = [];
  denialCount = 0;
  leafTokenCid: string | null = null;
  errors: string[] = [];
  warnings: string[] = [];
  conflicts: Array<Record<string, unknown>> = [];

  get delegationCount(): number { return this.delegationTokens.length; }
  get conflictCount(): number { return this.conflicts.length; }

  toDict(): Record<string, unknown> {
    return {
      conflict_count: this.conflictCount,
      delegation_count: this.delegationCount,
      delegation_tokens: this.delegationTokens,
      denial_count: this.denialCount,
      errors: this.errors,
      leaf_token_cid: this.leafTokenCid,
      policy_cid: this.policyCid,
      success: this.success,
      warnings: this.warnings,
    };
  }
}

// ---------------------------------------------------------------------------
// BridgeEvaluationResult
// ---------------------------------------------------------------------------

export type EvaluationDecision = 'allow' | 'deny' | 'allow_with_obligations';

export class BridgeEvaluationResult {
  decision: EvaluationDecision = 'deny';
  policyCid = '';
  reason = '';
  obligations: string[] = [];
  deniedCapabilities: string[] = [];
  evaluatedAt: number = Date.now() / 1000;

  get allowed(): boolean { return this.decision !== 'deny'; }

  toDict(): Record<string, unknown> {
    return {
      allowed: this.allowed,
      decision: this.decision,
      denied_capabilities: this.deniedCapabilities,
      evaluated_at: this.evaluatedAt,
      obligations: this.obligations,
      policy_cid: this.policyCid,
      reason: this.reason,
    };
  }
}

// ---------------------------------------------------------------------------
// SignedPolicyResult
// ---------------------------------------------------------------------------

export class SignedPolicyResult {
  policyCid = '';
  signatureCid = '';
  issuer = '';
  audience = '';
  signedAt: number = Date.now() / 1000;
  valid = false;

  toDict(): Record<string, unknown> {
    return {
      audience: this.audience,
      issuer: this.issuer,
      policy_cid: this.policyCid,
      signature_cid: this.signatureCid,
      signed_at: this.signedAt,
      valid: this.valid,
    };
  }
}

// ---------------------------------------------------------------------------
// UCANPolicyBridge
// ---------------------------------------------------------------------------

/** Deontic operator detection heuristics (simplified). */
function detectOperator(text: string): 'O' | 'P' | 'F' {
  const lower = text.toLowerCase();
  if (/\b(shall not|must not|prohibited|forbidden)\b/.test(lower)) return 'F';
  if (/\b(may|permitted|allowed|authorized)\b/.test(lower)) return 'P';
  return 'O';
}

function sentenceSplit(text: string): string[] {
  return text.split(/[.;!?]/).map(s => s.trim()).filter(s => s.length > 3);
}

function makePolicyCid(text: string): string {
  return `policy:${sha256Hex(text.slice(0, 512)).slice(0, 16)}`;
}

export interface CompileNlOpts {
  issuerDid?: string;
  audienceDid?: string;
  lifetimeSeconds?: number;
}

export interface EvaluateOpts {
  capability: string;
  resource?: string;
  requestor?: string;
}

export class UCANPolicyBridge {
  private issuerDid: string;
  private audienceDid: string;

  constructor(opts: { issuerDid?: string; audienceDid?: string } = {}) {
    this.issuerDid = opts.issuerDid ?? 'did:example:root';
    this.audienceDid = opts.audienceDid ?? 'did:example:agent';
  }

  /**
   * Compile NL text into a deontic policy + UCAN delegation tokens.
   */
  compileNl(nlText: string, opts: CompileNlOpts = {}): BridgeCompileResult {
    const result = new BridgeCompileResult();
    const issuer = opts.issuerDid ?? this.issuerDid;
    const audience = opts.audienceDid ?? this.audienceDid;

    const sentences = sentenceSplit(nlText);
    if (sentences.length === 0) {
      result.errors.push('Empty or unparseable NL text');
      return result;
    }

    const policyCid = makePolicyCid(nlText);
    result.policyCid = policyCid;

    for (const sentence of sentences) {
      const op = detectOperator(sentence);
      if (op === 'F') {
        result.denialCount++;
        continue;
      }
      const capability = `deontic:${op.toLowerCase()}:${sentence.slice(0, 32).replace(/\s+/g, '_').toLowerCase()}`;
      result.delegationTokens.push(stubDelegationToken(capability, issuer, audience));
    }

    if (result.delegationTokens.length > 0) {
      result.leafTokenCid = result.delegationTokens[result.delegationTokens.length - 1].cid;
      result.success = true;
    }
    return result;
  }

  /**
   * Evaluate whether a capability request is allowed by the compiled policy.
   */
  evaluate(policyCid: string, opts: EvaluateOpts): BridgeEvaluationResult {
    const result = new BridgeEvaluationResult();
    result.policyCid = policyCid;

    if (!policyCid || !opts.capability) {
      result.decision = 'deny';
      result.reason = 'Missing policyCid or capability';
      return result;
    }

    // Simplified: allow all non-F capabilities
    const lower = opts.capability.toLowerCase();
    if (lower.includes(':f:') || lower.includes('deny') || lower.includes('prohibit')) {
      result.decision = 'deny';
      result.reason = 'Capability is explicitly denied by deontic prohibition';
      result.deniedCapabilities.push(opts.capability);
      return result;
    }

    if (lower.includes(':o:')) {
      result.decision = 'allow_with_obligations';
      result.reason = 'Capability allowed; obligation conditions apply';
      result.obligations.push(`fulfill:${opts.capability}`);
    } else {
      result.decision = 'allow';
      result.reason = 'Capability permitted';
    }
    return result;
  }

  /**
   * Sign a compiled policy with the issuer's DID.
   */
  sign(policyCid: string, opts: { issuerDid?: string; audienceDid?: string } = {}): SignedPolicyResult {
    const result = new SignedPolicyResult();
    result.policyCid = policyCid;
    result.issuer = opts.issuerDid ?? this.issuerDid;
    result.audience = opts.audienceDid ?? this.audienceDid;
    result.signatureCid = `sig:${sha256Hex(`${result.issuer}:${policyCid}`).slice(0, 16)}`;
    result.valid = !!policyCid;
    return result;
  }
}

// ---------------------------------------------------------------------------
// compileAndEvaluate (convenience)
// ---------------------------------------------------------------------------

/**
 * Compile NL text into a policy, then evaluate a capability request against it.
 */
export function compileAndEvaluate(
  nlText: string,
  request: EvaluateOpts,
  opts: CompileNlOpts = {},
): { compile: BridgeCompileResult; evaluate: BridgeEvaluationResult } {
  const bridge = new UCANPolicyBridge({ issuerDid: opts.issuerDid, audienceDid: opts.audienceDid });
  const compile = bridge.compileNl(nlText, opts);
  const evaluate = bridge.evaluate(compile.policyCid, request);
  return { compile, evaluate };
}

// ---------------------------------------------------------------------------
// getUCANPolicyBridge singleton
// ---------------------------------------------------------------------------

let _singleton: UCANPolicyBridge | null = null;

export function getUCANPolicyBridge(): UCANPolicyBridge {
  if (!_singleton) _singleton = new UCANPolicyBridge();
  return _singleton;
}
