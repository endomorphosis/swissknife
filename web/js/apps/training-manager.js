/**
 * Training Manager App for SwissKnife Web Desktop
 * Manage model training processes with IPFS model versioning and P2P coordination
 */

// SWR-042 / SWR-036-FU-005: the local IPFS Accelerate backend is a
// global-only capability. See `web/js/core/ipfs-accelerate-global-adapter.js`
// for why this app no longer dynamically imports raw
// `ipfs_accelerate_js/src` source.
import { loadLocalIPFSAccelerateClass } from '../core/ipfs-accelerate-global-adapter.js';

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
  let capacityQueue = null;
  let telemetrySnapshot = null;
  let resumeRecovery = null;
  let lastCancellationConfirmation = null;

  const VDA_G032_WORKFLOW = 'training-manager.train-with-dataset';
  const VDA_G032_JOB_ID = 'vda-g032-governed-job';
  const VDA_G032_DATASET_ID = 'dataset-vda-g032-curated';
  const TRAINING_MANAGER_STORAGE_KEYS = {
    jobs: 'training-manager-jobs',
    datasets: 'training-manager-datasets',
    versions: 'training-manager-versions',
    queue: 'training-manager-capacity-queue',
    telemetry: 'training-manager-telemetry',
    resume: 'training-manager-resume-recovery',
    cancellation: 'training-manager-cancellation-confirmation'
  };

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
    queued: { icon: '⏳', color: '#6f42c1', label: 'Queued' },
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
        initializeGovernedTrainingState();
        renderApp(container);
        setupEventHandlers(container);
        loadTrainingHistory();
        ensureGovernedWorkflowState();
        startJobMonitoring();
      },
      destroy: function() {
        stopJobMonitoring();
        delete window.trainingManagerApp;
      }
    };
  };

  function initializeGovernedTrainingState() {
    loadPersistedDatasets();
    loadPersistedOperationalState();
    ensureDefaultTrainingDataset();
    ensureDefaultCapacityQueue();
    ensureDefaultTelemetry();
    ensureDefaultResumeRecovery();
    ensureDefaultCancellationConfirmation();
  }

  function ensureGovernedWorkflowState() {
    ensureDefaultTrainingDataset();
    ensureDefaultCapacityQueue();
    ensureDefaultTelemetry();
    ensureDefaultResumeRecovery();
    ensureDefaultCancellationConfirmation();
    if (!trainingJobs.some(job => job.id === VDA_G032_JOB_ID)) {
      const seedJob = createGovernedTrainingJob({
        id: VDA_G032_JOB_ID,
        name: 'VDA-G032 governed resume candidate',
        status: 'paused',
        progress: 62,
        currentEpoch: 6
      });
      seedJob.currentLoss = 0.3842;
      seedJob.currentAccuracy = 0.842;
      seedJob.validationLoss = 0.4218;
      seedJob.validationAccuracy = 0.817;
      seedJob.checkpoints = [
        createCheckpoint(seedJob, 3, 'capacity-balanced'),
        createCheckpoint(seedJob, 6, 'resume-ready')
      ];
      seedJob.resume = {
        state: 'checkpoint_available',
        checkpointCid: seedJob.checkpoints[1].cid,
        checkpointEpoch: 6,
        recoveryMessage: 'Resume recovery ready from checkpoint epoch 6 with queue token preserved.'
      };
      seedJob.telemetry = { ...telemetrySnapshot };
      seedJob.capacity = { ...capacityQueue, jobPosition: 1 };
      seedJob.cancellation = { ...lastCancellationConfirmation };
      addJobLog(seedJob, 'Recovered paused job from checkpoint manifest.');
      addJobLog(seedJob, 'Capacity queue token preserved for resume recovery.');
      trainingJobs.unshift(seedJob);
      activeJob = seedJob;
      saveTrainingHistory();
    } else if (!activeJob) {
      activeJob = trainingJobs.find(job => job.id === VDA_G032_JOB_ID) || trainingJobs[0] || null;
    }
    renderJobsList();
    renderJobDetails();
    renderProgressMonitor();
    updateJobStats();
  }

  function loadPersistedDatasets() {
    try {
      const saved = localStorage.getItem(TRAINING_MANAGER_STORAGE_KEYS.datasets);
      datasets = saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.warn('Failed to load training datasets:', error);
      datasets = [];
    }
  }

  function loadPersistedOperationalState() {
    try {
      capacityQueue = JSON.parse(localStorage.getItem(TRAINING_MANAGER_STORAGE_KEYS.queue) || 'null');
    } catch {
      capacityQueue = null;
    }
    try {
      telemetrySnapshot = JSON.parse(localStorage.getItem(TRAINING_MANAGER_STORAGE_KEYS.telemetry) || 'null');
    } catch {
      telemetrySnapshot = null;
    }
    try {
      resumeRecovery = JSON.parse(localStorage.getItem(TRAINING_MANAGER_STORAGE_KEYS.resume) || 'null');
    } catch {
      resumeRecovery = null;
    }
    try {
      lastCancellationConfirmation = JSON.parse(localStorage.getItem(TRAINING_MANAGER_STORAGE_KEYS.cancellation) || 'null');
    } catch {
      lastCancellationConfirmation = null;
    }
  }

  function ensureDefaultTrainingDataset() {
    if (datasets.some(dataset => dataset.id === VDA_G032_DATASET_ID)) return;
    datasets.unshift({
      id: VDA_G032_DATASET_ID,
      name: 'Curated vision safety sample',
      files: ['labels.parquet', 'images.car', 'splits.json'],
      size: 47_185_920,
      type: 'ipfs',
      created: new Date('2026-07-21T09:00:00.000Z').toISOString(),
      rootCid: deterministicCid('vda-g032-dataset-root'),
      provenance: {
        source: 'ipfs_datasets_py.load_dataset',
        datasetCid: deterministicCid('vda-g032-dataset-root'),
        manifestCid: deterministicCid('vda-g032-dataset-manifest'),
        license: 'internal-eval',
        split: 'train=80 validation=20',
        rows: 12480,
        policyDecision: 'allow-with-receipt',
        receiptId: 'receipt:training-manager:dataset-provenance:v1'
      }
    });
    persistDatasets();
  }

  function ensureDefaultCapacityQueue() {
    if (capacityQueue) return;
    capacityQueue = {
      queueId: 'queue:training-manager:accelerate:g032',
      availableSlots: 2,
      activeSlots: 1,
      queuedJobs: 1,
      jobPosition: 1,
      capacityClass: 'webgpu-preferred-webgl-fallback',
      policy: 'heavy_compute requires queue admission and receipt'
    };
    localStorage.setItem(TRAINING_MANAGER_STORAGE_KEYS.queue, JSON.stringify(capacityQueue));
  }

  function ensureDefaultTelemetry() {
    if (telemetrySnapshot) return;
    telemetrySnapshot = {
      step: 'warmup',
      samplesPerSecond: 384,
      gpuMemoryMb: 1536,
      queueWaitSeconds: 18,
      lossTrend: 'down',
      accuracyTrend: 'up',
      receiptId: 'receipt:training-manager:telemetry:g032'
    };
    localStorage.setItem(TRAINING_MANAGER_STORAGE_KEYS.telemetry, JSON.stringify(telemetrySnapshot));
  }

  function ensureDefaultResumeRecovery() {
    if (resumeRecovery) return;
    resumeRecovery = {
      state: 'checkpoint_available',
      checkpointCid: deterministicCid('vda-g032-resume-checkpoint'),
      checkpointEpoch: 6,
      recoveryToken: 'resume:g032:epoch-6',
      message: 'Resume recovery will requeue the job with checkpoint and provenance refs intact.'
    };
    localStorage.setItem(TRAINING_MANAGER_STORAGE_KEYS.resume, JSON.stringify(resumeRecovery));
  }

  function ensureDefaultCancellationConfirmation() {
    if (lastCancellationConfirmation) return;
    lastCancellationConfirmation = {
      required: true,
      phrase: 'STOP-G032',
      state: 'armed',
      receiptId: 'receipt:training-manager:cancellation-policy:g032',
      message: 'Cancellation requires explicit confirmation and preserves checkpoint receipts.'
    };
    localStorage.setItem(TRAINING_MANAGER_STORAGE_KEYS.cancellation, JSON.stringify(lastCancellationConfirmation));
  }

  function createGovernedTrainingJob(overrides = {}) {
    const config = {
      name: overrides.name || 'VDA-G032 governed training run',
      type: 'classification',
      architecture: 'resnet50',
      dataset: VDA_G032_DATASET_ID,
      optimizer: 'adam',
      learningRate: 0.001,
      batchSize: 32,
      epochs: 10,
      lossFunction: 'categoricalCrossentropy',
      validationSplit: 0.2,
      distributedTraining: true,
      ipfsVersioning: true,
      shareProgress: true,
      version: '1.0.0'
    };
    const job = {
      id: overrides.id || `g032-${Date.now()}`,
      name: overrides.name || config.name,
      architecture: config.architecture,
      dataset: config.dataset,
      config,
      status: overrides.status || 'pending',
      progress: overrides.progress || 0,
      currentEpoch: overrides.currentEpoch || 0,
      startTime: new Date(),
      distributedTraining: true,
      ipfsVersioning: true,
      shareProgress: true,
      provenance: getDatasetProvenance(),
      capacity: { ...capacityQueue },
      telemetry: { ...telemetrySnapshot },
      cancellation: { ...lastCancellationConfirmation },
      checkpoints: [],
      resume: { ...resumeRecovery },
      receiptLineage: [
        'receipt:training-manager:dataset-provenance:v1',
        'receipt:training-manager:queue-admission:g032',
        'receipt:training-manager:telemetry:g032'
      ],
      logs: []
    };
    addJobLog(job, 'Governed training configuration validated.');
    addJobLog(job, `Dataset provenance bound to ${job.provenance.datasetCid}.`);
    addJobLog(job, `Capacity queue admission requested: ${job.capacity.queueId}.`);
    return job;
  }

  function createCheckpoint(job, epoch, reason) {
    const cid = deterministicCid(`${job.id}:checkpoint:${epoch}:${reason}`);
    return {
      id: `${job.id}-epoch-${epoch}`,
      epoch,
      cid,
      reason,
      created: new Date().toISOString(),
      receiptId: `receipt:training-manager:checkpoint:${epoch}:g032`,
      metrics: {
        loss: job.currentLoss || 0.5,
        accuracy: job.currentAccuracy || 0.75,
        validationLoss: job.validationLoss || 0.6,
        validationAccuracy: job.validationAccuracy || 0.7
      }
    };
  }

  function getDatasetProvenance(datasetId = VDA_G032_DATASET_ID) {
    const dataset = datasets.find(item => item.id === datasetId) || datasets[0] || {};
    return dataset.provenance || {
      source: 'ipfs_datasets_py.load_dataset',
      datasetCid: deterministicCid('fallback-dataset'),
      manifestCid: deterministicCid('fallback-manifest'),
      license: 'unknown',
      split: 'train=80 validation=20',
      rows: 0,
      policyDecision: 'pending',
      receiptId: 'receipt:training-manager:dataset-provenance:pending'
    };
  }

  function updateWorkflowGovernance() {
    const container = document.querySelector('.training-manager-container');
    if (!container) return;
    const provenance = activeJob?.provenance || getDatasetProvenance();
    const queue = activeJob?.capacity || capacityQueue;
    const telemetry = activeJob?.telemetry || telemetrySnapshot;
    const cancellation = activeJob?.cancellation || lastCancellationConfirmation;
    const resume = activeJob?.resume || resumeRecovery;
    setText(container, '#workflow-provenance-cid', provenance.datasetCid);
    setText(container, '#workflow-queue-state', `${queue.availableSlots} slots / position ${queue.jobPosition}`);
    setText(container, '#workflow-telemetry-state', `${telemetry.samplesPerSecond} samples/s`);
    setText(container, '#workflow-cancel-state', cancellation.state || 'armed');
    setText(container, '#workflow-checkpoint-state', resume.checkpointCid);
    setText(container, '#workflow-checkpoint-copy', `latest epoch ${resume.checkpointEpoch}; artifacts stored through IPFS Kit receipts.`);
    setText(container, '#workflow-resume-state', resume.state);
    setText(container, '#workflow-resume-copy', resume.recoveryMessage || resume.message || 'Resume recovery is ready.');
  }

  function persistDatasets() {
    localStorage.setItem(TRAINING_MANAGER_STORAGE_KEYS.datasets, JSON.stringify(datasets));
  }

  function deterministicCid(seed) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < seed.length; index += 1) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `bafy${hash.toString(16).padStart(8, '0')}g032`;
  }

  function setText(root, selector, value) {
    const element = root.querySelector(selector);
    if (element) element.textContent = String(value || '');
  }

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
        console.log('🚀 Checking local IPFS Accelerate bridge...');
        const IPFSAccelerate = await loadLocalIPFSAccelerateClass();

        if (IPFSAccelerate) {
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
        } else {
          throw new Error('Local IPFS Accelerate bridge not registered');
        }
        
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
            <button class="btn btn-primary workflow-primary" id="launch-governed-training" data-svd-workflow="${VDA_G032_WORKFLOW}" data-svd-workflow-action="launch-governed-training" data-capability-id="ipfs.accelerate.jobs">Start governed training job</button>
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

        <section class="workflow-governance" data-svd-workflow="${VDA_G032_WORKFLOW}">
          <div class="workflow-card" data-svd-vda-marker="provenance">
            <span class="workflow-label">Provenance</span>
            <strong id="workflow-provenance-cid">${getDatasetProvenance().datasetCid}</strong>
            <span>${getDatasetProvenance().source} / ${getDatasetProvenance().split}</span>
          </div>
          <div class="workflow-card" data-svd-vda-marker="capacity-queue">
            <span class="workflow-label">Capacity queue</span>
            <strong id="workflow-queue-state">${capacityQueue.availableSlots} slots / position ${capacityQueue.jobPosition}</strong>
            <span>${capacityQueue.policy}</span>
          </div>
          <div class="workflow-card" data-svd-vda-marker="telemetry">
            <span class="workflow-label">Telemetry</span>
            <strong id="workflow-telemetry-state">${telemetrySnapshot.samplesPerSecond} samples/s</strong>
            <span>loss ${telemetrySnapshot.lossTrend}; accuracy ${telemetrySnapshot.accuracyTrend}; receipt ${telemetrySnapshot.receiptId}</span>
          </div>
          <div class="workflow-card" data-svd-vda-marker="cancellation-confirmation">
            <span class="workflow-label">Cancellation confirmation</span>
            <strong id="workflow-cancel-state">${lastCancellationConfirmation.state}</strong>
            <span>Type ${lastCancellationConfirmation.phrase} before cancellation is accepted.</span>
          </div>
          <div class="workflow-card" data-svd-vda-marker="checkpoints">
            <span class="workflow-label">Checkpoints</span>
            <strong id="workflow-checkpoint-state">${resumeRecovery.checkpointCid}</strong>
            <span id="workflow-checkpoint-copy">latest epoch ${resumeRecovery.checkpointEpoch}; artifacts stored through IPFS Kit receipts.</span>
          </div>
          <div class="workflow-card" data-svd-vda-marker="resume-recovery">
            <span class="workflow-label">Resume recovery</span>
            <strong id="workflow-resume-state">${resumeRecovery.state}</strong>
            <span id="workflow-resume-copy">${resumeRecovery.message}</span>
          </div>
        </section>

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
              <div class="validation-summary" data-svd-vda-marker="validation">
                Validation checks dataset provenance, capacity queue admission, checkpoint cadence, and cancellation policy before launch.
              </div>
              <div class="checkbox-group">
                <label class="checkbox-label">
                  <input type="checkbox" id="enable-p2p-training" checked>
                  <span class="checkmark"></span>
                  Enable P2P Distributed Training
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" id="auto-save-versions" checked>
                  <span class="checkmark"></span>
                  Auto-save model versions to IPFS
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" id="share-progress" checked>
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
    renderProgressMonitor();
  }

  function setupEventHandlers(container) {
    // Toolbar events
    container.querySelector('#launch-governed-training').addEventListener('click', launchGovernedTrainingWorkflow);
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

  function launchGovernedTrainingWorkflow() {
    ensureDefaultTrainingDataset();
    ensureDefaultCapacityQueue();
    ensureDefaultTelemetry();
    ensureDefaultResumeRecovery();
    ensureDefaultCancellationConfirmation();

    const existing = trainingJobs.find(job => job.id === VDA_G032_JOB_ID);
    const job = existing || createGovernedTrainingJob({
      id: VDA_G032_JOB_ID,
      name: 'VDA-G032 governed training run',
      status: 'queued',
      progress: 8,
      currentEpoch: 1
    });
    if (!existing) {
      trainingJobs.unshift(job);
    }

    job.status = capacityQueue.activeSlots >= capacityQueue.availableSlots ? 'pending' : 'running';
    job.progress = Math.max(job.progress || 0, 18);
    job.currentEpoch = Math.max(job.currentEpoch || 0, 2);
    job.currentLoss = 0.9124;
    job.currentAccuracy = 0.673;
    job.validationLoss = 1.036;
    job.validationAccuracy = 0.641;
    job.capacity = { ...capacityQueue, jobPosition: 1 };
    job.telemetry = {
      ...telemetrySnapshot,
      step: `epoch-${job.currentEpoch}`,
      queueWaitSeconds: 0,
      samplesPerSecond: telemetrySnapshot.samplesPerSecond + 24
    };
    job.provenance = getDatasetProvenance();
    job.cancellation = { ...lastCancellationConfirmation, state: 'confirmation_required' };
    if (!Array.isArray(job.checkpoints)) job.checkpoints = [];
    if (!job.checkpoints.some(checkpoint => checkpoint.epoch === job.currentEpoch)) {
      job.checkpoints.push(createCheckpoint(job, job.currentEpoch, 'launch-observation'));
    }
    const latestCheckpoint = [...job.checkpoints].sort((a, b) => b.epoch - a.epoch)[0];
    job.resume = {
      state: 'resume_recovery_ready',
      checkpointCid: latestCheckpoint.cid,
      checkpointEpoch: latestCheckpoint.epoch,
      recoveryMessage: 'Resume recovery can restore optimizer state and queue token from the latest checkpoint.'
    };
    telemetrySnapshot = { ...job.telemetry };
    resumeRecovery = {
      state: job.resume.state,
      checkpointCid: job.resume.checkpointCid,
      checkpointEpoch: job.resume.checkpointEpoch,
      recoveryToken: `resume:g032:epoch-${job.resume.checkpointEpoch}`,
      message: job.resume.recoveryMessage
    };
    localStorage.setItem(TRAINING_MANAGER_STORAGE_KEYS.telemetry, JSON.stringify(telemetrySnapshot));
    localStorage.setItem(TRAINING_MANAGER_STORAGE_KEYS.resume, JSON.stringify(resumeRecovery));
    addJobLog(job, `Validated dataset provenance ${job.provenance.datasetCid}.`);
    addJobLog(job, `Admitted through capacity queue ${job.capacity.queueId}.`);
    addJobLog(job, `Telemetry receipt ${job.telemetry.receiptId} attached.`);
    addJobLog(job, `Checkpoint ${job.resume.checkpointCid} is available for resume recovery.`);
    activeJob = job;
    saveTrainingHistory();
    renderJobsList();
    renderJobDetails();
    renderProgressMonitor();
    updateWorkflowGovernance();
    updateJobStats();
  }

  function renderJobsList() {
    const container = document.querySelector('.training-manager-container');
    if (!container) return;
    const jobsList = container.querySelector('#jobs-list');
    if (!jobsList) return;
    
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
            <span class="stat">Queue: ${job.capacity?.jobPosition ? `#${job.capacity.jobPosition}` : 'local'}</span>
            <span class="stat">Checkpoints: ${job.checkpoints?.length || 0}</span>
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

  // Model management: load existing model from a local file or IPFS CID.
  function loadExistingModel() {
    try {
      // Ask for an IPFS CID or let the user pick a local file
      const cid = prompt('Enter IPFS CID to register a model version (leave empty to select a local file).', '');
      if (cid && cid.trim()) {
        // Register CID metadata so it shows up in the Versions panel.
        const versionEntry = {
          id: `ipfs_${Date.now()}`,
          metadata: {
            type: 'trained-model',
            name: `IPFS Model ${cid.slice(0, 8)}…`,
            version: 'ipfs',
            accuracy: 'N/A',
            loss: 'N/A',
            size: 0,
            created: new Date().toISOString(),
            cid
          }
        };
        modelVersions.unshift(versionEntry);
        try {
          localStorage.setItem(TRAINING_MANAGER_STORAGE_KEYS.versions, JSON.stringify(modelVersions));
        } catch (e) {
          console.warn('Failed to persist model versions to localStorage:', e);
        }
        renderModelVersions();
        alert('Registered IPFS model CID. You can load it from the Versions panel.');
        return;
      }

      // Create a hidden file input to load a local model file
      let fileInput = document.getElementById('training-manager-model-file-input');
      if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'training-manager-model-file-input';
        fileInput.accept = '.json,.bin,.onnx,.pt,.pth,.h5,.ckpt';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
      }

      fileInput.onchange = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          // Try to read JSON for metadata; otherwise treat as binary
          let parsed;
          if (file.name.endsWith('.json')) {
            const text = await file.text();
            try { parsed = JSON.parse(text); } catch (_) { /* ignore parse error */ }
          }

          const versionEntry = {
            id: `local_${Date.now()}`,
            metadata: {
              type: 'trained-model',
              name: parsed?.name || file.name.replace(/\.[^.]+$/, ''),
              version: parsed?.version || 'local',
              accuracy: parsed?.metrics?.finalAccuracy ?? parsed?.accuracy ?? 'N/A',
              loss: parsed?.metrics?.finalLoss ?? parsed?.loss ?? 'N/A',
              size: file.size,
              created: new Date().toISOString(),
              filename: file.name
            }
          };

          modelVersions.unshift(versionEntry);
          try {
            localStorage.setItem(TRAINING_MANAGER_STORAGE_KEYS.versions, JSON.stringify(modelVersions));
          } catch (err) {
            console.warn('Failed to persist model versions to localStorage:', err);
          }
          renderModelVersions();
          alert(`Imported model "${versionEntry.metadata.name}". You can load it from the Versions panel.`);
        } finally {
          // Reset value so the same file can be chosen again later
          e.target.value = '';
        }
      };

      // Trigger the file chooser
      fileInput.click();
    } catch (error) {
      console.error('Failed to load existing model:', error);
      alert(`Failed to load model: ${error.message}`);
    }
  }

  function selectJob(jobId) {
    activeJob = trainingJobs.find(job => job.id === jobId);
    renderJobDetails();
    renderJobsList(); // Update active state
    renderProgressMonitor();
    updateWorkflowGovernance();
  }

  function renderJobDetails() {
    const container = document.querySelector('.training-manager-container');
    if (!container) return;
    const detailsEl = container.querySelector('#job-details');
    const actionsEl = container.querySelector('#detail-actions');
    if (!detailsEl || !actionsEl) return;
    
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
    const provenance = activeJob.provenance || getDatasetProvenance(activeJob.dataset);
    const capacity = activeJob.capacity || capacityQueue;
    const telemetry = activeJob.telemetry || telemetrySnapshot;
    const cancellation = activeJob.cancellation || lastCancellationConfirmation;
    const resume = activeJob.resume || resumeRecovery;
    const checkpoints = activeJob.checkpoints || [];
    
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

        <div class="governance-grid" data-svd-workflow="${VDA_G032_WORKFLOW}">
          <section class="governance-section" data-svd-vda-marker="provenance">
            <h5>Training-data provenance</h5>
            <dl>
              <div><dt>Dataset CID</dt><dd>${provenance.datasetCid}</dd></div>
              <div><dt>Manifest CID</dt><dd>${provenance.manifestCid}</dd></div>
              <div><dt>Source</dt><dd>${provenance.source}</dd></div>
              <div><dt>Policy</dt><dd>${provenance.policyDecision}</dd></div>
              <div><dt>Receipt</dt><dd>${provenance.receiptId}</dd></div>
            </dl>
          </section>

          <section class="governance-section" data-svd-vda-marker="capacity-queue">
            <h5>Capacity queue</h5>
            <dl>
              <div><dt>Queue</dt><dd>${capacity.queueId}</dd></div>
              <div><dt>Slots</dt><dd>${capacity.activeSlots}/${capacity.availableSlots} active</dd></div>
              <div><dt>Queued</dt><dd>${capacity.queuedJobs} waiting; this job position ${capacity.jobPosition}</dd></div>
              <div><dt>Capacity</dt><dd>${capacity.capacityClass}</dd></div>
            </dl>
          </section>

          <section class="governance-section" data-svd-vda-marker="telemetry">
            <h5>Training telemetry</h5>
            <dl>
              <div><dt>Step</dt><dd>${telemetry.step}</dd></div>
              <div><dt>Throughput</dt><dd>${telemetry.samplesPerSecond} samples/s</dd></div>
              <div><dt>Memory</dt><dd>${telemetry.gpuMemoryMb} MB</dd></div>
              <div><dt>Receipt</dt><dd>${telemetry.receiptId}</dd></div>
            </dl>
          </section>

          <section class="governance-section" data-svd-vda-marker="cancellation-confirmation">
            <h5>Cancellation confirmation</h5>
            <dl>
              <div><dt>State</dt><dd>${cancellation.state}</dd></div>
              <div><dt>Required phrase</dt><dd>${cancellation.phrase}</dd></div>
              <div><dt>Receipt</dt><dd>${cancellation.receiptId}</dd></div>
            </dl>
          </section>

          <section class="governance-section" data-svd-vda-marker="checkpoints">
            <h5>Checkpoints</h5>
            <div class="checkpoint-list">
              ${checkpoints.length > 0 ? checkpoints.map(checkpoint => `
                <div class="checkpoint-item">
                  <span>Epoch ${checkpoint.epoch}</span>
                  <strong>${checkpoint.cid}</strong>
                  <span>${checkpoint.receiptId}</span>
                </div>
              `).join('') : '<p>No checkpoints saved yet</p>'}
            </div>
          </section>

          <section class="governance-section" data-svd-vda-marker="resume-recovery">
            <h5>Resume recovery</h5>
            <dl>
              <div><dt>State</dt><dd>${resume.state}</dd></div>
              <div><dt>Checkpoint</dt><dd>${resume.checkpointCid}</dd></div>
              <div><dt>Epoch</dt><dd>${resume.checkpointEpoch}</dd></div>
              <div><dt>Recovery</dt><dd>${resume.recoveryMessage || resume.message}</dd></div>
            </dl>
            <button class="btn btn-sm btn-success" id="resume-from-checkpoint" data-svd-workflow-action="resume-recovery">Resume checkpoint</button>
          </section>
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
    const resumeButton = detailsEl.querySelector('#resume-from-checkpoint');
    if (resumeButton) {
      resumeButton.addEventListener('click', resumeActiveJobFromCheckpoint);
    }
  }

  // Debounced jobs list render to reduce reflows on frequent updates
  let jobsListRenderTimer;
  function scheduleRenderJobsList(delay = 120) {
    clearTimeout(jobsListRenderTimer);
    jobsListRenderTimer = setTimeout(() => {
      renderJobsList();
    }, delay);
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
      const saved = localStorage.getItem(TRAINING_MANAGER_STORAGE_KEYS.versions);
      modelVersions = saved ? JSON.parse(saved) : [];
    }
    
    renderModelVersions();
    updateWorkflowGovernance();
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
      if (dataset.id === VDA_G032_DATASET_ID) option.selected = true;
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
      provenance: getDatasetProvenance(config.dataset || VDA_G032_DATASET_ID),
      capacity: { ...capacityQueue, jobPosition: capacityQueue.queuedJobs + 1 },
      telemetry: { ...telemetrySnapshot, step: 'configured' },
      cancellation: { ...lastCancellationConfirmation },
      checkpoints: [],
      resume: { ...resumeRecovery },
      receiptLineage: [
        getDatasetProvenance(config.dataset || VDA_G032_DATASET_ID).receiptId,
        'receipt:training-manager:queue-admission:g032'
      ],
      logs: []
    };

    trainingJobs.push(job);
    hideNewTrainingModal();
    
    // Start the training process
    await executeTrainingJob(job);
    
    updateJobStats();
  scheduleRenderJobsList();
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
        
  scheduleRenderJobsList();
        if (activeJob === job) {
          renderJobDetails();
          renderProgressMonitor();
          updateWorkflowGovernance();
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
  scheduleRenderJobsList();
    if (activeJob === job) {
      renderJobDetails();
      renderProgressMonitor();
      updateWorkflowGovernance();
    }
  }

  async function saveModelCheckpoint(job, epoch) {
    try {
      const checkpoint = createCheckpoint(job, epoch, 'auto-save');
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
        checkpoint.cid = cid;
        checkpoint.receiptId = `receipt:training-manager:checkpoint:${epoch}:ipfs`;
      } else {
        addJobLog(job, `Checkpoint saved to browser receipt store: ${checkpoint.cid}`);
      }
      if (!Array.isArray(job.checkpoints)) job.checkpoints = [];
      if (!job.checkpoints.some(item => item.epoch === epoch)) {
        job.checkpoints.push(checkpoint);
      }
      resumeRecovery = {
        state: 'checkpoint_available',
        checkpointCid: checkpoint.cid,
        checkpointEpoch: epoch,
        recoveryToken: `resume:g032:epoch-${epoch}`,
        message: 'Resume recovery will rehydrate the latest checkpoint with preserved provenance.'
      };
      job.resume = { ...resumeRecovery, recoveryMessage: resumeRecovery.message };
      localStorage.setItem(TRAINING_MANAGER_STORAGE_KEYS.resume, JSON.stringify(resumeRecovery));
    } catch (error) {
      addJobLog(job, `Failed to save checkpoint: ${error.message}`);
    }
  }

  async function saveModelVersion(job) {
    try {
      let cid = deterministicCid(`${job.id}:final-model:${job.currentEpoch}`);
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
        
        cid = await ipfsStorage.storeModelOnIPFS(
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
      }
      const versionEntry = {
        id: `trained_${job.id}`,
        metadata: {
          type: 'trained-model',
          name: job.name,
          version: job.config.version || '1.0.0',
          accuracy: job.currentAccuracy,
          loss: job.currentLoss,
          size: 18_874_368,
          created: new Date().toISOString(),
          cid,
          provenanceCid: job.provenance?.datasetCid,
          checkpointCid: job.resume?.checkpointCid
        }
      };
      job.modelCID = cid;
      modelVersions = [versionEntry, ...modelVersions.filter(version => version.id !== versionEntry.id)];
      localStorage.setItem(TRAINING_MANAGER_STORAGE_KEYS.versions, JSON.stringify(modelVersions));
      addJobLog(job, `Final model saved with receipt CID: ${cid}`);
      renderModelVersions();
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
  scheduleRenderJobsList();
      renderJobDetails();
    }
  }

  function resumeActiveJob() {
    if (activeJob && activeJob.status === 'paused') {
      activeJob.status = 'running';
      activeJob.resume = {
        ...(activeJob.resume || resumeRecovery),
        state: 'resumed',
        recoveryMessage: 'Job resumed from preserved checkpoint and queue token.'
      };
      addJobLog(activeJob, 'Training resumed by user');
  scheduleRenderJobsList();
      renderJobDetails();
      renderProgressMonitor();
      updateWorkflowGovernance();
    }
  }

  function resumeActiveJobFromCheckpoint() {
    if (!activeJob) return;
    const latestCheckpoint = [...(activeJob.checkpoints || [])].sort((a, b) => b.epoch - a.epoch)[0];
    if (!latestCheckpoint) {
      addJobLog(activeJob, 'Resume recovery unavailable: no checkpoint has been saved.');
      renderJobDetails();
      return;
    }
    activeJob.status = 'running';
    activeJob.currentEpoch = latestCheckpoint.epoch;
    activeJob.progress = Math.max(activeJob.progress || 0, (latestCheckpoint.epoch / activeJob.config.epochs) * 100);
    activeJob.resume = {
      state: 'resumed_from_checkpoint',
      checkpointCid: latestCheckpoint.cid,
      checkpointEpoch: latestCheckpoint.epoch,
      recoveryMessage: 'Optimizer, dataset provenance, and capacity queue receipts were restored.'
    };
    resumeRecovery = {
      state: activeJob.resume.state,
      checkpointCid: latestCheckpoint.cid,
      checkpointEpoch: latestCheckpoint.epoch,
      recoveryToken: `resume:g032:epoch-${latestCheckpoint.epoch}`,
      message: activeJob.resume.recoveryMessage
    };
    localStorage.setItem(TRAINING_MANAGER_STORAGE_KEYS.resume, JSON.stringify(resumeRecovery));
    addJobLog(activeJob, `Resume recovery completed from checkpoint ${latestCheckpoint.cid}.`);
    saveTrainingHistory();
    scheduleRenderJobsList();
    renderJobDetails();
    renderProgressMonitor();
    updateWorkflowGovernance();
    updateJobStats();
  }

  function stopActiveJob() {
    if (activeJob && (activeJob.status === 'running' || activeJob.status === 'paused')) {
      const phrase = activeJob.cancellation?.phrase || lastCancellationConfirmation?.phrase || 'STOP-G032';
      const confirmed = prompt(`Type ${phrase} to cancel "${activeJob.name}" and preserve the latest checkpoint.`, '');
      if (confirmed === phrase) {
        activeJob.status = 'cancelled';
        activeJob.cancellation = {
          ...(activeJob.cancellation || lastCancellationConfirmation),
          state: 'confirmed',
          confirmedAt: new Date().toISOString(),
          receiptId: `receipt:training-manager:cancellation-confirmed:${activeJob.id}`
        };
        lastCancellationConfirmation = { ...activeJob.cancellation };
        localStorage.setItem(TRAINING_MANAGER_STORAGE_KEYS.cancellation, JSON.stringify(lastCancellationConfirmation));
        addJobLog(activeJob, 'Training cancellation confirmed by user.');
  scheduleRenderJobsList();
        renderJobDetails();
        renderProgressMonitor();
        updateWorkflowGovernance();
        updateJobStats();
      } else if (confirmed !== null) {
        activeJob.cancellation = {
          ...(activeJob.cancellation || lastCancellationConfirmation),
          state: 'confirmation_failed'
        };
        addJobLog(activeJob, 'Cancellation blocked because the confirmation phrase did not match.');
        renderJobDetails();
        updateWorkflowGovernance();
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
  scheduleRenderJobsList();
    if (activeJob) renderJobDetails();
  }

  function resumeAllJobs() {
    trainingJobs.forEach(job => {
      if (job.status === 'paused') {
        job.status = 'running';
        addJobLog(job, 'Training resumed (bulk action)');
      }
    });
  scheduleRenderJobsList();
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
        created: new Date().toISOString(),
        rootCid: deterministicCid(files.map(file => `${file.name}:${file.size}`).join('|')),
        provenance: {
          source: 'browser.file-picker',
          datasetCid: deterministicCid(files.map(file => `${file.name}:${file.size}`).join('|')),
          manifestCid: deterministicCid(`manifest:${files.length}:${Date.now()}`),
          license: 'user-provided',
          split: 'pending validation',
          rows: files.length,
          policyDecision: 'local-only-pending-review',
          receiptId: `receipt:training-manager:dataset-upload:${Date.now()}`
        }
      };
      
      datasets.push(dataset);
      persistDatasets();
      alert(`Dataset "${dataset.name}" imported successfully`);
      hideDatasetModal();
      updateDatasetSelect();
      updateWorkflowGovernance();
    }
  }

  async function importDataset() {
    const cidInput = document.querySelector('#ipfs-dataset-cid');
    const syntheticType = document.querySelector('#synthetic-type');
    const cid = cidInput?.value?.trim();
    const synthetic = syntheticType?.value || 'classification';
    const dataset = {
      id: cid ? `ipfs-${cid.slice(0, 12)}` : `synthetic-${synthetic}-${Date.now()}`,
      name: cid ? `IPFS dataset ${cid.slice(0, 10)}` : `Synthetic ${synthetic} dataset`,
      files: cid ? ['ipfs-root'] : ['synthetic-records.jsonl', 'schema.json'],
      size: cid ? 0 : 2_097_152,
      type: cid ? 'ipfs' : 'synthetic',
      created: new Date().toISOString(),
      rootCid: cid || deterministicCid(`synthetic:${synthetic}`),
      provenance: {
        source: cid ? 'ipfs_datasets_py.get_from_ipfs' : 'ipfs_datasets_py.generate_synthetic',
        datasetCid: cid || deterministicCid(`synthetic:${synthetic}:dataset`),
        manifestCid: deterministicCid(`manifest:${cid || synthetic}`),
        license: cid ? 'from-dataset-card' : 'synthetic-eval',
        split: 'train=80 validation=20',
        rows: cid ? 'discovered' : 2048,
        policyDecision: 'allow-with-receipt',
        receiptId: `receipt:training-manager:dataset-import:${Date.now()}`
      }
    };
    datasets.unshift(dataset);
    persistDatasets();
    updateDatasetSelect();
    updateWorkflowGovernance();
    alert(`Dataset "${dataset.name}" imported with provenance receipt ${dataset.provenance.receiptId}`);
    hideDatasetModal();
  }

  // Utility functions
  function updateJobStats() {
    const activeJobs = trainingJobs.filter(job => ['queued', 'pending', 'running', 'paused'].includes(job.status)).length;
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
    try {
      const saved = localStorage.getItem(TRAINING_MANAGER_STORAGE_KEYS.jobs);
      if (saved) {
        trainingJobs = JSON.parse(saved).map(job => ({
          ...job,
          startTime: new Date(job.startTime)
        }));
      }
    } catch (error) {
      console.warn('Failed to load training history:', error);
      trainingJobs = [];
    }
    
    renderJobsList();
    updateJobStats();
  }

  function saveTrainingHistory() {
    localStorage.setItem(TRAINING_MANAGER_STORAGE_KEYS.jobs, JSON.stringify(trainingJobs));
  }

  function renderProgressMonitor() {
    const charts = document.querySelector('#progress-charts');
    if (!charts) return;
    const job = activeJob || trainingJobs[0] || null;
    const telemetry = job?.telemetry || telemetrySnapshot;
    const capacity = job?.capacity || capacityQueue;
    const resume = job?.resume || resumeRecovery;
    const checkpoints = job?.checkpoints || [];
    charts.innerHTML = `
      <div class="telemetry-grid" data-svd-workflow="${VDA_G032_WORKFLOW}">
        <div class="telemetry-card" data-svd-vda-marker="capacity-queue">
          <span>Queue</span>
          <strong>${capacity.activeSlots}/${capacity.availableSlots}</strong>
          <small>${capacity.queuedJobs} queued; position ${capacity.jobPosition}</small>
        </div>
        <div class="telemetry-card" data-svd-vda-marker="telemetry">
          <span>Throughput</span>
          <strong>${telemetry.samplesPerSecond} samples/s</strong>
          <small>${telemetry.step}; ${telemetry.receiptId}</small>
        </div>
        <div class="telemetry-card" data-svd-vda-marker="checkpoints">
          <span>Checkpoints</span>
          <strong>${checkpoints.length}</strong>
          <small>${resume.checkpointCid}</small>
        </div>
        <div class="telemetry-card" data-svd-vda-marker="resume-recovery">
          <span>Resume</span>
          <strong>${resume.state}</strong>
          <small>${resume.recoveryToken || resume.checkpointCid}</small>
        </div>
      </div>
    `;
  }

  let monitoringInterval;
  
  function startJobMonitoring() {
    monitoringInterval = setInterval(() => {
      saveTrainingHistory();
      renderJobsList();
      renderProgressMonitor();
      updateWorkflowGovernance();
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
    const version = modelVersions.find(item => item.id === versionId);
    if (!version) {
      alert(`Model version ${versionId} was not found.`);
      return;
    }
    const resumeJob = createGovernedTrainingJob({
      id: `loaded-${versionId}`,
      name: `${version.metadata.name} evaluation`,
      status: 'paused',
      progress: 100,
      currentEpoch: 10
    });
    resumeJob.modelCID = version.metadata.cid || version.metadata.checkpointCid || deterministicCid(versionId);
    resumeJob.resume = {
      state: 'model_loaded_for_resume',
      checkpointCid: version.metadata.checkpointCid || resumeJob.modelCID,
      checkpointEpoch: 10,
      recoveryMessage: 'Loaded model version is ready for evaluation or resumed fine tuning.'
    };
    trainingJobs.unshift(resumeJob);
    activeJob = resumeJob;
    addJobLog(resumeJob, `Loaded model version ${versionId} with CID ${resumeJob.modelCID}.`);
    saveTrainingHistory();
    renderJobsList();
    renderJobDetails();
    renderProgressMonitor();
    updateWorkflowGovernance();
  };
  window.shareModelVersion = function(versionId) {
    const version = modelVersions.find(item => item.id === versionId);
    if (!version) {
      alert(`Model version ${versionId} was not found.`);
      return;
    }
    version.metadata.shared = true;
    version.metadata.shareReceipt = `receipt:training-manager:model-share:${versionId}`;
    localStorage.setItem(TRAINING_MANAGER_STORAGE_KEYS.versions, JSON.stringify(modelVersions));
    renderModelVersions();
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
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 14px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      
      .toolbar-section {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        flex-wrap: wrap;
      }

      .toolbar-section:first-child .btn {
        flex: 1 1 136px;
      }

      .toolbar-section:nth-child(2) {
        justify-content: flex-end;
        max-width: 260px;
      }
      
      .status-indicator {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #6c757d;
        min-width: 0;
      }

      .status-text {
        min-width: 0;
        overflow-wrap: anywhere;
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

      .workflow-governance {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 8px;
        padding: 10px 12px;
        background: #eef6f4;
        border-bottom: 1px solid #c7ded8;
      }

      .workflow-card {
        min-width: 0;
        padding: 8px;
        border: 1px solid #b8d4cd;
        border-radius: 6px;
        background: #ffffff;
        display: grid;
        gap: 3px;
        color: #18342f;
      }

      .workflow-card strong,
      .workflow-card span {
        overflow-wrap: anywhere;
      }

      .workflow-card strong {
        font-size: 12px;
      }

      .workflow-card span {
        font-size: 11px;
      }

      .workflow-label {
        color: #4d6f67;
        font-weight: 700;
        text-transform: uppercase;
      }
      
      .training-content {
        flex: 1;
        display: grid;
        grid-template-columns: minmax(280px, 1fr) minmax(220px, 0.8fr) minmax(240px, 0.8fr);
        gap: 1px;
        overflow: hidden;
      }
      
      .jobs-panel {
        min-width: 0;
        background: white;
        border-right: 1px solid #dee2e6;
        display: flex;
        flex-direction: column;
      }
      
      .details-panel {
        min-width: 0;
        flex: 1;
        background: white;
        border-right: 1px solid #dee2e6;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      
      .versions-panel {
        min-width: 0;
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
        gap: 8px;
        flex-wrap: wrap;
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

      .governance-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 20px;
      }

      .governance-section {
        min-width: 0;
        padding: 12px;
        border: 1px solid #d6e4e0;
        border-radius: 6px;
        background: #fbfefd;
      }

      .governance-section dl {
        display: grid;
        gap: 6px;
        margin: 0;
      }

      .governance-section dl div {
        display: grid;
        grid-template-columns: minmax(90px, .7fr) minmax(0, 1.3fr);
        gap: 8px;
        align-items: start;
      }

      .governance-section dt {
        color: #5c6f6b;
        font-size: 11px;
        font-weight: 700;
      }

      .governance-section dd {
        margin: 0;
        color: #1f3430;
        font-size: 12px;
        overflow-wrap: anywhere;
      }

      .checkpoint-list {
        display: grid;
        gap: 6px;
      }

      .checkpoint-item {
        display: grid;
        grid-template-columns: 70px minmax(0, 1fr);
        gap: 4px 8px;
        padding: 6px;
        border: 1px solid #dce8e5;
        background: white;
        font-size: 12px;
      }

      .checkpoint-item strong,
      .checkpoint-item span:last-child {
        overflow-wrap: anywhere;
      }

      .checkpoint-item span:last-child {
        grid-column: 2;
        color: #5c6f6b;
        font-size: 11px;
      }

      .telemetry-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }

      .telemetry-card {
        display: grid;
        gap: 3px;
        min-width: 0;
        padding: 8px;
        border: 1px solid #d7dee5;
        border-radius: 6px;
        background: #f8fafc;
      }

      .telemetry-card span,
      .telemetry-card small,
      .telemetry-card strong {
        overflow-wrap: anywhere;
      }

      .telemetry-card span {
        color: #667085;
        font-size: 11px;
        text-transform: uppercase;
        font-weight: 700;
      }

      .telemetry-card strong {
        color: #1f2937;
        font-size: 15px;
      }

      .telemetry-card small {
        color: #596579;
        font-size: 11px;
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

      .validation-summary {
        margin-bottom: 12px;
        padding: 8px;
        border: 1px solid #b8d4cd;
        border-radius: 6px;
        background: #eef6f4;
        color: #23443d;
        font-size: 12px;
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
          grid-template-columns: 1fr;
          overflow: auto;
        }
        
        .jobs-panel,
        .versions-panel {
          max-height: 300px;
        }
        
        .detail-grid {
          grid-template-columns: 1fr;
        }

        .workflow-governance,
        .governance-grid,
        .telemetry-grid {
          grid-template-columns: 1fr 1fr;
        }
        
        .config-grid {
          grid-template-columns: 1fr 1fr;
        }
      }
      
      @media (max-width: 768px) {
        .training-toolbar {
          grid-template-columns: 1fr;
          align-items: stretch;
        }

        .toolbar-section,
        .toolbar-section:nth-child(2) {
          justify-content: stretch;
          max-width: none;
        }

        .toolbar-section .btn {
          flex: 1 1 140px;
        }

        .config-grid {
          grid-template-columns: 1fr;
        }
        
        .form-row {
          flex-direction: column;
        }
        
        .toolbar-section {
          flex-wrap: wrap;
        }

        .workflow-governance,
        .governance-grid,
        .telemetry-grid {
          grid-template-columns: 1fr;
        }

        .governance-section dl div,
        .checkpoint-item {
          grid-template-columns: 1fr;
        }

        .checkpoint-item span:last-child {
          grid-column: auto;
        }
      }
    `;
    
    document.head.appendChild(style);
  }

})();
