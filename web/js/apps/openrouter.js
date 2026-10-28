// SwissKnife Dedicated OpenRouter App
// Universal LLM Access Hub - Multiple AI Providers Through Single Interface

const OPENROUTER_CATALOG_URL = 'https://openrouter.ai/api/v1/models';
const CATALOG_CACHE_TTL_MS = 10 * 60 * 1000;
const CATALOG_ERROR_RETRY_MS = 30 * 1000;
let catalogSession = null;
let catalogRequest = null;
let nextOpenRouterInstance = 0;

// A VDG run explicitly selects this observed public input. The source-level
// digest makes a different catalog a different inventory/capture input.
export const OPENROUTER_CATALOG_SNAPSHOT_DESCRIPTOR = Object.freeze({
    schema: 'swissknife.openrouter-catalog-snapshot.v1',
    source_url: 'https://openrouter.ai/api/v1/models',
    observed_at: '2026-10-22T17:51:25.969769+00:00',
    raw_sha256: '65a3034c116179fac2ba1511796f0e1a014955986295385dfac8fbc35b7271bc',
    raw_bytes: 787610,
    model_count: 468,
    model_ids_sha256: '819a351f4633f638d5d26192f8a57162e8a6ab498aac04e35cd064c3d4947c41',
    local_url: '/vdg-public-inputs/openrouter/65a3034c116179fac2ba1511796f0e1a014955986295385dfac8fbc35b7271bc.json',
    provenance_url: '/vdg-public-inputs/openrouter/provenance-19726a9dac6901f79566e387871e286f32633b415ef28fb5f0912e94aa125e3c.json',
    provenance_sha256: '19726a9dac6901f79566e387871e286f32633b415ef28fb5f0912e94aa125e3c',
});

export function getOpenRouterCatalogMode() {
    return import.meta.env?.VITE_VDG_OPENROUTER_CATALOG_SNAPSHOT === '1' ? 'snapshot' : 'live';
}

let boundCatalogSession = null;
let boundCatalogRequest = null;

async function sha256Bytes(bytes) {
    if (!globalThis.crypto?.subtle) throw new Error('OpenRouter snapshot requires SHA-256 verification.');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validateSnapshotDescriptor(descriptor) {
    const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
    if (descriptor.schema !== 'swissknife.openrouter-catalog-snapshot.v1' ||
        descriptor.source_url !== OPENROUTER_CATALOG_URL ||
        !sha(descriptor.raw_sha256) || !sha(descriptor.provenance_sha256) || !sha(descriptor.model_ids_sha256) ||
        !Number.isSafeInteger(descriptor.raw_bytes) || descriptor.raw_bytes <= 0 ||
        !Number.isSafeInteger(descriptor.model_count) || descriptor.model_count <= 0 ||
        !Number.isFinite(Date.parse(descriptor.observed_at)) ||
        descriptor.local_url !== `/vdg-public-inputs/openrouter/${descriptor.raw_sha256}.json` ||
        descriptor.provenance_url !== `/vdg-public-inputs/openrouter/provenance-${descriptor.provenance_sha256}.json`) {
        throw new Error('OpenRouter snapshot descriptor is invalid.');
    }
}

function validateSnapshotProvenance(provenance, descriptor) {
    if (provenance?.schema !== 'swissknife.openrouter-observed-public-input.v1' ||
        provenance.source_url !== descriptor.source_url || provenance.final_url !== descriptor.source_url ||
        provenance.http_status !== 200 || provenance.observed_at !== descriptor.observed_at ||
        !Number.isFinite(Date.parse(provenance.requested_at)) || Date.parse(provenance.requested_at) > Date.parse(provenance.observed_at) ||
        provenance.raw_sha256 !== descriptor.raw_sha256 || provenance.raw_bytes !== descriptor.raw_bytes ||
        provenance.model_count !== descriptor.model_count || provenance.model_ids_sha256 !== descriptor.model_ids_sha256 ||
        provenance.raw_filename !== `${descriptor.raw_sha256}.json` ||
        provenance.reconstructed !== false || provenance.provider_execution !== false ||
        provenance.gui_acceptance !== false || provenance.work_complete !== false || provenance.completion_authority !== false) {
        throw new Error('OpenRouter snapshot provenance does not match the declared public observation.');
    }
}

// A pure verifier also supports input validation without mounting the app. The
// actual loader always supplies the source-bound descriptor above.
export async function verifyOpenRouterCatalogSnapshot(raw, provenanceBytes, descriptor = OPENROUTER_CATALOG_SNAPSHOT_DESCRIPTOR) {
    validateSnapshotDescriptor(descriptor);
    if (raw.byteLength !== descriptor.raw_bytes) throw new Error('OpenRouter snapshot raw byte length mismatch.');
    const [rawSha, provenanceSha] = await Promise.all([sha256Bytes(raw), sha256Bytes(provenanceBytes)]);
    if (rawSha !== descriptor.raw_sha256 || provenanceSha !== descriptor.provenance_sha256) {
        throw new Error('OpenRouter snapshot SHA-256 mismatch.');
    }
    // Authenticate both original byte sequences before interpreting either as
    // JSON. No missing/duplicate/replaced model is silently omitted.
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const provenance = JSON.parse(decoder.decode(provenanceBytes));
    validateSnapshotProvenance(provenance, descriptor);
    const data = JSON.parse(decoder.decode(raw));
    if (!Array.isArray(data?.data) || data.data.length !== descriptor.model_count || data.data.some(model =>
        !model || typeof model !== 'object' || Array.isArray(model) ||
        typeof model.id !== 'string' || model.id !== model.id.trim() ||
        model.id.indexOf('/') <= 0 || model.id.endsWith('/'))) {
        throw new Error('OpenRouter snapshot model schema/count mismatch.');
    }
    const ids = data.data.map(model => model.id);
    if (new Set(ids).size !== ids.length || await sha256Bytes(new TextEncoder().encode(JSON.stringify(ids.sort()))) !== descriptor.model_ids_sha256) {
        throw new Error('OpenRouter snapshot exact model ID set mismatch.');
    }
    return data.data;
}

function boundCatalogSnapshot(entry, cache) {
    const descriptor = OPENROUTER_CATALOG_SNAPSHOT_DESCRIPTOR;
    return {
        models: entry.models,
        metadata: {
            mode: 'snapshot', verified: true,
            input_sha256: descriptor.raw_sha256,
            model_ids_sha256: descriptor.model_ids_sha256,
            model_count: descriptor.model_count,
            raw_bytes: descriptor.raw_bytes,
            original_source: descriptor.source_url,
            source: descriptor.source_url,
            observed_at: descriptor.observed_at,
            local_url: descriptor.local_url,
            provenance_url: descriptor.provenance_url,
            provenance_sha256: descriptor.provenance_sha256,
            cache, cache_age_ms: Math.max(0, Date.now() - Date.parse(descriptor.observed_at)),
            cache_ttl_ms: null, retry_at: null, stale: false, error: null,
        },
    };
}

async function readBoundCatalog(timeoutMs) {
    if (boundCatalogRequest) return boundCatalogSnapshot(await boundCatalogRequest, 'coalesced');
    if (boundCatalogSession) return boundCatalogSnapshot(boundCatalogSession, 'snapshot-session');
    const descriptor = OPENROUTER_CATALOG_SNAPSHOT_DESCRIPTOR;
    validateSnapshotDescriptor(descriptor);
    const controller = new AbortController();
    let timer;
    // Cache publication happens after the bounded operation, so a late response
    // after timeout cannot populate this session or switch its input.
    boundCatalogRequest = (async () => {
        const entry = await Promise.race([
            (async () => {
                const readBytes = async url => {
                    const response = await fetch(url, { signal: controller.signal, credentials: 'same-origin', redirect: 'error', cache: 'no-cache' });
                    const expectedUrl = new URL(url, window.location.href).href;
                    if (!response.ok || response.status !== 200 || response.url !== expectedUrl) throw new Error(`OpenRouter snapshot input request failed or redirected: ${url}`);
                    const bytes = await response.arrayBuffer();
                    return bytes;
                };
                const [raw, provenanceBytes] = await Promise.all([
                    readBytes(descriptor.local_url),
                    readBytes(descriptor.provenance_url),
                ]);
                return { models: await verifyOpenRouterCatalogSnapshot(raw, provenanceBytes, descriptor) };
            })(),
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    controller.abort();
                    reject(new Error(`OpenRouter snapshot input verification timed out after ${timeoutMs} ms.`));
                }, timeoutMs);
            }),
        ]);
        boundCatalogSession = entry;
        return entry;
    })();
    try { return boundCatalogSnapshot(await boundCatalogRequest, 'snapshot-verified'); }
    finally { clearTimeout(timer); boundCatalogRequest = null; }
}

const modelControlAttributes = (model, action, favorite) => {
    const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    return `data-openrouter-model="${escape(model.id)}" data-openrouter-provider="${escape(model.provider)}" data-openrouter-placement="${favorite ? 'favorites' : 'catalog'}" data-openrouter-action="${action}"`;
};

function catalogSnapshot(entry, cache) {
    return {
        models: entry.models,
        metadata: {
            mode: 'live',
            source: OPENROUTER_CATALOG_URL,
            observed_at: entry.observed_at,
            attempted_at: entry.attempted_at,
            cache,
            cache_age_ms: entry.observed_at === null ? null : Math.max(0, Date.now() - Date.parse(entry.observed_at)),
            cache_ttl_ms: CATALOG_CACHE_TTL_MS,
            retry_at: new Date(entry.refresh_at).toISOString(),
            stale: Boolean(entry.error && entry.observed_at),
            error: entry.error,
        },
    };
}

async function readSessionCatalog(timeoutMs) {
    if (catalogRequest) return catalogSnapshot(await catalogRequest, 'coalesced');
    if (catalogSession && Date.now() < catalogSession.refresh_at) return catalogSnapshot(catalogSession, 'session');
    catalogRequest = (async () => {
        const attempted_at = new Date().toISOString();
        const controller = new AbortController();
        let timer;
        try {
            const models = await Promise.race([
                (async () => {
                    const response = await fetch(OPENROUTER_CATALOG_URL, { signal: controller.signal });
                    if (!response.ok) throw new Error(`OpenRouter models request failed: ${response.status}`);
                    const data = await response.json();
                    if (!Array.isArray(data?.data) || data.data.some(model => !model || typeof model !== 'object' || !(model.id || model.name))) throw new Error('OpenRouter returned an invalid model catalog.');
                    return data.data;
                })(),
                new Promise((_, reject) => {
                    timer = setTimeout(() => {
                        controller.abort();
                        reject(new Error(`OpenRouter catalog request or response body timed out after ${timeoutMs} ms.`));
                    }, timeoutMs);
                }),
            ]);
            const observed_at = new Date().toISOString();
            catalogSession = { models, observed_at, attempted_at, error: null, refresh_at: Date.now() + CATALOG_CACHE_TTL_MS };
        } catch (error) {
            catalogSession = {
                models: catalogSession?.models || [],
                observed_at: catalogSession?.observed_at || null,
                attempted_at,
                error: error instanceof Error ? error.message : String(error),
                refresh_at: Date.now() + CATALOG_ERROR_RETRY_MS,
            };
        } finally {
            clearTimeout(timer);
        }
        return catalogSession;
    })();
    try { return catalogSnapshot(await catalogRequest, 'network'); }
    finally { catalogRequest = null; }
}

class OpenRouterApp {
    constructor({ requestTimeoutMs = 8000 } = {}) {
        this.name = 'OpenRouter Hub';
        this.requestTimeoutMs = Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0 ? Math.min(requestTimeoutMs, 30000) : 8000;
        this.catalogMetadata = null;
        Object.defineProperty(this, 'catalogMode', { value: getOpenRouterCatalogMode(), enumerable: true });
        // Single live instance for inline handlers (one desktop window per app).
        this.instanceId = `openrouter-instance-${++nextOpenRouterInstance}`;
        this.disposed = false;
        this.documentClickHandler = null;
        this.autoSaveTimer = null;
        this.authenticationModal = null;
        if (typeof window !== 'undefined') {
            window.openRouterApp?.dispose?.();
            window.openRouterApp = this;
            this.setupEventListeners();
        }
        this.currentTab = 'models';
        this.models = new Map();
        this.conversations = [];
        this.currentConversation = null;
        this.apiKey = localStorage.getItem('openrouter_api_key') || '';
        this.isAuthenticated = false;
        this.credits = { balance: 0, used: 0 };
        this.providers = new Map();
        this.favoriteModels = new Set(JSON.parse(localStorage.getItem('openrouter_favorites') || '[]'));
        this.settings = {
            defaultModel: 'openai/gpt-4',
            maxTokens: 2048,
            temperature: 0.7,
            topP: 1,
            streamingEnabled: true,
            autoSave: true
        };
        this.requestHistory = [];
        this.modelStats = new Map();
    }

    async initialize() {
        console.log('🔄 Initializing OpenRouter App...');
        
        // Check authentication status
        this.checkAuthentication();
        
        // Load available models
        await this.loadModels();
        
        // Load user data
        await this.loadUserData();
        
        // Initialize event listeners
        this.setupEventListeners();
        
        console.log('✅ OpenRouter App initialized successfully');
    }

    render() {
        return `
        <div class="openrouter-app" data-openrouter-instance="${this.instanceId}">
            <style>
              .openrouter-app{max-width:100%;box-sizing:border-box}
              .openrouter-app .playground-layout,.openrouter-app .playground-controls,.openrouter-app .control-section,.openrouter-app .chat-layout{max-width:100%;min-width:0;box-sizing:border-box;margin-left:0;position:relative;left:auto;transform:none}
              .openrouter-app .control-section h3{margin-left:0;padding-left:0;overflow:visible}
              .openrouter-app .or-header{flex-wrap:wrap;align-items:center}
              .openrouter-app .or-logo-text,.openrouter-app .or-status,.openrouter-app .tab-item,.openrouter-app .tab-label{white-space:nowrap;overflow:visible;text-overflow:clip;flex:0 0 auto;max-width:none}
              .openrouter-app .or-nav-tabs{display:flex;flex-wrap:wrap;overflow:visible;max-width:100%}
              .openrouter-app .or-catalog-status{white-space:normal;overflow-wrap:anywhere;line-height:1.4}
              .openrouter-app .or-content{display:block;min-height:12rem;overflow:auto}
              .openrouter-app .or-chat-tab,.openrouter-app .chat-layout,.openrouter-app .chat-sidebar,.openrouter-app .chat-main,.openrouter-app .sidebar-header,.openrouter-app .or-playground-tab,.openrouter-app .playground-main,.openrouter-app .playground-footer{display:block;visibility:visible;position:relative;overflow:visible;min-height:2.5rem}
              .openrouter-app #openrouter-new-chat,.openrouter-app #generate-btn{display:inline-flex;visibility:visible;opacity:1;position:relative;min-height:2.25rem;min-width:6rem;max-width:100%}
              .openrouter-app #message-input,.openrouter-app #playground-input{display:block;visibility:visible;opacity:1;position:relative;width:100%;min-height:2.25rem;box-sizing:border-box}
              .openrouter-app .or-modal{overflow:auto;display:flex;align-items:flex-start;justify-content:center;box-sizing:border-box;padding:0.75rem}
              .openrouter-app .or-modal .modal-content{width:min(26rem,100%);max-height:100%;height:auto;overflow:auto;box-sizing:border-box;display:flex;flex-direction:column;background:#f4f6f8;color:#1a1a1a}
              .openrouter-app .or-modal .modal-body{flex:1 1 auto;min-height:0;overflow:auto}
              .openrouter-app .or-modal .modal-footer{flex:0 0 auto;display:flex;flex-wrap:wrap;gap:0.5rem;overflow:visible}
              .openrouter-app .or-modal .modal-footer .or-btn{visibility:visible;opacity:1;min-height:2.25rem;position:relative}
              .openrouter-app .or-modal #api-key-input{display:block !important;width:100% !important;box-sizing:border-box !important;min-height:2.5rem !important;padding:0.45rem 0.65rem !important;background:#fff !important;background-color:#fff !important;background-image:none !important;background-clip:border-box !important;color:#1a1a1a !important;-webkit-text-fill-color:#1a1a1a !important;border:1px solid #5c6570 !important;border-radius:6px !important;caret-color:#1a1a1a !important;opacity:1 !important;filter:none !important;box-shadow:inset 0 0 0 1px #5c6570 !important;appearance:none !important;-webkit-appearance:none !important}
              .openrouter-app .or-modal #api-key-input::placeholder{color:#5c6570 !important;opacity:1 !important;-webkit-text-fill-color:#5c6570 !important}
              .openrouter-app .or-modal .help-text,.openrouter-app .or-modal .help-text a{color:#1a1a1a !important;opacity:1 !important}
              .openrouter-app .or-modal #api-key-input:-webkit-autofill,.openrouter-app .or-modal #api-key-input:-webkit-autofill:focus{-webkit-text-fill-color:#1a1a1a !important;-webkit-box-shadow:0 0 0 1000px #fff inset !important;caret-color:#1a1a1a !important}
            </style>
            <!-- Header with Authentication -->
            <div class="or-header">
                <div class="or-header-left">
                    <div class="or-logo">
                        <div class="or-logo-icon">🔄</div>
                        <div class="or-logo-text">OpenRouter Hub</div>
                    </div>
                    <div class="or-status ${this.isAuthenticated ? 'authenticated' : 'unauthenticated'}">
                        <div class="status-indicator sk-status-dot ${this.isAuthenticated ? 'is-ok' : 'is-idle'}"></div>
                        <span>${this.isAuthenticated ? 'Key set' : 'No key'}</span>
                    </div>
                    ${this.isAuthenticated ? `
                    <div class="or-credits">
                        <span class="credits-icon">💰</span>
                        ${this.credits.unavailable
                            ? `<span class="credits-balance sk-badge" title="${this.credits.unavailable}">n/a</span>`
                            : `<span class="credits-balance">$${Number(this.credits.balance || 0).toFixed(4)}</span>`}
                    </div>
                    ` : ''}
                </div>
                <div class="or-header-right">
                    <button class="or-btn or-btn-secondary sk-btn" onclick="window.openRouterApp.showSettings()">
                        <span class="btn-icon">⚙️</span>
                        Settings
                    </button>
                    <button type="button" id="openrouter-connect" class="or-btn or-btn-primary sk-btn sk-btn-primary" onclick="window.openRouterApp.showAuthentication()">
                        <span class="btn-icon">🔑</span>
                        ${this.isAuthenticated ? 'Manage API Key' : 'Connect'}
                    </button>
                </div>
            </div>

            <!-- Navigation Tabs -->
            <div class="or-nav-tabs">
                <div class="tab-item ${this.currentTab === 'models' ? 'active' : ''}" data-tab="models" role="tab" tabindex="0" onclick="window.openRouterApp.switchTab('models')">
                    <span class="tab-icon">🤖</span>
                    <span class="tab-label">Models</span>
                    <span class="tab-count">${this.models.size}</span>
                </div>
                <div class="tab-item ${this.currentTab === 'chat' ? 'active' : ''}" data-tab="chat" role="tab" tabindex="0" onclick="window.openRouterApp.switchTab('chat')">
                    <span class="tab-icon">💬</span>
                    <span class="tab-label">Chat</span>
                    <span class="tab-count">${this.conversations.length}</span>
                </div>
                <div class="tab-item ${this.currentTab === 'playground' ? 'active' : ''}" data-tab="playground" role="tab" tabindex="0" onclick="window.openRouterApp.switchTab('playground')">
                    <span class="tab-icon">🎮</span>
                    <span class="tab-label">Playground</span>
                </div>
                <div class="tab-item ${this.currentTab === 'analytics' ? 'active' : ''}" data-tab="analytics" role="tab" tabindex="0" onclick="window.openRouterApp.switchTab('analytics')">
                    <span class="tab-icon">📊</span>
                    <span class="tab-label">Analytics</span>
                </div>
                <div class="tab-item ${this.currentTab === 'providers' ? 'active' : ''}" data-tab="providers" role="tab" tabindex="0" onclick="window.openRouterApp.switchTab('providers')">
                    <span class="tab-icon">🏢</span>
                    <span class="tab-label">Providers</span>
                    <span class="tab-count">${this.providers.size}</span>
                </div>
            </div>

            <!-- Content Area -->
            <div class="or-content">
                ${this.renderCurrentTab()}
            </div>
        </div>
        `;
    }

    renderCurrentTab() {
        switch (this.currentTab) {
            case 'models':
                return this.renderModelsTab();
            case 'chat':
                return this.renderChatTab();
            case 'playground':
                return this.renderPlaygroundTab();
            case 'analytics':
                return this.renderAnalyticsTab();
            case 'providers':
                return this.renderProvidersTab();
            default:
                return this.renderModelsTab();
        }
    }

    renderModelsTab() {
        const groupedModels = this.groupModelsByProvider();
        
        return `
        <div class="or-models-tab">
            <div class="models-header">
                <div class="models-controls">
                    <div class="search-bar">
                        <input type="text" class="sk-input" placeholder="Search models..." aria-label="Search models" id="model-search" oninput="window.openRouterApp.filterModels(event.target.value)">
                        <span class="search-icon">🔍</span>
                    </div>
                    <select id="provider-filter" class="sk-select" aria-label="Provider" onchange="window.openRouterApp.filterByProvider(event.target.value)">
                        <option value="">All Providers</option>
                        ${Array.from(this.providers.keys()).map(provider => 
                            `<option value="${provider}">${provider}</option>`
                        ).join('')}
                    </select>
                    <select id="model-sort" class="sk-select" aria-label="Sort models" onchange="window.openRouterApp.sortModels(event.target.value)">
                        <option value="name">Sort by Name</option>
                        <option value="provider">Sort by Provider</option>
                        <option value="pricing">Sort by Price</option>
                        <option value="context">Sort by Context Length</option>
                    </select>
                </div>
                <div class="models-stats">
                    <div class="stat-item">
                        <span class="stat-label">Total Models</span>
                        <span class="stat-value">${this.models.size}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Providers</span>
                        <span class="stat-value">${this.providers.size}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Favorites</span>
                        <span class="stat-value">${this.favoriteModels.size}</span>
                    </div>
                </div>
            </div>

            <p class="or-catalog-status" role="status">${this.catalogStatusText().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
            <div class="models-grid" id="models-grid">
                ${this.favoriteModels.size > 0 ? `
                <div class="models-section">
                    <h3 class="section-title">⭐ Favorite Models</h3>
                    <div class="models-row">
                        ${Array.from(this.favoriteModels).map(modelId => {
                            const model = this.models.get(modelId);
                            return model ? this.renderModelCard(model, true) : '';
                        }).join('')}
                    </div>
                </div>
                ` : ''}
                
                ${Array.from(groupedModels).map(([provider, models]) => `
                <div class="models-section">
                    <h3 class="section-title">${this.getProviderIcon(provider)} ${provider}</h3>
                    <div class="models-row">
                        ${models.map(model => this.renderModelCard(model)).join('')}
                    </div>
                </div>
                `).join('')}
            </div>
        </div>
        `;
    }

    renderModelCard(model, isFavorite = false) {
        const isCurrentDefault = model.id === this.settings.defaultModel;
        
        return `
        <div class="model-card sk-card ${isCurrentDefault ? 'default-model' : ''}" data-model-id="${model.id}">
            <div class="model-header">
                <div class="model-name">${model.name}</div>
                <div class="model-actions">
                    <button class="action-btn favorite-btn ${this.favoriteModels.has(model.id) ? 'active' : ''}" 
                            ${modelControlAttributes(model, 'favorite', isFavorite)}
                            onclick="window.openRouterApp.toggleFavorite('${model.id}')" title="Toggle Favorite">
                        ⭐
                    </button>
                    <button class="action-btn info-btn" ${modelControlAttributes(model, 'info', isFavorite)} onclick="window.openRouterApp.showModelInfo('${model.id}')" title="Model Info">
                        ℹ️
                    </button>
                </div>
            </div>
            
            <div class="model-details">
                <div class="model-provider">${model.provider}</div>
                <div class="model-context">Context: ${this.formatContextLength(model.context_length)}</div>
                <div class="model-pricing">
                    <span class="price-input">Input: $${model.pricing?.prompt || 'N/A'}/1K</span>
                    <span class="price-output">Output: $${model.pricing?.completion || 'N/A'}/1K</span>
                </div>
            </div>

            <div class="model-features">
                ${model.features?.map(feature => `<span class="feature-tag">${feature}</span>`).join('') || ''}
            </div>

            <div class="model-footer">
                <button class="or-btn or-btn-secondary or-btn-sm sk-btn" ${modelControlAttributes(model, 'try', isFavorite)} onclick="window.openRouterApp.tryModel('${model.id}')">
                    Try Model
                </button>
                <button class="or-btn or-btn-primary or-btn-sm sk-btn sk-btn-primary" ${modelControlAttributes(model, 'default', isFavorite)} aria-pressed="${isCurrentDefault}" onclick="window.openRouterApp.setDefaultModel('${model.id}')">
                    ${isCurrentDefault ? '✓ Default' : 'Set Default'}
                </button>
            </div>
        </div>
        `;
    }

    renderChatTab() {
        return `
        <div class="or-chat-tab">
            <div class="chat-layout">
                <div class="chat-sidebar">
                    <div class="sidebar-header">
                        <h3>Conversations</h3>
                        <button type="button" id="openrouter-new-chat" class="or-btn or-btn-primary or-btn-sm sk-btn sk-btn-primary" onclick="window.openRouterApp.createNewConversation()">
                            + New Chat
                        </button>
                    </div>
                    <div class="conversations-list">
                        ${this.conversations.length === 0 ? `
                        <div class="empty-state sk-empty">
                            <div class="empty-icon sk-empty-icon">💬</div>
                            <div class="empty-text">No conversations yet</div>
                            <div class="empty-subtext">Start a new conversation to begin</div>
                        </div>
                        ` : this.conversations.map(conv => this.renderConversationItem(conv)).join('')}
                    </div>
                </div>

                <div class="chat-main">
                    ${this.currentConversation ? this.renderCurrentConversation() : this.renderChatWelcome()}
                </div>
            </div>
        </div>
        `;
    }

    renderChatWelcome() {
        return `
        <div class="chat-welcome">
            <h3>OpenRouter Chat</h3>
            <p>Choose New Chat, enter a prompt, and press Enter. Without an API key, the message stays in this conversation and no provider request is sent.</p>
        </div>
        `;
    }

    renderCurrentConversation() {
        return `
        <div class="conversation-view">
            <div class="conversation-header">
                <div class="conversation-info">
                    <h3>${this.currentConversation.title}</h3>
                    <div class="conversation-meta">
                        Model: ${this.currentConversation.model} | 
                        Messages: ${this.currentConversation.messages.length} |
                        Tokens: ${this.currentConversation.tokenCount || 0}
                    </div>
                </div>
                <div class="conversation-actions">
                    <button class="action-btn" onclick="window.openRouterApp.exportConversation()" title="Export">📤</button>
                    <button class="action-btn" onclick="window.openRouterApp.shareConversation()" title="Share">🔗</button>
                    <button class="action-btn" onclick="window.openRouterApp.deleteConversation()" title="Delete">🗑️</button>
                </div>
            </div>

            <div class="messages-container" id="messages-container">
                ${this.currentConversation.messages.map(msg => this.renderMessage(msg)).join('')}
            </div>

            <div class="message-input-area">
                <div class="input-controls">
                    <select id="chat-model" class="sk-select" onchange="window.openRouterApp.changeConversationModel(event.target.value)">
                        ${Array.from(this.models.values()).map(model => 
                            `<option value="${model.id}" ${model.id === this.currentConversation.model ? 'selected' : ''}>
                                ${model.name}
                            </option>`
                        ).join('')}
                    </select>
                    <div class="generation-controls">
                        <label>Temp: <input type="range" min="0" max="2" step="0.1" value="${this.settings.temperature}" onchange="window.openRouterApp.updateTemperature(event.target.value)"></label>
                        <label>Max Tokens: <input type="number" min="1" max="4096" value="${this.settings.maxTokens}" onchange="window.openRouterApp.updateMaxTokens(event.target.value)"></label>
                    </div>
                </div>
                <div class="input-row">
                    <textarea id="message-input" class="sk-textarea" placeholder="Type your message..." onkeydown="window.openRouterApp.handleInputKeyDown(event)"></textarea>
                    <button class="send-btn" onclick="window.openRouterApp.sendMessage()" id="send-btn">
                        <span class="send-icon">📤</span>
                    </button>
                </div>
            </div>
        </div>
        `;
    }

    renderPlaygroundTab() {
        return `
        <div class="or-playground-tab">
            <div class="playground-layout">
                <div class="playground-controls">
                    <div class="control-section">
                        <h3>Model Configuration</h3>
                        <div class="control-group">
                            <label>Model:</label>
                            <select id="playground-model" class="sk-select" onchange="window.openRouterApp.updatePlaygroundModel(event.target.value)">
                                ${Array.from(this.models.values()).map(model => 
                                    `<option value="${model.id}" ${model.id === this.settings.defaultModel ? 'selected' : ''}>
                                        ${model.name}
                                    </option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="control-group">
                            <label>Temperature: <span id="temp-value">${this.settings.temperature}</span></label>
                            <input type="range" min="0" max="2" step="0.1" value="${this.settings.temperature}" 
                                   onchange="window.openRouterApp.updatePlaygroundSetting('temperature', event.target.value)">
                        </div>
                        <div class="control-group">
                            <label>Max Tokens: <span id="tokens-value">${this.settings.maxTokens}</span></label>
                            <input type="range" min="1" max="4096" step="1" value="${this.settings.maxTokens}" 
                                   onchange="window.openRouterApp.updatePlaygroundSetting('maxTokens', event.target.value)">
                        </div>
                        <div class="control-group">
                            <label>Top P: <span id="topp-value">${this.settings.topP}</span></label>
                            <input type="range" min="0" max="1" step="0.1" value="${this.settings.topP}" 
                                   onchange="window.openRouterApp.updatePlaygroundSetting('topP', event.target.value)">
                        </div>
                    </div>

                    <div class="control-section">
                        <h3>Quick Prompts</h3>
                        <div class="quick-prompts">
                            <button class="prompt-btn" onclick="window.openRouterApp.loadQuickPrompt('creative')">✨ Creative Writing</button>
                            <button class="prompt-btn" onclick="window.openRouterApp.loadQuickPrompt('code')">💻 Code Assistant</button>
                            <button class="prompt-btn" onclick="window.openRouterApp.loadQuickPrompt('analyze')">📊 Data Analysis</button>
                            <button class="prompt-btn" onclick="window.openRouterApp.loadQuickPrompt('translate')">🌍 Translation</button>
                            <button class="prompt-btn" onclick="window.openRouterApp.loadQuickPrompt('summarize')">📝 Summarization</button>
                            <button class="prompt-btn" onclick="window.openRouterApp.loadQuickPrompt('explain')">🧠 Explanation</button>
                        </div>
                    </div>
                </div>

                <div class="playground-main">
                    <div class="input-section">
                        <div class="section-header">
                            <h3>Input</h3>
                            <button class="or-btn or-btn-secondary or-btn-sm sk-btn" onclick="window.openRouterApp.clearPlayground()">Clear</button>
                        </div>
                        <textarea id="playground-input" class="sk-textarea" placeholder="Enter your prompt here..."></textarea>
                    </div>

                    <div class="output-section">
                        <div class="section-header">
                            <h3>Output</h3>
                            <div class="output-actions">
                                <button class="or-btn or-btn-secondary or-btn-sm sk-btn" onclick="window.openRouterApp.copyOutput()">📋 Copy</button>
                                <button class="or-btn or-btn-secondary or-btn-sm sk-btn" onclick="window.openRouterApp.saveOutput()">💾 Save</button>
                            </div>
                        </div>
                        <div id="playground-output" class="output-content">
                            <div class="output-placeholder">
                                <div class="placeholder-icon">🎮</div>
                                <div class="placeholder-text">AI Playground</div>
                                <div class="placeholder-subtext">Enter a prompt and click Generate to see AI responses</div>
                            </div>
                        </div>
                    </div>

                    <div class="playground-footer">
                        <button class="or-btn or-btn-primary sk-btn sk-btn-primary" onclick="window.openRouterApp.generateResponse()" id="generate-btn">
                            <span class="btn-icon">⚡</span>
                            Generate Response
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    renderAnalyticsTab() {
        return `
        <div class="or-analytics-tab">
            <div class="analytics-header">
                <h2>Usage Analytics</h2>
                <div class="date-range">
                    <select id="analytics-period" class="sk-select" onchange="window.openRouterApp.updateAnalyticsPeriod(event.target.value)">
                        <option value="24h">Last 24 Hours</option>
                        <option value="7d">Last 7 Days</option>
                        <option value="30d">Last 30 Days</option>
                        <option value="all">All Time</option>
                    </select>
                </div>
            </div>

            <div class="analytics-grid">
                <div class="analytics-card">
                    <div class="card-header">
                        <h3>💰 Spending Overview</h3>
                    </div>
                    <div class="card-content">
                        <div class="metric-large">
                            <span class="metric-value">$${this.credits.used.toFixed(4)}</span>
                            <span class="metric-label">Total Spent</span>
                        </div>
                        <div class="metrics-row">
                            <div class="metric-small">
                                <span class="metric-value">$${this.credits.balance.toFixed(4)}</span>
                                <span class="metric-label">Remaining</span>
                            </div>
                            <div class="metric-small">
                                <span class="metric-value">${this.requestHistory.length}</span>
                                <span class="metric-label">Requests</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="analytics-card">
                    <div class="card-header">
                        <h3>🤖 Model Usage</h3>
                    </div>
                    <div class="card-content">
                        <div class="usage-chart">
                            ${this.renderModelUsageChart()}
                        </div>
                    </div>
                </div>

                <div class="analytics-card">
                    <div class="card-header">
                        <h3>📊 Request Statistics</h3>
                    </div>
                    <div class="card-content">
                        <div class="stats-list">
                            <div class="stat-row">
                                <span class="stat-label">Avg Response Time</span>
                                <span class="stat-value">${this.calculateAverageResponseTime()}ms</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">Success Rate</span>
                                <span class="stat-value">${this.calculateSuccessRate()}%</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">Avg Tokens/Request</span>
                                <span class="stat-value">${this.calculateAverageTokens()}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="analytics-card full-width">
                    <div class="card-header">
                        <h3>📈 Request History</h3>
                    </div>
                    <div class="card-content">
                        <div class="history-table">
                            ${this.renderRequestHistory()}
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    renderProvidersTab() {
        return `
        <div class="or-providers-tab">
            <div class="providers-header">
                <h2>AI Providers</h2>
                <div class="providers-stats">
                    <div class="stat-item">
                        <span class="stat-value">${this.providers.size}</span>
                        <span class="stat-label">Providers</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${this.models.size}</span>
                        <span class="stat-label">Total Models</span>
                    </div>
                </div>
            </div>

            <div class="providers-grid">
                ${Array.from(this.providers.values()).map(provider => this.renderProviderCard(provider)).join('')}
            </div>
        </div>
        `;
    }

    renderProviderCard(provider) {
        return `
        <div class="provider-card">
            <div class="provider-header">
                <div class="provider-icon">${this.getProviderIcon(provider.name)}</div>
                <div class="provider-info">
                    <h3>${provider.name}</h3>
                    <div class="provider-models">${provider.models.length} models</div>
                </div>
            </div>

            <div class="provider-features">
                ${provider.features?.map(feature => `<span class="feature-tag">${feature}</span>`).join('') || ''}
            </div>

            <div class="provider-pricing">
                <div class="pricing-info">
                    <span class="pricing-label">Price Range:</span>
                    <span class="pricing-range">$${provider.priceRange?.min || '0'} - $${provider.priceRange?.max || 'N/A'}/1K tokens</span>
                </div>
            </div>

            <div class="provider-stats">
                <div class="stat-item">
                    <span class="stat-value">${provider.usage || 0}</span>
                    <span class="stat-label">Requests</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${provider.uptime || 99}%</span>
                    <span class="stat-label">Uptime</span>
                </div>
            </div>
        </div>
        `;
    }

    // Event Handlers and Core Methods
    setupEventListeners() {
        if (!this.isCurrentInstance()) return;
        if (!this.documentClickHandler) {
            this.documentClickHandler = event => {
                if (!this.isCurrentInstance()) { this.dispose(); return; }
                const container = this.getContainer();
                const tab = event.target.closest?.('.tab-item');
                if (container && tab && container.contains(tab)) this.switchTab(tab.dataset.tab);
            };
            document.addEventListener('click', this.documentClickHandler);
        }
        if (this.autoSaveTimer === null) {
            this.autoSaveTimer = setInterval(() => {
                if (!this.isCurrentInstance() || !this.getContainer()?.isConnected) { this.dispose(); return; }
                if (this.settings.autoSave) this.saveSettings();
            }, 30000);
        }
    }

    isCurrentInstance() {
        return !this.disposed && typeof window !== 'undefined' && window.openRouterApp === this;
    }

    getContainer() {
        const exact = document.querySelector(`.openrouter-app[data-openrouter-instance="${this.instanceId}"]`);
        if (exact?.isConnected) return exact;
        const nested = document.querySelector('.window[data-app-id="openrouter"] .window-app-content .openrouter-app')
            || document.querySelector('.window[data-app-id="openrouter"] .openrouter-app');
        return nested?.isConnected ? nested : null;
    }

    dispose() {
        if (this.disposed) return;
        this.closeModal();
        this.disposed = true;
        if (this.documentClickHandler) document.removeEventListener('click', this.documentClickHandler);
        this.documentClickHandler = null;
        if (this.autoSaveTimer !== null) clearInterval(this.autoSaveTimer);
        this.autoSaveTimer = null;
        this.models.clear();
        this.providers.clear();
        if (typeof window !== 'undefined' && window.openRouterApp === this) delete window.openRouterApp;
    }

    switchTab(tab) {
        if (!tab) return;
        this.currentTab = tab;
        this.updateDisplay();
    }

    updateDisplay() {
        if (!this.isCurrentInstance()) return;
        const container = this.getContainer();
        const content = container?.querySelector('.or-content');
        if (container && content) {
            content.innerHTML = this.renderCurrentTab();
            container.querySelectorAll('.tab-item').forEach(item => {
                item.classList.toggle('active', item.dataset.tab === this.currentTab);
            });
            return;
        }
        if (container) {
            container.outerHTML = this.render();
            return;
        }
        const host = document.querySelector('.window[data-app-id="openrouter"] .window-app-content');
        if (host) host.innerHTML = this.render();
    }

    checkAuthentication() {
        this.isAuthenticated = !!this.apiKey && this.apiKey.length > 0;
        if (this.isAuthenticated) {
            this.loadUserCredits();
        }
    }

    async loadModels() {
        if (!this.isCurrentInstance()) return;
        try {
            console.log('🔄 Loading OpenRouter models...');

            // Reopening a window reuses the complete real catalog observed in
            // this browser module session. Concurrent windows share one bounded
            // request, including JSON body consumption. A failed refresh retains
            // prior real observations with an explicit stale/error status.
            const { models: modelList, metadata } = await (this.catalogMode === 'snapshot'
                ? readBoundCatalog(this.requestTimeoutMs)
                : readSessionCatalog(this.requestTimeoutMs));
            if (!this.isCurrentInstance()) return;
            this.catalogMetadata = metadata;
            this.models.clear();

            // Populate models from the real catalog
            modelList.forEach(model => {
                const id = model.id || model.name;
                if (!id) return;
                this.models.set(id, {
                    ...(this.catalogMode === 'snapshot' ? structuredClone(model) : {}),
                    id,
                    name: model.name || id,
                    provider: id.split('/')[0] || 'unknown',
                    context_length: model.context_length || 0,
                    pricing: { ...(model.pricing || { prompt: 0, completion: 0 }) },
                    features: this.catalogMode === 'snapshot' && model.features !== undefined ? structuredClone(model.features) : ['chat']
                });
            });

            // Group by providers
            this.providers.clear();
            Array.from(this.models.values()).forEach(model => {
                if (!this.providers.has(model.provider)) {
                    this.providers.set(model.provider, {
                        name: model.provider,
                        models: [],
                        features: [],
                        priceRange: { min: Infinity, max: 0 }
                    });
                }

                const provider = this.providers.get(model.provider);
                provider.models.push(model);

                // Update price range
                const minPrice = Math.min(Number(model.pricing.prompt) || 0, Number(model.pricing.completion) || 0);
                const maxPrice = Math.max(Number(model.pricing.prompt) || 0, Number(model.pricing.completion) || 0);
                provider.priceRange.min = Math.min(provider.priceRange.min, minPrice);
                provider.priceRange.max = Math.max(provider.priceRange.max, maxPrice);
            });

            console.log(`Loaded ${this.models.size} OpenRouter models (${metadata.cache}; observed ${metadata.observed_at || 'unavailable'}).`);
            this.updateDisplay();
        } catch (error) {
            console.error('❌ Failed to load models:', error);
            if (this.catalogMode === 'snapshot') {
                this.catalogMetadata = { mode: 'snapshot', verified: false, error: error instanceof Error ? error.message : String(error) };
                this.models.clear();
                this.providers.clear();
                throw error;
            }
        }
    }

    catalogStatusText() {
        const metadata = this.catalogMetadata;
        if (!metadata) return 'OpenRouter catalog has not been requested in this window.';
        if (metadata.mode === 'snapshot') return metadata.verified
            ? `Verified OpenRouter catalog snapshot from ${metadata.original_source}, observed ${metadata.observed_at} (age ${Math.max(0, Date.now() - Date.parse(metadata.observed_at))} ms); ${metadata.model_count} models, SHA-256 ${metadata.input_sha256}. This declared input remains fixed for this run.`
            : `Declared OpenRouter catalog snapshot unavailable: ${metadata.error}`;
        if (metadata.error) return metadata.stale ? 'Showing the last OpenRouter catalog from this session. Refresh failed; reopen the window to try again.' : 'OpenRouter catalog is unavailable. Reopen this window to retry.';
        return `Actual OpenRouter catalog observed ${metadata.observed_at}; ${metadata.cache} response, age ${metadata.cache_age_ms} ms. Complete catalog retained for up to ${metadata.cache_ttl_ms / 60000} minutes.`;
    }

    async loadUserCredits() {
        try {
            // Real OpenRouter key-info endpoint; only callable with a user key.
            if (!this.apiKey) {
                this.credits = { balance: 0, used: 0, unavailable: 'Enter your OpenRouter API key to read credit balance.' };
                return;
            }
            const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
                headers: { 'Authorization': `Bearer ${this.apiKey}` }
            });
            if (!response.ok) throw new Error(`OpenRouter key check failed: ${response.status}`);
            const data = await response.json();
            this.credits = {
                balance: data?.data?.limit ?? 0,
                used: data?.data?.usage ?? 0,
                label: data?.data?.label || ''
            };
            this.updateDisplay();
        } catch (error) {
            console.error('❌ Failed to load credits:', error);
            this.credits = { balance: 0, used: 0, unavailable: String(error.message || error) };
        }
    }

    async loadUserData() {
        try {
            // Load conversation history
            const savedConversations = localStorage.getItem('openrouter_conversations');
            if (savedConversations) {
                this.conversations = JSON.parse(savedConversations);
            }

            // Load settings
            const savedSettings = localStorage.getItem('openrouter_settings');
            if (savedSettings) {
                this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
            }

            // Load request history
            const savedHistory = localStorage.getItem('openrouter_history');
            if (savedHistory) {
                this.requestHistory = JSON.parse(savedHistory);
            }
        } catch (error) {
            console.error('❌ Failed to load user data:', error);
        }
    }

    saveSettings() {
        localStorage.setItem('openrouter_settings', JSON.stringify(this.settings));
        localStorage.setItem('openrouter_favorites', JSON.stringify(Array.from(this.favoriteModels)));
        localStorage.setItem('openrouter_conversations', JSON.stringify(this.conversations));
        localStorage.setItem('openrouter_history', JSON.stringify(this.requestHistory));
    }

    // Utility Methods
    groupModelsByProvider() {
        const grouped = new Map();
        this.models.forEach(model => {
            if (!grouped.has(model.provider)) {
                grouped.set(model.provider, []);
            }
            grouped.get(model.provider).push(model);
        });
        return grouped;
    }

    getProviderIcon(provider) {
        const icons = {
            'OpenAI': '🤖',
            'Anthropic': '🧠',
            'Google': '🌟',
            'Mistral AI': '🚀',
            'Meta': '🔷',
            'Cohere': '🔶',
            'default': '🔄'
        };
        return icons[provider] || icons.default;
    }

    formatContextLength(length) {
        if (length >= 1000000) {
            return `${(length / 1000000).toFixed(1)}M`;
        } else if (length >= 1000) {
            return `${(length / 1000).toFixed(0)}K`;
        }
        return length.toString();
    }

    calculateAverageResponseTime() {
        if (this.requestHistory.length === 0) return 0;
        const total = this.requestHistory.reduce((sum, req) => sum + (req.responseTime || 0), 0);
        return Math.round(total / this.requestHistory.length);
    }

    calculateSuccessRate() {
        if (this.requestHistory.length === 0) return 100;
        const successful = this.requestHistory.filter(req => req.success).length;
        return Math.round((successful / this.requestHistory.length) * 100);
    }

    calculateAverageTokens() {
        if (this.requestHistory.length === 0) return 0;
        const total = this.requestHistory.reduce((sum, req) => sum + (req.tokens || 0), 0);
        return Math.round(total / this.requestHistory.length);
    }

    renderModelUsageChart() {
        // Simple text-based chart for now
        const usage = new Map();
        this.requestHistory.forEach(req => {
            usage.set(req.model, (usage.get(req.model) || 0) + 1);
        });

        if (usage.size === 0) {
            return '<div class="no-data">No usage data available</div>';
        }

        return Array.from(usage.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([model, count]) => `
                <div class="usage-item">
                    <span class="model-name">${model}</span>
                    <span class="usage-count">${count} requests</span>
                </div>
            `).join('');
    }

    renderRequestHistory() {
        if (this.requestHistory.length === 0) {
            return '<div class="no-data">No request history available</div>';
        }

        return `
        <table class="history-table">
            <thead>
                <tr>
                    <th>Time</th>
                    <th>Model</th>
                    <th>Tokens</th>
                    <th>Cost</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${this.requestHistory.slice(-10).reverse().map(req => `
                <tr>
                    <td>${new Date(req.timestamp).toLocaleTimeString()}</td>
                    <td>${req.model}</td>
                    <td>${req.tokens || 'N/A'}</td>
                    <td>$${req.cost?.toFixed(4) || 'N/A'}</td>
                    <td><span class="status ${req.success ? 'success' : 'error'}">${req.success ? '✅' : '❌'}</span></td>
                </tr>
                `).join('')}
            </tbody>
        </table>
        `;
    }

    // Authentication Methods
    showAuthentication() {
        if (!this.isCurrentInstance()) return;
        const app = this.getContainer();
        if (!app?.isConnected) return;
        const host = app;
        if (!host.style.position || host.style.position === 'static') host.style.position = 'relative';
        this.closeModal();
        const modal = document.createElement('div');
        modal.className = 'or-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', 'OpenRouter API Configuration');
        // Stay below the owning titlebar and disappear with the app window.
        modal.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:10000;overflow:auto;display:flex;align-items:flex-start;justify-content:center;box-sizing:border-box;padding:0.75rem';
        modal.innerHTML = `
        <div class="modal-content" style="width:min(26rem,100%);max-height:100%;height:auto;overflow:auto;box-sizing:border-box;display:flex;flex-direction:column">
            <div class="modal-header">
                <h3>OpenRouter API Configuration</h3>
                <button class="modal-close" onclick="window.openRouterApp.closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="api-key-input">Credential reference:</label>
                    <input type="text" id="api-key-input" class="sk-input" value="" autocomplete="off" spellcheck="false" placeholder="Opaque reference, stored locally" aria-label="OpenRouter credential reference" style="display:block !important;width:100% !important;box-sizing:border-box !important;min-height:2.5rem !important;padding:0.45rem 0.65rem !important;background:#fff !important;background-color:#fff !important;background-image:none !important;background-clip:border-box !important;color:#1a1a1a !important;-webkit-text-fill-color:#1a1a1a !important;border:1px solid #5c6570 !important;border-radius:6px !important;caret-color:#1a1a1a !important;opacity:1 !important;filter:none !important;box-shadow:inset 0 0 0 1px #5c6570 !important;appearance:none !important;-webkit-appearance:none !important">
                    <div class="help-text">
                        Get your API key from <a href="https://openrouter.ai/keys" target="_blank">OpenRouter Dashboard</a>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="or-btn or-btn-secondary sk-btn" onclick="window.openRouterApp.closeModal()">Cancel</button>
                <button class="or-btn or-btn-primary sk-btn sk-btn-primary" onclick="window.openRouterApp.saveApiKey()">Save API Key</button>
            </div>
        </div>
        `;
        modal.addEventListener('keydown', event => { if (event.key === 'Escape') this.closeModal(); });
        this.authenticationModal = modal;
        host.appendChild(modal);
        modal.querySelector('input')?.focus();
    }

    saveApiKey() {
        const input = document.getElementById('api-key-input');
        if (input) {
            this.apiKey = input.value.trim();
            localStorage.setItem('openrouter_api_key', this.apiKey);
            this.checkAuthentication();
            this.closeModal();
            this.updateDisplay();
        }
    }

    closeModal() {
        this.authenticationModal?.remove();
        this.authenticationModal = null;
    }

    // Model Management Methods
    toggleFavorite(modelId) {
        if (this.favoriteModels.has(modelId)) {
            this.favoriteModels.delete(modelId);
        } else {
            this.favoriteModels.add(modelId);
        }
        this.saveSettings();
        this.updateDisplay();
    }

    setDefaultModel(modelId) {
        if (!this.isCurrentInstance()) return;
        this.settings.defaultModel = modelId;
        this.saveSettings();
        const container = this.getContainer();
        if (!container) return;
        // Selecting a default changes these states, not the catalog. Keep
        // the actual buttons, their listeners, focus and scroll position.
        for (const button of container.querySelectorAll('[data-openrouter-action="default"]')) {
            const selected = button.dataset.openrouterModel === modelId;
            const label = selected ? '✓ Default' : 'Set Default';
            if (button.textContent.trim() !== label) button.textContent = label;
            button.setAttribute('aria-pressed', String(selected));
            button.closest('.model-card')?.classList.toggle('default-model', selected);
        }
        const playgroundModel = container.querySelector('#playground-model');
        if (playgroundModel) playgroundModel.value = modelId;
    }

    tryModel(modelId) {
        this.currentTab = 'playground';
        this.settings.defaultModel = modelId;
        this.updateDisplay();
    }

    // Placeholder methods for interaction
    showSettings() {
        this.currentTab = 'settings';
        this.updateDisplay();
    }

    renderConversationItem(conv) {
        const title = String(conv.title ?? 'Conversation')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const active = this.currentConversation?.id === conv.id ? ' active' : '';
        return `<button type="button" class="or-conversation${active}" data-conversation-id="${conv.id}" onclick="window.openRouterApp.openConversation('${conv.id}')">${title}</button>`;
    }

    openConversation(id) {
        if (!this.isCurrentInstance()) return;
        const conversation = this.conversations.find(item => item.id === id);
        if (!conversation) return;
        this.currentConversation = conversation;
        this.currentTab = 'chat';
        this.updateDisplay();
    }

    createNewConversation() {
        const conversation = {
            id: 'conv-' + Date.now(),
            title: 'New conversation',
            model: this.settings.defaultModel,
            messages: [],
            tokenCount: 0,
            createdAt: new Date().toISOString()
        };
        this.conversations.unshift(conversation);
        this.currentConversation = conversation;
        this.saveSettings();
        this.currentTab = 'chat';
        this.updateDisplay();
    }

    deleteConversation() {
        if (!this.currentConversation) return;
        if (!confirm('Delete this conversation?')) return;
        this.conversations = this.conversations.filter(c => c.id !== this.currentConversation.id);
        this.currentConversation = this.conversations[0] || null;
        this.saveSettings();
        this.updateDisplay();
    }

    exportConversation() {
        if (!this.currentConversation) return;
        const blob = new Blob([JSON.stringify(this.currentConversation, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.currentConversation.id}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    shareConversation() {
        if (!this.currentConversation) return;
        const text = JSON.stringify(this.currentConversation, null, 2);
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(
                () => alert('Conversation copied to clipboard (local).'),
                () => alert('Could not access the clipboard.')
            );
        } else {
            alert('Clipboard access is not available in this browser.');
        }
    }

    renderMessage(message) {
        const role = message.role === 'user' ? 'user' : 'assistant';
        const content = String(message.content ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<div class="or-message or-message-${role}"><div class="or-message-role">${role === 'user' ? '👤 You' : '🤖 Assistant'}</div><div class="or-message-content">${content}</div></div>`;
    }

    handleInputKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
        }
    }

    async sendMessage() {
        const input = document.getElementById('message-input');
        const text = (input?.value || '').trim();
        if (!text) return;
        if (!this.currentConversation) this.createNewConversation();
        const conversation = this.currentConversation;
        if (!this.apiKey) {
            conversation.messages.push({ role: 'user', content: text });
            conversation.messages.push({ role: 'assistant', content: 'OpenRouter needs an API key reference before it can send this prompt. No request was sent.' });
            this.saveSettings();
            this.updateDisplay();
            return;
        }
        conversation.messages.push({ role: 'user', content: text });
        if (input) input.value = '';
        this.updateDisplay();
        try {
            const reply = await this.chatCompletion(conversation.model, conversation.messages);
            conversation.messages.push({ role: 'assistant', content: reply });
        } catch (error) {
            conversation.messages.push({ role: 'assistant', content: `⚠️ Request failed: ${error.message}` });
        }
        this.saveSettings();
        this.updateDisplay();
        const container = document.getElementById('messages-container');
        if (container) container.scrollTop = container.scrollHeight;
    }

    async chatCompletion(model, messages) {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': location.origin,
                'X-Title': 'SwissKnife OpenRouter Hub'
            },
            body: JSON.stringify({
                model,
                messages: messages.map(m => ({ role: m.role, content: String(m.content) })),
                temperature: this.settings.temperature,
                max_tokens: this.settings.maxTokens
            })
        });
        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`OpenRouter API ${response.status}: ${errText.slice(0, 200)}`);
        }
        const data = await response.json();
        const reply = data?.choices?.[0]?.message?.content;
        if (!reply) throw new Error('OpenRouter returned no message content.');
        const usage = data?.usage;
        if (usage && this.currentConversation) {
            this.currentConversation.tokenCount = (this.currentConversation.tokenCount || 0) + (usage.total_tokens || 0);
        }
        this.requestHistory.unshift({ model, at: new Date().toISOString(), promptTokens: usage?.prompt_tokens || 0, completionTokens: usage?.completion_tokens || 0 });
        return reply;
    }

    async generateResponse() {
        const input = document.getElementById('playground-input');
        const output = document.getElementById('playground-output');
        const prompt = (input?.value || '').trim();
        if (!prompt) return;
        if (!this.apiKey) {
            if (output) output.textContent = 'OpenRouter needs an API key reference before it can send this prompt. No request was sent.';
            return;
        }
        const model = document.getElementById('playground-model')?.value || this.settings.defaultModel;
        if (output) output.textContent = 'Generating...';
        try {
            const reply = await this.chatCompletion(model, [{ role: 'user', content: prompt }]);
            if (output) output.textContent = reply;
            this.saveSettings();
        } catch (error) {
            if (output) output.textContent = `⚠️ Request failed: ${error.message}`;
        }
    }

    changeConversationModel(modelId) {
        if (this.currentConversation) {
            this.currentConversation.model = modelId;
            this.saveSettings();
            this.updateDisplay();
        }
    }

    updateTemperature(value) {
        this.settings.temperature = parseFloat(value);
        this.saveSettings();
    }

    updateMaxTokens(value) {
        this.settings.maxTokens = parseInt(value, 10) || 2048;
        this.saveSettings();
    }

    updatePlaygroundModel(modelId) {
        this.settings.defaultModel = modelId;
        this.saveSettings();
    }

    updatePlaygroundSetting(key, value) {
        this.settings[key] = value;
        this.saveSettings();
    }

    loadQuickPrompt(kind) {
        const prompts = {
            creative: 'Write a short creative story about...',
            code: 'Write a Python function that...',
            analyze: 'Analyze the following data and summarize key insights: ...',
            translate: 'Translate the following text to French: ...',
            summarize: 'Summarize the following text in 3 bullet points: ...',
            explain: 'Explain the following concept in simple terms: ...'
        };
        const input = document.getElementById('playground-input');
        if (input && prompts[kind]) input.value = prompts[kind];
    }

    clearPlayground() {
        const input = document.getElementById('playground-input');
        const output = document.getElementById('playground-output');
        if (input) input.value = '';
        if (output) output.textContent = '';
    }

    copyOutput() {
        const output = document.getElementById('playground-output');
        const text = output?.textContent || '';
        if (text && navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(() => alert('Output copied (local).'));
        }
    }

    saveOutput() {
        const output = document.getElementById('playground-output');
        const text = output?.textContent || '';
        if (!text) return;
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `openrouter-output-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }

    showModelInfo(modelId) {
        const model = this.models.get(modelId);
        if (!model) return;
        alert(`Model: ${model.name}\nID: ${model.id}\nProvider: ${model.provider}\nContext: ${model.context_length || 'n/a'} tokens\nPrompt price: $${model.pricing?.prompt ?? 'n/a'}/1M tokens\nCompletion price: $${model.pricing?.completion ?? 'n/a'}/1M tokens`);
    }

    filterModels(query) {
        this.modelFilter = (query || '').toLowerCase();
        this.updateDisplay();
    }

    filterByProvider(provider) {
        this.providerFilter = provider || '';
        this.updateDisplay();
    }

    sortModels(key) {
        this.modelSort = key || 'name';
        this.updateDisplay();
    }

    updateAnalyticsPeriod(period) {
        this.analyticsPeriod = period;
        this.updateDisplay();
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OpenRouterApp;
}

// Initialize app when DOM is ready
if (typeof window !== 'undefined') {
    window.OpenRouterApp = OpenRouterApp;
}

// ES module export
export { OpenRouterApp };
