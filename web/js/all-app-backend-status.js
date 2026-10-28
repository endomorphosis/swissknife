const STATUS_ROUTE = "/mcp/apps/backend-status";

const statusCache = new Map();
const nativeOutputText = new WeakMap();
const nativeGroupText = new WeakMap();

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

  // The shared dock is available to every app without claiming its primary
  // space. Details and tool controls remain reachable through user disclosure.
  const dock = document.createElement("details");
  dock.dataset.testid = "backend-status-disclosure";
  dock.className = "backend-status-disclosure";
  dock.style.cssText = "min-width:0;max-width:100%;box-sizing:border-box;color:var(--sk-text,#e5e7eb);background:var(--sk-bg-panel,#10161d)";
  const summary = document.createElement("summary");
  summary.style.cssText = "position:sticky;top:0;z-index:1;padding:8px 12px;cursor:pointer;overflow-wrap:anywhere;background:var(--sk-bg-panel,#10161d)";
  summary.setAttribute("aria-label", "Backend status and tool controls");
  summary.dataset.testid = "backend-status-summary";
  const body = document.createElement("div");
  body.className = "backend-status-disclosure-body";
  body.style.cssText = "min-width:0;max-width:100%;max-height:min(32vh,20rem);overflow:auto;overflow-wrap:anywhere;overscroll-behavior:contain";
  dock.append(summary, body);
  Object.assign(container.style, { minWidth: "0", minHeight: "2.5rem", maxHeight: "42%", flex: "0 1 auto", overflow: "auto", overflowWrap: "anywhere" });

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
    row.style.cssText = "min-width:0;grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr));overflow-wrap:anywhere";
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

  body.append(panel);
  for (const child of [...container.children]) body.append(child);
  container.prepend(dock);
  const updateSummary = () => {
    const states = [...panel.querySelectorAll("[data-backend-owner]")].map(row =>
      `${row.dataset.backendKey}: ${row.dataset.backendState}`);
    summary.textContent = states.length ? `Backends · ${states.join(" · ")}` : "Backend status and tool controls";
    summary.setAttribute("aria-label", `${summary.textContent}. Show details and tool controls`);
  };
  updateSummary();
  bindAllAppBackendStatus(container, panel, updateSummary);

  // The normal gateway mounts after this status module. Keep those actual
  // controls in the same disclosure; never replace controls or their handlers.
  const settleDock = () => {
    for (const child of [...container.children]) if (child !== dock) body.append(child);
    if (container.querySelector("[data-gateway-confirm]")) dock.open = true;
    groupNativeOperationOutputs(container.closest(".window-app-content") || container.closest(".window") || container, body);
  };
  settleDock();
  dock.addEventListener("toggle", () => {
    if (!dock.open && container.querySelector("[data-gateway-confirm]")) dock.open = true;
  });
  const Observer = container.ownerDocument.defaultView?.MutationObserver;
  const ownWindow = container.closest(".window-app-content") || container.closest(".window") || container;
  if (Observer) new Observer(settleDock).observe(ownWindow, { childList: true, subtree: true });
}

function groupNativeOperationOutputs(scope, sharedBody) {
  const groups = new Set();
  for (const output of scope.querySelectorAll("output[data-gateway-status]")) {
    if (sharedBody.contains(output)) continue;
    let group = output.closest("details[data-native-operation-details]");
    if (!group) {
      const parent = output.parentElement;
      group = [...parent.children].find(node => node.matches("details[data-native-operation-details]"));
      if (!group) {
        group = output.ownerDocument.createElement("details");
        group.dataset.nativeOperationDetails = "true";
        group.style.cssText = "grid-column:1 / -1;flex:0 0 auto;min-width:0;max-width:100%;font-size:12px;overflow-wrap:anywhere";
        const summary = output.ownerDocument.createElement("summary");
        summary.style.cssText = "cursor:pointer;padding:4px 6px";
        const label = output.ownerDocument.createElement("span");
        label.dataset.nativeOperationSummary = "true";
        const announcement = output.ownerDocument.createElement("span");
        announcement.dataset.nativeOperationAnnouncement = "true";
        announcement.setAttribute("role", "status");
        announcement.setAttribute("aria-live", "polite");
        announcement.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap";
        summary.append(label, announcement);
        const details = output.ownerDocument.createElement("div");
        details.dataset.nativeOperationBody = "true";
        details.style.cssText = "max-height:min(24vh,12rem);overflow:auto;overflow-wrap:anywhere";
        group.append(summary, details);
        parent.append(group);
      }
      // Keep the exact node under its original native query container so the
      // next invocation reuses it rather than creating another status output.
      group.querySelector("[data-native-operation-body]").append(output);
    }
    groups.add(group);
    if (nativeOutputText.get(output) !== output.textContent) {
      nativeOutputText.set(output, output.textContent);
      nativeGroupText.set(group, output.textContent);
    }
  }
  for (const group of groups) {
    const raw = nativeGroupText.get(group) || "";
    const label = group.querySelector("[data-native-operation-summary]");
    const announcement = group.querySelector("[data-native-operation-announcement]");
    if (label.textContent !== "Backend operation details") label.textContent = "Backend operation details";
    if (announcement.textContent !== raw) announcement.textContent = raw;
  }
}

function bindAllAppBackendStatus(container, panel, updateSummary) {
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
    updateSummary();
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
