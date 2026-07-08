// SwissKnife Dedicated Hugging Face App
// Professional AI Model Hub, Dataset Management & Inference Platform

class HuggingFaceApp {
    constructor() {
        this.name = 'Hugging Face Hub';
        this.currentTab = 'models';
        this.models = new Map();
        this.datasets = new Map();
        this.deployments = new Map();
        this.inferenceHistory = [];
        this.isAuthenticated = false;
        this.apiToken = localStorage.getItem('huggingface_api_token') || '';
        this.cache = {
            models: new Map(),
            datasets: new Map(),
            lastRefresh: 0
        };
        this.settings = {
            defaultModel: 'gpt2',
            inferenceMethod: 'auto',
            cacheEnabled: true,
            cacheTTL: 3600000 // 1 hour
        };
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
            <!-- Header with Authentication -->
            <div class="hf-header">
                <div class="hf-header-left">
                    <div class="hf-logo">
                        <div class="hf-logo-icon">🤗</div>
                        <div class="hf-logo-text">Hugging Face Hub</div>
                    </div>
                    <div class="hf-status ${this.isAuthenticated ? 'authenticated' : 'unauthenticated'}">
                        <div class="status-indicator"></div>
                        <span>${this.isAuthenticated ? 'Connected' : 'Not Connected'}</span>
                    </div>
                </div>
                <div class="hf-header-right">
                    <button class="hf-btn hf-btn-secondary" onclick="this.showSettings()">
                        <span class="btn-icon">⚙️</span>
                        Settings
                    </button>
                    <button class="hf-btn hf-btn-primary" onclick="this.showAuthentication()">
                        <span class="btn-icon">🔑</span>
                        ${this.isAuthenticated ? 'Manage Token' : 'Connect'}
                    </button>
                </div>
            </div>

            <!-- Navigation Tabs -->
            <div class="hf-nav-tabs">
                <div class="tab-item ${this.currentTab === 'models' ? 'active' : ''}" data-tab="models">
                    <span class="tab-icon">🧠</span>
                    <span class="tab-label">Models</span>
                    <span class="tab-count">${this.models.size}</span>
                </div>
                <div class="tab-item ${this.currentTab === 'datasets' ? 'active' : ''}" data-tab="datasets">
                    <span class="tab-icon">📊</span>
                    <span class="tab-label">Datasets</span>
                    <span class="tab-count">${this.datasets.size}</span>
                </div>
                <div class="tab-item ${this.currentTab === 'inference' ? 'active' : ''}" data-tab="inference">
                    <span class="tab-icon">⚡</span>
                    <span class="tab-label">Inference</span>
                    <span class="tab-count">${this.inferenceHistory.length}</span>
                </div>
                <div class="tab-item ${this.currentTab === 'deployments' ? 'active' : ''}" data-tab="deployments">
                    <span class="tab-icon">🚀</span>
                    <span class="tab-label">Deployments</span>
                    <span class="tab-count">${this.deployments.size}</span>
                </div>
                <div class="tab-item ${this.currentTab === 'playground' ? 'active' : ''}" data-tab="playground">
                    <span class="tab-icon">🎮</span>
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
                        <span>Cache: ${this.cache.models.size + this.cache.datasets.size} items</span>
                    </span>
                </div>
                <div class="status-right">
                    <span class="status-item">
                        <span class="status-icon">⏱️</span>
                        <span id="hf-last-refresh">Last refresh: Never</span>
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
                        <input type="text" id="models-search" placeholder="Search models..." class="search-input">
                        <button class="search-btn" onclick="this.searchModels()">🔍</button>
                    </div>
                    <div class="filter-container">
                        <select id="models-filter-task" class="filter-select">
                            <option value="">All Tasks</option>
                            <option value="text-generation">Text Generation</option>
                            <option value="text-classification">Text Classification</option>
                            <option value="image-classification">Image Classification</option>
                            <option value="speech-recognition">Speech Recognition</option>
                            <option value="translation">Translation</option>
                        </select>
                        <select id="models-filter-library" class="filter-select">
                            <option value="">All Libraries</option>
                            <option value="transformers">Transformers</option>
                            <option value="pytorch">PyTorch</option>
                            <option value="tensorflow">TensorFlow</option>
                            <option value="jax">JAX</option>
                        </select>
                    </div>
                    <button class="hf-btn hf-btn-primary" onclick="this.refreshModels()">
                        <span class="btn-icon">🔄</span>
                        Refresh
                    </button>
                </div>
            </div>

            <div class="models-grid" id="models-grid">
                ${this.renderModelsGrid()}
            </div>

            <div class="pagination">
                <button class="pagination-btn" onclick="this.previousModelsPage()">← Previous</button>
                <span class="pagination-info">Page 1 of 1000+</span>
                <button class="pagination-btn" onclick="this.nextModelsPage()">Next →</button>
            </div>
        </div>`;
    }

    renderModelsGrid() {
        if (this.models.size === 0) {
            return `
            <div class="empty-state">
                <div class="empty-icon">🤗</div>
                <div class="empty-title">No Models Loaded</div>
                <div class="empty-description">
                    ${this.isAuthenticated ? 
                        'Click refresh to load models from Hugging Face Hub' : 
                        'Connect your Hugging Face account to browse models'
                    }
                </div>
                <button class="hf-btn hf-btn-primary" onclick="this.${this.isAuthenticated ? 'refreshModels' : 'showAuthentication'}()">
                    ${this.isAuthenticated ? '🔄 Refresh Models' : '🔑 Connect Account'}
                </button>
            </div>`;
        }

        let modelsHtml = '';
        for (const [id, model] of this.models) {
            modelsHtml += `
            <div class="model-card" data-model-id="${id}">
                <div class="model-header">
                    <div class="model-name">${model.name || id}</div>
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
                    <div class="model-task">${model.task || model.pipeline_tag || 'Unknown'}</div>
                    <div class="model-author">by ${model.author || 'Unknown'}</div>
                    <div class="model-tags">
                        ${(model.tags || []).slice(0, 3).map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                </div>
                <div class="model-actions">
                    <button class="action-btn action-btn-primary" onclick="this.loadModel('${id}')">
                        <span class="btn-icon">📥</span>
                        Load
                    </button>
                    <button class="action-btn action-btn-secondary" onclick="this.testModel('${id}')">
                        <span class="btn-icon">🧪</span>
                        Test
                    </button>
                    <button class="action-btn action-btn-secondary" onclick="this.deployModel('${id}')">
                        <span class="btn-icon">🚀</span>
                        Deploy
                    </button>
                </div>
                <div class="model-status">
                    <div class="status-indicator status-available"></div>
                    <span>Available for inference</span>
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
                        <input type="text" id="datasets-search" placeholder="Search datasets..." class="search-input">
                        <button class="search-btn" onclick="this.searchDatasets()">🔍</button>
                    </div>
                    <div class="filter-container">
                        <select id="datasets-filter-task" class="filter-select">
                            <option value="">All Tasks</option>
                            <option value="text-classification">Text Classification</option>
                            <option value="image-classification">Image Classification</option>
                            <option value="speech-recognition">Speech Recognition</option>
                            <option value="translation">Translation</option>
                        </select>
                        <select id="datasets-filter-size" class="filter-select">
                            <option value="">All Sizes</option>
                            <option value="n<1K">< 1K samples</option>
                            <option value="1K<n<10K">1K - 10K</option>
                            <option value="10K<n<100K">10K - 100K</option>
                            <option value="100K<n<1M">100K - 1M</option>
                            <option value="n>1M">> 1M samples</option>
                        </select>
                    </div>
                    <button class="hf-btn hf-btn-primary" onclick="this.refreshDatasets()">
                        <span class="btn-icon">🔄</span>
                        Refresh
                    </button>
                </div>
            </div>

            <div class="datasets-grid" id="datasets-grid">
                ${this.renderDatasetsGrid()}
            </div>

            <div class="pagination">
                <button class="pagination-btn" onclick="this.previousDatasetsPage()">← Previous</button>
                <span class="pagination-info">Page 1 of 500+</span>
                <button class="pagination-btn" onclick="this.nextDatasetsPage()">Next →</button>
            </div>
        </div>`;
    }

    renderDatasetsGrid() {
        if (this.datasets.size === 0) {
            return `
            <div class="empty-state">
                <div class="empty-icon">📊</div>
                <div class="empty-title">No Datasets Loaded</div>
                <div class="empty-description">
                    ${this.isAuthenticated ? 
                        'Click refresh to load datasets from Hugging Face Hub' : 
                        'Connect your Hugging Face account to browse datasets'
                    }
                </div>
                <button class="hf-btn hf-btn-primary" onclick="this.${this.isAuthenticated ? 'refreshDatasets' : 'showAuthentication'}()">
                    ${this.isAuthenticated ? '🔄 Refresh Datasets' : '🔑 Connect Account'}
                </button>
            </div>`;
        }

        let datasetsHtml = '';
        for (const [id, dataset] of this.datasets) {
            datasetsHtml += `
            <div class="dataset-card" data-dataset-id="${id}">
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
                    <button class="action-btn action-btn-primary" onclick="this.downloadDataset('${id}')">
                        <span class="btn-icon">📥</span>
                        Download
                    </button>
                    <button class="action-btn action-btn-secondary" onclick="this.previewDataset('${id}')">
                        <span class="btn-icon">👁️</span>
                        Preview
                    </button>
                    <button class="action-btn action-btn-secondary" onclick="this.analyzeDataset('${id}')">
                        <span class="btn-icon">📈</span>
                        Analyze
                    </button>
                </div>
                <div class="dataset-status">
                    <div class="status-indicator status-available"></div>
                    <span>Available for download</span>
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
                        <select id="inference-model" class="form-select">
                            <option value="">Select a model...</option>
                            <option value="gpt2">GPT-2 (Text Generation)</option>
                            <option value="distilbert-base-uncased">DistilBERT (Text Classification)</option>
                            <option value="facebook/bart-large-cnn">BART (Summarization)</option>
                            <option value="t5-small">T5 (Text-to-Text Transfer)</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="inference-input">Input Text</label>
                        <textarea id="inference-input" class="form-textarea" rows="4" placeholder="Enter your text here..."></textarea>
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
                        <button class="hf-btn hf-btn-primary" onclick="this.runInference()">
                            <span class="btn-icon">⚡</span>
                            Run Inference
                        </button>
                        <button class="hf-btn hf-btn-secondary" onclick="this.clearInference()">
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
            <div class="empty-state-small">
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
                    <p>Deploy models to CloudFlare Workers, P2P Networks, or Hugging Face Spaces</p>
                </div>
                <div class="tab-actions">
                    <button class="hf-btn hf-btn-primary" onclick="this.showDeploymentWizard()">
                        <span class="btn-icon">➕</span>
                        New Deployment
                    </button>
                    <button class="hf-btn hf-btn-secondary" onclick="this.refreshDeployments()">
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
                        <button class="template-btn" onclick="this.deployWithTemplate('cloudflare-edge')">Deploy</button>
                    </div>
                    <div class="template-card" data-template="p2p-network">
                        <div class="template-icon">🔗</div>
                        <div class="template-name">P2P Network</div>
                        <div class="template-description">Decentralized deployment across peer network</div>
                        <button class="template-btn" onclick="this.deployWithTemplate('p2p-network')">Deploy</button>
                    </div>
                    <div class="template-card" data-template="huggingface-space">
                        <div class="template-icon">🤗</div>
                        <div class="template-name">Hugging Face Space</div>
                        <div class="template-description">Deploy as interactive Gradio/Streamlit app</div>
                        <button class="template-btn" onclick="this.deployWithTemplate('huggingface-space')">Deploy</button>
                    </div>
                </div>
            </div>
        </div>`;
    }

    renderDeploymentsGrid() {
        if (this.deployments.size === 0) {
            return `
            <div class="empty-state">
                <div class="empty-icon">🚀</div>
                <div class="empty-title">No Deployments</div>
                <div class="empty-description">Create your first model deployment to get started</div>
                <button class="hf-btn hf-btn-primary" onclick="this.showDeploymentWizard()">
                    <span class="btn-icon">➕</span>
                    Create Deployment
                </button>
            </div>`;
        }

        let deploymentsHtml = '';
        for (const [id, deployment] of this.deployments) {
            deploymentsHtml += `
            <div class="deployment-card" data-deployment-id="${id}">
                <div class="deployment-header">
                    <div class="deployment-name">${deployment.name}</div>
                    <div class="deployment-status status-${deployment.status}">
                        <div class="status-indicator"></div>
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
                    <button class="action-btn action-btn-secondary" onclick="this.viewDeployment('${id}')">
                        <span class="btn-icon">👁️</span>
                        View
                    </button>
                    <button class="action-btn action-btn-secondary" onclick="this.manageDeployment('${id}')">
                        <span class="btn-icon">⚙️</span>
                        Manage
                    </button>
                    <button class="action-btn action-btn-danger" onclick="this.deleteDeployment('${id}')">
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
                    <button class="hf-btn hf-btn-secondary" onclick="this.loadPlaygroundExample()">
                        <span class="btn-icon">📝</span>
                        Load Example
                    </button>
                    <button class="hf-btn hf-btn-secondary" onclick="this.savePlaygroundSession()">
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
                            <select id="playground-model" class="form-select">
                                <option value="gpt2">GPT-2 (Text Generation)</option>
                                <option value="distilbert-base-uncased">DistilBERT (Classification)</option>
                                <option value="facebook/bart-large-cnn">BART (Summarization)</option>
                                <option value="t5-small">T5 (Text-to-Text)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="playground-task">Task Type</label>
                            <select id="playground-task" class="form-select">
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
                                <button class="action-btn" onclick="this.clearPlaygroundInput()">Clear</button>
                                <button class="action-btn" onclick="this.loadExamplePrompt()">Example</button>
                            </div>
                        </div>
                        <textarea id="playground-input" class="playground-textarea" rows="6" placeholder="Enter your prompt or text here..."></textarea>
                    </div>

                    <div class="control-section">
                        <button class="hf-btn hf-btn-primary hf-btn-large" onclick="this.runPlaygroundInference()">
                            <span class="btn-icon">🚀</span>
                            Generate
                        </button>
                        <button class="hf-btn hf-btn-secondary" onclick="this.stopPlaygroundInference()">
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
                    <div class="example-card" onclick="this.loadExample('creative-writing')">
                        <div class="example-icon">✍️</div>
                        <div class="example-title">Creative Writing</div>
                        <div class="example-prompt">"Once upon a time in a distant galaxy..."</div>
                    </div>
                    <div class="example-card" onclick="this.loadExample('code-generation')">
                        <div class="example-icon">💻</div>
                        <div class="example-title">Code Generation</div>
                        <div class="example-prompt">"Write a Python function to calculate fibonacci..."</div>
                    </div>
                    <div class="example-card" onclick="this.loadExample('summarization')">
                        <div class="example-icon">📄</div>
                        <div class="example-title">Text Summarization</div>
                        <div class="example-prompt">"Summarize the following article..."</div>
                    </div>
                    <div class="example-card" onclick="this.loadExample('qa')">
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
        // Load sample data for demonstration
        this.loadSampleModels();
        this.loadSampleDatasets();
        this.loadSampleDeployments();
    }

    loadSampleModels() {
        const sampleModels = [
            {
                id: 'gpt2',
                name: 'GPT-2',
                author: 'openai',
                task: 'Text Generation',
                pipeline_tag: 'text-generation',
                tags: ['pytorch', 'transformer', 'text-generation'],
                downloads: 1500000,
                likes: 2500
            },
            {
                id: 'distilbert-base-uncased',
                name: 'DistilBERT Base Uncased',
                author: 'huggingface',
                task: 'Text Classification',
                pipeline_tag: 'text-classification',
                tags: ['pytorch', 'bert', 'classification'],
                downloads: 800000,
                likes: 1200
            },
            {
                id: 'facebook/bart-large-cnn',
                name: 'BART Large CNN',
                author: 'facebook',
                task: 'Summarization',
                pipeline_tag: 'summarization',
                tags: ['pytorch', 'bart', 'summarization'],
                downloads: 600000,
                likes: 900
            }
        ];

        for (const model of sampleModels) {
            this.models.set(model.id, model);
        }
    }

    loadSampleDatasets() {
        const sampleDatasets = [
            {
                id: 'imdb',
                name: 'IMDB Movie Reviews',
                author: 'stanfordnlp',
                description: 'Large Movie Review Dataset for binary sentiment classification',
                tags: ['sentiment-analysis', 'text-classification'],
                downloads: 150000,
                likes: 800,
                task_categories: ['text-classification'],
                language: ['en']
            },
            {
                id: 'squad',
                name: 'SQuAD 2.0',
                author: 'rajpurkar',
                description: 'Stanford Question Answering Dataset with unanswerable questions',
                tags: ['question-answering', 'reading-comprehension'],
                downloads: 200000,
                likes: 1500,
                task_categories: ['question-answering'],
                language: ['en']
            }
        ];

        for (const dataset of sampleDatasets) {
            this.datasets.set(dataset.id, dataset);
        }
    }

    loadSampleDeployments() {
        const sampleDeployments = [
            {
                id: 'gpt2-edge-demo',
                name: 'GPT-2 Edge Demo',
                model: 'gpt2',
                platform: 'CloudFlare Workers',
                url: 'https://gpt2-demo.your-worker.workers.dev',
                status: 'running',
                requests: 15420,
                latency: 85,
                uptime: 99.9
            }
        ];

        for (const deployment of sampleDeployments) {
            this.deployments.set(deployment.id, deployment);
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
    showAuthentication() {
        alert('Authentication dialog would open here');
    }

    showSettings() {
        alert('Settings dialog would open here');
    }

    refreshModels() {
        alert('Refreshing models from Hugging Face Hub...');
    }

    refreshDatasets() {
        alert('Refreshing datasets from Hugging Face Hub...');
    }

    runInference() {
        alert('Running inference...');
    }

    refresh() {
        const container = document.querySelector('.huggingface-app');
        if (container) {
            container.outerHTML = this.render();
            this.setupEventListeners();
        }
    }
}

// Global instance for window functions
window.HuggingFaceApp = HuggingFaceApp;

// Export for module systems
export { HuggingFaceApp };