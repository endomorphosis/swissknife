  // Phase 4: Worker Management Functions
  
  // Submit compute task to worker pool
  async function submitComputeTask() {
    if (!workerManager) {
      alert('Worker Manager not available');
      return;
    }
    
    try {
      const matrixA = generateRandomMatrix(100, 100);
      const matrixB = generateRandomMatrix(100, 100);
      
      console.log('🔢 Submitting matrix multiplication task...');
      
      const result = await workerManager.submitTask('compute', {
        operation: 'matrix-operations',
        matrices: { a: matrixA, b: matrixB }
      }, {
        priority: 5,
        timeout: 30000,
        distributed: true
      });
      
      console.log('✅ Matrix multiplication completed:', result);
      
      // Update task display
      const task = distributedTasks.find(t => t.data?.operation === 'matrix-operations');
      if (task) {
        task.status = 'completed';
        task.completedAt = new Date();
        task.result = result;
      }
      
      updateTaskDisplay();
      
    } catch (error) {
      console.error('❌ Compute task failed:', error);
      alert(`Compute task failed: ${error.message}`);
    }
  }
  
  // Submit AI inference task
  async function submitAITask() {
    if (!workerManager) {
      alert('Worker Manager not available');
      return;
    }
    
    try {
      console.log('🤖 Submitting AI inference task...');
      
      const input = Array.from({ length: 784 }, () => Math.random()); // MNIST-like input
      
      const result = await workerManager.submitTask('ai-inference', {
        modelId: 'neural-network-demo',
        input,
        options: {
          modelType: 'neural-network',
          layers: [784, 128, 64, 10]
        }
      }, {
        priority: 8,
        timeout: 60000,
        requiresGPU: true,
        distributed: true
      });
      
      console.log('✅ AI inference completed:', result);
      
      updateTaskDisplay();
      
    } catch (error) {
      console.error('❌ AI task failed:', error);
      alert(`AI task failed: ${error.message}`);
    }
  }
  
  // Submit audio processing task
  async function submitAudioTask() {
    if (!workerManager) {
      alert('Worker Manager not available');
      return;
    }
    
    try {
      console.log('🎵 Submitting audio processing task...');
      
      // Generate test audio data
      const sampleRate = 44100;
      const duration = 2; // seconds
      const samples = sampleRate * duration;
      const audioBuffer = {
        numberOfChannels: 1,
        length: samples,
        sampleRate,
        channelData: [Array.from({ length: samples }, (_, i) => 
          Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5 // 440Hz sine wave
        )]
      };
      
      const result = await workerManager.submitTask('audio', {
        audioBuffer,
        effects: [
          { type: 'reverb', id: 'reverb1' },
          { type: 'delay', id: 'delay1' }
        ],
        settings: {
          reverb1: { roomSize: 0.5, damping: 0.3, wetness: 0.4 },
          delay1: { delayTime: 0.3, feedback: 0.3, wetness: 0.3 }
        }
      }, {
        priority: 6,
        timeout: 45000
      });
      
      console.log('✅ Audio processing completed:', result);
      
      updateTaskDisplay();
      
    } catch (error) {
      console.error('❌ Audio task failed:', error);
      alert(`Audio task failed: ${error.message}`);
    }
  }
  
  // Start worker benchmark
  async function startWorkerBenchmark() {
    if (!workerManager) {
      alert('Worker Manager not available');
      return;
    }
    
    console.log('🧪 Starting worker benchmark...');
    
    const benchmarkTasks = [
      // Compute benchmarks
      {
        type: 'compute',
        name: 'Matrix Multiplication',
        task: {
          operation: 'matrix-operations',
          matrices: {
            a: generateRandomMatrix(50, 50),
            b: generateRandomMatrix(50, 50)
          }
        }
      },
      {
        type: 'compute',
        name: 'Statistical Analysis',
        task: {
          operation: 'statistical-analysis',
          dataset: Array.from({ length: 10000 }, () => Math.random() * 100)
        }
      },
      // AI benchmarks
      {
        type: 'ai-inference',
        name: 'Neural Network',
        task: {
          modelId: 'benchmark-nn',
          input: Array.from({ length: 784 }, () => Math.random()),
          options: { modelType: 'neural-network' }
        }
      },
      // GPU benchmarks
      {
        type: 'gpu-compute',
        name: 'Parallel Reduction',
        task: {
          array: Array.from({ length: 100000 }, () => Math.random()),
          operation: 'sum'
        }
      }
    ];
    
    const results = [];
    
    for (const benchmark of benchmarkTasks) {
      try {
        const startTime = performance.now();
        
        const result = await workerManager.submitTask(benchmark.type, benchmark.task, {
          priority: 10,
          timeout: 60000
        });
        
        const endTime = performance.now();
        const executionTime = endTime - startTime;
        
        results.push({
          name: benchmark.name,
          type: benchmark.type,
          executionTime,
          success: true,
          result
        });
        
        console.log(`✅ ${benchmark.name}: ${executionTime.toFixed(2)}ms`);
        
      } catch (error) {
        results.push({
          name: benchmark.name,
          type: benchmark.type,
          success: false,
          error: error.message
        });
        
        console.error(`❌ ${benchmark.name} failed:`, error);
      }
    }
    
    // Display benchmark results
    displayBenchmarkResults(results);
  }
  
  // Display benchmark results
  function displayBenchmarkResults(results) {
    const modal = document.createElement('div');
    modal.innerHTML = `
      <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; padding: 30px; border-radius: 15px; max-width: 600px; width: 90%; max-height: 80%; overflow-y: auto;">
          <h3 style="margin-top: 0; color: #333;">🧪 Benchmark Results</h3>
          <div style="margin-bottom: 20px;">
            ${results.map(result => `
              <div style="padding: 15px; margin-bottom: 10px; border-radius: 8px; ${result.success ? 'background: #e8f5e8; border-left: 4px solid #4caf50;' : 'background: #ffeaea; border-left: 4px solid #f44336;'}">
                <div style="font-weight: 600; color: #333;">${result.name}</div>
                <div style="font-size: 14px; color: #666; margin-top: 5px;">
                  Type: ${result.type} | 
                  ${result.success ? 
                    `Time: ${result.executionTime.toFixed(2)}ms` : 
                    `Error: ${result.error}`
                  }
                </div>
              </div>
            `).join('')}
          </div>
          <button onclick="this.parentElement.parentElement.remove()" style="padding: 10px 20px; background: #4caf50; color: white; border: none; border-radius: 5px; cursor: pointer;">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  
  // Distribute test task across peers
  async function distributeTestTask() {
    if (!collaborativeP2PManager || !workerManager) {
      alert('Collaborative P2P and Worker Manager required');
      return;
    }
    
    try {
      console.log('⚡ Testing distributed task execution...');
      
      const testData = Array.from({ length: 100000 }, () => Math.random());
      
      const result = await workerManager.submitTask('compute', {
        operation: 'parallel-reduction',
        array: testData,
        operation: 'sum'
      }, {
        priority: 7,
        timeout: 30000,
        distributed: true // Enable distributed execution
      });
      
      console.log('✅ Distributed task completed:', result);
      alert(`Distributed computation completed!\nSum: ${result.result.toFixed(2)}\nExecution time: ${result.computeTime.toFixed(2)}ms`);
      
    } catch (error) {
      console.error('❌ Distributed task failed:', error);
      alert(`Distributed task failed: ${error.message}`);
    }
  }
  
  // Create collaborative workspace
  async function createWorkspace() {
    if (!workspaceManager) {
      alert('Workspace Manager not available');
      return;
    }
    
    const workspaceName = prompt('Enter workspace name:');
    if (!workspaceName) return;
    
    try {
      const workspace = await workspaceManager.createWorkspace(workspaceName, {
        features: ['file-sharing', 'real-time-collaboration', 'distributed-computing'],
        maxParticipants: 10,
        permissions: {
          allowInvite: true,
          allowFileUpload: true,
          allowTaskDistribution: true
        }
      });
      
      console.log('✅ Workspace created:', workspace);
      currentWorkspace = workspace;
      updateWorkspaceDisplay();
      
    } catch (error) {
      console.error('❌ Failed to create workspace:', error);
      alert(`Failed to create workspace: ${error.message}`);
    }
  }
  
  // Join collaborative workspace
  async function joinWorkspace() {
    if (!workspaceManager) {
      alert('Workspace Manager not available');
      return;
    }
    
    const workspaceId = prompt('Enter workspace ID:');
    if (!workspaceId) return;
    
    try {
      const workspace = await workspaceManager.joinWorkspace(workspaceId);
      
      console.log('✅ Joined workspace:', workspace);
      currentWorkspace = workspace;
      updateWorkspaceDisplay();
      
    } catch (error) {
      console.error('❌ Failed to join workspace:', error);
      alert(`Failed to join workspace: ${error.message}`);
    }
  }
  
  // Update displays
  function updateWorkerDisplay() {
    if (!workerManager) return;
    
    const stats = workerManager.getStats();
    const workerGrid = document.getElementById('workerGrid');
    
    if (!workerGrid) return;
    
    workerGrid.innerHTML = stats.workerStats.map(worker => `
      <div class="worker-card">
        <div class="worker-header">
          <div class="worker-type">${getWorkerIcon(worker.type)} ${formatWorkerType(worker.type)}</div>
          <div class="worker-status ${worker.status}">${worker.status}</div>
        </div>
        <div class="worker-metrics">
          <div class="metric">
            <div class="metric-value">${worker.tasksCompleted}</div>
            <div class="metric-label">Tasks Done</div>
          </div>
          <div class="metric">
            <div class="metric-value">${worker.tasksInProgress}</div>
            <div class="metric-label">Active</div>
          </div>
        </div>
        <div style="margin-top: 12px; font-size: 12px; opacity: 0.8;">
          Avg Time: ${worker.averageTaskTime.toFixed(2)}ms<br>
          Last Activity: ${formatTime(worker.lastActivity)}
        </div>
      </div>
    `).join('');
    
    // Update overview stats
    document.getElementById('workerCount').textContent = stats.totalWorkers;
    document.getElementById('taskCount').textContent = performanceMetrics.tasksCompleted;
    document.getElementById('averageTime').textContent = Math.round(performanceMetrics.averageTaskTime) + 'ms';
  }
  
  function updateTaskDisplay() {
    const taskList = document.getElementById('taskList');
    if (!taskList) return;
    
    taskList.innerHTML = distributedTasks.slice(-10).map(task => `
      <div class="task-item">
        <div class="task-header">
          <div class="task-type">${task.type}</div>
          <div class="task-id">${task.id.substring(0, 8)}...</div>
        </div>
        <div style="font-size: 14px; opacity: 0.8;">
          Status: ${task.status} | 
          Priority: ${task.priority} |
          ${task.assignedWorker ? `Worker: ${task.assignedWorker.substring(0, 8)}...` : 'Unassigned'}
        </div>
      </div>
    `).join('');
  }
  
  function updatePerformanceDisplay() {
    // Update GPU indicator
    const gpuIndicator = document.getElementById('gpuIndicator');
    if (gpuIndicator) {
      gpuIndicator.textContent = `🚀 GPU: ${performanceMetrics.gpuUtilization.toFixed(1)}% utilization`;
    }
    
    // Update progress bars
    const cpuProgress = document.getElementById('cpuProgress');
    const gpuProgress = document.getElementById('gpuProgress');
    
    if (cpuProgress && workerManager) {
      const stats = workerManager.getStats();
      const cpuLoad = stats.currentLoad * 100;
      cpuProgress.style.width = `${cpuLoad}%`;
      document.getElementById('cpuWorkerLoad').textContent = `${cpuLoad.toFixed(1)}%`;
    }
    
    if (gpuProgress) {
      gpuProgress.style.width = `${performanceMetrics.gpuUtilization}%`;
      document.getElementById('gpuWorkerLoad').textContent = `${performanceMetrics.gpuUtilization.toFixed(1)}%`;
    }
  }
  
  // Helper functions
  function getWorkerIcon(type) {
    const icons = {
      'compute': '⚡',
      'audio': '🎵',
      'ai-inference': '🤖',
      'file-processing': '📁',
      'gpu-compute': '🚀',
      'crypto': '🔐'
    };
    return icons[type] || '🛠️';
  }
  
  function formatWorkerType(type) {
    return type.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }
  
  function formatTime(date) {
    const now = new Date();
    const diff = now - new Date(date);
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  }
  
  function generateRandomMatrix(rows, cols) {
    return Array.from({ length: rows }, () => 
      Array.from({ length: cols }, () => Math.random() * 2 - 1)
    );
  }
  
  // Make functions globally available
  window.submitComputeTask = submitComputeTask;
  window.submitAITask = submitAITask;
  window.submitAudioTask = submitAudioTask;
  window.startWorkerBenchmark = startWorkerBenchmark;
  window.distributeTestTask = distributeTestTask;
  window.createWorkspace = createWorkspace;
  window.joinWorkspace = joinWorkspace;