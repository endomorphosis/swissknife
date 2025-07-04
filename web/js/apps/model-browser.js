/**
 * Model Browser App for SwissKnife Web Desktop
 * Browse, download, and manage AI models for local inference
 */

window.ModelBrowserApp = class ModelBrowserApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.models = [];
    this.installedModels = [];
    this.selectedModel = null;
    this.currentFilter = 'all';
    this.searchQuery = '';
  }

  async initialize() {
    this.swissknife = this.desktop.swissknife;
    await this.loadModels();
    await this.loadInstalledModels();
  }

  createWindow() {
    const content = `
      <div class="model-browser-container">
        <div class="model-toolbar">
          <div class="toolbar-section">
            <div class="search-box">
              <input type="text" id="model-search" placeholder="Search models..." value="${this.searchQuery}">
              <button class="search-btn">🔍</button>
            </div>
          </div>
          <div class="toolbar-section">
            <div class="filter-buttons">
              <button class="filter-btn ${this.currentFilter === 'all' ? 'active' : ''}" data-filter="all">All</button>
              <button class="filter-btn ${this.currentFilter === 'language' ? 'active' : ''}" data-filter="language">Language</button>
              <button class="filter-btn ${this.currentFilter === 'vision' ? 'active' : ''}" data-filter="vision">Vision</button>
              <button class="filter-btn ${this.currentFilter === 'code' ? 'active' : ''}" data-filter="code">Code</button>
              <button class="filter-btn ${this.currentFilter === 'embedding' ? 'active' : ''}" data-filter="embedding">Embedding</button>
              <button class="filter-btn ${this.currentFilter === 'installed' ? 'active' : ''}" data-filter="installed">Installed</button>
            </div>
          </div>
          <div class="toolbar-section">
            <button class="btn btn-primary" id="refresh-models">🔄 Refresh</button>
            <button class="btn btn-secondary" id="import-model">📥 Import</button>
          </div>
        </div>
        
        <div class="model-content">
          <div class="model-list-container">
            <div class="model-list" id="model-list">
              <!-- Models will be populated here -->
            </div>
          </div>
          
          <div class="model-details" id="model-details">
            <div class="no-selection">
              <div class="no-selection-icon">🤖</div>
              <h3>No Model Selected</h3>
              <p>Select a model from the list to see details and options.</p>
            </div>
          </div>
        </div>
        
        <!-- Download Progress Modal -->
        <div class="modal" id="download-modal" style="display: none;">
          <div class="modal-content">
            <div class="modal-header">
              <h3>Downloading Model</h3>
              <button class="close-btn" id="close-download">✕</button>
            </div>
            <div class="modal-body">
              <div class="download-info">
                <div class="model-name" id="downloading-model"></div>
                <div class="download-status" id="download-status">Preparing download...</div>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" id="download-progress" style="width: 0%"></div>
              </div>
              <div class="download-details">
                <span id="download-speed">0 MB/s</span>
                <span id="download-eta">Calculating...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const window = this.desktop.createWindow({
      title: 'Model Browser',
      content: content,
      width: 1000,
      height: 700,
      resizable: true
    });

    this.setupEventListeners(window);
    this.renderModelList(window);
    
    return window;
  }

  setupEventListeners(window) {
    const searchInput = window.querySelector('#model-search');
    const filterBtns = window.querySelectorAll('.filter-btn');
    const refreshBtn = window.querySelector('#refresh-models');
    const importBtn = window.querySelector('#import-model');
    const modelList = window.querySelector('#model-list');
    const closeDownload = window.querySelector('#close-download');

    // Search
    searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.renderModelList(window);
    });

    // Filters
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        this.renderModelList(window);
      });
    });

    // Actions
    refreshBtn.addEventListener('click', () => this.refreshModels(window));
    importBtn.addEventListener('click', () => this.importModel(window));

    // Model selection
    modelList.addEventListener('click', (e) => {
      const modelItem = e.target.closest('.model-item');
      if (modelItem) {
        this.selectModel(window, modelItem.dataset.modelId);
      }
    });

    // Download modal
    closeDownload.addEventListener('click', () => {
      window.querySelector('#download-modal').style.display = 'none';
    });
  }

  async loadModels() {
    try {
      // Load available models from HuggingFace and other sources
      this.models = await this.getAvailableModels();
    } catch (error) {
      console.error('Failed to load models:', error);
      this.models = this.getMockModels();
    }
  }

  async loadInstalledModels() {
    try {
      const result = await this.swissknife.models.list();
      this.installedModels = result.models || [];
    } catch (error) {
      console.error('Failed to load installed models:', error);
      this.installedModels = [];
    }
  }

  getMockModels() {
    return [
      {
        id: 'microsoft/DialoGPT-medium',
        name: 'DialoGPT Medium',
        description: 'A state-of-the-art large-scale pretrained dialogue response generation model',
        type: 'language',
        size: '1.2 GB',
        downloads: 125000,
        likes: 450,
        author: 'Microsoft',
        tags: ['conversational', 'pytorch', 'gpt'],
        license: 'MIT',
        lastModified: '2024-01-15',
        requirements: {
          memory: '4 GB',
          gpu: 'Optional'
        }
      },
      {
        id: 'sentence-transformers/all-MiniLM-L6-v2',
        name: 'All MiniLM L6 v2',
        description: 'Sentence embedding model for semantic search',
        type: 'embedding',
        size: '80 MB',
        downloads: 2500000,
        likes: 890,
        author: 'Sentence Transformers',
        tags: ['sentence-similarity', 'pytorch', 'embeddings'],
        license: 'Apache 2.0',
        lastModified: '2024-01-20',
        requirements: {
          memory: '1 GB',
          gpu: 'Not required'
        }
      },
      {
        id: 'microsoft/codebert-base',
        name: 'CodeBERT Base',
        description: 'Pre-trained model for programming language understanding',
        type: 'code',
        size: '500 MB',
        downloads: 75000,
        likes: 320,
        author: 'Microsoft',
        tags: ['code', 'programming', 'bert'],
        license: 'MIT',
        lastModified: '2024-01-10',
        requirements: {
          memory: '2 GB',
          gpu: 'Optional'
        }
      },
      {
        id: 'openai/clip-vit-base-patch32',
        name: 'CLIP ViT Base',
        description: 'Vision transformer for image-text understanding',
        type: 'vision',
        size: '600 MB',
        downloads: 150000,
        likes: 670,
        author: 'OpenAI',
        tags: ['vision', 'multimodal', 'clip'],
        license: 'MIT',
        lastModified: '2024-01-18',
        requirements: {
          memory: '3 GB',
          gpu: 'Recommended'
        }
      }
    ];
  }

  async getAvailableModels() {
    // In a real implementation, this would fetch from HuggingFace API
    return this.getMockModels();
  }

  renderModelList(window) {
    const modelList = window.querySelector('#model-list');
    let filteredModels = this.models;

    // Apply search filter
    if (this.searchQuery) {
      filteredModels = filteredModels.filter(model => 
        model.name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        model.description.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        model.tags.some(tag => tag.toLowerCase().includes(this.searchQuery.toLowerCase()))
      );
    }

    // Apply category filter
    if (this.currentFilter !== 'all') {
      if (this.currentFilter === 'installed') {
        filteredModels = this.installedModels;
      } else {
        filteredModels = filteredModels.filter(model => model.type === this.currentFilter);
      }
    }

    modelList.innerHTML = '';

    if (filteredModels.length === 0) {
      modelList.innerHTML = `
        <div class="no-models">
          <div class="no-models-icon">🤖</div>
          <h3>No Models Found</h3>
          <p>Try adjusting your search or filter criteria.</p>
        </div>
      `;
      return;
    }

    filteredModels.forEach(model => {
      const isInstalled = this.installedModels.some(installed => installed.id === model.id);
      const modelItem = document.createElement('div');
      modelItem.className = `model-item ${isInstalled ? 'installed' : ''}`;
      modelItem.dataset.modelId = model.id;

      modelItem.innerHTML = `
        <div class="model-header">
          <div class="model-icon">${this.getModelIcon(model.type)}</div>
          <div class="model-info">
            <h3 class="model-name">${model.name}</h3>
            <p class="model-author">by ${model.author}</p>
          </div>
          <div class="model-status">
            ${isInstalled ? '<span class="installed-badge">Installed</span>' : ''}
          </div>
        </div>
        <div class="model-description">${model.description}</div>
        <div class="model-metadata">
          <span class="model-size">📁 ${model.size}</span>
          <span class="model-downloads">⬇️ ${this.formatNumber(model.downloads)}</span>
          <span class="model-likes">❤️ ${this.formatNumber(model.likes)}</span>
          <span class="model-type">${model.type}</span>
        </div>
        <div class="model-tags">
          ${model.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
        </div>
      `;

      modelList.appendChild(modelItem);
    });
  }

  selectModel(window, modelId) {
    // Update selection in list
    window.querySelectorAll('.model-item').forEach(item => {
      item.classList.remove('selected');
    });
    window.querySelector(`[data-model-id="${modelId}"]`).classList.add('selected');

    // Find the model
    this.selectedModel = this.models.find(m => m.id === modelId) || 
                        this.installedModels.find(m => m.id === modelId);

    if (this.selectedModel) {
      this.renderModelDetails(window);
    }
  }

  renderModelDetails(window) {
    const modelDetails = window.querySelector('#model-details');
    const model = this.selectedModel;
    const isInstalled = this.installedModels.some(installed => installed.id === model.id);

    modelDetails.innerHTML = `
      <div class="model-details-content">
        <div class="model-header-large">
          <div class="model-icon-large">${this.getModelIcon(model.type)}</div>
          <div class="model-title-section">
            <h2>${model.name}</h2>
            <p class="model-id">${model.id}</p>
            <p class="model-author-large">by ${model.author}</p>
          </div>
          <div class="model-actions">
            ${isInstalled ? 
              `<button class="btn btn-success" disabled>✓ Installed</button>
               <button class="btn btn-secondary" id="uninstall-model">🗑️ Uninstall</button>
               <button class="btn btn-primary" id="load-model">🚀 Load</button>` :
              `<button class="btn btn-primary" id="install-model">📥 Install</button>`
            }
          </div>
        </div>
        
        <div class="model-description-large">
          <h3>Description</h3>
          <p>${model.description}</p>
        </div>
        
        <div class="model-stats">
          <div class="stat-item">
            <span class="stat-label">Size:</span>
            <span class="stat-value">${model.size}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Downloads:</span>
            <span class="stat-value">${this.formatNumber(model.downloads)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Likes:</span>
            <span class="stat-value">${this.formatNumber(model.likes)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Type:</span>
            <span class="stat-value">${model.type}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">License:</span>
            <span class="stat-value">${model.license}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Last Modified:</span>
            <span class="stat-value">${model.lastModified}</span>
          </div>
        </div>
        
        <div class="model-requirements">
          <h3>Requirements</h3>
          <div class="requirement-item">
            <span class="req-label">Memory:</span>
            <span class="req-value">${model.requirements.memory}</span>
          </div>
          <div class="requirement-item">
            <span class="req-label">GPU:</span>
            <span class="req-value">${model.requirements.gpu}</span>
          </div>
        </div>
        
        <div class="model-tags-section">
          <h3>Tags</h3>
          <div class="tags-list">
            ${model.tags.map(tag => `<span class="tag-large">${tag}</span>`).join('')}
          </div>
        </div>
        
        ${isInstalled ? this.renderModelUsage() : ''}
      </div>
    `;

    // Setup action button listeners
    const installBtn = modelDetails.querySelector('#install-model');
    const uninstallBtn = modelDetails.querySelector('#uninstall-model');
    const loadBtn = modelDetails.querySelector('#load-model');

    if (installBtn) {
      installBtn.addEventListener('click', () => this.installModel(window, model));
    }
    if (uninstallBtn) {
      uninstallBtn.addEventListener('click', () => this.uninstallModel(window, model));
    }
    if (loadBtn) {
      loadBtn.addEventListener('click', () => this.loadModel(window, model));
    }
  }

  renderModelUsage() {
    return `
      <div class="model-usage">
        <h3>Usage Example</h3>
        <div class="code-block">
          <pre><code>// Load the model
const model = await swissknife.models.load('${this.selectedModel.id}');

// Use for inference
const result = await model.predict({
  input: "Your input text here"
});

console.log(result);</code></pre>
        </div>
      </div>
    `;
  }

  async installModel(window, model) {
    const downloadModal = window.querySelector('#download-modal');
    const downloadingModel = window.querySelector('#downloading-model');
    const downloadStatus = window.querySelector('#download-status');
    const downloadProgress = window.querySelector('#download-progress');
    const downloadSpeed = window.querySelector('#download-speed');
    const downloadEta = window.querySelector('#download-eta');

    downloadingModel.textContent = model.name;
    downloadModal.style.display = 'flex';

    try {
      // Simulate download progress
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 10;
        if (progress > 100) progress = 100;

        downloadProgress.style.width = progress + '%';
        downloadStatus.textContent = `Downloading... ${Math.round(progress)}%`;
        downloadSpeed.textContent = `${(Math.random() * 10 + 5).toFixed(1)} MB/s`;
        
        const eta = Math.max(0, (100 - progress) * 2);
        downloadEta.textContent = eta > 0 ? `${Math.round(eta)}s remaining` : 'Almost done...';

        if (progress >= 100) {
          clearInterval(interval);
          downloadStatus.textContent = 'Installing...';
          
          setTimeout(async () => {
            // Add to installed models
            this.installedModels.push(model);
            
            downloadModal.style.display = 'none';
            this.renderModelDetails(window);
            this.renderModelList(window);
            
            this.desktop.showNotification(`${model.name} installed successfully`, 'success');
          }, 2000);
        }
      }, 500);

    } catch (error) {
      downloadModal.style.display = 'none';
      this.desktop.showNotification(`Failed to install ${model.name}: ${error.message}`, 'error');
    }
  }

  async uninstallModel(window, model) {
    if (confirm(`Are you sure you want to uninstall ${model.name}?`)) {
      try {
        // Remove from installed models
        this.installedModels = this.installedModels.filter(m => m.id !== model.id);
        
        this.renderModelDetails(window);
        this.renderModelList(window);
        
        this.desktop.showNotification(`${model.name} uninstalled successfully`, 'success');
      } catch (error) {
        this.desktop.showNotification(`Failed to uninstall ${model.name}: ${error.message}`, 'error');
      }
    }
  }

  async loadModel(window, model) {
    try {
      const result = await this.swissknife.models.load({
        modelId: model.id,
        useWebNN: this.desktop.settings?.enableWebNN || false,
        useWebGPU: this.desktop.settings?.enableWebGPU || false
      });

      if (result.success) {
        this.desktop.showNotification(`${model.name} loaded successfully`, 'success');
        
        // Open AI Chat with the loaded model
        this.desktop.openApp('AIChat', { 
          defaultModel: model.id,
          modelInstance: result.modelInstance 
        });
      } else {
        this.desktop.showNotification(`Failed to load ${model.name}: ${result.error}`, 'error');
      }
    } catch (error) {
      this.desktop.showNotification(`Failed to load ${model.name}: ${error.message}`, 'error');
    }
  }

  async refreshModels(window) {
    try {
      await this.loadModels();
      await this.loadInstalledModels();
      this.renderModelList(window);
      this.desktop.showNotification('Model list refreshed', 'success');
    } catch (error) {
      this.desktop.showNotification('Failed to refresh models: ' + error.message, 'error');
    }
  }

  async importModel(window) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bin,.onnx,.tflite,.safetensors';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const modelName = file.name.split('.')[0];
        
        // Import the model file
        const result = await this.swissknife.models.import({
          file: file,
          name: modelName,
          type: 'custom'
        });
        
        if (result.success) {
          await this.loadInstalledModels();
          this.renderModelList(window);
          this.desktop.showNotification(`${modelName} imported successfully`, 'success');
        } else {
          this.desktop.showNotification(`Failed to import model: ${result.error}`, 'error');
        }
      } catch (error) {
        this.desktop.showNotification('Failed to import model: ' + error.message, 'error');
      }
    };
    
    input.click();
  }

  getModelIcon(type) {
    const icons = {
      language: '💬',
      vision: '👁️',
      code: '💻',
      embedding: '🔗',
      multimodal: '🌟',
      custom: '⚙️'
    };
    return icons[type] || '🤖';
  }

  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }
}
