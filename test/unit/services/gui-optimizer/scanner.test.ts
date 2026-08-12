/**
 * VGO-002 — non-executing GUI static scanner core tests.
 *
 * Covers VGO-001 wire vocabulary conformance, deterministic exact facts,
 * confidence downgrades, stable anonymous identities, edge-target resolution,
 * malformed/invalid options, and a negative execution canary.
 */

// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  GUI_COMPONENT_KINDS,
  GUI_EXTRACTION_CONFIDENCE,
  GUI_EXTRACTION_METHODS,
  GUI_OPTIMIZER_SCHEMA_VERSION,
  GUI_STATIC_EXTRACTOR_VERSION,
  GUI_STATIC_SCANNER_INTERFACE,
  GUI_STATIC_SCAN_RESULT_SCHEMA,
  GUI_SOURCE_FINDING_INTERFACE,
  GUI_SOURCE_FINDING_SCHEMA,
  REGISTERED_OPTIMIZER_SCHEMA_VERSIONS,
  SOURCE_SPAN_INTERFACE,
  SOURCE_SPAN_SCHEMA,
  UI_DEPENDENCY_EDGE_INTERFACE,
  UI_DEPENDENCY_EDGE_SCHEMA,
  decodeGuiSourceFinding,
  decodeGuiStaticScanResult,
  decodeGuiExtractionConfidence,
  decodeGuiSourceSpan,
  decodeUiDependencyEdge,
  GuiModelDecodeError,
  worstGuiExtractionConfidence,
} from '../../../../src/services/gui-optimizer/models.js';
import {
  createGuiStaticScanner,
  scanGuiSource,
  scanGuiSources,
} from '../../../../src/services/gui-optimizer/scanner.js';

const APP = 'agent-supervisor';
const SCREEN = 'agent-supervisor';

function scan(
  path: string,
  content: string,
  language?: 'javascript' | 'jsx' | 'typescript' | 'tsx' | 'html' | 'css',
) {
  return scanGuiSource(
    { path, content, language },
    { applicationId: APP, screenId: SCREEN },
  );
}

function assertResolvedEdges(
  result: ReturnType<typeof scan>,
): void {
  const identities = new Set(result.findings.map(f => f.stable_identity));
  for (const edge of result.edges) {
    const target = edge.target_component_id;
    const source = edge.source_component_id;
    const targetOk =
      identities.has(target) || target.startsWith('unresolved:');
    const sourceOk =
      identities.has(source) || source.startsWith('unresolved:');
    expect(targetOk).toBe(true);
    expect(sourceOk).toBe(true);
    if (target.startsWith('unresolved:')) {
      expect(
        result.unresolved.some(u => u.includes('unresolved_target')),
      ).toBe(true);
    }
    expect(edge.interface).toBe(UI_DEPENDENCY_EDGE_INTERFACE);
    expect(edge.schema_version).toBe(UI_DEPENDENCY_EDGE_SCHEMA);
    expect(edge.extractor_version).toBe(GUI_STATIC_EXTRACTOR_VERSION);
  }
}

describe('GuiStaticScanner@1 closed models (VGO-001 mirror)', () => {
  it('exports fixed extractor version and closed confidence enum', () => {
    expect(GUI_STATIC_EXTRACTOR_VERSION).toBe('gui-static-scanner@1.0.0');
    expect(GUI_OPTIMIZER_SCHEMA_VERSION).toBe('gui-optimizer-canonical-json/v1');
    expect([...GUI_EXTRACTION_CONFIDENCE]).toEqual([
      'exact',
      'conservative',
      'heuristic',
      'opaque',
    ]);
    expect(worstGuiExtractionConfidence(['exact', 'opaque', 'conservative'])).toBe(
      'opaque',
    );
  });

  it('mirrors VGO-001 extraction methods and component kinds', () => {
    expect([...GUI_EXTRACTION_METHODS]).toEqual([
      'typescript_compiler_api',
      'jsx_parser',
      'html_parser',
      'css_parser',
      'template_literal_scan',
      'manifest_read',
      'registry_read',
      'heuristic_inference',
      'manual_annotation',
    ]);
    expect([...GUI_COMPONENT_KINDS]).toEqual([
      'screen',
      'dialog',
      'form',
      'button',
      'link',
      'input',
      'label',
      'menu',
      'list',
      'table',
      'panel',
      'tab',
      'nav',
      'icon',
      'image',
      'text',
      'composite',
      'host_boundary',
      'unknown',
    ]);
    expect(REGISTERED_OPTIMIZER_SCHEMA_VERSIONS).toContain(SOURCE_SPAN_SCHEMA);
    expect(REGISTERED_OPTIMIZER_SCHEMA_VERSIONS).toContain(
      UI_DEPENDENCY_EDGE_SCHEMA,
    );
  });

  it('decodes SourceSpan and UiDependencyEdge with Python wire keys', () => {
    const span = decodeGuiSourceSpan({
      interface: SOURCE_SPAN_INTERFACE,
      schema_version: SOURCE_SPAN_SCHEMA,
      path: 'web/js/apps/x.tsx',
      start_line: 1,
      start_column: 0,
      end_line: 2,
      end_column: 4,
    });
    expect(span.interface).toBe(SOURCE_SPAN_INTERFACE);
    expect(span.schema_version).toBe(SOURCE_SPAN_SCHEMA);

    const edge = decodeUiDependencyEdge({
      interface: UI_DEPENDENCY_EDGE_INTERFACE,
      schema_version: UI_DEPENDENCY_EDGE_SCHEMA,
      source_component_id: 'app/screen/component/A',
      target_component_id: 'app/screen/button/Save',
      relation: 'contains',
      extraction_method: 'jsx_parser',
      extractor_version: GUI_STATIC_EXTRACTOR_VERSION,
      confidence: 'exact',
      source_span: span,
      notes: '',
    });
    expect(edge.source_component_id).toBe('app/screen/component/A');
    expect(edge.target_component_id).toBe('app/screen/button/Save');
  });

  it('rejects unknown finding fields and invalid confidence values', () => {
    expect(() => decodeGuiExtractionConfidence('maybe')).toThrow(
      GuiModelDecodeError,
    );
    expect(() =>
      decodeGuiSourceFinding({
        interface: GUI_SOURCE_FINDING_INTERFACE,
        schema_version: GUI_SOURCE_FINDING_SCHEMA,
        finding_id: 'finding:1',
        kind: 'button',
        name: 'Save',
        stable_identity: 'app/screen/button/Save',
        path: 'web/js/apps/x.js',
        span: {
          interface: SOURCE_SPAN_INTERFACE,
          schema_version: SOURCE_SPAN_SCHEMA,
          path: 'web/js/apps/x.js',
          start_line: 1,
          start_column: 0,
          end_line: 1,
          end_column: 1,
        },
        confidence: 'exact',
        extraction_method: 'jsx_parser',
        extractor_version: GUI_STATIC_EXTRACTOR_VERSION,
        attributes: {},
        evidence: 'ok',
        requires_raw_source: false,
        language: 'tsx',
        occurrence: 1,
        extra_field: true,
      }),
    ).toThrow(/unknown GuiSourceFinding field/);
  });
});

describe('deterministic supported facts', () => {
  it('extracts React function components, JSX controls, props, and accessibility', () => {
    const source = `
import React, { useState } from 'react';

export function SavePanel({ mode }: { mode: string }) {
  const [value, setValue] = useState('');
  return (
    <form
      aria-label="Save form"
      data-testid="save-form"
      data-policy="save-policy"
      tabIndex={0}
      onKeyDown={() => {}}
    >
      <label htmlFor="title">Title</label>
      <input id="title" name="title" required aria-required="true" autoFocus />
      <button type="submit" data-action="save-item" className="primary">Save</button>
      <a href="/docs/security">Security</a>
    </form>
  );
}
`;
    const result = scan('web/js/apps/save-panel.tsx', source, 'tsx');
    expect(result.executed_code).toBe(false);
    expect(result.extractor_version).toBe(GUI_STATIC_EXTRACTOR_VERSION);
    expect(result.interface).toBe(GUI_STATIC_SCANNER_INTERFACE);
    expect(result.schema_version).toBe(GUI_STATIC_SCAN_RESULT_SCHEMA);

    const kinds = result.findings.map(f => f.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'component',
        'form',
        'button',
        'input',
        'label',
        'link',
        'accessibility',
        'action_binding',
        'state',
        'import',
        'route',
        'prop',
        'focus',
        'keyboard',
        'policy',
        'parent',
        'child',
      ]),
    );

    const component = result.findings.find(
      f => f.kind === 'component' && f.name === 'SavePanel',
    );
    expect(component?.confidence).toBe('exact');
    expect(component?.span.start_line).toBeGreaterThan(0);
    expect(component?.extractor_version).toBe(GUI_STATIC_EXTRACTOR_VERSION);
    expect(component?.attributes.component_kind).toBe('composite');

    const action = result.findings.find(
      f => f.kind === 'action_binding' && f.name === 'save-item',
    );
    expect(action?.confidence).toBe('exact');

    const props = result.findings.filter(f => f.kind === 'prop');
    expect(props.length).toBeGreaterThan(0);
    expect(result.findings.some(f => f.kind === 'focus')).toBe(true);
    expect(result.findings.some(f => f.kind === 'keyboard')).toBe(true);
    expect(result.findings.some(f => f.kind === 'policy')).toBe(true);

    const edgeRelations = result.edges.map(e => e.relation);
    expect(edgeRelations).toEqual(
      expect.arrayContaining([
        'renders',
        'contains',
        'invokes_action',
        'routes_to',
        'depends_on_policy',
      ]),
    );
    expect(
      result.edges.every(e => e.extractor_version === GUI_STATIC_EXTRACTOR_VERSION),
    ).toBe(true);

    assertResolvedEdges(result);

    const again = scan('web/js/apps/save-panel.tsx', source, 'tsx');
    expect(JSON.stringify(again)).toBe(JSON.stringify(result));

    expect(() =>
      decodeGuiStaticScanResult(JSON.parse(JSON.stringify(result))),
    ).not.toThrow();
  });

  it('extracts HTML template literals, confirmation controls, and CSS tokens', () => {
    const source = `
export class AgentSupervisorApp {
  renderRoot() {
    return \`
      <div class="agent-supervisor" data-agent-supervisor-root data-testid="agent-supervisor-app">
        <button type="button" data-action="refresh" data-supervisor-focusable>Refresh</button>
        <input type="checkbox" data-steering-confirm data-testid="steering-confirm" />
        <a class="as-link" href="docs/security.md" data-testid="security-link">Security</a>
        <form data-testid="steering-form">
          <textarea data-steering-prompt required></textarea>
          <button type="submit" data-action="submit-steering">Submit</button>
        </form>
      </div>
    \`;
  }
  renderStyles() {
    return \`
      .agent-supervisor { color: var(--as-fg); }
      @media (max-width: 900px) {
        .agent-supervisor { flex-direction: column; }
      }
    \`;
  }
}
`;
    const result = scan('web/js/apps/agent-supervisor.js', source, 'javascript');
    expect(result.findings.some(f => f.kind === 'template_html')).toBe(true);
    expect(
      result.findings.some(f => f.kind === 'button' && f.confidence === 'exact'),
    ).toBe(true);
    expect(result.findings.some(f => f.kind === 'confirmation')).toBe(true);
    expect(
      result.findings.some(f => f.kind === 'action_binding' && f.name === 'refresh'),
    ).toBe(true);
    expect(
      result.findings.some(f => f.kind === 'design_token' && f.name === '--as-fg'),
    ).toBe(true);
    expect(result.findings.some(f => f.kind === 'media_query')).toBe(true);
    expect(result.edges.some(e => e.relation === 'requires_confirmation')).toBe(
      true,
    );
    expect(result.edges.some(e => e.relation === 'uses_design_token')).toBe(true);
    expect(result.edges.some(e => e.relation === 'responsive_variant_of')).toBe(
      true,
    );
    assertResolvedEdges(result);
  });

  it('scans standalone HTML and CSS files with bounded tokenizers', () => {
    const html = scan(
      'fixtures/panel.html',
      `<main role="main">
        <form id="login">
          <label for="user">User</label>
          <input id="user" name="user" required />
          <button type="submit" data-action="login">Login</button>
        </form>
      </main>`,
      'html',
    );
    expect(html.findings.some(f => f.kind === 'form')).toBe(true);
    expect(
      html.findings.some(f => f.kind === 'validation' && f.name === 'required'),
    ).toBe(true);
    expect(html.findings.every(f => f.extraction_method === 'html_parser')).toBe(
      true,
    );
    assertResolvedEdges(html);

    const css = scan(
      'fixtures/panel.css',
      `:root { --brand: #123; }
       .panel { color: var(--brand); }
       @media (min-width: 600px) { .panel { display: grid; } }`,
      'css',
    );
    expect(css.findings.some(f => f.kind === 'design_token')).toBe(true);
    expect(css.findings.some(f => f.kind === 'media_query')).toBe(true);
    expect(css.findings.some(f => f.kind === 'style')).toBe(true);
    assertResolvedEdges(css);
  });
});

describe('confidence downgrades for dynamic uncertainty', () => {
  it('marks dangerouslySetInnerHTML and innerHTML mutation as opaque', () => {
    const source = `
function Bad({ html }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
function mutate(el, value) {
  el.innerHTML = value;
}
`;
    const result = scan('web/js/apps/bad.tsx', source, 'tsx');
    const opaque = result.findings.filter(f => f.confidence === 'opaque');
    expect(opaque.length).toBeGreaterThan(0);
    expect(
      opaque.some(
        f =>
          f.name.includes('dangerouslySetInnerHTML') ||
          f.name.includes('innerHTML') ||
          f.attributes.unresolved_cause === 'dynamic_html',
      ),
    ).toBe(true);
    expect(result.analysis_classification).toBe('opaque');
    expect(opaque.every(f => f.requires_raw_source)).toBe(true);
    expect(
      result.unresolved.some(
        u => u.includes('dynamic_html') || u.includes('opaque'),
      ),
    ).toBe(true);
  });

  it('downgrades imperative DOM, remote scripts, event delegation, and runtime forms', () => {
    const source = `
function wire(root) {
  const form = document.createElement('form');
  root.appendChild(form);
  root.querySelectorAll('[data-task-id]').forEach(node => {
    node.addEventListener('click', handler);
  });
  const script = document.createElement('script');
  script.src = 'https://cdn.example/widget.js';
  import('https://cdn.example/theme.css');
}
customElements.define('unknown-widget', class extends HTMLElement {});
`;
    const result = scan('web/js/apps/dynamic.js', source, 'javascript');
    expect(
      result.findings.some(
        f =>
          f.confidence === 'conservative' &&
          (f.name.includes('createElement') ||
            f.name.includes('appendChild') ||
            f.attributes.unresolved_cause === 'imperative_dom'),
      ),
    ).toBe(true);
    expect(
      result.findings.some(
        f =>
          f.kind === 'form' &&
          f.name === 'runtime_generated_form' &&
          f.confidence === 'opaque',
      ),
    ).toBe(true);
    expect(result.findings.some(f => f.kind === 'widget')).toBe(true);
    expect(
      result.findings.some(
        f =>
          f.kind === 'event_handler' &&
          (f.attributes.delegated === 'true' ||
            f.attributes.unresolved_cause === 'event_delegation'),
      ),
    ).toBe(true);
    expect(
      result.findings.some(
        f =>
          f.attributes.unresolved_cause === 'dynamic_style' ||
          f.kind === 'style',
      ),
    ).toBe(true);
    expect(result.unresolved.length).toBeGreaterThan(0);
    expect(result.analysis_classification).not.toBe('exact');
  });

  it('downgrades computed action names and unresolved browser globals', () => {
    const source = `
const action = 'submit-' + mode;
button.setAttribute('data-action', action);
window.supervisorBridge.dispatch(action);
globalThis[dynamicKey]();
`;
    const result = scan('web/js/apps/computed.js', source, 'javascript');
    expect(
      result.findings.some(
        f => f.kind === 'host_boundary' && f.confidence !== 'exact',
      ),
    ).toBe(true);
    expect(
      result.findings.some(
        f =>
          f.kind === 'action_binding' &&
          (f.confidence === 'opaque' ||
            f.attributes.unresolved_cause === 'computed_action'),
      ),
    ).toBe(true);
    expect(result.analysis_classification).not.toBe('exact');
    expect(
      result.unresolved.some(
        u =>
          u.includes('computed_action') ||
          u.includes('unresolved_global') ||
          u.includes('host_global'),
      ),
    ).toBe(true);
  });

  it('treats dynamic component construction and dynamic imports as opaque', () => {
    const source = `
function Dynamic({ Comp, name }) {
  const Tag = components[name];
  return <Tag {...props} />;
}
React.createElement(registry[kind], { id: 'x' });
const Lazy = React.lazy(() => import('./Widget'));
`;
    const result = scan('web/js/apps/dynamic-comp.tsx', source, 'tsx');
    expect(
      result.findings.some(
        f =>
          (f.kind === 'widget' ||
            f.kind === 'component' ||
            f.kind === 'element' ||
            f.kind === 'import') &&
          (f.confidence === 'opaque' ||
            f.attributes.__dynamic_component === 'true' ||
            f.attributes.unresolved_cause === 'dynamic_component' ||
            f.attributes.unresolved_cause === 'dynamic_import'),
      ),
    ).toBe(true);
    expect(result.analysis_classification).not.toBe('exact');
  });
});

describe('stable identities and edge resolution', () => {
  it('does not collide distinct anonymous elements and avoids line-number identities', () => {
    const source = `
export function List() {
  return (
    <div>
      <button type="button">One</button>
      <button type="button">Two</button>
      <button type="button">Three</button>
    </div>
  );
}
`;
    const result = scan('web/js/apps/list.tsx', source, 'tsx');
    const buttons = result.findings.filter(
      f => f.kind === 'button' && f.name === 'button',
    );
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    const identities = buttons.map(b => b.stable_identity);
    expect(new Set(identities).size).toBe(identities.length);
    for (const id of identities) {
      // Primary identity must not be a bare line number token.
      expect(id).not.toMatch(/\/\d+$/);
      expect(id).not.toMatch(/:line:\d+/);
    }
    // Occurrences are document-order ordinals, not source lines.
    const occurrences = buttons.map(b => b.occurrence).sort((a, b) => a - b);
    expect(occurrences[0]).toBe(1);
    expect(occurrences[occurrences.length - 1]).toBeGreaterThanOrEqual(3);
    assertResolvedEdges(result);
  });

  it('every emitted edge target resolves to an emitted identity or is unresolved', () => {
    const source = `
export function Panel() {
  return (
    <form data-testid="f">
      <button data-action="go" data-policy="p">Go</button>
    </form>
  );
}
`;
    const result = scan('web/js/apps/panel.tsx', source, 'tsx');
    assertResolvedEdges(result);
    expect(result.edges.some(e => e.relation === 'contains')).toBe(true);
    expect(result.edges.some(e => e.relation === 'renders')).toBe(true);
  });
});

describe('malformed source and invalid options', () => {
  it('does not label malformed source as exact overall', () => {
    const source = `
export function Broken( {
  return <div>
`;
    const result = scan('web/js/apps/broken.tsx', source, 'tsx');
    expect(result.analysis_classification).not.toBe('exact');
    expect(
      result.findings.some(
        f =>
          f.kind === 'dynamic_uncertainty' ||
          f.attributes.unresolved_cause === 'malformed_source' ||
          f.confidence !== 'exact',
      ),
    ).toBe(true);
  });

  it('rejects exact classification for invalid language and non-finite options', () => {
    const invalidLang = scanGuiSource(
      {
        path: 'web/js/apps/x.js',
        content: 'const x = 1;',
        language: 'python' as unknown as 'javascript',
      },
      { applicationId: APP, screenId: SCREEN },
    );
    expect(invalidLang.analysis_classification).not.toBe('exact');
    expect(
      invalidLang.unresolved.some(u => u.includes('invalid_language')),
    ).toBe(true);

    const badOpts = scanGuiSource(
      { path: 'web/js/apps/y.js', content: 'const y = 2;', language: 'javascript' },
      {
        applicationId: APP,
        screenId: SCREEN,
        maxSourceBytes: Number.NaN,
        maxAstNodes: Number.POSITIVE_INFINITY,
      },
    );
    expect(badOpts.analysis_classification).not.toBe('exact');
    expect(badOpts.unresolved.some(u => u.startsWith('options:'))).toBe(true);
  });
});

describe('negative execution canary', () => {
  it('does not execute arbitrary source payloads while still classifying them', () => {
    const marker = { ran: false };
    const hostile = `
throw new Error('SCANNER_EXECUTED_SOURCE');
eval('globalThis.__gui_optimizer_canary = true');
new Function('globalThis.__gui_optimizer_canary = true')();
process.exit(99);
`;
    const before = (globalThis as { __gui_optimizer_canary?: boolean })
      .__gui_optimizer_canary;
    const result = scan('web/js/apps/hostile.js', hostile, 'javascript');
    const after = (globalThis as { __gui_optimizer_canary?: boolean })
      .__gui_optimizer_canary;

    expect(result.executed_code).toBe(false);
    expect(after).toBe(before);
    expect(marker.ran).toBe(false);
    expect(
      result.findings.some(
        f =>
          f.kind === 'dynamic_uncertainty' &&
          (f.name === 'eval' ||
            f.name === 'new_Function' ||
            f.evidence.includes('eval')),
      ),
    ).toBe(true);
  });
});

describe('scanner API surface', () => {
  it('createGuiStaticScanner exposes the extractor version and multi-source scan', () => {
    const scanner = createGuiStaticScanner();
    expect(scanner.extractorVersion).toBe(GUI_STATIC_EXTRACTOR_VERSION);

    const multi = scanGuiSources(
      [
        {
          path: 'a.tsx',
          content:
            'export function A(){ return <button data-action="a">A</button>; }',
          language: 'tsx',
        },
        {
          path: 'b.css',
          content: '.a { color: var(--token-a); }',
          language: 'css',
        },
      ],
      { applicationId: APP, screenId: SCREEN },
    );
    expect(multi.sources).toEqual(['a.tsx', 'b.css']);
    expect(multi.findings.some(f => f.path === 'a.tsx')).toBe(true);
    expect(multi.findings.some(f => f.path === 'b.css')).toBe(true);
    expect(
      multi.findings.every(
        f => f.extractor_version === GUI_STATIC_EXTRACTOR_VERSION,
      ),
    ).toBe(true);
    assertResolvedEdges(multi);

    for (const edge of multi.edges) {
      expect(() =>
        decodeUiDependencyEdge(JSON.parse(JSON.stringify(edge))),
      ).not.toThrow();
    }
  });

  it('rejects absolute or parent-escaping paths', () => {
    expect(() =>
      scanGuiSource({ path: '/tmp/x.js', content: '1' }),
    ).toThrow(/invalid repository-relative path/);
    expect(() =>
      scanGuiSource({ path: '../secret.js', content: '1' }),
    ).toThrow(/invalid repository-relative path/);
  });
});
