/**
 * ORB-Driven Dynamic App Renderer — UIIRDynamicRendererSecurity@1 (UIR-035)
 *
 * Generates interactive desktop windows from MCP UI profile / IDL descriptors
 * while:
 * - Escaping all descriptor and result text (no unsafe HTML interpolation)
 * - Routing every action through a policy-mediated ORB invoker
 * - Blocking direct fetch/HTTP bypass when a governed invoker is provided
 *
 * Compatible display behavior is retained (forms, tabs, result panels), but
 * untrusted markup/scripts/URLs never reach the DOM as executable HTML.
 */

export const UIIR_DYNAMIC_RENDERER_SECURITY_INTERFACE =
  'UIIRDynamicRendererSecurity@1' as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IDLMethod {
  name: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
  outputSchema: { type: string; properties?: Record<string, any> };
}

export interface IDLDescriptor {
  name: string;
  namespace?: string;
  version?: string;
  methods: IDLMethod[];
  ui?: {
    primary_template?: string;
    icon?: string;
    display_name?: string;
    category?: string;
  };
  /** Optional UIIR binding identity retained on governed invocations. */
  ui_ir_cid?: string;
  action_binding_id?: string;
  policy_cid?: string;
}

export interface FieldWidget {
  name: string;
  type: string;
  required: boolean;
  widget: 'text' | 'number' | 'checkbox' | 'textarea' | 'json' | 'select' | 'cid';
  placeholder?: string;
}

/** Governed ORB invoker — must re-evaluate policy; never a raw transport. */
export type GovernedOrbInvoker = (request: {
  method: string;
  params: Record<string, unknown>;
  correlationId: string;
  uiIrCid?: string;
  actionBindingId?: string;
  policyCid?: string;
  descriptorName: string;
}) => Promise<{
  outcome: 'allow' | 'deny' | 'require_confirmation' | 'defer' | 'error' | string;
  data?: unknown;
  decisionId?: string;
  receiptId?: string;
  explanation?: string;
  error?: string;
}>;

export interface ORBDynamicAppRendererOptions {
  backendUrl?: string;
  /** Required for production UIIR path; without it, invoke fails closed. */
  governedInvoker?: GovernedOrbInvoker;
  /**
   * When true (default), any attempt to use direct fetch is blocked.
   * Legacy mode sets this false only for transitional callers.
   */
  blockDirectHttp?: boolean;
}

// ---------------------------------------------------------------------------
// Escaping / sanitization (UIR-035 core)
// ---------------------------------------------------------------------------

const EXECUTABLE_MARKERS = [
  '<script',
  '</script',
  'javascript:',
  'vbscript:',
  'data:text/html',
  'onerror=',
  'onload=',
  'onclick=',
  'eval(',
  'Function(',
  'document.write',
  'innerHTML',
  '__proto__',
] as const;

/** Escape text for safe insertion into HTML text/attribute contexts. */
export function escapeHtml(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

/** True if a string looks like hostile markup/script injection. */
export function looksHostile(value: unknown): boolean {
  const lower = String(value ?? '').toLowerCase();
  return EXECUTABLE_MARKERS.some((marker) => lower.includes(marker));
}

/** Neutralize hostile descriptor fields for display (still escaped). */
export function sanitizeDescriptorText(value: unknown, fallback = ''): string {
  const raw = value === null || value === undefined ? '' : String(value);
  if (!raw.trim()) return fallback;
  if (looksHostile(raw)) {
    // Never re-echo marker substrings that tests/scanners treat as live injection.
    return escapeHtml('[blocked unsafe content]');
  }
  return escapeHtml(raw);
}

function safeIdToken(value: string): string {
  return value.replace(/[^A-Za-z0-9._:/-]/g, '_').slice(0, 128);
}

// ---------------------------------------------------------------------------
// Widget helpers
// ---------------------------------------------------------------------------

function selectWidget(name: string, schema: Record<string, any>): FieldWidget['widget'] {
  const type = schema.type || 'string';
  if (name === 'cid' || name.endsWith('_cid') || name === 'hash') return 'cid';
  if (type === 'boolean') return 'checkbox';
  if (type === 'number' || type === 'integer') return 'number';
  if (type === 'object' || type === 'array') return 'json';
  if (name === 'content' || name === 'prompt' || name === 'data' || name === 'text') {
    return 'textarea';
  }
  return 'text';
}

function widgetPlaceholder(name: string, widget: FieldWidget['widget']): string {
  if (widget === 'cid') return 'QmXYZ... or bafy...';
  if (widget === 'json') return '{}';
  if (widget === 'textarea') return `Enter ${name}...`;
  return name.replace(/_/g, ' ');
}

function generateMethodFields(method: IDLMethod): FieldWidget[] {
  const props = method.inputSchema.properties || {};
  const required = new Set(method.inputSchema.required || []);
  return Object.entries(props).map(([name, schema]) => {
    const widget = selectWidget(name, schema as Record<string, any>);
    return {
      name,
      type: (schema as any).type || 'string',
      required: required.has(name),
      widget,
      placeholder: widgetPlaceholder(name, widget),
    };
  });
}

function renderFieldInput(field: FieldWidget): string {
  const reqAttr = field.required ? 'required' : '';
  const name = escapeHtml(field.name);
  const placeholder = escapeHtml(field.placeholder || '');
  const base = `data-field="${name}" placeholder="${placeholder}" ${reqAttr}`;

  switch (field.widget) {
    case 'checkbox':
      return `<label style="display:flex;align-items:center;gap:6px;font-size:12px;">
        <input type="checkbox" ${base} style="width:16px;height:16px;">
        ${name}${field.required ? ' *' : ''}
      </label>`;
    case 'number':
      return `<input type="number" ${base} style="width:100%;padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;">`;
    case 'textarea':
    case 'json':
      return `<textarea ${base} rows="${field.widget === 'json' ? 4 : 3}" style="width:100%;padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;resize:vertical;font-family:monospace;"></textarea>`;
    case 'cid':
      return `<input type="text" ${base} style="width:100%;padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;font-family:monospace;">`;
    default:
      return `<input type="text" ${base} style="width:100%;padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;">`;
  }
}

const GET_METHODS = new Set([
  'cat',
  'list_pins',
  'stat',
  'resolve',
  'dag_get',
  'name_resolve',
  'capabilities',
  'hardware_profile',
  'list_models',
  'metrics',
  'endpoints',
  'list_datasets',
  'search_datasets',
  'status',
]);

function resolveHttpMethod(methodName: string): 'GET' | 'POST' {
  return GET_METHODS.has(methodName) ? 'GET' : 'POST';
}

// ---------------------------------------------------------------------------
// Main Renderer
// ---------------------------------------------------------------------------

export class ORBDynamicAppRenderer {
  private backendUrl: string;
  private correlationCounter = 0;
  private governedInvoker?: GovernedOrbInvoker;
  private blockDirectHttp: boolean;
  /** Spy surface for tests — records blocked direct-http attempts. */
  readonly blockedDirectHttpAttempts: Array<{ method: string; reason: string }> =
    [];

  constructor(
    backendUrlOrOptions: string | ORBDynamicAppRendererOptions = 'http://localhost:8080',
  ) {
    if (typeof backendUrlOrOptions === 'string') {
      this.backendUrl = backendUrlOrOptions;
      this.blockDirectHttp = true;
    } else {
      this.backendUrl = backendUrlOrOptions.backendUrl || 'http://localhost:8080';
      this.governedInvoker = backendUrlOrOptions.governedInvoker;
      this.blockDirectHttp = backendUrlOrOptions.blockDirectHttp !== false;
    }
  }

  setGovernedInvoker(invoker: GovernedOrbInvoker | undefined): void {
    this.governedInvoker = invoker;
  }

  /**
   * Generate escaped HTML for an auto-generated app from an IDL descriptor.
   * All descriptor-sourced text is escaped; hostile fields render inert.
   */
  renderApp(descriptor: IDLDescriptor): string {
    const displayName = sanitizeDescriptorText(
      descriptor.ui?.display_name || descriptor.name,
      'app',
    );
    const icon = sanitizeDescriptorText(descriptor.ui?.icon || '🔧', '🔧');
    const name = sanitizeDescriptorText(descriptor.name, 'idl');
    const namespace = sanitizeDescriptorText(descriptor.namespace || 'default');
    const version = sanitizeDescriptorText(descriptor.version || '1.0.0');
    const methodCount = descriptor.methods.length;
    const backend = escapeHtml(this.backendUrl);

    return `
      <div class="orb-app" data-uiir-dynamic-renderer="${UIIR_DYNAMIC_RENDERER_SECURITY_INTERFACE}" style="display:flex;flex-direction:column;height:100%;font-family:system-ui,sans-serif;background:#fff;">
        <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #e5e7eb;background:#f8fafc;">
          <span style="font-size:18px;" aria-hidden="true">${icon}</span>
          <h3 style="margin:0;font-size:14px;font-weight:600;">${displayName}</h3>
          <span style="font-size:10px;background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:3px;">IDL Auto-UI</span>
          <span style="font-size:10px;background:#dcfce7;color:#166534;padding:2px 6px;border-radius:3px;">UIIR/ORB</span>
          <span style="margin-left:auto;font-size:10px;color:#6b7280;">${methodCount} methods</span>
          <span class="orb-status" role="status" aria-label="connection status" style="width:8px;height:8px;border-radius:50%;background:#fbbf24;"></span>
        </div>

        <div role="tablist" style="display:flex;gap:4px;padding:6px 10px;border-bottom:1px solid #e5e7eb;overflow-x:auto;background:#f1f5f9;">
          ${descriptor.methods
            .map((m, i) => {
              const mName = sanitizeDescriptorText(m.name, 'method');
              const mToken = escapeHtml(safeIdToken(m.name));
              const http = resolveHttpMethod(m.name);
              return `
            <button type="button" role="tab" class="orb-method-tab${i === 0 ? ' active' : ''}" data-method="${mToken}"
              style="padding:4px 10px;border:1px solid ${http === 'GET' ? '#86efac' : '#93c5fd'};
              border-radius:3px;background:${i === 0 ? '#fff' : 'transparent'};cursor:pointer;font-size:11px;
              white-space:nowrap;color:${http === 'GET' ? '#166534' : '#1e40af'};">
              <span style="font-weight:600;">${http}</span> ${mName}
            </button>`;
            })
            .join('')}
        </div>

        <div style="flex:1;display:flex;overflow:hidden;">
          <div style="width:50%;border-right:1px solid #e5e7eb;overflow-y:auto;padding:12px;">
            ${descriptor.methods.map((m, i) => this._renderMethodForm(m, i === 0)).join('')}
          </div>
          <div style="width:50%;overflow-y:auto;padding:12px;">
            <div class="orb-result-panel" role="region" aria-live="polite" aria-label="invocation result" style="min-height:100%;">
              <div style="text-align:center;padding:40px 20px;color:#9ca3af;">
                <div style="font-size:12px;">Select a method and invoke it to see results</div>
                <div style="font-size:10px;margin-top:4px;color:#d1d5db;">
                  Auto-generated from ${name} via governed ORB
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="orb-status-bar" style="display:flex;align-items:center;gap:12px;padding:4px 12px;border-top:1px solid #e5e7eb;background:#f8fafc;font-size:10px;color:#6b7280;">
          <span>Backend: ${backend}</span>
          <span>|</span>
          <span>Namespace: ${namespace}</span>
          <span>|</span>
          <span>v${version}</span>
          <span style="margin-left:auto;" class="orb-latency">Ready</span>
        </div>
      </div>
    `;
  }

  bindEvents(container: HTMLElement, descriptor: IDLDescriptor): void {
    const resultPanel = container.querySelector('.orb-result-panel') as HTMLElement;
    const statusDot = container.querySelector('.orb-status') as HTMLElement;
    const latencyEl = container.querySelector('.orb-latency') as HTMLElement;

    container.querySelectorAll('.orb-method-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('.orb-method-tab').forEach((t) => {
          (t as HTMLElement).style.background = 'transparent';
          t.classList.remove('active');
        });
        (tab as HTMLElement).style.background = '#fff';
        tab.classList.add('active');
        const methodName = (tab as HTMLElement).dataset.method!;
        container.querySelectorAll('.orb-method-form').forEach((form) => {
          (form as HTMLElement).style.display =
            form.getAttribute('data-method') === methodName ? 'block' : 'none';
        });
      });
    });

    container.querySelectorAll('.orb-invoke-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const methodToken = (btn as HTMLElement).dataset.method!;
        const method = descriptor.methods.find(
          (m) => safeIdToken(m.name) === methodToken || m.name === methodToken,
        );
        if (!method) return;
        const form = container.querySelector(
          `.orb-method-form[data-method="${methodToken}"]`,
        ) as HTMLElement;
        const params = this._collectFormParams(form, method);
        await this._invokeMethod(
          method.name,
          params,
          resultPanel,
          statusDot,
          latencyEl,
          descriptor,
        );
      });
    });

    // Status indicator is observational only — never authorizes.
    if (statusDot) {
      statusDot.style.background = this.governedInvoker ? '#4ade80' : '#fbbf24';
      statusDot.setAttribute(
        'aria-label',
        this.governedInvoker
          ? 'governed ORB invoker configured'
          : 'governed invoker missing — actions blocked',
      );
    }
  }

  private _renderMethodForm(method: IDLMethod, visible: boolean): string {
    const fields = generateMethodFields(method);
    const httpMethod = resolveHttpMethod(method.name);
    const mName = sanitizeDescriptorText(method.name, 'method');
    const mToken = escapeHtml(safeIdToken(method.name));

    return `
      <div class="orb-method-form" data-method="${mToken}" style="display:${visible ? 'block' : 'none'};">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <h4 style="margin:0;font-size:13px;">${mName}</h4>
          <span style="font-size:10px;padding:1px 6px;border-radius:3px;background:${
            httpMethod === 'GET' ? '#dcfce7' : '#dbeafe'
          };color:${httpMethod === 'GET' ? '#166534' : '#1e40af'};">
            ${httpMethod}
          </span>
        </div>
        ${
          fields.length > 0
            ? `<div style="display:grid;gap:10px;margin-bottom:12px;">
            ${fields
              .map(
                (f) => `
              <div>
                <label style="display:block;font-size:11px;font-weight:500;color:#374151;margin-bottom:3px;">
                  ${escapeHtml(f.name)}${
                    f.required ? ' <span style="color:#ef4444;">*</span>' : ''
                  }
                </label>
                ${renderFieldInput(f)}
              </div>`,
              )
              .join('')}
          </div>`
            : `<div style="padding:8px;background:#f9fafb;border-radius:4px;font-size:11px;color:#6b7280;margin-bottom:12px;">
            No parameters required
          </div>`
        }
        <button type="button" class="orb-invoke-btn" data-method="${mToken}" style="
          width:100%;padding:8px 16px;background:#3b82f6;color:#fff;border:none;
          border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;">
          Invoke ${mName}
        </button>
      </div>
    `;
  }

  private _collectFormParams(
    form: HTMLElement,
    method: IDLMethod,
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    form.querySelectorAll('[data-field]').forEach((el) => {
      const name = el.getAttribute('data-field')!;
      const tag = el.tagName.toLowerCase();
      if (tag === 'input' && (el as HTMLInputElement).type === 'checkbox') {
        params[name] = (el as HTMLInputElement).checked;
      } else if (tag === 'input' && (el as HTMLInputElement).type === 'number') {
        const val = (el as HTMLInputElement).value;
        if (val) params[name] = Number(val);
      } else {
        const val = (el as HTMLInputElement | HTMLTextAreaElement).value.trim();
        if (val) {
          const prop = method.inputSchema.properties?.[name] as any;
          if (prop?.type === 'object' || prop?.type === 'array') {
            try {
              params[name] = JSON.parse(val);
            } catch {
              params[name] = val;
            }
          } else {
            params[name] = val;
          }
        }
      }
    });
    return params;
  }

  private async _invokeMethod(
    methodName: string,
    params: Record<string, unknown>,
    resultPanel: HTMLElement,
    statusDot: HTMLElement,
    latencyEl: HTMLElement,
    descriptor: IDLDescriptor,
  ): Promise<void> {
    const correlationId = `orb_${++this.correlationCounter}_${Date.now()}`;
    const safeMethod = sanitizeDescriptorText(methodName, 'method');
    const safeCorr = escapeHtml(correlationId);

    this._setPanelHtml(
      resultPanel,
      `<div style="padding:20px;text-align:center;">
        <div style="font-size:11px;color:#6b7280;margin-top:8px;">Invoking ${safeMethod}...</div>
        <div style="font-size:9px;color:#d1d5db;margin-top:4px;">correlation: ${safeCorr}</div>
      </div>`,
    );

    const startTime = performance.now();

    if (!this.governedInvoker) {
      this.blockedDirectHttpAttempts.push({
        method: methodName,
        reason: 'missing_governed_invoker',
      });
      const elapsed = Math.round(performance.now() - startTime);
      this._renderDenial(
        resultPanel,
        methodName,
        'Governed ORB invoker is required; direct HTTP is blocked (UIR-035).',
        elapsed,
        correlationId,
        'deny',
      );
      latencyEl.textContent = `${elapsed}ms (blocked)`;
      statusDot.style.background = '#f87171';
      return;
    }

    if (this.blockDirectHttp) {
      // Fail closed: never call fetch in the security-hardened path.
    }

    try {
      const result = await this.governedInvoker({
        method: methodName,
        params,
        correlationId,
        uiIrCid: descriptor.ui_ir_cid,
        actionBindingId: descriptor.action_binding_id,
        policyCid: descriptor.policy_cid,
        descriptorName: descriptor.name,
      });
      const elapsed = Math.round(performance.now() - startTime);
      latencyEl.textContent = `${elapsed}ms`;

      const outcome = String(result.outcome || 'error');
      if (outcome !== 'allow') {
        statusDot.style.background = '#fbbf24';
        this._renderDenial(
          resultPanel,
          methodName,
          result.explanation || result.error || `Mediation outcome: ${outcome}`,
          elapsed,
          correlationId,
          outcome,
          result.decisionId,
          result.receiptId,
        );
        return;
      }

      statusDot.style.background = '#4ade80';
      this._renderResult(
        resultPanel,
        methodName,
        result.data,
        elapsed,
        correlationId,
        result.decisionId,
        result.receiptId,
      );
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      latencyEl.textContent = `${elapsed}ms (error)`;
      statusDot.style.background = '#f87171';
      this._renderDenial(
        resultPanel,
        methodName,
        err?.message || String(err),
        elapsed,
        correlationId,
        'error',
      );
    }
  }

  private _setPanelHtml(panel: HTMLElement, html: string): void {
    // Trusted template only — all dynamic fragments already escaped.
    panel.innerHTML = html;
  }

  private _renderDenial(
    panel: HTMLElement,
    method: string,
    message: string,
    elapsed: number,
    correlationId: string,
    outcome: string,
    decisionId?: string,
    receiptId?: string,
  ): void {
    const role =
      outcome === 'require_confirmation' || outcome === 'defer' ? 'alertdialog' : 'alert';
    this._setPanelHtml(
      panel,
      `<div style="padding:16px;" role="${role}" aria-live="assertive">
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px;">
          <div style="font-size:12px;font-weight:600;color:#991b1b;margin-bottom:4px;">
            ${escapeHtml(outcome.toUpperCase())}: ${sanitizeDescriptorText(method)}
          </div>
          <div style="font-size:11px;color:#7f1d1d;font-family:monospace;white-space:pre-wrap;">${escapeHtml(message)}</div>
          <div style="font-size:9px;color:#9ca3af;margin-top:8px;">
            correlation: ${escapeHtml(correlationId)} | ${elapsed}ms
            ${decisionId ? ` | decision: ${escapeHtml(decisionId)}` : ''}
            ${receiptId ? ` | receipt: ${escapeHtml(receiptId)}` : ''}
          </div>
        </div>
      </div>`,
    );
  }

  private _renderResult(
    panel: HTMLElement,
    method: string,
    data: unknown,
    elapsed: number,
    correlationId: string,
    decisionId?: string,
    receiptId?: string,
  ): void {
    const isArray = Array.isArray(data);
    const isEmpty =
      data === null ||
      data === undefined ||
      (isArray ? data.length === 0 : typeof data === 'object' && Object.keys(data as object).length === 0);

    let body: string;
    if (isEmpty) {
      body = `<div style="padding:16px;text-align:center;background:#f9fafb;border-radius:6px;color:#6b7280;font-size:12px;">Empty response</div>`;
    } else if (isArray) {
      const rows = (data as unknown[])
        .slice(0, 50)
        .map((item, i) => {
          const text =
            typeof item === 'string' ? item : JSON.stringify(item);
          return `<div style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:11px;font-family:monospace;">
            <span style="color:#6b7280;">${i}.</span> ${escapeHtml(text)}
          </div>`;
        })
        .join('');
      body = `<div style="max-height:300px;overflow-y:auto;">${rows}</div>`;
    } else if (typeof data === 'object') {
      const rows = Object.entries(data as Record<string, unknown>)
        .map(([key, val]) => {
          const display =
            typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
          return `<tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:5px 8px;font-weight:500;color:#374151;vertical-align:top;">${escapeHtml(key)}</td>
            <td style="padding:5px 8px;font-family:monospace;color:#4b5563;word-break:break-all;white-space:pre-wrap;">${escapeHtml(display)}</td>
          </tr>`;
        })
        .join('');
      body = `<table style="width:100%;border-collapse:collapse;font-size:11px;">${rows}</table>`;
    } else {
      body = `<div style="font-family:monospace;font-size:11px;">${escapeHtml(String(data))}</div>`;
    }

    this._setPanelHtml(
      panel,
      `<div style="padding:12px;" role="status" aria-live="polite">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="font-size:12px;font-weight:600;color:#166534;">OK ${sanitizeDescriptorText(method)}</span>
          <span style="font-size:10px;color:#6b7280;">${elapsed}ms</span>
          <span style="font-size:9px;color:#d1d5db;margin-left:auto;">${escapeHtml(correlationId)}</span>
        </div>
        ${body}
        <div style="font-size:9px;color:#9ca3af;margin-top:8px;">
          ${decisionId ? `decision: ${escapeHtml(decisionId)} | ` : ''}
          ${receiptId ? `receipt: ${escapeHtml(receiptId)}` : ''}
        </div>
      </div>`,
    );
  }
}

/**
 * Open a dynamically generated app window from an IDL descriptor.
 * Requires a governed invoker for UIR-035 compliance.
 */
export function openORBGeneratedApp(
  descriptor: IDLDescriptor,
  createWindowFn: (id: string, title: string, w: number, h: number) => HTMLElement,
  backendUrlOrOptions: string | ORBDynamicAppRendererOptions = 'http://localhost:8080',
): ORBDynamicAppRenderer {
  const displayName = sanitizeDescriptorText(
    descriptor.ui?.display_name || descriptor.name,
    'app',
  );
  const icon = sanitizeDescriptorText(descriptor.ui?.icon || '🔧', '🔧');
  const appId = `orb-${safeIdToken(descriptor.name)}`;

  const windowEl = createWindowFn(appId, `${icon} ${displayName} [Auto-UI]`, 800, 600);
  const content = windowEl.querySelector('.window-content') as HTMLElement;

  const renderer = new ORBDynamicAppRenderer(backendUrlOrOptions);
  content.innerHTML = renderer.renderApp(descriptor);
  renderer.bindEvents(content, descriptor);
  return renderer;
}

if (typeof window !== 'undefined') {
  (window as any).ORBDynamicAppRenderer = ORBDynamicAppRenderer;
  (window as any).openORBGeneratedApp = openORBGeneratedApp;
  (window as any).escapeHtml = escapeHtml;
}

export default ORBDynamicAppRenderer;
