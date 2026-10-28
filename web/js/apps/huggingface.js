import { invokeNativeTool } from '../live-tool-gateway.js';
import { unwrapNetworkToolResult } from './network-native-tools.js';

// SwissKnife Dedicated Hugging Face App
// Professional AI Model Hub, Dataset Management & Inference Platform

const HF_CATALOG_CACHE_TTL_MS = 10 * 60 * 1000;
const HF_CATALOG_ERROR_RETRY_MS = 30 * 1000;
const HF_CATALOG_CACHE_LIMIT = 32;
// Exact query and authentication scope matter: a search/page or another token
// must never receive a different request's catalog. Only actual Hub responses
// are retained, in memory, for this browser session.
const hubCatalogSession = new Map();

function hubCatalogSnapshot(entry, source, cache) {
    return {
        items: structuredClone(entry.items),
        metadata: {
            source,
            observed_at: entry.observed_at,
            attempted_at: entry.attempted_at,
            cache,
            cache_age_ms: entry.observed_at === null ? null : Math.max(0, Date.now() - Date.parse(entry.observed_at)),
            cache_ttl_ms: HF_CATALOG_CACHE_TTL_MS,
            retry_at: new Date(entry.refresh_at).toISOString(),
            stale: Boolean(entry.error && entry.observed_at),
            error: entry.error,
        },
    };
}

async function readHubCatalog(app, url, label, force = false) {
    const key = JSON.stringify([url, app.apiToken || '']);
    let entry = hubCatalogSession.get(key);
    if (entry?.request) return hubCatalogSnapshot(await entry.request, url, 'coalesced');
    if (!force && entry && Date.now() < entry.refresh_at) {
        hubCatalogSession.delete(key);
        hubCatalogSession.set(key, entry);
        return hubCatalogSnapshot(entry, url, 'session');
    }
    if (!entry) {
        if (hubCatalogSession.size >= HF_CATALOG_CACHE_LIMIT) {
            const settled = [...hubCatalogSession].find(([, value]) => !value.request);
            if (settled) hubCatalogSession.delete(settled[0]);
            else return hubCatalogSnapshot({
                items: [], observed_at: null, attempted_at: new Date(Date.now()).toISOString(),
                error: 'Hugging Face catalog request capacity reached; retry after the current reads finish.',
                refresh_at: Date.now() + HF_CATALOG_ERROR_RETRY_MS,
            }, url, 'capacity');
        }
        entry = { items: [], observed_at: null };
        hubCatalogSession.set(key, entry);
    }
    const request = (async () => {
        const attempted_at = new Date(Date.now()).toISOString();
        try {
            const items = await app.hubCatalogJson(url, label);
            if (!Array.isArray(items) || items.some(item => !item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id)) {
                throw new Error(`${label} returned an invalid catalog.`);
            }
            Object.assign(entry, {
                items: structuredClone(items), observed_at: new Date(Date.now()).toISOString(),
                attempted_at, error: null, refresh_at: Date.now() + HF_CATALOG_CACHE_TTL_MS,
            });
        } catch (error) {
            Object.assign(entry, {
                attempted_at, error: String(error.message || error),
                refresh_at: Date.now() + HF_CATALOG_ERROR_RETRY_MS,
            });
        }
        return entry;
    })();
    entry.request = request;
    try { return hubCatalogSnapshot(await request, url, 'network'); }
    finally { if (entry.request === request) delete entry.request; }
}

class HuggingFaceApp {
    constructor({ requestTimeoutMs = 8000 } = {}) {
        this.name = 'Hugging Face Hub';
        this.requestTimeoutMs = Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0 ? Math.min(requestTimeoutMs, 30000) : 8000;
        // Single live instance for inline handlers (one desktop window per app).
        if (typeof window !== 'undefined') window.huggingFaceApp = this;
        this.currentTab = 'models';
        this.models = new Map();
        this.datasets = new Map();
        this.catalogMetadata = { models: null, datasets: null };
        this.deployments = new Map();
        this.inferenceHistory = [];
        this.isAuthenticated = false;
        this.apiToken = localStorage.getItem('huggingface_api_token') || '';
        this.modelSearch = '';
        this.datasetSearch = '';
        this.modelTaskFilter = '';
        this.modelLibraryFilter = '';
        this.datasetTaskFilter = '';
        this.datasetSizeFilter = '';
        this.selection = null;
        this.restoreHubState();
        this.cache = {
            models: new Map(),
            datasets: new Map(),
            lastRefresh: 0
        };
        this.settings = {
            defaultModel: 'gpt2',
            inferenceMethod: 'auto',
            cacheEnabled: true,
            cacheTTL: HF_CATALOG_CACHE_TTL_MS
        };
        this.restoreNativeCatalogMetadata();
        if (typeof document !== 'undefined') this.setupEventListeners();

    }

    async initialize() {
        console.log('🤗 Initializing Hugging Face App...');
        
        // Check authentication status
        this.checkAuthentication();
        
        // Load cached data
        await this.loadCachedData();
        
        // Initialize event listeners
        this.setupEventListeners();
        
        console.log('✅ Hugging Face App initialized successfully');
    }

    render() {
        return `
        <div class="huggingface-app">
            <style>
              .window[data-app-id="huggingface"] .window-content{display:flex;flex-direction:column;min-height:0;overflow:hidden;padding-bottom:0}
              .window[data-app-id="huggingface"] .window-app-content{display:flex;flex-direction:column;flex:1 1 auto;height:100%;min-height:0;min-width:0;overflow:hidden}
              .window[data-app-id="huggingface"] .window-app-content > [id$="-content"]{display:flex;flex-direction:column;flex:1 1 auto;align-self:stretch;width:100%;min-height:0;min-width:0;overflow:hidden}
              .window[data-app-id="huggingface"] .huggingface-app{flex:1 1 auto;height:auto;min-height:0;min-width:0}
              .huggingface-app .hf-nav-tabs{display:flex !important;flex-wrap:wrap !important;align-content:flex-start;gap:4px;overflow:visible !important;width:100%;flex:0 0 auto;max-height:none;position:static !important;z-index:auto !important}
              .huggingface-app .hf-nav-tabs .tab-item{flex:0 0 auto !important;min-width:0 !important;max-width:none !important;overflow:hidden !important;height:36px;min-height:36px;max-height:36px;padding:4px 8px !important}
              .huggingface-app .hf-nav-tabs .tab-label{display:inline !important;overflow:visible !important;text-overflow:clip !important;white-space:nowrap !important;max-width:none !important;width:auto !important}
              .huggingface-app .hf-logo-text{white-space:nowrap !important}
              .huggingface-app .model-card{overflow:visible !important;height:auto !important;max-height:none !important}
              .huggingface-app .model-card .model-actions{display:flex !important;flex-direction:row !important;flex-wrap:wrap !important;gap:6px !important}
              .huggingface-app .model-card .action-btn,.huggingface-app .model-card .action-btn-primary{width:auto !important;height:auto !important;min-height:36px !important;max-height:none !important;overflow:visible !important;text-indent:0 !important;font-size:13px !important;line-height:1.2 !important;white-space:nowrap !important;padding:6px 10px !important;display:inline-flex !important;align-items:center !important}
              .huggingface-app .model-card .action-btn-primary{background:#ff7a18 !important;color:#1a1a1a !important;opacity:1 !important}
              .huggingface-app .model-card-facts{display:flex;flex-direction:column;align-items:flex-start;gap:2px;max-width:100%;font-size:12px;line-height:1.35}
              .huggingface-app .hf-revision{display:block;max-width:100%;white-space:normal;overflow-wrap:anywhere;word-break:break-all}
              .huggingface-app{height:100%;min-height:0;max-height:100%;overflow:hidden !important;display:flex !important;flex-direction:column !important}
              .huggingface-app .hf-header,.huggingface-app .hf-nav-tabs,.huggingface-app .hf-status-bar{flex:0 0 auto;position:static !important;z-index:auto !important}
              .huggingface-app .hf-header{padding:4px 8px !important;min-height:0 !important}
              .huggingface-app .hf-status-bar{max-height:none !important;overflow:visible !important;padding:4px 8px !important;flex-wrap:wrap;gap:4px;color:#dbeafe;background:#101b25;opacity:1;font-size:12px;line-height:1.35}
              .huggingface-app .hf-content{flex:1 1 0px !important;min-height:0 !important;overflow-x:hidden !important;overflow-y:auto !important;scroll-padding-top:8px;scroll-padding-bottom:8px}
              .huggingface-app .models-tab{flex:0 0 auto !important;min-height:0 !important;overflow:visible !important}
              .huggingface-app .models-tab > .models-grid{flex:0 0 auto !important;min-height:min-content !important;overflow:visible !important;grid-auto-rows:max-content;padding:12px;gap:12px}
              .huggingface-app .models-tab > .tab-header{flex:0 0 auto;flex-direction:column;align-items:stretch;padding:10px 12px;gap:8px}
              .huggingface-app .models-tab .tab-title{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px}
              .huggingface-app .models-tab .tab-title h2{font-size:18px;margin:0}
              .huggingface-app .models-tab .tab-title p{font-size:12px}
              .huggingface-app .models-tab .tab-actions{gap:6px}
              .huggingface-app .models-tab > .hf-catalog-status,.huggingface-app .models-tab > .hf-selection-status,.huggingface-app .models-tab > #hf-selected-item{flex:0 0 auto;margin:4px 12px;overflow-wrap:anywhere}
              .huggingface-app .inference-method-selector{display:flex !important;flex-wrap:nowrap !important;gap:4px;max-height:36px;overflow:hidden !important}
              .huggingface-app .method-option{max-height:36px !important;padding:2px 6px !important;overflow:hidden !important}
              .huggingface-app .form-actions{position:sticky;bottom:0;z-index:3;background:#1b1b1b;padding-top:4px}
              .huggingface-app #hf-run-inference{scroll-margin-top:8px;scroll-margin-bottom:8px}
              .huggingface-app .model-identity{flex:1;min-width:0}
              @media (max-width:480px){
                .huggingface-app{max-height:min(100%,calc(100dvh - 92px))}
                .huggingface-app .hf-header{padding:6px 8px}
                .huggingface-app .tab-title p{display:none}
                .huggingface-app .tab-title h2{font-size:15px;margin:0}
                .huggingface-app .tab-actions{display:flex;flex-wrap:wrap;gap:4px}
                .huggingface-app .tab-actions .hf-btn{padding:4px 8px;min-height:32px}
                .huggingface-app .hf-status-bar .status-right{display:flex;flex-wrap:wrap}
                .huggingface-app .model-card{padding:8px !important}
              }
            </style>
            <!-- Header with Authentication -->
            <div class="hf-header">
                <div class="hf-header-left">
                    <div class="hf-logo">
                        <div class="hf-logo-icon">🤗</div>
                        <div class="hf-logo-text">Hugging Face Hub</div>
                    </div>
                    <div class="hf-status ${this.isAuthenticated ? 'authenticated' : 'unauthenticated'}">
                        <div class="status-indicator sk-status-dot ${this.isAuthenticated ? 'is-ok' : 'is-idle'}"></div>
                        <span>${this.isAuthenticated ? 'Connected' : 'Not Connected'}</span>
                    </div>
                </div>
                <div class="hf-header-right">
                    <button class="hf-btn hf-btn-secondary sk-btn" onclick="window.huggingFaceApp.showSettings()">
                        <span class="btn-icon">⚙️</span>
                        Settings
                    </button>
                    <button class="hf-btn hf-btn-primary sk-btn sk-btn-primary" onclick="window.huggingFaceApp.showAuthentication()">
                        <span class="btn-icon">🔑</span>
                        ${this.isAuthenticated ? 'Manage Token' : 'Connect'}
                    </button>
                </div>
            </div>

            <!-- Navigation Tabs -->
            <div class="hf-nav-tabs">
                <div class="tab-item ${this.currentTab === 'models' ? 'active' : ''}" data-tab="models" role="tab" tabindex="0" aria-label="Models">
                    <span class="tab-icon" aria-hidden="true">🧠</span>
                    <span class="tab-label">Models</span>
                    <span class="tab-count">${this.models.size}</span>
                </div>
                <div class="tab-item ${this.currentTab === 'datasets' ? 'active' : ''}" data-tab="datasets" role="tab" tabindex="0" aria-label="Datasets">
                    <span class="tab-icon" aria-hidden="true">📊</span>
                    <span class="tab-label">Datasets</span>
                    <span class="tab-count">${this.datasets.size}</span>
                </div>
                <div class="tab-item ${this.currentTab === 'inference' ? 'active' : ''}" data-tab="inference" role="tab" tabindex="0" aria-label="Inference">
                    <span class="tab-icon" aria-hidden="true">⚡</span>
                    <span class="tab-label">Inference</span>
                    <span class="tab-count">${this.inferenceHistory.length}</span>
                </div>
                <div class="tab-item ${this.currentTab === 'deployments' ? 'active' : ''}" data-tab="deployments" role="tab" tabindex="0" aria-label="Deployments">
                    <span class="tab-icon" aria-hidden="true">🚀</span>
                    <span class="tab-label">Deployments</span>
                    <span class="tab-count">${this.deployments.size}</span>
                </div>
                <div class="tab-item ${this.currentTab === 'playground' ? 'active' : ''}" data-tab="playground" role="tab" tabindex="0" aria-label="Playground">
                    <span class="tab-icon" aria-hidden="true">🎮</span>
                    <span class="tab-label">Playground</span>
                </div>
            </div>

            <!-- Content Area -->
            <div class="hf-content">
                ${this.renderCurrentTab()}
            </div>

            <!-- Status Bar -->
            <div class="hf-status-bar">
                <div class="status-left">
                    <span class="status-item">
                        <span class="status-icon">🌐</span>
                        <span>API Status: ${this.isAuthenticated ? 'Connected' : 'Disconnected'}</span>
                    </span>
                    <span class="status-item">
                        <span class="status-icon">💾</span>
                        <span>Catalog: ${this.models.size + this.datasets.size} items</span>
                    </span>
                </div>
                <div class="status-right">
                    <span class="status-item">
                        <span class="status-icon">⏱️</span>
                        <span id="hf-last-refresh">Last catalog observation: ${[this.catalogMetadata.models?.observed_at, this.catalogMetadata.datasets?.observed_at, this.cache.lastRefresh].filter(value => value && Number.isFinite(new Date(value).getTime())).map(value => new Date(value).toISOString()).sort().at(-1) || 'Never'}</span>
                    </span>
                </div>
            </div>
        </div>`;
    }

    renderCurrentTab() {
        switch (this.currentTab) {
            case 'models':
                return this.renderModelsTab();
            case 'datasets':
                return this.renderDatasetsTab();
            case 'inference':
                return this.renderInferenceTab();
            case 'deployments':
                return this.renderDeploymentsTab();
            case 'playground':
                return this.renderPlaygroundTab();
            default:
                return '<div class="tab-content">Invalid tab</div>';
        }
    }

    renderModelsTab() {
        return `
        <div class="tab-content models-tab">
            <div class="tab-header">
                <div class="tab-title">
                    <h2>🧠 AI Models Hub</h2>
                    <p>Browse and manage 100,000+ AI models from Hugging Face</p>
                </div>
                <div class="tab-actions">
                    <div class="search-container">
                        <input type="text" id="models-search" aria-label="Search models" placeholder="Search models..." value="${this.escapeCatalogStatus(this.modelSearch || '')}" class="search-input sk-input">
                        <button type="button" class="search-btn" id="models-search-submit" aria-label="Search models" onclick="window.huggingFaceApp.searchModels()">🔍</button>
                    </div>
                    <div class="filter-container">
                        <select id="models-filter-task" aria-label="Model task" class="filter-select sk-select">
                            <option value="">All Tasks</option>
                            <option value="text-generation"${this.selectAttr(this.modelTaskFilter, 'text-generation')}>Text Generation</option>
                            <option value="text-classification"${this.selectAttr(this.modelTaskFilter, 'text-classification')}>Text Classification</option>
                            <option value="image-classification"${this.selectAttr(this.modelTaskFilter, 'image-classification')}>Image Classification</option>
                            <option value="speech-recognition"${this.selectAttr(this.modelTaskFilter, 'speech-recognition')}>Speech Recognition</option>
                            <option value="translation"${this.selectAttr(this.modelTaskFilter, 'translation')}>Translation</option>
                        </select>
                        <select id="models-filter-library" aria-label="Model library" class="filter-select sk-select">
                            <option value="">All Libraries</option>
                            <option value="transformers"${this.selectAttr(this.modelLibraryFilter, 'transformers')}>Transformers</option>
                            <option value="pytorch"${this.selectAttr(this.modelLibraryFilter, 'pytorch')}>PyTorch</option>
                            <option value="tensorflow"${this.selectAttr(this.modelLibraryFilter, 'tensorflow')}>TensorFlow</option>
                            <option value="jax"${this.selectAttr(this.modelLibraryFilter, 'jax')}>JAX</option>
                        </select>
                    </div>
                    <button type="button" class="hf-btn hf-btn-primary sk-btn sk-btn-primary" onclick="window.huggingFaceApp.refreshModels()">
                        <span class="btn-icon">🔄</span>
                        Refresh
                    </button>
                    <button type="button" class="hf-btn hf-btn-secondary sk-btn" id="models-retry" onclick="window.huggingFaceApp.retryModels()">
                        <span class="btn-icon">↻</span>
                        Retry
                    </button>
                    <div id="hf-catalog-execute-host" style="display:inline-flex;align-items:center;min-height:44px;min-width:44px;vertical-align:middle">
                        <button type="button" class="hf-btn hf-btn-secondary sk-btn" id="hf-catalog-query" aria-label="Query catalog">Query catalog</button>
                    </div>
                </div>
            </div>

            <div class="models-grid" id="models-grid">
                ${this.renderModelsGrid()}
            </div>
            <p class="hf-catalog-status" id="hf-catalog-status" role="status">${this.escapeCatalogStatus(this.catalogStatusText('models'))}</p>
            <p class="hf-selection-status" id="hf-selection-status" role="status">${this.escapeCatalogStatus(this.selectionStatusText())}</p>
            ${this.selection?.id ? `<p id="hf-selected-item">${this.escapeCatalogStatus(this.selection.id)} @ ${this.escapeCatalogStatus(this.selection.sha)}</p>` : ''}

            ${this.models.size ? `<div class="pagination">
                <button type="button" class="pagination-btn" onclick="window.huggingFaceApp.previousModelsPage()">← Previous</button>
                <span class="pagination-info">Page ${Math.floor((this.modelSkip || 0) / 24) + 1}</span>
                <button type="button" class="pagination-btn" onclick="window.huggingFaceApp.nextModelsPage()">Next →</button>
            </div>` : ''}
        </div>`;
    }

    renderModelsGrid() {
        if (this.modelsLoading) {
            return `<div class="empty-state sk-empty"><div class="empty-icon">⏳</div><div class="empty-title">Loading models from Hugging Face Hub…</div></div>`;
        }
        if (this.models.size === 0) {
            return `
            <div class="empty-state sk-empty">
                <div class="empty-icon">🤗</div>
                <div class="empty-title">No Models Loaded</div>
                <div class="empty-description">
                    ${this.modelsError
                        ? `The Hub catalog could not be reached: ${this.escapeCatalogStatus(this.modelsError)}`
                        : 'The public Hub catalog returned no models for this query.'}
                </div>
            </div>`;
        }

        let modelsHtml = '';
        for (const [id, model] of this.models) {
            modelsHtml += `
            <div class="model-card sk-card" data-model-id="${id}">
                <div class="model-header">
                    <div class="model-identity">
                        <div class="model-name">${model.name || id}</div>
                        <div class="model-task">${model.task || model.pipeline_tag || 'Unknown'}</div>
                        <div class="model-author">by ${model.author || 'Unknown'}</div>
                    </div>
                    <div class="model-stats">
                        <span class="stat-item">
                            <span class="stat-icon">📥</span>
                            <span class="stat-value">${this.formatNumber(model.downloads || 0)}</span>
                        </span>
                        <span class="stat-item">
                            <span class="stat-icon">❤️</span>
                            <span class="stat-value">${this.formatNumber(model.likes || 0)}</span>
                        </span>
                    </div>
                </div>
                <div class="model-info">
                    <div class="model-card-facts">
                        <span class="hf-revision">Revision: ${this.escapeCatalogStatus(/^[0-9a-f]{40}$/.test(model.sha || model.snapshot || '') ? (model.sha || model.snapshot) : 'not listed')}</span>
                        <span>Size: ${this.escapeCatalogStatus(model.safetensors && model.safetensors.total ? this.formatNumber(model.safetensors.total) : (model.size || 'not listed'))}</span>
                        <span>Compatibility: ${this.escapeCatalogStatus(model.library_name || model.pipeline_tag || model.task || 'not listed')}</span>
                    </div>
                    <div class="model-tags">
                        ${(model.tags || []).slice(0, 3).map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                </div>
                <div class="model-actions">
                    <button class="action-btn action-btn-primary hf-btn hf-btn-primary sk-btn sk-btn-primary" onclick="window.huggingFaceApp.loadModel('${id}')">
                        <span class="btn-icon">📥</span>
                        Load
                    </button>
                    <button class="action-btn action-btn-secondary" onclick="window.huggingFaceApp.testModel('${id}')">
                        <span class="btn-icon">🧪</span>
                        Test
                    </button>
                    <button class="action-btn action-btn-secondary" onclick="window.huggingFaceApp.deployModel('${id}')">
                        <span class="btn-icon">🚀</span>
                        Deploy
                    </button>
                </div>
                <div class="model-status">
                    <div class="status-indicator sk-status-dot is-ok status-available"></div>
                    <span>Inference is not run from this card</span>
                </div>
            </div>`;
        }
        return modelsHtml;
    }

    renderDatasetsTab() {
        return `
        <div class="tab-content datasets-tab">
            <div class="tab-header">
                <div class="tab-title">
                    <h2>📊 Datasets Hub</h2>
                    <p>Discover and manage thousands of datasets for AI training</p>
                </div>
                <div class="tab-actions">
                    <div class="search-container">
                        <input type="text" id="datasets-search" placeholder="Search datasets..." class="search-input sk-input">
                        <button class="search-btn" onclick="window.huggingFaceApp.searchDatasets()">🔍</button>
                    </div>
                    <div class="filter-container">
                        <select id="datasets-filter-task" class="filter-select sk-select">
                            <option value="">All Tasks</option>
                            <option value="text-classification">Text Classification</option>
                            <option value="image-classification">Image Classification</option>
                            <option value="speech-recognition">Speech Recognition</option>
                            <option value="translation">Translation</option>
                        </select>
                        <select id="datasets-filter-size" class="filter-select sk-select">
                            <option value="">All Sizes</option>
                            <option value="n<1K">< 1K samples</option>
                            <option value="1K<n<10K">1K - 10K</option>
                            <option value="10K<n<100K">10K - 100K</option>
                            <option value="100K<n<1M">100K - 1M</option>
                            <option value="n>1M">> 1M samples</option>
                        </select>
                    </div>
                    <button class="hf-btn hf-btn-primary sk-btn sk-btn-primary" onclick="window.huggingFaceApp.refreshDatasets()">
                        <span class="btn-icon">🔄</span>
                        Refresh
                    </button>
                </div>
            </div>

            <div class="datasets-grid" id="datasets-grid">
                ${this.renderDatasetsGrid()}
            </div>
            <p class="hf-catalog-status" role="status">${this.escapeCatalogStatus(this.catalogStatusText('datasets'))}</p>

            <div class="pagination">
                <button class="pagination-btn" onclick="window.huggingFaceApp.previousDatasetsPage()">← Previous</button>
                <span class="pagination-info">Page 1 of 500+</span>
                <button class="pagination-btn" onclick="window.huggingFaceApp.nextDatasetsPage()">Next →</button>
            </div>
        </div>`;
    }

    renderDatasetsGrid() {
        if (this.datasets.size === 0) {
            return `
            <div class="empty-state sk-empty">
                <div class="empty-icon">📊</div>
                <div class="empty-title">No Datasets Loaded</div>
                <div class="empty-description">
                    ${this.datasetsError ? `The Hub catalog could not be reached: ${this.escapeCatalogStatus(this.datasetsError)}` : 'The public Hub catalog returned no datasets for this query.'}
                </div>
                <button class="hf-btn hf-btn-primary sk-btn sk-btn-primary" onclick="window.huggingFaceApp.refreshDatasets()">
                    🔄 Retry Datasets
                </button>
            </div>`;
        }

        let datasetsHtml = '';
        for (const [id, dataset] of this.datasets) {
            datasetsHtml += `
            <div class="dataset-card sk-card" data-dataset-id="${id}">
                <div class="dataset-header">
                    <div class="dataset-name">${dataset.name || id}</div>
                    <div class="dataset-stats">
                        <span class="stat-item">
                            <span class="stat-icon">📥</span>
                            <span class="stat-value">${this.formatNumber(dataset.downloads || 0)}</span>
                        </span>
                        <span class="stat-item">
                            <span class="stat-icon">❤️</span>
                            <span class="stat-value">${this.formatNumber(dataset.likes || 0)}</span>
                        </span>
                    </div>
                </div>
                <div class="dataset-info">
                    <div class="dataset-description">${(dataset.description || 'No description available').substring(0, 100)}...</div>
                    <div class="dataset-author">by ${dataset.author || 'Unknown'}</div>
                    <div class="dataset-tags">
                        ${(dataset.tags || []).slice(0, 3).map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                </div>
                <div class="dataset-metadata">
                    <div class="metadata-item">
                        <span class="metadata-label">Tasks:</span>
                        <span class="metadata-value">${(dataset.task_categories || ['Unknown']).slice(0, 2).join(', ')}</span>
                    </div>
                    <div class="metadata-item">
                        <span class="metadata-label">Languages:</span>
                        <span class="metadata-value">${(dataset.language || ['Unknown']).slice(0, 2).join(', ')}</span>
                    </div>
                </div>
                <div class="dataset-actions">
                    <button class="action-btn action-btn-primary" onclick="window.huggingFaceApp.downloadDataset('${id}')">
                        <span class="btn-icon">📥</span>
                        View card
                    </button>
                    <button class="action-btn action-btn-secondary" onclick="window.huggingFaceApp.previewDataset('${id}')">
                        <span class="btn-icon">👁️</span>
                        Preview
                    </button>
                    <button class="action-btn action-btn-secondary" onclick="window.huggingFaceApp.analyzeDataset('${id}')">
                        <span class="btn-icon">📈</span>
                        Analyze
                    </button>
                </div>
                <div class="dataset-status">
                    <div class="status-indicator sk-status-dot is-ok status-available"></div>
                    <span>Download is not run from this card</span>
                </div>
            </div>`;
        }
        return datasetsHtml;
    }

    renderInferenceTab() {
        return `
        <div class="tab-content inference-tab">
            <div class="tab-header">
                <div class="tab-title">
                    <h2>⚡ Multi-Method Inference</h2>
                    <p>Run AI models with Hugging Face API, CloudFlare Workers, or Local Processing</p>
                </div>
                <div class="tab-actions">
                    <div class="inference-method-selector">
                        <div class="method-option ${this.settings.inferenceMethod === 'huggingface' ? 'active' : ''}" data-method="huggingface">
                            <div class="method-icon">🤗</div>
                            <div class="method-name">Hugging Face API</div>
                            <div class="method-status">Serverless</div>
                        </div>
                        <div class="method-option ${this.settings.inferenceMethod === 'cloudflare' ? 'active' : ''}" data-method="cloudflare">
                            <div class="method-icon">☁️</div>
                            <div class="method-name">CloudFlare Workers</div>
                            <div class="method-status">Edge Computing</div>
                        </div>
                        <div class="method-option ${this.settings.inferenceMethod === 'local' ? 'active' : ''}" data-method="local">
                            <div class="method-icon">💻</div>
                            <div class="method-name">Local Processing</div>
                            <div class="method-status">Browser-based</div>
                        </div>
                        <div class="method-option ${this.settings.inferenceMethod === 'auto' ? 'active' : ''}" data-method="auto">
                            <div class="method-icon">🎯</div>
                            <div class="method-name">Auto Selection</div>
                            <div class="method-status">Intelligent Routing</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="inference-content">
                <div class="inference-form">
                    <div class="form-group">
                        <label for="inference-model">Model Selection</label>
                        <select id="inference-model" class="form-select sk-select">
                            <option value="">Select a model...</option>
                            <option value="gpt2">GPT-2 (Text Generation)</option>
                            <option value="distilbert-base-uncased">DistilBERT (Text Classification)</option>
                            <option value="facebook/bart-large-cnn">BART (Summarization)</option>
                            <option value="t5-small">T5 (Text-to-Text Transfer)</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="inference-input">Input Text</label>
                        <textarea id="inference-input" class="form-textarea sk-textarea" rows="4" placeholder="Enter your text here..."></textarea>
                    </div>

                    <div class="form-group">
                        <label>Parameters</label>
                        <div class="parameters-grid">
                            <div class="parameter-item">
                                <label for="param-max-length">Max Length</label>
                                <input type="range" id="param-max-length" min="10" max="500" value="100" class="param-slider">
                                <span class="param-value">100</span>
                            </div>
                            <div class="parameter-item">
                                <label for="param-temperature">Temperature</label>
                                <input type="range" id="param-temperature" min="0.1" max="2.0" step="0.1" value="1.0" class="param-slider">
                                <span class="param-value">1.0</span>
                            </div>
                            <div class="parameter-item">
                                <label for="param-top-p">Top-p</label>
                                <input type="range" id="param-top-p" min="0.1" max="1.0" step="0.1" value="0.9" class="param-slider">
                                <span class="param-value">0.9</span>
                            </div>
                        </div>
                    </div>

                    <div class="form-actions">
                        <button id="hf-run-inference" class="hf-btn hf-btn-primary sk-btn sk-btn-primary" onclick="window.huggingFaceApp.runInference()">
                            <span class="btn-icon">⚡</span>
                            Run Inference
                        </button>
                        <button class="hf-btn hf-btn-secondary sk-btn" onclick="window.huggingFaceApp.clearInference()">
                            <span class="btn-icon">🗑️</span>
                            Clear
                        </button>
                    </div>
                </div>

                <div class="inference-results" id="inference-results">
                    <div class="results-header">
                        <h3>Inference Results</h3>
                        <div class="results-stats">
                            <span class="stat-item">
                                <span class="stat-label">Execution Time:</span>
                                <span class="stat-value" id="execution-time">-</span>
                            </span>
                            <span class="stat-item">
                                <span class="stat-label">Method:</span>
                                <span class="stat-value" id="execution-method">-</span>
                            </span>
                        </div>
                    </div>
                    <div class="results-content" id="results-content">
                        <div class="empty-results">
                            <div class="empty-icon">🎯</div>
                            <div class="empty-text">Run an inference to see results here</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="inference-history">
                <h3>Recent Inference History</h3>
                <div class="history-list" id="inference-history-list">
                    ${this.renderInferenceHistory()}
                </div>
            </div>
        </div>`;
    }

    renderInferenceHistory() {
        if (this.inferenceHistory.length === 0) {
            return `
            <div class="empty-state-small sk-empty">
                <span class="empty-icon">📝</span>
                <span class="empty-text">No inference history yet</span>
            </div>`;
        }

        return this.inferenceHistory.slice(0, 10).map(item => `
        <div class="history-item">
            <div class="history-header">
                <span class="history-model">${item.model}</span>
                <span class="history-time">${new Date(item.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="history-input">${item.input.substring(0, 100)}${item.input.length > 100 ? '...' : ''}</div>
            <div class="history-result">${item.result ? item.result.substring(0, 100) + '...' : 'Failed'}</div>
            <div class="history-stats">
                <span class="stat">Method: ${item.method}</span>
                <span class="stat">Time: ${item.executionTime}ms</span>
            </div>
        </div>
        `).join('');
    }

    renderDeploymentsTab() {
        return `
        <div class="tab-content deployments-tab">
            <div class="tab-header">
                <div class="tab-title">
                    <h2>🚀 Model Deployments</h2>
                    <p>Local tracking records for deployments you run externally (Cloudflare Workers, P2P networks, Hugging Face Spaces). This browser surface cannot deploy or monitor cloud services itself.</p>
                </div>
                <div class="tab-actions">
                    <button class="hf-btn hf-btn-primary sk-btn sk-btn-primary" onclick="window.huggingFaceApp.showDeploymentWizard()">
                        <span class="btn-icon">➕</span>
                        New Deployment
                    </button>
                    <button class="hf-btn hf-btn-secondary sk-btn" onclick="window.huggingFaceApp.refreshDeployments()">
                        <span class="btn-icon">🔄</span>
                        Refresh
                    </button>
                </div>
            </div>

            <div class="deployments-grid" id="deployments-grid">
                ${this.renderDeploymentsGrid()}
            </div>

            <div class="deployment-templates">
                <h3>Quick Deploy Templates</h3>
                <div class="templates-grid">
                    <div class="template-card" data-template="cloudflare-edge">
                        <div class="template-icon">☁️</div>
                        <div class="template-name">CloudFlare Edge</div>
                        <div class="template-description">Global edge deployment with sub-100ms latency</div>
                        <button class="template-btn" onclick="window.huggingFaceApp.deployWithTemplate('cloudflare-edge')">Deploy</button>
                    </div>
                    <div class="template-card" data-template="p2p-network">
                        <div class="template-icon">🔗</div>
                        <div class="template-name">P2P Network</div>
                        <div class="template-description">Decentralized deployment across peer network</div>
                        <button class="template-btn" onclick="window.huggingFaceApp.deployWithTemplate('p2p-network')">Deploy</button>
                    </div>
                    <div class="template-card" data-template="huggingface-space">
                        <div class="template-icon">🤗</div>
                        <div class="template-name">Hugging Face Space</div>
                        <div class="template-description">Deploy as interactive Gradio/Streamlit app</div>
                        <button class="template-btn" onclick="window.huggingFaceApp.deployWithTemplate('huggingface-space')">Deploy</button>
                    </div>
                </div>
            </div>
        </div>`;
    }

    renderDeploymentsGrid() {
        if (this.deployments.size === 0) {
            return `
            <div class="empty-state sk-empty">
                <div class="empty-icon">🚀</div>
                <div class="empty-title">No Deployments</div>
                <div class="empty-description">Create your first model deployment to get started</div>
                <button class="hf-btn hf-btn-primary sk-btn sk-btn-primary" onclick="window.huggingFaceApp.showDeploymentWizard()">
                    <span class="btn-icon">➕</span>
                    Create Deployment
                </button>
            </div>`;
        }

        let deploymentsHtml = '';
        for (const [id, deployment] of this.deployments) {
            deploymentsHtml += `
            <div class="deployment-card sk-card" data-deployment-id="${id}">
                <div class="deployment-header">
                    <div class="deployment-name">${deployment.name}</div>
                    <div class="deployment-status status-${deployment.status}">
                        <div class="status-indicator sk-status-dot ${deployment.status === 'running' ? 'is-ok' : deployment.status === 'error' ? 'is-err' : 'is-idle'}"></div>
                        <span>${deployment.status}</span>
                    </div>
                </div>
                <div class="deployment-info">
                    <div class="info-item">
                        <span class="info-label">Model:</span>
                        <span class="info-value">${deployment.model}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Platform:</span>
                        <span class="info-value">${deployment.platform}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">URL:</span>
                        <span class="info-value"><a href="${deployment.url}" target="_blank">${deployment.url}</a></span>
                    </div>
                </div>
                <div class="deployment-metrics">
                    <div class="metric-item">
                        <span class="metric-label">Requests</span>
                        <span class="metric-value">${deployment.requests || 0}</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Latency</span>
                        <span class="metric-value">${deployment.latency || 0}ms</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Uptime</span>
                        <span class="metric-value">${deployment.uptime || 0}%</span>
                    </div>
                </div>
                <div class="deployment-actions">
                    <button class="action-btn action-btn-secondary" onclick="window.huggingFaceApp.viewDeployment('${id}')">
                        <span class="btn-icon">👁️</span>
                        View
                    </button>
                    <button class="action-btn action-btn-secondary" onclick="window.huggingFaceApp.manageDeployment('${id}')">
                        <span class="btn-icon">⚙️</span>
                        Manage
                    </button>
                    <button class="action-btn action-btn-danger" onclick="window.huggingFaceApp.deleteDeployment('${id}')">
                        <span class="btn-icon">🗑️</span>
                        Delete
                    </button>
                </div>
            </div>`;
        }
        return deploymentsHtml;
    }

    renderPlaygroundTab() {
        return `
        <div class="tab-content playground-tab">
            <div class="tab-header">
                <div class="tab-title">
                    <h2>🎮 AI Playground</h2>
                    <p>Interactive AI testing environment with real-time parameter tuning</p>
                </div>
                <div class="tab-actions">
                    <button class="hf-btn hf-btn-secondary sk-btn" onclick="window.huggingFaceApp.loadPlaygroundExample()">
                        <span class="btn-icon">📝</span>
                        Load Example
                    </button>
                    <button class="hf-btn hf-btn-secondary sk-btn" onclick="window.huggingFaceApp.savePlaygroundSession()">
                        <span class="btn-icon">💾</span>
                        Save Session
                    </button>
                </div>
            </div>

            <div class="playground-content">
                <div class="playground-left">
                    <div class="model-selection">
                        <h3>Model Configuration</h3>
                        <div class="form-group">
                            <label for="playground-model">AI Model</label>
                            <select id="playground-model" class="form-select sk-select">
                                <option value="gpt2">GPT-2 (Text Generation)</option>
                                <option value="distilbert-base-uncased">DistilBERT (Classification)</option>
                                <option value="facebook/bart-large-cnn">BART (Summarization)</option>
                                <option value="t5-small">T5 (Text-to-Text)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="playground-task">Task Type</label>
                            <select id="playground-task" class="form-select sk-select">
                                <option value="text-generation">Text Generation</option>
                                <option value="text-classification">Text Classification</option>
                                <option value="summarization">Summarization</option>
                                <option value="translation">Translation</option>
                                <option value="question-answering">Question Answering</option>
                            </select>
                        </div>
                    </div>

                    <div class="parameter-controls">
                        <h3>Parameters</h3>
                        <div class="parameter-grid">
                            <div class="parameter-control">
                                <label for="playground-max-length">Max Length</label>
                                <input type="range" id="playground-max-length" min="10" max="500" value="100" class="param-slider">
                                <span class="param-display">100</span>
                            </div>
                            <div class="parameter-control">
                                <label for="playground-temperature">Temperature</label>
                                <input type="range" id="playground-temperature" min="0.1" max="2.0" step="0.1" value="1.0" class="param-slider">
                                <span class="param-display">1.0</span>
                            </div>
                            <div class="parameter-control">
                                <label for="playground-top-p">Top-p (Nucleus)</label>
                                <input type="range" id="playground-top-p" min="0.1" max="1.0" step="0.1" value="0.9" class="param-slider">
                                <span class="param-display">0.9</span>
                            </div>
                            <div class="parameter-control">
                                <label for="playground-top-k">Top-k</label>
                                <input type="range" id="playground-top-k" min="1" max="100" value="50" class="param-slider">
                                <span class="param-display">50</span>
                            </div>
                            <div class="parameter-control">
                                <label for="playground-repetition-penalty">Repetition Penalty</label>
                                <input type="range" id="playground-repetition-penalty" min="1.0" max="2.0" step="0.1" value="1.1" class="param-slider">
                                <span class="param-display">1.1</span>
                            </div>
                        </div>
                    </div>

                    <div class="execution-settings">
                        <h3>Execution Settings</h3>
                        <div class="setting-group">
                            <label>
                                <input type="checkbox" id="playground-streaming" checked>
                                <span class="checkmark"></span>
                                Real-time streaming
                            </label>
                        </div>
                        <div class="setting-group">
                            <label>
                                <input type="checkbox" id="playground-cache">
                                <span class="checkmark"></span>
                                Cache results
                            </label>
                        </div>
                        <div class="setting-group">
                            <label>
                                <input type="checkbox" id="playground-benchmark">
                                <span class="checkmark"></span>
                                Performance benchmark
                            </label>
                        </div>
                    </div>
                </div>

                <div class="playground-right">
                    <div class="input-section">
                        <div class="section-header">
                            <h3>Input</h3>
                            <div class="input-actions">
                                <button class="action-btn" onclick="window.huggingFaceApp.clearPlaygroundInput()">Clear</button>
                                <button class="action-btn" onclick="window.huggingFaceApp.loadExamplePrompt()">Example</button>
                            </div>
                        </div>
                        <textarea id="playground-input" class="playground-textarea sk-textarea" rows="6" placeholder="Enter your prompt or text here..."></textarea>
                    </div>

                    <div class="control-section">
                        <button class="hf-btn hf-btn-primary hf-btn-large sk-btn sk-btn-primary" onclick="window.huggingFaceApp.runPlaygroundInference()">
                            <span class="btn-icon">🚀</span>
                            Generate
                        </button>
                        <button class="hf-btn hf-btn-secondary sk-btn" onclick="window.huggingFaceApp.stopPlaygroundInference()">
                            <span class="btn-icon">⏹️</span>
                            Stop
                        </button>
                    </div>

                    <div class="output-section">
                        <div class="section-header">
                            <h3>Output</h3>
                            <div class="output-stats">
                                <span class="stat-item">
                                    <span class="stat-label">Time:</span>
                                    <span class="stat-value" id="playground-time">-</span>
                                </span>
                                <span class="stat-item">
                                    <span class="stat-label">Tokens:</span>
                                    <span class="stat-value" id="playground-tokens">-</span>
                                </span>
                            </div>
                        </div>
                        <div id="playground-output" class="playground-output">
                            <div class="output-placeholder">
                                <div class="placeholder-icon">🎯</div>
                                <div class="placeholder-text">Output will appear here after generation</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="playground-examples">
                <h3>Example Prompts</h3>
                <div class="examples-grid">
                    <div class="example-card" onclick="window.huggingFaceApp.loadExample('creative-writing')">
                        <div class="example-icon">✍️</div>
                        <div class="example-title">Creative Writing</div>
                        <div class="example-prompt">"Once upon a time in a distant galaxy..."</div>
                    </div>
                    <div class="example-card" onclick="window.huggingFaceApp.loadExample('code-generation')">
                        <div class="example-icon">💻</div>
                        <div class="example-title">Code Generation</div>
                        <div class="example-prompt">"Write a Python function to calculate fibonacci..."</div>
                    </div>
                    <div class="example-card" onclick="window.huggingFaceApp.loadExample('summarization')">
                        <div class="example-icon">📄</div>
                        <div class="example-title">Text Summarization</div>
                        <div class="example-prompt">"Summarize the following article..."</div>
                    </div>
                    <div class="example-card" onclick="window.huggingFaceApp.loadExample('qa')">
                        <div class="example-icon">❓</div>
                        <div class="example-title">Question Answering</div>
                        <div class="example-prompt">"Based on the context, answer the question..."</div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    // Event Handlers and Utility Methods
    setupEventListeners() {
        if (this.listenersBound) return;
        this.listenersBound = true;
        if (!this.fitObserver && typeof MutationObserver !== 'undefined' && document.body) {
            this.fitObserver = new MutationObserver(() => this.scheduleFit());
            this.fitObserver.observe(document.body, { childList: true, subtree: true });
        }
        this.scheduleFit();
        // Tab switching
        document.addEventListener('click', (e) => {
            if (e.target.closest('.tab-item')) {
                const tab = e.target.closest('.tab-item').dataset.tab;
                this.switchTab(tab);
            }
        });

        // Parameter sliders
        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('param-slider')) {
                const display = e.target.nextElementSibling;
                if (display) display.textContent = e.target.value;
            }
        });

        // Inference method selection
        document.addEventListener('click', (e) => {
            if (e.target.closest('.method-option')) {
                const method = e.target.closest('.method-option').dataset.method;
                this.setInferenceMethod(method);
            }
        });

        document.addEventListener('keydown', (e) => {
            const tab = e.target && e.target.closest ? e.target.closest('.tab-item') : null;
            if (tab && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                this.switchTab(tab.dataset.tab);
                return;
            }
            if (e.key !== 'Enter' || !e.target) return;
            if (e.target.id === 'models-search') {
                e.preventDefault();
                void this.searchModels();
            } else if (e.target.id === 'datasets-search') {
                e.preventDefault();
                void this.searchDatasets();
            }
        });
    }

    switchTab(tabName) {
        this.currentTab = tabName;
        this.refresh();
    }

    setInferenceMethod(method) {
        this.settings.inferenceMethod = method;
        this.refresh();
    }

    checkAuthentication() {
        if (this.apiToken) {
            this.isAuthenticated = true;
        }
    }

    async loadCachedData() {
        // Real Hugging Face Hub catalog (public REST API, no token needed for
        // search). Deployments are user-tracked records stored locally —
        // this surface cannot see anyone's cloud deployments.
        this.modelsLoading = true;
        this.datasetsLoading = true;
        await Promise.all([this.fetchModels(), this.fetchDatasets()]);
        this.modelsLoading = false;
        this.datasetsLoading = false;
        this.loadLocalDeployments();
    }

    hfHeaders() {
        const headers = {};
        if (this.apiToken) headers['Authorization'] = `Bearer ${this.apiToken}`;
        return headers;
    }

    escapeCatalogStatus(value) {
        return String(value).replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]);
    }

    catalogStatusText(resource) {
        const metadata = this.catalogMetadata[resource];
        if (!metadata) return `Hugging Face ${resource} have not been requested in this window.`;
        if (resource === 'models' && this.lastNativeCatalogRows) return `${metadata.cache === 'stored-metadata' ? 'Stored catalog metadata' : 'Native catalog retrieved'}: ${metadata.observed_at}. Current provider availability is unconfirmed. ${metadata.error ? `Refresh failed: ${metadata.error}. Retaining stored metadata.` : 'Refresh requests a new native observation.'}`;
        if (metadata.error) {
            return `${metadata.stale ? `Retaining the actual catalog observed ${metadata.observed_at} (age ${metadata.cache_age_ms} ms). ` : 'No live catalog observation is available. '}Hugging Face ${resource} unavailable: ${metadata.error} Retry after ${metadata.retry_at}.`;
        }
        return `Actual Hugging Face ${resource} observed ${metadata.observed_at}; ${metadata.cache} response, age ${metadata.cache_age_ms} ms. Complete response retained for up to ${metadata.cache_ttl_ms / 60000} minutes.`;
    }

    async hubCatalogJson(url, label) {
        const controller = new AbortController();
        let timer;
        try {
            const deadline = new Promise((_, reject) => {
                timer = setTimeout(() => {
                    controller.abort();
                    reject(new Error(`${label} timed out after ${this.requestTimeoutMs} ms; the external provider is unavailable.`));
                }, this.requestTimeoutMs);
            });
            return await Promise.race([deadline, (async () => {
                const response = await fetch(url, { headers: this.hfHeaders(), signal: controller.signal });
                if (!response.ok) throw new Error(`${label} request failed: ${response.status}`);
                return response.json();
            })()]);
        } finally { clearTimeout(timer); }
    }

    restoreNativeCatalogMetadata() {
        try {
            const raw = localStorage.getItem('huggingface-native-catalog');
            if (!raw || raw.length > 262144) return false;
            const saved = JSON.parse(raw);
            if (!Array.isArray(saved.rows) || saved.rows.length > 100 || !Number.isFinite(Date.parse(saved.observedAt))
                || saved.rows.some(row => !row || !/^[a-zA-Z0-9_.:/-]{1,200}$/.test(row.id))) return false;
            this.lastNativeCatalogRows = saved.rows;
            this.models = new Map(saved.rows.map(row => [row.id, { id: row.id, name: row.id, task: row.task || 'Unknown',
                snapshot: /^[0-9a-f]{40}$/.test(row.snapshot || row.sha || '') ? row.snapshot || row.sha : '', author: 'Stored catalog metadata', tags: [] }]));
            this.catalogMetadata.models = { source: 'stored-native-metadata', observed_at: saved.observedAt, cache: 'stored-metadata', error: null };
            this.modelsError = '';
            return true;
        } catch { return false; }
    }

    async fetchModels({ force = false } = {}) {
        if (this.lastNativeCatalogRows) return; // Public provider failures cannot replace retained native metadata.
        const params = new URLSearchParams({
            limit: '24',
            skip: String(this.modelSkip || 0),
            sort: 'downloads',
            direction: '-1',
            full: 'true'
        });
        if (this.modelSearch) params.set('search', this.modelSearch);
        try {
            const { items, metadata } = await readHubCatalog(this, `https://huggingface.co/api/models?${params}`, 'HF models', force || !this.settings.cacheEnabled);
            this.catalogMetadata.models = metadata;
            this.models.clear();
            for (const m of items) {
                if (this.modelTaskFilter && m.pipeline_tag !== this.modelTaskFilter && !(m.tags || []).includes(this.modelTaskFilter)) continue;
                if (this.modelLibraryFilter && !(m.tags || []).includes(this.modelLibraryFilter)) continue;
                this.models.set(m.id, {
                    ...m,
                    id: m.id,
                    name: m.id,
                    author: (m.id || '').split('/')[0] || 'Unknown',
                    task: m.pipeline_tag || 'Unknown',
                    pipeline_tag: m.pipeline_tag,
                    tags: m.tags || [],
                    downloads: m.downloads || 0,
                    likes: m.likes || 0
                });
            }
            this.modelsError = metadata.error || '';
            this.cache.models = new Map(this.models);
            if (metadata.observed_at) this.cache.lastRefresh = Math.max(this.cache.lastRefresh, Date.parse(metadata.observed_at));
        } catch (error) {
            this.modelsError = String(error.message || error);
            console.warn('HF models fetch failed:', error);
        }
    }

    async fetchDatasets({ force = false } = {}) {
        const params = new URLSearchParams({
            limit: '24',
            skip: String(this.datasetSkip || 0),
            sort: 'downloads',
            direction: '-1',
            full: 'true'
        });
        if (this.datasetSearch) params.set('search', this.datasetSearch);
        try {
            const { items, metadata } = await readHubCatalog(this, `https://huggingface.co/api/datasets?${params}`, 'HF datasets', force || !this.settings.cacheEnabled);
            this.catalogMetadata.datasets = metadata;
            this.datasets.clear();
            for (const d of items) {
                this.datasets.set(d.id, {
                    ...d,
                    id: d.id,
                    name: d.id,
                    author: (d.id || '').split('/')[0] || 'Unknown',
                    description: d.description || '',
                    tags: d.tags || [],
                    downloads: d.downloads || 0,
                    likes: d.likes || 0,
                    task_categories: d.task_categories || [],
                    language: d.language || []
                });
            }
            this.datasetsError = metadata.error || '';
            this.cache.datasets = new Map(this.datasets);
            if (metadata.observed_at) this.cache.lastRefresh = Math.max(this.cache.lastRefresh, Date.parse(metadata.observed_at));
        } catch (error) {
            this.datasetsError = String(error.message || error);
            console.warn('HF datasets fetch failed:', error);
        }
    }

    loadLocalDeployments() {
        // Honestly local: the only deployments this surface can report are
        // records the user adds themselves (stored in localStorage).
        this.deployments.clear();
        try {
            const saved = JSON.parse(localStorage.getItem('huggingface_deployments') || '[]');
            for (const dep of saved) this.deployments.set(dep.id, dep);
        } catch (error) {
            console.warn('Local deployments load failed:', error);
        }
    }

    saveLocalDeployments() {
        try {
            localStorage.setItem('huggingface_deployments', JSON.stringify(Array.from(this.deployments.values())));
        } catch (error) {
            console.warn('Local deployments save failed:', error);
        }
    }

    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    // Placeholder methods for functionality
    selectAttr(current, value) {
        return current === value ? ' selected' : '';
    }

    selectionStatusText() {
        if (this.selection?.id) {
            return `Selected ${this.selection.id}; stored revision ${this.selection.sha || 'unavailable'}. No model weights have been prepared here. Inference requires a credential and an explicit request.`;
        }
        return `${this.modelSearch ? `Query retained: ${this.modelSearch}. ` : ''}No card selected. Download and inference stay unavailable in this window.`;
    }

    restoreHubState() {
        try {
            const saved = JSON.parse(localStorage.getItem('huggingface_hub_state') || 'null');
            if (!saved || typeof saved !== 'object') return;
            const text = (value) => typeof value === 'string' ? value : '';
            this.modelSearch = text(saved.modelSearch);
            this.datasetSearch = text(saved.datasetSearch);
            this.modelTaskFilter = text(saved.modelTaskFilter);
            this.modelLibraryFilter = text(saved.modelLibraryFilter);
            this.datasetTaskFilter = text(saved.datasetTaskFilter);
            this.datasetSizeFilter = text(saved.datasetSizeFilter);
            const selection = saved.selection;
            if (selection && typeof selection === 'object' && typeof selection.id === 'string' && selection.id) {
                this.selection = {
                    id: selection.id,
                    sha: text(selection.sha),
                    kind: selection.kind === 'dataset' ? 'dataset' : 'model',
                    prepared_id: text(selection.prepared_id)
                };
            }
        } catch (error) {
            console.warn('Hub state restore failed:', error);
        }
    }

    persistHubState() {
        try {
            localStorage.setItem('huggingface_hub_state', JSON.stringify({
                modelSearch: this.modelSearch || '',
                datasetSearch: this.datasetSearch || '',
                modelTaskFilter: this.modelTaskFilter || '',
                modelLibraryFilter: this.modelLibraryFilter || '',
                datasetTaskFilter: this.datasetTaskFilter || '',
                datasetSizeFilter: this.datasetSizeFilter || '',
                selection: this.selection
            }));
        } catch (error) {
            console.warn('Hub state save failed:', error);
        }
    }

    showAuthentication() {
        const token = prompt('Enter your Hugging Face API token (stored locally in this browser):', this.apiToken || '');
        if (token === null) return;
        this.apiToken = token.trim();
        try {
            if (this.apiToken) localStorage.setItem('huggingface_api_token', this.apiToken);
            else localStorage.removeItem('huggingface_api_token');
        } catch (error) { console.warn('Token storage failed:', error); }
        this.checkAuthentication();
        this.refresh();
    }

    showSettings() {
        alert(`Hugging Face Hub settings (local):\nDefault model: ${this.settings.defaultModel}\nInference method: ${this.settings.inferenceMethod}\nCache: ${this.settings.cacheEnabled ? 'enabled' : 'disabled'}\nAuthenticated: ${this.isAuthenticated ? 'yes' : 'no'}`);
    }

    readModelControls() {
        const input = document.getElementById('models-search');
        const task = document.getElementById('models-filter-task');
        const library = document.getElementById('models-filter-library');
        if (input) this.modelSearch = input.value.trim();
        if (task) this.modelTaskFilter = task.value;
        if (library) this.modelLibraryFilter = library.value;
    }

    async refreshModels() {
        await this.retryModels();
    }

    async retryModels() {
        return this.searchModels();
    }

    async refreshDatasets() {
        this.datasetSearch = '';
        const input = document.getElementById('datasets-search');
        if (input) input.value = '';
        await this.fetchDatasets({ force: true });
        this.refresh();
    }

    async searchModels() {
        this.readModelControls();
        this.modelSkip = 0;
        this.persistHubState();
        const input = document.getElementById('models-search');
        const content = input?.closest('.window-app-content');
        if (!content || this.catalogQueryPending) return;
        this.catalogQueryPending = true;
        try {
            const response = await fetch('/mcp/tools/bindings?app_id=huggingface', { cache: 'no-store' });
            const catalog = await response.json();
            const bindingId = 'huggingface.ipfs_datasets_py.query_catalog';
            const control = catalog.controls?.find(item => item.binding_id === bindingId);
            const payload = control?.safe_payloads?.get_from_ipfs;
            if (!response.ok || control?.status !== 'available' || typeof payload?.cid !== 'string') throw new Error('No reviewed stored model catalog is configured.');
            const result = await invokeNativeTool(content, 'huggingface', bindingId, {
                executionMode: 'execute', toolId: 'get_from_ipfs', payload: { ...payload, fixture_scope: 'svf-huggingface-hub-card' },
                trigger: content.querySelector('#hf-catalog-query') || content.querySelector('#models-search-submit')
            });
            if (!result || result.ok !== true || result.outcome !== 'executed') throw new Error('The native catalog read did not execute.');
            const actual = unwrapNetworkToolResult(result.result);
            if (typeof actual?.content !== 'string') throw new Error('The native catalog returned no document bytes.');
            const rows = JSON.parse(actual.content);
            if (!Array.isArray(rows) || rows.length > 100 || rows.some(row => !row || typeof row.id !== 'string')) throw new Error('The stored model catalog has no valid model rows.');
            this.models.clear();
            const query = this.modelSearch.toLowerCase();
            for (const row of rows) {
                if (query && !row.id.toLowerCase().includes(query)) continue;
                this.models.set(row.id, { ...row, name: row.id, author: row.author || 'Stored catalog', task: row.pipeline_tag || row.task || 'Unknown' });
            }
            const now = new Date().toISOString();
            this.lastNativeCatalogRows = rows;
            try { localStorage.setItem('huggingface-native-catalog', JSON.stringify({ rows, observedAt: now })); } catch {}
            this.catalogMetadata.models = { source: 'Stored model catalog read through ipfs_datasets_py', observed_at: now,
                attempted_at: now, cache: 'owner-read', cache_age_ms: 0, cache_ttl_ms: 0, stale: false, error: null };
            this.modelsError = '';
        } catch (error) {
            if (!this.lastNativeCatalogRows) this.models.clear();
            if (this.catalogMetadata.models) this.catalogMetadata.models = { ...this.catalogMetadata.models, cache: 'stored-metadata', error: error.message };
            this.modelsError = `Stored model catalog unavailable: ${error.message}`;
        } finally {
            this.catalogQueryPending = false;
            this.refresh();
        }
    }

    async searchDatasets() {
        const input = document.getElementById('datasets-search');
        this.datasetSearch = (input?.value || '').trim();
        await this.fetchDatasets();
        this.refresh();
    }

    async previousModelsPage() { this.modelSkip = Math.max(0, (this.modelSkip || 0) - 24); await this.fetchModels(); this.refresh(); }
    async nextModelsPage() { this.modelSkip = (this.modelSkip || 0) + 24; await this.fetchModels(); this.refresh(); }
    async previousDatasetsPage() { this.datasetSkip = Math.max(0, (this.datasetSkip || 0) - 24); await this.fetchDatasets(); this.refresh(); }
    async nextDatasetsPage() { this.datasetSkip = (this.datasetSkip || 0) + 24; await this.fetchDatasets(); this.refresh(); }

    async loadModel(modelId) {
        const model = this.models.get(modelId);
        const revision = model?.sha || model?.snapshot;
        if (!model || !/^[0-9a-f]{40}$/.test(revision || '')) {
            this.modelsError = 'The returned catalog has no immutable revision for this item.';
            this.refresh();
            return;
        }
        this.selection = { id: model.id, sha: revision, kind: 'model', prepared_id: '' };
        this.settings.defaultModel = model.id;
        this.persistHubState();
        this.refresh();
    }

    testModel(modelId) {
        this.settings.defaultModel = modelId;
        this.currentTab = 'inference';
        this.refresh();
    }

    deployModel(modelId) {
        // Honest: this browser surface cannot deploy to any cloud. Offer to
        // track a deployment record the user creates externally.
        if (confirm(`This app cannot deploy "${modelId}" itself — deployments happen on Cloudflare, HF Spaces, etc. outside the browser.\n\nAdd a local tracking record for it?`)) {
            this.addDeploymentRecord({ name: `${modelId} deployment`, model: modelId, platform: 'external', url: `https://huggingface.co/${modelId}` });
        }
    }

    addDeploymentRecord({ name, model, platform, url }) {
        const id = 'dep-' + Date.now();
        this.deployments.set(id, { id, name, model, platform, url, status: 'tracked', requests: 0, latency: 0, addedAt: new Date().toISOString() });
        this.saveLocalDeployments();
        this.currentTab = 'deployments';
        this.refresh();
    }

    showDeploymentWizard() {
        const name = prompt('Deployment record name:', 'My deployment');
        if (name === null) return;
        const model = prompt('Model id (e.g. gpt2):', this.settings.defaultModel) || '';
        const platform = prompt('Platform (e.g. Cloudflare Workers, Hugging Face Space):', 'external') || 'external';
        const url = prompt('Deployment URL:', 'https://') || '';
        this.addDeploymentRecord({ name: name || 'Untitled', model, platform, url });
    }

    refreshDeployments() {
        this.loadLocalDeployments();
        this.refresh();
    }

    deployWithTemplate(template) {
        const docs = {
            'cloudflare-edge': 'Cloudflare Workers AI: deploy from your own Cloudflare account — https://developers.cloudflare.com/workers-ai/',
            'p2p-network': 'P2P deployment is handled by the live-tool gateway panel mounted in this window.',
            'huggingface-space': 'Hugging Face Spaces: create a Space from your HF account — https://huggingface.co/new-space'
        };
        if (confirm(`${docs[template] || template}\n\nThis browser surface cannot run the deployment. Add a local tracking record?`)) {
            this.addDeploymentRecord({ name: `${template} deployment`, model: this.settings.defaultModel, platform: template, url: '' });
        }
    }

    deleteDeployment(id) {
        if (!confirm('Delete this deployment record? (local record only)')) return;
        this.deployments.delete(id);
        this.saveLocalDeployments();
        this.refresh();
    }

    viewDeployment(id) {
        const d = this.deployments.get(id);
        if (d) alert(`Deployment record (local):\n${d.name}\nModel: ${d.model}\nPlatform: ${d.platform}\nURL: ${d.url || 'n/a'}\nAdded: ${d.addedAt || 'n/a'}`);
    }

    manageDeployment(id) { this.viewDeployment(id); }

    async downloadDataset(datasetId) {
        // Honest: large dataset downloads belong in the user's own tooling;
        // open the canonical dataset page.
        window.open(`https://huggingface.co/datasets/${encodeURIComponent(datasetId)}`, '_blank', 'noopener');
    }

    async previewDataset(datasetId) {
        // Real: the public datasets-server rows API.
        try {
            const response = await fetch(`https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(datasetId)}&config=default&split=train&offset=0&length=5`);
            if (!response.ok) throw new Error(`preview request failed: ${response.status}`);
            const data = await response.json();
            const rows = (data.rows || []).map(r => JSON.stringify(r.row)).join('\n');
            alert(`First rows of ${datasetId} (live preview):\n\n${rows.slice(0, 1500) || '(no rows returned)'}`);
        } catch (error) {
            alert(`Could not preview dataset: ${error.message}`);
        }
    }

    analyzeDataset(datasetId) {
        const d = this.datasets.get(datasetId);
        if (d) alert(`Dataset: ${d.id}\nDownloads: ${d.downloads ?? 'n/a'} | Likes: ${d.likes ?? 'n/a'}\nTasks: ${(d.task_categories || []).join(', ') || 'n/a'}\nLanguages: ${(d.language || []).join(', ') || 'n/a'}`);
    }

    async runInference() {
        const input = document.getElementById('inference-input');
        const output = document.getElementById('results-content');
        const text = (input?.value || '').trim();
        if (!text) { if (output) { output.setAttribute('aria-live', 'polite'); output.textContent = 'Enter text to run inference on.'; } return; }
        if (!this.apiToken) { if (output) { output.setAttribute('aria-live', 'polite'); output.textContent = 'Inference requires a credential. No request was sent; the selected item and filters are retained.'; } return; }
        const modelId = this.settings.defaultModel;
        if (output) output.textContent = 'Running inference...';
        try {
            const response = await fetch(`https://api-inference.huggingface.co/models/${encodeURIComponent(modelId)}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ inputs: text })
            });
            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                throw new Error(`Inference API ${response.status}: ${errText.slice(0, 300)}`);
            }
            const data = await response.json();
            const rendered = JSON.stringify(data, null, 2);
            if (output) output.textContent = rendered;
            this.inferenceHistory.unshift({ model: modelId, at: new Date().toISOString(), input: text.slice(0, 120) });
        } catch (error) {
            if (output) output.textContent = `⚠️ Inference failed: ${error.message}`;
        }
    }

    clearInference() {
        const input = document.getElementById('inference-input');
        const output = document.getElementById('results-content');
        if (input) input.value = '';
        if (output) output.textContent = '';
    }

    runPlaygroundInference() { this.runInference(); }
    stopPlaygroundInference() { /* fetch-based inference has no cancel handle; the request simply completes */ }

    clearPlaygroundInput() {
        const input = document.getElementById('playground-input');
        if (input) input.value = '';
    }

    loadExample() {
        const input = document.getElementById('inference-input');
        if (input) input.value = 'The quick brown fox jumps over the lazy dog.';
    }

    loadExamplePrompt() { this.loadExample(); }

    loadPlaygroundExample() {
        const input = document.getElementById('playground-input');
        if (input) input.value = 'Write a haiku about the ocean.';
    }

    savePlaygroundSession() {
        const input = document.getElementById('playground-input');
        try {
            localStorage.setItem('huggingface_playground', input?.value || '');
            alert('Playground input saved locally.');
        } catch (error) { alert(`Save failed: ${error.message}`); }
    }

    scheduleFit() {
        if (this.fitQueued) return;
        this.fitQueued = true;
        requestAnimationFrame(() => {
            this.fitQueued = false;
            this.fitToWindowFrame();
        });
    }

    fitToWindowFrame() {
        const appRoot = document.querySelector('.window[data-app-id="huggingface"] .huggingface-app');
        if (!appRoot || !appRoot.isConnected) return;
        const frame = appRoot.closest('.window');
        if (!frame) return;
        if (!this.frameResizeObserver && typeof ResizeObserver !== 'undefined') {
            this.frameResizeObserver = new ResizeObserver(() => this.scheduleFit());
            this.frameResizeObserver.observe(frame);
        }
        const frameRect = frame.getBoundingClientRect();
        const appRect = appRoot.getBoundingClientRect();
        const available = Math.floor(frameRect.bottom - appRect.top);
        if (available < 112 || appRect.bottom - frameRect.bottom < 8) return;
        const next = `${available}px`;
        if (appRoot.style.height === next) return;
        appRoot.style.height = next;
        appRoot.style.maxHeight = next;
        appRoot.style.overflow = 'hidden';
    }

    refresh() {
        const container = document.querySelector('.huggingface-app');
        if (container) container.outerHTML = this.render();
        this.scheduleFit();
    }

}

// Global instance for window functions
window.HuggingFaceApp = HuggingFaceApp;

// Export for module systems
export { HuggingFaceApp };
