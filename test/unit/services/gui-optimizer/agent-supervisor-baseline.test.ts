/**
 * VGO-062 — Agent Supervisor semantic baseline.
 *
 * Acceptance:
 * - Baseline identifies swissknife/web/js/apps/agent-supervisor.js as live target
 * - Distinguishes canonical/legacy surfaces
 * - Contains no unearned verified claims
 * - Identical on deterministic rerun
 */

// @vitest-environment node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { CANONICAL_JSON_PROFILE } from '../../../../src/services/gui-optimizer/models.js';
import {
  AGENT_SUPERVISOR_APPLICATION_ID,
  AGENT_SUPERVISOR_SCREEN_ID,
} from '../../../../src/services/gui-optimizer/scenario-catalog.js';
import {
  AGENT_SUPERVISOR_LIVE_TARGET_PATH,
  AGENT_SUPERVISOR_SEMANTIC_BASELINE_EVIDENCE_PATH,
  AGENT_SUPERVISOR_TARGET_INTERFACE,
  AGENT_SUPERVISOR_TARGET_SCHEMA,
  AGENT_SUPERVISOR_TARGET_VERSION,
  CANONICAL_SURFACES,
  LEGACY_SURFACES,
  UI_SEMANTIC_BASELINE_INTERFACE,
  UI_SEMANTIC_BASELINE_SCHEMA,
  assertNoUnearnedVerifiedClaims,
  collectUnearnedVerifiedClaims,
  createAgentSupervisorTarget,
  recordAgentSupervisorSemanticBaseline,
  resolveRepositoryRoot,
  semanticBaselineEvidenceView,
  serializeAgentSupervisorSemanticBaselineEvidence,
  serializeUiSemanticBaseline,
  uiSemanticBaselineIdentity,
  uiSemanticBaselineToDict,
} from '../../../../src/services/gui-optimizer/targets/agent-supervisor.js';

function repositoryRoot(): string {
  return resolveRepositoryRoot(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../../',
    ),
  );
}

describe('AgentSupervisorTarget@1 / UiSemanticBaseline@1 (VGO-062)', () => {
  const root = repositoryRoot();
  const evidencePath = join(root, AGENT_SUPERVISOR_SEMANTIC_BASELINE_EVIDENCE_PATH);
  let first: ReturnType<typeof recordAgentSupervisorSemanticBaseline>;
  let second: ReturnType<typeof recordAgentSupervisorSemanticBaseline>;
  let firstJson: string;
  let secondJson: string;

  beforeAll(() => {
    first = recordAgentSupervisorSemanticBaseline({ repositoryRoot: root });
    second = recordAgentSupervisorSemanticBaseline({ repositoryRoot: root });
    firstJson = serializeUiSemanticBaseline(first);
    secondJson = serializeUiSemanticBaseline(second);
  }, 120_000);

  it('exports the closed target and baseline interfaces', () => {
    const target = createAgentSupervisorTarget();
    expect(target.interface).toBe(AGENT_SUPERVISOR_TARGET_INTERFACE);
    expect(target.schema_version).toBe(AGENT_SUPERVISOR_TARGET_SCHEMA);
    expect(target.extractorVersion).toBe(AGENT_SUPERVISOR_TARGET_VERSION);
    expect(target.liveTargetPath).toBe(AGENT_SUPERVISOR_LIVE_TARGET_PATH);
    expect(first.interface).toBe(UI_SEMANTIC_BASELINE_INTERFACE);
    expect(first.schema_version).toBe(UI_SEMANTIC_BASELINE_SCHEMA);
    expect(first.extractor_interface).toBe(AGENT_SUPERVISOR_TARGET_INTERFACE);
    expect(first.canonical_json_profile).toBe(CANONICAL_JSON_PROFILE);
    expect(first.task_id).toBe('VGO-062');
  }, 120_000);

  it('identifies swissknife/web/js/apps/agent-supervisor.js as the live target', () => {
    expect(first.live_target.path).toBe(
      'swissknife/web/js/apps/agent-supervisor.js',
    );
    expect(first.live_target.authority).toBe('live_target');
    expect(first.live_target.role).toBe('live_implementation');
    expect(first.live_target.exists).toBe(true);
    expect(first.live_target.kind).toBe('file');
    expect(first.live_target.scanned).toBe(true);
    expect(first.live_target.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.scan_receipt.sources).toEqual([
      'swissknife/web/js/apps/agent-supervisor.js',
    ]);
    expect(existsSync(join(root, AGENT_SUPERVISOR_LIVE_TARGET_PATH))).toBe(true);
  }, 120_000);

  it('distinguishes canonical and legacy surfaces without rewriting them', () => {
    const byPath = new Map(first.surfaces.map(entry => [entry.path, entry]));
    for (const surface of CANONICAL_SURFACES) {
      const entry = byPath.get(surface.path);
      expect(entry, surface.path).toBeDefined();
      expect(entry?.authority).toBe(surface.authority);
      expect(entry?.role).toBe(surface.role);
      expect(['canonical', 'live_target', 'runtime_projection', 'supporting', 'test', 'contract']).toContain(
        entry?.authority,
      );
    }
    for (const surface of LEGACY_SURFACES) {
      const entry = byPath.get(surface.path);
      expect(entry, surface.path).toBeDefined();
      expect(['legacy', 'not_authorization_authority']).toContain(entry?.authority);
    }
    expect(byPath.get('swissknife/web/legacy-archive')?.authority).toBe('legacy');
    expect(
      byPath.get('swissknife/src/services/mcp/virtual-desktop-live-gateway.ts')
        ?.authority,
    ).toBe('not_authorization_authority');
    expect(first.registration_divergence.silently_selected_one).toBe(false);
    expect(first.registration_divergence.canonical_manifest_path).toBe(
      'swissknife/src/services/apps/virtual-desktop-app-manifest.ts',
    );
    expect(first.registration_divergence.runtime_projection_path).toBe(
      'swissknife/web/js/main-simple.js',
    );
    expect(first.registration_divergence.counts_derived_from_source).toBe(true);
    expect(
      first.registration_divergence.canonical_application_definition_count,
    ).toBeGreaterThan(0);
    expect(
      first.registration_divergence.runtime_registration_count,
    ).toBeGreaterThan(0);
    expect(byPath.get('swissknife/src/services/apps/app-capability-policy.ts')?.role).toBe(
      'policy_source',
    );
    expect(
      byPath.get('swissknife/scripts/run-virtual-desktop-app-improvement.mjs')?.role,
    ).toBe('screenshot_workflow');
  }, 120_000);

  it('records identities, graph/state statistics, dependencies, and revision', () => {
    expect(first.application_identity.application_id).toBe(
      AGENT_SUPERVISOR_APPLICATION_ID,
    );
    expect(first.screen_identity.screen_id).toBe(AGENT_SUPERVISOR_SCREEN_ID);
    expect(first.component_identities.length).toBeGreaterThan(0);
    expect(
      first.component_identities.some(
        identity => identity.qualified_name === 'AgentSupervisorConsole',
      ),
    ).toBe(true);
    expect(first.scan_receipt.finding_count).toBeGreaterThan(0);
    expect(first.scan_receipt.executed_code).toBe(false);
    expect(first.graph_receipt.accepted_vgo_002_task_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.graph_receipt.node_count).toBeGreaterThan(0);
    expect(first.graph_receipt.executed_code).toBe(false);
    expect(first.state_receipt.executed_code).toBe(false);
    expect(first.dependencies.sources).toContain(AGENT_SUPERVISOR_LIVE_TARGET_PATH);
    expect(first.dependencies.tests.length).toBeGreaterThan(0);
    expect(first.dependencies.actions.length).toBeGreaterThan(0);
    expect(first.dependencies.styles.length).toBeGreaterThan(0);
    expect(first.repository_revision).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.completeness_boundary).toMatch(
      /^(complete_within_boundary|partial|best_effort|unknown)$/,
    );
    expect(first.unresolved_dynamics).toEqual(
      [...first.unresolved_dynamics].sort((a, b) => a.localeCompare(b)),
    );
    expect(first.known_pre_change_failures.map(item => item.code)).toEqual(
      expect.arrayContaining([
        'outerhtml-root-replace-focus-risk',
        'aria-disabled-instead-of-native-disabled',
        'missing-field-error-association',
        'console-spec-not-discovered-by-reviewed-playwright-config',
        'existing-accessibility-coverage-is-not-live-dom-audit',
        'existing-screenshots-are-not-pixel-diff-baseline',
        'static-confirmation-is-not-argument-digest-bound',
        'python-ui-invariant-engine-not-invoked',
      ]),
    );
    expect(
      first.known_pre_change_failures.every(item => item.live_confirmed === false),
    ).toBe(true);
  }, 120_000);

  it('contains no unearned verified claims', () => {
    expect(first.verification_status).toBe('unverified');
    expect(first.scan_receipt.verification_status).not.toBe('verified');
    expect(first.graph_receipt.verification_status).not.toBe('verified');
    expect(first.capsule_receipt.verification_status).not.toBe('verified');
    expect(first.claim_boundary.verified_live_accessibility).toBe(false);
    expect(first.claim_boundary.verified_live_visual).toBe(false);
    expect(first.claim_boundary.verified_live_interaction).toBe(false);
    expect(first.claim_boundary.verified_authorization).toBe(false);
    expect(first.claim_boundary.verified_wcag).toBe(false);
    expect(first.claim_boundary.verified_complete_security).toBe(false);
    expect(first.claim_boundary.ui_visibility_authorizes).toBe(false);
    expect(first.claim_boundary.browser_policy_authoritative).toBe(false);
    expect(first.claim_boundary.executed_code).toBe(false);
    expect(first.policy_receipt.automatic_acceptance_blocked).toBe(true);
    expect(first.policy_receipt.ui_visibility_authorizes).toBe(false);
    expect(first.invalidation_receipt.interface).toBe('UiInvalidationPlan@1');
    expect(first.invalidation_receipt.executed_code).toBe(false);
    expect(first.invalidation_receipt.verification_status).toBe('unverified');
    expect(first.invalidation_receipt.affected_check_ids.length).toBeGreaterThan(0);
    expect(first.evaluator_receipt.interface).toBe('GuiObjectiveEvaluator@1');
    expect(first.evaluator_receipt.decision).not.toBe('accept');
    expect(first.evaluator_receipt.unknown_critical_evidence).toBe(true);
    expect(first.evaluator_receipt.automatic_acceptance_blocked).toBe(true);
    expect(first.evaluator_receipt.verification_status).toBe('unverified');
    expect(first.invariant_receipt.interface).toBe('UiInvariantEngine@1');
    expect(first.invariant_receipt.invoked).toBe(false);
    expect(first.invariant_receipt.solver_claimed_available).toBe(false);
    expect(first.invariant_receipt.capability_gap).toBe(
      'python-ui-invariant-engine-not-invoked-from-static-target',
    );
    expect(first.unmeasured_live_metrics).toEqual(
      expect.arrayContaining([
        'accessibility_violation_count',
        'pixel_diff_percent',
        'confirmation_failure_count',
      ]),
    );
    expect(collectUnearnedVerifiedClaims(uiSemanticBaselineToDict(first))).toEqual(
      [],
    );
    expect(() => assertNoUnearnedVerifiedClaims(uiSemanticBaselineToDict(first))).not.toThrow();
  }, 120_000);

  it('is identical on deterministic rerun and matches committed evidence', () => {
    expect(secondJson).toBe(firstJson);
    expect(second.baseline_digest).toBe(first.baseline_digest);
    expect(second.baseline_cid).toBe(first.baseline_cid);
    expect(second.repository_revision).toBe(first.repository_revision);
    const recomputed = uiSemanticBaselineIdentity(first);
    expect(recomputed.digest).toBe(first.baseline_digest);
    expect(recomputed.cid).toBe(first.baseline_cid);
    expect(existsSync(evidencePath)).toBe(true);
    const committed = readFileSync(evidencePath, 'utf8');
    expect(JSON.parse(committed)).toEqual(semanticBaselineEvidenceView(first));
    expect(serializeAgentSupervisorSemanticBaselineEvidence(second)).toBe(
      serializeAgentSupervisorSemanticBaselineEvidence(first),
    );
    const parsed = JSON.parse(committed) as {
      live_target: { path: string };
      verification_status: string;
      executed_code: boolean;
      evaluator_receipt: { unknown_critical_evidence: boolean };
      invalidation_receipt: { executed_code: boolean };
      invariant_receipt: { invoked: boolean; solver_claimed_available: boolean };
      registration_divergence: { counts_derived_from_source: boolean };
    };
    expect(parsed.live_target.path).toBe(AGENT_SUPERVISOR_LIVE_TARGET_PATH);
    expect(parsed.verification_status).toBe('unverified');
    expect(parsed.executed_code).toBe(false);
    expect(parsed.evaluator_receipt.unknown_critical_evidence).toBe(true);
    expect(parsed.invalidation_receipt.executed_code).toBe(false);
    expect(parsed.invariant_receipt.invoked).toBe(false);
    expect(parsed.invariant_receipt.solver_claimed_available).toBe(false);
    expect(parsed.registration_divergence.counts_derived_from_source).toBe(true);
  }, 120_000);
});
