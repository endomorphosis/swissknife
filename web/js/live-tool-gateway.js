const CATALOG_ROUTE = "/mcp/tools/bindings";
const CALL_ROUTE = "/mcp/tools/call";

const catalogCache = new Map();
let dispositionPromise;
function toolDispositions() {
  dispositionPromise ||= fetch('/mcp/tools/dispositions', { headers: { accept: 'application/json' }, cache: 'no-store' }).then(async response => {
    const body = await response.json();
    if (!response.ok || !Array.isArray(body.entries)) throw new Error('Tool disposition catalog unavailable.');
    return body.entries;
  }).catch(error => { dispositionPromise = undefined; throw error; });
  return dispositionPromise;
}
const LOCAL_NEGATIVES = new Set(['calculator', 'clock', 'terminal', 'glasses-preview', 'settings', 'todo', 'calendar', 'cron', 'task-manager', 'music-studio', 'music-studio-unified', 'strudel', 'strudel-ai-daw', 'oauth-login', 'openrouter']);

export async function mountLiveToolGateway(container, appId) {
  if (
    !container ||
    !appId ||
    container.querySelector('[data-testid="live-tool-gateway-panel"]')
  )
    return;
  if (LOCAL_NEGATIVES.has(appId)) {
    if (['oauth-login', 'openrouter'].includes(appId) && !container.querySelector('[data-external-provider]')) {
      const link = document.createElement('a');
      link.id = `${appId}-provider-handoff`;
      link.dataset.externalProvider = appId;
      link.href = appId === 'openrouter' ? 'https://openrouter.ai/' : 'https://github.com/login';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = appId === 'openrouter' ? 'Open OpenRouter provider website' : 'Open GitHub identity provider';
      link.addEventListener('click', event => container.dispatchEvent(new CustomEvent('swissknife:external-provider-result', {
        bubbles: true, detail: { outcome: 'external-provider', provider: appId, state: 'handoff', trusted: event.isTrusted },
      })));
      container.append(link);
    }
    return;
  }
  const dispositions = await toolDispositions();
  const forbidden = new Set(dispositions.filter(entry => entry.disposition?.kind === 'server_only').map(entry => `${entry.owner}:${entry.tool_id}`));
  const controls = (await controlsFor(appId)).flatMap(control => (control.preferred_tool_ids || [control.selected_tool_id])
    .filter(tool => tool && !forbidden.has(`${control.owner}:${tool}`)).map(tool => ({ ...control, selected_tool_id: tool, safe_payload: control.safe_payloads?.[tool] || control.safe_payload })));
  if (controls.length === 0) return;

  const panel = document.createElement("section");
  panel.className = "live-tool-gateway-panel";
  panel.dataset.testid = "live-tool-gateway-panel";
  panel.dataset.appId = appId;
  panel.innerHTML = `
    <header class="live-tool-gateway-header"><strong>MCP++ actions</strong><span>${controls.length}</span></header>
    <div class="live-tool-gateway-controls"></div>
  `;
  const controlsElement = panel.querySelector(".live-tool-gateway-controls");
  for (const control of controls) {
    const row = document.createElement("div");
    row.className = "live-tool-gateway-control";
    row.dataset.bindingId = control.binding_id;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.liveGatewayBinding = control.binding_id;
    button.dataset.gatewayExactTool = control.selected_tool_id;
    button.dataset.testid = `live-gateway-control-${control.binding_id}`;
    button.textContent = `${control.label}: ${control.selected_tool_id}`;
    button.disabled = control.status !== "available";
    button.title =
      control.status === "available"
        ? `Invoke ${control.selected_tool_id} through the desktop gateway`
        : "No currently advertised owner tool matches this application binding.";
    const output = document.createElement("output");
    output.dataset.liveGatewayResult = control.binding_id;
    output.dataset.gatewayStatus = control.binding_id;
    output.textContent =
      control.status === "available" ? "ready" : "unavailable";
    row.append(button, output);
    controlsElement.append(row);
    button.addEventListener("click", () =>
      invokeControl(button, output, control),
    );
  }
  container.append(panel);
  if (appId === 'mcp-control') {
    const restricted = document.createElement('section');
    restricted.className = 'gateway-policy-negatives';
    for (const entry of dispositions.filter(item => item.disposition?.kind === 'server_only')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.gatewayPolicyTool = `${entry.owner}:${entry.tool_id}`;
      button.textContent = `Review ${entry.tool_id} policy`;
      const output = document.createElement('output');
      button.addEventListener('click', event => {
        output.textContent = `Denied: ${entry.disposition.rationale || 'Server policy review is required before dispatch.'}`;
        container.dispatchEvent(new CustomEvent('swissknife:policy-negative', { bubbles: true,
          detail: { tool_identity: button.dataset.gatewayPolicyTool, outcome: 'denied', trusted: event.isTrusted } }));
      });
      restricted.append(button, output);
    }
    container.append(restricted);
  }
}

async function controlsFor(appId) {
  if (!catalogCache.has(appId)) {
    catalogCache.set(
      appId,
      fetch(`${CATALOG_ROUTE}?app_id=${encodeURIComponent(appId)}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      }).then(async (response) => {
        if (!response.ok)
          throw new Error(
            `Gateway control catalog returned HTTP ${response.status}.`,
          );
        const body = await response.json();
        return Array.isArray(body.controls) ? body.controls : [];
      }),
    );
  }
  try {
    return await catalogCache.get(appId);
  } catch (error) {
    catalogCache.delete(appId);
    throw error;
  }
}

async function invokeControl(button, output, control) {
  return invokeGateway(button.closest('.live-tool-gateway-panel'), button, output, control, {}, 'gateway-button');
}

/**
 * Invoke an approved binding from its native app action. Governed actions stay
 * previews unless executionMode is 'execute'; real actions require the native
 * confirmation dialog's trusted user click. The global preview override wins.
 */
export async function invokeNativeTool(container, appId, bindingId, options = {}) {
  if (options.executionMode !== undefined && options.executionMode !== 'execute') {
    throw new Error(`Unknown native tool execution mode: ${options.executionMode}.`);
  }
  const control = (await controlsFor(appId)).find(item => item.binding_id === bindingId && item.app_id === appId);
  if (!control) throw new Error(`No declared application binding ${bindingId}.`);
  const toolId = options.toolId || control.selected_tool_id;
  const approved = control.preferred_tool_ids || [control.selected_tool_id];
  if (!toolId || !approved.includes(toolId)) throw new Error(`Tool ${toolId} is not approved for ${bindingId}.`);
  if ((await toolDispositions()).some(entry => entry.owner === control.owner && entry.tool_id === toolId && entry.disposition?.kind === 'server_only')) throw new Error(`Tool ${toolId} requires server policy review.`);
  let output = [...container.querySelectorAll('[data-gateway-status]')].find(node => node.dataset.gatewayStatus === bindingId);
  if (!output) {
    output = document.createElement('output');
    output.dataset.gatewayStatus = bindingId;
    output.setAttribute('aria-live', 'polite');
    container.append(output);
  }
  const trigger = options.trigger || null;
  if (trigger) trigger.dataset.nativeGatewayBinding = bindingId;
  return invokeGateway(container, trigger, output, { ...control, selected_tool_id: toolId }, options, 'native-control');
}

function requestConfirmation(container, control, correlationId, origin, dryRun) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.dataset.gatewayConfirmation = control.binding_id;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#0008;display:grid;place-items:center';
    const dialog = document.createElement('section');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Confirm application tool');
    dialog.style.cssText = 'background:#20232b;color:white;padding:24px;border-radius:12px;max-width:440px';
    const title = document.createElement('h3');
    title.textContent = `Confirm ${control.label || control.selected_tool_id}`;
    const message = document.createElement('p');
    message.textContent = dryRun
      ? `${control.selected_tool_id} will run as a dry run. Review this action before continuing.`
      : `${control.selected_tool_id} will execute against ${control.owner}. This is a real backend action. Review this action before continuing.`;
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.dataset.gatewayConfirm = control.binding_id;
    confirm.textContent = dryRun ? 'Confirm dry run' : 'Confirm execution';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.dataset.gatewayCancel = control.binding_id;
    cancel.textContent = 'Cancel';
    const announce = (phase, trusted = false) => container.dispatchEvent(new CustomEvent('swissknife:gateway-confirmation', {
      bubbles: true, detail: { phase, trusted, binding_id: control.binding_id, tool_id: control.selected_tool_id, correlation_id: correlationId, origin },
    }));
    let settled = false;
    const finish = (accepted, event) => {
      if (settled) return;
      settled = true;
      confirm.removeEventListener('click', confirmAction);
      cancel.removeEventListener('click', cancelAction);
      announce(accepted ? 'confirmed' : 'cancelled', event.isTrusted);
      overlay.remove();
      resolve(accepted);
    };
    const confirmAction = event => {
      // Synthetic clicks must neither grant real execution nor consume the
      // listener: the user can still confirm this exact pending correlation.
      if (!dryRun && event.isTrusted !== true) return;
      finish(true, event);
    };
    const cancelAction = event => finish(false, event);
    confirm.addEventListener('click', confirmAction);
    cancel.addEventListener('click', cancelAction);
    dialog.append(title, message, confirm, cancel);
    overlay.append(dialog);
    container.append(overlay);
    announce('shown');
    cancel.focus();
  });
}

async function invokeGateway(container, button, output, control, options, origin) {
  const governed = control.mutates_remote_state === true || control.confirmation_required === true;
  const forcedDryRun = globalThis.__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__ === true;
  let dryRun = forcedDryRun || (governed && options.executionMode !== 'execute');
  const correlationId = `desktop:${crypto.randomUUID()}`;
  const payload =
    options.payload ?? control.safe_payload ??
    (dryRun
      ? { dry_run: true, scope: control.capability_id, limit: 1 }
      : {
          scope: control.capability_id,
          limit: 1,
          cursor: "desktop-read-only",
        });
  const transportOverride =
    globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__;
  const transport = control.transports?.includes(transportOverride)
    ? transportOverride
    : control.transport;
  if (button) button.disabled = true;
  if (governed) {
    output.textContent = `Confirmation required for ${control.selected_tool_id}.`;
    if (!await requestConfirmation(container, control, correlationId, origin, dryRun)) {
      output.textContent = 'Cancelled before tool dispatch.';
      if (button) button.disabled = false;
      return null;
    }
  }
  // Enabling the preview override while a dialog is open must also win.
  if (globalThis.__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__ === true) dryRun = true;
  const call = {
    protocol: "swissknife.all-app-tool-gateway.v1",
    route: CALL_ROUTE,
    binding_id: control.binding_id,
    app_id: control.app_id,
    intent_id: control.intent_id,
    owner: control.owner,
    tool_id: control.selected_tool_id,
    transport,
    correlation_id: correlationId,
    input: {
      correlation_id: correlationId,
      payload,
      policy: {
        decision_id: `desktop-policy:${control.binding_id}`,
        outcome: governed ? "require_confirmation" : "allow",
        reason: governed && !dryRun
          ? "The governed native application request is explicitly confirmed for real backend execution."
          : governed
          ? "The governed desktop request is explicitly confirmed and executes only as a no-side-effect dry run."
          : dryRun
            ? "The desktop read executes through the owner adapter as a no-side-effect dry run."
            : "Narrow non-mutating desktop read request.",
        consent: governed ? "granted" : "not_required",
        dry_run: dryRun,
      },
    },
    receipt_required: true,
  };
  output.textContent = "pending";
  try {
    const response = await fetch(CALL_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(call),
    });
    const result = await response.json();
    const receipt = result?.receipt ?? {};
    output.textContent = `${control.selected_tool_id} ${result.correlation_id ?? correlationId}; ${result.outcome ?? "failed"}; receipt=${receipt.receipt_id ?? "unavailable"}; event=${receipt.event_dag_refs?.[0] ?? "unavailable"}`;
    container.dispatchEvent(
      new CustomEvent("swissknife:live-gateway-result", {
        bubbles: true,
        detail: { control, call, result, origin, http_status: response.status },
      }),
    );
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.textContent = `failed; ${correlationId}; ${message}`;
    // A visible control failure is still an application-originated
    // observation.  Emitting it keeps replay harnesses from waiting forever
    // when a mediator or transport is unavailable, while the evidence gate
    // still rejects the non-executed result.
    const result = { ok: false, outcome: 'failed', error: message, correlation_id: correlationId };
    container.dispatchEvent(
      new CustomEvent("swissknife:live-gateway-result", {
        bubbles: true,
        detail: {
          control,
          call,
          result, origin,
          http_status: 0,
        },
      }),
    );
    return result;
  } finally {
    if (button) button.disabled = false;
  }
}
