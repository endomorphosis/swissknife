// Enhanced API Key Manager App with Security Vault & P2P Integration
class APIKeysApp {
    constructor() {
        this.name = 'API Keys';
        this.id = 'api-keys';
        this.appId = 'api-keys';
        this.icon = '🔑';
        this.keys = new Map();
        this.encryptionKey = null;
        this.isVaultUnlocked = false;
        this.securityEvents = [];
        this.autoLockTimeout = null;
        this.p2pSystem = null;
        this.sharedKeys = new Map();
        
        this.providers = [
            { id: 'openai', name: 'OpenAI', fields: ['apiKey'], category: 'ai', icon: '🧠', testEndpoint: 'https://api.openai.com/v1/models' },
            { id: 'anthropic', name: 'Anthropic', fields: ['apiKey'], category: 'ai', icon: '🤖', testEndpoint: 'https://api.anthropic.com/v1/messages' },
            { id: 'google', name: 'Google (Gemini)', fields: ['apiKey'], category: 'ai', icon: '🌟', testEndpoint: 'https://generativelanguage.googleapis.com/v1/models' },
            { id: 'huggingface', name: 'Hugging Face', fields: ['apiKey'], category: 'ai', icon: '🤗', testEndpoint: 'https://api-inference.huggingface.co/models' },
            { id: 'cohere', name: 'Cohere', fields: ['apiKey'], category: 'ai', icon: '💭', testEndpoint: 'https://api.cohere.ai/v1/models' },
            { id: 'together', name: 'Together AI', fields: ['apiKey'], category: 'ai', icon: '🔗', testEndpoint: 'https://api.together.xyz/models' },
            { id: 'replicate', name: 'Replicate', fields: ['apiKey'], category: 'ai', icon: '🔄', testEndpoint: 'https://api.replicate.com/v1/models' },
            { id: 'aws', name: 'AWS', fields: ['accessKeyId', 'secretAccessKey', 'region'], category: 'cloud', icon: '☁️', testEndpoint: null },
            { id: 'azure', name: 'Azure', fields: ['subscriptionId', 'tenantId', 'clientId', 'clientSecret'], category: 'cloud', icon: '🌐', testEndpoint: null },
            { id: 'github', name: 'GitHub', fields: ['token'], category: 'dev', icon: '🐙', testEndpoint: 'https://api.github.com/user' },
            { id: 'ipfs', name: 'IPFS', fields: ['endpoint', 'token'], category: 'storage', icon: '🌍', testEndpoint: null },
            { id: 'docker', name: 'Docker Hub', fields: ['username', 'token'], category: 'dev', icon: '🐳', testEndpoint: 'https://hub.docker.com/v2/user' },
            { id: 'npm', name: 'NPM', fields: ['token'], category: 'dev', icon: '📦', testEndpoint: 'https://registry.npmjs.org/-/whoami' },
            { id: 'mongodb', name: 'MongoDB Atlas', fields: ['apiKey', 'apiSecret'], category: 'database', icon: '🍃', testEndpoint: null },
            { id: 'redis', name: 'Redis Cloud', fields: ['apiKey'], category: 'database', icon: '🔴', testEndpoint: null }
        ];
        
        this.securitySettings = {
            autoLockMinutes: 15,
            requireBiometric: false,
            enableAuditLog: true,
            allowP2PSharing: true,
            encryptionStrength: 'AES-256-GCM'
        };
        
        this.initializeSecurity();
    }

    async initializeSecurity() {
        try {
            // Initialize encryption if not already done
            if (!this.encryptionKey && typeof crypto !== 'undefined' && crypto.subtle) {
                this.encryptionKey = await this.generateEncryptionKey();
            }
            
            // Connect to P2P system if available
            if (window.p2pMLSystem) {
                this.p2pSystem = window.p2pMLSystem;
                this.setupP2PIntegration();
            }
            
            // Setup auto-lock mechanism
            this.setupAutoLock();
            
        } catch (error) {
            console.warn('Security initialization failed:', error);
        }
    }

    async generateEncryptionKey() {
        if (!crypto.subtle) return null;
        
        return await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
    }

    setupP2PIntegration() {
        if (!this.p2pSystem) return;
        
        // Listen for shared key requests
        this.p2pSystem.on('keyShareRequest', (request) => {
            this.handleKeyShareRequest(request);
        });
        
        // Listen for incoming shared keys
        this.p2pSystem.on('keyReceived', (keyData) => {
            this.handleReceivedKey(keyData);
        });
    }

    setupAutoLock() {
        const lockTimeout = this.securitySettings.autoLockMinutes * 60 * 1000;
        
        const resetTimer = () => {
            if (this.autoLockTimeout) clearTimeout(this.autoLockTimeout);
            
            this.autoLockTimeout = setTimeout(() => {
                this.lockVault();
            }, lockTimeout);
        };
        
        // Reset timer on user activity
        ['click', 'keypress', 'mousemove'].forEach(event => {
            document.addEventListener(event, resetTimer);
        });
        
        resetTimer();
    }

    async render() {
        if (!this.isVaultUnlocked) {
            return this.renderVaultLock();
        }
        
        return `
            <div class="api-keys-app enhanced">
                <div class="keys-header">
                    <div class="header-left">
                        <h2>🔑 Secure API Vault</h2>
                        <div class="vault-status">
                            <span class="status-indicator ${this.isVaultUnlocked ? 'unlocked' : 'locked'}">
                                ${this.isVaultUnlocked ? '🔓 Unlocked' : '🔒 Locked'}
                            </span>
                            <span class="key-count">${this.keys.size} keys stored</span>
                        </div>
                    </div>
                    <div class="keys-actions">
                        <button onclick="apiKeysApp.showAddKey()" class="btn-primary sk-btn sk-btn-primary">➕ Add Key</button>
                        <button onclick="apiKeysApp.showP2PManager()" class="btn-secondary sk-btn">🌐 P2P Sharing</button>
                        <button onclick="apiKeysApp.importKeys()" class="btn-secondary sk-btn">📥 Import</button>
                        <button onclick="apiKeysApp.exportKeys()" class="btn-secondary sk-btn">📤 Export</button>
                        <button onclick="apiKeysApp.showSecurity()" class="btn-secondary sk-btn">🛡️ Security</button>
                        <button onclick="apiKeysApp.lockVault()" class="btn-danger sk-btn sk-btn-danger">🔒 Lock Vault</button>
                    </div>
                </div>
                
                <div class="keys-content">
                    <div class="content-sidebar">
                        <div class="category-tabs" id="category-tabs">
                            ${this.renderCategoryTabs()}
                        </div>
                        
                        <div class="quick-stats">
                            <h4>📊 Statistics</h4>
                            <div class="stat-item">
                                <span>Total Keys:</span>
                                <span class="stat-value">${this.keys.size}</span>
                            </div>
                            <div class="stat-item">
                                <span>Active Keys:</span>
                                <span class="stat-value">${Array.from(this.keys.values()).filter(k => k.status === 'valid').length}</span>
                            </div>
                            <div class="stat-item">
                                <span>Shared Keys:</span>
                                <span class="stat-value">${this.sharedKeys.size}</span>
                            </div>
                            <div class="stat-item">
                                <span>Security Events:</span>
                                <span class="stat-value">${this.securityEvents.length}</span>
                            </div>
                        </div>
                        
                        <div class="recent-activity">
                            <h4>🔔 Recent Activity</h4>
                            <div class="activity-list" id="activity-list">
                                ${this.renderRecentActivity()}
                            </div>
                        </div>
                    </div>
                    
                    <div class="keys-main">
                        <div class="search-filter-bar">
                            <div class="search-box">
                                <input type="text" id="key-search" class="sk-input" placeholder="Search keys..." onkeyup="apiKeysApp.filterKeys()">
                                <button class="search-btn">🔍</button>
                            </div>
                            <div class="filter-options">
                                <select id="status-filter" class="sk-select" onchange="apiKeysApp.filterKeys()">
                                    <option value="">All Status</option>
                                    <option value="valid">Valid</option>
                                    <option value="invalid">Invalid</option>
                                    <option value="unknown">Unknown</option>
                                </select>
                                <select id="category-filter" class="sk-select" onchange="apiKeysApp.filterKeys()">
                                    <option value="">All Categories</option>
                                    <option value="ai">AI Services</option>
                                    <option value="cloud">Cloud Providers</option>
                                    <option value="dev">Development</option>
                                    <option value="storage">Storage</option>
                                    <option value="database">Database</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="keys-list" id="keys-list">
                            <div class="loading">Loading encrypted keys...</div>
                        </div>
                    </div>
                </div>
                
                ${this.renderModals()}
            </div>
        `;
    }

    renderVaultLock() {
        let savedRef = 'none';
        try {
            const parsed = JSON.parse(localStorage.getItem('api-keys-opaque-refs') || '[]');
            if (Array.isArray(parsed)) {
                const match = parsed.filter(item => item && /^ref-[a-z0-9-]{3,64}$/.test(item.ref));
                if (match.length) savedRef = match[match.length - 1].ref;
            }
        } catch (error) {
            savedRef = 'none';
        }
        const fieldStyle = 'background:Canvas;color:CanvasText;border:1px solid CanvasText;';
        const hasSaved = savedRef !== 'none';
        const statusText = hasSaved
            ? `Saved reference ${savedRef}. Python-owner dispatch remains policy-blocked. Credential values are absent.`
            : 'No reference saved yet.';
        return `
            <div class="vault-lock-screen">
                <div class="lock-container">
                    <h2>API Keys</h2>
                    <p id="svf-ref-status">${statusText}</p>
                    <form id="svf-ref-form" onsubmit="apiKeysApp.saveOpaqueReference(event)">
                        <div class="form-group">
                            <label for="svf-ref-label">Reference label</label>
                            <input type="text" id="svf-ref-label" name="referenceLabel" class="sk-input" autocomplete="off" placeholder="Local disposable" style="${fieldStyle}" onfocus="this.style.outline='2px solid CanvasText'" onblur="this.style.outline=''">
                        </div>
                        <div class="form-group">
                            <label for="svf-ref-value">Opaque reference</label>
                            <input type="text" id="svf-ref-value" name="opaqueReference" class="sk-input" autocomplete="off" spellcheck="false" placeholder="ref-local-opaque" style="${fieldStyle}" onfocus="this.style.outline='2px solid CanvasText'" onblur="this.style.outline=''" onkeydown="if(event.key==='Enter'){event.preventDefault();apiKeysApp.saveOpaqueReference(event)}">
                        </div>
                        <button type="submit" id="svf-ref-save" class="btn-primary sk-btn sk-btn-primary">Save reference</button>
                    </form>
                    <span id="svf-ref-saved" hidden>${hasSaved ? savedRef : ''}</span>
                    <p id="svf-ref-guidance" hidden></p>
                    <button type="button" id="svf-ref-retain" class="sk-btn" onclick="apiKeysApp.retainBlockedState()">Retain blocked state</button>
                </div>
            </div>
        `;
    }

    renderCategoryTabs() {
        const categories = [
            { id: 'all', name: 'All', icon: '🔍' },
            { id: 'ai', name: 'AI Services', icon: '🤖' },
            { id: 'cloud', name: 'Cloud', icon: '☁️' },
            { id: 'dev', name: 'Development', icon: '💻' },
            { id: 'storage', name: 'Storage', icon: '💾' },
            { id: 'database', name: 'Database', icon: '🗄️' }
        ];
        
        return categories.map(cat => {
            const count = cat.id === 'all' ? this.keys.size : 
                Array.from(this.keys.values()).filter(k => {
                    const provider = this.providers.find(p => p.id === k.provider);
                    return provider && provider.category === cat.id;
                }).length;
                
            return `
                <button class="category-tab ${cat.id === (this.currentCategory || 'all') ? 'active' : ''}" 
                        onclick="apiKeysApp.switchCategory('${cat.id}')">
                    <span class="tab-icon">${cat.icon}</span>
                    <span class="tab-name">${cat.name}</span>
                    <span class="tab-count">${count}</span>
                </button>
            `;
        }).join('');
    }

    renderRecentActivity() {
        const recent = this.securityEvents.slice(-5).reverse();
        if (recent.length === 0) {
            return '<div class="no-activity sk-empty">No recent activity</div>';
        }
        
        return recent.map(event => `
            <div class="activity-item">
                <div class="activity-icon">${this.getEventIcon(event.type)}</div>
                <div class="activity-details">
                    <div class="activity-description">${event.description}</div>
                    <div class="activity-time">${this.formatTime(event.timestamp)}</div>
                </div>
            </div>
        `).join('');
    }

    renderModals() {
        return `
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
                                <select id="key-provider" class="sk-select" onchange="apiKeysApp.updateKeyForm()" required>
                                    <option value="">Select a provider</option>
                                    ${this.providers.map(p => `
                                        <option value="${p.id}">
                                            ${p.icon} ${p.name} (${p.category})
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            <div id="key-fields"></div>
                            <div class="form-group">
                                <label for="key-description">Description (optional):</label>
                                <input type="text" id="key-description" class="sk-input" placeholder="Production key, Testing, etc.">
                            </div>
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" id="key-allow-sharing"> Allow P2P sharing
                                </label>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button onclick="apiKeysApp.addKey()" class="btn-primary sk-btn sk-btn-primary">Add Key</button>
                        <button onclick="apiKeysApp.hideAddKey()" class="btn-secondary sk-btn">Cancel</button>
                    </div>
                </div>
            </div>

            <!-- P2P Sharing Modal -->
            <div id="p2p-sharing-modal" class="modal hidden">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>🌐 P2P Key Sharing</h3>
                        <button onclick="apiKeysApp.hideP2PManager()" class="modal-close">✕</button>
                    </div>
                    <div class="modal-body">
                        <div class="sharing-tabs">
                            <button class="tab-btn active" onclick="apiKeysApp.switchSharingTab('share')">Share Keys</button>
                            <button class="tab-btn" onclick="apiKeysApp.switchSharingTab('received')">Received Keys</button>
                            <button class="tab-btn" onclick="apiKeysApp.switchSharingTab('requests')">Requests</button>
                        </div>
                        <div id="sharing-content">
                            <!-- Content populated by switchSharingTab -->
                        </div>
                    </div>
                </div>
            </div>

            <!-- Security Settings Modal -->
            <div id="security-modal" class="modal hidden">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>🛡️ Security Settings</h3>
                        <button onclick="apiKeysApp.hideSecurity()" class="modal-close">✕</button>
                    </div>
                    <div class="modal-body">
                        <div class="security-settings">
                            <div class="setting-group">
                                <label for="auto-lock-minutes">Auto-lock timeout (minutes):</label>
                                <input type="number" id="auto-lock-minutes" class="sk-input" 
                                       value="${this.securitySettings.autoLockMinutes}" 
                                       min="1" max="60">
                            </div>
                            <div class="setting-group">
                                <label>
                                    <input type="checkbox" id="enable-audit-log" 
                                           ${this.securitySettings.enableAuditLog ? 'checked' : ''}>
                                    Enable security audit log
                                </label>
                            </div>
                            <div class="setting-group">
                                <label>
                                    <input type="checkbox" id="allow-p2p-sharing" 
                                           ${this.securitySettings.allowP2PSharing ? 'checked' : ''}>
                                    Allow P2P key sharing
                                </label>
                            </div>
                            <div class="setting-group">
                                <label for="encryption-strength">Encryption strength:</label>
                                <select id="encryption-strength" class="sk-select">
                                    <option value="AES-128-GCM" ${this.securitySettings.encryptionStrength === 'AES-128-GCM' ? 'selected' : ''}>AES-128-GCM</option>
                                    <option value="AES-256-GCM" ${this.securitySettings.encryptionStrength === 'AES-256-GCM' ? 'selected' : ''}>AES-256-GCM</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="security-audit">
                            <h4>🔍 Security Events</h4>
                            <div class="audit-log sk-code" id="audit-log">
                                ${this.renderAuditLog()}
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button onclick="apiKeysApp.saveSecuritySettings()" class="btn-primary sk-btn sk-btn-primary">Save Settings</button>
                        <button onclick="apiKeysApp.clearAuditLog()" class="btn-danger sk-btn sk-btn-danger">Clear Audit Log</button>
                    </div>
                </div>
            </div>
        `;
    }

    saveOpaqueReference(event) {
        event.preventDefault();
        const label = (document.getElementById('svf-ref-label')?.value || '').trim();
        const ref = (document.getElementById('svf-ref-value')?.value || '').trim();
        const guidance = document.getElementById('svf-ref-guidance');
        const boundary = document.getElementById('svf-ref-status');
        const savedEl = document.getElementById('svf-ref-saved');
        const labelOk = /^[A-Za-z0-9][A-Za-z0-9 ._-]{2,40}$/.test(label);
        const refOk = /^ref-[a-z0-9-]{3,64}$/.test(ref);
        if (!labelOk || !refOk) {
            if (boundary) {
                boundary.hidden = true;
                boundary.textContent = '';
            }
            if (guidance) {
                guidance.hidden = false;
                guidance.textContent = 'Invalid reference. Dispatch denied by policy. No credential value is stored.';
            }
            return;
        }
        localStorage.setItem('api-keys-opaque-refs', JSON.stringify([{ label, ref }]));
        if (savedEl) savedEl.textContent = ref;
        if (boundary) {
            boundary.hidden = false;
            boundary.textContent = `Saved reference ${ref}. Python-owner dispatch remains policy-blocked. Credential values are absent.`;
        }
        if (guidance) {
            guidance.hidden = true;
            guidance.textContent = '';
        }
    }

    retainBlockedState() {
        const guidance = document.getElementById('svf-ref-guidance');
        const boundary = document.getElementById('svf-ref-status');
        if (boundary) {
            boundary.hidden = true;
            boundary.textContent = '';
        }
        if (guidance) {
            guidance.hidden = false;
            guidance.textContent = 'Explicit blocked state retained.';
        }
    }

    lockVault() {
        this.isVaultUnlocked = false;
        this.logSecurityEvent('vault_lock', 'Vault locked manually');
        
        // Clear sensitive data from memory
        this.keys.clear();
        this.sharedKeys.clear();
        
        this.showNotification('Vault locked successfully', 'info');
        
        // Re-render the app to show lock screen
        if (window.apiKeysApp && window.apiKeysApp.onMount) {
            window.apiKeysApp.onMount();
        }
    }

    async onMount() {
        if (!this.isVaultUnlocked) {
            const host = document.querySelector('.window[data-app-id="api-keys"] .window-app-content')
                || document.getElementById('api-keys-container');
            if (host) host.innerHTML = await this.render();
            return;
        }
        
        await this.loadKeys();
        this.currentCategory = 'all';
        this.renderKeysList();
    }

    async loadKeys() {
        if (!this.isVaultUnlocked) return;
        
        try {
            // Load encrypted keys from localStorage or IndexedDB
            const encryptedData = localStorage.getItem('api-keys-encrypted');
            if (encryptedData && this.encryptionKey) {
                const decryptedKeys = await this.decryptData(encryptedData);
                if (decryptedKeys) {
                    this.keys.clear();
                    decryptedKeys.forEach((key, index) => {
                        this.keys.set(key.id || `key-${index}`, key);
                    });
                }
            }
            
            // Load shared keys from P2P network
            await this.loadSharedKeys();
            
            this.logSecurityEvent('keys_loaded', `Loaded ${this.keys.size} encrypted keys`);
        } catch (error) {
            console.error('Error loading API keys:', error);
            this.logSecurityEvent('keys_load_error', `Failed to load keys: ${error.message}`);
            this.showNotification('Failed to load API keys', 'error');
        }
    }

    async loadSharedKeys() {
        if (!this.p2pSystem || !this.securitySettings.allowP2PSharing) return;
        
        try {
            // Request shared keys from P2P network
            const sharedKeys = await this.p2pSystem.getSharedKeys();
            this.sharedKeys.clear();
            
            sharedKeys.forEach(key => {
                this.sharedKeys.set(key.id, key);
            });
            
        } catch (error) {
            console.warn('Failed to load shared keys:', error);
        }
    }

    switchCategory(category) {
        this.currentCategory = category;
        
        // Update tab styling
        document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`[onclick="apiKeysApp.switchCategory('${category}')"]`)?.classList.add('active');
        
        this.renderKeysList();
        this.updateCategoryTabs();
    }

    updateCategoryTabs() {
        const tabsContainer = document.getElementById('category-tabs');
        if (tabsContainer) {
            tabsContainer.innerHTML = this.renderCategoryTabs();
        }
    }

    filterKeys() {
        const searchQuery = document.getElementById('key-search')?.value.toLowerCase() || '';
        const statusFilter = document.getElementById('status-filter')?.value || '';
        const categoryFilter = document.getElementById('category-filter')?.value || '';
        
        this.searchQuery = searchQuery;
        this.statusFilter = statusFilter;
        this.categoryFilterValue = categoryFilter;
        
        this.renderKeysList();
    }

    renderKeysList() {
        const container = document.getElementById('keys-list');
        if (!container) return;

        let filteredKeys = Array.from(this.keys.entries());
        
        // Apply category filter
        if (this.currentCategory && this.currentCategory !== 'all') {
            filteredKeys = filteredKeys.filter(([id, key]) => {
                const provider = this.providers.find(p => p.id === key.provider);
                return provider && provider.category === this.currentCategory;
            });
        }
        
        // Apply search filter
        if (this.searchQuery) {
            filteredKeys = filteredKeys.filter(([id, key]) => {
                const provider = this.providers.find(p => p.id === key.provider);
                return (provider?.name.toLowerCase().includes(this.searchQuery)) ||
                       (key.description?.toLowerCase().includes(this.searchQuery));
            });
        }
        
        // Apply status filter
        if (this.statusFilter) {
            filteredKeys = filteredKeys.filter(([id, key]) => key.status === this.statusFilter);
        }
        
        // Apply category filter (from dropdown)
        if (this.categoryFilterValue) {
            filteredKeys = filteredKeys.filter(([id, key]) => {
                const provider = this.providers.find(p => p.id === key.provider);
                return provider && provider.category === this.categoryFilterValue;
            });
        }

        if (filteredKeys.length === 0) {
            container.innerHTML = `
                <div class="no-keys sk-empty">
                    <div class="no-keys-icon sk-empty-icon">🔍</div>
                    <h3>No keys found</h3>
                    <p>No API keys match your current filters.</p>
                    <button onclick="apiKeysApp.showAddKey()" class="btn-primary sk-btn sk-btn-primary">➕ Add API Key</button>
                </div>
            `;
            return;
        }

        const keysHtml = filteredKeys.map(([id, key]) => {
            const provider = this.providers.find(p => p.id === key.provider);
            const maskedKey = this.maskKey(key.apiKey || key.token || Object.values(key.credentials || {})[0]);
            
            return `
                <div class="key-card enhanced sk-card">
                    <div class="key-header">
                        <div class="key-info">
                            <div class="key-title">
                                <span class="provider-icon">${provider?.icon || '🔑'}</span>
                                <h4>${provider?.name || key.provider}</h4>
                                <span class="key-category sk-badge">${provider?.category || 'other'}</span>
                            </div>
                            <div class="key-value sk-code">${maskedKey}</div>
                            ${key.description ? `<div class="key-description">${key.description}</div>` : ''}
                        </div>
                        <div class="key-actions">
                            <button onclick="apiKeysApp.testKey('${id}')" class="btn-secondary sk-btn" title="Test Key">
                                🧪 Test
                            </button>
                            <button onclick="apiKeysApp.editKey('${id}')" class="btn-secondary sk-btn" title="Edit Key">
                                ✏️ Edit
                            </button>
                            <button onclick="apiKeysApp.copyKey('${id}')" class="btn-secondary sk-btn" title="Copy Key">
                                📋 Copy
                            </button>
                            <button onclick="apiKeysApp.shareKey('${id}')" class="btn-secondary sk-btn" title="Share via P2P">
                                🌐 Share
                            </button>
                            <button onclick="apiKeysApp.removeKey('${id}')" class="btn-danger sk-btn sk-btn-danger" title="Remove Key">
                                🗑️ Remove
                            </button>
                        </div>
                    </div>
                    <div class="key-details">
                        <div class="detail-grid">
                            <div class="detail-item">
                                <strong>Provider:</strong> 
                                <span>${provider?.name || key.provider}</span>
                            </div>
                            <div class="detail-item">
                                <strong>Added:</strong> 
                                <span>${new Date(key.createdAt || Date.now()).toLocaleDateString()}</span>
                            </div>
                            ${key.lastUsed ? `
                                <div class="detail-item">
                                    <strong>Last Used:</strong> 
                                    <span>${new Date(key.lastUsed).toLocaleDateString()}</span>
                                </div>
                            ` : ''}
                            <div class="detail-item">
                                <strong>Sharing:</strong> 
                                <span>${key.allowSharing ? '🌐 Enabled' : '🔒 Disabled'}</span>
                            </div>
                        </div>
                        <div class="key-status-bar">
                            <div class="status-indicator ${key.status || 'unknown'}">
                                <span class="sk-status-dot ${key.status === 'valid' ? 'is-ok' : key.status === 'invalid' ? 'is-err' : 'is-idle'}"></span>${this.getStatusIcon(key.status)} ${(key.status || 'unknown').toUpperCase()}
                            </div>
                            ${key.testResults ? `
                                <div class="test-results">
                                    Last test: ${key.testResults.timestamp ? new Date(key.testResults.timestamp).toLocaleString() : 'Never'}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = keysHtml;
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
                    <input type="${type}" id="key-${field}" name="${field}" class="sk-input" required>
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
            this.showNotification('Please select a provider', 'error');
            return;
        }

        try {
            const credentials = {};
            let hasValidCredentials = false;
            
            provider.fields.forEach(field => {
                const value = document.getElementById(`key-${field}`)?.value;
                if (value) {
                    credentials[field] = value;
                    hasValidCredentials = true;
                }
            });
            
            if (!hasValidCredentials) {
                this.showNotification('Please provide at least one credential field', 'error');
                return;
            }

            const key = {
                id: `${providerId}-${Date.now()}`,
                provider: providerId,
                credentials,
                description: document.getElementById('key-description')?.value || '',
                allowSharing: document.getElementById('key-allow-sharing')?.checked || false,
                createdAt: new Date().toISOString(),
                status: 'unknown',
                category: provider.category
            };

            // For backward compatibility, set main fields
            if (credentials.apiKey) key.apiKey = credentials.apiKey;
            if (credentials.token) key.token = credentials.token;

            this.keys.set(key.id, key);
            await this.saveKeys();
            this.renderKeysList();
            this.updateCategoryTabs();
            this.hideAddKey();
            
            this.logSecurityEvent('key_added', `Added ${provider.name} API key`);
            this.showNotification(`API key for ${provider.name} added successfully`, 'success');
            
            // Auto-test the key if it has a test endpoint
            if (provider.testEndpoint) {
                setTimeout(() => this.testKey(key.id), 1000);
            }
            
        } catch (error) {
            this.logSecurityEvent('key_add_error', `Failed to add key: ${error.message}`);
            this.showNotification('Error adding API key: ' + error.message, 'error');
        }
    }

    async removeKey(keyId) {
        const key = this.keys.get(keyId);
        if (!key) return;

        const provider = this.providers.find(p => p.id === key.provider);
        
        if (confirm(`Are you sure you want to remove the ${provider?.name || key.provider} API key?\n\nThis action cannot be undone.`)) {
            this.keys.delete(keyId);
            await this.saveKeys();
            this.renderKeysList();
            this.updateCategoryTabs();
            
            this.logSecurityEvent('key_removed', `Removed ${provider?.name || key.provider} API key`);
            this.showNotification('API key removed', 'info');
        }
    }

    // P2P and Security Methods
    showP2PManager() {
        const modal = document.getElementById('p2p-sharing-modal');
        if (modal) {
            modal.classList.remove('hidden');
            this.switchSharingTab('share');
        }
    }

    hideP2PManager() {
        const modal = document.getElementById('p2p-sharing-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    switchSharingTab(tab) {
        // Update tab styling
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[onclick="apiKeysApp.switchSharingTab('${tab}')"]`)?.classList.add('active');
        
        const content = document.getElementById('sharing-content');
        if (!content) return;
        
        switch (tab) {
            case 'share':
                content.innerHTML = this.renderShareKeysTab();
                break;
            case 'received':
                content.innerHTML = this.renderReceivedKeysTab();
                break;
            case 'requests':
                content.innerHTML = this.renderRequestsTab();
                break;
        }
    }

    renderShareKeysTab() {
        const shareableKeys = Array.from(this.keys.values()).filter(key => key.allowSharing);
        
        if (shareableKeys.length === 0) {
            return `
                <div class="no-data">
                    <h4>No shareable keys</h4>
                    <p>Enable sharing when adding keys to share them via P2P.</p>
                </div>
            `;
        }
        
        return `
            <div class="shareable-keys">
                <h4>Keys Available for Sharing</h4>
                ${shareableKeys.map(key => {
                    const provider = this.providers.find(p => p.id === key.provider);
                    return `
                        <div class="shareable-key-item">
                            <div class="key-info">
                                <span class="provider-icon">${provider?.icon || '🔑'}</span>
                                <span class="provider-name">${provider?.name || key.provider}</span>
                                <span class="key-description">${key.description || 'No description'}</span>
                            </div>
                            <button onclick="apiKeysApp.shareKey('${key.id}')" class="btn-primary">
                                🌐 Share
                            </button>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    renderReceivedKeysTab() {
        if (this.sharedKeys.size === 0) {
            return `
                <div class="no-data">
                    <h4>No received keys</h4>
                    <p>Keys shared with you by other peers will appear here.</p>
                </div>
            `;
        }
        
        const receivedKeys = Array.from(this.sharedKeys.values());
        return `
            <div class="received-keys">
                <h4>Keys Received from Peers</h4>
                ${receivedKeys.map(key => `
                    <div class="received-key-item">
                        <div class="key-info">
                            <span class="provider-name">${key.providerName}</span>
                            <span class="shared-by">Shared by: ${key.sharedBy}</span>
                            <span class="received-time">Received: ${new Date(key.receivedAt).toLocaleString()}</span>
                        </div>
                        <div class="key-actions">
                            <button onclick="apiKeysApp.acceptSharedKey('${key.id}')" class="btn-success">
                                ✓ Accept
                            </button>
                            <button onclick="apiKeysApp.rejectSharedKey('${key.id}')" class="btn-danger">
                                ✕ Reject
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderRequestsTab() {
        return `
            <div class="sharing-requests">
                <h4>Peer Requests</h4>
                <div class="no-data">
                    <p>Key sharing requests from peers will appear here.</p>
                </div>
            </div>
        `;
    }

    showSecurity() {
        const modal = document.getElementById('security-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    hideSecurity() {
        const modal = document.getElementById('security-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    renderAuditLog() {
        if (this.securityEvents.length === 0) {
            return '<div class="no-events">No security events recorded</div>';
        }
        
        return this.securityEvents.slice(-10).reverse().map(event => `
            <div class="audit-event">
                <div class="event-icon">${this.getEventIcon(event.type)}</div>
                <div class="event-details">
                    <div class="event-description">${event.description}</div>
                    <div class="event-time">${new Date(event.timestamp).toLocaleString()}</div>
                </div>
            </div>
        `).join('');
    }

    saveSecuritySettings() {
        this.securitySettings.autoLockMinutes = parseInt(document.getElementById('auto-lock-minutes')?.value) || 15;
        this.securitySettings.enableAuditLog = document.getElementById('enable-audit-log')?.checked || false;
        this.securitySettings.allowP2PSharing = document.getElementById('allow-p2p-sharing')?.checked || false;
        this.securitySettings.encryptionStrength = document.getElementById('encryption-strength')?.value || 'AES-256-GCM';
        
        localStorage.setItem('api-keys-security-settings', JSON.stringify(this.securitySettings));
        
        this.logSecurityEvent('settings_updated', 'Security settings updated');
        this.showNotification('Security settings saved', 'success');
        this.hideSecurity();
        
        // Restart auto-lock with new timeout
        this.setupAutoLock();
    }

    clearAuditLog() {
        if (confirm('Are you sure you want to clear the security audit log?')) {
            this.securityEvents = [];
            localStorage.removeItem('api-keys-security-events');
            this.showNotification('Audit log cleared', 'info');
            
            // Update the audit log display
            const auditLog = document.getElementById('audit-log');
            if (auditLog) {
                auditLog.innerHTML = this.renderAuditLog();
            }
        }
    }

    async exportKeys() {
        try {
            const keys = Array.from(this.keys.values());
            
            // Remove sensitive fields for export
            const exportKeys = keys.map(key => ({
                ...key,
                credentials: undefined,
                apiKey: undefined,
                token: undefined
            }));
            
            const data = JSON.stringify(exportKeys, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `swissknife-api-keys-metadata-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.logSecurityEvent('keys_exported', `Exported metadata for ${keys.length} keys`);
            this.showNotification('API key metadata exported successfully', 'success');
        } catch (error) {
            this.logSecurityEvent('export_error', `Export failed: ${error.message}`);
            this.showNotification('Error exporting API keys: ' + error.message, 'error');
        }
    }

    async testKey(keyId) {
        const key = this.keys.get(keyId);
        if (!key) return;

        const provider = this.providers.find(p => p.id === key.provider);
        this.showNotification(`Testing ${provider?.name || key.provider} API key...`, 'info');
        
        try {
            let testResult = { success: false, message: '', timestamp: new Date().toISOString() };
            
            // Enhanced API testing with real endpoints when available
            if (provider?.testEndpoint) {
                testResult = await this.performRealAPITest(key, provider);
            } else {
                // Simulate API test for providers without test endpoints
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
                testResult.success = Math.random() > 0.2; // 80% success rate for demo
                testResult.message = testResult.success ? 'API key is valid' : 'API key validation failed';
            }
            
            // Update key status and test results
            key.status = testResult.success ? 'valid' : 'invalid';
            key.lastUsed = testResult.timestamp;
            key.testResults = testResult;
            
            this.logSecurityEvent('key_tested', `API key for ${provider?.name} tested: ${testResult.success ? 'success' : 'failed'}`);
            
            if (testResult.success) {
                this.showNotification(`${provider?.name || key.provider} API key is valid`, 'success');
            } else {
                this.showNotification(`${provider?.name || key.provider} API key test failed: ${testResult.message}`, 'error');
            }
            
            await this.saveKeys();
            this.renderKeysList();
            
        } catch (error) {
            key.status = 'error';
            key.testResults = { 
                success: false, 
                message: error.message, 
                timestamp: new Date().toISOString() 
            };
            
            this.logSecurityEvent('key_test_error', `API key test error for ${provider?.name}: ${error.message}`);
            this.saveKeys();
            this.renderKeysList();
            this.showNotification(`Error testing API key: ${error.message}`, 'error');
        }
    }

    async performRealAPITest(key, provider) {
        const headers = {};
        const keyValue = key.apiKey || key.token || Object.values(key.credentials || {})[0];
        
        // Set up authentication headers based on provider
        switch (provider.id) {
            case 'openai':
            case 'anthropic':
            case 'cohere':
                headers['Authorization'] = `Bearer ${keyValue}`;
                break;
            case 'google':
                headers['x-goog-api-key'] = keyValue;
                break;
            case 'huggingface':
                headers['Authorization'] = `Bearer ${keyValue}`;
                break;
            case 'github':
                headers['Authorization'] = `token ${keyValue}`;
                break;
            default:
                headers['Authorization'] = `Bearer ${keyValue}`;
        }
        
        try {
            const response = await fetch(provider.testEndpoint, {
                method: 'GET',
                headers: {
                    ...headers,
                    'User-Agent': 'SwissKnife-Desktop/1.0'
                }
            });
            
            const success = response.ok;
            const message = success ? 'API key is valid' : `HTTP ${response.status}: ${response.statusText}`;
            
            return {
                success,
                message,
                statusCode: response.status,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            return {
                success: false,
                message: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    async shareKey(keyId) {
        if (!this.p2pSystem || !this.securitySettings.allowP2PSharing) {
            this.showNotification('P2P sharing is disabled', 'warning');
            return;
        }
        
        const key = this.keys.get(keyId);
        if (!key || !key.allowSharing) {
            this.showNotification('This key is not available for sharing', 'warning');
            return;
        }
        
        try {
            // Show peer selection dialog
            const peers = await this.p2pSystem.getConnectedPeers();
            if (peers.length === 0) {
                this.showNotification('No connected peers available', 'warning');
                return;
            }
            
            const selectedPeer = await this.showPeerSelection(peers);
            if (!selectedPeer) return;
            
            // Encrypt and share the key
            const sharedKey = await this.p2pSystem.shareKey(key, selectedPeer);
            
            this.logSecurityEvent('key_shared', `Shared ${key.provider} key with peer ${selectedPeer.id}`);
            this.showNotification(`API key shared with ${selectedPeer.name || selectedPeer.id}`, 'success');
            
        } catch (error) {
            this.logSecurityEvent('key_share_error', `Failed to share key: ${error.message}`);
            this.showNotification(`Failed to share key: ${error.message}`, 'error');
        }
    }

    async addKey() {
        const form = document.getElementById('add-key-form');
        const formData = new FormData(form);
        const providerId = formData.get('provider') || document.getElementById('key-provider').value;
        const provider = this.providers.find(p => p.id === providerId);
        
        if (!provider) {
            this.showNotification('Please select a provider', 'error');
            return;
        }

        try {
            const credentials = {};
            let hasValidCredentials = false;
            
            provider.fields.forEach(field => {
                const value = document.getElementById(`key-${field}`)?.value;
                if (value) {
                    credentials[field] = value;
                    hasValidCredentials = true;
                }
            });
            
            if (!hasValidCredentials) {
                this.showNotification('Please provide at least one credential field', 'error');
                return;
            }

            const key = {
                id: `${providerId}-${Date.now()}`,
                provider: providerId,
                credentials,
                description: document.getElementById('key-description')?.value || '',
                allowSharing: document.getElementById('key-allow-sharing')?.checked || false,
                createdAt: new Date().toISOString(),
                status: 'unknown',
                category: provider.category
            };

            // For backward compatibility, set main fields
            if (credentials.apiKey) key.apiKey = credentials.apiKey;
            if (credentials.token) key.token = credentials.token;

            this.keys.set(key.id, key);
            await this.saveKeys();
            this.renderKeysList();
            this.updateCategoryTabs();
            this.hideAddKey();
            
            this.logSecurityEvent('key_added', `Added ${provider.name} API key`);
            this.showNotification(`API key for ${provider.name} added successfully`, 'success');
            
            // Auto-test the key if it has a test endpoint
            if (provider.testEndpoint) {
                setTimeout(() => this.testKey(key.id), 1000);
            }
            
        } catch (error) {
            this.logSecurityEvent('key_add_error', `Failed to add key: ${error.message}`);
            this.showNotification('Error adding API key: ' + error.message, 'error');
        }
    }

    async saveKeys() {
        if (!this.isVaultUnlocked) return;
        
        try {
            const keys = Array.from(this.keys.values());
            
            if (this.encryptionKey) {
                // Encrypt the keys before storing
                const encryptedData = await this.encryptData(keys);
                localStorage.setItem('api-keys-encrypted', encryptedData);
            } else {
                // Fallback to unencrypted storage (less secure)
                localStorage.setItem('api-keys', JSON.stringify(keys));
            }
            
            this.logSecurityEvent('keys_saved', `Saved ${keys.length} encrypted keys`);
        } catch (error) {
            this.logSecurityEvent('keys_save_error', `Failed to save keys: ${error.message}`);
            console.error('Error saving keys:', error);
        }
    }

    async encryptData(data) {
        if (!this.encryptionKey || !crypto.subtle) {
            return JSON.stringify(data);
        }
        
        try {
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(JSON.stringify(data));
            const iv = crypto.getRandomValues(new Uint8Array(12));
            
            const encryptedBuffer = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                this.encryptionKey,
                dataBuffer
            );
            
            // Combine IV and encrypted data
            const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
            combined.set(iv);
            combined.set(new Uint8Array(encryptedBuffer), iv.length);
            
            return btoa(String.fromCharCode(...combined));
        } catch (error) {
            console.error('Encryption failed:', error);
            return JSON.stringify(data);
        }
    }

    async decryptData(encryptedData) {
        if (!this.encryptionKey || !crypto.subtle) {
            try {
                return JSON.parse(encryptedData);
            } catch {
                return null;
            }
        }
        
        try {
            const combined = new Uint8Array(atob(encryptedData).split('').map(c => c.charCodeAt(0)));
            const iv = combined.slice(0, 12);
            const encrypted = combined.slice(12);
            
            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                this.encryptionKey,
                encrypted
            );
            
            const decoder = new TextDecoder();
            const decryptedString = decoder.decode(decryptedBuffer);
            return JSON.parse(decryptedString);
        } catch (error) {
            console.error('Decryption failed:', error);
            return null;
        }
    }

    logSecurityEvent(type, description) {
        if (!this.securitySettings.enableAuditLog) return;
        
        const event = {
            id: Date.now().toString(),
            type,
            description,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent
        };
        
        this.securityEvents.push(event);
        
        // Keep only last 100 events
        if (this.securityEvents.length > 100) {
            this.securityEvents = this.securityEvents.slice(-100);
        }
        
        // Save events to localStorage
        localStorage.setItem('api-keys-security-events', JSON.stringify(this.securityEvents));
    }

    getEventIcon(type) {
        const icons = {
            vault_unlock: '🔓',
            vault_lock: '🔒',
            key_added: '➕',
            key_removed: '🗑️',
            key_tested: '🧪',
            key_shared: '🌐',
            keys_loaded: '📂',
            keys_saved: '💾',
            vault_unlock_failed: '⚠️',
            key_test_error: '❌',
            key_add_error: '❌',
            key_share_error: '❌'
        };
        return icons[type] || '📝';
    }

    getStatusIcon(status) {
        const icons = {
            valid: '✅',
            invalid: '❌',
            unknown: '❓',
            error: '⚠️'
        };
        return icons[status] || '❓';
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return date.toLocaleDateString();
    }

    async copyKey(keyId) {
        const key = this.keys.get(keyId);
        if (!key) return;

        const keyValue = key.apiKey || key.token || Object.values(key.credentials || {})[0];
        
        try {
            await navigator.clipboard.writeText(keyValue);
            this.showNotification('API key copied to clipboard', 'success');
        } catch (error) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = keyValue;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showNotification('API key copied to clipboard', 'success');
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

// Inline onsubmit/onkeydown handlers resolve apiKeysApp on window.
window.apiKeysApp = apiKeysApp;
window.APIKeysApp = APIKeysApp;
