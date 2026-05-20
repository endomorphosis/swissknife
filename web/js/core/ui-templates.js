function escapeHtml(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function escapeAttr(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

const DEFAULT_REGION_DESCRIPTION = 'No description';

function renderStatusBanner(policyState = 'ready') {
    const map = {
        ready: '🟢 Ready',
        loading: '🟡 Loading',
        offline: '🟠 Offline',
        denied: '🔒 Permission denied',
        degraded: '⚠️ Degraded mode'
    };
    return `<div class="descriptor-status-banner">${map[policyState] || map.ready}</div>`;
}

const TemplateRenderers = {
    explorer(ctx) {
        return `
            <div class="descriptor-app descriptor-template-explorer">
                ${renderStatusBanner(ctx.policyState)}
                <div class="descriptor-header">
                    <h2>${escapeHtml(ctx.title)}</h2>
                    <p>${escapeHtml(ctx.description || '')}</p>
                </div>
                <div class="descriptor-toolbar">
                    ${(ctx.commands || []).map((cmd) => `
                        <button class="descriptor-command-btn" data-action="${escapeAttr(cmd.action)}">${escapeHtml(cmd.label)}</button>
                    `).join('')}
                </div>
                <div class="descriptor-layout">
                    <aside class="descriptor-sidebar">
                        <h4>Regions</h4>
                        <ul>${(ctx.regions || []).map((region) => `<li>${escapeHtml(region.name)}</li>`).join('')}</ul>
                    </aside>
                    <section class="descriptor-main">
                        <h4>Services</h4>
                        ${(ctx.services || []).map((svc) => `
                            <div class="descriptor-service-row">
                                <strong>${escapeHtml(svc.name)}</strong>
                                <span>${escapeHtml(svc.status || 'unknown')}</span>
                            </div>
                        `).join('')}
                    </section>
                </div>
            </div>
        `;
    },
    dashboard(ctx) {
        return `
            <div class="descriptor-app descriptor-template-dashboard">
                ${renderStatusBanner(ctx.policyState)}
                <div class="descriptor-header">
                    <h2>${escapeHtml(ctx.title)}</h2>
                    <p>${escapeHtml(ctx.description || '')}</p>
                </div>
                <div class="descriptor-grid">
                    ${(ctx.regions || []).map((region) => `
                        <article class="descriptor-card">
                            <h4>${escapeHtml(region.name)}</h4>
                            <p>${escapeHtml(region.description || DEFAULT_REGION_DESCRIPTION)}</p>
                        </article>
                    `).join('')}
                </div>
            </div>
        `;
    },
    'table-detail': (ctx) => TemplateRenderers.dashboard(ctx),
    'form-wizard': (ctx) => TemplateRenderers.explorer(ctx),
    'job-console': (ctx) => TemplateRenderers.dashboard(ctx),
    'chat-panel': (ctx) => TemplateRenderers.explorer(ctx),
    'graph-viewer': (ctx) => TemplateRenderers.dashboard(ctx)
};

export function renderTemplate(templateName, context = {}) {
    const renderer = TemplateRenderers[templateName] || TemplateRenderers.dashboard;
    return renderer(context);
}
