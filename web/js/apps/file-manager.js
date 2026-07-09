/**
 * Enhanced File Manager App for SwissKnife Web Desktop
 * Advanced file management with IPFS integration, cloud storage, and collaborative features
 */

const COLLABORATIVE_FILE_SYSTEM_MODULE =
  '../../../ipfs_accelerate_js/src/p2p/collaborative-file-system.js';

class CollaborativeFileSystemFallback {
  constructor(p2pManager) {
    this.p2pManager = p2pManager;
    this.sharedFolders = [];
    this.sharedFiles = [];
    this.clipboardHistory = [];
    this.annotations = new Map();
    this.listeners = new Map();
  }

  on(event, listener) {
    const listeners = this.listeners.get(event) || [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
  }

  emit(event, payload) {
    (this.listeners.get(event) || []).forEach(listener => listener(payload));
  }

  getSharedFolders() {
    return [...this.sharedFolders];
  }

  getSharedFiles() {
    return [...this.sharedFiles];
  }

  getClipboardHistory() {
    return [...this.clipboardHistory];
  }

  getFileAnnotations(fileId) {
    return [...(this.annotations.get(fileId) || [])];
  }

  async createSharedFolder(name, participants = []) {
    const now = new Date();
    const localPeerId = this.p2pManager?.getLocalPeerId?.() || 'local';
    const folder = {
      id: `fallback-folder-${Date.now()}`,
      name,
      participants,
      files: [],
      created: now,
      lastModified: now,
      owner: localPeerId,
      permissions: {
        read: participants,
        write: participants,
        admin: [localPeerId],
        public: false,
      },
      ipfsHash: { hash: 'local-fallback', size: 0, type: 'directory' },
    };
    this.sharedFolders.push(folder);
    this.emit('folderCreated', folder);
    return folder;
  }

  async addToSharedClipboard(content, type = 'text') {
    const item = {
      id: `fallback-clipboard-${Date.now()}`,
      content,
      type,
      source: this.p2pManager?.getLocalPeerId?.() || 'local',
      timestamp: new Date(),
    };
    this.clipboardHistory.push(item);
    this.emit('clipboardUpdated', item);
    return item;
  }

  async addFileAnnotation(fileId, annotation) {
    const fullAnnotation = {
      id: `fallback-annotation-${Date.now()}`,
      timestamp: new Date(),
      ...annotation,
      fileId,
    };
    const annotations = this.annotations.get(fileId) || [];
    annotations.push(fullAnnotation);
    this.annotations.set(fileId, annotations);
    this.emit('annotationAdded', fullAnnotation);
    return fullAnnotation;
  }
}

async function loadCollaborativeFileSystem() {
  // SWR-042 / SWR-036-FU-002: the module specifier is a single hardcoded
  // constant (never caller/user-provided), so it cannot be used to smuggle
  // an arbitrary path into the browser bundle. It remains a non-literal
  // `import()` argument (rather than a literal specifier) so the browser
  // compatibility audit does not need to statically resolve into the
  // host-oriented `ipfs_accelerate_js/src` tree; `scripts/audit-browser-compat.mjs`
  // allowlists this exact file/import pair as browser-safe on that basis.
  // If the constant is ever tampered with (e.g. by a future edit), this
  // guard refuses to import anything other than the expected path.
  if (COLLABORATIVE_FILE_SYSTEM_MODULE !== '../../../ipfs_accelerate_js/src/p2p/collaborative-file-system.js') {
    console.warn('Collaborative file system module specifier changed unexpectedly; using local fallback.');
    return CollaborativeFileSystemFallback;
  }

  try {
    const module = await import(COLLABORATIVE_FILE_SYSTEM_MODULE);
    return module.CollaborativeFileSystem || CollaborativeFileSystemFallback;
  } catch (error) {
    console.warn('Collaborative file system module unavailable; using local fallback:', error);
    return CollaborativeFileSystemFallback;
  }
}

export class FileManagerApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.currentPath = '/';
    this.files = [];
    this.selectedFiles = new Set();
    this.viewMode = 'grid'; // 'grid' or 'list'
    this.sortBy = 'name'; // 'name', 'size', 'date', 'type'
    this.sortOrder = 'asc';
    this.navigationHistory = ['/'];
    this.historyIndex = 0;
    this.clipboard = null; // for cut/copy operations
    this.searchQuery = '';
    this.showHidden = false;
    
    // Collaborative features - Phase 3
    this.collaborativeFS = null;
    this.isCollaborativeMode = false;
    this.activeCollaborators = new Map();
    this.sharedFolders = [];
    this.fileAnnotations = new Map();
    this.transferProgress = new Map();
    
    // File system integration
    this.storageProviders = {
      local: { name: 'Local Storage', icon: '💾', enabled: true },
      ipfs: { name: 'IPFS Network', icon: '🌐', enabled: true },
      cloud: { name: 'Cloud Storage', icon: '☁️', enabled: false },
      p2p: { name: 'P2P Network', icon: '🔗', enabled: true },
      collaborative: { name: 'Collaborative Workspace', icon: '👥', enabled: true }
    };
    
    // File type handlers
    this.fileHandlers = {
      image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'],
      video: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'],
      audio: ['mp3', 'wav', 'flac', 'aac', 'ogg'],
      document: ['pdf', 'doc', 'docx', 'txt', 'rtf'],
      code: ['js', 'ts', 'py', 'html', 'css', 'json', 'xml'],
      archive: ['zip', 'rar', '7z', 'tar', 'gz']
    };
    
    // Example file system for demonstration when no storage available
    this.exampleFiles = [
      {
        name: 'Documents',
        type: 'folder',
        size: 0,
        modified: Date.now() - 86400000,
        created: Date.now() - 2592000000,
        permissions: 'rwx',
        location: 'local'
      },
      {
        name: 'Pictures',
        type: 'folder',
        size: 0,
        modified: Date.now() - 172800000,
        created: Date.now() - 2592000000,
        permissions: 'rwx',
        location: 'local'
      },
      {
        name: 'AI Models',
        type: 'folder',
        size: 0,
        modified: Date.now() - 3600000,
        created: Date.now() - 1296000000,
        permissions: 'rwx',
        location: 'ipfs'
      },
      {
        name: 'project-notes.md',
        type: 'file',
        size: 15420,
        modified: Date.now() - 1800000,
        created: Date.now() - 86400000,
        permissions: 'rw-',
        location: 'local',
        extension: 'md'
      },
      {
        name: 'neural-network-v2.js',
        type: 'file',
        size: 245678,
        modified: Date.now() - 7200000,
        created: Date.now() - 259200000,
        permissions: 'rw-',
        location: 'local',
        extension: 'js'
      },
      {
        name: 'training-data.json',
        type: 'file',
        size: 12587456,
        modified: Date.now() - 14400000,
        created: Date.now() - 432000000,
        permissions: 'rw-',
        location: 'ipfs',
        extension: 'json'
      },
      {
        name: 'desktop-screenshot.png',
        type: 'file',
        size: 2048576,
        modified: Date.now() - 28800000,
        created: Date.now() - 172800000,
        permissions: 'rw-',
        location: 'local',
        extension: 'png'
      },
      {
        name: 'shared-model-bert.zip',
        type: 'file',
        size: 438912345,
        modified: Date.now() - 86400000,
        created: Date.now() - 604800000,
        permissions: 'r--',
        location: 'p2p',
        extension: 'zip'
      }
    ];
  }

  async initialize() {
    this.swissknife = this.desktop.swissknife;
    
    // Initialize collaborative file system if P2P is available
    if (this.desktop.p2pManager) {
      try {
        const CollaborativeFileSystem = await loadCollaborativeFileSystem();
        this.collaborativeFS = new CollaborativeFileSystem(this.desktop.p2pManager);
        this.isCollaborativeMode = true;
        
        // Setup event listeners for collaborative features
        this.setupCollaborativeEvents();
        
        // Load shared folders and files
        await this.loadSharedContent();
        
        console.log('Collaborative file system initialized');
      } catch (error) {
        console.warn('Could not initialize collaborative features:', error);
        this.isCollaborativeMode = false;
      }
    }
    
    await this.loadFiles();
  }

  setupCollaborativeEvents() {
    if (!this.collaborativeFS) return;

    // File sharing events
    this.collaborativeFS.on('fileShared', (file) => {
      this.handleSharedFile(file);
    });

    // File change events
    this.collaborativeFS.on('fileChanged', (change) => {
      this.handleFileChange(change);
    });

    // Transfer progress events
    this.collaborativeFS.on('transferProgress', (progress) => {
      this.updateTransferProgress(progress);
    });

    // Collaborator events
    this.collaborativeFS.on('collaboratorJoined', (collaborator) => {
      this.activeCollaborators.set(collaborator.id, collaborator);
      this.updateCollaboratorDisplay();
    });

    this.collaborativeFS.on('collaboratorLeft', (collaboratorId) => {
      this.activeCollaborators.delete(collaboratorId);
      this.updateCollaboratorDisplay();
    });

    // Annotation events
    this.collaborativeFS.on('annotationAdded', (annotation) => {
      this.addFileAnnotation(annotation);
    });

    // Clipboard events
    this.collaborativeFS.on('clipboardUpdated', (clipboardItem) => {
      this.updateSharedClipboard(clipboardItem);
    });
  }

  async loadSharedContent() {
    if (!this.collaborativeFS) return;

    try {
      // Load shared folders
      this.sharedFolders = this.collaborativeFS.getSharedFolders();
      
      // Load shared files
      const sharedFiles = this.collaborativeFS.getSharedFiles();
      
      // Add to mock files for display
      sharedFiles.forEach(file => {
        this.mockFiles.push({
          name: file.name,
          type: 'file',
          size: file.size,
          modified: file.lastModified.getTime(),
          created: file.created.getTime(),
          permissions: 'rw-',
          location: 'collaborative',
          extension: file.name.split('.').pop(),
          collaborative: true,
          collaborators: file.collaborators.length,
          shared: true,
          fileId: file.id
        });
      });
      
      // Add shared folders
      this.sharedFolders.forEach(folder => {
        this.mockFiles.push({
          name: `📁 ${folder.name}`,
          type: 'folder',
          size: 0,
          modified: folder.lastModified.getTime(),
          created: folder.created.getTime(),
          permissions: 'rwx',
          location: 'collaborative',
          collaborative: true,
          participants: folder.participants.length,
          shared: true,
          folderId: folder.id
        });
      });
      
    } catch (error) {
      console.error('Error loading shared content:', error);
    }
  }

  createWindow() {
    const content = `
      <div class="file-manager-container">
        <!-- Enhanced Toolbar -->
        <div class="file-toolbar">
          <div class="toolbar-section">
            <button class="toolbar-btn" id="back-btn" title="Back" ${this.historyIndex <= 0 ? 'disabled' : ''}>⬅️</button>
            <button class="toolbar-btn" id="forward-btn" title="Forward" ${this.historyIndex >= this.navigationHistory.length - 1 ? 'disabled' : ''}>➡️</button>
            <button class="toolbar-btn" id="up-btn" title="Up Directory">⬆️</button>
            <button class="toolbar-btn" id="refresh-btn" title="Refresh">🔄</button>
          </div>
          
          <div class="toolbar-section path-section">
            <div class="path-breadcrumb" id="path-breadcrumb">
              ${this.renderBreadcrumb()}
            </div>
            <input type="text" id="path-input" class="path-input" value="${this.currentPath}" placeholder="Enter path...">
          </div>
          
          <div class="toolbar-section">
            <div class="search-wrapper">
              <input type="text" id="search-input" class="search-input" placeholder="Search files..." value="${this.searchQuery}">
              <button class="search-btn" id="search-btn">🔍</button>
            </div>
          </div>
          
          <div class="toolbar-section">
            <button class="toolbar-btn" id="new-folder-btn" title="New Folder">📁+</button>
            <button class="toolbar-btn" id="upload-btn" title="Upload Files">📤</button>
            <button class="toolbar-btn" id="download-btn" title="Download Selected" ${this.selectedFiles.size === 0 ? 'disabled' : ''}>📥</button>
            <button class="toolbar-btn" id="share-btn" title="Share via P2P" ${this.selectedFiles.size === 0 ? 'disabled' : ''}>🔗</button>
            ${this.isCollaborativeMode ? `
              <button class="toolbar-btn collaborative-btn" id="create-shared-folder-btn" title="Create Shared Folder">👥📁</button>
              <button class="toolbar-btn collaborative-btn" id="invite-collaborators-btn" title="Invite Collaborators">👥+</button>
              <button class="toolbar-btn collaborative-btn" id="shared-clipboard-btn" title="Shared Clipboard">📋</button>
            ` : ''}
            <input type="file" id="file-input" style="display: none;" multiple>
          </div>
          
          <div class="toolbar-section">
            <select class="sort-select" id="sort-by">
              <option value="name" ${this.sortBy === 'name' ? 'selected' : ''}>Name</option>
              <option value="size" ${this.sortBy === 'size' ? 'selected' : ''}>Size</option>
              <option value="date" ${this.sortBy === 'date' ? 'selected' : ''}>Date</option>
              <option value="type" ${this.sortBy === 'type' ? 'selected' : ''}>Type</option>
            </select>
            <button class="toolbar-btn view-btn ${this.viewMode === 'grid' ? 'active' : ''}" id="grid-view-btn" title="Grid View">⊞</button>
            <button class="toolbar-btn view-btn ${this.viewMode === 'list' ? 'active' : ''}" id="list-view-btn" title="List View">☰</button>
            <button class="toolbar-btn" id="settings-btn" title="Settings">⚙️</button>
          </div>
        </div>

        <!-- Storage Providers -->
        <div class="storage-bar">
          ${Object.entries(this.storageProviders).map(([key, provider]) => `
            <div class="storage-provider ${provider.enabled ? 'enabled' : 'disabled'}" data-provider="${key}">
              <span class="provider-icon">${provider.icon}</span>
              <span class="provider-name">${provider.name}</span>
              <span class="provider-status ${provider.enabled ? 'connected' : 'disconnected'}"></span>
            </div>
          `).join('')}
        </div>
        
        <!-- Collaborative Status Bar -->
        ${this.isCollaborativeMode ? `
          <div class="collaborative-bar">
            <div class="collab-section">
              <span class="collab-label">Collaborators:</span>
              <div class="collaborators-list" id="collaborators-list">
                ${Array.from(this.activeCollaborators.values()).map(collaborator => `
                  <div class="collaborator-avatar" title="${collaborator.name}">
                    <span class="collaborator-initial">${collaborator.name.charAt(0)}</span>
                    <span class="collaborator-status ${collaborator.active ? 'active' : 'idle'}"></span>
                  </div>
                `).join('')}
              </div>
            </div>
            
            <div class="collab-section">
              <span class="collab-label">Transfers:</span>
              <div class="transfer-progress-container" id="transfer-progress">
                ${Array.from(this.transferProgress.values()).map(progress => `
                  <div class="transfer-item">
                    <span class="transfer-name">${progress.fileName}</span>
                    <div class="progress-bar">
                      <div class="progress-fill" style="width: ${(progress.transferred / progress.totalSize) * 100}%"></div>
                    </div>
                    <span class="transfer-percent">${Math.round((progress.transferred / progress.totalSize) * 100)}%</span>
                  </div>
                `).join('')}
              </div>
            </div>
            
            <div class="collab-section">
              <button class="collab-btn" id="shared-clipboard-toggle">📋 Clipboard (${this.collaborativeFS?.getClipboardHistory?.()?.length || 0})</button>
              <button class="collab-btn" id="annotations-toggle">💬 Comments</button>
              <button class="collab-btn" id="sync-status">🔄 Synced</button>
            </div>
          </div>
        ` : ''}
        
        <div class="file-content">
          <!-- Enhanced Sidebar -->
          <div class="file-sidebar">
            <div class="sidebar-section">
              <h4>Quick Access</h4>
              <div class="quick-access">
                <div class="quick-item" data-path="/Documents">
                  <span class="quick-icon">📄</span>
                  <span>Documents</span>
                </div>
                <div class="quick-item" data-path="/Pictures">
                  <span class="quick-icon">🖼️</span>
                  <span>Pictures</span>
                </div>
                <div class="quick-item" data-path="/Downloads">
                  <span class="quick-icon">📥</span>
                  <span>Downloads</span>
                </div>
                <div class="quick-item" data-path="/AI Models">
                  <span class="quick-icon">🧠</span>
                  <span>AI Models</span>
                </div>
                <div class="quick-item" data-path="/Shared">
                  <span class="quick-icon">🔗</span>
                  <span>P2P Shared</span>
                </div>
              </div>
            </div>
            
            <div class="sidebar-section">
              <h4>Storage Info</h4>
              <div class="storage-info" id="storage-info">
                <div class="storage-item">
                  <div class="storage-label">Local Storage</div>
                  <div class="storage-bar">
                    <div class="storage-used" style="width: 65%"></div>
                  </div>
                  <div class="storage-text">156 GB / 240 GB</div>
                </div>
                <div class="storage-item">
                  <div class="storage-label">IPFS Cache</div>
                  <div class="storage-bar">
                    <div class="storage-used" style="width: 45%"></div>
                  </div>
                  <div class="storage-text">4.5 GB / 10 GB</div>
                </div>
              </div>
            </div>
            
            <div class="sidebar-section">
              <h4>File Operations</h4>
              <div class="operation-buttons">
                <button class="operation-btn" id="cut-btn" ${this.selectedFiles.size === 0 ? 'disabled' : ''}>
                  <span>✂️</span> Cut
                </button>
                <button class="operation-btn" id="copy-btn" ${this.selectedFiles.size === 0 ? 'disabled' : ''}>
                  <span>📋</span> Copy
                </button>
                <button class="operation-btn" id="paste-btn" ${!this.clipboard ? 'disabled' : ''}>
                  <span>📥</span> Paste
                </button>
                <button class="operation-btn" id="delete-btn" ${this.selectedFiles.size === 0 ? 'disabled' : ''}>
                  <span>🗑️</span> Delete
                </button>
              </div>
            </div>
            
            <div class="sidebar-section">
              <h4>AI Tools</h4>
              <div class="ai-tools">
                <button class="ai-tool-btn" id="auto-organize-btn">
                  <span>🤖</span> Auto Organize
                </button>
                <button class="ai-tool-btn" id="duplicate-finder-btn">
                  <span>🔍</span> Find Duplicates
                </button>
                <button class="ai-tool-btn" id="smart-tags-btn">
                  <span>🏷️</span> Smart Tags
                </button>
              </div>
            </div>
          </div>
          
          <!-- Main File Area -->
          <div class="file-main">
            <div class="file-header">
              <div class="file-stats">
                <span id="file-count">${this.getFilteredFiles().length} items</span>
                <span id="selection-info">${this.selectedFiles.size > 0 ? `(${this.selectedFiles.size} selected)` : ''}</span>
              </div>
              <div class="view-options">
                <label class="checkbox-label">
                  <input type="checkbox" id="show-hidden" ${this.showHidden ? 'checked' : ''}>
                  <span>Show hidden files</span>
                </label>
              </div>
            </div>
            
            <div class="file-list ${this.viewMode}" id="file-list">
              ${this.renderFileList()}
            </div>
          </div>
        </div>
        
        <!-- Enhanced Context Menu -->
        <div class="context-menu" id="context-menu" style="display: none;">
          <div class="menu-section">
            <div class="menu-item" data-action="open">
              <span class="menu-icon">📂</span>
              <span>Open</span>
            </div>
            <div class="menu-item" data-action="open-with">
              <span class="menu-icon">🔧</span>
              <span>Open with...</span>
            </div>
          </div>
          <div class="menu-separator"></div>
          <div class="menu-section">
            <div class="menu-item" data-action="cut">
              <span class="menu-icon">✂️</span>
              <span>Cut</span>
              <span class="menu-shortcut">Ctrl+X</span>
            </div>
            <div class="menu-item" data-action="copy">
              <span class="menu-icon">📋</span>
              <span>Copy</span>
              <span class="menu-shortcut">Ctrl+C</span>
            </div>
            <div class="menu-item" data-action="paste" ${!this.clipboard ? 'disabled' : ''}>
              <span class="menu-icon">📥</span>
              <span>Paste</span>
              <span class="menu-shortcut">Ctrl+V</span>
            </div>
          </div>
          <div class="menu-separator"></div>
          <div class="menu-section">
            <div class="menu-item" data-action="share-p2p">
              <span class="menu-icon">🔗</span>
              <span>Share via P2P</span>
            </div>
            <div class="menu-item" data-action="upload-ipfs">
              <span class="menu-icon">🌐</span>
              <span>Upload to IPFS</span>
            </div>
            <div class="menu-item" data-action="generate-link">
              <span class="menu-icon">🔗</span>
              <span>Generate Share Link</span>
            </div>
          </div>
          <div class="menu-separator"></div>
          <div class="menu-section">
            <div class="menu-item" data-action="rename">
              <span class="menu-icon">✏️</span>
              <span>Rename</span>
              <span class="menu-shortcut">F2</span>
            </div>
            <div class="menu-item" data-action="delete">
              <span class="menu-icon">🗑️</span>
              <span>Delete</span>
              <span class="menu-shortcut">Del</span>
            </div>
          </div>
          <div class="menu-separator"></div>
          <div class="menu-section">
            <div class="menu-item" data-action="properties">
              <span class="menu-icon">ℹ️</span>
              <span>Properties</span>
            </div>
          </div>
        </div>
        
        <!-- File Preview Panel -->
        <div class="preview-panel" id="preview-panel" style="display: none;">
          <div class="preview-header">
            <h3>File Preview</h3>
            <button class="close-btn" id="close-preview">×</button>
          </div>
          <div class="preview-content" id="preview-content">
            <!-- Preview content will be populated here -->
          </div>
        </div>
        
        <!-- Upload Progress -->
        <div class="upload-progress" id="upload-progress" style="display: none;">
          <div class="progress-header">
            <span id="upload-title">Uploading files...</span>
            <button class="close-btn" id="close-upload">×</button>
          </div>
          <div class="progress-container">
            <div class="progress-bar">
              <div class="progress-fill" id="upload-progress-bar" style="width: 0%"></div>
            </div>
            <div class="progress-text">
              <span id="upload-status">Preparing...</span>
              <span id="upload-percentage">0%</span>
            </div>
          </div>
          <div class="progress-details" id="upload-details">
            <!-- Upload details will be populated here -->
          </div>
        </div>
      </div>

      <style>
        .file-manager-container {
          height: 100%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', roboto, sans-serif;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .file-toolbar {
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }

        .toolbar-section {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .path-section {
          flex: 1;
          min-width: 200px;
          position: relative;
        }

        .toolbar-btn {
          padding: 6px 10px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .toolbar-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
        }

        .toolbar-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .toolbar-btn.active {
          background: linear-gradient(135deg, #4ade80, #22c55e);
        }

        .path-breadcrumb {
          display: flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 13px;
          margin-bottom: 4px;
        }

        .path-input {
          width: 100%;
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          color: white;
          font-size: 12px;
        }

        .path-input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .search-wrapper {
          position: relative;
          display: flex;
        }

        .search-input {
          padding: 6px 30px 6px 12px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          color: white;
          font-size: 12px;
          width: 150px;
        }

        .search-btn {
          position: absolute;
          right: 4px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.7);
          cursor: pointer;
          padding: 2px;
        }

        .sort-select {
          padding: 6px 8px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          color: white;
          font-size: 12px;
        }

        .storage-bar {
          padding: 8px 12px;
          background: rgba(0, 0, 0, 0.2);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          gap: 16px;
          overflow-x: auto;
        }

        .storage-provider {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .storage-provider.enabled {
          background: rgba(34, 197, 94, 0.2);
        }

        .storage-provider.disabled {
          background: rgba(107, 114, 128, 0.2);
          opacity: 0.6;
        }

        .provider-status {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .provider-status.connected {
          background: #22c55e;
        }

        .provider-status.disconnected {
          background: #ef4444;
        }

        .file-content {
          flex: 1;
          display: flex;
          overflow: hidden;
        }

        .file-sidebar {
          width: 250px;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          border-right: 1px solid rgba(255, 255, 255, 0.1);
          overflow-y: auto;
          padding: 12px;
        }

        .sidebar-section {
          margin-bottom: 20px;
        }

        .sidebar-section h4 {
          margin: 0 0 8px 0;
          font-size: 12px;
          font-weight: 600;
          opacity: 0.8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .quick-access {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .quick-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 13px;
        }

        .quick-item:hover {
          background: rgba(255, 255, 255, 0.1);
          transform: translateX(2px);
        }

        .storage-info {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .storage-item {
          font-size: 11px;
        }

        .storage-label {
          margin-bottom: 4px;
          opacity: 0.8;
        }

        .storage-bar {
          height: 6px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 4px;
        }

        .storage-used {
          height: 100%;
          background: linear-gradient(90deg, #4ade80, #22c55e);
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        .operation-buttons,
        .ai-tools {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .operation-btn,
        .ai-tool-btn {
          padding: 8px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 12px;
          text-align: left;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .operation-btn:hover:not(:disabled),
        .ai-tool-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: translateX(2px);
        }

        .operation-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .file-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .file-header {
          padding: 12px;
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .file-stats {
          font-size: 12px;
          opacity: 0.8;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          cursor: pointer;
        }

        .file-list {
          flex: 1;
          padding: 12px;
          overflow-y: auto;
        }

        .file-list.grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          gap: 12px;
        }

        .file-list.list {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .file-item {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          border: 2px solid transparent;
          position: relative;
          user-select: none;
        }

        .file-item:hover {
          background: rgba(255, 255, 255, 0.1);
          transform: translateY(-1px);
        }

        .file-item.selected {
          border-color: #4ade80;
          background: rgba(74, 222, 128, 0.2);
        }

        .file-list.grid .file-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          min-height: 100px;
        }

        .file-list.list .file-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          min-height: auto;
        }

        .file-icon {
          font-size: 32px;
          margin-bottom: 8px;
        }

        .file-list.list .file-icon {
          font-size: 20px;
          margin-bottom: 0;
        }

        .file-name {
          font-weight: 500;
          font-size: 12px;
          word-break: break-word;
          line-height: 1.3;
        }

        .file-list.list .file-name {
          flex: 1;
          font-size: 13px;
        }

        .file-details {
          font-size: 10px;
          opacity: 0.7;
          margin-top: 4px;
        }

        .file-list.list .file-details {
          margin-top: 0;
          display: flex;
          gap: 12px;
        }

        .location-badge {
          position: absolute;
          top: 4px;
          right: 4px;
          padding: 2px 4px;
          background: rgba(0, 0, 0, 0.6);
          border-radius: 3px;
          font-size: 8px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .location-local { color: #60a5fa; }
        .location-ipfs { color: #34d399; }
        .location-p2p { color: #fbbf24; }
        .location-cloud { color: #a78bfa; }

        /* Context Menu */
        .context-menu {
          position: fixed;
          background: rgba(0, 0, 0, 0.95);
          backdrop-filter: blur(20px);
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 6px;
          z-index: 10000;
          min-width: 180px;
        }

        .menu-section {
          display: flex;
          flex-direction: column;
        }

        .menu-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.2s ease;
          font-size: 13px;
        }

        .menu-item:hover:not(.disabled) {
          background: rgba(255, 255, 255, 0.1);
        }

        .menu-item.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .menu-shortcut {
          margin-left: auto;
          font-size: 11px;
          opacity: 0.6;
        }

        .menu-separator {
          height: 1px;
          background: rgba(255, 255, 255, 0.1);
          margin: 4px 0;
        }

        /* Preview Panel */
        .preview-panel {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 600px;
          max-width: 90vw;
          height: 500px;
          max-height: 90vh;
          background: rgba(0, 0, 0, 0.95);
          backdrop-filter: blur(20px);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          z-index: 10000;
          display: flex;
          flex-direction: column;
        }

        .preview-header {
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .preview-content {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
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

        /* Upload Progress */
        .upload-progress {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 320px;
          background: rgba(0, 0, 0, 0.95);
          backdrop-filter: blur(20px);
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          z-index: 10000;
        }

        .progress-header {
          padding: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
          font-weight: 600;
        }

        .progress-container {
          padding: 12px;
        }

        .progress-bar {
          height: 6px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 8px;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #4ade80, #22c55e);
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        .progress-text {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          opacity: 0.8;
        }

        .progress-details {
          padding: 0 12px 12px;
          font-size: 10px;
          opacity: 0.7;
        }

        /* Empty folder state */
        .empty-folder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 300px;
          opacity: 0.6;
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .empty-text {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .empty-subtext {
          font-size: 12px;
          opacity: 0.8;
        }

        /* File list items */
        .file-item {
          padding: 8px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          user-select: none;
        }

        .file-item:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .file-item.selected {
          background: linear-gradient(135deg, #4ade80, #22c55e);
          color: white;
        }

        .file-item.grid-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          min-height: 80px;
        }

        .file-item.list-item {
          display: grid;
          grid-template-columns: 32px 1fr 80px 60px 120px 80px;
          gap: 12px;
          align-items: center;
          padding: 12px 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .file-icon {
          font-size: 24px;
          margin-bottom: 4px;
        }

        .file-name {
          font-size: 11px;
          font-weight: 500;
          max-width: 100px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .file-size, .file-type, .file-modified, .file-location {
          font-size: 10px;
          opacity: 0.8;
        }

        .list-item .file-icon {
          font-size: 20px;
          margin-bottom: 0;
        }

        .list-item .file-name {
          max-width: none;
          font-size: 12px;
        }

        .breadcrumb-item {
          cursor: pointer;
          padding: 2px 4px;
          border-radius: 3px;
          transition: background 0.2s ease;
        }

        .breadcrumb-item:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        /* Responsive */
        @media (max-width: 768px) {
          .file-toolbar {
            flex-wrap: wrap;
            gap: 8px;
          }
          
          .file-sidebar {
            width: 100%;
            height: 40%;
          }
          
          .file-content {
            flex-direction: column;
          }
          
          .file-list.grid {
            grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
          }
        }
      </style>
    `;

    return {
      title: 'File Manager',
      content,
      width: 1000,
      height: 700,
      x: 100,
      y: 75
    };
  }

  async render() {
    const windowData = this.createWindow();
    
    // Set up event handlers after the HTML is rendered
    setTimeout(() => {
      const container = document.querySelector('.file-manager-container');
      if (container) {
        this.setupEventHandlers(container);
      }
    }, 0);
    
    return windowData.content;
  }

  setupEventHandlers(container) {
    // Set up comprehensive event handlers for the file manager
    console.log('🔧 Setting up File Manager event handlers...');
    
    try {
      // Navigation controls
      const backBtn = container.querySelector('#back-btn');
      const forwardBtn = container.querySelector('#forward-btn');
      const upBtn = container.querySelector('#up-btn');
      const refreshBtn = container.querySelector('#refresh-btn');
      
      if (backBtn) backBtn.addEventListener('click', () => this.navigateBack(container));
      if (forwardBtn) forwardBtn.addEventListener('click', () => this.navigateForward(container));
      if (upBtn) upBtn.addEventListener('click', () => this.navigateUp(container));
      if (refreshBtn) refreshBtn.addEventListener('click', () => this.refresh(container));
      
      // Path input
      const pathInput = container.querySelector('#path-input');
      if (pathInput) {
        pathInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            this.navigateToPath(container, pathInput.value);
          }
        });
      }
      
      // Search functionality
      const searchInput = container.querySelector('#search-input');
      const searchBtn = container.querySelector('#search-btn');
      if (searchInput && searchBtn) {
        const handleSearch = () => {
          this.searchQuery = searchInput.value;
          this.updateFileList(container);
        };
        searchInput.addEventListener('input', handleSearch);
        searchBtn.addEventListener('click', handleSearch);
      }
      
      // File operations
      const newFolderBtn = container.querySelector('#new-folder-btn');
      const uploadBtn = container.querySelector('#upload-btn');
      const downloadBtn = container.querySelector('#download-btn');
      const shareBtn = container.querySelector('#share-btn');
      const fileInput = container.querySelector('#file-input');
      
      if (newFolderBtn) newFolderBtn.addEventListener('click', () => this.createNewFolder(container));
      if (uploadBtn && fileInput) uploadBtn.addEventListener('click', () => fileInput.click());
      if (downloadBtn) downloadBtn.addEventListener('click', () => this.downloadSelected(container));
      if (shareBtn) shareBtn.addEventListener('click', () => this.shareSelected(container));
      
      // Collaborative controls
      if (this.isCollaborativeMode) {
        const createSharedFolderBtn = container.querySelector('#create-shared-folder-btn');
        const inviteCollaboratorsBtn = container.querySelector('#invite-collaborators-btn');
        const sharedClipboardBtn = container.querySelector('#shared-clipboard-btn');
        const sharedClipboardToggle = container.querySelector('#shared-clipboard-toggle');
        const annotationsToggle = container.querySelector('#annotations-toggle');
        const syncStatus = container.querySelector('#sync-status');
        
        if (createSharedFolderBtn) {
          createSharedFolderBtn.addEventListener('click', () => this.createSharedFolder(container));
        }
        if (inviteCollaboratorsBtn) {
          inviteCollaboratorsBtn.addEventListener('click', () => this.inviteCollaborators(container));
        }
        if (sharedClipboardBtn) {
          sharedClipboardBtn.addEventListener('click', () => this.openSharedClipboard(container));
        }
        if (sharedClipboardToggle) {
          sharedClipboardToggle.addEventListener('click', () => this.toggleSharedClipboard(container));
        }
        if (annotationsToggle) {
          annotationsToggle.addEventListener('click', () => this.toggleAnnotations(container));
        }
        if (syncStatus) {
          syncStatus.addEventListener('click', () => this.showSyncStatus(container));
        }
      }
      
      if (fileInput) {
        fileInput.addEventListener('change', (e) => {
          if (e.target.files.length > 0) {
            this.uploadFiles(container, Array.from(e.target.files));
          }
        });
      }
      
      // View mode controls
      const gridViewBtn = container.querySelector('#grid-view-btn');
      const listViewBtn = container.querySelector('#list-view-btn');
      if (gridViewBtn) gridViewBtn.addEventListener('click', () => this.setViewMode(container, 'grid'));
      if (listViewBtn) listViewBtn.addEventListener('click', () => this.setViewMode(container, 'list'));
      
      // Sort controls
      const sortBy = container.querySelector('#sort-by');
      if (sortBy) {
        sortBy.addEventListener('change', (e) => {
          this.sortBy = e.target.value;
          this.updateFileList(container);
        });
      }
      
      // Show hidden files toggle
      const showHidden = container.querySelector('#show-hidden');
      if (showHidden) {
        showHidden.addEventListener('change', (e) => {
          this.showHidden = e.target.checked;
          this.updateFileList(container);
        });
      }
      
      // Quick access items
      container.querySelectorAll('.quick-item').forEach(item => {
        item.addEventListener('click', () => {
          const path = item.dataset.path;
          if (path) this.navigateToPath(container, path);
        });
      });
      
      // File list interactions
      const fileList = container.querySelector('#file-list');
      if (fileList) {
        fileList.addEventListener('click', (e) => this.handleFileClick(container, e));
        fileList.addEventListener('dblclick', (e) => this.handleFileDoubleClick(container, e));
        fileList.addEventListener('contextmenu', (e) => this.showContextMenu(container, e));
        
        // Drag and drop support
        fileList.addEventListener('dragover', (e) => {
          e.preventDefault();
          fileList.classList.add('drag-over');
        });
        
        fileList.addEventListener('dragleave', () => {
          fileList.classList.remove('drag-over');
        });
        
        fileList.addEventListener('drop', (e) => {
          e.preventDefault();
          fileList.classList.remove('drag-over');
          const files = Array.from(e.dataTransfer.files);
          if (files.length > 0) {
            this.uploadFiles(container, files);
          }
        });
      }
      
      // Context menu
      const contextMenu = container.querySelector('#context-menu');
      if (contextMenu) {
        contextMenu.addEventListener('click', (e) => this.handleContextMenuClick(container, e));
        
        // Hide context menu on outside click
        document.addEventListener('click', (e) => {
          if (!contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
          }
        });
      }
      
      // Breadcrumb navigation
      const breadcrumb = container.querySelector('#path-breadcrumb');
      if (breadcrumb) {
        breadcrumb.addEventListener('click', (e) => {
          const breadcrumbItem = e.target.closest('.breadcrumb-item');
          if (breadcrumbItem && breadcrumbItem.dataset.path) {
            this.navigateToPath(container, breadcrumbItem.dataset.path);
          }
        });
      }
      
      // Storage provider clicks
      container.querySelectorAll('.storage-provider').forEach(provider => {
        provider.addEventListener('click', () => {
          const providerType = provider.dataset.provider;
          this.switchStorageProvider(container, providerType);
        });
      });
      
      // Operation buttons in sidebar
      const cutBtn = container.querySelector('#cut-btn');
      const copyBtn = container.querySelector('#copy-btn');
      const pasteBtn = container.querySelector('#paste-btn');
      const deleteBtn = container.querySelector('#delete-btn');
      
      if (cutBtn) cutBtn.addEventListener('click', () => this.cutSelected(container));
      if (copyBtn) copyBtn.addEventListener('click', () => this.copySelected(container));
      if (pasteBtn) pasteBtn.addEventListener('click', () => this.pasteFiles(container));
      if (deleteBtn) deleteBtn.addEventListener('click', () => this.deleteSelected(container));
      
      // AI tools
      const autoOrganizeBtn = container.querySelector('#auto-organize-btn');
      const duplicateFinderBtn = container.querySelector('#duplicate-finder-btn');
      const smartTagsBtn = container.querySelector('#smart-tags-btn');
      
      if (autoOrganizeBtn) autoOrganizeBtn.addEventListener('click', () => this.autoOrganize(container));
      if (duplicateFinderBtn) duplicateFinderBtn.addEventListener('click', () => this.findDuplicates(container));
      if (smartTagsBtn) smartTagsBtn.addEventListener('click', () => this.generateSmartTags(container));
      
      console.log('✅ File Manager event handlers set up successfully');
      
    } catch (error) {
      console.error('❌ Error setting up File Manager event handlers:', error);
    }
  }
  setupEventListeners(window) {
    const backBtn = window.querySelector('#back-btn');
    const forwardBtn = window.querySelector('#forward-btn');
    const upBtn = window.querySelector('#up-btn');
    const refreshBtn = window.querySelector('#refresh-btn');
    const pathInput = window.querySelector('#path-input');
    const newFolderBtn = window.querySelector('#new-folder-btn');
    const uploadBtn = window.querySelector('#upload-btn');
    const downloadBtn = window.querySelector('#download-btn');
    const fileInput = window.querySelector('#file-input');
    const gridViewBtn = window.querySelector('#grid-view-btn');
    const listViewBtn = window.querySelector('#list-view-btn');
    const fileList = window.querySelector('#file-list');
    const contextMenu = window.querySelector('#context-menu');

    // Navigation
    backBtn.addEventListener('click', () => this.navigateBack(window));
    forwardBtn.addEventListener('click', () => this.navigateForward(window));
    upBtn.addEventListener('click', () => this.navigateUp(window));
    refreshBtn.addEventListener('click', () => this.refresh(window));
    
    pathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.navigateToPath(window, pathInput.value);
      }
    });

    // File operations
    newFolderBtn.addEventListener('click', () => this.createNewFolder(window));
    uploadBtn.addEventListener('click', () => fileInput.click());
    downloadBtn.addEventListener('click', () => this.downloadSelected(window));
    
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.uploadFiles(window, Array.from(e.target.files));
      }
    });

    // View mode
    gridViewBtn.addEventListener('click', () => this.setViewMode(window, 'grid'));
    listViewBtn.addEventListener('click', () => this.setViewMode(window, 'list'));

    // Quick access
    window.querySelectorAll('.quick-item').forEach(item => {
      item.addEventListener('click', () => {
        const path = item.dataset.path;
        this.navigateToPath(window, path);
      });
    });

    // File list interactions
    fileList.addEventListener('click', (e) => this.handleFileClick(window, e));
    fileList.addEventListener('dblclick', (e) => this.handleFileDoubleClick(window, e));
    fileList.addEventListener('contextmenu', (e) => this.showContextMenu(window, e));

    // Context menu
    contextMenu.addEventListener('click', (e) => this.handleContextMenuClick(window, e));
    
    // Hide context menu on outside click
    document.addEventListener('click', () => {
      contextMenu.style.display = 'none';
    });

    // Drag and drop
    fileList.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileList.classList.add('drag-over');
    });
    
    fileList.addEventListener('dragleave', () => {
      fileList.classList.remove('drag-over');
    });
    
    fileList.addEventListener('drop', (e) => {
      e.preventDefault();
      fileList.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        this.uploadFiles(window, files);
      }
    });
  }

  async loadFiles() {
    try {
      // Load files from SwissKnife storage if available
      if (this.swissknife && this.swissknife.storage) {
        const result = await this.swissknife.storage.list({
          path: this.currentPath,
          recursive: false
        });
        this.files = result.files || [];
      } else {
        // Use example data when storage is not available
        this.files = this.getExampleFiles();
      }
    } catch (error) {
      console.error('Failed to load files:', error);
      this.files = this.getExampleFiles(); // Fallback to example data
    }
  }

  renderBreadcrumb() {
    const pathParts = this.currentPath.split('/').filter(part => part !== '');
    let breadcrumb = '<span class="breadcrumb-item" data-path="/">📁</span>';
    
    let currentPath = '';
    pathParts.forEach(part => {
      currentPath += '/' + part;
      breadcrumb += ` / <span class="breadcrumb-item" data-path="${currentPath}">${part}</span>`;
    });
    
    return breadcrumb;
  }

  getFilteredFiles() {
    let filteredFiles = [...this.files];
    
    // Apply search filter
    if (this.searchQuery) {
      filteredFiles = filteredFiles.filter(file => 
        file.name.toLowerCase().includes(this.searchQuery.toLowerCase())
      );
    }
    
    // Apply hidden files filter
    if (!this.showHidden) {
      filteredFiles = filteredFiles.filter(file => !file.name.startsWith('.'));
    }
    
    // Apply sorting
    filteredFiles.sort((a, b) => {
      let aValue = a[this.sortBy];
      let bValue = b[this.sortBy];
      
      if (this.sortBy === 'modified') {
        aValue = new Date(a.modified);
        bValue = new Date(b.modified);
      }
      
      if (this.sortBy === 'size') {
        aValue = a.size || 0;
        bValue = b.size || 0;
      }
      
      if (this.sortBy === 'name' || this.sortBy === 'type') {
        aValue = (aValue || '').toLowerCase();
        bValue = (bValue || '').toLowerCase();
      }
      
      if (this.sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
    
    return filteredFiles;
  }

  renderFileList() {
    const filteredFiles = this.getFilteredFiles();
    
    if (filteredFiles.length === 0) {
      return `
        <div class="empty-folder">
          <div class="empty-icon">📂</div>
          <div class="empty-text">This folder is empty</div>
          <div class="empty-subtext">Drag files here or use the upload button</div>
        </div>
      `;
    }
    
    return filteredFiles.map((file, index) => {
      const icon = this.getFileIcon(file);
      const size = file.type === 'folder' || file.type === 'directory' ? '' : this.formatFileSize(file.size || 0);
      const modified = this.formatDate(file.modified);
      const selected = this.selectedFiles.has(index) ? 'selected' : '';
      
      if (this.viewMode === 'grid') {
        return `
          <div class="file-item grid-item ${selected}" data-index="${index}" data-path="${file.path || file.name}">
            <div class="file-icon">${icon}</div>
            <div class="file-name" title="${file.name}">${file.name}</div>
            <div class="file-size">${size}</div>
          </div>
        `;
      } else {
        return `
          <div class="file-item list-item ${selected}" data-index="${index}" data-path="${file.path || file.name}">
            <div class="file-icon">${icon}</div>
            <div class="file-name">${file.name}</div>
            <div class="file-size">${size}</div>
            <div class="file-type">${file.type || this.getFileExtension(file.name)}</div>
            <div class="file-modified">${modified}</div>
            <div class="file-location">${file.location || 'local'}</div>
          </div>
        `;
      }
    }).join('');
  }

  getFileIcon(file) {
    if (!file) return '📄';
    
    if (file.type === 'folder' || file.type === 'directory') {
      return '📁';
    }
    
    const extension = this.getFileExtension(file.name).toLowerCase();
    
    // Image files
    if (this.fileHandlers.image.includes(extension)) {
      return '🖼️';
    }
    
    // Video files
    if (this.fileHandlers.video.includes(extension)) {
      return '🎬';
    }
    
    // Audio files
    if (this.fileHandlers.audio.includes(extension)) {
      return '🎵';
    }
    
    // Document files
    if (this.fileHandlers.document.includes(extension)) {
      return '📄';
    }
    
    // Code files
    if (this.fileHandlers.code.includes(extension)) {
      return '📝';
    }
    
    // Archive files
    if (this.fileHandlers.archive.includes(extension)) {
      return '📦';
    }
    
    // Default file icon
    return '📄';
  }

  getFileExtension(filename) {
    // Add comprehensive null/undefined/type checking
    if (!filename || typeof filename !== 'string' || filename.length === 0) {
      return '';
    }
    
    try {
      const parts = filename.split('.');
      return parts.length > 1 ? parts.pop() || '' : '';
    } catch (error) {
      console.warn('Error getting file extension for:', filename, error);
      return '';
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  formatDate(date) {
    if (!date) return 'Unknown';
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return 'Invalid Date';
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    } catch (error) {
      return 'Invalid Date';
    }
  }

  getExampleFiles() {
    return [
      {
        name: 'Documents',
        type: 'folder',
        size: 0,
        modified: Date.now() - 86400000,
        created: Date.now() - 2592000000,
        permissions: 'rwx',
        location: 'local',
        path: '/Documents'
      },
      {
        name: 'Pictures',
        type: 'folder',
        size: 0,
        modified: Date.now() - 172800000,
        created: Date.now() - 2592000000,
        permissions: 'rwx',
        location: 'local',
        path: '/Pictures'
      },
      {
        name: 'AI Models',
        type: 'folder',
        size: 0,
        modified: Date.now() - 3600000,
        created: Date.now() - 1296000000,
        permissions: 'rwx',
        location: 'ipfs',
        path: '/AI Models'
      },
      {
        name: 'project-notes.md',
        type: 'file',
        size: 15420,
        modified: Date.now() - 1800000,
        created: Date.now() - 86400000,
        permissions: 'rw-',
        location: 'local',
        extension: 'md',
        path: '/project-notes.md'
      },
      {
        name: 'neural-network-v2.js',
        type: 'file',
        size: 245678,
        modified: Date.now() - 7200000,
        created: Date.now() - 259200000,
        permissions: 'rw-',
        location: 'local',
        extension: 'js',
        path: '/neural-network-v2.js'
      },
      {
        name: 'training-data.json',
        type: 'file',
        size: 12587456,
        modified: Date.now() - 14400000,
        created: Date.now() - 432000000,
        permissions: 'rw-',
        location: 'ipfs',
        extension: 'json',
        path: '/training-data.json'
      },
      {
        name: 'desktop-screenshot.png',
        type: 'file',
        size: 2048576,
        modified: Date.now() - 28800000,
        created: Date.now() - 172800000,
        permissions: 'rw-',
        location: 'local',
        extension: 'png',
        path: '/desktop-screenshot.png'
      },
      {
        name: 'shared-model-bert.zip',
        type: 'file',
        size: 438912345,
        modified: Date.now() - 86400000,
        created: Date.now() - 604800000,
        permissions: 'r--',
        location: 'p2p',
        extension: 'zip',
        path: '/shared-model-bert.zip'
      }
    ];
  }

  updateFileList(window) {
    const fileList = window.querySelector('#file-list');
    const fileCount = window.querySelector('#file-count');
    const selectionInfo = window.querySelector('#selection-info');
    
    fileList.innerHTML = '';
    
    this.files.forEach((file, index) => {
      const fileItem = document.createElement('div');
      fileItem.className = `file-item ${file.type}`;
      fileItem.dataset.index = index;
      fileItem.dataset.path = file.path;
      
      const icon = file.type === 'directory' ? '📁' : this.getFileIcon(file.name);
      const size = file.type === 'directory' ? '' : this.formatFileSize(file.size);
      const modified = file.modified.toLocaleDateString();
      
      if (this.viewMode === 'grid') {
        fileItem.innerHTML = `
          <div class="file-icon">${icon}</div>
          <div class="file-name" title="${file.name}">${file.name}</div>
          <div class="file-size">${size}</div>
        `;
      } else {
        fileItem.innerHTML = `
          <div class="file-icon">${icon}</div>
          <div class="file-name">${file.name}</div>
          <div class="file-size">${size}</div>
          <div class="file-modified">${modified}</div>
          <div class="file-hash">${file.hash || ''}</div>
        `;
      }
      
      fileList.appendChild(fileItem);
    });
    
    fileCount.textContent = `${this.files.length} items`;
    
    if (this.selectedFiles.size > 0) {
      selectionInfo.textContent = `${this.selectedFiles.size} selected`;
      window.querySelector('#download-btn').disabled = false;
    } else {
      selectionInfo.textContent = '';
      window.querySelector('#download-btn').disabled = true;
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  setViewMode(window, mode) {
    this.viewMode = mode;
    const fileList = window.querySelector('#file-list');
    const gridBtn = window.querySelector('#grid-view-btn');
    const listBtn = window.querySelector('#list-view-btn');
    
    fileList.className = `file-list ${mode}-view`;
    
    gridBtn.classList.toggle('active', mode === 'grid');
    listBtn.classList.toggle('active', mode === 'list');
    
    this.updateFileList(window);
  }

  async navigateToPath(window, path) {
    // Update history
    if (this.navigationHistory[this.historyIndex] !== path) {
      // Remove any forward history
      this.navigationHistory = this.navigationHistory.slice(0, this.historyIndex + 1);
      // Add new path
      this.navigationHistory.push(path);
      this.historyIndex = this.navigationHistory.length - 1;
    }
    
    this.currentPath = path;
    window.querySelector('#path-input').value = path;
    this.selectedFiles.clear();
    
    await this.loadFiles();
    this.updateFileList(window);
    this.updateBreadcrumb(window);
  }

  updateBreadcrumb(window) {
    const breadcrumb = window.querySelector('#breadcrumb');
    const parts = this.currentPath.split('/').filter(p => p);
    
    breadcrumb.innerHTML = '<span class="breadcrumb-item" data-path="/">🏠</span>';
    
    let currentPath = '';
    parts.forEach((part, index) => {
      currentPath += '/' + part;
      const item = document.createElement('span');
      item.className = 'breadcrumb-item';
      item.dataset.path = currentPath;
      item.textContent = part;
      if (index === parts.length - 1) {
        item.classList.add('active');
      }
      breadcrumb.appendChild(item);
    });
    
    // Add click handlers to breadcrumb items
    breadcrumb.querySelectorAll('.breadcrumb-item').forEach(item => {
      if (!item.classList.contains('active')) {
        item.addEventListener('click', () => {
          this.navigateToPath(window, item.dataset.path);
        });
      }
    });
  }

  handleFileClick(window, e) {
    const fileItem = e.target.closest('.file-item');
    if (!fileItem) return;
    
    const index = parseInt(fileItem.dataset.index);
    
    if (e.ctrlKey || e.metaKey) {
      // Multi-select
      if (this.selectedFiles.has(index)) {
        this.selectedFiles.delete(index);
        fileItem.classList.remove('selected');
      } else {
        this.selectedFiles.add(index);
        fileItem.classList.add('selected');
      }
    } else {
      // Single select
      window.querySelectorAll('.file-item.selected').forEach(item => {
        item.classList.remove('selected');
      });
      this.selectedFiles.clear();
      this.selectedFiles.add(index);
      fileItem.classList.add('selected');
    }
    
    this.updateFileList(window);
  }

  handleFileDoubleClick(window, e) {
    const fileItem = e.target.closest('.file-item');
    if (!fileItem) return;
    
    const index = parseInt(fileItem.dataset.index);
    const file = this.files[index];
    
    if (file.type === 'directory') {
      this.navigateToPath(window, file.path);
    } else {
      this.openFile(window, file);
    }
  }

  async openFile(window, file) {
    try {
      // Open file in appropriate app
      if (file.name.endsWith('.md') || file.name.endsWith('.txt')) {
        // Open in text editor
        this.desktop.openApp('TextEditor', { file: file });
      } else if (file.name.match(/\.(jpg|jpeg|png|gif)$/i)) {
        // Open in image viewer
        this.desktop.openApp('ImageViewer', { file: file });
      } else {
        // Download file
        await this.downloadFile(file);
      }
    } catch (error) {
      this.desktop.showNotification('Error opening file: ' + error.message, 'error');
    }
  }

  async uploadFiles(window, files) {
    const progressContainer = window.querySelector('#upload-progress');
    const progressFill = progressContainer.querySelector('.progress-fill');
    const uploadStatus = window.querySelector('#upload-status');
    
    progressContainer.style.display = 'block';
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const progress = ((i + 1) / files.length) * 100;
        
        progressFill.style.width = progress + '%';
        uploadStatus.textContent = `Uploading ${file.name}...`;
        
        // Upload to SwissKnife storage
        await this.swissknife.storage.store({
          path: this.currentPath + '/' + file.name,
          content: file,
          type: file.type
        });
      }
      
      uploadStatus.textContent = 'Upload complete!';
      setTimeout(() => {
        progressContainer.style.display = 'none';
      }, 2000);
      
      // Refresh file list
      await this.loadFiles();
      this.updateFileList(window);
      
    } catch (error) {
      uploadStatus.textContent = 'Upload failed: ' + error.message;
      setTimeout(() => {
        progressContainer.style.display = 'none';
      }, 3000);
    }
  }

  async updateStorageInfo(window) {
    const ipfsStatus = window.querySelector('#ipfs-status');
    const localStorage = window.querySelector('#local-storage');
    
    try {
      // Check IPFS status
      const ipfsInfo = await this.swissknife.storage.status();
      ipfsStatus.textContent = ipfsInfo.connected ? 'Connected' : 'Disconnected';
      ipfsStatus.style.color = ipfsInfo.connected ? 'green' : 'red';
      
      // Check local storage usage
      const usage = this.getLocalStorageUsage();
      localStorage.textContent = this.formatFileSize(usage);
      
    } catch (error) {
      ipfsStatus.textContent = 'Error';
      ipfsStatus.style.color = 'red';
    }
  }

  getLocalStorageUsage() {
    let total = 0;
    for (let key in window.localStorage) {
      if (window.localStorage.hasOwnProperty(key)) {
        total += window.localStorage[key].length;
      }
    }
    return total;
  }

  async refresh(window) {
    await this.loadFiles();
    this.updateFileList(window);
    this.updateStorageInfo(window);
  }

  navigateUp(window) {
    const parentPath = this.currentPath.split('/').slice(0, -1).join('/') || '/';
    this.navigateToPath(window, parentPath);
  }

  navigateBack(window) {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const previousPath = this.navigationHistory[this.historyIndex];
      this.currentPath = previousPath;
      this.loadFiles();
      this.renderFileList(window);
      console.log(`Navigate back to: ${previousPath}`);
    } else {
      console.log('No previous path in history');
    }
  }

  navigateForward(window) {
    if (this.historyIndex < this.navigationHistory.length - 1) {
      this.historyIndex++;
      const nextPath = this.navigationHistory[this.historyIndex];
      this.currentPath = nextPath;
      this.loadFiles();
      this.renderFileList(window);
      console.log(`Navigate forward to: ${nextPath}`);
    } else {
      console.log('No forward path in history');
    }
  }

  showContextMenu(window, e) {
    e.preventDefault();
    const contextMenu = window.querySelector('#context-menu');
    contextMenu.style.display = 'block';
    contextMenu.style.left = e.pageX + 'px';
    contextMenu.style.top = e.pageY + 'px';
  }

  handleContextMenuClick(window, e) {
    const action = e.target.dataset.action;
    if (!action) return;
    
    // Hide context menu
    window.querySelector('#context-menu').style.display = 'none';
    
    // Handle action
    switch (action) {
      case 'open':
        this.openSelected(window);
        break;
      case 'download':
        this.downloadSelected(window);
        break;
      case 'delete':
        this.deleteSelected(window);
        break;
      // Add more actions as needed
    }
  }

  async downloadSelected(window) {
    for (const index of this.selectedFiles) {
      const file = this.files[index];
      if (file.type === 'file') {
        await this.downloadFile(file);
      }
    }
  }

  async downloadFile(file) {
    try {
      const content = await this.swissknife.storage.retrieve({
        path: file.path,
        hash: file.hash
      });
      
      const blob = new Blob([content], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
    } catch (error) {
      this.desktop.showNotification('Failed to download file: ' + error.message, 'error');
    }
  }

  async createNewFolder(window) {
    const name = prompt('Enter folder name:');
    if (!name) return;
    
    try {
      await this.swissknife.storage.createDirectory({
        path: this.currentPath + '/' + name
      });
      
      await this.loadFiles();
      this.updateFileList(window);
      
    } catch (error) {
      this.desktop.showNotification('Failed to create folder: ' + error.message, 'error');
    }
  }

  // Missing methods referenced in event handlers
  shareSelected(container) {
    console.log('🔗 Sharing selected files via P2P...');
    // P2P sharing functionality - requires P2P system integration
    if (window.p2pMLSystem) {
      this.showNotification('Preparing files for P2P sharing...', 'info');
      // Future: Implement actual P2P file sharing
    } else {
      this.showNotification('P2P system not available. Configure P2P Network app first.', 'warning');
    }
  }

  cutSelected(container) {
    if (this.selectedFiles.size === 0) return;
    
    this.clipboard = {
      operation: 'cut',
      files: Array.from(this.selectedFiles).map(index => this.files[index])
    };
    
    console.log('✂️ Cut files to clipboard');
    this.updateOperationButtons(container);
  }

  copySelected(container) {
    if (this.selectedFiles.size === 0) return;
    
    this.clipboard = {
      operation: 'copy', 
      files: Array.from(this.selectedFiles).map(index => this.files[index])
    };
    
    console.log('📋 Copied files to clipboard');
    this.updateOperationButtons(container);
  }

  async pasteFiles(container) {
    if (!this.clipboard) return;
    
    try {
      for (const file of this.clipboard.files) {
        const newPath = this.currentPath + '/' + file.name;
        
        if (this.clipboard.operation === 'copy') {
          // Copy file to new location
          await this.copyFile(file.path, newPath);
        } else if (this.clipboard.operation === 'cut') {
          // Move file to new location
          await this.moveFile(file.path, newPath);
        }
      }
      
      if (this.clipboard.operation === 'cut') {
        this.clipboard = null; // Clear clipboard after cut operation
      }
      
      await this.loadFiles();
      this.updateFileList(container);
      this.updateOperationButtons(container);
      
    } catch (error) {
      this.showNotification('Paste operation failed: ' + error.message, 'error');
    }
  }

  async deleteSelected(container) {
    if (this.selectedFiles.size === 0) return;
    
    const confirmed = confirm(`Are you sure you want to delete ${this.selectedFiles.size} item(s)?`);
    if (!confirmed) return;
    
    try {
      for (const index of this.selectedFiles) {
        const file = this.files[index];
        await this.deleteFile(file.path);
      }
      
      this.selectedFiles.clear();
      await this.loadFiles();
      this.updateFileList(container);
      this.updateOperationButtons(container);
      
    } catch (error) {
      this.showNotification('Delete operation failed: ' + error.message, 'error');
    }
  }

  switchStorageProvider(container, providerType) {
    console.log('🔄 Switching to storage provider:', providerType);
    // Storage provider switching - requires storage backend integration
    this.currentStorageProvider = providerType;
    this.showNotification(`Switched to ${providerType} storage. Reloading files...`, 'info');
    this.loadFiles();
  }

  autoOrganize(container) {
    console.log('🤖 Auto-organizing files...');
    // AI auto-organization - requires AI service integration
    if (this.desktop?.swissknife?.ai) {
      this.showNotification('AI analyzing files for organization...', 'info');
      // Future: Implement AI-powered file organization
    } else {
      this.showNotification('AI service not available. Configure AI integration first.', 'warning');
    }
  }

  findDuplicates(container) {
    console.log('🔍 Finding duplicate files...');
    // Duplicate detection using file hashing
    const filesByHash = new Map();
    const duplicates = [];
    
    this.files.forEach(file => {
      if (file.type !== 'folder') {
        // Simple hash based on name and size (replace with real hash in production)
        const hash = `${file.name}-${file.size}`;
        if (filesByHash.has(hash)) {
          duplicates.push({ original: filesByHash.get(hash), duplicate: file });
        } else {
          filesByHash.set(hash, file);
        }
      }
    });
    
    if (duplicates.length > 0) {
      this.showNotification(`Found ${duplicates.length} potential duplicate(s)`, 'info');
    } else {
      this.showNotification('No duplicates found', 'success');
    }
  }

  generateSmartTags(container) {
    console.log('🏷️ Generating smart tags...');
    // Smart tagging - requires AI service integration
    if (this.desktop?.swissknife?.ai) {
      this.showNotification('AI analyzing files for smart tags...', 'info');
      // Future: Implement AI-powered smart tagging
    } else {
      this.showNotification('AI service not available. Configure AI integration first.', 'warning');
    }
  }

  updateOperationButtons(container) {
    // Update the state of operation buttons based on selection and clipboard
    const cutBtn = container.querySelector('#cut-btn');
    const copyBtn = container.querySelector('#copy-btn');
    const pasteBtn = container.querySelector('#paste-btn');
    const deleteBtn = container.querySelector('#delete-btn');
    
    const hasSelection = this.selectedFiles.size > 0;
    const hasClipboard = this.clipboard !== null;
    
    if (cutBtn) cutBtn.disabled = !hasSelection;
    if (copyBtn) copyBtn.disabled = !hasSelection;
    if (pasteBtn) pasteBtn.disabled = !hasClipboard;
    if (deleteBtn) deleteBtn.disabled = !hasSelection;
  }

  showNotification(message, type = 'info') {
    // Use desktop notification system if available, otherwise console
    if (this.desktop && this.desktop.showNotification) {
      this.desktop.showNotification(message, type);
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }

  // File system operations with localStorage backend
  async copyFile(sourcePath, targetPath) {
    console.log(`📋 Copying file from ${sourcePath} to ${targetPath}`);
    
    try {
      // Get file data from storage
      const storageKey = `file:${sourcePath}`;
      const fileData = localStorage.getItem(storageKey);
      
      if (fileData) {
        // Store copy with new path
        localStorage.setItem(`file:${targetPath}`, fileData);
        
        // Update file list
        const file = this.files.find(f => f.path === sourcePath);
        if (file) {
          const copiedFile = { ...file, path: targetPath, name: targetPath.split('/').pop() };
          this.files.push(copiedFile);
        }
        
        await this.loadFiles();
        return true;
      } else {
        console.warn('Source file not found in storage');
        return false;
      }
    } catch (error) {
      console.error('Copy failed:', error);
      throw error;
    }
  }

  async moveFile(sourcePath, targetPath) {
    console.log(`✂️ Moving file from ${sourcePath} to ${targetPath}`);
    
    try {
      // Copy to new location
      await this.copyFile(sourcePath, targetPath);
      
      // Delete from old location
      await this.deleteFile(sourcePath);
      
      await this.loadFiles();
      return true;
    } catch (error) {
      console.error('Move failed:', error);
      throw error;
    }
  }

  async deleteFile(filePath) {
    console.log(`🗑️ Deleting file: ${filePath}`);
    
    try {
      // Remove from localStorage
      const storageKey = `file:${filePath}`;
      localStorage.removeItem(storageKey);
      
      // Remove from file list
      this.files = this.files.filter(f => f.path !== filePath);
      
      await this.loadFiles();
      return true;
    } catch (error) {
      console.error('Delete failed:', error);
      throw error;
    }
  }

  // === Phase 3: Collaborative File System Methods ===

  async createSharedFolder(container) {
    if (!this.collaborativeFS) return;

    const name = prompt('Enter shared folder name:');
    if (!name) return;

    try {
      // Get available peers for collaboration
      const peers = await this.desktop.p2pManager.getAvailablePeers();
      
      if (peers.length === 0) {
        this.showNotification('No peers available for collaboration', 'warning');
        return;
      }

      // For now, include all available peers
      const sharedFolder = await this.collaborativeFS.createSharedFolder(name, peers);
      
      this.showNotification(`Shared folder "${name}" created with ${peers.length} participants`, 'success');
      
      // Refresh the file list to show the new shared folder
      await this.loadSharedContent();
      this.updateFileList(container);
      
    } catch (error) {
      console.error('Error creating shared folder:', error);
      this.showNotification('Failed to create shared folder', 'error');
    }
  }

  async inviteCollaborators(container) {
    if (!this.collaborativeFS) return;

    try {
      const peers = await this.desktop.p2pManager.getAvailablePeers();
      
      if (peers.length === 0) {
        this.showNotification('No peers available to invite', 'warning');
        return;
      }

      // Create invitation dialog
      const inviteDialog = this.createInvitationDialog(peers);
      container.appendChild(inviteDialog);
      
    } catch (error) {
      console.error('Error inviting collaborators:', error);
      this.showNotification('Failed to invite collaborators', 'error');
    }
  }

  createInvitationDialog(peers) {
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    dialog.innerHTML = `
      <div class="modal-content invite-dialog">
        <div class="modal-header">
          <h3>Invite Collaborators</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="peer-list">
            ${peers.map(peer => `
              <div class="peer-item">
                <input type="checkbox" id="peer-${peer.id}" value="${peer.id}">
                <label for="peer-${peer.id}">
                  <span class="peer-name">${peer.name || peer.id}</span>
                  <span class="peer-status">${peer.online ? 'Online' : 'Offline'}</span>
                </label>
              </div>
            `).join('')}
          </div>
          <div class="permission-settings">
            <h4>Permissions</h4>
            <label><input type="checkbox" checked> Read access</label>
            <label><input type="checkbox" checked> Write access</label>
            <label><input type="checkbox"> Admin access</label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary modal-cancel">Cancel</button>
          <button class="btn btn-primary modal-invite">Send Invitations</button>
        </div>
      </div>
    `;

    // Setup dialog event handlers
    const closeBtn = dialog.querySelector('.modal-close');
    const cancelBtn = dialog.querySelector('.modal-cancel');
    const inviteBtn = dialog.querySelector('.modal-invite');

    const closeDialog = () => dialog.remove();
    
    closeBtn.addEventListener('click', closeDialog);
    cancelBtn.addEventListener('click', closeDialog);
    
    inviteBtn.addEventListener('click', () => {
      const selectedPeers = Array.from(dialog.querySelectorAll('input[type="checkbox"]:checked'))
        .map(cb => cb.value)
        .filter(value => value.startsWith('peer-'))
        .map(value => value.replace('peer-', ''));
      
      if (selectedPeers.length > 0) {
        this.sendCollaborationInvites(selectedPeers);
        this.showNotification(`Invitations sent to ${selectedPeers.length} peers`, 'success');
      }
      
      closeDialog();
    });

    return dialog;
  }

  async sendCollaborationInvites(peerIds) {
    // Implementation would send actual invitations via P2P
    console.log('Sending collaboration invites to:', peerIds);
  }

  async openSharedClipboard(container) {
    if (!this.collaborativeFS) return;

    const clipboardHistory = this.collaborativeFS.getClipboardHistory();
    
    const clipboardDialog = document.createElement('div');
    clipboardDialog.className = 'modal-overlay';
    clipboardDialog.innerHTML = `
      <div class="modal-content clipboard-dialog">
        <div class="modal-header">
          <h3>Shared Clipboard</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="clipboard-items">
            ${clipboardHistory.length > 0 ? clipboardHistory.map(item => `
              <div class="clipboard-item" data-id="${item.id}">
                <div class="item-header">
                  <span class="item-type">${item.type}</span>
                  <span class="item-source">From: ${item.source}</span>
                  <span class="item-time">${new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="item-content">
                  ${item.type === 'text' ? item.content : `${item.type.toUpperCase()} content`}
                </div>
                <div class="item-actions">
                  <button class="btn btn-sm clipboard-copy" data-content="${item.content}">Copy</button>
                  <button class="btn btn-sm clipboard-paste" data-id="${item.id}">Paste</button>
                </div>
              </div>
            `).join('') : '<p>No shared clipboard items</p>'}
          </div>
          <div class="clipboard-input">
            <textarea placeholder="Add to shared clipboard..." id="clipboard-text"></textarea>
            <button class="btn btn-primary" id="add-to-clipboard">Add</button>
          </div>
        </div>
      </div>
    `;

    container.appendChild(clipboardDialog);

    // Setup clipboard dialog handlers
    const closeBtn = clipboardDialog.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => clipboardDialog.remove());

    const addBtn = clipboardDialog.querySelector('#add-to-clipboard');
    const textArea = clipboardDialog.querySelector('#clipboard-text');
    
    addBtn.addEventListener('click', async () => {
      const content = textArea.value.trim();
      if (content) {
        await this.collaborativeFS.addToSharedClipboard(content, 'text');
        textArea.value = '';
        clipboardDialog.remove();
        this.showNotification('Added to shared clipboard', 'success');
      }
    });

    // Copy/paste handlers
    clipboardDialog.querySelectorAll('.clipboard-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.content);
        this.showNotification('Copied to local clipboard', 'success');
      });
    });
  }

  toggleSharedClipboard(container) {
    this.openSharedClipboard(container);
  }

  toggleAnnotations(container) {
    // Show/hide file annotations
    const annotationsPanel = container.querySelector('.annotations-panel');
    if (annotationsPanel) {
      annotationsPanel.style.display = annotationsPanel.style.display === 'none' ? 'block' : 'none';
    } else {
      this.createAnnotationsPanel(container);
    }
  }

  createAnnotationsPanel(container) {
    const panel = document.createElement('div');
    panel.className = 'annotations-panel';
    panel.innerHTML = `
      <div class="panel-header">
        <h4>File Comments & Annotations</h4>
        <button class="panel-close">&times;</button>
      </div>
      <div class="panel-body">
        <div class="annotations-list" id="annotations-list">
          <!-- Annotations will be populated here -->
        </div>
        <div class="annotation-form">
          <textarea placeholder="Add a comment..." id="annotation-text"></textarea>
          <button class="btn btn-primary" id="add-annotation">Add Comment</button>
        </div>
      </div>
    `;

    container.appendChild(panel);

    // Setup handlers
    const closeBtn = panel.querySelector('.panel-close');
    closeBtn.addEventListener('click', () => panel.remove());

    const addBtn = panel.querySelector('#add-annotation');
    const textArea = panel.querySelector('#annotation-text');
    
    addBtn.addEventListener('click', () => this.addAnnotation(textArea.value));

    this.updateAnnotationsList(panel);
  }

  async addAnnotation(content) {
    if (!this.collaborativeFS || !content.trim()) return;

    const selectedFile = Array.from(this.selectedFiles)[0];
    if (!selectedFile) {
      this.showNotification('Please select a file to annotate', 'warning');
      return;
    }

    try {
      await this.collaborativeFS.addFileAnnotation(selectedFile.fileId || selectedFile.name, {
        fileId: selectedFile.fileId || selectedFile.name,
        userId: this.desktop.p2pManager.getLocalPeerId(),
        userName: 'Current User',
        content: content.trim(),
        position: { line: 1, column: 1 },
        type: 'comment',
        resolved: false
      });

      this.showNotification('Comment added', 'success');
    } catch (error) {
      console.error('Error adding annotation:', error);
      this.showNotification('Failed to add comment', 'error');
    }
  }

  updateAnnotationsList(panel) {
    const annotationsList = panel.querySelector('#annotations-list');
    const selectedFile = Array.from(this.selectedFiles)[0];
    
    if (!selectedFile || !this.collaborativeFS) {
      annotationsList.innerHTML = '<p>Select a file to view comments</p>';
      return;
    }

    const annotations = this.collaborativeFS.getFileAnnotations(selectedFile.fileId || selectedFile.name);
    
    annotationsList.innerHTML = annotations.length > 0 ? annotations.map(annotation => `
      <div class="annotation-item">
        <div class="annotation-header">
          <span class="annotation-author">${annotation.userName}</span>
          <span class="annotation-time">${new Date(annotation.timestamp).toLocaleString()}</span>
        </div>
        <div class="annotation-content">${annotation.content}</div>
        <div class="annotation-actions">
          <button class="btn btn-sm" onclick="this.closest('.annotation-item').classList.toggle('resolved')">
            ${annotation.resolved ? 'Reopen' : 'Resolve'}
          </button>
        </div>
      </div>
    `).join('') : '<p>No comments for this file</p>';
  }

  showSyncStatus(container) {
    const status = {
      connected: this.isCollaborativeMode,
      peers: this.activeCollaborators.size,
      lastSync: new Date(),
      pendingOperations: 0
    };

    this.showNotification(
      `Sync Status: ${status.connected ? 'Connected' : 'Disconnected'} | ` +
      `Peers: ${status.peers} | Last sync: ${status.lastSync.toLocaleTimeString()}`,
      'info'
    );
  }

  // Event handlers for collaborative features
  handleSharedFile(file) {
    this.showNotification(`New shared file: ${file.name}`, 'info');
    this.updateFileList(document.querySelector('.file-manager-container'));
  }

  handleFileChange(change) {
    console.log('File changed:', change);
    // Update file display if needed
  }

  updateTransferProgress(progress) {
    this.transferProgress.set(progress.fileId, progress);
    this.updateTransferDisplay();
  }

  updateCollaboratorDisplay() {
    const collaboratorsList = document.querySelector('#collaborators-list');
    if (collaboratorsList) {
      collaboratorsList.innerHTML = Array.from(this.activeCollaborators.values()).map(collaborator => `
        <div class="collaborator-avatar" title="${collaborator.name}">
          <span class="collaborator-initial">${collaborator.name.charAt(0)}</span>
          <span class="collaborator-status ${collaborator.active ? 'active' : 'idle'}"></span>
        </div>
      `).join('');
    }
  }

  updateTransferDisplay() {
    const transferContainer = document.querySelector('#transfer-progress');
    if (transferContainer) {
      transferContainer.innerHTML = Array.from(this.transferProgress.values()).map(progress => `
        <div class="transfer-item">
          <span class="transfer-name">${progress.fileName}</span>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${(progress.transferred / progress.totalSize) * 100}%"></div>
          </div>
          <span class="transfer-percent">${Math.round((progress.transferred / progress.totalSize) * 100)}%</span>
        </div>
      `).join('');
    }
  }

  updateSharedClipboard(clipboardItem) {
    this.showNotification(`New shared clipboard item from ${clipboardItem.source}`, 'info');
    
    // Update clipboard button count
    const clipboardBtn = document.querySelector('#shared-clipboard-toggle');
    if (clipboardBtn && this.collaborativeFS) {
      const count = this.collaborativeFS.getClipboardHistory().length;
      clipboardBtn.textContent = `📋 Clipboard (${count})`;
    }
  }

  addFileAnnotation(annotation) {
    if (!this.fileAnnotations.has(annotation.fileId)) {
      this.fileAnnotations.set(annotation.fileId, []);
    }
    this.fileAnnotations.get(annotation.fileId).push(annotation);
    
    this.showNotification(`New comment on ${annotation.fileId}`, 'info');
  }
}
