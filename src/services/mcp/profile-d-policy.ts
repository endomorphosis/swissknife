/** Pure TypeScript MCP++ Profile D execution-policy evaluator. */

import { dagJsonCid } from './ipld-cid.js';
import {
  createProfileDPolicyStatementOnlyCertificate,
  type ProfileDPolicyZkpCertificate,
} from '../zkp/profile-d-policy-zkp.js';

export const PROFILE_D_POLICY_SCHEMA = 'mcp++/profile-d-policy@1' as const;
export const PROFILE_D_ZKP_STATEMENT_SCHEMA = 'mcp++/profile-d-policy-zkp-statement@1' as const;

export type ProfileDClauseType = 'permission' | 'prohibition' | 'obligation';

export interface ProfileDClause {
  readonly clause_type: ProfileDClauseType;
  readonly actor?: string;
  readonly action?: string;
  readonly resource?: string;
  readonly valid_from?: string;
  readonly valid_until?: string;
  readonly obligation_deadline?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ProfileDPolicy {
  readonly policy_id?: string;
  readonly version?: string;
  readonly description?: string;
  readonly clauses: readonly ProfileDClause[];
  readonly formal_logic?: readonly string[];
}

export interface ProfileDExecutionRequest {
  readonly actor: string;
  readonly action: string;
  readonly resource?: string;
  readonly policy?: ProfileDPolicy;
  readonly policy_text?: string | readonly string[];
  readonly evaluated_at?: string;
  readonly intent_cid?: string;
  readonly request_zkp_certificate?: boolean;
}

export interface ProfileDExecutionDecision {
  readonly decision: 'allow' | 'deny' | 'allow_with_obligations';
  readonly allowed: boolean;
  readonly policy_cid: string;
  readonly decision_cid: string;
  readonly intent_cid: string;
  readonly obligations: readonly Record<string, unknown>[];
  readonly justification: string;
  readonly policy_version: string;
  readonly formal_logic: readonly string[];
  readonly formal_logic_cid: string;
  readonly policy_source: 'explicit' | 'plain_text_typescript';
  readonly zkp_certificate?: ProfileDZkpStatement;
}

/** `statement_cid` is a local DAG-JSON convenience field and is optional on the wire. */
export type ProfileDZkpStatement = ProfileDPolicyZkpCertificate & {
  readonly statement_cid?: string;
};

/** Evaluate a Profile D policy locally, without Python or a remote service. */
export function evaluateProfileDExecution(request: ProfileDExecutionRequest): ProfileDExecutionDecision {
  if (!request.actor?.trim()) throw new Error('actor must be a non-empty string');
  if (!request.action?.trim()) throw new Error('action must be a non-empty string');
  if ((request.policy === undefined) === (request.policy_text === undefined)) {
    throw new Error('provide exactly one of policy or policy_text');
  }
  const now = parseTime(request.evaluated_at);
  const evaluatedAt = canonicalTimestamp(now);
  const source = request.policy ? 'explicit' : 'plain_text_typescript';
  const policy = request.policy ?? compileTextPolicy(request.policy_text!, request.actor);
  if (!Array.isArray(policy.clauses) || policy.clauses.length === 0) throw new Error('policy.clauses must be a non-empty list');
  const clauses = policy.clauses.map(normalizeClause);
  const policyModel = {
    policy_id: policy.policy_id?.trim() || '',
    clauses,
    version: policy.version?.trim() || 'v1',
    description: policy.description ?? '',
  };
  const formalLogic = policy.formal_logic?.length ? [...policy.formal_logic] : clauses.map(clauseToFormula);
  const policyCid = cid({ schema: PROFILE_D_POLICY_SCHEMA, policy: policyModel, formal_logic: formalLogic });
  const matching = clauses.filter(clause => applies(clause, request.actor, request.action, request.resource, now));
  const prohibited = matching.filter(clause => clause.clause_type === 'prohibition');
  const permissions = matching.filter(clause => clause.clause_type === 'permission');
  const obligations = matching.filter(clause => clause.clause_type === 'obligation').map(clause => ({
    type: 'obligation', action: clause.action, deadline: clause.obligation_deadline ?? '', metadata: clause.metadata ?? {},
  }));
  const decision = prohibited.length ? 'deny' : permissions.length ? (obligations.length ? 'allow_with_obligations' : 'allow') : 'deny';
  const justification = prohibited.length
    ? prohibited.map(() => `Prohibited: actor=${request.actor} action=${request.action}`).join('; ')
    : permissions.length ? (obligations.length ? `Permitted with ${obligations.length} obligation(s)` : `Explicit permission for actor=${request.actor} action=${request.action}`)
      : `No matching permission for actor=${request.actor} action=${request.action}`;
  const intentCid = cid({
    schema: 'mcp++/profile-d-intent@1', actor: request.actor.trim(), action: request.action.trim(),
    resource: request.resource ?? null, input_cid: request.intent_cid ?? null, policy_cid: policyCid,
  });
  const formalLogicCid = cid({ formal_logic: formalLogic });
  const decisionCid = cid({
    schema: 'mcp++/profile-d-decision@1', decision, allowed: decision !== 'deny', policy_cid: policyCid,
    intent_cid: intentCid, obligations, justification, policy_version: policyModel.version,
    formal_logic_cid: formalLogicCid, evaluated_at: evaluatedAt,
  });
  const base = {
    decision, allowed: decision !== 'deny', policy_cid: policyCid, decision_cid: decisionCid, intent_cid: intentCid,
    obligations, justification, policy_version: policyModel.version, formal_logic: formalLogic,
    formal_logic_cid: formalLogicCid, policy_source: source,
  } as const;
  return request.request_zkp_certificate ? {
    ...base,
    zkp_certificate: zkpStatement({ ...base, policy: policyModel, context: {
      actor: request.actor.trim(), action: request.action.trim(), resource: request.resource ?? null, evaluated_at: evaluatedAt,
    } }),
  } : base;
}

function compileTextPolicy(input: string | readonly string[], fallbackActor: string): ProfileDPolicy {
  const sentences = (typeof input === 'string' ? input.split(/[.!?\n]+/) : [...input]).map(value => value.trim()).filter(Boolean);
  const clauses: ProfileDClause[] = [];
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const clause_type: ProfileDClauseType | null = /\b(must not|shall not|may not|forbidden|prohibited)\b/.test(lower) ? 'prohibition'
      : /\b(must|shall|required to|is required)\b/.test(lower) ? 'obligation'
        : /\b(may|permitted|allowed|authorized)\b/.test(lower) ? 'permission' : null;
    if (!clause_type) continue;
    const actor = sentence.split(/\s+/, 1)[0]?.toLowerCase() || fallbackActor;
    const action = lower.replace(/^.*?\b(?:must not|shall not|may not|must|shall|may|permitted to|allowed to|authorized to|required to)\s+/, '').trim() || '*';
    clauses.push({ clause_type, actor, action });
  }
  if (!clauses.length) throw new Error('plain-text policy did not produce any recognized deontic clauses');
  return { clauses };
}

function normalizeClause(value: ProfileDClause): Required<Pick<ProfileDClause, 'clause_type' | 'actor' | 'action' | 'resource' | 'valid_from' | 'valid_until' | 'obligation_deadline' | 'metadata'>> {
  if (!['permission', 'prohibition', 'obligation'].includes(value.clause_type)) throw new Error(`unsupported policy clause type: ${String(value.clause_type)}`);
  return {
    clause_type: value.clause_type,
    actor: value.actor?.trim() || '*',
    action: value.action?.trim() || '*',
    resource: value.resource?.trim() || null,
    valid_from: value.valid_from?.trim() || null,
    valid_until: value.valid_until?.trim() || null,
    obligation_deadline: value.obligation_deadline?.trim() || null,
    metadata: value.metadata ?? {},
  } as Required<Pick<ProfileDClause, 'clause_type' | 'actor' | 'action' | 'resource' | 'valid_from' | 'valid_until' | 'obligation_deadline' | 'metadata'>>;
}

function applies(clause: ProfileDClause, actor: string, action: string, resource: string | undefined, now: number): boolean {
  if (!matches(clause.actor ?? '*', actor) || !matches(clause.action ?? '*', action)) return false;
  if (clause.resource && !matches(clause.resource, resource ?? '')) return false;
  return (!clause.valid_from || now >= parseTime(clause.valid_from)) && (!clause.valid_until || now <= parseTime(clause.valid_until));
}

function matches(pattern: string, value: string): boolean {
  return pattern === '*' || pattern === value || (pattern.endsWith('/*') && value.startsWith(pattern.slice(0, -1)));
}

function clauseToFormula(clause: ProfileDClause): string {
  const operator = { permission: 'P', prohibition: 'F', obligation: 'O' }[clause.clause_type];
  return `${operator}(${clause.actor ?? '*'},${clause.action ?? '*'},${clause.resource ?? '*'})`;
}

function parseTime(value: string | undefined): number {
  if (!value) return Date.now();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error('evaluated_at and temporal bounds must be ISO-8601 timestamps');
  return parsed;
}

function cid(value: unknown): string { return dagJsonCid(value); }

function canonicalTimestamp(value: number): string {
  return new Date(value).toISOString().replace('.000Z', 'Z');
}

function zkpStatement(value: Omit<ProfileDExecutionDecision, 'zkp_certificate'> & { policy: unknown; context: unknown }): ProfileDZkpStatement {
  const certificate = createProfileDPolicyStatementOnlyCertificate({
    policy: value.policy,
    context: value.context,
    verdict: value.decision,
    obligations: value.obligations,
  });
  return { ...certificate, statement_cid: cid(certificate.public_statement) };
}
