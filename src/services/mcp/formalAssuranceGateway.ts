/**
 * FACP-030: Migrate SwissKnife to host-issued FCA outcomes.
 *
 * Owns the browser request / host decision projection for the inventoried
 * VirtualDesktopLiveGateway seam. Browser code may project intent and display
 * host outcomes; it must never construct allow/policy/authority, transmit raw
 * credentials or host paths, or silently grant consent.
 *
 * Evidence schema: facp/host-admission-projection@1
 * Bundle: facp/migration/swissknife-host
 */

import { canonicalDagJson, dagJsonCid } from './ipld-cid.js';
import { sha256Hex } from '../shared/shared-browser-crypto.js';

export const TASK_ID = 'FACP-030' as const;
export const GOAL_ID = 'FACP-G240' as const;
export const SCHEMA = 'facp/host-admission-projection@1' as const;
export const BUNDLE = 'facp/migration/swissknife-host' as const;

/** Exact inventoried live-gateway seam this projection migrates. */
export const INVENTORIED_LIVE_GATEWAY_SEAM =
  'swissknife/src/services/mcp/virtual-desktop-live-gateway.ts' as const;

export const EVIDENCE_SUBSET = [
  'canonical request',
  'actor/session opaque refs',
  'method/resource/argument CID',
  'host decision',
  'confirmation request',
  'evidence classification',
] as const;

/** Browser fields that are presentation-only and never host admission authority. */
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

const SECRET_OR_HOST_KEYS = new Set([
  'goose_secret_key',
  'X-Secret-Key',
  'secret_header',
  'authorization',
  'api_key',
  'password',
  'secret',
  'bearer_token',
  'backend_credentials',
  'host_path',
  'file_path',
  'filesystem_path',
  'python_process',
  'process_command',
  'stdio',
]);

/** Consent is absent until the host issues an admission outcome. */
export type ConsentProjection = 'absent' | 'denied' | 'review_intent';

export type EvidenceClass =
  | 'presentation_only'
  | 'confirmation_intent'
  | 'host_issued'
  | 'failing_seed_legacy';

export type ClosedPresentationOutcome =
  | 'Rejected'
  | 'Attempted'
  | 'Unavailable'
  | 'Unknown';

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export type BrowserMediatedFields = Record<string, unknown>;

/**
 * Browser-side invocation intent for the inventoried desktop seam.
 * Consent defaults to absent — never silently granted.
 */
export interface BrowserDesktopInvocationIntent {
  binding_id: string;
  method?: string;
  resource_id?: string;
  actor_id?: string;
  session_id?: string;
  payload?: Readonly<Record<string, unknown>>;
  arguments?: Readonly<Record<string, unknown>>;
  /** Presentation-only live/dry-run intent; host binds live enablement. */
  dry_run_intent?: boolean;
  /** UI review token — never treated as consent grant. */
  confirmation_token?: string | null;
  mutates_remote_state?: boolean;
  correlation_id?: string;
  /** Forbidden: browser must not supply authority decisions. */
  consent?: unknown;
  allow?: unknown;
  policy_decision?: unknown;
  tenant_id?: unknown;
  workspace_id?: unknown;
}

/** Opaque actor/session refs — no secrets, host paths, or raw credentials. */
export interface OpaqueIdentityRefs {
  actor_ref: string | null;
  session_ref: string | null;
}

export interface CanonicalHostRequest {
  schema: typeof SCHEMA;
  task_id: typeof TASK_ID;
  method: string;
  resource_id: string;
  binding_id: string;
  actor_ref: string | null;
  session_ref: string | null;
  method_cid: string;
  resource_cid: string;
  argument_cid: string;
  method_digest: string;
  resource_digest: string;
  argument_digest: string;
  /** dry_run remains request intent only; not live qualification. */
  dry_run_intent: boolean;
  mutates_remote_state: boolean;
  correlation_id: string | null;
  /** Always absent on the wire from browser — host supplies allow/deny. */
  consent: 'absent';
  /** Browser never sends an authority decision object. */
  authority_decision: null;
  host_policy_id: string | null;
  admission_token_cid: string | null;
  expiry: string | null;
  nonce: string | null;
}

/** Exact digests the UI must display for operator review. */
export interface UiDigestDisplay {
  method: string;
  resource_id: string;
  method_digest: string;
  resource_digest: string;
  argument_digest: string;
  method_cid: string;
  resource_cid: string;
  argument_cid: string;
  display_lines: readonly string[];
}

export interface ConfirmationRequestProjection {
  kind: 'confirmation_request';
  binding_id: string;
  resource_id: string;
  method: string;
  argument_digest: string;
  argument_cid: string;
  /** Review intent only — not a grant. */
  consent: ConsentProjection;
  confirmation_intent: boolean;
  mutates_remote_state: boolean;
  ui_digest: UiDigestDisplay;
  evidence_class: 'confirmation_intent';
}

/**
 * Host-issued typed FCA outcome. SwissKnife consumes this without upgrading
 * any evidence dimension beyond what the host provided.
 */
export interface HostIssuedTypedOutcome {
  decision_cid: string;
  outcome: 'allow' | 'deny';
  authority: 'valid' | 'absent' | 'unchecked';
  policy: 'allowed' | 'denied' | 'unchecked' | 'indeterminate';
  reason: string;
  bound_method_digest: string;
  bound_resource_digest: string;
  bound_argument_digest: string;
  bound_method_cid?: string;
  bound_resource_cid?: string;
  bound_argument_cid?: string;
  bound_nonce?: string | null;
  bound_expiry?: string | null;
  closed_outcome: ClosedPresentationOutcome;
  /** Optional host evidence dims — browser may display, never strengthen. */
  evidence?: Partial<{
    origin: string;
    authority: string;
    policy: string;
    effect: string;
    proof: string;
    freshness: string;
    integrity: string;
    environment: string;
    review: string;
  }>;
}

export interface ConsumedHostOutcomePresentation {
  accepted: boolean;
  outcome: 'allow' | 'deny';
  closed_outcome: ClosedPresentationOutcome;
  reason: string;
  ui_digest: UiDigestDisplay;
  evidence_class: EvidenceClass;
  /** Echo of host dims only — never upgraded locally. */
  evidence: Readonly<Record<string, string>>;
  authority_decision_from_browser: false;
  default_consent: 'absent';
  host_decision_cid: string | null;
}

export interface EvidenceClassificationRecord {
  evidence_class: EvidenceClass;
  browser_authority_fields_stripped: true;
  default_consent: 'absent';
  authority_decision_sent: false;
  host_policy_duplicated_in_typescript: false;
  may_upgrade_evidence: false;
}

/**
 * Canonical JSON matching Python `json.dumps(..., sort_keys=True,
 * separators=(",", ":"), ensure_ascii=True)` for digest parity with FACP-029.
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

function opaqueRef(kind: 'actor' | 'session', raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') {
    return `${kind}:opaque:${contentDigest(raw).slice(0, 16)}`;
  }
  const lowered = raw.toLowerCase();
  for (const banned of [
    'sk-live',
    'secret',
    'password',
    'bearer ',
    '/home/',
    '/var/',
    'file://',
    'goose_secret',
  ]) {
    if (lowered.includes(banned)) {
      return `${kind}:redacted:${contentDigest(raw).slice(0, 16)}`;
    }
  }
  // Keep already-opaque operator refs; otherwise wrap.
  if (raw.startsWith('actor:') || raw.startsWith('session:') || raw.startsWith('operator:')) {
    return raw;
  }
  return `${kind}:${raw}`;
}

export function projectOpaqueIdentityRefs(
  fields: BrowserMediatedFields,
): OpaqueIdentityRefs {
  return {
    actor_ref: opaqueRef('actor', fields.actor_id ?? fields.actor_ref ?? null),
    session_ref: opaqueRef(
      'session',
      fields.session_id ?? fields.session_ref ?? null,
    ),
  };
}

function argumentsFromIntent(
  intent: BrowserDesktopInvocationIntent | BrowserMediatedFields,
): Record<string, unknown> {
  const args =
    (intent.arguments as Record<string, unknown> | undefined) ??
    (intent.payload as Record<string, unknown> | undefined) ??
    {};
  // Strip secrets / host paths from argument bag before digest/CID.
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (SECRET_OR_HOST_KEYS.has(key)) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

/**
 * Project a browser desktop intent into a canonical host admission request.
 * Browser sends no authority decision; default consent is absent.
 */
export function projectCanonicalHostRequest(
  intent: BrowserDesktopInvocationIntent,
  hostBindings: {
    host_policy_id?: string | null;
    admission_token_cid?: string | null;
    expiry?: string | null;
    nonce?: string | null;
  } = {},
): CanonicalHostRequest {
  const method = intent.method ?? 'tools/call';
  const resourceId = intent.resource_id ?? intent.binding_id;
  const args = argumentsFromIntent(intent);
  const identity = projectOpaqueIdentityRefs({
    actor_id: intent.actor_id,
    session_id: intent.session_id,
  });
  const mutates = Boolean(intent.mutates_remote_state ?? true);
  // dry_run remains intent: default true for governed actions (UX), but never
  // upgrades live qualification — host admission binds live vs dry-run.
  const dryRunIntent =
    intent.dry_run_intent !== undefined ? Boolean(intent.dry_run_intent) : mutates;

  return {
    schema: SCHEMA,
    task_id: TASK_ID,
    method,
    resource_id: resourceId,
    binding_id: intent.binding_id,
    actor_ref: identity.actor_ref,
    session_ref: identity.session_ref,
    method_cid: contentCid(method),
    resource_cid: contentCid(resourceId),
    argument_cid: contentCid(args),
    method_digest: contentDigest(method),
    resource_digest: contentDigest(resourceId),
    argument_digest: contentDigest(args),
    dry_run_intent: dryRunIntent,
    mutates_remote_state: mutates,
    correlation_id: intent.correlation_id ?? null,
    consent: 'absent',
    authority_decision: null,
    host_policy_id: hostBindings.host_policy_id ?? null,
    admission_token_cid: hostBindings.admission_token_cid ?? null,
    expiry: hostBindings.expiry ?? null,
    nonce: hostBindings.nonce ?? null,
  };
}

/** UI must display these exact method/resource/argument digests. */
export function projectUiDigestDisplay(
  request: CanonicalHostRequest,
): UiDigestDisplay {
  return {
    method: request.method,
    resource_id: request.resource_id,
    method_digest: request.method_digest,
    resource_digest: request.resource_digest,
    argument_digest: request.argument_digest,
    method_cid: request.method_cid,
    resource_cid: request.resource_cid,
    argument_cid: request.argument_cid,
    display_lines: [
      `method: ${request.method}`,
      `method_digest: ${request.method_digest}`,
      `resource: ${request.resource_id}`,
      `resource_digest: ${request.resource_digest}`,
      `argument_digest: ${request.argument_digest}`,
      `method_cid: ${request.method_cid}`,
      `resource_cid: ${request.resource_cid}`,
      `argument_cid: ${request.argument_cid}`,
    ],
  };
}

/**
 * Confirmation interaction projection: review intent only.
 * Presence of confirmation_token never grants consent.
 */
export function projectConfirmationRequest(
  intent: BrowserDesktopInvocationIntent,
): ConfirmationRequestProjection {
  const canonical = projectCanonicalHostRequest(intent);
  const hasReviewToken = Boolean(intent.confirmation_token);
  return {
    kind: 'confirmation_request',
    binding_id: intent.binding_id,
    resource_id: canonical.resource_id,
    method: canonical.method,
    argument_digest: canonical.argument_digest,
    argument_cid: canonical.argument_cid,
    consent: hasReviewToken ? 'review_intent' : 'absent',
    confirmation_intent: hasReviewToken,
    mutates_remote_state: canonical.mutates_remote_state,
    ui_digest: projectUiDigestDisplay(canonical),
    evidence_class: 'confirmation_intent',
  };
}

export function classifyBrowserProjectionEvidence(
  _intent?: BrowserDesktopInvocationIntent,
): EvidenceClassificationRecord {
  void _intent;
  return {
    evidence_class: 'presentation_only',
    browser_authority_fields_stripped: true,
    default_consent: 'absent',
    authority_decision_sent: false,
    host_policy_duplicated_in_typescript: false,
    may_upgrade_evidence: false,
  };
}

const WEAK_EVIDENCE: Readonly<Record<string, string>> = Object.freeze({
  origin: 'declared',
  authority: 'unchecked',
  policy: 'unchecked',
  effect: 'not_started',
  proof: 'none',
  freshness: 'stale',
  integrity: 'unchecked',
  environment: 'hermetic',
  review: 'unreviewed',
});

/**
 * Stronger dimension values that the browser must never invent when the host
 * did not supply them. Consuming a host outcome may only echo host dims.
 */
const UPGRADE_TARGETS = new Set([
  'authority:valid',
  'policy:allowed',
  'policy:allowed_with_obligations',
  'effect:observed',
  'proof:verified',
  'freshness:current',
  'environment:live',
  'integrity:digest_valid',
  'origin:observed',
]);

function isUpgradeAttempt(
  hostEvidence: HostIssuedTypedOutcome['evidence'] | undefined,
  localAttempt: Record<string, string> | undefined,
): boolean {
  if (!localAttempt) return false;
  for (const [dim, value] of Object.entries(localAttempt)) {
    const key = `${dim}:${value}`;
    if (!UPGRADE_TARGETS.has(key)) continue;
    const hostValue = hostEvidence?.[dim as keyof NonNullable<typeof hostEvidence>];
    if (hostValue !== value) return true;
  }
  return false;
}

/**
 * Consume a host-provided typed outcome for UI presentation.
 * Consumes host outcomes and never upgrades evidence beyond the host envelope;
 * never invents allow from browser consent/confirmation.
 */
export function consumeHostIssuedTypedOutcome(
  request: CanonicalHostRequest,
  hostOutcome: HostIssuedTypedOutcome | null | undefined,
  options: {
    /** Rejected if it would strengthen dims the host did not provide. */
    local_evidence_attempt?: Record<string, string>;
  } = {},
): ConsumedHostOutcomePresentation {
  const uiDigest = projectUiDigestDisplay(request);

  if (!hostOutcome) {
    return {
      accepted: false,
      outcome: 'deny',
      closed_outcome: 'Rejected',
      reason: 'host_admission_required',
      ui_digest: uiDigest,
      evidence_class: 'presentation_only',
      evidence: { ...WEAK_EVIDENCE },
      authority_decision_from_browser: false,
      default_consent: 'absent',
      host_decision_cid: null,
    };
  }

  // Bind host decision to the exact method/resource/argument digests.
  const digestMismatch =
    hostOutcome.bound_argument_digest !== request.argument_digest ||
    hostOutcome.bound_method_digest !== request.method_digest ||
    hostOutcome.bound_resource_digest !== request.resource_digest;

  if (digestMismatch) {
    return {
      accepted: false,
      outcome: 'deny',
      closed_outcome: 'Rejected',
      reason: 'host_outcome_digest_mismatch',
      ui_digest: uiDigest,
      evidence_class: 'presentation_only',
      evidence: { ...WEAK_EVIDENCE },
      authority_decision_from_browser: false,
      default_consent: 'absent',
      host_decision_cid: hostOutcome.decision_cid,
    };
  }

  if (
    isUpgradeAttempt(hostOutcome.evidence, options.local_evidence_attempt)
  ) {
    return {
      accepted: false,
      outcome: 'deny',
      closed_outcome: 'Rejected',
      reason: 'evidence_upgrade_forbidden',
      ui_digest: uiDigest,
      evidence_class: 'presentation_only',
      evidence: { ...WEAK_EVIDENCE },
      authority_decision_from_browser: false,
      default_consent: 'absent',
      host_decision_cid: hostOutcome.decision_cid,
    };
  }

  const evidence: Record<string, string> = { ...WEAK_EVIDENCE };
  if (hostOutcome.evidence) {
    for (const [dim, value] of Object.entries(hostOutcome.evidence)) {
      if (typeof value === 'string') evidence[dim] = value;
    }
  }
  // Echo host authority/policy from the typed outcome without inventing stronger dims.
  if (hostOutcome.authority === 'valid') evidence.authority = 'valid';
  else if (hostOutcome.authority === 'absent') evidence.authority = 'absent';
  if (hostOutcome.policy === 'allowed') evidence.policy = 'allowed';
  else if (hostOutcome.policy === 'denied') evidence.policy = 'denied';

  // Strict allow: host outcome allow + authority.valid + policy.allowed only.
  const acceptedAllow =
    hostOutcome.outcome === 'allow' &&
    hostOutcome.authority === 'valid' &&
    hostOutcome.policy === 'allowed';

  return {
    accepted: acceptedAllow,
    outcome: acceptedAllow ? 'allow' : 'deny',
    closed_outcome: acceptedAllow
      ? hostOutcome.closed_outcome === 'Attempted'
        ? 'Attempted'
        : hostOutcome.closed_outcome
      : 'Rejected',
    reason: acceptedAllow
      ? hostOutcome.reason
      : hostOutcome.reason || 'host_denied',
    ui_digest: uiDigest,
    evidence_class: 'host_issued',
    evidence,
    authority_decision_from_browser: false,
    default_consent: 'absent',
    host_decision_cid: hostOutcome.decision_cid,
  };
}

/**
 * Fail-closed host decision when only admission token / policy bindings are
 * known (mirrors FACP-029 projection; used when host has not yet returned a
 * full typed outcome envelope).
 */
export function projectHostDecisionFromBindings(
  request: CanonicalHostRequest,
): HostIssuedTypedOutcome {
  if (!request.admission_token_cid) {
    return {
      decision_cid: contentCid({
        reason: 'host_admission_required',
        argument_digest: request.argument_digest,
      }),
      outcome: 'deny',
      authority: 'absent',
      policy: 'unchecked',
      reason: 'host_admission_required',
      bound_method_digest: request.method_digest,
      bound_resource_digest: request.resource_digest,
      bound_argument_digest: request.argument_digest,
      bound_method_cid: request.method_cid,
      bound_resource_cid: request.resource_cid,
      bound_argument_cid: request.argument_cid,
      closed_outcome: 'Rejected',
    };
  }
  if (!request.host_policy_id) {
    return {
      decision_cid: contentCid({
        reason: 'host_policy_binding_required',
        argument_digest: request.argument_digest,
      }),
      outcome: 'deny',
      authority: 'absent',
      policy: 'unchecked',
      reason: 'host_policy_binding_required',
      bound_method_digest: request.method_digest,
      bound_resource_digest: request.resource_digest,
      bound_argument_digest: request.argument_digest,
      bound_method_cid: request.method_cid,
      bound_resource_cid: request.resource_cid,
      bound_argument_cid: request.argument_cid,
      closed_outcome: 'Rejected',
    };
  }
  return {
    decision_cid: contentCid({
      reason: 'host_issued_admission',
      admission_token_cid: request.admission_token_cid,
      host_policy_id: request.host_policy_id,
      argument_digest: request.argument_digest,
    }),
    outcome: 'allow',
    authority: 'valid',
    policy: 'allowed',
    reason: 'host_issued_admission',
    bound_method_digest: request.method_digest,
    bound_resource_digest: request.resource_digest,
    bound_argument_digest: request.argument_digest,
    bound_method_cid: request.method_cid,
    bound_resource_cid: request.resource_cid,
    bound_argument_cid: request.argument_cid,
    bound_nonce: request.nonce,
    bound_expiry: request.expiry,
    closed_outcome: 'Attempted',
    evidence: {
      authority: 'valid',
      policy: 'allowed',
      origin: 'declared',
      effect: 'not_started',
      proof: 'none',
      freshness: 'stale',
      integrity: 'unchecked',
      environment: 'hermetic',
      review: 'unreviewed',
    },
  };
}

/**
 * Strip browser authority fields from a mediated request bag before any host
 * wire encoding. Result never includes consent/allow/policy_decision.
 */
export function stripBrowserAuthorityFields(
  fields: BrowserMediatedFields,
): BrowserMediatedFields {
  const out: BrowserMediatedFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if ((BROWSER_AUTHORITY_FIELDS as readonly string[]).includes(key)) continue;
    if (SECRET_OR_HOST_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Migrated desktop invoke projection for the inventoried VirtualDesktopLiveGateway
 * seam. Replaces default-granted consent and local policy_decision construction.
 */
export function projectMigratedDesktopInvocation(
  intent: BrowserDesktopInvocationIntent,
  hostBindings: {
    host_policy_id?: string | null;
    admission_token_cid?: string | null;
    expiry?: string | null;
    nonce?: string | null;
  } = {},
): {
  canonical_request: CanonicalHostRequest;
  confirmation: ConfirmationRequestProjection;
  ui_digest: UiDigestDisplay;
  evidence: EvidenceClassificationRecord;
  wire_fields: BrowserMediatedFields;
  host_outcome: HostIssuedTypedOutcome;
  presentation: ConsumedHostOutcomePresentation;
  legacy_contrast: ReturnType<typeof legacyDesktopAuthoritySynthesis>;
} {
  const canonical = projectCanonicalHostRequest(intent, hostBindings);
  const confirmation = projectConfirmationRequest(intent);
  const uiDigest = projectUiDigestDisplay(canonical);
  const evidence = classifyBrowserProjectionEvidence(intent);
  const wireFields = stripBrowserAuthorityFields({
    binding_id: intent.binding_id,
    method: canonical.method,
    resource_id: canonical.resource_id,
    actor_ref: canonical.actor_ref,
    session_ref: canonical.session_ref,
    arguments: argumentsFromIntent(intent),
    argument_digest: canonical.argument_digest,
    argument_cid: canonical.argument_cid,
    method_digest: canonical.method_digest,
    resource_digest: canonical.resource_digest,
    dry_run_intent: canonical.dry_run_intent,
    mutates_remote_state: canonical.mutates_remote_state,
    correlation_id: canonical.correlation_id,
    // Explicitly omit consent / policy_decision / allow.
  });

  const hostOutcome = projectHostDecisionFromBindings(canonical);
  const presentation = consumeHostIssuedTypedOutcome(canonical, hostOutcome);

  return {
    canonical_request: canonical,
    confirmation,
    ui_digest: uiDigest,
    evidence,
    wire_fields: wireFields,
    host_outcome: hostOutcome,
    presentation,
    legacy_contrast: legacyDesktopAuthoritySynthesis(intent),
  };
}

/**
 * Legacy VirtualDesktopLiveGateway authority synthesis — failing seed only.
 * Must never be treated as accepted host-admission evidence.
 */
export function legacyDesktopAuthoritySynthesis(
  intent: BrowserDesktopInvocationIntent,
): Record<string, unknown> {
  const governed = Boolean(intent.mutates_remote_state ?? true);
  let consent = intent.consent as string | undefined;
  if (consent === undefined) {
    // Legacy SK-AUTH-001: governed ? 'granted' : 'not_required'
    consent = governed ? 'granted' : 'not_required';
  }
  const outcome = consent === 'denied' ? 'deny' : 'allow';
  return {
    consent,
    policy_decision: {
      decision_id: `desktop-policy:${intent.binding_id}`,
      outcome,
      reason: 'legacy_browser_constructed',
    },
    host_authorization_influenced_by_browser: true,
    accepted_evidence: false,
    disposition: 'failing_seed',
    evidence_class: 'failing_seed_legacy',
    seam: INVENTORIED_LIVE_GATEWAY_SEAM,
  };
}

/**
 * Assert the browser wire payload carries no authority decision and that
 * default consent remains absent.
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
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

/** Gateway facade for the migrated host-admission projection path. */
export class FormalAssuranceGateway {
  readonly schema = SCHEMA;
  readonly taskId = TASK_ID;
  readonly goalId = GOAL_ID;
  readonly bundle = BUNDLE;
  readonly inventoriedSeam = INVENTORIED_LIVE_GATEWAY_SEAM;

  project(intent: BrowserDesktopInvocationIntent, hostBindings = {}) {
    return projectMigratedDesktopInvocation(intent, hostBindings);
  }

  displayDigests(intent: BrowserDesktopInvocationIntent): UiDigestDisplay {
    return projectUiDigestDisplay(projectCanonicalHostRequest(intent));
  }

  consume(
    intent: BrowserDesktopInvocationIntent,
    hostOutcome: HostIssuedTypedOutcome | null,
    hostBindings = {},
  ): ConsumedHostOutcomePresentation {
    const request = projectCanonicalHostRequest(intent, hostBindings);
    return consumeHostIssuedTypedOutcome(request, hostOutcome);
  }
}

export function createFormalAssuranceGateway(): FormalAssuranceGateway {
  return new FormalAssuranceGateway();
}

// Touch canonicalDagJson so DAG-JSON encoding stays available for callers that
// need byte-identical blocks alongside digests/CIDs.
export { canonicalDagJson };
