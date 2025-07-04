// web/src/apps/StorageManager.ts
export class StorageManager extends BaseApplication {
  private backends: Map<string, StorageBackend> = new Map();
  private configurations: Map<string, BackendConfig> = new Map();

  async initialize(): Promise<void> {
    this.createUI();
    await this.loadBackendConfigurations();
    this.setupEventHandlers();
  }

  private createUI(): void {
    this.window.innerHTML = `
      <div class="storage-manager">
        <div class="header">
          <h2>Storage Backend Manager</h2>
          <button class="add-backend">+ Add Backend</button>
        </div>
        
        <div class="backends-grid">
          <!-- Backend cards will be rendered here -->
        </div>
        
        <div class="backend-details">
          <div class="tabs">
            <button class="tab active" data-tab="config">Configuration</button>
            <button class="tab" data-tab="stats">Statistics</button>
            <button class="tab" data-tab="health">Health</button>
            <button class="tab" data-tab="logs">Logs</button>
          </div>
          
          <div class="tab-content">
            <div class="tab-pane active" id="config-pane">
              <!-- Configuration form -->
            </div>
            <div class="tab-pane" id="stats-pane">
              <!-- Statistics dashboard -->
            </div>
            <div class="tab-pane" id="health-pane">
              <!-- Health monitoring -->
            </div>
            <div class="tab-pane" id="logs-pane">
              <!-- Log viewer -->
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderBackendCard(name: string, backend: StorageBackend): string {
    const status = backend.isConnected ? 'connected' : 'disconnected';
    const stats = backend.getStats();
    
    return `
      <div class="backend-card ${status}" data-backend="${name}">
        <div class="backend-header">
          <div class="backend-icon">${this.getBackendIcon(backend.name)}</div>
          <div class="backend-info">
            <h3>${backend.name}</h3>
            <p class="backend-protocol">${backend.protocol}</p>
          </div>
          <div class="backend-status">
            <span class="status-dot ${status}"></span>
            <span class="status-text">${status}</span>
          </div>
        </div>
        
        <div class="backend-stats">
          <div class="stat">
            <label>Files</label>
            <value>${stats.fileCount || 0}</value>
          </div>
          <div class="stat">
            <label>Storage</label>
            <value>${this.formatSize(stats.totalSize || 0)}</value>
          </div>
          <div class="stat">
            <label>Latency</label>
            <value>${stats.averageLatency || 0}ms</value>
          </div>
        </div>
        
        <div class="backend-actions">
          <button class="btn-connect" ${backend.isConnected ? 'style="display:none"' : ''}>Connect</button>
          <button class="btn-disconnect" ${!backend.isConnected ? 'style="display:none"' : ''}>Disconnect</button>
          <button class="btn-configure">Configure</button>
          <button class="btn-test">Test</button>
        </div>
      </div>
    `;
  }

  private getBackendIcon(backendType: string): string {
    const icons = {
      'helia': '🌍',
      'libp2p': '🔗',
      'storacha': '☁️',
      's3': '🪣'
    };
    return icons[backendType] || '💾';
  }
}