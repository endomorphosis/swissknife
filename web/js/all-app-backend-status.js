const STATUS_ROUTE = "/mcp/apps/backend-status";

const statusCache = new Map();

export async function mountAllAppBackendStatus(container, appId) {
  if (
    !container ||
    !appId ||
    container.querySelector('[data-testid="all-app-backend-status-panel"]')
  )
    return;
  let status;
  try {
    status = await statusFor(appId);
  } catch {
    return;
  }
  if (!status) return;

  const panel = document.createElement("section");
  panel.className = "all-app-backend-status-panel";
  panel.dataset.testid = "all-app-backend-status-panel";
  panel.dataset.appId = status.app_id;
  panel.innerHTML = `
    <header class="all-app-backend-status-header">
      <strong>K/D/A backend status</strong>
      <span data-testid="backend-status-disposition">${escapeHtml(status.disposition)}</span>
    </header>
    <div class="all-app-backend-status-grid" role="list"></div>
  `;
  const grid = panel.querySelector(".all-app-backend-status-grid");
  for (const item of status.statuses ?? []) {
    const row = document.createElement("article");
    row.className = "all-app-backend-status-row";
    row.dataset.backendOwner = item.owner;
    row.dataset.backendKey = item.key;
    row.dataset.backendState = item.state;
    row.setAttribute("role", "listitem");
    const receipt = item.receipt?.current_receipt_id ?? (item.receipt?.required ? "pending receipt" : "not required");
    const recovery = item.recovery?.routes?.[0]?.user_message ?? "No recovery route.";
    row.innerHTML = `
      <div class="all-app-backend-status-family">
        <span>${escapeHtml(item.key)}</span>
        <strong>${escapeHtml(item.label)}</strong>
      </div>
      <div class="all-app-backend-status-facts">
        <span data-backend-state>${escapeHtml(item.state)}</span>
        <span>${escapeHtml(item.source)}</span>
        <span>${escapeHtml(item.role)}</span>
      </div>
      <dl class="all-app-backend-status-detail">
        <div><dt>Correlation</dt><dd data-backend-correlation>${escapeHtml(item.correlation?.current_correlation_id ?? "required")}</dd></div>
        <div><dt>Policy</dt><dd data-backend-policy>${escapeHtml(item.policy?.current_outcome ?? "not_evaluated")}</dd></div>
        <div><dt>Receipt</dt><dd data-backend-receipt>${escapeHtml(receipt)}</dd></div>
        <div><dt>Recovery</dt><dd data-backend-recovery>${escapeHtml(recovery)}</dd></div>
      </dl>
    `;
    grid.append(row);
  }

  container.prepend(panel);
  bindAllAppBackendStatus(container, panel);
}

function bindAllAppBackendStatus(container, panel) {
  if (panel.dataset.bound === "true") return;
  panel.dataset.bound = "true";
  container.addEventListener("swissknife:live-gateway-result", event => {
    const detail = event.detail ?? {};
    const result = detail.result ?? detail;
    const owner = result.owner ?? detail.control?.owner;
    if (!owner) return;
    const row = panel.querySelector(`[data-backend-owner="${cssEscape(owner)}"]`);
    if (!row) return;
    const response = result.response?.response ?? result;
    const receipt = response?.receipt ?? {};
    const state =
      result.state === "executed" || response.outcome === "executed"
        ? "live"
        : result.state === "denied" || response.outcome === "denied"
          ? "denied"
          : result.state === "unavailable" || result.state === "error"
            ? "unavailable"
            : row.dataset.backendState;
    row.dataset.backendState = state;
    setText(row, "[data-backend-state]", state);
    setText(row, "[data-backend-correlation]", result.correlation_id ?? response.correlation_id);
    setText(row, "[data-backend-policy]", result.policy_outcome ?? receipt.policy_outcome);
    setText(row, "[data-backend-receipt]", receipt.receipt_id);
    if (result.recovery) {
      setText(row, "[data-backend-recovery]", [result.recovery.error, result.recovery.action, result.recovery.user_message].filter(Boolean).join("; "));
    }
  });
}

async function statusFor(appId) {
  if (!statusCache.has(appId)) {
    statusCache.set(
      appId,
      fetch(`${STATUS_ROUTE}?app_id=${encodeURIComponent(appId)}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      }).then(async response => {
        if (!response.ok) throw new Error(`Backend status catalog returned HTTP ${response.status}.`);
        const body = await response.json();
        return body.app ?? null;
      }),
    );
  }
  try {
    return await statusCache.get(appId);
  } catch (error) {
    statusCache.delete(appId);
    throw error;
  }
}

function setText(parent, selector, value) {
  if (value === undefined || value === null || value === "") return;
  const target = parent.querySelector(selector);
  if (target) target.textContent = String(value);
}

function cssEscape(value) {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
