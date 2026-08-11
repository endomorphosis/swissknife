/**
 * VGO-011 — typed UI dependency graph (UiComponentGraph@1) tests.
 *
 * Covers edge completeness (identity/relation/method/confidence/version/span),
 * finite relation compilation from scanner facts, unresolved unsupported
 * targets, and deterministic graph assembly without inventing endpoints.
 */

import { describe, expect, it } from 'vitest';
import {
  GUI_DEPENDENCY_RELATIONS,
  GUI_OPTIMIZER_SCHEMA_VERSION,
  GUI_STATIC_EXTRACTOR_VERSION,
  decodeUiDependencyEdge,
  type GuiSourceFinding,
  type GuiSourceSpan,
  type GuiStaticScanResult,
  type UiDependencyEdge,
} from '../../../../src/services/gui-optimizer/models.js';
import {
  scanGuiSource,
  scanGuiSources,
} from '../../../../src/services/gui-optimizer/scanner.js';
import {
  UI_COMPONENT_GRAPH_EXTRACTOR_VERSION,
  UI_COMPONENT_GRAPH_INTERFACE,
  UI_DEPENDENCY_RELATIONS,
  buildUiComponentGraph,
  buildUiComponentGraphFromFacts,
  createUiComponentGraphBuilder,
  type UiComponentGraph,
  type UiDependencyRelation,
} from '../../../../src/services/gui-optimizer/component-graph.js';

const APP = 'agent-supervisor';
const SCREEN = 'agent-supervisor';
const PKG = 'org.hallucinate.swissknife.gui-optimizer';

function span(path: string, start = 0, end = 10): GuiSourceSpan {
  return {
    path,
    start_offset: start,
    end_offset: end,
    start_line: 1,
    start_column: start,
    end_line: 1,
    end_column: end,
  };
}

function finding(
  partial: Partial<GuiSourceFinding> &
    Pick<GuiSourceFinding, 'finding_id' | 'kind' | 'name' | 'stable_identity'>,
): GuiSourceFinding {
  return {
    schema_version: GUI_OPTIMIZER_SCHEMA_VERSION,
    path: partial.path ?? 'web/js/apps/panel.tsx',
    span: partial.span ?? span(partial.path ?? 'web/js/apps/panel.tsx'),
    confidence: partial.confidence ?? 'exact',
    extraction_method: partial.extraction_method ?? 'jsx_ast',
    extractor_version: partial.extractor_version ?? GUI_STATIC_EXTRACTOR_VERSION,
    attributes: Object.freeze(partial.attributes ?? {}),
    evidence: partial.evidence ?? partial.name,
    requires_raw_source: partial.requires_raw_source ?? false,
    language: partial.language ?? 'tsx',
    ...partial,
  };
}

function assertEdgeContract(edge: UiDependencyEdge): void {
  expect(edge.schema_version).toBe(GUI_OPTIMIZER_SCHEMA_VERSION);
  expect(typeof edge.edge_id).toBe('string');
  expect(edge.edge_id.length).toBeGreaterThan(0);
  expect(typeof edge.source_identity).toBe('string');
  expect(edge.source_identity.length).toBeGreaterThan(0);
  expect(typeof edge.target_identity).toBe('string');
  expect(edge.target_identity.length).toBeGreaterThan(0);
  expect(UI_DEPENDENCY_RELATIONS).toContain(edge.relation);
  expect(GUI_DEPENDENCY_RELATIONS).toContain(edge.relation);
  expect(typeof edge.extraction_method).toBe('string');
  expect(['exact', 'conservative', 'heuristic', 'opaque']).toContain(
    edge.confidence,
  );
  expect(typeof edge.extractor_version).toBe('string');
  expect(edge.extractor_version.length).toBeGreaterThan(0);
  // Span is available when present; null is explicit rather than omitted.
  expect(edge.span === null || typeof edge.span === 'object').toBe(true);
  if (edge.span) {
    expect(edge.span.path.length).toBeGreaterThan(0);
    expect(edge.span.end_offset).toBeGreaterThanOrEqual(edge.span.start_offset);
  }
  expect(() => decodeUiDependencyEdge(JSON.parse(JSON.stringify(edge)))).not.toThrow();
}

function assertGraphContract(graph: UiComponentGraph): void {
  expect(graph.schema_version).toBe(GUI_OPTIMIZER_SCHEMA_VERSION);
  expect(graph.interface_id).toBe(UI_COMPONENT_GRAPH_INTERFACE);
  expect(graph.extractor_version).toBe(UI_COMPONENT_GRAPH_EXTRACTOR_VERSION);
  expect(graph.executed_code).toBe(false);
  expect(Array.isArray(graph.nodes)).toBe(true);
  expect(Array.isArray(graph.edges)).toBe(true);
  expect(Array.isArray(graph.unresolved)).toBe(true);
  for (const edge of graph.edges) {
    assertEdgeContract(edge);
  }
}

describe('UiComponentGraph@1 surface', () => {
  it('exports closed interface, extractor version, and finite relations', () => {
    expect(UI_COMPONENT_GRAPH_INTERFACE).toBe('UiComponentGraph@1');
    expect(UI_COMPONENT_GRAPH_EXTRACTOR_VERSION).toBe('gui-component-graph@1.0.0');
    expect([...UI_DEPENDENCY_RELATIONS]).toEqual([...GUI_DEPENDENCY_RELATIONS]);
    expect(UI_DEPENDENCY_RELATIONS).toEqual(
      expect.arrayContaining([
        'renders',
        'contains',
        'routes_to',
        'opens_dialog',
        'closes_dialog',
        'updates_state',
        'reads_state',
        'submits',
        'validates',
        'invokes_action',
        'requires_confirmation',
        'depends_on_policy',
        'depends_on_schema',
        'styled_by',
        'uses_design_token',
        'localized_by',
        'tested_by',
        'screenshot_by',
        'responsive_variant_of',
        'device_projection_of',
      ]),
    );
  });

  it('createUiComponentGraphBuilder exposes extractor version', () => {
    const builder = createUiComponentGraphBuilder();
    expect(builder.extractorVersion).toBe(UI_COMPONENT_GRAPH_EXTRACTOR_VERSION);
  });
});

describe('compilation from scanner facts', () => {
  it('builds a typed graph from a React panel scan with complete edge metadata', () => {
    const source = `
import React, { useState } from 'react';

export function SavePanel() {
  const [value, setValue] = useState('');
  return (
    <form aria-label="Save form" data-testid="save-form">
      <label htmlFor="title">Title</label>
      <input id="title" name="title" required aria-required="true" />
      <button type="submit" data-action="save-item" className="primary">Save</button>
      <a href="/docs/security">Security</a>
      <dialog open data-testid="confirm-dialog">Confirm?</dialog>
    </form>
  );
}
`;
    const scan = scanGuiSource(
      { path: 'web/js/apps/save-panel.tsx', content: source, language: 'tsx' },
      { applicationId: APP, screenId: SCREEN, packageNamespace: PKG },
    );
    const graph = buildUiComponentGraph(scan, {
      applicationId: APP,
      screenId: SCREEN,
      packageNamespace: PKG,
    });

    assertGraphContract(graph);
    expect(graph.application_id).toBe(APP);
    expect(graph.screen_id).toBe(SCREEN);
    expect(graph.scanner_extractor_version).toBe(GUI_STATIC_EXTRACTOR_VERSION);
    expect(graph.sources).toContain('web/js/apps/save-panel.tsx');
    expect(graph.nodes.some(n => n.kind === 'component' && n.name === 'SavePanel')).toBe(
      true,
    );

    const relations = new Set(graph.edges.map(e => e.relation));
    expect(relations.has('renders') || relations.has('contains')).toBe(true);
    expect(relations.has('invokes_action') || relations.has('routes_to')).toBe(true);
    expect(graph.edges.every(e => e.extractor_version.length > 0)).toBe(true);

    // Determinism
    const again = buildUiComponentGraph(scan, {
      applicationId: APP,
      screenId: SCREEN,
      packageNamespace: PKG,
    });
    expect(JSON.stringify(again)).toBe(JSON.stringify(graph));
  });

  it('preserves scanner edges and compiles additional state/localization relations', () => {
    const componentId = `${APP}/${SCREEN}/component/SettingsPanel`;
    const stateId = `${APP}/${SCREEN}/state/theme`;
    const locId = `${APP}/${SCREEN}/localization/settings.title`;
    const styleId = `${APP}/${SCREEN}/style/theme-class`;
    const tokenId = `${APP}/${SCREEN}/design_token/--as-fg`;
    const mediaId = `${APP}/${SCREEN}/media_query/_max-width:_900px_`;

    const findings: GuiSourceFinding[] = [
      finding({
        finding_id: 'finding:0001',
        kind: 'component',
        name: 'SettingsPanel',
        stable_identity: componentId,
        attributes: {
          application_id: APP,
          screen_id: SCREEN,
          package_namespace: PKG,
          component_kind: 'react_function',
        },
      }),
      finding({
        finding_id: 'finding:0002',
        kind: 'state',
        name: 'theme',
        stable_identity: stateId,
        attributes: { host: componentId, parent: componentId },
        evidence: 'useState theme',
        extraction_method: 'typescript_compiler_api',
      }),
      finding({
        finding_id: 'finding:0003',
        kind: 'localization',
        name: 'settings.title',
        stable_identity: locId,
        attributes: { host: componentId },
        extraction_method: 'typescript_compiler_api',
      }),
      finding({
        finding_id: 'finding:0004',
        kind: 'style',
        name: 'theme-class',
        stable_identity: styleId,
        attributes: { host: componentId },
      }),
      finding({
        finding_id: 'finding:0005',
        kind: 'design_token',
        name: '--as-fg',
        stable_identity: tokenId,
        attributes: { host: componentId },
        extraction_method: 'css_tokenizer',
      }),
      finding({
        finding_id: 'finding:0006',
        kind: 'media_query',
        name: '_max-width:_900px_',
        stable_identity: mediaId,
        attributes: { host: componentId },
        extraction_method: 'css_tokenizer',
      }),
    ];

    const scannerEdge: UiDependencyEdge = {
      schema_version: GUI_OPTIMIZER_SCHEMA_VERSION,
      edge_id: 'edge:0001',
      source_identity: componentId,
      target_identity: `${APP}/${SCREEN}/button/Save`,
      relation: 'renders',
      span: span('web/js/apps/panel.tsx', 4, 20),
      extraction_method: 'jsx_ast',
      confidence: 'exact',
      extractor_version: GUI_STATIC_EXTRACTOR_VERSION,
    };

    const graph = buildUiComponentGraphFromFacts(
      {
        findings,
        edges: [scannerEdge],
        sources: ['web/js/apps/panel.tsx'],
        scanner_extractor_version: GUI_STATIC_EXTRACTOR_VERSION,
      },
      { applicationId: APP, screenId: SCREEN, packageNamespace: PKG },
    );

    assertGraphContract(graph);
    expect(graph.edges.some(e => e.edge_id === 'edge:0001' && e.relation === 'renders')).toBe(
      true,
    );
    expect(graph.edges.some(e => e.relation === 'reads_state')).toBe(true);
    expect(graph.edges.some(e => e.relation === 'updates_state')).toBe(true);
    expect(graph.edges.some(e => e.relation === 'localized_by')).toBe(true);
    expect(graph.edges.some(e => e.relation === 'styled_by')).toBe(true);
    expect(graph.edges.some(e => e.relation === 'uses_design_token')).toBe(true);
    expect(graph.edges.some(e => e.relation === 'responsive_variant_of')).toBe(true);

    const stateEdge = graph.edges.find(
      e => e.relation === 'reads_state' && e.target_identity === stateId,
    );
    expect(stateEdge?.source_identity).toBe(componentId);
    expect(stateEdge?.span).not.toBeNull();
    expect(stateEdge?.extractor_version).toBe(UI_COMPONENT_GRAPH_EXTRACTOR_VERSION);
  });

  it('compiles dialog, action, confirmation, validation, policy, schema, and submit edges', () => {
    const componentId = `${APP}/${SCREEN}/component/DialogHost`;
    const dialogId = `${APP}/${SCREEN}/dialog/ConfirmDialog`;
    const actionId = `${APP}/${SCREEN}/action_binding/delete-item`;
    const confirmId = `${APP}/${SCREEN}/confirmation/confirm-delete`;
    const validationId = `${APP}/${SCREEN}/validation/required`;
    const schemaId = `${APP}/${SCREEN}/validation/itemSchema`;
    const policyId = `${APP}/${SCREEN}/host_boundary/window.policy`;
    const formId = `${APP}/${SCREEN}/form/delete-form`;
    const buttonId = `${APP}/${SCREEN}/button/submit`;

    const findings: GuiSourceFinding[] = [
      finding({
        finding_id: 'finding:c',
        kind: 'component',
        name: 'DialogHost',
        stable_identity: componentId,
        attributes: {
          application_id: APP,
          screen_id: SCREEN,
          package_namespace: PKG,
        },
      }),
      finding({
        finding_id: 'finding:d',
        kind: 'dialog',
        name: 'ConfirmDialog',
        stable_identity: dialogId,
        attributes: { host: componentId },
      }),
      finding({
        finding_id: 'finding:a',
        kind: 'action_binding',
        name: 'delete-item',
        stable_identity: actionId,
        attributes: { host: componentId },
      }),
      finding({
        finding_id: 'finding:cf',
        kind: 'confirmation',
        name: 'confirm-delete',
        stable_identity: confirmId,
        attributes: { host: componentId },
      }),
      finding({
        finding_id: 'finding:v',
        kind: 'validation',
        name: 'required',
        stable_identity: validationId,
        attributes: { host: formId },
      }),
      finding({
        finding_id: 'finding:s',
        kind: 'validation',
        name: 'itemSchema',
        stable_identity: schemaId,
        attributes: { host: componentId },
        evidence: 'Schema binding itemSchema',
      }),
      finding({
        finding_id: 'finding:p',
        kind: 'host_boundary',
        name: 'window.policy',
        stable_identity: policyId,
        attributes: { host: componentId, policy: policyId },
        confidence: 'conservative',
        extraction_method: 'typescript_compiler_api',
      }),
      finding({
        finding_id: 'finding:f',
        kind: 'form',
        name: 'delete-form',
        stable_identity: formId,
        attributes: { host: componentId },
      }),
      finding({
        finding_id: 'finding:b',
        kind: 'button',
        name: 'submit',
        stable_identity: buttonId,
        attributes: { host: formId, type: 'submit', form: formId },
      }),
      finding({
        finding_id: 'finding:cl',
        kind: 'event_handler',
        name: 'onCloseDialog',
        stable_identity: `${APP}/${SCREEN}/event_handler/onCloseDialog`,
        attributes: { host: componentId, dialog: dialogId, closes_dialog: 'true' },
      }),
    ];

    const graph = buildUiComponentGraphFromFacts(
      { findings, sources: ['web/js/apps/panel.tsx'] },
      { applicationId: APP, screenId: SCREEN },
    );

    assertGraphContract(graph);
    const relations = new Set(graph.edges.map(e => e.relation));
    for (const required of [
      'opens_dialog',
      'closes_dialog',
      'invokes_action',
      'requires_confirmation',
      'validates',
      'depends_on_schema',
      'depends_on_policy',
      'submits',
    ] as UiDependencyRelation[]) {
      expect(relations.has(required)).toBe(true);
    }
  });

  it('compiles tested_by, screenshot_by, and device_projection_of when identities are known', () => {
    const componentId = `${APP}/${SCREEN}/component/OrbPanel`;
    const testId = `${APP}/${SCREEN}/action_binding/orb-panel.test`;
    const shotId = `${APP}/${SCREEN}/action_binding/orb-panel.shot`;
    const deviceId = `${APP}/${SCREEN}/widget/meta-glasses-projection`;

    const findings: GuiSourceFinding[] = [
      finding({
        finding_id: 'finding:1',
        kind: 'component',
        name: 'OrbPanel',
        stable_identity: componentId,
        attributes: {
          application_id: APP,
          screen_id: SCREEN,
          package_namespace: PKG,
          tested_by: testId,
          screenshot_by: shotId,
          device_projection_of: deviceId,
        },
      }),
      finding({
        finding_id: 'finding:2',
        kind: 'action_binding',
        name: 'orb-panel.test',
        stable_identity: testId,
      }),
      finding({
        finding_id: 'finding:3',
        kind: 'action_binding',
        name: 'orb-panel.shot',
        stable_identity: shotId,
      }),
      finding({
        finding_id: 'finding:4',
        kind: 'widget',
        name: 'meta-glasses-projection',
        stable_identity: deviceId,
      }),
    ];

    const graph = buildUiComponentGraphFromFacts({ findings });
    assertGraphContract(graph);
    expect(graph.edges.some(e => e.relation === 'tested_by' && e.target_identity === testId)).toBe(
      true,
    );
    expect(
      graph.edges.some(e => e.relation === 'screenshot_by' && e.target_identity === shotId),
    ).toBe(true);
    expect(
      graph.edges.some(
        e => e.relation === 'device_projection_of' && e.target_identity === deviceId,
      ),
    ).toBe(true);
  });
});

describe('unresolved unsupported targets', () => {
  it('does not invent confirmation targets for destructive actions', () => {
    const componentId = `${APP}/${SCREEN}/component/Danger`;
    const destructiveId = `${APP}/${SCREEN}/destructive_action/wipe`;

    const graph = buildUiComponentGraphFromFacts({
      findings: [
        finding({
          finding_id: 'finding:1',
          kind: 'component',
          name: 'Danger',
          stable_identity: componentId,
        }),
        finding({
          finding_id: 'finding:2',
          kind: 'destructive_action',
          name: 'wipe',
          stable_identity: destructiveId,
          attributes: { host: componentId },
          confidence: 'heuristic',
          extraction_method: 'pattern_match',
          requires_raw_source: true,
        }),
      ],
    });

    assertGraphContract(graph);
    expect(
      graph.edges.some(
        e =>
          e.relation === 'requires_confirmation' &&
          e.source_identity === destructiveId,
      ),
    ).toBe(false);
    expect(
      graph.unresolved.some(
        entry =>
          entry.includes(destructiveId) ||
          entry.includes('unresolved:confirmation'),
      ),
    ).toBe(true);
  });

  it('keeps bare data-testid and opaque dynamic targets unresolved', () => {
    const componentId = `${APP}/${SCREEN}/component/Dynamic`;
    const dynamicId = `${APP}/${SCREEN}/dynamic_uncertainty/dangerouslySetInnerHTML`;

    const graph = buildUiComponentGraphFromFacts({
      findings: [
        finding({
          finding_id: 'finding:1',
          kind: 'component',
          name: 'Dynamic',
          stable_identity: componentId,
          attributes: { 'data-testid': 'dynamic-panel' },
        }),
        finding({
          finding_id: 'finding:2',
          kind: 'dynamic_uncertainty',
          name: 'dangerouslySetInnerHTML',
          stable_identity: dynamicId,
          attributes: { host: componentId },
          confidence: 'opaque',
          requires_raw_source: true,
          extraction_method: 'jsx_ast',
        }),
      ],
      unresolved: [`${dynamicId}:opaque`],
    });

    assertGraphContract(graph);
    expect(graph.edges.some(e => e.relation === 'tested_by')).toBe(false);
    expect(graph.unresolved.some(u => u.includes('unresolved:test:dynamic-panel'))).toBe(
      true,
    );
    expect(graph.unresolved.some(u => u.includes(dynamicId))).toBe(true);
    expect(graph.nodes.every(n => !n.identity.startsWith('unresolved:'))).toBe(true);
    expect(graph.analysis_classification).toBe('opaque');
  });

  it('preserves scanner unresolved entries and opaque edge confidence', () => {
    const sourceId = `${APP}/${SCREEN}/component/A`;
    const targetId = `${APP}/${SCREEN}/widget/DynamicTag`;
    const edge: UiDependencyEdge = {
      schema_version: GUI_OPTIMIZER_SCHEMA_VERSION,
      edge_id: 'edge:opaque-1',
      source_identity: sourceId,
      target_identity: targetId,
      relation: 'renders',
      span: null,
      extraction_method: 'jsx_ast',
      confidence: 'opaque',
      extractor_version: GUI_STATIC_EXTRACTOR_VERSION,
    };

    const graph = buildUiComponentGraphFromFacts({
      findings: [
        finding({
          finding_id: 'finding:1',
          kind: 'component',
          name: 'A',
          stable_identity: sourceId,
        }),
      ],
      edges: [edge],
      unresolved: ['preexisting:unresolved'],
    });

    assertGraphContract(graph);
    expect(graph.unresolved).toEqual(
      expect.arrayContaining([
        'preexisting:unresolved',
        `${targetId}:renders:opaque`,
      ]),
    );
    const preserved = graph.edges.find(e => e.edge_id === 'edge:opaque-1');
    expect(preserved?.confidence).toBe('opaque');
    expect(preserved?.span).toBeNull();
    expect(preserved?.extractor_version).toBe(GUI_STATIC_EXTRACTOR_VERSION);
  });
});

describe('multi-source scan integration', () => {
  it('assembles a graph across TSX and CSS without executing code', () => {
    const scan = scanGuiSources(
      [
        {
          path: 'web/js/apps/panel.tsx',
          content: `
export function Panel() {
  return (
    <div>
      <button data-action="refresh">Refresh</button>
      <a href="/home">Home</a>
    </div>
  );
}
`,
          language: 'tsx',
        },
        {
          path: 'web/css/panel.css',
          content: `
.panel { color: var(--panel-fg); }
@media (max-width: 600px) { .panel { display: block; } }
`,
          language: 'css',
        },
      ],
      { applicationId: APP, screenId: SCREEN, packageNamespace: PKG },
    );

    const graph = createUiComponentGraphBuilder().buildFromScan(scan, {
      applicationId: APP,
      screenId: SCREEN,
    });

    assertGraphContract(graph);
    expect(graph.executed_code).toBe(false);
    expect(graph.sources).toEqual(
      expect.arrayContaining(['web/js/apps/panel.tsx', 'web/css/panel.css']),
    );
    const relations = graph.edges.map(e => e.relation);
    expect(relations).toEqual(
      expect.arrayContaining(['invokes_action', 'uses_design_token']),
    );
  });
});

describe('edge field completeness matrix', () => {
  it('every compiled edge exposes the full required field set', () => {
    const componentId = `${APP}/${SCREEN}/component/AllRelations`;
    const findings: GuiSourceFinding[] = [
      finding({
        finding_id: 'finding:root',
        kind: 'component',
        name: 'AllRelations',
        stable_identity: componentId,
        attributes: {
          application_id: APP,
          screen_id: SCREEN,
          package_namespace: PKG,
          tested_by: `${APP}/${SCREEN}/action_binding/all.test`,
          screenshot: `${APP}/${SCREEN}/action_binding/all.shot`,
          device: `${APP}/${SCREEN}/widget/device-a`,
        },
      }),
      finding({
        finding_id: 'finding:state',
        kind: 'state',
        name: 'setCount',
        stable_identity: `${APP}/${SCREEN}/state/setCount`,
        attributes: { host: componentId },
      }),
      finding({
        finding_id: 'finding:route',
        kind: 'route',
        name: '/home',
        stable_identity: `${APP}/${SCREEN}/route/_home`,
        attributes: { host: componentId },
      }),
      finding({
        finding_id: 'finding:dialog',
        kind: 'dialog',
        name: 'Help',
        stable_identity: `${APP}/${SCREEN}/dialog/Help`,
        attributes: { host: componentId },
      }),
      finding({
        finding_id: 'finding:test',
        kind: 'action_binding',
        name: 'all.test',
        stable_identity: `${APP}/${SCREEN}/action_binding/all.test`,
      }),
      finding({
        finding_id: 'finding:shot',
        kind: 'action_binding',
        name: 'all.shot',
        stable_identity: `${APP}/${SCREEN}/action_binding/all.shot`,
      }),
      finding({
        finding_id: 'finding:device',
        kind: 'widget',
        name: 'device-a',
        stable_identity: `${APP}/${SCREEN}/widget/device-a`,
      }),
    ];

    const graph = buildUiComponentGraphFromFacts({ findings });
    assertGraphContract(graph);
    expect(graph.edges.length).toBeGreaterThan(0);

    for (const edge of graph.edges) {
      const keys = Object.keys(edge).sort();
      expect(keys).toEqual(
        [
          'confidence',
          'edge_id',
          'extraction_method',
          'extractor_version',
          'relation',
          'schema_version',
          'source_identity',
          'span',
          'target_identity',
        ].sort(),
      );
    }
  });
});
