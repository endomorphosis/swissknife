// SwissKnife Dedicated OpenRouter App
// Universal LLM Access Hub - Multiple AI Providers Through Single Interface

class OpenRouterApp {
    constructor() {
        this.name = 'OpenRouter Hub';
        // Single live instance for inline handlers (one desktop window per app).
        if (typeof window !== 'undefined') window.openRouterApp = this;
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
        <div class="openrouter-app">
            <!-- Header with Authentication -->
            <div class="or-header">
                <div class="or-header-left">
                    <div class="or-logo">
                        <div class="or-logo-icon">🔄</div>
                        <div class="or-logo-text">OpenRouter Hub</div>
                    </div>
                    <div class="or-status ${this.isAuthenticated ? 'authenticated' : 'unauthenticated'}">
                        <div class="status-indicator sk-status-dot ${this.isAuthenticated ? 'is-ok' : 'is-idle'}"></div>
                        <span>${this.isAuthenticated ? 'Connected' : 'Not Connected'}</span>
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
                    <button class="or-btn or-btn-primary sk-btn sk-btn-primary" onclick="window.openRouterApp.showAuthentication()">
                        <span class="btn-icon">🔑</span>
                        ${this.isAuthenticated ? 'Manage API Key' : 'Connect'}
                    </button>
                </div>
            </div>

            <!-- Navigation Tabs -->
            <div class="or-nav-tabs">
                <div class="tab-item ${this.currentTab === 'models' ? 'active' : ''}" data-tab="models">
                    <span class="tab-icon">🤖</span>
                    <span class="tab-label">Models</span>
                    <span class="tab-count">${this.models.size}</span>
                </div>
                <div class="tab-item ${this.currentTab === 'chat' ? 'active' : ''}" data-tab="chat">
                    <span class="tab-icon">💬</span>
                    <span class="tab-label">Chat</span>
                    <span class="tab-count">${this.conversations.length}</span>
                </div>
                <div class="tab-item ${this.currentTab === 'playground' ? 'active' : ''}" data-tab="playground">
                    <span class="tab-icon">🎮</span>
                    <span class="tab-label">Playground</span>
                </div>
                <div class="tab-item ${this.currentTab === 'analytics' ? 'active' : ''}" data-tab="analytics">
                    <span class="tab-icon">📊</span>
                    <span class="tab-label">Analytics</span>
                </div>
                <div class="tab-item ${this.currentTab === 'providers' ? 'active' : ''}" data-tab="providers">
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
                        <input type="text" class="sk-input" placeholder="Search models..." id="model-search" oninput="window.openRouterApp.filterModels(event.target.value)">
                        <span class="search-icon">🔍</span>
                    </div>
                    <select id="provider-filter" class="sk-select" onchange="window.openRouterApp.filterByProvider(event.target.value)">
                        <option value="">All Providers</option>
                        ${Array.from(this.providers.keys()).map(provider => 
                            `<option value="${provider}">${provider}</option>`
                        ).join('')}
                    </select>
                    <select id="model-sort" class="sk-select" onchange="window.openRouterApp.sortModels(event.target.value)">
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
                            onclick="window.openRouterApp.toggleFavorite('${model.id}')" title="Toggle Favorite">
                        ⭐
                    </button>
                    <button class="action-btn info-btn" onclick="window.openRouterApp.showModelInfo('${model.id}')" title="Model Info">
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
                <button class="or-btn or-btn-secondary or-btn-sm sk-btn" onclick="window.openRouterApp.tryModel('${model.id}')">
                    Try Model
                </button>
                <button class="or-btn or-btn-primary or-btn-sm sk-btn sk-btn-primary" onclick="window.openRouterApp.setDefaultModel('${model.id}')">
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
                        <button class="or-btn or-btn-primary or-btn-sm sk-btn sk-btn-primary" onclick="window.openRouterApp.createNewConversation()">
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
        // Tab switching
        document.addEventListener('click', (e) => {
            if (e.target.closest('.tab-item')) {
                const tab = e.target.closest('.tab-item').dataset.tab;
                this.switchTab(tab);
            }
        });

        // Auto-save settings
        setInterval(() => {
            if (this.settings.autoSave) {
                this.saveSettings();
            }
        }, 30000); // Save every 30 seconds
    }

    switchTab(tab) {
        this.currentTab = tab;
        this.updateDisplay();
    }

    updateDisplay() {
        const container = document.querySelector('.openrouter-app');
        if (container) {
            container.innerHTML = this.render();
        }
    }

    checkAuthentication() {
        this.isAuthenticated = !!this.apiKey && this.apiKey.length > 0;
        if (this.isAuthenticated) {
            this.loadUserCredits();
        }
    }

    async loadModels() {
        try {
            console.log('🔄 Loading OpenRouter models...');

            // Real OpenRouter catalog endpoint (public, no key required).
            let modelList = [];
            try {
                const response = await fetch('https://openrouter.ai/api/v1/models');
                if (!response.ok) throw new Error(`OpenRouter models request failed: ${response.status}`);
                const data = await response.json();
                modelList = Array.isArray(data?.data) ? data.data : [];
            } catch (fetchError) {
                console.warn('OpenRouter catalog unreachable, no models loaded:', fetchError);
            }

            if (modelList.length === 0) {
                console.log('ℹ️ No models returned by the OpenRouter catalog; model list stays empty.');
                return;
            }

            // Populate models from the real catalog
            modelList.forEach(model => {
                const id = model.id || model.name;
                if (!id) return;
                this.models.set(id, {
                    id,
                    name: model.name || id,
                    provider: id.split('/')[0] || 'unknown',
                    context_length: model.context_length || 0,
                    pricing: model.pricing || { prompt: 0, completion: 0 },
                    features: model.description ? ['chat'] : ['chat']
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

            console.log(`✅ Loaded ${this.models.size} models from ${this.providers.size} providers (live catalog)`);
            this.updateDisplay();
        } catch (error) {
            console.error('❌ Failed to load models:', error);
        }
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
        const modal = document.createElement('div');
        modal.className = 'or-modal';
        modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>OpenRouter API Configuration</h3>
                <button class="modal-close" onclick="window.openRouterApp.closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>API Key:</label>
                    <input type="password" id="api-key-input" class="sk-input" value="${this.apiKey}" placeholder="Enter your OpenRouter API key">
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
        document.body.appendChild(modal);
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
        const modal = document.querySelector('.or-modal');
        if (modal) {
            modal.remove();
        }
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
        this.settings.defaultModel = modelId;
        this.saveSettings();
        this.updateDisplay();
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
        if (!this.apiKey) {
            alert('Enter your OpenRouter API key (Settings tab) to send messages.');
            return;
        }
        const conversation = this.currentConversation;
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
            if (output) output.textContent = 'Enter your OpenRouter API key (Settings tab) to generate.';
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