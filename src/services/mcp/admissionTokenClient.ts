/**
 * FACP-041: Connect SwissKnife and seal the EAK negative gate.
 *
 * Host-token client projection for SwissKnife. Browser / UI code may project
 * intent, display digests, carry opaque host-issued token *references*, and
 * consume sealed EffectAdmission receipts. It must never construct tokens,
 * treat allow/consent/dry_run as authority, expose token secrets / private
 * context, or invoke a migrated effect before valid host admission.
 *
 * Evidence schema: facp/effect-admission-gate@1
 * Bundle: facp/admission/gate
 * Kernel call identity (shared with FACP-040 transports):
 *   effect_admission_kernel.unlock_handler
 */

import { dagJsonCid } from './ipld-cid.js';
import { sha256Hex } from '../shared/shared-browser-crypto.js';

export const TASK_ID = 'FACP-041' as const;
export const GOAL_ID = 'FACP-G320' as const;
export const SCHEMA = 'facp/effect-admission-gate@1' as const;
export const BUNDLE = 'facp/admission/gate' as const;
export const TOKEN_SCHEMA = 'facp/admission-token@1' as const;
export const RECEIPT_SCHEMA = 'facp/effect-admission-receipt@1' as const;
export const KERNEL_ISSUER = 'effect_admission_kernel' as const;
export const KERNEL_CALL = 'effect_admission_kernel.unlock_handler' as const;
export const UNSAFE_PROMOTION = false as const;
export const BROWSER_TOKEN_CONSTRUCTION = false as const;

/** Exact inventoried SwissKnife host-admission seam this client seals against. */
export const INVENTORIED_SWISSKNIFE_SEAM =
  'swissknife/src/services/mcp/formalAssuranceGateway.ts' as const;

export const EVIDENCE_SUBSET = [
  'browser allow/consent/dry-run nonauthority',
  'one-use confirmation',
  'argument binding',
  'replay/expiry/revocation',
  'all-transport kernel identity',
] as const;

/** Browser fields that never select host authorization. */
export const BROWSER_AUTHORITY_FIELDS = [
  'consent',
  'allow',
  'policy_decision',
  'confirmation_token',
  'tenant_id',
  'workspace_id',
  'dry_run',
  'browser_policy',
  'policy',
] as const;

/** Closed observation / non-success outcomes for sealed receipts. */
export const CLOSED_OUTCOMES = [
  'Unavailable',
  'Rejected',
  'Simulated',
  'Attempted',
  'Unknown',
  'Observed',
  'Verified',
  'Failed',
  'Compensated',
] as const;

export type ClosedOutcome = (typeof CLOSED_OUTCOMES)[number];

/** Non-success closed outcomes (anything that is not Observed/Verified). */
export const NON_SUCCESS_OUTCOMES = [
  'Unavailable',
  'Rejected',
  'Simulated',
  'Attempted',
  'Unknown',
  'Failed',
  'Compensated',
] as const;

/** Transports that must share one kernel unlock identity (FACP-040 + SwissKnife). */
export const MIGRATED_TRANSPORTS = ['cli', 'mcp', 'mcp++', 'python', 'swissknife'] as const;

export type MigratedTransport = (typeof MIGRATED_TRANSPORTS)[number];

const SECRET_OR_PRIVATE_KEYS = new Set([
  'goose_secret_key',
  'X-Secret-Key',
  'secret_header',
  'authorization',
  'api_key',
  'password',
  'secret',
  'bearer_token',
  'backend_credentials',
  'token_secret',
  'private_context',
  'private_key',
  'signing_key',
  'host_path',
  'file_path',
  'filesystem_path',
]);

const FORBIDDEN_TOKEN_ISSUERS = new Set([
  'browser',
  'browser_consent',
  'prompt',
  'model',
  'peer',
  'payment',
  'caller',
  'tenant',
  'ui',
  'consent',
  'dry_run',
  'allow',
]);

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export type BrowserMediatedFields = Record<string, unknown>;

/** Opaque host-issued AdmissionToken projection — never minted in the browser. */
export interface HostIssuedAdmissionTokenProjection {
  schema: typeof TOKEN_SCHEMA;
  schema_version: 1;
  issuer: typeof KERNEL_ISSUER;
  token_id: string;
  operation_id: string;
  effect_class: string;
  argument_cid: string;
  actor_cid: string;
  resource_cid: string | null;
  policy_cid: string | null;
  nonce: string;
  not_before: number;
  not_after: number;
  /** Opaque reference only — never the signing secret / private context. */
  admission_token_cid: string;
  satisfied_obligations: readonly string[];
}

export interface HostAuthorizationInput {
  actor_cid: string | null;
  resource_cid: string | null;
  operation_id: string;
  argument_cid: string;
  argument_digest: string;
  policy_cid: string | null;
  expiry: number | null;
  nonce: string | null;
  admission_token_cid: string | null;
  /** Always absent from browser — host supplies allow/deny. */
  consent: 'absent';
  authority_decision: null;
}

export interface BindingMismatch {
  field: string;
  expected: string | number | null;
  observed: string | number | null;
  code:
    | 'ARGUMENT_MISMATCH'
    | 'BINDING_MISMATCH'
    | 'EXPIRED_TOKEN'
    | 'REPLAYED_TOKEN'
    | 'REVOKED_TOKEN'
    | 'FORBIDDEN_ISSUER'
    | 'NON_KERNEL_TOKEN_ISSUER'
    | 'MISSING_EVIDENCE'
    | 'HANDLER_NOT_UNLOCKED';
}

export interface AdmissionGateDecision {
  admitted: boolean;
  unlocked: boolean;
  effect_invoked: boolean;
  reason: string;
  code: BindingMismatch['code'] | null;
  mismatches: readonly BindingMismatch[];
  kernel_call: KernelCallIdentity | null;
  closed_outcome: ClosedOutcome;
}

export interface KernelCallIdentity {
  method: typeof KERNEL_CALL;
  operation_id: string;
  effect_class: string;
  argument_cid: string;
  typestate: string;
  /** Transport is recorded but does not change the shared kernel identity. */
  transport: MigratedTransport;
}

export interface OneUseConfirmationProjection {
  kind: 'one_use_confirmation';
  confirmation_intent: true;
  /** Review intent only — never a grant / allow. */
  consent: 'absent' | 'review_intent';
  confirmation_cid: string | null;
  argument_cid: string;
  one_use: true;
  grants_authority: false;
  evidence_class: 'confirmation_intent';
}

export interface EffectAdmissionReceipt {
  schema: typeof RECEIPT_SCHEMA;
  schema_version: 1;
  task_id: typeof TASK_ID;
  operation_id: string;
  argument_cid: string;
  admission_token_cid: string | null;
  admitted: boolean;
  effect_invoked: boolean;
  /** Exact observation or non-success — never a free-form success boolean. */
  closed_outcome: ClosedOutcome;
  observation: string | null;
  reason: string;
  kernel_call: KernelCallIdentity | null;
  mismatches: readonly BindingMismatch[];
  unsafe_promotion: false;
  browser_token_construction: false;
  receipt_cid: string;
}

/**
 * Canonical JSON matching Python `json.dumps(..., sort_keys=True,
 * separators=(",", ":"), ensure_ascii=True)` for digest parity.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[key] = (v as Record<string, unknown>)[key];
      }
      return sorted;
    }
    return v;
  });
}

export function contentDigest(value: unknown): string {
  return sha256Hex(canonicalJson(value ?? null));
}

export function contentCid(value: unknown): string {
  return dagJsonCid(value ?? null);
}

/** Deterministic argument CID used for exact-args binding. */
export function argumentCidFor(argumentsBag: Readonly<Record<string, unknown>>): string {
  return contentCid({ label: 'argument', material: stripSecrets(argumentsBag) });
}

function stripSecrets(
  fields: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_OR_PRIVATE_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Strip browser authority / secret / private fields before any host wire
 * encoding. Result never includes consent/allow/policy_decision/dry_run as
 * authority selectors.
 */
export function stripBrowserAuthorityFields(
  fields: BrowserMediatedFields,
): BrowserMediatedFields {
  const out: BrowserMediatedFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if ((BROWSER_AUTHORITY_FIELDS as readonly string[]).includes(key)) continue;
    if (SECRET_OR_PRIVATE_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Project host authorization inputs. Browser allow/consent/dry-run never
 * influence the projection — only host-bound dimensions remain.
 */
export function projectHostAuthorizationInput(
  request: BrowserMediatedFields,
): HostAuthorizationInput {
  const cleaned = stripBrowserAuthorityFields(request);
  const args =
    (cleaned.arguments as Record<string, unknown> | undefined) ??
    (cleaned.payload as Record<string, unknown> | undefined) ??
    {};
  const argumentCid =
    typeof cleaned.argument_cid === 'string' && cleaned.argument_cid
      ? cleaned.argument_cid
      : argumentCidFor(args);
  const argumentDigest =
    typeof cleaned.argument_digest === 'string' && cleaned.argument_digest
      ? cleaned.argument_digest
      : contentDigest(args);

  return {
    actor_cid:
      typeof cleaned.actor_cid === 'string'
        ? cleaned.actor_cid
        : typeof cleaned.actor_id === 'string'
          ? `actor:${cleaned.actor_id}`
          : null,
    resource_cid:
      typeof cleaned.resource_cid === 'string'
        ? cleaned.resource_cid
        : typeof cleaned.resource_id === 'string'
          ? contentCid(cleaned.resource_id)
          : null,
    operation_id:
      typeof cleaned.operation_id === 'string' && cleaned.operation_id
        ? cleaned.operation_id
        : typeof cleaned.method === 'string' && cleaned.method
          ? cleaned.method
          : 'tools/call',
    argument_cid: argumentCid,
    argument_digest: argumentDigest,
    policy_cid:
      typeof cleaned.policy_cid === 'string'
        ? cleaned.policy_cid
        : typeof cleaned.host_policy_id === 'string'
          ? cleaned.host_policy_id
          : null,
    expiry:
      typeof cleaned.expiry === 'number'
        ? cleaned.expiry
        : typeof cleaned.not_after === 'number'
          ? cleaned.not_after
          : null,
    nonce: typeof cleaned.nonce === 'string' ? cleaned.nonce : null,
    admission_token_cid:
      typeof cleaned.admission_token_cid === 'string'
        ? cleaned.admission_token_cid
        : null,
    consent: 'absent',
    authority_decision: null,
  };
}

/**
 * Hyperproperty helper: paired requests that differ only in browser authority
 * fields must project identical host authorization inputs.
 */
export function browserAuthorityDoesNotChangeHostAuthorization(
  requestA: BrowserMediatedFields,
  requestB: BrowserMediatedFields,
): boolean {
  const a = projectHostAuthorizationInput(requestA);
  const b = projectHostAuthorizationInput(requestB);
  return canonicalJson(a) === canonicalJson(b);
}

/**
 * One-use confirmation is review intent only — never a grant.
 * Consuming confirmation_token from the browser does not admit an effect.
 */
export function projectOneUseConfirmationIntent(
  request: BrowserMediatedFields,
  hostBindings: {
    confirmation_cid?: string | null;
    argument_cid?: string | null;
  } = {},
): OneUseConfirmationProjection {
  const hostAuth = projectHostAuthorizationInput(request);
  const hasReviewToken =
    typeof request.confirmation_token === 'string' &&
    request.confirmation_token.length > 0;
  return {
    kind: 'one_use_confirmation',
    confirmation_intent: true,
    consent: hasReviewToken ? 'review_intent' : 'absent',
    confirmation_cid: hostBindings.confirmation_cid ?? null,
    argument_cid: hostBindings.argument_cid ?? hostAuth.argument_cid,
    one_use: true,
    grants_authority: false,
    evidence_class: 'confirmation_intent',
  };
}

/**
 * Fail closed: browser / UI must never construct or mint an AdmissionToken.
 * Only `effect_admission_kernel` may issue tokens (FACP-039).
 */
export function rejectBrowserTokenConstruction(
  attemptedIssuer: string | null | undefined,
): BindingMismatch | null {
  const issuer = (attemptedIssuer ?? '').trim();
  if (!issuer || issuer === KERNEL_ISSUER) {
    // Empty issuer is missing evidence, not browser construction.
    if (!issuer) {
      return {
        field: 'issuer',
        expected: KERNEL_ISSUER,
        observed: null,
        code: 'MISSING_EVIDENCE',
      };
    }
    return null;
  }
  if (FORBIDDEN_TOKEN_ISSUERS.has(issuer)) {
    return {
      field: 'issuer',
      expected: KERNEL_ISSUER,
      observed: issuer,
      code: 'FORBIDDEN_ISSUER',
    };
  }
  return {
    field: 'issuer',
    expected: KERNEL_ISSUER,
    observed: issuer,
    code: 'NON_KERNEL_TOKEN_ISSUER',
  };
}

/**
 * Project a host-issued token for browser consumption. Never invents issuer,
 * obligations, or private signing material — host bindings are authoritative.
 */
export function projectHostIssuedToken(
  hostToken: Readonly<Record<string, unknown>>,
): HostIssuedAdmissionTokenProjection | { ok: false; mismatch: BindingMismatch } {
  const issuerMismatch = rejectBrowserTokenConstruction(
    typeof hostToken.issuer === 'string' ? hostToken.issuer : null,
  );
  if (issuerMismatch && issuerMismatch.code !== 'MISSING_EVIDENCE') {
    return { ok: false, mismatch: issuerMismatch };
  }
  if (issuerMismatch) {
    return { ok: false, mismatch: issuerMismatch };
  }

  const requiredString = (key: string): string | null => {
    const value = hostToken[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  };

  const operationId = requiredString('operation_id');
  const argumentCid = requiredString('argument_cid');
  const actorCid = requiredString('actor_cid');
  const nonce = requiredString('nonce');
  const tokenId = requiredString('token_id') ?? requiredString('admission_token_cid');
  const notAfter =
    typeof hostToken.not_after === 'number'
      ? hostToken.not_after
      : typeof hostToken.expiry === 'number'
        ? hostToken.expiry
        : null;

  if (!operationId || !argumentCid || !actorCid || !nonce || !tokenId || notAfter == null) {
    return {
      ok: false,
      mismatch: {
        field: !operationId
          ? 'operation_id'
          : !argumentCid
            ? 'argument_cid'
            : !actorCid
              ? 'actor_cid'
              : !nonce
                ? 'nonce'
                : !tokenId
                  ? 'token_id'
                  : 'not_after',
        expected: 'present',
        observed: null,
        code: 'MISSING_EVIDENCE',
      },
    };
  }

  // Never project secrets / private context into the browser envelope.
  const cleaned = stripSecrets(hostToken as Record<string, unknown>);
  void cleaned;

  const admissionTokenCid =
    requiredString('admission_token_cid') ?? contentCid({ token_id: tokenId });

  return {
    schema: TOKEN_SCHEMA,
    schema_version: 1,
    issuer: KERNEL_ISSUER,
    token_id: tokenId,
    operation_id: operationId,
    effect_class:
      typeof hostToken.effect_class === 'string' && hostToken.effect_class
        ? hostToken.effect_class
        : 'read',
    argument_cid: argumentCid,
    actor_cid: actorCid,
    resource_cid: requiredString('resource_cid'),
    policy_cid: requiredString('policy_cid'),
    nonce,
    not_before:
      typeof hostToken.not_before === 'number' ? hostToken.not_before : 0,
    not_after: notAfter,
    admission_token_cid: admissionTokenCid,
    satisfied_obligations: Array.isArray(hostToken.satisfied_obligations)
      ? (hostToken.satisfied_obligations as string[])
      : [],
  };
}

/**
 * Verify exact argument / actor / resource / policy / expiry / nonce binding.
 * Any delta fails closed — no unlock, no effect.
 */
export function verifyTokenBindings(
  token: HostIssuedAdmissionTokenProjection,
  expected: {
    argument_cid: string;
    actor_cid?: string | null;
    resource_cid?: string | null;
    policy_cid?: string | null;
    expiry?: number | null;
    nonce?: string | null;
    now_ms?: number;
    revoked_token_ids?: ReadonlySet<string> | readonly string[];
    used_nonces?: ReadonlySet<string> | readonly string[];
  },
): BindingMismatch[] {
  const mismatches: BindingMismatch[] = [];

  if (token.argument_cid !== expected.argument_cid) {
    mismatches.push({
      field: 'argument_cid',
      expected: expected.argument_cid,
      observed: token.argument_cid,
      code: 'ARGUMENT_MISMATCH',
    });
  }
  if (
    expected.actor_cid != null &&
    expected.actor_cid !== '' &&
    token.actor_cid !== expected.actor_cid
  ) {
    mismatches.push({
      field: 'actor_cid',
      expected: expected.actor_cid,
      observed: token.actor_cid,
      code: 'BINDING_MISMATCH',
    });
  }
  if (
    expected.resource_cid != null &&
    expected.resource_cid !== '' &&
    token.resource_cid !== expected.resource_cid
  ) {
    mismatches.push({
      field: 'resource_cid',
      expected: expected.resource_cid,
      observed: token.resource_cid,
      code: 'BINDING_MISMATCH',
    });
  }
  if (
    expected.policy_cid != null &&
    expected.policy_cid !== '' &&
    token.policy_cid !== expected.policy_cid
  ) {
    mismatches.push({
      field: 'policy_cid',
      expected: expected.policy_cid,
      observed: token.policy_cid,
      code: 'BINDING_MISMATCH',
    });
  }
  if (
    expected.expiry != null &&
    token.not_after !== expected.expiry
  ) {
    mismatches.push({
      field: 'expiry',
      expected: expected.expiry,
      observed: token.not_after,
      code: 'BINDING_MISMATCH',
    });
  }
  if (expected.nonce != null && expected.nonce !== '' && token.nonce !== expected.nonce) {
    mismatches.push({
      field: 'nonce',
      expected: expected.nonce,
      observed: token.nonce,
      code: 'BINDING_MISMATCH',
    });
  }

  const now = expected.now_ms ?? 0;
  if (token.not_after <= now) {
    mismatches.push({
      field: 'not_after',
      expected: `> ${now}`,
      observed: token.not_after,
      code: 'EXPIRED_TOKEN',
    });
  }

  const revoked = expected.revoked_token_ids;
  if (revoked) {
    const set = revoked instanceof Set ? revoked : new Set(revoked);
    if (set.has(token.token_id) || set.has(token.admission_token_cid)) {
      mismatches.push({
        field: 'token_id',
        expected: 'not_revoked',
        observed: token.token_id,
        code: 'REVOKED_TOKEN',
      });
    }
  }

  const used = expected.used_nonces;
  if (used) {
    const set = used instanceof Set ? used : new Set(used);
    if (set.has(token.nonce)) {
      mismatches.push({
        field: 'nonce',
        expected: 'fresh',
        observed: token.nonce,
        code: 'REPLAYED_TOKEN',
      });
    }
  }

  return mismatches;
}

/** Shared kernel unlock call identity — transport does not widen authority. */
export function kernelCallIdentity(params: {
  operation_id: string;
  effect_class: string;
  argument_cid: string;
  typestate?: string;
  transport: MigratedTransport;
}): KernelCallIdentity {
  return {
    method: KERNEL_CALL,
    operation_id: params.operation_id,
    effect_class: params.effect_class,
    argument_cid: params.argument_cid,
    typestate: params.typestate ?? 'Reserved',
    transport: params.transport,
  };
}

/** Kernel identity without transport — must match across all migrated transports. */
export function kernelIdentityWithoutTransport(
  call: KernelCallIdentity,
): Omit<KernelCallIdentity, 'transport'> {
  return {
    method: call.method,
    operation_id: call.operation_id,
    effect_class: call.effect_class,
    argument_cid: call.argument_cid,
    typestate: call.typestate,
  };
}

export function sameKernelCallIdentity(
  left: KernelCallIdentity,
  right: KernelCallIdentity,
): boolean {
  return (
    canonicalJson(kernelIdentityWithoutTransport(left)) ===
    canonicalJson(kernelIdentityWithoutTransport(right))
  );
}

/**
 * Admit-or-reject gate: no migrated effect occurs before valid admission.
 * Browser authority overlays are stripped and never consulted.
 */
export function admitOrRejectEffect(params: {
  request: BrowserMediatedFields;
  hostToken: Readonly<Record<string, unknown>> | null | undefined;
  transport?: MigratedTransport;
  typestate?: string;
  now_ms?: number;
  revoked_token_ids?: ReadonlySet<string> | readonly string[];
  used_nonces?: ReadonlySet<string> | readonly string[];
  /** Optional live effect callback — invoked ONLY after unlock. */
  effect?: (args: Readonly<Record<string, unknown>>) => unknown;
}): AdmissionGateDecision {
  const transport = params.transport ?? 'swissknife';
  const hostAuth = projectHostAuthorizationInput(params.request);

  if (!params.hostToken) {
    return {
      admitted: false,
      unlocked: false,
      effect_invoked: false,
      reason: 'host_admission_required',
      code: 'HANDLER_NOT_UNLOCKED',
      mismatches: [
        {
          field: 'admission_token',
          expected: 'host-issued',
          observed: null,
          code: 'HANDLER_NOT_UNLOCKED',
        },
      ],
      kernel_call: null,
      closed_outcome: 'Rejected',
    };
  }

  const projected = projectHostIssuedToken(params.hostToken);
  if ('ok' in projected && projected.ok === false) {
    return {
      admitted: false,
      unlocked: false,
      effect_invoked: false,
      reason: `token_projection_failed:${projected.mismatch.code}`,
      code: projected.mismatch.code,
      mismatches: [projected.mismatch],
      kernel_call: null,
      closed_outcome: 'Rejected',
    };
  }

  const token = projected as HostIssuedAdmissionTokenProjection;
  const mismatches = verifyTokenBindings(token, {
    argument_cid: hostAuth.argument_cid,
    actor_cid: hostAuth.actor_cid,
    resource_cid: hostAuth.resource_cid,
    policy_cid: hostAuth.policy_cid,
    expiry: hostAuth.expiry,
    nonce: hostAuth.nonce,
    now_ms: params.now_ms,
    revoked_token_ids: params.revoked_token_ids,
    used_nonces: params.used_nonces,
  });

  const call = kernelCallIdentity({
    operation_id: token.operation_id,
    effect_class: token.effect_class,
    argument_cid: hostAuth.argument_cid,
    typestate: params.typestate ?? 'Reserved',
    transport,
  });

  if (mismatches.length > 0) {
    return {
      admitted: false,
      unlocked: false,
      effect_invoked: false,
      reason: `binding_failed:${mismatches[0].code}`,
      code: mismatches[0].code,
      mismatches,
      kernel_call: call,
      closed_outcome: 'Rejected',
    };
  }

  // Valid admission — effect may run exactly once under the unlock.
  let effectInvoked = false;
  if (params.effect) {
    const args =
      (params.request.arguments as Record<string, unknown> | undefined) ??
      (params.request.payload as Record<string, unknown> | undefined) ??
      {};
    params.effect(stripBrowserAuthorityFields(args) as Record<string, unknown>);
    effectInvoked = true;
  }

  return {
    admitted: true,
    unlocked: true,
    effect_invoked: effectInvoked,
    reason: 'host_issued_admission',
    code: null,
    mismatches: [],
    kernel_call: call,
    closed_outcome: effectInvoked ? 'Observed' : 'Attempted',
  };
}

/**
 * Seal an EffectAdmission receipt. Records the exact observation string or a
 * closed non-success outcome — never a free-form success boolean.
 */
export function sealEffectAdmissionReceipt(params: {
  decision: AdmissionGateDecision;
  operation_id: string;
  argument_cid: string;
  admission_token_cid?: string | null;
  observation?: string | null;
}): EffectAdmissionReceipt {
  const closed = params.decision.closed_outcome;
  if (!(CLOSED_OUTCOMES as readonly string[]).includes(closed)) {
    throw new Error(`unknown closed_outcome=${closed}`);
  }

  // Forbidden: promote ambiguous / denied paths to Observed via success flags.
  let observation: string | null = null;
  let closedOutcome: ClosedOutcome = closed;
  if (params.decision.admitted && params.decision.effect_invoked) {
    observation =
      params.observation ??
      (closed === 'Observed' || closed === 'Verified' ? closed : null);
    if (observation == null) {
      closedOutcome = 'Unknown';
    }
  } else {
    // Non-success path: preserve Rejected / Unavailable / Failed / etc.
    observation = null;
    if (closedOutcome === 'Observed' || closedOutcome === 'Verified') {
      closedOutcome = 'Rejected';
    }
  }

  const body = {
    schema: RECEIPT_SCHEMA,
    schema_version: 1 as const,
    task_id: TASK_ID,
    operation_id: params.operation_id,
    argument_cid: params.argument_cid,
    admission_token_cid: params.admission_token_cid ?? null,
    admitted: params.decision.admitted,
    effect_invoked: params.decision.effect_invoked,
    closed_outcome: closedOutcome,
    observation,
    reason: params.decision.reason,
    kernel_call: params.decision.kernel_call,
    mismatches: params.decision.mismatches,
    unsafe_promotion: UNSAFE_PROMOTION,
    browser_token_construction: BROWSER_TOKEN_CONSTRUCTION,
  };

  return {
    ...body,
    receipt_cid: contentCid(body),
  };
}

/**
 * Assert the browser wire payload carries no authority decision and that
 * token construction remains host-only.
 */
export function assertBrowserSendsNoAuthorityDecision(
  wire: BrowserMediatedFields,
): { ok: true } | { ok: false; violations: string[] } {
  const violations: string[] = [];
  for (const field of BROWSER_AUTHORITY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(wire, field)) {
      violations.push(`browser_authority_field_present:${field}`);
    }
  }
  if (wire.authority_decision != null) {
    violations.push('authority_decision_present');
  }
  if (wire.consent !== undefined && wire.consent !== 'absent') {
    violations.push(`consent_not_absent:${String(wire.consent)}`);
  }
  if (typeof wire.issuer === 'string' && wire.issuer !== KERNEL_ISSUER) {
    violations.push(`browser_token_issuer:${wire.issuer}`);
  }
  for (const key of SECRET_OR_PRIVATE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(wire, key)) {
      violations.push(`secret_or_private_field_present:${key}`);
    }
  }
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

/** Facade for the SwissKnife EAK negative-gate client projection. */
export class AdmissionTokenClient {
  readonly schema = SCHEMA;
  readonly taskId = TASK_ID;
  readonly goalId = GOAL_ID;
  readonly bundle = BUNDLE;
  readonly kernelIssuer = KERNEL_ISSUER;
  readonly kernelCall = KERNEL_CALL;
  readonly inventoriedSeam = INVENTORIED_SWISSKNIFE_SEAM;
  readonly browserTokenConstruction = BROWSER_TOKEN_CONSTRUCTION;
  readonly unsafePromotion = UNSAFE_PROMOTION;

  projectHostAuthorization(request: BrowserMediatedFields): HostAuthorizationInput {
    return projectHostAuthorizationInput(request);
  }

  projectConfirmation(
    request: BrowserMediatedFields,
    hostBindings?: { confirmation_cid?: string | null; argument_cid?: string | null },
  ): OneUseConfirmationProjection {
    return projectOneUseConfirmationIntent(request, hostBindings);
  }

  projectToken(
    hostToken: Readonly<Record<string, unknown>>,
  ): HostIssuedAdmissionTokenProjection | { ok: false; mismatch: BindingMismatch } {
    return projectHostIssuedToken(hostToken);
  }

  admit(params: Parameters<typeof admitOrRejectEffect>[0]): AdmissionGateDecision {
    return admitOrRejectEffect(params);
  }

  seal(
    params: Parameters<typeof sealEffectAdmissionReceipt>[0],
  ): EffectAdmissionReceipt {
    return sealEffectAdmissionReceipt(params);
  }

  /** Convenience: admit then seal a receipt in one fail-closed step. */
  admitAndSeal(params: {
    request: BrowserMediatedFields;
    hostToken: Readonly<Record<string, unknown>> | null | undefined;
    transport?: MigratedTransport;
    typestate?: string;
    now_ms?: number;
    revoked_token_ids?: ReadonlySet<string> | readonly string[];
    used_nonces?: ReadonlySet<string> | readonly string[];
    effect?: (args: Readonly<Record<string, unknown>>) => unknown;
    observation?: string | null;
  }): { decision: AdmissionGateDecision; receipt: EffectAdmissionReceipt } {
    const decision = admitOrRejectEffect(params);
    const hostAuth = projectHostAuthorizationInput(params.request);
    const tokenCid =
      params.hostToken && typeof params.hostToken.admission_token_cid === 'string'
        ? params.hostToken.admission_token_cid
        : hostAuth.admission_token_cid;
    const receipt = sealEffectAdmissionReceipt({
      decision,
      operation_id: hostAuth.operation_id,
      argument_cid: hostAuth.argument_cid,
      admission_token_cid: tokenCid,
      observation: params.observation,
    });
    return { decision, receipt };
  }
}

export default AdmissionTokenClient;
