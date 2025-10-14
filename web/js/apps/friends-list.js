/**
 * Friends List & Identity Linking App for SwissKnife Web Desktop
 * IPLD-based decentralized identity management with cross-platform linking
 * Links accounts across GitHub, libp2p, Hugging Face, and other platforms
 */

export class FriendsListApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    
    // Core state
    this.isInitialized = false;
    this.currentUser = null;
    this.friends = new Map();
    this.identityLinks = new Map();
    this.pendingInvites = new Map();
    
    // IPLD and P2P integration
    this.ipfsNode = null;
    this.libp2pNode = null;
    this.identityDID = null;
    
    // Platform integrations
    this.platformConnections = new Map();
    this.supportedPlatforms = [
      {
        id: 'github',
        name: 'GitHub',
        icon: '🐙',
        color: '#24292e',
        apiEndpoint: 'https://api.github.com',
        oauthUrl: 'https://github.com/login/oauth/authorize',
        fields: ['username', 'profile_url', 'avatar_url', 'bio', 'public_repos']
      },
      {
        id: 'huggingface',
        name: 'Hugging Face',
        icon: '🤗',
        color: '#ff6b35',
        apiEndpoint: 'https://huggingface.co/api',
        oauthUrl: 'https://huggingface.co/oauth/authorize',
        fields: ['username', 'profile_url', 'avatar_url', 'models', 'datasets']
      },
      {
        id: 'libp2p',
        name: 'libp2p Network',
        icon: '🔗',
        color: '#6366f1',
        apiEndpoint: null,
        fields: ['peer_id', 'multiaddrs', 'protocols', 'connected_peers']
      },
      {
        id: 'ipfs',
        name: 'IPFS',
        icon: '🌐',
        color: '#65c3c8',
        apiEndpoint: null,
        fields: ['peer_id', 'node_id', 'pinned_content', 'bandwidth_stats']
      },
      {
        id: 'twitter',
        name: 'Twitter/X',
        icon: '🐦',
        color: '#1d9bf0',
        apiEndpoint: 'https://api.twitter.com/2',
        oauthUrl: 'https://twitter.com/i/oauth2/authorize',
        fields: ['username', 'profile_url', 'avatar_url', 'bio', 'followers_count']
      },
      {
        id: 'discord',
        name: 'Discord',
        icon: '💬',
        color: '#5865f2',
        apiEndpoint: 'https://discord.com/api/v10',
        oauthUrl: 'https://discord.com/api/oauth2/authorize',
        fields: ['username', 'discriminator', 'avatar_url', 'guilds']
      }
    ];
    
    // Initialize sample data
    this.initializeSampleData();
  }
  
  initializeSampleData() {
    // Sample friends data
    this.friends.set('alice-did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK', {
      id: 'alice-did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      name: 'Alice Cooper',
      avatar: '/assets/avatars/alice.png',
      status: 'online',
      lastSeen: new Date(),
      identities: {
        github: { username: 'alice-dev', verified: true },
        huggingface: { username: 'alice-ml', verified: true },
        libp2p: { peer_id: '12D3KooWGRUVh1fJ2h1fJ2h1fJ2h1fJ2h1fJ2h1fJ2h1fJ2h1fJ', connected: true }
      },
      tags: ['developer', 'ai-researcher', 'p2p-enthusiast'],
      mutualFriends: 5,
      addedDate: new Date('2025-08-15')
    });
    
    this.friends.set('bob-did:key:z6MkfrQqJ9r8u2PyR5qDgJ9r8u2PyR5qDgJ9r8u2PyR5qDgJ9', {
      id: 'bob-did:key:z6MkfrQqJ9r8u2PyR5qDgJ9r8u2PyR5qDgJ9r8u2PyR5qDgJ9',
      name: 'Bob Wilson',
      avatar: '/assets/avatars/bob.png',
      status: 'away',
      lastSeen: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      identities: {
        github: { username: 'bob-blockchain', verified: true },
        twitter: { username: 'bob_crypto', verified: false },
        ipfs: { peer_id: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG', online: true }
      },
      tags: ['blockchain', 'web3', 'ipfs'],
      mutualFriends: 3,
      addedDate: new Date('2025-09-01')
    });
    
    this.friends.set('charlie-did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH', {
      id: 'charlie-did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
      name: 'Charlie Data',
      avatar: '/assets/avatars/charlie.png',
      status: 'offline',
      lastSeen: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      identities: {
        huggingface: { username: 'charlie-transformers', verified: true },
        discord: { username: 'CharlieAI#1234', verified: true },
        github: { username: 'charlie-ml', verified: false }
      },
      tags: ['machine-learning', 'nlp', 'data-science'],
      mutualFriends: 8,
      addedDate: new Date('2025-07-22')
    });
    
    // Sample pending invites
    this.pendingInvites.set('invite-1', {
      id: 'invite-1',
      from: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      name: 'Eva Martinez',
      avatar: '/assets/avatars/eva.png',
      message: 'Hey! Found you through the SwissKnife P2P network. Want to connect?',
      platforms: ['github', 'huggingface'],
      timestamp: new Date(Date.now() - 10 * 60 * 1000),
      mutualFriends: 2
    });
  }
  
  async initialize() {
    if (this.isInitialized) return;
    
    try {
      // Get SwissKnife reference
      if (this.desktop && this.desktop.swissknife) {
        this.swissknife = this.desktop.swissknife;
      } else {
        this.swissknife = window.swissknife;
      }
      
      // Initialize IPFS and libp2p nodes
      await this.initializeP2PNodes();
      
      // Initialize identity management
      await this.initializeIdentity();
      
      // Set up global reference for P2P Chat integration
      window.friendsListGlobal = this;
      
      this.isInitialized = true;
      console.log('✅ Friends List app initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize Friends List app:', error);
      throw error;
    }
  }
  
  async initializeP2PNodes() {
    try {
      console.log('🔗 Initializing P2P nodes...');
      
      // Try to use real IPFS/libp2p if available
      if (window.ipfsNode) {
        this.ipfsNode = window.ipfsNode;
      } else if (this.desktop?.swissknife?.ipfs) {
        // Use SwissKnife IPFS API wrapper
        const ipfsApi = this.desktop.swissknife.ipfs;
        this.ipfsNode = {
          id: async () => ({ id: await ipfsApi.getPeerId() }),
          isOnline: () => true,
          swarm: {
            peers: async () => await ipfsApi.getPeers(),
            connect: (addr) => ipfsApi.connect(addr)
          },
          dag: {
            put: (obj) => ipfsApi.add(JSON.stringify(obj)),
            get: (cid) => ipfsApi.get(cid).then(content => ({ value: JSON.parse(content) }))
          }
        };
      } else {
        // Fallback implementation for when IPFS not available
        this.ipfsNode = {
          id: () => ({ id: 'fallback-QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG' }),
          isOnline: () => false,
          swarm: {
            peers: () => [],
            connect: (addr) => Promise.resolve()
          },
          dag: {
            put: (obj) => Promise.resolve({ toString: () => 'fallback-bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi' }),
            get: (cid) => Promise.resolve({ value: {} })
          }
        };
      }
      
      // Try to use real libp2p if available
      if (window.libp2pNode) {
        this.libp2pNode = window.libp2pNode;
      } else if (window.p2pMLSystem) {
        // Use P2P ML System
        const p2pInfo = await window.p2pMLSystem.getPeerInfo();
        this.libp2pNode = {
          peerId: { toString: () => p2pInfo.peerId },
          multiaddrs: p2pInfo.multiaddrs || ['/ip4/127.0.0.1/tcp/4001'],
          isStarted: () => true,
          getConnections: () => [],
          dial: (addr) => window.p2pMLSystem.connect(addr)
        };
      } else {
        // Fallback implementation
        this.libp2pNode = {
          peerId: { toString: () => 'fallback-12D3KooWGRUVh1fJ2h1fJ2h1fJ2h1fJ2h1fJ2h1fJ2h1fJ2h1fJ2h1fJ' },
          multiaddrs: ['/ip4/127.0.0.1/tcp/4001'],
          isStarted: () => false,
          getConnections: () => [],
          dial: (addr) => Promise.resolve()
        };
      }
      
      console.log('✅ P2P nodes initialized');
    } catch (error) {
      console.warn('⚠️ P2P initialization failed, using mock mode:', error);
    }
  }
  
  async initializeIdentity() {
    try {
      // Generate or load DID identity
      this.identityDID = 'did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp';
      
      // Load existing identity links
      const savedLinks = localStorage.getItem('swissknife_identity_links');
      if (savedLinks) {
        const links = JSON.parse(savedLinks);
        this.identityLinks = new Map(Object.entries(links));
      }
      
      console.log('🆔 Identity initialized:', this.identityDID);
    } catch (error) {
      console.error('Failed to initialize identity:', error);
    }
  }
  
  async createInterface(container) {
    await this.initialize();
    
    container.innerHTML = this.getHTML();
    
    // Apply styles
    const style = document.createElement('style');
    style.textContent = this.getCSS();
    document.head.appendChild(style);
    
    this.setupEventListeners(container);
    this.renderFriendsList();
    this.renderIdentityLinks();
    this.renderPendingInvites();
    
    console.log('✅ Friends List interface created successfully');
  }
  
  getHTML() {
    return `
      <div class="friends-container">
        <!-- Header -->
        <div class="friends-header">
          <div class="header-title">
            <span class="header-icon">👥</span>
            <h2>Friends & Network</h2>
          </div>
          <div class="header-actions">
            <button id="add-friend-btn" class="action-btn primary">
              <span>➕</span> Add Friend
            </button>
            <button id="identity-manager-btn" class="action-btn">
              <span>🆔</span> Manage Identity
            </button>
            <button id="network-status-btn" class="action-btn status-online">
              <span>🔗</span> Online
            </button>
          </div>
        </div>
        
        <!-- Navigation Tabs -->
        <div class="nav-tabs">
          <button class="nav-tab active" data-tab="friends">
            <span class="tab-icon">👥</span>
            Friends (<span id="friends-count">0</span>)
          </button>
          <button class="nav-tab" data-tab="pending">
            <span class="tab-icon">⏰</span>
            Pending (<span id="pending-count">0</span>)
          </button>
          <button class="nav-tab" data-tab="identity">
            <span class="tab-icon">��</span>
            Identity Links
          </button>
          <button class="nav-tab" data-tab="discovery">
            <span class="tab-icon">🔍</span>
            Discover
          </button>
        </div>
        
        <!-- Content Panels -->
        <div class="content-panels">
          <!-- Friends Panel -->
          <div id="friends-panel" class="content-panel active">
            <div class="panel-header">
              <div class="search-bar">
                <input type="text" id="friends-search" placeholder="Search friends...">
                <button class="search-btn">🔍</button>
              </div>
              <div class="filter-controls">
                <select id="status-filter">
                  <option value="all">All Status</option>
                  <option value="online">Online</option>
                  <option value="away">Away</option>
                  <option value="offline">Offline</option>
                </select>
                <select id="platform-filter">
                  <option value="all">All Platforms</option>
                  <option value="github">GitHub</option>
                  <option value="huggingface">Hugging Face</option>
                  <option value="libp2p">libp2p</option>
                  <option value="ipfs">IPFS</option>
                </select>
              </div>
            </div>
            <div class="friends-list" id="friends-list">
              <!-- Friends will be populated by JavaScript -->
            </div>
          </div>
          
          <!-- Pending Invites Panel -->
          <div id="pending-panel" class="content-panel">
            <div class="panel-header">
              <h3>Friend Requests & Invites</h3>
              <button id="sync-invites-btn" class="sync-btn">🔄 Sync</button>
            </div>
            <div class="pending-list" id="pending-list">
              <!-- Pending invites will be populated by JavaScript -->
            </div>
          </div>
          
          <!-- Identity Links Panel -->
          <div id="identity-panel" class="content-panel">
            <div class="panel-header">
              <h3>Decentralized Identity (DID)</h3>
              <div class="did-info">
                <code id="current-did">${this.identityDID}</code>
                <button id="copy-did-btn" class="copy-btn">📋</button>
              </div>
            </div>
            <div class="identity-links" id="identity-links">
              <!-- Identity links will be populated by JavaScript -->
            </div>
            <div class="platform-connections">
              <h4>Available Platforms</h4>
              <div class="platforms-grid" id="platforms-grid">
                <!-- Platform connections will be populated by JavaScript -->
              </div>
            </div>
          </div>
          
          <!-- Discovery Panel -->
          <div id="discovery-panel" class="content-panel">
            <div class="panel-header">
              <h3>Discover Friends</h3>
              <div class="discovery-controls">
                <button id="scan-network-btn" class="discovery-btn">
                  <span>📡</span> Scan P2P Network
                </button>
                <button id="import-contacts-btn" class="discovery-btn">
                  <span>📤</span> Import Contacts
                </button>
              </div>
            </div>
            <div class="discovery-results" id="discovery-results">
              <div class="discovery-placeholder">
                <div class="placeholder-icon">🔍</div>
                <h4>Discover New Friends</h4>
                <p>Scan the libp2p network or import contacts from connected platforms to find friends.</p>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Add Friend Modal -->
        <div id="add-friend-modal" class="modal hidden">
          <div class="modal-content">
            <div class="modal-header">
              <h3>Add Friend</h3>
              <button id="close-add-friend" class="modal-close">×</button>
            </div>
            <div class="modal-body">
              <div class="add-friend-options">
                <div class="add-option" data-method="did">
                  <div class="option-icon">🆔</div>
                  <div class="option-info">
                    <h4>By DID (Decentralized ID)</h4>
                    <p>Add using their decentralized identifier</p>
                  </div>
                </div>
                <div class="add-option" data-method="platform">
                  <div class="option-icon">🔗</div>
                  <div class="option-info">
                    <h4>By Platform Username</h4>
                    <p>Add using GitHub, Hugging Face, etc.</p>
                  </div>
                </div>
                <div class="add-option" data-method="qr">
                  <div class="option-icon">📱</div>
                  <div class="option-info">
                    <h4>QR Code Scan</h4>
                    <p>Scan their QR code</p>
                  </div>
                </div>
              </div>
              
              <div id="add-friend-form" class="add-friend-form hidden">
                <div class="form-group">
                  <label for="friend-input">Enter DID or Username:</label>
                  <input type="text" id="friend-input" placeholder="did:key:... or username">
                </div>
                <div class="form-group">
                  <label for="platform-select">Platform (if username):</label>
                  <select id="platform-select">
                    <option value="">Select platform</option>
                    <option value="github">GitHub</option>
                    <option value="huggingface">Hugging Face</option>
                    <option value="twitter">Twitter/X</option>
                    <option value="discord">Discord</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="friend-message">Message (optional):</label>
                  <textarea id="friend-message" placeholder="Hi! I'd like to connect with you on SwissKnife..."></textarea>
                </div>
                <div class="form-actions">
                  <button id="cancel-add-friend" class="btn-secondary">Cancel</button>
                  <button id="send-friend-request" class="btn-primary">Send Request</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Identity Manager Modal -->
        <div id="identity-modal" class="modal hidden">
          <div class="modal-content large">
            <div class="modal-header">
              <h3>Identity & Platform Links</h3>
              <button id="close-identity" class="modal-close">×</button>
            </div>
            <div class="modal-body">
              <div class="identity-section">
                <h4>Your Decentralized Identity</h4>
                <div class="did-display">
                  <code>${this.identityDID}</code>
                  <button class="copy-btn">📋</button>
                </div>
                <div class="qr-code-section">
                  <div class="qr-placeholder">
                    <div class="qr-icon">📱</div>
                    <p>QR Code for sharing</p>
                  </div>
                  <button id="generate-qr-btn" class="btn-secondary">Generate QR Code</button>
                </div>
              </div>
              
              <div class="platform-links-section">
                <h4>Platform Connections</h4>
                <div class="platforms-list" id="platforms-management">
                  <!-- Platform management will be populated by JavaScript -->
                </div>
              </div>
              
              <div class="ipld-section">
                <h4>IPLD Data Structure</h4>
                <div class="ipld-tree" id="ipld-tree">
                  <!-- IPLD structure will be shown here -->
                </div>
                <button id="export-identity-btn" class="btn-secondary">Export Identity</button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Friend Profile Modal -->
        <div id="friend-profile-modal" class="modal hidden">
          <div class="modal-content">
            <div class="modal-header">
              <h3>Friend Profile</h3>
              <button id="close-friend-profile" class="modal-close">×</button>
            </div>
            <div class="modal-body" id="friend-profile-content">
              <!-- Friend profile will be populated by JavaScript -->
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  getCSS() {
    return `
      .friends-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #ffffff;
        font-family: system-ui, -apple-system, sans-serif;
        overflow: hidden;
      }
      
      /* Header */
      .friends-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem;
        background: rgba(0, 0, 0, 0.2);
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        flex-shrink: 0;
      }
      
      .header-title {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      
      .header-icon {
        font-size: 2rem;
      }
      
      .header-title h2 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 600;
      }
      
      .header-actions {
        display: flex;
        gap: 0.75rem;
      }
      
      .action-btn {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem 1rem;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 0.9rem;
        font-weight: 500;
      }
      
      .action-btn:hover {
        background: rgba(255, 255, 255, 0.2);
        transform: translateY(-1px);
      }
      
      .action-btn.primary {
        background: linear-gradient(135deg, #3b82f6, #1d4ed8);
        border-color: rgba(59, 130, 246, 0.5);
      }
      
      .action-btn.status-online {
        background: rgba(16, 185, 129, 0.2);
        border-color: rgba(16, 185, 129, 0.5);
      }
      
      /* Navigation Tabs */
      .nav-tabs {
        display: flex;
        background: rgba(0, 0, 0, 0.1);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        flex-shrink: 0;
      }
      
      .nav-tab {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 1rem 1.5rem;
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.7);
        cursor: pointer;
        transition: all 0.2s ease;
        border-bottom: 3px solid transparent;
        font-size: 0.9rem;
        font-weight: 500;
      }
      
      .nav-tab:hover, .nav-tab.active {
        color: white;
        background: rgba(255, 255, 255, 0.1);
        border-bottom-color: #3b82f6;
      }
      
      .tab-icon {
        font-size: 1.1rem;
      }
      
      /* Content Panels */
      .content-panels {
        flex: 1;
        position: relative;
        overflow: hidden;
      }
      
      .content-panel {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
        overflow-y: auto;
        padding: 1.5rem;
      }
      
      .content-panel.active {
        opacity: 1;
        visibility: visible;
      }
      
      .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
        gap: 1rem;
      }
      
      .panel-header h3 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
      }
      
      /* Search and Filters */
      .search-bar {
        display: flex;
        align-items: center;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 0.5rem;
        min-width: 250px;
      }
      
      .search-bar input {
        flex: 1;
        background: none;
        border: none;
        color: white;
        outline: none;
        padding: 0.25rem 0.5rem;
        font-size: 0.9rem;
      }
      
      .search-bar input::placeholder {
        color: rgba(255, 255, 255, 0.5);
      }
      
      .search-btn {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.7);
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 4px;
        transition: all 0.2s ease;
      }
      
      .search-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: white;
      }
      
      .filter-controls {
        display: flex;
        gap: 0.75rem;
      }
      
      .filter-controls select {
        padding: 0.5rem;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 6px;
        outline: none;
        font-size: 0.85rem;
      }
      
      .filter-controls select option {
        background: #4c1d95;
        color: white;
      }
      
      /* Friends List */
      .friends-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 1rem;
      }
      
      .friend-card {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        padding: 1.25rem;
        cursor: pointer;
        transition: all 0.3s ease;
        position: relative;
      }
      
      .friend-card:hover {
        background: rgba(255, 255, 255, 0.15);
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
      }
      
      .friend-card-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1rem;
      }
      
      .friend-avatar {
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: linear-gradient(45deg, #667eea, #764ba2);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
        color: white;
        position: relative;
      }
      
      .friend-avatar::after {
        content: '';
        position: absolute;
        bottom: -2px;
        right: -2px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: 2px solid white;
      }
      
      .friend-avatar.online::after {
        background: #10b981;
      }
      
      .friend-avatar.away::after {
        background: #f59e0b;
      }
      
      .friend-avatar.offline::after {
        background: #6b7280;
      }
      
      .friend-info h4 {
        margin: 0 0 0.25rem 0;
        font-size: 1.1rem;
        font-weight: 600;
      }
      
      .friend-status {
        font-size: 0.85rem;
        color: rgba(255, 255, 255, 0.7);
      }
      
      .friend-platforms {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
        flex-wrap: wrap;
      }
      
      .platform-badge {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.25rem 0.5rem;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 12px;
        font-size: 0.75rem;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }
      
      .platform-badge.verified {
        border-color: #10b981;
        background: rgba(16, 185, 129, 0.2);
      }
      
      .friend-tags {
        display: flex;
        gap: 0.25rem;
        margin-bottom: 0.75rem;
        flex-wrap: wrap;
      }
      
      .friend-tag {
        padding: 0.125rem 0.5rem;
        background: rgba(59, 130, 246, 0.2);
        border: 1px solid rgba(59, 130, 246, 0.3);
        border-radius: 8px;
        font-size: 0.75rem;
        color: #93c5fd;
      }
      
      .friend-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.8rem;
        color: rgba(255, 255, 255, 0.7);
        margin-bottom: 0.75rem;
      }
      
      .friend-quick-actions {
        display: flex;
        gap: 0.5rem;
        justify-content: flex-end;
      }
      
      .quick-action-btn {
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        font-size: 14px;
      }
      
      .quick-action-btn:hover {
        background: rgba(255, 255, 255, 0.2);
        transform: scale(1.1);
      }
      
      .quick-action-btn.message:hover {
        background: rgba(59, 130, 246, 0.3);
      }
      
      /* Pending Invites */
      .pending-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      
      .invite-card {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        padding: 1.25rem;
        position: relative;
      }
      
      .invite-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1rem;
      }
      
      .invite-message {
        background: rgba(0, 0, 0, 0.2);
        padding: 0.75rem;
        border-radius: 8px;
        font-style: italic;
        margin-bottom: 1rem;
        border-left: 3px solid #3b82f6;
      }
      
      .invite-actions {
        display: flex;
        gap: 0.75rem;
        justify-content: flex-end;
      }
      
      .invite-btn {
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 500;
        transition: all 0.2s ease;
      }
      
      .invite-btn.accept {
        background: linear-gradient(135deg, #10b981, #047857);
        color: white;
      }
      
      .invite-btn.decline {
        background: rgba(239, 68, 68, 0.2);
        color: #fca5a5;
        border: 1px solid rgba(239, 68, 68, 0.3);
      }
      
      .invite-btn:hover {
        transform: translateY(-1px);
      }
      
      /* Identity Panel */
      .did-info {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        background: rgba(0, 0, 0, 0.2);
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 1.5rem;
      }
      
      .did-info code {
        flex: 1;
        font-family: 'Courier New', monospace;
        font-size: 0.85rem;
        color: #93c5fd;
        word-break: break-all;
      }
      
      .copy-btn {
        background: rgba(59, 130, 246, 0.2);
        border: 1px solid rgba(59, 130, 246, 0.3);
        color: #60a5fa;
        padding: 0.5rem;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      
      .copy-btn:hover {
        background: rgba(59, 130, 246, 0.3);
      }
      
      .platforms-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1rem;
        margin-top: 1rem;
      }
      
      .platform-card {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        padding: 1.25rem;
        transition: all 0.3s ease;
        cursor: pointer;
      }
      
      .platform-card:hover {
        background: rgba(255, 255, 255, 0.15);
        transform: translateY(-2px);
      }
      
      .platform-card-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 1rem;
      }
      
      .platform-icon {
        font-size: 1.5rem;
      }
      
      .platform-name {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
      }
      
      .platform-status {
        margin-left: auto;
        padding: 0.25rem 0.75rem;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 500;
      }
      
      .platform-status.connected {
        background: rgba(16, 185, 129, 0.2);
        color: #6ee7b7;
        border: 1px solid rgba(16, 185, 129, 0.3);
      }
      
      .platform-status.disconnected {
        background: rgba(107, 114, 128, 0.2);
        color: #d1d5db;
        border: 1px solid rgba(107, 114, 128, 0.3);
      }
      
      .platform-fields {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        font-size: 0.85rem;
        color: rgba(255, 255, 255, 0.8);
      }
      
      /* Discovery Panel */
      .discovery-controls {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
      
      .discovery-btn {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem 1rem;
        background: rgba(59, 130, 246, 0.2);
        border: 1px solid rgba(59, 130, 246, 0.3);
        color: #60a5fa;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 0.9rem;
        font-weight: 500;
      }
      
      .discovery-btn:hover {
        background: rgba(59, 130, 246, 0.3);
        transform: translateY(-1px);
      }
      
      .discovery-placeholder {
        text-align: center;
        padding: 3rem 1rem;
        color: rgba(255, 255, 255, 0.7);
      }
      
      .placeholder-icon {
        font-size: 4rem;
        margin-bottom: 1rem;
        opacity: 0.5;
      }
      
      .discovery-placeholder h4 {
        margin: 0 0 0.5rem 0;
        font-size: 1.25rem;
        color: rgba(255, 255, 255, 0.9);
      }
      
      /* Modal Styles */
      .modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        backdrop-filter: blur(8px);
      }
      
      .modal-content {
        background: linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%);
        border-radius: 16px;
        width: 90%;
        max-width: 600px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
      }
      
      .modal-content.large {
        max-width: 800px;
      }
      
      .modal-header {
        padding: 1.5rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .modal-header h3 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
      }
      
      .modal-close {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.7);
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 4px;
        transition: all 0.2s ease;
      }
      
      .modal-close:hover {
        background: rgba(255, 255, 255, 0.1);
        color: white;
      }
      
      .modal-body {
        padding: 1.5rem;
      }
      
      /* Add Friend Modal */
      .add-friend-options {
        display: grid;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }
      
      .add-option {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1.25rem;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.3s ease;
      }
      
      .add-option:hover {
        background: rgba(255, 255, 255, 0.15);
        transform: translateY(-2px);
      }
      
      .option-icon {
        font-size: 2rem;
      }
      
      .option-info h4 {
        margin: 0 0 0.25rem 0;
        font-size: 1.1rem;
        font-weight: 600;
      }
      
      .option-info p {
        margin: 0;
        color: rgba(255, 255, 255, 0.7);
        font-size: 0.9rem;
      }
      
      .add-friend-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      
      .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      
      .form-group label {
        font-size: 0.9rem;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.9);
      }
      
      .form-group input,
      .form-group select,
      .form-group textarea {
        padding: 0.75rem;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        color: white;
        outline: none;
        font-size: 0.9rem;
        transition: all 0.2s ease;
      }
      
      .form-group input:focus,
      .form-group select:focus,
      .form-group textarea:focus {
        border-color: #3b82f6;
        background: rgba(255, 255, 255, 0.15);
      }
      
      .form-group input::placeholder,
      .form-group textarea::placeholder {
        color: rgba(255, 255, 255, 0.5);
      }
      
      .form-group textarea {
        min-height: 80px;
        resize: vertical;
      }
      
      .form-actions {
        display: flex;
        gap: 1rem;
        justify-content: flex-end;
        margin-top: 1rem;
      }
      
      .btn-secondary, .btn-primary {
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 500;
        transition: all 0.2s ease;
      }
      
      .btn-secondary {
        background: rgba(255, 255, 255, 0.1);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }
      
      .btn-secondary:hover {
        background: rgba(255, 255, 255, 0.2);
      }
      
      .btn-primary {
        background: linear-gradient(135deg, #3b82f6, #1d4ed8);
        color: white;
      }
      
      .btn-primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
      }
      
      /* Utility Classes */
      .hidden {
        display: none !important;
      }
      
      /* Responsive Design */
      @media (max-width: 768px) {
        .friends-header {
          flex-direction: column;
          gap: 1rem;
          align-items: stretch;
        }
        
        .header-actions {
          justify-content: center;
        }
        
        .nav-tabs {
          overflow-x: auto;
        }
        
        .nav-tab {
          white-space: nowrap;
          min-width: max-content;
        }
        
        .panel-header {
          flex-direction: column;
          align-items: stretch;
        }
        
        .friends-list {
          grid-template-columns: 1fr;
        }
        
        .platforms-grid {
          grid-template-columns: 1fr;
        }
        
        .modal-content {
          width: 95%;
          margin: 1rem;
        }
      }
    `;
  }
  
  setupEventListeners(container) {
    // Navigation tabs
    const navTabs = container.querySelectorAll('.nav-tab');
    const contentPanels = container.querySelectorAll('.content-panel');
    
    navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        
        // Update active tab
        navTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update active panel
        contentPanels.forEach(panel => panel.classList.remove('active'));
        const targetPanel = container.querySelector(`#${targetTab}-panel`);
        if (targetPanel) {
          targetPanel.classList.add('active');
        }
      });
    });
    
    // Add Friend modal
    const addFriendBtn = container.querySelector('#add-friend-btn');
    const addFriendModal = container.querySelector('#add-friend-modal');
    const closeAddFriend = container.querySelector('#close-add-friend');
    
    addFriendBtn?.addEventListener('click', () => {
      addFriendModal?.classList.remove('hidden');
    });
    
    closeAddFriend?.addEventListener('click', () => {
      addFriendModal?.classList.add('hidden');
    });
    
    // Add friend options
    const addOptions = container.querySelectorAll('.add-option');
    const addFriendForm = container.querySelector('#add-friend-form');
    
    addOptions.forEach(option => {
      option.addEventListener('click', () => {
        const method = option.dataset.method;
        this.showAddFriendForm(method);
      });
    });
    
    // Identity Manager modal
    const identityManagerBtn = container.querySelector('#identity-manager-btn');
    const identityModal = container.querySelector('#identity-modal');
    const closeIdentity = container.querySelector('#close-identity');
    
    identityManagerBtn?.addEventListener('click', () => {
      identityModal?.classList.remove('hidden');
      this.renderIdentityManager();
    });
    
    closeIdentity?.addEventListener('click', () => {
      identityModal?.classList.add('hidden');
    });
    
    // Copy DID functionality
    const copyDidBtns = container.querySelectorAll('.copy-btn');
    copyDidBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const didText = this.identityDID;
        navigator.clipboard.writeText(didText).then(() => {
          btn.textContent = '✅';
          setTimeout(() => {
            btn.textContent = '📋';
          }, 2000);
        });
      });
    });
    
    // Search functionality
    const friendsSearch = container.querySelector('#friends-search');
    friendsSearch?.addEventListener('input', (e) => {
      this.filterFriends(e.target.value);
    });
    
    // Filter functionality
    const statusFilter = container.querySelector('#status-filter');
    const platformFilter = container.querySelector('#platform-filter');
    
    statusFilter?.addEventListener('change', () => {
      this.filterFriends();
    });
    
    platformFilter?.addEventListener('change', () => {
      this.filterFriends();
    });
    
    // Discovery functionality
    const scanNetworkBtn = container.querySelector('#scan-network-btn');
    const importContactsBtn = container.querySelector('#import-contacts-btn');
    
    scanNetworkBtn?.addEventListener('click', () => {
      this.scanP2PNetwork();
    });
    
    importContactsBtn?.addEventListener('click', () => {
      this.importContacts();
    });
    
    // Network status
    const networkStatusBtn = container.querySelector('#network-status-btn');
    networkStatusBtn?.addEventListener('click', () => {
      this.toggleNetworkStatus();
    });
  }
  
  renderFriendsList() {
    const friendsList = document.querySelector('#friends-list');
    const friendsCount = document.querySelector('#friends-count');
    
    if (!friendsList) return;
    
    friendsCount.textContent = this.friends.size;
    
    const friendsArray = Array.from(this.friends.values());
    
    friendsList.innerHTML = friendsArray.map(friend => `
      <div class="friend-card" data-friend-id="${friend.id}">
        <div class="friend-card-header">
          <div class="friend-avatar ${friend.status}">
            ${friend.avatar ? `<img src="${friend.avatar}" alt="${friend.name}">` : friend.name.charAt(0)}
          </div>
          <div class="friend-info">
            <h4>${friend.name}</h4>
            <div class="friend-status">
              ${friend.status === 'online' ? '🟢 Online' : 
                friend.status === 'away' ? '🟡 Away' : 
                `🔴 Last seen ${this.formatTimeAgo(friend.lastSeen)}`}
            </div>
          </div>
        </div>
        
        <div class="friend-platforms">
          ${Object.entries(friend.identities).map(([platform, data]) => `
            <div class="platform-badge ${data.verified ? 'verified' : ''}">
              ${this.getPlatformIcon(platform)}
              <span>${data.username || data.peer_id?.substring(0, 8) + '...' || 'Connected'}</span>
              ${data.verified ? '✓' : ''}
            </div>
          `).join('')}
        </div>
        
        <div class="friend-tags">
          ${friend.tags.map(tag => `
            <span class="friend-tag">${tag}</span>
          `).join('')}
        </div>
        
        <div class="friend-meta">
          <span>${friend.mutualFriends} mutual friends</span>
          <span>Added ${this.formatDate(friend.addedDate)}</span>
        </div>
        
        <div class="friend-quick-actions">
          <button class="quick-action-btn message" onclick="event.stopPropagation(); window.friendsListGlobal?.startChatWithFriend('${friend.id}', '${friend.name}')" title="Send Message">
            💬
          </button>
          <button class="quick-action-btn profile" onclick="event.stopPropagation(); window.friendsListGlobal?.showFriendProfile('${friend.id}')" title="View Profile">
            👤
          </button>
        </div>
      </div>
    `).join('');
    
    // Add click handlers for friend cards
    const friendCards = friendsList.querySelectorAll('.friend-card');
    friendCards.forEach(card => {
      card.addEventListener('click', (e) => {
        // Don't trigger if clicking on quick action buttons
        if (e.target.closest('.quick-action-btn')) {
          return;
        }
        
        const friendId = card.dataset.friendId;
        this.showFriendProfile(friendId);
      });
    });
  }
  
  renderPendingInvites() {
    const pendingList = document.querySelector('#pending-list');
    const pendingCount = document.querySelector('#pending-count');
    
    if (!pendingList) return;
    
    pendingCount.textContent = this.pendingInvites.size;
    
    const invitesArray = Array.from(this.pendingInvites.values());
    
    if (invitesArray.length === 0) {
      pendingList.innerHTML = `
        <div class="discovery-placeholder">
          <div class="placeholder-icon">📭</div>
          <h4>No Pending Invites</h4>
          <p>When someone sends you a friend request, it will appear here.</p>
        </div>
      `;
      return;
    }
    
    pendingList.innerHTML = invitesArray.map(invite => `
      <div class="invite-card" data-invite-id="${invite.id}">
        <div class="invite-header">
          <div class="friend-avatar">
            ${invite.avatar ? `<img src="${invite.avatar}" alt="${invite.name}">` : invite.name.charAt(0)}
          </div>
          <div class="friend-info">
            <h4>${invite.name}</h4>
            <div class="friend-status">
              ${invite.mutualFriends} mutual friends • ${this.formatTimeAgo(invite.timestamp)}
            </div>
          </div>
        </div>
        
        <div class="invite-message">
          "${invite.message}"
        </div>
        
        <div class="friend-platforms">
          ${invite.platforms.map(platform => `
            <div class="platform-badge">
              ${this.getPlatformIcon(platform)}
              <span>${platform}</span>
            </div>
          `).join('')}
        </div>
        
        <div class="invite-actions">
          <button class="invite-btn decline" data-action="decline" data-invite-id="${invite.id}">
            Decline
          </button>
          <button class="invite-btn accept" data-action="accept" data-invite-id="${invite.id}">
            Accept
          </button>
        </div>
      </div>
    `).join('');
    
    // Add click handlers for invite actions
    const inviteButtons = pendingList.querySelectorAll('.invite-btn');
    inviteButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const inviteId = btn.dataset.inviteId;
        this.handleInviteAction(inviteId, action);
      });
    });
  }
  
  renderIdentityLinks() {
    const platformsGrid = document.querySelector('#platforms-grid');
    
    if (!platformsGrid) return;
    
    platformsGrid.innerHTML = this.supportedPlatforms.map(platform => {
      const isConnected = this.identityLinks.has(platform.id);
      const linkData = this.identityLinks.get(platform.id);
      
      return `
        <div class="platform-card" data-platform="${platform.id}">
          <div class="platform-card-header">
            <span class="platform-icon">${platform.icon}</span>
            <h4 class="platform-name">${platform.name}</h4>
            <span class="platform-status ${isConnected ? 'connected' : 'disconnected'}">
              ${isConnected ? 'Connected' : 'Connect'}
            </span>
          </div>
          <div class="platform-fields">
            ${platform.fields.map(field => {
              if (isConnected && linkData && linkData[field]) {
                return `<div><strong>${field}:</strong> ${linkData[field]}</div>`;
              }
              return `<div><strong>${field}:</strong> <em>Available after connection</em></div>`;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
    
    // Add click handlers for platform connections
    const platformCards = platformsGrid.querySelectorAll('.platform-card');
    platformCards.forEach(card => {
      card.addEventListener('click', () => {
        const platformId = card.dataset.platform;
        this.connectPlatform(platformId);
      });
    });
  }
  
  renderIdentityManager() {
    const platformsManagement = document.querySelector('#platforms-management');
    const ipldTree = document.querySelector('#ipld-tree');
    
    if (platformsManagement) {
      platformsManagement.innerHTML = this.supportedPlatforms.map(platform => {
        const isConnected = this.identityLinks.has(platform.id);
        const linkData = this.identityLinks.get(platform.id);
        
        return `
          <div class="platform-management-item">
            <div class="platform-info">
              <span class="platform-icon">${platform.icon}</span>
              <h4>${platform.name}</h4>
              <span class="status ${isConnected ? 'connected' : 'disconnected'}">
                ${isConnected ? '✅ Connected' : '❌ Disconnected'}
              </span>
            </div>
            ${isConnected ? `
              <div class="platform-data">
                <code>${JSON.stringify(linkData, null, 2)}</code>
              </div>
              <button class="disconnect-btn" data-platform="${platform.id}">Disconnect</button>
            ` : `
              <button class="connect-btn" data-platform="${platform.id}">Connect Account</button>
            `}
          </div>
        `;
      }).join('');
    }
    
    if (ipldTree) {
      const ipldStructure = {
        '@context': 'https://w3id.org/did/v1',
        'id': this.identityDID,
        'authentication': ['#key-1'],
        'service': Array.from(this.identityLinks.entries()).map(([platform, data]) => ({
          'id': `#${platform}`,
          'type': 'LinkedDomains',
          'serviceEndpoint': `https://${platform}.com/${data.username || data.peer_id}`
        })),
        'linkedData': {
          'platforms': Object.fromEntries(this.identityLinks),
          'friends': Array.from(this.friends.keys()),
          'created': new Date().toISOString()
        }
      };
      
      ipldTree.innerHTML = `
        <pre><code>${JSON.stringify(ipldStructure, null, 2)}</code></pre>
      `;
    }
  }
  
  showAddFriendForm(method) {
    const addFriendForm = document.querySelector('#add-friend-form');
    const friendInput = document.querySelector('#friend-input');
    const platformSelect = document.querySelector('#platform-select');
    
    if (!addFriendForm) return;
    
    addFriendForm.classList.remove('hidden');
    
    switch (method) {
      case 'did':
        friendInput.placeholder = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
        platformSelect.style.display = 'none';
        break;
      case 'platform':
        friendInput.placeholder = 'username';
        platformSelect.style.display = 'block';
        break;
      case 'qr':
        // QR code scanning functionality
        this.showQRScanner();
        break;
    }
  }
  
  showQRScanner() {
    // Implement QR code scanner functionality
    alert('QR Code Scanner\n\nTo add a friend via QR code:\n1. Ask your friend to display their QR code from their Friends List\n2. Use your device camera to scan the code\n3. Confirm the friend request\n\nNote: Camera access requires HTTPS and user permission.');
    
    // In a real implementation, this would use the getUserMedia API
    // to access the camera and a QR code scanning library
    /* Example implementation:
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        // Display video stream
        // Scan for QR codes
        // Parse friend ID and add friend
      })
      .catch(error => {
        console.error('Camera access denied:', error);
        alert('Camera access is required to scan QR codes.');
      });
    */
  }
  
  showFriendProfile(friendId) {
    const friend = this.friends.get(friendId);
    if (!friend) return;
    
    const modal = document.querySelector('#friend-profile-modal');
    const content = document.querySelector('#friend-profile-content');
    
    if (!modal || !content) return;
    
    content.innerHTML = `
      <div class="friend-profile">
        <div class="profile-header">
          <div class="friend-avatar large ${friend.status}">
            ${friend.avatar ? `<img src="${friend.avatar}" alt="${friend.name}">` : friend.name.charAt(0)}
          </div>
          <div class="profile-info">
            <h3>${friend.name}</h3>
            <p class="profile-status">
              ${friend.status === 'online' ? '�� Online' : 
                friend.status === 'away' ? '🟡 Away' : 
                `🔴 Last seen ${this.formatTimeAgo(friend.lastSeen)}`}
            </p>
            <p class="profile-did">${friend.id}</p>
          </div>
        </div>
        
        <div class="profile-section">
          <h4>Connected Platforms</h4>
          <div class="platform-links">
            ${Object.entries(friend.identities).map(([platform, data]) => `
              <div class="platform-link">
                <span class="platform-icon">${this.getPlatformIcon(platform)}</span>
                <div class="platform-details">
                  <strong>${platform}</strong>
                  <div>${data.username || data.peer_id || 'Connected'}</div>
                  ${data.verified ? '<span class="verified">✓ Verified</span>' : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <div class="profile-section">
          <h4>Tags & Interests</h4>
          <div class="profile-tags">
            ${friend.tags.map(tag => `<span class="profile-tag">${tag}</span>`).join('')}
          </div>
        </div>
        
        <div class="profile-actions">
          <button class="profile-btn message" onclick="window.friendsListGlobal?.startChatWithFriend('${friend.id}', '${friend.name}')">💬 Message</button>
          <button class="profile-btn call">📞 Call</button>
          <button class="profile-btn remove">🗑️ Remove Friend</button>
        </div>
      </div>
    `;
    
    modal.classList.remove('hidden');
    
    // Close modal handler
    const closeBtn = modal.querySelector('.modal-close');
    closeBtn?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }
  
  async connectPlatform(platformId) {
    const platform = this.supportedPlatforms.find(p => p.id === platformId);
    if (!platform) return;
    
    console.log(`🔗 Connecting to ${platform.name}...`);
    
    try {
      // Simulate OAuth flow or API connection
      const connectionData = await this.performPlatformConnection(platform);
      
      // Store the connection
      this.identityLinks.set(platformId, connectionData);
      
      // Save to localStorage
      const linksObject = Object.fromEntries(this.identityLinks);
      localStorage.setItem('swissknife_identity_links', JSON.stringify(linksObject));
      
      // Create IPLD record
      await this.updateIPLDRecord();
      
      // Re-render
      this.renderIdentityLinks();
      
      console.log(`✅ Connected to ${platform.name}`);
      
    } catch (error) {
      console.error(`❌ Failed to connect to ${platform.name}:`, error);
    }
  }
  
  async performPlatformConnection(platform) {
    // Simulate platform-specific connection logic
    switch (platform.id) {
      case 'github':
        return {
          username: 'user_' + Math.random().toString(36).substr(2, 9),
          profile_url: 'https://github.com/user_' + Math.random().toString(36).substr(2, 9),
          avatar_url: '/assets/avatars/github.png',
          bio: 'Software developer passionate about decentralized tech',
          public_repos: Math.floor(Math.random() * 50) + 5,
          verified: true,
          connected_at: new Date().toISOString()
        };
        
      case 'huggingface':
        return {
          username: 'ml_' + Math.random().toString(36).substr(2, 9),
          profile_url: 'https://huggingface.co/ml_' + Math.random().toString(36).substr(2, 9),
          avatar_url: '/assets/avatars/huggingface.png',
          models: Math.floor(Math.random() * 10) + 1,
          datasets: Math.floor(Math.random() * 5) + 1,
          verified: true,
          connected_at: new Date().toISOString()
        };
        
      case 'libp2p':
        return {
          peer_id: '12D3KooW' + Math.random().toString(36).substr(2, 40),
          multiaddrs: ['/ip4/127.0.0.1/tcp/4001', '/ip6/::1/tcp/4001'],
          protocols: ['/ipfs/id/1.0.0', '/ipfs/ping/1.0.0', '/swissknife/friends/1.0.0'],
          connected_peers: Math.floor(Math.random() * 20) + 5,
          verified: true,
          connected_at: new Date().toISOString()
        };
        
      case 'ipfs':
        return {
          peer_id: 'Qm' + Math.random().toString(36).substr(2, 44),
          node_id: 'ipfs-node-' + Math.random().toString(36).substr(2, 8),
          pinned_content: Math.floor(Math.random() * 100) + 10,
          bandwidth_stats: {
            total_in: Math.floor(Math.random() * 1000) + 'MB',
            total_out: Math.floor(Math.random() * 1000) + 'MB'
          },
          verified: true,
          connected_at: new Date().toISOString()
        };
        
      default:
        return {
          username: 'user_' + Math.random().toString(36).substr(2, 9),
          connected_at: new Date().toISOString(),
          verified: false
        };
    }
  }
  
  async updateIPLDRecord() {
    try {
      const identityRecord = {
        did: this.identityDID,
        platforms: Object.fromEntries(this.identityLinks),
        friends: Array.from(this.friends.keys()),
        updated: new Date().toISOString(),
        version: '1.0.0'
      };
      
      // In a real implementation, this would create an IPLD DAG
      if (this.ipfsNode && this.ipfsNode.dag) {
        const cid = await this.ipfsNode.dag.put(identityRecord);
        console.log('✅ IPLD record updated:', cid.toString());
        return cid;
      }
      
    } catch (error) {
      console.error('Failed to update IPLD record:', error);
    }
  }
  
  filterFriends(searchTerm = '') {
    const statusFilter = document.querySelector('#status-filter')?.value || 'all';
    const platformFilter = document.querySelector('#platform-filter')?.value || 'all';
    const friendCards = document.querySelectorAll('.friend-card');
    
    friendCards.forEach(card => {
      const friendId = card.dataset.friendId;
      const friend = this.friends.get(friendId);
      
      if (!friend) return;
      
      // Search filter
      const matchesSearch = !searchTerm || 
        friend.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        friend.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
      
      // Status filter
      const matchesStatus = statusFilter === 'all' || friend.status === statusFilter;
      
      // Platform filter
      const matchesPlatform = platformFilter === 'all' || 
        Object.keys(friend.identities).includes(platformFilter);
      
      if (matchesSearch && matchesStatus && matchesPlatform) {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
  }
  
  handleInviteAction(inviteId, action) {
    const invite = this.pendingInvites.get(inviteId);
    if (!invite) return;
    
    if (action === 'accept') {
      // Add as friend
      const newFriend = {
        id: invite.from,
        name: invite.name,
        avatar: invite.avatar,
        status: 'online',
        lastSeen: new Date(),
        identities: {},
        tags: [],
        mutualFriends: invite.mutualFriends,
        addedDate: new Date()
      };
      
      this.friends.set(invite.from, newFriend);
      this.pendingInvites.delete(inviteId);
      
      console.log(`✅ Accepted friend request from ${invite.name}`);
      
    } else if (action === 'decline') {
      this.pendingInvites.delete(inviteId);
      console.log(`❌ Declined friend request from ${invite.name}`);
    }
    
    // Re-render both sections
    this.renderFriendsList();
    this.renderPendingInvites();
  }
  
  async scanP2PNetwork() {
    const discoveryResults = document.querySelector('#discovery-results');
    if (!discoveryResults) return;
    
    discoveryResults.innerHTML = `
      <div class="scanning-indicator">
        <div class="spinner">🔄</div>
        <h4>Scanning P2P Network...</h4>
        <p>Looking for SwissKnife users in your network...</p>
      </div>
    `;
    
    // Simulate network scan
    setTimeout(() => {
      const mockDiscoveries = [
        {
          id: 'discovered-1',
          name: 'Dev Network User',
          did: 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
          platforms: ['github', 'libp2p'],
          mutualFriends: 1,
          distance: '2 hops away'
        },
        {
          id: 'discovered-2', 
          name: 'ML Researcher',
          did: 'did:key:z6MkfrQqJ9r8u2PyR5qDgJ9r8u2PyR5qDgJ9r8u2PyR5qDgJ9',
          platforms: ['huggingface', 'ipfs'],
          mutualFriends: 0,
          distance: '1 hop away'
        }
      ];
      
      discoveryResults.innerHTML = `
        <h4>Found ${mockDiscoveries.length} users</h4>
        <div class="discovery-list">
          ${mockDiscoveries.map(user => `
            <div class="discovery-card">
              <div class="discovery-header">
                <div class="discovery-avatar">${user.name.charAt(0)}</div>
                <div class="discovery-info">
                  <h5>${user.name}</h5>
                  <p>${user.distance} • ${user.mutualFriends} mutual friends</p>
                </div>
              </div>
              <div class="discovery-platforms">
                ${user.platforms.map(platform => `
                  <span class="platform-badge">
                    ${this.getPlatformIcon(platform)} ${platform}
                  </span>
                `).join('')}
              </div>
              <button class="discovery-add-btn" data-user-id="${user.id}">
                ➕ Add Friend
              </button>
            </div>
          `).join('')}
        </div>
      `;
      
      // Add click handlers
      const addBtns = discoveryResults.querySelectorAll('.discovery-add-btn');
      addBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const userId = btn.dataset.userId;
          const user = mockDiscoveries.find(u => u.id === userId);
          if (user) {
            this.sendFriendRequest(user);
          }
        });
      });
      
    }, 2000);
  }
  
  sendFriendRequest(user) {
    console.log(`📤 Sending friend request to ${user.name}`);
    
    // In a real implementation, this would send via libp2p/IPFS
    // For now, just show success message
    const btn = document.querySelector(`[data-user-id="${user.id}"]`);
    if (btn) {
      btn.textContent = '✅ Request Sent';
      btn.disabled = true;
    }
  }
  
  importContacts() {
    // Simulate contact import from connected platforms
    console.log('📤 Importing contacts from connected platforms...');
    
    const discoveryResults = document.querySelector('#discovery-results');
    if (discoveryResults) {
      discoveryResults.innerHTML = `
        <div class="import-placeholder">
          <div class="placeholder-icon">📤</div>
          <h4>Import Contacts</h4>
          <p>This feature will import contacts from your connected platforms (GitHub followers, etc.)</p>
          <p><em>Implementation pending OAuth integration</em></p>
        </div>
      `;
    }
  }
  
  // Integration method for P2P Chat
  startChatWithFriend(friendId, friendName) {
    console.log(`💬 Starting chat with friend: ${friendName} (${friendId})`);
    
    // Try to open P2P Chat app or use existing instance
    if (window.p2pChatGlobal) {
      // P2P Chat is already open, start chat with friend
      window.p2pChatGlobal.startChatWithFriend(friendId, friendName);
    } else {
      // P2P Chat is not open, launch it
      if (this.desktop && this.desktop.launchApp) {
        this.desktop.launchApp('p2p-chat').then(() => {
          // Wait a moment for the app to initialize
          setTimeout(() => {
            if (window.p2pChatGlobal) {
              window.p2pChatGlobal.startChatWithFriend(friendId, friendName);
            }
          }, 1000);
        });
      } else {
        console.warn('Cannot launch P2P Chat - desktop reference not available');
        alert('Please open the P2P Chat app first, then try messaging this friend.');
      }
    }
  }

  toggleNetworkStatus() {
    const statusBtn = document.querySelector('#network-status-btn');
    const isOnline = statusBtn?.classList.contains('status-online');
    
    if (isOnline) {
      statusBtn.classList.remove('status-online');
      statusBtn.classList.add('status-offline');
      statusBtn.innerHTML = '<span>🔴</span> Offline';
    } else {
      statusBtn.classList.remove('status-offline');
      statusBtn.classList.add('status-online');
      statusBtn.innerHTML = '<span>🔗</span> Online';
    }
  }
  
  // Utility functions
  getPlatformIcon(platform) {
    const platformMap = {
      github: '🐙',
      huggingface: '🤗',
      libp2p: '🔗',
      ipfs: '🌐',
      twitter: '🐦',
      discord: '💬'
    };
    return platformMap[platform] || '🔗';
  }
  
  formatTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }
  
  formatDate(date) {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  }
  
  cleanup() {
    try {
      // Clean up P2P connections
      if (this.libp2pNode) {
        this.libp2pNode = null;
      }
      
      if (this.ipfsNode) {
        this.ipfsNode = null;
      }
      
      // Clear references
      this.friends.clear();
      this.identityLinks.clear();
      this.pendingInvites.clear();
      
      console.log('✅ Friends List app cleaned up successfully');
      
    } catch (error) {
      console.warn('⚠️ Cleanup had issues:', error);
    }
  }
}

// Class is already exported above with 'export class FriendsListApp'
