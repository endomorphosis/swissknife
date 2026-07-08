  // Phase 4: Create enhanced P2P Network UI with worker management
  function createP2PNetworkUI() {
    return `
      <div class="p2p-network-app">
        <style>
          .p2p-network-app {
            padding: 15px;
            height: 100%;
            overflow-y: auto;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          
          .app-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding: 20px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            backdrop-filter: blur(10px);
          }
          
          .app-header h2 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
            background: linear-gradient(45deg, #fff, #f0f0f0);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          
          .connection-status {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            border-radius: 25px;
            font-weight: 500;
            font-size: 14px;
            background: rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(5px);
          }
          
          .status-indicator {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #4caf50;
            animation: pulse 2s infinite;
          }
          
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.1); }
          }
          
          .p2p-tabs {
            display: flex;
            gap: 4px;
            margin-bottom: 24px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 6px;
            backdrop-filter: blur(10px);
          }
          
          .tab-button {
            flex: 1;
            padding: 14px 20px;
            border: none;
            background: transparent;
            cursor: pointer;
            border-radius: 8px;
            font-weight: 600;
            transition: all 0.3s ease;
            color: rgba(255, 255, 255, 0.8);
            font-size: 14px;
          }
          
          .tab-button:hover {
            background: rgba(255, 255, 255, 0.1);
            color: white;
            transform: translateY(-1px);
          }
          
          .tab-button.active {
            background: linear-gradient(135deg, #4caf50, #45a049);
            color: white;
            box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
          }
          
          .tab-content {
            display: none;
            animation: fadeIn 0.3s ease;
          }
          
          .tab-content.active {
            display: block;
          }
          
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          .network-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
          }
          
          .stat-card {
            background: rgba(255, 255, 255, 0.1);
            padding: 24px;
            border-radius: 16px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            transition: all 0.3s ease;
          }
          
          .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
          }
          
          .stat-value {
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 8px;
            background: linear-gradient(45deg, #fff, #f0f0f0);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          
          .stat-label {
            font-size: 14px;
            opacity: 0.9;
            font-weight: 500;
          }
          
          .worker-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
          }
          
          .worker-card {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 20px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
          }
          
          .worker-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
          }
          
          .worker-type {
            font-weight: 600;
            font-size: 16px;
          }
          
          .worker-status {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 500;
          }
          
          .worker-status.idle {
            background: rgba(76, 175, 80, 0.3);
            color: #4caf50;
          }
          
          .worker-status.busy {
            background: rgba(255, 152, 0, 0.3);
            color: #ff9800;
          }
          
          .worker-status.error {
            background: rgba(244, 67, 54, 0.3);
            color: #f44336;
          }
          
          .worker-metrics {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-top: 16px;
          }
          
          .metric {
            text-align: center;
          }
          
          .metric-value {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 4px;
          }
          
          .metric-label {
            font-size: 12px;
            opacity: 0.8;
          }
          
          .task-queue {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 24px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
          }
          
          .task-item {
            background: rgba(255, 255, 255, 0.05);
            padding: 16px;
            border-radius: 12px;
            margin-bottom: 12px;
            border-left: 4px solid #4caf50;
          }
          
          .task-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
          }
          
          .task-id {
            font-family: 'Consolas', monospace;
            font-size: 14px;
            opacity: 0.8;
          }
          
          .task-type {
            font-weight: 600;
            color: #4caf50;
          }
          
          .action-buttons {
            display: flex;
            gap: 12px;
            margin-top: 24px;
          }
          
          .action-btn {
            padding: 12px 24px;
            border: none;
            border-radius: 25px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            background: linear-gradient(135deg, #4caf50, #45a049);
            color: white;
            box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
          }
          
          .action-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(76, 175, 80, 0.4);
          }
          
          .action-btn.secondary {
            background: linear-gradient(135deg, #2196f3, #1976d2);
            box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
          }
          
          .action-btn.secondary:hover {
            box-shadow: 0 6px 16px rgba(33, 150, 243, 0.4);
          }
          
          .performance-chart {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 24px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
          }
          
          .chart-header {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 20px;
            color: white;
          }
          
          .gpu-indicator {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 12px;
            background: rgba(255, 193, 7, 0.2);
            border-radius: 20px;
            font-size: 12px;
            font-weight: 500;
            color: #ffc107;
          }
          
          .progress-bar {
            width: 100%;
            height: 8px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            overflow: hidden;
            margin-top: 8px;
          }
          
          .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4caf50, #8bc34a);
            transition: width 0.3s ease;
          }
        </style>
        
        <div class="app-header">
          <h2>🌐 P2P Network & Workers</h2>
          <div class="connection-status" id="connectionStatus">
            <div class="status-indicator"></div>
            <span>Connecting...</span>
          </div>
        </div>
        
        <div class="p2p-tabs">
          <button class="tab-button active" data-tab="overview">📊 Overview</button>
          <button class="tab-button" data-tab="workers">🛠️ Workers</button>
          <button class="tab-button" data-tab="tasks">⚡ Tasks</button>
          <button class="tab-button" data-tab="performance">📈 Performance</button>
          <button class="tab-button" data-tab="network">🌐 Network</button>
        </div>
        
        <!-- Overview Tab -->
        <div class="tab-content active" id="overview">
          <div class="network-stats">
            <div class="stat-card">
              <div class="stat-value" id="peerCount">0</div>
              <div class="stat-label">Connected Peers</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="workerCount">0</div>
              <div class="stat-label">Active Workers</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="taskCount">0</div>
              <div class="stat-label">Tasks Completed</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="averageTime">0ms</div>
              <div class="stat-label">Avg Task Time</div>
            </div>
          </div>
          
          <div class="performance-chart">
            <div class="chart-header">
              System Performance
              <span class="gpu-indicator" id="gpuIndicator">
                🚀 GPU: 0% utilization
              </span>
            </div>
            <div>CPU Workers: <span id="cpuWorkerLoad">0%</span></div>
            <div class="progress-bar">
              <div class="progress-fill" id="cpuProgress" style="width: 0%"></div>
            </div>
            <div style="margin-top: 12px;">GPU Workers: <span id="gpuWorkerLoad">0%</span></div>
            <div class="progress-bar">
              <div class="progress-fill" id="gpuProgress" style="width: 0%"></div>
            </div>
          </div>
        </div>
        
        <!-- Workers Tab -->
        <div class="tab-content" id="workers">
          <div class="action-buttons">
            <button class="action-btn" onclick="startWorkerBenchmark()">🧪 Run Benchmark</button>
            <button class="action-btn secondary" onclick="distributeTestTask()">⚡ Test Distribution</button>
          </div>
          <div class="worker-grid" id="workerGrid">
            <!-- Worker cards will be populated here -->
          </div>
        </div>
        
        <!-- Tasks Tab -->
        <div class="tab-content" id="tasks">
          <div class="action-buttons">
            <button class="action-btn" onclick="submitComputeTask()">🔢 Matrix Multiplication</button>
            <button class="action-btn secondary" onclick="submitAITask()">🤖 AI Inference</button>
            <button class="action-btn" onclick="submitAudioTask()">🎵 Audio Processing</button>
          </div>
          <div class="task-queue" id="taskQueue">
            <h3>Task Queue</h3>
            <div id="taskList">
              <!-- Tasks will be populated here -->
            </div>
          </div>
        </div>
        
        <!-- Performance Tab -->
        <div class="tab-content" id="performance">
          <div class="network-stats">
            <div class="stat-card">
              <div class="stat-value" id="totalFlops">0</div>
              <div class="stat-label">Total FLOPS</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="networkLatency">0ms</div>
              <div class="stat-label">Network Latency</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="throughput">0</div>
              <div class="stat-label">Tasks/Second</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="efficiency">0%</div>
              <div class="stat-label">System Efficiency</div>
            </div>
          </div>
          <div id="performanceMetrics">
            <!-- Detailed performance metrics -->
          </div>
        </div>
        
        <!-- Network Tab -->
        <div class="tab-content" id="network">
          <div id="peerList">
            <!-- Peer information will be populated here -->
          </div>
          <div class="action-buttons">
            <button class="action-btn" onclick="createWorkspace()">🏢 Create Workspace</button>
            <button class="action-btn secondary" onclick="joinWorkspace()">🚪 Join Workspace</button>
          </div>
        </div>
      </div>
    `;
  }