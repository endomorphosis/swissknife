/**
 * VGO-012 — standalone GUI semantic capsules.
 *
 * Acceptance:
 * - all required fields are present and bounded
 * - evidence levels stay distinct (analysis vs verification)
 * - opaque/stale data cannot be reported verified
 * - capsule bytes are deterministic for identical findings
 * - source-to-capsule traceability is retained
 */

// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  GUI_SOURCE_FINDING_INTERFACE,
  GUI_SOURCE_FINDING_SCHEMA,
  GUI_STATIC_EXTRACTOR_VERSION,
  GUI_STATIC_SCANNER_INTERFACE,
  GUI_STATIC_SCAN_RESULT_SCHEMA,
  UI_COMPONENT_IDENTITY_INTERFACE,
  UI_COMPONENT_IDENTITY_SCHEMA,
  UI_COMPONENT_VERSION_INTERFACE,
  UI_COMPONENT_VERSION_SCHEMA,
  makeSourceSpan,
  type GuiSourceFinding,
  type GuiStaticScanResult,
} from '../../../../src/services/gui-optimizer/models.js';
import {
  buildStableIdentity,
  compileComponentVersion,
} from '../../../../src/services/gui-optimizer/identity.js';
import {
  LEGACY_CAPSULE_FIELDS,
  MAX_COLLECTION_ITEMS,
  MAX_STRING_CHARS,
  UI_ANALYSIS_CLASSIFICATIONS,
  UI_CAPSULE_COMPILER_INTERFACE,
  UI_CAPSULE_COMPILER_SCHEMA,
  UI_CAPSULE_COMPILER_VERSION,
  UI_COMPLETENESS_BOUNDARIES,
  UI_COMPLETENESS_BOUNDARY_INTERFACE,
  UI_SEMANTIC_CAPSULE_INTERFACE,
  UI_SEMANTIC_CAPSULE_SCHEMA,
  UI_VERIFICATION_STATUSES,
  assertCapsuleEvidenceDistinct,
  capsuleBytes,
  capsuleDigest,
  compileUiSemanticCapsuleFromFacts,
  compileUiSemanticCapsuleFromScan,
  compileUiSemanticCapsuleWithTrace,
  createUiCapsuleCompiler,
  decodeUiSemanticCapsule,
  isVerifiedAllowed,
  makeUiSemanticCapsule,
  resolveCapsuleVerificationStatus,
  serializeUiSemanticCapsule,
  uiSemanticCapsuleToDict,
  type UiSemanticCapsule,
} from '../../../../src/services/gui-optimizer/ui-capsule.js';

const APP = 'app:agent-supervisor';
const SCREEN = 'screen:agent-supervisor';
const PKG = 'org.hallucinate.swissknife.gui-optimizer';

function finding(
  partial: Partial<GuiSourceFinding> &
    Pick<GuiSourceFinding, 'finding_id' | 'kind' | 'name' | 'stable_identity'>,
): GuiSourceFinding {
  const path = partial.path ?? 'web/js/apps/agent-supervisor.tsx';
  return {
    interface: GUI_SOURCE_FINDING_INTERFACE,
    schema_version: GUI_SOURCE_FINDING_SCHEMA,
    finding_id: partial.finding_id,
    kind: partial.kind,
    name: partial.name,
    stable_identity: partial.stable_identity,
    path,
    span:
      partial.span ??
      makeSourceSpan({
        path,
        start_line: 1,
        start_column: 0,
        end_line: 1,
        end_column: 20,
      }),
    confidence: partial.confidence ?? 'exact',
    extraction_method: partial.extraction_method ?? 'typescript_compiler_api',
    extractor_version: partial.extractor_version ?? GUI_STATIC_EXTRACTOR_VERSION,
    attributes: Object.freeze(partial.attributes ?? {}),
    evidence: partial.evidence ?? partial.name,
    requires_raw_source: partial.requires_raw_source ?? false,
    language: partial.language ?? 'tsx',
    occurrence: partial.occurrence ?? 1,
  };
}

function exactFindings(): GuiSourceFinding[] {
  return [
    finding({
      finding_id: 'finding:0001',
      kind: 'component',
      name: 'ConsoleRoot',
      stable_identity: 'comp:console-root',
      attributes: {
        application_id: APP,
        screen_id: SCREEN,
        package_namespace: PKG,
        qualified_name: 'apps.agent-supervisor.ConsoleRoot',
        purpose: 'Bounded Agent Supervisor console surface',
        component_type: 'screen-root',
        layout_role: 'primary-workspace',
      },
    }),
    finding({
      finding_id: 'finding:0002',
      kind: 'prop',
      name: 'goals',
      stable_identity: 'prop:goals',
    }),
    finding({
      finding_id: 'finding:0003',
      kind: 'prop',
      name: 'tasks',
      stable_identity: 'prop:tasks',
    }),
    finding({
      finding_id: 'finding:0004',
      kind: 'event_handler',
      name: 'onSubmit',
      stable_identity: 'event:submit',
    }),
    finding({
      finding_id: 'finding:0005',
      kind: 'state',
      name: 'ready',
      stable_identity: 'state:ready',
    }),
    finding({
      finding_id: 'finding:0006',
      kind: 'state',
      name: 'loading',
      stable_identity: 'state:loading',
      evidence: 'loading spinner while dispatch is pending',
    }),
    finding({
      finding_id: 'finding:0007',
      kind: 'action_binding',
      name: 'dispatch-goal',
      stable_identity: 'action:dispatch',
      attributes: { effect: 'dispatch-goal', requires_confirmation: 'true' },
    }),
    finding({
      finding_id: 'finding:0008',
      kind: 'confirmation',
      name: 'confirm-dispatch',
      stable_identity: 'confirm:dispatch',
    }),
    finding({
      finding_id: 'finding:0009',
      kind: 'keyboard',
      name: 'enter-submits',
      stable_identity: 'keyboard:enter',
    }),
    finding({
      finding_id: 'finding:0010',
      kind: 'focus',
      name: 'restore-trigger-after-close',
      stable_identity: 'focus:restore',
    }),
    finding({
      finding_id: 'finding:0011',
      kind: 'media_query',
      name: 'stack-on-narrow',
      stable_identity: 'mq:narrow',
    }),
    finding({
      finding_id: 'finding:0012',
      kind: 'localization',
      name: 'agentSupervisor.goal.label',
      stable_identity: 'i18n:goal-label',
      attributes: { key: 'agentSupervisor.goal.label' },
    }),
    finding({
      finding_id: 'finding:0013',
      kind: 'accessibility',
      name: 'goal-form-a11y',
      stable_identity: 'a11y:goal-form',
      attributes: { contract_id: 'a11y:goal-form' },
    }),
    finding({
      finding_id: 'finding:0014',
      kind: 'form',
      name: 'GoalForm',
      stable_identity: 'comp:goal-form',
      attributes: {
        tested_by: 'test:goal-form-a11y',
        screenshot_id: 'screenshot:keyboard-desktop',
      },
    }),
    finding({
      finding_id: 'finding:0015',
      kind: 'state',
      name: 'error',
      stable_identity: 'state:error',
      evidence: 'error banner after failed dispatch',
    }),
  ];
}

function fixtureVersion() {
  const identity = buildStableIdentity({
    applicationId: APP,
    screenId: SCREEN,
    qualifiedName: 'apps.agent-supervisor.ConsoleRoot',
    componentKind: 'screen',
    packageNamespace: PKG,
  });
  return compileComponentVersion(
    identity,
    {
      structure: { name: 'ConsoleRoot' },
      props: { names: ['goals', 'tasks'] },
      state: { ready: true },
      handlers: { submit: true },
      accessibility: { contract: 'a11y:goal-form' },
      styles: { role: 'primary-workspace' },
      actions: { dispatch: true },
      localization: { keys: ['agentSupervisor.goal.label'] },
    },
    {
      extractorVersion: UI_CAPSULE_COMPILER_VERSION,
      optimizerSchemaVersion: UI_COMPONENT_VERSION_SCHEMA,
    },
  );
}

function assertRequiredFieldsPresent(capsule: UiSemanticCapsule): void {
  const required = [
    'interface',
    'schema_version',
    'capsule_id',
    'stable_identity',
    'version_identity',
    'application_id',
    'screen_id',
    'purpose',
    'component_type',
    'analysis_classification',
    'verification_status',
    'completeness_boundary',
    'prop_names',
    'emitted_event_ids',
    'state_variable_ids',
    'visible_state_ids',
    'transition_ids',
    'action_binding_ids',
    'action_side_effects',
    'layout_role',
    'responsive_behavior',
    'keyboard_interactions',
    'focus_behavior',
    'child_component_ids',
    'dependency_edge_ids',
    'test_ids',
    'screenshot_ids',
    'known_violation_ids',
    'unresolved_dynamic_behavior',
    'localization_keys',
    'accessibility_contract_id',
    'confirmation_required',
    'loading_behavior',
    'empty_behavior',
    'success_behavior',
    'error_behavior',
    'source_revision',
  ] as const;

  const dict = uiSemanticCapsuleToDict(capsule);
  for (const field of required) {
    expect(field in dict).toBe(true);
    expect(dict[field]).not.toBeUndefined();
    expect(dict[field]).not.toBeNull();
  }

  // Distinct list/string fields (never legacy combined bags).
  expect(typeof capsule.layout_role).toBe('string');
  expect(capsule.layout_role.length).toBeGreaterThan(0);
  expect(Array.isArray(capsule.responsive_behavior)).toBe(true);
  expect(Array.isArray(capsule.keyboard_interactions)).toBe(true);
  expect(Array.isArray(capsule.focus_behavior)).toBe(true);
  expect(Array.isArray(capsule.action_side_effects)).toBe(true);

  expect(capsule.interface).toBe(UI_SEMANTIC_CAPSULE_INTERFACE);
  expect(capsule.schema_version).toBe(UI_SEMANTIC_CAPSULE_SCHEMA);
  expect(capsule.stable_identity.interface).toBe(UI_COMPONENT_IDENTITY_INTERFACE);
  expect(capsule.stable_identity.schema_version).toBe(
    UI_COMPONENT_IDENTITY_SCHEMA,
  );
  expect(capsule.version_identity.interface).toBe(
    UI_COMPONENT_VERSION_INTERFACE,
  );
  expect(capsule.version_identity.schema_version).toBe(
    UI_COMPONENT_VERSION_SCHEMA,
  );
}

describe('VGO-012 UiSemanticCapsule@1 wire contract', () => {
  it('exposes closed interface and completeness vocabulary', () => {
    expect(UI_SEMANTIC_CAPSULE_INTERFACE).toBe('UiSemanticCapsule@1');
    expect(UI_SEMANTIC_CAPSULE_SCHEMA).toBe('ui-semantic-capsule/v1');
    expect(UI_CAPSULE_COMPILER_INTERFACE).toBe('UiCapsuleCompiler@1');
    expect(UI_CAPSULE_COMPILER_SCHEMA).toBe('ui-capsule-compiler/v1');
    expect(UI_COMPLETENESS_BOUNDARY_INTERFACE).toBe('UiCompletenessBoundary@1');
    expect([...UI_COMPLETENESS_BOUNDARIES]).toEqual([
      'complete_within_boundary',
      'partial',
      'best_effort',
      'unknown',
    ]);
    expect([...UI_ANALYSIS_CLASSIFICATIONS]).toEqual([
      'exact',
      'conservative',
      'heuristic',
      'opaque',
    ]);
    expect([...UI_VERIFICATION_STATUSES]).toEqual([
      'verified',
      'structurally_valid',
      'integrity_valid',
      'unverified',
      'stale',
      'invalid',
      'simulated',
    ]);
  });

  it('decodes a full capsule with all required fields present and bounded', () => {
    const version = fixtureVersion();
    const capsule = makeUiSemanticCapsule({
      capsule_id: 'capsule:console-root',
      stable_identity: version.stable_identity,
      version_identity: version,
      application_id: APP,
      screen_id: SCREEN,
      purpose: 'Bounded Agent Supervisor console surface',
      component_type: 'screen-root',
      analysis_classification: 'exact',
      verification_status: 'unverified',
      completeness_boundary: 'complete_within_boundary',
      prop_names: ['goals', 'tasks'],
      emitted_event_ids: ['event:submit'],
      state_variable_ids: ['state:ready'],
      visible_state_ids: ['state:ready', 'state:loading'],
      transition_ids: ['transition:ready-to-loading'],
      action_binding_ids: ['action:dispatch'],
      action_side_effects: ['dispatch-goal'],
      layout_role: 'primary-workspace',
      responsive_behavior: ['stack-on-narrow', 'preserve-primary-action'],
      keyboard_interactions: ['enter-submits', 'escape-cancels-dialog'],
      focus_behavior: ['restore-trigger-after-close', 'trap-focus-in-modal'],
      child_component_ids: ['comp:goal-form'],
      dependency_edge_ids: ['edge:root-goal-form'],
      test_ids: ['test:goal-form-a11y'],
      screenshot_ids: ['screenshot:keyboard-desktop'],
      known_violation_ids: ['violation:missing-label'],
      unresolved_dynamic_behavior: ['plugin:opaque-widget'],
      localization_keys: ['agentSupervisor.goal.label'],
      accessibility_contract_id: 'a11y:goal-form',
      confirmation_required: true,
      loading_behavior: 'Shows a named progress indicator.',
      empty_behavior: 'Shows bounded empty-state guidance.',
      success_behavior: 'Announces confirmed completion.',
      error_behavior: 'Shows an associated recoverable error.',
      source_revision: 'deadbeef',
    });

    assertRequiredFieldsPresent(capsule);
    expect(capsule.prop_names).toEqual(['goals', 'tasks']);
    expect(capsule.confirmation_required).toBe(true);
    expect(capsule.layout_role).toBe('primary-workspace');
    expect(capsule.responsive_behavior).toContain('stack-on-narrow');
    expect(capsule.keyboard_interactions).toContain('enter-submits');
    expect(capsule.focus_behavior).toContain('restore-trigger-after-close');
    expect(capsule.action_side_effects).toContain('dispatch-goal');

    // Round-trip through closed decoder.
    const roundTrip = decodeUiSemanticCapsule(
      JSON.parse(JSON.stringify(uiSemanticCapsuleToDict(capsule))),
    );
    expect(roundTrip).toEqual(capsule);
  });

  it('rejects unknown fields, legacy combined fields, and invalid enums', () => {
    const version = fixtureVersion();
    const base = uiSemanticCapsuleToDict(
      makeUiSemanticCapsule({
        capsule_id: 'capsule:console-root',
        stable_identity: version.stable_identity,
        version_identity: version,
        analysis_classification: 'exact',
        verification_status: 'unverified',
      }),
    );

    expect(() =>
      decodeUiSemanticCapsule({ ...base, extra_field: 'nope' }),
    ).toThrow(/unknown/);

    for (const legacy of LEGACY_CAPSULE_FIELDS) {
      expect(() =>
        decodeUiSemanticCapsule({
          ...base,
          [legacy]: ['legacy combined prose'],
        }),
      ).toThrow(/unknown|legacy|removed/i);
    }

    expect(() =>
      decodeUiSemanticCapsule({
        ...base,
        analysis_classification: 'not-a-class',
      }),
    ).toThrow(/analysis_classification/);

    expect(() =>
      decodeUiSemanticCapsule({
        ...base,
        verification_status: 'not-a-status',
      }),
    ).toThrow(/verification_status/);

    expect(() =>
      decodeUiSemanticCapsule({
        ...base,
        completeness_boundary: 'not-a-boundary',
      }),
    ).toThrow(/completeness_boundary/);
  });

  it('rejects unbounded collections and oversized strings', () => {
    const version = fixtureVersion();
    const base = uiSemanticCapsuleToDict(
      makeUiSemanticCapsule({
        capsule_id: 'capsule:console-root',
        stable_identity: version.stable_identity,
        version_identity: version,
      }),
    );

    const tooMany = Array.from(
      { length: MAX_COLLECTION_ITEMS + 1 },
      (_, i) => `prop:${i}`,
    );
    expect(() =>
      decodeUiSemanticCapsule({ ...base, prop_names: tooMany }),
    ).toThrow(/maximum/);

    expect(() =>
      decodeUiSemanticCapsule({
        ...base,
        purpose: 'x'.repeat(MAX_STRING_CHARS + 1),
      }),
    ).toThrow(/maximum length/);

    expect(() =>
      decodeUiSemanticCapsule({
        ...base,
        prop_names: ['dup', 'dup'],
      }),
    ).toThrow(/duplicate/);
  });
});

describe('VGO-012 evidence levels stay distinct', () => {
  it('keeps analysis classification independent from verification status', () => {
    // Content identity / integrity never upgrades analysis to verified truth.
    expect(
      resolveCapsuleVerificationStatus({
        analysis_classification: 'heuristic',
        requested_status: 'verified',
      }),
    ).toBe('unverified');

    expect(
      resolveCapsuleVerificationStatus({
        analysis_classification: 'exact',
        requested_status: 'integrity_valid',
        has_integrity_only: true,
      }),
    ).toBe('integrity_valid');

    expect(
      resolveCapsuleVerificationStatus({
        analysis_classification: 'exact',
        requested_status: 'verified',
        has_integrity_only: true,
      }),
    ).toBe('integrity_valid');

    expect(
      isVerifiedAllowed({
        analysis_classification: 'exact',
        verification_status: 'verified',
      }),
    ).toBe(true);
    expect(
      isVerifiedAllowed({
        analysis_classification: 'heuristic',
        verification_status: 'verified',
      }),
    ).toBe(false);
  });

  it('enumerates independent vocabularies without aliasing', () => {
    for (const analysis of UI_ANALYSIS_CLASSIFICATIONS) {
      expect(UI_VERIFICATION_STATUSES).not.toContain(analysis as never);
    }
    for (const status of UI_VERIFICATION_STATUSES) {
      expect(UI_ANALYSIS_CLASSIFICATIONS).not.toContain(status as never);
    }
  });
});

describe('VGO-012 opaque/stale cannot be reported verified', () => {
  it('refuses verified status for opaque and heuristic analysis', () => {
    expect(
      resolveCapsuleVerificationStatus({
        analysis_classification: 'opaque',
        requested_status: 'verified',
      }),
    ).not.toBe('verified');

    expect(
      resolveCapsuleVerificationStatus({
        analysis_classification: 'heuristic',
        requested_status: 'verified',
        has_opaque_input: true,
      }),
    ).not.toBe('verified');
  });

  it('keeps stale status sticky and never promotes it to verified', () => {
    expect(
      resolveCapsuleVerificationStatus({
        analysis_classification: 'exact',
        requested_status: 'stale',
      }),
    ).toBe('stale');

    expect(
      resolveCapsuleVerificationStatus({
        analysis_classification: 'exact',
        requested_status: 'verified',
        has_stale_input: true,
      }),
    ).toBe('stale');
  });

  it('decode rejects opaque/stale capsules marked verified', () => {
    const version = fixtureVersion();
    const base = uiSemanticCapsuleToDict(
      makeUiSemanticCapsule({
        capsule_id: 'capsule:console-root',
        stable_identity: version.stable_identity,
        version_identity: version,
        analysis_classification: 'exact',
        verification_status: 'unverified',
      }),
    );

    expect(() =>
      decodeUiSemanticCapsule({
        ...base,
        analysis_classification: 'opaque',
        verification_status: 'verified',
      }),
    ).toThrow(/opaque\/stale|verified/);

    expect(() =>
      decodeUiSemanticCapsule({
        ...base,
        analysis_classification: 'heuristic',
        verification_status: 'verified',
      }),
    ).toThrow(/opaque\/stale|verified/);

    // Stale + verified is self-contradictory on the same field; the decoder
    // rejects any verified claim when status is stale (impossible wire pair is
    // still covered by the requested opaque path above). Stale alone is fine.
    const stale = decodeUiSemanticCapsule({
      ...base,
      analysis_classification: 'exact',
      verification_status: 'stale',
    });
    expect(stale.verification_status).toBe('stale');
    expect(() => assertCapsuleEvidenceDistinct(stale)).not.toThrow();
  });

  it('compiler never emits verified for opaque or stale inputs', () => {
    const opaqueFindings = [
      finding({
        finding_id: 'finding:opaque-1',
        kind: 'component',
        name: 'OpaqueWidget',
        stable_identity: 'comp:opaque-widget',
        confidence: 'opaque',
        requires_raw_source: true,
        attributes: {
          application_id: APP,
          screen_id: SCREEN,
          package_namespace: PKG,
          qualified_name: 'apps.agent-supervisor.OpaqueWidget',
        },
      }),
      finding({
        finding_id: 'finding:opaque-2',
        kind: 'dynamic_uncertainty',
        name: 'runtime-plugin',
        stable_identity: 'dyn:plugin',
        confidence: 'opaque',
        requires_raw_source: true,
      }),
    ];

    const opaqueCapsule = compileUiSemanticCapsuleFromFacts(
      {
        findings: opaqueFindings,
        analysis_classification: 'opaque',
      },
      { verificationStatus: 'verified', applicationId: APP, screenId: SCREEN },
    );
    expect(opaqueCapsule.analysis_classification).toBe('opaque');
    expect(opaqueCapsule.verification_status).not.toBe('verified');
    expect(opaqueCapsule.completeness_boundary).toBe('unknown');
    expect(opaqueCapsule.unresolved_dynamic_behavior.length).toBeGreaterThan(0);

    const staleCapsule = compileUiSemanticCapsuleFromFacts(
      {
        findings: exactFindings(),
        verification_status: 'stale',
      },
      {
        applicationId: APP,
        screenId: SCREEN,
        packageNamespace: PKG,
        verificationStatus: 'verified',
      },
    );
    expect(staleCapsule.verification_status).toBe('stale');
  });
});

describe('VGO-012 UiCapsuleCompiler@1 from findings', () => {
  it('compiles a complete capsule summarizing required facets', () => {
    const { capsule, trace } = compileUiSemanticCapsuleWithTrace(
      {
        findings: exactFindings(),
        edges: [
          {
            source_component_id: 'comp:console-root',
            target_component_id: 'comp:goal-form',
            relation: 'contains',
          },
          {
            source_component_id: 'comp:console-root',
            target_component_id: 'action:dispatch',
            relation: 'invokes_action',
          },
          {
            source_component_id: 'comp:goal-form',
            target_component_id: 'test:goal-form-a11y',
            relation: 'tested_by',
          },
        ],
        unresolved: [],
        source_revision: 'deadbeef',
      },
      {
        applicationId: APP,
        screenId: SCREEN,
        packageNamespace: PKG,
        purpose: 'Bounded Agent Supervisor console surface',
        sourceRevision: 'deadbeef',
      },
    );

    assertRequiredFieldsPresent(capsule);
    expect(capsule.application_id).toBe(APP);
    expect(capsule.screen_id).toBe(SCREEN);
    expect(capsule.purpose).toContain('Agent Supervisor');
    expect(capsule.prop_names).toEqual(expect.arrayContaining(['goals', 'tasks']));
    expect(capsule.emitted_event_ids).toContain('event:submit');
    expect(capsule.state_variable_ids).toEqual(
      expect.arrayContaining(['state:ready', 'state:loading']),
    );
    expect(capsule.action_binding_ids).toContain('action:dispatch');
    expect(capsule.action_side_effects).toContain('dispatch-goal');
    expect(capsule.confirmation_required).toBe(true);
    expect(capsule.layout_role).toBe('primary-workspace');
    expect(capsule.responsive_behavior).toContain('stack-on-narrow');
    expect(capsule.keyboard_interactions.length).toBeGreaterThan(0);
    expect(capsule.focus_behavior.length).toBeGreaterThan(0);
    expect(capsule.child_component_ids).toContain('comp:goal-form');
    expect(capsule.test_ids).toContain('test:goal-form-a11y');
    expect(capsule.screenshot_ids).toContain('screenshot:keyboard-desktop');
    expect(capsule.localization_keys).toContain('agentSupervisor.goal.label');
    expect(capsule.accessibility_contract_id).toBe('a11y:goal-form');
    expect(capsule.loading_behavior.length).toBeGreaterThan(0);
    expect(capsule.error_behavior.length).toBeGreaterThan(0);
    expect(capsule.analysis_classification).toBe('exact');
    expect(capsule.verification_status).toBe('unverified');
    expect(capsule.completeness_boundary).toBe('complete_within_boundary');
    expect(capsule.source_revision).toBe('deadbeef');

    // Source-to-capsule traceability.
    expect(trace.capsule_id).toBe(capsule.capsule_id);
    expect(trace.source_finding_ids).toEqual(
      expect.arrayContaining(['finding:0001', 'finding:0007']),
    );
    expect(trace.source_paths).toContain('web/js/apps/agent-supervisor.tsx');
    expect(trace.primary_stable_identity).toBe('comp:console-root');
    expect(trace.executed_code).toBe(false);
    expect(trace.extractor_version).toBe(UI_CAPSULE_COMPILER_VERSION);
  });

  it('compiles from a scan result without executing code', () => {
    const scan: GuiStaticScanResult = Object.freeze({
      interface: GUI_STATIC_SCANNER_INTERFACE,
      schema_version: GUI_STATIC_SCAN_RESULT_SCHEMA,
      extractor_version: GUI_STATIC_EXTRACTOR_VERSION,
      sources: Object.freeze(['web/js/apps/agent-supervisor.tsx']),
      findings: Object.freeze(exactFindings()),
      edges: Object.freeze([]),
      analysis_classification: 'exact',
      verification_status: 'unverified',
      completeness_boundary: 'complete_within_boundary',
      unresolved: Object.freeze([]),
      executed_code: false as const,
    });

    const capsule = compileUiSemanticCapsuleFromScan(scan, {
      applicationId: APP,
      screenId: SCREEN,
      packageNamespace: PKG,
    });
    assertRequiredFieldsPresent(capsule);
    expect(capsule.analysis_classification).toBe('exact');
  });

  it('exposes UiCapsuleCompiler@1 facade', () => {
    const compiler = createUiCapsuleCompiler();
    expect(compiler.interface).toBe(UI_CAPSULE_COMPILER_INTERFACE);
    expect(compiler.schema_version).toBe(UI_CAPSULE_COMPILER_SCHEMA);
    expect(compiler.extractorVersion).toBe(UI_CAPSULE_COMPILER_VERSION);

    const capsule = compiler.compileFromFacts(
      { findings: exactFindings() },
      { applicationId: APP, screenId: SCREEN, packageNamespace: PKG },
    );
    assertRequiredFieldsPresent(capsule);
  });

  it('lowers completeness for conservative and unresolved findings', () => {
    const findings = [
      finding({
        finding_id: 'finding:c1',
        kind: 'component',
        name: 'Panel',
        stable_identity: 'comp:panel',
        confidence: 'conservative',
        attributes: {
          application_id: APP,
          screen_id: SCREEN,
          package_namespace: PKG,
          qualified_name: 'apps.agent-supervisor.Panel',
        },
      }),
    ];
    const capsule = compileUiSemanticCapsuleFromFacts(
      {
        findings,
        unresolved: ['dynamic:plugin'],
        analysis_classification: 'conservative',
      },
      { applicationId: APP, screenId: SCREEN, packageNamespace: PKG },
    );
    expect(capsule.analysis_classification).toBe('conservative');
    expect(capsule.completeness_boundary).toBe('partial');
    expect(capsule.unresolved_dynamic_behavior).toContain('dynamic:plugin');
  });
});

describe('VGO-012 deterministic capsule bytes', () => {
  it('produces identical bytes and digests for identical findings', () => {
    const options = {
      applicationId: APP,
      screenId: SCREEN,
      packageNamespace: PKG,
      purpose: 'Bounded Agent Supervisor console surface',
      sourceRevision: 'deadbeef',
    };
    const facts = {
      findings: exactFindings(),
      edges: [
        {
          source_component_id: 'comp:console-root',
          target_component_id: 'comp:goal-form',
          relation: 'contains',
        },
      ],
      unresolved: [] as string[],
      source_revision: 'deadbeef',
    };

    const a = compileUiSemanticCapsuleFromFacts(facts, options);
    const b = compileUiSemanticCapsuleFromFacts(
      {
        ...facts,
        // Shuffled finding order must not change capsule bytes.
        findings: [...exactFindings()].reverse(),
      },
      options,
    );

    expect(serializeUiSemanticCapsule(a)).toBe(serializeUiSemanticCapsule(b));
    expect(capsuleDigest(a)).toBe(capsuleDigest(b));
    expect([...capsuleBytes(a)]).toEqual([...capsuleBytes(b)]);

    // Key order in object construction must not affect serialization.
    const reparsed = decodeUiSemanticCapsule(
      JSON.parse(serializeUiSemanticCapsule(a)),
    );
    expect(serializeUiSemanticCapsule(reparsed)).toBe(
      serializeUiSemanticCapsule(a),
    );
  });

  it('changes digest when findings change materially', () => {
    const base = compileUiSemanticCapsuleFromFacts(
      { findings: exactFindings() },
      { applicationId: APP, screenId: SCREEN, packageNamespace: PKG },
    );
    const altered = compileUiSemanticCapsuleFromFacts(
      {
        findings: [
          ...exactFindings(),
          finding({
            finding_id: 'finding:extra',
            kind: 'prop',
            name: 'extraProp',
            stable_identity: 'prop:extra',
          }),
        ],
      },
      { applicationId: APP, screenId: SCREEN, packageNamespace: PKG },
    );
    expect(capsuleDigest(base)).not.toBe(capsuleDigest(altered));
  });
});

describe('VGO-012 exact/conservative/heuristic/opaque fixtures', () => {
  const baseComponent = (confidence: GuiSourceFinding['confidence']) =>
    finding({
      finding_id: `finding:${confidence}`,
      kind: 'component',
      name: `Surface_${confidence}`,
      stable_identity: `comp:${confidence}`,
      confidence,
      requires_raw_source: confidence === 'opaque' || confidence === 'heuristic',
      attributes: {
        application_id: APP,
        screen_id: SCREEN,
        package_namespace: PKG,
        qualified_name: `apps.agent-supervisor.Surface_${confidence}`,
      },
    });

  it('preserves each analysis classification distinctly', () => {
    for (const classification of UI_ANALYSIS_CLASSIFICATIONS) {
      const capsule = compileUiSemanticCapsuleFromFacts(
        {
          findings: [baseComponent(classification)],
          analysis_classification: classification,
        },
        {
          applicationId: APP,
          screenId: SCREEN,
          packageNamespace: PKG,
          verificationStatus: 'verified',
        },
      );
      expect(capsule.analysis_classification).toBe(classification);
      if (classification === 'opaque' || classification === 'heuristic') {
        expect(capsule.verification_status).not.toBe('verified');
      }
      if (classification === 'opaque') {
        expect(capsule.completeness_boundary).toBe('unknown');
      }
      if (classification === 'heuristic') {
        expect(capsule.completeness_boundary).toBe('best_effort');
      }
    }
  });
});
