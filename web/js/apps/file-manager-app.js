/**
 * Enhanced FileManagerApp
 *
 * A modern file explorer with cloud service integration for browsing and managing files using the VFS.
 */
export class FileManagerApp {
    constructor(desktop) {
        this.desktop = desktop;
        this.swissknife = desktop.swissknife;
        this.vfs = this.swissknife.storage;
        this.contentElement = null;
        this.currentPath = '/';
        this.selectedFiles = new Set();
        this.viewMode = 'list'; // 'list' or 'grid'
        this.sortBy = 'name'; // 'name', 'size', 'modified', 'type'
        this.sortOrder = 'asc'; // 'asc' or 'desc'
        this.cloudServices = {
            'googledrive': { name: 'Google Drive', icon: '📊', enabled: false, color: '#4285f4' },
            's3': { name: 'AWS S3', icon: '☁️', enabled: false, color: '#ff9900' },
            'ipfs': { name: 'IPFS', icon: '🌐', enabled: false, color: '#65c2cb' },
            'storacha': { name: 'Storacha', icon: '🗂️', enabled: false, color: '#6366f1' },
            'huggingface': { name: 'HuggingFace Hub', icon: '🤗', enabled: false, color: '#ff6b6b' },
            'github': { name: 'GitHub', icon: '🐙', enabled: false, color: '#333' },
            'dropbox': { name: 'Dropbox', icon: '📦', enabled: false, color: '#0061ff' },
            'onedrive': { name: 'OneDrive', icon: '💾', enabled: false, color: '#0078d4' }
        };
        this.pathHistory = ['/'];
        this.currentHistoryIndex = 0;
        
        // Inject styles when app is created
        this.injectStyles();
    }

    createWindow() {
        return `
            <div class="file-manager-app glass-pane">
                <!-- Main Toolbar -->
                <div class="file-manager-toolbar">
                    <div class="toolbar-section navigation">
                        <button id="nav-back" class="btn-icon" title="Back" ${this.currentHistoryIndex === 0 ? 'disabled' : ''}>
                            <span>⬅️</span>
                        </button>
                        <button id="nav-forward" class="btn-icon" title="Forward" ${this.currentHistoryIndex === this.pathHistory.length - 1 ? 'disabled' : ''}>
                            <span>➡️</span>
                        </button>
                        <button id="nav-up" class="btn-icon" title="Up" ${this.currentPath === '/' ? 'disabled' : ''}>
                            <span>⬆️</span>
                        </button>
                        <button id="nav-home" class="btn-icon" title="Home">
                            <span>🏠</span>
                        </button>
                        <button id="refresh-files" class="btn-icon" title="Refresh">
                            <span>🔄</span>
                        </button>
                    </div>
                    
                    <div class="toolbar-section path">
                        <div class="path-breadcrumb" id="path-breadcrumb">
                            <span class="path-segment root" data-path="/">📁</span>
                        </div>
                        <input type="text" id="path-input" class="path-input" value="${this.currentPath}" style="display: none;">
                    </div>
                    
                    <div class="toolbar-section search">
                        <div class="search-container">
                            <input type="text" id="file-search" placeholder="Search files..." class="search-input">
                            <button id="search-btn" class="btn-icon">
                                <span>🔍</span>
                            </button>
                        </div>
                    </div>
                    
                    <div class="toolbar-section actions">
                        <button id="new-folder" class="btn-primary" title="New Folder">
                            <span>📁</span> New Folder
                        </button>
                        <button id="upload-file" class="btn-primary" title="Upload File">
                            <span>📤</span> Upload
                        </button>
                        <div class="view-controls">
                            <button id="view-list" class="btn-icon ${this.viewMode === 'list' ? 'active' : ''}" title="List View">
                                <span>📋</span>
                            </button>
                            <button id="view-grid" class="btn-icon ${this.viewMode === 'grid' ? 'active' : ''}" title="Grid View">
                                <span>⊞</span>
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Cloud Services Panel -->
                <div class="cloud-services-panel" id="cloud-services-panel">
                    <div class="cloud-panel-header">
                        <h4>☁️ Cloud Sync & Replication</h4>
                        <button id="toggle-cloud-panel" class="btn-icon">
                            <span>⌄</span>
                        </button>
                    </div>
                    <div class="cloud-services-content" id="cloud-services-content">
                        <div class="cloud-services-grid">
                            ${Object.entries(this.cloudServices).map(([id, service]) => `
                                <div class="cloud-service-card ${service.enabled ? 'enabled' : ''}" data-service="${id}">
                                    <div class="service-icon" style="color: ${service.color};">${service.icon}</div>
                                    <div class="service-name">${service.name}</div>
                                    <div class="service-toggle">
                                        <label class="toggle-switch">
                                            <input type="checkbox" ${service.enabled ? 'checked' : ''} data-service="${id}">
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <div class="service-status">
                                        <span class="status-indicator ${service.enabled ? 'connected' : 'disconnected'}"></span>
                                        <span class="status-text">${service.enabled ? 'Connected' : 'Disconnected'}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="cloud-actions">
                            <button id="sync-all" class="btn-secondary">🔄 Sync All</button>
                            <button id="configure-services" class="btn-secondary">⚙️ Configure</button>
                            <button id="replication-settings" class="btn-secondary">🔧 Replication Settings</button>
                        </div>
                    </div>
                </div>
                
                <!-- Main Content Area -->
                <div class="file-manager-content">
                    <!-- Sidebar -->
                    <div class="file-manager-sidebar">
                        <div class="sidebar-section">
                            <h4>📁 Quick Access</h4>
                            <div class="quick-access-list">
                                <div class="quick-access-item" data-path="/">
                                    <span class="icon">🏠</span>
                                    <span class="label">Home</span>
                                </div>
                                <div class="quick-access-item" data-path="/documents/">
                                    <span class="icon">📄</span>
                                    <span class="label">Documents</span>
                                </div>
                                <div class="quick-access-item" data-path="/downloads/">
                                    <span class="icon">📥</span>
                                    <span class="label">Downloads</span>
                                </div>
                                <div class="quick-access-item" data-path="/images/">
                                    <span class="icon">🖼️</span>
                                    <span class="label">Images</span>
                                </div>
                                <div class="quick-access-item" data-path="/projects/">
                                    <span class="icon">💼</span>
                                    <span class="label">Projects</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="sidebar-section">
                            <h4>💾 Storage Adapters</h4>
                            <div class="adapter-list" id="adapter-list">
                                <!-- Adapters will be populated here -->
                            </div>
                        </div>
                        
                        <div class="sidebar-section">
                            <h4>📊 Storage Info</h4>
                            <div class="storage-info" id="storage-info">
                                <div class="storage-item">
                                    <span class="label">Used:</span>
                                    <span class="value" id="storage-used">--</span>
                                </div>
                                <div class="storage-item">
                                    <span class="label">Free:</span>
                                    <span class="value" id="storage-free">--</span>
                                </div>
                                <div class="storage-item">
                                    <span class="label">Total:</span>
                                    <span class="value" id="storage-total">--</span>
                                </div>
                                <div class="storage-bar">
                                    <div class="storage-bar-fill" id="storage-bar-fill" style="width: 0%"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Main File Area -->
                    <div class="file-manager-main">
                        <!-- File List Header -->
                        <div class="file-list-header">
                            <div class="selection-info" id="selection-info">
                                <span id="file-count">0 items</span>
                                <span id="selection-count" style="display: none;">0 selected</span>
                            </div>
                            <div class="sort-controls">
                                <label>Sort by:</label>
                                <select id="sort-by">
                                    <option value="name" ${this.sortBy === 'name' ? 'selected' : ''}>Name</option>
                                    <option value="size" ${this.sortBy === 'size' ? 'selected' : ''}>Size</option>
                                    <option value="modified" ${this.sortBy === 'modified' ? 'selected' : ''}>Modified</option>
                                    <option value="type" ${this.sortBy === 'type' ? 'selected' : ''}>Type</option>
                                </select>
                                <button id="sort-order" class="btn-icon" title="Sort Order">
                                    <span>${this.sortOrder === 'asc' ? '↑' : '↓'}</span>
                                </button>
                            </div>
                        </div>
                        
                        <!-- File List -->
                        <div class="file-list-container">
                            <div class="file-list ${this.viewMode}" id="file-list">
                                <div class="loading-spinner">
                                    <div class="spinner"></div>
                                    <p>Loading files...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Status Bar -->
                <div class="file-manager-statusbar">
                    <div class="status-left">
                        <span id="current-adapter">Adapter: --</span>
                        <span class="separator">|</span>
                        <span id="current-path-status">${this.currentPath}</span>
                    </div>
                    <div class="status-right">
                        <span id="sync-status">Sync: Ready</span>
                        <span class="separator">|</span>
                        <span id="connection-status">Online</span>
                    </div>
                </div>
                
                <!-- Context Menu -->
                <div class="context-menu" id="context-menu" style="display: none;">
                    <div class="context-menu-item" data-action="open">
                        <span class="icon">📂</span>
                        <span class="label">Open</span>
                    </div>
                    <div class="context-menu-item" data-action="download">
                        <span class="icon">📥</span>
                        <span class="label">Download</span>
                    </div>
                    <div class="context-menu-separator"></div>
                    <div class="context-menu-item" data-action="copy">
                        <span class="icon">📋</span>
                        <span class="label">Copy</span>
                    </div>
                    <div class="context-menu-item" data-action="cut">
                        <span class="icon">✂️</span>
                        <span class="label">Cut</span>
                    </div>
                    <div class="context-menu-item" data-action="paste">
                        <span class="icon">📄</span>
                        <span class="label">Paste</span>
                    </div>
                    <div class="context-menu-separator"></div>
                    <div class="context-menu-item" data-action="rename">
                        <span class="icon">✏️</span>
                        <span class="label">Rename</span>
                    </div>
                    <div class="context-menu-item" data-action="delete">
                        <span class="icon">🗑️</span>
                        <span class="label">Delete</span>
                    </div>
                    <div class="context-menu-separator"></div>
                    <div class="context-menu-item" data-action="properties">
                        <span class="icon">ℹ️</span>
                        <span class="label">Properties</span>
                    </div>
                </div>
            </div>
        `;
    }

    async initialize(contentElement) {
        this.contentElement = contentElement;
        
        try {
            await this.loadCloudServiceSettings();
            this.setupEventListeners();
            await this.populateAdapterList();
            await this.updateStorageInfo();
            await this.listFiles(this.currentPath);
            this.updateBreadcrumb();
            this.updateStatusBar();
        } catch (error) {
            console.error('Error initializing file manager:', error);
            this.showNotification('File manager initialization failed', 'error');
        }
    }

    setupEventListeners() {
        // Navigation
        this.contentElement.querySelector('#nav-back').addEventListener('click', () => this.navigateBack());
        this.contentElement.querySelector('#nav-forward').addEventListener('click', () => this.navigateForward());
        this.contentElement.querySelector('#nav-up').addEventListener('click', () => this.navigateUp());
        this.contentElement.querySelector('#nav-home').addEventListener('click', () => this.navigateToPath('/'));
        this.contentElement.querySelector('#refresh-files').addEventListener('click', () => this.refreshFiles());

        // Path handling
        this.contentElement.querySelector('#path-breadcrumb').addEventListener('click', (e) => {
            if (e.target.classList.contains('path-segment')) {
                const path = e.target.dataset.path;
                this.navigateToPath(path);
            }
        });

        // Search
        const searchInput = this.contentElement.querySelector('#file-search');
        searchInput.addEventListener('input', (e) => this.debounceSearch(e.target.value));
        this.contentElement.querySelector('#search-btn').addEventListener('click', () => this.performSearch());

        // Actions
        this.contentElement.querySelector('#new-folder').addEventListener('click', () => this.createFolderPrompt());
        this.contentElement.querySelector('#upload-file').addEventListener('click', () => this.uploadFilePrompt());

        // View controls
        this.contentElement.querySelector('#view-list').addEventListener('click', () => this.setViewMode('list'));
        this.contentElement.querySelector('#view-grid').addEventListener('click', () => this.setViewMode('grid'));

        // Sorting
        this.contentElement.querySelector('#sort-by').addEventListener('change', (e) => this.setSortBy(e.target.value));
        this.contentElement.querySelector('#sort-order').addEventListener('click', () => this.toggleSortOrder());

        // Cloud services
        this.contentElement.querySelector('#toggle-cloud-panel').addEventListener('click', () => this.toggleCloudPanel());
        this.contentElement.querySelectorAll('.cloud-service-card input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => this.toggleCloudService(e.target.dataset.service, e.target.checked));
        });
        this.contentElement.querySelector('#sync-all').addEventListener('click', () => this.syncAllServices());
        this.contentElement.querySelector('#configure-services').addEventListener('click', () => this.configureCloudServices());
        this.contentElement.querySelector('#replication-settings').addEventListener('click', () => this.showReplicationSettings());

        // Quick access
        this.contentElement.querySelectorAll('.quick-access-item').forEach(item => {
            item.addEventListener('click', () => {
                const path = item.dataset.path;
                this.navigateToPath(path);
            });
        });

        // Adapter selection
        this.contentElement.querySelector('#adapter-list').addEventListener('click', (e) => {
            if (e.target.classList.contains('adapter-item')) {
                const adapterName = e.target.dataset.adapter;
                this.setActiveAdapter(adapterName);
            }
        });

        // File selection and context menu
        this.contentElement.querySelector('#file-list').addEventListener('click', (e) => this.handleFileClick(e));
        this.contentElement.querySelector('#file-list').addEventListener('contextmenu', (e) => this.showContextMenu(e));
        this.contentElement.querySelector('#file-list').addEventListener('dblclick', (e) => this.handleFileDoubleClick(e));

        // Context menu actions
        this.contentElement.querySelector('#context-menu').addEventListener('click', (e) => this.handleContextMenuAction(e));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));

        // Drag and drop
        this.setupDragAndDrop();

        // Hide context menu on outside click
        document.addEventListener('click', () => this.hideContextMenu());
    }

    async loadCloudServiceSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('file-manager-cloud-services') || '{}');
            Object.keys(this.cloudServices).forEach(serviceId => {
                if (settings[serviceId]) {
                    this.cloudServices[serviceId] = { ...this.cloudServices[serviceId], ...settings[serviceId] };
                }
            });
        } catch (error) {
            console.error('Error loading cloud service settings:', error);
        }
    }

    async saveCloudServiceSettings() {
        try {
            localStorage.setItem('file-manager-cloud-services', JSON.stringify(this.cloudServices));
        } catch (error) {
            console.error('Error saving cloud service settings:', error);
        }
    }

    // Navigation Methods
    navigateToPath(path) {
        if (path !== this.currentPath) {
            // Add to history if moving to a new path
            if (this.currentHistoryIndex < this.pathHistory.length - 1) {
                // Remove forward history if we're branching
                this.pathHistory = this.pathHistory.slice(0, this.currentHistoryIndex + 1);
            }
            this.pathHistory.push(path);
            this.currentHistoryIndex = this.pathHistory.length - 1;
            
            this.listFiles(path);
            this.updateNavigationButtons();
        }
    }

    navigateBack() {
        if (this.currentHistoryIndex > 0) {
            this.currentHistoryIndex--;
            const path = this.pathHistory[this.currentHistoryIndex];
            this.listFiles(path);
            this.updateNavigationButtons();
        }
    }

    navigateForward() {
        if (this.currentHistoryIndex < this.pathHistory.length - 1) {
            this.currentHistoryIndex++;
            const path = this.pathHistory[this.currentHistoryIndex];
            this.listFiles(path);
            this.updateNavigationButtons();
        }
    }

    navigateUp() {
        if (this.currentPath !== '/') {
            const parentPath = this.currentPath.substring(0, this.currentPath.lastIndexOf('/', this.currentPath.length - 2) + 1);
            this.navigateToPath(parentPath);
        }
    }

    updateNavigationButtons() {
        const backBtn = this.contentElement.querySelector('#nav-back');
        const forwardBtn = this.contentElement.querySelector('#nav-forward');
        const upBtn = this.contentElement.querySelector('#nav-up');

        backBtn.disabled = this.currentHistoryIndex === 0;
        forwardBtn.disabled = this.currentHistoryIndex === this.pathHistory.length - 1;
        upBtn.disabled = this.currentPath === '/';
    }

    updateBreadcrumb() {
        const breadcrumb = this.contentElement.querySelector('#path-breadcrumb');
        const pathParts = this.currentPath.split('/').filter(part => part.length > 0);
        
        breadcrumb.innerHTML = '<span class="path-segment root" data-path="/">📁</span>';
        
        let currentPath = '/';
        pathParts.forEach((part, index) => {
            currentPath += part + '/';
            breadcrumb.innerHTML += `
                <span class="path-separator">></span>
                <span class="path-segment" data-path="${currentPath}">${part}</span>
            `;
        });
    }

    updateStatusBar() {
        const currentAdapter = this.contentElement?.querySelector('#current-adapter');
        const currentPathStatus = this.contentElement?.querySelector('#current-path-status');
        const syncStatus = this.contentElement?.querySelector('#sync-status');
        
        if (currentAdapter && this.vfs?.getActiveAdapterName) {
            currentAdapter.textContent = `Adapter: ${this.vfs.getActiveAdapterName()}`;
        }
        if (currentPathStatus) {
            currentPathStatus.textContent = this.currentPath;
        }
        if (syncStatus) {
            const enabledServices = Object.values(this.cloudServices).filter(s => s.enabled).length;
            syncStatus.textContent = `Sync: ${enabledServices} services active`;
        }
    }

    // View and Sort Methods
    setViewMode(mode) {
        this.viewMode = mode;
        const fileList = this.contentElement.querySelector('#file-list');
        const listBtn = this.contentElement.querySelector('#view-list');
        const gridBtn = this.contentElement.querySelector('#view-grid');
        
        fileList.className = `file-list ${mode}`;
        listBtn.classList.toggle('active', mode === 'list');
        gridBtn.classList.toggle('active', mode === 'grid');
        
        this.refreshFiles();
    }

    setSortBy(sortBy) {
        this.sortBy = sortBy;
        this.refreshFiles();
    }

    toggleSortOrder() {
        this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        const sortOrderBtn = this.contentElement.querySelector('#sort-order');
        sortOrderBtn.querySelector('span').textContent = this.sortOrder === 'asc' ? '↑' : '↓';
        this.refreshFiles();
    }

    sortFiles(files) {
        return files.sort((a, b) => {
            let aValue, bValue;
            
            switch (this.sortBy) {
                case 'name':
                    aValue = a.name.toLowerCase();
                    bValue = b.name.toLowerCase();
                    break;
                case 'size':
                    aValue = a.size || 0;
                    bValue = b.size || 0;
                    break;
                case 'modified':
                    aValue = new Date(a.modified || 0);
                    bValue = new Date(b.modified || 0);
                    break;
                case 'type':
                    aValue = a.type + a.name.toLowerCase();
                    bValue = b.type + b.name.toLowerCase();
                    break;
                default:
                    aValue = a.name.toLowerCase();
                    bValue = b.name.toLowerCase();
            }
            
            if (aValue < bValue) return this.sortOrder === 'asc' ? -1 : 1;
            if (aValue > bValue) return this.sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // Cloud Services Methods
    toggleCloudPanel() {
        const panel = this.contentElement.querySelector('#cloud-services-content');
        const toggleBtn = this.contentElement.querySelector('#toggle-cloud-panel span');
        
        const isExpanded = panel.style.display !== 'none';
        panel.style.display = isExpanded ? 'none' : 'block';
        toggleBtn.textContent = isExpanded ? '⌄' : '⌃';
    }

    async toggleCloudService(serviceId, enabled) {
        this.cloudServices[serviceId].enabled = enabled;
        
        if (enabled) {
            // Check if credentials are available
            const hasCredentials = await this.checkServiceCredentials(serviceId);
            if (!hasCredentials) {
                await this.promptForCredentials(serviceId);
            }
            
            // Initialize service
            try {
                await this.initializeCloudService(serviceId);
                this.updateServiceStatus(serviceId, 'connected');
                this.showNotification(`${this.cloudServices[serviceId].name} connected successfully! ☁️`, 'success');
            } catch (error) {
                this.cloudServices[serviceId].enabled = false;
                this.updateServiceStatus(serviceId, 'error');
                this.showNotification(`Failed to connect to ${this.cloudServices[serviceId].name}: ${error.message}`, 'error');
            }
        } else {
            this.updateServiceStatus(serviceId, 'disconnected');
            this.showNotification(`${this.cloudServices[serviceId].name} disconnected`, 'info');
        }
        
        await this.saveCloudServiceSettings();
        this.updateStatusBar();
    }

    async checkServiceCredentials(serviceId) {
        const credentialKeys = {
            'googledrive': ['google_client_id', 'google_client_secret'],
            's3': ['aws_access_key', 'aws_secret_key', 'aws_region'],
            'ipfs': ['ipfs_gateway', 'ipfs_api_key'],
            'storacha': ['storacha_api_key', 'storacha_did'],
            'huggingface': ['huggingface_token'],
            'github': ['github_token'],
            'dropbox': ['dropbox_access_token'],
            'onedrive': ['onedrive_client_id', 'onedrive_client_secret']
        };
        
        const keys = credentialKeys[serviceId] || [];
        return keys.every(key => localStorage.getItem(`swissknife_${key}`) !== null);
    }

    async promptForCredentials(serviceId) {
        // Open API Keys manager or show credential input dialog
        if (this.desktop.openApp) {
            this.desktop.openApp('api-keys');
            this.showNotification(`Please configure credentials for ${this.cloudServices[serviceId].name} in API Keys Manager`, 'info');
        }
    }

    async initializeCloudService(serviceId) {
        // Mock initialization - in real implementation, this would setup actual service connections
        return new Promise((resolve) => {
            setTimeout(() => {
                console.log(`Initializing ${serviceId}...`);
                resolve();
            }, 1000);
        });
    }

    updateServiceStatus(serviceId, status) {
        const serviceCard = this.contentElement.querySelector(`[data-service="${serviceId}"]`);
        if (serviceCard) {
            const indicator = serviceCard.querySelector('.status-indicator');
            const text = serviceCard.querySelector('.status-text');
            
            indicator.className = `status-indicator ${status}`;
            text.textContent = status.charAt(0).toUpperCase() + status.slice(1);
            
            if (status === 'connected') {
                serviceCard.classList.add('enabled');
            } else {
                serviceCard.classList.remove('enabled');
            }
        }
    }

    async syncAllServices() {
        const enabledServices = Object.entries(this.cloudServices)
            .filter(([id, service]) => service.enabled);
        
        if (enabledServices.length === 0) {
            this.showNotification('No cloud services enabled for sync', 'warning');
            return;
        }
        
        this.showNotification(`Syncing with ${enabledServices.length} cloud services...`, 'info');
        
        for (const [serviceId, service] of enabledServices) {
            try {
                await this.syncWithService(serviceId);
                this.showNotification(`✅ Synced with ${service.name}`, 'success');
            } catch (error) {
                this.showNotification(`❌ Sync failed with ${service.name}: ${error.message}`, 'error');
            }
        }
        
        this.showNotification('🔄 Sync complete!', 'success');
    }

    async syncWithService(serviceId) {
        // Mock sync implementation
        return new Promise((resolve) => {
            setTimeout(() => {
                console.log(`Syncing with ${serviceId}...`);
                resolve();
            }, Math.random() * 2000 + 1000);
        });
    }

    configureCloudServices() {
        // Show configuration modal or open settings
        this.showNotification('Opening cloud service configuration...', 'info');
        if (this.desktop.openApp) {
            this.desktop.openApp('api-keys');
        }
    }

    showReplicationSettings() {
        // Show replication settings modal
        const modal = this.createReplicationSettingsModal();
        document.body.appendChild(modal);
    }

    createReplicationSettingsModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3>🔧 Replication Settings</h3>
                    <button class="modal-close">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="auto-replicate"> Enable automatic replication
                        </label>
                    </div>
                    <div class="form-group">
                        <label>Replication delay (seconds):</label>
                        <input type="number" id="replication-delay" value="5" min="0" max="300">
                    </div>
                    <div class="form-group">
                        <label>File size limit (MB):</label>
                        <input type="number" id="size-limit" value="100" min="1" max="1000">
                    </div>
                    <div class="form-group">
                        <label>Exclude file types:</label>
                        <input type="text" id="exclude-types" placeholder=".tmp,.log,.cache" value=".tmp,.log">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary modal-save">Save Settings</button>
                    <button class="btn-secondary modal-close">Cancel</button>
                </div>
            </div>
        `;
        
        // Event listeners for modal
        modal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => modal.remove());
        });
        
        modal.querySelector('.modal-save').addEventListener('click', () => {
            this.saveReplicationSettings();
            modal.remove();
        });
        
        return modal;
    }

    // Enhanced File Operations
    async refreshFiles() {
        await this.listFiles(this.currentPath);
    }

    async listFiles(path = this.currentPath) {
        try {
            const result = await this.vfs.listFiles(path);
            
            if (result.error) {
                this.showNotification(`Error listing files: ${result.error}`, 'error');
                return;
            }
            
            this.currentPath = path;
            this.currentFiles = result.files || [];
            
            // Sort files
            this.currentFiles = this.sortFiles(this.currentFiles);
            
            this.renderFileList();
            this.updateBreadcrumb();
            this.updateStatusBar();
            
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
        }
    }

    renderFileList() {
        const fileList = this.contentElement.querySelector('#file-list');
        
        if (this.currentFiles.length === 0) {
            fileList.innerHTML = '<div class="empty-folder">📁 Empty folder</div>';
            return;
        }
        
        if (this.viewMode === 'grid') {
            this.renderGridView();
        } else {
            this.renderListView();
        }
    }

    renderListView() {
        const fileList = this.contentElement.querySelector('#file-list');
        
        const header = `
            <div class="file-list-header">
                <div class="col name">Name</div>
                <div class="col size">Size</div>
                <div class="col modified">Modified</div>
                <div class="col type">Type</div>
            </div>
        `;
        
        const items = this.currentFiles.map(file => {
            const icon = this.getFileIcon(file);
            const size = file.type === 'directory' ? '—' : this.formatFileSize(file.size || 0);
            const modified = this.formatDate(file.modified);
            const type = file.type === 'directory' ? 'Folder' : (file.name.split('.').pop() || 'File');
            
            return `
                <div class="file-item" 
                     data-name="${file.name}" 
                     data-type="${file.type}"
                     data-path="${this.currentPath}${file.name}${file.type === 'directory' ? '/' : ''}">
                    <div class="col name">
                        <span class="file-icon">${icon}</span>
                        <span class="file-name">${file.name}</span>
                    </div>
                    <div class="col size">${size}</div>
                    <div class="col modified">${modified}</div>
                    <div class="col type">${type}</div>
                </div>
            `;
        }).join('');
        
        fileList.innerHTML = header + items;
    }

    renderGridView() {
        const fileList = this.contentElement.querySelector('#file-list');
        
        const items = this.currentFiles.map(file => {
            const icon = this.getFileIcon(file);
            const size = file.type === 'directory' ? '' : this.formatFileSize(file.size || 0);
            
            return `
                <div class="file-item grid-item" 
                     data-name="${file.name}" 
                     data-type="${file.type}"
                     data-path="${this.currentPath}${file.name}${file.type === 'directory' ? '/' : ''}">
                    <div class="file-icon-large">${icon}</div>
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${size}</div>
                </div>
            `;
        }).join('');
        
        fileList.innerHTML = items;
    }

    getFileIcon(file) {
        if (file.type === 'directory') return '📁';
        
        const ext = file.name.split('.').pop()?.toLowerCase();
        const iconMap = {
            'js': '📄', 'ts': '📄', 'html': '🌐', 'css': '🎨',
            'json': '📋', 'xml': '📋', 'yaml': '📋', 'yml': '📋',
            'txt': '📝', 'md': '📝', 'pdf': '📕',
            'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'svg': '🖼️',
            'mp4': '🎬', 'avi': '🎬', 'mov': '🎬',
            'mp3': '🎵', 'wav': '🎵', 'flac': '🎵',
            'zip': '📦', 'tar': '📦', 'gz': '📦', '7z': '📦',
            'exe': '⚙️', 'app': '⚙️', 'deb': '⚙️', 'dmg': '⚙️'
        };
        
        return iconMap[ext] || '📄';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    formatDate(dateString) {
        if (!dateString) return '—';
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }

    // Selection Management
    selectFile(filePath, multiSelect = false) {
        const fileItem = this.contentElement.querySelector(`[data-path="${filePath}"]`);
        if (!fileItem) return;
        
        if (!multiSelect) {
            this.clearSelection();
        }
        
        if (fileItem.classList.contains('selected')) {
            fileItem.classList.remove('selected');
            this.selectedFiles = this.selectedFiles.filter(path => path !== filePath);
        } else {
            fileItem.classList.add('selected');
            this.selectedFiles.push(filePath);
        }
        
        this.updateSelectionInfo();
    }

    clearSelection() {
        this.contentElement.querySelectorAll('.file-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
        this.selectedFiles = [];
        this.updateSelectionInfo();
    }

    selectAll() {
        this.clearSelection();
        this.contentElement.querySelectorAll('.file-item').forEach(item => {
            const path = item.dataset.path;
            if (path) {
                item.classList.add('selected');
                this.selectedFiles.push(path);
            }
        });
        this.updateSelectionInfo();
    }

    updateSelectionInfo() {
        const count = this.selectedFiles.length;
        const selectionInfo = this.contentElement.querySelector('#selection-info');
        if (count > 0) {
            selectionInfo.textContent = `${count} selected`;
            selectionInfo.style.display = 'inline';
        } else {
            selectionInfo.style.display = 'none';
        }
    }

    // Search Functionality
    performSearch() {
        const searchInput = this.contentElement.querySelector('#search-input');
        const query = searchInput.value.trim().toLowerCase();
        
        if (!query) {
            this.clearSearch();
            return;
        }
        
        const filteredFiles = this.currentFiles.filter(file => 
            file.name.toLowerCase().includes(query)
        );
        
        this.renderFilteredFiles(filteredFiles);
        this.showNotification(`Found ${filteredFiles.length} files matching "${query}"`, 'info');
    }

    renderFilteredFiles(files) {
        const originalFiles = this.currentFiles;
        this.currentFiles = files;
        this.renderFileList();
        this.currentFiles = originalFiles; // Restore original list
    }

    clearSearch() {
        const searchInput = this.contentElement.querySelector('#search-input');
        searchInput.value = '';
        this.renderFileList();
    }

    // Context Menu
    showContextMenu(event, filePath) {
        event.preventDefault();
        
        const existingMenu = document.querySelector('.context-menu');
        if (existingMenu) existingMenu.remove();
        
        const menu = this.createContextMenu(filePath);
        menu.style.left = event.pageX + 'px';
        menu.style.top = event.pageY + 'px';
        
        document.body.appendChild(menu);
        
        // Close menu when clicking outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    createContextMenu(filePath) {
        const file = this.currentFiles.find(f => 
            (this.currentPath + f.name + (f.type === 'directory' ? '/' : '')) === filePath
        );
        
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        
        const menuItems = [];
        
        if (file?.type === 'directory') {
            menuItems.push(['📂 Open', () => this.navigateToPath(filePath)]);
        } else {
            menuItems.push(['📄 Open', () => this.openFile(filePath)]);
        }
        
        menuItems.push(
            ['✏️ Rename', () => this.renameFile(filePath)],
            ['📋 Copy', () => this.copyFile(filePath)],
            ['✂️ Cut', () => this.cutFile(filePath)],
            ['🗑️ Delete', () => this.deleteFile(filePath)],
            ['---'],
            ['📊 Properties', () => this.showFileProperties(filePath)]
        );
        
        if (this.selectedFiles.length > 1) {
            menuItems.unshift(['🗂️ Bulk Actions', () => this.showBulkActions()]);
        }
        
        menu.innerHTML = menuItems.map(([label, action]) => {
            if (label === '---') {
                return '<div class="menu-separator"></div>';
            }
            return `<div class="menu-item" data-action="true">${label}</div>`;
        }).join('');
        
        menu.querySelectorAll('[data-action="true"]').forEach((item, index) => {
            const actionIndex = menuItems.findIndex(([label]) => label === item.textContent);
            if (actionIndex !== -1) {
                item.addEventListener('click', menuItems[actionIndex][1]);
            }
        });
        
        return menu;
    }

    // File Actions
    async openFile(filePath) {
        const fileName = filePath.split('/').pop();
        const ext = fileName.split('.').pop()?.toLowerCase();
        
        // Handle different file types
        if (['txt', 'md', 'js', 'ts', 'html', 'css', 'json', 'xml', 'yaml'].includes(ext)) {
            if (this.desktop.openApp) {
                this.desktop.openApp('text-editor', { file: filePath });
            }
        } else if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext)) {
            if (this.desktop.openApp) {
                this.desktop.openApp('image-viewer', { file: filePath });
            }
        } else {
            this.showNotification(`Opening ${fileName}...`, 'info');
        }
    }

    async renameFile(filePath) {
        const currentName = filePath.split('/').pop();
        const newName = prompt('Enter new name:', currentName);
        
        if (newName && newName !== currentName) {
            try {
                await this.vfs.renameFile(filePath, newName);
                this.showNotification(`Renamed to ${newName}`, 'success');
                this.refreshFiles();
            } catch (error) {
                this.showNotification(`Failed to rename: ${error.message}`, 'error');
            }
        }
    }

    async copyFile(filePath) {
        // Add to clipboard (mock implementation)
        this.clipboard = { action: 'copy', files: [filePath] };
        this.showNotification('Copied to clipboard', 'success');
    }

    async cutFile(filePath) {
        // Add to clipboard (mock implementation)
        this.clipboard = { action: 'cut', files: [filePath] };
        this.showNotification('Cut to clipboard', 'success');
    }

    async deleteFile(filePath) {
        const fileName = filePath.split('/').pop();
        if (confirm(`Are you sure you want to delete "${fileName}"?`)) {
            try {
                await this.vfs.deleteFile(filePath);
                this.showNotification(`Deleted ${fileName}`, 'success');
                this.refreshFiles();
            } catch (error) {
                this.showNotification(`Failed to delete: ${error.message}`, 'error');
            }
        }
    }

    showFileProperties(filePath) {
        const file = this.currentFiles.find(f => 
            (this.currentPath + f.name + (f.type === 'directory' ? '/' : '')) === filePath
        );
        
        if (file) {
            const modal = this.createPropertiesModal(file);
            document.body.appendChild(modal);
        }
    }

    createPropertiesModal(file) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3>📊 Properties: ${file.name}</h3>
                    <button class="modal-close">✕</button>
                </div>
                <div class="modal-body">
                    <div class="property-grid">
                        <div class="property-row">
                            <span class="property-label">Name:</span>
                            <span class="property-value">${file.name}</span>
                        </div>
                        <div class="property-row">
                            <span class="property-label">Type:</span>
                            <span class="property-value">${file.type === 'directory' ? 'Folder' : 'File'}</span>
                        </div>
                        <div class="property-row">
                            <span class="property-label">Size:</span>
                            <span class="property-value">${file.type === 'directory' ? '—' : this.formatFileSize(file.size || 0)}</span>
                        </div>
                        <div class="property-row">
                            <span class="property-label">Modified:</span>
                            <span class="property-value">${this.formatDate(file.modified)}</span>
                        </div>
                        <div class="property-row">
                            <span class="property-label">Path:</span>
                            <span class="property-value">${this.currentPath}${file.name}</span>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary modal-close">Close</button>
                </div>
            </div>
        `;
        
        modal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => modal.remove());
        });
        
        return modal;
    }

    // Utility Methods
    async saveCloudServiceSettings() {
        const settings = {
            cloudServices: this.cloudServices,
            lastSync: new Date().toISOString()
        };
        localStorage.setItem('swissknife_file_manager_cloud_settings', JSON.stringify(settings));
    }

    loadCloudServiceSettings() {
        const saved = localStorage.getItem('swissknife_file_manager_cloud_settings');
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                Object.assign(this.cloudServices, settings.cloudServices || {});
            } catch (error) {
                console.warn('Failed to load cloud service settings:', error);
            }
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Add to container or create one
        let container = document.querySelector('.notification-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'notification-container';
            document.body.appendChild(container);
        }
        
        container.appendChild(notification);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            notification.remove();
            if (container.children.length === 0) {
                container.remove();
            }
        }, 3000);
    }

    async populateAdapterSelect() {
        const select = this.contentElement.querySelector('#active-adapter-select');
        select.innerHTML = '';
        for (const adapterName in this.vfs.adapters) {
            const option = document.createElement('option');
            option.value = adapterName;
            option.textContent = adapterName;
            select.appendChild(option);
        }
        select.value = this.vfs.getActiveAdapterName();
    }

    injectStyles() {
        if (document.querySelector('#file-manager-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'file-manager-styles';
        style.textContent = `
            /* File Manager Styles */
            .file-manager-container {
                display: flex;
                flex-direction: column;
                height: 100%;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #ffffff;
            }
            
            /* Toolbar */
            .file-manager-toolbar {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 16px;
                background: #f8f9fa;
                border-bottom: 1px solid #e9ecef;
                flex-shrink: 0;
            }
            
            .toolbar-group {
                display: flex;
                align-items: center;
                gap: 4px;
            }
            
            .toolbar-group:not(:last-child)::after {
                content: '';
                width: 1px;
                height: 20px;
                background: #dee2e6;
                margin: 0 8px;
            }
            
            .toolbar-btn {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 6px 12px;
                border: 1px solid #dee2e6;
                background: white;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.2s;
            }
            
            .toolbar-btn:hover {
                background: #e9ecef;
                border-color: #adb5bd;
            }
            
            .toolbar-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .toolbar-btn.active {
                background: #0d6efd;
                color: white;
                border-color: #0d6efd;
            }
            
            /* Breadcrumb */
            .path-breadcrumb {
                display: flex;
                align-items: center;
                gap: 4px;
                flex: 1;
                margin: 0 16px;
                padding: 6px 12px;
                background: white;
                border: 1px solid #dee2e6;
                border-radius: 4px;
                font-size: 13px;
            }
            
            .path-segment {
                cursor: pointer;
                padding: 2px 4px;
                border-radius: 3px;
                transition: background 0.2s;
            }
            
            .path-segment:hover {
                background: #e9ecef;
            }
            
            .path-segment.root {
                font-size: 16px;
            }
            
            .path-separator {
                color: #6c757d;
                margin: 0 2px;
            }
            
            /* Search */
            .search-container {
                position: relative;
            }
            
            .search-input {
                padding: 6px 32px 6px 12px;
                border: 1px solid #dee2e6;
                border-radius: 4px;
                font-size: 13px;
                width: 200px;
            }
            
            .search-input:focus {
                outline: none;
                border-color: #0d6efd;
                box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.1);
            }
            
            .search-clear {
                position: absolute;
                right: 8px;
                top: 50%;
                transform: translateY(-50%);
                background: none;
                border: none;
                cursor: pointer;
                color: #6c757d;
            }
            
            /* Main Content */
            .file-manager-main {
                display: flex;
                flex: 1;
                overflow: hidden;
            }
            
            /* Cloud Services Panel */
            .cloud-services-panel {
                width: 300px;
                background: #f8f9fa;
                border-right: 1px solid #e9ecef;
                display: flex;
                flex-direction: column;
                flex-shrink: 0;
            }
            
            .cloud-panel-header {
                padding: 12px 16px;
                border-bottom: 1px solid #e9ecef;
                background: white;
                font-weight: 600;
                font-size: 14px;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            
            .toggle-panel-btn {
                background: none;
                border: none;
                cursor: pointer;
                font-size: 16px;
                color: #6c757d;
            }
            
            .cloud-services-content {
                flex: 1;
                overflow-y: auto;
                padding: 12px;
            }
            
            .cloud-services-actions {
                display: flex;
                gap: 8px;
                margin-bottom: 16px;
            }
            
            .btn-primary {
                background: #0d6efd;
                color: white;
                border: 1px solid #0d6efd;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.2s;
            }
            
            .btn-primary:hover {
                background: #0b5ed7;
                border-color: #0a58ca;
            }
            
            .btn-secondary {
                background: white;
                color: #6c757d;
                border: 1px solid #dee2e6;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.2s;
            }
            
            .btn-secondary:hover {
                background: #e9ecef;
                border-color: #adb5bd;
            }
            
            /* Cloud Service Cards */
            .cloud-service-card {
                background: white;
                border: 1px solid #e9ecef;
                border-radius: 6px;
                padding: 12px;
                margin-bottom: 8px;
                transition: all 0.2s;
            }
            
            .cloud-service-card:hover {
                border-color: #adb5bd;
                box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            }
            
            .cloud-service-card.enabled {
                border-color: #198754;
                background: #f8fff9;
            }
            
            .cloud-service-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 8px;
            }
            
            .cloud-service-info {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .cloud-service-icon {
                font-size: 18px;
            }
            
            .cloud-service-name {
                font-weight: 500;
                font-size: 14px;
            }
            
            .cloud-service-toggle {
                position: relative;
                width: 40px;
                height: 20px;
                background: #dee2e6;
                border-radius: 10px;
                cursor: pointer;
                transition: background 0.2s;
            }
            
            .cloud-service-toggle.enabled {
                background: #198754;
            }
            
            .cloud-service-toggle::after {
                content: '';
                position: absolute;
                top: 2px;
                left: 2px;
                width: 16px;
                height: 16px;
                background: white;
                border-radius: 50%;
                transition: transform 0.2s;
                box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            }
            
            .cloud-service-toggle.enabled::after {
                transform: translateX(20px);
            }
            
            .cloud-service-status {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                color: #6c757d;
            }
            
            .status-indicator {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #dee2e6;
            }
            
            .status-indicator.connected {
                background: #198754;
            }
            
            .status-indicator.error {
                background: #dc3545;
            }
            
            .status-indicator.disconnected {
                background: #6c757d;
            }
            
            /* File Area */
            .file-area {
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            
            .file-area-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 16px;
                background: white;
                border-bottom: 1px solid #e9ecef;
            }
            
            .file-stats {
                font-size: 13px;
                color: #6c757d;
            }
            
            .file-actions {
                display: flex;
                gap: 8px;
            }
            
            /* File List */
            .file-list-container {
                flex: 1;
                overflow: auto;
                background: white;
            }
            
            .file-list {
                height: 100%;
            }
            
            .file-list-header {
                display: grid;
                grid-template-columns: 1fr 100px 150px 100px;
                gap: 12px;
                padding: 8px 16px;
                background: #f8f9fa;
                border-bottom: 1px solid #e9ecef;
                font-size: 13px;
                font-weight: 500;
                color: #495057;
                position: sticky;
                top: 0;
                z-index: 1;
            }
            
            .file-item {
                display: grid;
                grid-template-columns: 1fr 100px 150px 100px;
                gap: 12px;
                padding: 8px 16px;
                border-bottom: 1px solid #f8f9fa;
                cursor: pointer;
                transition: background 0.2s;
                align-items: center;
            }
            
            .file-item:hover {
                background: #f8f9fa;
            }
            
            .file-item.selected {
                background: #e7f3ff;
                border-color: #b3d7ff;
            }
            
            .file-item .col {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 13px;
                overflow: hidden;
            }
            
            .file-icon {
                font-size: 16px;
                flex-shrink: 0;
            }
            
            .file-name {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            
            /* Grid View */
            .file-list.grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
                gap: 16px;
                padding: 16px;
            }
            
            .grid-item {
                display: flex !important;
                flex-direction: column;
                align-items: center;
                padding: 16px 8px !important;
                border: 1px solid #e9ecef !important;
                border-radius: 6px;
                text-align: center;
                min-height: 100px;
                justify-content: center;
            }
            
            .grid-item:hover {
                border-color: #adb5bd !important;
                box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            }
            
            .grid-item.selected {
                border-color: #0d6efd !important;
                background: #e7f3ff !important;
            }
            
            .file-icon-large {
                font-size: 32px;
                margin-bottom: 8px;
            }
            
            .grid-item .file-name {
                font-size: 12px;
                line-height: 1.3;
                margin-bottom: 4px;
                word-break: break-word;
            }
            
            .grid-item .file-size {
                font-size: 11px;
                color: #6c757d;
            }
            
            .empty-folder {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 200px;
                font-size: 16px;
                color: #6c757d;
            }
            
            /* Status Bar */
            .status-bar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 16px;
                background: #f8f9fa;
                border-top: 1px solid #e9ecef;
                font-size: 12px;
                color: #6c757d;
                flex-shrink: 0;
            }
            
            .status-left {
                display: flex;
                gap: 16px;
            }
            
            .status-right {
                display: flex;
                gap: 16px;
            }
            
            /* Context Menu */
            .context-menu {
                position: fixed;
                background: white;
                border: 1px solid #dee2e6;
                border-radius: 4px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 1000;
                min-width: 150px;
                font-size: 13px;
            }
            
            .menu-item {
                padding: 8px 12px;
                cursor: pointer;
                transition: background 0.2s;
            }
            
            .menu-item:hover {
                background: #f8f9fa;
            }
            
            .menu-separator {
                height: 1px;
                background: #e9ecef;
                margin: 4px 0;
            }
            
            /* Modal */
            .modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2000;
            }
            
            .modal {
                background: white;
                border-radius: 8px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }
            
            .modal-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 16px 20px;
                border-bottom: 1px solid #e9ecef;
                background: #f8f9fa;
            }
            
            .modal-header h3 {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
            }
            
            .modal-close {
                background: none;
                border: none;
                font-size: 18px;
                cursor: pointer;
                color: #6c757d;
                padding: 4px;
                border-radius: 3px;
                transition: background 0.2s;
            }
            
            .modal-close:hover {
                background: #e9ecef;
            }
            
            .modal-body {
                flex: 1;
                padding: 20px;
                overflow-y: auto;
            }
            
            .modal-footer {
                display: flex;
                gap: 8px;
                justify-content: flex-end;
                padding: 16px 20px;
                border-top: 1px solid #e9ecef;
                background: #f8f9fa;
            }
            
            .form-group {
                margin-bottom: 16px;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 4px;
                font-size: 13px;
                font-weight: 500;
                color: #495057;
            }
            
            .form-group input {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid #dee2e6;
                border-radius: 4px;
                font-size: 13px;
            }
            
            .form-group input:focus {
                outline: none;
                border-color: #0d6efd;
                box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.1);
            }
            
            .property-grid {
                display: grid;
                gap: 12px;
            }
            
            .property-row {
                display: grid;
                grid-template-columns: 120px 1fr;
                gap: 12px;
                align-items: center;
            }
            
            .property-label {
                font-weight: 500;
                color: #495057;
                font-size: 13px;
            }
            
            .property-value {
                font-size: 13px;
                color: #212529;
                word-break: break-all;
            }
            
            /* Notifications */
            .notification-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 3000;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            
            .notification {
                padding: 12px 16px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 500;
                min-width: 250px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                animation: slideIn 0.3s ease;
            }
            
            .notification.success {
                background: #d4edda;
                color: #155724;
                border: 1px solid #c3e6cb;
            }
            
            .notification.error {
                background: #f8d7da;
                color: #721c24;
                border: 1px solid #f5c6cb;
            }
            
            .notification.warning {
                background: #fff3cd;
                color: #856404;
                border: 1px solid #ffeaa7;
            }
            
            .notification.info {
                background: #d1ecf1;
                color: #0c5460;
                border: 1px solid #bee5eb;
            }
            
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            /* Responsive Design */
            @media (max-width: 768px) {
                .file-manager-toolbar {
                    flex-wrap: wrap;
                    gap: 4px;
                }
                
                .toolbar-group {
                    gap: 2px;
                }
                
                .cloud-services-panel {
                    width: 250px;
                }
                
                .search-input {
                    width: 150px;
                }
                
                .file-list-header,
                .file-item {
                    grid-template-columns: 1fr 80px 120px 80px;
                    gap: 8px;
                    padding: 6px 12px;
                }
                
                .file-list.grid {
                    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
                    gap: 12px;
                    padding: 12px;
                }
            }
        `;
        
        document.head.appendChild(style);
    }

    async setActiveAdapter() {
        const select = this.contentElement.querySelector('#active-adapter-select');
        const newAdapter = select.value;
        try {
            // Ensure the adapter is initialized before setting it active
            if (typeof this.vfs.adapters[newAdapter].init === 'function' && !this.vfs.adapters[newAdapter].isReady) {
                // This is a simplified assumption. Real init might need credentials.
                this.desktop.showNotification(`Initializing ${newAdapter} adapter...`, 'info');
                await this.vfs.adapters[newAdapter].init();
            }
            this.vfs.setAdapter(newAdapter);
            this.desktop.showNotification(`Active adapter set to ${newAdapter}`, 'success');
            await this.listFiles(this.currentPath); // Refresh file list
        } catch (error) {
            this.desktop.showNotification(`Failed to set active adapter: ${error.message}`, 'error');
            console.error('Failed to set active adapter:', error);
        }
    }

    async listFiles(path) {
        const fileListElement = this.contentElement.querySelector('#file-list');
        fileListElement.innerHTML = '<p>Loading files...</p>';
        this.currentPath = path;
        
        // Safely update current path display
        const currentPathElement = this.contentElement.querySelector('#current-path');
        if (currentPathElement) {
            currentPathElement.textContent = path;
        }

        try {
            const files = await this.vfs.list({ path: path });
            fileListElement.innerHTML = ''; // Clear loading message

            if (path !== '/') {
                const backItem = document.createElement('div');
                backItem.className = 'file-item folder';
                backItem.innerHTML = '📁 .. (Go Up)';
                backItem.addEventListener('click', () => {
                    const parentPath = path.substring(0, path.lastIndexOf('/', path.length - 2) + 1);
                    this.listFiles(parentPath);
                });
                fileListElement.appendChild(backItem);
            }

            if (files.length === 0) {
                fileListElement.innerHTML += '<p>No files or folders in this directory.</p>';
                return;
            }

            files.forEach(item => {
                const fileItem = document.createElement('div');
                fileItem.className = `file-item ${item.type}`;
                fileItem.innerHTML = `${item.type === 'directory' ? '📁' : '📄'} ${item.name}`;
                fileItem.dataset.path = item.path;
                fileItem.dataset.type = item.type;
                fileItem.dataset.hash = item.hash || ''; // Store hash if available

                if (item.type === 'directory') {
                    fileItem.addEventListener('click', () => this.listFiles(item.path));
                } else {
                    fileItem.addEventListener('click', () => this.readFile(item.path, item.hash));
                }
                fileListElement.appendChild(fileItem);
            });
        } catch (error) {
            fileListElement.innerHTML = `<p style="color: red;">Error listing files: ${error.message}</p>`;
            console.error('Error listing files:', error);
        }
    }

    async readFile(path, hash) {
        this.desktop.showNotification(`Reading file: ${path}...`, 'info');
        try {
            const content = await this.vfs.read({ path, hash });
            this.desktop.showNotification(`File ${path} read successfully!`, 'success');
            console.log(`Content of ${path}:`, content);
            // Display content in a new window or modal
            this.desktop.createWindow({
                title: `View: ${path.split('/').pop()}`,
                width: 600,
                height: 400,
                content: `<textarea style="width:100%;height:100%;border:none;resize:none;">${content}</textarea>`
            });
        } catch (error) {
            this.desktop.showNotification(`Failed to read file ${path}: ${error.message}`, 'error');
            console.error('Error reading file:', error);
        }
    }

    async createFolderPrompt() {
        const folderName = prompt('Enter new folder name:');
        if (folderName) {
            const newPath = `${this.currentPath}${folderName}/`;
            this.desktop.showNotification(`Creating folder: ${newPath}...`, 'info');
            try {
                await this.vfs.createDirectory({ path: newPath });
                this.desktop.showNotification(`Folder ${newPath} created successfully!`, 'success');
                this.listFiles(this.currentPath); // Refresh
            } catch (error) {
                this.desktop.showNotification(`Failed to create folder: ${error.message}`, 'error');
                console.error('Error creating folder:', error);
            }
        }
    }

    async uploadFilePrompt() {
        const input = document.createElement('input');
        input.type = 'file';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const content = event.target.result;
                    const filePath = `${this.currentPath}${file.name}`;
                    this.desktop.showNotification(`Uploading file: ${filePath}...`, 'info');
                    try {
                        const result = await this.vfs.write({ path: filePath, content: content, type: 'file' });
                        this.desktop.showNotification(`File ${filePath} uploaded successfully!`, 'success');
                        console.log('Upload result:', result);
                        this.listFiles(this.currentPath); // Refresh
                        // Trigger replication after successful write
                        if (result.hash) {
                            this.swissknife.replication.replicate(filePath, content, { originalAdapter: this.vfs.getActiveAdapterName(), hash: result.hash });
                        }
                    } catch (error) {
                        this.desktop.showNotification(`Failed to upload file: ${error.message}`, 'error');
                        console.error('Error uploading file:', error);
                    }
                };
                reader.readAsArrayBuffer(file); // Read as ArrayBuffer for binary compatibility
            }
        };
        input.click();
    }

    async replicateSelectedFile() {
        const selectedFile = this.contentElement.querySelector('.file-item.selected'); // Assuming a way to select files
        if (!selectedFile || selectedFile.dataset.type === 'directory') {
            this.desktop.showNotification('Please select a file to replicate.', 'warning');
            return;
        }
        const filePath = selectedFile.dataset.path;
        const fileHash = selectedFile.dataset.hash;

        if (!fileHash) {
            this.desktop.showNotification('Selected file does not have a hash for replication.', 'error');
            return;
        }

        this.desktop.showNotification(`Replicating ${filePath}...`, 'info');
        try {
            // Read content first to replicate it
            const content = await this.vfs.read({ path: filePath, hash: fileHash });
            await this.swissknife.replication.replicate(filePath, content, { originalAdapter: this.vfs.getActiveAdapterName(), hash: fileHash });
            this.desktop.showNotification(`File ${filePath} sent for replication!`, 'success');
        } catch (error) {
            this.desktop.showNotification(`Failed to replicate file: ${error.message}`, 'error');
            console.error('Error during replication:', error);
        }
    }

    // Additional missing methods
    async populateAdapterList() {
        const adapterList = this.contentElement.querySelector('#adapter-list');
        adapterList.innerHTML = '';
        
        for (const adapterName in this.vfs.adapters) {
            const adapterItem = document.createElement('div');
            adapterItem.className = 'adapter-item';
            adapterItem.dataset.adapter = adapterName;
            adapterItem.innerHTML = `
                <span class="adapter-icon">💾</span>
                <span class="adapter-name">${adapterName}</span>
                <span class="adapter-status ${this.vfs.getActiveAdapterName() === adapterName ? 'active' : ''}">
                    ${this.vfs.getActiveAdapterName() === adapterName ? '✓' : ''}
                </span>
            `;
            adapterList.appendChild(adapterItem);
        }
    }

    async updateStorageInfo() {
        try {
            // Check if the storage info elements exist
            const usedElement = this.contentElement?.querySelector('#storage-used');
            const freeElement = this.contentElement?.querySelector('#storage-free');
            const totalElement = this.contentElement?.querySelector('#storage-total');
            const barFillElement = this.contentElement?.querySelector('#storage-bar-fill');
            
            if (!usedElement || !freeElement || !totalElement || !barFillElement) {
                console.warn('Storage info elements not found in DOM');
                return;
            }

            // Try to get storage info from VFS, fallback to mock data
            let storageInfo;
            try {
                if (this.vfs.getStorageInfo) {
                    storageInfo = await this.vfs.getStorageInfo();
                }
            } catch (vfsError) {
                console.warn('VFS getStorageInfo not available, using mock data');
            }
            
            // Use mock storage info if VFS doesn't provide it
            if (!storageInfo) {
                storageInfo = {
                    used: 1024 * 1024 * 512, // 512MB
                    free: 1024 * 1024 * 1024 * 2, // 2GB
                    total: 1024 * 1024 * 1024 * 3 // 3GB
                };
            }
            
            usedElement.textContent = this.formatFileSize(storageInfo.used || 0);
            freeElement.textContent = this.formatFileSize(storageInfo.free || 0);
            totalElement.textContent = this.formatFileSize(storageInfo.total || 0);
            
            const percentage = storageInfo.total ? (storageInfo.used / storageInfo.total) * 100 : 0;
            barFillElement.style.width = `${percentage}%`;
            
        } catch (error) {
            console.warn('Could not get storage info:', error);
        }
    }

    debounceSearch(query) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.performSearch();
        }, 300);
    }

    async createFolderPrompt() {
        const folderName = prompt('Enter folder name:');
        if (folderName) {
            try {
                await this.vfs.createFolder(this.currentPath + folderName);
                this.showNotification(`Created folder: ${folderName}`, 'success');
                this.refreshFiles();
            } catch (error) {
                this.showNotification(`Failed to create folder: ${error.message}`, 'error');
            }
        }
    }

    async uploadFilePrompt() {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = async (e) => {
            const files = e.target.files;
            for (const file of files) {
                try {
                    const reader = new FileReader();
                    reader.onload = async () => {
                        await this.vfs.writeFile(this.currentPath + file.name, reader.result);
                        this.showNotification(`Uploaded: ${file.name}`, 'success');
                        this.refreshFiles();
                    };
                    reader.readAsArrayBuffer(file);
                } catch (error) {
                    this.showNotification(`Failed to upload ${file.name}: ${error.message}`, 'error');
                }
            }
        };
        input.click();
    }

    async setActiveAdapter(adapterName) {
        try {
            await this.vfs.setActiveAdapter(adapterName);
            this.showNotification(`Switched to ${adapterName} adapter`, 'success');
            await this.populateAdapterList();
            this.refreshFiles();
            this.updateStatusBar();
        } catch (error) {
            this.showNotification(`Failed to switch adapter: ${error.message}`, 'error');
        }
    }

    handleFileClick(e) {
        const fileItem = e.target.closest('.file-item');
        if (!fileItem) return;
        
        const filePath = fileItem.dataset.path;
        const multiSelect = e.ctrlKey || e.metaKey;
        
        this.selectFile(filePath, multiSelect);
    }

    handleFileDoubleClick(e) {
        const fileItem = e.target.closest('.file-item');
        if (!fileItem) return;
        
        const filePath = fileItem.dataset.path;
        const fileType = fileItem.dataset.type;
        
        if (fileType === 'directory') {
            this.navigateToPath(filePath);
        } else {
            this.openFile(filePath);
        }
    }

    handleContextMenuAction(e) {
        const action = e.target.dataset.action;
        if (!action) return;
        
        // Context menu actions are handled in the createContextMenu method
        this.hideContextMenu();
    }

    handleKeyboardShortcuts(e) {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 'a':
                    e.preventDefault();
                    this.selectAll();
                    break;
                case 'c':
                    if (this.selectedFiles.length > 0) {
                        e.preventDefault();
                        this.copyFile(this.selectedFiles[0]);
                    }
                    break;
                case 'x':
                    if (this.selectedFiles.length > 0) {
                        e.preventDefault();
                        this.cutFile(this.selectedFiles[0]);
                    }
                    break;
                case 'r':
                    e.preventDefault();
                    this.refreshFiles();
                    break;
            }
        } else if (e.key === 'Delete' && this.selectedFiles.length > 0) {
            e.preventDefault();
            this.deleteFile(this.selectedFiles[0]);
        } else if (e.key === 'F2' && this.selectedFiles.length === 1) {
            e.preventDefault();
            this.renameFile(this.selectedFiles[0]);
        }
    }

    setupDragAndDrop() {
        const fileList = this.contentElement.querySelector('#file-list');
        
        fileList.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });
        
        fileList.addEventListener('drop', async (e) => {
            e.preventDefault();
            const files = e.dataTransfer.files;
            
            for (const file of files) {
                try {
                    const reader = new FileReader();
                    reader.onload = async () => {
                        await this.vfs.writeFile(this.currentPath + file.name, reader.result);
                        this.showNotification(`Dropped: ${file.name}`, 'success');
                        this.refreshFiles();
                    };
                    reader.readAsArrayBuffer(file);
                } catch (error) {
                    this.showNotification(`Failed to drop ${file.name}: ${error.message}`, 'error');
                }
            }
        });
    }

    hideContextMenu() {
        const contextMenu = this.contentElement.querySelector('#context-menu');
        if (contextMenu) {
            contextMenu.style.display = 'none';
        }
    }

    saveReplicationSettings() {
        const autoReplicate = document.querySelector('#auto-replicate')?.checked || false;
        const replicationDelay = document.querySelector('#replication-delay')?.value || 5;
        const sizeLimit = document.querySelector('#size-limit')?.value || 100;
        const excludeTypes = document.querySelector('#exclude-types')?.value || '.tmp,.log';
        
        const settings = {
            autoReplicate,
            replicationDelay: parseInt(replicationDelay),
            sizeLimit: parseInt(sizeLimit),
            excludeTypes: excludeTypes.split(',').map(type => type.trim())
        };
        
        localStorage.setItem('swissknife_replication_settings', JSON.stringify(settings));
        this.showNotification('Replication settings saved! ⚙️', 'success');
    }

    // Missing methods that are referenced in setupEventListeners
    async populateAdapterList() {
        const adapterList = this.contentElement?.querySelector('#adapter-list');
        if (!adapterList || !this.vfs?.adapters) return;
        
        adapterList.innerHTML = '';
        for (const [adapterName, adapter] of Object.entries(this.vfs.adapters)) {
            const adapterItem = document.createElement('div');
            adapterItem.className = 'adapter-item';
            adapterItem.innerHTML = `
                <span class="adapter-icon">💾</span>
                <span class="adapter-name">${adapterName}</span>
                <span class="adapter-status ${adapter.connected ? 'connected' : 'disconnected'}">
                    ${adapter.connected ? '✅' : '❌'}
                </span>
            `;
            adapterList.appendChild(adapterItem);
        }
    }

    debounceSearch(query) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.performSearch();
        }, 300);
    }

    async createFolderPrompt() {
        const folderName = prompt('Enter folder name:');
        if (folderName) {
            try {
                await this.vfs.createFolder(this.currentPath + folderName);
                this.showNotification(`Created folder: ${folderName}`, 'success');
                this.refreshFiles();
            } catch (error) {
                this.showNotification(`Failed to create folder: ${error.message}`, 'error');
            }
        }
    }

    async uploadFilePrompt() {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            for (const file of files) {
                try {
                    await this.vfs.writeFile(this.currentPath + file.name, await file.arrayBuffer());
                    this.showNotification(`Uploaded: ${file.name}`, 'success');
                } catch (error) {
                    this.showNotification(`Failed to upload ${file.name}: ${error.message}`, 'error');
                }
            }
            this.refreshFiles();
        });
        input.click();
    }

    handleFileClick(e) {
        const fileItem = e.target.closest('.file-item');
        if (!fileItem) return;
        
        const filePath = fileItem.dataset.path;
        const isMultiSelect = e.ctrlKey || e.metaKey;
        
        if (filePath) {
            this.selectFile(filePath, isMultiSelect);
        }
    }

    handleFileDoubleClick(e) {
        const fileItem = e.target.closest('.file-item');
        if (!fileItem) return;
        
        const filePath = fileItem.dataset.path;
        const fileType = fileItem.dataset.type;
        
        if (fileType === 'directory') {
            this.navigateToPath(filePath);
        } else {
            this.openFile(filePath);
        }
    }

    handleContextMenuAction(e) {
        const menuItem = e.target.closest('.context-menu-item');
        if (!menuItem) return;
        
        const action = menuItem.dataset.action;
        // Handle context menu actions based on the action type
        console.log('Context menu action:', action);
        this.hideContextMenu();
    }

    handleKeyboardShortcuts(e) {
        if (!this.contentElement?.contains(e.target)) return;
        
        switch (e.key) {
            case 'Delete':
                if (this.selectedFiles.length > 0) {
                    // Delete selected files
                    this.selectedFiles.forEach(filePath => this.deleteFile(filePath));
                }
                break;
            case 'F2':
                if (this.selectedFiles.length === 1) {
                    this.renameFile(this.selectedFiles[0]);
                }
                break;
            case 'F5':
                this.refreshFiles();
                break;
            case 'Escape':
                this.clearSelection();
                this.clearSearch();
                this.hideContextMenu();
                break;
        }
    }

    setupDragAndDrop() {
        const fileList = this.contentElement?.querySelector('#file-list');
        if (!fileList) return;
        
        fileList.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileList.classList.add('drag-over');
        });
        
        fileList.addEventListener('dragleave', () => {
            fileList.classList.remove('drag-over');
        });
        
        fileList.addEventListener('drop', async (e) => {
            e.preventDefault();
            fileList.classList.remove('drag-over');
            
            const files = Array.from(e.dataTransfer.files);
            for (const file of files) {
                try {
                    await this.vfs.writeFile(this.currentPath + file.name, await file.arrayBuffer());
                    this.showNotification(`Uploaded: ${file.name}`, 'success');
                } catch (error) {
                    this.showNotification(`Failed to upload ${file.name}: ${error.message}`, 'error');
                }
            }
            this.refreshFiles();
        });
    }

    cleanup() {
        // Clean up any intervals or event listeners if necessary
    }
}
