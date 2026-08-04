/**
 * UIR-041: bounded DOM/ARIA import and web/desktop rendering (TypeScript).
 */
import { describe, expect, it } from 'vitest';
import {
  DOMARIA_UIIR_ADAPTER,
  UIIRWebRenderer,
  UIIRWebRendererError,
  UIIR_WEB_RENDERER_INTERFACE,
  UIIR_WEB_PROJECTION_SCHEMA_VERSION,
  importDomAriaToWeb,
  projectUIIRToWeb,
  renderWebAccessibleTree,
  sanitizeWebText,
  validateWebProjectionArtifact,
  type DomAriaDocumentInput,
  type WebProjectionRequest,
} from '../../src/services/mcp/ui-ux-ir-web-renderer';

function sampleDomDocument(): DomAriaDocumentInput {
  return {
    document_id: 'doc:web-form',
    title: 'Account form',
    root: {
      node_id: 'form',
      role: 'form',
      name: 'Account form',
      tag_name: 'form',
      css_inline: 'display:flex',
      children: [
        {
          node_id: 'email',
          role: 'textbox',
          name: 'Email',
          value: 'user@example.com',
          focus_order: 1,
          tag_name: 'input',
          attributes: { type: 'email' },
          states: { required: 'true', invalid: 'false' },
          actions: ['edit'],
          relationships: { labelledby: 'label-email' },
          validation: { valid: true, required: true },
        },
        {
          node_id: 'submit',
          role: 'button',
          name: 'Submit',
          focus_order: 2,
          tag_name: 'button',
          actions: ['activate', 'submit'],
          css_classes: ['btn', 'btn-primary'],
          framework_hints: { framework: 'react', component: 'PrimaryButton' },
        },
        {
          node_id: 'status',
          role: 'status',
          name: 'Ready',
          text_content: 'Form is ready',
          live: { politeness: 'polite', atomic: true },
        },
        {
          node_id: 'confirm',
          role: 'alertdialog',
          name: 'Confirm delete',
          focus_order: 0,
          actions: ['confirm', 'dismiss'],
          text_content: 'This cannot be undone',
        },
        {
          node_id: 'error',
          role: 'alert',
          name: 'Network error',
          live: { politeness: 'assertive' },
          text_content: 'Request failed',
        },
        {
          node_id: 'denial',
          role: 'alert',
          name: 'Permission denied',
          text_content: 'Authorization denied for this action',
        },
      ],
    },
  };
}

describe('sanitizeWebText', () => {
  it('strips scripts and executable markers without evaluating them', () => {
    const dirty =
      'Hello <script>alert(1)</script> world onclick=evil javascript:void(0)';
    const clean = sanitizeWebText(dirty);
    expect(clean.toLowerCase()).not.toContain('<script');
    expect(clean.toLowerCase()).not.toContain('javascript:');
    expect(clean.toLowerCase()).not.toContain('onclick');
    expect(clean).toContain('Hello');
    expect(clean).toContain('world');
  });
});

describe('importDomAriaToWeb', () => {
  it('preserves role/name/value/state/relationships/action/focus/live', () => {
    const artifact = importDomAriaToWeb(sampleDomDocument());
    expect(artifact.interface).toBe(UIIR_WEB_RENDERER_INTERFACE);
    expect(artifact.schema_version).toBe(UIIR_WEB_PROJECTION_SCHEMA_VERSION);
    expect(artifact.execution_performed).toBe(false);
    expect(artifact.nodes.length).toBeGreaterThan(0);
    expect(artifact.focus_order.length).toBeGreaterThan(0);

    const byRole = Object.fromEntries(artifact.nodes.map(n => [n.aria.role, n]));
    expect(byRole.button?.aria.name).toBe('Submit');
    expect(byRole.textbox?.aria.value).toBe('user@example.com');
    expect(byRole.textbox?.validation.required).toBe(true);
    expect(byRole.button?.actions.length).toBeGreaterThan(0);
    expect(byRole.status?.aria.live).toMatch(/polite|assertive/);
    expect(
      byRole.textbox?.aria.relationships.labelledby?.length ||
        byRole.textbox?.aria_attributes['aria-labelledby'],
    ).toBeTruthy();

    // Explicit focus order: confirm (0), email (1), submit (2)
    const focusIds = artifact.focus_order.map(e => e.node_id);
    expect(focusIds[0]).toContain('confirm');
    expect(focusIds).toEqual(
      expect.arrayContaining(
        artifact.nodes
          .filter(n => n.focus_index != null)
          .map(n => n.node_id),
      ),
    );

    // CSS / framework as source metadata or loss
    const categories = new Set(artifact.losses.map(l => l.category));
    expect(
      artifact.source_metadata.length > 0 || categories.has('source_metadata'),
    ).toBe(true);
    expect(String(artifact.loss_report.adapter)).toBe(DOMARIA_UIIR_ADAPTER);
  });

  it('sanitizes and never executes imported markup/scripts', () => {
    const artifact = importDomAriaToWeb({
      document_id: 'doc:evil',
      title: 'Evil',
      root: {
        node_id: 'root',
        role: 'main',
        name: 'Main',
        children: [
          {
            node_id: 'xss',
            role: 'button',
            name: 'Click <script>alert(1)</script>',
            tag_name: 'script',
            attributes: {
              onclick: 'alert(1)',
              href: 'javascript:alert(1)',
            },
          },
          {
            node_id: 'ok',
            role: 'button',
            name: 'Safe <script>x</script>',
            tag_name: 'button',
            attributes: {
              onclick: 'doEvil()',
              type: 'button',
            },
          },
        ],
      },
    });
    expect(artifact.execution_performed).toBe(false);
    expect(artifact.losses.some(l => l.category === 'rejected' || l.category === 'sanitized')).toBe(
      true,
    );
    // script node rejected
    expect(artifact.nodes.every(n => !n.node_id.includes('xss') || n.tag_name !== 'script')).toBe(
      true,
    );
    expect(artifact.nodes.some(n => n.node_id.includes('xss'))).toBe(false);
    const ok = artifact.nodes.find(n => n.node_id.includes('ok'));
    expect(ok).toBeTruthy();
    expect(ok!.attributes.onclick).toBeUndefined();
    expect(ok!.aria.name.toLowerCase()).not.toContain('<script');
    expect(ok!.text.toLowerCase()).not.toContain('<script');
  });

  it('renders confirmation and error visibly and accessibly', () => {
    const artifact = importDomAriaToWeb(sampleDomDocument());
    const critical = artifact.nodes.filter(n =>
      ['confirmation', 'error', 'alert', 'denial'].includes(n.surface),
    );
    expect(critical.length).toBeGreaterThan(0);
    for (const node of critical) {
      expect(node.visible).toBe(true);
      expect(node.accessible).toBe(true);
    }
    const confirm = artifact.nodes.find(n => n.surface === 'confirmation');
    expect(confirm).toBeTruthy();
    expect(confirm!.aria.live).toMatch(/assertive|polite/);
  });

  it('refuses empty adaptation when root is rejected', () => {
    expect(() =>
      importDomAriaToWeb({
        document_id: 'doc:bad',
        title: 'Bad',
        root: {
          node_id: 'only-script',
          role: 'button',
          name: 'X',
          tag_name: 'script',
        },
      }),
    ).toThrow(UIIRWebRendererError);
  });

  it('preserves form validation messages', () => {
    const artifact = importDomAriaToWeb({
      document_id: 'doc:val',
      title: 'Validation',
      root: {
        node_id: 'field',
        role: 'textbox',
        name: 'Username',
        value: '',
        focus_order: 0,
        tag_name: 'input',
        states: { invalid: 'true', required: 'true' },
        validation: {
          valid: false,
          message: 'Username is required',
          required: true,
          invalid_state: 'true',
        },
      },
    });
    const node = artifact.nodes[0];
    expect(node.validation.required).toBe(true);
    expect(node.validation.invalid_state).toBe('true');
    expect(node.interaction_state).toBe('invalid');
    expect(node.validation.message).toContain('required');
  });
});

describe('projectUIIRToWeb', () => {
  it('projects semantic items with denial/error/confirmation visible', () => {
    const request: WebProjectionRequest = {
      document_id: 'doc:w',
      title: 'Web pilot',
      items: [
        {
          item_id: 'action_submit',
          semantic_kind: 'action',
          mandatory: true,
          label: 'Submit',
          order: 10,
        },
        {
          item_id: 'confirm_delete',
          semantic_kind: 'confirmation',
          mandatory: true,
          label: 'Confirm delete',
          order: 5,
        },
        {
          item_id: 'error_surface',
          semantic_kind: 'error',
          mandatory: true,
          label: 'Something failed',
          order: 1,
        },
        {
          item_id: 'denial_surface',
          semantic_kind: 'denial',
          mandatory: true,
          label: 'Not authorized',
          order: 2,
        },
        {
          item_id: 'feedback_pending',
          semantic_kind: 'feedback',
          mandatory: true,
          label: 'Working',
          order: 15,
        },
      ],
    };
    const artifact = projectUIIRToWeb(request);
    expect(artifact.execution_performed).toBe(false);
    expect(artifact.policy_owner).toBe('UIProjectionSolver@1');
    const surfaces = new Set(artifact.nodes.map(n => n.surface));
    expect(surfaces.has('confirmation')).toBe(true);
    expect(surfaces.has('error')).toBe(true);
    expect(surfaces.has('denial')).toBe(true);
    for (const node of artifact.nodes) {
      if (['denial', 'error', 'confirmation'].includes(node.surface)) {
        expect(node.visible).toBe(true);
        expect(node.accessible).toBe(true);
        if (node.surface === 'denial' || node.surface === 'error') {
          expect(node.aria.live).toBe('assertive');
        }
      }
    }
    expect(artifact.focus_order.length).toBeGreaterThan(0);
  });

  it('routes dom_aria documents through the import path', () => {
    const artifact = projectUIIRToWeb({ dom_aria: sampleDomDocument() });
    expect(artifact.artifact_id).toContain('dom-aria');
    expect(artifact.nodes.some(n => n.aria.role === 'button')).toBe(true);
  });
});

describe('renderWebAccessibleTree and UIIRWebRenderer', () => {
  it('renders a side-effect-free accessible tree', () => {
    const artifact = projectUIIRToWeb({
      document_id: 'doc:tree',
      items: [
        { item_id: 'a', semantic_kind: 'action', label: 'Go', mandatory: true },
        { item_id: 'e', semantic_kind: 'error', label: 'Fail', mandatory: true },
      ],
    });
    const tree = renderWebAccessibleTree(artifact);
    expect(tree.execution_performed).toBe(false);
    expect(tree.interface).toBe(UIIR_WEB_RENDERER_INTERFACE);
    expect(tree.nodes.length).toBe(artifact.nodes.length);
    expect(tree.focus_order.length).toBeGreaterThan(0);
    const blob = JSON.stringify(tree).toLowerCase();
    expect(blob).not.toContain('<script');
    expect(blob).not.toContain('javascript:');
  });

  it('exposes class API matching UIIRWebRenderer@1', () => {
    const renderer = new UIIRWebRenderer();
    expect(renderer.interface).toBe(UIIR_WEB_RENDERER_INTERFACE);
    const artifact = renderer.project({ dom_aria: sampleDomDocument() });
    const tree = renderer.render(artifact);
    expect(tree.execution_performed).toBe(false);
    expect(tree.nodes.length).toBe(artifact.nodes.length);
  });

  it('validates artifacts fail-closed on execution_performed', () => {
    const artifact = projectUIIRToWeb({
      document_id: 'doc:v',
      items: [{ item_id: 'a', semantic_kind: 'action', label: 'A' }],
    });
    const ok = validateWebProjectionArtifact(artifact);
    expect(ok.valid).toBe(true);
    const bad = validateWebProjectionArtifact({
      ...artifact,
      execution_performed: true,
    });
    expect(bad.valid).toBe(false);
    expect(bad.errors.some(e => e.includes('execution_performed'))).toBe(true);
  });
});
