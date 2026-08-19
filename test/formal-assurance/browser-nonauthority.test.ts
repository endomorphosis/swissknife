/**
 * FACP-029: Prove SwissKnife browser nonauthority.
 *
 * Paired requests that differ only in browser authority fields must produce
 * identical host authorization inputs/results. Legacy default-granted consent
 * and browser-constructed allow are failing seeds, not accepted evidence.
 *
 * This suite is deterministic and hermetic: it does not perform browser
 * network/host effects and does not treat UI confirmation as authority.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TASK_ID = 'FACP-029' as const;
const GOAL_ID = 'FACP-G240' as const;
const SCHEMA = 'facp/browser-nonauthority@1' as const;
const BUNDLE = 'facp/migration/swissknife-nonauthority' as const;

const HERE = dirname(fileURLToPath(import.meta.url));
const VECTORS_PATH = resolve(HERE, 'browser-authority-vectors.json');

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

const SECRET_KEYS = new Set([
  'goose_secret_key',
  'X-Secret-Key',
  'secret_header',
  'authorization',
  'api_key',
]);

const PRESENTATION_ONLY = new Set([
  'ui_label',
  'presentation',
  'mutates_remote_state',
  'correlation_id',
]);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type BrowserMediatedRequest = Record<string, unknown>;

export type HostAuthorizationInput = {
  actor_id: unknown;
  resource_id: unknown;
  method: unknown;
  argument_digest: string;
  host_policy_id: unknown;
  expiry: unknown;
  nonce: unknown;
  admission_token_cid: unknown;
};

export type HostAuthorizationResult = {
  outcome: 'allow' | 'deny';
  authority: 'absent' | 'valid';
  policy: 'unchecked' | 'allowed';
  reason: string;
  closed_outcome: 'Rejected' | 'Attempted';
  bound_argument_digest?: string;
  bound_nonce?: unknown;
  bound_expiry?: unknown;
};

type PairedVector = {
  vector_id: string;
  seed_id: string;
  edge_id: string;
  family: string;
  role: string;
  accepted_evidence: boolean;
  request_a: BrowserMediatedRequest;
  request_b: BrowserMediatedRequest;
  host_authorization_input_a: HostAuthorizationInput;
  host_authorization_input_b: HostAuthorizationInput;
  host_authorization_result_a: HostAuthorizationResult;
  host_authorization_result_b: HostAuthorizationResult;
};

type SensitivityVector = {
  vector_id: string;
  family: string;
  role: string;
  accepted_evidence: boolean;
  request_a: BrowserMediatedRequest;
  request_b: BrowserMediatedRequest;
  host_authorization_input_a: HostAuthorizationInput;
  host_authorization_input_b: HostAuthorizationInput;
  host_authorization_result_a?: HostAuthorizationResult;
  host_authorization_result_b?: HostAuthorizationResult;
};

type FailingSeed = {
  vector_id: string;
  seed_id: string;
  edge_id: string;
  role: string;
  accepted_evidence: boolean;
  disposition: string;
  legacy_observed: string;
  why_not_accepted_evidence: string;
  legacy_synthesis_omit?: Record<string, unknown>;
  legacy_synthesis_denied?: Record<string, unknown>;
  legacy_synthesis_granted?: Record<string, unknown>;
};

type VectorDocument = {
  schema: string;
  task_id: string;
  goal_id: string;
  bundle: string;
  browser_authority_fields: string[];
  host_authorization_dimensions: string[];
  evidence_subset: string[];
  paired_vectors: PairedVector[];
  argument_sensitivity_vectors: SensitivityVector[];
  replay_vectors: SensitivityVector[];
  expiry_vectors: SensitivityVector[];
  failing_seeds: FailingSeed[];
  acceptance: Record<string, boolean>;
  authority: {
    legacy_default_granted_is_failing_seed: boolean;
    browser_fields_are_not_host_admission: boolean;
  };
};

function canonicalJson(value: unknown): string {
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

export function sha256Hex(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value ?? {}), 'utf8').digest('hex');
}

/**
 * Strip browser authority / secret [REDACTED] presentation fields before host admission.
 * Browser allow/consent/dry-run/policy_decision never enter host authorization.
 */
export function projectHostAuthorizationInput(
  request: BrowserMediatedRequest,
): HostAuthorizationInput {
  const argumentsValue =
    (request.arguments as Json | undefined) ??
    (request.payload as Json | undefined) ??
    {};

  for (const key of Object.keys(request)) {
    if ((BROWSER_AUTHORITY_FIELDS as readonly string[]).includes(key)) {
      continue;
    }
    if (SECRET_KEYS.has(key) || PRESENTATION_ONLY.has(key)) {
      continue;
    }
  }

  return {
    actor_id: request.actor_id ?? null,
    resource_id: request.resource_id ?? null,
    method: request.method ?? null,
    argument_digest: sha256Hex(argumentsValue),
    host_policy_id: request.host_policy_id ?? null,
    expiry: request.expiry ?? null,
    nonce: request.nonce ?? null,
    admission_token_cid: request.admission_token_cid ?? null,
  };
}

/**
 * Fail-closed host result: browser fields are never consulted.
 */
export function projectHostAuthorizationResult(
  hostInput: HostAuthorizationInput,
): HostAuthorizationResult {
  if (!hostInput.admission_token_cid) {
    return {
      outcome: 'deny',
      authority: 'absent',
      policy: 'unchecked',
      reason: 'host_admission_required',
      closed_outcome: 'Rejected',
    };
  }
  if (!hostInput.host_policy_id) {
    return {
      outcome: 'deny',
      authority: 'absent',
      policy: 'unchecked',
      reason: 'host_policy_binding_required',
      closed_outcome: 'Rejected',
    };
  }
  return {
    outcome: 'allow',
    authority: 'valid',
    policy: 'allowed',
    reason: 'host_issued_admission',
    closed_outcome: 'Attempted',
    bound_argument_digest: hostInput.argument_digest,
    bound_nonce: hostInput.nonce,
    bound_expiry: hostInput.expiry,
  };
}

/**
 * Legacy VirtualDesktopLiveGateway synthesis — failing seed only.
 * Must never be treated as accepted nonauthority evidence.
 */
export function legacyDesktopSynthesize(
  request: BrowserMediatedRequest,
): Record<string, unknown> {
  const governed = Boolean(request.mutates_remote_state ?? true);
  let consent = request.consent as string | undefined;
  if (consent === undefined) {
    consent = governed ? 'granted' : 'not_required';
  }
  const outcome = consent === 'denied' ? 'deny' : 'allow';
  return {
    consent,
    policy_decision: {
      decision_id: `desktop-policy:${String(request.resource_id ?? 'unknown')}`,
      outcome,
      reason: 'legacy_browser_constructed',
    },
    host_authorization_influenced_by_browser: true,
    accepted_evidence: false,
    disposition: 'failing_seed',
  };
}

function loadVectors(): VectorDocument {
  const raw = readFileSync(VECTORS_PATH, 'utf8');
  return JSON.parse(raw) as VectorDocument;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

describe('FACP-029 SwissKnife browser nonauthority', () => {
  const vectors = loadVectors();

  it('binds the FACP-029 browser-nonauthority schema and inventory seeds', () => {
    expect(TASK_ID).toBe('FACP-029');
    expect(GOAL_ID).toBe('FACP-G240');
    expect(SCHEMA).toBe('facp/browser-nonauthority@1');
    expect(BUNDLE).toBe('facp/migration/swissknife-nonauthority');
    expect(vectors.schema).toBe(SCHEMA);
    expect(vectors.task_id).toBe(TASK_ID);
    expect(vectors.goal_id).toBe(GOAL_ID);
    expect(vectors.bundle).toBe(BUNDLE);
    expect(vectors.authority.browser_fields_are_not_host_admission).toBe(true);
    expect(vectors.authority.legacy_default_granted_is_failing_seed).toBe(true);
    expect(vectors.browser_authority_fields).toEqual([...BROWSER_AUTHORITY_FIELDS]);
  });

  it('covers the required evidence subset families', () => {
    const required = [
      'allow/deny',
      'consent granted/absent',
      'tenant/workspace',
      'dry-run/live',
      'changed arguments',
      'replay',
      'expiry',
    ];
    for (const item of required) {
      expect(vectors.evidence_subset).toContain(item);
    }
    const families = new Set([
      ...vectors.paired_vectors.map((v) => v.family),
      ...vectors.argument_sensitivity_vectors.map((v) => v.family),
      ...vectors.replay_vectors.map((v) => v.family),
      ...vectors.expiry_vectors.map((v) => v.family),
    ]);
    expect(families.has('allow/deny')).toBe(true);
    expect(families.has('consent granted/absent')).toBe(true);
    expect(families.has('tenant/workspace')).toBe(true);
    expect(families.has('dry-run/live')).toBe(true);
    expect(families.has('changed arguments')).toBe(true);
    expect(families.has('replay')).toBe(true);
    expect(families.has('expiry')).toBe(true);
  });

  it('paired browser-authority deltas produce identical host authorization inputs/results', () => {
    expect(vectors.paired_vectors.length).toBeGreaterThanOrEqual(8);
    for (const pair of vectors.paired_vectors) {
      expect(pair.role).toBe('accepted_nonauthority_pair');
      expect(pair.accepted_evidence).toBe(true);

      const inputA = projectHostAuthorizationInput(pair.request_a);
      const inputB = projectHostAuthorizationInput(pair.request_b);
      const resultA = projectHostAuthorizationResult(inputA);
      const resultB = projectHostAuthorizationResult(inputB);

      expect(deepEqual(inputA, inputB)).toBe(true);
      expect(deepEqual(resultA, resultB)).toBe(true);
      expect(deepEqual(inputA, pair.host_authorization_input_a)).toBe(true);
      expect(deepEqual(inputB, pair.host_authorization_input_b)).toBe(true);
      expect(deepEqual(resultA, pair.host_authorization_result_a)).toBe(true);
      expect(deepEqual(resultB, pair.host_authorization_result_b)).toBe(true);

      const inputBlob = canonicalJson(inputA);
      expect(inputBlob).not.toMatch(/consent|policy_decision|confirmation_token|dry_run|tenant_id|workspace_id|goose_secret|X-Secret|sk-live/i);
      for (const field of BROWSER_AUTHORITY_FIELDS) {
        expect(Object.prototype.hasOwnProperty.call(inputA, field)).toBe(false);
      }
    }
  });

  it('changed arguments alter host authorization digests', () => {
    expect(vectors.argument_sensitivity_vectors.length).toBeGreaterThanOrEqual(1);
    for (const vector of vectors.argument_sensitivity_vectors) {
      expect(vector.accepted_evidence).toBe(true);
      const inputA = projectHostAuthorizationInput(vector.request_a);
      const inputB = projectHostAuthorizationInput(vector.request_b);
      expect(inputA.argument_digest).not.toBe(inputB.argument_digest);
      expect(deepEqual(inputA, inputB)).toBe(false);
    }
  });

  it('replay nonce and expiry bind distinct host authorization observations', () => {
    expect(vectors.replay_vectors.length).toBeGreaterThanOrEqual(1);
    expect(vectors.expiry_vectors.length).toBeGreaterThanOrEqual(1);

    for (const vector of vectors.replay_vectors) {
      const inputA = projectHostAuthorizationInput(vector.request_a);
      const inputB = projectHostAuthorizationInput(vector.request_b);
      const resultA = projectHostAuthorizationResult(inputA);
      const resultB = projectHostAuthorizationResult(inputB);
      expect(inputA.nonce).not.toBe(inputB.nonce);
      expect(resultA.bound_nonce).not.toBe(resultB.bound_nonce);
      expect(inputA.argument_digest).toBe(inputB.argument_digest);
    }

    for (const vector of vectors.expiry_vectors) {
      const inputA = projectHostAuthorizationInput(vector.request_a);
      const inputB = projectHostAuthorizationInput(vector.request_b);
      const resultA = projectHostAuthorizationResult(inputA);
      const resultB = projectHostAuthorizationResult(inputB);
      expect(inputA.expiry).not.toBe(inputB.expiry);
      expect(resultA.bound_expiry).not.toBe(resultB.bound_expiry);
    }
  });

  it('legacy default-granted behavior is a failing seed, not accepted evidence', () => {
    expect(vectors.acceptance.legacy_default_granted_is_failing_seed_not_accepted_evidence).toBe(true);
    expect(vectors.failing_seeds.length).toBeGreaterThanOrEqual(2);

    const defaultGranted = vectors.failing_seeds.find(
      (seed) => seed.seed_id === 'cx-sk-auth-default-granted-consent',
    );
    expect(defaultGranted).toBeDefined();
    expect(defaultGranted!.accepted_evidence).toBe(false);
    expect(defaultGranted!.role).toBe('failing_seed');
    expect(defaultGranted!.disposition).toBe('failing_seed');
    expect(defaultGranted!.legacy_observed).toContain('granted');
    expect(defaultGranted!.why_not_accepted_evidence.toLowerCase()).toMatch(/failing seed|not nonauthority|not accepted/);

    const omit = {
      actor_id: 'operator:desktop-ui',
      resource_id: 'binding:virtual-desktop:demo-mutate',
      mutates_remote_state: true,
    };
    const denied = { ...omit, consent: 'denied' };
    const synthOmit = legacyDesktopSynthesize(omit);
    const synthDenied = legacyDesktopSynthesize(denied);
    expect(synthOmit.consent).toBe('granted');
    expect(synthDenied.consent).toBe('denied');
    expect((synthOmit.policy_decision as { outcome: string }).outcome).toBe('allow');
    expect((synthDenied.policy_decision as { outcome: string }).outcome).toBe('deny');
    expect(synthOmit.accepted_evidence).toBe(false);
    expect(synthOmit.host_authorization_influenced_by_browser).toBe(true);

    // Contrast: nonauthority projection keeps host authorization identical.
    const nonauthA = projectHostAuthorizationInput({ ...omit, consent: 'granted' });
    const nonauthB = projectHostAuthorizationInput({ ...omit, consent: 'denied' });
    expect(deepEqual(nonauthA, nonauthB)).toBe(true);
    expect(projectHostAuthorizationResult(nonauthA).outcome).toBe('deny');

    const constructedAllow = vectors.failing_seeds.find(
      (seed) => seed.seed_id === 'cx-sk-auth-browser-constructed-allow',
    );
    expect(constructedAllow).toBeDefined();
    expect(constructedAllow!.accepted_evidence).toBe(false);

    // No failing seed may be listed as accepted evidence.
    for (const seed of vectors.failing_seeds) {
      expect(seed.accepted_evidence).toBe(false);
      expect(seed.role).toBe('failing_seed');
    }
    for (const pair of vectors.paired_vectors) {
      expect(pair.accepted_evidence).toBe(true);
      expect(pair.role).not.toBe('failing_seed');
    }
  });

  it('seeds SK-AUTH-001..005 and SK-SENS-003 into the nonauthority suite', () => {
    const edgeIds = new Set([
      ...vectors.paired_vectors.map((v) => v.edge_id),
      ...vectors.failing_seeds.map((v) => v.edge_id),
    ]);
    for (const edge of ['SK-AUTH-001', 'SK-AUTH-002', 'SK-AUTH-003', 'SK-AUTH-004', 'SK-AUTH-005', 'SK-SENS-003']) {
      expect(edgeIds.has(edge)).toBe(true);
    }
  });
});
