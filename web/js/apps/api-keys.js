// Enhanced API Key Manager App with UCAN and Resource Management
window.APIKeysApp = class APIKeysApp {
    constructor() {
        this.name = 'API Keys';
        this.icon = '🔑';
        this.keys = new Map();
        this.ucanTokens = new Map();
        this.providers = [
            // AI/ML Providers - Enhanced
            { id: 'openai', name: 'OpenAI', fields: ['apiKey', 'organizationId'], category: 'ai' },
            { id: 'anthropic', name: 'Anthropic', fields: ['apiKey'], category: 'ai' },
            { id: 'google', name: 'Google (Gemini)', fields: ['apiKey', 'projectId'], category: 'ai' },
            { id: 'huggingface', name: 'Hugging Face', fields: ['apiKey', 'organizationId'], category: 'ai' },
            { id: 'cohere', name: 'Cohere', fields: ['apiKey'], category: 'ai' },
            { id: 'together', name: 'Together AI', fields: ['apiKey'], category: 'ai' },
            { id: 'replicate', name: 'Replicate', fields: ['apiKey'], category: 'ai' },
            { id: 'mistral', name: 'Mistral AI', fields: ['apiKey'], category: 'ai' },
            { id: 'groq', name: 'Groq', fields: ['apiKey'], category: 'ai' },
            { id: 'perplexity', name: 'Perplexity AI', fields: ['apiKey'], category: 'ai' },
            { id: 'deepseek', name: 'DeepSeek', fields: ['apiKey'], category: 'ai' },
            { id: 'fireworks', name: 'Fireworks AI', fields: ['apiKey'], category: 'ai' },
            { id: 'cerebras', name: 'Cerebras', fields: ['apiKey'], category: 'ai' },
            { id: 'xai', name: 'xAI (Grok)', fields: ['apiKey'], category: 'ai' },
            { id: 'reka', name: 'Reka AI', fields: ['apiKey'], category: 'ai' },
            { id: 'ai21', name: 'AI21 Labs', fields: ['apiKey'], category: 'ai' },
            { id: 'goose', name: 'Goose AI', fields: ['apiKey'], category: 'ai' },
            { id: 'novita', name: 'Novita AI', fields: ['apiKey'], category: 'ai' },
            { id: 'runpod', name: 'RunPod', fields: ['apiKey'], category: 'ai' },
            { id: 'openrouter', name: 'OpenRouter', fields: ['apiKey'], category: 'ai' },
            { id: 'azure', name: 'Azure OpenAI', fields: ['apiKey', 'resourceName'], category: 'ai' },

            // Cloud Storage Providers - Enhanced
            { id: 'aws', name: 'AWS S3', fields: ['accessKeyId', 'secretAccessKey', 'region', 'bucketName'], category: 'storage' },
            { id: 'azure-storage', name: 'Azure Blob', fields: ['subscriptionId', 'tenantId', 'clientId', 'clientSecret', 'storageAccount'], category: 'storage' },
            { id: 'gcp', name: 'Google Cloud Storage', fields: ['projectId', 'keyFile', 'bucketName'], category: 'storage' },
            { id: 'storacha', name: 'Storacha (Web3.Storage)', fields: ['apiKey', 'did', 'space'], category: 'storage' },
            { id: 'pinata', name: 'Pinata IPFS', fields: ['apiKey', 'secretApiKey', 'jwt'], category: 'storage' },
            { id: 'nftstorage', name: 'NFT.Storage', fields: ['apiKey'], category: 'storage' },
            { id: 'fleek', name: 'Fleek', fields: ['apiKey', 'apiSecret'], category: 'storage' },
            { id: 'lighthouse', name: 'Lighthouse Storage', fields: ['apiKey'], category: 'storage' },
            { id: 'arweave', name: 'Arweave', fields: ['keyFile', 'gateway'], category: 'storage' },
            { id: 'sia', name: 'Sia Skynet', fields: ['portalUrl', 'apiKey'], category: 'storage' },
            { id: 'storj', name: 'Storj DCS', fields: ['accessGrant', 'satellite'], category: 'storage' },
            { id: 'dropbox', name: 'Dropbox', fields: ['accessToken', 'appKey', 'appSecret'], category: 'storage' },
            { id: 'onedrive', name: 'OneDrive', fields: ['clientId', 'clientSecret', 'tenantId'], category: 'storage' },
            { id: 'googledrive', name: 'Google Drive', fields: ['clientId', 'clientSecret', 'refreshToken'], category: 'storage' },

            // Development Platforms - Enhanced
            { id: 'github', name: 'GitHub', fields: ['token', 'username', 'enterprise'], category: 'dev' },
            { id: 'gitlab', name: 'GitLab', fields: ['token', 'instance', 'username'], category: 'dev' },
            { id: 'bitbucket', name: 'Bitbucket', fields: ['username', 'appPassword'], category: 'dev' },
            { id: 'dockerhub', name: 'Docker Hub', fields: ['username', 'token'], category: 'dev' },
            { id: 'npm', name: 'NPM Registry', fields: ['token', 'registry'], category: 'dev' },
            { id: 'pypi', name: 'PyPI', fields: ['token', 'username'], category: 'dev' },
            { id: 'vercel', name: 'Vercel', fields: ['token', 'teamId'], category: 'dev' },
            { id: 'netlify', name: 'Netlify', fields: ['token', 'siteId'], category: 'dev' },
            { id: 'railway', name: 'Railway', fields: ['token', 'projectId'], category: 'dev' },
            { id: 'render', name: 'Render', fields: ['apiKey', 'serviceId'], category: 'dev' },

            // IPFS & P2P - Enhanced
            { id: 'ipfs', name: 'IPFS Node', fields: ['endpoint', 'token', 'gateway'], category: 'p2p' },
            { id: 'libp2p', name: 'libp2p', fields: ['peerId', 'privateKey', 'multiaddr'], category: 'p2p' },
            { id: 'filecoin', name: 'Filecoin', fields: ['wallet', 'token', 'lotusEndpoint'], category: 'p2p' },
            { id: 'ipns', name: 'IPNS', fields: ['peerId', 'privateKey'], category: 'p2p' },
            { id: 'orbit', name: 'OrbitDB', fields: ['address', 'identity'], category: 'p2p' },
            { id: 'textile', name: 'Textile Hub', fields: ['userKey', 'userSecret'], category: 'p2p' },

            // Blockchain/Web3 - Enhanced
            { id: 'ethereum', name: 'Ethereum', fields: ['rpcUrl', 'privateKey', 'infuraKey'], category: 'web3' },
            { id: 'polygon', name: 'Polygon', fields: ['rpcUrl', 'privateKey', 'alchemyKey'], category: 'web3' },
            { id: 'arbitrum', name: 'Arbitrum', fields: ['rpcUrl', 'privateKey'], category: 'web3' },
            { id: 'optimism', name: 'Optimism', fields: ['rpcUrl', 'privateKey'], category: 'web3' },
            { id: 'base', name: 'Base', fields: ['rpcUrl', 'privateKey'], category: 'web3' },
            { id: 'solana', name: 'Solana', fields: ['rpcUrl', 'privateKey', 'cluster'], category: 'web3' },
            { id: 'avalanche', name: 'Avalanche', fields: ['rpcUrl', 'privateKey'], category: 'web3' },
            { id: 'bsc', name: 'BNB Smart Chain', fields: ['rpcUrl', 'privateKey'], category: 'web3' },
            { id: 'fantom', name: 'Fantom', fields: ['rpcUrl', 'privateKey'], category: 'web3' },
            { id: 'near', name: 'NEAR Protocol', fields: ['accountId', 'privateKey', 'networkId'], category: 'web3' },
            { id: 'aptos', name: 'Aptos', fields: ['nodeUrl', 'privateKey'], category: 'web3' },
            { id: 'sui', name: 'Sui', fields: ['nodeUrl', 'privateKey'], category: 'web3' },
            { id: 'starknet', name: 'StarkNet', fields: ['nodeUrl', 'privateKey'], category: 'web3' },

            // API Services - New Category
            { id: 'rapidapi', name: 'RapidAPI', fields: ['apiKey', 'host'], category: 'api' },
            { id: 'postman', name: 'Postman API', fields: ['apiKey'], category: 'api' },
            { id: 'algolia', name: 'Algolia', fields: ['applicationId', 'apiKey'], category: 'api' },
            { id: 'stripe', name: 'Stripe', fields: ['publishableKey', 'secretKey'], category: 'api' },
            { id: 'twilio', name: 'Twilio', fields: ['accountSid', 'authToken'], category: 'api' },
            { id: 'sendgrid', name: 'SendGrid', fields: ['apiKey'], category: 'api' },
            { id: 'mailgun', name: 'Mailgun', fields: ['apiKey', 'domain'], category: 'api' },
            { id: 'cloudflare', name: 'Cloudflare', fields: ['apiToken', 'zoneId'], category: 'api' },
            { id: 'discord', name: 'Discord Bot', fields: ['botToken', 'clientId'], category: 'api' },
            { id: 'slack', name: 'Slack', fields: ['botToken', 'signingSecret'], category: 'api' },
            { id: 'telegram', name: 'Telegram Bot', fields: ['botToken'], category: 'api' },

            // ML Tools - Enhanced
            { id: 'wandb', name: 'Weights & Biases', fields: ['apiKey', 'entity', 'project'], category: 'ml' },
            { id: 'tensorboard', name: 'TensorBoard', fields: ['logdir', 'host'], category: 'ml' },
            { id: 'mlflow', name: 'MLflow', fields: ['trackingUri', 'token'], category: 'ml' },
            { id: 'neptune', name: 'Neptune.ai', fields: ['apiToken', 'project'], category: 'ml' },
            { id: 'clearml', name: 'ClearML', fields: ['accessKey', 'secretKey', 'host'], category: 'ml' },
            { id: 'dvc', name: 'DVC', fields: ['remoteUrl', 'token'], category: 'ml' },
            { id: 'kaggle', name: 'Kaggle', fields: ['username', 'key'], category: 'ml' },

            // Compute Platforms - Enhanced
            { id: 'modal', name: 'Modal', fields: ['tokenId', 'tokenSecret'], category: 'compute' },
            { id: 'vast', name: 'Vast.ai', fields: ['apiKey'], category: 'compute' },
            { id: 'lambda', name: 'Lambda Labs', fields: ['apiKey'], category: 'compute' },
            { id: 'paperspace', name: 'Paperspace', fields: ['apiKey'], category: 'compute' },
            { id: 'coreweave', name: 'CoreWeave', fields: ['apiKey', 'namespace'], category: 'compute' },
            { id: 'fluidstack', name: 'FluidStack', fields: ['apiKey'], category: 'compute' },
            { id: 'linode', name: 'Linode', fields: ['token'], category: 'compute' },
            { id: 'digitalocean', name: 'DigitalOcean', fields: ['token'], category: 'compute' },
            { id: 'vultr', name: 'Vultr', fields: ['apiKey'], category: 'compute' },

            // Monitoring & Analytics - New Category
            { id: 'datadog', name: 'Datadog', fields: ['apiKey', 'appKey'], category: 'monitoring' },
            { id: 'newrelic', name: 'New Relic', fields: ['licenseKey', 'accountId'], category: 'monitoring' },
            { id: 'sentry', name: 'Sentry', fields: ['dsn', 'authToken'], category: 'monitoring' },
            { id: 'mixpanel', name: 'Mixpanel', fields: ['token', 'secret'], category: 'monitoring' },
            { id: 'amplitude', name: 'Amplitude', fields: ['apiKey', 'secretKey'], category: 'monitoring' },
            { id: 'segment', name: 'Segment', fields: ['writeKey'], category: 'monitoring' },
            { id: 'logz', name: 'Logz.io', fields: ['token', 'region'], category: 'monitoring' },

            // Databases - New Category
            { id: 'mongodb', name: 'MongoDB Atlas', fields: ['connectionString', 'apiKey'], category: 'database' },
            { id: 'supabase', name: 'Supabase', fields: ['url', 'anonKey', 'serviceKey'], category: 'database' },
            { id: 'planetscale', name: 'PlanetScale', fields: ['host', 'username', 'password'], category: 'database' },
            { id: 'redis', name: 'Redis Cloud', fields: ['endpoint', 'password'], category: 'database' },
            { id: 'fauna', name: 'Fauna', fields: ['secret'], category: 'database' },
            { id: 'airtable', name: 'Airtable', fields: ['apiKey', 'baseId'], category: 'database' },
            { id: 'notion', name: 'Notion', fields: ['token'], category: 'database' }
        ];
        this.categories = {
            'ai': '🤖 AI/ML',
            'storage': '💾 Storage',
            'dev': '🛠️ Development',
            'p2p': '🔗 P2P/IPFS',
            'web3': '⛓️ Blockchain',
            'ml': '📊 ML Tools',
            'compute': '☁️ Compute',
            'api': '🌐 API Services',
            'monitoring': '📊 Monitoring',
            'database': '🗄️ Databases',
            'openrouter': '🔄 OpenRouter',
            'azure': '🔷 Azure'
        };
    }

    async render() {
        return `
            <div class="api-keys-app">
                <div class="keys-header">
                    <h2>🔑 API Key & Token Manager</h2>
                    <div class="keys-actions">
                        <button onclick="apiKeysApp.showAddKey()" class="btn-primary">➕ Add Key</button>
                        <button onclick="apiKeysApp.showAddUCAN()" class="btn-primary">🎫 Add UCAN</button>
                        <button onclick="apiKeysApp.importKeys()" class="btn-secondary">📥 Import</button>
                        <button onclick="apiKeysApp.exportKeys()" class="btn-secondary">📤 Export</button>
                        <button onclick="apiKeysApp.bulkTest()" class="btn-secondary">🧪 Test All</button>
                    </div>
                </div>
                
                <div class="keys-content">
                    <div class="keys-sidebar">
                        <div class="category-tabs" id="category-tabs">
                            <button class="tab active" onclick="apiKeysApp.switchTab('all')">🔑 All Keys</button>
                            <button class="tab" onclick="apiKeysApp.switchTab('ucan')">🎫 UCAN Tokens</button>
                            ${Object.entries(this.categories).map(([id, name]) => 
                                `<button class="tab" onclick="apiKeysApp.switchTab('${id}')">${name}</button>`
                            ).join('')}
                        </div>
                        
                        <div class="key-stats">
                            <div class="stat-item">
                                <span class="stat-number" id="total-keys">0</span>
                                <span class="stat-label">API Keys</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-number" id="total-ucans">0</span>
                                <span class="stat-label">UCAN Tokens</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-number" id="active-keys">0</span>
                                <span class="stat-label">Active</span>
                            </div>
                        </div>
                        
                        <div class="quick-actions">
                            <h4>Quick Actions</h4>
                            <button onclick="apiKeysApp.setupOpenAI()" class="quick-btn">🤖 Setup OpenAI</button>
                            <button onclick="apiKeysApp.setupAnthropic()" class="quick-btn">🧠 Setup Anthropic</button>
                            <button onclick="apiKeysApp.setupStoracha()" class="quick-btn">🗂️ Setup Storacha</button>
                            <button onclick="apiKeysApp.setupHuggingFace()" class="quick-btn">🤗 Setup HuggingFace</button>
                            <button onclick="apiKeysApp.setupAWS()" class="quick-btn">☁️ Setup AWS</button>
                            <button onclick="apiKeysApp.setupGoogleCloud()" class="quick-btn">🌐 Setup Google Cloud</button>
                            <button onclick="apiKeysApp.setupGitHub()" class="quick-btn">🐙 Setup GitHub</button>
                            <button onclick="apiKeysApp.setupDiscord()" class="quick-btn">💬 Setup Discord Bot</button>
                            <button onclick="apiKeysApp.setupWeb3Bundle()" class="quick-btn">⛓️ Setup Web3 Bundle</button>
                            <button onclick="apiKeysApp.generateUCANPair()" class="quick-btn">🔐 Generate UCAN Pair</button>
                            <button onclick="apiKeysApp.importFromEnv()" class="quick-btn">📥 Import from .env</button>
                            <button onclick="apiKeysApp.setupDeveloperPack()" class="quick-btn">📦 Developer Pack</button>
                        </div>
                    </div>
                    
                    <div class="keys-main">
                        <div class="keys-toolbar">
                            <div class="search-box">
                                <input type="text" id="key-search" placeholder="Search keys and tokens..." onkeyup="apiKeysApp.filterKeys()">
                                <button onclick="apiKeysApp.clearSearch()">✕</button>
                            </div>
                            <div class="filter-options">
                                <select id="status-filter" onchange="apiKeysApp.filterKeys()">
                                    <option value="">All Status</option>
                                    <option value="valid">Valid</option>
                                    <option value="invalid">Invalid</option>
                                    <option value="expired">Expired</option>
                                    <option value="unknown">Unknown</option>
                                </select>
                                <select id="sort-order" onchange="apiKeysApp.sortKeys()">
                                    <option value="newest">Newest First</option>
                                    <option value="oldest">Oldest First</option>
                                    <option value="name">By Name</option>
                                    <option value="status">By Status</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="keys-list" id="keys-list">
                            <div class="loading">Loading API keys and tokens...</div>
                        </div>
                    </div>
                </div>
                
                <!-- Add Key Modal -->
                <div id="add-key-modal" class="modal hidden">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>Add API Key</h3>
                            <button onclick="apiKeysApp.hideAddKey()" class="modal-close">✕</button>
                        </div>
                        <div class="modal-body">
                            <form id="add-key-form">
                                <div class="form-group">
                                    <label for="key-provider">Provider:</label>
                                    <select id="key-provider" onchange="apiKeysApp.updateKeyForm()" required>
                                        <option value="">Select a provider</option>
                                        ${Object.entries(this.categories).map(([catId, catName]) => 
                                            `<optgroup label="${catName}">
                                                ${this.providers.filter(p => p.category === catId).map(p => 
                                                    `<option value="${p.id}">${p.name}</option>`
                                                ).join('')}
                                            </optgroup>`
                                        ).join('')}
                                    </select>
                                </div>
                                <div id="key-fields"></div>
                                <div class="form-group">
                                    <label for="key-description">Description (optional):</label>
                                    <input type="text" id="key-description" placeholder="Production key, Testing, etc.">
                                </div>
                                <div class="form-group">
                                    <label for="key-environment">Environment:</label>
                                    <select id="key-environment">
                                        <option value="production">Production</option>
                                        <option value="staging">Staging</option>
                                        <option value="development" selected>Development</option>
                                        <option value="testing">Testing</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="auto-test"> Test key after adding
                                    </label>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button onclick="apiKeysApp.addKey()" class="btn-primary">Add Key</button>
                            <button onclick="apiKeysApp.hideAddKey()" class="btn-secondary">Cancel</button>
                        </div>
                    </div>
                </div>
                
                <!-- Add UCAN Modal -->
                <div id="add-ucan-modal" class="modal hidden">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>Add UCAN Token</h3>
                            <button onclick="apiKeysApp.hideAddUCAN()" class="modal-close">✕</button>
                        </div>
                        <div class="modal-body">
                            <form id="add-ucan-form">
                                <div class="form-group">
                                    <label for="ucan-token">UCAN Token:</label>
                                    <textarea id="ucan-token" rows="4" placeholder="Paste UCAN token here..." required></textarea>
                                </div>
                                <div class="form-group">
                                    <label for="ucan-name">Name:</label>
                                    <input type="text" id="ucan-name" placeholder="Descriptive name for this token" required>
                                </div>
                                <div class="form-group">
                                    <label for="ucan-purpose">Purpose:</label>
                                    <select id="ucan-purpose">
                                        <option value="storage">Storage Access</option>
                                        <option value="inference">Model Inference</option>
                                        <option value="files">File Sharing</option>
                                        <option value="compute">Compute Resources</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="auto-verify"> Verify token after adding
                                    </label>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button onclick="apiKeysApp.addUCAN()" class="btn-primary">Add Token</button>
                            <button onclick="apiKeysApp.hideAddUCAN()" class="btn-secondary">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async onMount() {
        await this.loadKeys();
        await this.loadUCANTokens();
        this.currentTab = 'all';
        this.updateStats();
        this.renderKeysList();
    }

    async loadUCANTokens() {
        try {
            const savedTokens = localStorage.getItem('ucan-tokens');
            if (savedTokens) {
                const tokens = JSON.parse(savedTokens);
                this.ucanTokens.clear();
                tokens.forEach((token, index) => {
                    this.ucanTokens.set(token.id || `ucan-${index}`, token);
                });
            }
        } catch (error) {
            console.error('Error loading UCAN tokens:', error);
            this.showNotification('Failed to load UCAN tokens', 'error');
        }
    }

    updateStats() {
        const totalKeys = this.keys.size;
        const totalUcans = this.ucanTokens.size;
        const activeKeys = Array.from(this.keys.values()).filter(k => k.status === 'valid').length;

        document.getElementById('total-keys').textContent = totalKeys;
        document.getElementById('total-ucans').textContent = totalUcans;
        document.getElementById('active-keys').textContent = activeKeys;
    }

    switchTab(tab) {
        this.currentTab = tab;
        // Update tab styling
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`[onclick="apiKeysApp.switchTab('${tab}')"]`).classList.add('active');
        this.renderKeysList();
    }

    renderKeysList() {
        const container = document.getElementById('keys-list');
        if (!container) return;

        let filteredItems = [];

        if (this.currentTab === 'all') {
            // Combine API keys and UCAN tokens
            filteredItems = [
                ...Array.from(this.keys.entries()).map(([id, key]) => ({ type: 'key', id, data: key })),
                ...Array.from(this.ucanTokens.entries()).map(([id, token]) => ({ type: 'ucan', id, data: token }))
            ];
        } else if (this.currentTab === 'ucan') {
            filteredItems = Array.from(this.ucanTokens.entries()).map(([id, token]) => ({ type: 'ucan', id, data: token }));
        } else {
            // Filter by category
            filteredItems = Array.from(this.keys.entries())
                .filter(([id, key]) => {
                    const provider = this.providers.find(p => p.id === key.provider);
                    return provider && provider.category === this.currentTab;
                })
                .map(([id, key]) => ({ type: 'key', id, data: key }));
        }

        if (filteredItems.length === 0) {
            container.innerHTML = `
                <div class="no-keys">
                    <h3>No ${this.currentTab === 'ucan' ? 'UCAN tokens' : 'API keys'} found</h3>
                    <p>${this.currentTab === 'ucan' ? 'Add your first UCAN token' : 'Add your first API key'} to get started.</p>
                    <button onclick="apiKeysApp.${this.currentTab === 'ucan' ? 'showAddUCAN' : 'showAddKey'}()" class="btn-primary">
                        ${this.currentTab === 'ucan' ? '🎫 Add UCAN Token' : '➕ Add API Key'}
                    </button>
                </div>
            `;
            return;
        }

        const itemsHtml = filteredItems.map(({ type, id, data }) => {
            if (type === 'key') {
                return this.renderKeyCard(id, data);
            } else {
                return this.renderUCANCard(id, data);
            }
        }).join('');

        container.innerHTML = itemsHtml;
    }

    renderKeyCard(id, key) {
        const provider = this.providers.find(p => p.id === key.provider);
        const maskedKey = this.maskKey(key.apiKey || key.token || Object.values(key.credentials || {})[0]);
        const category = this.categories[provider?.category] || provider?.category || 'Other';
        
        return `
            <div class="key-card" data-type="key">
                <div class="key-header">
                    <div class="key-info">
                        <h4>${provider?.name || key.provider}</h4>
                        <span class="key-category">${category}</span>
                        <span class="key-value">${maskedKey}</span>
                        ${key.description ? `<span class="key-description">${key.description}</span>` : ''}
                        ${key.environment ? `<span class="key-environment">${key.environment}</span>` : ''}
                    </div>
                    <div class="key-actions">
                        <button onclick="apiKeysApp.testKey('${id}')" class="btn-secondary">🧪 Test</button>
                        <button onclick="apiKeysApp.editKey('${id}')" class="btn-secondary">✏️ Edit</button>
                        <button onclick="apiKeysApp.copyKey('${id}')" class="btn-secondary">📋 Copy</button>
                        <button onclick="apiKeysApp.shareKey('${id}')" class="btn-secondary">🤝 Share</button>
                        <button onclick="apiKeysApp.removeKey('${id}')" class="btn-danger">🗑️ Remove</button>
                    </div>
                </div>
                <div class="key-details">
                    <div class="detail-row">
                        <strong>Provider:</strong> ${provider?.name || key.provider}
                    </div>
                    <div class="detail-row">
                        <strong>Added:</strong> ${new Date(key.createdAt || Date.now()).toLocaleDateString()}
                    </div>
                    ${key.lastUsed ? `<div class="detail-row"><strong>Last Used:</strong> ${new Date(key.lastUsed).toLocaleDateString()}</div>` : ''}
                    ${key.usage ? `<div class="detail-row"><strong>Usage:</strong> ${key.usage} requests</div>` : ''}
                    <div class="key-status ${key.status || 'unknown'}">
                        Status: ${(key.status || 'unknown').toUpperCase()}
                    </div>
                </div>
            </div>
        `;
    }

    renderUCANCard(id, token) {
        const isExpired = token.expiration && new Date(token.expiration) < new Date();
        const isExpiring = token.expiration && new Date(token.expiration) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        
        return `
            <div class="key-card ucan-card" data-type="ucan">
                <div class="key-header">
                    <div class="key-info">
                        <h4>🎫 ${token.name || 'UCAN Token'}</h4>
                        <span class="key-category">UCAN Token</span>
                        <span class="ucan-audience">${this.truncate(token.audience || token.issuer, 20)}</span>
                        ${token.purpose ? `<span class="key-description">${token.purpose}</span>` : ''}
                    </div>
                    <div class="key-actions">
                        <button onclick="apiKeysApp.verifyUCAN('${id}')" class="btn-secondary">✅ Verify</button>
                        <button onclick="apiKeysApp.copyUCAN('${id}')" class="btn-secondary">📋 Copy</button>
                        <button onclick="apiKeysApp.shareUCAN('${id}')" class="btn-secondary">🤝 Share</button>
                        <button onclick="apiKeysApp.renewUCAN('${id}')" class="btn-secondary">🔄 Renew</button>
                        <button onclick="apiKeysApp.removeUCAN('${id}')" class="btn-danger">🗑️ Remove</button>
                    </div>
                </div>
                <div class="key-details">
                    <div class="detail-row">
                        <strong>Issuer:</strong> ${this.truncate(token.issuer, 30)}
                    </div>
                    <div class="detail-row">
                        <strong>Audience:</strong> ${this.truncate(token.audience, 30)}
                    </div>
                    ${token.resource ? `<div class="detail-row"><strong>Resource:</strong> ${this.truncate(token.resource, 40)}</div>` : ''}
                    ${token.capabilities ? `<div class="detail-row"><strong>Capabilities:</strong> ${token.capabilities.join(', ')}</div>` : ''}
                    <div class="detail-row">
                        <strong>Created:</strong> ${new Date(token.created || Date.now()).toLocaleDateString()}
                    </div>
                    ${token.expiration ? `<div class="detail-row"><strong>Expires:</strong> ${new Date(token.expiration).toLocaleDateString()}</div>` : ''}
                    <div class="key-status ${isExpired ? 'expired' : isExpiring ? 'expiring' : 'valid'}">
                        Status: ${isExpired ? 'EXPIRED' : isExpiring ? 'EXPIRING SOON' : 'VALID'}
                    </div>
                </div>
            </div>
        `;
    }

    // UCAN Token Management
    showAddUCAN() {
        const modal = document.getElementById('add-ucan-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    hideAddUCAN() {
        const modal = document.getElementById('add-ucan-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        document.getElementById('add-ucan-form').reset();
    }

    async addUCAN() {
        const form = document.getElementById('add-ucan-form');
        const formData = new FormData(form);
        const tokenString = formData.get('token') || document.getElementById('ucan-token').value;
        const name = formData.get('name') || document.getElementById('ucan-name').value;
        const purpose = formData.get('purpose') || document.getElementById('ucan-purpose').value;
        const autoVerify = document.getElementById('auto-verify').checked;

        try {
            // Parse UCAN token (simplified implementation)
            const parsed = this.parseUCANToken(tokenString);
            
            const token = {
                id: `ucan-${Date.now()}`,
                name,
                purpose,
                token: tokenString,
                ...parsed,
                created: new Date().toISOString(),
                imported: true
            };

            this.ucanTokens.set(token.id, token);
            this.saveUCANTokens();
            this.updateStats();
            this.renderKeysList();
            this.hideAddUCAN();
            
            this.showNotification(`UCAN token "${name}" added successfully! 🎫`, 'success');

            if (autoVerify) {
                await this.verifyUCAN(token.id);
            }
        } catch (error) {
            this.showNotification('Error adding UCAN token: ' + error.message, 'error');
        }
    }

    async verifyUCAN(tokenId) {
        const token = this.ucanTokens.get(tokenId);
        if (!token) return;

        this.showNotification(`Verifying UCAN token...`, 'info');
        
        try {
            // Mock verification (in real implementation, use UCAN library)
            const isValid = this.validateUCANToken(token.token);
            const isExpired = token.expiration && new Date(token.expiration) < new Date();
            
            if (isValid && !isExpired) {
                token.status = 'valid';
                token.lastVerified = new Date().toISOString();
                this.showNotification(`UCAN token is valid! ✅`, 'success');
            } else if (isExpired) {
                token.status = 'expired';
                this.showNotification(`UCAN token has expired! ⚠️`, 'warning');
            } else {
                token.status = 'invalid';
                this.showNotification(`UCAN token is invalid! ❌`, 'error');
            }
            
            this.saveUCANTokens();
            this.renderKeysList();
            
        } catch (error) {
            token.status = 'error';
            this.saveUCANTokens();
            this.renderKeysList();
            this.showNotification(`Error verifying UCAN token: ${error.message}`, 'error');
        }
    }

    parseUCANToken(tokenString) {
        try {
            // Basic JWT-like parsing for UCAN tokens
            const parts = tokenString.split('.');
            if (parts.length < 3) throw new Error('Invalid token format');
            
            const payload = JSON.parse(atob(parts[1]));
            
            return {
                issuer: payload.iss,
                audience: payload.aud,
                expiration: payload.exp ? new Date(payload.exp * 1000) : null,
                resource: payload.att?.[0]?.with,
                capabilities: payload.att?.[0]?.can || [],
                notBefore: payload.nbf ? new Date(payload.nbf * 1000) : null
            };
        } catch (error) {
            throw new Error('Invalid UCAN token format');
        }
    }

    validateUCANToken(tokenString) {
        // Mock validation - in real implementation, verify cryptographic signature
        try {
            const parts = tokenString.split('.');
            return parts.length >= 3 && parts[2] !== '';
        } catch (error) {
            return false;
        }
    }

    truncate(str, length) {
        if (!str) return '';
        return str.length > length ? str.substring(0, length) + '...' : str;
    }

    saveUCANTokens() {
        const tokens = Array.from(this.ucanTokens.values());
        localStorage.setItem('ucan-tokens', JSON.stringify(tokens));
    }

    async loadKeys() {
        try {
            // Load from localStorage (encrypted in real implementation)
            const savedKeys = localStorage.getItem('api-keys');
            if (savedKeys) {
                const keys = JSON.parse(savedKeys);
                this.keys.clear();
                keys.forEach((key, index) => {
                    this.keys.set(key.id || `key-${index}`, key);
                });
            }
        } catch (error) {
            console.error('Error loading API keys:', error);
            this.showNotification('Failed to load API keys', 'error');
        }
    }

    async addKey() {
        const form = document.getElementById('add-key-form');
        const formData = new FormData(form);
        const providerId = formData.get('provider') || document.getElementById('key-provider').value;
        const provider = this.providers.find(p => p.id === providerId);
        
        if (!provider) {
            alert('Please select a provider');
            return;
        }

        try {
            const credentials = {};
            provider.fields.forEach(field => {
                const value = document.getElementById(`key-${field}`)?.value;
                if (value) {
                    credentials[field] = value;
                }
            });

            const key = {
                id: `${providerId}-${Date.now()}`,
                provider: providerId,
                credentials,
                description: document.getElementById('key-description')?.value || '',
                environment: document.getElementById('key-environment')?.value || 'development',
                createdAt: new Date().toISOString(),
                status: 'unknown'
            };

            // For backward compatibility, set main fields
            if (credentials.apiKey) key.apiKey = credentials.apiKey;
            if (credentials.token) key.token = credentials.token;

            this.keys.set(key.id, key);
            this.saveKeys();
            this.updateStats();
            this.renderKeysList();
            this.hideAddKey();
            
            this.showNotification(`API key for ${provider.name} added successfully`, 'success');
            
            // Auto-test if requested
            if (document.getElementById('auto-test')?.checked) {
                await this.testKey(key.id);
            }
        } catch (error) {
            this.showNotification('Error adding API key: ' + error.message, 'error');
        }
    }

    async setupStoracha() {
        const did = prompt('Enter your Storacha DID (or leave empty to generate):');
        const apiKey = prompt('Enter your Storacha API key:');
        
        if (apiKey) {
            const key = {
                id: `storacha-${Date.now()}`,
                provider: 'storacha',
                credentials: { apiKey, did: did || 'auto-generated' },
                description: 'Storacha Web3 Storage',
                environment: 'production',
                createdAt: new Date().toISOString(),
                status: 'unknown'
            };

            this.keys.set(key.id, key);
            this.saveKeys();
            this.updateStats();
            this.renderKeysList();
            
            this.showNotification('Storacha credentials added! 🗂️', 'success');
            
            // Auto-test the key
            await this.testKey(key.id);
        }
    }

    // Quick Setup Methods
    async setupOpenAI() {
        const apiKey = prompt('Enter your OpenAI API key:');
        const orgId = prompt('Enter your OpenAI Organization ID (optional):');
        
        if (apiKey) {
            const key = {
                id: `openai-${Date.now()}`,
                provider: 'openai',
                credentials: { apiKey, organizationId: orgId || '' },
                description: 'OpenAI API Access',
                environment: 'production',
                createdAt: new Date().toISOString(),
                status: 'unknown'
            };

            this.keys.set(key.id, key);
            this.saveKeys();
            this.updateStats();
            this.renderKeysList();
            
            this.showNotification('OpenAI credentials added! 🤖', 'success');
            await this.testKey(key.id);
        }
    }

    async setupAnthropic() {
        const apiKey = prompt('Enter your Anthropic API key:');
        
        if (apiKey) {
            const key = {
                id: `anthropic-${Date.now()}`,
                provider: 'anthropic',
                credentials: { apiKey },
                description: 'Anthropic Claude API Access',
                environment: 'production',
                createdAt: new Date().toISOString(),
                status: 'unknown'
            };

            this.keys.set(key.id, key);
            this.saveKeys();
            this.updateStats();
            this.renderKeysList();
            
            this.showNotification('Anthropic credentials added! 🧠', 'success');
            await this.testKey(key.id);
        }
    }

    async setupGoogleCloud() {
        const projectId = prompt('Enter your Google Cloud Project ID:');
        const keyFile = prompt('Enter your service account key JSON (paste the entire JSON):');
        const bucketName = prompt('Enter your default bucket name (optional):');
        
        if (projectId && keyFile) {
            try {
                // Validate JSON
                JSON.parse(keyFile);
                
                const key = {
                    id: `gcp-${Date.now()}`,
                    provider: 'gcp',
                    credentials: { projectId, keyFile, bucketName: bucketName || '' },
                    description: 'Google Cloud Platform Access',
                    environment: 'production',
                    createdAt: new Date().toISOString(),
                    status: 'unknown'
                };

                this.keys.set(key.id, key);
                this.saveKeys();
                this.updateStats();
                this.renderKeysList();
                
                this.showNotification('Google Cloud credentials added! 🌐', 'success');
                await this.testKey(key.id);
            } catch (error) {
                this.showNotification('Invalid JSON key file format', 'error');
            }
        }
    }

    async setupGitHub() {
        const token = prompt('Enter your GitHub Personal Access Token:');
        const username = prompt('Enter your GitHub username:');
        const enterprise = prompt('Enter your GitHub Enterprise URL (optional, for enterprise users):');
        
        if (token && username) {
            const key = {
                id: `github-${Date.now()}`,
                provider: 'github',
                credentials: { token, username, enterprise: enterprise || '' },
                description: 'GitHub API Access',
                environment: 'production',
                createdAt: new Date().toISOString(),
                status: 'unknown'
            };

            this.keys.set(key.id, key);
            this.saveKeys();
            this.updateStats();
            this.renderKeysList();
            
            this.showNotification('GitHub credentials added! 🐙', 'success');
            await this.testKey(key.id);
        }
    }

    async setupDiscord() {
        const botToken = prompt('Enter your Discord Bot Token:');
        const clientId = prompt('Enter your Discord Application Client ID:');
        
        if (botToken && clientId) {
            const key = {
                id: `discord-${Date.now()}`,
                provider: 'discord',
                credentials: { botToken, clientId },
                description: 'Discord Bot Access',
                environment: 'production',
                createdAt: new Date().toISOString(),
                status: 'unknown'
            };

            this.keys.set(key.id, key);
            this.saveKeys();
            this.updateStats();
            this.renderKeysList();
            
            this.showNotification('Discord bot credentials added! 💬', 'success');
            await this.testKey(key.id);
        }
    }

    async setupWeb3Bundle() {
        const confirmSetup = confirm('This will help you set up multiple Web3 credentials. Continue?');
        if (!confirmSetup) return;

        const networks = [
            { id: 'ethereum', name: 'Ethereum' },
            { id: 'polygon', name: 'Polygon' },
            { id: 'arbitrum', name: 'Arbitrum' },
            { id: 'optimism', name: 'Optimism' },
            { id: 'base', name: 'Base' }
        ];

        for (const network of networks) {
            const setup = confirm(`Set up ${network.name}?`);
            if (setup) {
                const rpcUrl = prompt(`Enter ${network.name} RPC URL:`, 
                    network.id === 'ethereum' ? 'https://mainnet.infura.io/v3/YOUR_KEY' :
                    network.id === 'polygon' ? 'https://polygon-mainnet.infura.io/v3/YOUR_KEY' :
                    network.id === 'arbitrum' ? 'https://arbitrum-mainnet.infura.io/v3/YOUR_KEY' :
                    network.id === 'optimism' ? 'https://optimism-mainnet.infura.io/v3/YOUR_KEY' :
                    'https://mainnet.base.org'
                );
                const privateKey = prompt(`Enter ${network.name} private key (optional, for transactions):`);
                
                if (rpcUrl) {
                    const key = {
                        id: `${network.id}-${Date.now()}`,
                        provider: network.id,
                        credentials: { rpcUrl, privateKey: privateKey || '' },
                        description: `${network.name} Network Access`,
                        environment: 'production',
                        createdAt: new Date().toISOString(),
                        status: 'unknown'
                    };

                    this.keys.set(key.id, key);
                }
            }
        }

        this.saveKeys();
        this.updateStats();
        this.renderKeysList();
        this.showNotification('Web3 bundle configured! ⛓️', 'success');
    }

    async setupDeveloperPack() {
        const confirmSetup = confirm('This will set up common developer tools (GitHub, NPM, Docker Hub, etc.). Continue?');
        if (!confirmSetup) return;

        const services = [
            { provider: 'github', name: 'GitHub', fields: { token: 'GitHub Token', username: 'Username' } },
            { provider: 'npm', name: 'NPM', fields: { token: 'NPM Token' } },
            { provider: 'dockerhub', name: 'Docker Hub', fields: { username: 'Username', token: 'Access Token' } },
            { provider: 'vercel', name: 'Vercel', fields: { token: 'Vercel Token' } },
            { provider: 'netlify', name: 'Netlify', fields: { token: 'Netlify Token' } }
        ];

        for (const service of services) {
            const setup = confirm(`Set up ${service.name}?`);
            if (setup) {
                const credentials = {};
                let hasCredentials = false;

                for (const [field, label] of Object.entries(service.fields)) {
                    const value = prompt(`Enter ${service.name} ${label}:`);
                    if (value) {
                        credentials[field] = value;
                        hasCredentials = true;
                    }
                }

                if (hasCredentials) {
                    const key = {
                        id: `${service.provider}-${Date.now()}`,
                        provider: service.provider,
                        credentials,
                        description: `${service.name} Developer Access`,
                        environment: 'production',
                        createdAt: new Date().toISOString(),
                        status: 'unknown'
                    };

                    this.keys.set(key.id, key);
                }
            }
        }

        this.saveKeys();
        this.updateStats();
        this.renderKeysList();
        this.showNotification('Developer pack configured! 📦', 'success');
    }

    async importFromEnv() {
        const envContent = prompt('Paste your .env file content or environment variables:');
        
        if (!envContent) return;

        try {
            const lines = envContent.split('\n');
            let imported = 0;

            // Common API key patterns
            const patterns = {
                'OPENAI_API_KEY': { provider: 'openai', field: 'apiKey' },
                'ANTHROPIC_API_KEY': { provider: 'anthropic', field: 'apiKey' },
                'HUGGING_FACE_HUB_TOKEN': { provider: 'huggingface', field: 'apiKey' },
                'GITHUB_TOKEN': { provider: 'github', field: 'token' },
                'AWS_ACCESS_KEY_ID': { provider: 'aws', field: 'accessKeyId' },
                'AWS_SECRET_ACCESS_KEY': { provider: 'aws', field: 'secretAccessKey' },
                'DISCORD_TOKEN': { provider: 'discord', field: 'botToken' },
                'STRIPE_SECRET_KEY': { provider: 'stripe', field: 'secretKey' },
                'TWILIO_AUTH_TOKEN': { provider: 'twilio', field: 'authToken' }
            };

            const providerCredentials = {};

            lines.forEach(line => {
                const [key, value] = line.split('=');
                if (key && value && patterns[key.trim()]) {
                    const pattern = patterns[key.trim()];
                    if (!providerCredentials[pattern.provider]) {
                        providerCredentials[pattern.provider] = {};
                    }
                    providerCredentials[pattern.provider][pattern.field] = value.trim().replace(/['"]/g, '');
                }
            });

            // Create keys for each provider
            Object.entries(providerCredentials).forEach(([providerId, credentials]) => {
                const provider = this.providers.find(p => p.id === providerId);
                if (provider) {
                    const key = {
                        id: `${providerId}-env-${Date.now()}`,
                        provider: providerId,
                        credentials,
                        description: `Imported from .env - ${provider.name}`,
                        environment: 'development',
                        createdAt: new Date().toISOString(),
                        status: 'unknown'
                    };

                    this.keys.set(key.id, key);
                    imported++;
                }
            });

            this.saveKeys();
            this.updateStats();
            this.renderKeysList();
            
            this.showNotification(`Imported ${imported} API keys from environment! 📥`, 'success');
        } catch (error) {
            this.showNotification('Error parsing environment variables: ' + error.message, 'error');
        }
    }

    async setupHuggingFace() {
        const apiKey = prompt('Enter your Hugging Face API key:');
        const orgId = prompt('Enter your organization ID (optional):');
        
        if (apiKey) {
            const key = {
                id: `huggingface-${Date.now()}`,
                provider: 'huggingface',
                credentials: { apiKey, organizationId: orgId || '' },
                description: 'Hugging Face Hub Access',
                environment: 'production',
                createdAt: new Date().toISOString(),
                status: 'unknown'
            };

            this.keys.set(key.id, key);
            this.saveKeys();
            this.updateStats();
            this.renderKeysList();
            
            this.showNotification('Hugging Face credentials added! 🤗', 'success');
            await this.testKey(key.id);
        }
    }

    async setupAWS() {
        const accessKeyId = prompt('Enter your AWS Access Key ID:');
        const secretAccessKey = prompt('Enter your AWS Secret Access Key:');
        const region = prompt('Enter your preferred AWS region (e.g., us-east-1):', 'us-east-1');
        
        if (accessKeyId && secretAccessKey) {
            const key = {
                id: `aws-${Date.now()}`,
                provider: 'aws',
                credentials: { accessKeyId, secretAccessKey, region },
                description: 'AWS S3 Storage',
                environment: 'production',
                createdAt: new Date().toISOString(),
                status: 'unknown'
            };

            this.keys.set(key.id, key);
            this.saveKeys();
            this.updateStats();
            this.renderKeysList();
            
            this.showNotification('AWS credentials added! ☁️', 'success');
            await this.testKey(key.id);
        }
    }

    async generateUCANPair() {
        try {
            // Generate a mock DID and UCAN token pair
            const issuerDID = `did:key:z6Mk${Math.random().toString(36).substr(2, 20)}`;
            const audienceDID = `did:key:z6Mk${Math.random().toString(36).substr(2, 20)}`;
            
            const capabilities = ['storage/add', 'storage/remove', 'storage/list'];
            const expiration = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
            
            const token = {
                id: `generated-${Date.now()}`,
                name: 'Generated UCAN Pair',
                purpose: 'storage',
                issuer: issuerDID,
                audience: audienceDID,
                resource: 'storage://*',
                capabilities,
                expiration,
                created: new Date().toISOString(),
                token: this.generateMockUCANToken(issuerDID, audienceDID, capabilities, expiration)
            };

            this.ucanTokens.set(token.id, token);
            this.saveUCANTokens();
            this.updateStats();
            this.renderKeysList();
            
            this.showNotification('UCAN token pair generated! 🔐', 'success');
            
            // Show the generated DIDs
            alert(`Generated UCAN Pair:\n\nIssuer DID: ${issuerDID}\nAudience DID: ${audienceDID}\n\nToken has been added to your collection.`);
            
        } catch (error) {
            this.showNotification('Error generating UCAN pair: ' + error.message, 'error');
        }
    }

    generateMockUCANToken(issuer, audience, capabilities, expiration) {
        const header = { alg: 'EdDSA', typ: 'JWT' };
        const payload = {
            iss: issuer,
            aud: audience,
            att: [{
                can: capabilities,
                with: 'storage://*'
            }],
            exp: Math.floor(expiration.getTime() / 1000),
            nbf: Math.floor(Date.now() / 1000)
        };
        
        return `mock.${btoa(JSON.stringify(header))}.${btoa(JSON.stringify(payload))}.signature`;
    }

    // Enhanced Key Management
    async shareKey(keyId) {
        const key = this.keys.get(keyId);
        if (!key) return;

        const recipient = prompt('Enter recipient DID or email:');
        const permissions = prompt('Enter permissions (read, write, admin):', 'read');
        const expiration = prompt('Access expires in (1d, 1w, 1m, never):', '1w');
        
        if (recipient) {
            try {
                // Create a sharing record
                const shareRecord = {
                    keyId,
                    recipient,
                    permissions: permissions.split(',').map(p => p.trim()),
                    expiration: expiration === 'never' ? null : this.calculateExpiration(expiration),
                    created: new Date().toISOString(),
                    sharedBy: 'me' // In real implementation, use actual user ID
                };
                
                // Store sharing record
                const existingShares = JSON.parse(localStorage.getItem('shared-keys') || '[]');
                existingShares.push(shareRecord);
                localStorage.setItem('shared-keys', JSON.stringify(existingShares));
                
                this.showNotification(`Key shared with ${recipient}! 🤝`, 'success');
            } catch (error) {
                this.showNotification('Error sharing key: ' + error.message, 'error');
            }
        }
    }

    async bulkTest() {
        this.showNotification('Testing all API keys...', 'info');
        
        let tested = 0;
        let valid = 0;
        let invalid = 0;
        
        for (const [id, key] of this.keys.entries()) {
            try {
                await this.testKey(id, false); // Silent test
                tested++;
                if (key.status === 'valid') valid++;
                else invalid++;
            } catch (error) {
                invalid++;
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        this.showNotification(`Bulk test complete! ${valid} valid, ${invalid} invalid out of ${tested} keys.`, 'info');
        this.updateStats();
        this.renderKeysList();
    }

    calculateExpiration(duration) {
        const now = new Date();
        const multipliers = {
            '1d': 24 * 60 * 60 * 1000,
            '1w': 7 * 24 * 60 * 60 * 1000,
            '1m': 30 * 24 * 60 * 60 * 1000
        };
        
        return new Date(now.getTime() + (multipliers[duration] || multipliers['1w']));
    }

    // Search and Filter
    filterKeys() {
        const searchTerm = document.getElementById('key-search').value.toLowerCase();
        const statusFilter = document.getElementById('status-filter').value;
        
        const cards = document.querySelectorAll('.key-card');
        cards.forEach(card => {
            const text = card.textContent.toLowerCase();
            const status = card.querySelector('.key-status').textContent.toLowerCase();
            
            const matchesSearch = !searchTerm || text.includes(searchTerm);
            const matchesStatus = !statusFilter || status.includes(statusFilter);
            
            card.style.display = matchesSearch && matchesStatus ? 'block' : 'none';
        });
    }

    clearSearch() {
        document.getElementById('key-search').value = '';
        this.filterKeys();
    }

    sortKeys() {
        const sortOrder = document.getElementById('sort-order').value;
        // Implementation would sort the keys and re-render
        this.renderKeysList();
    }

    maskKey(key) {
        if (!key) return '****';
        if (key.length <= 8) return '****';
        return key.substring(0, 4) + '*'.repeat(Math.max(4, key.length - 8)) + key.substring(key.length - 4);
    }

    showAddKey() {
        const modal = document.getElementById('add-key-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    hideAddKey() {
        const modal = document.getElementById('add-key-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        document.getElementById('add-key-form').reset();
        document.getElementById('key-fields').innerHTML = '';
    }

    updateKeyForm() {
        const providerId = document.getElementById('key-provider').value;
        const provider = this.providers.find(p => p.id === providerId);
        const fieldsContainer = document.getElementById('key-fields');
        
        if (!provider) {
            fieldsContainer.innerHTML = '';
            return;
        }

        const fieldsHtml = provider.fields.map(field => {
            const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            const type = field.toLowerCase().includes('secret') || field.toLowerCase().includes('key') || field.toLowerCase().includes('token') ? 'password' : 'text';
            
            return `
                <div class="form-group">
                    <label for="key-${field}">${label}:</label>
                    <input type="${type}" id="key-${field}" name="${field}" required>
                </div>
            `;
        }).join('');

        fieldsContainer.innerHTML = fieldsHtml;
    }

    async addKey() {
        const form = document.getElementById('add-key-form');
        const formData = new FormData(form);
        const providerId = formData.get('provider') || document.getElementById('key-provider').value;
        const provider = this.providers.find(p => p.id === providerId);
        
        if (!provider) {
            alert('Please select a provider');
            return;
        }

        try {
            const credentials = {};
            provider.fields.forEach(field => {
                const value = document.getElementById(`key-${field}`)?.value;
                if (value) {
                    credentials[field] = value;
                }
            });

            const key = {
                id: `${providerId}-${Date.now()}`,
                provider: providerId,
                credentials,
                description: document.getElementById('key-description')?.value || '',
                createdAt: new Date().toISOString(),
                status: 'unknown'
            };

            // For backward compatibility, set main fields
            if (credentials.apiKey) key.apiKey = credentials.apiKey;
            if (credentials.token) key.token = credentials.token;

            this.keys.set(key.id, key);
            this.saveKeys();
            this.renderKeysList();
            this.hideAddKey();
            
            this.showNotification(`API key for ${provider.name} added successfully`, 'success');
        } catch (error) {
            this.showNotification('Error adding API key: ' + error.message, 'error');
        }
    }

    async testKey(keyId) {
        const key = this.keys.get(keyId);
        if (!key) {
            this.showNotification('Key not found', 'error');
            return;
        }

        this.updateKeyStatus(keyId, 'testing');
        
        try {
            let isValid = false;
            
            switch (key.provider) {
                case 'openai':
                    isValid = await this.testOpenAI(key.credentials);
                    break;
                case 'anthropic':
                    isValid = await this.testAnthropic(key.credentials);
                    break;
                case 'aws':
                    isValid = await this.testAWS(key.credentials);
                    break;
                case 'gcp':
                    isValid = await this.testGoogleCloud(key.credentials);
                    break;
                case 'github':
                    isValid = await this.testGitHub(key.credentials);
                    break;
                case 'discord':
                    isValid = await this.testDiscord(key.credentials);
                    break;
                case 'stripe':
                    isValid = await this.testStripe(key.credentials);
                    break;
                case 'huggingface':
                    isValid = await this.testHuggingFace(key.credentials);
                    break;
                case 'twilio':
                    isValid = await this.testTwilio(key.credentials);
                    break;
                case 'mailgun':
                    isValid = await this.testMailgun(key.credentials);
                    break;
                case 'sendgrid':
                    isValid = await this.testSendGrid(key.credentials);
                    break;
                case 'ethereum':
                case 'polygon':
                case 'arbitrum':
                case 'optimism':
                case 'base':
                    isValid = await this.testWeb3Network(key.credentials);
                    break;
                default:
                    // Generic test - just check if required fields are present
                    const provider = this.providers.find(p => p.id === key.provider);
                    if (provider) {
                        isValid = provider.fields.every(field => 
                            field.optional || (key.credentials && key.credentials[field.name])
                        );
                    }
            }
            
            this.updateKeyStatus(keyId, isValid ? 'valid' : 'invalid');
            this.showNotification(
                isValid ? 'API key is valid ✓' : 'API key test failed ✗', 
                isValid ? 'success' : 'error'
            );
            
        } catch (error) {
            this.updateKeyStatus(keyId, 'error');
            this.showNotification('Test failed: ' + error.message, 'error');
        }
    }

    // Individual Provider Test Methods
    async testOpenAI(credentials) {
        if (!credentials.apiKey) return false;
        
        try {
            const response = await fetch('https://api.openai.com/v1/models', {
                headers: {
                    'Authorization': `Bearer ${credentials.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.ok;
        } catch (error) {
            console.error('OpenAI test failed:', error);
            return false;
        }
    }

    async testAnthropic(credentials) {
        if (!credentials.apiKey) return false;
        
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': credentials.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'claude-3-haiku-20240307',
                    max_tokens: 1,
                    messages: [{ role: 'user', content: 'test' }]
                })
            });
            return response.status !== 401 && response.status !== 403;
        } catch (error) {
            console.error('Anthropic test failed:', error);
            return false;
        }
    }

    async testAWS(credentials) {
        if (!credentials.accessKeyId || !credentials.secretAccessKey) return false;
        
        try {
            // Simple STS GetCallerIdentity call to verify credentials
            const region = credentials.region || 'us-east-1';
            const response = await fetch(`https://sts.${region}.amazonaws.com/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-amz-json-1.1',
                    'X-Amz-Target': 'AWSSecurityTokenServiceV20110615.GetCallerIdentity'
                },
                body: JSON.stringify({})
            });
            return response.ok;
        } catch (error) {
            console.error('AWS test failed:', error);
            return false;
        }
    }

    async testGoogleCloud(credentials) {
        if (!credentials.projectId || !credentials.keyFile) return false;
        
        try {
            // For browser environment, we can't easily test GCP credentials
            // Instead, validate the JSON structure
            const keyData = JSON.parse(credentials.keyFile);
            return keyData.type === 'service_account' && keyData.private_key && keyData.client_email;
        } catch (error) {
            console.error('GCP test failed:', error);
            return false;
        }
    }

    async testGitHub(credentials) {
        if (!credentials.token) return false;
        
        try {
            const baseUrl = credentials.enterprise || 'https://api.github.com';
            const response = await fetch(`${baseUrl}/user`, {
                headers: {
                    'Authorization': `token ${credentials.token}`,
                    'User-Agent': 'SwissKnife-Desktop'
                }
            });
            return response.ok;
        } catch (error) {
            console.error('GitHub test failed:', error);
            return false;
        }
    }

    async testDiscord(credentials) {
        if (!credentials.botToken) return false;
        
        try {
            const response = await fetch('https://discord.com/api/v10/users/@me', {
                headers: {
                    'Authorization': `Bot ${credentials.botToken}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.ok;
        } catch (error) {
            console.error('Discord test failed:', error);
            return false;
        }
    }

    async testStripe(credentials) {
        if (!credentials.secretKey) return false;
        
        try {
            const response = await fetch('https://api.stripe.com/v1/account', {
                headers: {
                    'Authorization': `Bearer ${credentials.secretKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            return response.ok;
        } catch (error) {
            console.error('Stripe test failed:', error);
            return false;
        }
    }

    async testHuggingFace(credentials) {
        if (!credentials.apiKey) return false;
        
        try {
            const response = await fetch('https://huggingface.co/api/whoami-v2', {
                headers: {
                    'Authorization': `Bearer ${credentials.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.ok;
        } catch (error) {
            console.error('HuggingFace test failed:', error);
            return false;
        }
    }

    async testTwilio(credentials) {
        if (!credentials.accountSid || !credentials.authToken) return false;
        
        try {
            const auth = btoa(`${credentials.accountSid}:${credentials.authToken}`);
            const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}.json`, {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            return response.ok;
        } catch (error) {
            console.error('Twilio test failed:', error);
            return false;
        }
    }

    async testMailgun(credentials) {
        if (!credentials.apiKey || !credentials.domain) return false;
        
        try {
            const auth = btoa(`api:${credentials.apiKey}`);
            const response = await fetch(`https://api.mailgun.net/v3/${credentials.domain}`, {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            return response.ok;
        } catch (error) {
            console.error('Mailgun test failed:', error);
            return false;
        }
    }

    async testSendGrid(credentials) {
        if (!credentials.apiKey) return false;
        
        try {
            const response = await fetch('https://api.sendgrid.com/v3/user/profile', {
                headers: {
                    'Authorization': `Bearer ${credentials.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.ok;
        } catch (error) {
            console.error('SendGrid test failed:', error);
            return false;
        }
    }

    async testWeb3Network(credentials) {
        if (!credentials.rpcUrl) return false;
        
        try {
            const response = await fetch(credentials.rpcUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_blockNumber',
                    params: [],
                    id: 1
                })
            });
            const data = await response.json();
            return response.ok && data.result;
        } catch (error) {
            console.error('Web3 network test failed:', error);
            return false;
        }
    }

    updateKeyStatus(keyId, status) {
        const key = this.keys.get(keyId);
        if (key) {
            key.status = status;
            if (status === 'valid') {
                key.lastUsed = new Date().toISOString();
            }
            this.saveKeys();
            this.renderKeysList();
        }
    }

    async removeKey(keyId) {
        const key = this.keys.get(keyId);
        if (!key) return;

        const provider = this.providers.find(p => p.id === key.provider);
        
        if (confirm(`Are you sure you want to remove the ${provider?.name || key.provider} API key?`)) {
            this.keys.delete(keyId);
            this.saveKeys();
            this.renderKeysList();
            this.showNotification('API key removed', 'info');
        }
    }

    async exportKeys() {
        try {
            const keys = Array.from(this.keys.values());
            const data = JSON.stringify(keys, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `swissknife-api-keys-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showNotification('API keys exported successfully', 'success');
        } catch (error) {
            this.showNotification('Error exporting API keys: ' + error.message, 'error');
        }
    }

    async importKeys() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const keys = JSON.parse(text);
                
                if (!Array.isArray(keys)) {
                    throw new Error('Invalid file format');
                }
                
                let imported = 0;
                keys.forEach(key => {
                    if (key.provider && (key.apiKey || key.token || key.credentials)) {
                        const id = key.id || `${key.provider}-${Date.now()}-${imported}`;
                        this.keys.set(id, { ...key, id });
                        imported++;
                    }
                });
                
                this.saveKeys();
                this.renderKeysList();
                this.showNotification(`Imported ${imported} API keys`, 'success');
                
            } catch (error) {
                this.showNotification('Error importing API keys: ' + error.message, 'error');
            }
        };
        
        input.click();
    }

    // Export/Import Methods
    exportKeys() {
        const exportData = {
            version: '2.0',
            exported: new Date().toISOString(),
            keys: Array.from(this.keys.values()).map(key => ({
                ...key,
                // Optionally encrypt sensitive data before export
                credentials: this.encryptCredentials(key.credentials)
            }))
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `api-keys-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showNotification('API keys exported successfully! 📤', 'success');
    }

    async importKeys() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const importData = JSON.parse(text);

                if (!importData.keys || !Array.isArray(importData.keys)) {
                    throw new Error('Invalid import file format');
                }

                let imported = 0;
                for (const keyData of importData.keys) {
                    // Generate new ID to avoid conflicts
                    const newKey = {
                        ...keyData,
                        id: `${keyData.provider}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        credentials: this.decryptCredentials(keyData.credentials),
                        importedAt: new Date().toISOString()
                    };

                    this.keys.set(newKey.id, newKey);
                    imported++;
                }

                this.saveKeys();
                this.updateStats();
                this.renderKeysList();

                this.showNotification(`Imported ${imported} API keys successfully! 📥`, 'success');
            } catch (error) {
                this.showNotification('Import failed: ' + error.message, 'error');
            }
        };

        input.click();
    }

    encryptCredentials(credentials) {
        // Simple base64 encoding for demo - in production, use proper encryption
        try {
            return btoa(JSON.stringify(credentials));
        } catch (error) {
            return credentials;
        }
    }

    decryptCredentials(encryptedCredentials) {
        // Simple base64 decoding for demo - in production, use proper decryption
        try {
            if (typeof encryptedCredentials === 'string') {
                return JSON.parse(atob(encryptedCredentials));
            }
            return encryptedCredentials;
        } catch (error) {
            return encryptedCredentials;
        }
    }

    // Bulk Operations
    async testAllKeys() {
        const confirmTest = confirm(`This will test all ${this.keys.size} API keys. This may take some time. Continue?`);
        if (!confirmTest) return;

        this.showNotification('Testing all API keys... ⏳', 'info');
        
        let tested = 0;
        let valid = 0;

        for (const [keyId] of this.keys) {
            try {
                await this.testKey(keyId);
                tested++;
                
                const key = this.keys.get(keyId);
                if (key.status === 'valid') valid++;
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`Failed to test key ${keyId}:`, error);
            }
        }

        this.showNotification(`Tested ${tested} keys, ${valid} valid ✅`, 'success');
    }

    removeInvalidKeys() {
        const invalidKeys = Array.from(this.keys.entries())
            .filter(([_, key]) => key.status === 'invalid' || key.status === 'error');

        if (invalidKeys.length === 0) {
            this.showNotification('No invalid keys found', 'info');
            return;
        }

        const confirmRemove = confirm(`Remove ${invalidKeys.length} invalid API keys?`);
        if (!confirmRemove) return;

        invalidKeys.forEach(([keyId]) => {
            this.keys.delete(keyId);
        });

        this.saveKeys();
        this.updateStats();
        this.renderKeysList();

        this.showNotification(`Removed ${invalidKeys.length} invalid keys 🗑️`, 'success');
    }

    duplicateKey(keyId) {
        const originalKey = this.keys.get(keyId);
        if (!originalKey) return;

        const newKey = {
            ...originalKey,
            id: `${originalKey.provider}-copy-${Date.now()}`,
            description: `Copy of ${originalKey.description}`,
            createdAt: new Date().toISOString(),
            status: 'unknown'
        };

        this.keys.set(newKey.id, newKey);
        this.saveKeys();
        this.updateStats();
        this.renderKeysList();

        this.showNotification('API key duplicated successfully! 📋', 'success');
    }

    copyKey(keyId) {
        const key = this.keys.get(keyId);
        if (!key) return;

        const keyValue = key.apiKey || key.token || Object.values(key.credentials || {})[0];
        
        try {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(keyValue);
                this.showNotification('API key copied to clipboard', 'success');
            } else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = keyValue;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                this.showNotification('API key copied to clipboard', 'success');
            }
        } catch (error) {
            this.showNotification('Failed to copy API key', 'error');
        }
    }

    saveKeys() {
        // In a real implementation, this should be encrypted
        const keys = Array.from(this.keys.values());
        localStorage.setItem('api-keys', JSON.stringify(keys));
    }

    showNotification(message, type = 'info') {
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }
}

// Create global instance
const apiKeysApp = new APIKeysApp();
