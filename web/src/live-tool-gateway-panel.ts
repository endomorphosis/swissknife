import {
  bootstrapVirtualDesktopLiveGateway,
  type VirtualDesktopLiveGateway,
} from '../../src/services/mcp/virtual-desktop-live-gateway.js';

let desktopGateway: VirtualDesktopLiveGateway | undefined;

function gateway(): VirtualDesktopLiveGateway {
  desktopGateway ??= bootstrapVirtualDesktopLiveGateway();
  return desktopGateway;
}

/**
 * Renders the actual browser-visible controls for every materialized binding
 * owned by an application. The DOM deliberately contains only binding and
 * policy metadata; backend addresses and credentials never cross this API.
 */
export function renderLiveToolGatewayPanel(appId: string): string {
  const controls = gateway().controlsForApp(appId);
  if (controls.length === 0) return '';
  return `<section class="live-tool-gateway-panel" data-testid="live-tool-gateway-panel" data-app-id="${escapeHtml(appId)}">
    <header><strong>Mediated MCP++ actions</strong><span data-testid="live-gateway-count">${controls.length}</span></header>
    <p>Each action is dispatched through the same-origin mediated gateway. Governed actions are dry-run by default.</p>
    <div class="live-tool-gateway-controls">
      ${controls.map(control => `<article data-binding-id="${escapeHtml(control.binding.binding_id)}" data-control-id="${escapeHtml(control.binding.ui_control_id)}">
        <button type="button" id="${escapeHtml(control.binding.ui_control_id)}" data-live-gateway-binding="${escapeHtml(control.binding.binding_id)}" data-testid="live-gateway-control-${escapeHtml(control.binding.binding_id)}">${escapeHtml(control.label)}</button>
        <output data-live-gateway-result="${escapeHtml(control.binding.binding_id)}" aria-live="polite">idle</output>
      </article>`).join('')}
    </div>
  </section>`;
}

export function bindLiveToolGatewayPanel(container: HTMLElement, appId: string): void {
  const panel = container.querySelector<HTMLElement>(`.live-tool-gateway-panel[data-app-id="${cssEscape(appId)}"]`);
  if (!panel) return;
  for (const button of Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-live-gateway-binding]'))) {
    button.addEventListener('click', async () => {
      const bindingId = button.dataset.liveGatewayBinding;
      if (!bindingId) return;
      const output = panel.querySelector<HTMLOutputElement>(`[data-live-gateway-result="${cssEscape(bindingId)}"]`);
      button.disabled = true;
      if (output) output.textContent = 'pending';
      try {
        const result = await gateway().invoke(bindingId);
        const receipt = result.response.response && typeof result.response.response === 'object'
          ? (result.response.response as { receipt?: { receipt_id?: string; event_dag_refs?: string[] } }).receipt
          : undefined;
        if (output) output.textContent = `${result.state}; owner=${result.owner}; tool=${result.tool_id}; transport=${result.transport}; correlation=${result.correlation_id}; receipt=${receipt?.receipt_id ?? 'unavailable'}; event=${receipt?.event_dag_refs?.[0] ?? 'unavailable'}`;
        panel.dispatchEvent(new CustomEvent('swissknife:live-gateway-result', { bubbles: true, detail: result }));
      } catch (error) {
        if (output) output.textContent = `error: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        button.disabled = false;
      }
    });
  }
}

function cssEscape(value: string): string {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
