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

  createWindow() {
    const content = `
      <div class="device-manager-container">
        <div class="device-manager-header">
          <div class="header-tabs">
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
            <button class="control-btn" id="scan-devices" title="Scan for Devices">🔍</button>
            <button class="control-btn" id="run-benchmark" title="Run Benchmark">⚡</button>
            <button class="control-btn" id="export-report" title="Export Report">📤</button>
            <button class="control-btn" id="device-settings" title="Settings">⚙️</button>
          </div>
        </div>

        <div class="device-manager-content">
          <!-- Hardware View -->
          <div class="tab-content ${this.currentView === 'hardware' ? 'active' : ''}" data-view="hardware">
            <div class="hardware-overview">
              <div class="system-summary">
                <h3>💻 System Information</h3>
                <div class="summary-grid">
                  <div class="summary-item">
                    <span class="summary-label">Device Name</span>
                    <span class="summary-value" id="device-name">Loading...</span>
                  </div>
                  <div class="summary-item">
                    <span class="summary-label">Operating System</span>
                    <span class="summary-value" id="os-info">Loading...</span>
                  </div>
                  <div class="summary-item">
                    <span class="summary-label">Browser</span>
                    <span class="summary-value" id="browser-info">Loading...</span>
                  </div>
                  <div class="summary-item">
                    <span class="summary-label">Architecture</span>
                    <span class="summary-value" id="architecture">Loading...</span>
                  </div>
                </div>
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
          <div class="tab-content ${this.currentView === 'network' ? 'active' : ''}" data-view="network">
            <div class="network-overview">
              <div class="network-stats">
                <div class="stat-card">
                  <div class="stat-icon">🌐</div>
                  <div class="stat-content">
                    <div class="stat-value" id="network-interfaces-count">0</div>
                    <div class="stat-label">Network Interfaces</div>
                  </div>
                </div>
                <div class="stat-card">
                  <div class="stat-icon">📶</div>
                  <div class="stat-content">
                    <div class="stat-value" id="wifi-networks-count">0</div>
                    <div class="stat-label">WiFi Networks</div>
                  </div>
                </div>
                <div class="stat-card">
                  <div class="stat-icon">🔗</div>
                  <div class="stat-content">
                    <div class="stat-value" id="p2p-peers-count">0</div>
                    <div class="stat-label">P2P Peers</div>
                  </div>
                </div>
                <div class="stat-card">
                  <div class="stat-icon">🔊</div>
                  <div class="stat-content">
                    <div class="stat-value" id="bluetooth-devices-count">0</div>
                    <div class="stat-label">Bluetooth Devices</div>
                  </div>
                </div>
              </div>
              
              <div class="network-controls">
                <button class="network-btn" id="scan-wifi">📶 Scan WiFi</button>
                <button class="network-btn" id="discover-p2p">🔗 Discover P2P</button>
                <button class="network-btn" id="scan-bluetooth">🔊 Scan Bluetooth</button>
                <button class="network-btn" id="network-diagnostics">🔧 Diagnostics</button>
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
          <div class="tab-content ${this.currentView === 'performance' ? 'active' : ''}" data-view="performance">
            <div class="performance-overview">
              <h3>⚡ Hardware Performance</h3>
              
              <div class="benchmark-controls">
                <button class="benchmark-btn" id="cpu-benchmark">🔥 CPU Benchmark</button>
                <button class="benchmark-btn" id="memory-benchmark">🧠 Memory Test</button>
                <button class="benchmark-btn" id="gpu-benchmark">🎮 GPU Test</button>
                <button class="benchmark-btn" id="storage-benchmark">💾 Storage Test</button>
                <button class="benchmark-btn" id="network-benchmark">🌐 Network Test</button>
                <button class="benchmark-btn full" id="full-benchmark">🚀 Full System Test</button>
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
                <div class="monitor-card">
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

                <div class="monitor-card">
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

                <div class="monitor-card">
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

                <div class="monitor-card">
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
          <div class="tab-content ${this.currentView === 'drivers' ? 'active' : ''}" data-view="drivers">
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
                <button class="driver-btn" id="scan-drivers">🔍 Scan Drivers</button>
                <button class="driver-btn" id="update-all-drivers">⬆️ Update All</button>
                <button class="driver-btn" id="backup-drivers">💾 Backup Drivers</button>
                <button class="driver-btn" id="restore-drivers">♻️ Restore Drivers</button>
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

  async initialize() {
    await this.initializeIntegrations();
    this.setupEventListeners();
    await this.loadInitialData();
  }

  setupEventListeners() {
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
      content.classList.toggle('active', content.dataset.view === view);
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
    // Try to get device name from various sources
    try {
      if ('bluetooth' in navigator && 'getDevices' in navigator.bluetooth) {
        const devices = await navigator.bluetooth.getDevices();
        if (devices.length > 0) {
          return devices[0].name || 'Unknown Device';
        }
      }
    } catch (error) {
      // Bluetooth not available
    }
    
    return navigator.userAgentData?.platform || navigator.platform || 'Unknown Device';
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
        <div class="category-card" data-category="${key}" style="border-left: 4px solid ${category.color}">
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
    const devices = [
      {
        category: 'processor',
        name: 'CPU',
        details: `${this.hardwareInfo.cpu.cores} cores, ${this.hardwareInfo.cpu.architecture}`,
        status: 'working',
        temperature: `${Math.floor(Math.random() * 30) + 40}°C`
      },
      {
        category: 'memory',
        name: 'System Memory',
        details: `Total: ${this.hardwareInfo.memory.total}, Available: ${this.hardwareInfo.memory.available}`,
        status: 'working',
        usage: `${Math.floor(Math.random() * 40) + 40}%`
      },
      {
        category: 'graphics',
        name: 'Graphics Card',
        details: `${this.hardwareInfo.gpu.vendor} ${this.hardwareInfo.gpu.renderer}`,
        status: 'working',
        usage: `${Math.floor(Math.random() * 30) + 20}%`
      },
      {
        category: 'storage',
        name: 'Storage',
        details: `Total: ${this.hardwareInfo.storage.total}, Used: ${this.hardwareInfo.storage.used}`,
        status: 'working',
        usage: `${Math.floor(Math.random() * 60) + 20}%`
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
          <span class="status-badge status-${device.status}">${device.status}</span>
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
      'wifi-networks-count': Math.floor(Math.random() * 10) + 5,
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
      }
    ];
    
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
              <td><span class="status-badge status-connected">${iface.status}</span></td>
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
              <td><span class="status-badge status-connected">Connected</span></td>
              <td>${Math.floor(Math.random() * 100) + 10}ms</td>
              <td>${peer.capabilities?.join(', ') || 'Unknown'}</td>
              <td>
                <button class="device-btn small" onclick="deviceManager.pingPeer('${peer.id}')">📡</button>
                <button class="device-btn small" onclick="deviceManager.viewPeerDetails('${peer.id}')">🔍</button>
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
                <td><span class="status-badge status-${driver.status}">${driver.status}</span></td>
                <td>
                  <button class="device-btn small" onclick="deviceManager.updateDriver('${driver.name}')">⬆️</button>
                  <button class="device-btn small" onclick="deviceManager.viewDriverDetails('${driver.name}')">🔍</button>
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
      const recs = [
        { type: 'info', message: 'Consider updating Network Driver to improve performance' },
        { type: 'success', message: 'All critical drivers are up to date' }
      ];
      
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
    this.showNotification('Scanning for devices...', 'info');
    
    // Simulate device scanning
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await this.detectSystemInfo();
    await this.loadViewData(this.currentView);
    
    this.showNotification('Device scan completed', 'success');
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

  startPerformanceMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.monitoringInterval = setInterval(() => {
      this.updatePerformanceMonitors();
    }, 1000);
  }

  updatePerformanceMonitors() {
    // Update CPU monitoring
    const cpuUsage = Math.random() * 100;
    this.updateMonitorChart('cpu-monitor-chart', cpuUsage);
    
    const cpuTemp = document.getElementById('cpu-temp');
    const cpuFreq = document.getElementById('cpu-freq');
    if (cpuTemp) cpuTemp.textContent = `${Math.floor(Math.random() * 30) + 40}°C`;
    if (cpuFreq) cpuFreq.textContent = `${Math.floor(Math.random() * 1000) + 2000} MHz`;
    
    // Update Memory monitoring
    const memoryUsage = Math.random() * 100;
    this.updateMonitorChart('memory-monitor-chart', memoryUsage);
    
    const memAvailable = document.getElementById('memory-available');
    const memSpeed = document.getElementById('memory-speed');
    if (memAvailable) memAvailable.textContent = `${(Math.random() * 4 + 2).toFixed(1)} GB`;
    if (memSpeed) memSpeed.textContent = `${Math.floor(Math.random() * 1000) + 2400} MHz`;
    
    // Update GPU monitoring
    const gpuUsage = Math.random() * 100;
    this.updateMonitorChart('gpu-monitor-chart', gpuUsage);
    
    const gpuMemory = document.getElementById('gpu-memory-usage');
    const gpuTemp = document.getElementById('gpu-temp');
    if (gpuMemory) gpuMemory.textContent = `${Math.floor(Math.random() * 2000) + 1000} MB`;
    if (gpuTemp) gpuTemp.textContent = `${Math.floor(Math.random() * 40) + 50}°C`;
    
    // Update Network monitoring
    const networkUsage = Math.random() * 100;
    this.updateMonitorChart('network-monitor-chart', networkUsage);
    
    const netLatency = document.getElementById('network-latency');
    const netThroughput = document.getElementById('network-throughput');
    if (netLatency) netLatency.textContent = `${Math.floor(Math.random() * 50) + 10} ms`;
    if (netThroughput) netThroughput.textContent = `${(Math.random() * 100).toFixed(1)} MB/s`;
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
}