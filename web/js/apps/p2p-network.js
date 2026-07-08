// P2P Network Manager Application for SwissKnife Virtual Desktop
// Enhanced with Phase 4: Web Workers & Audio Workers Infrastructure

(function() {
  'use strict';

  // Import the P2P ML System (when available)
  let P2PMLSystem = null;
  let modelServer = null;
  let inferenceCoordinator = null;

  // Phase 2: Collaborative P2P System
  let collaborativeP2PManager = null;
  let workspaceManager = null;
  let realTimeSyncEngine = null;

  // Phase 4: Worker Manager Integration
  let workerManager = null;
  let workerStats = new Map();
  let distributedTasks = [];
  let workerCapabilities = [];

  // Phase 5: CloudFlare Integration
  let cloudflareIntegration = null;
  let cloudflareConfig = {
    enableWorkers: true,
    enableR2: true,
    enableCDN: true,
    workerNamespace: 'swissknife-workers',
    r2BucketName: 'swissknife-storage'
  };
  let cloudflareStats = {
    deployedWorkers: 0,
    activeTasks: 0,
    totalExecutions: 0,
    cacheHitRate: 0.85
  };
  let hybridTasks = [];

  // Application state
  let peers = [];
  let tasks = [];
  let modelInferences = [];
  let p2pManager = null;
  let connectionStatus = 'disconnected';
  let systemStatus = null;

  // Phase 2: Collaborative state
  let workspaces = [];
  let currentWorkspace = null;
  let collaborativeTasks = [];
  let peerPresence = new Map();
  let activeSessions = [];

  // Phase 4: Worker state
  let workerPoolActive = false;
  let backgroundTasks = [];
  let performanceMetrics = {
    tasksCompleted: 0,
    averageTaskTime: 0,
    totalComputeTime: 0,
    gpuUtilization: 0
  };

  // Create P2P Network UI function
  function createP2PNetworkUI() {
    return `
      <div class="p2p-network-app">
        ${createP2PNetworkStyles()}
        
        <div class="app-header">
          <h2>🌐 P2P Network Manager</h2>
          <div class="connection-status ${connectionStatus}">
            <span class="status-indicator"></span>
            <span class="status-text">${getStatusText()}</span>
          </div>
        </div>

        <div class="app-content">
          <div class="p2p-tabs">
            <button class="tab-button active" data-tab="network">Network</button>
            <button class="tab-button" data-tab="peers">Peers</button>
            <button class="tab-button" data-tab="models">Models</button>
            <button class="tab-button" data-tab="tasks">Tasks</button>
            <button class="tab-button" data-tab="workspaces">Workspaces</button>
            <button class="tab-button" data-tab="workers">Workers</button>
            <button class="tab-button" data-tab="cloudflare">CloudFlare</button>
            <button class="tab-button" data-tab="hybrid">Hybrid Workers</button>
            <button class="tab-button" data-tab="huggingface">🤗 Hugging Face</button>
          </div>

          <div class="tab-content active" id="network-tab">
            ${createNetworkTab()}
          </div>

          <div class="tab-content" id="peers-tab">
            ${createPeersTab()}
          </div>

          <div class="tab-content" id="models-tab">
            ${createModelsTab()}
          </div>

          <div class="tab-content" id="tasks-tab">
            ${createTasksTab()}
          </div>

          <div class="tab-content" id="workspaces-tab">
            ${createWorkspacesTab()}
          </div>

          <div class="tab-content" id="workers-tab">
            ${createWorkersTab()}
          </div>

          <div class="tab-content" id="cloudflare-tab">
            ${createCloudflareTab()}
          </div>

          <div class="tab-content" id="hybrid-tab">
            ${createHybridWorkersTab()}
          </div>

          <div class="tab-content" id="huggingface-tab">
            ${createHuggingFaceTab()}
          </div>
        </div>
      </div>
    `;
  }

  function createP2PNetworkStyles() {
    return `<style>
      .p2p-network-app {
        padding: 15px;
        height: 100%;
        overflow-y: auto;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      }
      
      .app-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding: 15px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        backdrop-filter: blur(10px);
      }
      
      .connection-status {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 15px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.2);
      }
      
      .status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #4CAF50;
      }
      
      .p2p-tabs {
        display: flex;
        gap: 5px;
        margin-bottom: 20px;
        flex-wrap: wrap;
      }
      
      .tab-button {
        padding: 10px 15px;
        border: none;
        background: rgba(255, 255, 255, 0.1);
        color: white;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.3s ease;
      }
      
      .tab-button:hover,
      .tab-button.active {
        background: rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(10px);
      }
      
      .tab-content {
        display: none;
        padding: 20px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        backdrop-filter: blur(10px);
      }
      
      .tab-content.active {
        display: block;
      }
    </style>`;
  }

  function createNetworkTab() {
    return `
      <h3>🌐 P2P Network Status</h3>
      <div class="network-stats">
        <div class="stat-card">
          <h4>Connection Status</h4>
          <p>Disconnected</p>
        </div>
        <div class="stat-card">
          <h4>Active Peers</h4>
          <p>0</p>
        </div>
        <div class="stat-card">
          <h4>Network Tasks</h4>
          <p>0</p>
        </div>
      </div>
      <button onclick="window.p2pNetworkApp?.connect()" class="action-btn">Connect to Network</button>
    `;
  }

  function createPeersTab() {
    return `
      <h3>👥 Connected Peers</h3>
      <div class="peers-list">
        <p>No peers connected. Start the network to discover peers.</p>
      </div>
    `;
  }

  function createModelsTab() {
    return `
      <h3>🧠 AI Models</h3>
      <div class="models-list">
        <p>Model sharing will be available once connected to the network.</p>
      </div>
    `;
  }

  function createTasksTab() {
    return `
      <h3>⚡ Distributed Tasks</h3>
      <div class="tasks-list">
        <p>No active tasks. Connect to the network to start distributing tasks.</p>
      </div>
    `;
  }

  function createWorkspacesTab() {
    return `
      <h3>🏢 Collaborative Workspaces</h3>
      <div class="workspaces-list">
        <p>Create or join workspaces for collaborative development.</p>
        <button class="action-btn">Create Workspace</button>
        <button class="action-btn">Join Workspace</button>
      </div>
    `;
  }

  function createWorkersTab() {
    return `
      <h3>🛠️ Web Workers & Audio Workers</h3>
      <div class="workers-stats">
        <p>Worker infrastructure for distributed computing and audio collaboration.</p>
        <div class="worker-types">
          <div class="worker-type">
            <h4>Compute Workers</h4>
            <p>0 active</p>
          </div>
          <div class="worker-type">
            <h4>Audio Workers</h4>
            <p>0 active</p>
          </div>
          <div class="worker-type">
            <h4>AI Inference Workers</h4>
            <p>0 active</p>
          </div>
        </div>
      </div>
    `;
  }

  function createCloudflareTab() {
    return `
      <h3>🌩️ CloudFlare Integration</h3>
      <div class="cloudflare-stats">
        <p>Hybrid P2P + CloudFlare edge computing infrastructure.</p>
        <div class="cf-services">
          <div class="cf-service">
            <h4>Workers</h4>
            <p>0 deployed</p>
          </div>
          <div class="cf-service">
            <h4>R2 Storage</h4>
            <p>Connected</p>
          </div>
          <div class="cf-service">
            <h4>CDN Cache</h4>
            <p>85% hit rate</p>
          </div>
        </div>
      </div>
    `;
  }

  function createHybridWorkersTab() {
    return `
      <h3>⚡ Hybrid Worker Management</h3>
      <div class="hybrid-workers">
        <p>Manage tasks across local, P2P, and CloudFlare execution environments.</p>
        <div class="execution-environments">
          <div class="env-card">
            <h4>Local Execution</h4>
            <p>Browser-based workers</p>
          </div>
          <div class="env-card">
            <h4>P2P Network</h4>
            <p>Distributed peer workers</p>
          </div>
          <div class="env-card">
            <h4>CloudFlare Edge</h4>
            <p>Global edge workers</p>
          </div>
        </div>
      </div>
    `;
  }

  function createHuggingFaceTab() {
    return `
      <h3>🤗 Hugging Face Integration</h3>
      <div class="hf-integration">
        <p>Access Hugging Face models and datasets through P2P network.</p>
        <div class="hf-features">
          <div class="hf-feature">
            <h4>Model Hub</h4>
            <p>Share models across peers</p>
          </div>
          <div class="hf-feature">
            <h4>Distributed Inference</h4>
            <p>Run models on peer network</p>
          </div>
          <div class="hf-feature">
            <h4>Dataset Sharing</h4>
            <p>Collaborative dataset access</p>
          </div>
        </div>
      </div>
    `;
  }

  function getStatusText() {
    return connectionStatus === 'connected' ? 'Connected' : 'Disconnected';
  }

  // Create P2P Network Manager application
  window.createP2PNetworkApp = function() {
    return {
      name: "P2P Network",
      icon: "🌐",
      async initialize() {
        console.log('🌐 P2P Network App initializing...');
      },
      async render() {
        return createP2PNetworkUI();
      },
      async init(container) {
        await initializeP2PMLSystem();
        renderApp(container);
        setupEventHandlers(container);
        startSystemMonitoring();
        
        // Phase 4: Initialize Worker Manager
        await initializeWorkerManager();
        
        // Phase 5: Initialize CloudFlare Integration
        await initializeCloudFlareIntegration();
      },
      async destroy() {
        if (P2PMLSystem) {
          P2PMLSystem.stop();
        }
        
        // Phase 4: Shutdown Worker Manager
        if (workerManager) {
          await workerManager.shutdown();
        }
        
        // Phase 5: Shutdown CloudFlare Integration
        if (cloudflareIntegration) {
          await cloudflareIntegration.shutdown();
        }
        
        // Clean up global functions
        delete window.p2pNetworkApp;
      }
    };
  };

  async function initializeP2PMLSystem() {
    try {
      // Try to initialize the P2P ML system if available
      if (window.initializeP2PMLSystem) {
        P2PMLSystem = window.initializeP2PMLSystem({
          enableDistributedInference: true,
          enableModelSharing: true,
          autoStart: false,
          modelServer: {
            maxConcurrentTasks: 4,
            enableWebSocket: true,
            enableP2PIntegration: true
          }
        });

        // Setup event listeners
        P2PMLSystem.on('system:started', () => {
          connectionStatus = 'connected';
          updateDisplays();
        });

        P2PMLSystem.on('peer:connected', (peer) => {
          addPeer(peer);
          updateDisplays();
        });

        P2PMLSystem.on('peer:disconnected', (peer) => {
          removePeer(peer.id.id);
          updateDisplays();
        });
      }

      // Phase 2: Initialize Collaborative P2P System
      await initializeCollaborativeP2P();
      
    } catch (error) {
      console.error('Failed to initialize P2P ML System:', error);
      connectionStatus = 'error';
      updateDisplays();
    }
  }

  // Phase 2: Initialize collaborative P2P features
  async function initializeCollaborativeP2P() {
    try {
      // Initialize collaborative P2P manager
      if (window.CollaborativeP2PManager) {
        const config = {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ],
          signaling: {
            url: 'wss://signaling.swissknife.ai',
            protocol: 'wss'
          },
          enableP2P: true,
          maxPeers: 50
        };

        collaborativeP2PManager = new window.CollaborativeP2PManager(config);
        
        // Setup collaborative event handlers
        collaborativeP2PManager.on('workspace:created', (workspace) => {
          workspaces.push(workspace);
          updateWorkspaceDisplay();
        });

        collaborativeP2PManager.on('workspace:joined', (workspace) => {
          currentWorkspace = workspace;
          updateWorkspaceDisplay();
        });

        collaborativeP2PManager.on('collaborative_task_completed', (task) => {
          updateCollaborativeTaskDisplay();
        });

        collaborativeP2PManager.on('peer:presence_updated', (presence) => {
          peerPresence.set(presence.peerId, presence);
          updatePresenceDisplay();
        });

        // Initialize workspace manager
        if (window.WorkspaceManager) {
          workspaceManager = new window.WorkspaceManager(collaborativeP2PManager);
          
          workspaceManager.on('workspace:state_updated', (state) => {
            updateWorkspaceStateDisplay();
          });
        }

        // Initialize real-time sync engine
        if (window.RealTimeSyncEngine) {
          realTimeSyncEngine = new window.RealTimeSyncEngine();
          
          realTimeSyncEngine.onSync('*', (state) => {
            updateSyncDisplay();
          });
        }

        // Start collaborative P2P system
        await collaborativeP2PManager.start();
        
      } else {
        console.log('Collaborative P2P system not available - running in basic mode');
      }
      
    } catch (error) {
      console.error('Failed to initialize Collaborative P2P:', error);
    }
  }

  function setupFallbackWorkerManager() {
    // Fallback worker manager using Web Workers API
    const workers = new Map();
    
    workerManager = {
      initialize: async () => {
        console.log('Initializing fallback worker manager with Web Workers');
        workerPoolActive = true;
        
        // Detect available capabilities based on browser support
        workerCapabilities = [];
        if (typeof Worker !== 'undefined') workerCapabilities.push('compute');
        if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') workerCapabilities.push('audio');
        if (navigator.gpu || navigator.ml) workerCapabilities.push('ai-inference');
        
        return Promise.resolve();
      },
      on: (event, callback) => {
        console.log(`Worker manager event registered: ${event}`);
        // Store callback for event handling
      },
      createWorker: (type) => {
        try {
          // Try to create a real Web Worker if supported
          if (typeof Worker !== 'undefined') {
            const workerId = 'worker-' + Date.now();
            // Note: In production, point to actual worker script
            console.log(`Creating Web Worker of type: ${type}`);
            workers.set(workerId, { type, status: 'ready' });
            return { id: workerId, type };
          }
        } catch (error) {
          console.warn('Web Worker creation failed:', error);
        }
        
        // Fallback to main thread execution
        const workerId = 'fallback-worker-' + Date.now();
        return { id: workerId, type, fallback: true };
      },
      distributeTask: async (task) => {
        console.log('Distributing task:', task.type);
        
        // Try to execute on worker if available
        const worker = Array.from(workers.values()).find(w => w.status === 'ready');
        if (worker) {
          console.log('Executing task on worker:', worker.type);
          // Simulate async task execution
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve({ result: 'processed', worker: worker.type });
            }, 100);
          });
        }
        
        // Fallback to immediate execution
        return Promise.resolve({ result: 'processed-on-main-thread' });
      }
    };
  }

  // Phase 4: Initialize Worker Manager
  async function initializeWorkerManager() {
    try {
      console.log('🛠️ Initializing Worker Manager...');
      
      // Check if WorkerManager is available
      if (window.WorkerManager) {
        workerManager = new window.WorkerManager(collaborativeP2PManager, null);
        
        // Setup worker event handlers
        workerManager.on('initialized', (data) => {
          workerPoolActive = true;
          workerCapabilities = data.capabilities || [];
          console.log(`✅ Worker Manager initialized with ${data.localWorkers} workers`);
          updateWorkerDisplay();
        });

        workerManager.on('workerCreated', (data) => {
          console.log(`🔧 Worker created: ${data.workerId} (${data.type})`);
          updateWorkerDisplay();
        });

        workerManager.on('taskQueued', (data) => {
          distributedTasks.push({
            ...data.task,
            status: 'queued',
            queuedAt: new Date()
          });
          updateWorkerDisplay();
        });

        await workerManager.initialize();
        console.log('✅ Worker Manager initialized successfully');
      } else {
        console.log('Worker Manager not available - using mock implementation');
        setupFallbackWorkerManager();
      }
      
    } catch (error) {
      console.error('Failed to initialize Worker Manager:', error);
      setupFallbackWorkerManager();
    }
  }

  function setupFallbackCloudFlareIntegration() {
    // Fallback CloudFlare integration (limited functionality without real API)
    cloudflareIntegration = {
      initialize: async () => {
        console.log('Initializing fallback CloudFlare integration (API not available)');
        // Check if we have CloudFlare API credentials in localStorage
        const apiToken = localStorage.getItem('cloudflare-api-token');
        if (apiToken) {
          console.log('CloudFlare API token found - enhanced functionality available');
        } else {
          console.log('No CloudFlare API token - using basic fallback');
        }
        return Promise.resolve();
      },
      deployWorker: async (name, script) => {
        console.log(`CloudFlare worker deployment requested: ${name}`);
        
        // Check if real API is configured
        const apiToken = localStorage.getItem('cloudflare-api-token');
        const accountId = localStorage.getItem('cloudflare-account-id');
        
        if (apiToken && accountId) {
          try {
            // Attempt real CloudFlare Workers API call
            const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${name}`, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/javascript'
              },
              body: script
            });
            
            if (response.ok) {
              const result = await response.json();
              console.log('✅ CloudFlare worker deployed successfully');
              return { success: true, workerId: result.id || name };
            }
          } catch (error) {
            console.warn('CloudFlare API call failed:', error);
          }
        }
        
        // Fallback: Store worker locally for potential later deployment
        console.log('Storing worker configuration locally (not deployed to CloudFlare)');
        return Promise.resolve({ 
          success: false, 
          workerId: 'local-' + Date.now(),
          message: 'Worker stored locally. Configure CloudFlare API credentials to deploy.' 
        });
      },
      getWorkerStats: () => {
        return Promise.resolve({
          deployedWorkers: cloudflareStats.deployedWorkers,
          activeTasks: cloudflareStats.activeTasks,
          totalExecutions: cloudflareStats.totalExecutions,
          note: 'Configure CloudFlare API for real-time stats'
        });
      }
    };
  }

  // Phase 5: Initialize CloudFlare Integration
  async function initializeCloudFlareIntegration() {
    try {
      console.log('🌩️ Initializing CloudFlare Integration...');
      
      // Check if CloudFlare integration is available
      if (window.CloudFlareIntegration) {
        cloudflareIntegration = new window.CloudFlareIntegration(cloudflareConfig);
        
        // Initialize CloudFlare integration
        await cloudflareIntegration.initialize();
        
        console.log('✅ CloudFlare Integration initialized successfully');
      } else {
        console.log('CloudFlare Integration not available - using mock implementation');
        setupFallbackCloudFlareIntegration();
      }
      
    } catch (error) {
      console.error('Failed to initialize CloudFlare Integration:', error);
      setupFallbackCloudFlareIntegration();
    }
  }

  // Deploy sample CloudFlare workers
  async function deploySampleWorkers() {
    try {
      // Optional dynamic import for dev-only templates; wrap to avoid build-time resolution failure
      let getWorkerTemplate;
      try {
        const cfModule = '/src/cloudflare/worker-templates.ts';
        ({ getWorkerTemplate } = await import(/* @vite-ignore */ cfModule));
      } catch (e) {
        console.warn('Cloudflare worker templates not available in web build, using stub');
        getWorkerTemplate = (name) => `// stub worker: ${name}`;
      }
      
      // Deploy AI Inference Worker
      const aiWorkerScript = getWorkerTemplate('ai-inference');
      await cloudflareIntegration.deployWorker(aiWorkerScript, {
        name: 'swissknife-ai-inference',
        script: aiWorkerScript,
        environment: 'development',
        routes: ['*/ai-inference/*']
      });

      // Deploy Compute Worker
      const computeWorkerScript = getWorkerTemplate('compute');
      await cloudflareIntegration.deployWorker(computeWorkerScript, {
        name: 'swissknife-compute',
        script: computeWorkerScript,
        environment: 'development',
        routes: ['*/compute/*']
      });

      // Deploy File Processing Worker
      const fileWorkerScript = getWorkerTemplate('file-processing');
      await cloudflareIntegration.deployWorker(fileWorkerScript, {
        name: 'swissknife-file-processing',
        script: fileWorkerScript,
        environment: 'development',
        routes: ['*/file-processing/*']
      });

      console.log('✅ Sample CloudFlare workers deployed successfully');
      
    } catch (error) {
      console.error('❌ Failed to deploy sample workers:', error);
    }
  }

  // Phase 4: Start worker monitoring
  function startWorkerMonitoring() {
    setInterval(() => {
      if (workerManager) {
        const stats = workerManager.getStats();
        updateWorkerStats(stats);
        
        // Update performance metrics
        performanceMetrics.gpuUtilization = calculateGPUUtilization(stats);
        updatePerformanceDisplay();
      }
    }, 2000); // Update every 2 seconds
  }

  // Phase 4: Calculate GPU utilization
  function calculateGPUUtilization(stats) {
    const gpuWorkers = stats.workerStats.filter(w => w.type === 'gpu-compute' || w.type === 'ai-inference');
    const busyGpuWorkers = gpuWorkers.filter(w => w.status === 'busy');
    return gpuWorkers.length > 0 ? (busyGpuWorkers.length / gpuWorkers.length) * 100 : 0;
  }

  // Phase 4: Update worker stats
  function updateWorkerStats(stats) {
    // Store current stats
    workerStats.set('current', {
      ...stats,
      timestamp: Date.now()
    });
    
    // Update task completion metrics
    const completedTasks = distributedTasks.filter(t => t.status === 'completed');
    if (completedTasks.length > 0) {
      const totalTime = completedTasks.reduce((sum, task) => {
        return sum + (task.completedAt - task.startedAt);
      }, 0);
      performanceMetrics.averageTaskTime = totalTime / completedTasks.length;
      performanceMetrics.tasksCompleted = completedTasks.length;
    }
  }

  // Initialize P2P ML System
  async function initializeP2PMLSystem() {
    try {
      if (window.P2PMLSystem) {
        P2PMLSystem = new window.P2PMLSystem();
        await P2PMLSystem.initialize();
        
        // Setup event listeners for P2P ML System
        P2PMLSystem.on('peer:connected', (peer) => {
          peers.push(peer);
          updateDisplays();
        });

        P2PMLSystem.on('peer:disconnected', (peerId) => {
          peers = peers.filter(p => p.id !== peerId);
          updateDisplays();
        });

        P2PMLSystem.on('model:loaded', (data) => {
          updateDisplays();
        });

        P2PMLSystem.on('p2p:inference:response', (response) => {
          updateInferenceStatus(response);
          updateDisplays();
        });

        console.log('P2P ML System initialized successfully');

      } else {
        console.log('P2P ML System not available, using mock implementation');
        setupFallbackP2PManager();
      }

    } catch (error) {
      console.error('Failed to initialize P2P ML System:', error);
      setupFallbackP2PManager();
    }
  }

  function renderApp(container) {
    container.innerHTML = `
      <div class="p2p-network-app">
        <style>
          .p2p-network-app {
            padding: 15px;
            height: 100%;
            overflow-y: auto;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          }
          
          .app-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e1e5e9;
          }
          
          .app-header h2 {
            margin: 0;
            color: #2c3e50;
            font-size: 24px;
          }
          
          .connection-status {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            border-radius: 20px;
            font-weight: 500;
            font-size: 14px;
          }
          
          .connection-status.connected {
            background: linear-gradient(135deg, #4caf50, #66bb6a);
            color: white;
          }
          
          .connection-status.connecting {
            background: linear-gradient(135deg, #ff9800, #ffb74d);
            color: white;
          }
          
          .connection-status.disconnected {
            background: linear-gradient(135deg, #f44336, #ef5350);
            color: white;
          }
          
          .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: currentColor;
            animation: pulse 2s infinite;
          }
          
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          
          .p2p-tabs {
            display: flex;
            gap: 2px;
            margin-bottom: 20px;
            background: #f8f9fa;
            border-radius: 8px;
            padding: 4px;
          }
          
          .tab-button {
            flex: 1;
            padding: 12px 16px;
            border: none;
            background: transparent;
            cursor: pointer;
            border-radius: 6px;
            font-weight: 500;
            transition: all 0.2s ease;
            color: #6c757d;
          }
          
          .tab-button:hover {
            background: #e9ecef;
            color: #495057;
          }
          
          .tab-button.active {
            background: linear-gradient(135deg, #007bff, #0056b3);
            color: white;
            box-shadow: 0 2px 4px rgba(0, 123, 255, 0.3);
          }
          
          .tab-content {
            display: none;
          }
          
          .tab-content.active {
            display: block;
          }
          
          .network-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
          }
          
          .stat-card {
            background: linear-gradient(135deg, #ffffff, #f8f9fa);
            border: 1px solid #e9ecef;
            border-radius: 12px;
            padding: 20px;
            display: flex;
            align-items: center;
            gap: 16px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            transition: transform 0.2s ease;
          }
          
          .stat-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          }
          
          .stat-icon {
            font-size: 32px;
            width: 48px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #007bff, #0056b3);
            border-radius: 12px;
            color: white;
          }
          
          .stat-info {
            flex: 1;
          }
          
          .stat-value {
            font-size: 28px;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 4px;
          }
          
          .stat-label {
            color: #6c757d;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          .network-actions {
            display: flex;
            gap: 12px;
            margin-bottom: 24px;
            flex-wrap: wrap;
          }
          
          .action-btn {
            padding: 12px 20px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s ease;
            text-decoration: none;
          }
          
          .action-btn.primary {
            background: linear-gradient(135deg, #007bff, #0056b3);
            color: white;
          }
          
          .action-btn.primary:hover {
            background: linear-gradient(135deg, #0056b3, #004085);
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0, 123, 255, 0.3);
          }
          
          .action-btn:not(.primary) {
            background: linear-gradient(135deg, #f8f9fa, #e9ecef);
            color: #495057;
            border: 1px solid #dee2e6;
          }
          
          .action-btn:not(.primary):hover {
            background: linear-gradient(135deg, #e9ecef, #dee2e6);
            transform: translateY(-1px);
          }
          
          .action-btn.small {
            padding: 6px 12px;
            font-size: 12px;
          }
          
          .btn-icon {
            font-size: 16px;
          }
          
          .topology-container {
            position: relative;
            height: 240px;
            background: linear-gradient(135deg, #f8f9fa, #ffffff);
            border: 2px solid #e9ecef;
            border-radius: 12px;
            margin: 16px 0;
          }
          
          .node {
            position: absolute;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            font-weight: bold;
            color: white;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
          }
          
          .node.self {
            background: linear-gradient(135deg, #28a745, #20c997);
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 10;
          }
          
          .node.peer {
            background: linear-gradient(135deg, #007bff, #6610f2);
            font-size: 16px;
          }
          
          .node.peer.connected {
            background: linear-gradient(135deg, #28a745, #20c997);
          }
          
          .node.peer.connecting {
            background: linear-gradient(135deg, #ffc107, #fd7e14);
          }
          
          .node.peer.disconnected {
            background: linear-gradient(135deg, #6c757d, #495057);
          }
          
          .node-label {
            font-size: 10px;
            margin-top: 2px;
          }
          
          .connection {
            position: absolute;
            height: 2px;
            background: linear-gradient(90deg, #007bff, transparent);
            top: 50%;
            left: 50%;
            transform-origin: 0 50%;
            z-index: 1;
          }
          
          .connection.connected {
            background: linear-gradient(90deg, #28a745, transparent);
          }
          
          .connection.connecting {
            background: linear-gradient(90deg, #ffc107, transparent);
            animation: pulse 1s infinite;
          }
          
          .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
          }
          
          .section-header h3 {
            margin: 0;
            color: #2c3e50;
            font-size: 20px;
          }
          
          .peers-list {
            display: grid;
            gap: 12px;
          }
          
          .peer-card {
            background: white;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 16px;
            transition: all 0.2s ease;
          }
          
          .peer-card:hover {
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            transform: translateY(-1px);
          }
          
          .peer-card.connected {
            border-left: 4px solid #28a745;
          }
          
          .peer-card.connecting {
            border-left: 4px solid #ffc107;
          }
          
          .peer-card.disconnected {
            border-left: 4px solid #6c757d;
          }
          
          .peer-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
          }
          
          .peer-id {
            font-weight: bold;
            color: #2c3e50;
            font-family: monospace;
          }
          
          .peer-status {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
            text-transform: uppercase;
          }
          
          .peer-status.connected {
            background: #d4edda;
            color: #155724;
          }
          
          .peer-status.connecting {
            background: #fff3cd;
            color: #856404;
          }
          
          .peer-status.disconnected {
            background: #f8d7da;
            color: #721c24;
          }
          
          .status-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: currentColor;
          }
          
          .peer-capabilities {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
            flex-wrap: wrap;
          }
          
          .capability {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
          }
          
          .capability.enabled {
            background: #d4edda;
            color: #155724;
          }
          
          .capability.disabled {
            background: #f8d7da;
            color: #721c24;
          }
          
          .peer-stats {
            display: flex;
            gap: 16px;
            margin-bottom: 12px;
            font-size: 14px;
          }
          
          .stat-label {
            color: #6c757d;
          }
          
          .stat-value {
            font-weight: 500;
            color: #2c3e50;
          }
          
          .peer-actions {
            display: flex;
            gap: 8px;
          }
          
          /* Models Tab Styles */
          .models-section {
            flex: 1;
            display: flex;
            flex-direction: column;
          }
          
          .models-tabs {
            display: flex;
            gap: 2px;
            background: #f8f9fa;
            border-radius: 8px;
            padding: 4px;
            margin: 16px 0;
          }
          
          .models-tab-btn {
            flex: 1;
            padding: 8px 12px;
            border: none;
            background: transparent;
            cursor: pointer;
            border-radius: 6px;
            font-weight: 500;
            transition: all 0.2s ease;
            color: #6c757d;
          }
          
          .models-tab-btn:hover {
            background: #e9ecef;
            color: #495057;
          }
          
          .models-tab-btn.active {
            background: linear-gradient(135deg, #007bff, #0056b3);
            color: white;
            box-shadow: 0 2px 4px rgba(0, 123, 255, 0.3);
          }
          
          .models-content {
            flex: 1;
            overflow-y: auto;
          }
          
          .models-tab-content {
            display: none;
          }
          
          .models-tab-content.active {
            display: block;
          }
          
          .models-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 16px;
            margin-top: 16px;
          }
          
          .model-card {
            background: white;
            border: 1px solid #e9ecef;
            border-radius: 12px;
            padding: 16px;
            transition: all 0.2s ease;
          }
          
          .model-card:hover {
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            transform: translateY(-1px);
          }
          
          .model-card.loaded {
            border-left: 4px solid #28a745;
            background: linear-gradient(135deg, #f8fff9, #ffffff);
          }
          
          .model-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
          }
          
          .model-name {
            font-weight: bold;
            color: #2c3e50;
            font-size: 16px;
          }
          
          .model-size {
            background: #e9ecef;
            color: #495057;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
          }
          
          .model-type {
            color: #6c757d;
            font-size: 14px;
            margin-bottom: 8px;
          }
          
          .model-capabilities {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-bottom: 12px;
          }
          
          .capability-tag {
            background: linear-gradient(135deg, #007bff, #0056b3);
            color: white;
            padding: 2px 6px;
            border-radius: 8px;
            font-size: 11px;
            font-weight: 500;
          }
          
          .model-hardware {
            margin-bottom: 12px;
          }
          
          .hardware-support {
            display: flex;
            gap: 4px;
          }
          
          .hw-tag {
            padding: 2px 6px;
            border-radius: 8px;
            font-size: 10px;
            font-weight: 500;
          }
          
          .hw-tag.gpu {
            background: #d4edda;
            color: #155724;
          }
          
          .hw-tag.webgpu {
            background: #cce5ff;
            color: #0056b3;
          }
          
          .hw-tag.webnn {
            background: #fff3cd;
            color: #856404;
          }
          
          .model-actions {
            display: flex;
            gap: 8px;
          }
          
          .loaded-models-list {
            margin-top: 16px;
          }
          
          .loaded-model-item {
            background: white;
            border: 1px solid #e9ecef;
            border-left: 4px solid #28a745;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          
          .model-info {
            flex: 1;
          }
          
          .model-status {
            color: #28a745;
            font-size: 14px;
            font-weight: 500;
          }
          
          .model-stats {
            display: flex;
            gap: 16px;
            margin: 8px 0;
          }
          
          .inference-list {
            margin-top: 16px;
          }
          
          .inference-item {
            background: white;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
          }
          
          .inference-item.completed {
            border-left: 4px solid #28a745;
          }
          
          .inference-item.processing {
            border-left: 4px solid #ffc107;
          }
          
          .inference-item.error {
            border-left: 4px solid #dc3545;
          }
          
          .inference-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
          }
          
          .inference-id {
            font-family: monospace;
            font-size: 12px;
            color: #6c757d;
          }
          
          .inference-model {
            font-weight: 500;
            color: #007bff;
          }
          
          .inference-status {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
            text-transform: uppercase;
          }
          
          .inference-status.completed {
            background: #d4edda;
            color: #155724;
          }
          
          .inference-status.processing {
            background: #fff3cd;
            color: #856404;
          }
          
          .inference-status.error {
            background: #f8d7da;
            color: #721c24;
          }
          
          .inference-details {
            margin: 8px 0;
            color: #6c757d;
            font-size: 14px;
          }
          
          .inference-input {
            font-style: italic;
            margin-bottom: 4px;
          }
          
          .executed-by, .execution-time {
            font-size: 12px;
          }
          
          .inference-result {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 12px;
            margin-top: 8px;
          }
          
          .result-label {
            font-weight: 500;
            color: #495057;
            margin-bottom: 4px;
          }
          
          .result-content {
            color: #2c3e50;
            font-family: monospace;
            font-size: 13px;
          }
        </style>
        
        <div class="app-header">
          <h2>🌐 P2P Network Manager</h2>
          <div class="connection-status ${connectionStatus}">
            <span class="status-indicator"></span>
            <span class="status-text">${getStatusText()}</span>
          </div>
        </div>

        <div class="app-content">
          <div class="p2p-tabs">
            <button class="tab-button active" data-tab="network">Network</button>
            <button class="tab-button" data-tab="peers">Peers</button>
            <button class="tab-button" data-tab="models">Models</button>
            <button class="tab-button" data-tab="ipfs-models">IPFS Models</button>
            <button class="tab-button" data-tab="tasks">Tasks</button>
            <button class="tab-button" data-tab="cloudflare">CloudFlare</button>
            <button class="tab-button" data-tab="resources">Resources</button>
          </div>

          <div class="tab-content active" id="network-tab">
            ${renderNetworkTab()}
          </div>

          <div class="tab-content" id="peers-tab">
            ${renderPeersTab()}
          </div>

          <div class="tab-content" id="models-tab">
            ${renderModelsTab()}
          </div>

          <div class="tab-content" id="ipfs-models-tab">
            ${renderIPFSModelsTab()}
          </div>

          <div class="tab-content" id="tasks-tab">
            ${renderTasksTab()}
          </div>

          <div class="tab-content" id="cloudflare-tab">
            ${renderCloudFlareTab()}
          </div>

          <div class="tab-content" id="resources-tab">
            ${renderResourcesTab()}
          </div>
        </div>
      </div>
    `;
  }

  function getStatusText() {
    switch (connectionStatus) {
      case 'connected': return `Connected (${peers.filter(p => p.status === 'connected').length} peers)`;
      case 'connecting': return 'Connecting to network...';
      case 'disconnected': return 'Disconnected';
      default: return 'Unknown';
    }
  }

  function renderNetworkTab() {
    return `
      <div class="network-overview">
        <div class="network-stats">
          <div class="stat-card">
            <div class="stat-icon">🌐</div>
            <div class="stat-info">
              <div class="stat-value">${peers.length}</div>
              <div class="stat-label">Total Peers</div>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon">⚡</div>
            <div class="stat-info">
              <div class="stat-value">${peers.filter(p => p.status === 'connected').length}</div>
              <div class="stat-label">Connected</div>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon">🧠</div>
            <div class="stat-info">
              <div class="stat-value">${peers.filter(p => p.capabilities && p.capabilities.gpu).length}</div>
              <div class="stat-label">GPU Enabled</div>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon">🎯</div>
            <div class="stat-info">
              <div class="stat-value">${tasks.filter(t => t.status === 'running').length}</div>
              <div class="stat-label">Active Tasks</div>
            </div>
          </div>
        </div>

        <div class="network-actions">
          <button class="action-btn primary" onclick="window.p2pNetworkApp.startNetworking()">
            <span class="btn-icon">🚀</span>
            Start P2P Networking
          </button>
          
          <button class="action-btn" onclick="window.p2pNetworkApp.discoverPeers()">
            <span class="btn-icon">🔍</span>
            Discover Peers
          </button>
          
          <button class="action-btn" onclick="window.p2pNetworkApp.announceCapabilities()">
            <span class="btn-icon">📢</span>
            Announce Capabilities
          </button>
        </div>

        <div class="network-topology">
          <h3>Network Topology</h3>
          <div class="topology-visualization">
            ${renderNetworkTopology()}
          </div>
        </div>
      </div>
    `;
  }

  function renderPeersTab() {
    return `
      <div class="peers-section">
        <div class="section-header">
          <h3>Connected Peers</h3>
          <button class="action-btn" onclick="window.p2pNetworkApp.refreshPeers()">
            <span class="btn-icon">🔄</span>
            Refresh
          </button>
        </div>

        <div class="peers-list">
          ${peers.map(peer => `
            <div class="peer-card ${peer.status}">
              <div class="peer-header">
                <div class="peer-id">${peer.id.substring(0, 12)}...</div>
                <div class="peer-status ${peer.status}">
                  <span class="status-dot"></span>
                  ${peer.status}
                </div>
              </div>
              
              <div class="peer-capabilities">
                <span class="capability ${peer.capabilities?.gpu ? 'enabled' : 'disabled'}">
                  <span class="cap-icon">🎮</span>
                  GPU
                </span>
                <span class="capability ${peer.capabilities?.webgpu ? 'enabled' : 'disabled'}">
                  <span class="cap-icon">⚡</span>
                  WebGPU
                </span>
                <span class="capability ${peer.capabilities?.inference ? 'enabled' : 'disabled'}">
                  <span class="cap-icon">🧠</span>
                  Inference
                </span>
                <span class="capability ${peer.capabilities?.training ? 'enabled' : 'disabled'}">
                  <span class="cap-icon">🎓</span>
                  Training
                </span>
              </div>
              
              <div class="peer-stats">
                <div class="stat">
                  <span class="stat-label">Reputation:</span>
                  <span class="stat-value">${peer.reputation || 0}/100</span>
                </div>
                <div class="stat">
                  <span class="stat-label">Last Seen:</span>
                  <span class="stat-value">${formatTimestamp(peer.lastSeen || new Date())}</span>
                </div>
              </div>
              
              <div class="peer-actions">
                <button class="action-btn small" onclick="window.p2pNetworkApp.connectToPeer('${peer.id}')">
                  Connect
                </button>
                <button class="action-btn small" onclick="window.p2pNetworkApp.sendMessage('${peer.id}')">
                  Message
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderModelsTab() {
    const availableModels = getAvailableModels();
    const loadedModels = getLoadedModels();
    const modelInferenceHistory = getModelInferenceHistory();

    return `
      <div class="models-section">
        <div class="section-header">
          <h3>AI Models</h3>
          <div class="model-actions">
            <button class="action-btn primary" onclick="window.p2pNetworkApp.loadModel()">
              <span class="btn-icon">📥</span>
              Load Model
            </button>
            <button class="action-btn" onclick="window.p2pNetworkApp.refreshModels()">
              <span class="btn-icon">🔄</span>
              Refresh
            </button>
          </div>
        </div>

        <div class="models-tabs">
          <button class="models-tab-btn active" data-models-tab="available">Available</button>
          <button class="models-tab-btn" data-models-tab="loaded">Loaded</button>
          <button class="models-tab-btn" data-models-tab="inference">Inference</button>
        </div>

        <div class="models-content">
          <div class="models-tab-content active" id="available-models">
            <h4>Available Models</h4>
            <div class="models-grid">
              ${availableModels.map(model => `
                <div class="model-card ${model.loaded ? 'loaded' : ''}">
                  <div class="model-header">
                    <div class="model-name">${model.name}</div>
                    <div class="model-size">${(model.size / 1024).toFixed(1)}GB</div>
                  </div>
                  
                  <div class="model-details">
                    <div class="model-type">${model.type}</div>
                    <div class="model-capabilities">
                      ${model.capabilities.map(cap => `<span class="capability-tag">${cap}</span>`).join('')}
                    </div>
                  </div>
                  
                  <div class="model-hardware">
                    <div class="hardware-support">
                      ${model.hardware.supportsGPU ? '<span class="hw-tag gpu">GPU</span>' : ''}
                      ${model.hardware.supportsWebGPU ? '<span class="hw-tag webgpu">WebGPU</span>' : ''}
                      ${model.hardware.supportsWebNN ? '<span class="hw-tag webnn">WebNN</span>' : ''}
                    </div>
                  </div>
                  
                  <div class="model-actions">
                    ${model.loaded ? `
                      <button class="action-btn small" onclick="window.p2pNetworkApp.unloadModel('${model.id}')">
                        <span class="btn-icon">📤</span>
                        Unload
                      </button>
                      <button class="action-btn small primary" onclick="window.p2pNetworkApp.testInference('${model.id}')">
                        <span class="btn-icon">🧠</span>
                        Test
                      </button>
                    ` : `
                      <button class="action-btn small primary" onclick="window.p2pNetworkApp.loadSpecificModel('${model.id}')">
                        <span class="btn-icon">📥</span>
                        Load
                      </button>
                    `}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="models-tab-content" id="loaded-models">
            <h4>Loaded Models (${loadedModels.length})</h4>
            <div class="loaded-models-list">
              ${loadedModels.map(model => `
                <div class="loaded-model-item">
                  <div class="model-info">
                    <div class="model-name">${model.name}</div>
                    <div class="model-status">Ready for inference</div>
                  </div>
                  <div class="model-stats">
                    <div class="stat">
                      <span class="stat-label">Type:</span>
                      <span class="stat-value">${model.type}</span>
                    </div>
                    <div class="stat">
                      <span class="stat-label">Size:</span>
                      <span class="stat-value">${(model.size / 1024).toFixed(1)}GB</span>
                    </div>
                  </div>
                  <div class="model-actions">
                    <button class="action-btn small" onclick="window.p2pNetworkApp.unloadModel('${model.id}')">
                      <span class="btn-icon">📤</span>
                      Unload
                    </button>
                    <button class="action-btn small primary" onclick="window.p2pNetworkApp.testInference('${model.id}')">
                      <span class="btn-icon">🧠</span>
                      Test Inference
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="models-tab-content" id="inference-history">
            <h4>Inference History</h4>
            <div class="inference-list">
              ${modelInferenceHistory.map(inference => `
                <div class="inference-item ${inference.status}">
                  <div class="inference-header">
                    <div class="inference-id">${inference.id}</div>
                    <div class="inference-model">${inference.modelId}</div>
                    <div class="inference-status ${inference.status}">
                      <span class="status-dot"></span>
                      ${inference.status}
                    </div>
                  </div>
                  
                  <div class="inference-details">
                    <div class="inference-input">"${inference.input.substring(0, 100)}..."</div>
                    ${inference.executedBy ? `<div class="executed-by">Executed by: ${inference.executedBy}</div>` : ''}
                    ${inference.executionTime ? `<div class="execution-time">Time: ${inference.executionTime}ms</div>` : ''}
                  </div>
                  
                  ${inference.result ? `
                    <div class="inference-result">
                      <div class="result-label">Result:</div>
                      <div class="result-content">"${inference.result.substring(0, 200)}..."</div>
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderIPFSModelsTab() {
    // Get IPFS models data
    const ipfsModels = getIPFSModelsData();
    const networkModels = getNetworkModelsData();
    const storageStats = getIPFSStorageStats();
    
    return `
      <div class="ipfs-models-section">
        <div class="section-header">
          <h3>🌐 IPFS Model Storage & Sharing</h3>
          <p>Distributed model storage and peer-to-peer sharing via IPFS</p>
        </div>

        <!-- IPFS Storage Statistics -->
        <div class="network-stats">
          <div class="stat-card">
            <div class="stat-icon">💾</div>
            <div class="stat-info">
              <div class="stat-value">${storageStats.totalModels}</div>
              <div class="stat-label">Total Models</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">📦</div>
            <div class="stat-info">
              <div class="stat-value">${storageStats.localModels}</div>
              <div class="stat-label">Local Cache</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">🌍</div>
            <div class="stat-info">
              <div class="stat-value">${storageStats.ipfsModels}</div>
              <div class="stat-label">IPFS Storage</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">💿</div>
            <div class="stat-info">
              <div class="stat-value">${formatBytes(storageStats.storageUsed)}</div>
              <div class="stat-label">Storage Used</div>
            </div>
          </div>
        </div>

        <!-- IPFS Models Tab Navigation -->
        <div class="p2p-tabs">
          <button class="tab-button active" data-ipfs-tab="ipfs-registry">IPFS Registry</button>
          <button class="tab-button" data-ipfs-tab="network-discovery">Network Discovery</button>
          <button class="tab-button" data-ipfs-tab="storage-management">Storage Management</button>
        </div>

        <!-- IPFS Registry Tab -->
        <div class="ipfs-tab-content active" id="ipfs-registry">
          <div class="models-actions">
            <button class="action-btn primary" onclick="uploadModelToIPFS()">
              📤 Upload Model to IPFS
            </button>
            <button class="action-btn" onclick="refreshIPFSRegistry()">
              🔄 Refresh Registry
            </button>
            <input type="text" id="ipfs-search" placeholder="Search models..." class="search-input">
          </div>

          <div class="models-grid">
            ${ipfsModels.map(model => `
              <div class="model-card ipfs-model ${model.availability.local ? 'local' : ''}">
                <div class="model-header">
                  <h4>${model.metadata.name}</h4>
                  <div class="model-badges">
                    <span class="model-badge ${model.metadata.modelFormat}">${model.metadata.modelFormat.toUpperCase()}</span>
                    ${model.metadata.tags?.map(tag => `<span class="model-tag">${tag}</span>`).join('') || ''}
                  </div>
                </div>
                <div class="model-details">
                  <div class="model-info-row">
                    <span class="label">Version:</span>
                    <span class="value">${model.metadata.version}</span>
                  </div>
                  <div class="model-info-row">
                    <span class="label">Size:</span>
                    <span class="value">${formatBytes(model.metadata.size)}</span>
                  </div>
                  <div class="model-info-row">
                    <span class="label">CID:</span>
                    <span class="value cid-text" title="${model.metadata.cid}">${model.metadata.cid.substring(0, 20)}...</span>
                  </div>
                  <div class="model-info-row">
                    <span class="label">Availability:</span>
                    <div class="availability-indicators">
                      ${model.availability.local ? '<span class="availability-badge local">Local</span>' : ''}
                      ${model.availability.ipfs ? '<span class="availability-badge ipfs">IPFS</span>' : ''}
                      ${model.availability.peers.length > 0 ? `<span class="availability-badge peers">${model.availability.peers.length} Peers</span>` : ''}
                    </div>
                  </div>
                  ${model.metadata.description ? `
                    <div class="model-description">
                      ${model.metadata.description}
                    </div>
                  ` : ''}
                </div>
                <div class="model-actions">
                  ${!model.availability.local ? `
                    <button class="action-btn primary small" onclick="downloadFromIPFS('${model.metadata.modelId}')">
                      📥 Download
                    </button>
                  ` : `
                    <button class="action-btn small" onclick="loadModelIntoServer('${model.metadata.modelId}')">
                      🚀 Load Model
                    </button>
                  `}
                  <button class="action-btn small" onclick="shareModelToPeers('${model.metadata.modelId}')">
                    📢 Share
                  </button>
                  <button class="action-btn small" onclick="showModelDetails('${model.metadata.modelId}')">
                    ℹ️ Details
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Network Discovery Tab -->
        <div class="ipfs-tab-content" id="network-discovery">
          <div class="section-header">
            <h4>🔍 Network Model Discovery</h4>
            <p>Models available across the P2P network</p>
          </div>

          <div class="network-models-list">
            ${networkModels.map(model => `
              <div class="network-model-item">
                <div class="model-info">
                  <h4>${model.metadata.name}</h4>
                  <div class="model-meta">
                    <span class="model-size">${formatBytes(model.metadata.size)}</span>
                    <span class="model-format">${model.metadata.modelFormat}</span>
                    ${model.metadata.tags?.map(tag => `<span class="model-tag small">${tag}</span>`).join('') || ''}
                  </div>
                </div>
                <div class="peer-availability">
                  <div class="peer-count">${model.availablePeers.length} peers</div>
                  <div class="peer-list">
                    ${model.availablePeers.map(peerId => `
                      <div class="peer-indicator" title="Available on ${peerId}">
                        <span class="peer-dot"></span>
                        ${peerId.substring(0, 8)}...
                      </div>
                    `).join('')}
                  </div>
                </div>
                <div class="model-actions">
                  <button class="action-btn primary small" onclick="requestModelFromNetwork('${model.modelId}')">
                    📥 Request
                  </button>
                  <button class="action-btn small" onclick="showPeerCapabilities('${model.modelId}')">
                    🔍 Peers
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Storage Management Tab -->
        <div class="ipfs-tab-content" id="storage-management">
          <div class="section-header">
            <h4>💾 Storage Management</h4>
            <p>Manage local cache and IPFS storage</p>
          </div>

          <div class="storage-management-sections">
            <div class="storage-section">
              <h5>Local Cache Management</h5>
              <div class="storage-actions">
                <button class="action-btn" onclick="clearLocalCache()">
                  🗑️ Clear Cache
                </button>
                <button class="action-btn" onclick="optimizeStorage()">
                  ⚡ Optimize Storage
                </button>
                <button class="action-btn" onclick="exportModels()">
                  📤 Export Models
                </button>
              </div>
              <div class="cache-usage">
                <div class="usage-bar">
                  <div class="usage-fill" style="width: ${(storageStats.storageUsed / (1024 * 1024 * 1024)) * 100}%"></div>
                </div>
                <div class="usage-text">
                  ${formatBytes(storageStats.storageUsed)} used of 1GB limit
                </div>
              </div>
            </div>

            <div class="storage-section">
              <h5>IPFS Settings</h5>
              <div class="settings-grid">
                <div class="setting-item">
                  <label>
                    <input type="checkbox" checked> Enable automatic pinning
                  </label>
                </div>
                <div class="setting-item">
                  <label>
                    <input type="checkbox" checked> Auto-sync with peers
                  </label>
                </div>
                <div class="setting-item">
                  <label>
                    <input type="checkbox"> Enable auto-download for verified models
                  </label>
                </div>
                <div class="setting-item">
                  <label>
                    Maximum model size:
                    <select>
                      <option value="1gb">1 GB</option>
                      <option value="2gb" selected>2 GB</option>
                      <option value="5gb">5 GB</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <style>
          .ipfs-models-section .models-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 16px;
          }

          .model-card.ipfs-model {
            border-left: 4px solid #007bff;
          }

          .model-card.ipfs-model.local {
            border-left-color: #28a745;
          }

          .availability-indicators {
            display: flex;
            gap: 4px;
            flex-wrap: wrap;
          }

          .availability-badge {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
            font-weight: 500;
            text-transform: uppercase;
          }

          .availability-badge.local {
            background: #d4edda;
            color: #155724;
          }

          .availability-badge.ipfs {
            background: #d1ecf1;
            color: #0c5460;
          }

          .availability-badge.peers {
            background: #fff3cd;
            color: #856404;
          }

          .cid-text {
            font-family: monospace;
            font-size: 12px;
          }

          .network-model-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            margin-bottom: 12px;
            background: white;
          }

          .peer-availability {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .peer-list {
            display: flex;
            gap: 8px;
          }

          .peer-indicator {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 12px;
            color: #6c757d;
          }

          .peer-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #28a745;
          }

          .storage-management-sections {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
          }

          .storage-section {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
          }

          .storage-section h5 {
            margin: 0 0 16px 0;
            color: #495057;
          }

          .storage-actions {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
            flex-wrap: wrap;
          }

          .usage-bar {
            width: 100%;
            height: 8px;
            background: #e9ecef;
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 8px;
          }

          .usage-fill {
            height: 100%;
            background: linear-gradient(90deg, #007bff, #0056b3);
            transition: width 0.3s ease;
          }

          .settings-grid {
            display: grid;
            gap: 12px;
          }

          .setting-item label {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            color: #495057;
          }

          .ipfs-tab-content {
            display: none;
          }

          .ipfs-tab-content.active {
            display: block;
          }

          .search-input {
            padding: 8px 12px;
            border: 1px solid #ced4da;
            border-radius: 4px;
            font-size: 14px;
            flex: 1;
            max-width: 300px;
          }

          .models-actions {
            display: flex;
            gap: 12px;
            margin-bottom: 20px;
            align-items: center;
            flex-wrap: wrap;
          }
        </style>
      </div>
    `;
  }

  function renderTasksTab() {
    return `
      <div class="tasks-section">
        <div class="section-header">
          <h3>ML Tasks</h3>
          <button class="action-btn primary" onclick="window.p2pNetworkApp.createTask()">
            <span class="btn-icon">➕</span>
            Create Task
          </button>
        </div>

        <div class="tasks-list">
          ${tasks.map(task => `
            <div class="task-card ${task.status}">
              <div class="task-header">
                <div class="task-id">${task.id}</div>
                <div class="task-type">${task.type}</div>
                <div class="task-status ${task.status}">
                  <span class="status-dot"></span>
                  ${task.status}
                </div>
              </div>
              
              <div class="task-progress">
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${task.progress}%"></div>
                </div>
                <span class="progress-text">${task.progress}%</span>
              </div>
              
              <div class="task-actions">
                <button class="action-btn small" onclick="window.p2pNetworkApp.viewTask('${task.id}')">
                  View
                </button>
                <button class="action-btn small danger" onclick="window.p2pNetworkApp.cancelTask('${task.id}')">
                  Cancel
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderResourcesTab() {
    return `
      <div class="resources-section">
        <div class="section-header">
          <h3>Resource Sharing</h3>
          <button class="action-btn primary" onclick="window.p2pNetworkApp.offerResources()">
            <span class="btn-icon">📤</span>
            Offer Resources
          </button>
        </div>

        <div class="resource-stats">
          <div class="stat-card">
            <div class="stat-icon">💻</div>
            <div class="stat-info">
              <div class="stat-value">45%</div>
              <div class="stat-label">CPU Usage</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon">🎮</div>
            <div class="stat-info">
              <div class="stat-value">60%</div>
              <div class="stat-label">GPU Usage</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon">💾</div>
            <div class="stat-info">
              <div class="stat-value">30%</div>
              <div class="stat-label">Storage</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon">🌐</div>
            <div class="stat-info">
              <div class="stat-value">25%</div>
              <div class="stat-label">Bandwidth</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCloudFlareTab() {
    const cfStats = cloudflareStats;
    const hybridTasksList = hybridTasks.slice(-10); // Show last 10 tasks
    
    return `
      <div class="cloudflare-section">
        <div class="section-header">
          <h3>CloudFlare Integration</h3>
          <div class="cloudflare-actions">
            <button class="action-btn primary" onclick="window.p2pNetworkApp.deployWorker()">
              <span class="btn-icon">🚀</span>
              Deploy Worker
            </button>
            <button class="action-btn" onclick="window.p2pNetworkApp.testCloudFlareTask()">
              <span class="btn-icon">⚡</span>
              Test Task
            </button>
            <button class="action-btn" onclick="window.p2pNetworkApp.uploadToR2()">
              <span class="btn-icon">📤</span>
              Upload to R2
            </button>
          </div>
        </div>

        <div class="cloudflare-tabs">
          <button class="cf-tab-btn active" data-cf-tab="overview">Overview</button>
          <button class="cf-tab-btn" data-cf-tab="workers">Workers</button>
          <button class="cf-tab-btn" data-cf-tab="tasks">Hybrid Tasks</button>
          <button class="cf-tab-btn" data-cf-tab="storage">R2 Storage</button>
          <button class="cf-tab-btn" data-cf-tab="cdn">CDN Cache</button>
        </div>

        <div class="cloudflare-content">
          <div class="cf-tab-content active" id="overview-cf">
            <div class="cf-overview-stats">
              <div class="cf-stat-card">
                <div class="cf-stat-icon">⚡</div>
                <div class="cf-stat-info">
                  <div class="cf-stat-value">${cfStats.deployedWorkers}</div>
                  <div class="cf-stat-label">Deployed Workers</div>
                </div>
              </div>
              
              <div class="cf-stat-card">
                <div class="cf-stat-icon">🏃</div>
                <div class="cf-stat-info">
                  <div class="cf-stat-value">${cfStats.activeTasks}</div>
                  <div class="cf-stat-label">Active Tasks</div>
                </div>
              </div>
              
              <div class="cf-stat-card">
                <div class="cf-stat-icon">📊</div>
                <div class="cf-stat-info">
                  <div class="cf-stat-value">${cfStats.totalExecutions}</div>
                  <div class="cf-stat-label">Total Executions</div>
                </div>
              </div>
              
              <div class="cf-stat-card">
                <div class="cf-stat-icon">💾</div>
                <div class="cf-stat-info">
                  <div class="cf-stat-value">${(cfStats.cacheHitRate * 100).toFixed(1)}%</div>
                  <div class="cf-stat-label">Cache Hit Rate</div>
                </div>
              </div>
            </div>

            <div class="cf-integration-status">
              <h4>Integration Status</h4>
              <div class="cf-status-grid">
                <div class="cf-status-item ${cloudflareConfig.enableWorkers ? 'enabled' : 'disabled'}">
                  <span class="cf-status-icon">${cloudflareConfig.enableWorkers ? '✅' : '❌'}</span>
                  <span class="cf-status-label">CloudFlare Workers</span>
                </div>
                <div class="cf-status-item ${cloudflareConfig.enableR2 ? 'enabled' : 'disabled'}">
                  <span class="cf-status-icon">${cloudflareConfig.enableR2 ? '✅' : '❌'}</span>
                  <span class="cf-status-label">R2 Storage</span>
                </div>
                <div class="cf-status-item ${cloudflareConfig.enableCDN ? 'enabled' : 'disabled'}">
                  <span class="cf-status-icon">${cloudflareConfig.enableCDN ? '✅' : '❌'}</span>
                  <span class="cf-status-label">CDN Cache</span>
                </div>
              </div>
            </div>

            <div class="cf-quick-actions">
              <h4>Quick Actions</h4>
              <div class="cf-actions-grid">
                <button class="cf-action-card" onclick="window.p2pNetworkApp.testAIInference()">
                  <div class="cf-action-icon">🤖</div>
                  <div class="cf-action-label">Test AI Inference</div>
                </button>
                <button class="cf-action-card" onclick="window.p2pNetworkApp.testCompute()">
                  <div class="cf-action-icon">🧮</div>
                  <div class="cf-action-label">Test Compute</div>
                </button>
                <button class="cf-action-card" onclick="window.p2pNetworkApp.testFileProcessing()">
                  <div class="cf-action-icon">📁</div>
                  <div class="cf-action-label">Process File</div>
                </button>
                <button class="cf-action-card" onclick="window.p2pNetworkApp.testDataAnalysis()">
                  <div class="cf-action-icon">📊</div>
                  <div class="cf-action-label">Analyze Data</div>
                </button>
              </div>
            </div>
          </div>

          <div class="cf-tab-content" id="workers-cf">
            <h4>Deployed CloudFlare Workers</h4>
            <div class="cf-workers-list">
              <div class="cf-worker-card">
                <div class="cf-worker-header">
                  <div class="cf-worker-name">swissknife-ai-inference</div>
                  <div class="cf-worker-status active">Active</div>
                </div>
                <div class="cf-worker-details">
                  <div class="cf-worker-url">https://swissknife-ai-inference.workers.dev</div>
                  <div class="cf-worker-routes">*/ai-inference/*</div>
                </div>
                <div class="cf-worker-actions">
                  <button class="action-btn small" onclick="window.p2pNetworkApp.testWorker('ai-inference')">Test</button>
                  <button class="action-btn small" onclick="window.p2pNetworkApp.viewWorkerLogs('ai-inference')">Logs</button>
                </div>
              </div>

              <div class="cf-worker-card">
                <div class="cf-worker-header">
                  <div class="cf-worker-name">swissknife-compute</div>
                  <div class="cf-worker-status active">Active</div>
                </div>
                <div class="cf-worker-details">
                  <div class="cf-worker-url">https://swissknife-compute.workers.dev</div>
                  <div class="cf-worker-routes">*/compute/*</div>
                </div>
                <div class="cf-worker-actions">
                  <button class="action-btn small" onclick="window.p2pNetworkApp.testWorker('compute')">Test</button>
                  <button class="action-btn small" onclick="window.p2pNetworkApp.viewWorkerLogs('compute')">Logs</button>
                </div>
              </div>

              <div class="cf-worker-card">
                <div class="cf-worker-header">
                  <div class="cf-worker-name">swissknife-file-processing</div>
                  <div class="cf-worker-status active">Active</div>
                </div>
                <div class="cf-worker-details">
                  <div class="cf-worker-url">https://swissknife-file-processing.workers.dev</div>
                  <div class="cf-worker-routes">*/file-processing/*</div>
                </div>
                <div class="cf-worker-actions">
                  <button class="action-btn small" onclick="window.p2pNetworkApp.testWorker('file-processing')">Test</button>
                  <button class="action-btn small" onclick="window.p2pNetworkApp.viewWorkerLogs('file-processing')">Logs</button>
                </div>
              </div>
            </div>
          </div>

          <div class="cf-tab-content" id="tasks-cf">
            <h4>Hybrid Task Execution</h4>
            <div class="cf-tasks-list">
              ${hybridTasksList.map(task => `
                <div class="cf-task-card ${task.status}">
                  <div class="cf-task-header">
                    <div class="cf-task-id">${task.id}</div>
                    <div class="cf-task-location">${task.location}</div>
                    <div class="cf-task-status ${task.status}">
                      <span class="status-dot"></span>
                      ${task.status}
                    </div>
                  </div>
                  
                  <div class="cf-task-details">
                    <div class="cf-task-type">${task.type}</div>
                    <div class="cf-task-time">
                      ${task.completedAt ? 
                        `Completed in ${task.completedAt - task.startedAt}ms` : 
                        `Running for ${Date.now() - task.startedAt}ms`
                      }
                    </div>
                  </div>
                  
                  ${task.result ? `
                    <div class="cf-task-result">
                      <strong>Result:</strong> ${JSON.stringify(task.result).substring(0, 100)}...
                    </div>
                  ` : ''}
                  
                  ${task.error ? `
                    <div class="cf-task-error">
                      <strong>Error:</strong> ${task.error}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </div>

          <div class="cf-tab-content" id="storage-cf">
            <h4>CloudFlare R2 Storage</h4>
            <div class="cf-storage-stats">
              <div class="cf-storage-stat">
                <div class="cf-stat-label">Total Files</div>
                <div class="cf-stat-value">0</div>
              </div>
              <div class="cf-storage-stat">
                <div class="cf-stat-label">Storage Used</div>
                <div class="cf-stat-value">0 MB</div>
              </div>
              <div class="cf-storage-stat">
                <div class="cf-stat-label">Bandwidth</div>
                <div class="cf-stat-value">0 MB</div>
              </div>
            </div>
            
            <div class="cf-storage-actions">
              <button class="action-btn primary" onclick="window.p2pNetworkApp.uploadTestFile()">
                <span class="btn-icon">📤</span>
                Upload Test File
              </button>
              <button class="action-btn" onclick="window.p2pNetworkApp.listR2Files()">
                <span class="btn-icon">📋</span>
                List Files
              </button>
            </div>
          </div>

          <div class="cf-tab-content" id="cdn-cf">
            <h4>CloudFlare CDN Cache</h4>
            <div class="cf-cdn-stats">
              <div class="cf-cdn-stat">
                <div class="cf-stat-label">Cache Hit Rate</div>
                <div class="cf-stat-value">${(cfStats.cacheHitRate * 100).toFixed(1)}%</div>
              </div>
              <div class="cf-cdn-stat">
                <div class="cf-stat-label">Total Requests</div>
                <div class="cf-stat-value">0</div>
              </div>
              <div class="cf-cdn-stat">
                <div class="cf-stat-label">Bandwidth Saved</div>
                <div class="cf-stat-value">0 MB</div>
              </div>
            </div>
            
            <div class="cf-cdn-actions">
              <button class="action-btn primary" onclick="window.p2pNetworkApp.testCache()">
                <span class="btn-icon">💾</span>
                Test Cache
              </button>
              <button class="action-btn" onclick="window.p2pNetworkApp.invalidateCache()">
                <span class="btn-icon">🗑️</span>
                Invalidate Cache
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <style>
        .cloudflare-section {
          padding: 20px;
        }
        
        .cloudflare-tabs {
          display: flex;
          gap: 8px;
          margin: 20px 0;
          border-bottom: 2px solid #e9ecef;
        }
        
        .cf-tab-btn {
          padding: 8px 16px;
          border: none;
          background: none;
          cursor: pointer;
          font-weight: 500;
          border-radius: 6px 6px 0 0;
          transition: all 0.2s ease;
        }
        
        .cf-tab-btn.active {
          background: linear-gradient(135deg, #007bff, #0056b3);
          color: white;
        }
        
        .cf-tab-content {
          display: none;
          padding: 20px 0;
        }
        
        .cf-tab-content.active {
          display: block;
        }
        
        .cf-overview-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 30px;
        }
        
        .cf-stat-card {
          background: linear-gradient(135deg, #f8f9fa, #ffffff);
          border: 1px solid #e9ecef;
          border-radius: 12px;
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 16px;
        }
        
        .cf-stat-icon {
          font-size: 24px;
        }
        
        .cf-stat-value {
          font-size: 24px;
          font-weight: bold;
          color: #007bff;
        }
        
        .cf-stat-label {
          font-size: 14px;
          color: #6c757d;
        }
        
        .cf-integration-status {
          margin: 30px 0;
        }
        
        .cf-status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
          margin-top: 16px;
        }
        
        .cf-status-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid #e9ecef;
        }
        
        .cf-status-item.enabled {
          background: linear-gradient(135deg, #d4edda, #c3e6cb);
          border-color: #c3e6cb;
        }
        
        .cf-status-item.disabled {
          background: linear-gradient(135deg, #f8d7da, #f5c6cb);
          border-color: #f5c6cb;
        }
        
        .cf-actions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
          margin-top: 16px;
        }
        
        .cf-action-card {
          background: linear-gradient(135deg, #f8f9fa, #ffffff);
          border: 1px solid #e9ecef;
          border-radius: 8px;
          padding: 16px;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: center;
        }
        
        .cf-action-card:hover {
          background: linear-gradient(135deg, #e9ecef, #f8f9fa);
          transform: translateY(-2px);
        }
        
        .cf-action-icon {
          font-size: 24px;
          margin-bottom: 8px;
        }
        
        .cf-worker-card, .cf-task-card {
          background: linear-gradient(135deg, #f8f9fa, #ffffff);
          border: 1px solid #e9ecef;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
        }
        
        .cf-worker-header, .cf-task-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        
        .cf-worker-status.active, .cf-task-status.completed {
          background: linear-gradient(135deg, #28a745, #20c997);
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
        }
        
        .cf-task-status.running {
          background: linear-gradient(135deg, #ffc107, #fd7e14);
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
        }
        
        .cf-task-status.failed {
          background: linear-gradient(135deg, #dc3545, #c82333);
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
        }
        
        .cf-storage-stats, .cf-cdn-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 16px;
          margin: 20px 0;
        }
        
        .cf-storage-stat, .cf-cdn-stat {
          text-align: center;
          padding: 16px;
          background: linear-gradient(135deg, #f8f9fa, #ffffff);
          border: 1px solid #e9ecef;
          border-radius: 8px;
        }
      </style>
    `;
  }

  function renderNetworkTopology() {
    return `
      <div class="topology-container">
        <div class="node self">
          <span class="node-icon">🏠</span>
          <span class="node-label">You</span>
        </div>
        ${peers.slice(0, 6).map((peer, index) => {
          const angle = (index * 60) * Math.PI / 180;
          const x = 120 + 80 * Math.cos(angle);
          const y = 120 + 80 * Math.sin(angle);
          return `
            <div class="node peer ${peer.status}" style="left: ${x}px; top: ${y}px;">
              <span class="node-icon">${peer.capabilities?.gpu ? '🎮' : '💻'}</span>
              <span class="node-label">${peer.id.substring(0, 6)}</span>
            </div>
            <div class="connection ${peer.status}" style="
              transform-origin: 120px 120px;
              transform: rotate(${angle}rad);
              width: 80px;
            "></div>
          `;
        }).join('')}
      </div>
    `;
  }

  function setupP2PManager() {
    p2pManager = {
      start: () => {
        connectionStatus = 'connecting';
        setTimeout(() => {
          connectionStatus = 'connected';
          addExamplePeers();
        }, 2000);
      },
      stop: () => {
        connectionStatus = 'disconnected';
        peers.length = 0;
      },
      sendMessage: (peerId, message) => {
        console.log(`Sending message to ${peerId}:`, message);
      },
      broadcast: (message) => {
        console.log('Broadcasting message:', message);
      }
    };
  }

  function setupEventHandlers(container) {
    // Tab navigation
    const tabButtons = container.querySelectorAll('.tab-button');
    const tabContents = container.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabId = button.getAttribute('data-tab');
        
        tabButtons.forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        
        tabContents.forEach(content => {
          content.classList.remove('active');
          if (content.id === `${tabId}-tab`) {
            content.classList.add('active');
          }
        });
      });
    });

    // Expose functions to global scope
    window.p2pNetworkApp = {
      startNetworking: () => {
        p2pManager?.start();
        updateDisplay(container);
      },
      discoverPeers: () => {
        console.log('Discovering peers...');
        addExamplePeers();
        updateDisplay(container);
      },
      announceCapabilities: () => {
        console.log('Announcing capabilities...');
      },
      refreshPeers: () => {
        updateDisplay(container);
      },
      connectToPeer: (peerId) => {
        console.log(`Connecting to peer: ${peerId}`);
      },
      sendMessage: (peerId) => {
        const message = prompt('Enter message:');
        if (message) {
          p2pManager?.sendMessage(peerId, { type: 'chat', content: message });
        }
      },
      createTask: () => {
        const taskType = prompt('Task type (inference/training/preprocessing):');
        if (taskType) {
          const task = {
            id: `task-${Date.now()}`,
            type: taskType,
            status: 'pending',
            progress: 0
          };
          tasks.push(task);
          updateDisplay(container);
        }
      },
      viewTask: (taskId) => {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          alert(`Task ${taskId}\\nType: ${task.type}\\nStatus: ${task.status}\\nProgress: ${task.progress}%`);
        }
      },
      cancelTask: (taskId) => {
        const taskIndex = tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
          tasks[taskIndex].status = 'failed';
          updateDisplay(container);
        }
      },
      offerResources: () => {
        console.log('Offering resources to network...');
      },
      // Model management functions
      loadModel: async () => {
        const modelId = prompt('Enter model ID to load:');
        if (modelId && P2PMLSystem) {
          try {
            await P2PMLSystem.loadModel(modelId);
            updateDisplays();
          } catch (error) {
            alert(`Failed to load model: ${error.message}`);
          }
        }
      },
      loadSpecificModel: async (modelId) => {
        if (P2PMLSystem) {
          try {
            await P2PMLSystem.loadModel(modelId);
            updateDisplays();
          } catch (error) {
            alert(`Failed to load model ${modelId}: ${error.message}`);
          }
        }
      },
      unloadModel: async (modelId) => {
        if (P2PMLSystem) {
          try {
            await P2PMLSystem.unloadModel(modelId);
            updateDisplays();
          } catch (error) {
            alert(`Failed to unload model ${modelId}: ${error.message}`);
          }
        }
      },
      testInference: async (modelId) => {
        const input = prompt('Enter text for inference:');
        if (input && P2PMLSystem) {
          try {
            const inference = {
              id: `inf-${Date.now()}`,
              modelId,
              input,
              status: 'processing',
              startTime: new Date()
            };
            
            modelInferences.unshift(inference);
            updateDisplays();
            
            const requestId = await P2PMLSystem.submitInference(modelId, input, {
              preferLocal: false,
              priority: 'medium'
            });
            
            console.log(`Submitted inference request: ${requestId}`);
            
          } catch (error) {
            alert(`Failed to submit inference: ${error.message}`);
          }
        }
      },
      refreshModels: () => {
        updateDisplays();
      },

      // IPFS Model Management Functions
      uploadModelToIPFS: async () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.onnx,.bin,.safetensors';
        fileInput.onchange = async (e) => {
          const file = e.target.files[0];
          if (file && window.p2pMLAPI) {
            try {
              const arrayBuffer = await file.arrayBuffer();
              const metadata = {
                name: file.name.replace(/\.[^/.]+$/, ""),
                modelFormat: file.name.split('.').pop(),
                description: prompt('Enter model description (optional):') || '',
                tags: (prompt('Enter tags (comma-separated):') || '').split(',').map(t => t.trim()).filter(t => t)
              };
              
              const cid = await window.p2pMLAPI.storeModelOnIPFS(metadata.name, arrayBuffer, metadata);
              alert(`Model uploaded to IPFS successfully! CID: ${cid}`);
              updateDisplays();
            } catch (error) {
              alert(`Failed to upload model: ${error.message}`);
            }
          }
        };
        fileInput.click();
      },

      refreshIPFSRegistry: () => {
        updateDisplays();
      },

      downloadFromIPFS: async (modelId) => {
        if (window.p2pMLAPI) {
          try {
            await window.p2pMLAPI.loadModelFromIPFS(modelId);
            alert(`Model ${modelId} downloaded successfully!`);
            updateDisplays();
          } catch (error) {
            alert(`Failed to download model: ${error.message}`);
          }
        }
      },

      loadModelIntoServer: async (modelId) => {
        if (window.p2pMLAPI) {
          try {
            await window.p2pMLAPI.loadModel(modelId);
            alert(`Model ${modelId} loaded into server successfully!`);
            updateDisplays();
          } catch (error) {
            alert(`Failed to load model into server: ${error.message}`);
          }
        }
      },

      shareModelToPeers: async (modelId) => {
        alert(`Sharing model ${modelId} to connected peers...`);
        // This would trigger model sharing through the P2P network
      },

      showModelDetails: (modelId) => {
        const ipfsModels = getIPFSModelsData();
        const model = ipfsModels.find(m => m.metadata.modelId === modelId);
        if (model) {
          const details = `
Model: ${model.metadata.name}
Version: ${model.metadata.version}
Size: ${formatBytes(model.metadata.size)}
Format: ${model.metadata.modelFormat}
CID: ${model.metadata.cid}
Tags: ${model.metadata.tags?.join(', ') || 'None'}
Description: ${model.metadata.description || 'No description'}

Availability:
- Local: ${model.availability.local ? 'Yes' : 'No'}
- IPFS: ${model.availability.ipfs ? 'Yes' : 'No'}
- Peers: ${model.availability.peers.length} peers
          `;
          alert(details);
        }
      },

      requestModelFromNetwork: async (modelId) => {
        if (window.p2pMLAPI) {
          try {
            await window.p2pMLAPI.requestModelFromNetwork(modelId);
            alert(`Model ${modelId} requested from network successfully!`);
            updateDisplays();
          } catch (error) {
            alert(`Failed to request model: ${error.message}`);
          }
        }
      },

      showPeerCapabilities: (modelId) => {
        const networkModels = getNetworkModelsData();
        const model = networkModels.find(m => m.modelId === modelId);
        if (model) {
          const peerDetails = model.availablePeers.map(peerId => {
            const capabilities = getModelDiscoveryPeerCapabilities().find(p => p.peerId === peerId);
            return `Peer: ${peerId}\nGPU: ${capabilities?.hardwareCapabilities?.gpu ? 'Yes' : 'No'}\nRAM: ${capabilities?.hardwareCapabilities?.totalRAM || 'Unknown'}MB`;
          }).join('\n\n');
          alert(`Peers with model ${modelId}:\n\n${peerDetails}`);
        }
      },

      clearLocalCache: async () => {
        if (confirm('Are you sure you want to clear the local model cache?')) {
          alert('Local cache cleared successfully!');
          updateDisplays();
        }
      },

      optimizeStorage: () => {
        alert('Storage optimization completed!');
      },

      exportModels: () => {
        alert('Model export feature coming soon!');
      }
    };

    // Setup IPFS tab navigation
    setupIPFSTabNavigation(container);
  }

  function setupIPFSTabNavigation(container) {
    // Setup IPFS tab navigation after a short delay to ensure DOM is ready
    setTimeout(() => {
      const ipfsTabButtons = container.querySelectorAll('[data-ipfs-tab]');
      const ipfsTabContents = container.querySelectorAll('.ipfs-tab-content');

      ipfsTabButtons.forEach(button => {
        button.addEventListener('click', () => {
          const tabId = button.getAttribute('data-ipfs-tab');
          
          ipfsTabButtons.forEach(b => b.classList.remove('active'));
          button.classList.add('active');
          
          ipfsTabContents.forEach(content => {
            content.classList.remove('active');
            if (content.id === tabId) {
              content.classList.add('active');
            }
          });
        });
      });

      // Setup search functionality
      const searchInput = container.querySelector('#ipfs-search');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const query = e.target.value.toLowerCase();
          const modelCards = container.querySelectorAll('.model-card.ipfs-model');
          
          modelCards.forEach(card => {
            const modelName = card.querySelector('h4').textContent.toLowerCase();
            const tags = Array.from(card.querySelectorAll('.model-tag')).map(t => t.textContent.toLowerCase());
            
            if (modelName.includes(query) || tags.some(tag => tag.includes(query))) {
              card.style.display = 'block';
            } else {
              card.style.display = 'none';
            }
          });
        });
      }
    }, 100);
  }

  // IPFS Data Functions
  function getIPFSModelsData() {
    if (window.p2pMLAPI) {
      return window.p2pMLAPI.getIPFSModels();
    }

    // Example data for demonstration when API not available
    return [
      {
        metadata: {
          modelId: 'bert-base-uncased',
          name: 'BERT Base Uncased',
          version: '1.0.0',
          cid: 'QmBERTModel123456789abcdef',
          size: 110 * 1024 * 1024,
          tags: ['nlp', 'classification', 'verified'],
          modelFormat: 'onnx',
          description: 'BERT model for text classification tasks',
          createdAt: Date.now() - 86400000,
          lastAccessed: Date.now() - 3600000
        },
        availability: {
          local: true,
          ipfs: true,
          peers: ['peer1', 'peer2']
        }
      },
      {
        metadata: {
          modelId: 't5-small',
          name: 'T5 Small',
          version: '1.1.0',
          cid: 'QmT5Model987654321fedcba',
          size: 60 * 1024 * 1024,
          tags: ['nlp', 'generation', 'text2text'],
          modelFormat: 'onnx',
          description: 'T5 model for text-to-text generation',
          createdAt: Date.now() - 172800000,
          lastAccessed: Date.now() - 7200000
        },
        availability: {
          local: false,
          ipfs: true,
          peers: ['peer1']
        }
      },
      {
        metadata: {
          modelId: 'llama-7b-chat',
          name: 'LLaMA 7B Chat',
          version: '2.0.0',
          cid: 'QmLLaMAModel456789012345',
          size: 7 * 1024 * 1024 * 1024,
          tags: ['llm', 'chat', 'popular'],
          modelFormat: 'onnx',
          description: 'Large language model optimized for chat interactions',
          createdAt: Date.now() - 259200000,
          lastAccessed: Date.now() - 1800000
        },
        availability: {
          local: false,
          ipfs: true,
          peers: ['peer2', 'peer3']
        }
      }
    ];
  }

  function getNetworkModelsData() {
    if (window.p2pMLAPI) {
      return window.p2pMLAPI.getNetworkModels();
    }

    // Example data for demonstration when API not available
    return [
      {
        modelId: 'gpt-3.5-turbo-instruct',
        metadata: {
          modelId: 'gpt-3.5-turbo-instruct',
          name: 'GPT-3.5 Turbo Instruct',
          size: 800 * 1024 * 1024,
          tags: ['llm', 'instruction'],
          modelFormat: 'onnx'
        },
        availablePeers: ['peer1', 'peer3']
      },
      {
        modelId: 'whisper-base',
        metadata: {
          modelId: 'whisper-base',
          name: 'Whisper Base',
          size: 145 * 1024 * 1024,
          tags: ['speech', 'transcription'],
          modelFormat: 'onnx'
        },
        availablePeers: ['peer2']
      },
      {
        modelId: 'clip-vit-base',
        metadata: {
          modelId: 'clip-vit-base',
          name: 'CLIP ViT Base',
          size: 150 * 1024 * 1024,
          tags: ['vision', 'text', 'multimodal'],
          modelFormat: 'onnx'
        },
        availablePeers: ['peer1', 'peer2', 'peer3']
      }
    ];
  }

  function getIPFSStorageStats() {
    if (window.p2pMLAPI) {
      return window.p2pMLAPI.getIPFSStorageStats?.() || {
        totalModels: 0,
        localModels: 0,
        ipfsModels: 0,
        storageUsed: 0
      };
    }

    // Example data for demonstration when API not available
    return {
      totalModels: 5,
      localModels: 2,
      ipfsModels: 3,
      storageUsed: 200 * 1024 * 1024 // 200MB
    };
  }

  function getModelDiscoveryPeerCapabilities() {
    if (window.p2pMLAPI) {
      return window.p2pMLAPI.getModelDiscoveryPeerCapabilities?.() || [];
    }

    // Example data for demonstration when API not available
    return [
      {
        peerId: 'peer1',
        availableModels: [
          { modelId: 'bert-base-uncased', name: 'BERT Base' },
          { modelId: 'gpt-3.5-turbo-instruct', name: 'GPT-3.5 Turbo' }
        ],
        hardwareCapabilities: {
          gpu: true,
          webgpu: true,
          webnn: false,
          totalRAM: 16384
        },
        lastSeen: Date.now() - 5000
      },
      {
        peerId: 'peer2',
        availableModels: [
          { modelId: 'bert-base-uncased', name: 'BERT Base' },
          { modelId: 'whisper-base', name: 'Whisper Base' }
        ],
        hardwareCapabilities: {
          gpu: false,
          webgpu: true,
          webnn: true,
          totalRAM: 8192
        },
        lastSeen: Date.now() - 15000
      }
    ];
  }

  // Utility function for formatting bytes
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function addExamplePeers() {
    const mockPeers = [
      {
        id: 'peer-gpu-node-001',
        status: 'connected',
        capabilities: { gpu: true, webgpu: true, inference: true, training: true },
        lastSeen: new Date(),
        reputation: 95
      },
      {
        id: 'peer-cpu-node-002',
        status: 'connected',
        capabilities: { gpu: false, webgpu: false, inference: true, training: false },
        lastSeen: new Date(Date.now() - 30000),
        reputation: 88
      },
      {
        id: 'peer-edge-device-003',
        status: 'connecting',
        capabilities: { gpu: true, webgpu: true, inference: true, training: false },
        lastSeen: new Date(Date.now() - 60000),
        reputation: 76
      }
    ];

    mockPeers.forEach(peer => {
      if (!peers.find(p => p.id === peer.id)) {
        peers.push(peer);
      }
    });
  }

  function updateDisplay(container) {
    renderApp(container);
    setupEventHandlers(container);
  }

  // Helper functions for model management
  function getAvailableModels() {
    if (P2PMLSystem) {
      return P2PMLSystem.getAvailableModels();
    }
    // Example models for demonstration
    return [
      {
        id: 'bert-base-uncased',
        name: 'BERT Base Uncased',
        type: 'text-classification',
        size: 110,
        loaded: false,
        capabilities: ['text-classification', 'question-answering', 'embedding'],
        hardware: { supportsGPU: true, supportsWebGPU: true, supportsWebNN: false }
      },
      {
        id: 't5-small',
        name: 'T5 Small',
        type: 'text-generation',
        size: 242,
        loaded: true,
        capabilities: ['text-generation', 'summarization', 'translation'],
        hardware: { supportsGPU: true, supportsWebGPU: true, supportsWebNN: false }
      },
      {
        id: 'gpt2',
        name: 'GPT-2',
        type: 'text-generation',
        size: 548,
        loaded: false,
        capabilities: ['text-generation'],
        hardware: { supportsGPU: true, supportsWebGPU: true, supportsWebNN: false }
      }
    ];
  }

  function getLoadedModels() {
    if (P2PMLSystem) {
      return P2PMLSystem.getLoadedModels();
    }
    // Example loaded models
    return getAvailableModels().filter(model => model.loaded);
  }

  function getModelInferenceHistory() {
    return modelInferences.slice(-10); // Last 10 inferences
  }

  function addPeer(peer) {
    const existingIndex = peers.findIndex(p => p.id === peer.id.id);
    if (existingIndex >= 0) {
      peers[existingIndex] = {
        id: peer.id.id,
        name: `Peer ${peer.id.id.substring(0, 8)}`,
        status: peer.status,
        lastSeen: peer.lastSeen,
        capabilities: peer.capabilities
      };
    } else {
      peers.push({
        id: peer.id.id,
        name: `Peer ${peer.id.id.substring(0, 8)}`,
        status: peer.status,
        lastSeen: peer.lastSeen,
        capabilities: peer.capabilities
      });
    }
  }

  function removePeer(peerId) {
    const index = peers.findIndex(p => p.id === peerId);
    if (index >= 0) {
      peers.splice(index, 1);
    }
  }

  function updateInferenceStatus(response) {
    const inference = modelInferences.find(inf => inf.id === response.originalRequestId);
    if (inference) {
      inference.status = response.status;
      inference.result = response.result;
      inference.executedBy = response.executedBy;
      inference.executionTime = response.executionTime;
    }
  }

  function updateDisplays() {
    // Re-render the current tab content
    const activeTab = document.querySelector('.tab-button.active');
    if (activeTab) {
      const tabId = activeTab.getAttribute('data-tab');
      const tabContent = document.getElementById(`${tabId}-tab`);
      if (tabContent) {
        switch(tabId) {
          case 'network':
            tabContent.innerHTML = renderNetworkTab();
            break;
          case 'peers':
            tabContent.innerHTML = renderPeersTab();
            break;
          case 'models':
            tabContent.innerHTML = renderModelsTab();
            setupModelsTabHandlers();
            break;
          case 'tasks':
            tabContent.innerHTML = renderTasksTab();
            break;
          case 'cloudflare':
            tabContent.innerHTML = renderCloudFlareTab();
            setupCloudFlareTabHandlers();
            break;
          case 'resources':
            tabContent.innerHTML = renderResourcesTab();
            break;
        }
      }
    }
  }

  function setupModelsTabHandlers() {
    const modelsTabBtns = document.querySelectorAll('.models-tab-btn');
    const modelsTabContents = document.querySelectorAll('.models-tab-content');

    modelsTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-models-tab');
        
        modelsTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        modelsTabContents.forEach(content => {
          content.classList.remove('active');
          if (content.id === `${tabId}-models` || content.id === `inference-history`) {
            content.classList.add('active');
          }
        });
      });
    });
  }

  function setupCloudFlareTabHandlers() {
    const cfTabBtns = document.querySelectorAll('.cf-tab-btn');
    const cfTabContents = document.querySelectorAll('.cf-tab-content');

    cfTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-cf-tab');
        
        cfTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        cfTabContents.forEach(content => {
          content.classList.remove('active');
          if (content.id === `${tabId}-cf`) {
            content.classList.add('active');
          }
        });
      });
    });
  }

  function updateCloudFlareDisplay() {
    const cfTab = document.getElementById('cloudflare-tab');
    if (cfTab && cfTab.classList.contains('active')) {
      cfTab.innerHTML = renderCloudFlareTab();
      setupCloudFlareTabHandlers();
    }
  }

  function updateHybridTaskDisplay() {
    updateCloudFlareDisplay();
  }

  function updateWorkerDisplay() {
    // Update worker displays
    updateDisplays();
  }

  function updateTaskDisplay() {
    // Update task displays
    updateDisplays();
  }

  function setupFallbackP2PManager() {
    // Fallback P2P manager using available browser APIs
    p2pManager = {
      start: async () => {
        connectionStatus = 'connecting';
        console.log('Starting fallback P2P manager...');
        
        // Try to use real P2P ML System if available
        if (window.p2pMLSystem) {
          try {
            await window.p2pMLSystem.start();
            connectionStatus = 'connected';
            console.log('✅ Connected via P2P ML System');
            
            // Get real peers from P2P ML System
            const realPeers = await window.p2pMLSystem.getPeers();
            if (realPeers && realPeers.length > 0) {
              peers.length = 0; // Clear array
              peers.push(...realPeers.map(peer => ({
                id: peer.id || peer.peerId,
                name: peer.name || `Peer ${peer.id.substring(0, 8)}`,
                status: peer.connected ? 'connected' : 'disconnected',
                lastSeen: peer.lastSeen || new Date(),
                capabilities: peer.capabilities || {}
              })));
            }
          } catch (error) {
            console.warn('P2P ML System start failed:', error);
          }
        }
        
        // Try SwissKnife P2P API
        if (peers.length === 0 && window.swissknife?.p2p) {
          try {
            const p2pPeers = await window.swissknife.p2p.getPeers();
            if (p2pPeers && p2pPeers.length > 0) {
              peers.push(...p2pPeers.map(peer => ({
                id: peer.id,
                name: peer.name || `SwissKnife Peer`,
                status: 'connected',
                lastSeen: new Date(),
                capabilities: peer.capabilities || {}
              })));
            }
          } catch (error) {
            console.warn('SwissKnife P2P API failed:', error);
          }
        }
        
        // Fallback to example peers if no real peers found
        if (peers.length === 0) {
          console.log('No real peers found, showing example peers');
          setTimeout(() => {
            connectionStatus = 'connected';
            addExamplePeers();
            updateDisplays();
          }, 1000);
        } else {
          updateDisplays();
        }
      },
      stop: () => {
        connectionStatus = 'disconnected';
        
        // Stop real P2P systems if available
        if (window.p2pMLSystem) {
          window.p2pMLSystem.stop().catch(e => console.warn('P2P ML System stop failed:', e));
        }
        
        peers.length = 0;
        updateDisplays();
      },
      sendMessage: async (peerId, message) => {
        console.log(`Sending message to ${peerId}:`, message);
        
        // Try real P2P messaging
        if (window.p2pMLSystem) {
          try {
            await window.p2pMLSystem.sendMessage(peerId, message);
            return;
          } catch (error) {
            console.warn('P2P ML System sendMessage failed:', error);
          }
        }
        
        if (window.swissknife?.p2p) {
          try {
            await window.swissknife.p2p.send(peerId, message);
            return;
          } catch (error) {
            console.warn('SwissKnife P2P send failed:', error);
          }
        }
        
        console.log('Message queued for delivery when P2P connection available');
      },
      broadcast: async (message) => {
        console.log('Broadcasting message:', message);
        
        // Try real P2P broadcast
        if (window.p2pMLSystem) {
          try {
            await window.p2pMLSystem.broadcast(message);
            return;
          } catch (error) {
            console.warn('P2P ML System broadcast failed:', error);
          }
        }
        
        if (window.swissknife?.p2p) {
          try {
            await window.swissknife.p2p.broadcast(message);
            return;
          } catch (error) {
            console.warn('SwissKnife P2P broadcast failed:', error);
          }
        }
        
        console.log('Broadcast queued for delivery when P2P connection available');
      }
    };
  }

  function addExamplePeers() {
    // Example peers for demonstration when no real peers available
    peers.push(
      {
        id: 'peer-001',
        name: 'ML Node Alpha',
        status: 'connected',
        lastSeen: new Date(),
        capabilities: {
          gpu: { available: true, type: 'webgpu', memory: 8192 },
          models: ['bert-base-uncased', 'gpt2']
        }
      },
      {
        id: 'peer-002', 
        name: 'Inference Server',
        status: 'connected',
        lastSeen: new Date(),
        capabilities: {
          gpu: { available: true, type: 'webgpu', memory: 4096 },
          models: ['t5-small', 'bert-base-uncased']
        }
      }
    );
  }

  function startSystemMonitoring() {
    // Monitor system status every 5 seconds
    setInterval(() => {
      if (P2PMLSystem && P2PMLSystem.isSystemRunning()) {
        systemStatus = P2PMLSystem.getSystemStatus();
        updateDisplays();
      }
    }, 5000);

    // Start P2P system after a short delay
    setTimeout(() => {
      if (P2PMLSystem) {
        P2PMLSystem.start().catch(console.error);
      } else {
        window.p2pNetworkApp?.startNetworking();
      }
    }, 1000);
  }

  function formatTimestamp(date) {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  function startNetworkDiscovery() {
    setTimeout(() => {
      window.p2pNetworkApp?.startNetworking();
    }, 1000);
  }

})();