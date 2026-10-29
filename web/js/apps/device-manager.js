/**
 * Enhanced Device Manager App for SwissKnife Web Desktop
 * Hardware monitoring, device discovery, and network device management
 */

export class DeviceManagerApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.devices = new Map();
    this.networkDevices = new Map();
    this.hardwareInfo = {};
    this.benchmarkResults = new Map();
    this.monitoringInterval = null;
    this.currentView = 'hardware'; // 'hardware', 'network', 'performance', 'drivers'
    this.p2pSystem = null;
    
    // Device categories
    this.deviceCategories = {
      'processor': { name: 'Processors', icon: '🔥', color: '#FF5722' },
      'memory': { name: 'Memory', icon: '🧠', color: '#2196F3' },
      'storage': { name: 'Storage', icon: '💾', color: '#4CAF50' },
      'graphics': { name: 'Graphics', icon: '🎮', color: '#9C27B0' },
      'network': { name: 'Network', icon: '🌐', color: '#00BCD4' },
      'audio': { name: 'Audio', icon: '🔊', color: '#FF9800' },
      'input': { name: 'Input Devices', icon: '⌨️', color: '#607D8B' },
      'display': { name: 'Displays', icon: '🖥️', color: '#795548' },
      'usb': { name: 'USB Devices', icon: '🔌', color: '#E91E63' },
      'bluetooth': { name: 'Bluetooth', icon: '📶', color: '#3F51B5' }
    };
    
    this.initializeIntegrations();
  }

  async initializeIntegrations() {
    try {
      this.swissknife = this.desktop.swissknife;
      
      // Connect to P2P system for network device discovery
      if (window.p2pMLSystem) {
        this.p2pSystem = window.p2pMLSystem;
        this.setupP2PDiscovery();
      }
      
      // Start hardware monitoring
      this.startHardwareMonitoring();
      
      console.log('✅ Device Manager integrations initialized');
    } catch (error) {
      console.error('❌ Device Manager integration error:', error);
    }
  }

  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  browserAccessRecord() {
    const observedAt = new Date().toISOString();
    this.browserAccess = {
      source: 'navigator',
      observedAt,
      deviceName: navigator.userAgentData?.platform || navigator.platform || 'Unknown device',
      os: this.getOSInfo(),
      browser: this.getBrowserInfo(),
      architecture: this.getArchitecture()
    };
    return this.browserAccess;
  }

  readRetained() {
    try {
      const raw = localStorage.getItem('swissknife-device-manager-state');
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        selectedDiagnostic: typeof parsed.selectedDiagnostic === 'string' ? parsed.selectedDiagnostic : '',
        ownerObservedAt: typeof parsed.ownerObservedAt === 'string' ? parsed.ownerObservedAt : '',
        ownerSource: typeof parsed.ownerSource === 'string' ? parsed.ownerSource : ''
      };
    } catch (error) {
      return { selectedDiagnostic: '', ownerObservedAt: '', ownerSource: '' };
    }
  }

  writeRetained(extra) {
    const next = { ...this.readRetained(), ...extra };
    localStorage.setItem('swissknife-device-manager-state', JSON.stringify(next));
    this.retained = next;
    return next;
  }

  setDmStatus(message) {
    const status = document.getElementById('dm-status-line');
    if (status) status.textContent = message;
  }

  selectDiagnostic(id) {
    this.writeRetained({ selectedDiagnostic: id });
    const retained = document.getElementById('dm-retained-selection');
    if (retained) retained.textContent = `Retained selection: ${id}`;
    if (id === 'inspect_hardware') {
      this.setDmStatus('Supported owner diagnostic selected. No scan or benchmark was run.');
      return;
    }
    this.setDmStatus('Unsupported diagnostic. No scan or benchmark was run.');
  }

  ownerPayload(outcome) {
    if (!outcome || typeof outcome !== 'object') return null;
    const layer = outcome.result && typeof outcome.result === 'object' ? outcome.result : null;
    const nested = layer && layer.result && typeof layer.result === 'object' ? layer.result : null;
    return nested || layer || outcome;
  }

  async requestOwnerHardware() {
    const selected = this.readRetained().selectedDiagnostic;
    if (selected !== 'inspect_hardware') {
      this.setDmStatus('Unsupported diagnostic. No scan or benchmark was run.');
      return;
    }
    const findInvoke = () => {
      const win = typeof window !== 'undefined' ? window : null;
      const root = typeof globalThis !== 'undefined' ? globalThis : null;
      const seeds = [win, root, this.desktop, this.swissknife, this.desktop && this.desktop.swissknife, win && win.swissknife, win && win.desktop, win && win.liveToolGateway, win && win.skLiveToolGateway, win && win.__swissknifeLiveToolGateway, root && root.liveToolGateway, root && root.skLiveToolGateway];
      const nestKeys = ['gateway', 'tools', 'mcp', 'liveToolGateway', 'skLiveToolGateway', 'swissknife', 'default', 'sk', 'api', 'toolGateway', 'nativeGateway', 'mediator', 'connector', 'mcpPlusPlus', 'liveTools', 'desktop', '__swissknifeLiveToolGateway'];
      const seen = [];
      const bindInvoke = (seed) => {
        try {
          if (seed && (typeof seed === 'object' || typeof seed === 'function') && typeof seed.invokeNativeTool === 'function') {
            return seed.invokeNativeTool.bind(seed);
          }
        } catch (error) {
          /* unreadable host */
        }
        return null;
      };
      const pushHost = (seed, depth) => {
        const bound = bindInvoke(seed);
        if (bound) return bound;
        if (!seed || (typeof seed !== 'object' && typeof seed !== 'function') || seen.includes(seed) || depth <= 0) return null;
        seen.push(seed);
        let extra = [];
        if (seen.length < 80) {
          try {
            extra = Object.keys(seed).filter((key) => /gateway|tool|mcp|swiss|desktop|native/i.test(key) && !nestKeys.includes(key));
          } catch (error) {
            extra = [];
          }
        }
        for (const key of nestKeys.concat(extra)) {
          try {
            const child = seed[key];
            if (child && child !== seed) {
              const found = pushHost(child, depth - 1);
              if (found) return found;
            }
          } catch (error) {
            /* host namespace is not readable */
          }
        }
        return null;
      };
      for (const seed of seeds) {
        const found = pushHost(seed, 4);
        if (found) return found;
      }
      return null;
    };
    let invoke = findInvoke();
    if (typeof invoke !== 'function') {
      try {
        const mod = await import('../live-tool-gateway.js');
        const named = mod && (mod.invokeNativeTool || (mod.default && mod.default.invokeNativeTool));
        if (typeof named === 'function') invoke = named.bind(mod.default || mod);
      } catch (error) {
        /* sibling gateway module is not the page host */
      }
      invoke = invoke || findInvoke();
    }
    for (let attempt = 0; !invoke && attempt < 50; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      invoke = findInvoke();
    }
    if (typeof invoke !== 'function') {
      this.dedupeDeviceManagerDom();
      const confirm = document.querySelector('button[data-gateway-confirm="device-manager.ipfs_accelerate_py.inspect_hardware"]');
      if (!confirm) {
        this.setDmStatus('Owner hardware gateway is unavailable. No scan or benchmark was run.');
      }
      return;
    }
    if (typeof window !== 'undefined' && window.__skDmOwnerFlight) return;
    if (typeof window !== 'undefined') window.__skDmOwnerFlight = true;
    this.dedupeDeviceManagerDom();
    const windowsNow = [...document.querySelectorAll('.window[data-app-id="device-manager"]')];
    const windowEl = windowsNow[windowsNow.length - 1] || null;
    const container = (windowEl && windowEl.querySelector('.window-app-content')) || document.body;
    const trigger = (windowEl && windowEl.querySelector('#dm-request-owner')) || document.getElementById('dm-request-owner');
    try {
      let collapsingConfirms = false;
      const collapseConfirms = () => {
        if (collapsingConfirms) return;
        collapsingConfirms = true;
        try { this.dedupeDeviceManagerDom(); } finally { collapsingConfirms = false; }
      };
      const confirmObserver = new MutationObserver(() => collapseConfirms());
      confirmObserver.observe(document.documentElement, { childList: true, subtree: true });
      let outcome;
      try {
        const pending = invoke(container, 'device-manager', 'device-manager.ipfs_accelerate_py.inspect_hardware', {
          executionMode: 'execute',
          toolId: 'detect_hardware',
          payload: { fixture_scope: 'svf-device-manager-hw' },
          trigger
        });
        collapseConfirms();
        outcome = await pending;
      } finally {
        confirmObserver.disconnect();
        collapseConfirms();
      }
      const root = this.ownerPayload(outcome);
      const denied = !root || root.isError || root.error || root.failed || root.denied || root.unavailable;
      const keys = root && typeof root === 'object'
        ? Object.keys(root).filter((key) => key !== 'receipt' && key !== 'event')
        : [];
      if (denied || !root.receipt || keys.length === 0) {
        this.setDmStatus('Owner hardware was not returned. No scan or benchmark was run.');
        return;
      }
      const observedAt = new Date().toISOString();
      this.writeRetained({
        selectedDiagnostic: 'inspect_hardware',
        ownerObservedAt: observedAt,
        ownerSource: 'ipfs_accelerate_py'
      });
      const browserAt = this.browserAccess?.observedAt || this.browserAccessRecord().observedAt;
      this.setDmStatus(`Browser device access source: navigator, observed ${browserAt}. Owner hardware source: ipfs_accelerate_py, observed ${observedAt}.`);
      const ownerSource = document.getElementById('dm-owner-source');
      const ownerTime = document.getElementById('dm-owner-time');
      const session = document.getElementById('dm-session-owner');
      const catalog = document.getElementById('dm-owner-catalog');
      if (ownerSource) ownerSource.textContent = 'source: ipfs_accelerate_py';
      if (ownerTime) ownerTime.textContent = `observed: ${observedAt}`;
      if (session) session.textContent = `This session owner observation: ${observedAt}`;
      if (catalog) catalog.textContent = `Catalog fields: ${keys.join(', ')}`;
    } catch (error) {
      this.setDmStatus('Owner hardware request did not complete. No scan or benchmark was run.');
    } finally {
      if (typeof window !== 'undefined') window.__skDmOwnerFlight = false;
    }
  }

  createWindow() {
    const browserAccess = this.browserAccessRecord();
    const retained = this.readRetained();
    const retainedLabel = retained.selectedDiagnostic || 'none';
    const content = `
      <div class="device-manager-container" style="display:flex;flex-direction:column;max-height:100%;min-height:0;">
        <div class="device-manager-header" style="display:flex;flex-wrap:wrap;gap:8px;flex:0 0 auto;">
          <div class="header-tabs" style="display:flex;flex-wrap:wrap;gap:4px;">
            <button class="tab-btn ${this.currentView === 'hardware' ? 'active' : ''}" data-view="hardware">
              🔧 Hardware
            </button>
            <button class="tab-btn ${this.currentView === 'network' ? 'active' : ''}" data-view="network">
              🌐 Network Devices
            </button>
            <button class="tab-btn ${this.currentView === 'performance' ? 'active' : ''}" data-view="performance">
              📊 Performance
            </button>
            <button class="tab-btn ${this.currentView === 'drivers' ? 'active' : ''}" data-view="drivers">
              💿 Drivers
            </button>
          </div>
          <div class="header-controls">
            <button class="control-btn" id="scan-devices" type="button" title="Scan for Devices">Scan</button>
            <button class="control-btn" id="run-benchmark" type="button" title="Run Benchmark">Benchmark</button>
            <button class="control-btn" id="export-report" type="button" title="Export Report">Export</button>
            <button class="control-btn" id="device-settings" type="button" title="Settings">Settings</button>
          </div>
        </div>

        <div class="device-manager-content" style="flex:1 1 auto;min-height:0;max-height:min(70vh, 640px);overflow:auto;">
          <!-- Hardware View -->
          <div class="tab-content ${this.currentView === 'hardware' ? 'active' : ''}" data-view="hardware" style="display:${this.currentView === 'hardware' ? 'block' : 'none'}">
            <div class="hardware-overview">
              <div class="system-summary">
                <h3 id="dm-browser-access" tabindex="0">Browser device access</h3>
                <p id="dm-browser-source">source: navigator</p>
                <p id="dm-browser-time">observed: ${this.escapeHtml(browserAccess.observedAt)}</p>
                <div class="summary-grid">
                  <div class="summary-item">
                    <span class="summary-label">Device Name</span>
                    <span class="summary-value" id="device-name">${this.escapeHtml(browserAccess.deviceName)}</span>
                  </div>
                  <div class="summary-item">
                    <span class="summary-label">Operating System</span>
                    <span class="summary-value" id="os-info">${this.escapeHtml(browserAccess.os)}</span>
                  </div>
                  <div class="summary-item">
                    <span class="summary-label">Browser</span>
                    <span class="summary-value" id="browser-info">${this.escapeHtml(browserAccess.browser)}</span>
                  </div>
                  <div class="summary-item">
                    <span class="summary-label">Architecture</span>
                    <span class="summary-value" id="architecture">${this.escapeHtml(browserAccess.architecture)}</span>
                  </div>
                </div>
                <h3 id="dm-owner-hardware">Owner hardware</h3>
                <p id="dm-owner-source">source: not observed</p>
                <p id="dm-owner-time">observed: not yet this session</p>
                <p id="dm-retained-selection">Retained selection: ${this.escapeHtml(retainedLabel)}</p>
                <p id="dm-session-owner">This session owner observation: none</p>
                <p id="dm-retained-owner">Retained owner observation: ${this.escapeHtml(retained.ownerObservedAt || 'none')}</p>
                <p id="dm-status-line">Browser device access source: navigator, observed ${this.escapeHtml(browserAccess.observedAt)}. Owner hardware source: not observed.</p>
                <button class="sk-btn" type="button" id="dm-select-supported">Use inspect hardware</button>
                <button class="sk-btn" type="button" id="dm-select-unsupported">Use wifi radio scan</button>
                <button class="sk-btn sk-btn-primary" type="button" id="dm-request-owner">Request owner hardware status</button>
                <details id="dm-owner-details">
                  <summary>Owner hardware details</summary>
                  <p id="dm-owner-catalog">No owner catalog observed.</p>
                </details>
              </div>

              <div class="hardware-categories">
                <div class="category-grid" id="hardware-categories">
                  <!-- Hardware categories will be populated -->
                </div>
              </div>
            </div>

            <div class="device-details">
              <h3>🔍 Device Details</h3>
              <div class="device-list" id="hardware-device-list">
                <!-- Detailed device information will be populated -->
              </div>
            </div>
          </div>

          <!-- Network Devices View -->
          <div class="tab-content ${this.currentView === 'network' ? 'active' : ''}" data-view="network" style="display:${this.currentView === 'network' ? 'block' : 'none'}">
            <div class="network-overview">
              <div class="network-stats">
                <div class="stat-card sk-card">
                  <div class="stat-icon">🌐</div>
                  <div class="stat-content">
                    <div class="stat-value" id="network-interfaces-count">0</div>
                    <div class="stat-label">Network Interfaces</div>
                  </div>
                </div>
                <div class="stat-card sk-card">
                  <div class="stat-icon">📶</div>
                  <div class="stat-content">
                    <div class="stat-value" id="wifi-networks-count">0</div>
                    <div class="stat-label">WiFi Networks</div>
                  </div>
                </div>
                <div class="stat-card sk-card">
                  <div class="stat-icon">🔗</div>
                  <div class="stat-content">
                    <div class="stat-value" id="p2p-peers-count">0</div>
                    <div class="stat-label">P2P Peers</div>
                  </div>
                </div>
                <div class="stat-card sk-card">
                  <div class="stat-icon">🔊</div>
                  <div class="stat-content">
                    <div class="stat-value" id="bluetooth-devices-count">0</div>
                    <div class="stat-label">Bluetooth Devices</div>
                  </div>
                </div>
              </div>
              
              <div class="network-controls">
                <button class="network-btn sk-btn" id="scan-wifi">📶 Scan WiFi</button>
                <button class="network-btn sk-btn" id="discover-p2p">🔗 Discover P2P</button>
                <button class="network-btn sk-btn" id="scan-bluetooth">🔊 Scan Bluetooth</button>
                <button class="network-btn sk-btn" id="network-diagnostics">🔧 Diagnostics</button>
              </div>
            </div>

            <div class="network-devices">
              <div class="device-category">
                <h4>🌐 Network Interfaces</h4>
                <div class="device-table" id="network-interfaces-table">
                  <!-- Network interfaces will be populated -->
                </div>
              </div>

              <div class="device-category">
                <h4>📶 WiFi Networks</h4>
                <div class="device-table" id="wifi-networks-table">
                  <!-- WiFi networks will be populated -->
                </div>
              </div>

              <div class="device-category">
                <h4>🔗 P2P Peers</h4>
                <div class="device-table" id="p2p-peers-table">
                  <!-- P2P peers will be populated -->
                </div>
              </div>

              <div class="device-category">
                <h4>🔊 Bluetooth Devices</h4>
                <div class="device-table" id="bluetooth-devices-table">
                  <!-- Bluetooth devices will be populated -->
                </div>
              </div>
            </div>
          </div>

          <!-- Performance View -->
          <div class="tab-content ${this.currentView === 'performance' ? 'active' : ''}" data-view="performance" style="display:${this.currentView === 'performance' ? 'block' : 'none'}">
            <div class="performance-overview">
              <h3>⚡ Hardware Performance</h3>
              
              <div class="benchmark-controls">
                <button class="benchmark-btn sk-btn" id="cpu-benchmark">🔥 CPU Benchmark</button>
                <button class="benchmark-btn sk-btn" id="memory-benchmark">🧠 Memory Test</button>
                <button class="benchmark-btn sk-btn" id="gpu-benchmark">🎮 GPU Test</button>
                <button class="benchmark-btn sk-btn" id="storage-benchmark">💾 Storage Test</button>
                <button class="benchmark-btn sk-btn" id="network-benchmark">🌐 Network Test</button>
                <button class="benchmark-btn full sk-btn sk-btn-primary" id="full-benchmark">🚀 Full System Test</button>
              </div>

              <div class="benchmark-results">
                <div class="result-section">
                  <h4>📊 Recent Benchmark Results</h4>
                  <div class="results-grid" id="benchmark-results-grid">
                    <!-- Benchmark results will be populated -->
                  </div>
                </div>

                <div class="result-section">
                  <h4>📈 Performance History</h4>
                  <div class="performance-chart" id="performance-history-chart">
                    <!-- Performance chart will be rendered -->
                  </div>
                </div>
              </div>
            </div>

            <div class="performance-monitoring">
              <h3>📊 Real-Time Monitoring</h3>
              <div class="monitoring-grid">
                <div class="monitor-card sk-card">
                  <div class="monitor-header">
                    <span class="monitor-icon">🔥</span>
                    <span class="monitor-title">CPU Performance</span>
                  </div>
                  <div class="monitor-chart" id="cpu-monitor-chart"></div>
                  <div class="monitor-stats">
                    <span>Temperature: <span id="cpu-temp">--°C</span></span>
                    <span>Frequency: <span id="cpu-freq">-- MHz</span></span>
                  </div>
                </div>

                <div class="monitor-card sk-card">
                  <div class="monitor-header">
                    <span class="monitor-icon">🧠</span>
                    <span class="monitor-title">Memory Usage</span>
                  </div>
                  <div class="monitor-chart" id="memory-monitor-chart"></div>
                  <div class="monitor-stats">
                    <span>Available: <span id="memory-available">-- GB</span></span>
                    <span>Speed: <span id="memory-speed">-- MHz</span></span>
                  </div>
                </div>

                <div class="monitor-card sk-card">
                  <div class="monitor-header">
                    <span class="monitor-icon">🎮</span>
                    <span class="monitor-title">GPU Performance</span>
                  </div>
                  <div class="monitor-chart" id="gpu-monitor-chart"></div>
                  <div class="monitor-stats">
                    <span>Memory: <span id="gpu-memory-usage">-- MB</span></span>
                    <span>Temperature: <span id="gpu-temp">--°C</span></span>
                  </div>
                </div>

                <div class="monitor-card sk-card">
                  <div class="monitor-header">
                    <span class="monitor-icon">🌐</span>
                    <span class="monitor-title">Network Activity</span>
                  </div>
                  <div class="monitor-chart" id="network-monitor-chart"></div>
                  <div class="monitor-stats">
                    <span>Latency: <span id="network-latency">-- ms</span></span>
                    <span>Throughput: <span id="network-throughput">-- MB/s</span></span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Drivers View -->
          <div class="tab-content ${this.currentView === 'drivers' ? 'active' : ''}" data-view="drivers" style="display:${this.currentView === 'drivers' ? 'block' : 'none'}">
            <div class="drivers-overview">
              <h3>💿 Device Drivers</h3>
              
              <div class="drivers-stats">
                <div class="driver-stat">
                  <span class="stat-label">Total Drivers</span>
                  <span class="stat-value" id="total-drivers">0</span>
                </div>
                <div class="driver-stat">
                  <span class="stat-label">Up to Date</span>
                  <span class="stat-value text-success" id="updated-drivers">0</span>
                </div>
                <div class="driver-stat">
                  <span class="stat-label">Outdated</span>
                  <span class="stat-value text-warning" id="outdated-drivers">0</span>
                </div>
                <div class="driver-stat">
                  <span class="stat-label">Missing</span>
                  <span class="stat-value text-error" id="missing-drivers">0</span>
                </div>
              </div>

              <div class="drivers-controls">
                <button class="driver-btn sk-btn" id="scan-drivers">🔍 Scan Drivers</button>
                <button class="driver-btn sk-btn" id="update-all-drivers">⬆️ Update All</button>
                <button class="driver-btn sk-btn" id="backup-drivers">💾 Backup Drivers</button>
                <button class="driver-btn sk-btn" id="restore-drivers">♻️ Restore Drivers</button>
              </div>
            </div>

            <div class="drivers-list">
              <h4>📋 Driver Details</h4>
              <div class="drivers-table" id="drivers-table">
                <!-- Drivers table will be populated -->
              </div>
            </div>

            <div class="driver-recommendations">
              <h4>💡 Recommendations</h4>
              <div class="recommendations-list" id="driver-recommendations">
                <!-- Driver recommendations will be populated -->
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    return content;
  }

  dedupeDeviceManagerDom() {
    if (this._skDmDeduping) return;
    this._skDmDeduping = true;
    try {
      const confirmSel = 'button[data-gateway-confirm="device-manager.ipfs_accelerate_py.inspect_hardware"]';
      const ownedIds = [
        'dm-browser-access', 'dm-browser-source', 'dm-browser-time', 'dm-owner-hardware',
        'dm-owner-source', 'dm-owner-time', 'dm-retained-selection', 'dm-session-owner',
        'dm-retained-owner', 'dm-status-line', 'dm-select-supported', 'dm-select-unsupported',
        'dm-request-owner', 'dm-owner-details', 'dm-owner-catalog'
      ];
      const pierce = (root, selector) => {
        const found = [];
        const visit = (node) => {
          if (!node || typeof node.querySelectorAll !== 'function') return;
          found.push(...node.querySelectorAll(selector));
          for (const el of node.querySelectorAll('*')) {
            if (el.shadowRoot) visit(el.shadowRoot);
          }
        };
        visit(root);
        return found;
      };
      const shown = (el) => {
        try {
          for (let n = el; n && n.nodeType === 1; n = n.parentElement || (n.getRootNode() instanceof ShadowRoot ? n.getRootNode().host : null)) {
            const style = window.getComputedStyle(n);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
          }
        } catch (error) {
          return true;
        }
        return true;
      };
      const keepLastShown = (elements, clear) => {
        if (elements.length < 2) return;
        let keeper = null;
        for (const el of elements) {
          if (shown(el)) keeper = el;
        }
        if (!keeper) keeper = elements[elements.length - 1];
        for (const el of elements) {
          if (el !== keeper) clear(el);
        }
      };
      const contents = [...document.querySelectorAll('.window[data-app-id="device-manager"] .window-app-content')];
      const roots = contents.length
        ? contents
        : [...document.querySelectorAll('.device-manager-container')].map((el) => el.parentElement || el);
      const host = roots[roots.length - 1];
      if (host) {
        for (const el of document.querySelectorAll(confirmSel)) {
          if (!host.contains(el)) host.appendChild(el);
        }
      }
      for (const content of roots) {
        for (const id of ownedIds) {
          keepLastShown(pierce(content, `[id="${id}"]`), (el) => el.removeAttribute('id'));
        }
        keepLastShown(pierce(content, confirmSel), (el) => el.removeAttribute('data-gateway-confirm'));
      }
    } finally {
      this._skDmDeduping = false;
    }
  }

  async initialize() {
    // Live instance for inline handlers (one desktop window per app).
    if (typeof window !== 'undefined') window.deviceManager = this;
    this.dedupeDeviceManagerDom();
    if (typeof MutationObserver !== 'undefined' && !this.domObserver) {
      this.domObserver = new MutationObserver(() => {
        this.dedupeDeviceManagerDom();
      });
      this.domObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
    await this.initializeIntegrations();
    this.setupEventListeners();
    await this.loadInitialData();
  }

  setupEventListeners() {
    if (this.listenersBound) return;
    this.listenersBound = true;
    // Tab switching
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-btn')) {
        const view = e.target.dataset.view;
        this.switchView(view);
      }
    });

    // Control buttons
    document.addEventListener('click', (e) => {
      const buttonHandlers = {
        'scan-devices': () => this.scanDevices(),
        'dm-select-supported': () => this.selectDiagnostic('inspect_hardware'),
        'dm-select-unsupported': () => this.selectDiagnostic('wifi-radio-scan'),
        'dm-request-owner': () => this.requestOwnerHardware(),
        'run-benchmark': () => this.runBenchmark(),
        'export-report': () => this.exportReport(),
        'device-settings': () => this.showSettings(),
        
        // Network controls
        'scan-wifi': () => this.scanWiFiNetworks(),
        'discover-p2p': () => this.discoverP2PPeers(),
        'scan-bluetooth': () => this.scanBluetoothDevices(),
        'network-diagnostics': () => this.runNetworkDiagnostics(),
        
        // Benchmark controls
        'cpu-benchmark': () => this.runCPUBenchmark(),
        'memory-benchmark': () => this.runMemoryBenchmark(),
        'gpu-benchmark': () => this.runGPUBenchmark(),
        'storage-benchmark': () => this.runStorageBenchmark(),
        'network-benchmark': () => this.runNetworkBenchmark(),
        'full-benchmark': () => this.runFullBenchmark(),
        
        // Driver controls
        'scan-drivers': () => this.scanDrivers(),
        'update-all-drivers': () => this.updateAllDrivers(),
        'backup-drivers': () => this.backupDrivers(),
        'restore-drivers': () => this.restoreDrivers()
      };

      if (buttonHandlers[e.target.id]) {
        e.preventDefault();
        buttonHandlers[e.target.id]();
      }
    });
  }

  switchView(view) {
    this.currentView = view;
    
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
      const on = content.dataset.view === view;
      content.classList.toggle('active', on);
      content.style.display = on ? 'block' : 'none';
    });
    
    // Load view-specific data
    this.loadViewData(view);
  }

  async loadViewData(view) {
    switch (view) {
      case 'hardware':
        await this.loadHardwareData();
        break;
      case 'network':
        await this.loadNetworkDevices();
        break;
      case 'performance':
        await this.loadPerformanceData();
        break;
      case 'drivers':
        await this.loadDriverData();
        break;
    }
  }

  async loadInitialData() {
    await this.detectSystemInfo();
    await this.loadViewData(this.currentView);
  }

  async detectSystemInfo() {
    try {
      // Detect basic system information
      this.hardwareInfo = {
        deviceName: await this.getDeviceName(),
        os: this.getOSInfo(),
        browser: this.getBrowserInfo(),
        architecture: this.getArchitecture(),
        cpu: await this.getCPUInfo(),
        memory: await this.getMemoryInfo(),
        gpu: await this.getGPUInfo(),
        storage: await this.getStorageInfo(),
        network: await this.getNetworkInfo(),
        audio: await this.getAudioInfo(),
        display: await this.getDisplayInfo()
      };
      
      this.updateSystemSummary();
      console.log('✅ System information detected', this.hardwareInfo);
    } catch (error) {
      console.error('❌ Error detecting system info:', error);
    }
  }

  async getDeviceName() {
    return navigator.userAgentData?.platform || navigator.platform || 'Unknown device';
  }

  getOSInfo() {
    const userAgent = navigator.userAgent;
    let os = 'Unknown OS';
    
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iOS')) os = 'iOS';
    
    if (navigator.userAgentData) {
      const platformData = navigator.userAgentData;
      if (platformData.platform) {
        os = platformData.platform;
      }
    }
    
    return os;
  }

  getBrowserInfo() {
    const userAgent = navigator.userAgent;
    let browser = 'Unknown Browser';
    
    if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';
    else if (userAgent.includes('Edge')) browser = 'Edge';
    else if (userAgent.includes('Opera')) browser = 'Opera';
    
    return browser;
  }

  getArchitecture() {
    return navigator.userAgentData?.architecture || navigator.platform || 'Unknown';
  }

  async getCPUInfo() {
    return {
      cores: navigator.hardwareConcurrency || 'Unknown',
      architecture: navigator.userAgentData?.architecture || 'Unknown',
      vendor: 'Unknown', // Would require native access
      model: 'Unknown', // Would require native access
      frequency: 'Unknown' // Would require native access
    };
  }

  async getMemoryInfo() {
    const info = {
      total: 'Unknown',
      used: 'Unknown',
      available: 'Unknown'
    };
    
    if ('memory' in performance) {
      const memInfo = performance.memory;
      info.total = this.formatBytes(memInfo.totalJSHeapSize);
      info.used = this.formatBytes(memInfo.usedJSHeapSize);
      info.available = this.formatBytes(memInfo.totalJSHeapSize - memInfo.usedJSHeapSize);
    }
    
    return info;
  }

  async getGPUInfo() {
    const info = {
      vendor: 'Unknown',
      renderer: 'Unknown',
      version: 'Unknown',
      extensions: []
    };
    
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          info.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
          info.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        }
        info.version = gl.getParameter(gl.VERSION);
        info.extensions = gl.getSupportedExtensions() || [];
      }
    } catch (error) {
      console.warn('Could not get GPU info:', error);
    }
    
    return info;
  }

  async getStorageInfo() {
    const info = {
      total: 'Unknown',
      used: 'Unknown',
      available: 'Unknown'
    };
    
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        if (estimate.quota && estimate.usage) {
          info.total = this.formatBytes(estimate.quota);
          info.used = this.formatBytes(estimate.usage);
          info.available = this.formatBytes(estimate.quota - estimate.usage);
        }
      } catch (error) {
        console.warn('Could not get storage info:', error);
      }
    }
    
    return info;
  }

  async getNetworkInfo() {
    const info = {
      type: 'Unknown',
      effectiveType: 'Unknown',
      downlink: 'Unknown',
      rtt: 'Unknown'
    };
    
    if ('connection' in navigator) {
      const conn = navigator.connection;
      info.type = conn.type || 'Unknown';
      info.effectiveType = conn.effectiveType || 'Unknown';
      info.downlink = conn.downlink ? `${conn.downlink} Mbps` : 'Unknown';
      info.rtt = conn.rtt ? `${conn.rtt} ms` : 'Unknown';
    }
    
    return info;
  }

  async getAudioInfo() {
    const info = {
      inputDevices: [],
      outputDevices: [],
      sampleRate: 'Unknown'
    };
    
    if ('mediaDevices' in navigator && 'enumerateDevices' in navigator.mediaDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        info.inputDevices = devices.filter(device => device.kind === 'audioinput');
        info.outputDevices = devices.filter(device => device.kind === 'audiooutput');
      } catch (error) {
        console.warn('Could not enumerate audio devices:', error);
      }
    }
    
    if ('AudioContext' in window) {
      try {
        const audioContext = new AudioContext();
        info.sampleRate = `${audioContext.sampleRate} Hz`;
        audioContext.close();
      } catch (error) {
        console.warn('Could not get audio context info:', error);
      }
    }
    
    return info;
  }

  async getDisplayInfo() {
    return {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth,
      orientation: screen.orientation ? screen.orientation.type : 'Unknown'
    };
  }

  updateSystemSummary() {
    const elements = {
      'device-name': this.hardwareInfo.deviceName,
      'os-info': this.hardwareInfo.os,
      'browser-info': this.hardwareInfo.browser,
      'architecture': this.hardwareInfo.architecture
    };
    
    Object.entries(elements).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });
  }

  async loadHardwareData() {
    const categoriesContainer = document.getElementById('hardware-categories');
    const deviceList = document.getElementById('hardware-device-list');
    
    if (categoriesContainer) {
      categoriesContainer.innerHTML = Object.entries(this.deviceCategories).map(([key, category]) => `
        <div class="category-card sk-card" data-category="${key}" style="border-left: 4px solid ${category.color}">
          <div class="category-icon">${category.icon}</div>
          <div class="category-name">${category.name}</div>
          <div class="category-count">${this.getDeviceCount(key)}</div>
        </div>
      `).join('');
    }
    
    if (deviceList) {
      deviceList.innerHTML = this.generateHardwareDeviceList();
    }
  }

  getDeviceCount(category) {
    switch (category) {
      case 'processor': return '1';
      case 'memory': return '1';
      case 'storage': return '1';
      case 'graphics': return '1';
      case 'network': return this.hardwareInfo.network ? '1' : '0';
      case 'audio': return (this.hardwareInfo.audio?.inputDevices?.length || 0) + (this.hardwareInfo.audio?.outputDevices?.length || 0);
      case 'display': return '1';
      default: return '0';
    }
  }

  generateHardwareDeviceList() {
    // Only real, browser-exposed device facts are shown. Metrics the browser
    // does not expose (temperature, utilization) are omitted, not invented.
    const devices = [
      {
        category: 'processor',
        name: 'CPU',
        details: `${this.hardwareInfo.cpu.cores} cores, ${this.hardwareInfo.cpu.architecture}`,
        status: 'working'
      },
      {
        category: 'memory',
        name: 'System Memory',
        details: `Total: ${this.hardwareInfo.memory.total}, Available: ${this.hardwareInfo.memory.available}`,
        status: 'working'
      },
      {
        category: 'graphics',
        name: 'Graphics Card',
        details: 'source: browser WebGL',
        status: 'working'
      },
      {
        category: 'storage',
        name: 'Storage',
        details: `Total: ${this.hardwareInfo.storage.total}, Used: ${this.hardwareInfo.storage.used}`,
        status: 'working'
      },
      {
        category: 'network',
        name: 'Network Adapter',
        details: `${this.hardwareInfo.network.type}, ${this.hardwareInfo.network.effectiveType}`,
        status: 'working',
        speed: this.hardwareInfo.network.downlink
      },
      {
        category: 'display',
        name: 'Display',
        details: `${this.hardwareInfo.display.width}x${this.hardwareInfo.display.height}, ${this.hardwareInfo.display.colorDepth}-bit`,
        status: 'working',
        orientation: this.hardwareInfo.display.orientation
      }
    ];
    
    return devices.map(device => `
      <div class="device-item">
        <div class="device-icon">${this.deviceCategories[device.category].icon}</div>
        <div class="device-info">
          <div class="device-name">${device.name}</div>
          <div class="device-details">${device.details}</div>
        </div>
        <div class="device-status">
          <span class="status-badge status-${device.status}"><span class="sk-status-dot ${device.status === 'working' ? 'is-ok' : 'is-idle'}"></span>${device.status}</span>
          ${device.temperature ? `<span class="device-metric">🌡️ ${device.temperature}</span>` : ''}
          ${device.usage ? `<span class="device-metric">📊 ${device.usage}</span>` : ''}
          ${device.speed ? `<span class="device-metric">⚡ ${device.speed}</span>` : ''}
          ${device.orientation ? `<span class="device-metric">🔄 ${device.orientation}</span>` : ''}
        </div>
        <div class="device-actions">
          <button class="device-btn" onclick="deviceManager.viewDeviceDetails('${device.category}')">📋</button>
          <button class="device-btn" onclick="deviceManager.testDevice('${device.category}')">🧪</button>
        </div>
      </div>
    `).join('');
  }

  async loadNetworkDevices() {
    await this.updateNetworkStats();
    await this.loadNetworkInterfaces();
    await this.loadP2PPeers();
  }

  async updateNetworkStats() {
    // Update network statistics
    const stats = {
      'network-interfaces-count': navigator.connection ? (navigator.connection.effectiveType ? 1 : 0) : 1,
      'wifi-networks-count': 0,
      'p2p-peers-count': this.p2pSystem?.peers?.size || 0,
      'bluetooth-devices-count': this.hardwareInfo.audio?.inputDevices?.length || 0
    };
    
    Object.entries(stats).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });
  }

  async loadNetworkInterfaces() {
    const table = document.getElementById('network-interfaces-table');
    if (!table) return;
    
    // Network interface data from actual browser APIs
    const interfaces = await this.getNetworkInterfaces();
    
    table.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Interface</th>
            <th>Type</th>
            <th>Status</th>
            <th>IP Address</th>
            <th>Speed</th>
            <th>MAC Address</th>
          </tr>
        </thead>
        <tbody>
          ${interfaces.map(iface => `
            <tr>
              <td>${iface.name}</td>
              <td>${iface.type}</td>
              <td><span class="status-badge status-connected"><span class="sk-status-dot is-ok"></span>${iface.status}</span></td>
              <td>${iface.ipAddress}</td>
              <td>${iface.speed}</td>
              <td>${iface.mac}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  async loadP2PPeers() {
    const table = document.getElementById('p2p-peers-table');
    if (!table || !this.p2pSystem) {
      if (table) {
        table.innerHTML = '<div class="no-data">P2P network not available</div>';
      }
      return;
    }
    
    const peers = Array.from(this.p2pSystem.peers?.values() || []);
    
    if (peers.length === 0) {
      table.innerHTML = '<div class="no-data">No P2P peers connected</div>';
      return;
    }
    
    table.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Peer ID</th>
            <th>Status</th>
            <th>Latency</th>
            <th>Capabilities</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${peers.map(peer => `
            <tr>
              <td>${peer.id.slice(0, 16)}...</td>
              <td><span class="status-badge status-connected"><span class="sk-status-dot is-ok"></span>Connected</span></td>
              <td>n/a</td>
              <td>${peer.capabilities?.join(', ') || 'Unknown'}</td>
              <td>
                <button class="device-btn small sk-btn" onclick="deviceManager.pingPeer('${peer.id}')">📡</button>
                <button class="device-btn small sk-btn" onclick="deviceManager.viewPeerDetails('${peer.id}')">🔍</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  async loadPerformanceData() {
    await this.loadBenchmarkResults();
    this.startPerformanceMonitoring();
  }

  async loadBenchmarkResults() {
    const grid = document.getElementById('benchmark-results-grid');
    if (!grid) return;
    
    // Load any saved benchmark results
    const results = this.loadSavedBenchmarks();
    
    if (results.length === 0) {
      grid.innerHTML = '<div class="no-data">No benchmark results available. Run benchmarks to see performance data.</div>';
      return;
    }
    
    grid.innerHTML = results.map(result => `
      <div class="benchmark-result-card">
        <div class="result-header">
          <span class="result-icon">${result.icon}</span>
          <span class="result-name">${result.name}</span>
        </div>
        <div class="result-score">${result.score}</div>
        <div class="result-date">${new Date(result.date).toLocaleDateString()}</div>
      </div>
    `).join('');
  }

  loadSavedBenchmarks() {
    try {
      const saved = localStorage.getItem('swissknife-benchmarks');
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error('Error loading saved benchmarks:', error);
      return [];
    }
  }

  saveBenchmark(result) {
    try {
      const benchmarks = this.loadSavedBenchmarks();
      benchmarks.push(result);
      
      // Keep only the last 20 results
      if (benchmarks.length > 20) {
        benchmarks.splice(0, benchmarks.length - 20);
      }
      
      localStorage.setItem('swissknife-benchmarks', JSON.stringify(benchmarks));
    } catch (error) {
      console.error('Error saving benchmark:', error);
    }
  }

  async loadDriverData() {
    const table = document.getElementById('drivers-table');
    const recommendations = document.getElementById('driver-recommendations');
    
    // Get driver information from browser capabilities
    const drivers = this.getFallbackDriverInfo();
    
    if (table) {
      table.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Driver Name</th>
              <th>Version</th>
              <th>Vendor</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${drivers.map(driver => `
              <tr>
                <td>${driver.name}</td>
                <td>${driver.version}</td>
                <td>${driver.vendor}</td>
                <td><span class="status-badge status-${driver.status}"><span class="sk-status-dot ${driver.status === 'updated' ? 'is-ok' : driver.status === 'outdated' ? 'is-warn' : driver.status === 'missing' ? 'is-err' : 'is-idle'}"></span>${driver.status}</span></td>
                <td>
                  <button class="device-btn small sk-btn" onclick="deviceManager.updateDriver('${driver.name}')">⬆️</button>
                  <button class="device-btn small sk-btn" onclick="deviceManager.viewDriverDetails('${driver.name}')">🔍</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
    
    // Update driver stats
    const stats = drivers.reduce((acc, driver) => {
      acc.total++;
      if (driver.status === 'updated') acc.updated++;
      else if (driver.status === 'outdated') acc.outdated++;
      else if (driver.status === 'missing') acc.missing++;
      return acc;
    }, { total: 0, updated: 0, outdated: 0, missing: 0 });
    
    Object.entries(stats).forEach(([key, value]) => {
      const element = document.getElementById(`${key}-drivers`);
      if (element) element.textContent = value;
    });
    
    if (recommendations) {
      // Recommendations are derived from the actually-detected devices
      // above — never canned. Driver updates themselves are OS/browser
      // managed and cannot be performed from this surface.
      const recs = [];
      const names = drivers.map(d => d.name);
      if (!names.some(n => n.toLowerCase().includes('graphics') || n.toLowerCase().includes('webgl'))) {
        recs.push({ type: 'info', message: 'No WebGL graphics device was detected — enable hardware acceleration in your browser for GPU-backed features.' });
      }
      if (!names.some(n => n.toLowerCase().includes('audio'))) {
        recs.push({ type: 'info', message: 'No Web Audio device was detected — audio features may be unavailable.' });
      }
      if (!navigator.onLine) {
        recs.push({ type: 'info', message: 'This browser reports it is offline — network-dependent features will fail until connectivity returns.' });
      }
      if (recs.length === 0) {
        recs.push({ type: 'success', message: `All ${drivers.length} detected device(s) are reporting normally.` });
      }

      recommendations.innerHTML = recs.map(rec => `
        <div class="recommendation recommendation-${rec.type}">
          ${rec.message}
        </div>
      `).join('');
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Device operations
  async scanDevices() {
    this.showNotification('Refreshing browser device access. No radio scan was started.', 'info');

    // Real detection runs immediately; no theatrical delay is inserted.
    await this.detectSystemInfo();
    await this.loadViewData(this.currentView);

    this.showNotification('Browser device access refreshed. No radio scan or benchmark was run.', 'info');
  }

  // --- Device detail / test actions (all real local operations) ---

  viewDeviceDetails(category) {
    const info = this.hardwareInfo?.[category];
    if (!info) {
      this.showNotification(`No details available for "${category}".`, 'info');
      return;
    }
    const lines = Object.entries(info).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    alert(`Device details — ${category} (live browser data):\n\n${lines.join('\n')}`);
  }

  async testDevice(category) {
    this.showNotification(`Testing ${category}...`, 'info');
    try {
      let result;
      switch (category) {
        case 'audio': {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (!Ctx) throw new Error('Web Audio is not available in this browser.');
          const ctx = new Ctx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          gain.gain.value = 0.1;
          osc.connect(gain).connect(ctx.destination);
          osc.start();
          await new Promise(r => setTimeout(r, 400));
          osc.stop();
          await ctx.close();
          result = 'Audio output test tone played successfully.';
          break;
        }
        case 'display':
          result = `Display reports ${window.screen.width}x${window.screen.height}, ${window.screen.colorDepth}-bit color.`;
          break;
        case 'network':
          result = navigator.onLine
            ? `Browser reports online${navigator.connection ? ` (${navigator.connection.effectiveType}, ~${navigator.connection.downlink} Mbps)` : ''}.`
            : 'Browser reports OFFLINE.';
          break;
        case 'storage': {
          if (!('storage' in navigator) || !('estimate' in navigator.storage)) throw new Error('Storage estimate API not available.');
          const est = await navigator.storage.estimate();
          result = `Storage estimate: ${this.formatBytes(est.usage || 0)} used of ${this.formatBytes(est.quota || 0)} quota.`;
          break;
        }
        case 'memory':
          result = navigator.deviceMemory
            ? `Device reports ~${navigator.deviceMemory} GB RAM.`
            : 'Exact RAM is not exposed by this browser.';
          break;
        case 'graphics': {
          const canvas = document.createElement('canvas');
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
          result = gl ? 'WebGL context created successfully.' : 'WebGL is not available.';
          break;
        }
        case 'processor':
          result = `${navigator.hardwareConcurrency || 'unknown'} logical CPU cores visible to this browser.`;
          break;
        default:
          result = `No automated test for "${category}".`;
      }
      this.showNotification(`Test passed: ${result}`, 'success');
    } catch (error) {
      this.showNotification(`Test failed: ${error.message}`, 'error');
    }
  }

  viewDriverDetails(name) {
    const drivers = this.getFallbackDriverInfo ? this.getFallbackDriverInfo() : [];
    const driver = drivers.find(d => d.name === name);
    if (!driver) {
      this.showNotification(`No driver record for "${name}".`, 'info');
      return;
    }
    alert(`Driver details (live browser capabilities):\n\nName: ${driver.name}\nVersion: ${driver.version}\nVendor: ${driver.vendor}\nStatus: ${driver.status}`);
  }

  updateDriver(name) {
    // Honest: drivers are managed by the OS/browser — this surface cannot
    // update them, and no longer pretends a click did.
    this.showNotification(`"${name}" is managed by your OS/browser — driver updates cannot be performed from this app.`, 'info');
  }

  async pingPeer(peerId) {
    const peers = Array.from(this.p2pSystem?.peers?.values() || []);
    const peer = peers.find(p => p.id === peerId);
    if (!peer) {
      this.showNotification(`Peer ${peerId} is not in the connected set.`, 'error');
      return;
    }
    try {
      if (typeof this.p2pSystem.ping === 'function') {
        const start = performance.now();
        await this.p2pSystem.ping(peerId);
        const ms = Math.round(performance.now() - start);
        this.showNotification(`Ping to ${peerId.slice(0, 16)}…: ${ms} ms (real round-trip)`, 'success');
      } else {
        this.showNotification(`Peer ${peerId.slice(0, 16)}… is connected, but this P2P layer exposes no ping operation.`, 'info');
      }
    } catch (error) {
      this.showNotification(`Ping failed: ${error.message}`, 'error');
    }
  }

  viewPeerDetails(peerId) {
    const peers = Array.from(this.p2pSystem?.peers?.values() || []);
    const peer = peers.find(p => p.id === peerId);
    if (!peer) {
      this.showNotification(`Peer ${peerId} is not in the connected set.`, 'info');
      return;
    }
    const caps = peer.capabilities?.join(', ') || 'Unknown';
    alert(`Peer details (live P2P state):\n\nID: ${peer.id}\nStatus: connected\nCapabilities: ${caps}`);
  }

  async runBenchmark() {
    const view = this.currentView;
    if (view === 'performance') {
      await this.runFullBenchmark();
    } else {
      this.switchView('performance');
      setTimeout(() => this.runFullBenchmark(), 500);
    }
  }

  async runCPUBenchmark() {
    this.showNotification('Running CPU benchmark...', 'info');
    
    const startTime = performance.now();
    
    // Simple CPU benchmark
    let result = 0;
    for (let i = 0; i < 1000000; i++) {
      result += Math.sqrt(i) * Math.sin(i);
    }
    
    const endTime = performance.now();
    const score = Math.round(100000 / (endTime - startTime));
    
    const benchmarkResult = {
      name: 'CPU Performance',
      icon: '🔥',
      score: `${score} points`,
      date: Date.now(),
      type: 'cpu'
    };
    
    this.saveBenchmark(benchmarkResult);
    this.showNotification(`CPU benchmark completed: ${score} points`, 'success');
    
    return benchmarkResult;
  }

  async runMemoryBenchmark() {
    this.showNotification('Running memory benchmark...', 'info');
    
    const startTime = performance.now();
    
    // Simple memory benchmark
    const arrays = [];
    for (let i = 0; i < 100; i++) {
      arrays.push(new Array(10000).fill(Math.random()));
    }
    
    const endTime = performance.now();
    const score = Math.round(100000 / (endTime - startTime));
    
    const benchmarkResult = {
      name: 'Memory Performance',
      icon: '🧠',
      score: `${score} points`,
      date: Date.now(),
      type: 'memory'
    };
    
    this.saveBenchmark(benchmarkResult);
    this.showNotification(`Memory benchmark completed: ${score} points`, 'success');
    
    return benchmarkResult;
  }

  async runGPUBenchmark() {
    this.showNotification('Running GPU benchmark...', 'info');
    
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      
      if (!gl) {
        this.showNotification('WebGL not available for GPU benchmark', 'error');
        return null;
      }
      
      const startTime = performance.now();
      
      // Simple GPU benchmark using WebGL
      for (let i = 0; i < 1000; i++) {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      
      const endTime = performance.now();
      const score = Math.round(100000 / (endTime - startTime));
      
      const benchmarkResult = {
        name: 'GPU Performance',
        icon: '🎮',
        score: `${score} points`,
        date: Date.now(),
        type: 'gpu'
      };
      
      this.saveBenchmark(benchmarkResult);
      this.showNotification(`GPU benchmark completed: ${score} points`, 'success');
      
      return benchmarkResult;
    } catch (error) {
      this.showNotification('GPU benchmark failed', 'error');
      return null;
    }
  }

  async runFullBenchmark() {
    this.showNotification('Running full system benchmark...', 'info');
    
    const results = [];
    
    // Run all benchmarks sequentially
    const cpuResult = await this.runCPUBenchmark();
    if (cpuResult) results.push(cpuResult);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const memoryResult = await this.runMemoryBenchmark();
    if (memoryResult) results.push(memoryResult);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const gpuResult = await this.runGPUBenchmark();
    if (gpuResult) results.push(gpuResult);
    
    // Reload benchmark results
    await this.loadBenchmarkResults();
    
    this.showNotification(`Full benchmark completed! ${results.length} tests run.`, 'success');
  }

  startHardwareMonitoring() {
    this.startPerformanceMonitoring();
  }

  startPerformanceMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.monitoringInterval = setInterval(() => {
      this.updatePerformanceMonitors();
    }, 1000);
  }

  updatePerformanceMonitors() {
    const unread = 'not observed';
    ['cpu-temp', 'cpu-freq', 'memory-available', 'memory-speed', 'gpu-memory-usage', 'gpu-temp', 'network-latency', 'network-throughput'].forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.textContent = unread;
    });
  }

  updateMonitorChart(elementId, value) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const percentage = Math.min(value, 100);
    const color = this.getBarColor(percentage);
    
    element.innerHTML = `
      <div class="monitor-bar" style="width: ${percentage}%; background: ${color}"></div>
      <div class="monitor-value">${value.toFixed(1)}%</div>
    `;
  }

  getBarColor(percentage) {
    if (percentage < 50) return '#4CAF50'; // Green
    if (percentage < 80) return '#FF9800'; // Orange
    return '#F44336'; // Red
  }

  setupP2PDiscovery() {
    if (!this.p2pSystem) return;
    
    this.p2pSystem.on('peer:connected', () => {
      if (this.currentView === 'network') {
        this.loadP2PPeers();
        this.updateNetworkStats();
      }
    });
    
    this.p2pSystem.on('peer:disconnected', () => {
      if (this.currentView === 'network') {
        this.loadP2PPeers();
        this.updateNetworkStats();
      }
    });
  }

  showSettings() {
    this.showNotification('Device settings stay on this desktop. No backend call was made.', 'info');
  }

  scanWiFiNetworks() {
    const link = navigator.connection && navigator.connection.downlink;
    this.showNotification(link
      ? `Browser link sample: ${link} Mbps. This desktop did not scan Wi-Fi radios.`
      : 'No Wi-Fi scan. This desktop did not enumerate radios.', 'info');
  }

  discoverP2PPeers() {
    this.showNotification('No peer sample is bound on this surface.', 'info');
  }

  scanBluetoothDevices() {
    this.showNotification('Bluetooth scan was not started. This desktop did not list radios.', 'info');
  }

  runNetworkDiagnostics() {
    this.showNotification(navigator.onLine
      ? 'Browser reports online. No route or latency sample was taken.'
      : 'Browser reports offline. No route sample was taken.', 'info');
  }

  async runStorageBenchmark() {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage == null ? 'unknown' : this.formatBytes(estimate.usage);
      this.showNotification(`Browser storage estimate: ${used} used. This is not a disk benchmark.`, 'info');
      return;
    }
    this.showNotification('Storage benchmark was not measured on this desktop.', 'info');
  }

  runNetworkBenchmark() {
    const link = navigator.connection && navigator.connection.downlink;
    this.showNotification(link
      ? `Browser downlink hint: ${link} Mbps. This desktop did not run a throughput test.`
      : 'Network benchmark was not measured on this desktop.', 'info');
  }

  scanDrivers() {
    const drivers = typeof this.getFallbackDriverInfo === 'function' ? this.getFallbackDriverInfo() : [];
    this.showNotification(drivers.length
      ? `Browser-visible drivers: ${drivers.length}. OS driver inventory was not read.`
      : 'No browser-visible driver. OS driver inventory was not read.', 'info');
  }

  updateAllDrivers() {
    this.showNotification('Driver updates are managed by the OS. This desktop did not change any driver.', 'info');
  }

  backupDrivers() {
    this.showNotification('Driver backup is not available from this desktop.', 'info');
  }

  restoreDrivers() {
    this.showNotification('Driver restore is not available from this desktop.', 'info');
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  exportReport() {
    const report = {
      systemInfo: this.hardwareInfo,
      benchmarks: this.loadSavedBenchmarks(),
      timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `swissknife-device-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async getNetworkInterfaces() {
    // Get network information from browser APIs
    const interfaces = [];
    
    if (navigator.connection) {
      interfaces.push({
        name: 'Primary Connection',
        type: navigator.connection.effectiveType || 'Unknown',
        status: navigator.onLine ? 'Connected' : 'Disconnected',
        ipAddress: 'Detected via Browser API',
        speed: navigator.connection.downlink ? `${navigator.connection.downlink} Mbps` : 'Unknown',
        mac: 'Protected'
      });
    } else {
      interfaces.push({
        name: 'Network Adapter',
        type: 'Unknown',
        status: navigator.onLine ? 'Connected' : 'Disconnected',
        ipAddress: 'Browser API Limited',
        speed: 'Unknown',
        mac: 'Protected'
      });
    }
    
    return interfaces;
  }

  getFallbackDriverInfo() {
    // Provide driver information based on browser capabilities
    const drivers = [];
    
    // Graphics driver (from WebGL)
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      drivers.push({
        name: 'Graphics Driver (WebGL)',
        version: gl.getParameter(gl.VERSION),
        vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Unknown',
        status: 'active'
      });
    }
    
    // Audio driver
    if (window.AudioContext || window.webkitAudioContext) {
      drivers.push({
        name: 'Web Audio API',
        version: 'Available',
        vendor: 'Browser Native',
        status: 'active'
      });
    }
    
    // Network driver
    if (navigator.connection) {
      drivers.push({
        name: 'Network Interface',
        version: navigator.connection.effectiveType || 'Unknown',
        vendor: 'Browser API',
        status: 'active'
      });
    }
    
    return drivers;
  }

  onDestroy() {
    if (this.domObserver) {
      this.domObserver.disconnect();
      this.domObserver = null;
    }
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    if (this.p2pSystem) {
      this.p2pSystem.off('peer:connected');
      this.p2pSystem.off('peer:disconnected');
    }
  }
}

// Export for global access
if (typeof window !== 'undefined') {
  window.DeviceManagerApp = DeviceManagerApp;
  window.createDeviceManagerApp = (desktop) => new DeviceManagerApp(desktop);
  if (!window.__skDmDedupeObserver && typeof document !== 'undefined' && document.documentElement) {
    const state = { _skDmDeduping: false };
    const run = () => DeviceManagerApp.prototype.dedupeDeviceManagerDom.call(state);
    window.__skDmDedupeObserver = new MutationObserver(run);
    window.__skDmDedupeObserver.observe(document.documentElement, { childList: true, subtree: true });
    run();
  }
}
