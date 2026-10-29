/**
 * Enhanced Settings App for SwissKnife Web Desktop
 * Complete configuration management with live system monitoring and comprehensive preference panels
 */

export class SettingsApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.settings = {};
    this.unsavedChanges = false;
    this.currentSection = 'general';
    this.systemMetrics = {
      memory: 0,
      p2pConnections: 0,
      activeModels: 0
    };
    
    // Default settings
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
        modelCacheSize: 2048,
        inferenceTimeout: 30000
      },
      p2p: {
        enableP2P: true,
        autoConnect: true,
        maxPeers: 50,
        enableModelSharing: true,
        enableTaskDistribution: true,
        securityLevel: 'high'
      },
      appearance: {
        theme: 'dark',
        accentColor: '#4a90e2',
        fontFamily: 'Segoe UI',
        fontSize: 14,
        enableAnimations: true,
        enableBlur: true
      },
      security: {
        enableEncryption: true,
        autoLockTimeout: 15,
        enableAuditLog: true,
        securityLevel: 'standard'
      }
    };
    
    this.initializeSettings();
  }

  async initializeSettings() {
    this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
    this.startSystemMonitoring();
  }

  async initialize() {
    this.swissknife = this.desktop.swissknife;
    await this.loadSettings();
    this.applySettings();
  }

  async render() {
    this.ensureSettings();
    const content = `
      <div class="settings-container enhanced">
        <style>
          .settings-container.enhanced { display: flex; align-items: stretch; max-width: 100%; max-height: 100%; height: 100%; min-height: 0; overflow: hidden; }
          .settings-container .settings-sidebar { flex: 0 0 auto; max-width: 100%; min-height: 0; overflow: auto; }
          .settings-container .settings-main { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
          .settings-container .settings-header { position: static; display: flex; flex-direction: column; align-items: stretch; gap: 0.35rem; flex: 0 0 auto; }
          .settings-container .settings-header h2, .settings-container #applied-appearance, .settings-container #settings-feedback { position: static !important; display: block !important; clear: both; inset: auto !important; top: auto !important; transform: none !important; height: auto !important; margin: 0 0 0.25rem; line-height: 1.4; white-space: normal; overflow: visible; opacity: 1 !important; color: #1c2430 !important; background: transparent; text-shadow: none; }
          .settings-container #settings-feedback:empty { min-height: 0; margin: 0; }
          .settings-container .settings-actions { display: flex; flex-wrap: wrap; gap: 0.35rem; }
          .settings-container .settings-actions .btn-secondary { color: #1c2430 !important; background: #e8eef5 !important; border: 1px solid #64748b !important; }
          .settings-container .settings-content { flex: 1 1 auto; min-height: 0; overflow-x: hidden; overflow-y: auto; padding-bottom: 5.5rem; }
          .settings-container .settings-nav { display: flex; flex-wrap: wrap; gap: 4px; max-width: 100%; overflow-x: auto; }
          .settings-container .nav-item, .settings-container .nav-label, .settings-container .checkbox-label { white-space: nowrap; word-break: normal; overflow-wrap: normal; }
          .settings-container .nav-item { color: var(--sk-text-primary, var(--text-primary, #1c2430)); background: transparent; border: 0; text-align: left; }
          .settings-container .section-header { position: static !important; display: flex !important; flex-direction: column; gap: 0.25rem; height: auto; }
          .settings-container .section-header h3, .settings-container .section-header p { position: static !important; display: block !important; inset: auto !important; top: auto !important; transform: none !important; height: auto !important; margin: 0; opacity: 1 !important; line-height: 1.35; color: #1c2430 !important; text-shadow: none; }
          .settings-container .setting-description { display: block; clear: both; max-width: 100%; color: #334155; word-break: normal; overflow-wrap: normal; }
          .settings-container .sk-input, .settings-container .sk-select, .settings-container #accent-color { color: #1c2430 !important; background: #ffffff !important; border: 1px solid #94a3b8 !important; min-height: 2.25rem; max-width: 100%; }
          .settings-container .monitoring-panel, .settings-container .monitoring-panel h4, .settings-container .metric-row { color: #1c2430 !important; opacity: 1; }
          .settings-container button:focus-visible, .settings-container input:focus-visible, .settings-container select:focus-visible { outline: 2px solid var(--sk-focus-ring, #4a90e2); outline-offset: 2px; }
        </style>
        <div class="settings-sidebar">
          <div class="settings-nav">
            <button type="button" class="nav-item active" data-section="general" aria-label="General">
              <span class="nav-icon" aria-hidden="true">⚙️</span>
              <span class="nav-label">General</span>
            </button>
            <button type="button" class="nav-item" data-section="ai" aria-label="AI and models">
              <span class="nav-icon" aria-hidden="true">🤖</span>
              <span class="nav-label">AI & Models</span>
            </button>
            <button type="button" class="nav-item" data-section="p2p" aria-label="P2P network">
              <span class="nav-icon" aria-hidden="true">🌐</span>
              <span class="nav-label">P2P Network</span>
            </button>
            <button type="button" class="nav-item" data-section="appearance" aria-label="Appearance">
              <span class="nav-icon" aria-hidden="true">🎨</span>
              <span class="nav-label">Appearance</span>
            </button>
            <button type="button" class="nav-item" data-section="security" aria-label="Security">
              <span class="nav-icon" aria-hidden="true">🔒</span>
              <span class="nav-label">Security</span>
            </button>
            <button type="button" class="nav-item" data-section="about" aria-label="About">
              <span class="nav-icon" aria-hidden="true">ℹ️</span>
              <span class="nav-label">About</span>
            </button>
          </div>
          
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
            <p id="applied-appearance" aria-live="polite">Theme ${this.settings.appearance.theme}</p>
            <p id="settings-feedback" role="status"></p>
            <div class="settings-actions">
              <button type="button" class="btn btn-secondary sk-btn" id="discard-btn">Discard unsaved changes</button>
              <button type="button" class="btn btn-secondary sk-btn" id="reset-btn">Reset to Defaults</button>
              <button type="button" class="btn btn-primary sk-btn sk-btn-primary" id="save-btn" disabled>Save Changes</button>
            </div>
          </div>
          
          <div class="settings-content" id="settings-content">
            ${this.renderGeneralSettings()}
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      this.setupEventListeners();
      this.renderCurrentSection();
    }, 100);

    return content;
  }

  setupEventListeners() {
    const root = this.root() || document;
    const navItems = root.querySelectorAll('.nav-item');
    const saveBtn = root.querySelector('#save-btn');
    const resetBtn = root.querySelector('#reset-btn');
    const discardBtn = root.querySelector('#discard-btn');

    navItems.forEach(item => {
      item.addEventListener('click', () => {
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        const section = item.dataset.section;
        this.currentSection = section;
        this.renderCurrentSection();
      });
    });

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.saveSettings();
      });
    }

    if (discardBtn) {
      discardBtn.addEventListener('click', () => {
        this.discardUnsaved();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all settings to defaults?')) {
          this.resetToDefaults();
        }
      });
    }

    const content = root.querySelector('#settings-content');
    if (content && !content.dataset.dirtyBound) {
      content.dataset.dirtyBound = '1';
      content.addEventListener('input', () => this.markDirty());
      content.addEventListener('change', () => this.markDirty());
    }

    this.startSystemMonitoring();
  }

  renderCurrentSection() {
    const content = document.getElementById('settings-content');
    const title = document.getElementById('section-title');
    
    if (!content || !title) return;

    const sections = {
      general: {
        title: 'General Settings',
        content: this.renderGeneralSection()
      },
      ai: {
        title: 'AI & Models',
        content: this.renderAISection()
      },
      p2p: {
        title: 'P2P Network',
        content: this.renderP2PSection()
      },
      appearance: {
        title: 'Appearance',
        content: this.renderAppearanceSection()
      },
      security: {
        title: 'Security',
        content: this.renderSecuritySection()
      },
      about: {
        title: 'About',
        content: this.renderAboutSection()
      }
    };

    const section = sections[this.currentSection];
    if (section) {
      title.textContent = section.title;
      content.innerHTML = section.content;
      this.setupSectionEventListeners();
    }
  }

  setupSectionEventListeners() {
    const root = this.root() || document;
    const inputs = root.querySelectorAll('#settings-content input, #settings-content select, #settings-content textarea');
    inputs.forEach(input => {
      input.addEventListener('input', () => this.markDirty());
      input.addEventListener('change', () => this.markDirty());
    });
  }

  startSystemMonitoring() {
    setInterval(() => {
      this.updateSystemMetrics();
    }, 2000);
  }

  async updateSystemMetrics() {
    try {
      if (performance.memory) {
        this.systemMetrics.memory = Math.round((performance.memory.usedJSHeapSize / 1024 / 1024) * 100) / 100;
      }

      const memoryElement = document.getElementById('memory-metric');
      if (memoryElement) {
        memoryElement.textContent = `${this.systemMetrics.memory} MB`;
      }
    } catch (error) {
      console.warn('Error updating system metrics:', error);
    }
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
            <input type="text" id="username" class="sk-input" aria-label="Username" value="${this.settings.general.username}" />
            <span class="setting-description">Your display name in the application</span>
          </div>
          
          <div class="setting-group">
            <label for="language">Language</label>
            <select id="language" class="sk-select" aria-label="Language">
              <option value="en" ${this.settings.general.language === 'en' ? 'selected' : ''}>English</option>
              <option value="es" ${this.settings.general.language === 'es' ? 'selected' : ''}>Español</option>
              <option value="fr" ${this.settings.general.language === 'fr' ? 'selected' : ''}>Français</option>
              <option value="de" ${this.settings.general.language === 'de' ? 'selected' : ''}>Deutsch</option>
            </select>
            <span class="setting-description">Application interface language</span>
          </div>
          
          <div class="setting-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" id="auto-save" ${this.settings.general.autoSave ? 'checked' : ''} />
              <span class="checkmark"></span>
              Enable Auto-Save
            </label>
            <span class="setting-description">Automatically save your work periodically</span>
          </div>
          
          <div class="setting-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" id="notifications" ${this.settings.general.notifications ? 'checked' : ''} />
              <span class="checkmark"></span>
              Enable Notifications
            </label>
            <span class="setting-description">Show system and application notifications</span>
          </div>
        </div>
      </div>
    `;
  }

  renderGeneralSection() {
    return this.renderGeneralSettings();
  }

  renderAISection() {
    return `
      <div class="settings-section">
        <div class="section-header">
          <h3>🤖 AI Configuration</h3>
          <p>Configure AI models and performance settings</p>
        </div>
        
        <div class="settings-grid">
          <div class="setting-group">
            <label for="default-provider">Default AI Provider</label>
            <select id="default-provider" class="sk-select">
              <option value="openai" ${this.settings.ai.defaultProvider === 'openai' ? 'selected' : ''}>OpenAI</option>
              <option value="anthropic" ${this.settings.ai.defaultProvider === 'anthropic' ? 'selected' : ''}>Anthropic</option>
              <option value="google" ${this.settings.ai.defaultProvider === 'google' ? 'selected' : ''}>Google</option>
              <option value="local" ${this.settings.ai.defaultProvider === 'local' ? 'selected' : ''}>Local Models</option>
            </select>
            <span class="setting-description">Primary AI service provider</span>
          </div>
          
          <div class="setting-group">
            <label for="max-tasks">Max Concurrent Tasks</label>
            <select id="max-tasks" class="sk-select">
              <option value="2" ${this.settings.ai.maxConcurrentTasks === 2 ? 'selected' : ''}>2</option>
              <option value="4" ${this.settings.ai.maxConcurrentTasks === 4 ? 'selected' : ''}>4</option>
              <option value="8" ${this.settings.ai.maxConcurrentTasks === 8 ? 'selected' : ''}>8</option>
            </select>
            <span class="setting-description">Maximum parallel AI tasks</span>
          </div>
          
          <div class="setting-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" id="enable-gpu" ${this.settings.ai.enableGPU ? 'checked' : ''} />
              <span class="checkmark"></span>
              Enable GPU Acceleration
            </label>
            <span class="setting-description">Use GPU for AI model inference</span>
          </div>
        </div>
      </div>
    `;
  }

  renderP2PSection() {
    return `
      <div class="settings-section">
        <div class="section-header">
          <h3>🌐 P2P Network</h3>
          <p>Configure peer-to-peer networking and distributed computing</p>
        </div>
        
        <div class="settings-grid">
          <div class="setting-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" id="enable-p2p" ${this.settings.p2p.enableP2P ? 'checked' : ''} />
              <span class="checkmark"></span>
              Enable P2P Networking
            </label>
            <span class="setting-description">Connect to peer-to-peer network</span>
          </div>
          
          <div class="setting-group">
            <label for="max-peers">Maximum Peers</label>
            <select id="max-peers" class="sk-select">
              <option value="10" ${this.settings.p2p.maxPeers === 10 ? 'selected' : ''}>10</option>
              <option value="25" ${this.settings.p2p.maxPeers === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${this.settings.p2p.maxPeers === 50 ? 'selected' : ''}>50</option>
              <option value="100" ${this.settings.p2p.maxPeers === 100 ? 'selected' : ''}>100</option>
            </select>
            <span class="setting-description">Maximum number of peer connections</span>
          </div>
          
          <div class="setting-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" id="enable-model-sharing" ${this.settings.p2p.enableModelSharing ? 'checked' : ''} />
              <span class="checkmark"></span>
              Enable Model Sharing
            </label>
            <span class="setting-description">Share AI models with peers</span>
          </div>
        </div>
      </div>
    `;
  }

  renderAppearanceSection() {
    return `
      <div class="settings-section">
        <div class="section-header">
          <h3>🎨 Appearance</h3>
          <p>Customize the look and feel of the application</p>
        </div>
        
        <div class="settings-grid">
          <div class="setting-group">
            <label for="theme">Theme</label>
            <select id="theme" class="sk-select" aria-label="Theme">
              <option value="system" ${this.settings.appearance.theme === 'system' ? 'selected' : ''}>System Default</option>
              <option value="light" ${this.settings.appearance.theme === 'light' ? 'selected' : ''}>Light</option>
              <option value="dark" ${this.settings.appearance.theme === 'dark' ? 'selected' : ''}>Dark</option>
            </select>
            <span class="setting-description">Color theme for the interface</span>
          </div>
          
          <div class="setting-group">
            <label for="accent-color">Accent Color</label>
            <input type="text" id="accent-color" class="sk-input" aria-label="Accent color" maxlength="7" value="${this.settings.appearance.accentColor}" />
            <span class="setting-description">Six-digit color such as #4a90e2</span>
          </div>
          
          <div class="setting-group">
            <label for="font-size">Font Size</label>
            <select id="font-size" class="sk-select" aria-label="Font size">
              <option value="12" ${this.settings.appearance.fontSize === 12 ? 'selected' : ''}>Small (12px)</option>
              <option value="14" ${this.settings.appearance.fontSize === 14 ? 'selected' : ''}>Medium (14px)</option>
              <option value="16" ${this.settings.appearance.fontSize === 16 ? 'selected' : ''}>Large (16px)</option>
            </select>
            <span class="setting-description">Base font size for the interface</span>
          </div>
          
          <div class="setting-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" id="enable-animations" ${this.settings.appearance.enableAnimations ? 'checked' : ''} />
              <span class="checkmark"></span>
              Enable Animations
            </label>
            <span class="setting-description">Smooth transitions and animations</span>
          </div>
        </div>
      </div>
    `;
  }

  renderSecuritySection() {
    return `
      <div class="settings-section">
        <div class="section-header">
          <h3>🔒 Security & Privacy</h3>
          <p>Configure security settings and data protection</p>
        </div>
        
        <div class="settings-grid">
          <div class="setting-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" id="enable-encryption" ${this.settings.security.enableEncryption ? 'checked' : ''} />
              <span class="checkmark"></span>
              Enable Encryption
            </label>
            <span class="setting-description">Encrypt sensitive data</span>
          </div>
          
          <div class="setting-group">
            <label for="auto-lock">Auto-lock Timeout</label>
            <select id="auto-lock" class="sk-select">
              <option value="5" ${this.settings.security.autoLockTimeout === 5 ? 'selected' : ''}>5 minutes</option>
              <option value="15" ${this.settings.security.autoLockTimeout === 15 ? 'selected' : ''}>15 minutes</option>
              <option value="30" ${this.settings.security.autoLockTimeout === 30 ? 'selected' : ''}>30 minutes</option>
              <option value="60" ${this.settings.security.autoLockTimeout === 60 ? 'selected' : ''}>1 hour</option>
            </select>
            <span class="setting-description">Automatically lock after inactivity</span>
          </div>
          
          <div class="setting-group">
            <label for="security-level">Security Level</label>
            <select id="security-level" class="sk-select">
              <option value="standard" ${this.settings.security.securityLevel === 'standard' ? 'selected' : ''}>Standard</option>
              <option value="high" ${this.settings.security.securityLevel === 'high' ? 'selected' : ''}>High</option>
              <option value="maximum" ${this.settings.security.securityLevel === 'maximum' ? 'selected' : ''}>Maximum</option>
            </select>
            <span class="setting-description">Overall security level</span>
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
            <h2>SwissKnife Web Desktop</h2>
            <p>Version 1.0.0-beta</p>
            <p>A comprehensive AI-powered development environment</p>
          </div>
        </div>
        
        <div class="about-details">
          <div class="detail-group">
            <h3>System Information</h3>
            <div class="detail-item">
              <span>Platform:</span>
              <span>${navigator.platform}</span>
            </div>
            <div class="detail-item">
              <span>CPU Cores:</span>
              <span>${navigator.hardwareConcurrency || 'Unknown'}</span>
            </div>
            <div class="detail-item">
              <span>Memory:</span>
              <span>${navigator.deviceMemory || 'Unknown'} GB</span>
            </div>
          </div>
          
          <div class="detail-group">
            <h3>Feature Support</h3>
            <div class="detail-item">
              <span>WebAssembly:</span>
              <span class="${typeof WebAssembly !== 'undefined' ? 'supported' : 'not-supported'}">
                <span class="sk-status-dot ${typeof WebAssembly !== 'undefined' ? 'is-ok' : 'is-err'}"></span>${typeof WebAssembly !== 'undefined' ? 'Supported' : 'Not Supported'}
              </span>
            </div>
            <div class="detail-item">
              <span>WebGPU:</span>
              <span class="${'gpu' in navigator ? 'supported' : 'not-supported'}">
                <span class="sk-status-dot ${'gpu' in navigator ? 'is-ok' : 'is-err'}"></span>${'gpu' in navigator ? 'Supported' : 'Not Supported'}
              </span>
            </div>
            <div class="detail-item">
              <span>IndexedDB:</span>
              <span class="${'indexedDB' in window ? 'supported' : 'not-supported'}">
                <span class="sk-status-dot ${'indexedDB' in window ? 'is-ok' : 'is-err'}"></span>${'indexedDB' in window ? 'Supported' : 'Not Supported'}
              </span>
            </div>
          </div>
          
          <div class="detail-group">
            <h3>Links</h3>
            <div class="link-buttons">
              <button class="btn btn-secondary sk-btn" onclick="window.open('https://github.com/hallucinate-llc/swissknife', '_blank')">
                GitHub Repository
              </button>
              <button class="btn btn-secondary sk-btn" onclick="window.open('https://swissknife.ai/docs', '_blank')">
                Documentation
              </button>
              <button class="btn btn-secondary sk-btn" onclick="window.open('https://swissknife.ai/support', '_blank')">
                Support
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  root() {
    return document.querySelector('.window[data-app-id="settings"]');
  }

  readControl(id) {
    const root = this.root();
    const scoped = root ? root.querySelector('#' + CSS.escape(id)) : null;
    return scoped || document.getElementById(id);
  }

  ensureSettings() {
    if (!this._loaded) this.loadSettings();
  }

  markDirty() {
    this.unsavedChanges = true;
    const saveBtn = this.readControl('save-btn');
    if (saveBtn) saveBtn.disabled = false;
  }

  showFeedback(message) {
    const el = this.readControl('settings-feedback');
    if (el) el.textContent = message;
  }

  mergeSettings(base, extra) {
    const out = JSON.parse(JSON.stringify(base));
    if (!extra || typeof extra !== 'object') return out;
    for (const section of Object.keys(out)) {
      const incoming = extra[section];
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) continue;
      for (const key of Object.keys(out[section])) {
        if (Object.prototype.hasOwnProperty.call(incoming, key)) out[section][key] = incoming[key];
      }
    }
    return out;
  }

  sanitizeSettings(settings) {
    if (!['system', 'light', 'dark'].includes(settings.appearance.theme)) settings.appearance.theme = 'dark';
    if (typeof settings.appearance.accentColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(settings.appearance.accentColor)) {
      settings.appearance.accentColor = '#4a90e2';
    }
    const fontSize = Number(settings.appearance.fontSize);
    settings.appearance.fontSize = [12, 14, 16].includes(fontSize) ? fontSize : 14;
    const tasks = Number(settings.ai.maxConcurrentTasks);
    settings.ai.maxConcurrentTasks = [2, 4, 8].includes(tasks) ? tasks : 4;
    const peers = Number(settings.p2p.maxPeers);
    settings.p2p.maxPeers = [10, 25, 50, 100].includes(peers) ? peers : 50;
    const lock = Number(settings.security.autoLockTimeout);
    settings.security.autoLockTimeout = [5, 15, 30, 60].includes(lock) ? lock : 15;
    if (!['en', 'es', 'fr', 'de'].includes(settings.general.language)) settings.general.language = 'en';
    if (!['openai', 'anthropic', 'google', 'local'].includes(settings.ai.defaultProvider)) settings.ai.defaultProvider = 'openai';
    if (!['standard', 'high', 'maximum'].includes(settings.security.securityLevel)) settings.security.securityLevel = 'standard';
  }

  async loadSettings() {
    this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
    try {
      const stored = localStorage.getItem('swissknife_settings');
      if (stored) {
        this.settings = this.mergeSettings(this.defaultSettings, JSON.parse(stored));
        this.sanitizeSettings(this.settings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
    }
    this.lastSaved = JSON.parse(JSON.stringify(this.settings));
    this._loaded = true;
  }

  rejectDraft(message) {
    this.showFeedback(message + ' Last saved settings were kept.');
  }

  readChoice(draft, id, section, key, allowed, label, asNumber) {
    const el = this.readControl(id);
    if (!el) return true;
    const value = asNumber ? Number(el.value) : el.value;
    if (!allowed.includes(value)) {
      this.rejectDraft('Invalid ' + label + '.');
      return false;
    }
    draft[section][key] = value;
    return true;
  }

  readChecked(draft, id, section, key) {
    const el = this.readControl(id);
    if (el) draft[section][key] = el.checked;
  }

  async saveSettings() {
    const draft = JSON.parse(JSON.stringify(this.settings));
    const themeEl = this.readControl('theme');
    const accentEl = this.readControl('accent-color');
    const fontEl = this.readControl('font-size');
    if (themeEl || accentEl || fontEl || this.readControl('enable-animations')) {
      if (themeEl && !['system', 'light', 'dark'].includes(themeEl.value)) {
        this.rejectDraft('Invalid theme.');
        return;
      }
      const accent = accentEl ? accentEl.value.trim() : draft.appearance.accentColor;
      if (!/^#[0-9a-fA-F]{6}$/.test(accent)) {
        this.rejectDraft('Invalid accent color.');
        return;
      }
      const fontSize = fontEl ? Number(fontEl.value) : Number(draft.appearance.fontSize);
      if (![12, 14, 16].includes(fontSize)) {
        this.rejectDraft('Invalid font size.');
        return;
      }
      if (themeEl) draft.appearance.theme = themeEl.value;
      draft.appearance.accentColor = accent;
      draft.appearance.fontSize = fontSize;
      this.readChecked(draft, 'enable-animations', 'appearance', 'enableAnimations');
    }
    const userEl = this.readControl('username');
    if (userEl) {
      const username = userEl.value.trim();
      if (!username || username.length > 80) {
        this.rejectDraft('Invalid username.');
        return;
      }
      draft.general.username = username;
    }
    if (!this.readChoice(draft, 'language', 'general', 'language', ['en', 'es', 'fr', 'de'], 'language', false)) return;
    this.readChecked(draft, 'auto-save', 'general', 'autoSave');
    this.readChecked(draft, 'notifications', 'general', 'notifications');
    if (!this.readChoice(draft, 'default-provider', 'ai', 'defaultProvider', ['openai', 'anthropic', 'google', 'local'], 'AI provider', false)) return;
    if (!this.readChoice(draft, 'max-tasks', 'ai', 'maxConcurrentTasks', [2, 4, 8], 'task limit', true)) return;
    this.readChecked(draft, 'enable-gpu', 'ai', 'enableGPU');
    this.readChecked(draft, 'enable-p2p', 'p2p', 'enableP2P');
    if (!this.readChoice(draft, 'max-peers', 'p2p', 'maxPeers', [10, 25, 50, 100], 'peer limit', true)) return;
    this.readChecked(draft, 'enable-model-sharing', 'p2p', 'enableModelSharing');
    this.readChecked(draft, 'enable-encryption', 'security', 'enableEncryption');
    if (!this.readChoice(draft, 'auto-lock', 'security', 'autoLockTimeout', [5, 15, 30, 60], 'auto-lock timeout', true)) return;
    if (!this.readChoice(draft, 'security-level', 'security', 'securityLevel', ['standard', 'high', 'maximum'], 'security level', false)) return;
    try {
      localStorage.setItem('swissknife_settings', JSON.stringify(draft));
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.rejectDraft('Could not save settings.');
      if (this.desktop && this.desktop.showNotification) {
        this.desktop.showNotification('Failed to save settings', 'error');
      }
      return;
    }
    this.settings = draft;
    this.lastSaved = JSON.parse(JSON.stringify(draft));
    this.unsavedChanges = false;
    this.applySettings();
    const saveBtn = this.readControl('save-btn');
    if (saveBtn) saveBtn.disabled = true;
    this.showFeedback('Settings saved.');
    if (this.desktop && this.desktop.showNotification) {
      this.desktop.showNotification('Settings saved successfully', 'success');
    }
  }

  discardUnsaved() {
    this.settings = JSON.parse(JSON.stringify(this.lastSaved || this.defaultSettings));
    this.unsavedChanges = false;
    this.renderCurrentSection();
    this.applySettings();
    const saveBtn = this.readControl('save-btn');
    if (saveBtn) saveBtn.disabled = true;
    this.showFeedback('Unsaved changes discarded. Last saved settings restored.');
  }

  resetToDefaults() {
    const next = JSON.parse(JSON.stringify(this.defaultSettings));
    try {
      localStorage.removeItem('swissknife_settings');
    } catch (error) {
      this.rejectDraft('Could not reset settings.');
      return;
    }
    this.settings = next;
    this.lastSaved = JSON.parse(JSON.stringify(next));
    this.unsavedChanges = false;
    this.renderCurrentSection();
    this.applySettings();
    const saveBtn = this.readControl('save-btn');
    if (saveBtn) saveBtn.disabled = true;
    this.showFeedback('Settings reset to defaults.');
    if (this.desktop && this.desktop.showNotification) {
      this.desktop.showNotification('Settings reset to defaults', 'success');
    }
  }

  setNestedProperty(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((o, k) => o[k] = o[k] || {}, obj);
    target[lastKey] = value;
  }

  applySettings() {
    const appearance = this.settings.appearance || {};
    if (['system', 'light', 'dark'].includes(appearance.theme)) {
      document.documentElement.setAttribute('data-theme', appearance.theme);
      const root = this.root();
      if (root) root.setAttribute('data-theme', appearance.theme);
    }
    if (typeof appearance.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(appearance.accentColor)) {
      document.documentElement.style.setProperty('--accent-color', appearance.accentColor);
    }
    if ([12, 14, 16].includes(Number(appearance.fontSize))) {
      document.documentElement.style.setProperty('--settings-font-size', Number(appearance.fontSize) + 'px');
    }
    const applied = this.readControl('applied-appearance');
    if (applied) applied.textContent = 'Theme ' + appearance.theme;
  }
}