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
            <div class="nav-item" data-section="appearance">
              <span class="nav-icon">🎨</span>
              <span class="nav-label">Appearance</span>
            </div>
            <div class="nav-item" data-section="security">
              <span class="nav-icon">🔒</span>
              <span class="nav-label">Security</span>
            </div>
            <div class="nav-item" data-section="about">
              <span class="nav-icon">ℹ️</span>
              <span class="nav-label">About</span>
            </div>
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

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all settings to defaults?')) {
          this.resetToDefaults();
        }
      });
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
            <input type="text" id="username" value="${this.settings.general.username}" />
            <span class="setting-description">Your display name in the application</span>
          </div>
          
          <div class="setting-group">
            <label for="language">Language</label>
            <select id="language">
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
            <select id="default-provider">
              <option value="openai" ${this.settings.ai.defaultProvider === 'openai' ? 'selected' : ''}>OpenAI</option>
              <option value="anthropic" ${this.settings.ai.defaultProvider === 'anthropic' ? 'selected' : ''}>Anthropic</option>
              <option value="google" ${this.settings.ai.defaultProvider === 'google' ? 'selected' : ''}>Google</option>
              <option value="local" ${this.settings.ai.defaultProvider === 'local' ? 'selected' : ''}>Local Models</option>
            </select>
            <span class="setting-description">Primary AI service provider</span>
          </div>
          
          <div class="setting-group">
            <label for="max-tasks">Max Concurrent Tasks</label>
            <select id="max-tasks">
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
            <select id="max-peers">
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
            <select id="theme">
              <option value="system" ${this.settings.appearance.theme === 'system' ? 'selected' : ''}>System Default</option>
              <option value="light" ${this.settings.appearance.theme === 'light' ? 'selected' : ''}>Light</option>
              <option value="dark" ${this.settings.appearance.theme === 'dark' ? 'selected' : ''}>Dark</option>
            </select>
            <span class="setting-description">Color theme for the interface</span>
          </div>
          
          <div class="setting-group">
            <label for="accent-color">Accent Color</label>
            <input type="color" id="accent-color" value="${this.settings.appearance.accentColor}" />
            <span class="setting-description">Primary accent color</span>
          </div>
          
          <div class="setting-group">
            <label for="font-size">Font Size</label>
            <select id="font-size">
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
            <select id="auto-lock">
              <option value="5" ${this.settings.security.autoLockTimeout === 5 ? 'selected' : ''}>5 minutes</option>
              <option value="15" ${this.settings.security.autoLockTimeout === 15 ? 'selected' : ''}>15 minutes</option>
              <option value="30" ${this.settings.security.autoLockTimeout === 30 ? 'selected' : ''}>30 minutes</option>
              <option value="60" ${this.settings.security.autoLockTimeout === 60 ? 'selected' : ''}>1 hour</option>
            </select>
            <span class="setting-description">Automatically lock after inactivity</span>
          </div>
          
          <div class="setting-group">
            <label for="security-level">Security Level</label>
            <select id="security-level">
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
              <span>IndexedDB:</span>
              <span class="${'indexedDB' in window ? 'supported' : 'not-supported'}">
                ${'indexedDB' in window ? 'Supported' : 'Not Supported'}
              </span>
            </div>
          </div>
          
          <div class="detail-group">
            <h3>Links</h3>
            <div class="link-buttons">
              <button class="btn btn-secondary" onclick="window.open('https://github.com/hallucinate-llc/swissknife', '_blank')">
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

  async loadSettings() {
    try {
      const stored = localStorage.getItem('swissknife_settings');
      if (stored) {
        this.settings = { ...this.defaultSettings, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.settings = this.defaultSettings;
    }
  }

  async saveSettings() {
    try {
      const inputs = document.querySelectorAll('input, select');
      inputs.forEach(input => {
        const path = input.id.replace(/-/g, '.');
        this.setNestedProperty(this.settings, path, input.type === 'checkbox' ? input.checked : input.value);
      });

      localStorage.setItem('swissknife_settings', JSON.stringify(this.settings));
      this.unsavedChanges = false;
      
      const saveBtn = document.getElementById('save-btn');
      if (saveBtn) {
        saveBtn.disabled = true;
      }
      
      if (this.desktop && this.desktop.showNotification) {
        this.desktop.showNotification('Settings saved successfully', 'success');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      if (this.desktop && this.desktop.showNotification) {
        this.desktop.showNotification('Failed to save settings', 'error');
      }
    }
  }

  resetToDefaults() {
    this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
    localStorage.removeItem('swissknife_settings');
    this.renderCurrentSection();
    
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
    if (this.settings.appearance.theme) {
      document.documentElement.setAttribute('data-theme', this.settings.appearance.theme);
    }
    
    if (this.settings.appearance.accentColor) {
      document.documentElement.style.setProperty('--accent-color', this.settings.appearance.accentColor);
    }
  }
}