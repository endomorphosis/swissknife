/**
 * File Manager App for SwissKnife Web Desktop
 * Manages content-addressed storage and local files
 */

window.FileManagerApp = class FileManagerApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.currentPath = '/';
    this.files = [];
    this.selectedFiles = new Set();
    this.viewMode = 'grid'; // 'grid' or 'list'
  }

  async initialize() {
    this.swissknife = this.desktop.swissknife;
    await this.loadFiles();
  }

  createWindow() {
    const content = `
      <div class="file-manager-container">
        <div class="file-toolbar">
          <div class="toolbar-section">
            <button class="toolbar-btn" id="back-btn" title="Back">⬅️</button>
            <button class="toolbar-btn" id="forward-btn" title="Forward">➡️</button>
            <button class="toolbar-btn" id="up-btn" title="Up">⬆️</button>
            <button class="toolbar-btn" id="refresh-btn" title="Refresh">🔄</button>
          </div>
          <div class="toolbar-section">
            <input type="text" id="path-input" class="path-input" value="/" placeholder="Enter path...">
          </div>
          <div class="toolbar-section">
            <button class="toolbar-btn" id="new-folder-btn" title="New Folder">📁+</button>
            <button class="toolbar-btn" id="upload-btn" title="Upload Files">📤</button>
            <button class="toolbar-btn" id="download-btn" title="Download Selected" disabled>📥</button>
            <input type="file" id="file-input" style="display: none;" multiple>
          </div>
          <div class="toolbar-section">
            <button class="toolbar-btn view-btn ${this.viewMode === 'grid' ? 'active' : ''}" id="grid-view-btn" title="Grid View">⊞</button>
            <button class="toolbar-btn view-btn ${this.viewMode === 'list' ? 'active' : ''}" id="list-view-btn" title="List View">☰</button>
          </div>
        </div>
        
        <div class="file-content">
          <div class="file-sidebar">
            <div class="sidebar-section">
              <h4>Quick Access</h4>
              <div class="quick-access">
                <div class="quick-item" data-path="/">🏠 Home</div>
                <div class="quick-item" data-path="/documents">📄 Documents</div>
                <div class="quick-item" data-path="/downloads">📥 Downloads</div>
                <div class="quick-item" data-path="/images">🖼️ Images</div>
                <div class="quick-item" data-path="/projects">💼 Projects</div>
              </div>
            </div>
            <div class="sidebar-section">
              <h4>Storage Info</h4>
              <div class="storage-info">
                <div class="storage-item">
                  <span>IPFS Storage:</span>
                  <span id="ipfs-status">Checking...</span>
                </div>
                <div class="storage-item">
                  <span>Local Storage:</span>
                  <span id="local-storage">0 MB used</span>
                </div>
              </div>
            </div>
          </div>
          
          <div class="file-main">
            <div class="breadcrumb" id="breadcrumb">
              <span class="breadcrumb-item active">Home</span>
            </div>
            
            <div class="file-list-container">
              <div class="file-list ${this.viewMode}-view" id="file-list">
                <!-- Files will be populated here -->
              </div>
            </div>
            
            <div class="status-bar">
              <span id="file-count">0 items</span>
              <span id="selection-info"></span>
            </div>
          </div>
        </div>
        
        <!-- Context Menu -->
        <div class="context-menu" id="context-menu" style="display: none;">
          <div class="menu-item" data-action="open">Open</div>
          <div class="menu-item" data-action="download">Download</div>
          <div class="menu-separator"></div>
          <div class="menu-item" data-action="copy">Copy</div>
          <div class="menu-item" data-action="cut">Cut</div>
          <div class="menu-item" data-action="paste">Paste</div>
          <div class="menu-separator"></div>
          <div class="menu-item" data-action="rename">Rename</div>
          <div class="menu-item" data-action="delete">Delete</div>
          <div class="menu-separator"></div>
          <div class="menu-item" data-action="properties">Properties</div>
        </div>
        
        <!-- Upload Progress -->
        <div class="upload-progress" id="upload-progress" style="display: none;">
          <div class="progress-header">
            <span>Uploading files...</span>
            <button class="close-btn">✕</button>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: 0%"></div>
          </div>
          <div class="progress-details">
            <span id="upload-status">Preparing...</span>
          </div>
        </div>
      </div>
    `;

    const window = this.desktop.createWindow({
      title: 'File Manager',
      content: content,
      width: 900,
      height: 700,
      resizable: true
    });

    this.setupEventListeners(window);
    this.updateFileList(window);
    this.updateStorageInfo(window);
    
    return window;
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
      // Load files from SwissKnife storage
      const result = await this.swissknife.storage.list({
        path: this.currentPath,
        recursive: false
      });
      
      this.files = result.files || [];
    } catch (error) {
      console.error('Failed to load files:', error);
      this.files = this.getMockFiles(); // Fallback to mock data
    }
  }

  getMockFiles() {
    return [
      {
        name: 'documents',
        type: 'directory',
        size: 0,
        modified: new Date('2024-01-15'),
        path: '/documents'
      },
      {
        name: 'project-notes.md',
        type: 'file',
        size: 2048,
        modified: new Date('2024-01-20'),
        path: '/project-notes.md',
        hash: 'QmX1Y2Z3...'
      },
      {
        name: 'config.json',
        type: 'file',
        size: 512,
        modified: new Date('2024-01-18'),
        path: '/config.json',
        hash: 'QmA1B2C3...'
      },
      {
        name: 'downloads',
        type: 'directory',
        size: 0,
        modified: new Date('2024-01-10'),
        path: '/downloads'
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

  getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
      'txt': '📄',
      'md': '📝',
      'json': '⚙️',
      'js': '📜',
      'ts': '📘',
      'html': '🌐',
      'css': '🎨',
      'img': '🖼️',
      'jpg': '🖼️',
      'jpeg': '🖼️',
      'png': '🖼️',
      'gif': '🖼️',
      'pdf': '📕',
      'zip': '📦',
      'tar': '📦',
      'gz': '📦'
    };
    return iconMap[ext] || '📄';
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
    // TODO: Implement navigation history
    console.log('Navigate back');
  }

  navigateForward(window) {
    // TODO: Implement navigation history
    console.log('Navigate forward');
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
}
