/**
 * ORB-Driven Dynamic App Renderer
 * 
 * Automatically generates interactive desktop application windows from
 * MCPUIProfileDescriptor / IDL Interface Descriptors. This enables any MCP
 * server registered via the ORB capability router to automatically get:
 * 
 * 1. A full interactive desktop app window (virtual desktop)
 * 2. A Meta Glasses widget (via idl-to-glasses-compiler)
 * 3. An Electron dashboard panel (via schema-driven-ui-renderer.js)
 * 
 * The renderer uses the schema-driven UI generation pipeline to produce
 * operation forms, result renderers, and workflow controls without any
 * manual UI authoring.
 * 
 * Usage:
 *   const renderer = new ORBDynamicAppRenderer(backendUrl);
 *   const appHtml = renderer.renderApp(idlDescriptor);
 *   windowContent.innerHTML = appHtml;
 *   renderer.bindEvents(windowContent, idlDescriptor);
 */

// ---------------------------------------------------------------------------
// Types (inline to avoid import issues in browser bundle)
// ---------------------------------------------------------------------------

interface IDLMethod {
  name: string;
  inputSchema: { type: string; properties?: Record<string, any>; required?: string[] };
  outputSchema: { type: string; properties?: Record<string, any> };
}

interface IDLDescriptor {
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
}

interface FieldWidget {
  name: string;
  type: string;
  required: boolean;
  widget: 'text' | 'number' | 'checkbox' | 'textarea' | 'json' | 'select' | 'cid';
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// Widget Type Selection (from JSON Schema property)
// ---------------------------------------------------------------------------

function selectWidget(name: string, schema: Record<string, any>): FieldWidget['widget'] {
  const type = schema.type || 'string';
  if (name === 'cid' || name.endsWith('_cid') || name === 'hash') return 'cid';
  if (type === 'boolean') return 'checkbox';
  if (type === 'number' || type === 'integer') return 'number';
  if (type === 'object' || type === 'array') return 'json';
  if (name === 'content' || name === 'prompt' || name === 'data' || name === 'text') return 'textarea';
  return 'text';
}

function widgetPlaceholder(name: string, widget: FieldWidget['widget']): string {
  if (widget === 'cid') return 'QmXYZ... or bafy...';
  if (widget === 'json') return '{}';
  if (widget === 'textarea') return `Enter ${name}...`;
  return name.replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// Form Generation
// ---------------------------------------------------------------------------

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
  const base = `data-field="${field.name}" placeholder="${field.placeholder}" ${reqAttr}`;
  
  switch (field.widget) {
    case 'checkbox':
      return `<label style="display:flex;align-items:center;gap:6px;font-size:12px;">
        <input type="checkbox" ${base} style="width:16px;height:16px;">
        ${field.name}${field.required ? ' *' : ''}
      </label>`;
    case 'number':
      return `<input type="number" ${base} style="width:100%;padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;">`;
    case 'textarea':
      return `<textarea ${base} rows="3" style="width:100%;padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;resize:vertical;font-family:monospace;"></textarea>`;
    case 'json':
      return `<textarea ${base} rows="4" style="width:100%;padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:11px;resize:vertical;font-family:monospace;"></textarea>`;
    case 'cid':
      return `<input type="text" ${base} style="width:100%;padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;font-family:monospace;" pattern="(Qm|bafy)[a-zA-Z0-9]+">`;
    default:
      return `<input type="text" ${base} style="width:100%;padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;">`;
  }
}

// ---------------------------------------------------------------------------
// HTTP Method Resolution (mirrors ORB bridge logic)
// ---------------------------------------------------------------------------

const GET_METHODS = new Set([
  'cat', 'list_pins', 'stat', 'resolve', 'dag_get', 'name_resolve',
  'capabilities', 'hardware_profile', 'list_models', 'metrics',
  'endpoints', 'list_datasets', 'search_datasets', 'status',
]);

function resolveHttpMethod(methodName: string): 'GET' | 'POST' {
  return GET_METHODS.has(methodName) ? 'GET' : 'POST';
}

function resolveEndpoint(methodName: string, baseUrl: string): string {
  const slug = methodName.replace(/_/g, '/');
  return `${baseUrl}/v1/ipfs/${slug}`;
}

// ---------------------------------------------------------------------------
// Main Renderer Class
// ---------------------------------------------------------------------------

export class ORBDynamicAppRenderer {
  private backendUrl: string;
  private correlationCounter: number = 0;

  constructor(backendUrl: string = 'http://localhost:8080') {
    this.backendUrl = backendUrl;
  }

  /**
   * Generate the complete HTML for an auto-generated app from an IDL descriptor.
   */
  renderApp(descriptor: IDLDescriptor): string {
    const displayName = descriptor.ui?.display_name || descriptor.name;
    const icon = descriptor.ui?.icon || '🔧';
    const template = descriptor.ui?.primary_template || 'explorer';
    const methodCount = descriptor.methods.length;

    // Categorize methods
    const readMethods = descriptor.methods.filter(m => resolveHttpMethod(m.name) === 'GET');
    const writeMethods = descriptor.methods.filter(m => resolveHttpMethod(m.name) === 'POST');

    return `
      <div class="orb-app" style="display:flex;flex-direction:column;height:100%;font-family:system-ui,sans-serif;background:#fff;">
        <!-- Header -->
        <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #e5e7eb;background:#f8fafc;">
          <span style="font-size:18px;">${icon}</span>
          <h3 style="margin:0;font-size:14px;font-weight:600;">${displayName}</h3>
          <span style="font-size:10px;background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:3px;">IDL Auto-UI</span>
          <span style="font-size:10px;background:#dcfce7;color:#166534;padding:2px 6px;border-radius:3px;">ORB</span>
          <span style="margin-left:auto;font-size:10px;color:#6b7280;">${methodCount} methods</span>
          <span class="orb-status" style="width:8px;height:8px;border-radius:50%;background:#fbbf24;"></span>
        </div>

        <!-- Method Tabs -->
        <div style="display:flex;gap:4px;padding:6px 10px;border-bottom:1px solid #e5e7eb;overflow-x:auto;background:#f1f5f9;">
          ${descriptor.methods.map((m, i) => `
            <button class="orb-method-tab${i === 0 ? ' active' : ''}" data-method="${m.name}"
              style="padding:4px 10px;border:1px solid ${resolveHttpMethod(m.name) === 'GET' ? '#86efac' : '#93c5fd'};
              border-radius:3px;background:${i === 0 ? '#fff' : 'transparent'};cursor:pointer;font-size:11px;
              white-space:nowrap;color:${resolveHttpMethod(m.name) === 'GET' ? '#166534' : '#1e40af'};">
              <span style="font-weight:600;">${resolveHttpMethod(m.name)}</span> ${m.name}
            </button>
          `).join('')}
        </div>

        <!-- Main Panel -->
        <div style="flex:1;display:flex;overflow:hidden;">
          <!-- Form Panel -->
          <div style="width:50%;border-right:1px solid #e5e7eb;overflow-y:auto;padding:12px;">
            ${descriptor.methods.map((m, i) => this._renderMethodForm(m, i === 0)).join('')}
          </div>

          <!-- Result Panel -->
          <div style="width:50%;overflow-y:auto;padding:12px;">
            <div class="orb-result-panel" style="min-height:100%;">
              <div style="text-align:center;padding:40px 20px;color:#9ca3af;">
                <div style="font-size:24px;margin-bottom:8px;">📡</div>
                <div style="font-size:12px;">Select a method and invoke it to see results</div>
                <div style="font-size:10px;margin-top:4px;color:#d1d5db;">
                  Auto-generated from ${descriptor.name} IDL via ORB
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Status Bar -->
        <div class="orb-status-bar" style="display:flex;align-items:center;gap:12px;padding:4px 12px;border-top:1px solid #e5e7eb;background:#f8fafc;font-size:10px;color:#6b7280;">
          <span>Backend: ${this.backendUrl}</span>
          <span>|</span>
          <span>Namespace: ${descriptor.namespace || 'default'}</span>
          <span>|</span>
          <span>v${descriptor.version || '1.0.0'}</span>
          <span style="margin-left:auto;" class="orb-latency">Ready</span>
        </div>
      </div>
    `;
  }

  /**
   * Bind event handlers to the rendered app. Call after inserting HTML into DOM.
   */
  bindEvents(container: HTMLElement, descriptor: IDLDescriptor): void {
    const resultPanel = container.querySelector('.orb-result-panel') as HTMLElement;
    const statusDot = container.querySelector('.orb-status') as HTMLElement;
    const latencyEl = container.querySelector('.orb-latency') as HTMLElement;

    // Tab switching
    container.querySelectorAll('.orb-method-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('.orb-method-tab').forEach(t => {
          (t as HTMLElement).style.background = 'transparent';
          t.classList.remove('active');
        });
        (tab as HTMLElement).style.background = '#fff';
        tab.classList.add('active');

        const methodName = (tab as HTMLElement).dataset.method!;
        container.querySelectorAll('.orb-method-form').forEach(form => {
          (form as HTMLElement).style.display = form.getAttribute('data-method') === methodName ? 'block' : 'none';
        });
      });
    });

    // Form submission (invoke via ORB)
    container.querySelectorAll('.orb-invoke-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const methodName = (btn as HTMLElement).dataset.method!;
        const method = descriptor.methods.find(m => m.name === methodName);
        if (!method) return;

        const form = container.querySelector(`.orb-method-form[data-method="${methodName}"]`) as HTMLElement;
        const params = this._collectFormParams(form, method);
        
        await this._invokeMethod(methodName, params, resultPanel, statusDot, latencyEl);
      });
    });

    // Check backend status on load
    this._checkBackendStatus(statusDot);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _renderMethodForm(method: IDLMethod, visible: boolean): string {
    const fields = generateMethodFields(method);
    const httpMethod = resolveHttpMethod(method.name);

    return `
      <div class="orb-method-form" data-method="${method.name}" style="display:${visible ? 'block' : 'none'};">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <h4 style="margin:0;font-size:13px;">${method.name}</h4>
          <span style="font-size:10px;padding:1px 6px;border-radius:3px;background:${httpMethod === 'GET' ? '#dcfce7' : '#dbeafe'};color:${httpMethod === 'GET' ? '#166534' : '#1e40af'};">
            ${httpMethod}
          </span>
        </div>

        ${fields.length > 0 ? `
          <div style="display:grid;gap:10px;margin-bottom:12px;">
            ${fields.map(f => `
              <div>
                <label style="display:block;font-size:11px;font-weight:500;color:#374151;margin-bottom:3px;">
                  ${f.name}${f.required ? ' <span style="color:#ef4444;">*</span>' : ''}
                </label>
                ${renderFieldInput(f)}
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="padding:8px;background:#f9fafb;border-radius:4px;font-size:11px;color:#6b7280;margin-bottom:12px;">
            No parameters required
          </div>
        `}

        <button class="orb-invoke-btn" data-method="${method.name}" style="
          width:100%;padding:8px 16px;background:#3b82f6;color:#fff;border:none;
          border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;
          transition:background 0.2s;">
          ⚡ Invoke ${method.name}
        </button>

        ${method.outputSchema?.properties ? `
          <div style="margin-top:10px;padding:8px;background:#f9fafb;border-radius:4px;">
            <div style="font-size:10px;color:#6b7280;margin-bottom:4px;">Expected Output:</div>
            <div style="font-family:monospace;font-size:10px;color:#4b5563;">
              ${Object.entries(method.outputSchema.properties).map(([k, v]) => 
                `<span style="color:#1e40af;">${k}</span>: <span style="color:#6b7280;">${(v as any).type || 'any'}</span>`
              ).join(', ')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  private _collectFormParams(form: HTMLElement, method: IDLMethod): Record<string, any> {
    const params: Record<string, any> = {};
    form.querySelectorAll('[data-field]').forEach(el => {
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
          // Try parsing JSON for object/array fields
          const prop = method.inputSchema.properties?.[name] as any;
          if (prop?.type === 'object' || prop?.type === 'array') {
            try { params[name] = JSON.parse(val); } catch { params[name] = val; }
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
    params: Record<string, any>,
    resultPanel: HTMLElement,
    statusDot: HTMLElement,
    latencyEl: HTMLElement,
  ): Promise<void> {
    const correlationId = `orb_${++this.correlationCounter}_${Date.now()}`;
    const httpMethod = resolveHttpMethod(methodName);
    const endpoint = resolveEndpoint(methodName, this.backendUrl);

    resultPanel.innerHTML = `
      <div style="padding:20px;text-align:center;">
        <div style="font-size:16px;animation:spin 1s linear infinite;">⏳</div>
        <div style="font-size:11px;color:#6b7280;margin-top:8px;">Invoking ${methodName}...</div>
        <div style="font-size:9px;color:#d1d5db;margin-top:4px;">correlation: ${correlationId}</div>
      </div>
    `;

    const startTime = performance.now();

    try {
      const fetchOpts: RequestInit = {
        method: httpMethod,
        headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': correlationId },
        signal: AbortSignal.timeout(15000),
      };

      if (httpMethod === 'POST') {
        fetchOpts.body = JSON.stringify(params);
      } else if (Object.keys(params).length > 0) {
        const url = new URL(endpoint);
        for (const [k, v] of Object.entries(params)) {
          url.searchParams.set(k, String(v));
        }
        // Override endpoint for GET with params
        const resp = await fetch(url.toString(), fetchOpts);
        const elapsed = Math.round(performance.now() - startTime);
        latencyEl.textContent = `${elapsed}ms`;
        statusDot.style.background = '#4ade80';
        
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        const data = await resp.json();
        this._renderResult(resultPanel, methodName, data, elapsed, correlationId);
        return;
      }

      const resp = await fetch(endpoint, fetchOpts);
      const elapsed = Math.round(performance.now() - startTime);
      latencyEl.textContent = `${elapsed}ms`;
      statusDot.style.background = '#4ade80';

      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      const data = await resp.json();
      this._renderResult(resultPanel, methodName, data, elapsed, correlationId);

    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      latencyEl.textContent = `${elapsed}ms (error)`;
      statusDot.style.background = '#f87171';

      resultPanel.innerHTML = `
        <div style="padding:16px;">
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px;">
            <div style="font-size:12px;font-weight:600;color:#991b1b;margin-bottom:4px;">❌ Invocation Failed</div>
            <div style="font-size:11px;color:#7f1d1d;font-family:monospace;">${err.message}</div>
            <div style="font-size:9px;color:#9ca3af;margin-top:8px;">
              Method: ${methodName} | Endpoint: ${resolveEndpoint(methodName, this.backendUrl)} | ${elapsed}ms
            </div>
          </div>
        </div>
      `;
    }
  }

  private _renderResult(panel: HTMLElement, method: string, data: any, elapsed: number, correlationId: string): void {
    const isArray = Array.isArray(data);
    const isEmpty = isArray ? data.length === 0 : !data || Object.keys(data).length === 0;

    panel.innerHTML = `
      <div style="padding:12px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="font-size:12px;font-weight:600;color:#166534;">✅ ${method}</span>
          <span style="font-size:10px;color:#6b7280;">${elapsed}ms</span>
          <span style="font-size:9px;color:#d1d5db;margin-left:auto;">${correlationId}</span>
        </div>

        ${isEmpty ? `
          <div style="padding:16px;text-align:center;background:#f9fafb;border-radius:6px;color:#6b7280;font-size:12px;">
            Empty response
          </div>
        ` : isArray ? `
          <div style="max-height:300px;overflow-y:auto;">
            ${data.slice(0, 50).map((item: any, i: number) => `
              <div style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:11px;font-family:monospace;">
                <span style="color:#6b7280;min-width:20px;display:inline-block;">${i}.</span>
                ${typeof item === 'string' ? item : JSON.stringify(item)}
              </div>
            `).join('')}
            ${data.length > 50 ? `<div style="padding:8px;text-align:center;color:#6b7280;font-size:10px;">... and ${data.length - 50} more</div>` : ''}
          </div>
        ` : `
          <div style="max-height:350px;overflow-y:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
              ${Object.entries(data).map(([key, val]) => `
                <tr style="border-bottom:1px solid #f3f4f6;">
                  <td style="padding:5px 8px;font-weight:500;color:#374151;white-space:nowrap;vertical-align:top;">${key}</td>
                  <td style="padding:5px 8px;font-family:monospace;color:#4b5563;word-break:break-all;">
                    ${typeof val === 'object' ? `<pre style="margin:0;font-size:10px;max-height:100px;overflow:auto;">${JSON.stringify(val, null, 2)}</pre>` : String(val)}
                  </td>
                </tr>
              `).join('')}
            </table>
          </div>
        `}
      </div>
    `;
  }

  private async _checkBackendStatus(statusDot: HTMLElement): Promise<void> {
    try {
      const resp = await fetch(`${this.backendUrl}/v1/ipfs/status`, { signal: AbortSignal.timeout(3000) });
      statusDot.style.background = resp.ok ? '#4ade80' : '#fbbf24';
    } catch {
      statusDot.style.background = '#f87171';
    }
  }
}

// ---------------------------------------------------------------------------
// Factory: Open an auto-generated ORB app in the virtual desktop
// ---------------------------------------------------------------------------

/**
 * Open a dynamically generated app window from an IDL descriptor.
 * Can be called from openApplication() or from the IDL Explorer.
 */
export function openORBGeneratedApp(
  descriptor: IDLDescriptor,
  createWindowFn: (id: string, title: string, w: number, h: number) => HTMLElement,
  backendUrl: string = 'http://localhost:8080',
): void {
  const displayName = descriptor.ui?.display_name || descriptor.name;
  const icon = descriptor.ui?.icon || '🔧';
  const appId = `orb-${descriptor.name}`;

  const windowEl = createWindowFn(appId, `${icon} ${displayName} [Auto-UI]`, 800, 600);
  const content = windowEl.querySelector('.window-content') as HTMLElement;

  const renderer = new ORBDynamicAppRenderer(backendUrl);
  content.innerHTML = renderer.renderApp(descriptor);
  renderer.bindEvents(content, descriptor);
}

// Export for browser global access
if (typeof window !== 'undefined') {
  (window as any).ORBDynamicAppRenderer = ORBDynamicAppRenderer;
  (window as any).openORBGeneratedApp = openORBGeneratedApp;
}

export default ORBDynamicAppRenderer;
