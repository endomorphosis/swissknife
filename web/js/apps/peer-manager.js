/**
 * Enhanced Peer Manager App for SwissKnife Web Desktop
 * Handles P2P connections, UCAN tokens, and resource sharing
 */

export class PeerManagerApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.peers = [];
    this.ucanTokens = new Map();
    this.sharedResources = new Map();
    this.trustedPeers = new Set();
    this.peerCapabilities = new Map();
  }

  async initialize() {
    this.swissknife = this.desktop.swissknife;
    await this.loadPeers();
    await this.loadUCANTokens();
    await this.loadSharedResources();
    await this.loadTrustedPeers();
  }

  createWindow() {
    return `
      <div class="peer-manager-app">
        <div class="peer-manager-header">
          <h2>🔗 Peer Manager</h2>
          <p>Manage P2P connections, UCAN tokens, and resource sharing</p>
        </div>
        
        <div class="peer-manager-tabs">
          <button class="peer-tab active" data-tab="peers">Peers</button>
          <button class="peer-tab" data-tab="ucan">UCAN Tokens</button>
          <button class="peer-tab" data-tab="resources">Shared Resources</button>
          <button class="peer-tab" data-tab="capabilities">Capabilities</button>
          <button class="peer-tab" data-tab="settings">Settings</button>
        </div>
        
        <div class="peer-manager-content">
          <!-- Peers Tab -->
          <div class="peer-tab-content active" id="peers">
            <div class="peer-controls">
              <button class="btn-primary" id="discover-peers">🔍 Discover Peers</button>
              <button class="btn-secondary" id="add-peer-manual">➕ Add Peer Manually</button>
              <button class="btn-secondary" id="export-peer-list">📤 Export Peer List</button>
            </div>
            
            <div class="peer-list" id="peer-list">
              <div class="peer-item trusted">
                <div class="peer-icon">🖥️</div>
                <div class="peer-details">
                  <div class="peer-name">Local Development Node</div>
                  <div class="peer-id">12D3KooWExample...</div>
                  <div class="peer-status online">Online</div>
                  <div class="peer-capabilities">
                    <span class="capability">Storage</span>
                    <span class="capability">Inference</span>
                    <span class="capability">Files</span>
                  </div>
                </div>
                <div class="peer-actions">
                  <button class="btn-small btn-primary">Connect</button>
                  <button class="btn-small btn-secondary">Share Resource</button>
                  <button class="btn-small btn-warning">Revoke Access</button>
                </div>
              </div>
              
              <div class="peer-item">
                <div class="peer-icon">🌐</div>
                <div class="peer-details">
                  <div class="peer-name">Remote SwissKnife Instance</div>
                  <div class="peer-id">12D3KooWRemote...</div>
                  <div class="peer-status offline">Offline</div>
                  <div class="peer-capabilities">
                    <span class="capability">Inference</span>
                    <span class="capability">Models</span>
                  </div>
                </div>
                <div class="peer-actions">
                  <button class="btn-small btn-primary" disabled>Connect</button>
                  <button class="btn-small btn-secondary">Share Resource</button>
                  <button class="btn-small btn-danger">Remove</button>
                </div>
              </div>
            </div>
          </div>
          
          <!-- UCAN Tokens Tab -->
          <div class="peer-tab-content" id="ucan">
            <div class="ucan-controls">
              <button class="btn-primary" id="create-ucan">🎫 Create UCAN Token</button>
              <button class="btn-secondary" id="import-ucan">📥 Import Token</button>
              <button class="btn-secondary" id="verify-ucan">✅ Verify Token</button>
            </div>
            
            <div class="ucan-list" id="ucan-list">
              <div class="ucan-item">
                <div class="ucan-header">
                  <div class="ucan-info">
                    <h4>Storage Access Token</h4>
                    <span class="ucan-audience">did:key:z6Mk...</span>
                    <span class="ucan-expires">Expires: 2024-12-31</span>
                  </div>
                  <div class="ucan-status valid">Valid</div>
                </div>
                <div class="ucan-capabilities">
                  <div class="capability-item">
                    <strong>Resource:</strong> ipfs://QmExample/
                    <br><strong>Actions:</strong> store/add, store/remove, store/list
                  </div>
                </div>
                <div class="ucan-actions">
                  <button class="btn-small btn-secondary">📋 Copy</button>
                  <button class="btn-small btn-secondary">📤 Share</button>
                  <button class="btn-small btn-danger">🗑️ Revoke</button>
                </div>
              </div>
              
              <div class="ucan-item">
                <div class="ucan-header">
                  <div class="ucan-info">
                    <h4>Model Inference Token</h4>
                    <span class="ucan-audience">did:key:z6Ml...</span>
                    <span class="ucan-expires">Expires: 2024-08-15</span>
                  </div>
                  <div class="ucan-status expiring">Expiring Soon</div>
                </div>
                <div class="ucan-capabilities">
                  <div class="capability-item">
                    <strong>Resource:</strong> inference://gpt-4
                    <br><strong>Actions:</strong> invoke, stream
                  </div>
                </div>
                <div class="ucan-actions">
                  <button class="btn-small btn-primary">🔄 Renew</button>
                  <button class="btn-small btn-secondary">📋 Copy</button>
                  <button class="btn-small btn-danger">🗑️ Revoke</button>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Shared Resources Tab -->
          <div class="peer-tab-content" id="resources">
            <div class="resource-controls">
              <button class="btn-primary" id="share-resource">📤 Share Resource</button>
              <button class="btn-secondary" id="request-access">📥 Request Access</button>
              <button class="btn-secondary" id="manage-permissions">� Manage Permissions</button>
            </div>
            
            <div class="resource-tabs">
              <button class="resource-tab active" data-type="shared-by-me">Shared by Me</button>
              <button class="resource-tab" data-type="shared-with-me">Shared with Me</button>
              <button class="resource-tab" data-type="public">Public Resources</button>
            </div>
            
            <div class="resource-list" id="resource-list">
              <div class="resource-item">
                <div class="resource-icon">💾</div>
                <div class="resource-details">
                  <div class="resource-name">Model Training Dataset</div>
                  <div class="resource-path">ipfs://QmDataset123...</div>
                  <div class="resource-size">2.3 GB</div>
                  <div class="resource-shared-with">
                    <span class="peer-badge">Alice (did:key:z6Mk...)</span>
                    <span class="peer-badge">Bob (did:key:z6Ml...)</span>
                  </div>
                </div>
                <div class="resource-actions">
                  <button class="btn-small btn-secondary">👁️ View Access</button>
                  <button class="btn-small btn-warning">🔒 Revoke</button>
                </div>
              </div>
              
              <div class="resource-item">
                <div class="resource-icon">🤖</div>
                <div class="resource-details">
                  <div class="resource-name">Fine-tuned Language Model</div>
                  <div class="resource-path">huggingface://my-org/custom-model</div>
                  <div class="resource-size">7.2 GB</div>
                  <div class="resource-shared-with">
                    <span class="peer-badge">Research Team (did:key:z6Mp...)</span>
                  </div>
                </div>
                <div class="resource-actions">
                  <button class="btn-small btn-secondary">👁️ View Access</button>
                  <button class="btn-small btn-warning">🔒 Revoke</button>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Capabilities Tab -->
          <div class="peer-tab-content" id="capabilities">
            <div class="capability-overview">
              <h3>My Capabilities</h3>
              <div class="my-capabilities">
                <div class="capability-card">
                  <h4>🗄️ Storage</h4>
                  <div class="capability-stats">
                    <div>Available: 500 GB</div>
                    <div>Shared: 150 GB</div>
                    <div>Peers: 5</div>
                  </div>
                  <button class="btn-small btn-secondary">Configure</button>
                </div>
                
                <div class="capability-card">
                  <h4>🧠 Inference</h4>
                  <div class="capability-stats">
                    <div>Models: 3</div>
                    <div>Queue: 2 jobs</div>
                    <div>Peers: 8</div>
                  </div>
                  <button class="btn-small btn-secondary">Configure</button>
                </div>
                
                <div class="capability-card">
                  <h4>📁 File Sharing</h4>
                  <div class="capability-stats">
                    <div>Files: 1,247</div>
                    <div>Bandwidth: 10 MB/s</div>
                    <div>Peers: 12</div>
                  </div>
                  <button class="btn-small btn-secondary">Configure</button>
                </div>
              </div>
            </div>
            
            <div class="peer-capabilities-section">
              <h3>Peer Capabilities</h3>
              <div class="peer-capability-list" id="peer-capability-list">
                <!-- Peer capabilities will be populated here -->
              </div>
            </div>
          </div>
          
          <!-- Settings Tab -->
          <div class="peer-tab-content" id="settings">
            <div class="settings-form">
              <div class="settings-section">
                <h3>🔐 Identity & Authentication</h3>
                <div class="form-group">
                  <label>My DID (Decentralized Identity)</label>
                  <div class="did-display">
                    <input type="text" value="did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp" readonly>
                    <button class="btn-small btn-secondary" id="copy-did">📋 Copy</button>
                    <button class="btn-small btn-warning" id="regenerate-did">🔄 Regenerate</button>
                  </div>
                </div>
                
                <div class="form-group">
                  <label>Default UCAN Expiration</label>
                  <select id="ucan-expiration">
                    <option value="1h">1 Hour</option>
                    <option value="1d">1 Day</option>
                    <option value="1w" selected>1 Week</option>
                    <option value="1m">1 Month</option>
                    <option value="1y">1 Year</option>
                  </select>
                </div>
              </div>
              
              <div class="settings-section">
                <h3>🌐 Network Configuration</h3>
                <div class="form-group">
                  <label>Discovery Method</label>
                  <select id="discovery-method">
                    <option value="dht">DHT Discovery</option>
                    <option value="mdns">mDNS (Local Network)</option>
                    <option value="bootstrap">Bootstrap Nodes</option>
                    <option value="rendezvous">Rendezvous Points</option>
                  </select>
                </div>
                
                <div class="form-group">
                  <label>Bootstrap Nodes</label>
                  <textarea id="bootstrap-nodes" rows="4" placeholder="Enter bootstrap node addresses...">/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZkMUPdLUxULy8G4LfHd82QmLkNm42e
/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa</textarea>
                </div>
                
                <div class="form-group">
                  <label>
                    <input type="checkbox" id="auto-accept-trusted"> Auto-accept connections from trusted peers
                  </label>
                </div>
                
                <div class="form-group">
                  <label>
                    <input type="checkbox" id="enable-relay"> Enable circuit relay
                  </label>
                </div>
              </div>
              
              <div class="settings-section">
                <h3>🤝 Resource Sharing</h3>
                <div class="form-group">
                  <label>Default Sharing Policy</label>
                  <select id="sharing-policy">
                    <option value="private">Private (Manual approval required)</option>
                    <option value="trusted">Trusted peers only</option>
                    <option value="public">Public (Anyone can request)</option>
                  </select>
                </div>
                
                <div class="form-group">
                  <label>Maximum Storage to Share (GB)</label>
                  <input type="number" id="max-storage" value="100" min="0" max="1000">
                </div>
                
                <div class="form-group">
                  <label>Maximum Bandwidth (MB/s)</label>
                  <input type="number" id="max-bandwidth" value="10" min="1" max="100">
                </div>
              </div>
              
              <div class="form-actions">
                <button class="btn-primary" id="save-peer-settings">Save Settings</button>
                <button class="btn-secondary" id="reset-peer-settings">Reset to Defaults</button>
                <button class="btn-warning" id="clear-all-data">Clear All Data</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  setupEventListeners(containerElement) {
    // Tab switching for main tabs
    const tabs = containerElement.querySelectorAll('.peer-tab');
    const tabContents = containerElement.querySelectorAll('.peer-tab-content');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        
        // Update active tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update active content
        tabContents.forEach(content => content.classList.remove('active'));
        const targetContent = containerElement.querySelector(`#${tabName}`);
        if (targetContent) targetContent.classList.add('active');
      });
    });

    // Resource tabs switching
    const resourceTabs = containerElement.querySelectorAll('.resource-tab');
    resourceTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabType = tab.dataset.type;
        
        resourceTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        this.filterResources(containerElement, tabType);
      });
    });

    // Peer controls
    const discoverBtn = containerElement.querySelector('#discover-peers');
    if (discoverBtn) {
      discoverBtn.addEventListener('click', () => this.discoverPeers(containerElement));
    }

    const addPeerBtn = containerElement.querySelector('#add-peer-manual');
    if (addPeerBtn) {
      addPeerBtn.addEventListener('click', () => this.showAddPeerDialog(containerElement));
    }

    const exportPeerBtn = containerElement.querySelector('#export-peer-list');
    if (exportPeerBtn) {
      exportPeerBtn.addEventListener('click', () => this.exportPeerList());
    }

    // UCAN controls
    const createUCANBtn = containerElement.querySelector('#create-ucan');
    if (createUCANBtn) {
      createUCANBtn.addEventListener('click', () => this.showCreateUCANDialog(containerElement));
    }

    const importUCANBtn = containerElement.querySelector('#import-ucan');
    if (importUCANBtn) {
      importUCANBtn.addEventListener('click', () => this.importUCANToken());
    }

    const verifyUCANBtn = containerElement.querySelector('#verify-ucan');
    if (verifyUCANBtn) {
      verifyUCANBtn.addEventListener('click', () => this.showVerifyUCANDialog(containerElement));
    }

    // Resource controls
    const shareResourceBtn = containerElement.querySelector('#share-resource');
    if (shareResourceBtn) {
      shareResourceBtn.addEventListener('click', () => this.showShareResourceDialog(containerElement));
    }

    const requestAccessBtn = containerElement.querySelector('#request-access');
    if (requestAccessBtn) {
      requestAccessBtn.addEventListener('click', () => this.showRequestAccessDialog(containerElement));
    }

    const managePermissionsBtn = containerElement.querySelector('#manage-permissions');
    if (managePermissionsBtn) {
      managePermissionsBtn.addEventListener('click', () => this.showPermissionsDialog(containerElement));
    }

    // Settings controls
    const copyDIDBtn = containerElement.querySelector('#copy-did');
    if (copyDIDBtn) {
      copyDIDBtn.addEventListener('click', () => this.copyDID());
    }

    const regenerateDIDBtn = containerElement.querySelector('#regenerate-did');
    if (regenerateDIDBtn) {
      regenerateDIDBtn.addEventListener('click', () => this.regenerateDID(containerElement));
    }

    const saveBtn = containerElement.querySelector('#save-peer-settings');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.savePeerSettings(containerElement));
    }

    const resetBtn = containerElement.querySelector('#reset-peer-settings');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetPeerSettings(containerElement));
    }

    const clearDataBtn = containerElement.querySelector('#clear-all-data');
    if (clearDataBtn) {
      clearDataBtn.addEventListener('click', () => this.clearAllData(containerElement));
    }

    // Dynamic buttons (will be added via event delegation)
    containerElement.addEventListener('click', (e) => {
      if (e.target.matches('.peer-actions .btn-primary')) {
        const peerItem = e.target.closest('.peer-item');
        const peerId = peerItem.querySelector('.peer-id').textContent;
        this.connectToPeer(peerId);
      }
      
      if (e.target.matches('.peer-actions .btn-secondary') && e.target.textContent.includes('Share')) {
        const peerItem = e.target.closest('.peer-item');
        const peerId = peerItem.querySelector('.peer-id').textContent;
        this.shareResourceWithPeer(containerElement, peerId);
      }
      
      if (e.target.matches('.ucan-actions .btn-secondary') && e.target.textContent.includes('Copy')) {
        const ucanItem = e.target.closest('.ucan-item');
        this.copyUCANToken(ucanItem);
      }
      
      if (e.target.matches('.ucan-actions .btn-secondary') && e.target.textContent.includes('Share')) {
        const ucanItem = e.target.closest('.ucan-item');
        this.shareUCANToken(containerElement, ucanItem);
      }
    });
  }

  async loadPeers() {
    try {
      const stored = localStorage.getItem('swissknife-peers');
      if (stored) {
        this.peers = JSON.parse(stored);
      }
      
      const trustedStored = localStorage.getItem('swissknife-trusted-peers');
      if (trustedStored) {
        this.trustedPeers = new Set(JSON.parse(trustedStored));
      }
      
      const capabilitiesStored = localStorage.getItem('swissknife-peer-capabilities');
      if (capabilitiesStored) {
        this.peerCapabilities = new Map(JSON.parse(capabilitiesStored));
      }
    } catch (error) {
      console.error('Error loading peers:', error);
    }
  }

  async loadUCANTokens() {
    try {
      const stored = localStorage.getItem('swissknife-ucan-tokens');
      if (stored) {
        this.ucanTokens = new Map(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading UCAN tokens:', error);
    }
  }

  async loadSharedResources() {
    try {
      const stored = localStorage.getItem('swissknife-shared-resources');
      if (stored) {
        this.sharedResources = new Map(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading shared resources:', error);
    }
  }

  async loadTrustedPeers() {
    try {
      const stored = localStorage.getItem('swissknife-trusted-peers');
      if (stored) {
        this.trustedPeers = new Set(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading trusted peers:', error);
    }
  }

  // UCAN Token Management
  async showCreateUCANDialog(containerElement) {
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    dialog.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>🎫 Create UCAN Token</h3>
          <button class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <form id="create-ucan-form">
            <div class="form-group">
              <label for="ucan-audience">Audience (DID):</label>
              <input type="text" id="ucan-audience" placeholder="did:key:z6Mk..." required>
            </div>
            <div class="form-group">
              <label for="ucan-resource">Resource URI:</label>
              <input type="text" id="ucan-resource" placeholder="ipfs://Qm... or storage://bucket" required>
            </div>
            <div class="form-group">
              <label for="ucan-actions">Capabilities (comma-separated):</label>
              <input type="text" id="ucan-actions" placeholder="store/add, store/remove, store/list" required>
            </div>
            <div class="form-group">
              <label for="ucan-expiration">Expires:</label>
              <select id="ucan-expiration">
                <option value="1h">1 Hour</option>
                <option value="1d">1 Day</option>
                <option value="1w" selected>1 Week</option>
                <option value="1m">1 Month</option>
                <option value="1y">1 Year</option>
              </select>
            </div>
            <div class="form-group">
              <label for="ucan-description">Description:</label>
              <input type="text" id="ucan-description" placeholder="Optional description">
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button id="create-ucan-confirm" class="btn-primary">Create Token</button>
          <button class="modal-close btn-secondary">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Event listeners
    dialog.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => dialog.remove());
    });

    dialog.querySelector('#create-ucan-confirm').addEventListener('click', async () => {
      await this.createUCANToken(dialog);
      dialog.remove();
    });
  }

  async createUCANToken(dialog) {
    const audience = dialog.querySelector('#ucan-audience').value;
    const resource = dialog.querySelector('#ucan-resource').value;
    const actions = dialog.querySelector('#ucan-actions').value.split(',').map(a => a.trim());
    const expiration = dialog.querySelector('#ucan-expiration').value;
    const description = dialog.querySelector('#ucan-description').value;

    try {
      // Generate a mock UCAN token (in real implementation, use actual UCAN library)
      const tokenId = `ucan_${Date.now()}`;
      const expirationDate = this.calculateExpiration(expiration);
      
      const ucanToken = {
        id: tokenId,
        audience,
        resource,
        actions,
        expiration: expirationDate,
        description,
        created: new Date().toISOString(),
        issuer: this.getMyDID(),
        token: this.generateMockUCANToken(audience, resource, actions, expirationDate)
      };

      this.ucanTokens.set(tokenId, ucanToken);
      await this.saveUCANTokens();

      this.showNotification('UCAN token created successfully! 🎫', 'success');
    } catch (error) {
      console.error('Error creating UCAN token:', error);
      this.showNotification('Failed to create UCAN token', 'error');
    }
  }

  async importUCANToken() {
    const token = prompt('Enter UCAN token:');
    if (!token) return;

    try {
      // Validate and parse token (mock implementation)
      const parsed = this.parseUCANToken(token);
      
      const tokenId = `imported_${Date.now()}`;
      this.ucanTokens.set(tokenId, {
        id: tokenId,
        ...parsed,
        imported: true,
        created: new Date().toISOString()
      });

      await this.saveUCANTokens();
      this.showNotification('UCAN token imported successfully! 📥', 'success');
    } catch (error) {
      console.error('Error importing UCAN token:', error);
      this.showNotification('Invalid UCAN token format', 'error');
    }
  }

  // Resource Sharing
  async showShareResourceDialog(containerElement) {
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    dialog.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>📤 Share Resource</h3>
          <button class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <form id="share-resource-form">
            <div class="form-group">
              <label for="resource-type">Resource Type:</label>
              <select id="resource-type">
                <option value="file">File</option>
                <option value="directory">Directory</option>
                <option value="model">ML Model</option>
                <option value="dataset">Dataset</option>
                <option value="storage">Storage Bucket</option>
                <option value="inference">Inference Endpoint</option>
              </select>
            </div>
            <div class="form-group">
              <label for="resource-uri">Resource URI:</label>
              <input type="text" id="resource-uri" placeholder="ipfs://Qm... or file:///path" required>
            </div>
            <div class="form-group">
              <label for="share-with">Share with (DIDs):</label>
              <textarea id="share-with" rows="3" placeholder="did:key:z6Mk...&#10;did:key:z6Ml..."></textarea>
            </div>
            <div class="form-group">
              <label for="permissions">Permissions:</label>
              <div class="checkbox-group">
                <label><input type="checkbox" value="read" checked> Read</label>
                <label><input type="checkbox" value="write"> Write</label>
                <label><input type="checkbox" value="delete"> Delete</label>
                <label><input type="checkbox" value="share"> Re-share</label>
              </div>
            </div>
            <div class="form-group">
              <label for="share-expiration">Access Expires:</label>
              <select id="share-expiration">
                <option value="1d">1 Day</option>
                <option value="1w" selected>1 Week</option>
                <option value="1m">1 Month</option>
                <option value="3m">3 Months</option>
                <option value="1y">1 Year</option>
                <option value="never">Never</option>
              </select>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button id="share-resource-confirm" class="btn-primary">Share Resource</button>
          <button class="modal-close btn-secondary">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    dialog.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => dialog.remove());
    });

    dialog.querySelector('#share-resource-confirm').addEventListener('click', async () => {
      await this.shareResource(dialog);
      dialog.remove();
    });
  }

  async shareResource(dialog) {
    const resourceType = dialog.querySelector('#resource-type').value;
    const resourceUri = dialog.querySelector('#resource-uri').value;
    const shareWith = dialog.querySelector('#share-with').value.split('\n').filter(did => did.trim());
    const permissions = Array.from(dialog.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    const expiration = dialog.querySelector('#share-expiration').value;

    try {
      const resourceId = `resource_${Date.now()}`;
      const expirationDate = expiration === 'never' ? null : this.calculateExpiration(expiration);

      const sharedResource = {
        id: resourceId,
        type: resourceType,
        uri: resourceUri,
        sharedWith: shareWith,
        permissions,
        expiration: expirationDate,
        owner: this.getMyDID(),
        created: new Date().toISOString()
      };

      this.sharedResources.set(resourceId, sharedResource);
      await this.saveSharedResources();

      // Create UCAN tokens for each recipient
      for (const recipient of shareWith) {
        await this.createResourceUCANToken(recipient, resourceUri, permissions, expirationDate);
      }

      this.showNotification(`Resource shared with ${shareWith.length} peer(s)! 📤`, 'success');
    } catch (error) {
      console.error('Error sharing resource:', error);
      this.showNotification('Failed to share resource', 'error');
    }
  }

  async createResourceUCANToken(audience, resource, actions, expiration) {
    const tokenId = `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const ucanToken = {
      id: tokenId,
      audience,
      resource,
      actions: actions.map(a => `resource/${a}`),
      expiration,
      description: `Auto-generated for resource sharing`,
      created: new Date().toISOString(),
      issuer: this.getMyDID(),
      token: this.generateMockUCANToken(audience, resource, actions, expiration),
      autoGenerated: true
    };

    this.ucanTokens.set(tokenId, ucanToken);
    await this.saveUCANTokens();
  }

  // Peer Discovery and Management
  async discoverPeers(containerElement) {
    this.showNotification('Discovering peers... 🔍', 'info');
    
    try {
      // Mock peer discovery (in real implementation, use libp2p)
      const mockPeers = [
        {
          id: `12D3KooW${Math.random().toString(36).substr(2, 20)}`,
          name: 'SwissKnife Node Alpha',
          status: 'online',
          capabilities: ['storage', 'inference', 'files'],
          address: '/ip4/192.168.1.100/tcp/4001',
          protocols: ['/swissknife/1.0.0', '/ipfs/bitswap/1.2.0']
        },
        {
          id: `12D3KooW${Math.random().toString(36).substr(2, 20)}`,
          name: 'AI Research Hub',
          status: 'online',
          capabilities: ['inference', 'models', 'training'],
          address: '/ip4/203.0.113.15/tcp/4001',
          protocols: ['/swissknife/1.0.0', '/ml-inference/1.0.0']
        }
      ];

      for (const peer of mockPeers) {
        this.peers.push(peer);
        this.peerCapabilities.set(peer.id, peer.capabilities);
      }

      await this.savePeers();
      this.populatePeerList(containerElement);
      
      this.showNotification(`Discovered ${mockPeers.length} new peers! 🎉`, 'success');
    } catch (error) {
      console.error('Error discovering peers:', error);
      this.showNotification('Peer discovery failed', 'error');
    }
  }

  populatePeerList(containerElement) {
    const peerList = containerElement.querySelector('#peer-list');
    if (!peerList) return;

    peerList.innerHTML = this.peers.map(peer => `
      <div class="peer-item ${this.trustedPeers.has(peer.id) ? 'trusted' : ''}">
        <div class="peer-icon">${peer.status === 'online' ? '🟢' : '🔴'}</div>
        <div class="peer-details">
          <div class="peer-name">${peer.name}</div>
          <div class="peer-id">${peer.id}</div>
          <div class="peer-status ${peer.status}">${peer.status}</div>
          <div class="peer-capabilities">
            ${(peer.capabilities || []).map(cap => `<span class="capability">${cap}</span>`).join('')}
          </div>
        </div>
        <div class="peer-actions">
          <button class="btn-small btn-primary" ${peer.status !== 'online' ? 'disabled' : ''}>Connect</button>
          <button class="btn-small btn-secondary">Share Resource</button>
          <button class="btn-small ${this.trustedPeers.has(peer.id) ? 'btn-warning' : 'btn-success'}" onclick="peerManagerApp.toggleTrust('${peer.id}')">
            ${this.trustedPeers.has(peer.id) ? 'Untrust' : 'Trust'}
          </button>
        </div>
      </div>
    `).join('');
  }

  // Utility methods
  calculateExpiration(duration) {
    const now = new Date();
    const multipliers = {
      '1h': 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000,
      '1m': 30 * 24 * 60 * 60 * 1000,
      '3m': 90 * 24 * 60 * 60 * 1000,
      '1y': 365 * 24 * 60 * 60 * 1000
    };
    
    return new Date(now.getTime() + (multipliers[duration] || multipliers['1w']));
  }

  generateMockUCANToken(audience, resource, actions, expiration) {
    // This is a mock implementation - real UCAN tokens would use proper cryptographic signatures
    const header = { alg: 'EdDSA', typ: 'JWT' };
    const payload = {
      iss: this.getMyDID(),
      aud: audience,
      att: [{
        can: actions,
        with: resource
      }],
      exp: expiration ? Math.floor(expiration.getTime() / 1000) : null
    };
    
    return `mock.${btoa(JSON.stringify(header))}.${btoa(JSON.stringify(payload))}.signature`;
  }

  parseUCANToken(token) {
    try {
      const parts = token.split('.');
      if (parts.length < 3) throw new Error('Invalid token format');
      
      const payload = JSON.parse(atob(parts[2]));
      return {
        audience: payload.aud,
        resource: payload.att[0]?.with,
        actions: payload.att[0]?.can || [],
        expiration: payload.exp ? new Date(payload.exp * 1000) : null,
        issuer: payload.iss,
        token
      };
    } catch (error) {
      throw new Error('Invalid UCAN token format');
    }
  }

  getMyDID() {
    let did = localStorage.getItem('swissknife-my-did');
    if (!did) {
      // Generate a mock DID
      did = `did:key:z6Mk${Math.random().toString(36).substr(2, 20)}`;
      localStorage.setItem('swissknife-my-did', did);
    }
    return did;
  }

  async copyDID() {
    const did = this.getMyDID();
    try {
      await navigator.clipboard.writeText(did);
      this.showNotification('DID copied to clipboard! 📋', 'success');
    } catch (error) {
      console.error('Failed to copy DID:', error);
    }
  }

  async regenerateDID(containerElement) {
    if (confirm('Are you sure you want to regenerate your DID? This will invalidate all existing UCAN tokens and shared resources.')) {
      localStorage.removeItem('swissknife-my-did');
      const newDID = this.getMyDID();
      
      // Update the display
      const didInput = containerElement.querySelector('input[value*="did:key:"]');
      if (didInput) {
        didInput.value = newDID;
      }
      
      this.showNotification('DID regenerated! ⚠️ Update your peers with the new DID.', 'warning');
    }
  }

  toggleTrust(peerId) {
    if (this.trustedPeers.has(peerId)) {
      this.trustedPeers.delete(peerId);
      this.showNotification('Peer removed from trusted list', 'info');
    } else {
      this.trustedPeers.add(peerId);
      this.showNotification('Peer added to trusted list! ✅', 'success');
    }
    
    this.saveTrustedPeers();
  }

  // Storage methods
  async savePeers() {
    localStorage.setItem('swissknife-peers', JSON.stringify(this.peers));
    localStorage.setItem('swissknife-peer-capabilities', JSON.stringify([...this.peerCapabilities.entries()]));
  }

  async saveUCANTokens() {
    localStorage.setItem('swissknife-ucan-tokens', JSON.stringify([...this.ucanTokens.entries()]));
  }

  async saveSharedResources() {
    localStorage.setItem('swissknife-shared-resources', JSON.stringify([...this.sharedResources.entries()]));
  }

  async saveTrustedPeers() {
    localStorage.setItem('swissknife-trusted-peers', JSON.stringify([...this.trustedPeers]));
  }

  showNotification(message, type = 'info') {
    if (this.desktop.showNotification) {
      this.desktop.showNotification(message, type);
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }

  connectToPeer(peerId) {
    console.log(`Attempting to connect to peer: ${peerId}`);
    
    const peer = this.peers.find(p => p.id === peerId);
    if (!peer) {
      this.showNotification('Peer not found', 'error');
      return;
    }

    // Mock connection (in real implementation, use libp2p)
    this.showNotification(`Connecting to ${peer.name}...`, 'info');
    
    setTimeout(() => {
      const success = Math.random() > 0.3; // 70% success rate
      if (success) {
        peer.status = 'connected';
        this.showNotification(`Connected to ${peer.name}! 🔗`, 'success');
      } else {
        this.showNotification(`Failed to connect to ${peer.name}`, 'error');
      }
    }, 2000);
  }

  async savePeerSettings(containerElement) {
    const discoveryMethod = containerElement.querySelector('#discovery-method').value;
    const bootstrapNodes = containerElement.querySelector('#bootstrap-nodes').value;
    const autoAcceptTrusted = containerElement.querySelector('#auto-accept-trusted').checked;
    const enableRelay = containerElement.querySelector('#enable-relay').checked;
    const ucanExpiration = containerElement.querySelector('#ucan-expiration').value;
    const sharingPolicy = containerElement.querySelector('#sharing-policy').value;
    const maxStorage = containerElement.querySelector('#max-storage').value;
    const maxBandwidth = containerElement.querySelector('#max-bandwidth').value;

    const settings = {
      discoveryMethod,
      bootstrapNodes: bootstrapNodes.split('\n').filter(node => node.trim()),
      autoAcceptTrusted,
      enableRelay,
      ucanExpiration,
      sharingPolicy,
      maxStorage: parseInt(maxStorage),
      maxBandwidth: parseInt(maxBandwidth)
    };

    localStorage.setItem('swissknife-peer-settings', JSON.stringify(settings));
    console.log('Peer settings saved:', settings);
    
    this.showNotification('Peer settings saved successfully! 🔗', 'success');
  }

  async resetPeerSettings(containerElement) {
    containerElement.querySelector('#discovery-method').value = 'dht';
    containerElement.querySelector('#bootstrap-nodes').value = '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZkMUPdLUxULy8G4LfHd82QmLkNm42e\n/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa';
    containerElement.querySelector('#auto-accept-trusted').checked = false;
    containerElement.querySelector('#enable-relay').checked = false;
    containerElement.querySelector('#ucan-expiration').value = '1w';
    containerElement.querySelector('#sharing-policy').value = 'private';
    containerElement.querySelector('#max-storage').value = '100';
    containerElement.querySelector('#max-bandwidth').value = '10';

    localStorage.removeItem('swissknife-peer-settings');
    this.showNotification('Peer settings reset to defaults', 'info');
  }

  async clearAllData(containerElement) {
    if (confirm('Are you sure you want to clear all peer data? This action cannot be undone.')) {
      localStorage.removeItem('swissknife-peers');
      localStorage.removeItem('swissknife-ucan-tokens');
      localStorage.removeItem('swissknife-shared-resources');
      localStorage.removeItem('swissknife-trusted-peers');
      localStorage.removeItem('swissknife-peer-capabilities');
      localStorage.removeItem('swissknife-my-did');
      
      this.peers = [];
      this.ucanTokens.clear();
      this.sharedResources.clear();
      this.trustedPeers.clear();
      this.peerCapabilities.clear();
      
      this.showNotification('All peer data cleared! 🗑️', 'warning');
    }
  }

  showAddPeerDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'peer-dialog-overlay';
    dialog.innerHTML = `
      <div class="peer-dialog">
        <div class="dialog-header">
          <h3>Add New Peer</h3>
          <button class="dialog-close" onclick="this.closest('.peer-dialog-overlay').remove()">×</button>
        </div>
        <div class="dialog-content">
          <div class="form-group">
            <label>Peer ID or Multiaddr:</label>
            <input type="text" id="new-peer-id" placeholder="12D3KooW... or /ip4/..." style="width: 100%; margin-top: 5px;">
          </div>
          <div class="form-group">
            <label>Connection Method:</label>
            <select id="connection-method" style="width: 100%; margin-top: 5px;">
              <option value="direct">Direct Connection</option>
              <option value="relay">Through Relay</option>
              <option value="discovery">Auto Discovery</option>
            </select>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="add-as-trusted"> Add as trusted peer
            </label>
          </div>
        </div>
        <div class="dialog-actions">
          <button onclick="this.closest('.peer-dialog-overlay').remove()" class="btn-secondary">Cancel</button>
          <button onclick="window.peerManagerApp.addPeerFromDialog()" class="btn-primary">Add Peer</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
  }

  async addPeerFromDialog() {
    const peerId = document.getElementById('new-peer-id').value.trim();
    const connectionMethod = document.getElementById('connection-method').value;
    const addAsTrusted = document.getElementById('add-as-trusted').checked;
    
    if (!peerId) {
      this.showNotification('Please enter a valid peer ID or multiaddr', 'error');
      return;
    }
    
    try {
      // Extract peer ID if it's a multiaddr
      let cleanPeerId = peerId;
      if (peerId.includes('/p2p/')) {
        cleanPeerId = peerId.split('/p2p/')[1];
      } else if (peerId.includes('/ipfs/')) {
        cleanPeerId = peerId.split('/ipfs/')[1];
      }
      
      // Add to peers list
      const newPeer = {
        peerId: cleanPeerId,
        multiaddr: peerId.startsWith('/') ? peerId : null,
        connectionMethod,
        status: 'connecting',
        lastSeen: new Date().toISOString(),
        capabilities: [],
        trust: addAsTrusted ? 'trusted' : 'unknown'
      };
      
      this.peers.push(newPeer);
      
      if (addAsTrusted) {
        this.trustedPeers.add(cleanPeerId);
        localStorage.setItem('swissknife-trusted-peers', JSON.stringify([...this.trustedPeers]));
      }
      
      localStorage.setItem('swissknife-peers', JSON.stringify(this.peers));
      
      // Close dialog
      document.querySelector('.peer-dialog-overlay').remove();
      
      // Attempt connection
      await this.connectToPeer(cleanPeerId);
      
      this.showNotification(`Peer ${cleanPeerId.substring(0, 12)}... added successfully!`, 'success');
      
    } catch (error) {
      console.error('Error adding peer:', error);
      this.showNotification('Failed to add peer: ' + error.message, 'error');
    }
  }

  shareResourceWithPeer(peerId) {
    const dialog = document.createElement('div');
    dialog.className = 'peer-dialog-overlay';
    dialog.innerHTML = `
      <div class="peer-dialog">
        <div class="dialog-header">
          <h3>Share Resource with Peer</h3>
          <button class="dialog-close" onclick="this.closest('.peer-dialog-overlay').remove()">×</button>
        </div>
        <div class="dialog-content">
          <div class="form-group">
            <label>Resource Type:</label>
            <select id="resource-type" style="width: 100%; margin-top: 5px;">
              <option value="file">File/Document</option>
              <option value="data">Data Set</option>
              <option value="service">Service Access</option>
              <option value="model">AI Model</option>
              <option value="api">API Endpoint</option>
            </select>
          </div>
          <div class="form-group">
            <label>Resource Identifier:</label>
            <input type="text" id="resource-id" placeholder="File path, IPFS hash, or identifier" style="width: 100%; margin-top: 5px;">
          </div>
          <div class="form-group">
            <label>Access Level:</label>
            <select id="access-level" style="width: 100%; margin-top: 5px;">
              <option value="read">Read Only</option>
              <option value="write">Read/Write</option>
              <option value="execute">Execute</option>
              <option value="admin">Full Access</option>
            </select>
          </div>
          <div class="form-group">
            <label>Expiration:</label>
            <select id="resource-expiration" style="width: 100%; margin-top: 5px;">
              <option value="1h">1 Hour</option>
              <option value="1d">1 Day</option>
              <option value="1w">1 Week</option>
              <option value="1m">1 Month</option>
              <option value="never">Never</option>
            </select>
          </div>
        </div>
        <div class="dialog-actions">
          <button onclick="this.closest('.peer-dialog-overlay').remove()" class="btn-secondary">Cancel</button>
          <button onclick="window.peerManagerApp.createResourceShare('${peerId}')" class="btn-primary">Share Resource</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
  }

  async createResourceShare(peerId) {
    const resourceType = document.getElementById('resource-type').value;
    const resourceId = document.getElementById('resource-id').value.trim();
    const accessLevel = document.getElementById('access-level').value;
    const expiration = document.getElementById('resource-expiration').value;
    
    if (!resourceId) {
      this.showNotification('Please enter a resource identifier', 'error');
      return;
    }
    
    try {
      // Create UCAN token for the resource
      const token = await this.createUCANToken(peerId, {
        resource: resourceId,
        type: resourceType,
        access: accessLevel,
        expiration
      });
      
      // Store the shared resource
      const resourceShare = {
        id: `share_${Date.now()}`,
        peerId,
        resourceType,
        resourceId,
        accessLevel,
        expiration,
        token,
        createdAt: new Date().toISOString(),
        status: 'active'
      };
      
      this.sharedResources.set(resourceShare.id, resourceShare);
      localStorage.setItem('swissknife-shared-resources', JSON.stringify([...this.sharedResources.entries()]));
      
      // Close dialog
      document.querySelector('.peer-dialog-overlay').remove();
      
      this.showNotification(`Resource shared with ${peerId.substring(0, 12)}... successfully!`, 'success');
      
    } catch (error) {
      console.error('Error sharing resource:', error);
      this.showNotification('Failed to share resource: ' + error.message, 'error');
    }
  }

  showRequestAccessDialog(peerId) {
    const dialog = document.createElement('div');
    dialog.className = 'peer-dialog-overlay';
    dialog.innerHTML = `
      <div class="peer-dialog">
        <div class="dialog-header">
          <h3>Request Access from Peer</h3>
          <button class="dialog-close" onclick="this.closest('.peer-dialog-overlay').remove()">×</button>
        </div>
        <div class="dialog-content">
          <div class="form-group">
            <label>Access Type:</label>
            <select id="access-type" style="width: 100%; margin-top: 5px;">
              <option value="storage">Storage Space</option>
              <option value="bandwidth">Bandwidth</option>
              <option value="compute">Compute Resources</option>
              <option value="data">Data Access</option>
              <option value="service">Service Access</option>
            </select>
          </div>
          <div class="form-group">
            <label>Resource Details:</label>
            <textarea id="access-details" placeholder="Describe what you need access to..." style="width: 100%; margin-top: 5px; min-height: 60px;"></textarea>
          </div>
          <div class="form-group">
            <label>Duration Needed:</label>
            <select id="access-duration" style="width: 100%; margin-top: 5px;">
              <option value="1h">1 Hour</option>
              <option value="1d">1 Day</option>
              <option value="1w">1 Week</option>
              <option value="1m">1 Month</option>
              <option value="ongoing">Ongoing</option>
            </select>
          </div>
        </div>
        <div class="dialog-actions">
          <button onclick="this.closest('.peer-dialog-overlay').remove()" class="btn-secondary">Cancel</button>
          <button onclick="window.peerManagerApp.sendAccessRequest('${peerId}')" class="btn-primary">Send Request</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
  }

  async sendAccessRequest(peerId) {
    const accessType = document.getElementById('access-type').value;
    const accessDetails = document.getElementById('access-details').value.trim();
    const accessDuration = document.getElementById('access-duration').value;
    
    if (!accessDetails) {
      this.showNotification('Please describe what access you need', 'error');
      return;
    }
    
    try {
      const accessRequest = {
        id: `request_${Date.now()}`,
        targetPeerId: peerId,
        fromPeerId: this.myDID,
        accessType,
        details: accessDetails,
        duration: accessDuration,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      
      // Store the request
      let pendingRequests = JSON.parse(localStorage.getItem('swissknife-access-requests') || '[]');
      pendingRequests.push(accessRequest);
      localStorage.setItem('swissknife-access-requests', JSON.stringify(pendingRequests));
      
      // Close dialog
      document.querySelector('.peer-dialog-overlay').remove();
      
      this.showNotification(`Access request sent to ${peerId.substring(0, 12)}...`, 'success');
      
    } catch (error) {
      console.error('Error sending access request:', error);
      this.showNotification('Failed to send access request: ' + error.message, 'error');
    }
  }

  toggleTrust(peerId) {
    try {
      if (this.trustedPeers.has(peerId)) {
        this.trustedPeers.delete(peerId);
        this.showNotification(`Removed ${peerId.substring(0, 12)}... from trusted peers`, 'info');
      } else {
        this.trustedPeers.add(peerId);
        this.showNotification(`Added ${peerId.substring(0, 12)}... to trusted peers`, 'success');
      }
      
      // Update localStorage
      localStorage.setItem('swissknife-trusted-peers', JSON.stringify([...this.trustedPeers]));
      
      // Update peer status in the peers list
      const peer = this.peers.find(p => p.peerId === peerId);
      if (peer) {
        peer.trust = this.trustedPeers.has(peerId) ? 'trusted' : 'unknown';
        localStorage.setItem('swissknife-peers', JSON.stringify(this.peers));
      }
      
    } catch (error) {
      console.error('Error toggling trust:', error);
      this.showNotification('Failed to update trust status', 'error');
    }
  }
}

// Make it available globally for the desktop to load
if (typeof window !== 'undefined') {
  window.PeerManagerApp = PeerManagerApp;
  // Create global instance for easy access
  window.peerManagerApp = null;
}

export default PeerManagerApp;
