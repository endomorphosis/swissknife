/**
 * Enhanced Settings App for SwissKnife Web Desktop
 * Advanced configuration management with P2P network settings, ML optimization, and real-time monitoring
 */

export class SettingsApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.settings = {};
    this.unsavedChanges = false;
    this.currentSection = 'general';
    this.p2pSystem = null;
    this.monitoringInterval = null;
    this.systemMetrics = {
      cpu: 0,
      memory: 0,
      gpu: 0,
      network: 0,
      p2pConnections: 0,
      activeModels: 0
    };
    
    // Default settings structure
    this.defaultSettings = {
      general: {
        username: 'SwissKnife User',
        language: 'en',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        autoSave: true,
        notifications: true,
        telemetry: false
      },
      ai: {
        defaultProvider: 'openai',
        maxConcurrentTasks: 4,
        enableGPU: true,
        enableWebGPU: true,
        enableWebNN: false,
        modelCacheSize: 2048, // MB
        inferenceTimeout: 30000, // ms
        enableDistributedInference: true,
        preferredModels: {
          textGeneration: 'gpt-4',
          textEmbedding: 'text-embedding-ada-002',
          imageGeneration: 'dall-e-3',
          codeGeneration: 'gpt-4'
        }
      },
      p2p: {
        enableP2P: true,
        autoConnect: true,
        maxPeers: 50,
        enableRelay: true,
        enableDHT: true,
        enableModelSharing: true,
        enableTaskDistribution: true,
        securityLevel: 'high',
        allowIncomingConnections: true,
        bandwidthLimit: 0, // 0 = unlimited
        nodeId: null // Generated automatically
      },
      storage: {
        enableIPFS: true,
        ipfsGateway: 'https://ipfs.io',
        localCacheSize: 5120, // MB
        enableCompression: true,
        autoCleanup: true,
        cleanupInterval: 24, // hours
        enableVersioning: true,
        syncSettings: true
      },
      appearance: {
        theme: 'dark',
        accentColor: '#4a90e2',
        fontFamily: 'Segoe UI',
        fontSize: 14,
        enableAnimations: true,
        enableBlur: true,
        enableParticles: false,
        wallpaper: 'default',
        compactMode: false
      },
      security: {
        enableEncryption: true,
        encryptionStrength: 'AES-256-GCM',
        autoLockTimeout: 15, // minutes
        requireBiometric: false,
        enableAuditLog: true,
        enableSecureSharing: true,
        allowRemoteAccess: false,
        securityLevel: 'standard'
      },
      performance: {
        enableOptimization: true,
        maxMemoryUsage: 8192, // MB
        enableCaching: true,
        cacheStrategy: 'lru',
        enablePrefetching: true,
        networkOptimization: true,
        enableBackgroundTasks: true,
        powerSavingMode: false
      },
      developer: {
        enableDebugMode: false,
        enableConsoleLogging: false,
        enablePerformanceMetrics: true,
        enableNetworkMonitoring: true,
        enableAPITesting: false,
        developerTools: false
      }
    };
    
    this.initializeSettings();
  }

  async initializeSettings() {
    // Initialize with default settings
    this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
    
    // Connect to P2P system if available
    if (window.p2pMLSystem) {
      this.p2pSystem = window.p2pMLSystem;
      this.setupP2PIntegration();
    }
    
    // Start system monitoring
    this.startSystemMonitoring();
  }

  async initialize() {
    this.swissknife = this.desktop.swissknife;
    await this.loadSettings();
    this.applySettings();
  }

  async render() {
    const content = `
      <div class="settings-container enhanced">
        <div class="settings-sidebar">
          <div class="settings-nav">
            <div class="nav-item active" data-section="general">
              <span class="nav-icon">⚙️</span>
              <span class="nav-label">General</span>
            </div>
            <div class="nav-item" data-section="ai">
              <span class="nav-icon">🤖</span>
              <span class="nav-label">AI & Models</span>
            </div>
            <div class="nav-item" data-section="p2p">
              <span class="nav-icon">🌐</span>
              <span class="nav-label">P2P Network</span>
            </div>
            <div class="nav-item" data-section="storage">
              <span class="nav-icon">💾</span>
              <span class="nav-label">Storage</span>
            </div>
            <div class="nav-item" data-section="appearance">
              <span class="nav-icon">🎨</span>
              <span class="nav-label">Appearance</span>
            </div>
            <div class="nav-item" data-section="security">
              <span class="nav-icon">🔒</span>
              <span class="nav-label">Security</span>
            </div>
            <div class="nav-item" data-section="advanced">
              <span class="nav-icon">🔧</span>
              <span class="nav-label">Advanced</span>
            </div>
            <div class="nav-item" data-section="about">
              <span class="nav-icon">ℹ️</span>
              <span class="nav-label">About</span>
            </div>
          </div>
          
          <!-- Real-time monitoring panel -->
          <div class="monitoring-panel">
            <h4>System Status</h4>
            <div class="metric-row">
              <span>Memory:</span>
              <span id="memory-metric">${this.systemMetrics.memory || 0} MB</span>
            </div>
            <div class="metric-row">
              <span>P2P Peers:</span>
              <span id="p2p-metric">${this.systemMetrics.p2pConnections || 0}</span>
            </div>
            <div class="metric-row">
              <span>Active Models:</span>
              <span id="models-metric">${this.systemMetrics.activeModels || 0}</span>
            </div>
          </div>
        </div>
        
        <div class="settings-main">
          <div class="settings-header">
            <h2 id="section-title">General Settings</h2>
            <div class="settings-actions">
              <button class="btn btn-secondary" id="reset-btn">Reset to Defaults</button>
              <button class="btn btn-primary" id="save-btn" disabled>Save Changes</button>
            </div>
          </div>
          
          <div class="settings-content" id="settings-content">
            ${this.renderGeneralSettings()}
          </div>
        </div>
      </div>
    `;

    // Set up event listeners after content is rendered
    setTimeout(() => {
      this.setupEventListeners();
      this.renderCurrentSection();
    }, 100);

    return content;
  }

  setupEventListeners() {
    const navItems = document.querySelectorAll('.nav-item');
    const saveBtn = document.querySelector('#save-btn');
    const resetBtn = document.querySelector('#reset-btn');

    // Navigation
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        const section = item.dataset.section;
        this.currentSection = section;
        this.renderCurrentSection();
      });
    });

    // Save button
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.saveSettings();
      });
    }

    // Reset button
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all settings to defaults?')) {
          this.resetToDefaults();
        }
      });
    }

    // Start system monitoring
    this.startSystemMonitoring();
  }

  renderCurrentSection() {
    const content = document.getElementById('settings-content');
    const title = document.getElementById('section-title');
    
    if (!content || !title) return;

    const sections = {
      general: { title: 'General Settings', content: this.renderGeneralSection() },
      ai: { title: 'AI & Models', content: this.renderAISection() },
      p2p: { title: 'P2P Network', content: this.renderP2PSection() },
      storage: { title: 'Storage', content: this.renderStorageSection() },
      appearance: { title: 'Appearance', content: this.renderAppearanceSection() },
      security: { title: 'Security', content: this.renderSecuritySection() },
      advanced: { title: 'Advanced', content: this.renderAdvancedSection() },
      about: { title: 'About', content: this.renderAboutSection() }
    };

    const section = sections[this.currentSection];
    if (section) {
      title.textContent = section.title;
      content.innerHTML = section.content;
      this.setupSectionEventListeners();
    }
  }

  setupSectionEventListeners() {
    // Listen for input changes to enable save button
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      input.addEventListener('change', () => {
        this.unsavedChanges = true;
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) {
          saveBtn.disabled = false;
        }
      });
    });
  }

  setupP2PIntegration() {
    if (!this.p2pSystem) return;
    
    // Listen for P2P events
    this.p2pSystem.on('peer:connected', () => {
      this.updateSystemMetrics();
    });
    
    this.p2pSystem.on('peer:disconnected', () => {
      this.updateSystemMetrics();
    });
    
    this.p2pSystem.on('settings:sync', (remoteSettings) => {
      this.handleRemoteSettings(remoteSettings);
    });
  }

  startSystemMonitoring() {
    this.monitoringInterval = setInterval(() => {
      this.updateSystemMetrics();
    }, 2000);
  }

  async updateSystemMetrics() {
    try {
      // Get performance metrics
      if (performance.memory) {
        this.systemMetrics.memory = Math.round((performance.memory.usedJSHeapSize / 1024 / 1024) * 100) / 100;
      }
      
      // Get P2P connection count
      if (this.p2pSystem) {
        const peers = await this.p2pSystem.getConnectedPeers();
        this.systemMetrics.p2pConnections = peers.length;
      }
      
      // Get GPU info if available
      if (navigator.gpu) {
        this.systemMetrics.gpu = 1; // GPU available
      }
      
      // Update UI if monitoring panel is visible
      this.updateMonitoringPanel();
      
    } catch (error) {
      console.warn('Error updating system metrics:', error);
    }
  }

  createWindow() {
    const content = `
      <div class="settings-container enhanced">
        <div class="settings-sidebar">
          <div class="settings-nav">
            <div class="nav-item active" data-section="general">
              <span class="nav-icon">⚙️</span>
              <span class="nav-label">General</span>
            </div>
            <div class="nav-item" data-section="ai">
              <span class="nav-icon">🤖</span>
              <span class="nav-label">AI & Models</span>
            </div>
            <div class="nav-item" data-section="p2p">
              <span class="nav-icon">🌐</span>
              <span class="nav-label">P2P Network</span>
            </div>
            <div class="nav-item" data-section="storage">
              <span class="nav-icon">💾</span>
              <span class="nav-label">Storage & IPFS</span>
            </div>
            <div class="nav-item" data-section="appearance">
              <span class="nav-icon">🎨</span>
              <span class="nav-label">Appearance</span>
            </div>
            <div class="nav-item" data-section="security">
              <span class="nav-icon">🔒</span>
              <span class="nav-label">Security</span>
            </div>
            <div class="nav-item" data-section="performance">
              <span class="nav-icon">⚡</span>
              <span class="nav-label">Performance</span>
            </div>
            <div class="nav-item" data-section="developer">
              <span class="nav-icon">🔧</span>
              <span class="nav-label">Developer</span>
            </div>
            <div class="nav-item" data-section="monitoring">
              <span class="nav-icon">📊</span>
              <span class="nav-label">System Monitor</span>
            </div>
            <div class="nav-item" data-section="about">
              <span class="nav-icon">ℹ️</span>
              <span class="nav-label">About</span>
            </div>
          </div>
          
          <div class="settings-quick-status">
            <h4>🚀 System Status</h4>
            <div class="status-grid">
              <div class="status-item">
                <span class="status-label">P2P Peers:</span>
                <span class="status-value" id="peer-count">${this.systemMetrics.p2pConnections}</span>
              </div>
              <div class="status-item">
                <span class="status-label">Memory:</span>
                <span class="status-value" id="memory-usage">${this.systemMetrics.memory}MB</span>
              </div>
              <div class="status-item">
                <span class="status-label">GPU:</span>
                <span class="status-value" id="gpu-status">${this.systemMetrics.gpu ? '✅' : '❌'}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="settings-main">
          <div class="settings-header">
            <h2 id="section-title">General Settings</h2>
            <div class="settings-actions">
              <button id="reset-section" class="btn-secondary">🔄 Reset Section</button>
              <button id="export-settings" class="btn-secondary">📤 Export</button>
              <button id="import-settings" class="btn-secondary">📥 Import</button>
              <button id="save-settings" class="btn-primary" ${this.unsavedChanges ? '' : 'disabled'}>💾 Save Changes</button>
            </div>
          </div>
          
          <div class="settings-content" id="settings-content">
            ${this.renderGeneralSettings()}
          </div>
          
          ${this.unsavedChanges ? `
            <div class="unsaved-changes-banner">
              <span>⚠️ You have unsaved changes</span>
              <div class="banner-actions">
                <button onclick="settingsApp.saveAllSettings()" class="btn-primary">Save All</button>
                <button onclick="settingsApp.discardChanges()" class="btn-secondary">Discard</button>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    const window = this.desktop.createWindow({
      title: 'SwissKnife Settings',
      content: content,
      width: 1100,
      height: 750,
      resizable: true
    });

    this.setupEventListeners(window);
    return window;
  }

  renderGeneralSettings() {
    return `
      <div class="settings-section">
        <div class="section-header">
          <h3>🏠 General Preferences</h3>
          <p>Configure basic application settings and user preferences</p>
        </div>
        
        <div class="settings-grid">
          <div class="setting-group">
            <label for="username">Username</label>
            <input type="text" id="username" value="${this.settings.general.username}" 
                   onchange="settingsApp.updateSetting('general', 'username', this.value)">
            <span class="setting-description">Your display name in the application</span>
          </div>
          
          <div class="setting-group">
            <label for="language">Language</label>
            <select id="language" onchange="settingsApp.updateSetting('general', 'language', this.value)">
              <option value="en" ${this.settings.general.language === 'en' ? 'selected' : ''}>English</option>
              <option value="es" ${this.settings.general.language === 'es' ? 'selected' : ''}>Español</option>
              <option value="fr" ${this.settings.general.language === 'fr' ? 'selected' : ''}>Français</option>
              <option value="de" ${this.settings.general.language === 'de' ? 'selected' : ''}>Deutsch</option>
              <option value="zh" ${this.settings.general.language === 'zh' ? 'selected' : ''}>中文</option>
            </select>
            <span class="setting-description">Application interface language</span>
          </div>
          
          <div class="setting-group">
            <label for="timezone">Timezone</label>
            <select id="timezone" onchange="settingsApp.updateSetting('general', 'timezone', this.value)">
              ${this.renderTimezoneOptions()}
            </select>
            <span class="setting-description">Your local timezone for timestamps</span>
          </div>
          
          <div class="setting-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" id="auto-save" ${this.settings.general.autoSave ? 'checked' : ''}
                     onchange="settingsApp.updateSetting('general', 'autoSave', this.checked)">
              <span class="checkmark"></span>
              Enable Auto-Save
            </label>
            <span class="setting-description">Automatically save your work periodically</span>
          </div>
          
          <div class="setting-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" id="notifications" ${this.settings.general.notifications ? 'checked' : ''}
                     onchange="settingsApp.updateSetting('general', 'notifications', this.checked)">
              <span class="checkmark"></span>
              Enable Notifications
            </label>
            <span class="setting-description">Show system and application notifications</span>
          </div>
          
          <div class="setting-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" id="telemetry" ${this.settings.general.telemetry ? 'checked' : ''}
                     onchange="settingsApp.updateSetting('general', 'telemetry', this.checked)">
              <span class="checkmark"></span>
              Anonymous Telemetry
            </label>
            <span class="setting-description">Help improve SwissKnife by sharing anonymous usage data</span>
          </div>
        </div>
      </div>
    `;
  }

  renderTimezoneOptions() {
    const timezones = [
      'UTC',
      'America/New_York',
      'America/Chicago', 
      'America/Denver',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Australia/Sydney'
    ];
    
    return timezones.map(tz => 
      `<option value="${tz}" ${this.settings.general.timezone === tz ? 'selected' : ''}>${tz}</option>`
    ).join('');
  }
  }
          </div>
        </div>
        
        <div class="settings-main">
          <div class="settings-header">
            <h2 id="section-title">General Settings</h2>
            <div class="settings-actions">
              <button class="btn btn-secondary" id="reset-btn">Reset to Defaults</button>
              <button class="btn btn-primary" id="save-btn" disabled>Save Changes</button>
            </div>
          </div>
          
          <div class="settings-content" id="settings-content">
            <!-- Settings sections will be rendered here -->
          </div>
        </div>
      </div>
    `;

    const window = this.desktop.createWindow({
      title: 'Settings',
      content: content,
      width: 800,
      height: 600,
      resizable: true
    });

    this.setupEventListeners(window);
    this.renderSection(window, 'general');
    
    return window;
  }

  setupEventListeners(window) {
    const navItems = window.querySelectorAll('.nav-item');
    const saveBtn = window.querySelector('#save-btn');
    const resetBtn = window.querySelector('#reset-btn');

    // Navigation
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        const section = item.dataset.section;
        this.renderSection(window, section);
      });
    });

    // Save/Reset
    saveBtn.addEventListener('click', () => this.saveSettings(window));
    resetBtn.addEventListener('click', () => this.resetSettings(window));

    // Track changes
    window.addEventListener('input', () => this.markUnsaved(window));
    window.addEventListener('change', () => this.markUnsaved(window));
  }

  renderSection(window, section) {
    const content = window.querySelector('#settings-content');
    const title = window.querySelector('#section-title');
    
    const sections = {
      general: this.renderGeneralSection(),
      ai: this.renderAISection(),
      storage: this.renderStorageSection(),
      appearance: this.renderAppearanceSection(),
      security: this.renderSecuritySection(),
      advanced: this.renderAdvancedSection(),
      about: this.renderAboutSection()
    };

    const titles = {
      general: 'General Settings',
      ai: 'AI & Models',
      storage: 'Storage Configuration',
      appearance: 'Appearance',
      security: 'Security & Privacy',
      advanced: 'Advanced Settings',
      about: 'About SwissKnife'
    };

    title.textContent = titles[section];
    content.innerHTML = sections[section];
    
    // Setup section-specific event listeners
    this.setupSectionListeners(window, section);
  }

  renderGeneralSection() {
    return `
      <div class="settings-section">
        <div class="setting-group">
          <h3>Application Preferences</h3>
          
          <div class="setting-item">
            <label for="auto-save">Auto-save work</label>
            <input type="checkbox" id="auto-save" ${this.settings.autoSave ? 'checked' : ''}>
            <span class="setting-description">Automatically save your work every few minutes</span>
          </div>
          
          <div class="setting-item">
            <label for="startup-behavior">Startup behavior</label>
            <select id="startup-behavior">
              <option value="last-session" ${this.settings.startupBehavior === 'last-session' ? 'selected' : ''}>Restore last session</option>
              <option value="clean" ${this.settings.startupBehavior === 'clean' ? 'selected' : ''}>Start clean</option>
              <option value="home" ${this.settings.startupBehavior === 'home' ? 'selected' : ''}>Show home screen</option>
            </select>
          </div>
          
          <div class="setting-item">
            <label for="default-app">Default app for new windows</label>
            <select id="default-app">
              <option value="terminal" ${this.settings.defaultApp === 'terminal' ? 'selected' : ''}>Terminal</option>
              <option value="ai-chat" ${this.settings.defaultApp === 'ai-chat' ? 'selected' : ''}>AI Chat</option>
              <option value="file-manager" ${this.settings.defaultApp === 'file-manager' ? 'selected' : ''}>File Manager</option>
            </select>
          </div>
        </div>
        
        <div class="setting-group">
          <h3>Notifications</h3>
          
          <div class="setting-item">
            <label for="enable-notifications">Enable notifications</label>
            <input type="checkbox" id="enable-notifications" ${this.settings.enableNotifications ? 'checked' : ''}>
            <span class="setting-description">Show desktop notifications for important events</span>
          </div>
          
          <div class="setting-item">
            <label for="notification-sound">Notification sound</label>
            <input type="checkbox" id="notification-sound" ${this.settings.notificationSound ? 'checked' : ''}>
          </div>
        </div>
      </div>
    `;
  }

  renderAISection() {
    return `
      <div class="settings-section">
        <div class="setting-group">
          <h3>API Configuration</h3>
          
          <div class="setting-item">
            <label for="openai-api-key">OpenAI API Key</label>
            <div class="input-group">
              <input type="password" id="openai-api-key" value="${this.settings.openaiApiKey || ''}" placeholder="sk-...">
              <button class="btn btn-secondary" id="test-openai">Test</button>
            </div>
            <span class="setting-description">Required for GPT models</span>
          </div>
          
          <div class="setting-item">
            <label for="anthropic-api-key">Anthropic API Key</label>
            <div class="input-group">
              <input type="password" id="anthropic-api-key" value="${this.settings.anthropicApiKey || ''}" placeholder="sk-ant-...">
              <button class="btn btn-secondary" id="test-anthropic">Test</button>
            </div>
            <span class="setting-description">Required for Claude models</span>
          </div>
          
          <div class="setting-item">
            <label for="default-model">Default AI Model</label>
            <select id="default-model">
              <option value="gpt-4" ${this.settings.defaultModel === 'gpt-4' ? 'selected' : ''}>GPT-4</option>
              <option value="gpt-3.5-turbo" ${this.settings.defaultModel === 'gpt-3.5-turbo' ? 'selected' : ''}>GPT-3.5 Turbo</option>
              <option value="claude-3" ${this.settings.defaultModel === 'claude-3' ? 'selected' : ''}>Claude 3</option>
            </select>
          </div>
        </div>
        
        <div class="setting-group">
          <h3>Local AI Models</h3>
          
          <div class="setting-item">
            <label for="enable-webnn">Enable WebNN acceleration</label>
            <input type="checkbox" id="enable-webnn" ${this.settings.enableWebNN ? 'checked' : ''}>
            <span class="setting-description">Use WebNN for local model inference (experimental)</span>
          </div>
          
          <div class="setting-item">
            <label for="enable-webgpu">Enable WebGPU acceleration</label>
            <input type="checkbox" id="enable-webgpu" ${this.settings.enableWebGPU ? 'checked' : ''}>
            <span class="setting-description">Use WebGPU for local model inference</span>
          </div>
          
          <div class="setting-item">
            <label>Installed Models</label>
            <div class="model-list" id="model-list">
              <div class="model-item">
                <span class="model-name">Loading...</span>
                <button class="btn btn-small">Remove</button>
              </div>
            </div>
            <button class="btn btn-secondary" id="install-model">Install New Model</button>
          </div>
        </div>
      </div>
    `;
  }

  renderP2PSection() {
    return `
      <div class="settings-section">
        <div class="setting-group">
          <h3>P2P Network Configuration</h3>
          
          <div class="setting-item">
            <label for="enable-p2p">Enable P2P networking</label>
            <input type="checkbox" id="enable-p2p" ${this.settings.p2p?.enabled ? 'checked' : ''}>
            <span class="setting-description">Connect to peer-to-peer network for distributed computing</span>
          </div>
          
          <div class="setting-item">
            <label for="p2p-port">P2P Port</label>
            <input type="number" id="p2p-port" value="${this.settings.p2p?.port || 9090}" min="1024" max="65535">
            <span class="setting-description">Port for incoming P2P connections</span>
          </div>
          
          <div class="setting-item">
            <label for="max-peers">Maximum Peers</label>
            <select id="max-peers">
              <option value="5" ${this.settings.p2p?.maxPeers === 5 ? 'selected' : ''}>5</option>
              <option value="10" ${this.settings.p2p?.maxPeers === 10 ? 'selected' : ''}>10</option>
              <option value="25" ${this.settings.p2p?.maxPeers === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${this.settings.p2p?.maxPeers === 50 ? 'selected' : ''}>50</option>
            </select>
          </div>
          
          <div class="setting-item">
            <label for="enable-discovery">Enable peer discovery</label>
            <input type="checkbox" id="enable-discovery" ${this.settings.p2p?.enableDiscovery ? 'checked' : ''}>
            <span class="setting-description">Automatically discover peers on the network</span>
          </div>
        </div>
        
        <div class="setting-group">
          <h3>Distributed Computing</h3>
          
          <div class="setting-item">
            <label for="share-compute">Share compute resources</label>
            <input type="checkbox" id="share-compute" ${this.settings.p2p?.shareCompute ? 'checked' : ''}>
            <span class="setting-description">Allow other peers to use your computing power</span>
          </div>
          
          <div class="setting-item">
            <label for="max-compute-share">Max compute share (%)</label>
            <input type="range" id="max-compute-share" min="10" max="90" value="${this.settings.p2p?.maxComputeShare || 50}">
            <span class="range-value">${this.settings.p2p?.maxComputeShare || 50}%</span>
          </div>
          
          <div class="setting-item">
            <label for="bandwidth-limit">Bandwidth limit (MB/s)</label>
            <select id="bandwidth-limit">
              <option value="1" ${this.settings.p2p?.bandwidthLimit === 1 ? 'selected' : ''}>1 MB/s</option>
              <option value="5" ${this.settings.p2p?.bandwidthLimit === 5 ? 'selected' : ''}>5 MB/s</option>
              <option value="10" ${this.settings.p2p?.bandwidthLimit === 10 ? 'selected' : ''}>10 MB/s</option>
              <option value="0" ${this.settings.p2p?.bandwidthLimit === 0 ? 'selected' : ''}>Unlimited</option>
            </select>
          </div>
        </div>
        
        <div class="setting-group">
          <h3>Network Status</h3>
          <div class="network-status" id="p2p-status">
            <div class="status-item">
              <span>Connected Peers:</span>
              <span id="connected-peers">${this.systemMetrics.p2pConnections || 0}</span>
            </div>
            <div class="status-item">
              <span>Network ID:</span>
              <span id="network-id">Loading...</span>
            </div>
            <div class="status-item">
              <span>Node Status:</span>
              <span id="node-status" class="status-indicator">Connecting...</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderStorageSection() {
    return `
      <div class="settings-section">
        <div class="setting-group">
          <h3>Content-Addressed Storage</h3>
          
          <div class="setting-item">
            <label for="ipfs-gateway">IPFS Gateway</label>
            <input type="text" id="ipfs-gateway" value="${this.settings.ipfsGateway || 'https://ipfs.io'}" placeholder="https://ipfs.io">
            <span class="setting-description">Gateway for IPFS content retrieval</span>
          </div>
          
          <div class="setting-item">
            <label for="ipfs-api">IPFS API Endpoint</label>
            <input type="text" id="ipfs-api" value="${this.settings.ipfsApi || '/ip4/127.0.0.1/tcp/5001'}" placeholder="/ip4/127.0.0.1/tcp/5001">
            <span class="setting-description">Local IPFS node API endpoint</span>
          </div>
          
          <div class="setting-item">
            <label for="storage-provider">Primary Storage Provider</label>
            <select id="storage-provider">
              <option value="ipfs" ${this.settings.storageProvider === 'ipfs' ? 'selected' : ''}>IPFS</option>
              <option value="localstorage" ${this.settings.storageProvider === 'localstorage' ? 'selected' : ''}>Browser Local Storage</option>
              <option value="indexeddb" ${this.settings.storageProvider === 'indexeddb' ? 'selected' : ''}>IndexedDB</option>
            </select>
          </div>
        </div>
        
        <div class="setting-group">
          <h3>Storage Limits</h3>
          
          <div class="setting-item">
            <label for="max-cache-size">Maximum cache size</label>
            <select id="max-cache-size">
              <option value="100" ${this.settings.maxCacheSize === 100 ? 'selected' : ''}>100 MB</option>
              <option value="500" ${this.settings.maxCacheSize === 500 ? 'selected' : ''}>500 MB</option>
              <option value="1000" ${this.settings.maxCacheSize === 1000 ? 'selected' : ''}>1 GB</option>
              <option value="2000" ${this.settings.maxCacheSize === 2000 ? 'selected' : ''}>2 GB</option>
            </select>
          </div>
          
          <div class="setting-item">
            <label for="auto-cleanup">Auto-cleanup old files</label>
            <input type="checkbox" id="auto-cleanup" ${this.settings.autoCleanup ? 'checked' : ''}>
            <span class="setting-description">Automatically remove old cached files when storage is full</span>
          </div>
        </div>
        
        <div class="setting-group">
          <h3>Storage Status</h3>
          <div class="storage-status" id="storage-status">
            <div class="status-item">
              <span>Used Space:</span>
              <span id="used-space">Loading...</span>
            </div>
            <div class="status-item">
              <span>Available Space:</span>
              <span id="available-space">Loading...</span>
            </div>
            <div class="status-item">
              <span>IPFS Status:</span>
              <span id="ipfs-status">Checking...</span>
            </div>
          </div>
          <button class="btn btn-secondary" id="clear-cache">Clear Cache</button>
        </div>
      </div>
    `;
  }

  renderAppearanceSection() {
    return `
      <div class="settings-section">
        <div class="setting-group">
          <h3>Theme</h3>
          
          <div class="setting-item">
            <label for="theme">Color theme</label>
            <select id="theme">
              <option value="system" ${this.settings.theme === 'system' ? 'selected' : ''}>System Default</option>
              <option value="light" ${this.settings.theme === 'light' ? 'selected' : ''}>Light</option>
              <option value="dark" ${this.settings.theme === 'dark' ? 'selected' : ''}>Dark</option>
              <option value="classic" ${this.settings.theme === 'classic' ? 'selected' : ''}>Classic CDE</option>
            </select>
          </div>
          
          <div class="setting-item">
            <label for="accent-color">Accent color</label>
            <input type="color" id="accent-color" value="${this.settings.accentColor || '#0066cc'}">
          </div>
        </div>
        
        <div class="setting-group">
          <h3>Desktop</h3>
          
          <div class="setting-item">
            <label for="wallpaper">Desktop wallpaper</label>
            <select id="wallpaper">
              <option value="default" ${this.settings.wallpaper === 'default' ? 'selected' : ''}>Default Gradient</option>
              <option value="solid" ${this.settings.wallpaper === 'solid' ? 'selected' : ''}>Solid Color</option>
              <option value="pattern" ${this.settings.wallpaper === 'pattern' ? 'selected' : ''}>Pattern</option>
              <option value="custom" ${this.settings.wallpaper === 'custom' ? 'selected' : ''}>Custom Image</option>
            </select>
          </div>
          
          <div class="setting-item">
            <label for="show-desktop-icons">Show desktop icons</label>
            <input type="checkbox" id="show-desktop-icons" ${this.settings.showDesktopIcons !== false ? 'checked' : ''}>
          </div>
          
          <div class="setting-item">
            <label for="taskbar-position">Taskbar position</label>
            <select id="taskbar-position">
              <option value="bottom" ${this.settings.taskbarPosition === 'bottom' ? 'selected' : ''}>Bottom</option>
              <option value="top" ${this.settings.taskbarPosition === 'top' ? 'selected' : ''}>Top</option>
              <option value="left" ${this.settings.taskbarPosition === 'left' ? 'selected' : ''}>Left</option>
              <option value="right" ${this.settings.taskbarPosition === 'right' ? 'selected' : ''}>Right</option>
            </select>
          </div>
        </div>
        
        <div class="setting-group">
          <h3>Fonts & Display</h3>
          
          <div class="setting-item">
            <label for="font-family">Font family</label>
            <select id="font-family">
              <option value="system" ${this.settings.fontFamily === 'system' ? 'selected' : ''}>System Default</option>
              <option value="monospace" ${this.settings.fontFamily === 'monospace' ? 'selected' : ''}>Monospace</option>
              <option value="serif" ${this.settings.fontFamily === 'serif' ? 'selected' : ''}>Serif</option>
              <option value="sans-serif" ${this.settings.fontFamily === 'sans-serif' ? 'selected' : ''}>Sans-serif</option>
            </select>
          </div>
          
          <div class="setting-item">
            <label for="font-size">Font size</label>
            <select id="font-size">
              <option value="small" ${this.settings.fontSize === 'small' ? 'selected' : ''}>Small</option>
              <option value="medium" ${this.settings.fontSize === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="large" ${this.settings.fontSize === 'large' ? 'selected' : ''}>Large</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }

  renderSecuritySection() {
    return `
      <div class="settings-section">
        <div class="setting-group">
          <h3>Data Protection</h3>
          
          <div class="setting-item">
            <label for="encrypt-storage">Encrypt local storage</label>
            <input type="checkbox" id="encrypt-storage" ${this.settings.encryptStorage ? 'checked' : ''}>
            <span class="setting-description">Encrypt sensitive data stored locally</span>
          </div>
          
          <div class="setting-item">
            <label for="auto-lock">Auto-lock after inactivity</label>
            <select id="auto-lock">
              <option value="never" ${this.settings.autoLock === 'never' ? 'selected' : ''}>Never</option>
              <option value="5" ${this.settings.autoLock === '5' ? 'selected' : ''}>5 minutes</option>
              <option value="15" ${this.settings.autoLock === '15' ? 'selected' : ''}>15 minutes</option>
              <option value="30" ${this.settings.autoLock === '30' ? 'selected' : ''}>30 minutes</option>
              <option value="60" ${this.settings.autoLock === '60' ? 'selected' : ''}>1 hour</option>
            </select>
          </div>
        </div>
        
        <div class="setting-group">
          <h3>Privacy</h3>
          
          <div class="setting-item">
            <label for="telemetry">Send usage telemetry</label>
            <input type="checkbox" id="telemetry" ${this.settings.telemetry ? 'checked' : ''}>
            <span class="setting-description">Help improve SwissKnife by sending anonymous usage data</span>
          </div>
          
          <div class="setting-item">
            <label for="crash-reports">Send crash reports</label>
            <input type="checkbox" id="crash-reports" ${this.settings.crashReports ? 'checked' : ''}>
          </div>
          
          <div class="setting-item">
            <label for="clear-on-exit">Clear data on exit</label>
            <input type="checkbox" id="clear-on-exit" ${this.settings.clearOnExit ? 'checked' : ''}>
            <span class="setting-description">Clear temporary data when closing the application</span>
          </div>
        </div>
        
        <div class="setting-group">
          <h3>Data Management</h3>
          <button class="btn btn-danger" id="clear-all-data">Clear All Data</button>
          <button class="btn btn-secondary" id="export-data">Export Data</button>
          <button class="btn btn-secondary" id="import-data">Import Data</button>
        </div>
      </div>
    `;
  }

  renderAdvancedSection() {
    return `
      <div class="settings-section">
        <div class="setting-group">
          <h3>Developer Options</h3>
          
          <div class="setting-item">
            <label for="debug-mode">Debug mode</label>
            <input type="checkbox" id="debug-mode" ${this.settings.debugMode ? 'checked' : ''}>
            <span class="setting-description">Enable verbose logging and debug features</span>
          </div>
          
          <div class="setting-item">
            <label for="console-access">Enable console access</label>
            <input type="checkbox" id="console-access" ${this.settings.consoleAccess ? 'checked' : ''}>
            <span class="setting-description">Allow access to browser developer console</span>
          </div>
          
          <div class="setting-item">
            <label for="experimental-features">Enable experimental features</label>
            <input type="checkbox" id="experimental-features" ${this.settings.experimentalFeatures ? 'checked' : ''}>
            <span class="setting-description">Access to beta and experimental functionality</span>
          </div>
        </div>
        
        <div class="setting-group">
          <h3>Performance</h3>
          
          <div class="setting-item">
            <label for="max-workers">Maximum worker threads</label>
            <select id="max-workers">
              <option value="1" ${this.settings.maxWorkers === 1 ? 'selected' : ''}>1</option>
              <option value="2" ${this.settings.maxWorkers === 2 ? 'selected' : ''}>2</option>
              <option value="4" ${this.settings.maxWorkers === 4 ? 'selected' : ''}>4</option>
              <option value="auto" ${this.settings.maxWorkers === 'auto' ? 'selected' : ''}>Auto</option>
            </select>
          </div>
          
          <div class="setting-item">
            <label for="memory-limit">Memory limit (MB)</label>
            <input type="number" id="memory-limit" value="${this.settings.memoryLimit || 512}" min="256" max="2048" step="256">
          </div>
        </div>
      </div>
    `;
  }

  renderAboutSection() {
    return `
      <div class="settings-section about-section">
        <div class="about-header">
          <div class="app-icon">🔧</div>
          <div class="app-info">
            <h2>SwissKnife Web</h2>
            <p>Version 1.0.0-beta</p>
            <p>A browser-based AI-powered toolkit</p>
          </div>
        </div>
        
        <div class="about-details">
          <div class="detail-group">
            <h3>System Information</h3>
            <div class="detail-item">
              <span>Platform:</span>
              <span id="platform">${navigator.platform}</span>
            </div>
            <div class="detail-item">
              <span>User Agent:</span>
              <span id="user-agent">${navigator.userAgent}</span>
            </div>
            <div class="detail-item">
              <span>Available Memory:</span>
              <span id="memory">${navigator.deviceMemory || 'Unknown'} GB</span>
            </div>
            <div class="detail-item">
              <span>CPU Cores:</span>
              <span id="cpu-cores">${navigator.hardwareConcurrency || 'Unknown'}</span>
            </div>
          </div>
          
          <div class="detail-group">
            <h3>Feature Support</h3>
            <div class="detail-item">
              <span>WebAssembly:</span>
              <span class="${typeof WebAssembly !== 'undefined' ? 'supported' : 'not-supported'}">
                ${typeof WebAssembly !== 'undefined' ? 'Supported' : 'Not Supported'}
              </span>
            </div>
            <div class="detail-item">
              <span>WebGPU:</span>
              <span class="${'gpu' in navigator ? 'supported' : 'not-supported'}">
                ${'gpu' in navigator ? 'Supported' : 'Not Supported'}
              </span>
            </div>
            <div class="detail-item">
              <span>WebNN:</span>
              <span class="${'ml' in navigator ? 'supported' : 'not-supported'}">
                ${'ml' in navigator ? 'Supported' : 'Not Supported'}
              </span>
            </div>
            <div class="detail-item">
              <span>IndexedDB:</span>
              <span class="${'indexedDB' in window ? 'supported' : 'not-supported'}">
                ${'indexedDB' in window ? 'Supported' : 'Not Supported'}
              </span>
            </div>
          </div>
          
          <div class="detail-group">
            <h3>Links</h3>
            <div class="link-buttons">
              <button class="btn btn-secondary" onclick="window.open('https://github.com/barberb/swissknife', '_blank')">
                GitHub Repository
              </button>
              <button class="btn btn-secondary" onclick="window.open('https://swissknife.ai/docs', '_blank')">
                Documentation
              </button>
              <button class="btn btn-secondary" onclick="window.open('https://swissknife.ai/support', '_blank')">
                Support
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  setupSectionListeners(window, section) {
    if (section === 'ai') {
      const testOpenAI = window.querySelector('#test-openai');
      const testAnthropic = window.querySelector('#test-anthropic');
      
      if (testOpenAI) {
        testOpenAI.addEventListener('click', () => this.testAPIKey(window, 'openai'));
      }
      if (testAnthropic) {
        testAnthropic.addEventListener('click', () => this.testAPIKey(window, 'anthropic'));
      }
    }
    
    if (section === 'storage') {
      this.updateStorageStatus(window);
      
      const clearCache = window.querySelector('#clear-cache');
      if (clearCache) {
        clearCache.addEventListener('click', () => this.clearCache(window));
      }
    }
    
    if (section === 'security') {
      const clearAllData = window.querySelector('#clear-all-data');
      const exportData = window.querySelector('#export-data');
      const importData = window.querySelector('#import-data');
      
      if (clearAllData) {
        clearAllData.addEventListener('click', () => this.clearAllData(window));
      }
      if (exportData) {
        exportData.addEventListener('click', () => this.exportData(window));
      }
      if (importData) {
        importData.addEventListener('click', () => this.importData(window));
      }
    }
  }

  async loadSettings() {
    try {
      const stored = localStorage.getItem('swissknife_settings');
      this.settings = stored ? JSON.parse(stored) : this.getDefaultSettings();
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.settings = this.getDefaultSettings();
    }
  }

  getDefaultSettings() {
    return {
      // General
      autoSave: true,
      startupBehavior: 'last-session',
      defaultApp: 'terminal',
      enableNotifications: true,
      notificationSound: false,
      
      // AI
      openaiApiKey: '',
      anthropicApiKey: '',
      defaultModel: 'gpt-4',
      enableWebNN: false,
      enableWebGPU: false,
      
      // Storage
      ipfsGateway: 'https://ipfs.io',
      ipfsApi: '/ip4/127.0.0.1/tcp/5001',
      storageProvider: 'indexeddb',
      maxCacheSize: 500,
      autoCleanup: true,
      
      // Appearance
      theme: 'system',
      accentColor: '#0066cc',
      wallpaper: 'default',
      showDesktopIcons: true,
      taskbarPosition: 'bottom',
      fontFamily: 'system',
      fontSize: 'medium',
      
      // Security
      encryptStorage: false,
      autoLock: 'never',
      telemetry: false,
      crashReports: false,
      clearOnExit: false,
      
      // Advanced
      debugMode: false,
      consoleAccess: false,
      experimentalFeatures: false,
      maxWorkers: 'auto',
      memoryLimit: 512
    };
  }

  markUnsaved(window) {
    this.unsavedChanges = true;
    const saveBtn = window.querySelector('#save-btn');
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes *';
  }

  async saveSettings(window) {
    try {
      // Collect all settings from the form
      const formData = new FormData();
      const inputs = window.querySelectorAll('input, select');
      
      inputs.forEach(input => {
        if (input.type === 'checkbox') {
          this.settings[this.toCamelCase(input.id)] = input.checked;
        } else {
          this.settings[this.toCamelCase(input.id)] = input.value;
        }
      });
      
      // Save to localStorage
      localStorage.setItem('swissknife_settings', JSON.stringify(this.settings));
      
      // Apply settings to SwissKnife
      if (this.swissknife && this.swissknife.configure) {
        await this.swissknife.configure(this.settings);
      }
      
      // Update UI
      this.unsavedChanges = false;
      const saveBtn = window.querySelector('#save-btn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Save Changes';
      
      this.desktop.showNotification('Settings saved successfully', 'success');
      
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.desktop.showNotification('Failed to save settings: ' + error.message, 'error');
    }
  }

  async resetSettings(window) {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      this.settings = this.getDefaultSettings();
      localStorage.removeItem('swissknife_settings');
      
      // Re-render current section
      const activeNav = window.querySelector('.nav-item.active');
      const section = activeNav.dataset.section;
      this.renderSection(window, section);
      
      this.desktop.showNotification('Settings reset to defaults', 'success');
    }
  }

  async testAPIKey(window, provider) {
    const keyInput = window.querySelector(`#${provider}-api-key`);
    const testBtn = window.querySelector(`#test-${provider}`);
    
    if (!keyInput.value) {
      this.desktop.showNotification('Please enter an API key first', 'warning');
      return;
    }
    
    testBtn.textContent = 'Testing...';
    testBtn.disabled = true;
    
    try {
      const result = await this.swissknife.testAPIKey({
        provider: provider,
        apiKey: keyInput.value
      });
      
      if (result.success) {
        this.desktop.showNotification(`${provider} API key is valid`, 'success');
      } else {
        this.desktop.showNotification(`${provider} API key test failed: ${result.error}`, 'error');
      }
    } catch (error) {
      this.desktop.showNotification(`Failed to test ${provider} API key: ${error.message}`, 'error');
    } finally {
      testBtn.textContent = 'Test';
      testBtn.disabled = false;
    }
  }

  async updateStorageStatus(window) {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        const used = estimate.usage || 0;
        const quota = estimate.quota || 0;
        
        window.querySelector('#used-space').textContent = this.formatBytes(used);
        window.querySelector('#available-space').textContent = this.formatBytes(quota - used);
      }
      
      // Check IPFS status
      const ipfsStatus = window.querySelector('#ipfs-status');
      try {
        const status = await this.swissknife.storage.status();
        ipfsStatus.textContent = status.connected ? 'Connected' : 'Disconnected';
        ipfsStatus.style.color = status.connected ? 'green' : 'red';
      } catch (error) {
        ipfsStatus.textContent = 'Error';
        ipfsStatus.style.color = 'red';
      }
    } catch (error) {
      console.error('Failed to update storage status:', error);
    }
  }

  async clearCache(window) {
    if (confirm('Are you sure you want to clear all cached data?')) {
      try {
        await this.swissknife.storage.clearCache();
        this.updateStorageStatus(window);
        this.desktop.showNotification('Cache cleared successfully', 'success');
      } catch (error) {
        this.desktop.showNotification('Failed to clear cache: ' + error.message, 'error');
      }
    }
  }

  async clearAllData(window) {
    if (confirm('Are you sure you want to clear ALL data? This cannot be undone.')) {
      try {
        localStorage.clear();
        if ('indexedDB' in window) {
          // Clear IndexedDB databases
          const databases = await indexedDB.databases();
          await Promise.all(databases.map(db => {
            return new Promise((resolve, reject) => {
              const deleteReq = indexedDB.deleteDatabase(db.name);
              deleteReq.onsuccess = () => resolve();
              deleteReq.onerror = () => reject(deleteReq.error);
            });
          }));
        }
        
        this.desktop.showNotification('All data cleared successfully', 'success');
        setTimeout(() => window.location.reload(), 2000);
      } catch (error) {
        this.desktop.showNotification('Failed to clear data: ' + error.message, 'error');
      }
    }
  }

  async exportData(window) {
    try {
      const data = {
        settings: this.settings,
        conversations: JSON.parse(localStorage.getItem('swissknife_conversations') || '[]'),
        // Add other exportable data
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `swissknife-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.desktop.showNotification('Data exported successfully', 'success');
    } catch (error) {
      this.desktop.showNotification('Failed to export data: ' + error.message, 'error');
    }
  }

  async importData(window) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (data.settings) {
          this.settings = { ...this.getDefaultSettings(), ...data.settings };
          localStorage.setItem('swissknife_settings', JSON.stringify(this.settings));
        }
        
        if (data.conversations) {
          localStorage.setItem('swissknife_conversations', JSON.stringify(data.conversations));
        }
        
        this.desktop.showNotification('Data imported successfully', 'success');
        setTimeout(() => window.location.reload(), 2000);
      } catch (error) {
        this.desktop.showNotification('Failed to import data: ' + error.message, 'error');
      }
    };
    
    input.click();
  }

  toCamelCase(str) {
    return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
