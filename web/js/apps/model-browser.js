/**
 * Enhanced Model Browser App for SwissKnife Web Desktop
 * Advanced AI model management with P2P sharing, IPFS integration, and real-time monitoring
 */

import { invokeNativeTool } from '../live-tool-gateway.js';
import { unwrapNetworkToolResult } from './network-native-tools.js';

export class ModelBrowserApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.models = [];
    this.installedModels = [];
    this.sharedModels = [];
    this.selectedModel = null;
    this.currentFilter = 'all';
    this.searchQuery = '';
    this.sortBy = 'popularity';
    this.p2pSystem = null;
    this.ipfsStorage = null;
    this.downloadQueue = [];
    this.modelMetrics = new Map();
    
    // Integration with new AI infrastructure
    this.ipfsAccelerateBridge = null;
    this.aiModelRouter = null;
    this.modelServer = null;
    
    // Model categories and providers
    this.modelCategories = {
      'text-generation': { name: 'Text Generation', icon: '📝', description: 'Generate and complete text' },
      'text-embedding': { name: 'Text Embedding', icon: '🔤', description: 'Convert text to vectors' },
      'image-generation': { name: 'Image Generation', icon: '🖼️', description: 'Generate images from text' },
      'image-classification': { name: 'Image Classification', icon: '🏷️', description: 'Classify and analyze images' },
      'speech-to-text': { name: 'Speech to Text', icon: '🎤', description: 'Convert speech to text' },
      'text-to-speech': { name: 'Text to Speech', icon: '🔊', description: 'Convert text to speech' },
      'translation': { name: 'Translation', icon: '🌍', description: 'Translate between languages' },
      'code-generation': { name: 'Code Generation', icon: '💻', description: 'Generate and complete code' },
      'question-answering': { name: 'Question Answering', icon: '❓', description: 'Answer questions from context' },
      'summarization': { name: 'Summarization', icon: '📋', description: 'Summarize long texts' }
    };
    
    this.modelProviders = {
      'huggingface': { name: 'Hugging Face', icon: '🤗', url: 'https://huggingface.co' },
      'openai': { name: 'OpenAI', icon: '🧠', url: 'https://openai.com' },
      'anthropic': { name: 'Anthropic', icon: '🤖', url: 'https://anthropic.com' },
      'google': { name: 'Google', icon: '🌟', url: 'https://ai.google' },
      'meta': { name: 'Meta', icon: '📘', url: 'https://ai.meta.com' },
      'microsoft': { name: 'Microsoft', icon: '🪟', url: 'https://azure.microsoft.com' },
      'local': { name: 'Local Models', icon: '🏠', url: null },
      'p2p': { name: 'P2P Shared', icon: '🌐', url: null }
    };
    
    this.initializeIntegrations();
  }

  async initializeIntegrations() {
    // Connect to IPFS Accelerate Bridge
    if (window.ipfsAccelerateBridge) {
      this.ipfsAccelerateBridge = window.ipfsAccelerateBridge;
      this.modelServer = window.ipfsAccelerateBridge.modelServer;
      this.setupTransformersIntegration();
    }
    
    // Connect to AI Model Router
    if (window.aiModelRouter) {
      this.aiModelRouter = window.aiModelRouter;
      this.setupRouterIntegration();
    }
    
    // Connect to P2P system if available
    if (window.p2pMLSystem) {
      this.p2pSystem = window.p2pMLSystem;
      this.setupP2PIntegration();
    }
    
    // Connect to IPFS storage if available
    if (window.ipfsModelStorage) {
      this.ipfsStorage = window.ipfsModelStorage;
      this.setupIPFSIntegration();
    }
    
    // Load model data
    await this.loadAvailableModels();
  }

  setupTransformersIntegration() {
    if (!this.ipfsAccelerateBridge) return;
    
    // Listen for model events
    this.ipfsAccelerateBridge.on('model:loaded', (data) => {
      this.handleModelLoaded(data);
      this.updateDisplay();
    });
    
    this.ipfsAccelerateBridge.on('model:unloaded', (data) => {
      this.handleModelUnloaded(data);
      this.updateDisplay();
    });
    
    this.ipfsAccelerateBridge.on('model:loading:progress', (data) => {
      this.handleLoadingProgress(data);
    });
    
    this.ipfsAccelerateBridge.on('inference:completed', (data) => {
      this.updateModelMetrics(data.modelId, data);
    });
  }

  setupRouterIntegration() {
    if (!this.aiModelRouter) return;
    
    // Listen for router events
    this.aiModelRouter.on('router:initialized', (data) => {
      this.updateEndpointsList();
    });
    
    this.aiModelRouter.on('request:completed', (data) => {
      this.updateRoutingStats();
    });
  }

  setupP2PIntegration() {
    if (!this.p2pSystem) return;
    
    // Listen for shared models from peers
    this.p2pSystem.on('model:shared', (modelData) => {
      this.handleSharedModel(modelData);
    });
    
    // Listen for model requests
    this.p2pSystem.on('model:request', (request) => {
      this.handleModelRequest(request);
    });
    
    // Update shared models list
    this.loadSharedModels();
  }

  setupIPFSIntegration() {
    if (!this.ipfsStorage) return;
    
    // Listen for IPFS model updates
    this.ipfsStorage.on('model:added', (modelCID) => {
      this.handleIPFSModelAdded(modelCID);
    });
    
    // Load models from IPFS network
    this.loadIPFSModels();
  }

  async loadAvailableModels() {
    try {
      // Load models from IPFS Accelerate Bridge
      if (this.ipfsAccelerateBridge) {
        const transformersModels = this.ipfsAccelerateBridge.getSupportedModels();
        this.models.push(...transformersModels);
      }
      
      // Load curated model list
      const curatedModels = [
        // Text Generation Models
        {
          id: 'gpt-3.5-turbo',
          name: 'GPT-3.5 Turbo',
          provider: 'openai',
          category: 'text-generation',
          description: 'Fast and capable language model for most text tasks',
          size: 'API-based',
          parameters: '175B',
          license: 'Commercial',
          tags: ['conversation', 'coding', 'writing'],
          popularity: 95,
          performance: { speed: 9, quality: 8, efficiency: 9 },
          requirements: { gpu: false, ram: '0GB', storage: '0GB' },
          apiOnly: true
        },
        {
          id: 'llama-2-7b',
          name: 'LLaMA 2 7B',
          provider: 'meta',
          category: 'text-generation',
          description: 'Open-source language model optimized for chat and instruction following',
          size: '13.5GB',
          parameters: '7B',
          license: 'Custom License',
          tags: ['open-source', 'chat', 'instruct'],
          popularity: 88,
          performance: { speed: 7, quality: 8, efficiency: 7 },
          requirements: { gpu: true, ram: '16GB', storage: '14GB' },
          downloadUrl: 'https://huggingface.co/meta-llama/Llama-2-7b-chat-hf'
        },
        {
          id: 'bert-base-uncased',
          name: 'BERT Base Uncased',
          provider: 'huggingface',
          category: 'text-embedding',
          description: 'Bidirectional transformer for understanding text context',
          size: '440MB',
          parameters: '110M',
          license: 'Apache 2.0',
          tags: ['embedding', 'classification', 'understanding'],
          popularity: 92,
          performance: { speed: 8, quality: 9, efficiency: 8 },
          requirements: { gpu: false, ram: '2GB', storage: '500MB' },
          downloadUrl: 'https://huggingface.co/bert-base-uncased'
        },
        {
          id: 'stable-diffusion-v1-5',
          name: 'Stable Diffusion v1.5',
          provider: 'huggingface',
          category: 'image-generation',
          description: 'High-quality text-to-image generation model',
          size: '4.27GB',
          parameters: '860M',
          license: 'CreativeML Open RAIL-M',
          tags: ['image', 'generation', 'art'],
          popularity: 94,
          performance: { speed: 6, quality: 9, efficiency: 6 },
          requirements: { gpu: true, ram: '8GB', storage: '5GB' },
          downloadUrl: 'https://huggingface.co/runwayml/stable-diffusion-v1-5'
        },
        {
          id: 'whisper-large-v3',
          name: 'Whisper Large v3',
          provider: 'openai',
          category: 'speech-to-text',
          description: 'State-of-the-art speech recognition in 99+ languages',
          size: '2.9GB',
          parameters: '1.55B',
          license: 'MIT',
          tags: ['speech', 'transcription', 'multilingual'],
          popularity: 89,
          performance: { speed: 7, quality: 9, efficiency: 7 },
          requirements: { gpu: true, ram: '4GB', storage: '3GB' },
          downloadUrl: 'https://huggingface.co/openai/whisper-large-v3'
        }
      ];
      
      // Add more models from different sources
      await this.loadHuggingFaceModels();
      await this.loadLocalModels();
      
    } catch (error) {
      console.error('Error loading models:', error);
    }
  }

  async loadHuggingFaceModels() {
    try {
      // In a real implementation, this would fetch from Hugging Face API
      const additionalModels = [
        {
          id: 'distilbert-base-uncased',
          name: 'DistilBERT Base',
          provider: 'huggingface',
          category: 'text-embedding',
          description: 'Faster, smaller version of BERT with 97% of performance',
          size: '268MB',
          parameters: '66M',
          license: 'Apache 2.0',
          tags: ['embedding', 'efficient', 'fast'],
          popularity: 85,
          performance: { speed: 9, quality: 8, efficiency: 9 },
          requirements: { gpu: false, ram: '1GB', storage: '300MB' },
          downloadUrl: 'https://huggingface.co/distilbert-base-uncased'
        },
        {
          id: 'code-llama-7b',
          name: 'Code Llama 7B',
          provider: 'meta',
          category: 'code-generation',
          description: 'Specialized version of LLaMA for code generation',
          size: '13.5GB',
          parameters: '7B',
          license: 'Custom License',
          tags: ['code', 'programming', 'completion'],
          popularity: 87,
          performance: { speed: 7, quality: 9, efficiency: 7 },
          requirements: { gpu: true, ram: '16GB', storage: '14GB' },
          downloadUrl: 'https://huggingface.co/codellama/CodeLlama-7b-hf'
        }
      ];
      
      this.models = [...this.models, ...additionalModels];
    } catch (error) {
      console.warn('Error loading Hugging Face models:', error);
    }
  }

  async loadLocalModels() {
    try {
      // Load locally installed models
      const localModels = JSON.parse(localStorage.getItem('installed-models') || '[]');
      this.installedModels = localModels.map(model => ({
        ...model,
        isInstalled: true,
        provider: 'local'
      }));
    } catch (error) {
      console.warn('Error loading local models:', error);
    }
  }

  async loadSharedModels() {
    if (!this.p2pSystem) return;
    
    try {
      const peers = await this.p2pSystem.getConnectedPeers();
      this.sharedModels = [];
      
      for (const peer of peers) {
        const peerModels = await this.p2pSystem.getSharedModels(peer.id);
        this.sharedModels = [...this.sharedModels, ...peerModels.map(model => ({
          ...model,
          provider: 'p2p',
          sharedBy: peer.id,
          peerName: peer.name || peer.id
        }))];
      }
    } catch (error) {
      console.warn('Error loading shared models:', error);
    }
  }

  createWindow() {
    const content = `
      <div class="model-browser-container">
      <style>
        .window[data-app-id="model-browser"] .window-content { display:flex; flex-direction:column; min-height:0; overflow:hidden; padding-bottom:0; }
        .window[data-app-id="model-browser"] .window-app-content { display:flex; flex-direction:column; height:100%; min-height:0; min-width:0; overflow:hidden; }
        .window[data-app-id="model-browser"] .window-app-content > [id$="-content"] { flex:1 1 0; min-height:0; min-width:0; overflow:hidden; }
        .window[data-app-id="model-browser"] .model-browser-container { height:100%; max-height:100%; min-height:0; min-width:0; box-sizing:border-box; overflow:auto; overscroll-behavior:contain; }
        .window[data-app-id="model-browser"] .model-browser-container { background:#101b22; color:#e8f0f4; }
        .window[data-app-id="model-browser"] :is(.model-item,.model-details-content,.model-test-panel,.search-filter-bar) { background:#18262d !important; color:#e8f0f4 !important; }
        .window[data-app-id="model-browser"] :is(.model-description,.model-metadata,.model-author,.native-catalog-metadata) { color:#c4d4df !important; }
        .window[data-app-id="model-browser"] #model-list { background:#101b22 !important; color:#e8f0f4 !important; }
        .window[data-app-id="model-browser"] .native-catalog-metadata { background:#101b22; color:#d2e0ea !important; padding:8px; }
        .window[data-app-id="model-browser"] .model-details-content :is(h1,h2,h3,.model-id,.model-author-large,.req-label,.req-value) { color:#e8f0f4 !important; }

      </style>
        <div class="model-toolbar">
          <div class="toolbar-section">
            <div class="search-box">
              <input type="text" id="model-search" class="sk-input" placeholder="Search models..." value="${this.searchQuery}">
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
            <button class="btn btn-primary sk-btn sk-btn-primary" id="refresh-models">🔄 Refresh</button>
            <button class="btn btn-secondary sk-btn" id="import-model">📥 Import</button>
          </div>
        </div>
        
        <div class="model-content">
          <div class="model-list-container">
            <div class="model-list" id="model-list">
              <!-- Models will be populated here -->
            </div>
          </div>
          
          <div class="model-details" id="model-details">
            <div class="no-selection sk-empty">
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
    const shell = window.classList?.contains('model-browser-container')
      ? window
      : window.querySelector('.model-browser-container');
    const filters = window.querySelector('.filter-buttons');
    const searchBtn = window.querySelector('.search-btn');
    if (shell) {
      shell.classList.add('sk-app');
      shell.style.maxWidth = '100%';
      shell.style.height = '100%';
      shell.style.maxHeight = '100%';
      shell.style.minHeight = '0';
      shell.style.overflow = 'hidden';
      shell.style.boxSizing = 'border-box';
      shell.style.display = 'flex';
      shell.style.flexDirection = 'column';
      const columns = shell.querySelector('.model-content');
      if (columns) {
        columns.style.display = 'flex';
        columns.style.flexDirection = 'column';
        columns.style.flex = '1 1 auto';
        columns.style.minWidth = '0';
        columns.style.minHeight = '0';
        columns.style.overflow = 'hidden';
        columns.style.gap = '8px';
      }
      const list = shell.querySelector('.model-list-container');
      if (list) {
        list.style.flex = '0 0 auto';
        list.style.width = '100%';
        list.style.maxWidth = '100%';
        list.style.maxHeight = '64px';
        list.style.minHeight = '0';
        list.style.overflow = 'auto';
      }
      const details = shell.querySelector('#model-details');
      if (details) {
        details.style.flex = '1 1 auto';
        details.style.minWidth = '0';
        details.style.minHeight = '0';
        details.style.maxWidth = '100%';
        details.style.overflow = 'auto';
      }
    }
    if (filters) {
      filters.style.display = 'flex';
      filters.style.flexWrap = 'wrap';
      filters.style.gap = '4px';
      filters.style.maxWidth = '100%';
    }
    if (searchInput) {
      searchInput.setAttribute('aria-label', 'Search models');
      searchInput.placeholder = 'Search';
    }
    if (searchBtn) {
      searchBtn.type = 'button';
      searchBtn.setAttribute('aria-label', 'Search models');
    }

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
    const selectFromItem = (modelItem) => {
      if (modelItem) this.selectModel(window, modelItem.dataset.modelId);
    };
    modelList.addEventListener('click', (e) => {
      selectFromItem(e.target.closest('.model-item'));
    });
    modelList.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const modelItem = e.target.closest('.model-item');
      if (!modelItem) return;
      e.preventDefault();
      selectFromItem(modelItem);
    });

    // Download modal
    closeDownload.addEventListener('click', () => {
      window.querySelector('#download-modal').style.display = 'none';
    });
  }

  restoreNativeCatalogMetadata() {
    try {
      const raw = localStorage.getItem('model-browser-native-catalog');
      if (!raw || raw.length > 262144) return false;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved.rows) || saved.rows.length > 100 || !Number.isFinite(Date.parse(saved.observedAt))
          || saved.rows.some(row => !row || !/^[a-zA-Z0-9_.:/-]{1,200}$/.test(row.id))) return false;
      this.lastNativeCatalogRows = saved.rows;
      this.models = saved.rows.map(row => ({ id: row.id, name: row.id, author: 'Stored native catalog',
        description: 'Stored metadata; current availability is unconfirmed.', type: /^[a-z-]{1,64}$/.test(row.task || '') ? row.task : 'text-generation',
        size: 'Not reported', downloads: null, likes: null, tags: [], requirements: { memory: 'Not reported', gpu: 'Not reported' } }));
      this.usingSampleModels = false;
      this.catalogObservation = { observedAt: saved.observedAt, stored: true };
      this.selectedModel = this.models.find(row => row.id === saved.selectedId) || null;
      return true;
    } catch { return false; }
  }

  saveNativeCatalogMetadata() {
    if (!this.catalogObservation || !Array.isArray(this.lastNativeCatalogRows)) return;
    try { localStorage.setItem('model-browser-native-catalog', JSON.stringify({ rows: this.lastNativeCatalogRows,
      observedAt: this.catalogObservation.observedAt, selectedId: this.selectedModel?.id || null })); }
    catch { /* Catalog display remains usable when local storage is unavailable. */ }
  }

  async loadModels() {
    if (this.restoreNativeCatalogMetadata()) return;
    try {
      // Load available models from HuggingFace and other sources
      this.models = await this.getAvailableModels();
    } catch (error) {
      console.error('Failed to load models:', error);
      this.models = this.getFallbackModels();
    }
    if (!Array.isArray(this.models)) this.models = [];
    const fixtures = this.getSampleModels().filter((model) =>
      model.id === 'sentence-transformers/all-MiniLM-L6-v2' ||
      model.id === 'openai/clip-vit-base-patch32'
    );
    for (const fixture of fixtures) {
      const index = this.models.findIndex((item) => item && item.id === fixture.id);
      if (index === -1) {
        this.models.push(fixture);
      } else {
        const current = this.models[index];
        this.models[index] = {
          ...current,
          name: current.name || fixture.name,
          type: fixture.type,
          requirements: fixture.requirements,
          tags: Array.isArray(current.tags) && current.tags.length ? current.tags : fixture.tags,
          description: current.description || fixture.description,
          author: current.author || fixture.author,
          size: current.size || fixture.size,
          downloads: current.downloads ?? fixture.downloads,
          likes: current.likes ?? fixture.likes,
          license: current.license || fixture.license,
          lastModified: current.lastModified || fixture.lastModified
        };
      }
    }
  }

  async loadInstalledModels() {
    try {
      const result = await this.swissknife?.models?.list?.();
      this.installedModels = (result && (result.models || result)) || [];
    } catch (error) {
      console.error('Failed to load installed models:', error);
      this.installedModels = [];
    }
  }

  async getAvailableModels() {
    // Try to fetch from HuggingFace API if available
    if (this.swissknife && this.swissknife.models && this.swissknife.models.search) {
      try {
        const result = await this.swissknife.models.search({ limit: 50 });
        if (result && result.models && result.models.length > 0) {
          return result.models;
        }
      } catch (error) {
        console.log('HuggingFace API not available, using fallback data');
      }
    }
    
    // Fallback to clearly-labeled sample models (offline examples only)
    this.usingSampleModels = true;
    return this.getFallbackModels();
  }

  getSampleModels() {
    // Offline example entries only — always presented as samples, never as
    // live catalog data (see getAvailableModels and usingSampleModels).
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

  // Backwards-compatible alias (deprecated): use getSampleModels.
  getFallbackModels() {
    return this.getSampleModels();
  }

  async getAvailableModels() {
    // Real sources first: desktop swissknife models API, then the public
    // Hugging Face Hub catalog. Sample entries are a last resort and are
    // flagged as such so they are never mistaken for live catalog data.
    if (this.desktop?.swissknife?.models) {
      try {
        const models = await this.desktop.swissknife.models.list();
        if (models && models.length) {
          this.usingSampleModels = false;
          return models;
        }
      } catch (error) {
        console.warn('Could not fetch models from API:', error);
      }
    }

    try {
      const response = await fetch('https://huggingface.co/api/models?limit=50&sort=downloads&direction=-1');
      if (response.ok) {
        const items = await response.json();
        if (Array.isArray(items) && items.length) {
          this.usingSampleModels = false;
          return items.map(m => ({
            id: m.id,
            name: m.id,
            description: `Pipeline: ${m.pipeline_tag || 'n/a'} · ⬇ ${m.downloads || 0} · ❤ ${m.likes || 0}`,
            type: m.pipeline_tag || 'unknown',
            size: 'n/a',
            downloads: m.downloads || 0,
            likes: m.likes || 0,
            author: (m.id || '').split('/')[0] || 'Unknown',
            tags: m.tags || [],
            license: 'see hub',
            lastModified: m.lastModified || '',
            requirements: { memory: 'see hub', gpu: 'see hub' }
          }));
        }
      }
    } catch (error) {
      console.warn('Hugging Face catalog unreachable:', error);
    }

    // Fallback to clearly-labeled sample models (offline examples only)
    this.usingSampleModels = true;
    return this.getSampleModels();
  }

  renderModelList(window) {
    const modelList = window.querySelector('#model-list');
    let filteredModels = this.models;

    // Apply search filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filteredModels = filteredModels.filter(model =>
        String(model.name || '').toLowerCase().includes(query) ||
        String(model.id || '').toLowerCase().includes(query) ||
        String(model.description || '').toLowerCase().includes(query) ||
        (model.tags || []).some(tag => String(tag).toLowerCase().includes(query))
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
    this.mountRunHistory(modelList);
    if (this.catalogObservation) {
      const notice = document.createElement('p'); notice.className = 'native-catalog-metadata';
      notice.textContent = `${this.catalogObservation.stored ? 'Stored catalog metadata' : 'Native catalog retrieved'}: ${this.catalogObservation.observedAt}. ${this.catalogObservation.stored ? 'Current availability is unconfirmed; use Refresh.' : 'Use Refresh to obtain a new observation.'}${this.catalogObservation.error ? ` Refresh failed: ${this.catalogObservation.error}` : ''}`;
      modelList.append(notice);
    }
    if (this.usingSampleModels) {
      const banner = document.createElement('div');
      banner.className = 'sample-models-banner';
      banner.style.cssText = 'padding:10px 14px;margin-bottom:12px;background:#ffe08a;border:1px solid #8a6a00;border-radius:8px;font-size:13px;color:#1c1400;line-height:1.4;';
      banner.textContent = 'Showing built-in sample entries. The live model catalog is unreachable from this browser. These are examples only, not live data.';
      modelList.appendChild(banner);
    }

    if (filteredModels.length === 0) {
      modelList.innerHTML = `
        <div class="no-models sk-empty">
          <div class="no-models-icon">🤖</div>
          <h3>No Models Found</h3>
          <p>Try adjusting your search or filter criteria.</p>
        </div>
      `;
      this.mountRunHistory(modelList);
      return;
    }

    filteredModels.forEach(model => {
      const isInstalled = this.installedModels.some(installed => installed.id === model.id);
      const modelItem = document.createElement('div');
      modelItem.className = `model-item sk-card ${isInstalled ? 'installed' : ''}`;
      modelItem.dataset.modelId = model.id;
      modelItem.tabIndex = 0;
      modelItem.setAttribute('role', 'button');
      modelItem.setAttribute('aria-label', model.name || model.id || 'Model');

      modelItem.innerHTML = `
        <div class="model-header">
          <div class="model-icon">${this.getModelIcon(model.type)}</div>
          <div class="model-info">
            <h3 class="model-name">${model.name || model.id || 'Unnamed model'}</h3>
            <p class="model-author">${model.name || model.id || 'Unnamed model'} by ${model.author || 'unknown'}</p>
          </div>
          <div class="model-status">
            ${isInstalled ? '<span class="installed-badge sk-badge">Installed</span>' : ''}
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
          ${(Array.isArray(model.tags) ? model.tags : []).map(tag => `<span class="tag sk-badge">${tag}</span>`).join('')}
        </div>
      `;

      modelList.appendChild(modelItem);
    });
    if (this.selectedModel && window.querySelector('#model-details')) this.renderModelDetails(window);
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
      this.saveNativeCatalogMetadata();
      this.renderModelDetails(window);
    }
  }

  renderModelDetails(window) {
    const modelDetails = window.querySelector('#model-details');
    const model = this.selectedModel;
    const isInstalled = this.installedModels.some(installed => installed.id === model.id);

    modelDetails.innerHTML = `
      <div class="model-details-content">
        ${this.renderTestPanel(model)}
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
            <span class="req-value">${model.requirements?.memory ?? 'unknown'}</span>
          </div>
          <div class="requirement-item">
            <span class="req-label">GPU:</span>
            <span class="req-value">${model.requirements?.gpu ?? 'unknown'}</span>
          </div>
        </div>
        
        <div class="model-tags-section">
          <h3>Tags</h3>
          <div class="tags-list">
            ${(Array.isArray(model.tags) ? model.tags : []).map(tag => `<span class="tag-large">${tag}</span>`).join('')}
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
    const runTest = () => this.runBoundedTest(window, model);
    const runTestBtn = modelDetails.querySelector('#run-model-test');
    const testPrompt = modelDetails.querySelector('#model-test-prompt');
    if (runTestBtn) runTestBtn.addEventListener('click', runTest);
    if (testPrompt) {
      const retainGovernedEnter = (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.stopPropagation();
      };
      testPrompt.addEventListener('keydown', retainGovernedEnter);
      testPrompt.addEventListener('keyup', (event) => {
        retainGovernedEnter(event);
        if (event.key === 'Enter') runTest();
      });
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

    // Honest: this browser surface cannot download multi-GB model weights.
    // "Install" records the model in the user's local library (localStorage)
    // so it can be referenced later — no fake download progress is shown.
    try {
      const key = 'model-browser-library';
      let library = [];
      try { library = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { /* ignore */ }
      if (!library.some(m => m.id === model.id)) {
        library.push({ id: model.id, name: model.name, savedAt: new Date().toISOString(), sample: !!this.usingSampleModels });
        localStorage.setItem(key, JSON.stringify(library));
      }
      this.installedModels.push(model);
      if (downloadModal) downloadModal.style.display = 'none';
      this.renderModelDetails(window);
      this.renderModelList(window);
      this.showNotification(`${model.name} saved to your local library`, 'success');
    } catch (error) {
      if (downloadModal) downloadModal.style.display = 'none';
      this.showNotification(`Failed to save ${model.name}: ${error.message}`, 'error');
    }
  }

  async uninstallModel(window, model) {
    if (confirm(`Are you sure you want to uninstall ${model.name}?`)) {
      try {
        // Remove from installed models
        this.installedModels = this.installedModels.filter(m => m.id !== model.id);
        
        this.renderModelDetails(window);
        this.renderModelList(window);
        
        this.showNotification(`${model.name} uninstalled successfully`, 'success');
      } catch (error) {
        this.showNotification(`Failed to uninstall ${model.name}: ${error.message}`, 'error');
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
        this.showNotification(`${model.name} loaded successfully`, 'success');
        
        // Open AI Chat with the loaded model
        this.desktop.openApp('AIChat', { 
          defaultModel: model.id,
          modelInstance: result.modelInstance 
        });
      } else {
        this.showNotification(`Failed to load ${model.name}: ${result.error}`, 'error');
      }
    } catch (error) {
      this.showNotification(`Failed to load ${model.name}: ${error.message}`, 'error');
    }
  }

  async refreshModels(window) {
    if (this.catalogRefreshPending) return;
    this.catalogRefreshPending = true;
    try {
      const response = await this.dispatchBinding('model-browser.ipfs_accelerate_py.inspect_model_catalog',
        { fixture_scope: 'svf-model-browser-primary' }, window.querySelector('#refresh-models'), 'list_models');
      const actual = unwrapNetworkToolResult(response.result);
      if (!Array.isArray(actual?.models) || actual.models.some(row => typeof row.id !== 'string')) throw new Error('The native owner returned no model catalog.');
      this.nativeModelIds = new Set(actual.models.map(row => row.id));
      this.lastNativeCatalogRows = actual.models;
      this.catalogObservation = { observedAt: new Date().toISOString(), stored: false };
      this.models = actual.models.map(row => ({ ...row, name: row.id, author: 'Local native owner',
        description: 'Advertised by the native model backend.', type: row.task || 'text-generation',
        size: row.size || 'Not reported', downloads: null, likes: null, tags: row.tags || [],
        requirements: { memory: 'Not reported', gpu: 'Not reported' } }));
      this.usingSampleModels = false;
      this.saveNativeCatalogMetadata();
      this.renderModelList(window);
      this.showNotification('Model list refreshed', 'success');
    } catch (error) {
      this.nativeModelIds = null;
      if (this.catalogObservation) this.catalogObservation = { ...this.catalogObservation, stored: true, error: error.message };
      this.renderModelList(window);
      this.showNotification('Failed to refresh models: ' + error.message, 'error');
    } finally {
      this.catalogRefreshPending = false;
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
          this.showNotification(`${modelName} imported successfully`, 'success');
        } else {
          this.showNotification(`Failed to import model: ${result.error}`, 'error');
        }
      } catch (error) {
        this.showNotification('Failed to import model: ' + error.message, 'error');
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
    if (typeof num !== 'number' || !Number.isFinite(num)) return 'n/a';
    const value = Number(num);
    if (!Number.isFinite(value)) return '0';
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return String(value);
  }

  // Enhanced Model Management Methods
  async loadModel(modelId) {
    try {
      if (this.modelServer) {
        console.log(`Loading model via IPFS Accelerate: ${modelId}`);
        const result = await this.modelServer.loadModel(modelId);
        
        if (result.success) {
          this.updateDisplay();
          this.showNotification(`Model ${modelId} loaded successfully`, 'success');
          return result;
        }
      }
      
      // Fallback to traditional model loading
      return await this.loadModelTraditional(modelId);
      
    } catch (error) {
      console.error(`Error loading model ${modelId}:`, error);
      this.showNotification(`Failed to load model: ${error.message}`, 'error');
      throw error;
    }
  }

  async unloadModel(modelId) {
    try {
      if (this.modelServer) {
        console.log(`Unloading model via IPFS Accelerate: ${modelId}`);
        const result = await this.modelServer.unloadModel(modelId);
        
        if (result.success) {
          this.updateDisplay();
          this.showNotification(`Model ${modelId} unloaded successfully`, 'success');
          return result;
        }
      }
      
      console.log(`Model ${modelId} unloaded (traditional)`);
      this.updateDisplay();
      
    } catch (error) {
      console.error(`Error unloading model ${modelId}:`, error);
      this.showNotification(`Failed to unload model: ${error.message}`, 'error');
    }
  }

  async testModel(modelId) {
    try {
      if (!this.modelServer) {
        throw new Error('Model server not available');
      }
      
      // Load model if not already loaded
      const loadedModels = this.modelServer.getLoadedModels();
      if (!loadedModels.includes(modelId)) {
        await this.loadModel(modelId);
      }
      
      // Run a test inference
      const testInput = this.getTestInputForModel(modelId);
      console.log(`Testing model ${modelId} with input:`, testInput);
      
      const result = await this.modelServer.inference(modelId, testInput);
      
      this.showTestResults(modelId, testInput, result);
      this.showNotification(`Model ${modelId} test completed`, 'success');
      
      return result;
      
    } catch (error) {
      console.error(`Error testing model ${modelId}:`, error);
      this.showNotification(`Model test failed: ${error.message}`, 'error');
      throw error;
    }
  }

  getTestInputForModel(modelId) {
    const modelInfo = this.ipfsAccelerateBridge?.supportedModels[modelId];
    
    if (!modelInfo) {
      return "Hello, this is a test message.";
    }
    
    switch (modelInfo.type) {
      case 'text-generation':
        return "Generate a creative story about";
      case 'text-encoding':
      case 'text-embedding':
        return "The quick brown fox jumps over the lazy dog.";
      case 'question-answering':
        return "What is artificial intelligence?";
      case 'text-classification':
        return "This is a positive review of the product.";
      default:
        return "Hello, this is a test message.";
    }
  }

  showTestResults(modelId, input, result) {
    const resultsContainer = document.getElementById('test-results');
    if (!resultsContainer) {
      // Create a temporary modal for test results
      this.showTestResultsModal(modelId, input, result);
      return;
    }
    
    resultsContainer.innerHTML = `
      <div class="test-result">
        <h4>Test Results for ${modelId}</h4>
        <div class="test-input">
          <strong>Input:</strong> ${input}
        </div>
        <div class="test-output">
          <strong>Output:</strong>
          <pre>${JSON.stringify(result.result, null, 2)}</pre>
        </div>
        <div class="test-metadata">
          <strong>Processing Time:</strong> ${result.metadata?.processingTime || 'N/A'}ms<br>
          <strong>Hardware Used:</strong> ${result.metadata?.hardwareUsed || 'N/A'}
        </div>
      </div>
    `;
  }

  showTestResultsModal(modelId, input, result) {
    const modal = document.createElement('div');
    modal.className = 'test-results-modal';
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Model Test Results</h3>
            <button class="close-btn" onclick="this.parentElement.parentElement.parentElement.remove()">✕</button>
          </div>
          <div class="modal-body">
            <div class="test-result">
              <h4>${modelId}</h4>
              <div class="test-section">
                <label>Input:</label>
                <div class="test-input">${input}</div>
              </div>
              <div class="test-section">
                <label>Output:</label>
                <div class="test-output">
                  <pre>${JSON.stringify(result.result, null, 2)}</pre>
                </div>
              </div>
              <div class="test-section">
                <label>Metadata:</label>
                <div class="test-metadata">
                  <div>Processing Time: ${result.metadata?.processingTime || 'N/A'}ms</div>
                  <div>Hardware Used: ${result.metadata?.hardwareUsed || 'N/A'}</div>
                  <div>Inference ID: ${result.inferenceId || 'N/A'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }

  async routeInference(capability, input, options = {}) {
    try {
      if (!this.aiModelRouter) {
        throw new Error('AI Model Router not available');
      }
      
      const result = await this.aiModelRouter.routeRequest({
        capability,
        input,
        options
      });
      
      this.showNotification(`Inference routed successfully via ${result.metadata.endpoint}`, 'success');
      return result;
      
    } catch (error) {
      console.error('Error routing inference:', error);
      this.showNotification(`Inference routing failed: ${error.message}`, 'error');
      throw error;
    }
  }

  // Event handlers for new integrations
  handleModelLoaded(data) {
    console.log(`Model loaded: ${data.modelId}`);
    this.updateModelStatus(data.modelId, 'loaded');
  }

  handleModelUnloaded(data) {
    console.log(`Model unloaded: ${data.modelId}`);
    this.updateModelStatus(data.modelId, 'unloaded');
  }

  handleLoadingProgress(data) {
    console.log(`Loading progress for ${data.modelId}: ${data.progress}%`);
    this.updateLoadingProgress(data.modelId, data.progress, data.message);
  }

  updateModelStatus(modelId, status) {
    const modelElements = document.querySelectorAll(`[data-model-id="${modelId}"]`);
    modelElements.forEach(element => {
      const statusElement = element.querySelector('.model-status');
      if (statusElement) {
        statusElement.innerHTML = status === 'loaded' 
          ? '<span class="loaded-badge">Loaded</span>'
          : '<span class="unloaded-badge">Unloaded</span>';
      }
    });
  }

  updateLoadingProgress(modelId, progress, message) {
    const modelElements = document.querySelectorAll(`[data-model-id="${modelId}"]`);
    modelElements.forEach(element => {
      let progressElement = element.querySelector('.loading-progress');
      if (!progressElement) {
        progressElement = document.createElement('div');
        progressElement.className = 'loading-progress';
        element.appendChild(progressElement);
      }
      
      progressElement.innerHTML = `
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
        <div class="progress-message">${message}</div>
      `;
      
      if (progress >= 100) {
        setTimeout(() => {
          progressElement.remove();
        }, 2000);
      }
    });
  }

  updateModelMetrics(modelId, data) {
    const metrics = this.modelMetrics.get(modelId) || {
      totalInferences: 0,
      totalTime: 0,
      averageTime: 0
    };
    
    metrics.totalInferences++;
    metrics.totalTime += data.metadata?.processingTime || 0;
    metrics.averageTime = metrics.totalTime / metrics.totalInferences;
    
    this.modelMetrics.set(modelId, metrics);
  }

  updateEndpointsList() {
    if (this.aiModelRouter) {
      const endpoints = this.aiModelRouter.getAvailableEndpoints();
      console.log('Available AI endpoints:', endpoints);
      
      // Update UI to show available endpoints
      this.displayEndpointsStatus(endpoints);
    }
  }

  updateRoutingStats() {
    if (this.aiModelRouter) {
      const stats = this.aiModelRouter.getRoutingStats();
      console.log('Routing statistics:', stats);
      
      // Update UI to show routing statistics
      this.displayRoutingStats(stats);
    }
  }

  displayEndpointsStatus(endpoints) {
    const statusContainer = document.getElementById('endpoints-status');
    if (!statusContainer) return;
    
    statusContainer.innerHTML = `
      <h4>Available AI Endpoints (${endpoints.length})</h4>
      <div class="endpoints-list">
        ${endpoints.map(endpoint => `
          <div class="endpoint-item ${endpoint.status}">
            <div class="endpoint-info">
              <strong>${endpoint.name}</strong> (${endpoint.type})
              <span class="endpoint-status ${endpoint.status}"><span class="sk-status-dot ${endpoint.status === 'available' ? 'is-ok' : endpoint.status === 'unavailable' ? 'is-err' : 'is-idle'}"></span>${endpoint.status}</span>
            </div>
            <div class="endpoint-metrics">
              Latency: ${endpoint.metrics.latency}ms | 
              Reliability: ${Math.round(endpoint.metrics.reliability * 100)}%
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  displayRoutingStats(stats) {
    const statsContainer = document.getElementById('routing-stats');
    if (!statsContainer) return;
    
    statsContainer.innerHTML = `
      <h4>Routing Statistics</h4>
      <div class="stats-grid">
        <div class="stat-item">
          <label>Total Requests:</label>
          <span>${stats.totalRequests}</span>
        </div>
        <div class="stat-item">
          <label>Success Rate:</label>
          <span>${Math.round(stats.successRate * 100)}%</span>
        </div>
        <div class="stat-item">
          <label>Average Response Time:</label>
          <span>${stats.avgResponseTime}ms</span>
        </div>
      </div>
    `;
  }

  runHistoryKey() {
    return 'svf-model-browser-runs';
  }

  mountRunHistory(modelList) {
    const root = (modelList && modelList.closest && modelList.closest('.model-browser-container')) || modelList;
    if (!root) return;
    let slot = root.querySelector('#model-run-history');
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'model-run-history';
      slot.className = 'sk-card';
      slot.setAttribute('aria-live', 'polite');
      slot.style.cssText = 'padding:6px 8px;margin:0 0 6px;max-height:none;overflow:visible;white-space:normal;color:#f4fbff;background:#1a4558;border:1px solid #8ec5d8;border-radius:6px;font-size:13px;line-height:1.35;overflow-wrap:anywhere;width:100%;box-sizing:border-box;';
      if (modelList && modelList.prepend) modelList.prepend(slot);
      else root.prepend(slot);
    }
    let runs = [];
    try {
      runs = JSON.parse(localStorage.getItem(this.runHistoryKey()) || '[]');
    } catch (error) {
      runs = [];
    }
    const last = Array.isArray(runs) ? runs[0] : null;
    slot.style.cssText = 'padding:6px 8px;margin:0 0 6px;max-height:none;overflow:visible;white-space:normal;color:#f4fbff;background:#1a4558;border:1px solid #8ec5d8;border-radius:6px;font-size:13px;line-height:1.35;overflow-wrap:anywhere;width:100%;box-sizing:border-box;';
    slot.textContent = last && last.modelId
      ? `Saved run: ${last.modelId} | ${last.prompt} | ${last.output}`
      : 'No completed runs yet.';
  }

  isTextRunBlocked(model) {
    const type = String(model?.type || model?.category || '').toLowerCase();
    if (type.includes('vision') || type.includes('image') || type.includes('speech') || type.includes('audio')) {
      return true;
    }
    const gpu = model?.requirements?.gpu;
    const gpuText = String(gpu ?? '').toLowerCase();
    return gpu === true || gpuText.includes('recommend') || (gpuText.includes('required') && !gpuText.includes('not required') && !gpuText.includes('optional'));
  }

  renderTestPanel(model) {
    const memory = model.requirements?.memory ?? model.requirements?.ram ?? 'unknown';
    const gpu = model.requirements?.gpu ?? 'unknown';
    const compatible = this.isTextRunBlocked(model)
      ? 'This model is not available for a short text run here.'
      : 'Compatible with a short text run.';
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
    let savedPrompt = '';
    let savedOutput = '';
    try {
      const runs = JSON.parse(localStorage.getItem(this.runHistoryKey()) || '[]');
      const last = Array.isArray(runs) ? runs.find((row) => row && row.modelId === model.id && row.prompt && row.output) : null;
      if (last) {
        savedPrompt = String(last.prompt);
        savedOutput = String(last.output);
      }
    } catch (error) {
      savedPrompt = '';
    }
    const savedResult = savedOutput ? 'Prompt: ' + esc(savedPrompt) + '\nOutput: ' + esc(savedOutput) : '';
    return `
      <div class="model-test-panel" style="display:flex;flex-direction:column;gap:2px;max-width:100%;padding:4px 6px;box-sizing:border-box;flex:0 0 auto;">
        <h3 style="margin:0;font-size:14px;">Bounded test</h3>
        <p id="hardware-compatibility" style="margin:0;font-size:12px;">Hardware: memory ${memory}; GPU ${gpu}. ${compatible}</p>
        <label for="model-test-model-id" style="display:block;font-size:12px;">Model ID</label>
        <input id="model-test-model-id" class="sk-input" aria-label="Model ID for bounded test" style="display:block;width:100%;max-width:100%;box-sizing:border-box;" value="${esc(model.id)}">
        <label for="model-test-prompt" style="display:block;font-size:12px;">Test prompt</label>
        <input type="text" id="model-test-prompt" class="sk-input" aria-label="Test prompt" maxlength="240" placeholder="Short prompt" value="${esc(savedPrompt)}" style="display:block;width:100%;max-width:100%;box-sizing:border-box;">
        <button type="button" class="btn btn-primary sk-btn sk-btn-primary" id="run-model-test">Run bounded test</button>
        <p id="model-run-status" aria-live="polite" style="margin:0;">Run status: idle</p>
        <pre id="model-test-output" aria-label="Test output" style="margin:0;min-height:2.2em;max-height:3.2em;overflow:auto;white-space:pre-wrap;background:#101b22;color:#d2e0ea;">${savedResult}</pre>
      </div>
    `;
  }

  async dispatchBinding(bindingId, input, trigger, toolId = 'run_inference_job') {
    const content = (trigger && trigger.closest && trigger.closest('.window-app-content'))
      || document.querySelector('.window[data-app-id="model-browser"] .window-app-content')
      || document.querySelector('.window[data-app-id="model-browser"]');
    const panel = trigger && trigger.closest && trigger.closest('.model-test-panel');
    const details = panel && panel.closest && panel.closest('#model-details');
    if (details) details.scrollTop = 0;
    if (!content) {
      throw new Error('Model browser content host unavailable');
    }
    const payload = await invokeNativeTool(content, 'model-browser', bindingId, {
      executionMode: 'execute',
      toolId,
      payload: input,
      trigger: trigger || null
    });
    if (!payload || payload.ok !== true || payload.outcome !== 'executed') {
      throw new Error('Owner call failed');
    }
    return payload;
  }

  ownerRunFields(payload) {
    const root = unwrapNetworkToolResult(payload?.result) || {};
    const nested = root?.result?.content?.[0]?.json
      || root?.content?.[0]?.json
      || (root?.result && typeof root.result === 'object' && !Array.isArray(root.result) ? root.result : null)
      || root;
    if (nested?.dry_run === true || nested?.preview === true || root.dry_run === true || root.preview === true) {
      return { status: 'preview', outputText: '' };
    }
    const output = nested?.output ?? nested?.text ?? nested?.generated_text ?? nested?.completion
      ?? root.output ?? root.text ?? root.generated_text ?? '';
    const outputText = typeof output === 'string'
      ? output
      : (output && typeof output === 'object' && typeof output.text === 'string' ? output.text : '');
    return {
      status: String(nested?.status || nested?.run_status || root.status || root.run_status || ''),
      outputText
    };
  }

  rememberRun(model, prompt, outputText, status) {
    const entry = {
      modelId: model.id,
      prompt,
      output: outputText,
      status,
      savedAt: new Date().toISOString()
    };
    let runs = [];
    try {
      runs = JSON.parse(localStorage.getItem(this.runHistoryKey()) || '[]');
    } catch (error) {
      runs = [];
    }
    if (!Array.isArray(runs)) runs = [];
    runs.unshift(entry);
    localStorage.setItem(this.runHistoryKey(), JSON.stringify(runs.slice(0, 8)));
  }

  async runBoundedTest(window, model) {
    if (this.modelRunPending) return;
    const promptEl = window.querySelector('#model-test-prompt');
    const statusEl = window.querySelector('#model-run-status');
    const outputEl = window.querySelector('#model-test-output');
    if (!promptEl || !statusEl || !outputEl || !model) return;
    const prompt = promptEl.value.trim();
    const modelId = window.querySelector('#model-test-model-id')?.value.trim() || model.id;
    outputEl.textContent = '';
    statusEl.dataset.runState = 'running';
    if (!this.nativeModelIds?.has(modelId)) {
      statusEl.textContent = this.nativeModelIds ? 'Run status: unsupported model' : 'Run status: model catalog unavailable';
      statusEl.dataset.runState = 'failed';
      outputEl.textContent = 'No generated answer.';
      return;
    }
    if (this.isTextRunBlocked(model)) {
      statusEl.textContent = 'Run status: insufficient capacity';
      statusEl.dataset.runState = 'failed';
      outputEl.textContent = 'No generated answer.';
      return;
    }
    if (!prompt) {
      statusEl.textContent = 'Run status: failed';
      statusEl.dataset.runState = 'failed';
      outputEl.textContent = 'No generated answer.';
      return;
    }
    statusEl.textContent = 'Run status: running';
    this.modelRunPending = true;
    try {
      const payload = await this.dispatchBinding(
        'model-browser.ipfs_accelerate_py.inspect_model_catalog',
        {
          fixture_scope: 'svf-model-browser-primary',
          model: modelId,
          model_id: modelId,
          prompt,
          input: prompt,
          max_new_tokens: 1,
          max_length: 4
        },
        promptEl
      );
      const fields = this.ownerRunFields(payload);
      if (!fields.outputText || fields.status.toLowerCase() !== 'completed') {
        statusEl.textContent = 'Run status: failed';
        statusEl.dataset.runState = 'failed';
        outputEl.textContent = 'No generated answer.';
        return;
      }
      statusEl.textContent = 'Run status: completed';
      statusEl.dataset.runState = 'completed';
      outputEl.textContent = `Prompt: ${prompt}\nOutput: ${fields.outputText}`;
      this.rememberRun({ ...model, id: modelId }, prompt, fields.outputText, fields.status);
      const slot = window.querySelector('#model-run-history');
      if (slot) slot.textContent = `Saved run: ${modelId} | ${prompt} | ${fields.outputText}`;
    } catch (error) {
      statusEl.textContent = 'Run status: failed';
      statusEl.dataset.runState = 'failed';
      outputEl.textContent = 'No generated answer.';
    } finally {
      this.modelRunPending = false;
    }
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <span class="notification-icon">
          ${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}
        </span>
        <span class="notification-message">${message}</span>
      </div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  // Enhanced display update
  updateDisplay() {
    // Call the original renderModelList if it exists
    if (typeof this.renderModelList === 'function') {
      const container = document.querySelector('.model-browser-container');
      if (container) {
        this.renderModelList(container);
      }
    }
    
    // Update endpoints and stats
    this.updateEndpointsList();
    this.updateRoutingStats();
  }

  // Modern app framework methods
  async initialize() {
    console.log('🚀 Initializing Model Browser app...');
    this.swissknife = this.desktop.swissknife;
    await this.initializeIntegrations();
    await this.loadModels();
    await this.loadInstalledModels();
    console.log('✅ Model Browser initialized');
    return this;
  }

  async render() {
    console.log('🎨 Rendering Model Browser app...');
    const windowConfig = this.createWindowConfig();
    
    // Set up event handlers after the HTML is rendered
    setTimeout(() => {
      const container = document.querySelector('.model-browser-container');
      if (container) {
        this.setupEventListeners(container);
        this.renderModelList(container);
      }
    }, 100);
    
    return windowConfig;
  }

  createWindowConfig() {
    // Get content from the original createWindow method
    const content = this.getWindowContent();
    
    return {
      title: '🧠 Model Browser',
      content: content,
      width: 1000,
      height: 700,
      resizable: true,
      x: 150,
      y: 100
    };
  }

  getWindowContent() {
    let historyText = 'No completed runs yet.';
    try {
      const runs = JSON.parse(localStorage.getItem(this.runHistoryKey()) || '[]');
      const last = Array.isArray(runs) ? runs[0] : null;
      if (last && last.modelId) historyText = `${last.modelId} | ${last.prompt} | ${last.output}`;
    } catch (error) {
      historyText = 'No completed runs yet.';
    }
    const safeHistory = String(historyText).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
    return `
      <div class="model-browser-container">
      <style>
        .window[data-app-id="model-browser"] .window-content { display:flex; flex-direction:column; min-height:0; overflow:hidden; padding-bottom:0; }
        .window[data-app-id="model-browser"] .window-app-content { display:flex; flex-direction:column; height:100%; min-height:0; min-width:0; overflow:hidden; }
        .window[data-app-id="model-browser"] .window-app-content > [id$="-content"] { flex:1 1 0; min-height:0; min-width:0; overflow:hidden; }
        .window[data-app-id="model-browser"] .model-browser-container { height:100%; max-height:100%; min-height:0; min-width:0; box-sizing:border-box; overflow:auto; overscroll-behavior:contain; }
        .window[data-app-id="model-browser"] .model-browser-container { background:#101b22; color:#e8f0f4; }
        .window[data-app-id="model-browser"] :is(.model-item,.model-details-content,.model-test-panel,.search-filter-bar) { background:#18262d !important; color:#e8f0f4 !important; }
        .window[data-app-id="model-browser"] :is(.model-description,.model-metadata,.model-author,.native-catalog-metadata) { color:#c4d4df !important; }
        .window[data-app-id="model-browser"] #model-list { background:#101b22 !important; color:#e8f0f4 !important; }
        .window[data-app-id="model-browser"] .native-catalog-metadata { background:#101b22; color:#d2e0ea !important; padding:8px; }
        .window[data-app-id="model-browser"] .model-details-content :is(h1,h2,h3,.model-id,.model-author-large,.req-label,.req-value) { color:#e8f0f4 !important; }
        .window[data-app-id="model-browser"] .window-content { padding-bottom:8px !important; overflow:hidden !important; }
        .window[data-app-id="model-browser"] .model-browser-container { width:100% !important; max-width:100% !important; background:#101b22 !important; }
        .window[data-app-id="model-browser"] .model-content { display:flex !important; flex-direction:column !important; width:100% !important; max-width:100% !important; min-width:0 !important; flex:1 1 auto !important; min-height:0 !important; grid-template-columns:1fr !important; }
        .window[data-app-id="model-browser"] .model-list-container, .window[data-app-id="model-browser"] #model-list { width:100% !important; max-width:100% !important; flex:0 0 auto !important; max-height:64px !important; min-height:0 !important; overflow:hidden !important; position:relative !important; }
        .window[data-app-id="model-browser"] .model-item { padding:4px 8px !important; margin:0 0 4px !important; max-height:36px !important; overflow:hidden !important; }
        .window[data-app-id="model-browser"] .model-author, .window[data-app-id="model-browser"] .model-tags, .window[data-app-id="model-browser"] .model-description, .window[data-app-id="model-browser"] .model-metadata { display:none !important; }
        .window[data-app-id="model-browser"] .native-catalog-metadata { position:static !important; display:block !important; max-height:1.25em !important; margin:0 !important; padding:0 8px !important; overflow:hidden !important; white-space:nowrap !important; text-overflow:ellipsis !important; }
        .window[data-app-id="model-browser"] #model-details { width:100% !important; max-width:100% !important; flex:1 1 auto !important; min-height:0 !important; overflow:auto !important; background:#101b22 !important; color:#e8f0f4 !important; }
        .window[data-app-id="model-browser"] #model-test-output { display:block !important; min-height:2.2em !important; max-height:3.2em !important; overflow:auto !important; color:#f4fbff !important; background:#0c1419 !important; border:1px solid #3d5c6e !important; }
        .window[data-app-id="model-browser"] #model-run-history { display:block !important; width:100% !important; max-height:none !important; overflow:visible !important; white-space:normal !important; color:#f4fbff !important; background:#1a4558 !important; font-size:13px !important; line-height:1.35 !important; }
        .window[data-app-id="model-browser"] #import-model { background:#0f6e8c !important; color:#f7fdff !important; border:1px solid #b7e4f3 !important; opacity:1 !important; }

      </style>
        <div id="model-run-history" class="sk-card" aria-live="polite" style="padding:4px 8px;margin:0 0 6px;max-height:2.6em;overflow:hidden;color:#d2e0ea;background:#101b22;border:1px solid #2a3e4a;border-radius:6px;font-size:12px;line-height:1.4;overflow-wrap:anywhere;">Saved run: ${safeHistory}</div>
        <div class="model-toolbar">
          <div class="toolbar-section">
            <div class="search-box">
              <input type="text" id="model-search" class="sk-input" placeholder="Search models..." value="${this.searchQuery}">
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
            <button class="btn btn-primary sk-btn sk-btn-primary" id="refresh-models">🔄 Refresh</button>
            <button class="btn btn-secondary sk-btn" id="import-model">📥 Import</button>
          </div>
        </div>
        
        <div class="model-content">
          <div class="model-list-container">
            <div class="model-list" id="model-list">
              <!-- Models will be populated here -->
            </div>
          </div>
          
          <div class="model-details" id="model-details">
            <div class="no-selection sk-empty">
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
                <div class="model-name" id="download-model-name"></div>
                <div class="download-progress">
                  <div class="progress-bar">
                    <div class="progress-fill" id="progress-fill" style="width: 0%"></div>
                  </div>
                  <div class="progress-text" id="progress-text">0%</div>
                </div>
                <div class="download-speed" id="download-speed">0 MB/s</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
