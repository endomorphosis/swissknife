/**
 * Advanced System Monitor App for SwissKnife Web Desktop
 * Real-time system monitoring with detailed analytics and performance insights
 */

import {
  describeSystemNetworkLocalCapabilities,
  runSystemNetworkLocalWorkflow
} from './system-network-local-capabilities.js';

export class SystemMonitorApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.updateInterval = null;
    this.chartData = {
      cpu: [],
      memory: [],
      gpu: [],
      network: [],
      disk: []
    };
    
    this.maxDataPoints = 60; // 1 minute of data at 1-second intervals
    this.alertThresholds = {
      cpu: 85,
      memory: 90,
      gpu: 95,
      temperature: 80,
      networkLatency: 1000
    };
    
    this.currentView = 'overview'; // 'overview', 'processes', 'network', 'storage', 'performance'
    this.processFilters = {
      sortBy: 'cpu', // 'cpu', 'memory', 'name', 'pid'
      sortOrder: 'desc',
      showSystemProcesses: false
    };
    this.systemNetworkLocalCapabilities = describeSystemNetworkLocalCapabilities('system-monitor', {
      localCapabilities: ['browser_metrics', 'process_table', 'alert_thresholds', 'storage_snapshot'],
      remoteCapabilities: ['node_status', 'hardware_profile', 'telemetry']
    });
    this.lastSystemNetworkLocalWorkflow = null;
    
    // System data from browser APIs where available
    this.systemInfo = {
      os: this.detectOS(),
      version: '1.0.0',
      architecture: this.detectArchitecture(),
      uptime: 0,
      totalMemory: this.detectTotalMemory(),
      availableMemory: this.detectAvailableMemory(),
      cpuCores: navigator.hardwareConcurrency || 8,
      cpuModel: this.detectCPUModel(),
      gpuModel: this.detectGPUModel()
    };
    
    this.networkInterfaces = [
      { name: 'WiFi', type: 'wireless', status: 'connected', speed: '866 Mbps' },
      { name: 'Ethernet', type: 'wired', status: 'disconnected', speed: '1 Gbps' },
      { name: 'P2P Network', type: 'p2p', status: 'connected', peers: 12 }
    ];
    
    this.storageDevices = [
      { name: 'C: (SSD)', type: 'SSD', total: 512 * 1024 * 1024 * 1024, used: 256 * 1024 * 1024 * 1024 },
      { name: 'D: (HDD)', type: 'HDD', total: 2 * 1024 * 1024 * 1024 * 1024, used: 800 * 1024 * 1024 * 1024 },
      { name: 'IPFS Storage', type: 'Distributed', total: 0, used: 1.2 * 1024 * 1024 * 1024 }
    ];
    
    this.mockProcesses = [
      { pid: 1234, name: 'SwissKnife Desktop', cpu: 12.5, memory: 256 * 1024 * 1024, status: 'running' },
      { pid: 1235, name: 'P2P Network Manager', cpu: 8.2, memory: 128 * 1024 * 1024, status: 'running' },
      { pid: 1236, name: 'IPFS Node', cpu: 15.1, memory: 512 * 1024 * 1024, status: 'running' },
      { pid: 1237, name: 'AI Model Server', cpu: 25.3, memory: 2 * 1024 * 1024 * 1024, status: 'running' },
      { pid: 1238, name: 'Web Browser', cpu: 18.7, memory: 1.5 * 1024 * 1024 * 1024, status: 'running' },
      { pid: 1239, name: 'Terminal', cpu: 2.1, memory: 64 * 1024 * 1024, status: 'running' },
      { pid: 1240, name: 'File Manager', cpu: 1.8, memory: 96 * 1024 * 1024, status: 'running' }
    ];
  }

  detectOS() {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Win')) return 'Windows';
    if (userAgent.includes('Mac')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';
    return 'Unknown OS';
  }

  detectArchitecture() {
    // Use platform API if available
    if (navigator.platform) {
      if (navigator.platform.includes('64')) return 'x64';
      if (navigator.platform.includes('32')) return 'x86';
    }
    // Default based on common modern systems
    return 'x64';
  }

  detectTotalMemory() {
    // Use Device Memory API if available
    if (navigator.deviceMemory) {
      return navigator.deviceMemory * 1024 * 1024 * 1024; // Convert GB to bytes
    }
    return 16 * 1024 * 1024 * 1024; // Default 16GB estimate
  }

  detectAvailableMemory() {
    // Browser doesn't provide this, estimate as half of total
    return this.detectTotalMemory() / 2;
  }

  detectCPUModel() {
    // Browser doesn't expose CPU model, estimate based on cores
    const cores = navigator.hardwareConcurrency || 8;
    if (cores >= 16) return 'High-performance CPU (16+ cores)';
    if (cores >= 8) return 'Multi-core CPU (8-15 cores)';
    if (cores >= 4) return 'Quad-core CPU';
    return 'Dual-core CPU';
  }

  detectGPUModel() {
    // Try to get GPU info from WebGL
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          return renderer || 'WebGL-capable GPU';
        }
      }
    } catch (e) {
      // Ignore errors
    }
    return 'GPU (vendor unknown)';
  }

  createWindow() {
    const content = `
      <div class="system-monitor-container">
        <!-- Navigation Tabs -->
        <div class="monitor-header">
          <div class="view-tabs">
            <button class="view-tab ${this.currentView === 'overview' ? 'active' : ''}" data-view="overview">
              <span class="tab-icon">📊</span>
              <span class="tab-text">Overview</span>
            </button>
            <button class="view-tab ${this.currentView === 'processes' ? 'active' : ''}" data-view="processes">
              <span class="tab-icon">⚡</span>
              <span class="tab-text">Processes</span>
            </button>
            <button class="view-tab ${this.currentView === 'network' ? 'active' : ''}" data-view="network">
              <span class="tab-icon">🌐</span>
              <span class="tab-text">Network</span>
            </button>
            <button class="view-tab ${this.currentView === 'storage' ? 'active' : ''}" data-view="storage">
              <span class="tab-icon">💾</span>
              <span class="tab-text">Storage</span>
            </button>
            <button class="view-tab ${this.currentView === 'performance' ? 'active' : ''}" data-view="performance">
              <span class="tab-icon">📈</span>
              <span class="tab-text">Performance</span>
            </button>
          </div>
          
          <div class="monitor-controls">
            <button class="control-btn" id="refresh-btn" title="Refresh">🔄</button>
            <button class="control-btn" id="alerts-btn" title="Alerts">🚨</button>
            <button class="control-btn" id="export-btn" title="Export Data">📤</button>
          </div>
        </div>

        <!-- System Status Bar -->
        <div class="status-bar">
          <div class="status-item">
            <span class="status-icon">🖥️</span>
            <span class="status-text">CPU: <span id="cpu-status">0%</span></span>
          </div>
          <div class="status-item">
            <span class="status-icon">🧠</span>
            <span class="status-text">RAM: <span id="memory-status">0%</span></span>
          </div>
          <div class="status-item">
            <span class="status-icon">🎮</span>
            <span class="status-text">GPU: <span id="gpu-status">0%</span></span>
          </div>
          <div class="status-item">
            <span class="status-icon">🌐</span>
            <span class="status-text">Network: <span id="network-status">0 MB/s</span></span>
          </div>
          <div class="status-item">
            <span class="status-icon">⏱️</span>
            <span class="status-text">Uptime: <span id="uptime-status">0h 0m</span></span>
          </div>
        </div>

        <!-- Main Content Area -->
        <div class="monitor-content" id="monitor-content">
          ${this.renderContentForView()}
        </div>

        <!-- Alert Panel -->
        <div class="alert-panel" id="alert-panel" style="display: none;">
          <div class="alert-header">
            <h3>🚨 System Alerts</h3>
            <button class="close-btn" id="close-alerts">×</button>
          </div>
          <div class="alert-list" id="alert-list">
            <!-- Alerts will be populated here -->
          </div>
        </div>
      </div>

      <style>
        .system-monitor-container {
          height: 100%;
          background: linear-gradient(135deg, #1a1a2e, #16213e);
          color: #e8eaed;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', roboto, sans-serif;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .monitor-header {
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .view-tabs {
          display: flex;
          gap: 4px;
        }

        .view-tab {
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 8px;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
        }

        .view-tab:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
        }

        .view-tab.active {
          background: linear-gradient(135deg, #4ade80, #22c55e);
          box-shadow: 0 2px 8px rgba(74, 222, 128, 0.3);
        }

        .monitor-controls {
          display: flex;
          gap: 8px;
        }

        .control-btn {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: none;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .control-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: scale(1.05);
        }

        .status-bar {
          padding: 8px 16px;
          background: rgba(0, 0, 0, 0.3);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          gap: 24px;
          overflow-x: auto;
        }

        .status-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          white-space: nowrap;
        }

        .status-icon {
          font-size: 14px;
        }

        .monitor-content {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
        }

        /* Overview Styles */
        .overview-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 16px;
          margin-bottom: 16px;
        }

        .metric-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          border-radius: 12px;
          padding: 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .metric-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .metric-title {
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .metric-value {
          font-size: 24px;
          font-weight: 300;
          margin-bottom: 8px;
        }

        .metric-subtitle {
          font-size: 12px;
          opacity: 0.7;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          overflow: hidden;
          margin-top: 8px;
        }

        .progress-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.3s ease;
        }

        .progress-cpu { background: linear-gradient(90deg, #60a5fa, #3b82f6); }
        .progress-memory { background: linear-gradient(90deg, #34d399, #10b981); }
        .progress-gpu { background: linear-gradient(90deg, #fbbf24, #f59e0b); }
        .progress-network { background: linear-gradient(90deg, #a78bfa, #8b5cf6); }

        .chart-container {
          height: 150px;
          margin-top: 12px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 8px;
          position: relative;
          overflow: hidden;
        }

        .chart-svg {
          width: 100%;
          height: 100%;
        }

        /* Process Table Styles */
        .process-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          gap: 16px;
        }

        .process-search {
          flex: 1;
          max-width: 300px;
        }

        .search-input {
          width: 100%;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          color: white;
          font-size: 14px;
        }

        .search-input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .process-filters {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .filter-select {
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          color: white;
          font-size: 12px;
        }

        .process-table {
          width: 100%;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          overflow: hidden;
        }

        .process-table th,
        .process-table td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .process-table th {
          background: rgba(255, 255, 255, 0.1);
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .process-table th:hover {
          background: rgba(255, 255, 255, 0.15);
        }

        .process-table tr:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .process-status {
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .status-running {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }

        .status-stopped {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }

        /* Network Styles */
        .network-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
          margin-bottom: 16px;
        }

        .network-interface {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 16px;
          border-left: 4px solid #4ade80;
        }

        .interface-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .interface-name {
          font-weight: 600;
          font-size: 16px;
        }

        .interface-status {
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .status-connected {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }

        .status-disconnected {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }

        .interface-details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          font-size: 12px;
        }

        .interface-detail {
          display: flex;
          justify-content: space-between;
        }

        /* Storage Styles */
        .storage-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .storage-device {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 16px;
          border-left: 4px solid #fbbf24;
        }

        .device-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .device-name {
          font-weight: 600;
          font-size: 16px;
        }

        .device-type {
          padding: 4px 8px;
          background: rgba(251, 191, 36, 0.2);
          color: #fbbf24;
          border-radius: 12px;
          font-size: 10px;
          font-weight: 600;
        }

        .storage-bar {
          margin-top: 12px;
        }

        .storage-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 12px;
        }

        /* Alert Panel */
        .alert-panel {
          position: absolute;
          top: 60px;
          right: 16px;
          width: 350px;
          background: rgba(0, 0, 0, 0.95);
          backdrop-filter: blur(20px);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          max-height: 400px;
          z-index: 1000;
        }

        .alert-header {
          padding: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .close-btn {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: none;
          background: rgba(239, 68, 68, 0.3);
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .alert-list {
          max-height: 300px;
          overflow-y: auto;
          padding: 8px;
        }

        .alert-item {
          padding: 12px;
          background: rgba(239, 68, 68, 0.1);
          border-left: 4px solid #ef4444;
          border-radius: 6px;
          margin-bottom: 8px;
          font-size: 12px;
        }

        .alert-item.warning {
          background: rgba(251, 191, 36, 0.1);
          border-left-color: #fbbf24;
        }

        .alert-item.info {
          background: rgba(59, 130, 246, 0.1);
          border-left-color: #3b82f6;
        }

        /* Animations */
        .pulse {
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        /* Responsive */
        @media (max-width: 768px) {
          .view-tabs {
            overflow-x: auto;
          }
          
          .tab-text {
            display: none;
          }
          
          .status-bar {
            flex-wrap: wrap;
          }
          
          .overview-grid {
            grid-template-columns: 1fr;
          }
          
          .process-controls {
            flex-direction: column;
            align-items: stretch;
          }
        }
      </style>
    `;

    return {
      title: 'System Monitor',
      content,
      width: 900,
      height: 650,
      x: 150,
      y: 75
    };
  }

  renderContentForView() {
    switch (this.currentView) {
      case 'overview':
        return this.renderOverviewContent();
      case 'processes':
        return this.renderProcessesContent();
      case 'network':
        return this.renderNetworkContent();
      case 'storage':
        return this.renderStorageContent();
      case 'performance':
        return this.renderPerformanceContent();
      default:
        return this.renderOverviewContent();
    }
  }

  renderOverviewContent() {
    return `
      <div class="overview-content">
        <div class="overview-grid">
          <div class="metric-card">
            <div class="metric-header">
              <div class="metric-title">
                <span>🖥️</span>
                <span>CPU Usage</span>
              </div>
              <span class="metric-value" id="cpu-metric">0%</span>
            </div>
            <div class="metric-subtitle">${this.systemInfo.cpuModel}</div>
            <div class="progress-bar">
              <div class="progress-fill progress-cpu" id="cpu-progress" style="width: 0%"></div>
            </div>
            <div class="chart-container">
              <canvas id="cpu-chart" class="chart-canvas"></canvas>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-header">
              <div class="metric-title">
                <span>🧠</span>
                <span>Memory Usage</span>
              </div>
              <span class="metric-value" id="memory-metric">0%</span>
            </div>
            <div class="metric-subtitle">${this.formatBytes(this.systemInfo.totalMemory)} Total</div>
            <div class="progress-bar">
              <div class="progress-fill progress-memory" id="memory-progress" style="width: 0%"></div>
            </div>
            <div class="chart-container">
              <canvas id="memory-chart" class="chart-canvas"></canvas>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-header">
              <div class="metric-title">
                <span>🎮</span>
                <span>GPU Usage</span>
              </div>
              <span class="metric-value" id="gpu-metric">0%</span>
            </div>
            <div class="metric-subtitle">${this.systemInfo.gpuModel}</div>
            <div class="progress-bar">
              <div class="progress-fill progress-gpu" id="gpu-progress" style="width: 0%"></div>
            </div>
            <div class="chart-container">
              <canvas id="gpu-chart" class="chart-canvas"></canvas>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-header">
              <div class="metric-title">
                <span>🌐</span>
                <span>Network Activity</span>
              </div>
              <span class="metric-value" id="network-metric">0 MB/s</span>
            </div>
            <div class="metric-subtitle">↓ <span id="download-speed">0 MB/s</span> ↑ <span id="upload-speed">0 MB/s</span></div>
            <div class="progress-bar">
              <div class="progress-fill progress-network" id="network-progress" style="width: 0%"></div>
            </div>
            <div class="chart-container">
              <canvas id="network-chart" class="chart-canvas"></canvas>
            </div>
          </div>
        </div>

        <div class="system-summary">
          <h3>System Information</h3>
          <div class="overview-grid">
            <div class="metric-card">
              <div class="metric-title">
                <span>ℹ️</span>
                <span>System Details</span>
              </div>
              <div style="margin-top: 12px; font-size: 13px; line-height: 1.6;">
                <div><strong>OS:</strong> ${this.systemInfo.os} ${this.systemInfo.version}</div>
                <div><strong>Architecture:</strong> ${this.systemInfo.architecture}</div>
                <div><strong>CPU Cores:</strong> ${this.systemInfo.cpuCores}</div>
                <div><strong>Uptime:</strong> <span id="detailed-uptime">0h 0m</span></div>
              </div>
            </div>

            <div class="metric-card">
              <div class="metric-title">
                <span>🔗</span>
                <span>P2P Network</span>
              </div>
              <div style="margin-top: 12px; font-size: 13px; line-height: 1.6;">
                <div><strong>Status:</strong> <span class="status-connected">Connected</span></div>
                <div><strong>Peers:</strong> 12 active</div>
                <div><strong>Shared Models:</strong> 8</div>
                <div><strong>Data Transferred:</strong> 2.4 GB</div>
              </div>
            </div>

            <div class="metric-card">
              <div class="metric-title">
                <span>🌐</span>
                <span>IPFS Node</span>
              </div>
              <div style="margin-top: 12px; font-size: 13px; line-height: 1.6;">
                <div><strong>Status:</strong> <span class="status-connected">Online</span></div>
                <div><strong>Peers:</strong> 234 connected</div>
                <div><strong>Pinned Content:</strong> 45 items</div>
                <div><strong>Storage Used:</strong> 1.2 GB</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderProcessesContent() {
    return `
      <div class="processes-content">
        <div class="process-controls">
          <div class="process-search">
            <input type="text" class="search-input" id="process-search" placeholder="Search processes...">
          </div>
          <div class="process-filters">
            <select class="filter-select" id="sort-by">
              <option value="cpu">Sort by CPU</option>
              <option value="memory">Sort by Memory</option>
              <option value="name">Sort by Name</option>
              <option value="pid">Sort by PID</option>
            </select>
            <select class="filter-select" id="sort-order">
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
            <label style="display: flex; align-items: center; gap: 4px; font-size: 12px;">
              <input type="checkbox" id="show-system"> Show System
            </label>
          </div>
        </div>

        <table class="process-table">
          <thead>
            <tr>
              <th data-sort="name">Process Name</th>
              <th data-sort="pid">PID</th>
              <th data-sort="cpu">CPU %</th>
              <th data-sort="memory">Memory</th>
              <th data-sort="status">Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="process-list">
            ${this.renderProcessList()}
          </tbody>
        </table>
      </div>
    `;
  }

  renderProcessList() {
    return this.mockProcesses.map(process => `
      <tr data-pid="${process.pid}">
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>📋</span>
            <span>${process.name}</span>
          </div>
        </td>
        <td>${process.pid}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>${process.cpu}%</span>
            <div class="progress-bar" style="width: 50px; height: 4px;">
              <div class="progress-fill progress-cpu" style="width: ${process.cpu}%"></div>
            </div>
          </div>
        </td>
        <td>${this.formatBytes(process.memory)}</td>
        <td>
          <span class="process-status status-${process.status}">${process.status}</span>
        </td>
        <td>
          <button class="control-btn" style="width: 24px; height: 24px; font-size: 10px;" 
                  onclick="this.parentElement.parentElement.style.opacity = '0.5'"
                  title="Terminate Process">×</button>
        </td>
      </tr>
    `).join('');
  }

  renderNetworkContent() {
    return `
      <div class="network-content">
        <div class="network-grid">
          ${this.networkInterfaces.map(netInterface => `
            <div class="network-interface">
              <div class="interface-header">
                <div class="interface-name">${netInterface.name}</div>
                <div class="interface-status status-${netInterface.status}">${netInterface.status}</div>
              </div>
              <div class="interface-details">
                <div class="interface-detail">
                  <span>Type:</span>
                  <span>${netInterface.type}</span>
                </div>
                <div class="interface-detail">
                  <span>Speed:</span>
                  <span>${netInterface.speed || 'N/A'}</span>
                </div>
                ${netInterface.peers ? `
                  <div class="interface-detail">
                    <span>Peers:</span>
                    <span>${netInterface.peers}</span>
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>

        <div class="network-statistics" style="margin-top: 24px;">
          <h3>Network Statistics</h3>
          <div class="overview-grid">
            <div class="metric-card">
              <div class="metric-title">
                <span>📊</span>
                <span>Traffic Analysis</span>
              </div>
              <div style="margin-top: 12px;">
                <div class="chart-container" style="height: 200px;">
                  <canvas id="traffic-chart" class="chart-canvas"></canvas>
                </div>
              </div>
            </div>

            <div class="metric-card">
              <div class="metric-title">
                <span>🔗</span>
                <span>Connection Status</span>
              </div>
              <div style="margin-top: 12px; font-size: 13px; line-height: 1.8;">
                <div><strong>Active Connections:</strong> 24</div>
                <div><strong>P2P Peers:</strong> 12</div>
                <div><strong>IPFS Peers:</strong> 234</div>
                <div><strong>Latency:</strong> 45ms</div>
                <div><strong>Packet Loss:</strong> 0.02%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderStorageContent() {
    return `
      <div class="storage-content">
        <div class="storage-list">
          ${this.storageDevices.map(device => {
            const usedPercent = device.total > 0 ? (device.used / device.total) * 100 : 0;
            const freeSpace = device.total > 0 ? device.total - device.used : 0;
            
            return `
              <div class="storage-device">
                <div class="device-header">
                  <div class="device-name">${device.name}</div>
                  <div class="device-type">${device.type}</div>
                </div>
                <div class="storage-bar">
                  <div class="storage-info">
                    <span>${this.formatBytes(device.used)} used</span>
                    <span>${device.total > 0 ? this.formatBytes(freeSpace) + ' free' : 'Distributed Storage'}</span>
                  </div>
                  ${device.total > 0 ? `
                    <div class="progress-bar">
                      <div class="progress-fill progress-memory" style="width: ${usedPercent}%"></div>
                    </div>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="storage-analysis" style="margin-top: 24px;">
          <h3>Storage Analysis</h3>
          <div class="overview-grid">
            <div class="metric-card">
              <div class="metric-title">
                <span>📈</span>
                <span>Disk I/O Performance</span>
              </div>
              <div style="margin-top: 12px;">
                <div class="chart-container" style="height: 150px;">
                  <canvas id="disk-io-chart" class="chart-canvas"></canvas>
                </div>
              </div>
            </div>

            <div class="metric-card">
              <div class="metric-title">
                <span>🗂️</span>
                <span>File System Stats</span>
              </div>
              <div style="margin-top: 12px; font-size: 13px; line-height: 1.8;">
                <div><strong>Total Files:</strong> 1,247,382</div>
                <div><strong>Total Folders:</strong> 85,294</div>
                <div><strong>Largest File:</strong> 2.4 GB</div>
                <div><strong>Avg. File Size:</strong> 245 KB</div>
                <div><strong>Fragmentation:</strong> 12%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderPerformanceContent() {
    return `
      <div class="performance-content">
        <div class="performance-charts">
          <div class="overview-grid">
            <div class="metric-card">
              <div class="metric-title">
                <span>📊</span>
                <span>CPU Performance History</span>
              </div>
              <div class="chart-container" style="height: 200px;">
                <canvas id="cpu-history-chart" class="chart-canvas"></canvas>
              </div>
            </div>

            <div class="metric-card">
              <div class="metric-title">
                <span>🧠</span>
                <span>Memory Performance History</span>
              </div>
              <div class="chart-container" style="height: 200px;">
                <canvas id="memory-history-chart" class="chart-canvas"></canvas>
              </div>
            </div>
          </div>

          <div class="overview-grid" style="margin-top: 16px;">
            <div class="metric-card">
              <div class="metric-title">
                <span>🌡️</span>
                <span>Temperature Monitoring</span>
              </div>
              <div style="margin-top: 12px; font-size: 13px; line-height: 1.8;">
                <div><strong>CPU Temperature:</strong> 65°C</div>
                <div><strong>GPU Temperature:</strong> 72°C</div>
                <div><strong>System Temperature:</strong> 45°C</div>
                <div><strong>Fan Speed:</strong> 2,400 RPM</div>
              </div>
            </div>

            <div class="metric-card">
              <div class="metric-title">
                <span>⚡</span>
                <span>Performance Metrics</span>
              </div>
              <div style="margin-top: 12px; font-size: 13px; line-height: 1.8;">
                <div><strong>Boot Time:</strong> 23.5s</div>
                <div><strong>AI Model Load Time:</strong> 4.2s</div>
                <div><strong>P2P Connection Time:</strong> 1.8s</div>
                <div><strong>IPFS Sync Time:</strong> 0.9s</div>
                <div><strong>Overall Score:</strong> 8.7/10</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  setupEventHandlers(container) {
    // View tab switching
    container.querySelectorAll('.view-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchView(tab.dataset.view);
      });
    });

    // Control buttons
    container.querySelector('#refresh-btn').addEventListener('click', () => {
      this.refreshData();
    });

    container.querySelector('#alerts-btn').addEventListener('click', () => {
      this.toggleAlerts();
    });

    container.querySelector('#export-btn').addEventListener('click', () => {
      this.exportData();
    });

    // Process table sorting
    container.querySelectorAll('[data-sort]').forEach(header => {
      header.addEventListener('click', () => {
        this.sortProcesses(header.dataset.sort);
      });
    });

    // Process search and filters
    const searchInput = container.querySelector('#process-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.filterProcesses();
      });
    }

    // Start real-time updates
    this.startRealTimeUpdates();

    // Initialize charts
    setTimeout(() => this.initializeCharts(), 100);
  }

  switchView(newView) {
    this.currentView = newView;
    this.refreshContent();
  }

  refreshContent() {
    const container = document.querySelector('.system-monitor-container');
    if (!container) return;

    // Update active tab
    container.querySelectorAll('.view-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === this.currentView);
    });

    // Update content
    const contentArea = container.querySelector('#monitor-content');
    contentArea.innerHTML = this.renderContentForView();

    // Re-setup event handlers for new content
    this.setupContentEventHandlers();

    // Reinitialize charts if needed
    setTimeout(() => this.initializeCharts(), 100);
  }

  setupContentEventHandlers() {
    const container = document.querySelector('.system-monitor-container');
    
    // Process search and filters
    const searchInput = container.querySelector('#process-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.filterProcesses();
      });
    }

    const sortBy = container.querySelector('#sort-by');
    if (sortBy) {
      sortBy.addEventListener('change', () => {
        this.processFilters.sortBy = sortBy.value;
        this.updateProcessList();
      });
    }

    const sortOrder = container.querySelector('#sort-order');
    if (sortOrder) {
      sortOrder.addEventListener('change', () => {
        this.processFilters.sortOrder = sortOrder.value;
        this.updateProcessList();
      });
    }
  }

  startRealTimeUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      this.updateSystemMetrics();
      this.updateStatusBar();
      this.updateCharts();
      this.checkAlerts();
    }, 1000);
  }

  updateSystemMetrics() {
    // Generate mock system metrics
    const cpuUsage = 20 + Math.random() * 40;
    const memoryUsage = 40 + Math.random() * 30;
    const gpuUsage = 10 + Math.random() * 50;
    const networkSpeed = Math.random() * 100;

    // Add to chart data
    this.chartData.cpu.push(cpuUsage);
    this.chartData.memory.push(memoryUsage);
    this.chartData.gpu.push(gpuUsage);
    this.chartData.network.push(networkSpeed);

    // Limit data points
    Object.keys(this.chartData).forEach(key => {
      if (this.chartData[key].length > this.maxDataPoints) {
        this.chartData[key].shift();
      }
    });

    // Update displays
    this.updateMetricDisplays(cpuUsage, memoryUsage, gpuUsage, networkSpeed);
  }

  updateMetricDisplays(cpu, memory, gpu, network) {
    // Update overview cards
    const cpuMetric = document.querySelector('#cpu-metric');
    const memoryMetric = document.querySelector('#memory-metric');
    const gpuMetric = document.querySelector('#gpu-metric');
    const networkMetric = document.querySelector('#network-metric');

    if (cpuMetric) cpuMetric.textContent = `${cpu.toFixed(1)}%`;
    if (memoryMetric) memoryMetric.textContent = `${memory.toFixed(1)}%`;
    if (gpuMetric) gpuMetric.textContent = `${gpu.toFixed(1)}%`;
    if (networkMetric) networkMetric.textContent = `${network.toFixed(1)} MB/s`;

    // Update progress bars
    const cpuProgress = document.querySelector('#cpu-progress');
    const memoryProgress = document.querySelector('#memory-progress');
    const gpuProgress = document.querySelector('#gpu-progress');
    const networkProgress = document.querySelector('#network-progress');

    if (cpuProgress) cpuProgress.style.width = `${cpu}%`;
    if (memoryProgress) memoryProgress.style.width = `${memory}%`;
    if (gpuProgress) gpuProgress.style.width = `${gpu}%`;
    if (networkProgress) networkProgress.style.width = `${Math.min(network, 100)}%`;
  }

  updateStatusBar() {
    const cpuStatus = document.querySelector('#cpu-status');
    const memoryStatus = document.querySelector('#memory-status');
    const gpuStatus = document.querySelector('#gpu-status');
    const networkStatus = document.querySelector('#network-status');
    const uptimeStatus = document.querySelector('#uptime-status');

    if (cpuStatus) cpuStatus.textContent = `${(20 + Math.random() * 40).toFixed(1)}%`;
    if (memoryStatus) memoryStatus.textContent = `${(40 + Math.random() * 30).toFixed(1)}%`;
    if (gpuStatus) gpuStatus.textContent = `${(10 + Math.random() * 50).toFixed(1)}%`;
    if (networkStatus) networkStatus.textContent = `${(Math.random() * 100).toFixed(1)} MB/s`;

    // Update uptime
    this.systemInfo.uptime += 1;
    const hours = Math.floor(this.systemInfo.uptime / 3600);
    const minutes = Math.floor((this.systemInfo.uptime % 3600) / 60);
    
    if (uptimeStatus) uptimeStatus.textContent = `${hours}h ${minutes}m`;
    
    const detailedUptime = document.querySelector('#detailed-uptime');
    if (detailedUptime) detailedUptime.textContent = `${hours}h ${minutes}m`;
  }

  initializeCharts() {
    // Initialize charts for current view
    if (this.currentView === 'overview') {
      this._redrawOverviewCharts();
    }
  }

  initChart(canvasId, data, color) {
    let node = document.getElementById(canvasId);
    if (!node) return;

    // If the node isn't a canvas (e.g., view switched or container reused), try to find a nested canvas
    if (!(node instanceof HTMLCanvasElement)) {
      const nested = node.querySelector?.('canvas');
      if (nested instanceof HTMLCanvasElement) {
        node = nested;
      } else {
        // Not a canvas; skip drawing to avoid getContext errors
        return;
      }
    }

    const canvas = node;
    const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    // Avoid setting NaN dimensions in rare cases where rect is 0 during reflow
    const width = Math.max(1, Math.floor(rect.width || canvas.clientWidth || 0));
    const height = Math.max(1, Math.floor(rect.height || canvas.clientHeight || 0));
    canvas.width = width;
    canvas.height = height;

    this.drawChart(ctx, data, color, canvas.width, canvas.height);
  }

  drawChart(ctx, data, color, width, height) {
    ctx.clearRect(0, 0, width, height);
    
    if (data.length < 2) return;

    const padding = 10;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    const maxValue = Math.max(...data, 100);
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    data.forEach((value, index) => {
      const x = padding + (index / (data.length - 1)) * chartWidth;
      const y = padding + chartHeight - (value / maxValue) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();

    // Add fill
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = color;
    ctx.lineTo(padding + chartWidth, padding + chartHeight);
    ctx.lineTo(padding, padding + chartHeight);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _redrawOverviewCharts() {
    this.initChart('cpu-chart', this.chartData.cpu, '#60a5fa');
    this.initChart('memory-chart', this.chartData.memory, '#34d399');
    this.initChart('gpu-chart', this.chartData.gpu, '#fbbf24');
    this.initChart('network-chart', this.chartData.network, '#a78bfa');
  }

  updateCharts() {
    // Only redraw charts when overview view is visible
    if (this.currentView !== 'overview') return;

    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const minIntervalMs = 200; // small debounce/throttle

    // If a draw is already scheduled, skip
    if (this._chartsScheduled) return;

    if (this._lastChartsUpdate && (now - this._lastChartsUpdate) < minIntervalMs) {
      this._chartsScheduled = true;
      const delay = Math.max(0, minIntervalMs - (now - this._lastChartsUpdate));
      setTimeout(() => {
        this._chartsScheduled = false;
        this._lastChartsUpdate = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        this._redrawOverviewCharts();
      }, delay);
      return;
    }

    this._lastChartsUpdate = now;
    this._redrawOverviewCharts();
  }

  checkAlerts() {
    const alerts = [];
    const latestData = {
      cpu: this.chartData.cpu[this.chartData.cpu.length - 1] || 0,
      memory: this.chartData.memory[this.chartData.memory.length - 1] || 0,
      gpu: this.chartData.gpu[this.chartData.gpu.length - 1] || 0
    };

    if (latestData.cpu > this.alertThresholds.cpu) {
      alerts.push({
        type: 'error',
        message: `High CPU usage: ${latestData.cpu.toFixed(1)}%`,
        timestamp: Date.now()
      });
    }

    if (latestData.memory > this.alertThresholds.memory) {
      alerts.push({
        type: 'warning',
        message: `High memory usage: ${latestData.memory.toFixed(1)}%`,
        timestamp: Date.now()
      });
    }

    if (alerts.length > 0) {
      this.showAlerts(alerts);
    }
  }

  showAlerts(alerts) {
    const alertList = document.querySelector('#alert-list');
    if (!alertList) return;

    alertList.innerHTML = alerts.map(alert => `
      <div class="alert-item ${alert.type}">
        <div>${alert.message}</div>
        <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">
          ${new Date(alert.timestamp).toLocaleTimeString()}
        </div>
      </div>
    `).join('');
  }

  toggleAlerts() {
    const alertPanel = document.querySelector('#alert-panel');
    if (alertPanel) {
      const isVisible = alertPanel.style.display !== 'none';
      alertPanel.style.display = isVisible ? 'none' : 'block';
    }
  }

  formatBytes(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }

  refreshData() {
    this.updateSystemMetrics();
    this.updateStatusBar();
    
    // Visual feedback
    const refreshBtn = document.querySelector('#refresh-btn');
    if (refreshBtn) {
      refreshBtn.style.transform = 'rotate(360deg)';
      setTimeout(() => {
        refreshBtn.style.transform = '';
      }, 500);
    }
  }

  exportData() {
    const data = {
      timestamp: new Date().toISOString(),
      systemInfo: this.systemInfo,
      chartData: this.chartData,
      processes: this.mockProcesses,
      networkInterfaces: this.networkInterfaces,
      storageDevices: this.storageDevices
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-monitor-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  filterProcesses() {
    const searchTerm = document.querySelector('#process-search')?.value.toLowerCase() || '';
    const rows = document.querySelectorAll('#process-list tr');
    
    rows.forEach(row => {
      const processName = row.cells[0].textContent.toLowerCase();
      const shouldShow = processName.includes(searchTerm);
      row.style.display = shouldShow ? '' : 'none';
    });
  }

  sortProcesses(column) {
    this.processFilters.sortBy = column;
    this.updateProcessList();
  }

  updateProcessList() {
    const tbody = document.querySelector('#process-list');
    if (tbody) {
      tbody.innerHTML = this.renderProcessList();
    }
  }

  getSystemNetworkLocalCapabilities() {
    return this.systemNetworkLocalCapabilities;
  }

  async exerciseSystemNetworkLocalGateway(input = {}) {
    this.lastSystemNetworkLocalWorkflow = await runSystemNetworkLocalWorkflow({
      desktop: this.desktop,
      appId: 'system-monitor',
      localCapabilities: ['browser_metrics', 'process_table', 'alert_thresholds', 'storage_snapshot'],
      remoteCapabilities: ['node_status', 'hardware_profile', 'telemetry'],
      localState: {
        current_view: this.currentView,
        cpu_cores: this.systemInfo.cpuCores,
        process_count: this.mockProcesses.length,
        network_interface_count: this.networkInterfaces.length,
        storage_device_count: this.storageDevices.length,
        alert_thresholds: this.alertThresholds
      },
      summary: input.summary || 'Validate System Monitor local metrics and remote accelerator telemetry fallbacks.'
    });
    return this.lastSystemNetworkLocalWorkflow;
  }

  cleanup() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  // Initialize method required by the desktop framework
  async initialize() {
    // App is ready for rendering
  }

  async render() {
    const windowData = this.createWindow();
    
    // Set up event handlers after the HTML is rendered
    setTimeout(() => {
      const container = document.querySelector('.system-monitor-container');
      if (container) {
        this.setupEventHandlers(container);
      }
    }, 0);
    
    return windowData.content;
  }
}

// Register the app
if (typeof window !== 'undefined') {
  window.createSystemMonitorApp = (desktop) => new SystemMonitorApp(desktop);
}
