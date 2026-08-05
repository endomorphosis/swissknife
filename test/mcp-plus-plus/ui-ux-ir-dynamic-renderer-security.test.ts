/**
 * UIR-035: UIIRDynamicRendererSecurity@1
 *
 * Hostile descriptor/result payloads, CSP/escaping, direct-network spy,
 * and governed invocation receipt coverage.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  ORBDynamicAppRenderer,
  UIIR_DYNAMIC_RENDERER_SECURITY_INTERFACE,
  escapeHtml,
  looksHostile,
  sanitizeDescriptorText,
  type IDLDescriptor,
  type GovernedOrbInvoker,
} from '../../web/src/orb-dynamic-app-renderer.ts';

function hostileDescriptor(): IDLDescriptor {
  return {
    name: 'evil"><script>alert(1)</script>',
    namespace: 'ns<script>',
    version: '1.0.0',
    ui: {
      display_name: '<img src=x onerror=alert(1)>',
      icon: 'javascript:alert(1)',
    },
    ui_ir_cid: 'bafyuiirtest',
    action_binding_id: 'binding:submit',
    policy_cid: 'bafypolicy',
    methods: [
      {
        name: 'run"><script>',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
          },
          required: ['prompt'],
        },
        outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
      },
    ],
  };
}

describe('UIIRDynamicRendererSecurity@1', () => {
  it('exports the stable interface identity', () => {
    expect(UIIR_DYNAMIC_RENDERER_SECURITY_INTERFACE).toBe(
      'UIIRDynamicRendererSecurity@1',
    );
  });

  it('escapes and detects hostile markup', () => {
    expect(escapeHtml('<script>x</script>')).toBe(
      '&lt;script&gt;x&lt;/script&gt;',
    );
    expect(looksHostile('javascript:alert(1)')).toBe(true);
    expect(looksHostile('safe label')).toBe(false);
    expect(sanitizeDescriptorText('<script>bad</script>')).toContain(
      'blocked unsafe content',
    );
  });

  it('renders hostile descriptors as inert HTML (no raw script/url injection)', () => {
    const renderer = new ORBDynamicAppRenderer({
      governedInvoker: async () => ({ outcome: 'deny', explanation: 'n/a' }),
    });
    const html = renderer.renderApp(hostileDescriptor());

    expect(html).toContain(UIIR_DYNAMIC_RENDERER_SECURITY_INTERFACE);
    // Raw executable fragments must not appear unescaped.
    expect(html).not.toMatch(/<script>/i);
    expect(html).not.toMatch(/onerror=/i);
    expect(html).not.toMatch(/javascript:/i);
    // Escaped or neutralized forms are present.
    expect(html.includes('&lt;') || html.includes('blocked unsafe')).toBe(true);
  });

  it('blocks direct HTTP when no governed invoker is configured', async () => {
    const fetchSpy = vi.fn();
    // @ts-expect-error test spy
    globalThis.fetch = fetchSpy;

    const renderer = new ORBDynamicAppRenderer({ blockDirectHttp: true });
    const container = document.createElement('div');
    const descriptor = hostileDescriptor();
    container.innerHTML = renderer.renderApp(descriptor);
    renderer.bindEvents(container, descriptor);

    const btn = container.querySelector('.orb-invoke-btn') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    await btn.click();
    // allow microtasks from async handler
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(renderer.blockedDirectHttpAttempts.length).toBeGreaterThan(0);
    const panel = container.querySelector('.orb-result-panel')!;
    expect(panel.textContent || '').toMatch(/blocked|governed|deny/i);
    // Denial remains visible/accessible.
    expect(panel.querySelector('[role="alert"], [role="alertdialog"]')).toBeTruthy();
  });

  it('routes allow outcomes only through the governed invoker', async () => {
    const calls: unknown[] = [];
    const invoker: GovernedOrbInvoker = async (req) => {
      calls.push(req);
      return {
        outcome: 'allow',
        data: { ok: true, note: '<script>xss</script>' },
        decisionId: 'dec-1',
        receiptId: 'rcpt-1',
      };
    };
    const fetchSpy = vi.fn();
    // @ts-expect-error test spy
    globalThis.fetch = fetchSpy;

    const renderer = new ORBDynamicAppRenderer({ governedInvoker: invoker });
    const container = document.createElement('div');
    const descriptor: IDLDescriptor = {
      name: 'safe-app',
      methods: [
        {
          name: 'list_datasets',
          inputSchema: { type: 'object', properties: {} },
          outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
        },
      ],
      ui_ir_cid: 'bafyui',
      action_binding_id: 'binding:list',
      policy_cid: 'bafypol',
    };
    container.innerHTML = renderer.renderApp(descriptor);
    renderer.bindEvents(container, descriptor);
    await (container.querySelector('.orb-invoke-btn') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    const req = calls[0] as { method: string; uiIrCid?: string; policyCid?: string };
    expect(req.method).toBe('list_datasets');
    expect(req.uiIrCid).toBe('bafyui');
    expect(req.policyCid).toBe('bafypol');

    const panel = container.querySelector('.orb-result-panel')!;
    // Result payload script is escaped, not live.
    expect(panel.innerHTML).not.toMatch(/<script>xss<\/script>/i);
    expect(panel.innerHTML).toMatch(/&lt;script&gt;xss&lt;\/script&gt;/);
    expect(panel.textContent || '').toMatch(/decision: dec-1|rcpt-1/);
  });

  it('keeps denial and confirmation visible with accessible roles', async () => {
    const invoker: GovernedOrbInvoker = async () => ({
      outcome: 'require_confirmation',
      explanation: 'Confirm destructive action',
      decisionId: 'dec-confirm',
    });
    const renderer = new ORBDynamicAppRenderer({ governedInvoker: invoker });
    const container = document.createElement('div');
    const descriptor: IDLDescriptor = {
      name: 'app',
      methods: [
        {
          name: 'delete',
          inputSchema: { type: 'object', properties: {} },
          outputSchema: { type: 'object', properties: {} },
        },
      ],
    };
    container.innerHTML = renderer.renderApp(descriptor);
    renderer.bindEvents(container, descriptor);
    await (container.querySelector('.orb-invoke-btn') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));

    const panel = container.querySelector('.orb-result-panel')!;
    expect(panel.querySelector('[role="alertdialog"]')).toBeTruthy();
    expect(panel.textContent || '').toMatch(/REQUIRE_CONFIRMATION|Confirm destructive/i);
  });
});
