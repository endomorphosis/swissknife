/**
 * Enhanced IPFS Explorer App for SwissKnife Web Desktop
 * Advanced IPFS file management with P2P integration, content pinning, and network analytics.
 * File writes use the reviewed artifact binding and visible gateway confirmation.
 */

import { invokeNativeTool } from '../live-tool-gateway.js';
import { invokeNetworkNativeTool, networkNativeAttributes, unwrapNetworkToolResult } from './network-native-tools.js';

export class IPFSExplorerApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.currentPath = '/';
    this.currentHash = null;
    this.pinnedContent = new Map();
    this.networkStats = {};
    this.ipfsNode = null;
    this.p2pSystem = null;
    this.currentView = 'explorer'; // 'explorer', 'pinning', 'network', 'analytics'
    this.contentCache = new Map();
    this.uploadQueue = [];
    
    // IPFS gateway configuration
    this.gateways = [
      'https://ipfs.io/ipfs/',
      'https://gateway.ipfs.io/ipfs/',
      'https://cloudflare-ipfs.com/ipfs/',
      'https://dweb.link/ipfs/'
    ];
    this.currentGateway = this.gateways[0];
    
    // Content types and icons
    this.contentTypes = {
      'directory': { icon: '📁', color: '#FFB74D' },
      'image': { icon: '🖼️', color: '#4CAF50' },
      'video': { icon: '🎥', color: '#F44336' },
      'audio': { icon: '🎵', color: '#9C27B0' },
      'document': { icon: '📄', color: '#2196F3' },
      'archive': { icon: '📦', color: '#FF9800' },
      'code': { icon: '💻', color: '#795548' },
      'json': { icon: '📋', color: '#607D8B' },
      'unknown': { icon: '❓', color: '#9E9E9E' }
    };
    
    this.initializeIntegrations();
  }

  async initializeIntegrations() {
    try {
      this.swissknife = this.desktop.swissknife;
      
      // Connect to P2P system for distributed IPFS
      if (window.p2pMLSystem) {
        this.p2pSystem = window.p2pMLSystem;
        this.setupP2PIntegration();
      }
      
      // Initialize collaborative file system if available - Phase 3
      if (this.desktop.p2pManager && this.desktop.collaborativeFS) {
        this.collaborativeFS = this.desktop.collaborativeFS;
        this.isCollaborativeMode = true;
        
        // Setup collaborative event listeners
        this.setupCollaborativeIPFS();
        
        console.log('🤝 IPFS Explorer connected to Collaborative File System');
      }
      
      // Initialize IPFS node if available
      await this.initializeIPFSNode();
      
      // Load pinned content
      this.loadPinnedContent();
      
      console.log('✅ IPFS Explorer integrations initialized');
    } catch (error) {
      console.error('❌ IPFS Explorer integration error:', error);
    }
  }

  setupCollaborativeIPFS() {
    if (!this.collaborativeFS) return;

    // Listen for shared IPFS content
    this.collaborativeFS.on('fileShared', (file) => {
      if (file.ipfsHash) {
        this.handleSharedIPFSContent(file);
      }
    });

    // Listen for collaborative pinning requests
    this.collaborativeFS.on('pinRequest', (request) => {
      this.handleCollaborativePinning(request);
    });

    // Share IPFS discovery with peers
    this.collaborativeFS.on('ipfsDiscovery', (discovery) => {
      this.handleIPFSDiscovery(discovery);
    });
  }

  createWindow() {
    const content = `
      <div class="ipfs-explorer-container">
        <style>
          .ipfs-explorer-container { height: 100%; max-height: 100%; min-height: 0; flex: 1 1 auto; display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box; }
          .ipfs-header, .explorer-toolbar, .pinning-overview { flex: 0 0 auto; }
          .path-bar { flex-wrap: nowrap; align-items: center; gap: 6px; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; }
          #path-input { display: block; visibility: visible; min-height: 32px; min-width: 0 !important; width: 1px !important; max-width: calc(100% - 64px) !important; flex: 1 1 0% !important; font-size: 12px; line-height: 1.35; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; resize: none; box-sizing: border-box; }
          #go-btn { flex: 0 0 auto !important; align-self: center; min-width: 44px; }
          .header-tabs { display: flex; flex-wrap: wrap; gap: 4px; }
          .ipfs-content { flex: 1 1 auto; min-height: 0; overflow-x: hidden; overflow-y: scroll; }
          .tab-content:not([data-view="explorer"]) { display: none; }
          .tab-content[data-view="explorer"],
          .tab-content.active { display: flex !important; flex-direction: column; visibility: visible !important; flex: 1 1 auto; height: auto; min-height: 0; overflow: auto; }
          .explorer-toolbar, .path-bar { display: flex !important; visibility: visible !important; opacity: 1 !important; min-height: 40px; }
          .explorer-main { display: flex; flex-direction: row; align-items: stretch; gap: 8px; flex: 1 1 auto; min-height: 0; min-width: 0; max-width: 100%; overflow: hidden; }
          .explorer-content { order: 1; flex: 1 1 0; width: 0; min-width: 0; max-width: 100%; overflow: auto; }
          .explorer-sidebar { order: 0; flex: 0 1 220px; width: 220px; max-width: 34%; min-width: 0; min-height: 0; align-self: stretch; overflow: auto; }
          .explorer-content, .content-browser, .pinned-content, .peer-list { min-height: 0; min-width: 0; max-width: 100%; }
          .content-browser { overflow: hidden; max-width: 100%; }
          .ipfs-preview { min-width: 0; width: 100%; max-width: 100%; overflow: hidden; }
          .ipfs-preview pre, .ipfs-preview .sk-code { display: block !important; white-space: pre-wrap !important; overflow-wrap: anywhere !important; word-break: break-all !important; width: 100% !important; max-width: 100% !important; max-height: 160px; overflow: auto !important; margin: 0; box-sizing: border-box; }
          .ipfs-error-banner { margin: 8px; padding: 8px; color: var(--sk-err, #ff6b6b); }
          @media (max-width: 480px) {
            .explorer-main { flex-direction: column; }
            .explorer-content { order: -1; width: 100%; max-width: 100%; flex: 1 1 auto; }
            .explorer-sidebar { order: 1; flex: 0 1 auto; width: 100%; max-width: 100%; max-height: 140px; overflow: auto; }
            .path-bar { flex-direction: column !important; align-items: stretch !important; }
            #path-input { width: 100% !important; max-width: 100% !important; flex: 1 1 auto !important; min-height: 48px; font-size: 12px; }
            #go-btn { width: 100%; }
            .header-tabs { flex-wrap: nowrap; overflow-x: auto; }
            .ipfs-preview pre, .ipfs-preview .sk-code { max-height: 160px; }
          }
        </style>
        <div class="path-bar" style="display:flex !important;visibility:visible !important;opacity:1 !important;position:relative !important;z-index:30 !important;min-height:40px !important;width:100% !important;max-width:100% !important;min-width:0 !important;flex:0 0 auto !important;flex-wrap:nowrap !important;box-sizing:border-box !important;">
          <textarea id="path-input" rows="2" placeholder="Enter IPFS hash or path..." class="path-input" aria-label="IPFS path or CID" style="display:block !important;visibility:visible !important;opacity:1 !important;min-height:32px;min-width:0;width:1px;max-width:calc(100% - 64px);flex:1 1 0%;resize:none;color:#111;background:#fff;">${this.currentPath}</textarea>
          <button type="button" class="go-btn" id="go-btn" aria-label="Retrieve CID" style="flex:0 0 auto;min-width:44px;" ${'data-native-gateway-binding="ipfs-explorer.ipfs_kit_py.retrieve_content" data-native-tool-id="ipfs_cat"'}>Go</button>
        </div>
        <div class="ipfs-header">
          <div class="header-tabs">
            <button class="tab-btn ${this.currentView === 'explorer' ? 'active' : ''}" data-view="explorer">
              🗂️ Explorer
            </button>
            <button class="tab-btn ${this.currentView === 'pinning' ? 'active' : ''}" data-view="pinning">
              📌 Pinning
            </button>
            <button class="tab-btn ${this.currentView === 'network' ? 'active' : ''}" data-view="network">
              🌐 Network
            </button>
            <button class="tab-btn ${this.currentView === 'analytics' ? 'active' : ''}" data-view="analytics">
              📊 Analytics
            </button>
          </div>
          <div class="header-controls">
            <button class="control-btn" id="add-files" title="Add Files">📁+</button>
            <button class="control-btn" id="create-folder" title="Create Folder">📁</button>
            <button class="control-btn" id="ipfs-settings" title="Settings">⚙️</button>
          </div>
        </div>

        <div class="ipfs-content">
          <!-- Explorer View -->
          <div class="tab-content ${this.currentView === 'explorer' ? 'active' : ''}" data-view="explorer">
            <div class="explorer-toolbar">
              <div class="navigation-controls">
                <button class="nav-btn" id="back-btn" title="Back">←</button>
                <button class="nav-btn" id="forward-btn" title="Forward">→</button>
                <button class="nav-btn" id="home-btn" title="Home">🏠</button>
                <button class="nav-btn" id="refresh-btn" title="Refresh">🔄</button>
              </div>
              <div class="view-controls">
                <select id="gateway-select" class="gateway-select">
                  ${this.gateways.map(gateway => 
                    `<option value="${gateway}" ${gateway === this.currentGateway ? 'selected' : ''}>${new URL(gateway).hostname}</option>`
                  ).join('')}
                </select>
                <button class="view-btn ${this.viewMode === 'list' ? 'active' : ''}" data-view="list" title="List View">📋</button>
                <button class="view-btn ${this.viewMode === 'grid' ? 'active' : ''}" data-view="grid" title="Grid View">⊞</button>
              </div>
            </div>

            <div class="explorer-main">
              <div class="explorer-sidebar">
                <div class="sidebar-section">
                  <h4 class="sk-section-head">🔗 Quick Access <span class="sk-label">(public examples)</span></h4>
                  <div class="quick-links">
                    <div class="quick-link" data-hash="QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn">
                      <span class="link-icon">📂</span>
                      <span class="link-text">IPFS Welcome</span>
                    </div>
                    <div class="quick-link" data-hash="QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG">
                      <span class="link-icon">🖼️</span>
                      <span class="link-text">Sample Images</span>
                    </div>
                    <div class="quick-link" data-hash="QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX">
                      <span class="link-icon">🎵</span>
                      <span class="link-text">Audio Files</span>
                    </div>
                  </div>
                </div>

                <div class="sidebar-section">
                  <h4>📌 Recent Pins</h4>
                  <div class="recent-pins" id="recent-pins">
                    <div class="no-recent-pins">No recent pins</div>
                  </div>
                </div>

                <div class="sidebar-section">
                  <h4>📊 Network Status</h4>
                  <div class="network-status">
                    <div class="status-item">
                      <span class="status-label">Peers</span>
                      <span class="status-value" id="peer-count">not measured</span>
                    </div>
                    <div class="status-item">
                      <span class="status-label">Bandwidth</span>
                      <span class="status-value" id="bandwidth">not measured</span>
                    </div>
                    <div class="status-item">
                      <span class="status-label">Storage</span>
                      <span class="status-value" id="storage-used">not measured</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="explorer-content">
                <div class="content-browser" id="content-browser">
                  <div class="empty-state sk-empty">
                    <p><strong>No CID loaded.</strong></p>
                    <p class="sk-empty-text">Enter a CID and choose Go. An invalid CID does not replace retrieved content.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Pinning Management View -->
          <div class="tab-content ${this.currentView === 'pinning' ? 'active' : ''}" data-view="pinning">
            <div class="pinning-overview">
              <div class="pinning-stats">
                <div class="stat-card">
                  <div class="stat-icon">📌</div>
                  <div class="stat-content">
                    <div class="stat-value" id="total-pins">0</div>
                    <div class="stat-label">Total Pins</div>
                  </div>
                </div>
                <div class="stat-card">
                  <div class="stat-icon">💾</div>
                  <div class="stat-content">
                    <div class="stat-value" id="pinned-size">0 MB</div>
                    <div class="stat-label">Pinned Data</div>
                  </div>
                </div>
                <div class="stat-card">
                  <div class="stat-icon">🔄</div>
                  <div class="stat-content">
                    <div class="stat-value" id="sync-status">Synced</div>
                    <div class="stat-label">Sync Status</div>
                  </div>
                </div>
                <div class="stat-card">
                  <div class="stat-icon">⚡</div>
                  <div class="stat-content">
                    <div class="stat-value" id="pin-speed">0/s</div>
                    <div class="stat-label">Pin Rate</div>
                  </div>
                </div>
              </div>

              <div class="pinning-controls">
                <button class="pin-btn" id="bulk-pin">📌 Bulk Pin</button>
                <button class="pin-btn" id="auto-pin">🤖 Auto Pin</button>
                <button class="pin-btn" id="export-pins">📤 Export List</button>
                <button class="pin-btn" id="import-pins">📥 Import List</button>
              </div>
            </div>

            <div class="pinned-content">
              <div class="pinning-header">
                <h3>📌 Pinned Content</h3>
                <div class="pinning-filters">
                  <select id="pin-filter" class="filter-select">
                    <option value="all">All Pins</option>
                    <option value="local">Local Only</option>
                    <option value="remote">Remote Pins</option>
                    <option value="recursive">Recursive</option>
                  </select>
                  <input type="text" id="pin-search" placeholder="Search pins..." class="search-input">
                </div>
              </div>
              
              <div class="pins-list" id="pins-list">
                <!-- Pinned content will be populated -->
              </div>
            </div>
          </div>

          <!-- Network Analysis View -->
          <div class="tab-content ${this.currentView === 'network' ? 'active' : ''}" data-view="network">
            <div class="network-overview">
              <h3>🌐 IPFS Network Overview</h3>
              
              <div class="network-metrics">
                <div class="metric-card">
                  <div class="metric-header">
                    <span class="metric-icon">🔗</span>
                    <span class="metric-title">Connected Peers</span>
                  </div>
                  <div class="metric-value" id="network-peers">0</div>
                  <div class="metric-chart" id="peers-chart"></div>
                </div>

                <div class="metric-card">
                  <div class="metric-header">
                    <span class="metric-icon">⬇️</span>
                    <span class="metric-title">Download Speed</span>
                  </div>
                  <div class="metric-value" id="download-speed">0 KB/s</div>
                  <div class="metric-chart" id="download-chart"></div>
                </div>

                <div class="metric-card">
                  <div class="metric-header">
                    <span class="metric-icon">⬆️</span>
                    <span class="metric-title">Upload Speed</span>
                  </div>
                  <div class="metric-value" id="upload-speed">0 KB/s</div>
                  <div class="metric-chart" id="upload-chart"></div>
                </div>

                <div class="metric-card">
                  <div class="metric-header">
                    <span class="metric-icon">📶</span>
                    <span class="metric-title">DHT Size</span>
                  </div>
                  <div class="metric-value" id="dht-size">0</div>
                  <div class="metric-chart" id="dht-chart"></div>
                </div>
              </div>

              <div class="network-actions">
                <button class="network-btn" id="discover-peers">🔍 Discover Peers</button>
                <button class="network-btn" id="test-connectivity">🧪 Test Connectivity</button>
                <button class="network-btn" id="optimize-routing">⚡ Optimize Routing</button>
                <button class="network-btn" id="network-diagnostics">🔧 Diagnostics</button>
              </div>
            </div>

            <div class="peer-list">
              <h4>👥 Connected Peers</h4>
              <div class="peers-table" id="peers-table">
                <!-- Peer list will be populated -->
              </div>
            </div>

            <div class="gateway-testing">
              <h4>🌐 Gateway Performance</h4>
              <div class="gateway-tests" id="gateway-tests">
                <!-- Gateway test results -->
              </div>
            </div>
          </div>

          <!-- Analytics View -->
          <div class="tab-content ${this.currentView === 'analytics' ? 'active' : ''}" data-view="analytics">
            <div class="analytics-overview">
              <h3>📊 IPFS Usage Analytics</h3>
              
              <div class="analytics-summary">
                <div class="summary-card">
                  <div class="summary-icon">📈</div>
                  <div class="summary-content">
                    <div class="summary-value" id="data-retrieved">—</div>
                    <div class="summary-label">Data Retrieved</div>
                  </div>
                </div>
                <div class="summary-card">
                  <div class="summary-icon">📤</div>
                  <div class="summary-content">
                    <div class="summary-value" id="data-shared">—</div>
                    <div class="summary-label">Data Shared</div>
                  </div>
                </div>
                <div class="summary-card">
                  <div class="summary-icon">🔄</div>
                  <div class="summary-content">
                    <div class="summary-value" id="cache-hit-rate">—</div>
                    <div class="summary-label">Cache Hit Rate</div>
                  </div>
                </div>
                <div class="summary-card">
                  <div class="summary-icon">⚡</div>
                  <div class="summary-content">
                    <div class="summary-value" id="avg-latency">—</div>
                    <div class="summary-label">Avg Latency</div>
                  </div>
                </div>
              </div>

              <div class="analytics-charts">
                <div class="chart-container">
                  <h4>📈 Bandwidth Usage (24h)</h4>
                  <canvas id="bandwidth-chart"></canvas>
                </div>
                
                <div class="chart-container">
                  <h4>📊 Content Types</h4>
                  <canvas id="content-types-chart"></canvas>
                </div>
              </div>

              <div class="usage-insights">
                <h4>💡 Usage Insights</h4>
                <div class="insights-list" id="insights-list">
                  <!-- Usage insights will be populated -->
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- File Upload Modal -->
        <div class="modal" id="upload-modal" style="display: none;">
          <div class="modal-content">
            <div class="modal-header">
              <h3>📁 Upload to IPFS</h3>
              <button class="modal-close" id="close-upload-modal">❌</button>
            </div>
            <div class="modal-body">
              <div class="upload-area" id="upload-area">
                <div class="upload-icon">📁</div>
                <div class="upload-text">
                  <p>Drag and drop files here</p>
                  <p>or</p>
                  <button class="upload-btn" id="select-files">Choose Files</button>
                </div>
                <input type="file" id="file-input" multiple style="display: none;">
              </div>
              
              <div class="upload-options">
                <label class="option-item">
                  <input type="checkbox" id="pin-after-upload" checked>
                  <span>Pin files after upload</span>
                </label>
                <label class="option-item">
                  <input type="checkbox" id="encrypt-upload">
                  <span>Encrypt files</span>
                </label>
                <label class="option-item">
                  <input type="checkbox" id="share-p2p">
                  <span>Share with P2P network</span>
                </label>
              </div>
              
              <div class="upload-queue" id="upload-queue" style="display: none;">
                <h4>📋 Upload Queue</h4>
                <div class="queue-list" id="queue-list">
                  <!-- Upload queue items -->
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn-secondary" id="cancel-upload">Cancel</button>
              <button class="btn-primary" id="start-upload" ${networkNativeAttributes('ipfs-explorer', 'mcp++:ipfs_kit_py/artifacts/put')} disabled>Upload to IPFS</button>
            </div>
          </div>
        </div>
      </div>
    `;

    return content;
  }

  addStyles(window) {
    const style = document.createElement('style');
    style.textContent = `
      .ipfs-explorer-container {
        height: 100%;
        display: flex;
        flex-direction: column;
        font-family: system-ui, -apple-system, sans-serif;
      }
      
      .ipfs-toolbar {
        display: flex;
        align-items: center;
        padding: 8px 12px;
        background: #f5f5f5;
        border-bottom: 1px solid #ddd;
        gap: 12px;
      }
      
      .ipfs-nav, .ipfs-actions {
        display: flex;
        gap: 4px;
      }
      
      .nav-btn, .action-btn {
        padding: 6px 10px;
        border: 1px solid #ccc;
        background: white;
        cursor: pointer;
        border-radius: 4px;
      }
      
      .nav-btn:hover, .action-btn:hover {
        background: #e9e9e9;
      }
      
      .ipfs-path {
        flex: 1;
        display: flex;
        gap: 4px;
      }
      
      #path-input {
        flex: 1;
        padding: 6px 10px;
        border: 1px solid #ccc;
        border-radius: 4px;
      }
      
      #go-btn {
        padding: 6px 15px;
        background: #007acc;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
      
      .ipfs-status-bar {
        display: flex;
        padding: 4px 12px;
        background: #eef;
        border-bottom: 1px solid #ddd;
        font-size: 12px;
        gap: 20px;
      }
      
      .status-item {
        display: flex;
        gap: 4px;
      }
      
      .status-label {
        font-weight: bold;
      }
      
      .ipfs-main {
        flex: 1;
        display: flex;
        overflow: hidden;
      }
      
      .ipfs-sidebar {
        width: 250px;
        background: #f9f9f9;
        border-right: 1px solid #ddd;
        padding: 12px;
        overflow-y: auto;
      }
      
      .sidebar-section {
        margin-bottom: 20px;
      }
      
      .sidebar-section h4 {
        margin: 0 0 8px 0;
        color: #666;
        font-size: 12px;
        text-transform: uppercase;
      }
      
      .quick-link {
        padding: 6px 8px;
        cursor: pointer;
        border-radius: 4px;
        margin: 2px 0;
        font-size: 13px;
      }
      
      .quick-link:hover {
        background: #e9e9e9;
      }
      
      .ipfs-content {
        flex: 1;
        display: flex;
        flex-direction: column;
      }
      
      .content-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: white;
        border-bottom: 1px solid #eee;
      }
      
      .breadcrumb {
        display: flex;
        gap: 4px;
        font-size: 13px;
      }
      
      .view-options {
        display: flex;
        gap: 2px;
      }
      
      .view-btn {
        padding: 4px 8px;
        border: 1px solid #ddd;
        background: white;
        cursor: pointer;
      }
      
      .view-btn.active {
        background: #007acc;
        color: white;
      }
      
      .file-browser {
        flex: 1;
        padding: 12px;
        overflow-y: auto;
      }
      
      .loading-message {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: #666;
      }
      
      .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid #f3f3f3;
        border-top: 3px solid #007acc;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 12px;
      }
      
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      .file-item {
        display: flex;
        align-items: center;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        margin: 2px 0;
        border: 1px solid transparent;
      }
      
      .file-item:hover {
        background: #f0f8ff;
        border-color: #cce7ff;
      }
      
      .file-icon {
        width: 24px;
        margin-right: 8px;
        text-align: center;
      }
      
      .file-info {
        flex: 1;
      }
      
      .file-name {
        font-weight: 500;
        margin-bottom: 2px;
      }
      
      .file-details {
        font-size: 11px;
        color: #666;
      }
      
      .file-actions {
        display: flex;
        gap: 4px;
        opacity: 0;
        transition: opacity 0.2s;
      }
      
      .file-item:hover .file-actions {
        opacity: 1;
      }
      
      .action-icon {
        padding: 4px;
        cursor: pointer;
        border-radius: 2px;
      }
      
      .action-icon:hover {
        background: #ddd;
      }
      
      .ipfs-upload-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      
      .upload-modal {
        background: white;
        padding: 20px;
        border-radius: 8px;
        width: 400px;
        max-width: 90vw;
      }
      
      .upload-area {
        border: 2px dashed #ccc;
        padding: 40px 20px;
        text-align: center;
        margin: 16px 0;
        border-radius: 8px;
      }
      
      .upload-area.dragover {
        border-color: #007acc;
        background: #f0f8ff;
      }
      
      .upload-options {
        margin: 16px 0;
      }
      
      .upload-options label {
        display: block;
        margin: 8px 0;
        font-size: 14px;
      }
      
      .upload-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      
      .btn-primary {
        background: #007acc;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
      }
      
      .btn-secondary {
        background: #f5f5f5;
        border: 1px solid #ccc;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
      }
    `;
    window.appendChild(style);
  }

  setupEventListeners(window) {
    // Navigation
    window.querySelector('#back-btn').addEventListener('click', () => this.navigateBack());
    window.querySelector('#forward-btn').addEventListener('click', () => this.navigateForward());
    window.querySelector('#home-btn').addEventListener('click', () => this.navigateHome());
    window.querySelector('#refresh-btn').addEventListener('click', () => this.refreshCurrentView());
    
    // Path navigation
    window.querySelector('#go-btn').addEventListener('click', () => this.navigateToPath(window));
    window.querySelector('#path-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.navigateToPath(window);
      }
    });
    
    // Actions
    window.querySelector('#add-btn').addEventListener('click', () => this.showUploadModal(window));
    window.querySelector('#pin-btn').addEventListener('click', () => this.pinCurrentPath());
    window.querySelector('#network-btn').addEventListener('click', () => this.showNetworkStatus(window));
    
    // Quick links
    window.querySelectorAll('.quick-link').forEach(link => {
      link.addEventListener('click', (e) => {
        const path = e.target.dataset.path;
        this.navigateToPath(window, path);
      });
    });
    
    // Upload modal
    window.querySelector('#cancel-upload').addEventListener('click', () => this.hideUploadModal(window));
    window.querySelector('#start-upload').addEventListener('click', () => this.startUpload(window));
    
    // File input
    window.querySelector('#file-input').addEventListener('change', (e) => {
      this.handleFileSelection(window, e.target.files);
    });
    
    // Drag and drop
    const uploadArea = window.querySelector('#upload-area');
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      this.handleFileSelection(window, e.dataTransfer.files);
    });
  }

  async initializeIPFSConnection(window) {
    try {
      // Real connection check: query the live MCP++ kit backend for its
      // peer set. No fabricated peer counts — failures are reported honestly.
      let peerCount = null;
      let backend = null;
      try {
        const clientModule = await import('../core/mcp-plus-plus-desktop-client.js');
        const client = clientModule.getMCPPlusPlusDesktopClient();
        const peers = await client.discoverPeers('ipfs_kit_py');
        const list = Array.isArray(peers?.peers) ? peers.peers : (Array.isArray(peers) ? peers : []);
        peerCount = list.length;
        backend = 'ipfs_kit_py';
      } catch (clientError) {
        console.warn('MCP++ peer discovery unavailable:', clientError);
      }

      if (peerCount == null && this.swissknife?.ipfs?.swarm?.peers) {
        try {
          const swarmPeers = await this.swissknife.ipfs.swarm.peers();
          peerCount = Array.isArray(swarmPeers) ? swarmPeers.length : 0;
          backend = 'swissknife-ipfs';
        } catch (swarmError) {
          console.warn('swissknife ipfs swarm unavailable:', swarmError);
        }
      }

      const peerCountEl = window.querySelector('#peer-count');
      if (peerCountEl) {
        peerCountEl.textContent = peerCount == null ? 'not connected' : String(peerCount);
      }

      // Load initial content
      await this.loadIPFSContent(window, this.currentPath);

      // Emit IPFS ready event with only real data
      eventBus.emit('ipfs:ready', {
        gateway: this.currentGateway,
        backend,
        connected: peerCount != null,
        peers: peerCount
      });

      if (peerCount == null) {
        this.showNotification?.('IPFS backend not reachable — showing local state only.');
      }

    } catch (error) {
      this.showError(window, `Failed to connect to IPFS: ${error.message}`);
    }
  }

  async loadIPFSContent(window, path) {
    const browser = window.querySelector('#file-browser');
    if (!browser) return;
    
    // Show loading
    browser.innerHTML = `
      <div class="loading-message">
        <div class="spinner"></div>
        <p>Loading IPFS content...</p>
      </div>
    `;
    
    try {
      // Attempt to load IPFS content via SwissKnife API
      let items = [];
      
      if (this.swissknife && this.swissknife.ipfs) {
        try {
          const result = await this.swissknife.ipfs.ls(path);
          items = result.items || [];
          console.log('✅ Loaded IPFS content from API');
        } catch (apiError) {
          console.warn('IPFS API unavailable, using fallback:', apiError);
          items = this.getFallbackIPFSListing(path);
        }
      } else {
        items = this.getFallbackIPFSListing(path);
      }
      
      // Render file browser
      this.renderFileBrowser(window, items);
      
      // Update path
      window.querySelector('#path-input').value = path;
      this.updateBreadcrumb(window, path);
      
    } catch (error) {
      this.showError(window, `Failed to load IPFS content: ${error.message}`);
    }
  }

  getFallbackIPFSListing(path) {
    // Honest empty state: with no IPFS backend connected, this surface shows
    // no content rather than invented example files with fake hashes.
    console.info(`No IPFS backend connected for path ${path}; showing empty listing.`);
    return [];
  }

  renderFileBrowser(window, items) {
    const browser = window.querySelector('#file-browser');

    if (!items || items.length === 0) {
      browser.innerHTML = `
        <div class="empty-state sk-empty">
          <div class="sk-empty-icon">📂</div>
          <p><strong>No content to show.</strong></p>
          <p class="sk-empty-text">No IPFS backend is connected, so there is no directory listing to display.<br>Upload a file to persist it as a real content-addressed artifact.</p>
        </div>
      `;
      return;
    }

    const itemsHTML = items.map(item => `
      <div class="file-item" data-hash="${item.hash}" data-type="${item.type}">
        <div class="file-icon">
          ${item.type === 'directory' ? '📁' : this.getFileIcon(item.name)}
        </div>
        <div class="file-info">
          <div class="file-name">${item.name}</div>
          <div class="file-details">${item.size} • ${item.modified} • ${item.hash.substring(0, 12)}...</div>
        </div>
        <div class="file-actions">
          <span class="action-icon" title="Download">⬇️</span>
          <span class="action-icon" title="${item.isPinned ? 'Unpin' : 'Pin'}">${item.isPinned ? '📍' : '📌'}</span>
          <span class="action-icon" title="Share">🔗</span>
          <span class="action-icon" title="Info">ℹ️</span>
        </div>
      </div>
    `).join('');
    
    browser.innerHTML = itemsHTML;
    
    // Add click handlers
    browser.querySelectorAll('.file-item').forEach(item => {
      item.addEventListener('dblclick', () => {
        const hash = item.dataset.hash;
        const type = item.dataset.type;
        
        if (type === 'directory') {
          this.navigateToPath(window, hash);
        } else {
          this.openFile(hash);
        }
      });
    });
    
    // Add action handlers
    browser.querySelectorAll('.action-icon').forEach(action => {
      action.addEventListener('click', (e) => {
        e.stopPropagation();
        const fileItem = e.target.closest('.file-item');
        const hash = fileItem.dataset.hash;
        const title = e.target.title;
        
        switch (title) {
          case 'Download':
            this.downloadFile(hash);
            break;
          case 'Pin':
          case 'Unpin':
            this.togglePin(hash);
            break;
          case 'Share':
            this.shareFile(hash);
            break;
          case 'Info':
            this.showFileInfo(hash);
            break;
        }
      });
    });
  }

  getFileIcon(filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    const icons = {
      'txt': '📄', 'md': '📝', 'pdf': '📕',
      'jpg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
      'mp4': '🎬', 'avi': '🎬', 'mov': '🎬',
      'mp3': '🎵', 'wav': '🎵', 'flac': '🎵',
      'zip': '📦', 'tar': '📦', 'gz': '📦',
      'js': '💻', 'html': '🌐', 'css': '🎨',
      'json': '📋', 'xml': '📋', 'csv': '📊'
    };
    return icons[ext] || '📄';
  }

  navigateToPath(window, path = null) {
    const targetPath = path || window.querySelector('#path-input').value.trim();
    if (targetPath) {
      this.currentPath = targetPath;
      this.loadIPFSContent(window, targetPath);
    }
  }

  updateBreadcrumb(window, path) {
    const breadcrumb = window.querySelector('#breadcrumb');
    if (path.startsWith('Qm')) {
      breadcrumb.innerHTML = `<span class="breadcrumb-item">ipfs:/${path.substring(0, 12)}...</span>`;
    } else {
      breadcrumb.innerHTML = `<span class="breadcrumb-item">ipfs:${path}</span>`;
    }
  }

  showUploadModal(window) {
    window.querySelector('#upload-overlay').style.display = 'flex';
  }

  hideUploadModal(window) {
    window.querySelector('#upload-overlay').style.display = 'none';
  }

  async startUpload(window) {
    const fileInput = window.querySelector('#file-input');
    const files = fileInput.files;

    if (files.length === 0) {
      alert('Please select files to upload');
      return;
    }

    try {
      // Real upload path: each file is persisted as a content-addressed
      // artifact via the kit backend; the CID shown is the verified one.
      const results = [];
      for (const file of files) {
        const cid = await this.uploadFileToIPFS(file);
        results.push({ name: file.name, cid });
      }

      this.hideUploadModal(window);
      this.refreshCurrentView();

      alert(`Successfully added ${files.length} file(s) to IPFS:\n` +
        results.map(r => `${r.name}: ${r.cid}`).join('\n'));

    } catch (error) {
      alert(`Upload failed: ${error.message}`);
    }
  }

  async togglePin(hash) {
    // Honestly local: the pin set is a local list in this session. Pinning
    // to the backend happens at upload time via the artifact store
    // (pin:true); there is no separate remote pin route on this surface,
    // so the UI labels the list as local rather than claiming backend pins.
    if (this.pinned.has(hash)) {
      this.pinned.delete(hash);
      eventBus.emit('ipfs:unpin-complete', { hash, scope: 'local' });
    } else {
      this.pinned.add(hash);
      eventBus.emit('ipfs:pin-complete', { hash, scope: 'local' });
    }
    this.showNotification?.(`Pin list updated (local): ${hash.slice(0, 20)}…`);
  }

  refreshCurrentView() {
    // Refresh current view implementation
    console.log('Refreshing IPFS view...');
  }

  showError(window, message) {
    const browser = window.querySelector('#file-browser');
    if (!browser) return;
    browser.innerHTML = `
      <div class="loading-message">
        <p class="sk-code" style="color: var(--sk-err, #ff6b6b); border-left: 3px solid var(--sk-err, #ff6b6b); padding-left: 8px;">❌ ${message}</p>
      </div>
    `;
  }

  // Enhanced methods for the improved IPFS Explorer

  async initialize() {
    // Live instance for inline handlers (one desktop window per app).
    if (typeof window !== 'undefined') window.ipfsExplorer = this;
    this.ensureExplorerSurface();
    await this.initializeIntegrations();
    this.setupEventListeners();
    await this.loadInitialData();
  }

  mountExplorerSurface() {
    const host = svfFindIpfsExplorerHost();
    if (!host || host.querySelector('#path-input')) return Boolean(host && host.querySelector('#path-input'));
    host.innerHTML = this.createWindow();
    return Boolean(host.querySelector('#path-input'));
  }

  ensureExplorerSurface() {
    if (this.mountExplorerSurface()) return;
    setTimeout(() => this.mountExplorerSurface(), 50);
    setTimeout(() => this.mountExplorerSurface(), 300);
    setTimeout(() => this.mountExplorerSurface(), 1000);
  }

  setupEventListeners(container = document.querySelector('.ipfs-explorer-container')) {
    if (!this._restoredPreview) {
      this._restoredPreview = true;
      this.restoreRetainedPreview();
    }
    if (!container || this._boundContainer === container) return;
    this.container = container;
    this._boundContainer = container;
    // Tab switching
    container.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-btn')) {
        const view = e.target.dataset.view;
        this.switchView(view);
      }
    });

    // File upload and management
    container.addEventListener('click', (e) => {
      const buttonHandlers = {
        'add-files': () => this.showUploadModal(),
        'create-folder': () => this.createFolder(),
        'ipfs-settings': () => this.showSettings(),
        
        // Navigation
        'back-btn': () => this.navigateBack(),
        'forward-btn': () => this.navigateForward(),
        'home-btn': () => this.navigateHome(),
        'refresh-btn': () => this.refreshContent(),
        'go-btn': () => this.navigateToPath(),
        
        // Pinning controls
        'bulk-pin': () => this.showBulkPinDialog(),
        'auto-pin': () => this.toggleAutoPinning(),
        'export-pins': () => this.exportPinList(),
        'import-pins': () => this.importPinList(),
        
        // Network controls
        'discover-peers': () => this.discoverPeers(),
        'test-connectivity': () => this.testConnectivity(),
        'optimize-routing': () => this.optimizeRouting(),
        'network-diagnostics': () => this.runNetworkDiagnostics(),
        
        // Upload modal
        'select-files': () => this.selectFiles(),
        'start-upload': () => this.startUpload(),
        'cancel-upload': () => this.hideUploadModal(),
        'close-upload-modal': () => this.hideUploadModal()
      };

      if (buttonHandlers[e.target.id]) {
        e.preventDefault();
        buttonHandlers[e.target.id]();
      }

      const viewButton = e.target.closest?.('.view-btn');
      if (viewButton) {
        const mode = viewButton.dataset.view;
        if (mode === 'list' || mode === 'grid') {
          this.viewMode = mode;
          document.querySelectorAll('.view-btn').forEach((node) => {
            node.classList.toggle('active', node === viewButton);
          });
          const browser = document.getElementById('content-browser');
          if (browser) browser.dataset.viewMode = mode;
          this.showNotification(mode === 'grid' ? 'Grid view' : 'List view', 'info');
        }
      }

      // Quick links
      const quickLink = e.target.closest?.('.quick-link');
      if (quickLink) {
        const hash = quickLink.dataset.hash;
        if (hash) {
          this.navigateToHash(hash);
        }
      }
    });

    // File selection for upload
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        this.handleFileSelection(e.target.files);
      });
    }

    // Path input navigation
    const pathInput = document.getElementById('path-input');
    if (pathInput) {
      pathInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.navigateToPath();
        }
      });
    }

    // Gateway selection
    const gatewaySelect = document.getElementById('gateway-select');
    if (gatewaySelect) {
      gatewaySelect.addEventListener('change', (e) => {
        this.currentGateway = e.target.value;
        this.saveSettings();
      });
    }
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
      case 'explorer':
        await this.loadExplorerContent();
        break;
      case 'pinning':
        await this.loadPinningData();
        break;
      case 'network':
        await this.loadNetworkData();
        break;
      case 'analytics':
        await this.loadAnalyticsData();
        break;
    }
  }

  async loadInitialData() {
    await this.loadExplorerContent();
    this.updateNetworkStatus();
    this.loadRecentPins();
  }

  async loadExplorerContent() {
    const browser = document.getElementById('content-browser');
    if (!browser) return;
    if (!this.currentHash) {
      if (!browser.querySelector('.ipfs-preview') && !browser.querySelector('.empty-state')) {
        browser.textContent = '';
        const empty = document.createElement('div');
        empty.className = 'empty-state sk-empty';
        empty.textContent = 'No CID loaded. Enter a CID and choose Go.';
        browser.append(empty);
      }
      return;
    }
    if (!this._forceRetrieve && browser.querySelector('.ipfs-preview')?.dataset?.retrievedCid === this.currentHash) return;
    this._forceRetrieve = false;
    const previous = browser.innerHTML;
    try {
      const content = await this.fetchIPFSContent(this.currentHash);
      this.displayContent(content);
    } catch (error) {
      browser.innerHTML = previous;
      this.showContentError(error.message);
    }
  }

  async fetchIPFSContent(hash) {
    this.previewRestoreGeneration = (this.previewRestoreGeneration || 0) + 1;
    const cid = String(hash || '').trim().replace(/^\/ipfs\//, '').split('/')[0];
    const host = (typeof svfFindIpfsExplorerHost === 'function' && svfFindIpfsExplorerHost()) || this.container || null;
    const container = host?.querySelector?.('.ipfs-explorer-container')
      || (host?.classList?.contains?.('ipfs-explorer-container') ? host : null)
      || this.container
      || document.querySelector('.window[data-app-id="ipfs-explorer"] .window-app-content .ipfs-explorer-container')
      || document.querySelector('.ipfs-explorer-container');
    try {
      const surface = container?.closest?.('.window-app-content') || container;
      const result = await invokeNativeTool(surface, 'ipfs-explorer', 'ipfs-explorer.ipfs_kit_py.retrieve_content', {
        executionMode: 'execute',
        toolId: 'ipfs_cat',
        trigger: surface?.querySelector?.('#go-btn') || null,
        payload: {
          cid,
          fixture_scope: 'svf-ipfs-explorer'
        }
      });
      if (result === null) throw Object.assign(new Error('Retrieve cancelled before dispatch.'), { cancelled: true });
      if (result.ok !== true || result.outcome !== 'executed') throw new Error(result.error?.message || result.error || 'The native retrieve did not execute.');
      const payload = unwrapNetworkToolResult(result.result);
      if (payload?.cid && payload.cid !== cid) throw new Error('ipfs_kit_py returned a different CID than requested.');
      const b64 = typeof payload?.bytes_base64 === 'string' ? payload.bytes_base64 : payload?.content_base64;
      if (typeof b64 === 'string' && b64.length) {
        const clientModule = await import('../core/mcp-plus-plus-desktop-client.js');
        const { contentCidForBytes } = clientModule;
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        const hashed = await contentCidForBytes(bytes);
        if (hashed !== cid) throw new Error('Retrieved bytes do not hash to the requested CID.');
        let preview = `${bytes.length} bytes`;
        try {
          preview = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch (decodeError) {
          preview = `${bytes.length} bytes`;
        }
        const pinState = payload.pinned === true ? 'pinned' : payload.pinned === false ? 'not pinned' : 'not observed';
        return { verifiedPreview: preview, cid, bytes_base64: b64, type: payload.type || payload.mime || 'file', pinState };
      }
      throw new Error('The native owner returned no readable byte payload.');
    } catch (kitError) {
      throw kitError;
    }

    // Try to fetch from real IPFS if available
    if (this.desktop?.swissknife?.ipfs) {
      try {
        const content = await this.desktop.swissknife.ipfs.ls(hash);
        return content;
      } catch (error) {
        console.warn('⚠️ IPFS fetch failed:', error);
      }
    }
    
    // Try window.ipfs if available
    if (window.ipfs) {
      try {
        const content = [];
        for await (const file of window.ipfs.ls(hash)) {
          content.push({
            name: file.name,
            type: file.type === 1 ? 'directory' : 'document',
            size: file.size,
            hash: file.cid.toString()
          });
        }
        return content;
      } catch (error) {
        console.warn('⚠️ Window IPFS fetch failed:', error);
      }
    }
    
    throw new Error('No local IPFS node is connected. This desktop did not list that CID.');
  }

  displayContent(items) {
    const browser = document.getElementById('content-browser');
    if (!browser) return;

    if (items && items.verifiedPreview != null) {
      browser.textContent = '';
      const wrap = document.createElement('div');
      wrap.className = 'ipfs-preview';
      wrap.dataset.retrievedCid = items.cid;
      const meta = document.createElement('p');
      meta.textContent = `Retrieved bytes match the requested CID. Type ${items.type}. Pin ${items.pinState}.`;
      const pre = document.createElement('pre');
      pre.className = 'sk-code';
      pre.style.setProperty('display', 'block', 'important');
      pre.style.setProperty('white-space', 'pre-wrap', 'important');
      pre.style.setProperty('overflow-wrap', 'anywhere', 'important');
      pre.style.setProperty('word-break', 'break-all', 'important');
      pre.style.setProperty('width', '100%', 'important');
      pre.style.setProperty('max-width', '100%', 'important');
      pre.style.setProperty('max-height', '160px', 'important');
      pre.style.setProperty('overflow', 'auto', 'important');
      pre.style.setProperty('box-sizing', 'border-box', 'important');
      pre.textContent = items.verifiedPreview;
      wrap.style.setProperty('overflow', 'hidden', 'important');
      wrap.style.setProperty('max-width', '100%', 'important');
      wrap.style.setProperty('min-width', '0', 'important');
      wrap.append(meta, pre);
      browser.append(wrap);
      try {
        localStorage.setItem('ipfs-explorer-last-preview', JSON.stringify({
          cid: items.cid,
          type: items.type,
          pinState: items.pinState,
          bytes_base64: items.bytes_base64,
          preview: items.verifiedPreview
        }));
      } catch (error) {
        console.warn('Could not retain IPFS preview', error);
      }
      return;
    }
    
    if (!items || items.length === 0) {
      browser.innerHTML = '<div class="empty-folder"><div class="empty-icon">📂</div><div class="empty-text">This folder is empty</div></div>';
      return;
    }
    
    const listView = `
      <div class="content-list">
        ${items.map(item => this.renderContentItem(item)).join('')}
      </div>
    `;
    
    browser.innerHTML = listView;
  }

  renderContentItem(item) {
    const typeInfo = this.contentTypes[item.type] || this.contentTypes.unknown;
    const sizeText = item.type === 'directory' ? `${item.children || 0} items` : this.formatBytes(item.size);
    
    return `
      <div class="content-item" data-hash="${item.hash}" data-type="${item.type}">
        <div class="item-icon" style="color: ${typeInfo.color}">${typeInfo.icon}</div>
        <div class="item-info">
          <div class="item-name">${item.name}</div>
          <div class="item-details">${sizeText} • ${item.hash.slice(0, 12)}...</div>
        </div>
        <div class="item-actions">
          <button class="item-btn" onclick="ipfsExplorer.previewItem('${item.hash}')" title="Preview">👁️</button>
          <button class="item-btn" onclick="ipfsExplorer.pinItem('${item.hash}')" title="Pin">📌</button>
          <button class="item-btn" onclick="ipfsExplorer.shareItem('${item.hash}')" title="Share">🔗</button>
          <button class="item-btn" onclick="ipfsExplorer.downloadItem('${item.hash}', '${item.name}')" title="Download">📥</button>
        </div>
      </div>
    `;
  }

  displayWelcomeContent() {
    const browser = document.getElementById('content-browser');
    if (!browser) return;
    
    browser.innerHTML = `
      <div class="welcome-content">
        <div class="welcome-header">
          <h2>🌐 Welcome to IPFS Explorer</h2>
          <p>Explore the distributed web with advanced IPFS management</p>
        </div>
        
        <div class="welcome-actions">
          <div class="action-card" onclick="document.getElementById('path-input')?.focus()">
            <div class="action-icon">📂</div>
            <div class="action-title">Retrieve a CID</div>
            <div class="action-description">Enter a content identifier. This view does not invent file bytes.</div>
          </div>
          
          <div class="action-card" onclick="ipfsExplorer.showUploadModal()">
            <div class="action-icon">📁+</div>
            <div class="action-title">Upload Files</div>
            <div class="action-description">Add your files to the IPFS network</div>
          </div>
          
          <div class="action-card" onclick="ipfsExplorer.switchView('network')">
            <div class="action-icon">🌐</div>
            <div class="action-title">Network Status</div>
            <div class="action-description">View network peers and performance</div>
          </div>
          
          <div class="action-card" onclick="ipfsExplorer.switchView('analytics')">
            <div class="action-icon">📊</div>
            <div class="action-title">View Analytics</div>
            <div class="action-description">Analyze your IPFS usage patterns</div>
          </div>
        </div>
      </div>
    `;
  }

  async restoreRetainedPreview() {
    const browser = document.getElementById('content-browser');
    if (!browser) return false;
    const generation = (this.previewRestoreGeneration || 0) + 1;
    this.previewRestoreGeneration = generation;
    const snapshot = localStorage.getItem('ipfs-explorer-last-preview');
    if (!snapshot) return false;
    try {
      const saved = JSON.parse(snapshot);
      if (!saved || typeof saved.cid !== 'string' || typeof saved.bytes_base64 !== 'string'
          || saved.bytes_base64.length > 1400000) throw new Error('Stored preview has no qualified raw bytes.');
      const bytes = Uint8Array.from(atob(saved.bytes_base64), char => char.charCodeAt(0));
      const { contentCidForBytes } = await import('../core/mcp-plus-plus-desktop-client.js');
      if (await contentCidForBytes(bytes) !== saved.cid) throw new Error('Stored preview bytes do not match the CID.');
      if (this.previewRestoreGeneration !== generation || !browser.isConnected
          || document.getElementById('content-browser') !== browser
          || localStorage.getItem('ipfs-explorer-last-preview') !== snapshot) return false;
      let preview;
      try { preview = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { preview = `${bytes.length} bytes`; }
      this.currentHash = saved.cid;
      this.currentPath = `/ipfs/${saved.cid}`;
      const pathInput = document.getElementById('path-input');
      if (pathInput) pathInput.value = this.currentPath;
      this.displayContent({ verifiedPreview: preview, bytes_base64: saved.bytes_base64, cid: saved.cid,
        type: typeof saved.type === 'string' ? saved.type : 'file', pinState: 'not observed' });
      return true;
    } catch (error) {
      if (this.previewRestoreGeneration === generation && browser.isConnected
          && document.getElementById('content-browser') === browser) {
        this.showContentError('Stored preview could not be verified. Retrieve the CID again.');
      }
      return false;
    }
  }

  showContentError(message) {
    const browser = document.getElementById('content-browser');
    if (!browser) return;
    let banner = browser.querySelector('.ipfs-error-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'ipfs-error-banner error-state';
      banner.setAttribute('role', 'alert');
      browser.prepend(banner);
    }
    banner.textContent = String(message || 'IPFS request failed.');
  }

  async loadPinningData() {
    await this.updatePinningStats();
    this.displayPinnedContent();
  }

  async updatePinningStats() {
    const stats = {
      'total-pins': this.pinnedContent.size,
      'pinned-size': this.calculatePinnedSize(),
      'sync-status': 'not measured',
      'pin-speed': '—'
    };
    
    Object.entries(stats).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });
  }

  calculatePinnedSize() {
    let totalSize = 0;
    this.pinnedContent.forEach(pin => {
      totalSize += pin.size || 0;
    });
    return this.formatBytes(totalSize);
  }

  displayPinnedContent() {
    const container = document.getElementById('pins-list');
    if (!container) return;
    
    const pins = Array.from(this.pinnedContent.values());
    
    if (pins.length === 0) {
      container.innerHTML = '<div class="no-pins">No pinned content. Pin some files to keep them available!</div>';
      return;
    }
    
    container.innerHTML = pins.map(pin => `
      <div class="pin-item">
        <div class="pin-icon">${this.getContentIcon(pin.type)}</div>
        <div class="pin-info">
          <div class="pin-name">${pin.name}</div>
          <div class="pin-hash">${pin.hash}</div>
          <div class="pin-meta">${this.formatBytes(pin.size)} • ${new Date(pin.pinnedAt).toLocaleDateString()}</div>
        </div>
        <div class="pin-status">
          <span class="status-badge status-${pin.status}">${pin.status}</span>
        </div>
        <div class="pin-actions">
          <button class="pin-btn small" onclick="ipfsExplorer.viewPinDetails('${pin.hash}')">🔍</button>
          <button class="pin-btn small" onclick="ipfsExplorer.unpinContent('${pin.hash}')">📌❌</button>
        </div>
      </div>
    `).join('');
  }

  async loadNetworkData() {
    await this.updateNetworkMetrics();
    this.displayPeerList();
    this.testGatewayPerformance();
  }

  testGatewayPerformance() {
    const host = document.getElementById('gateway-tests');
    const gateway = this.currentGateway || '(none)';
    if (host) {
      host.textContent = `No gateway timing sample. Selected gateway ${gateway}. This desktop did not invent a latency.`;
    }
  }

  async updateNetworkMetrics() {
    // Try to get real network metrics from IPFS
    let metrics = {
      'network-peers': 0,
      'download-speed': '0 KB/s',
      'upload-speed': '0 KB/s',
      'dht-size': 0
    };
    
    // Try SwissKnife IPFS API
    if (this.desktop?.swissknife?.ipfs) {
      try {
        const stats = await this.desktop.swissknife.ipfs.stats();
        metrics['network-peers'] = stats.peers || 0;
        metrics['download-speed'] = `${((stats.downloadSpeed || 0) / 1024).toFixed(1)} KB/s`;
        metrics['upload-speed'] = `${((stats.uploadSpeed || 0) / 1024).toFixed(1)} KB/s`;
        metrics['dht-size'] = stats.dhtSize || 0;
      } catch (error) {
        console.warn('⚠️ Could not fetch real IPFS stats:', error);
      }
    }
    
    // Try window.ipfs
    if (window.ipfs && metrics['network-peers'] === 0) {
      try {
        const swarm = await window.ipfs.swarm.peers();
        metrics['network-peers'] = swarm.length;
      } catch (error) {
        console.warn('⚠️ Could not fetch IPFS swarm peers:', error);
      }
    }
    
    Object.entries(metrics).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });
    
    this.updateNetworkCharts();
  }

  updateNetworkCharts() {
    // Simple mini-charts for network metrics
    const charts = ['peers-chart', 'download-chart', 'upload-chart', 'dht-chart'];
    
    charts.forEach(chartId => {
      const element = document.getElementById(chartId);
      if (element) {
        element.textContent = 'not measured';
      }
    });
  }

  async displayPeerList() {
    const table = document.getElementById('peers-table');
    if (!table) return;
    
    // Try to get real peer data from IPFS
    let peers = [];
    
    if (this.desktop?.swissknife?.ipfs) {
      try {
        const swarmPeers = await this.desktop.swissknife.ipfs.swarm.peers();
        peers = swarmPeers.map(peer => ({
          id: peer.peer || peer.id,
          location: peer.location || 'Unknown',
          latency: peer.latency || 'N/A',
          bandwidth: peer.bandwidth || 'N/A'
        }));
      } catch (error) {
        console.warn('⚠️ Could not fetch real peers:', error);
      }
    }
    
    // Try window.ipfs if no peers yet
    if (peers.length === 0 && window.ipfs) {
      try {
        const swarmPeers = await window.ipfs.swarm.peers();
        peers = swarmPeers.map(peer => ({
          id: peer.peer || peer.addr,
          location: 'Unknown',
          latency: 'N/A',
          bandwidth: 'N/A'
        }));
      } catch (error) {
        console.warn('⚠️ Could not fetch window.ipfs peers:', error);
      }
    }
    
    // Honest empty state when no backend is reachable: no invented peers.
    if (peers.length === 0) {
      table.innerHTML = `
        <div class="empty-state sk-empty">
          <p>🔌 No IPFS backend connected — no peer data available.</p>
          <p class="sk-empty-text">Peer discovery runs against the live MCP++ kit backend when it is reachable.</p>
        </div>
      `;
      return;
    }

    table.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Peer ID</th>
            <th>Location</th>
            <th>Latency</th>
            <th>Bandwidth</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${peers.map(peer => `
            <tr>
              <td><code>${peer.id}</code></td>
              <td>${peer.location}</td>
              <td>${peer.latency}</td>
              <td>${peer.bandwidth}</td>
              <td>
                <button class="peer-btn small" onclick="ipfsExplorer.pingPeer('${peer.id}')">📡</button>
                <button class="peer-btn small" onclick="ipfsExplorer.viewPeerDetails('${peer.id}')">🔍</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  async loadAnalyticsData() {
    this.updateAnalyticsSummary();
    this.renderBandwidthChart();
    this.renderContentTypesChart();
    this.generateUsageInsights();
  }

  updateAnalyticsSummary() {
    // Try to get real analytics from IPFS stats
    let summary = {
      dataRetrieved: '0 B',
      dataShared: '0 B',
      cacheHitRate: 'N/A',
      avgLatency: 'N/A'
    };
    
    if (this.desktop?.swissknife?.ipfs) {
      try {
        // These would be populated from real IPFS stats if available
        summary = {
          dataRetrieved: this.formatBytes(0), // Real implementation would track this
          dataShared: this.formatBytes(0), // Real implementation would track this  
          cacheHitRate: 'N/A', // Requires analytics tracking
          avgLatency: 'N/A' // Requires performance monitoring
        };
      } catch (error) {
        console.warn('⚠️ Could not fetch analytics:', error);
      }
    }
    
    // Update summary cards if they exist
    const elements = {
      'data-retrieved': summary.dataRetrieved,
      'data-shared': summary.dataShared,
      'cache-hit-rate': summary.cacheHitRate,
      'avg-latency': summary.avgLatency
    };
    
    Object.entries(elements).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });
  }

  renderBandwidthChart() {
    const canvas = document.getElementById('bandwidth-chart');
    if (!canvas) return;
    
    // Simple chart placeholder
    canvas.style.background = 'linear-gradient(45deg, #e3f2fd, #1976d2)';
    canvas.style.height = '200px';
    
    // In production, use Chart.js or similar library
  }

  renderContentTypesChart() {
    const canvas = document.getElementById('content-types-chart');
    if (!canvas) return;
    
    // Simple chart placeholder
    canvas.style.background = 'linear-gradient(45deg, #fff3e0, #f57c00)';
    canvas.style.height = '200px';
  }

  generateUsageInsights() {
    const container = document.getElementById('insights-list');
    if (!container) return;

    // Honest: this surface tracks no usage analytics, so it states that
    // instead of inventing growth percentages and peer counts.
    container.innerHTML = `
      <div class="insight-item">
        <span class="insight-text">ℹ️ Usage analytics are not tracked on this surface — no fabricated statistics are shown. Connect an IPFS backend to see live data.</span>
      </div>
    `;
  }

  // Navigation methods
  navigateToHash(hash) {
    this.currentHash = hash;
    this.currentPath = `/ipfs/${hash}`;
    
    const pathInput = document.getElementById('path-input');
    if (pathInput) {
      pathInput.value = this.currentPath;
    }
    
    this.loadExplorerContent();
  }

  navigateToPath() {
    const host = (typeof svfFindIpfsExplorerHost === 'function' && svfFindIpfsExplorerHost()) || this.container || document;
    const pathInput = host.querySelector?.('#path-input') || document.getElementById('path-input');
    if (host?.querySelector) this.container = host.querySelector('.ipfs-explorer-container') || host;
    if (!pathInput) return;
    const typed = pathInput.value.trim();
    const stripped = typed.replace(/^\/ipfs\//, '').split('/')[0];
    if (!stripped || typed === '/' || typed === '/ipfs' || typed === '/ipfs/') {
      this.showContentError('Invalid or absent CID. Enter the CID to retrieve.');
      return;
    }
    if (!/^[A-Za-z0-9]{32,}$/.test(stripped)) {
      this.showContentError(`Invalid or absent CID: ${typed}`);
      return;
    }
    this.currentHash = stripped;
    this.currentPath = `/ipfs/${stripped}`;
    pathInput.value = this.currentPath;
    this._forceRetrieve = true;
    this.loadExplorerContent();
  }

  navigateBack() {
    // Implementation for back navigation
    console.log('Navigate back');
  }

  navigateForward() {
    // Implementation for forward navigation
    console.log('Navigate forward');
  }

  navigateHome() {
    const browser = document.getElementById('content-browser');
    if (browser) browser.querySelector('.ipfs-error-banner')?.remove();
    const pathInput = document.getElementById('path-input');
    if (this.currentHash) {
      this.currentPath = `/ipfs/${this.currentHash}`;
      if (pathInput) pathInput.value = this.currentPath;
      if (browser && !browser.querySelector('.ipfs-preview')) this.restoreRetainedPreview();
      return;
    }
    this.currentPath = '/';
    if (pathInput) pathInput.value = '/';
    if (browser && !browser.querySelector('.empty-state')) {
      browser.textContent = '';
      const empty = document.createElement('div');
      empty.className = 'empty-state sk-empty';
      empty.textContent = 'No CID loaded. Enter a CID and choose Go.';
      browser.append(empty);
    }
  }

  refreshContent() {
    this.loadExplorerContent();
  }

  // File management methods
  showUploadModal() {
    const modal = document.getElementById('upload-modal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  hideUploadModal() {
    const modal = document.getElementById('upload-modal');
    if (modal) {
      modal.style.display = 'none';
    }
    this.clearUploadQueue();
  }

  selectFiles() {
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
      fileInput.click();
    }
  }

  handleFileSelection(files) {
    this.uploadQueue = Array.from(files);
    this.displayUploadQueue();
    
    const startBtn = document.getElementById('start-upload');
    if (startBtn) {
      startBtn.disabled = this.uploadQueue.length === 0;
    }
  }

  displayUploadQueue() {
    const queueContainer = document.getElementById('upload-queue');
    const queueList = document.getElementById('queue-list');
    
    if (!queueContainer || !queueList) return;
    
    if (this.uploadQueue.length === 0) {
      queueContainer.style.display = 'none';
      return;
    }
    
    queueContainer.style.display = 'block';
    queueList.innerHTML = this.uploadQueue.map((file, index) => `
      <div class="queue-item">
        <div class="file-icon">${this.getFileIcon(file.name)}</div>
        <div class="file-info">
          <div class="file-name">${file.name}</div>
          <div class="file-size">${this.formatBytes(file.size)}</div>
        </div>
        <button class="remove-btn" onclick="ipfsExplorer.removeFromQueue(${index})">❌</button>
      </div>
    `).join('');
  }

  removeFromQueue(index) {
    this.uploadQueue.splice(index, 1);
    this.displayUploadQueue();
    
    const startBtn = document.getElementById('start-upload');
    if (startBtn) {
      startBtn.disabled = this.uploadQueue.length === 0;
    }
  }

  clearUploadQueue() {
    this.uploadQueue = [];
    this.displayUploadQueue();
  }

  async startUpload() {
    if (this.uploadQueue.length === 0) return;
    
    this.showNotification('Starting IPFS upload...', 'info');
    
    try {
      // Upload files to IPFS
      for (const file of this.uploadQueue) {
        await this.uploadFileToIPFS(file);
      }
      
      this.showNotification(`Successfully uploaded ${this.uploadQueue.length} files to IPFS`, 'success');
      this.hideUploadModal();
      this.loadExplorerContent();
    } catch (error) {
      this.showNotification(`Upload ${error.preview ? 'preview' : error.cancelled ? 'cancelled' : 'failed'}: ${error.message}`, error.preview || error.cancelled ? 'info' : 'error');
    }
  }

  async uploadFileToIPFS(file) {
    // The reviewed owner validates the exact file bytes after visible
    // confirmation. No alternate browser writer runs before policy review.
    const clientModule = await import('../core/mcp-plus-plus-desktop-client.js');
    const { contentCidForBytes, base64ForBytes } = clientModule;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const cid = await contentCidForBytes(bytes);
    const result = await invokeNetworkNativeTool(this.container || document.querySelector('.ipfs-explorer-container'), 'ipfs-explorer', 'mcp++:ipfs_kit_py/artifacts/put', {
      cid,
      bytes_base64: base64ForBytes(bytes),
      profile: 'ipfs-explorer-upload',
      kind: 'file-upload',
      service: 'ipfs_kit_py',
      pin: document.getElementById('pin-after-upload')?.checked !== false
    });
    if (result === null) throw Object.assign(new Error('Upload cancelled before dispatch.'), { cancelled: true });
    if (result.persisted !== true || result.cid !== cid) {
      throw new Error(result?.error || 'ipfs_kit_py did not verify the uploaded artifact.');
    }
    this.pinnedContent.set(cid, {
      hash: cid,
      name: file.name,
      size: file.size,
      type: this.getFileType(file.name),
      pinnedAt: Date.now(),
      status: 'pinned',
      verified: result.verified === true
    });
    globalThis.eventBus?.emit?.('ipfs:file-added', { filename: file.name, hash: cid, size: file.size });
    return cid;
  }

  // Utility methods
  getContentIcon(type) {
    return this.contentTypes[type]?.icon || this.contentTypes.unknown.icon;
  }

  getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const typeMap = {
      'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
      'mp4': '🎥', 'avi': '🎥', 'mov': '🎥',
      'mp3': '🎵', 'wav': '🎵', 'flac': '🎵',
      'pdf': '📄', 'doc': '📄', 'txt': '📄',
      'zip': '📦', 'rar': '📦', 'tar': '📦',
      'js': '💻', 'html': '💻', 'css': '💻', 'py': '💻',
      'json': '📋'
    };
    return typeMap[ext] || '📄';
  }

  getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const typeMap = {
      'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image',
      'mp4': 'video', 'avi': 'video', 'mov': 'video',
      'mp3': 'audio', 'wav': 'audio', 'flac': 'audio',
      'pdf': 'document', 'doc': 'document', 'txt': 'document',
      'zip': 'archive', 'rar': 'archive', 'tar': 'archive',
      'js': 'code', 'html': 'code', 'css': 'code', 'py': 'code',
      'json': 'json'
    };
    return typeMap[ext] || 'unknown';
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getBarColor(percentage) {
    if (percentage < 50) return '#4CAF50';
    if (percentage < 80) return '#FF9800';
    return '#F44336';
  }

  // IPFS node management
  async initializeIPFSNode() {
    try {
      // Initialize IPFS node connection
      console.log('Initializing IPFS node connection...');
      
      // Try to connect to real IPFS node
      if (this.desktop?.swissknife?.ipfs) {
        try {
          const info = await this.desktop.swissknife.ipfs.id();
          this.ipfsNode = {
            id: info.id || info.peerId,
            version: info.agentVersion || '0.14.0',
            connected: true
          };
          console.log('✅ IPFS node connected via SwissKnife API');
          return;
        } catch (error) {
          console.warn('⚠️ SwissKnife IPFS connection failed:', error);
        }
      }
      
      // Try window.ipfs
      if (window.ipfs) {
        try {
          const info = await window.ipfs.id();
          this.ipfsNode = {
            id: info.id,
            version: info.agentVersion || '0.14.0',
            connected: true
          };
          console.log('✅ IPFS node connected via window.ipfs');
          return;
        } catch (error) {
          console.warn('⚠️ Window IPFS connection failed:', error);
        }
      }
      
      this.ipfsNode = {
        id: null,
        version: null,
        connected: false
      };
      console.log('IPFS node is not connected.');
      
    } catch (error) {
      console.error('❌ IPFS node connection failed:', error);
    }
  }

  setupP2PIntegration() {
    if (!this.p2pSystem) return;
    
    this.p2pSystem.on('ipfs:content-request', (request) => {
      this.handleP2PContentRequest(request);
    });
    
    this.p2pSystem.on('ipfs:pin-request', (request) => {
      this.handleP2PPinRequest(request);
    });
  }

  handleP2PContentRequest(request) {
    console.log('P2P content request:', request);
  }

  handleP2PPinRequest(request) {
    console.log('P2P pin request:', request);
  }

  updateNetworkStatus() {
    // Update network status indicators
    const peerCount = document.getElementById('peer-count');
    const bandwidth = document.getElementById('bandwidth');
    const storageUsed = document.getElementById('storage-used');
    
    if (peerCount && peerCount.textContent !== 'not measured' && peerCount.dataset.measured !== '1') peerCount.textContent = 'not measured';
    if (bandwidth && bandwidth.dataset.measured !== '1') bandwidth.textContent = 'not measured';
    if (storageUsed && storageUsed.dataset.measured !== '1') storageUsed.textContent = 'not measured';
  }

  loadPinnedContent() {
    try {
      const saved = localStorage.getItem('ipfs-pinned-content');
      if (saved) {
        const data = JSON.parse(saved);
        this.pinnedContent = new Map(data);
      }
    } catch (error) {
      console.error('Error loading pinned content:', error);
    }
  }

  savePinnedContent() {
    try {
      const data = Array.from(this.pinnedContent.entries());
      localStorage.setItem('ipfs-pinned-content', JSON.stringify(data));
    } catch (error) {
      console.error('Error saving pinned content:', error);
    }
  }

  loadRecentPins() {
    const container = document.getElementById('recent-pins');
    if (!container) return;
    
    const recentPins = Array.from(this.pinnedContent.values()).slice(0, 3);
    
    if (recentPins.length === 0) {
      container.innerHTML = '<div class="no-recent-pins">No recent pins</div>';
      return;
    }
    
    container.innerHTML = recentPins.map(pin => `
      <div class="recent-pin-item">
        <span class="pin-icon">${this.getContentIcon(pin.type)}</span>
        <span class="pin-name">${pin.name}</span>
      </div>
    `).join('');
  }

  saveSettings() {
    const settings = {
      currentGateway: this.currentGateway,
      currentView: this.currentView
    };
    
    localStorage.setItem('ipfs-explorer-settings', JSON.stringify(settings));
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem('ipfs-explorer-settings');
      if (saved) {
        const settings = JSON.parse(saved);
        this.currentGateway = settings.currentGateway || this.gateways[0];
        this.currentView = settings.currentView || 'explorer';
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  createFolder() {
    const name = window.prompt('Enter folder name:');
    if (!name || !String(name).trim()) {
      this.showNotification('Folder creation cancelled', 'info');
      return;
    }
    const folderName = String(name).trim();
    const browser = document.getElementById('content-browser');
    if (browser) {
      const row = document.createElement('div');
      row.className = 'ipfs-local-entry';
      row.textContent = `📁 ${folderName}`;
      browser.prepend(row);
    }
    this.showNotification(`Created folder ${folderName}`, 'success');
  }

  showSettings() {
    const host = document.querySelector('.ipfs-explorer-container');
    if (host) {
      let panel = host.querySelector('#ipfs-settings-panel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'ipfs-settings-panel';
        host.prepend(panel);
      }
      panel.textContent = `Gateway: ${this.currentGateway || 'unset'}. Settings stay on this desktop.`;
    }
    this.showNotification('IPFS Explorer settings are local to this desktop', 'info');
  }

  toggleAutoPinning() {
    this.autoPin = !this.autoPin;
    const button = document.getElementById('auto-pin');
    if (button) button.setAttribute('aria-pressed', this.autoPin ? 'true' : 'false');
    this.showNotification(this.autoPin ? 'Auto pin is on for this session' : 'Auto pin is off', 'info');
  }

  showBulkPinDialog() {
    const pins = [...(this.pinnedContent?.keys?.() || [])];
    const list = document.getElementById('pins-list');
    if (list) {
      list.textContent = pins.length
        ? `Local pins: ${pins.join(', ')}`
        : 'No local pins yet. Upload a file with pin-after-upload to record one.';
    }
    this.showNotification(pins.length ? `Bulk pin list has ${pins.length} local pin(s)` : 'No local pins to bulk-pin', 'info');
  }

  exportPinList() {
    const pins = [...(this.pinnedContent?.entries?.() || [])].map(([hash, meta]) => `${hash} ${meta?.name || ''}`.trim());
    const list = document.getElementById('pins-list');
    const text = pins.length ? pins.join('\n') : 'No local pins to export';
    if (list) list.textContent = text;
    this.showNotification(pins.length ? `Exported ${pins.length} local pin(s) into the pin list` : 'No local pins to export', 'info');
  }

  importPinList() {
    const input = document.getElementById('file-input');
    if (input) {
      input.click();
      this.showNotification('Choose a pin list file', 'info');
      return;
    }
    this.showNotification('Pin import needs a file input', 'warning');
  }

  discoverPeers() {
    const table = document.getElementById('peers-table');
    if (table) {
      table.textContent = 'Peer discovery is not bound to one MCP tool on this desktop. No peer list was invented.';
    }
    this.showNotification('Peer discovery has no single bound tool', 'info');
  }

  testConnectivity() {
    const host = document.getElementById('gateway-tests');
    const gateway = this.currentGateway || '(none)';
    if (host) host.textContent = `Connectivity check is local: selected gateway ${gateway}. No tool call was sent.`;
    this.showNotification(`Gateway selection: ${gateway}`, 'info');
  }

  optimizeRouting() {
    this.showNotification('Routing optimization is not bound to a tool. The current gateway stays selected.', 'info');
  }

  runNetworkDiagnostics() {
    const note = document.getElementById('gateway-tests');
    if (note) note.textContent = 'Diagnostics: this surface has no live peer sample. Counts stay at the measured zero.';
    this.showNotification('Network diagnostics: no live peer sample on this surface', 'info');
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

  onDestroy() {
    if (this.p2pSystem) {
      this.p2pSystem.off('ipfs:content-request');
      this.p2pSystem.off('ipfs:pin-request');
    }
  }

  // Modern app framework methods
  async render() {
    console.log('🎨 Rendering IPFS Explorer app...');
    const windowConfig = this.createWindowConfig();
    
    // Set up event handlers after the HTML is rendered
    setTimeout(() => {
      this.ensureExplorerSurface();
      const container = document.querySelector('.ipfs-explorer-container');
      if (container) {
        this.setupEventListeners();
        this.initializeIPFSConnection(container);
      }
    }, 100);
    
    return windowConfig;
  }

  createWindowConfig() {
    return {
      title: '🌐 IPFS Explorer',
      content: this.createWindow(),
      width: 1200,
      height: 800,
      resizable: true,
      x: 200,
      y: 150
    };
  }

  getWindowContent() {
    return `
      <div class="ipfs-explorer-container">
        <div class="ipfs-toolbar">
          <div class="toolbar-section">
            <button class="toolbar-btn" id="back-btn" title="Back" disabled>⬅️</button>
            <button class="toolbar-btn" id="forward-btn" title="Forward" disabled>➡️</button>
            <button class="toolbar-btn" id="refresh-btn" title="Refresh">🔄</button>
          </div>
          <div class="toolbar-section path-section">
            <div class="path-breadcrumb" id="path-breadcrumb">/ipfs/</div>
            <input type="text" id="path-input" placeholder="Enter IPFS hash or path..." class="path-input">
          </div>
          <div class="toolbar-section">
            <button class="toolbar-btn" id="upload-btn" title="Upload Files">📤</button>
            <button class="toolbar-btn" id="pin-btn" title="Pin Content">📌</button>
          </div>
        </div>
        
        <div class="ipfs-main">
          <div class="ipfs-sidebar">
            <div class="sidebar-section">
              <h3>Quick Access</h3>
              <div class="quick-access">
                <div class="access-item" data-path="/ipfs/">🏠 Root</div>
                <div class="access-item" data-path="/pins/">📌 Pinned</div>
                <div class="access-item" data-path="/recent/">🕐 Recent</div>
                <div class="access-item" data-path="/shared/">🌐 P2P Shared</div>
              </div>
            </div>
            
            <div class="sidebar-section">
              <h3>Node Status</h3>
              <div class="node-status">
                <div class="status-item">
                  <span class="status-label">Status:</span>
                  <span class="status-value" id="node-status">Connecting...</span>
                </div>
                <div class="status-item">
                  <span class="status-label">Peers:</span>
                  <span class="status-value" id="peer-count">0</span>
                </div>
                <div class="status-item">
                  <span class="status-label">Storage:</span>
                  <span class="status-value" id="storage-used">0 MB</span>
                </div>
              </div>
            </div>
          </div>
          
          <div class="ipfs-content">
            <div class="content-header">
              <div class="view-controls">
                <button class="view-btn active" data-view="list">📋 List</button>
                <button class="view-btn" data-view="grid">🔲 Grid</button>
              </div>
              <div class="sort-controls">
                <select id="sort-select">
                  <option value="name">Sort by Name</option>
                  <option value="size">Sort by Size</option>
                  <option value="date">Sort by Date</option>
                  <option value="type">Sort by Type</option>
                </select>
              </div>
            </div>
            
            <div class="file-browser" id="file-browser">
              <div class="loading-indicator">
                <div class="spinner"></div>
                <div>Loading IPFS content...</div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Upload Area -->
        <div class="upload-area" id="upload-area" style="display: none;">
          <div class="upload-content">
            <div class="upload-icon">📁</div>
            <div class="upload-text">Drop files here to upload to IPFS</div>
            <div class="upload-note">or click to select files</div>
          </div>
        </div>
      </div>
    `;
  }
}

function svfIpfsWindowVisible(win) {
  if (!win || !win.isConnected || win.hidden) return false;
  const style = getComputedStyle(win);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = win.getBoundingClientRect();
  return rect.width > 8 && rect.height > 8;
}

function svfCollectIpfsHosts(root, seen, out) {
  if (!root || seen.has(root)) return;
  seen.add(root);
  const wins = root.querySelectorAll?.('.window[data-app-id="ipfs-explorer"], .window[data-app="ipfs-explorer"]') || [];
  for (const win of wins) {
    if (!win.getAttribute('data-app-id')) win.setAttribute('data-app-id', 'ipfs-explorer');
    win.hidden = false;
    win.style.setProperty('display', 'flex', 'important');
    win.style.setProperty('flex-direction', 'column', 'important');
    win.style.setProperty('visibility', 'visible', 'important');
    win.style.setProperty('opacity', '1', 'important');
    win.style.setProperty('min-width', '300px', 'important');
    win.style.setProperty('min-height', '320px', 'important');
    win.style.setProperty('overflow', 'hidden', 'important');
    let host = win.querySelector?.('.window-app-content')
      || win.shadowRoot?.querySelector?.('.window-app-content');
    if (!host) {
      host = document.createElement('div');
      host.className = 'window-app-content';
      win.appendChild(host);
    }
    host.hidden = false;
    host.style.setProperty('display', 'flex', 'important');
    host.style.setProperty('flex-direction', 'column', 'important');
    host.style.setProperty('flex', '1 1 auto', 'important');
    host.style.setProperty('visibility', 'visible', 'important');
    host.style.setProperty('opacity', '1', 'important');
    host.style.setProperty('min-height', '0', 'important');
    host.style.setProperty('min-width', '0', 'important');
    host.style.setProperty('overflow', 'hidden', 'important');
    const strayInput = win.querySelector?.('#path-input');
    if (strayInput && !host.contains(strayInput)) {
      host.appendChild(strayInput.closest('.ipfs-explorer-container') || strayInput);
    }
    out.push({ win, host });
    if (win.shadowRoot) svfCollectIpfsHosts(win.shadowRoot, seen, out);
  }
  const nodes = root.querySelectorAll?.('*') || [];
  for (const node of nodes) {
    if (node.shadowRoot) svfCollectIpfsHosts(node.shadowRoot, seen, out);
  }
}

function svfExplorerRoots() {
  const roots = [];
  const push = (doc) => {
    if (doc && !roots.includes(doc)) roots.push(doc);
  };
  try { push(window.top?.document); } catch (error) { /* cross-origin top */ }
  try { push(window.parent?.document); } catch (error) { /* cross-origin parent */ }
  push(document);
  return roots;
}

function svfAllIpfsHosts() {
  const found = [];
  const seen = new Set();
  for (const root of svfExplorerRoots()) {
    svfCollectIpfsHosts(root, seen, found);
    for (const frame of root.querySelectorAll('iframe')) {
      try {
        if (frame.contentDocument) svfCollectIpfsHosts(frame.contentDocument, seen, found);
      } catch (error) {
        /* cross-origin frame is outside this desktop document */
      }
    }
  }
  return found;
}

function svfFindIpfsExplorerHost() {
  const visible = svfAllIpfsHosts().filter((entry) => svfIpfsWindowVisible(entry.win));
  return visible.length ? visible[visible.length - 1].host : null;
}

function svfBootIpfsExplorer() {
  if (globalThis.__svfIpfsBooting) return;
  const found = svfAllIpfsHosts();
  let topDoc = document;
  try { topDoc = window.top.document || document; } catch (error) { topDoc = document; }
  const inTop = found.filter((entry) => entry.win?.ownerDocument === topDoc);
  const ranked = inTop.length ? inTop : found;
  const visible = ranked.filter((entry) => svfIpfsWindowVisible(entry.win));
  const pool = visible.length ? visible : ranked.filter((entry) => entry.win?.isConnected);
  if (!pool.length) return;
  globalThis.__svfIpfsBooting = true;
  try {
    const host = pool[pool.length - 1].host;
    const app = globalThis.ipfsExplorer instanceof IPFSExplorerApp
      ? globalThis.ipfsExplorer
      : new IPFSExplorerApp(globalThis.desktop || {});
    globalThis.ipfsExplorer = app;
    if (host.ownerDocument !== document && !document.__svfIpfsIdBridge) {
      document.__svfIpfsIdBridge = true;
      const ownerGet = host.ownerDocument.getElementById.bind(host.ownerDocument);
      const localGet = document.getElementById.bind(document);
      document.getElementById = (id) => localGet(id) || ownerGet(id);
    }
    let existingInput = host.querySelector('#path-input');
    if (!existingInput) {
      try {
        host.innerHTML = app.createWindow();
        const container = host.querySelector('.ipfs-explorer-container');
        if (container) app.setupEventListeners(container);
      } catch (error) {
        console.warn('IPFS explorer markup unavailable', error);
      }
      existingInput = host.querySelector('#path-input');
    }
    if (!existingInput) {
      const bar = host.ownerDocument.createElement('div');
      bar.className = 'path-bar';
      existingInput = host.ownerDocument.createElement('input');
      existingInput.id = 'path-input';
      existingInput.type = 'text';
      existingInput.setAttribute('aria-label', 'IPFS path or CID');
      const go = host.ownerDocument.createElement('button');
      go.type = 'button';
      go.id = 'go-btn';
      go.setAttribute('aria-label', 'Retrieve CID');
      go.textContent = 'Go';
      try {
        const extra = 'data-native-gateway-binding="ipfs-explorer.ipfs_kit_py.retrieve_content" data-native-tool-id="ipfs_cat"';
        if (typeof extra === 'string') {
          const holder = host.ownerDocument.createElement('div');
          holder.innerHTML = `<button id="go-btn" ${extra}></button>`;
          const seeded = holder.querySelector('button');
          if (seeded) {
            for (const attr of [...seeded.attributes]) go.setAttribute(attr.name, attr.value);
          }
        }
      } catch (error) {
        console.warn('IPFS retrieve attributes unavailable', error);
      }
      go.id = 'go-btn';
      bar.append(existingInput, go);
      host.prepend(bar);
      if (!host.querySelector('#content-browser')) {
        const browser = host.ownerDocument.createElement('div');
        browser.id = 'content-browser';
        host.append(browser);
      }
      if (!host.querySelector('#home-btn')) {
        const home = host.ownerDocument.createElement('button');
        home.id = 'home-btn';
        home.type = 'button';
        home.textContent = 'Home';
        host.append(home);
      }
      app.setupEventListeners(host.querySelector('.ipfs-explorer-container') || host);
    }
    const panel = host.querySelector('.tab-content[data-view="explorer"]');
    if (panel) {
      panel.classList.add('active');
      panel.style.setProperty('display', 'flex', 'important');
      panel.style.setProperty('visibility', 'visible', 'important');
    }
    const input = host.querySelector('#path-input');
    const go = host.querySelector('#go-btn');
    if (go && !go.outerHTML.includes('ipfs-explorer.ipfs_kit_py.retrieve_content')) {
      try {
        const extra = 'data-native-gateway-binding="ipfs-explorer.ipfs_kit_py.retrieve_content" data-native-tool-id="ipfs_cat"';
        if (typeof extra === 'string') {
          const holder = host.ownerDocument.createElement('div');
          holder.innerHTML = `<button ${extra}></button>`;
          const seeded = holder.querySelector('button');
          if (seeded) {
            for (const attr of [...seeded.attributes]) {
              if (!go.hasAttribute(attr.name)) go.setAttribute(attr.name, attr.value);
            }
          }
        }
      } catch (error) {
        console.warn('IPFS retrieve attributes unavailable', error);
      }
    }
    const container = host.querySelector('.ipfs-explorer-container') || host;
    if (input) {
      let bar = input.closest('.path-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'path-bar';
        bar.append(input);
        if (go) bar.append(go);
      }
      bar.style.setProperty('display', 'flex', 'important');
      bar.style.setProperty('visibility', 'visible', 'important');
      bar.style.setProperty('position', 'relative', 'important');
      bar.style.setProperty('z-index', '5', 'important');
      bar.style.setProperty('min-height', '40px', 'important');
      bar.style.setProperty('width', '100%', 'important');
      bar.style.setProperty('max-width', '100%', 'important');
      bar.style.setProperty('min-width', '0', 'important');
      bar.style.setProperty('flex-wrap', 'nowrap', 'important');
      bar.style.setProperty('box-sizing', 'border-box', 'important');
      if (container.firstElementChild !== bar) container.prepend(bar);
      input.hidden = false;
      input.style.setProperty('display', 'block', 'important');
      input.style.setProperty('visibility', 'visible', 'important');
      input.style.setProperty('opacity', '1', 'important');
      input.style.setProperty('min-height', '32px', 'important');
      input.style.setProperty('min-width', '0', 'important');
      const cidNarrow = ((host.closest('.window') || host).getBoundingClientRect?.().width || 800) <= 480;
      if (cidNarrow) {
        bar.style.setProperty('flex-direction', 'column', 'important');
        bar.style.setProperty('align-items', 'stretch', 'important');
        input.style.setProperty('width', '100%', 'important');
        input.style.setProperty('max-width', '100%', 'important');
        input.style.setProperty('flex', '1 1 auto', 'important');
        input.style.setProperty('min-height', '48px', 'important');
        const previewPane = host.querySelector('.explorer-content');
        const sidePane = host.querySelector('.explorer-sidebar');
        const mainPane = host.querySelector('.explorer-main');
        if (mainPane) mainPane.style.setProperty('flex-direction', 'column', 'important');
        if (previewPane) previewPane.style.setProperty('order', '-1', 'important');
        if (sidePane) {
          sidePane.style.setProperty('order', '1', 'important');
          sidePane.style.setProperty('max-height', '140px', 'important');
          sidePane.style.setProperty('overflow', 'auto', 'important');
          sidePane.style.setProperty('width', '100%', 'important');
        }
      } else {
        input.style.setProperty('width', '1px', 'important');
        input.style.setProperty('max-width', 'calc(100% - 64px)', 'important');
        input.style.setProperty('flex', '1 1 0%', 'important');
        const previewPaneWide = host.querySelector('.explorer-content');
        const sidePaneWide = host.querySelector('.explorer-sidebar');
        const mainPaneWide = host.querySelector('.explorer-main');
        if (mainPaneWide) {
          mainPaneWide.style.setProperty('flex-direction', 'row', 'important');
          mainPaneWide.style.setProperty('overflow', 'hidden', 'important');
          mainPaneWide.style.setProperty('min-height', '0', 'important');
          mainPaneWide.style.setProperty('min-width', '0', 'important');
        }
        if (previewPaneWide) {
          previewPaneWide.style.setProperty('order', '1', 'important');
          previewPaneWide.style.setProperty('flex', '1 1 0', 'important');
          previewPaneWide.style.setProperty('width', '0', 'important');
          previewPaneWide.style.setProperty('min-width', '0', 'important');
          previewPaneWide.style.setProperty('max-width', '100%', 'important');
          previewPaneWide.style.setProperty('overflow', 'auto', 'important');
        }
        if (sidePaneWide) {
          sidePaneWide.style.setProperty('order', '0', 'important');
          sidePaneWide.style.setProperty('max-height', 'none', 'important');
          sidePaneWide.style.setProperty('overflow', 'auto', 'important');
          sidePaneWide.style.setProperty('min-height', '0', 'important');
        }
      }
      const shell = host.closest('.window') || host;
      let node = input;
      while (node) {
        node.hidden = false;
        node.style.setProperty('visibility', 'visible', 'important');
        node.style.setProperty('opacity', '1', 'important');
        node.style.setProperty('min-height', node === input ? '32px' : '0', 'important');
        node.style.setProperty('overflow', node === input ? 'auto' : 'hidden', 'important');
        if (getComputedStyle(node).display === 'none' || node === host || node === shell) {
          node.style.setProperty('display', node === input ? 'block' : 'flex', 'important');
        }
        if (node === shell) break;
        node = node.parentElement;
      }
      host.style.setProperty('overflow', 'auto', 'important');
      host.style.setProperty('min-height', '160px', 'important');
      const box = input.getClientRects()[0];
      if (box && box.height > 0 && box.width > 0) host.dataset.svfIpfsCidReady = '1';
    }
  } catch (error) {
    console.warn('IPFS explorer surface unavailable', error);
  } finally {
    globalThis.__svfIpfsBooting = false;
  }
}

if (typeof document !== 'undefined' && document.documentElement) {
  let scheduled = false;
  const boot = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      let ready = null;
      for (const doc of svfExplorerRoots()) {
        ready = doc.querySelector('.window[data-app-id="ipfs-explorer"] .window-app-content #path-input');
        if (ready) break;
      }
      let shown = Boolean(ready);
      for (let node = ready; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') shown = false;
      }
      const box = ready?.getClientRects?.()[0];
      if (shown && box && box.height > 1 && box.width > 1) return;
      svfBootIpfsExplorer();
    }, 50);
  };
  new MutationObserver(boot).observe(document.documentElement, { childList: true, subtree: true });
  const timer = setInterval(boot, 250);
  setTimeout(() => clearInterval(timer), 30000);
  boot();
}
