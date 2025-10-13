/**
 * Training Manager App for SwissKnife Web Desktop
 * Manage model training processes with IPFS model versioning and P2P coordination
 */

// Export class for ES6 module compatibility
export class TrainingManagerApp {
  constructor() {
    this.trainingJobs = [];
    this.datasets = [];
    this.modelVersions = [];
    this.activeJob = null;
    this.p2pSystem = null;
    this.ipfsStorage = null;
    this.modelServer = null;
  }

  async initialize() {
    console.log('🎯 Initializing Training Manager...');
    // Wait a bit for the IIFE to execute
    await new Promise(resolve => setTimeout(resolve, 100));
    return this;
  }

  createWindow() {
    return this.render();
  }

  render() {
    // If the global function exists, use it to get the real implementation
    if (window.createTrainingManagerApp) {
      // Create a container and let the global function populate it
      const containerId = `training-manager-${Date.now()}`;
      setTimeout(() => {
        const container = document.getElementById(containerId);
        if (container) {
          const app = window.createTrainingManagerApp();
          app.init(container);
        }
      }, 50);
      return `<div id="${containerId}" class="training-manager-container"></div>`;
    }
    
    // Fallback to placeholder if global function not available yet
    return `
      <div class="training-manager-container">
        <div class="app-placeholder">
          <h2>🎯 Training Manager</h2>
          <p>AI model training and management system.</p>
          <p>Manage training jobs, datasets, and model versions with P2P coordination.</p>
          <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
        </div>
      </div>
      <style>
        .training-manager-container { height: 100%; padding: 20px; }
        .app-placeholder { text-align: center; padding: 40px; }
      </style>
    `;
  }
}

// Legacy IIFE wrapper for backward compatibility
(function() {
  'use strict';

  // Application state
  let trainingJobs = [];
  let datasets = [];
  let modelVersions = [];
  let activeJob = null;
  let p2pSystem = null;
  let ipfsStorage = null;
  let modelServer = null;
  let ipfsAccelerate = null;
  let huggingFaceBackend = null;

  // Training configuration templates
  const trainingTemplates = {
    classification: {
      name: 'Image Classification',
      icon: '🖼️',
      config: {
        optimizer: 'adam',
        learningRate: 0.001,
        batchSize: 32,
        epochs: 10,
        lossFunction: 'categoricalCrossentropy',
        metrics: ['accuracy']
      }
    },
    nlp: {
      name: 'Natural Language Processing',
      icon: '📝',
      config: {
        optimizer: 'adam',
        learningRate: 0.0001,
        batchSize: 16,
        epochs: 5,
        lossFunction: 'sparseCategoricalCrossentropy',
        metrics: ['accuracy']
      }
    },
    regression: {
      name: 'Regression',
      icon: '📈',
      config: {
        optimizer: 'rmsprop',
        learningRate: 0.01,
        batchSize: 64,
        epochs: 15,
        lossFunction: 'meanSquaredError',
        metrics: ['mae']
      }
    },
    custom: {
      name: 'Custom Training',
      icon: '⚙️',
      config: {
        optimizer: 'adam',
        learningRate: 0.001,
        batchSize: 32,
        epochs: 10,
        lossFunction: 'categoricalCrossentropy',
        metrics: ['accuracy']
      }
    }
  };

  // Job status types
  const jobStatuses = {
    pending: { icon: '⏳', color: '#ffc107', label: 'Pending' },
    running: { icon: '🏃', color: '#007bff', label: 'Running' },
    paused: { icon: '⏸️', color: '#6c757d', label: 'Paused' },
    completed: { icon: '✅', color: '#28a745', label: 'Completed' },
    failed: { icon: '❌', color: '#dc3545', label: 'Failed' },
    cancelled: { icon: '🚫', color: '#6c757d', label: 'Cancelled' }
  };

  // Create Training Manager application
  window.createTrainingManagerApp = function() {
    return {
      name: "Training Manager",
      icon: "🎯",
      init: function(container) {
        initializeP2PSystem();
        renderApp(container);
        setupEventHandlers(container);
        loadTrainingHistory();
        startJobMonitoring();
      },
      destroy: function() {
        stopJobMonitoring();
        delete window.trainingManagerApp;
      }
    };
  };

  async function initializeP2PSystem() {
    try {
      // Initialize IPFS Accelerate backend for distributed ML compute
      await initializeIPFSAccelerate();
      
      // Initialize traditional P2P system as fallback
      if (window.initializeP2PMLSystem) {
        p2pSystem = window.initializeP2PMLSystem({
          enableModelSharing: true,
          enableIPFS: true,
          enableDistributedTraining: true,
          ipfsAccelerate: ipfsAccelerate || null
        });
        ipfsStorage = p2pSystem?.getIPFSStorage();
        modelServer = p2pSystem?.getModelServer();
        
        console.log('✅ P2P system initialized with IPFS Accelerate integration');
      } else {
        console.log('⚠️ Traditional P2P system not available, using IPFS Accelerate only');
      }
    } catch (error) {
      console.warn('P2P system initialization failed:', error);
    }
  }

  async function initializeIPFSAccelerate() {
    try {
      // Try to load local IPFS Accelerate module first
      try {
        console.log('🚀 Loading local IPFS Accelerate module...');
        const { IPFSAccelerate } = await import('../../../ipfs_accelerate_js/src/index.js');
        
        const localIPFSAccelerate = new IPFSAccelerate({
          backend: 'webgl', // Use WebGL for browser acceleration
          p2p: true,        // Enable P2P coordination
          storage: 'ipfs'   // Use IPFS for model storage
        });
        
        await localIPFSAccelerate.initialize();
        console.log('✅ Local IPFS Accelerate initialized successfully');
        
        // Wrap local module with expected interface
        ipfsAccelerate = {
          async createTrainingJob(config) {
            return await localIPFSAccelerate.training.create({
              model_config: config.model,
              dataset: config.dataset,
              training_params: config.params,
              distributed: true,
              backend: config.backend || 'webgl'
            });
          },
          
          async submitTrainingJob(jobConfig) {
            return await localIPFSAccelerate.training.submit({
              job_config: jobConfig,
              priority: jobConfig.priority || 'normal',
              nodes_required: jobConfig.nodes || 3
            });
          },
          
          async getJobStatus(jobId) {
            return await localIPFSAccelerate.training.getStatus(jobId);
          },
          
          async pauseJob(jobId) {
            return await localIPFSAccelerate.training.pause(jobId);
          },
          
          async resumeJob(jobId) {
            return await localIPFSAccelerate.training.resume(jobId);
          },
          
          async cancelJob(jobId) {
            return await localIPFSAccelerate.training.cancel(jobId);
          },
          
          async getAvailableNodes() {
            return await localIPFSAccelerate.p2p.listNodes({
              status: 'available',
              capabilities: ['training']
            });
          },
          
          async storeTrainedModel(modelData, metadata) {
            return await localIPFSAccelerate.storage.store({
              model_data: modelData,
              metadata: metadata,
              storage: 'ipfs',
              versioning: true
            });
          }
        };
        
        console.log('✅ Local IPFS Accelerate wrapped for training operations');
        
      } catch (importError) {
        console.log('⚠️ Local IPFS Accelerate module not available:', importError.message);
        console.log('🔄 Trying MCP fallback...');
        
        // Fallback to MCP implementation
        if (window.mcpClient) {
          console.log('🚀 Connecting to IPFS Accelerate for distributed training via MCP...');
          
          ipfsAccelerate = {
            // IPFS Accelerate integration for distributed ML training via MCP
            async createTrainingJob(config) {
              return await window.mcpClient.request('ipfs_accelerate', 'create_training_job', {
                model_config: config.model,
                dataset: config.dataset,
                training_params: config.params,
                distributed: true,
                backend: config.backend || 'tensorflow'
              });
            },
            
            async submitTrainingJob(jobConfig) {
              return await window.mcpClient.request('ipfs_accelerate', 'submit_job', {
                job_config: jobConfig,
                priority: jobConfig.priority || 'normal',
                nodes_required: jobConfig.nodes || 3
              });
            },
            
            async getJobStatus(jobId) {
              return await window.mcpClient.request('ipfs_accelerate', 'get_job_status', {
                job_id: jobId
              });
            },
            
            async pauseJob(jobId) {
              return await window.mcpClient.request('ipfs_accelerate', 'pause_job', {
                job_id: jobId
              });
            },
            
            async resumeJob(jobId) {
              return await window.mcpClient.request('ipfs_accelerate', 'resume_job', {
                job_id: jobId
              });
            },
            
            async cancelJob(jobId) {
              return await window.mcpClient.request('ipfs_accelerate', 'cancel_job', {
                job_id: jobId
              });
            },
            
            async getAvailableNodes() {
              return await window.mcpClient.request('ipfs_accelerate', 'list_nodes', {
                status: 'available',
                capabilities: ['training']
              });
            },
            
            async storeTrainedModel(modelData, metadata) {
              return await window.mcpClient.request('ipfs_accelerate', 'store_model', {
                model_data: modelData,
                metadata: metadata,
                storage: 'ipfs',
                versioning: true
              });
            }
          };
          
          console.log('✅ IPFS Accelerate connected via MCP fallback');
        } else {
          throw new Error('Neither local module nor MCP available');
        }
      }
      
      // Initialize Hugging Face integration as alternative
      huggingFaceBackend = {
        async createHFTrainingJob(config) {
          if (window.mcpClient) {
            return await window.mcpClient.request('huggingface', 'create_training_job', {
              model_name: config.model,
              dataset: config.dataset,
              task: config.task || 'text-classification',
              training_args: config.args
            });
          } else {
            // Local fallback simulation
            return {
              id: 'hf_job_' + Date.now(),
              status: 'created',
              backend: 'huggingface-local'
            };
          }
        },
          
          async getHFJobStatus(jobId) {
            return await window.mcpClient.request('huggingface', 'get_job_status', {
              job_id: jobId
            });
          },
          
          async downloadHFModel(modelId) {
            return await window.mcpClient.request('huggingface', 'download_model', {
              model_id: modelId,
              local_path: './models/'
            });
          }
        };
        
        console.log('✅ IPFS Accelerate backend connected for distributed training');
        console.log('✅ Hugging Face backend available as alternative');
        
        return true;
    } catch (error) {
      console.log('⚠️ IPFS Accelerate not available:', error.message);
      ipfsAccelerate = null;
      huggingFaceBackend = null;
      return false;
    }
  }

  function renderApp(container) {
    container.innerHTML = `
      <div class="training-manager-container">
        <!-- Header Toolbar -->
        <div class="training-toolbar">
          <div class="toolbar-section">
            <button class="btn btn-primary" id="new-training">🎯 New Training</button>
            <button class="btn btn-secondary" id="import-dataset">📊 Import Dataset</button>
            <button class="btn btn-secondary" id="load-model">🧠 Load Model</button>
          </div>
          <div class="toolbar-section">
            <div class="status-indicator">
              <span class="status-dot ${ipfsAccelerate ? 'connected' : 'disconnected'}"></span>
              <span class="status-text">IPFS Accelerate: ${ipfsAccelerate ? 'Connected' : 'Disconnected'}</span>
            </div>
            <div class="status-indicator">
              <span class="status-dot ${huggingFaceBackend ? 'connected' : 'disconnected'}"></span>
              <span class="status-text">Hugging Face: ${huggingFaceBackend ? 'Available' : 'Unavailable'}</span>
            </div>
            <div class="status-indicator">
              <span class="status-dot ${p2pSystem ? 'connected' : 'disconnected'}"></span>
              <span class="status-text">P2P: ${p2pSystem ? 'Connected' : 'Fallback'}</span>
            </div>
          </div>
          <div class="toolbar-section">
            <button class="btn btn-warning" id="pause-all">⏸️ Pause All</button>
            <button class="btn btn-success" id="resume-all">▶️ Resume All</button>
          </div>
        </div>

        <!-- Main Content -->
        <div class="training-content">
          <!-- Training Jobs Panel -->
          <div class="jobs-panel">
            <div class="panel-header">
              <h3>Training Jobs</h3>
              <div class="job-stats">
                <span class="stat-item">
                  <span class="stat-value" id="active-jobs">0</span>
                  <span class="stat-label">Active</span>
                </span>
                <span class="stat-item">
                  <span class="stat-value" id="completed-jobs">0</span>
                  <span class="stat-label">Completed</span>
                </span>
                <span class="stat-item">
                  <span class="stat-value" id="total-jobs">0</span>
                  <span class="stat-label">Total</span>
                </span>
              </div>
            </div>
            
            <div class="jobs-list" id="jobs-list">
              <!-- Training jobs will be populated here -->
            </div>
          </div>

          <!-- Job Details Panel -->
          <div class="details-panel">
            <div class="panel-header">
              <h3>Job Details</h3>
              <div class="detail-actions" id="detail-actions" style="display: none;">
                <button class="btn btn-sm btn-secondary" id="pause-job">⏸️ Pause</button>
                <button class="btn btn-sm btn-primary" id="resume-job">▶️ Resume</button>
                <button class="btn btn-sm btn-danger" id="stop-job">🛑 Stop</button>
              </div>
            </div>
            
            <div class="job-details" id="job-details">
              <div class="no-job-selected">
                <p>Select a training job to view details</p>
              </div>
            </div>
          </div>

          <!-- Model Versions Panel -->
          <div class="versions-panel">
            <div class="panel-header">
              <h3>Model Versions</h3>
              <button class="btn btn-sm btn-secondary" id="refresh-versions">🔄 Refresh</button>
            </div>
            
            <div class="versions-list" id="versions-list">
              <!-- Model versions will be populated here -->
            </div>
          </div>
        </div>

        <!-- Progress Monitor -->
        <div class="progress-monitor" id="progress-monitor">
          <div class="monitor-header">
            <h4>Training Progress</h4>
            <button class="btn btn-sm btn-secondary" id="toggle-monitor">📊 Toggle Charts</button>
          </div>
          <div class="progress-charts" id="progress-charts">
            <!-- Training charts will be populated here -->
          </div>
        </div>
      </div>

      <!-- New Training Modal -->
      <div id="new-training-modal" class="modal" style="display: none;">
        <div class="modal-content">
          <h3>Start New Training</h3>
          <form id="new-training-form">
            <div class="form-row">
              <div class="form-group">
                <label>Training Type:</label>
                <select id="training-type">
                  ${Object.entries(trainingTemplates).map(([key, template]) => `
                    <option value="${key}">${template.icon} ${template.name}</option>
                  `).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Job Name:</label>
                <input type="text" id="job-name" placeholder="Enter job name" required>
              </div>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label>Model Architecture:</label>
                <select id="model-architecture">
                  <option value="custom">Custom Network</option>
                  <option value="resnet50">ResNet-50</option>
                  <option value="mobilenet">MobileNet</option>
                  <option value="bert-base">BERT Base</option>
                  <option value="gpt2-small">GPT-2 Small</option>
                </select>
              </div>
              <div class="form-group">
                <label>Dataset:</label>
                <select id="dataset-select">
                  <option value="">Select dataset...</option>
                </select>
              </div>
            </div>

            <div class="training-config">
              <h4>Training Configuration</h4>
              <div class="config-grid">
                <div class="form-group">
                  <label>Optimizer:</label>
                  <select id="optimizer">
                    <option value="adam">Adam</option>
                    <option value="sgd">SGD</option>
                    <option value="rmsprop">RMSprop</option>
                    <option value="adagrad">Adagrad</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Learning Rate:</label>
                  <input type="number" id="learning-rate" value="0.001" step="0.0001" min="0">
                </div>
                <div class="form-group">
                  <label>Batch Size:</label>
                  <input type="number" id="batch-size" value="32" min="1">
                </div>
                <div class="form-group">
                  <label>Epochs:</label>
                  <input type="number" id="epochs" value="10" min="1">
                </div>
                <div class="form-group">
                  <label>Loss Function:</label>
                  <select id="loss-function">
                    <option value="categoricalCrossentropy">Categorical Crossentropy</option>
                    <option value="sparseCategoricalCrossentropy">Sparse Categorical Crossentropy</option>
                    <option value="binaryCrossentropy">Binary Crossentropy</option>
                    <option value="meanSquaredError">Mean Squared Error</option>
                    <option value="meanAbsoluteError">Mean Absolute Error</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Validation Split:</label>
                  <input type="number" id="validation-split" value="0.2" step="0.1" min="0" max="0.5">
                </div>
              </div>
            </div>

            <div class="distributed-options">
              <h4>Distributed Training Options</h4>
              <div class="checkbox-group">
                <label class="checkbox-label">
                  <input type="checkbox" id="enable-p2p-training">
                  <span class="checkmark"></span>
                  Enable P2P Distributed Training
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" id="auto-save-versions">
                  <span class="checkmark"></span>
                  Auto-save model versions to IPFS
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" id="share-progress">
                  <span class="checkmark"></span>
                  Share training progress with network
                </label>
              </div>
            </div>

            <div class="form-actions">
              <button type="button" class="btn btn-secondary" id="cancel-training">Cancel</button>
              <button type="submit" class="btn btn-primary">🚀 Start Training</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Dataset Import Modal -->
      <div id="dataset-modal" class="modal" style="display: none;">
        <div class="modal-content">
          <h3>Import Dataset</h3>
          <div class="dataset-import-options">
            <div class="import-option" id="upload-dataset">
              <div class="option-icon">📁</div>
              <div class="option-content">
                <h4>Upload Local Files</h4>
                <p>Upload training data from your computer</p>
                <input type="file" id="dataset-files" multiple accept=".csv,.json,.txt,.jpg,.png">
              </div>
            </div>
            <div class="import-option" id="load-from-ipfs">
              <div class="option-icon">🌐</div>
              <div class="option-content">
                <h4>Load from IPFS</h4>
                <p>Import dataset from IPFS network</p>
                <input type="text" id="ipfs-dataset-cid" placeholder="Enter IPFS CID">
              </div>
            </div>
            <div class="import-option" id="generate-synthetic">
              <div class="option-icon">🎲</div>
              <div class="option-content">
                <h4>Generate Synthetic Data</h4>
                <p>Create synthetic dataset for testing</p>
                <select id="synthetic-type">
                  <option value="classification">Classification Dataset</option>
                  <option value="regression">Regression Dataset</option>
                  <option value="timeseries">Time Series Dataset</option>
                </select>
              </div>
            </div>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" id="cancel-dataset">Cancel</button>
            <button type="button" class="btn btn-primary" id="import-dataset-btn">Import Dataset</button>
          </div>
        </div>
      </div>
    `;

    // Apply styling
    addTrainingManagerStyles();
    updateJobStats();
    loadModelVersions();
  }

  function setupEventHandlers(container) {
    // Toolbar events
    container.querySelector('#new-training').addEventListener('click', showNewTrainingModal);
    container.querySelector('#import-dataset').addEventListener('click', showDatasetModal);
    container.querySelector('#load-model').addEventListener('click', loadExistingModel);
    container.querySelector('#pause-all').addEventListener('click', pauseAllJobs);
    container.querySelector('#resume-all').addEventListener('click', resumeAllJobs);

    // Job detail events
    container.querySelector('#pause-job').addEventListener('click', pauseActiveJob);
    container.querySelector('#resume-job').addEventListener('click', resumeActiveJob);
    container.querySelector('#stop-job').addEventListener('click', stopActiveJob);

    // Version control events
    container.querySelector('#refresh-versions').addEventListener('click', loadModelVersions);
    container.querySelector('#toggle-monitor').addEventListener('click', toggleProgressMonitor);

    // Modal events
    container.querySelector('#cancel-training').addEventListener('click', hideNewTrainingModal);
    container.querySelector('#new-training-form').addEventListener('submit', startNewTraining);
    container.querySelector('#cancel-dataset').addEventListener('click', hideDatasetModal);
    container.querySelector('#import-dataset-btn').addEventListener('click', importDataset);

    // Training type change
    container.querySelector('#training-type').addEventListener('change', updateTrainingConfig);

    // Dataset import options
    container.querySelector('#upload-dataset').addEventListener('click', () => {
      container.querySelector('#dataset-files').click();
    });
    container.querySelector('#dataset-files').addEventListener('change', handleDatasetUpload);
  }

  function renderJobsList() {
    const jobsList = document.querySelector('#jobs-list');
    
    if (trainingJobs.length === 0) {
      jobsList.innerHTML = `
        <div class="empty-state">
          <p>No training jobs yet</p>
          <button class="btn btn-primary" onclick="document.querySelector('#new-training').click()">
            🎯 Start Your First Training
          </button>
        </div>
      `;
      return;
    }

    jobsList.innerHTML = trainingJobs.map(job => {
      const status = jobStatuses[job.status] || jobStatuses.pending;
      const progress = job.progress || 0;
      
      return `
        <div class="job-item ${job === activeJob ? 'active' : ''}" data-job-id="${job.id}">
          <div class="job-header">
            <div class="job-info">
              <span class="job-status" style="color: ${status.color}">
                ${status.icon}
              </span>
              <div class="job-details-summary">
                <div class="job-name">${job.name}</div>
                <div class="job-meta">
                  ${job.architecture} • ${job.dataset || 'No dataset'}
                </div>
              </div>
            </div>
            <div class="job-actions">
              <span class="job-progress">${Math.round(progress)}%</span>
              <button class="btn btn-sm" onclick="selectJob('${job.id}')">👁️</button>
            </div>
          </div>
          <div class="job-progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
          <div class="job-stats">
            <span class="stat">Epoch: ${job.currentEpoch || 0}/${job.config.epochs}</span>
            <span class="stat">Loss: ${job.currentLoss?.toFixed(4) || 'N/A'}</span>
            <span class="stat">Accuracy: ${job.currentAccuracy?.toFixed(3) || 'N/A'}</span>
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers
    jobsList.querySelectorAll('.job-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.job-actions')) {
          const jobId = item.dataset.jobId;
          selectJob(jobId);
        }
      });
    });
  }

  function selectJob(jobId) {
    activeJob = trainingJobs.find(job => job.id === jobId);
    renderJobDetails();
    renderJobsList(); // Update active state
  }

  function renderJobDetails() {
    const detailsEl = document.querySelector('#job-details');
    const actionsEl = document.querySelector('#detail-actions');
    
    if (!activeJob) {
      detailsEl.innerHTML = `
        <div class="no-job-selected">
          <p>Select a training job to view details</p>
        </div>
      `;
      actionsEl.style.display = 'none';
      return;
    }

    actionsEl.style.display = 'flex';
    const status = jobStatuses[activeJob.status] || jobStatuses.pending;
    
    detailsEl.innerHTML = `
      <div class="job-detail-content">
        <div class="detail-header">
          <h4>${activeJob.name}</h4>
          <span class="status-badge" style="background: ${status.color}">
            ${status.icon} ${status.label}
          </span>
        </div>
        
        <div class="detail-grid">
          <div class="detail-section">
            <h5>Configuration</h5>
            <div class="config-details">
              <div class="config-item">
                <span class="config-label">Architecture:</span>
                <span class="config-value">${activeJob.architecture}</span>
              </div>
              <div class="config-item">
                <span class="config-label">Dataset:</span>
                <span class="config-value">${activeJob.dataset || 'None'}</span>
              </div>
              <div class="config-item">
                <span class="config-label">Optimizer:</span>
                <span class="config-value">${activeJob.config.optimizer}</span>
              </div>
              <div class="config-item">
                <span class="config-label">Learning Rate:</span>
                <span class="config-value">${activeJob.config.learningRate}</span>
              </div>
              <div class="config-item">
                <span class="config-label">Batch Size:</span>
                <span class="config-value">${activeJob.config.batchSize}</span>
              </div>
              <div class="config-item">
                <span class="config-label">Epochs:</span>
                <span class="config-value">${activeJob.config.epochs}</span>
              </div>
            </div>
          </div>
          
          <div class="detail-section">
            <h5>Progress</h5>
            <div class="progress-details">
              <div class="progress-item">
                <span class="progress-label">Current Epoch:</span>
                <span class="progress-value">${activeJob.currentEpoch || 0}/${activeJob.config.epochs}</span>
              </div>
              <div class="progress-item">
                <span class="progress-label">Training Loss:</span>
                <span class="progress-value">${activeJob.currentLoss?.toFixed(4) || 'N/A'}</span>
              </div>
              <div class="progress-item">
                <span class="progress-label">Training Accuracy:</span>
                <span class="progress-value">${activeJob.currentAccuracy?.toFixed(3) || 'N/A'}</span>
              </div>
              <div class="progress-item">
                <span class="progress-label">Validation Loss:</span>
                <span class="progress-value">${activeJob.validationLoss?.toFixed(4) || 'N/A'}</span>
              </div>
              <div class="progress-item">
                <span class="progress-label">Validation Accuracy:</span>
                <span class="progress-value">${activeJob.validationAccuracy?.toFixed(3) || 'N/A'}</span>
              </div>
              <div class="progress-item">
                <span class="progress-label">Elapsed Time:</span>
                <span class="progress-value">${formatElapsedTime(activeJob.startTime)}</span>
              </div>
            </div>
          </div>
          
          <div class="detail-section">
            <h5>P2P & IPFS</h5>
            <div class="p2p-details">
              <div class="p2p-item">
                <span class="p2p-label">Distributed Training:</span>
                <span class="p2p-value">${activeJob.distributedTraining ? 'Enabled' : 'Disabled'}</span>
              </div>
              <div class="p2p-item">
                <span class="p2p-label">IPFS Versioning:</span>
                <span class="p2p-value">${activeJob.ipfsVersioning ? 'Enabled' : 'Disabled'}</span>
              </div>
              <div class="p2p-item">
                <span class="p2p-label">Network Sharing:</span>
                <span class="p2p-value">${activeJob.shareProgress ? 'Enabled' : 'Disabled'}</span>
              </div>
              <div class="p2p-item">
                <span class="p2p-label">Model CID:</span>
                <span class="p2p-value">${activeJob.modelCID || 'Not saved'}</span>
              </div>
            </div>
          </div>
        </div>
        
        ${activeJob.logs && activeJob.logs.length > 0 ? `
        <div class="detail-section">
          <h5>Training Log</h5>
          <div class="training-log">
            ${activeJob.logs.slice(-10).map(log => `
              <div class="log-entry">
                <span class="log-time">${new Date(log.timestamp).toLocaleTimeString()}</span>
                <span class="log-message">${log.message}</span>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}
      </div>
    `;
  }

  function loadModelVersions() {
    // Simulate loading model versions from IPFS
    if (ipfsStorage) {
      const models = ipfsStorage.getAvailableModels().filter(m => 
        m.metadata.type === 'trained-model' || m.metadata.type === 'model-checkpoint'
      );
      modelVersions = models;
    } else {
      // Load from local storage
      const saved = localStorage.getItem('training-manager-versions');
      modelVersions = saved ? JSON.parse(saved) : [];
    }
    
    renderModelVersions();
  }

  function renderModelVersions() {
    const versionsList = document.querySelector('#versions-list');
    
    if (modelVersions.length === 0) {
      versionsList.innerHTML = `
        <div class="empty-state">
          <p>No model versions yet</p>
          <p class="empty-hint">Train a model to create versions</p>
        </div>
      `;
      return;
    }

    versionsList.innerHTML = modelVersions.map(version => `
      <div class="version-item">
        <div class="version-header">
          <div class="version-info">
            <div class="version-name">${version.metadata.name}</div>
            <div class="version-meta">
              v${version.metadata.version} • ${new Date(version.metadata.created).toLocaleDateString()}
            </div>
          </div>
          <div class="version-actions">
            <button class="btn btn-sm" onclick="loadModelVersion('${version.id}')">📥 Load</button>
            <button class="btn btn-sm" onclick="shareModelVersion('${version.id}')">📤 Share</button>
          </div>
        </div>
        <div class="version-stats">
          <span class="stat">Accuracy: ${version.metadata.accuracy || 'N/A'}</span>
          <span class="stat">Loss: ${version.metadata.loss || 'N/A'}</span>
          <span class="stat">Size: ${formatFileSize(version.metadata.size || 0)}</span>
        </div>
      </div>
    `).join('');
  }

  // Training operations
  function showNewTrainingModal() {
    document.querySelector('#new-training-modal').style.display = 'flex';
    updateDatasetSelect();
  }

  function hideNewTrainingModal() {
    document.querySelector('#new-training-modal').style.display = 'none';
  }

  function updateTrainingConfig() {
    const trainingType = document.querySelector('#training-type').value;
    const template = trainingTemplates[trainingType];
    
    if (template) {
      document.querySelector('#optimizer').value = template.config.optimizer;
      document.querySelector('#learning-rate').value = template.config.learningRate;
      document.querySelector('#batch-size').value = template.config.batchSize;
      document.querySelector('#epochs').value = template.config.epochs;
      document.querySelector('#loss-function').value = template.config.lossFunction;
    }
  }

  function updateDatasetSelect() {
    const datasetSelect = document.querySelector('#dataset-select');
    datasetSelect.innerHTML = '<option value="">Select dataset...</option>';
    
    datasets.forEach(dataset => {
      const option = document.createElement('option');
      option.value = dataset.id;
      option.textContent = dataset.name;
      datasetSelect.appendChild(option);
    });
  }

  async function startNewTraining(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const config = {
      name: document.querySelector('#job-name').value,
      type: document.querySelector('#training-type').value,
      architecture: document.querySelector('#model-architecture').value,
      dataset: document.querySelector('#dataset-select').value,
      optimizer: document.querySelector('#optimizer').value,
      learningRate: parseFloat(document.querySelector('#learning-rate').value),
      batchSize: parseInt(document.querySelector('#batch-size').value),
      epochs: parseInt(document.querySelector('#epochs').value),
      lossFunction: document.querySelector('#loss-function').value,
      validationSplit: parseFloat(document.querySelector('#validation-split').value),
      distributedTraining: document.querySelector('#enable-p2p-training').checked,
      ipfsVersioning: document.querySelector('#auto-save-versions').checked,
      shareProgress: document.querySelector('#share-progress').checked
    };

    const job = {
      id: Date.now().toString(),
      name: config.name,
      architecture: config.architecture,
      dataset: config.dataset,
      config: config,
      status: 'pending',
      progress: 0,
      currentEpoch: 0,
      startTime: new Date(),
      distributedTraining: config.distributedTraining,
      ipfsVersioning: config.ipfsVersioning,
      shareProgress: config.shareProgress,
      logs: []
    };

    trainingJobs.push(job);
    hideNewTrainingModal();
    
    // Start the training process
    await executeTrainingJob(job);
    
    updateJobStats();
    renderJobsList();
  }

  async function executeTrainingJob(job) {
    try {
      job.status = 'running';
      addJobLog(job, `Starting training job: ${job.name}`);
      
      if (job.distributedTraining && p2pSystem) {
        addJobLog(job, 'Initializing distributed training across P2P network');
        // Here you would integrate with the P2P training system
      }

      // Simulate training process
      for (let epoch = 1; epoch <= job.config.epochs; epoch++) {
        if (job.status === 'paused') {
          await waitForResume(job);
        }
        
        if (job.status === 'cancelled') {
          break;
        }

        job.currentEpoch = epoch;
        job.progress = (epoch / job.config.epochs) * 100;
        
        // Simulate training metrics
        job.currentLoss = Math.max(0.1, Math.random() * 2 * Math.exp(-epoch / 10));
        job.currentAccuracy = Math.min(0.98, 0.5 + (epoch / job.config.epochs) * 0.4 + Math.random() * 0.1);
        job.validationLoss = job.currentLoss * (1 + Math.random() * 0.2);
        job.validationAccuracy = job.currentAccuracy * (0.9 + Math.random() * 0.1);
        
        addJobLog(job, `Epoch ${epoch}/${job.config.epochs} - Loss: ${job.currentLoss.toFixed(4)}, Accuracy: ${job.currentAccuracy.toFixed(3)}`);
        
        if (job.ipfsVersioning && epoch % 5 === 0) {
          await saveModelCheckpoint(job, epoch);
        }
        
        renderJobsList();
        if (activeJob === job) {
          renderJobDetails();
        }
        
        // Simulate epoch duration
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      if (job.status !== 'cancelled') {
        job.status = 'completed';
        job.progress = 100;
        addJobLog(job, 'Training completed successfully');
        
        if (job.ipfsVersioning) {
          await saveModelVersion(job);
        }
      }
      
    } catch (error) {
      job.status = 'failed';
      addJobLog(job, `Training failed: ${error.message}`);
      console.error('Training job failed:', error);
    }
    
    updateJobStats();
    renderJobsList();
    if (activeJob === job) {
      renderJobDetails();
    }
  }

  async function saveModelCheckpoint(job, epoch) {
    try {
      if (ipfsStorage) {
        const checkpointData = {
          jobId: job.id,
          epoch: epoch,
          weights: `simulated-weights-epoch-${epoch}`,
          metrics: {
            loss: job.currentLoss,
            accuracy: job.currentAccuracy,
            validationLoss: job.validationLoss,
            validationAccuracy: job.validationAccuracy
          }
        };
        
        const cid = await ipfsStorage.storeModelOnIPFS(
          `${job.name}-checkpoint-epoch-${epoch}`,
          new TextEncoder().encode(JSON.stringify(checkpointData)),
          {
            type: 'model-checkpoint',
            name: `${job.name} Checkpoint`,
            version: `${job.config.version || '1.0.0'}-epoch-${epoch}`,
            epoch: epoch,
            accuracy: job.currentAccuracy,
            loss: job.currentLoss,
            created: new Date().toISOString()
          }
        );
        
        addJobLog(job, `Checkpoint saved to IPFS: ${cid}`);
      }
    } catch (error) {
      addJobLog(job, `Failed to save checkpoint: ${error.message}`);
    }
  }

  async function saveModelVersion(job) {
    try {
      if (ipfsStorage) {
        const modelData = {
          jobId: job.id,
          architecture: job.architecture,
          config: job.config,
          weights: `final-weights-${job.id}`,
          metrics: {
            finalLoss: job.currentLoss,
            finalAccuracy: job.currentAccuracy,
            bestValidationLoss: job.validationLoss,
            bestValidationAccuracy: job.validationAccuracy
          },
          trainingLog: job.logs
        };
        
        const cid = await ipfsStorage.storeModelOnIPFS(
          `${job.name}-final`,
          new TextEncoder().encode(JSON.stringify(modelData)),
          {
            type: 'trained-model',
            name: job.name,
            version: job.config.version || '1.0.0',
            accuracy: job.currentAccuracy,
            loss: job.currentLoss,
            created: new Date().toISOString(),
            trainingDuration: Date.now() - job.startTime.getTime()
          }
        );
        
        job.modelCID = cid;
        addJobLog(job, `Final model saved to IPFS: ${cid}`);
        loadModelVersions(); // Refresh versions list
      }
    } catch (error) {
      addJobLog(job, `Failed to save final model: ${error.message}`);
    }
  }

  function addJobLog(job, message) {
    if (!job.logs) job.logs = [];
    job.logs.push({
      timestamp: new Date().toISOString(),
      message: message
    });
  }

  async function waitForResume(job) {
    return new Promise((resolve) => {
      const checkStatus = () => {
        if (job.status === 'running') {
          resolve();
        } else {
          setTimeout(checkStatus, 1000);
        }
      };
      checkStatus();
    });
  }

  // Job control functions
  function pauseActiveJob() {
    if (activeJob && activeJob.status === 'running') {
      activeJob.status = 'paused';
      addJobLog(activeJob, 'Training paused by user');
      renderJobsList();
      renderJobDetails();
    }
  }

  function resumeActiveJob() {
    if (activeJob && activeJob.status === 'paused') {
      activeJob.status = 'running';
      addJobLog(activeJob, 'Training resumed by user');
      renderJobsList();
      renderJobDetails();
    }
  }

  function stopActiveJob() {
    if (activeJob && (activeJob.status === 'running' || activeJob.status === 'paused')) {
      if (confirm(`Stop training job "${activeJob.name}"? This action cannot be undone.`)) {
        activeJob.status = 'cancelled';
        addJobLog(activeJob, 'Training cancelled by user');
        renderJobsList();
        renderJobDetails();
        updateJobStats();
      }
    }
  }

  function pauseAllJobs() {
    trainingJobs.forEach(job => {
      if (job.status === 'running') {
        job.status = 'paused';
        addJobLog(job, 'Training paused (bulk action)');
      }
    });
    renderJobsList();
    if (activeJob) renderJobDetails();
  }

  function resumeAllJobs() {
    trainingJobs.forEach(job => {
      if (job.status === 'paused') {
        job.status = 'running';
        addJobLog(job, 'Training resumed (bulk action)');
      }
    });
    renderJobsList();
    if (activeJob) renderJobDetails();
  }

  // Dataset management
  function showDatasetModal() {
    document.querySelector('#dataset-modal').style.display = 'flex';
  }

  function hideDatasetModal() {
    document.querySelector('#dataset-modal').style.display = 'none';
  }

  function handleDatasetUpload(e) {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      const dataset = {
        id: Date.now().toString(),
        name: `Dataset-${files.length}-files`,
        files: files.map(f => f.name),
        size: files.reduce((sum, f) => sum + f.size, 0),
        type: 'uploaded',
        created: new Date()
      };
      
      datasets.push(dataset);
      alert(`Dataset "${dataset.name}" imported successfully`);
      hideDatasetModal();
    }
  }

  async function importDataset() {
    // This would handle IPFS or synthetic dataset import
    alert('Dataset import functionality would be implemented here');
    hideDatasetModal();
  }

  // Utility functions
  function updateJobStats() {
    const activeJobs = trainingJobs.filter(job => job.status === 'running' || job.status === 'paused').length;
    const completedJobs = trainingJobs.filter(job => job.status === 'completed').length;
    const totalJobs = trainingJobs.length;
    
    document.querySelector('#active-jobs').textContent = activeJobs;
    document.querySelector('#completed-jobs').textContent = completedJobs;
    document.querySelector('#total-jobs').textContent = totalJobs;
  }

  function formatElapsedTime(startTime) {
    const elapsed = Date.now() - startTime.getTime();
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  function formatFileSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }

  function loadTrainingHistory() {
    // Load saved training jobs from localStorage
    const saved = localStorage.getItem('training-manager-jobs');
    if (saved) {
      trainingJobs = JSON.parse(saved).map(job => ({
        ...job,
        startTime: new Date(job.startTime)
      }));
    }
    
    renderJobsList();
    updateJobStats();
  }

  function saveTrainingHistory() {
    localStorage.setItem('training-manager-jobs', JSON.stringify(trainingJobs));
  }

  let monitoringInterval;
  
  function startJobMonitoring() {
    monitoringInterval = setInterval(() => {
      saveTrainingHistory();
      renderJobsList();
      if (activeJob) {
        renderJobDetails();
      }
    }, 5000);
  }

  function stopJobMonitoring() {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
    }
  }

  function toggleProgressMonitor() {
    const monitor = document.querySelector('#progress-monitor');
    const isVisible = monitor.style.display !== 'none';
    monitor.style.display = isVisible ? 'none' : 'block';
  }

  // Global functions for UI callbacks
  window.selectJob = selectJob;
  window.loadModelVersion = function(versionId) {
    alert(`Loading model version ${versionId} - functionality would be implemented here`);
  };
  window.shareModelVersion = function(versionId) {
    alert(`Sharing model version ${versionId} to P2P network - functionality would be implemented here`);
  };

  function addTrainingManagerStyles() {
    if (document.querySelector('#training-manager-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'training-manager-styles';
    style.textContent = `
      .training-manager-container {
        height: 100%;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #f8f9fa;
      }
      
      .training-toolbar {
        background: white;
        border-bottom: 1px solid #dee2e6;
        padding: 12px 16px;
        display: flex;
        align-items: center;
        gap: 20px;
        flex-wrap: wrap;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      
      .toolbar-section {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .status-indicator {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #6c757d;
      }
      
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
      
      .status-dot.connected {
        background: #28a745;
      }
      
      .status-dot.disconnected {
        background: #dc3545;
      }
      
      .training-content {
        flex: 1;
        display: flex;
        gap: 1px;
        overflow: hidden;
      }
      
      .jobs-panel {
        width: 350px;
        background: white;
        border-right: 1px solid #dee2e6;
        display: flex;
        flex-direction: column;
      }
      
      .details-panel {
        flex: 1;
        background: white;
        border-right: 1px solid #dee2e6;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      
      .versions-panel {
        width: 300px;
        background: white;
        display: flex;
        flex-direction: column;
      }
      
      .panel-header {
        padding: 16px;
        border-bottom: 1px solid #e9ecef;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #f8f9fa;
      }
      
      .panel-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: #333;
      }
      
      .job-stats {
        display: flex;
        gap: 16px;
      }
      
      .stat-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      
      .stat-value {
        font-size: 18px;
        font-weight: 700;
        color: #007bff;
      }
      
      .stat-label {
        font-size: 11px;
        color: #6c757d;
        text-transform: uppercase;
      }
      
      .jobs-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
      }
      
      .job-item {
        background: #f8f9fa;
        border: 1px solid #e9ecef;
        border-radius: 8px;
        margin-bottom: 8px;
        padding: 12px;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .job-item:hover {
        background: #e9ecef;
        border-color: #adb5bd;
      }
      
      .job-item.active {
        background: #e3f2fd;
        border-color: #007bff;
      }
      
      .job-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 8px;
      }
      
      .job-info {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        flex: 1;
      }
      
      .job-status {
        font-size: 16px;
        line-height: 1;
      }
      
      .job-details-summary {
        flex: 1;
      }
      
      .job-name {
        font-weight: 600;
        color: #333;
        font-size: 14px;
        margin-bottom: 2px;
      }
      
      .job-meta {
        font-size: 12px;
        color: #6c757d;
      }
      
      .job-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .job-progress {
        font-size: 12px;
        font-weight: 600;
        color: #007bff;
      }
      
      .job-progress-bar {
        background: #e9ecef;
        height: 4px;
        border-radius: 2px;
        overflow: hidden;
        margin-bottom: 8px;
      }
      
      .progress-fill {
        background: #007bff;
        height: 100%;
        transition: width 0.3s ease;
      }
      
      .job-stats {
        display: flex;
        gap: 12px;
        font-size: 11px;
        color: #6c757d;
      }
      
      .job-details {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
      }
      
      .no-job-selected {
        text-align: center;
        color: #6c757d;
        padding: 40px 20px;
      }
      
      .job-detail-content {
        max-width: 100%;
      }
      
      .detail-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 16px;
        border-bottom: 1px solid #e9ecef;
      }
      
      .detail-header h4 {
        margin: 0;
        color: #333;
        font-size: 18px;
      }
      
      .status-badge {
        padding: 4px 8px;
        border-radius: 12px;
        color: white;
        font-size: 12px;
        font-weight: 600;
      }
      
      .detail-grid {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 20px;
        margin-bottom: 20px;
      }
      
      .detail-section h5 {
        margin: 0 0 12px 0;
        color: #333;
        font-size: 14px;
        font-weight: 600;
      }
      
      .config-details,
      .progress-details,
      .p2p-details {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      
      .config-item,
      .progress-item,
      .p2p-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0;
        font-size: 12px;
      }
      
      .config-label,
      .progress-label,
      .p2p-label {
        color: #6c757d;
        font-weight: 500;
      }
      
      .config-value,
      .progress-value,
      .p2p-value {
        color: #333;
        font-weight: 600;
        text-align: right;
      }
      
      .training-log {
        background: #f8f9fa;
        border: 1px solid #e9ecef;
        border-radius: 4px;
        padding: 12px;
        max-height: 200px;
        overflow-y: auto;
        font-family: monospace;
        font-size: 11px;
      }
      
      .log-entry {
        display: flex;
        gap: 8px;
        margin-bottom: 4px;
      }
      
      .log-time {
        color: #6c757d;
        min-width: 80px;
      }
      
      .log-message {
        color: #333;
      }
      
      .versions-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
      }
      
      .version-item {
        background: #f8f9fa;
        border: 1px solid #e9ecef;
        border-radius: 8px;
        margin-bottom: 8px;
        padding: 12px;
        transition: all 0.2s;
      }
      
      .version-item:hover {
        background: #e9ecef;
        border-color: #adb5bd;
      }
      
      .version-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 8px;
      }
      
      .version-info {
        flex: 1;
      }
      
      .version-name {
        font-weight: 600;
        color: #333;
        font-size: 14px;
        margin-bottom: 2px;
      }
      
      .version-meta {
        font-size: 12px;
        color: #6c757d;
      }
      
      .version-actions {
        display: flex;
        gap: 4px;
      }
      
      .version-stats {
        display: flex;
        gap: 12px;
        font-size: 11px;
        color: #6c757d;
      }
      
      .progress-monitor {
        background: white;
        border-top: 1px solid #dee2e6;
        padding: 16px;
        max-height: 200px;
        overflow-y: auto;
      }
      
      .monitor-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      
      .monitor-header h4 {
        margin: 0;
        color: #333;
        font-size: 14px;
      }
      
      .empty-state {
        text-align: center;
        padding: 40px 20px;
        color: #6c757d;
      }
      
      .empty-hint {
        font-size: 12px;
        margin-top: 8px;
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
        border-radius: 8px;
        width: 90%;
        max-width: 800px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      }
      
      .modal-content h3 {
        margin: 0 0 20px 0;
        padding: 20px 20px 0 20px;
        color: #333;
        font-size: 18px;
      }
      
      .modal-content form {
        padding: 0 20px 20px 20px;
      }
      
      .form-row {
        display: flex;
        gap: 16px;
        margin-bottom: 16px;
      }
      
      .form-group {
        flex: 1;
        margin-bottom: 16px;
      }
      
      .form-group label {
        display: block;
        margin-bottom: 4px;
        font-weight: 500;
        color: #333;
        font-size: 12px;
      }
      
      .form-group input,
      .form-group select,
      .form-group textarea {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        font-size: 14px;
        box-sizing: border-box;
      }
      
      .training-config,
      .distributed-options {
        margin: 20px 0;
        padding: 16px;
        background: #f8f9fa;
        border-radius: 6px;
      }
      
      .training-config h4,
      .distributed-options h4 {
        margin: 0 0 16px 0;
        color: #333;
        font-size: 14px;
      }
      
      .config-grid {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 16px;
      }
      
      .checkbox-group {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      
      .checkbox-label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-size: 14px;
      }
      
      .checkbox-label input[type="checkbox"] {
        width: auto;
      }
      
      .form-actions {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid #e9ecef;
      }
      
      .dataset-import-options {
        display: grid;
        grid-template-columns: 1fr;
        gap: 16px;
        margin: 20px;
      }
      
      .import-option {
        border: 1px solid #dee2e6;
        border-radius: 8px;
        padding: 16px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 16px;
      }
      
      .import-option:hover {
        border-color: #007bff;
        background: #f8f9fa;
      }
      
      .option-icon {
        font-size: 24px;
        opacity: 0.7;
      }
      
      .option-content h4 {
        margin: 0 0 4px 0;
        color: #333;
        font-size: 14px;
      }
      
      .option-content p {
        margin: 0 0 8px 0;
        color: #6c757d;
        font-size: 12px;
      }
      
      .option-content input,
      .option-content select {
        width: 200px;
      }
      
      .btn {
        padding: 8px 16px;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        background: white;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        text-decoration: none;
      }
      
      .btn:hover {
        background: #e9ecef;
        border-color: #adb5bd;
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
        font-size: 12px;
      }
      
      @media (max-width: 1200px) {
        .training-content {
          flex-direction: column;
        }
        
        .jobs-panel,
        .versions-panel {
          width: 100%;
          max-height: 300px;
        }
        
        .detail-grid {
          grid-template-columns: 1fr;
        }
        
        .config-grid {
          grid-template-columns: 1fr 1fr;
        }
      }
      
      @media (max-width: 768px) {
        .config-grid {
          grid-template-columns: 1fr;
        }
        
        .form-row {
          flex-direction: column;
        }
        
        .toolbar-section {
          flex-wrap: wrap;
        }
      }
    `;
    
    document.head.appendChild(style);
  }

})();
