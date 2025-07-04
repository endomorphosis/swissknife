// API Key Manager App
window.APIKeysApp = class APIKeysApp {
    constructor() {
        this.name = 'API Keys';
        this.icon = '🔑';
        this.keys = new Map();
        this.providers = [
            { id: 'openai', name: 'OpenAI', fields: ['apiKey'] },
            { id: 'anthropic', name: 'Anthropic', fields: ['apiKey'] },
            { id: 'google', name: 'Google (Gemini)', fields: ['apiKey'] },
            { id: 'huggingface', name: 'Hugging Face', fields: ['apiKey'] },
            { id: 'cohere', name: 'Cohere', fields: ['apiKey'] },
            { id: 'together', name: 'Together AI', fields: ['apiKey'] },
            { id: 'replicate', name: 'Replicate', fields: ['apiKey'] },
            { id: 'aws', name: 'AWS', fields: ['accessKeyId', 'secretAccessKey', 'region'] },
            { id: 'azure', name: 'Azure', fields: ['subscriptionId', 'tenantId', 'clientId', 'clientSecret'] },
            { id: 'github', name: 'GitHub', fields: ['token'] },
            { id: 'ipfs', name: 'IPFS', fields: ['endpoint', 'token'] }
        ];
    }

    async render() {
        return `
            <div class="api-keys-app">
                <div class="keys-header">
                    <h2>🔑 API Key Manager</h2>
                    <div class="keys-actions">
                        <button onclick="apiKeysApp.showAddKey()" class="btn-primary">➕ Add Key</button>
                        <button onclick="apiKeysApp.importKeys()" class="btn-secondary">📥 Import</button>
                        <button onclick="apiKeysApp.exportKeys()" class="btn-secondary">📤 Export</button>
                    </div>
                </div>
                
                <div class="keys-content">
                    <div class="provider-tabs" id="provider-tabs">
                        ${this.renderProviderTabs()}
                    </div>
                    
                    <div class="keys-list" id="keys-list">
                        <div class="loading">Loading API keys...</div>
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
                                        ${this.providers.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                                    </select>
                                </div>
                                <div id="key-fields"></div>
                                <div class="form-group">
                                    <label for="key-description">Description (optional):</label>
                                    <input type="text" id="key-description" placeholder="Production key, Testing, etc.">
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button onclick="apiKeysApp.addKey()" class="btn-primary">Add Key</button>
                            <button onclick="apiKeysApp.hideAddKey()" class="btn-secondary">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async onMount() {
        await this.loadKeys();
        this.currentTab = 'all';
        this.renderKeysList();
    }

    renderProviderTabs() {
        const tabs = ['all', ...this.providers.map(p => p.id)];
        return tabs.map(tab => {
            const name = tab === 'all' ? 'All' : this.providers.find(p => p.id === tab)?.name || tab;
            return `<button class="tab ${tab === 'all' ? 'active' : ''}" onclick="apiKeysApp.switchTab('${tab}')">${name}</button>`;
        }).join('');
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

        const filteredKeys = Array.from(this.keys.entries()).filter(([id, key]) => 
            this.currentTab === 'all' || key.provider === this.currentTab
        );

        if (filteredKeys.length === 0) {
            container.innerHTML = `
                <div class="no-keys">
                    <h3>No API keys found</h3>
                    <p>Add your first API key to get started with AI services.</p>
                    <button onclick="apiKeysApp.showAddKey()" class="btn-primary">➕ Add API Key</button>
                </div>
            `;
            return;
        }

        const keysHtml = filteredKeys.map(([id, key]) => {
            const provider = this.providers.find(p => p.id === key.provider);
            const maskedKey = this.maskKey(key.apiKey || key.token || Object.values(key.credentials || {})[0]);
            
            return `
                <div class="key-card">
                    <div class="key-header">
                        <div class="key-info">
                            <h4>${provider?.name || key.provider}</h4>
                            <span class="key-value">${maskedKey}</span>
                            ${key.description ? `<span class="key-description">${key.description}</span>` : ''}
                        </div>
                        <div class="key-actions">
                            <button onclick="apiKeysApp.testKey('${id}')" class="btn-secondary">🧪 Test</button>
                            <button onclick="apiKeysApp.editKey('${id}')" class="btn-secondary">✏️ Edit</button>
                            <button onclick="apiKeysApp.copyKey('${id}')" class="btn-secondary">📋 Copy</button>
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
                        <div class="key-status ${key.status || 'unknown'}">
                            Status: ${(key.status || 'unknown').toUpperCase()}
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
        if (!key) return;

        const provider = this.providers.find(p => p.id === key.provider);
        this.showNotification(`Testing ${provider?.name || key.provider} API key...`, 'info');
        
        try {
            // Simulate API test - in real implementation, this would make actual API calls
            setTimeout(() => {
                const success = Math.random() > 0.3; // 70% success rate for demo
                
                if (success) {
                    key.status = 'valid';
                    key.lastUsed = new Date().toISOString();
                    this.showNotification(`${provider?.name || key.provider} API key is valid`, 'success');
                } else {
                    key.status = 'invalid';
                    this.showNotification(`${provider?.name || key.provider} API key test failed`, 'error');
                }
                
                this.saveKeys();
                this.renderKeysList();
            }, 2000);
            
        } catch (error) {
            key.status = 'error';
            this.saveKeys();
            this.renderKeysList();
            this.showNotification(`Error testing API key: ${error.message}`, 'error');
        }
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
