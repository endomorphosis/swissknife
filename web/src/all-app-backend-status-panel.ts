import {
  getAllAppBackendStatus,
  type AllAppBackendOwnerStatus,
} from '../../src/services/apps/all-app-backend-status-contract.js';

interface GatewayResultLike {
  state?: unknown;
  owner?: unknown;
  correlation_id?: unknown;
  policy_outcome?: unknown;
  recovery?: { error?: unknown; action?: unknown; user_message?: unknown } | null;
  response?: { response?: unknown };
}

interface LegacyGatewayEventLike {
  control?: { owner?: unknown };
  result?: unknown;
}

export function renderAllAppBackendStatusPanel(appId: string): string {
  const status = getAllAppBackendStatus(appId);
  if (!status) return '';
  return `<section class="all-app-backend-status-panel" data-testid="all-app-backend-status-panel" data-app-id="${escapeHtml(status.app_id)}">
    <header class="all-app-backend-status-header">
      <strong>K/D/A backend status</strong>
      <span data-testid="backend-status-disposition">${escapeHtml(status.disposition)}</span>
    </header>
    <div class="all-app-backend-status-grid" role="list">
      ${status.statuses.map(renderBackendStatusRow).join('')}
    </div>
  </section>`;
}

export function bindAllAppBackendStatusPanel(container: HTMLElement, appId: string): void {
  const panel = container.querySelector<HTMLElement>(
    `.all-app-backend-status-panel[data-app-id="${cssEscape(appId)}"]`,
  );
  if (!panel || panel.dataset.bound === 'true') return;
  panel.dataset.bound = 'true';
  container.addEventListener('swissknife:live-gateway-result', event => {
    const detail = (event as CustomEvent<GatewayResultLike | LegacyGatewayEventLike>).detail;
    const normalized = normalizeGatewayEvent(detail);
    if (!normalized.owner) return;
    const row = panel.querySelector<HTMLElement>(`[data-backend-owner="${cssEscape(normalized.owner)}"]`);
    if (!row) return;
    const state = normalized.state === 'executed'
      ? 'live'
      : normalized.state === 'denied'
        ? 'denied'
        : normalized.state === 'unavailable'
          ? 'unavailable'
          : normalized.state === 'error'
            ? 'unavailable'
            : String(row.dataset.backendState ?? 'unavailable');
    row.dataset.backendState = state;
    updateText(row, '[data-backend-state]', state);
    if (normalized.correlationId) updateText(row, '[data-backend-correlation]', normalized.correlationId);
    if (normalized.policyOutcome) updateText(row, '[data-backend-policy]', normalized.policyOutcome);
    if (normalized.receiptId) updateText(row, '[data-backend-receipt]', normalized.receiptId);
    if (normalized.recovery) updateText(row, '[data-backend-recovery]', normalized.recovery);
  });
}

function renderBackendStatusRow(status: AllAppBackendOwnerStatus): string {
  const bindingLabel = status.bindings.length > 0
    ? status.bindings.map(binding => binding.binding_id).join(', ')
    : status.role;
  const receipt = status.receipt.current_receipt_id ?? (status.receipt.required ? 'pending receipt' : 'not required');
  const recovery = status.recovery.routes[0]?.user_message ?? 'No recovery route.';
  return `<article class="all-app-backend-status-row" role="listitem" data-backend-owner="${escapeHtml(status.owner)}" data-backend-key="${escapeHtml(status.key)}" data-backend-state="${escapeHtml(status.state)}">
    <div class="all-app-backend-status-family">
      <span>${escapeHtml(status.key)}</span>
      <strong>${escapeHtml(status.label)}</strong>
    </div>
    <div class="all-app-backend-status-facts">
      <span data-backend-state>${escapeHtml(status.state)}</span>
      <span>${escapeHtml(status.source)}</span>
      <span title="${escapeHtml(bindingLabel)}">${escapeHtml(status.role)}</span>
    </div>
    <dl class="all-app-backend-status-detail">
      <div><dt>Correlation</dt><dd data-backend-correlation>${escapeHtml(status.correlation.current_correlation_id ?? 'required')}</dd></div>
      <div><dt>Policy</dt><dd data-backend-policy>${escapeHtml(status.policy.current_outcome)}</dd></div>
      <div><dt>Receipt</dt><dd data-backend-receipt>${escapeHtml(receipt)}</dd></div>
      <div><dt>Recovery</dt><dd data-backend-recovery>${escapeHtml(recovery)}</dd></div>
    </dl>
  </article>`;
}

function normalizeGatewayEvent(detail: GatewayResultLike | LegacyGatewayEventLike | undefined): {
  owner: string | null;
  state: string | null;
  correlationId: string | null;
  policyOutcome: string | null;
  receiptId: string | null;
  recovery: string | null;
} {
  const direct = detail as GatewayResultLike | undefined;
  const legacy = detail as LegacyGatewayEventLike | undefined;
  const result = isRecord(legacy?.result) ? legacy.result : direct;
  const response = isRecord((result as GatewayResultLike | undefined)?.response?.response)
    ? (result as GatewayResultLike).response!.response
    : isRecord(result)
      ? result
      : undefined;
  const receipt = isRecord(response) && isRecord(response.receipt) ? response.receipt : undefined;
  const recovery = (result as GatewayResultLike | undefined)?.recovery;
  const recoveryLabel = recovery
    ? [stringOrNull(recovery.error), stringOrNull(recovery.action), stringOrNull(recovery.user_message)]
      .filter((value): value is string => Boolean(value))
      .join('; ')
    : null;
  return {
    owner: stringOrNull((result as GatewayResultLike | undefined)?.owner)
      ?? stringOrNull(legacy?.control?.owner)
      ?? (isRecord(response) ? stringOrNull(response.owner) : null),
    state: stringOrNull((result as GatewayResultLike | undefined)?.state)
      ?? (isRecord(response) ? stringOrNull(response.outcome) : null),
    correlationId: stringOrNull((result as GatewayResultLike | undefined)?.correlation_id)
      ?? (isRecord(response) ? stringOrNull(response.correlation_id) : null),
    policyOutcome: stringOrNull((result as GatewayResultLike | undefined)?.policy_outcome)
      ?? (isRecord(receipt) ? stringOrNull(receipt.policy_outcome) : null),
    receiptId: isRecord(receipt) ? stringOrNull(receipt.receipt_id) : null,
    recovery: recoveryLabel,
  };
}

function updateText(parent: HTMLElement, selector: string, value: string): void {
  const target = parent.querySelector<HTMLElement>(selector);
  if (target) target.textContent = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function cssEscape(value: string): string {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
