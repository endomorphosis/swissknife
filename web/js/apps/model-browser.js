/**
 * Model Browser App for SwissKnife Web Desktop
 * Browse, download, and manage AI models for local inference
 */

export class ModelBrowserApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.models = [];
    this.installedModels = [];
    this.peerModels = [];
    this.selectedModel = null;
    this.currentFilter = 'all';
    this.searchQuery = '';
    this.defaultModel = null;
    this.loadedModels = new Map();
    this.networkPeers = [];
  }

  async initialize() {
    this.swissknife = this.desktop.swissknife;
    await this.loadModels();
    await this.loadInstalledModels();
    await this.loadPeerModels();
    await this.loadDefaultModel();
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
              <button class="filter-btn ${this.currentFilter === 'installed' ? 'active' : ''}" data-filter="installed">📱 Local</button>
              <button class="filter-btn ${this.currentFilter === 'p2p' ? 'active' : ''}" data-filter="p2p">🌐 P2P</button>
              <button class="filter-btn ${this.currentFilter === 'api' ? 'active' : ''}" data-filter="api">☁️ API</button>
            </div>
          </div>
          <div class="toolbar-section">
            <button class="btn btn-primary" id="refresh-models">🔄 Refresh</button>
            <button class="btn btn-secondary" id="import-model">📥 Import</button>
            <button class="btn btn-accent" id="manage-defaults">⚙️ Default Model</button>
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

    return content;
  }

  setupEventListeners(windowContainer) {
    const searchInput = windowContainer.querySelector('#model-search');
    const filterBtns = windowContainer.querySelectorAll('.filter-btn');
    const refreshBtn = windowContainer.querySelector('#refresh-models');
    const importBtn = windowContainer.querySelector('#import-model');
    const manageDefaultsBtn = windowContainer.querySelector('#manage-defaults');
    const modelList = windowContainer.querySelector('#model-list');
    const closeDownload = windowContainer.querySelector('#close-download');

    // Search
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.renderModelList(windowContainer);
      });
    }

    // Filters
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        this.renderModelList(windowContainer);
      });
    });

    // Actions
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refreshModels(windowContainer));
    }
    if (importBtn) {
      importBtn.addEventListener('click', () => this.importModel(windowContainer));
    }
    if (manageDefaultsBtn) {
      manageDefaultsBtn.addEventListener('click', () => this.manageDefaults(windowContainer));
    }

    // Model selection
    if (modelList) {
      modelList.addEventListener('click', (e) => {
        const modelItem = e.target.closest('.model-item');
        if (modelItem) {
          this.selectModel(windowContainer, modelItem.dataset.modelId);
        }
      });
    }

    // Download modal
    if (closeDownload) {
      closeDownload.addEventListener('click', () => {
        const downloadModal = windowContainer.querySelector('#download-modal');
        if (downloadModal) {
          downloadModal.style.display = 'none';
        }
      });
    }
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
      if (this.swissknife && this.swissknife.swissknife && this.swissknife.swissknife.getAvailableModels) {
        const allModels = this.swissknife.swissknife.getAvailableModels();
        this.installedModels = allModels.filter(model => model.installed || model.source === 'local');
      } else {
        // Fallback to mock installed models
        this.installedModels = [];
      }
    } catch (error) {
      console.error('Failed to load installed models:', error);
      this.installedModels = [];
    }
  }

  async loadPeerModels() {
    try {
      // Load models available from P2P network peers
      if (this.swissknife.network) {
        const peers = await this.swissknife.network.getActivePeers();
        this.networkPeers = peers;
        
        const peerModels = [];
        for (const peer of peers) {
          try {
            const models = await this.swissknife.network.queryPeerModels(peer.id);
            models.forEach(model => {
              peerModels.push({
                ...model,
                source: 'p2p',
                peerId: peer.id,
                peerName: peer.name || peer.id.slice(0, 8),
                availability: 'peer'
              });
            });
          } catch (error) {
            console.warn(`Failed to load models from peer ${peer.id}:`, error);
          }
        }
        this.peerModels = peerModels;
      }
    } catch (error) {
      console.error('Failed to load peer models:', error);
      this.peerModels = [];
    }
  }

  async loadDefaultModel() {
    try {
      const defaultModelId = localStorage.getItem('swissknife_default_model');
      if (defaultModelId) {
        this.defaultModel = defaultModelId;
      }
    } catch (error) {
      console.error('Failed to load default model:', error);
    }
  }

  getMockModels() {
    return [
      // Hugging Face Hub models
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
        source: 'huggingface',
        availability: 'download',
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
        source: 'huggingface',
        availability: 'download',
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
        source: 'huggingface',
        availability: 'download',
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
        source: 'huggingface',
        availability: 'download',
        requirements: {
          memory: '3 GB',
          gpu: 'Recommended'
        }
      },
      // API-only models
      {
        id: 'openai/gpt-4',
        name: 'GPT-4',
        description: 'Most capable GPT model, great for complex reasoning and creative writing',
        type: 'language',
        size: 'API Only',
        downloads: 'N/A',
        likes: 'N/A',
        author: 'OpenAI',
        tags: ['gpt', 'api', 'reasoning', 'creative'],
        license: 'Commercial',
        lastModified: '2024-01-25',
        source: 'api',
        availability: 'api',
        apiEndpoint: 'https://api.openai.com/v1/chat/completions',
        requirements: {
          memory: 'N/A (Cloud)',
          gpu: 'N/A (Cloud)',
          apiKey: 'Required'
        }
      },
      {
        id: 'openai/gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        description: 'Fast and efficient model for general conversational AI',
        type: 'language',
        size: 'API Only',
        downloads: 'N/A',
        likes: 'N/A',
        author: 'OpenAI',
        tags: ['gpt', 'api', 'chat', 'fast'],
        license: 'Commercial',
        lastModified: '2024-01-25',
        source: 'api',
        availability: 'api',
        apiEndpoint: 'https://api.openai.com/v1/chat/completions',
        requirements: {
          memory: 'N/A (Cloud)',
          gpu: 'N/A (Cloud)',
          apiKey: 'Required'
        }
      },
      {
        id: 'anthropic/claude-3-haiku',
        name: 'Claude 3 Haiku',
        description: 'Fast and cost-effective model for everyday tasks',
        type: 'language',
        size: 'API Only',
        downloads: 'N/A',
        likes: 'N/A',
        author: 'Anthropic',
        tags: ['claude', 'api', 'fast', 'efficient'],
        license: 'Commercial',
        lastModified: '2024-01-25',
        source: 'api',
        availability: 'api',
        apiEndpoint: 'https://api.anthropic.com/v1/messages',
        requirements: {
          memory: 'N/A (Cloud)',
          gpu: 'N/A (Cloud)',
          apiKey: 'Required'
        }
      },
      // Mock P2P models
      {
        id: 'peer/llama-7b-chat',
        name: 'Llama 7B Chat (P2P)',
        description: 'Open source conversational AI model shared by peer network',
        type: 'language',
        size: '13 GB',
        downloads: 'N/A',
        likes: 'N/A',
        author: 'Meta (via P2P)',
        tags: ['llama', 'p2p', 'open-source', 'chat'],
        license: 'Custom',
        lastModified: '2024-01-20',
        source: 'p2p',
        availability: 'peer',
        peerId: 'peer123abc',
        peerName: 'AINode-Berlin',
        requirements: {
          memory: '16 GB',
          gpu: 'Recommended',
          network: 'P2P Connection'
        }
      }
    ];
  }

  async getAvailableModels() {
    // In a real implementation, this would fetch from HuggingFace API
    return this.getMockModels();
  }

  renderModelList(container) {
    const modelList = container.querySelector('#model-list');
    if (!modelList) {
      console.warn('Model list container not found');
      return;
    }
    
    let filteredModels = [...this.models];

    // Add peer models to the available models
    if (this.peerModels.length > 0) {
      filteredModels.push(...this.peerModels);
    }

    // Apply search filter
    if (this.searchQuery) {
      filteredModels = filteredModels.filter(model => 
        model.name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        model.description.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        model.tags.some(tag => tag.toLowerCase().includes(this.searchQuery.toLowerCase())) ||
        model.author.toLowerCase().includes(this.searchQuery.toLowerCase())
      );
    }

    // Apply category filter
    if (this.currentFilter !== 'all') {
      if (this.currentFilter === 'installed') {
        filteredModels = this.installedModels;
      } else if (this.currentFilter === 'p2p') {
        filteredModels = filteredModels.filter(model => model.source === 'p2p');
      } else if (this.currentFilter === 'api') {
        filteredModels = filteredModels.filter(model => model.source === 'api');
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
      const isDefault = this.defaultModel === model.id;
      const isLoaded = this.loadedModels.has(model.id);
      const modelItem = document.createElement('div');
      modelItem.className = `model-item ${isInstalled ? 'installed' : ''} ${isDefault ? 'default' : ''}`;
      modelItem.dataset.modelId = model.id;

      const sourceIcon = this.getSourceIcon(model.source || 'huggingface');
      const availabilityBadge = this.getAvailabilityBadge(model);

      modelItem.innerHTML = `
        <div class="model-header">
          <div class="model-icon">${this.getModelIcon(model.type)}</div>
          <div class="model-info">
            <h3 class="model-name">${model.name}</h3>
            <p class="model-author">by ${model.author}</p>
            ${model.peerName ? `<p class="model-peer">📡 ${model.peerName}</p>` : ''}
          </div>
          <div class="model-status">
            ${sourceIcon}
            ${availabilityBadge}
            ${isInstalled ? '<span class="installed-badge">Installed</span>' : ''}
            ${isDefault ? '<span class="default-badge">Default</span>' : ''}
            ${isLoaded ? '<span class="loaded-badge">Loaded</span>' : ''}
          </div>
        </div>
        <div class="model-description">${model.description}</div>
        <div class="model-metadata">
          <span class="model-size">📁 ${model.size}</span>
          ${model.downloads !== 'N/A' ? `<span class="model-downloads">⬇️ ${this.formatNumber(model.downloads)}</span>` : ''}
          ${model.likes !== 'N/A' ? `<span class="model-likes">❤️ ${this.formatNumber(model.likes)}</span>` : ''}
          <span class="model-type">${model.type}</span>
        </div>
        <div class="model-tags">
          ${model.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
        </div>
      `;

      modelList.appendChild(modelItem);
    });
  }

  selectModel(windowContainer, modelId) {
    // Update selection in list
    windowContainer.querySelectorAll('.model-item').forEach(item => {
      item.classList.remove('selected');
    });
    windowContainer.querySelector(`[data-model-id="${modelId}"]`).classList.add('selected');

    // Find the model
    this.selectedModel = this.models.find(m => m.id === modelId) || 
                        this.installedModels.find(m => m.id === modelId);

    if (this.selectedModel) {
      this.renderModelDetails(window);
    }
  }

  renderModelDetails(windowContainer) {
    const modelDetails = windowContainer.querySelector('#model-details');
    const model = this.selectedModel;
    const isInstalled = this.installedModels.some(installed => installed.id === model.id);
    const isDefault = this.defaultModel === model.id;
    const isLoaded = this.loadedModels.has(model.id);

    let actionButtons = '';
    
    if (model.source === 'api') {
      // API models
      const hasApiKey = this.checkApiKey(model);
      actionButtons = hasApiKey ? 
        `<button class="btn btn-primary" id="use-api-model">🌐 Use API</button>
         ${isDefault ? '' : '<button class="btn btn-secondary" id="set-default">⭐ Set Default</button>'}` :
        `<button class="btn btn-warning" id="configure-api">🔑 Configure API Key</button>`;
    } else if (model.source === 'p2p') {
      // P2P models
      actionButtons = `
        <button class="btn btn-primary" id="connect-peer">🔗 Connect to Peer</button>
        <button class="btn btn-secondary" id="download-from-peer">📥 Download Copy</button>
        ${isDefault ? '' : '<button class="btn btn-secondary" id="set-default">⭐ Set Default</button>'}`;
    } else {
      // Local/downloadable models
      actionButtons = isInstalled ? 
        `<button class="btn btn-success" disabled>✓ Installed</button>
         <button class="btn btn-secondary" id="uninstall-model">🗑️ Uninstall</button>
         <button class="btn btn-primary" id="load-model">${isLoaded ? '🔄 Reload' : '🚀 Load'}</button>
         ${isDefault ? '<button class="btn btn-warning" id="unset-default">⭐ Remove Default</button>' : '<button class="btn btn-secondary" id="set-default">⭐ Set Default</button>'}` :
        `<button class="btn btn-primary" id="install-model">📥 Install</button>`;
    }

    modelDetails.innerHTML = `
      <div class="model-details-content">
        <div class="model-header-large">
          <div class="model-icon-large">${this.getModelIcon(model.type)}</div>
          <div class="model-title-section">
            <h2>${model.name}</h2>
            <p class="model-id">${model.id}</p>
            <p class="model-author-large">by ${model.author}</p>
            ${model.peerName ? `<p class="model-peer-large">📡 Available from: ${model.peerName}</p>` : ''}
            <div class="model-badges">
              ${this.getSourceIcon(model.source || 'huggingface')}
              ${this.getAvailabilityBadge(model)}
              ${isDefault ? '<span class="default-badge-large">⭐ Default Model</span>' : ''}
              ${isLoaded ? '<span class="loaded-badge-large">🚀 Currently Loaded</span>' : ''}
            </div>
          </div>
          <div class="model-actions">
            ${actionButtons}
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
          ${model.downloads !== 'N/A' ? `
          <div class="stat-item">
            <span class="stat-label">Downloads:</span>
            <span class="stat-value">${this.formatNumber(model.downloads)}</span>
          </div>` : ''}
          ${model.likes !== 'N/A' ? `
          <div class="stat-item">
            <span class="stat-label">Likes:</span>
            <span class="stat-value">${this.formatNumber(model.likes)}</span>
          </div>` : ''}
          <div class="stat-item">
            <span class="stat-label">Type:</span>
            <span class="stat-value">${model.type}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">License:</span>
            <span class="stat-value">${model.license}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Source:</span>
            <span class="stat-value">${this.formatSource(model.source || 'huggingface')}</span>
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
          ${model.requirements.apiKey ? `
          <div class="requirement-item">
            <span class="req-label">API Key:</span>
            <span class="req-value">${model.requirements.apiKey}</span>
          </div>` : ''}
          ${model.requirements.network ? `
          <div class="requirement-item">
            <span class="req-label">Network:</span>
            <span class="req-value">${model.requirements.network}</span>
          </div>` : ''}
        </div>
        
        <div class="model-tags-section">
          <h3>Tags</h3>
          <div class="tags-list">
            ${model.tags.map(tag => `<span class="tag-large">${tag}</span>`).join('')}
          </div>
        </div>
        
        ${(isInstalled || model.source === 'api') ? this.renderModelUsage() : ''}
      </div>
    `;

    // Setup action button listeners
    this.setupModelActionListeners(window, model);
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

  async installModel(windowContainer, model) {
    const downloadModal = windowContainer.querySelector('#download-modal');
    const downloadingModel = windowContainer.querySelector('#downloading-model');
    const downloadStatus = windowContainer.querySelector('#download-status');
    const downloadProgress = windowContainer.querySelector('#download-progress');
    const downloadSpeed = windowContainer.querySelector('#download-speed');
    const downloadEta = windowContainer.querySelector('#download-eta');

    downloadingModel.textContent = model.name;
    downloadModal.style.display = 'flex';

    const modelUrl = `https://huggingface.co/${model.id}/resolve/main/pytorch_model.bin`;
    const destinationPath = `/models/${model.id}/pytorch_model.bin`;

    try {
        const storage = this.swissknife.storage;
        const result = await storage.write({ path: destinationPath, content: blob, metadata: { url: modelUrl, downloadedAt: new Date().toISOString() } });

        if (result.success) {
            this.installedModels.push({ ...model, path: result.path });
            downloadModal.style.display = 'none';
            this.renderModelDetails(windowContainer);
            this.renderModelList(windowContainer);
            this.desktop.showNotification(`${model.name} installed successfully`, 'success');
        } else {
            downloadModal.style.display = 'none';
            this.desktop.showNotification(`Failed to install ${model.name}: ${result.error}`, 'error');
        }
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

  async refreshModels(windowContainer) {
    try {
      await this.loadModels();
      await this.loadInstalledModels();
      this.renderModelList(window);
      this.desktop.showNotification('Model list refreshed', 'success');
    } catch (error) {
      this.desktop.showNotification('Failed to refresh models: ' + error.message, 'error');
    }
  }

  async importModel(windowContainer) {
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

  getSourceIcon(source) {
    const icons = {
      'huggingface': '<span class="source-badge hf">🤗 HF</span>',
      'api': '<span class="source-badge api">☁️ API</span>',
      'p2p': '<span class="source-badge p2p">🌐 P2P</span>',
      'local': '<span class="source-badge local">💻 Local</span>'
    };
    return icons[source] || '<span class="source-badge">📦</span>';
  }

  getAvailabilityBadge(model) {
    const badges = {
      'download': '<span class="avail-badge download">📥 Download</span>',
      'api': '<span class="avail-badge api">🌐 API</span>',
      'peer': '<span class="avail-badge peer">📡 Peer</span>',
      'local': '<span class="avail-badge local">💾 Local</span>'
    };
    return badges[model.availability] || '';
  }

  formatSource(source) {
    const sources = {
      'huggingface': 'Hugging Face Hub',
      'api': 'API Service',
      'p2p': 'Peer-to-Peer Network',
      'local': 'Local Storage'
    };
    return sources[source] || source;
  }

  checkApiKey(model) {
    if (model.author === 'OpenAI') {
      return !!localStorage.getItem('swissknife_openai_key');
    } else if (model.author === 'Anthropic') {
      return !!localStorage.getItem('swissknife_anthropic_key');
    }
    return false;
  }

  setupModelActionListeners(windowContainer, model) {
    const modelDetails = windowContainer.querySelector('#model-details');
    
    const installBtn = modelDetails.querySelector('#install-model');
    const uninstallBtn = modelDetails.querySelector('#uninstall-model');
    const loadBtn = modelDetails.querySelector('#load-model');
    const setDefaultBtn = modelDetails.querySelector('#set-default');
    const unsetDefaultBtn = modelDetails.querySelector('#unset-default');
    const useApiBtn = modelDetails.querySelector('#use-api-model');
    const configureApiBtn = modelDetails.querySelector('#configure-api');
    const connectPeerBtn = modelDetails.querySelector('#connect-peer');
    const downloadFromPeerBtn = modelDetails.querySelector('#download-from-peer');

    if (installBtn) {
      installBtn.addEventListener('click', () => this.installModel(window, model));
    }
    if (uninstallBtn) {
      uninstallBtn.addEventListener('click', () => this.uninstallModel(window, model));
    }
    if (loadBtn) {
      loadBtn.addEventListener('click', () => this.loadModel(window, model));
    }
    if (setDefaultBtn) {
      setDefaultBtn.addEventListener('click', () => this.setDefaultModel(window, model));
    }
    if (unsetDefaultBtn) {
      unsetDefaultBtn.addEventListener('click', () => this.unsetDefaultModel(window, model));
    }
    if (useApiBtn) {
      useApiBtn.addEventListener('click', () => this.useApiModel(window, model));
    }
    if (configureApiBtn) {
      configureApiBtn.addEventListener('click', () => this.configureApiKey(window, model));
    }
    if (connectPeerBtn) {
      connectPeerBtn.addEventListener('click', () => this.connectToPeer(window, model));
    }
    if (downloadFromPeerBtn) {
      downloadFromPeerBtn.addEventListener('click', () => this.downloadFromPeer(window, model));
    }
  }

  async setDefaultModel(window, model) {
    try {
      this.defaultModel = model.id;
      localStorage.setItem('swissknife_default_model', model.id);
      
      // Update SwissKnife configuration
      if (this.swissknife && this.swissknife.updateConfig) {
        await this.swissknife.updateConfig({
          defaultModel: model.id
        });
      }

      this.renderModelDetails(window);
      this.renderModelList(window);
      this.desktop.showNotification(`${model.name} set as default model`, 'success');
    } catch (error) {
      this.desktop.showNotification(`Failed to set default model: ${error.message}`, 'error');
    }
  }

  async unsetDefaultModel(window, model) {
    try {
      this.defaultModel = null;
      localStorage.removeItem('swissknife_default_model');
      
      if (this.swissknife && this.swissknife.updateConfig) {
        await this.swissknife.updateConfig({
          defaultModel: null
        });
      }

      this.renderModelDetails(window);
      this.renderModelList(window);
      this.desktop.showNotification('Default model removed', 'success');
    } catch (error) {
      this.desktop.showNotification(`Failed to unset default model: ${error.message}`, 'error');
    }
  }

  async useApiModel(window, model) {
    try {
      // Configure and set as active API model
      const result = await this.swissknife.models.configureApi({
        modelId: model.id,
        provider: model.author.toLowerCase(),
        endpoint: model.apiEndpoint
      });

      if (result.success) {
        this.loadedModels.set(model.id, { type: 'api', model: result.instance });
        this.renderModelDetails(window);
        this.renderModelList(window);
        this.desktop.showNotification(`${model.name} configured for API use`, 'success');
        
        // Open AI Chat with the API model
        this.desktop.openApp('AIChat', { 
          defaultModel: model.id,
          modelType: 'api'
        });
      } else {
        this.desktop.showNotification(`Failed to configure API model: ${result.error}`, 'error');
      }
    } catch (error) {
      this.desktop.showNotification(`Failed to use API model: ${error.message}`, 'error');
    }
  }

  async configureApiKey(window, model) {
    const provider = model.author.toLowerCase();
    const keyName = `${provider} API Key`;
    
    const apiKey = prompt(`Enter your ${keyName}:`);
    if (apiKey) {
      try {
        localStorage.setItem(`swissknife_${provider}_key`, apiKey);
        
        if (this.swissknife && this.swissknife.updateConfig) {
          await this.swissknife.updateConfig({
            [`${provider}.apiKey`]: apiKey
          });
        }

        this.renderModelDetails(window);
        this.desktop.showNotification(`${keyName} configured successfully`, 'success');
      } catch (error) {
        this.desktop.showNotification(`Failed to configure API key: ${error.message}`, 'error');
      }
    }
  }

  async connectToPeer(window, model) {
    try {
      if (this.swissknife.network) {
        const result = await this.swissknife.network.connectToPeer(model.peerId);
        
        if (result.success) {
          // Set up remote model access
          this.loadedModels.set(model.id, { 
            type: 'p2p', 
            peerId: model.peerId,
            connection: result.connection 
          });
          
          this.renderModelDetails(window);
          this.renderModelList(window);
          this.desktop.showNotification(`Connected to ${model.peerName} for ${model.name}`, 'success');
          
          // Open AI Chat with P2P model
          this.desktop.openApp('AIChat', { 
            defaultModel: model.id,
            modelType: 'p2p',
            peerId: model.peerId
          });
        } else {
          this.desktop.showNotification(`Failed to connect to peer: ${result.error}`, 'error');
        }
      } else {
        this.desktop.showNotification('P2P networking not available', 'error');
      }
    } catch (error) {
      this.desktop.showNotification(`Failed to connect to peer: ${error.message}`, 'error');
    }
  }

  async downloadFromPeer(window, model) {
    try {
      if (this.swissknife.network) {
        const result = await this.swissknife.network.downloadModelFromPeer({
          peerId: model.peerId,
          modelId: model.id
        });

        if (result.success) {
          // Add to installed models
          this.installedModels.push({
            ...model,
            source: 'local',
            availability: 'local'
          });
          
          this.renderModelDetails(window);
          this.renderModelList(window);
          this.desktop.showNotification(`${model.name} downloaded from ${model.peerName}`, 'success');
        } else {
          this.desktop.showNotification(`Failed to download from peer: ${result.error}`, 'error');
        }
      } else {
        this.desktop.showNotification('P2P networking not available', 'error');
      }
    } catch (error) {
      this.desktop.showNotification(`Failed to download from peer: ${error.message}`, 'error');
    }
  }

  async manageDefaults(windowContainer) {
    const defaultsWindow = await this.desktop.createWindow({
      title: 'Default Model Settings',
      icon: '⚙️',
      appId: 'model-defaults',
      width: 600,
      height: 500,
      x: 100,
      y: 100
    });

    // Set the content for the defaults window
    const contentElement = defaultsWindow.element.querySelector('.window-content');
    if (contentElement) {
      contentElement.innerHTML = this.createDefaultsModalContent();
      // Defer setup of listeners to ensure DOM is ready
      setTimeout(() => {
        this.setupDefaultsModalListeners(contentElement);
      }, 0);
    }
  }

  createDefaultsModalContent() {
    const availableModels = [
      ...this.installedModels,
      ...this.models.filter(m => m.source === 'api' && this.checkApiKey(m)),
      ...this.peerModels.filter(m => this.loadedModels.has(m.id))
    ];

    return `
      <div class="defaults-modal">
        <div class="modal-header">
          <h2>Default Model Configuration</h2>
          <p>Choose which model to use by default for AI interactions</p>
        </div>
        
        <div class="current-default">
          <h3>Current Default Model</h3>
          ${this.defaultModel ? 
            `<div class="default-model-info">
              <span class="model-name">${this.getModelName(this.defaultModel)}</span>
              <button class="btn btn-secondary" id="clear-default">Remove Default</button>
             </div>` :
            '<p class="no-default">No default model set</p>'
          }
        </div>
        
        <div class="available-models">
          <h3>Available Models</h3>
          <div class="model-selection-list">
            ${availableModels.map(model => `
              <div class="model-selection-item ${this.defaultModel === model.id ? 'current-default' : ''}" 
                   data-model-id="${model.id}">
                <div class="model-selection-info">
                  <span class="model-icon">${this.getModelIcon(model.type)}</span>
                  <div class="model-details">
                    <span class="model-name">${model.name}</span>
                    <span class="model-source">${this.formatSource(model.source || 'huggingface')}</span>
                  </div>
                </div>
                <div class="model-selection-actions">
                  ${this.defaultModel === model.id ? 
                    '<span class="current-badge">Current Default</span>' :
                    '<button class="btn btn-primary btn-sm set-default-btn">Set Default</button>'
                  }
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <div class="auto-load-settings">
          <h3>Auto-Load Settings</h3>
          <label class="checkbox-label">
            <input type="checkbox" id="auto-load-default" ${localStorage.getItem('swissknife_auto_load_default') === 'true' ? 'checked' : ''}>
            Automatically load default model on startup
          </label>
        </div>
      </div>
    `;
  }

  setupDefaultsModalListeners(windowContainer) {
    const modelSelectionList = windowContainer.querySelector('.model-selection-list');
    const clearDefaultBtn = windowContainer.querySelector('#clear-default');
    const autoLoadCheckbox = windowContainer.querySelector('#auto-load-default');

    if (modelSelectionList) {
      modelSelectionList.addEventListener('click', (e) => {
        const setDefaultBtn = e.target.closest('.set-default-btn');
        if (setDefaultBtn) {
          const modelItem = setDefaultBtn.closest('.model-selection-item');
          const modelId = modelItem.dataset.modelId;
          this.setDefaultModelFromModal(windowContainer, modelId);
        }
      });
    }

    if (clearDefaultBtn) {
      clearDefaultBtn.addEventListener('click', () => {
        this.clearDefaultFromModal(windowContainer);
      });
    }

    if (autoLoadCheckbox) {
      autoLoadCheckbox.addEventListener('change', (e) => {
        localStorage.setItem('swissknife_auto_load_default', e.target.checked.toString());
      });
    }
  }

  async setDefaultModelFromModal(windowContainer, modelId) {
    try {
      this.defaultModel = modelId;
      localStorage.setItem('swissknife_default_model', modelId);
      
      if (this.swissknife && this.swissknife.updateConfig) {
        await this.swissknife.updateConfig({
          defaultModel: modelId
        });
      }

      // Update the modal content
      windowContainer.innerHTML = this.createDefaultsModalContent();
      this.setupDefaultsModalListeners(windowContainer);
      
      // Update main browser window if open
      const browserWindows = document.querySelectorAll('.window-content');
      browserWindows.forEach(w => {
        if (w.querySelector('.model-browser-container')) {
          this.renderModelList(w);
          if (this.selectedModel) {
            this.renderModelDetails(w);
          }
        }
      });

      this.desktop.showNotification(`Default model set to ${this.getModelName(modelId)}`, 'success');
    } catch (error) {
      this.desktop.showNotification(`Failed to set default model: ${error.message}`, 'error');
    }
  }

  async clearDefaultFromModal(windowContainer) {
    try {
      this.defaultModel = null;
      localStorage.removeItem('swissknife_default_model');
      
      if (this.swissknife && this.swissknife.updateConfig) {
        await this.swissknife.updateConfig({
          defaultModel: null
        });
      }

      // Update the modal content
      windowContainer.innerHTML = this.createDefaultsModalContent();
      this.setupDefaultsModalListeners(windowContainer);
      
      // Update main browser window if open
      const browserWindows = document.querySelectorAll('.window-content');
      browserWindows.forEach(w => {
        if (w.querySelector('.model-browser-container')) {
          this.renderModelList(w);
          if (this.selectedModel) {
            this.renderModelDetails(w);
          }
        }
      });

      this.desktop.showNotification('Default model cleared', 'success');
    } catch (error) {
      this.desktop.showNotification(`Failed to clear default model: ${error.message}`, 'error');
    }
  }

  getModelName(modelId) {
    const allModels = [...this.models, ...this.installedModels, ...this.peerModels];
    const model = allModels.find(m => m.id === modelId);
    return model ? model.name : modelId;
  }
}

// Also make available globally for backwards compatibility
if (typeof window !== 'undefined') {
  window.ModelBrowserApp = ModelBrowserApp;
}
