// SwissKnife Dedicated OpenRouter App
// Universal LLM Access Hub - Multiple AI Providers Through Single Interface

class OpenRouterApp {
    constructor() {
        this.name = 'OpenRouter Hub';
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
                        <div class="status-indicator"></div>
                        <span>${this.isAuthenticated ? 'Connected' : 'Not Connected'}</span>
                    </div>
                    ${this.isAuthenticated ? `
                    <div class="or-credits">
                        <span class="credits-icon">💰</span>
                        <span class="credits-balance">$${this.credits.balance.toFixed(4)}</span>
                    </div>
                    ` : ''}
                </div>
                <div class="or-header-right">
                    <button class="or-btn or-btn-secondary" onclick="this.showSettings()">
                        <span class="btn-icon">⚙️</span>
                        Settings
                    </button>
                    <button class="or-btn or-btn-primary" onclick="this.showAuthentication()">
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
                        <input type="text" placeholder="Search models..." id="model-search" oninput="this.filterModels(event.target.value)">
                        <span class="search-icon">🔍</span>
                    </div>
                    <select id="provider-filter" onchange="this.filterByProvider(event.target.value)">
                        <option value="">All Providers</option>
                        ${Array.from(this.providers.keys()).map(provider => 
                            `<option value="${provider}">${provider}</option>`
                        ).join('')}
                    </select>
                    <select id="model-sort" onchange="this.sortModels(event.target.value)">
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
        <div class="model-card ${isCurrentDefault ? 'default-model' : ''}" data-model-id="${model.id}">
            <div class="model-header">
                <div class="model-name">${model.name}</div>
                <div class="model-actions">
                    <button class="action-btn favorite-btn ${this.favoriteModels.has(model.id) ? 'active' : ''}" 
                            onclick="this.toggleFavorite('${model.id}')" title="Toggle Favorite">
                        ⭐
                    </button>
                    <button class="action-btn info-btn" onclick="this.showModelInfo('${model.id}')" title="Model Info">
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
                <button class="or-btn or-btn-secondary or-btn-sm" onclick="this.tryModel('${model.id}')">
                    Try Model
                </button>
                <button class="or-btn or-btn-primary or-btn-sm" onclick="this.setDefaultModel('${model.id}')">
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
                        <button class="or-btn or-btn-primary or-btn-sm" onclick="this.createNewConversation()">
                            + New Chat
                        </button>
                    </div>
                    <div class="conversations-list">
                        ${this.conversations.length === 0 ? `
                        <div class="empty-state">
                            <div class="empty-icon">💬</div>
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
                    <button class="action-btn" onclick="this.exportConversation()" title="Export">📤</button>
                    <button class="action-btn" onclick="this.shareConversation()" title="Share">🔗</button>
                    <button class="action-btn" onclick="this.deleteConversation()" title="Delete">🗑️</button>
                </div>
            </div>

            <div class="messages-container" id="messages-container">
                ${this.currentConversation.messages.map(msg => this.renderMessage(msg)).join('')}
            </div>

            <div class="message-input-area">
                <div class="input-controls">
                    <select id="chat-model" onchange="this.changeConversationModel(event.target.value)">
                        ${Array.from(this.models.values()).map(model => 
                            `<option value="${model.id}" ${model.id === this.currentConversation.model ? 'selected' : ''}>
                                ${model.name}
                            </option>`
                        ).join('')}
                    </select>
                    <div class="generation-controls">
                        <label>Temp: <input type="range" min="0" max="2" step="0.1" value="${this.settings.temperature}" onchange="this.updateTemperature(event.target.value)"></label>
                        <label>Max Tokens: <input type="number" min="1" max="4096" value="${this.settings.maxTokens}" onchange="this.updateMaxTokens(event.target.value)"></label>
                    </div>
                </div>
                <div class="input-row">
                    <textarea id="message-input" placeholder="Type your message..." onkeydown="this.handleInputKeyDown(event)"></textarea>
                    <button class="send-btn" onclick="this.sendMessage()" id="send-btn">
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
                            <select id="playground-model" onchange="this.updatePlaygroundModel(event.target.value)">
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
                                   onchange="this.updatePlaygroundSetting('temperature', event.target.value)">
                        </div>
                        <div class="control-group">
                            <label>Max Tokens: <span id="tokens-value">${this.settings.maxTokens}</span></label>
                            <input type="range" min="1" max="4096" step="1" value="${this.settings.maxTokens}" 
                                   onchange="this.updatePlaygroundSetting('maxTokens', event.target.value)">
                        </div>
                        <div class="control-group">
                            <label>Top P: <span id="topp-value">${this.settings.topP}</span></label>
                            <input type="range" min="0" max="1" step="0.1" value="${this.settings.topP}" 
                                   onchange="this.updatePlaygroundSetting('topP', event.target.value)">
                        </div>
                    </div>

                    <div class="control-section">
                        <h3>Quick Prompts</h3>
                        <div class="quick-prompts">
                            <button class="prompt-btn" onclick="this.loadQuickPrompt('creative')">✨ Creative Writing</button>
                            <button class="prompt-btn" onclick="this.loadQuickPrompt('code')">💻 Code Assistant</button>
                            <button class="prompt-btn" onclick="this.loadQuickPrompt('analyze')">📊 Data Analysis</button>
                            <button class="prompt-btn" onclick="this.loadQuickPrompt('translate')">🌍 Translation</button>
                            <button class="prompt-btn" onclick="this.loadQuickPrompt('summarize')">📝 Summarization</button>
                            <button class="prompt-btn" onclick="this.loadQuickPrompt('explain')">🧠 Explanation</button>
                        </div>
                    </div>
                </div>

                <div class="playground-main">
                    <div class="input-section">
                        <div class="section-header">
                            <h3>Input</h3>
                            <button class="or-btn or-btn-secondary or-btn-sm" onclick="this.clearPlayground()">Clear</button>
                        </div>
                        <textarea id="playground-input" placeholder="Enter your prompt here..."></textarea>
                    </div>

                    <div class="output-section">
                        <div class="section-header">
                            <h3>Output</h3>
                            <div class="output-actions">
                                <button class="or-btn or-btn-secondary or-btn-sm" onclick="this.copyOutput()">📋 Copy</button>
                                <button class="or-btn or-btn-secondary or-btn-sm" onclick="this.saveOutput()">💾 Save</button>
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
                        <button class="or-btn or-btn-primary" onclick="this.generateResponse()" id="generate-btn">
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
                    <select id="analytics-period" onchange="this.updateAnalyticsPeriod(event.target.value)">
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
            
            // Sample models data (in real implementation, this would fetch from OpenRouter API)
            const sampleModels = [
                {
                    id: 'openai/gpt-4',
                    name: 'GPT-4',
                    provider: 'OpenAI',
                    context_length: 8192,
                    pricing: { prompt: 0.03, completion: 0.06 },
                    features: ['chat', 'reasoning', 'code']
                },
                {
                    id: 'anthropic/claude-3-opus',
                    name: 'Claude 3 Opus',
                    provider: 'Anthropic',
                    context_length: 200000,
                    pricing: { prompt: 0.015, completion: 0.075 },
                    features: ['chat', 'analysis', 'long-context']
                },
                {
                    id: 'google/gemini-pro',
                    name: 'Gemini Pro',
                    provider: 'Google',
                    context_length: 32768,
                    pricing: { prompt: 0.0005, completion: 0.0015 },
                    features: ['chat', 'multimodal', 'vision']
                },
                {
                    id: 'mistralai/mistral-7b-instruct',
                    name: 'Mistral 7B Instruct',
                    provider: 'Mistral AI',
                    context_length: 32768,
                    pricing: { prompt: 0.0002, completion: 0.0002 },
                    features: ['chat', 'instruct', 'efficient']
                }
            ];

            // Populate models
            sampleModels.forEach(model => {
                this.models.set(model.id, model);
            });

            // Group by providers
            this.providers.clear();
            sampleModels.forEach(model => {
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
                const minPrice = Math.min(model.pricing.prompt, model.pricing.completion);
                const maxPrice = Math.max(model.pricing.prompt, model.pricing.completion);
                provider.priceRange.min = Math.min(provider.priceRange.min, minPrice);
                provider.priceRange.max = Math.max(provider.priceRange.max, maxPrice);
            });

            console.log(`✅ Loaded ${this.models.size} models from ${this.providers.size} providers`);
        } catch (error) {
            console.error('❌ Failed to load models:', error);
        }
    }

    async loadUserCredits() {
        try {
            // In real implementation, this would fetch from OpenRouter API
            this.credits = {
                balance: 5.0,
                used: 2.5
            };
        } catch (error) {
            console.error('❌ Failed to load credits:', error);
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
                <button class="modal-close" onclick="this.closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>API Key:</label>
                    <input type="password" id="api-key-input" value="${this.apiKey}" placeholder="Enter your OpenRouter API key">
                    <div class="help-text">
                        Get your API key from <a href="https://openrouter.ai/keys" target="_blank">OpenRouter Dashboard</a>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="or-btn or-btn-secondary" onclick="this.closeModal()">Cancel</button>
                <button class="or-btn or-btn-primary" onclick="this.saveApiKey()">Save API Key</button>
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
        console.log('🔧 Opening OpenRouter settings...');
    }

    createNewConversation() {
        console.log('💬 Creating new conversation...');
    }

    generateResponse() {
        console.log('⚡ Generating AI response...');
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