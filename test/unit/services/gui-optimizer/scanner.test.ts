/**
 * VGO-002 — non-executing GUI static scanner core tests.
 *
 * Covers deterministic exact facts, confidence downgrades, closed model
 * decoders, extractor version binding, and a negative execution canary.
 */

import { describe, expect, it } from 'vitest';
import {
  GUI_EXTRACTION_CONFIDENCE,
  GUI_OPTIMIZER_SCHEMA_VERSION,
  GUI_STATIC_EXTRACTOR_VERSION,
  GUI_STATIC_SCANNER_INTERFACE,
  decodeGuiSourceFinding,
  decodeGuiStaticScanResult,
  decodeGuiExtractionConfidence,
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

describe('GuiStaticScanner@1 closed models', () => {
  it('exports a fixed extractor version and closed confidence enum', () => {
    expect(GUI_STATIC_EXTRACTOR_VERSION).toBe('gui-static-scanner@1.0.0');
    expect(GUI_OPTIMIZER_SCHEMA_VERSION).toBe('gui-optimizer/v1');
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

  it('rejects unknown finding fields and invalid confidence values', () => {
    expect(() => decodeGuiExtractionConfidence('maybe')).toThrow(GuiModelDecodeError);
    expect(() =>
      decodeGuiSourceFinding({
        schema_version: GUI_OPTIMIZER_SCHEMA_VERSION,
        finding_id: 'finding:1',
        kind: 'button',
        name: 'Save',
        stable_identity: 'app/screen/button/Save',
        path: 'web/js/apps/x.js',
        span: {
          path: 'web/js/apps/x.js',
          start_offset: 0,
          end_offset: 1,
          start_line: 1,
          start_column: 0,
          end_line: 1,
          end_column: 1,
        },
        confidence: 'exact',
        extraction_method: 'jsx_ast',
        extractor_version: GUI_STATIC_EXTRACTOR_VERSION,
        attributes: {},
        evidence: 'ok',
        requires_raw_source: false,
        language: 'tsx',
        extra_field: true,
      }),
    ).toThrow(/unknown GuiSourceFinding field/);
  });
});

describe('deterministic supported facts', () => {
  it('extracts React function components, JSX controls, and accessibility exactly', () => {
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
    </form>
  );
}
`;
    const result = scan('web/js/apps/save-panel.tsx', source, 'tsx');
    expect(result.executed_code).toBe(false);
    expect(result.extractor_version).toBe(GUI_STATIC_EXTRACTOR_VERSION);
    expect(result.interface_id).toBe(GUI_STATIC_SCANNER_INTERFACE);
    expect(result.schema_version).toBe(GUI_OPTIMIZER_SCHEMA_VERSION);

    const kinds = result.findings.map(f => f.kind);
    expect(kinds).toEqual(expect.arrayContaining([
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
    ]));

    const component = result.findings.find(
      f => f.kind === 'component' && f.name === 'SavePanel',
    );
    expect(component?.confidence).toBe('exact');
    expect(component?.span.start_line).toBeGreaterThan(0);
    expect(component?.extractor_version).toBe(GUI_STATIC_EXTRACTOR_VERSION);

    const action = result.findings.find(
      f => f.kind === 'action_binding' && f.name === 'save-item',
    );
    expect(action?.confidence).toBe('exact');

    const aria = result.findings.filter(f => f.kind === 'accessibility');
    expect(aria.length).toBeGreaterThan(0);
    expect(aria.every(f => f.confidence === 'exact' || f.confidence === 'conservative')).toBe(
      true,
    );

    const edgeRelations = result.edges.map(e => e.relation);
    expect(edgeRelations).toEqual(
      expect.arrayContaining(['renders', 'contains', 'invokes_action', 'routes_to']),
    );
    expect(result.edges.every(e => e.extractor_version === GUI_STATIC_EXTRACTOR_VERSION)).toBe(
      true,
    );

    // Determinism: identical inputs yield identical serializable results.
    const again = scan('web/js/apps/save-panel.tsx', source, 'tsx');
    expect(JSON.stringify(again)).toBe(JSON.stringify(result));

    // Closed decoder accepts the produced wire document.
    expect(() => decodeGuiStaticScanResult(JSON.parse(JSON.stringify(result)))).not.toThrow();
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
    expect(result.findings.some(f => f.kind === 'button' && f.confidence === 'exact')).toBe(
      true,
    );
    expect(result.findings.some(f => f.kind === 'confirmation')).toBe(true);
    expect(result.findings.some(f => f.kind === 'action_binding' && f.name === 'refresh')).toBe(
      true,
    );
    expect(result.findings.some(f => f.kind === 'design_token' && f.name === '--as-fg')).toBe(
      true,
    );
    expect(result.findings.some(f => f.kind === 'media_query')).toBe(true);
    expect(result.edges.some(e => e.relation === 'requires_confirmation')).toBe(true);
    expect(result.edges.some(e => e.relation === 'uses_design_token')).toBe(true);
    expect(result.edges.some(e => e.relation === 'responsive_variant_of')).toBe(true);
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
    expect(html.findings.some(f => f.kind === 'validation' && f.name === 'required')).toBe(
      true,
    );
    expect(html.findings.every(f => f.extraction_method === 'html_tokenizer')).toBe(true);

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
          f.evidence.toLowerCase().includes('html'),
      ),
    ).toBe(true);
    expect(result.analysis_classification).toBe('opaque');
    expect(opaque.every(f => f.requires_raw_source)).toBe(true);
  });

  it('downgrades imperative DOM, remote scripts, and runtime-generated forms', () => {
    const source = `
function wire(root) {
  const form = document.createElement('form');
  root.appendChild(form);
  root.querySelectorAll('[data-task-id]').forEach(node => {
    node.addEventListener('click', handler);
  });
  const script = document.createElement('script');
  script.src = 'https://cdn.example/widget.js';
}
customElements.define('unknown-widget', class extends HTMLElement {});
`;
    const result = scan('web/js/apps/dynamic.js', source, 'javascript');
    expect(
      result.findings.some(
        f =>
          f.confidence === 'conservative' &&
          (f.name.includes('createElement') || f.name.includes('appendChild')),
      ),
    ).toBe(true);
    expect(
      result.findings.some(
        f => f.kind === 'form' && f.name === 'runtime_generated_form' && f.confidence === 'opaque',
      ),
    ).toBe(true);
    expect(result.findings.some(f => f.kind === 'widget')).toBe(true);
    expect(result.unresolved.length).toBeGreaterThan(0);
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
    expect(result.analysis_classification).not.toBe('exact');
  });

  it('treats dynamic component construction as opaque or conservative', () => {
    const source = `
function Dynamic({ Comp, name }) {
  const Tag = components[name];
  return <Tag {...props} />;
}
React.createElement(registry[kind], { id: 'x' });
`;
    const result = scan('web/js/apps/dynamic-comp.tsx', source, 'tsx');
    expect(
      result.findings.some(
        f =>
          (f.kind === 'widget' || f.kind === 'component' || f.kind === 'element') &&
          (f.confidence === 'opaque' || f.attributes.__dynamic_component === 'true'),
      ),
    ).toBe(true);
  });
});

describe('negative execution canary', () => {
  it('does not execute arbitrary source payloads while still classifying them', () => {
    const marker = { ran: false };
    // If the scanner ever eval'd this source, the marker would flip via the
    // thrown side effect below. We only supply text; the host never binds it.
    const hostile = `
throw new Error('SCANNER_EXECUTED_SOURCE');
eval('globalThis.__gui_optimizer_canary = true');
new Function('globalThis.__gui_optimizer_canary = true')();
process.exit(99);
`;
    const before = (globalThis as { __gui_optimizer_canary?: boolean }).__gui_optimizer_canary;
    const result = scan('web/js/apps/hostile.js', hostile, 'javascript');
    const after = (globalThis as { __gui_optimizer_canary?: boolean }).__gui_optimizer_canary;

    expect(result.executed_code).toBe(false);
    expect(after).toBe(before);
    expect(marker.ran).toBe(false);
    expect(
      result.findings.some(
        f =>
          f.kind === 'dynamic_uncertainty' &&
          (f.name === 'eval' || f.name === 'new_Function' || f.evidence.includes('eval')),
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
          content: 'export function A(){ return <button data-action="a">A</button>; }',
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
    expect(multi.findings.every(f => f.extractor_version === GUI_STATIC_EXTRACTOR_VERSION)).toBe(
      true,
    );

    // Edges decode as closed records.
    for (const edge of multi.edges) {
      expect(() => decodeUiDependencyEdge(JSON.parse(JSON.stringify(edge)))).not.toThrow();
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
