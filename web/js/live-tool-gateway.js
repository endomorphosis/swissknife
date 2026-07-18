const CATALOG_ROUTE = '/mcp/tools/bindings';
const CALL_ROUTE = '/mcp/tools/call';

const catalogCache = new Map();

export async function mountLiveToolGateway(container, appId) {
  if (!container || !appId || container.querySelector('[data-testid="live-tool-gateway-panel"]')) return;
  const controls = await controlsFor(appId);
  if (controls.length === 0) return;

  const panel = document.createElement('section');
  panel.className = 'live-tool-gateway-panel';
  panel.dataset.testid = 'live-tool-gateway-panel';
  panel.dataset.appId = appId;
  panel.innerHTML = `
    <header class="live-tool-gateway-header"><strong>MCP++ actions</strong><span>${controls.length}</span></header>
    <div class="live-tool-gateway-controls"></div>
  `;
  const controlsElement = panel.querySelector('.live-tool-gateway-controls');
  for (const control of controls) {
    const row = document.createElement('div');
    row.className = 'live-tool-gateway-control';
    row.dataset.bindingId = control.binding_id;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.liveGatewayBinding = control.binding_id;
    button.dataset.testid = `live-gateway-control-${control.binding_id}`;
    button.textContent = control.label;
    button.disabled = control.status !== 'available';
    button.title = control.status === 'available'
      ? `Invoke ${control.selected_tool_id} through the desktop gateway`
      : 'No currently advertised owner tool matches this application binding.';
    const output = document.createElement('output');
    output.dataset.liveGatewayResult = control.binding_id;
    output.textContent = control.status === 'available' ? 'ready' : 'unavailable';
    row.append(button, output);
    controlsElement.append(row);
    button.addEventListener('click', () => invokeControl(button, output, control));
  }
  container.append(panel);
}

async function controlsFor(appId) {
  if (!catalogCache.has(appId)) {
    catalogCache.set(appId, fetch(`${CATALOG_ROUTE}?app_id=${encodeURIComponent(appId)}`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    }).then(async response => {
      if (!response.ok) throw new Error(`Gateway control catalog returned HTTP ${response.status}.`);
      const body = await response.json();
      return Array.isArray(body.controls) ? body.controls : [];
    }));
  }
  try {
    return await catalogCache.get(appId);
  } catch (error) {
    catalogCache.delete(appId);
    throw error;
  }
}

async function invokeControl(button, output, control) {
  const governed = control.mutates_remote_state === true;
  const forcedDryRun = globalThis.__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__ === true;
  const dryRun = governed || forcedDryRun;
  const correlationId = `desktop:${control.binding_id}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const payload = control.safe_payload ?? (dryRun
    ? { dry_run: true, scope: control.capability_id, limit: 1 }
    : { scope: control.capability_id, limit: 1, cursor: 'desktop-read-only' });
  const call = {
    protocol: 'swissknife.all-app-tool-gateway.v1',
    route: CALL_ROUTE,
    binding_id: control.binding_id,
    app_id: control.app_id,
    intent_id: control.intent_id,
    owner: control.owner,
    tool_id: control.selected_tool_id,
    transport: control.transport,
    correlation_id: correlationId,
    input: {
      correlation_id: correlationId,
      payload,
      policy: {
        decision_id: `desktop-policy:${control.binding_id}`,
        outcome: 'allow',
        reason: dryRun ? 'Desktop control executes through the owner adapter as a no-side-effect dry run.' : 'Narrow non-mutating desktop read request.',
        consent: dryRun ? 'granted' : 'not_required',
        dry_run: dryRun,
      },
    },
    receipt_required: true,
  };
  button.disabled = true;
  output.textContent = 'pending';
  try {
    const response = await fetch(CALL_ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(call),
    });
    const result = await response.json();
    const receipt = result?.receipt ?? {};
    output.textContent = `${result.outcome ?? 'failed'}; ${result.correlation_id ?? correlationId}; receipt=${receipt.receipt_id ?? 'unavailable'}; event=${receipt.event_dag_refs?.[0] ?? 'unavailable'}`;
    button.closest('.live-tool-gateway-panel')?.dispatchEvent(new CustomEvent('swissknife:live-gateway-result', {
      bubbles: true,
      detail: { control, call, result, http_status: response.status },
    }));
  } catch (error) {
    output.textContent = `failed; ${correlationId}; ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    button.disabled = false;
  }
}
