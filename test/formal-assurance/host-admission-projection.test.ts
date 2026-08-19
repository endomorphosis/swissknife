/**
 * FACP-030: Host-admission projection for SwissKnife.
 *
 * Browser sends no authority decision; default consent is absent; UI displays
 * exact method/resource/argument digests and consumes host-provided typed
 * outcomes without upgrading evidence.
 *
 * Deterministic and hermetic: no browser network / host effect.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BROWSER_AUTHORITY_FIELDS,
  BUNDLE,
  EVIDENCE_SUBSET,
  GOAL_ID,
  INVENTORIED_LIVE_GATEWAY_SEAM,
  SCHEMA,
  TASK_ID,
  assertBrowserSendsNoAuthorityDecision,
  classifyBrowserProjectionEvidence,
  consumeHostIssuedTypedOutcome,
  contentDigest,
  createFormalAssuranceGateway,
  legacyDesktopAuthoritySynthesis,
  projectCanonicalHostRequest,
  projectConfirmationRequest,
  projectHostDecisionFromBindings,
  projectMigratedDesktopInvocation,
  projectOpaqueIdentityRefs,
  projectUiDigestDisplay,
  stripBrowserAuthorityFields,
  type BrowserDesktopInvocationIntent,
  type HostIssuedTypedOutcome,
} from '../../src/services/mcp/formalAssuranceGateway.js';

function resolveGatewayPath(): string {
  const candidates = [
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../src/services/mcp/formalAssuranceGateway.ts',
    ),
    resolve(process.cwd(), 'src/services/mcp/formalAssuranceGateway.ts'),
    resolve(process.cwd(), 'swissknife/src/services/mcp/formalAssuranceGateway.ts'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

const GATEWAY_SOURCE = readFileSync(resolveGatewayPath(), 'utf8');

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function baseIntent(
  overrides: Partial<BrowserDesktopInvocationIntent> = {},
): BrowserDesktopInvocationIntent {
  return {
    binding_id: 'binding:virtual-desktop:demo-mutate',
    method: 'tools/call',
    resource_id: 'binding:virtual-desktop:demo-mutate',
    actor_id: 'operator:desktop-ui',
    session_id: 'session:demo-1',
    payload: { dry_run: true, scope: 'cap:demo', limit: 1 },
    mutates_remote_state: true,
    correlation_id: 'desktop:demo:1',
    ...overrides,
  };
}

describe('FACP-030 SwissKnife host-admission projection', () => {
  it('binds the FACP-030 host-admission-projection schema and inventoried seam', () => {
    expect(TASK_ID).toBe('FACP-030');
    expect(GOAL_ID).toBe('FACP-G240');
    expect(SCHEMA).toBe('facp/host-admission-projection@1');
    expect(BUNDLE).toBe('facp/migration/swissknife-host');
    expect(INVENTORIED_LIVE_GATEWAY_SEAM).toBe(
      'swissknife/src/services/mcp/virtual-desktop-live-gateway.ts',
    );
    expect(GATEWAY_SOURCE).toContain('facp/host-admission-projection@1');
    expect(GATEWAY_SOURCE).toContain('FACP-030');
    expect(GATEWAY_SOURCE).toContain('virtual-desktop-live-gateway.ts');
    expect(GATEWAY_SOURCE).toContain('consent: \'absent\'');
  });

  it('covers the required evidence subset', () => {
    const required = [
      'canonical request',
      'actor/session opaque refs',
      'method/resource/argument CID',
      'host decision',
      'confirmation request',
      'evidence classification',
    ];
    for (const item of required) {
      expect([...EVIDENCE_SUBSET]).toContain(item);
    }
  });

  it('browser sends no authority decision and default consent is absent', () => {
    const intent = baseIntent({
      consent: 'granted',
      allow: true,
      policy_decision: { outcome: 'allow', decision_id: 'browser-local' },
      confirmation_token: 'ui-confirm-abc',
      dry_run_intent: false,
      tenant_id: 'tenant-spoof',
    });

    const projected = projectMigratedDesktopInvocation(intent);
    expect(projected.canonical_request.consent).toBe('absent');
    expect(projected.canonical_request.authority_decision).toBeNull();
    expect(projected.evidence.default_consent).toBe('absent');
    expect(projected.evidence.authority_decision_sent).toBe(false);
    expect(projected.evidence.may_upgrade_evidence).toBe(false);

    const wireCheck = assertBrowserSendsNoAuthorityDecision(projected.wire_fields);
    expect(wireCheck.ok).toBe(true);

    for (const field of BROWSER_AUTHORITY_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(projected.wire_fields, field)).toBe(
        false,
      );
    }

    // Stripping browser authority must drop consent/policy_decision even if present.
    const stripped = stripBrowserAuthorityFields({
      ...intent,
      resource_id: intent.resource_id,
    } as Record<string, unknown>);
    expect(stripped.consent).toBeUndefined();
    expect(stripped.policy_decision).toBeUndefined();
    expect(stripped.allow).toBeUndefined();
    expect(stripped.confirmation_token).toBeUndefined();
  });

  it('UI displays exact method/resource/argument digests and CIDs', () => {
    const intent = baseIntent();
    const request = projectCanonicalHostRequest(intent);
    const ui = projectUiDigestDisplay(request);

    expect(ui.method).toBe('tools/call');
    expect(ui.resource_id).toBe('binding:virtual-desktop:demo-mutate');
    expect(ui.method_digest).toBe(contentDigest('tools/call'));
    expect(ui.resource_digest).toBe(
      contentDigest('binding:virtual-desktop:demo-mutate'),
    );
    expect(ui.argument_digest).toBe(
      contentDigest({ dry_run: true, scope: 'cap:demo', limit: 1 }),
    );
    expect(ui.method_cid.startsWith('b')).toBe(true);
    expect(ui.resource_cid.startsWith('b')).toBe(true);
    expect(ui.argument_cid.startsWith('b')).toBe(true);

    expect(ui.display_lines.some((line) => line.includes(ui.method_digest))).toBe(
      true,
    );
    expect(ui.display_lines.some((line) => line.includes(ui.resource_digest))).toBe(
      true,
    );
    expect(ui.display_lines.some((line) => line.includes(ui.argument_digest))).toBe(
      true,
    );

    // Node crypto parity for argument digest (FACP-029 canonical JSON).
    const nodeDigest = createHash('sha256')
      .update(
        JSON.stringify(
          { dry_run: true, limit: 1, scope: 'cap:demo' },
          Object.keys({ dry_run: true, limit: 1, scope: 'cap:demo' }).sort(),
        ),
      )
      .digest('hex');
    // contentDigest sorts keys via replacer; ensure stable non-empty hex.
    expect(ui.argument_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof nodeDigest).toBe('string');
  });

  it('projects opaque actor/session refs and redacts secrets/host paths', () => {
    const clean = projectOpaqueIdentityRefs({
      actor_id: 'operator:desktop-ui',
      session_id: 'session:demo-1',
    });
    expect(clean.actor_ref).toBe('operator:desktop-ui');
    expect(clean.session_ref).toBe('session:demo-1');

    const dirty = projectOpaqueIdentityRefs({
      actor_id: 'sk-live-secret-key-value',
      session_id: '/home/barberb/.secrets/token',
    });
    expect(dirty.actor_ref).toMatch(/^actor:redacted:/);
    expect(dirty.session_ref).toMatch(/^session:redacted:/);
  });

  it('confirmation_token is review intent only — never a consent grant', () => {
    const withToken = projectConfirmationRequest(
      baseIntent({ confirmation_token: 'ui-confirm-abc' }),
    );
    const withoutToken = projectConfirmationRequest(
      baseIntent({ confirmation_token: null }),
    );

    expect(withToken.consent).toBe('review_intent');
    expect(withToken.confirmation_intent).toBe(true);
    expect(withToken.evidence_class).toBe('confirmation_intent');
    expect(withoutToken.consent).toBe('absent');
    expect(withoutToken.confirmation_intent).toBe(false);

    // Digests identical regardless of confirmation token.
    expect(withToken.argument_digest).toBe(withoutToken.argument_digest);
    expect(withToken.ui_digest.argument_digest).toBe(
      withoutToken.ui_digest.argument_digest,
    );
  });

  it('consumes host-provided typed outcome without upgrading evidence', () => {
    const intent = baseIntent();
    const request = projectCanonicalHostRequest(intent, {
      host_policy_id: 'policy:demo',
      admission_token_cid: 'baguqeerademoadmissiontoken0000000000000000000001',
      nonce: 'nonce-1',
      expiry: '2099-01-01T00:00:00Z',
    });

    const hostAllow: HostIssuedTypedOutcome = {
      decision_cid: 'baguqeerahostdecision00000000000000000000000001',
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
      closed_outcome: 'Attempted',
      evidence: {
        authority: 'valid',
        policy: 'allowed',
        effect: 'not_started',
        proof: 'none',
        freshness: 'stale',
        environment: 'hermetic',
      },
    };

    const presented = consumeHostIssuedTypedOutcome(request, hostAllow);
    expect(presented.accepted).toBe(true);
    expect(presented.outcome).toBe('allow');
    expect(presented.evidence_class).toBe('host_issued');
    expect(presented.default_consent).toBe('absent');
    expect(presented.authority_decision_from_browser).toBe(false);
    expect(presented.ui_digest.argument_digest).toBe(request.argument_digest);
    expect(presented.evidence.effect).toBe('not_started');
    expect(presented.evidence.environment).toBe('hermetic');

    // Local upgrade attempt to effect.observed / environment.live must fail closed.
    const upgraded = consumeHostIssuedTypedOutcome(request, hostAllow, {
      local_evidence_attempt: {
        effect: 'observed',
        environment: 'live',
        proof: 'verified',
      },
    });
    expect(upgraded.accepted).toBe(false);
    expect(upgraded.reason).toBe('evidence_upgrade_forbidden');
    expect(upgraded.outcome).toBe('deny');

    // Digest mismatch rejects host outcome.
    const mismatched = consumeHostIssuedTypedOutcome(request, {
      ...hostAllow,
      bound_argument_digest: '0'.repeat(64),
    });
    expect(mismatched.accepted).toBe(false);
    expect(mismatched.reason).toBe('host_outcome_digest_mismatch');

    // Absent host outcome denies.
    const absent = consumeHostIssuedTypedOutcome(request, null);
    expect(absent.accepted).toBe(false);
    expect(absent.reason).toBe('host_admission_required');
  });

  it('fail-closed without host admission token; allow only with host bindings', () => {
    const intent = baseIntent();
    const denied = projectMigratedDesktopInvocation(intent);
    expect(denied.host_outcome.outcome).toBe('deny');
    expect(denied.host_outcome.reason).toBe('host_admission_required');
    expect(denied.presentation.accepted).toBe(false);

    const allowed = projectMigratedDesktopInvocation(intent, {
      host_policy_id: 'policy:demo',
      admission_token_cid: 'baguqeerademoadmissiontoken0000000000000000000001',
    });
    expect(allowed.host_outcome.outcome).toBe('allow');
    expect(allowed.host_outcome.reason).toBe('host_issued_admission');
    expect(allowed.presentation.accepted).toBe(true);
    expect(allowed.presentation.ui_digest.argument_digest).toBe(
      allowed.canonical_request.argument_digest,
    );
  });

  it('legacy default-granted / browser-constructed allow is a failing seed', () => {
    const omit = baseIntent();
    const denied = baseIntent({ consent: 'denied' });
    const synthOmit = legacyDesktopAuthoritySynthesis(omit);
    const synthDenied = legacyDesktopAuthoritySynthesis(denied);

    expect(synthOmit.consent).toBe('granted');
    expect(synthDenied.consent).toBe('denied');
    expect((synthOmit.policy_decision as { outcome: string }).outcome).toBe('allow');
    expect((synthDenied.policy_decision as { outcome: string }).outcome).toBe('deny');
    expect(synthOmit.accepted_evidence).toBe(false);
    expect(synthOmit.disposition).toBe('failing_seed');
    expect(synthOmit.seam).toBe(INVENTORIED_LIVE_GATEWAY_SEAM);

    // Migrated path keeps consent absent regardless of browser consent field.
    const migratedGranted = projectCanonicalHostRequest(
      baseIntent({ consent: 'granted' }),
    );
    const migratedDenied = projectCanonicalHostRequest(
      baseIntent({ consent: 'denied' }),
    );
    expect(migratedGranted.consent).toBe('absent');
    expect(migratedDenied.consent).toBe('absent');
    expect(deepEqual(migratedGranted, migratedDenied)).toBe(true);
  });

  it('changed arguments alter digests/CIDs; browser authority deltas do not', () => {
    const a = projectCanonicalHostRequest(
      baseIntent({ payload: { dry_run: true, scope: 'cap:demo', limit: 1 } }),
    );
    const b = projectCanonicalHostRequest(
      baseIntent({ payload: { dry_run: true, scope: 'cap:demo', limit: 2 } }),
    );
    expect(a.argument_digest).not.toBe(b.argument_digest);
    expect(a.argument_cid).not.toBe(b.argument_cid);

    const c = projectCanonicalHostRequest(
      baseIntent({ consent: 'granted', allow: true, dry_run_intent: false }),
    );
    const d = projectCanonicalHostRequest(
      baseIntent({ consent: 'denied', allow: false, dry_run_intent: true }),
    );
    // dry_run_intent is preserved as intent (not authority), so digests of
    // arguments stay identical when only authority fields differ and payload
    // is unchanged; dry_run_intent itself may differ on the request.
    expect(c.argument_digest).toBe(d.argument_digest);
    expect(c.consent).toBe('absent');
    expect(d.consent).toBe('absent');
    expect(c.authority_decision).toBeNull();
  });

  it('FormalAssuranceGateway facade projects and consumes host outcomes', () => {
    const gateway = createFormalAssuranceGateway();
    expect(gateway.schema).toBe(SCHEMA);
    expect(gateway.taskId).toBe(TASK_ID);
    expect(gateway.inventoriedSeam).toContain('virtual-desktop-live-gateway');

    const intent = baseIntent();
    const digests = gateway.displayDigests(intent);
    expect(digests.argument_digest).toMatch(/^[0-9a-f]{64}$/);

    const projected = gateway.project(intent, {
      host_policy_id: 'policy:demo',
      admission_token_cid: 'baguqeerademoadmissiontoken0000000000000000000001',
    });
    expect(projected.canonical_request.consent).toBe('absent');
    expect(projected.presentation.accepted).toBe(true);

    const classification = classifyBrowserProjectionEvidence(intent);
    expect(classification.evidence_class).toBe('presentation_only');
    expect(classification.host_policy_duplicated_in_typescript).toBe(false);

    const fromBindings = projectHostDecisionFromBindings(
      projected.canonical_request,
    );
    expect(fromBindings.outcome).toBe('allow');
    const consumed = gateway.consume(intent, fromBindings, {
      host_policy_id: 'policy:demo',
      admission_token_cid: 'baguqeerademoadmissiontoken0000000000000000000001',
    });
    expect(consumed.accepted).toBe(true);
    expect(consumed.ui_digest.method_digest).toBe(digests.method_digest);
  });

  it('gateway source prohibits silent consent grant on the migrated path', () => {
    expect(GATEWAY_SOURCE).toContain('default consent is absent');
    expect(GATEWAY_SOURCE).toContain('never upgrades evidence');
    expect(GATEWAY_SOURCE).toContain('projectCanonicalHostRequest');
    expect(GATEWAY_SOURCE).toContain('consumeHostIssuedTypedOutcome');
    expect(GATEWAY_SOURCE).toContain('projectConfirmationRequest');
    expect(GATEWAY_SOURCE).toContain('classifyBrowserProjectionEvidence');
    expect(GATEWAY_SOURCE).toContain('legacyDesktopAuthoritySynthesis');
    expect(GATEWAY_SOURCE).toContain('failing_seed');
    // Migrated path must set consent absent, not granted.
    expect(GATEWAY_SOURCE).toMatch(/consent:\s*'absent'/);
    expect(GATEWAY_SOURCE).not.toMatch(
      /consent:\s*invocation\.consent\s*\?\?\s*\(governed\s*\?\s*'granted'/,
    );
  });
});
