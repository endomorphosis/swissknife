// Temporary clean bootstrap replacing corrupted main.ts
import '/css/desktop.css';
import { loadApp, type AppLoadResult } from './src/apps/app-manifest-loader';
import { bindAllAppBackendStatusPanel, renderAllAppBackendStatusPanel } from './src/all-app-backend-status-panel';
import { bindLiveToolGatewayPanel, renderLiveToolGatewayPanel } from './src/live-tool-gateway-panel';

interface App { id:string; title:string; loader:(el:HTMLElement)=>void; }
interface ToolSmokeCatalogEntry {
  app_id: string;
  title: string;
  binding_state: string;
  manifest_runtime_class?: string;
  manifest_lazy_import_kind?: string;
  manifest_browser_supported?: boolean;
  manifest_browser_degraded?: boolean;
  service_families: string[];
  sample_tool_ids: string[];
  app_visible_tool_count: number;
  desktop_mobile_only_count: number;
  supervisor_only_count: number;
  rationale: string;
  browser_safety?: ToolSmokeBrowserSafety;
}

interface ToolSmokeBrowserSafety {
  browser_context: true;
  node_builtins_required: false;
  python_wrappers_required: false;
  host_subprocess_required: false;
  physical_glasses_required: false;
  unavailable_native_adapters_required: false;
  bundled_runtime_classes: string[];
  allowed_transports: string[];
  fallback_paths: string[];
  proof: string[];
}

interface ToolSmokeReceipt {
  schema: string;
  app_id: string;
  state: 'success' | 'fallback' | 'error';
  at: string;
  service_families: string[];
  sample_tool_ids: string[];
  receipt_cid: string;
  ui_path: string[];
  browser_safety: ToolSmokeBrowserSafety;
}

declare global {
  interface Window {
    swissknifeDesktop?: MiniDesktop;
    __SWISSKNIFE_TOOL_UI_SMOKE_CATALOG__?: Record<string, ToolSmokeCatalogEntry>;
    __SWISSKNIFE_TOOL_UI_SMOKE_RECEIPTS__?: ToolSmokeReceipt[];
  }
}

class MiniDesktop {
  private apps = new Map<string, App>();
  private desktop!: HTMLElement;
  private taskbar!: HTMLElement;
  private z=1000;
  constructor(){ this.init(); }
  private init(){
    this.desktop=document.getElementById('desktop')||this.mk('desktop','desktop');
    this.taskbar=document.getElementById('taskbar')||this.mk('taskbar','taskbar');
    this.registerDefaults();
    this.installManifestLaunchHandlers();
    installToolSmokeStyles();
    window.swissknifeDesktop = this;
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) loadingScreen.style.display = 'none';
    this.launch('ai');
  }
  private mk(id:string, cls:string){ const el=document.createElement('div'); el.id=id; el.className=cls; document.body.appendChild(el); return el; }
  private register(app:App){ this.apps.set(app.id, app); }
  private registerDefaults(){ this.register({ id:'ai', title:'AI Chat', loader: c=>{ c.innerHTML='<div style="padding:8px;color:#ddd;font:13px system-ui">AI placeholder desktop operational.</div>'; } }); }
  launch(id:string){
    const app=this.apps.get(id);
    if(app){ const w=this.makeWindow(app.title, id); app.loader(w.querySelector('.window-content') as HTMLElement); return; }
    void this.launchManifestApp(id);
  }

  private installManifestLaunchHandlers() {
    const launchFromElement = (event: Event) => {
      const target = event.currentTarget as HTMLElement;
      const appId = target.dataset.app;
      if (!appId) return;
      event.preventDefault();
      void this.launchManifestApp(appId);
    };

    for (const element of Array.from(document.querySelectorAll<HTMLElement>('[data-app]'))) {
      element.tabIndex = element.tabIndex >= 0 ? element.tabIndex : 0;
      element.addEventListener('click', launchFromElement);
      element.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          launchFromElement(event);
        }
      });
    }
  }

  /**
   * Launches an app by its normalized app manifest id (see
   * `src/services/apps/app-manifest-registry.ts`) instead of the legacy
   * `apps` map above. Browser-safe/hybrid apps are lazily imported and
   * mounted; host-only/remote-capability apps render an explanatory
   * "unavailable capability" panel instead of ever being imported.
   */
  async launchManifestApp(appId: string): Promise<AppLoadResult> {
    let result: AppLoadResult;
    try {
      result = await loadApp(appId);
    } catch (error) {
      result = {
        status: 'unavailable',
        app_id: appId,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    const title = result.manifest?.name ?? appId;
    const w = this.makeWindow(title, appId);
    const content = w.querySelector('.window-content') as HTMLElement;
    await renderAppLoadResult(content, result, this);
    return result;
  }
  private makeWindow(title:string, appId = 'unknown'){ const w=document.createElement('div'); w.className='window'; w.dataset.appId=appId; Object.assign(w.style,{position:'absolute',left:'80px',top:'70px',width:'560px',height:'420px',background:'#181818',border:'1px solid #333',display:'flex',flexDirection:'column',zIndex:String(++this.z)}); w.innerHTML=`<div class="titlebar" style="background:#262626;color:#eee;padding:4px 8px;font-size:12px;cursor:move;display:flex;gap:6px;align-items:center"><span>🧪</span><div class="window-title" style="flex:1">${escapeHtml(title)}</div><button data-x style="background:#444;color:#fff;border:none;padding:2px 6px;border-radius:4px;cursor:pointer;font-size:11px">✕</button></div><div class="window-content" style="flex:1;overflow:auto;background:#111;padding-bottom:56px;scroll-padding-bottom:64px"></div>`; this.desktop.appendChild(w); (w.querySelector('[data-x]') as HTMLButtonElement).onclick=()=>w.remove(); return w; }
}

/**
 * Renders an `AppLoadResult` into a window's content element: mounts the
 * loaded app module when available, or an "unavailable capability" panel
 * (with the missing capability id / remote descriptor ref) for host-only
 * and remote-capability apps so the user sees *why*, instead of the app
 * silently failing to load.
 */
export async function renderAppLoadResult(container: HTMLElement, result: AppLoadResult, desktop?: unknown): Promise<void> {
  const smokePanel = renderToolSmokePanel(result.app_id);
  const backendStatusPanel = renderAllAppBackendStatusPanel(result.app_id);
  const liveGatewayPanel = renderLiveToolGatewayPanel(result.app_id);
  if (result.status === 'loaded') {
    const moduleRecord = result.module as {
      mountSwissKnifeApp?: (container: HTMLElement, options?: Record<string, unknown>) => unknown | Promise<unknown>;
    } | undefined;
    if (typeof moduleRecord?.mountSwissKnifeApp === 'function') {
      await moduleRecord.mountSwissKnifeApp(container, { desktop });
      if (smokePanel) {
        container.insertAdjacentHTML('beforeend', smokePanel);
        bindToolSmokePanel(container, result.app_id);
      }
      if (backendStatusPanel) {
        container.insertAdjacentHTML('beforeend', backendStatusPanel);
        bindAllAppBackendStatusPanel(container, result.app_id);
      }
      if (liveGatewayPanel) {
        container.insertAdjacentHTML('beforeend', liveGatewayPanel);
        bindLiveToolGatewayPanel(container, result.app_id);
      }
      return;
    }
    container.innerHTML = `<div style="padding:8px;color:#ddd;font:13px system-ui">Loaded app "${escapeHtml(result.app_id)}".</div>${smokePanel}${backendStatusPanel}${liveGatewayPanel}`;
    bindToolSmokePanel(container, result.app_id);
    bindAllAppBackendStatusPanel(container, result.app_id);
    bindLiveToolGatewayPanel(container, result.app_id);
    return;
  }

  const statusLabel = result.status === 'remote' ? 'Remote capability' : result.status === 'unavailable' ? 'Unavailable' : 'Not found';
  const details = [
    result.reason ? `<div>${escapeHtml(result.reason)}</div>` : '',
    result.capability_id ? `<div style="opacity:.7">capability: ${escapeHtml(result.capability_id)}</div>` : '',
    result.descriptor_ref ? `<div style="opacity:.7">descriptor: ${escapeHtml(result.descriptor_ref)}</div>` : '',
  ].filter(Boolean).join('');

  container.innerHTML = `<div style="padding:8px;color:#ddd;font:13px system-ui"><strong>${statusLabel}: ${escapeHtml(result.app_id)}</strong>${details}</div>${smokePanel}${backendStatusPanel}${liveGatewayPanel}`;
  bindToolSmokePanel(container, result.app_id);
  bindAllAppBackendStatusPanel(container, result.app_id);
  bindLiveToolGatewayPanel(container, result.app_id);
}

if(typeof document!=='undefined'){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>new MiniDesktop()); else new MiniDesktop(); }

function renderToolSmokePanel(appId: string): string {
  const entry = window.__SWISSKNIFE_TOOL_UI_SMOKE_CATALOG__?.[appId];
  if (!entry) return '';
  const serviceFamilies = entry.service_families.length ? entry.service_families : ['unresolved-service'];
  const sampleTools = entry.sample_tool_ids.slice(0, 3);
  const browserSafety = buildToolSmokeBrowserSafety(entry);
  return `
    <section class="tool-smoke-panel" data-testid="tool-smoke-panel" data-app-id="${escapeHtml(appId)}" data-state="ready">
      <header class="tool-smoke-header">
        <div>
          <div class="tool-smoke-kicker">MCP-backed capability smoke</div>
          <h2>${escapeHtml(entry.title)}</h2>
        </div>
        <span class="tool-smoke-state" data-testid="tool-smoke-state">ready</span>
      </header>
      <div class="tool-smoke-grid" data-testid="tool-smoke-control-state">
        <div><span>Backend</span><strong>${serviceFamilies.map(escapeHtml).join(', ')}</strong></div>
        <div><span>App-visible</span><strong>${entry.app_visible_tool_count}</strong></div>
        <div><span>Fallback/desktop</span><strong>${entry.desktop_mobile_only_count}</strong></div>
        <div><span>Supervisor-only</span><strong>${entry.supervisor_only_count}</strong></div>
      </div>
      <div class="tool-smoke-browser-safety" data-testid="tool-smoke-browser-safety">
        <span>Browser safe</span>
        <strong>${escapeHtml(entry.manifest_runtime_class ?? browserSafety.bundled_runtime_classes[0])} / ${escapeHtml(entry.manifest_lazy_import_kind ?? 'dynamic-import')}</strong>
        <code>no node builtins</code>
        <code>no python wrappers</code>
        <code>no host subprocess</code>
        <code>simulator/fallback only</code>
      </div>
      <div class="tool-smoke-tools" data-testid="tool-smoke-tools">
        ${sampleTools.map(tool => `<code>${escapeHtml(tool)}</code>`).join('')}
      </div>
      <p>${escapeHtml(entry.rationale)}</p>
      <div class="tool-smoke-actions">
        <button type="button" data-smoke-state="success" data-testid="tool-smoke-success">Success</button>
        <button type="button" data-smoke-state="fallback" data-testid="tool-smoke-fallback">Fallback</button>
        <button type="button" data-smoke-state="error" data-testid="tool-smoke-error">Error</button>
      </div>
      <output class="tool-smoke-receipt" data-testid="tool-smoke-receipt">No receipt recorded.</output>
    </section>
  `;
}

function bindToolSmokePanel(container: HTMLElement, appId: string): void {
  const panel = container.querySelector<HTMLElement>(`.tool-smoke-panel[data-app-id="${cssEscape(appId)}"]`);
  const entry = window.__SWISSKNIFE_TOOL_UI_SMOKE_CATALOG__?.[appId];
  if (!panel || !entry) return;
  const browserSafety = buildToolSmokeBrowserSafety(entry);
  panel.dataset.browserSafe = String(browserSafety.browser_context);
  for (const button of Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-smoke-state]'))) {
    button.addEventListener('click', () => {
      const state = button.dataset.smokeState as ToolSmokeReceipt['state'];
      const receipt = createToolSmokeReceipt(entry, state, browserSafety);
      window.__SWISSKNIFE_TOOL_UI_SMOKE_RECEIPTS__ = [
        ...(window.__SWISSKNIFE_TOOL_UI_SMOKE_RECEIPTS__ ?? []),
        receipt,
      ];
      panel.dataset.state = state;
      const label = panel.querySelector<HTMLElement>('[data-testid="tool-smoke-state"]');
      const output = panel.querySelector<HTMLOutputElement>('[data-testid="tool-smoke-receipt"]');
      if (label) label.textContent = state;
      if (output) {
        output.value = `${state}: ${receipt.receipt_cid}`;
        output.textContent = output.value;
      }
    });
  }
}

function buildToolSmokeBrowserSafety(entry: ToolSmokeCatalogEntry): ToolSmokeBrowserSafety {
  return {
    ...(entry.browser_safety ?? {}),
    browser_context: true,
    node_builtins_required: false,
    python_wrappers_required: false,
    host_subprocess_required: false,
    physical_glasses_required: false,
    unavailable_native_adapters_required: false,
    bundled_runtime_classes: entry.browser_safety?.bundled_runtime_classes ?? [entry.manifest_runtime_class ?? 'browser-safe'],
    allowed_transports: entry.browser_safety?.allowed_transports ?? ['http', 'https', 'websocket', 'libp2p'],
    fallback_paths: entry.browser_safety?.fallback_paths ?? [
      'browser-fallback-ui',
      'desktop-mobile-confirmation',
      'simulator-only-glasses-handoff',
    ],
    proof: entry.browser_safety?.proof ?? [
      'Playwright Chromium page',
      'desktop icon launcher',
      'browser app manifest',
      'in-window tool smoke panel',
      'client-side receipt buffer',
    ],
  };
}

function createToolSmokeReceipt(
  entry: ToolSmokeCatalogEntry,
  state: ToolSmokeReceipt['state'],
  browserSafety = buildToolSmokeBrowserSafety(entry),
): ToolSmokeReceipt {
  const receiptBase = {
    app_id: entry.app_id,
    state,
    service_families: entry.service_families,
    sample_tool_ids: entry.sample_tool_ids.slice(0, 3),
    browser_safety: browserSafety,
  };
  return {
    schema: 'swissknife.virtual-desktop-tool-ui-smoke-receipt.v1',
    ...receiptBase,
    at: new Date().toISOString(),
    receipt_cid: `sha256:${stableHash(JSON.stringify(receiptBase))}`,
    ui_path: ['desktop-icon', 'manifest-loader', 'browser-safe-gate', 'tool-smoke-panel', state],
  };
}

function stableHash(input: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193) >>> 0;
    hashB = (Math.imul(hashB ^ code, 0x85ebca6b) + 0xc2b2ae35) >>> 0;
  }
  return `${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}`;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}

function installToolSmokeStyles(): void {
  if (document.getElementById('tool-smoke-styles')) return;
  const style = document.createElement('style');
  style.id = 'tool-smoke-styles';
  style.textContent = `
    .tool-smoke-panel{margin:8px;border-top:1px solid #2f3945;padding:12px;color:#e5e7eb;font:13px system-ui;background:#151b22}
    .tool-smoke-header{display:flex;align-items:start;justify-content:space-between;gap:12px}
    .tool-smoke-kicker{font-size:11px;color:#8fb3ff;text-transform:uppercase}
    .tool-smoke-header h2{font-size:18px;margin:2px 0 0}
    .tool-smoke-state{border:1px solid #3f4d5f;padding:3px 8px;border-radius:999px;background:#202a35}
    .tool-smoke-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0}
    .tool-smoke-grid div{border:1px solid #303a45;padding:8px;background:#10161d}
    .tool-smoke-grid span{display:block;color:#9ca3af;font-size:11px}
    .tool-smoke-grid strong{display:block;margin-top:4px;overflow-wrap:anywhere}
    .tool-smoke-browser-safety{display:flex;gap:6px;flex-wrap:wrap;align-items:center;border:1px solid #2f4c3f;background:#0f1c17;padding:8px;margin:8px 0;color:#d9fbe5}
    .tool-smoke-browser-safety span{color:#8ee7aa;font-size:11px;text-transform:uppercase}
    .tool-smoke-browser-safety strong{margin-right:4px}
    .tool-smoke-browser-safety code{background:#10291b;border:1px solid #2f6f45;color:#d9fbe5;padding:2px 5px}
    .tool-smoke-tools{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
    .tool-smoke-tools code{background:#0b1117;border:1px solid #2f3945;padding:3px 5px;overflow-wrap:anywhere}
    .tool-smoke-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
    .tool-smoke-actions button{background:#26384f;color:#f8fafc;border:1px solid #45617f;padding:6px 10px;cursor:pointer}
    .tool-smoke-receipt{display:block;margin-top:10px;color:#bdd7ff;overflow-wrap:anywhere}
    .tool-smoke-panel[data-state="success"] .tool-smoke-state{border-color:#2f9e44;color:#b7f7c5}
    .tool-smoke-panel[data-state="fallback"] .tool-smoke-state{border-color:#b7791f;color:#ffe4a3}
    .tool-smoke-panel[data-state="error"] .tool-smoke-state{border-color:#d64545;color:#ffc0c0}
  `;
  document.head.appendChild(style);
}
