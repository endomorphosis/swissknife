/**
 * VGO-040 — baseline identity and objective-evaluator tests.
 *
 * Evidence subset:
 * - Metric normalization vectors
 * - Hard-gate precedence cases
 * - Deterministic-baseline identity tests
 *
 * Acceptance:
 * - Acceptance requires invariant preservation and declared measurable improvement
 * - Pixel change alone is neutral
 * - Unknown critical evidence prevents auto-accept
 * - Identical inputs produce identical baseline identity
 */

// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  DOMAIN_UI_BASELINE,
  OBJECTIVE_METRIC_IDS,
  UI_BASELINE_COMPILER_VERSION,
  UI_BASELINE_EXTRACTOR_VERSION,
  UI_BASELINE_INTERFACE,
  UI_BASELINE_SCHEMA,
  compileUiBaseline,
  createUiBaselineCompiler,
  decodeUiBaseline,
  describeMetric,
  emptyMetricSnapshot,
  makeUiMetricSnapshot,
  metricClassification,
  metricPolarity,
  rehashUiBaselineIdentity,
  uiBaselineDigest,
  uiBaselineIdentity,
  uiBaselineToDict,
  uiMetricSnapshotDigest,
} from '../../../../src/services/gui-optimizer/baseline.js';
import {
  ACCEPTANCE_DECISIONS,
  GUI_OBJECTIVE_EVALUATOR_INTERFACE,
  GUI_OBJECTIVE_EVALUATOR_VERSION,
  collectObjectiveMetrics,
  createGuiObjectiveEvaluator,
  decodeUiAcceptanceDecision,
  decodeUiMetricDelta,
  evaluateObjective,
  makeUiMetricDelta,
  metricDirection,
  uiAcceptanceDecisionIdentity,
} from '../../../../src/services/gui-optimizer/evaluator.js';
import {
  parseCidV1,
  rehashIdentity,
} from '../../../../src/services/gui-optimizer/identity.js';

const APP = 'app:agent-supervisor';
const SCREEN = 'screen:agent-supervisor';
const REVISION = 'deadbeefcafebabe';
const SCENARIOS = Object.freeze([
  'scenario:initial-load',
  'scenario:keyboard-only',
]);
const ARTIFACT_A = `sha256:${'ab'.repeat(32)}`;
const ARTIFACT_B = `sha256:${'cd'.repeat(32)}`;

function passingAuthority() {
  return {
    evidence_level: 'automated' as const,
    analysis_classification: 'exact' as const,
    verification_status: 'verified' as const,
  };
}

function accessibilityReceipt(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    scenario_id: 'scenario:initial-load',
    violation_count: 2,
    violation_ids: ['a11y:name-1', 'a11y:name-2'],
    automated_pass_count: 4,
    keyboard_result: 'satisfied',
    ...passingAuthority(),
    ...overrides,
  };
}

function interactionReceipt(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    scenario_id: 'scenario:keyboard-only',
    step_ids: ['step:tab-1', 'step:activate'],
    unresolved_observation_ids: [],
    confirmation_id: '',
    ...passingAuthority(),
    ...overrides,
  };
}

function constraintReceipt(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    check_ids: ['inv:focus-restore', 'inv:unique-id'],
    statuses: ['satisfied', 'satisfied'],
    violated_check_ids: [],
    unsupported_check_ids: [],
    ...passingAuthority(),
    ...overrides,
  };
}

function policyReport(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    acceptance_outcome: 'allow_automatic',
    automatic_acceptance_blocked: false,
    reason_codes: ['allowed'],
    violations: [],
    ...overrides,
  };
}

function visualReceipt(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    scenario_id: 'scenario:viewport-desktop',
    decision: 'pass',
    pixel_diff_percent: 0,
    structural_diff_percent: 0,
    unexpected_layout_shift_count: 0,
    missing_control_count: 0,
    extra_control_count: 0,
    screenshot_width: 1280,
    screenshot_height: 800,
    requires_human_review: false,
    ...passingAuthority(),
    ...overrides,
  };
}

function completeEvidence(
  overrides: Partial<{
    accessibility_receipts: unknown[];
    visual_receipts: unknown[];
    interaction_receipts: unknown[];
    constraint_receipts: unknown[];
    policy_reports: unknown[];
    heuristic_scores: unknown[];
    metric_overrides: Record<string, number>;
  }> = {},
) {
  return {
    accessibility_receipts: [accessibilityReceipt({ violation_count: 0, violation_ids: [] })],
    visual_receipts: [visualReceipt()],
    interaction_receipts: [interactionReceipt()],
    constraint_receipts: [constraintReceipt()],
    policy_reports: [policyReport()],
    ...overrides,
  };
}

function evaluate(
  overrides: {
    objective_id?: 'accessibility_violation_count' | 'pixel_diff_percent';
    baseline_metrics?: ReturnType<typeof makeUiMetricSnapshot>;
    candidate_metrics?: ReturnType<typeof makeUiMetricSnapshot>;
    evidence?: Parameters<typeof completeEvidence>[0];
  } = {},
) {
  return evaluateObjective({
    application_id: APP,
    screen_id: SCREEN,
    repository_revision: REVISION,
    objective_id: overrides.objective_id ?? 'accessibility_violation_count',
    scenario_ids: SCENARIOS,
    baseline_metrics:
      overrides.baseline_metrics ??
      makeUiMetricSnapshot({ accessibility_violation_count: 2 }),
    candidate_metrics:
      overrides.candidate_metrics ??
      makeUiMetricSnapshot({ accessibility_violation_count: 0 }),
    artifact_digests: [ARTIFACT_A],
    ...completeEvidence(overrides.evidence),
  });
}

describe('objective metric catalog', () => {
  it('classifies pixel change as neutral and hard gates as hard', () => {
    expect(OBJECTIVE_METRIC_IDS).toContain('pixel_diff_percent');
    expect(metricPolarity('pixel_diff_percent')).toBe('neutral');
    expect(metricClassification('pixel_diff_percent')).toBe('neutral');
    expect(metricPolarity('accessibility_violation_count')).toBe('lower_is_better');
    expect(metricClassification('accessibility_violation_count')).toBe('hard');
    expect(describeMetric('accessibility_violation_count').hard_gate_family).toBe(
      'accessibility',
    );
    expect(describeMetric('policy_violation_count').hard_gate_family).toBe('policy');
    expect(describeMetric('security_violation_count').hard_gate_family).toBe(
      'security',
    );
    expect(describeMetric('invariant_violation_count').hard_gate_family).toBe(
      'invariant',
    );
    expect(metricPolarity('automated_pass_count')).toBe('higher_is_better');
    expect(metricDirection('pixel_diff_percent', 0, 12)).toBe('neutral');
    expect(metricDirection('accessibility_violation_count', 3, 1)).toBe('improved');
    expect(metricDirection('accessibility_violation_count', 1, 3)).toBe('regressed');
    expect(metricDirection('automated_pass_count', 2, 5)).toBe('improved');
  });

  it('normalizes missing metric keys to zero and rejects unknown metrics', () => {
    const snapshot = makeUiMetricSnapshot({ accessibility_violation_count: 4 });
    expect(snapshot.metrics.accessibility_violation_count).toBe(4);
    expect(snapshot.metrics.pixel_diff_percent).toBe(0);
    expect(snapshot.metrics.invariant_violation_count).toBe(0);
    expect(Object.keys(snapshot.metrics)).toEqual([...OBJECTIVE_METRIC_IDS]);
    expect(() => makeUiMetricSnapshot({ not_a_metric: 1 } as never)).toThrow(
      /unknown objective metric/,
    );
    expect(() =>
      makeUiMetricSnapshot({ pixel_diff_percent: 140 }),
    ).toThrow(/0\.\.100/);
  });
});

describe('deterministic baseline identity', () => {
  it('identical inputs produce identical baseline identity and digest', () => {
    const metrics = makeUiMetricSnapshot({
      accessibility_violation_count: 2,
      automated_pass_count: 4,
    });
    const first = compileUiBaseline({
      application_id: APP,
      screen_id: SCREEN,
      repository_revision: REVISION,
      scenario_ids: SCENARIOS,
      metrics,
      artifact_digests: [ARTIFACT_A, ARTIFACT_B],
    });
    const second = compileUiBaseline({
      application_id: APP,
      screen_id: SCREEN,
      repository_revision: REVISION,
      scenario_ids: SCENARIOS,
      metrics,
      artifact_digests: [ARTIFACT_A, ARTIFACT_B],
    });
    expect(first.baseline.interface).toBe(UI_BASELINE_INTERFACE);
    expect(first.baseline.schema_version).toBe(UI_BASELINE_SCHEMA);
    expect(first.baseline.extractor_version).toBe(UI_BASELINE_EXTRACTOR_VERSION);
    expect(first.compiler_version).toBe(UI_BASELINE_COMPILER_VERSION);
    expect(first.baseline.baseline_id).toBe(second.baseline.baseline_id);
    expect(first.baseline.metric_digest).toBe(second.baseline.metric_digest);
    expect(first.baseline.metric_digest).toBe(uiMetricSnapshotDigest(metrics));
    expect(first.baseline_identity.digest).toBe(second.baseline_identity.digest);
    expect(first.baseline_identity.cid).toBe(second.baseline_identity.cid);
    expect(first.baseline_identity.domain).toBe(DOMAIN_UI_BASELINE);
    expect(uiBaselineDigest(first.baseline)).toBe(first.baseline_identity.digest);
    expect(rehashUiBaselineIdentity(first.baseline_identity)).toEqual(
      first.baseline_identity,
    );
    expect(rehashIdentity(first.baseline_identity).cid).toBe(
      first.baseline_identity.cid,
    );
    expect(parseCidV1(first.baseline_identity.cid).digest_label).toBe(
      first.baseline_identity.digest,
    );
    expect(createUiBaselineCompiler().compile({
      application_id: APP,
      screen_id: SCREEN,
      repository_revision: REVISION,
      scenario_ids: SCENARIOS,
      metrics,
      artifact_digests: [ARTIFACT_A, ARTIFACT_B],
    }).baseline_identity.digest).toBe(first.baseline_identity.digest);
  });

  it('changes identity when revision, scenarios, metrics, or artifacts change', () => {
    const metrics = makeUiMetricSnapshot({ accessibility_violation_count: 2 });
    const original = compileUiBaseline({
      application_id: APP,
      screen_id: SCREEN,
      repository_revision: REVISION,
      scenario_ids: SCENARIOS,
      metrics,
      artifact_digests: [ARTIFACT_A],
    });
    const revision = compileUiBaseline({
      application_id: APP,
      screen_id: SCREEN,
      repository_revision: 'cafebabedeadbeef',
      scenario_ids: SCENARIOS,
      metrics,
      artifact_digests: [ARTIFACT_A],
    });
    const scenarios = compileUiBaseline({
      application_id: APP,
      screen_id: SCREEN,
      repository_revision: REVISION,
      scenario_ids: ['scenario:initial-load'],
      metrics,
      artifact_digests: [ARTIFACT_A],
    });
    const metricChange = compileUiBaseline({
      application_id: APP,
      screen_id: SCREEN,
      repository_revision: REVISION,
      scenario_ids: SCENARIOS,
      metrics: makeUiMetricSnapshot({ accessibility_violation_count: 1 }),
      artifact_digests: [ARTIFACT_A],
    });
    const artifacts = compileUiBaseline({
      application_id: APP,
      screen_id: SCREEN,
      repository_revision: REVISION,
      scenario_ids: SCENARIOS,
      metrics,
      artifact_digests: [ARTIFACT_B],
    });
    expect(revision.baseline_identity.digest).not.toBe(
      original.baseline_identity.digest,
    );
    expect(scenarios.baseline_identity.digest).not.toBe(
      original.baseline_identity.digest,
    );
    expect(metricChange.baseline_identity.digest).not.toBe(
      original.baseline_identity.digest,
    );
    expect(artifacts.baseline_identity.digest).not.toBe(
      original.baseline_identity.digest,
    );
  });

  it('rejects unknown fields, empty scenarios, and duplicate ids', () => {
    expect(() =>
      decodeUiBaseline({
        ...uiBaselineToDict(
          compileUiBaseline({
            application_id: APP,
            screen_id: SCREEN,
            repository_revision: REVISION,
            scenario_ids: SCENARIOS,
            metrics: emptyMetricSnapshot(),
          }).baseline,
        ),
        extra: true,
      }),
    ).toThrow(/unknown UiBaseline field/);
    expect(() =>
      compileUiBaseline({
        application_id: APP,
        screen_id: SCREEN,
        repository_revision: REVISION,
        scenario_ids: [],
        metrics: emptyMetricSnapshot(),
      }),
    ).toThrow(/scenario_ids must not be empty/);
    expect(() =>
      compileUiBaseline({
        application_id: APP,
        screen_id: SCREEN,
        repository_revision: REVISION,
        scenario_ids: ['scenario:a', 'scenario:a'],
        metrics: emptyMetricSnapshot(),
      }),
    ).toThrow(/duplicates/);
  });
});

describe('metric collection from typed evidence', () => {
  it('sums counts and takes the worst percent across receipts', () => {
    const snapshot = collectObjectiveMetrics({
      accessibility_receipts: [
        accessibilityReceipt(),
        accessibilityReceipt({
          scenario_id: 'scenario:keyboard-only',
          violation_count: 1,
          violation_ids: ['a11y:contrast'],
          automated_pass_count: 3,
          keyboard_result: 'violated',
        }),
      ],
      visual_receipts: [
        visualReceipt({ pixel_diff_percent: 1.5, screenshot_width: 390 }),
        visualReceipt({
          pixel_diff_percent: 4.25,
          structural_diff_percent: 2,
          unexpected_layout_shift_count: 1,
          missing_control_count: 1,
          extra_control_count: 2,
          screenshot_width: 1600,
          screenshot_height: 1000,
        }),
      ],
      interaction_receipts: [
        interactionReceipt(),
        interactionReceipt({
          step_ids: ['step:submit'],
          unresolved_observation_ids: ['obs:missing-focus'],
        }),
      ],
      constraint_receipts: [
        constraintReceipt({
          check_ids: ['inv:a', 'inv:b'],
          statuses: ['violated', 'unsupported'],
          violated_check_ids: ['inv:a'],
          unsupported_check_ids: ['inv:b'],
        }),
      ],
      policy_reports: [
        policyReport({
          acceptance_outcome: 'block_automatic',
          automatic_acceptance_blocked: true,
          reason_codes: [
            'dispatchable_prohibited_action',
            'confirmation_binding_mismatch',
          ],
          violations: [{ code: 'dispatchable_prohibited_action', blocks_automatic_acceptance: true }],
        }),
      ],
    });
    expect(snapshot.metrics.accessibility_violation_count).toBe(3);
    expect(snapshot.metrics.automated_pass_count).toBe(7);
    expect(snapshot.metrics.keyboard_unreachable_count).toBe(1);
    expect(snapshot.metrics.pixel_diff_percent).toBe(4.25);
    expect(snapshot.metrics.structural_diff_percent).toBe(2);
    expect(snapshot.metrics.unexpected_layout_shift_count).toBe(1);
    expect(snapshot.metrics.missing_control_count).toBe(1);
    expect(snapshot.metrics.extra_control_count).toBe(2);
    expect(snapshot.metrics.screenshot_width).toBe(1600);
    expect(snapshot.metrics.screenshot_height).toBe(1000);
    expect(snapshot.metrics.interaction_step_count).toBe(3);
    expect(snapshot.metrics.unresolved_observation_count).toBe(1);
    expect(snapshot.metrics.invariant_violation_count).toBe(1);
    expect(snapshot.metrics.unsupported_check_count).toBe(1);
    expect(snapshot.metrics.policy_violation_count).toBe(1);
    expect(snapshot.metrics.security_violation_count).toBe(1);
    expect(snapshot.metrics.confirmation_failure_count).toBe(1);
  });
});

describe('acceptance requires invariants and measurable improvement', () => {
  it('accepts when invariants hold and the declared objective improves', () => {
    const result = evaluate();
    expect(result.evaluator_interface).toBe(GUI_OBJECTIVE_EVALUATOR_INTERFACE);
    expect(result.evaluator_version).toBe(GUI_OBJECTIVE_EVALUATOR_VERSION);
    expect(result.decision.decision).toBe('accept');
    expect(result.decision.invariants_preserved).toBe(true);
    expect(result.decision.measurable_improvement).toBe(true);
    expect(result.decision.hard_gate_regression).toBe(false);
    expect(result.decision.unknown_critical_evidence).toBe(false);
    expect(result.objective_delta.direction).toBe('improved');
    expect(result.decision.blocking_reason_codes).toContain('accepted');
    expect(result.decision_identity.digest).toBe(
      uiAcceptanceDecisionIdentity(result.decision).digest,
    );
    expect(
      createGuiObjectiveEvaluator().evaluate({
        application_id: APP,
        screen_id: SCREEN,
        repository_revision: REVISION,
        objective_id: 'accessibility_violation_count',
        scenario_ids: SCENARIOS,
        baseline_metrics: makeUiMetricSnapshot({
          accessibility_violation_count: 2,
        }),
        candidate_metrics: makeUiMetricSnapshot({
          accessibility_violation_count: 0,
        }),
        ...completeEvidence(),
      }).decision.decision,
    ).toBe('accept');
  });

  it('rejects when the declared objective does not improve', () => {
    const result = evaluate({
      candidate_metrics: makeUiMetricSnapshot({
        accessibility_violation_count: 2,
      }),
    });
    expect(result.decision.decision).toBe('reject');
    expect(result.decision.measurable_improvement).toBe(false);
    expect(result.decision.blocking_reason_codes).toContain(
      'no_measurable_improvement',
    );
  });

  it('rejects invariant regression even when the objective improves', () => {
    const result = evaluate({
      candidate_metrics: makeUiMetricSnapshot({
        accessibility_violation_count: 0,
        invariant_violation_count: 1,
      }),
    });
    expect(result.decision.decision).toBe('reject');
    expect(result.decision.invariants_preserved).toBe(false);
    expect(result.decision.hard_gate_regression).toBe(true);
    expect(result.decision.measurable_improvement).toBe(true);
    expect(result.decision.blocking_reason_codes).toContain('invariants_violated');
  });
});

describe('hard-gate precedence over aesthetic scores', () => {
  it.each([
    ['accessibility_violation_count', 'accessibility_regression'],
    ['policy_violation_count', 'policy_regression'],
    ['security_violation_count', 'security_regression'],
    ['missing_control_count', 'functional_regression'],
    ['confirmation_failure_count', 'confirmation_regression'],
  ] as const)(
    'rejects a %s regression even when heuristic scores improve',
    (metric, reason) => {
      const baseline = makeUiMetricSnapshot({
        accessibility_violation_count: 2,
        [metric]: metric === 'accessibility_violation_count' ? 2 : 0,
      });
      const result = evaluate({
        objective_id: 'accessibility_violation_count',
        baseline_metrics: baseline,
        candidate_metrics: makeUiMetricSnapshot({
          accessibility_violation_count:
            metric === 'accessibility_violation_count' ? 3 : 0,
          [metric]: metric === 'accessibility_violation_count' ? 3 : 1,
        }),
        evidence: {
          heuristic_scores: [
            {
              axis: 'polish',
              value: 0.9,
              evidence_level: 'heuristic',
              notes: 'looks nicer',
            },
            {
              axis: 'primary_action_prominence',
              value: 0.8,
              evidence_level: 'human_reviewed',
              notes: 'reviewer prefers the new hierarchy',
            },
          ],
        },
      });
      expect(ACCEPTANCE_DECISIONS).toContain(result.decision.decision);
      expect(result.decision.decision).toBe('reject');
      expect(result.decision.hard_gate_regression).toBe(true);
      expect(result.decision.heuristic_override_attempted).toBe(true);
      expect(result.decision.blocking_reason_codes).toContain(reason);
      expect(result.decision.blocking_reason_codes).toContain(
        'heuristic_cannot_override',
      );
      expect(result.decision.blocking_reason_codes).toContain(
        'aesthetic_gain_ignored',
      );
      expect(result.heuristic_scores[0]?.evidence_level).toBe('heuristic');
      expect(result.heuristic_scores[1]?.evidence_level).toBe('human_reviewed');
    },
  );
});

describe('pixel change is a neutral observation', () => {
  it('does not accept a pixel-only change as measurable improvement', () => {
    const result = evaluate({
      objective_id: 'pixel_diff_percent',
      baseline_metrics: makeUiMetricSnapshot({ pixel_diff_percent: 0 }),
      candidate_metrics: makeUiMetricSnapshot({ pixel_diff_percent: 8.5 }),
    });
    expect(result.objective_delta.direction).toBe('neutral');
    expect(result.objective_delta.classification).toBe('neutral');
    expect(result.decision.measurable_improvement).toBe(false);
    expect(result.decision.pixel_change_alone).toBe(true);
    expect(result.decision.decision).toBe('reject');
    expect(result.decision.blocking_reason_codes).toContain('pixel_change_only');
    expect(result.decision.blocking_reason_codes).toContain('pixel_change_neutral');
    expect(result.decision.hard_gate_regression).toBe(false);
  });

  it('still accepts when a hard objective improves beside a pixel change', () => {
    const result = evaluate({
      baseline_metrics: makeUiMetricSnapshot({
        accessibility_violation_count: 2,
        pixel_diff_percent: 0,
      }),
      candidate_metrics: makeUiMetricSnapshot({
        accessibility_violation_count: 0,
        pixel_diff_percent: 12,
      }),
    });
    expect(result.decision.decision).toBe('accept');
    expect(result.decision.pixel_change_alone).toBe(false);
    expect(
      result.metric_deltas.find(item => item.metric_id === 'pixel_diff_percent')
        ?.direction,
    ).toBe('neutral');
  });
});

describe('unknown critical evidence prevents auto-accept', () => {
  it('sends missing required receipts to human review, not accept', () => {
    const result = evaluateObjective({
      application_id: APP,
      screen_id: SCREEN,
      repository_revision: REVISION,
      objective_id: 'accessibility_violation_count',
      scenario_ids: SCENARIOS,
      baseline_metrics: makeUiMetricSnapshot({
        accessibility_violation_count: 2,
      }),
      candidate_metrics: makeUiMetricSnapshot({
        accessibility_violation_count: 0,
      }),
    });
    expect(result.decision.decision).toBe('human-review');
    expect(result.decision.unknown_critical_evidence).toBe(true);
    expect(result.decision.blocking_reason_codes).toEqual(
      expect.arrayContaining([
        'unknown_critical_evidence',
        'missing_accessibility_receipt',
        'missing_interaction_receipt',
        'missing_constraint_receipt',
        'missing_policy_report',
      ]),
    );
  });

  it('treats simulated or unverified critical receipts as unknown', () => {
    const simulated = evaluate({
      evidence: {
        accessibility_receipts: [
          accessibilityReceipt({
            violation_count: 0,
            violation_ids: [],
            evidence_level: 'simulated',
            verification_status: 'simulated',
          }),
        ],
      },
    });
    expect(simulated.decision.decision).toBe('human-review');
    expect(simulated.decision.unknown_critical_evidence).toBe(true);
    expect(simulated.decision.blocking_reason_codes).toContain(
      'simulated_critical_evidence',
    );

    const unverified = evaluate({
      evidence: {
        interaction_receipts: [
          interactionReceipt({ verification_status: 'unverified' }),
        ],
      },
    });
    expect(unverified.decision.decision).toBe('human-review');
    expect(unverified.decision.blocking_reason_codes).toContain(
      'unverified_critical_evidence',
    );
  });

  it('does not let unknown evidence hide a hard-gate reject', () => {
    const result = evaluate({
      candidate_metrics: makeUiMetricSnapshot({
        accessibility_violation_count: 0,
        security_violation_count: 1,
      }),
      evidence: {
        accessibility_receipts: [],
      },
    });
    expect(result.decision.decision).toBe('reject');
    expect(result.decision.hard_gate_regression).toBe(true);
    expect(result.decision.unknown_critical_evidence).toBe(true);
    expect(result.decision.blocking_reason_codes).toContain('security_regression');
  });
});

describe('closed decision and delta records', () => {
  it('rejects unknown fields on UiMetricDelta and UiAcceptanceDecision', () => {
    const delta = makeUiMetricDelta('accessibility_violation_count', 2, 1);
    expect(delta.interface).toBe('UiMetricDelta@1');
    expect(() =>
      decodeUiMetricDelta({ ...delta, extra: true }),
    ).toThrow(/unknown UiMetricDelta field/);
    const decision = evaluate().decision;
    expect(() =>
      decodeUiAcceptanceDecision({ ...decision, extra: true }),
    ).toThrow(/unknown UiAcceptanceDecision field/);
  });
});
