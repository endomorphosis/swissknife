/**
 * Neural Network Designer App for SwissKnife Web Desktop
 * Visual interface for designing and configuring neural networks with IPFS model versioning
 */

export class NeuralNetworkDesignerApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    
    // Application state
    this.networkConfig = {
      layers: [],
      connections: [],
      metadata: {
        name: 'Untitled Network',
        description: '',
        version: '1.0.0',
        author: '',
        created: new Date().toISOString()
      }
    };
    
    this.selectedLayer = null;
    this.draggedLayer = null;
    this.connectionMode = false;
    this.p2pSystem = null;
    this.ipfsStorage = null;

    // Layer types with configurations
    this.layerTypes = {
      input: { 
        name: 'Input Layer', 
        icon: '📥', 
        color: '#4CAF50',
        params: ['inputSize', 'inputType']
      },
      dense: { 
        name: 'Dense/Linear', 
        icon: '🔗', 
        color: '#2196F3',
        params: ['units', 'activation', 'dropout']
      },
      conv2d: { 
        name: 'Conv2D', 
        icon: '🔲', 
        color: '#FF9800',
        params: ['filters', 'kernelSize', 'strides', 'padding', 'activation']
      },
      maxpool: { 
        name: 'MaxPool2D', 
        icon: '⬇️', 
        color: '#9C27B0',
        params: ['poolSize', 'strides']
      },
      dropout: { 
        name: 'Dropout', 
        icon: '🎯', 
        color: '#F44336',
        params: ['rate']
      },
      batchnorm: { 
        name: 'BatchNorm', 
        icon: '📊', 
        color: '#607D8B',
        params: ['momentum', 'epsilon']
      },
      attention: { 
        name: 'Attention', 
        icon: '👁️', 
        color: '#E91E63',
        params: ['numHeads', 'keyDim', 'dropout']
      },
      transformer: { 
        name: 'Transformer', 
        icon: '🔄', 
        color: '#3F51B5',
        params: ['numHeads', 'dModel', 'dff', 'dropout']
      },
      output: { 
        name: 'Output Layer', 
        icon: '📤', 
        color: '#795548',
        params: ['outputSize', 'activation']
      }
    };
  }

  async initialize() {
    try {
      this.swissknife = this.desktop.swissknife;
      await this.initializeP2PSystem();
      this.addStyles();
      console.log('✅ Neural Network Designer integrations initialized');
    } catch (error) {
      console.error('❌ Neural Network Designer integration error:', error);
    }
  }

  render() {
    return `
      <div class="neural-designer-container">
        <!-- Toolbar -->
        <div class="designer-toolbar">
          <div class="toolbar-section">
            <span class="network-name" id="network-name">${this.networkConfig.metadata.name}</span>
            <button class="btn btn-sm" onclick="this.showMetadataModal()">✏️ Edit</button>
          </div>
          
          <div class="toolbar-section">
            <button class="btn btn-sm" onclick="this.newNetwork()">🆕 New</button>
            <button class="btn btn-sm" onclick="this.loadNetwork()">📂 Load</button>
            <button class="btn btn-sm" onclick="this.saveNetwork()">💾 Save</button>
            <button class="btn btn-sm" onclick="this.exportNetwork()">📤 Export</button>
          </div>
          
          <div class="toolbar-section">
            <button class="btn btn-sm" onclick="this.validateNetwork()">✅ Validate</button>
            <button class="btn btn-sm btn-success" onclick="this.trainNetwork()">🚀 Train</button>
            <button class="btn btn-sm" onclick="this.deployToP2P()">🌐 Deploy</button>
          </div>
          
          <div class="toolbar-section">
            <button class="btn btn-sm" onclick="this.undo()">↶ Undo</button>
            <button class="btn btn-sm" onclick="this.redo()">↷ Redo</button>
            <button class="btn btn-sm" onclick="this.clearCanvas()">🗑️ Clear</button>
          </div>
        </div>

        <!-- Main Content -->
        <div class="designer-content">
          <!-- Layer Palette -->
          <div class="layer-palette">
            <h3>🧱 Layer Types</h3>
            <div class="palette-grid">
              ${Object.entries(this.layerTypes).map(([type, config]) => `
                <div class="layer-type" draggable="true" data-layer-type="${type}" style="border-left: 4px solid ${config.color}">
                  <span class="layer-icon">${config.icon}</span>
                  <span class="layer-name">${config.name}</span>
                </div>
              `).join('')}
            </div>
            
            <div class="connection-tools">
              <h4>🔗 Connection Tools</h4>
              <button class="tool-btn" id="connection-mode" onclick="this.toggleConnectionMode()">
                🔗 Connect Layers
              </button>
              <button class="tool-btn" onclick="this.autoConnect()">
                ⚡ Auto Connect
              </button>
              <button class="tool-btn" onclick="this.clearConnections()">
                🗑️ Clear Connections
              </button>
            </div>
          </div>

          <!-- Canvas Container -->
          <div class="canvas-container">
            <canvas id="network-canvas" width="800" height="600"></canvas>
            <div class="canvas-overlay" id="canvas-overlay"></div>
          </div>

          <!-- Properties Panel -->
          <div class="properties-panel">
            <h3>⚙️ Properties</h3>
            <div id="layer-properties">
              <div class="no-selection">
                Select a layer to view its properties
              </div>
            </div>
            
            <!-- Network Summary -->
            <div class="network-summary">
              <h4>📊 Network Summary</h4>
              <div class="summary-stats" id="network-stats">
                <div class="stat">
                  <span class="stat-label">Total Layers:</span>
                  <span class="stat-value" id="total-layers">0</span>
                </div>
                <div class="stat">
                  <span class="stat-label">Parameters:</span>
                  <span class="stat-value" id="total-params">0</span>
                </div>
                <div class="stat">
                  <span class="stat-label">Connections:</span>
                  <span class="stat-value" id="total-connections">0</span>
                </div>
                <div class="stat">
                  <span class="stat-label">Memory:</span>
                  <span class="stat-value" id="memory-usage">0 MB</span>
                </div>
              </div>
            </div>
            
            <!-- Version Control -->
            <div class="version-control">
              <h4>📂 Version Control</h4>
              <div class="current-version">
                <span>v${this.networkConfig.metadata.version}</span>
                <button class="btn btn-sm" onclick="this.commitVersion()">💾</button>
              </div>
              <button class="btn btn-sm" onclick="this.viewVersionHistory()">📜 History</button>
              <button class="btn btn-sm" onclick="this.shareToIPFS()">🌐 Share</button>
            </div>
          </div>
        </div>

        <!-- Status Bar -->
        <div class="designer-status">
          <div class="status-section">
            <span class="status-item">Layers: <span id="status-layers">0</span></span>
            <span class="status-item">P2P: <span id="p2p-status">Disconnected</span></span>
            <span class="status-item">IPFS: <span id="ipfs-status">Ready</span></span>
          </div>
          <div class="status-section">
            <span class="status-item">Canvas: 800x600</span>
            <span class="status-item">Zoom: 100%</span>
          </div>
        </div>
      </div>

      <!-- Metadata Modal -->
      <div id="metadata-modal" class="modal" style="display: none;">
        <div class="modal-content">
          <h3>📝 Network Metadata</h3>
          <form id="metadata-form" onsubmit="this.saveMetadata(event)">
            <div class="form-group">
              <label for="meta-name">Network Name:</label>
              <input type="text" id="meta-name" value="${this.networkConfig.metadata.name}" required>
            </div>
            <div class="form-group">
              <label for="meta-description">Description:</label>
              <textarea id="meta-description" rows="3">${this.networkConfig.metadata.description}</textarea>
            </div>
            <div class="form-group">
              <label for="meta-author">Author:</label>
              <input type="text" id="meta-author" value="${this.networkConfig.metadata.author}">
            </div>
            <div class="form-group">
              <label for="meta-version">Version:</label>
              <input type="text" id="meta-version" value="${this.networkConfig.metadata.version}">
            </div>
            <div class="form-actions">
              <button type="button" class="btn" onclick="this.hideMetadataModal()">Cancel</button>
              <button type="submit" class="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  // Initialize P2P system for distributed training
  async initializeP2PSystem() {
    try {
      if (window.initializeP2PMLSystem) {
        this.p2pSystem = window.initializeP2PMLSystem({
          enableModelSharing: true,
          enableIPFS: true
        });
        this.ipfsStorage = this.p2pSystem?.getIPFSStorage();
      }
    } catch (error) {
      console.warn('P2P system not available for Neural Network Designer:', error);
    }
  }

  function renderApp(container) {
    container.innerHTML = `
      <div class="neural-designer-container">
        <!-- Header Toolbar -->
        <div class="designer-toolbar">
          <div class="toolbar-section">
            <button class="btn btn-primary" id="new-network">🆕 New</button>
            <button class="btn btn-secondary" id="load-network">📂 Load</button>
            <button class="btn btn-secondary" id="save-network">💾 Save</button>
            <button class="btn btn-secondary" id="export-network">📤 Export</button>
          </div>
          <div class="toolbar-section">
            <span class="network-name" id="network-name">${networkConfig.metadata.name}</span>
            <button class="btn btn-sm" id="edit-metadata">✏️</button>
          </div>
          <div class="toolbar-section">
            <button class="btn btn-success" id="validate-network">✅ Validate</button>
            <button class="btn btn-warning" id="deploy-network">🚀 Deploy</button>
          </div>
        </div>

        <!-- Main Content -->
        <div class="designer-content">
          <!-- Layer Palette -->
          <div class="layer-palette">
            <h3>Layer Types</h3>
            <div class="palette-grid">
              ${Object.entries(layerTypes).map(([type, config]) => `
                <div class="layer-type" data-layer-type="${type}" draggable="true">
                  <span class="layer-icon" style="color: ${config.color}">${config.icon}</span>
                  <span class="layer-name">${config.name}</span>
                </div>
              `).join('')}
            </div>
            
            <!-- Connection Tools -->
            <div class="connection-tools">
              <h4>Tools</h4>
              <button class="tool-btn" id="connection-mode">🔗 Connect</button>
              <button class="tool-btn" id="delete-mode">🗑️ Delete</button>
              <button class="tool-btn" id="select-mode">👆 Select</button>
            </div>
          </div>

          <!-- Canvas Area -->
          <div class="canvas-container">
            <canvas id="network-canvas" width="800" height="600"></canvas>
            <div class="canvas-overlay" id="canvas-overlay"></div>
          </div>

          <!-- Properties Panel -->
          <div class="properties-panel">
            <h3>Properties</h3>
            <div id="layer-properties">
              <p class="no-selection">Select a layer to edit properties</p>
            </div>
            
            <!-- Network Summary -->
            <div class="network-summary">
              <h4>Network Summary</h4>
              <div class="summary-stats">
                <div class="stat">
                  <span class="stat-label">Layers:</span>
                  <span class="stat-value" id="layer-count">0</span>
                </div>
                <div class="stat">
                  <span class="stat-label">Parameters:</span>
                  <span class="stat-value" id="param-count">0</span>
                </div>
                <div class="stat">
                  <span class="stat-label">Connections:</span>
                  <span class="stat-value" id="connection-count">0</span>
                </div>
              </div>
            </div>

            <!-- IPFS Version Control -->
            <div class="version-control">
              <h4>Version Control</h4>
              <div class="version-info">
                <div class="current-version">
                  <span>Version: ${networkConfig.metadata.version}</span>
                  <button class="btn btn-sm" id="create-version">📝 New Version</button>
                </div>
                <div class="version-history" id="version-history">
                  <!-- Version history will be populated here -->
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Status Bar -->
        <div class="designer-status">
          <div class="status-section">
            <span class="status-item">Ready</span>
          </div>
          <div class="status-section">
            <span class="status-item" id="p2p-status">P2P: ${p2pSystem ? 'Connected' : 'Disconnected'}</span>
            <span class="status-item" id="ipfs-status">IPFS: ${ipfsStorage ? 'Available' : 'Unavailable'}</span>
          </div>
        </div>
      </div>

      <!-- Modals -->
      <div id="metadata-modal" class="modal" style="display: none;">
        <div class="modal-content">
          <h3>Network Metadata</h3>
          <form id="metadata-form">
            <div class="form-group">
              <label>Name:</label>
              <input type="text" id="meta-name" value="${networkConfig.metadata.name}">
            </div>
            <div class="form-group">
              <label>Description:</label>
              <textarea id="meta-description">${networkConfig.metadata.description}</textarea>
            </div>
            <div class="form-group">
              <label>Author:</label>
              <input type="text" id="meta-author" value="${networkConfig.metadata.author}">
            </div>
            <div class="form-group">
              <label>Version:</label>
              <input type="text" id="meta-version" value="${networkConfig.metadata.version}">
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-secondary" id="cancel-metadata">Cancel</button>
              <button type="submit" class="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>
    `;

    // Apply styling
    addNeuralDesignerStyles();
    updateNetworkSummary();
    renderCanvas(container);
  }

  function setupEventHandlers(container) {
    // Toolbar events
    container.querySelector('#new-network').addEventListener('click', createNewNetwork);
    container.querySelector('#load-network').addEventListener('click', loadNetwork);
    container.querySelector('#save-network').addEventListener('click', saveNetwork);
    container.querySelector('#export-network').addEventListener('click', exportNetwork);
    container.querySelector('#edit-metadata').addEventListener('click', showMetadataModal);
    container.querySelector('#validate-network').addEventListener('click', validateNetwork);
    container.querySelector('#deploy-network').addEventListener('click', deployNetwork);

    // Tool events
    container.querySelector('#connection-mode').addEventListener('click', () => setMode('connection'));
    container.querySelector('#delete-mode').addEventListener('click', () => setMode('delete'));
    container.querySelector('#select-mode').addEventListener('click', () => setMode('select'));

    // Version control
    container.querySelector('#create-version').addEventListener('click', createNewVersion);

    // Modal events
    container.querySelector('#cancel-metadata').addEventListener('click', hideMetadataModal);
    container.querySelector('#metadata-form').addEventListener('submit', saveMetadata);

    // Layer palette drag events
    const layerTypes = container.querySelectorAll('.layer-type');
    layerTypes.forEach(layerEl => {
      layerEl.addEventListener('dragstart', handleLayerDragStart);
    });
  }

  function setupCanvasInteractions(container) {
    const canvas = container.querySelector('#network-canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.addEventListener('dragover', handleCanvasDragOver);
    canvas.addEventListener('drop', handleCanvasDrop);
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('mouseup', handleCanvasMouseUp);
  }

  function renderCanvas(container) {
    const canvas = container.querySelector('#network-canvas');
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    drawGrid(ctx, canvas.width, canvas.height);
    
    // Draw connections
    networkConfig.connections.forEach(connection => {
      drawConnection(ctx, connection);
    });
    
    // Draw layers
    networkConfig.layers.forEach(layer => {
      drawLayer(ctx, layer);
    });
  }

  function drawGrid(ctx, width, height) {
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;
    
    const gridSize = 20;
    
    for (let x = 0; x <= width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    for (let y = 0; y <= height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  function drawLayer(ctx, layer) {
    const config = layerTypes[layer.type];
    const x = layer.x;
    const y = layer.y;
    const width = 120;
    const height = 60;
    
    // Draw layer background
    ctx.fillStyle = selectedLayer === layer ? '#e3f2fd' : '#ffffff';
    ctx.strokeStyle = config.color;
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    
    // Draw layer icon and name
    ctx.fillStyle = config.color;
    ctx.font = '16px Arial';
    ctx.fillText(config.icon, x + 10, y + 25);
    
    ctx.fillStyle = '#333333';
    ctx.font = '12px Arial';
    ctx.fillText(config.name, x + 35, y + 20);
    ctx.fillText(layer.name || `Layer ${layer.id}`, x + 10, y + 40);
    
    // Draw parameters summary
    if (layer.params) {
      ctx.font = '10px Arial';
      ctx.fillStyle = '#666666';
      const paramText = Object.entries(layer.params)
        .slice(0, 2)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      ctx.fillText(paramText, x + 10, y + 55);
    }
  }

  function drawConnection(ctx, connection) {
    const fromLayer = networkConfig.layers.find(l => l.id === connection.from);
    const toLayer = networkConfig.layers.find(l => l.id === connection.to);
    
    if (!fromLayer || !toLayer) return;
    
    const fromX = fromLayer.x + 120;
    const fromY = fromLayer.y + 30;
    const toX = toLayer.x;
    const toY = toLayer.y + 30;
    
    ctx.strokeStyle = '#2196F3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    
    // Draw arrow
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const arrowLength = 10;
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - arrowLength * Math.cos(angle - Math.PI / 6),
      toY - arrowLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - arrowLength * Math.cos(angle + Math.PI / 6),
      toY - arrowLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
  }

  function handleLayerDragStart(e) {
    const layerType = e.target.closest('.layer-type').dataset.layerType;
    e.dataTransfer.setData('application/layer-type', layerType);
  }

  function handleCanvasDragOver(e) {
    e.preventDefault();
  }

  function handleCanvasDrop(e) {
    e.preventDefault();
    const layerType = e.dataTransfer.getData('application/layer-type');
    if (layerType) {
      const rect = e.target.getBoundingClientRect();
      const x = Math.round((e.clientX - rect.left) / 20) * 20;
      const y = Math.round((e.clientY - rect.top) / 20) * 20;
      
      addLayer(layerType, x, y);
    }
  }

  function handleCanvasClick(e) {
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const clickedLayer = findLayerAt(x, y);
    
    if (connectionMode && selectedLayer && clickedLayer && selectedLayer !== clickedLayer) {
      addConnection(selectedLayer.id, clickedLayer.id);
      setMode('select');
    } else {
      selectLayer(clickedLayer);
    }
  }

  function handleCanvasMouseDown(e) {
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    draggedLayer = findLayerAt(x, y);
    if (draggedLayer) {
      draggedLayer.dragOffsetX = x - draggedLayer.x;
      draggedLayer.dragOffsetY = y - draggedLayer.y;
    }
  }

  function handleCanvasMouseMove(e) {
    if (draggedLayer) {
      const rect = e.target.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      draggedLayer.x = Math.round((x - draggedLayer.dragOffsetX) / 20) * 20;
      draggedLayer.y = Math.round((y - draggedLayer.dragOffsetY) / 20) * 20;
      
      renderCanvas(e.target.closest('.neural-designer-container'));
    }
  }

  function handleCanvasMouseUp(e) {
    draggedLayer = null;
  }

  function addLayer(type, x, y) {
    const layer = {
      id: Date.now(),
      type: type,
      name: `${layerTypes[type].name} ${networkConfig.layers.length + 1}`,
      x: x,
      y: y,
      params: getDefaultParams(type)
    };
    
    networkConfig.layers.push(layer);
    updateNetworkSummary();
    renderCanvas(document.querySelector('.neural-designer-container'));
  }

  function addConnection(fromId, toId) {
    const connection = {
      id: Date.now(),
      from: fromId,
      to: toId
    };
    
    networkConfig.connections.push(connection);
    updateNetworkSummary();
    renderCanvas(document.querySelector('.neural-designer-container'));
  }

  function selectLayer(layer) {
    selectedLayer = layer;
    updatePropertiesPanel();
    renderCanvas(document.querySelector('.neural-designer-container'));
  }

  function findLayerAt(x, y) {
    return networkConfig.layers.find(layer => 
      x >= layer.x && x <= layer.x + 120 &&
      y >= layer.y && y <= layer.y + 60
    );
  }

  function setMode(mode) {
    connectionMode = mode === 'connection';
    
    // Update tool button states
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`#${mode}-mode`).classList.add('active');
  }

  function getDefaultParams(type) {
    const defaults = {
      input: { inputSize: 784, inputType: 'float32' },
      dense: { units: 128, activation: 'relu', dropout: 0.0 },
      conv2d: { filters: 32, kernelSize: 3, strides: 1, padding: 'same', activation: 'relu' },
      maxpool: { poolSize: 2, strides: 2 },
      dropout: { rate: 0.2 },
      batchnorm: { momentum: 0.99, epsilon: 0.001 },
      attention: { numHeads: 8, keyDim: 64, dropout: 0.1 },
      transformer: { numHeads: 8, dModel: 512, dff: 2048, dropout: 0.1 },
      output: { outputSize: 10, activation: 'softmax' }
    };
    
    return defaults[type] || {};
  }

  function updatePropertiesPanel() {
    const propertiesEl = document.querySelector('#layer-properties');
    
    if (!selectedLayer) {
      propertiesEl.innerHTML = '<p class="no-selection">Select a layer to edit properties</p>';
      return;
    }
    
    const config = layerTypes[selectedLayer.type];
    propertiesEl.innerHTML = `
      <div class="layer-info">
        <h4>${config.icon} ${selectedLayer.name}</h4>
        <div class="form-group">
          <label>Layer Name:</label>
          <input type="text" id="layer-name" value="${selectedLayer.name}">
        </div>
      </div>
      <div class="layer-params">
        <h5>Parameters:</h5>
        ${config.params.map(param => `
          <div class="form-group">
            <label>${param}:</label>
            <input type="text" id="param-${param}" value="${selectedLayer.params[param] || ''}">
          </div>
        `).join('')}
      </div>
      <div class="layer-actions">
        <button class="btn btn-danger btn-sm" id="delete-layer">🗑️ Delete Layer</button>
        <button class="btn btn-primary btn-sm" id="duplicate-layer">📋 Duplicate</button>
      </div>
    `;
    
    // Add event listeners for property changes
    propertiesEl.querySelector('#layer-name').addEventListener('input', (e) => {
      selectedLayer.name = e.target.value;
      renderCanvas(document.querySelector('.neural-designer-container'));
    });
    
    config.params.forEach(param => {
      const input = propertiesEl.querySelector(`#param-${param}`);
      if (input) {
        input.addEventListener('input', (e) => {
          selectedLayer.params[param] = e.target.value;
          updateNetworkSummary();
        });
      }
    });
    
    propertiesEl.querySelector('#delete-layer').addEventListener('click', deleteSelectedLayer);
    propertiesEl.querySelector('#duplicate-layer').addEventListener('click', duplicateSelectedLayer);
  }

  function updateNetworkSummary() {
    document.querySelector('#layer-count').textContent = networkConfig.layers.length;
    document.querySelector('#connection-count').textContent = networkConfig.connections.length;
    
    // Calculate parameter count (simplified)
    let totalParams = 0;
    networkConfig.layers.forEach(layer => {
      if (layer.type === 'dense' && layer.params.units) {
        totalParams += parseInt(layer.params.units) || 0;
      } else if (layer.type === 'conv2d' && layer.params.filters) {
        totalParams += parseInt(layer.params.filters) || 0;
      }
    });
    document.querySelector('#param-count').textContent = totalParams.toLocaleString();
  }

  // Network operations
  function createNewNetwork() {
    if (confirm('Create new network? Current work will be lost.')) {
      networkConfig = {
        layers: [],
        connections: [],
        metadata: {
          name: 'Untitled Network',
          description: '',
          version: '1.0.0',
          author: '',
          created: new Date().toISOString()
        }
      };
      selectedLayer = null;
      updateNetworkSummary();
      renderCanvas(document.querySelector('.neural-designer-container'));
      document.querySelector('#network-name').textContent = networkConfig.metadata.name;
    }
  }

  async function saveNetwork() {
    try {
      if (ipfsStorage) {
        // Save to IPFS with versioning
        const networkData = JSON.stringify(networkConfig);
        const cid = await ipfsStorage.storeModelOnIPFS(
          `network-${networkConfig.metadata.name}`,
          new TextEncoder().encode(networkData),
          {
            type: 'neural-network-config',
            name: networkConfig.metadata.name,
            version: networkConfig.metadata.version,
            author: networkConfig.metadata.author,
            created: networkConfig.metadata.created,
            modified: new Date().toISOString()
          }
        );
        
        alert(`Network saved to IPFS with CID: ${cid}`);
      } else {
        // Save to local storage
        localStorage.setItem('nn-designer-network', JSON.stringify(networkConfig));
        alert('Network saved locally');
      }
    } catch (error) {
      console.error('Save failed:', error);
      alert('Failed to save network');
    }
  }

  async function loadNetwork() {
    try {
      if (ipfsStorage) {
        // Show IPFS networks to load from
        const models = ipfsStorage.getAvailableModels().filter(m => m.metadata.type === 'neural-network-config');
        if (models.length === 0) {
          alert('No neural networks found in IPFS');
          return;
        }
        
        // Simple selection (could be enhanced with a proper dialog)
        const selectedModel = models[0];
        const data = await ipfsStorage.loadModelFromIPFS(selectedModel.id);
        if (data) {
          networkConfig = JSON.parse(new TextDecoder().decode(data));
          updateNetworkSummary();
          renderCanvas(document.querySelector('.neural-designer-container'));
          document.querySelector('#network-name').textContent = networkConfig.metadata.name;
        }
      } else {
        // Load from local storage
        const saved = localStorage.getItem('nn-designer-network');
        if (saved) {
          networkConfig = JSON.parse(saved);
          updateNetworkSummary();
          renderCanvas(document.querySelector('.neural-designer-container'));
          document.querySelector('#network-name').textContent = networkConfig.metadata.name;
        }
      }
    } catch (error) {
      console.error('Load failed:', error);
      alert('Failed to load network');
    }
  }

  function exportNetwork() {
    const dataStr = JSON.stringify(networkConfig, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `${networkConfig.metadata.name}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }

  function validateNetwork() {
    const errors = [];
    
    // Check for input layer
    const inputLayers = networkConfig.layers.filter(l => l.type === 'input');
    if (inputLayers.length === 0) {
      errors.push('Network must have at least one input layer');
    } else if (inputLayers.length > 1) {
      errors.push('Network should have only one input layer');
    }
    
    // Check for output layer
    const outputLayers = networkConfig.layers.filter(l => l.type === 'output');
    if (outputLayers.length === 0) {
      errors.push('Network must have at least one output layer');
    }
    
    // Check connections
    networkConfig.layers.forEach(layer => {
      if (layer.type !== 'input') {
        const hasInput = networkConfig.connections.some(c => c.to === layer.id);
        if (!hasInput) {
          errors.push(`Layer "${layer.name}" has no input connections`);
        }
      }
      
      if (layer.type !== 'output') {
        const hasOutput = networkConfig.connections.some(c => c.from === layer.id);
        if (!hasOutput) {
          errors.push(`Layer "${layer.name}" has no output connections`);
        }
      }
    });
    
    if (errors.length === 0) {
      alert('✅ Network validation passed!');
    } else {
      alert('❌ Validation failed:\n\n' + errors.join('\n'));
    }
  }

  async function deployNetwork() {
    try {
      validateNetwork();
      
      if (p2pSystem) {
        // Deploy to P2P network
        alert('🚀 Deploying network to P2P system...\n\nThis feature will integrate with the model server for actual deployment.');
      } else {
        alert('P2P system not available for deployment');
      }
    } catch (error) {
      console.error('Deployment failed:', error);
      alert('Failed to deploy network');
    }
  }

  function createNewVersion() {
    const currentVersion = networkConfig.metadata.version;
    const versionParts = currentVersion.split('.').map(Number);
    versionParts[2]++; // Increment patch version
    
    networkConfig.metadata.version = versionParts.join('.');
    networkConfig.metadata.modified = new Date().toISOString();
    
    document.querySelector('#meta-version').value = networkConfig.metadata.version;
    saveNetwork(); // Auto-save new version
  }

  function deleteSelectedLayer() {
    if (selectedLayer && confirm(`Delete layer "${selectedLayer.name}"?`)) {
      // Remove layer
      networkConfig.layers = networkConfig.layers.filter(l => l.id !== selectedLayer.id);
      
      // Remove associated connections
      networkConfig.connections = networkConfig.connections.filter(c => 
        c.from !== selectedLayer.id && c.to !== selectedLayer.id
      );
      
      selectedLayer = null;
      updateNetworkSummary();
      updatePropertiesPanel();
      renderCanvas(document.querySelector('.neural-designer-container'));
    }
  }

  function duplicateSelectedLayer() {
    if (selectedLayer) {
      const newLayer = {
        ...selectedLayer,
        id: Date.now(),
        name: selectedLayer.name + ' Copy',
        x: selectedLayer.x + 140,
        y: selectedLayer.y,
        params: { ...selectedLayer.params }
      };
      
      networkConfig.layers.push(newLayer);
      selectLayer(newLayer);
      updateNetworkSummary();
      renderCanvas(document.querySelector('.neural-designer-container'));
    }
  }

  // Modal functions
  function showMetadataModal() {
    document.querySelector('#metadata-modal').style.display = 'block';
  }

  function hideMetadataModal() {
    document.querySelector('#metadata-modal').style.display = 'none';
  }

  function saveMetadata(e) {
    e.preventDefault();
    
    networkConfig.metadata.name = document.querySelector('#meta-name').value;
    networkConfig.metadata.description = document.querySelector('#meta-description').value;
    networkConfig.metadata.author = document.querySelector('#meta-author').value;
    networkConfig.metadata.version = document.querySelector('#meta-version').value;
    networkConfig.metadata.modified = new Date().toISOString();
    
    document.querySelector('#network-name').textContent = networkConfig.metadata.name;
    hideMetadataModal();
  }

  function addNeuralDesignerStyles() {
    if (document.querySelector('#neural-designer-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'neural-designer-styles';
    style.textContent = `
      .neural-designer-container {
        height: 100%;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      
      .designer-toolbar {
        background: #f8f9fa;
        border-bottom: 1px solid #dee2e6;
        padding: 10px;
        display: flex;
        align-items: center;
        gap: 20px;
        flex-wrap: wrap;
      }
      
      .toolbar-section {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .network-name {
        font-weight: 600;
        color: #333;
        min-width: 150px;
      }
      
      .designer-content {
        flex: 1;
        display: flex;
        overflow: hidden;
      }
      
      .layer-palette {
        width: 250px;
        background: #f8f9fa;
        border-right: 1px solid #dee2e6;
        padding: 15px;
        overflow-y: auto;
      }
      
      .layer-palette h3 {
        margin: 0 0 15px 0;
        color: #333;
        font-size: 16px;
      }
      
      .palette-grid {
        display: grid;
        gap: 8px;
        margin-bottom: 25px;
      }
      
      .layer-type {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px;
        background: white;
        border: 1px solid #dee2e6;
        border-radius: 6px;
        cursor: grab;
        transition: all 0.2s;
      }
      
      .layer-type:hover {
        background: #e9ecef;
        border-color: #adb5bd;
      }
      
      .layer-type:active {
        cursor: grabbing;
      }
      
      .layer-icon {
        font-size: 16px;
      }
      
      .layer-name {
        font-size: 12px;
        font-weight: 500;
      }
      
      .connection-tools h4 {
        margin: 0 0 10px 0;
        color: #333;
        font-size: 14px;
      }
      
      .tool-btn {
        display: block;
        width: 100%;
        padding: 8px;
        margin-bottom: 5px;
        background: white;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
      }
      
      .tool-btn:hover {
        background: #e9ecef;
      }
      
      .tool-btn.active {
        background: #007bff;
        color: white;
        border-color: #007bff;
      }
      
      .canvas-container {
        flex: 1;
        position: relative;
        overflow: auto;
        background: #fff;
      }
      
      #network-canvas {
        border: none;
        cursor: crosshair;
      }
      
      .canvas-overlay {
        position: absolute;
        top: 0;
        left: 0;
        pointer-events: none;
      }
      
      .properties-panel {
        width: 300px;
        background: #f8f9fa;
        border-left: 1px solid #dee2e6;
        padding: 15px;
        overflow-y: auto;
      }
      
      .properties-panel h3 {
        margin: 0 0 15px 0;
        color: #333;
        font-size: 16px;
      }
      
      .no-selection {
        color: #6c757d;
        font-style: italic;
        text-align: center;
        padding: 20px;
      }
      
      .layer-info h4 {
        margin: 0 0 15px 0;
        color: #333;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .form-group {
        margin-bottom: 15px;
      }
      
      .form-group label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
        color: #333;
        font-size: 12px;
      }
      
      .form-group input,
      .form-group textarea {
        width: 100%;
        padding: 6px 8px;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        font-size: 12px;
      }
      
      .layer-params h5 {
        margin: 20px 0 10px 0;
        color: #333;
        font-size: 14px;
      }
      
      .layer-actions {
        margin-top: 20px;
        display: flex;
        gap: 8px;
      }
      
      .network-summary {
        margin-top: 30px;
        padding-top: 20px;
        border-top: 1px solid #dee2e6;
      }
      
      .network-summary h4 {
        margin: 0 0 15px 0;
        color: #333;
        font-size: 14px;
      }
      
      .summary-stats {
        display: grid;
        gap: 8px;
      }
      
      .stat {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 0;
        font-size: 12px;
      }
      
      .stat-label {
        color: #6c757d;
      }
      
      .stat-value {
        font-weight: 600;
        color: #333;
      }
      
      .version-control {
        margin-top: 30px;
        padding-top: 20px;
        border-top: 1px solid #dee2e6;
      }
      
      .version-control h4 {
        margin: 0 0 15px 0;
        color: #333;
        font-size: 14px;
      }
      
      .current-version {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        font-size: 12px;
      }
      
      .designer-status {
        background: #f8f9fa;
        border-top: 1px solid #dee2e6;
        padding: 8px 15px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
      }
      
      .status-section {
        display: flex;
        gap: 15px;
      }
      
      .status-item {
        color: #6c757d;
      }
      
      .modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      
      .modal-content {
        background: white;
        padding: 25px;
        border-radius: 8px;
        width: 90%;
        max-width: 500px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      }
      
      .modal-content h3 {
        margin: 0 0 20px 0;
        color: #333;
      }
      
      .form-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        margin-top: 20px;
      }
      
      .btn {
        padding: 6px 12px;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        background: white;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
      }
      
      .btn:hover {
        background: #e9ecef;
      }
      
      .btn-primary {
        background: #007bff;
        color: white;
        border-color: #007bff;
      }
      
      .btn-primary:hover {
        background: #0056b3;
        border-color: #0056b3;
      }
      
      .btn-secondary {
        background: #6c757d;
        color: white;
        border-color: #6c757d;
      }
      
      .btn-secondary:hover {
        background: #545b62;
        border-color: #545b62;
      }
      
      .btn-success {
        background: #28a745;
        color: white;
        border-color: #28a745;
      }
      
      .btn-success:hover {
        background: #1e7e34;
        border-color: #1e7e34;
      }
      
      .btn-warning {
        background: #ffc107;
        color: #212529;
        border-color: #ffc107;
      }
      
      .btn-warning:hover {
        background: #e0a800;
        border-color: #e0a800;
      }
      
      .btn-danger {
        background: #dc3545;
        color: white;
        border-color: #dc3545;
      }
      
      .btn-danger:hover {
        background: #c82333;
        border-color: #c82333;
      }
      
      .btn-sm {
        padding: 4px 8px;
        font-size: 11px;
      }
    `;
    
    document.head.appendChild(style);
  }

})();