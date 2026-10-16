/**
 * AI Cron Scheduler App for SwissKnife Web Desktop
 * Visual scheduling interface with AI task automation and P2P distribution
 */

export class CronApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.scheduledTasks = new Map();
    this.runningTasks = new Map();
    this.taskHistory = [];
    this.cronJobInterval = null;
    this.currentView = 'scheduler'; // 'scheduler', 'templates', 'history', 'monitoring'
    this.p2pSystem = null;
    this.aiSystem = null;
    
    // Task templates
    this.taskTemplates = [
      {
        id: 'ai-summary',
        name: 'AI Content Summary',
        description: 'Automatically summarize content from specified sources',
        icon: '📋',
        category: 'ai',
        fields: {
          source: { type: 'text', label: 'Content Source URL', required: true },
          output: { type: 'select', label: 'Output Format', options: ['text', 'markdown', 'json'], default: 'text' },
          model: { type: 'select', label: 'AI Model', options: ['gpt-4', 'claude-3', 'llama-2'], default: 'gpt-4' }
        },
        defaultSchedule: '0 9 * * *' // Daily at 9 AM
      },
      {
        id: 'model-training',
        name: 'Distributed Model Training',
        description: 'Schedule ML model training across P2P network',
        icon: '🧠',
        category: 'ml',
        fields: {
          modelType: { type: 'select', label: 'Model Type', options: ['bert', 'gpt', 'vision'], required: true },
          dataset: { type: 'text', label: 'Dataset Path/URL', required: true },
          epochs: { type: 'number', label: 'Training Epochs', default: 10 },
          peers: { type: 'number', label: 'Max Peers', default: 3 }
        },
        defaultSchedule: '0 2 * * 0' // Weekly on Sunday at 2 AM
      },
      {
        id: 'data-backup',
        name: 'IPFS Data Backup',
        description: 'Backup important data to IPFS network',
        icon: '💾',
        category: 'storage',
        fields: {
          sourcePath: { type: 'text', label: 'Source Path', required: true },
          encryption: { type: 'checkbox', label: 'Encrypt Data', default: true },
          replicas: { type: 'number', label: 'Backup Replicas', default: 3 }
        },
        defaultSchedule: '0 0 * * *' // Daily at midnight
      },
      {
        id: 'system-monitoring',
        name: 'System Health Check',
        description: 'Monitor system performance and send alerts',
        icon: '🔍',
        category: 'monitoring',
        fields: {
          cpuThreshold: { type: 'number', label: 'CPU Alert Threshold (%)', default: 80 },
          memoryThreshold: { type: 'number', label: 'Memory Alert Threshold (%)', default: 85 },
          alertMethod: { type: 'select', label: 'Alert Method', options: ['notification', 'email', 'p2p'], default: 'notification' }
        },
        defaultSchedule: '*/15 * * * *' // Every 15 minutes
      },
      {
        id: 'ai-chat-analysis',
        name: 'AI Chat Analytics',
        description: 'Analyze chat patterns and generate insights',
        icon: '💬',
        category: 'ai',
        fields: {
          timeRange: { type: 'select', label: 'Analysis Period', options: ['1day', '1week', '1month'], default: '1day' },
          insights: { type: 'multiselect', label: 'Insight Types', options: ['sentiment', 'topics', 'performance'], default: ['sentiment', 'topics'] }
        },
        defaultSchedule: '0 18 * * *' // Daily at 6 PM
      },
      {
        id: 'p2p-sync',
        name: 'P2P Network Sync',
        description: 'Synchronize data across P2P network peers',
        icon: '🔗',
        category: 'network',
        fields: {
          syncType: { type: 'select', label: 'Sync Type', options: ['models', 'data', 'configs'], default: 'models' },
          peerFilter: { type: 'text', label: 'Peer Filter (optional)', placeholder: 'e.g., trusted-peers' }
        },
        defaultSchedule: '0 */4 * * *' // Every 4 hours
      }
    ];
    
    this.initializeIntegrations();
  }

  async initializeIntegrations() {
    try {
      this.swissknife = this.desktop.swissknife;
      
      // Connect to P2P system for distributed task execution
      if (window.p2pMLSystem) {
        this.p2pSystem = window.p2pMLSystem;
        this.setupP2PTasking();
      }
      
      // Connect to AI system for intelligent scheduling
      if (window.aiManager || this.swissknife?.ai) {
        this.aiSystem = window.aiManager || this.swissknife.ai;
      }
      
      // Load saved tasks
      this.loadSavedTasks();
      
      // Start cron job processor
      this.startCronProcessor();
      
      console.log('✅ AI Cron integrations initialized');
    } catch (error) {
      console.error('❌ AI Cron integration error:', error);
    }
  }

  createWindow() {
    const content = `
      <div class="cron-app-container">
        <div class="cron-header">
          <div class="header-tabs">
            <button class="tab-btn ${this.currentView === 'scheduler' ? 'active' : ''}" data-view="scheduler">
              ⏰ Scheduler
            </button>
            <button class="tab-btn ${this.currentView === 'templates' ? 'active' : ''}" data-view="templates">
              📋 Templates
            </button>
            <button class="tab-btn ${this.currentView === 'history' ? 'active' : ''}" data-view="history">
              📜 History
            </button>
            <button class="tab-btn ${this.currentView === 'monitoring' ? 'active' : ''}" data-view="monitoring">
              📊 Monitoring
            </button>
          </div>
          <div class="header-controls">
            <button class="control-btn" id="create-task" title="Create Task">➕</button>
            <button class="control-btn" id="import-tasks" title="Import Tasks">📥</button>
            <button class="control-btn" id="export-tasks" title="Export Tasks">📤</button>
            <button class="control-btn" id="cron-settings" title="Settings">⚙️</button>
          </div>
        </div>

        <div class="cron-content">
          <!-- Scheduler View -->
          <div class="tab-content ${this.currentView === 'scheduler' ? 'active' : ''}" data-view="scheduler">
            <div class="scheduler-overview">
              <div class="stats-cards">
                <div class="stat-card sk-card">
                  <div class="stat-icon">⏰</div>
                  <div class="stat-content">
                    <div class="stat-value" id="total-tasks">0</div>
                    <div class="stat-label">Scheduled Tasks</div>
                  </div>
                </div>
                <div class="stat-card sk-card">
                  <div class="stat-icon">🏃</div>
                  <div class="stat-content">
                    <div class="stat-value" id="running-tasks">0</div>
                    <div class="stat-label">Running Tasks</div>
                  </div>
                </div>
                <div class="stat-card sk-card">
                  <div class="stat-icon">✅</div>
                  <div class="stat-content">
                    <div class="stat-value" id="completed-today">0</div>
                    <div class="stat-label">Completed Today</div>
                  </div>
                </div>
                <div class="stat-card sk-card">
                  <div class="stat-icon">🔗</div>
                  <div class="stat-content">
                    <div class="stat-value" id="p2p-tasks">0</div>
                    <div class="stat-label">P2P Distributed</div>
                  </div>
                </div>
              </div>

              <div class="scheduler-controls">
                <div class="control-section">
                  <button class="scheduler-btn sk-btn" id="pause-all-tasks">⏸️ Pause All</button>
                  <button class="scheduler-btn sk-btn" id="resume-all-tasks">▶️ Resume All</button>
                  <button class="scheduler-btn sk-btn sk-btn-primary" id="run-now" disabled>🚀 Run Now</button>
                </div>
                <div class="filter-section">
                  <select id="task-filter" class="filter-select sk-select">
                    <option value="all">All Tasks</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="ai">AI Tasks</option>
                    <option value="ml">ML Tasks</option>
                    <option value="p2p">P2P Tasks</option>
                  </select>
                  <input type="text" id="task-search" placeholder="Search tasks..." class="search-input sk-input">
                </div>
              </div>
            </div>

            <div class="tasks-list">
              <h3>📋 Scheduled Tasks</h3>
              <div class="tasks-container" id="scheduled-tasks-container">
                <!-- Scheduled tasks will be populated -->
              </div>
            </div>

            <div class="running-tasks">
              <h3>🏃 Currently Running</h3>
              <div class="running-container" id="running-tasks-container">
                <!-- Running tasks will be populated -->
              </div>
            </div>
          </div>

          <!-- Templates View -->
          <div class="tab-content ${this.currentView === 'templates' ? 'active' : ''}" data-view="templates">
            <div class="templates-header">
              <h3>📋 Task Templates</h3>
              <div class="template-controls">
                <button class="template-btn sk-btn" id="create-custom-template">✨ Create Custom</button>
                <button class="template-btn sk-btn" id="import-template">📥 Import Template</button>
              </div>
            </div>

            <div class="templates-categories">
              <div class="category-filters">
                <button class="category-btn active" data-category="all">All</button>
                <button class="category-btn" data-category="ai">🤖 AI</button>
                <button class="category-btn" data-category="ml">🧠 ML</button>
                <button class="category-btn" data-category="storage">💾 Storage</button>
                <button class="category-btn" data-category="monitoring">🔍 Monitoring</button>
                <button class="category-btn" data-category="network">🌐 Network</button>
              </div>
            </div>

            <div class="templates-grid" id="templates-grid">
              <!-- Templates will be populated -->
            </div>
          </div>

          <!-- History View -->
          <div class="tab-content ${this.currentView === 'history' ? 'active' : ''}" data-view="history">
            <div class="history-header">
              <h3>📜 Execution History</h3>
              <div class="history-controls">
                <select id="history-filter" class="filter-select sk-select">
                  <option value="all">All Executions</option>
                  <option value="success">Successful</option>
                  <option value="failed">Failed</option>
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                </select>
                <button class="history-btn sk-btn" id="clear-history">🗑️ Clear History</button>
                <button class="history-btn sk-btn" id="export-history">📤 Export</button>
              </div>
            </div>

            <div class="history-stats">
              <div class="history-chart" id="execution-history-chart">
                <!-- Execution history chart -->
              </div>
            </div>

            <div class="history-list">
              <table class="history-table">
                <thead>
                  <tr>
                    <th>Task Name</th>
                    <th>Execution Time</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th>Output</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="history-table-body">
                  <!-- History entries will be populated -->
                </tbody>
              </table>
            </div>
          </div>

          <!-- Monitoring View -->
          <div class="tab-content ${this.currentView === 'monitoring' ? 'active' : ''}" data-view="monitoring">
            <div class="monitoring-overview">
              <h3>📊 Task Monitoring</h3>
              
              <div class="monitoring-metrics">
                <div class="metric-card sk-card">
                  <div class="metric-header">
                    <span class="metric-icon">⚡</span>
                    <span class="metric-title">System Load</span>
                  </div>
                  <div class="metric-value" id="system-load">0%</div>
                  <div class="metric-chart" id="load-chart"></div>
                </div>

                <div class="metric-card sk-card">
                  <div class="metric-header">
                    <span class="metric-icon">🔗</span>
                    <span class="metric-title">P2P Network</span>
                  </div>
                  <div class="metric-value" id="p2p-status">Disconnected</div>
                  <div class="metric-chart" id="p2p-chart"></div>
                </div>

                <div class="metric-card sk-card">
                  <div class="metric-header">
                    <span class="metric-icon">🤖</span>
                    <span class="metric-title">AI Processing</span>
                  </div>
                  <div class="metric-value" id="ai-queue">0</div>
                  <div class="metric-chart" id="ai-chart"></div>
                </div>

                <div class="metric-card sk-card">
                  <div class="metric-header">
                    <span class="metric-icon">📊</span>
                    <span class="metric-title">Success Rate</span>
                  </div>
                  <div class="metric-value" id="success-rate">100%</div>
                  <div class="metric-chart" id="success-chart"></div>
                </div>
              </div>

              <div class="monitoring-alerts">
                <h4>🚨 Active Alerts</h4>
                <div class="alerts-container" id="active-alerts">
                  <!-- Alerts will be populated -->
                </div>
              </div>

              <div class="monitoring-logs">
                <h4>📋 Recent Logs</h4>
                <div class="logs-container sk-code" id="monitoring-logs">
                  <!-- Logs will be populated -->
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Task Creation Modal -->
        <div class="modal" id="task-creation-modal" style="display: none;">
          <div class="modal-content">
            <div class="modal-header">
              <h3>✨ Create New Task</h3>
              <button class="modal-close" id="close-task-modal">❌</button>
            </div>
            <div class="modal-body">
              <form id="task-creation-form">
                <div class="form-section">
                  <h4>📋 Basic Information</h4>
                  <div class="form-group">
                    <label for="task-name">Task Name</label>
                    <input type="text" id="task-name" class="sk-input" required>
                  </div>
                  <div class="form-group">
                    <label for="task-description">Description</label>
                    <textarea id="task-description" class="sk-textarea" rows="3"></textarea>
                  </div>
                  <div class="form-group">
                    <label for="task-template">Template</label>
                    <select id="task-template" class="sk-select">
                      <option value="">Custom Task</option>
                      ${this.taskTemplates.map(template => 
                        `<option value="${template.id}">${template.name}</option>`
                      ).join('')}
                    </select>
                  </div>
                </div>

                <div class="form-section">
                  <h4>⏰ Schedule</h4>
                  <div class="form-group">
                    <label for="task-schedule-type">Schedule Type</label>
                    <select id="task-schedule-type" class="sk-select">
                      <option value="cron">Cron Expression</option>
                      <option value="interval">Interval</option>
                      <option value="once">Run Once</option>
                    </select>
                  </div>
                  <div class="form-group" id="cron-expression-group">
                    <label for="task-cron">Cron Expression</label>
                    <input type="text" id="task-cron" class="sk-input" placeholder="0 0 * * *">
                    <div class="cron-help">
                      <span>Examples: </span>
                      <button type="button" class="cron-preset" data-cron="0 0 * * *">Daily</button>
                      <button type="button" class="cron-preset" data-cron="0 0 * * 0">Weekly</button>
                      <button type="button" class="cron-preset" data-cron="0 0 1 * *">Monthly</button>
                    </div>
                  </div>
                </div>

                <div class="form-section">
                  <h4>🔧 Execution Options</h4>
                  <div class="form-group">
                    <label>
                      <input type="checkbox" id="task-enabled" checked>
                      Enable Task
                    </label>
                  </div>
                  <div class="form-group">
                    <label>
                      <input type="checkbox" id="task-p2p">
                      Enable P2P Distribution
                    </label>
                  </div>
                  <div class="form-group">
                    <label for="task-priority">Priority</label>
                    <select id="task-priority" class="sk-select">
                      <option value="low">Low</option>
                      <option value="normal" selected>Normal</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>

                <div class="form-section" id="template-fields">
                  <!-- Template-specific fields will be populated -->
                </div>
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-secondary sk-btn" id="cancel-task">Cancel</button>
              <button type="submit" class="btn-primary sk-btn sk-btn-primary" form="task-creation-form">Create Task</button>
            </div>
          </div>
        </div>
      </div>
    `;

    return content;
  }

  async initialize() {
    await this.initializeIntegrations();
    this.setupEventListeners();
    await this.loadInitialData();
  }

  render() {
    return this.createWindow();
  }

  setupEventListeners() {
    // Tab switching
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-btn')) {
        const view = e.target.dataset.view;
        this.switchView(view);
      }
    });

    // Control buttons
    document.addEventListener('click', (e) => {
      const buttonHandlers = {
        'create-task': () => this.showTaskCreationModal(),
        'import-tasks': () => this.importTasks(),
        'export-tasks': () => this.exportTasks(),
        'cron-settings': () => this.showSettings(),
        
        // Scheduler controls
        'pause-all-tasks': () => this.pauseAllTasks(),
        'resume-all-tasks': () => this.resumeAllTasks(),
        'run-now': () => this.runSelectedTask(),
        
        // Template controls
        'create-custom-template': () => this.createCustomTemplate(),
        'import-template': () => this.importTemplate(),
        
        // History controls
        'clear-history': () => this.clearHistory(),
        'export-history': () => this.exportHistory(),
        
        // Modal controls
        'close-task-modal': () => this.hideTaskCreationModal(),
        'cancel-task': () => this.hideTaskCreationModal()
      };

      if (buttonHandlers[e.target.id]) {
        e.preventDefault();
        buttonHandlers[e.target.id]();
      }

      // Cron presets
      if (e.target.classList.contains('cron-preset')) {
        const cronInput = document.getElementById('task-cron');
        if (cronInput) {
          cronInput.value = e.target.dataset.cron;
        }
      }

      // Category filters
      if (e.target.classList.contains('category-btn')) {
        document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        this.filterTemplates(e.target.dataset.category);
      }
    });

    // Form submission
    document.addEventListener('submit', (e) => {
      if (e.target.id === 'task-creation-form') {
        e.preventDefault();
        this.createTask();
      }
    });

    // Template selection
    document.addEventListener('change', (e) => {
      if (e.target.id === 'task-template') {
        this.updateTemplateFields(e.target.value);
      }
    });

    // Search and filtering
    const taskSearch = document.getElementById('task-search');
    if (taskSearch) {
      taskSearch.addEventListener('input', (e) => {
        this.filterTasks(e.target.value);
      });
    }

    const taskFilter = document.getElementById('task-filter');
    if (taskFilter) {
      taskFilter.addEventListener('change', (e) => {
        this.applyTaskFilter(e.target.value);
      });
    }

    const historyFilter = document.getElementById('history-filter');
    if (historyFilter) {
      historyFilter.addEventListener('change', (e) => {
        this.applyHistoryFilter(e.target.value);
      });
    }
  }

  switchView(view) {
    this.currentView = view;
    
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.dataset.view === view);
    });
    
    // Load view-specific data
    this.loadViewData(view);
  }

  async loadViewData(view) {
    switch (view) {
      case 'scheduler':
        await this.loadSchedulerData();
        break;
      case 'templates':
        await this.loadTemplatesData();
        break;
      case 'history':
        await this.loadHistoryData();
        break;
      case 'monitoring':
        await this.loadMonitoringData();
        break;
    }
  }

  async loadInitialData() {
    await this.loadSchedulerData();
    this.updateStats();
  }

  async loadSchedulerData() {
    await this.updateStats();
    this.displayScheduledTasks();
    this.displayRunningTasks();
  }

  updateStats() {
    const stats = {
      'total-tasks': this.scheduledTasks.size,
      'running-tasks': this.runningTasks.size,
      'completed-today': this.getCompletedToday(),
      'p2p-tasks': this.getP2PTasks()
    };
    
    Object.entries(stats).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });
  }

  getCompletedToday() {
    const today = new Date().toDateString();
    return this.taskHistory.filter(task => 
      new Date(task.completedAt).toDateString() === today && task.status === 'completed'
    ).length;
  }

  getP2PTasks() {
    return Array.from(this.scheduledTasks.values()).filter(task => task.enableP2P).length;
  }

  displayScheduledTasks() {
    const container = document.getElementById('scheduled-tasks-container');
    if (!container) return;
    
    const tasks = Array.from(this.scheduledTasks.values());
    
    if (tasks.length === 0) {
      container.innerHTML = `
        <div class="no-tasks sk-empty">
          <div class="no-tasks-icon sk-empty-icon">⏰</div>
          <div class="no-tasks-message">No scheduled tasks</div>
          <button class="btn-primary sk-btn sk-btn-primary" onclick="cronApp.showTaskCreationModal()">Create Your First Task</button>
        </div>
      `;
      return;
    }
    
    container.innerHTML = tasks.map(task => `
      <div class="task-card ${task.enabled ? 'enabled' : 'disabled'}" data-task-id="${task.id}">
        <div class="task-header">
          <div class="task-icon">${this.getTaskIcon(task)}</div>
          <div class="task-info">
            <div class="task-name">${task.name}</div>
            <div class="task-description">${task.description || 'No description'}</div>
          </div>
          <div class="task-status">
            <span class="status-badge status-${task.enabled ? 'enabled' : 'disabled'}">
              <span class="sk-status-dot ${task.enabled ? 'is-ok' : 'is-idle'}"></span>
              ${task.enabled ? 'Active' : 'Paused'}
            </span>
            ${task.enableP2P ? '<span class="p2p-badge">🔗</span>' : ''}
          </div>
        </div>
        
        <div class="task-details">
          <div class="task-schedule">
            <span class="schedule-icon">⏰</span>
            <span class="schedule-text">${this.formatSchedule(task.schedule)}</span>
          </div>
          <div class="task-next-run">
            <span class="next-run-icon">🕐</span>
            <span class="next-run-text">Next: ${this.getNextRunTime(task)}</span>
          </div>
          ${task.definitionCid ? `
          <div class="task-ledger">
            <span class="ledger-icon">🧾</span>
            <span class="ledger-text" title="Definition CID in the ipfs_kit_py scheduling ledger">Ledger: ${task.definitionCid.slice(0, 18)}…</span>
          </div>` : ''}
        </div>
        
        <div class="task-actions">
          <button class="task-btn" onclick="cronApp.runTaskNow('${task.id}')" title="Run Now">▶️</button>
          <button class="task-btn" onclick="cronApp.editTask('${task.id}')" title="Edit">✏️</button>
          <button class="task-btn" onclick="cronApp.toggleTask('${task.id}')" title="${task.enabled ? 'Pause' : 'Resume'}">
            ${task.enabled ? '⏸️' : '▶️'}
          </button>
          <button class="task-btn danger" onclick="cronApp.deleteTask('${task.id}')" title="Delete">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  displayRunningTasks() {
    const container = document.getElementById('running-tasks-container');
    if (!container) return;
    
    const tasks = Array.from(this.runningTasks.values());
    
    if (tasks.length === 0) {
      container.innerHTML = '<div class="no-running-tasks sk-empty">No tasks currently running</div>';
      return;
    }
    
    container.innerHTML = tasks.map(task => `
      <div class="running-task-card">
        <div class="running-task-header">
          <div class="running-task-icon">${this.getTaskIcon(task)}</div>
          <div class="running-task-info">
            <div class="running-task-name">${task.name}</div>
            <div class="running-task-progress">
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${task.progress || 0}%"></div>
              </div>
              <span class="progress-text">${task.progress || 0}%</span>
            </div>
          </div>
          <div class="running-task-actions">
            <button class="task-btn" onclick="cronApp.viewTaskLog('${task.id}')" title="View Log">📋</button>
            <button class="task-btn danger" onclick="cronApp.cancelTask('${task.id}')" title="Cancel">⏹️</button>
          </div>
        </div>
        
        <div class="running-task-details">
          <span>Started: ${new Date(task.startedAt).toLocaleTimeString()}</span>
          <span>Duration: ${this.formatDuration(Date.now() - task.startedAt)}</span>
          ${task.peerId ? `<span>Peer: ${task.peerId.slice(0, 8)}...</span>` : ''}
        </div>
      </div>
    `).join('');
  }

  getTaskIcon(task) {
    const template = this.taskTemplates.find(t => t.id === task.templateId);
    return template?.icon || '⚙️';
  }

  formatSchedule(schedule) {
    // Convert cron expression to human-readable format
    const parts = schedule.split(' ');
    if (parts.length !== 5) return schedule;
    
    const [minute, hour, day, month, weekday] = parts;
    
    if (schedule === '0 0 * * *') return 'Daily at midnight';
    if (schedule === '0 9 * * *') return 'Daily at 9:00 AM';
    if (schedule === '0 0 * * 0') return 'Weekly on Sunday';
    if (schedule === '0 0 1 * *') return 'Monthly on 1st';
    if (schedule === '*/15 * * * *') return 'Every 15 minutes';
    
    return schedule; // Fallback to raw cron expression
  }

  getNextRunTime(task) {
    // Real next-run computation for 5-field cron expressions. Returns an
    // honest "unknown" when the expression cannot be parsed rather than a
    // placeholder time.
    const next = this.computeNextCronRun(task.schedule, new Date());
    return next ? next.toLocaleString() : 'unknown schedule';
  }

  // Minimal 5-field cron matcher: supports "*", "*/n", "a,b,c", "a-b", and
  // plain integers. Anything else is treated as non-matching (honest).
  parseCronField(field, min, max) {
    const values = new Set();
    if (field === '*') {
      for (let i = min; i <= max; i++) values.add(i);
      return values;
    }
    for (const part of String(field).split(',')) {
      let step = 1;
      let range = part;
      if (part.includes('/')) {
        const [r, s] = part.split('/');
        range = r;
        step = parseInt(s, 10);
        if (!Number.isFinite(step) || step < 1) return null;
      }
      let start;
      let end;
      if (range === '*' || range === '') {
        start = min;
        end = max;
      } else if (range.includes('-')) {
        const [a, b] = range.split('-').map(Number);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        start = a;
        end = b;
      } else {
        const v = Number(range);
        if (!Number.isFinite(v)) return null;
        start = v;
        end = v;
      }
      if (start < min || end > max || start > end) return null;
      for (let i = start; i <= end; i += step) values.add(i);
    }
    return values;
  }

  parseCronExpression(schedule) {
    const parts = String(schedule || '').trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const [minute, hour, day, month, weekday] = [
      this.parseCronField(parts[0], 0, 59),
      this.parseCronField(parts[1], 0, 23),
      this.parseCronField(parts[2], 1, 31),
      this.parseCronField(parts[3], 1, 12),
      this.parseCronField(parts[4], 0, 6)
    ];
    if (!minute || !hour || !day || !month || !weekday) return null;
    return { minute, hour, day, month, weekday };
  }

  cronMatchesDate(parsed, date) {
    return parsed.minute.has(date.getMinutes())
      && parsed.hour.has(date.getHours())
      && parsed.day.has(date.getDate())
      && parsed.month.has(date.getMonth() + 1)
      && parsed.weekday.has(date.getDay());
  }

  shouldRunTask(task, now) {
    const parsed = this.parseCronExpression(task.schedule);
    if (!parsed) return false;
    // Fire only on the minute boundary the processor tick observes.
    return this.cronMatchesDate(parsed, now);
  }

  computeNextCronRun(schedule, from) {
    const parsed = this.parseCronExpression(schedule);
    if (!parsed) return null;
    const candidate = new Date(from.getTime());
    candidate.setSeconds(0, 0);
    candidate.setMinutes(candidate.getMinutes() + 1);
    // Scan forward minute-by-minute, bounded to ~370 days.
    for (let i = 0; i < 532800; i++) {
      if (this.cronMatchesDate(parsed, candidate)) return new Date(candidate);
      candidate.setMinutes(candidate.getMinutes() + 1);
    }
    return null;
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  async loadTemplatesData() {
    this.displayTemplates();
  }

  displayTemplates(category = 'all') {
    const grid = document.getElementById('templates-grid');
    if (!grid) return;
    
    const templates = this.taskTemplates.filter(template => 
      category === 'all' || template.category === category
    );
    
    grid.innerHTML = templates.map(template => `
      <div class="template-card" data-template-id="${template.id}">
        <div class="template-header">
          <div class="template-icon">${template.icon}</div>
          <div class="template-title">${template.name}</div>
        </div>
        <div class="template-description">${template.description}</div>
        <div class="template-category">
          <span class="category-tag category-${template.category}">${template.category.toUpperCase()}</span>
        </div>
        <div class="template-actions">
          <button class="template-btn" onclick="cronApp.useTemplate('${template.id}')">Use Template</button>
          <button class="template-btn secondary" onclick="cronApp.previewTemplate('${template.id}')">Preview</button>
        </div>
      </div>
    `).join('');
  }

  filterTemplates(category) {
    this.displayTemplates(category);
  }

  async loadHistoryData() {
    this.displayExecutionHistory();
    this.updateHistoryChart();
  }

  displayExecutionHistory() {
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;
    
    if (this.taskHistory.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="no-history">No execution history available</td>
        </tr>
      `;
      return;
    }
    
    tbody.innerHTML = this.taskHistory.slice(0, 50).map(entry => `
      <tr class="history-row history-${entry.status}">
        <td>${entry.taskName}</td>
        <td>${new Date(entry.startedAt).toLocaleString()}</td>
        <td>${this.formatDuration(entry.duration)}</td>
        <td>
          <span class="status-badge status-${entry.status}">
            <span class="sk-status-dot ${entry.status === 'completed' ? 'is-ok' : entry.status === 'failed' ? 'is-err' : entry.status === 'running' ? 'is-warn' : 'is-idle'}"></span>
            ${entry.status}
          </span>
        </td>
        <td class="output-cell">
          ${entry.output ? 
            `<button class="view-output-btn sk-btn" onclick="cronApp.viewOutput('${entry.id}')">View</button>` : 
            'No output'
          }
        </td>
        <td>
          <button class="history-btn small sk-btn" onclick="cronApp.rerunTask('${entry.taskId}')" title="Rerun">🔄</button>
          <button class="history-btn small sk-btn" onclick="cronApp.viewHistoryDetails('${entry.id}')" title="Details">🔍</button>
        </td>
      </tr>
    `).join('');
  }

  updateHistoryChart() {
    const chartContainer = document.getElementById('execution-history-chart');
    if (!chartContainer) return;
    
    // Simple chart showing success/failure rate over time
    const last7Days = this.getLast7DaysHistory();
    
    chartContainer.innerHTML = `
      <div class="chart-title">Execution Success Rate (Last 7 Days)</div>
      <div class="chart-bars">
        ${last7Days.map(day => `
          <div class="chart-day">
            <div class="chart-bar success" style="height: ${day.successRate}%" title="${day.successRate}% success"></div>
            <div class="chart-label">${day.label}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  getLast7DaysHistory() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayString = date.toDateString();
      
      const dayEntries = this.taskHistory.filter(entry => 
        new Date(entry.startedAt).toDateString() === dayString
      );
      
      const successRate = dayEntries.length > 0 ? 
        (dayEntries.filter(entry => entry.status === 'completed').length / dayEntries.length) * 100 : 0;
      
      days.push({
        label: i === 0 ? 'Today' : date.toLocaleDateString('en', { weekday: 'short' }),
        successRate: successRate
      });
    }
    return days;
  }

  async loadMonitoringData() {
    await this.updateMonitoringMetrics();
    this.displayActiveAlerts();
    this.displayRecentLogs();
  }

  async updateMonitoringMetrics() {
    // Honest local readings only: task counts come from real scheduler state,
    // P2P status from the real P2P system, memory from the browser API where
    // available. CPU/network percentages are NOT measurable in a browser, so
    // they are shown as n/a rather than fabricated.
    const localReadings = this.readLocalMetrics();

    const systemLoad = document.getElementById('system-load');
    if (systemLoad) {
      systemLoad.textContent = localReadings.label;
    }

    // Update P2P status
    const p2pStatus = document.getElementById('p2p-status');
    if (p2pStatus) {
      const isConnected = this.p2pSystem?.peers?.size > 0;
      p2pStatus.textContent = isConnected ? `${this.p2pSystem.peers.size} peers` : 'Disconnected';
    }

    // Update AI queue
    const aiQueue = document.getElementById('ai-queue');
    if (aiQueue) {
      aiQueue.textContent = this.runningTasks.size;
    }

    // Update success rate
    const successRate = document.getElementById('success-rate');
    if (successRate) {
      const rate = this.calculateSuccessRate();
      successRate.textContent = `${rate.toFixed(1)}%`;
    }

    // Update charts
    this.updateMonitoringCharts(localReadings);
  }

  // Real browser-side signals. Returns values in 0-100 for the bar charts
  // plus an honest label; anything unmeasurable is null (rendered as n/a).
  readLocalMetrics() {
    const heap = (typeof performance !== 'undefined' && performance.memory) ? performance.memory : null;
    const heapPct = heap && heap.totalJSHeapSize > 0
      ? Math.min(100, (heap.usedJSHeapSize / heap.totalJSHeapSize) * 100)
      : null;
    const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || null;
    const peerCount = this.p2pSystem?.peers?.size ?? 0;
    const history = this.taskHistory.length;
    const completed = this.taskHistory.filter(entry => entry.status === 'completed').length;
    const successPct = history > 0 ? (completed / history) * 100 : null;
    return {
      heapPct,
      cores,
      peerCount,
      running: this.runningTasks.size,
      successPct,
      label: heapPct === null
        ? 'n/a (browser)'
        : `JS heap ${heapPct.toFixed(1)}%`
    };
  }

  calculateSuccessRate() {
    if (this.taskHistory.length === 0) return 100;
    
    const successful = this.taskHistory.filter(entry => entry.status === 'completed').length;
    return (successful / this.taskHistory.length) * 100;
  }

  updateMonitoringCharts(readings = this.readLocalMetrics()) {
    // Charts render real local readings. Bars with no measurable value are
    // rendered empty and titled "n/a" — never filled with random data.
    const chartValues = {
      'load-chart': readings.heapPct,
      'p2p-chart': readings.peerCount > 0 ? Math.min(100, readings.peerCount * 10) : 0,
      'ai-chart': Math.min(100, readings.running * 25),
      'success-chart': readings.successPct
    };

    Object.entries(chartValues).forEach(([chartId, value]) => {
      const element = document.getElementById(chartId);
      if (element) {
        if (value === null || value === undefined) {
          element.innerHTML = '<div class="mini-chart-bar" style="width: 0%; background: #9aa5b1;" title="n/a — not measurable in this browser"></div>';
        } else {
          element.innerHTML = `
            <div class="mini-chart-bar" style="width: ${value}%; background: ${this.getBarColor(value)};" title="${Number(value).toFixed(1)}%"></div>
          `;
        }
      }
    });
  }

  getBarColor(percentage) {
    if (percentage < 50) return '#4CAF50';
    if (percentage < 80) return '#FF9800';
    return '#F44336';
  }

  displayActiveAlerts() {
    const container = document.getElementById('active-alerts');
    if (!container) return;
    
    // Get alerts from task history
    const alerts = this.taskHistory
      .filter(task => task.status === 'failed' || task.status === 'warning')
      .slice(0, 5)
      .map(task => ({
        level: task.status === 'failed' ? 'warning' : 'info',
        message: `Task "${task.name}" ${task.status}`,
        time: this.getRelativeTime(task.lastRun)
      }));
    
    if (alerts.length === 0) {
      container.innerHTML = '<div class="no-alerts sk-empty">No active alerts</div>';
      return;
    }
    
    container.innerHTML = alerts.map(alert => `
      <div class="alert alert-${alert.level}">
        <span class="alert-message">${alert.message}</span>
        <span class="alert-time">${alert.time}</span>
      </div>
    `).join('');
  }

  displayRecentLogs() {
    const container = document.getElementById('monitoring-logs');
    if (!container) return;
    
    // Get logs from task history
    const logs = this.taskHistory
      .slice(0, 10)
      .map(task => ({
        level: task.status === 'failed' ? 'error' : (task.status === 'completed' ? 'success' : 'info'),
        message: `Task "${task.name}" ${task.status}`,
        time: task.lastRun || new Date()
      }));
    
    container.innerHTML = logs.map(log => `
      <div class="log-entry log-${log.level}">
        <span class="log-time">${log.time.toLocaleTimeString()}</span>
        <span class="log-message">${log.message}</span>
      </div>
    `).join('');
  }

  // Task management methods
  showTaskCreationModal() {
    const modal = document.getElementById('task-creation-modal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  hideTaskCreationModal() {
    const modal = document.getElementById('task-creation-modal');
    if (modal) {
      modal.style.display = 'none';
    }
    
    // Reset form
    const form = document.getElementById('task-creation-form');
    if (form) {
      form.reset();
    }
  }

  updateTemplateFields(templateId) {
    const fieldsContainer = document.getElementById('template-fields');
    if (!fieldsContainer) return;
    
    if (!templateId) {
      fieldsContainer.innerHTML = '';
      return;
    }
    
    const template = this.taskTemplates.find(t => t.id === templateId);
    if (!template) return;
    
    fieldsContainer.innerHTML = `
      <h4>🔧 ${template.name} Configuration</h4>
      ${Object.entries(template.fields).map(([key, field]) => `
        <div class="form-group">
          <label for="field-${key}">${field.label}</label>
          ${this.renderFormField(key, field)}
        </div>
      `).join('')}
    `;
    
    // Set default cron schedule
    const cronInput = document.getElementById('task-cron');
    if (cronInput && template.defaultSchedule) {
      cronInput.value = template.defaultSchedule;
    }
  }

  renderFormField(key, field) {
    switch (field.type) {
      case 'text':
        return `<input type="text" id="field-${key}" ${field.required ? 'required' : ''} placeholder="${field.placeholder || ''}">`;
      case 'number':
        return `<input type="number" id="field-${key}" value="${field.default || ''}" ${field.required ? 'required' : ''}>`;
      case 'select':
        return `
          <select id="field-${key}" ${field.required ? 'required' : ''}>
            ${field.options.map(option => 
              `<option value="${option}" ${option === field.default ? 'selected' : ''}>${option}</option>`
            ).join('')}
          </select>
        `;
      case 'checkbox':
        return `<input type="checkbox" id="field-${key}" ${field.default ? 'checked' : ''}>`;
      case 'textarea':
        return `<textarea id="field-${key}" rows="3" ${field.required ? 'required' : ''}>${field.default || ''}</textarea>`;
      default:
        return `<input type="text" id="field-${key}">`;
    }
  }

  async createTask() {
    const form = document.getElementById('task-creation-form');
    if (!form) return;
    
    const formData = new FormData(form);
    const templateId = document.getElementById('task-template').value;
    
    const task = {
      id: this.generateTaskId(),
      name: formData.get('task-name') || document.getElementById('task-name').value,
      description: formData.get('task-description') || document.getElementById('task-description').value,
      templateId: templateId,
      schedule: document.getElementById('task-cron').value,
      enabled: document.getElementById('task-enabled').checked,
      enableP2P: document.getElementById('task-p2p').checked,
      priority: document.getElementById('task-priority').value,
      createdAt: Date.now(),
      fields: {}
    };
    
    // Collect template-specific fields
    if (templateId) {
      const template = this.taskTemplates.find(t => t.id === templateId);
      if (template) {
        Object.keys(template.fields).forEach(key => {
          const element = document.getElementById(`field-${key}`);
          if (element) {
            task.fields[key] = element.type === 'checkbox' ? element.checked : element.value;
          }
        });
      }
    }
    
    // Save task locally first (always works, even with no backend)
    this.scheduledTasks.set(task.id, task);
    this.saveTasks();

    // Persist the job definition to the real backend scheduling ledger
    // (kit artifacts + event DAG) with the user's explicit confirmation.
    await this.persistTaskDefinition(task);

    // Hide modal and refresh
    this.hideTaskCreationModal();
    await this.loadSchedulerData();

    this.showNotification(
      `Task "${task.name}" created successfully` +
      (task.definitionCid ? ` — definition CID ${task.definitionCid}` : ' (local only; backend ledger unavailable)'),
      'success'
    );
  }

  // Persists the job definition record to ipfs_kit_py (real CID over the real
  // definition bytes) and appends a scheduling event to the event DAG. The
  // user explicitly confirms the backend write; failures surface verbatim and
  // never block the local task.
  async persistTaskDefinition(task) {
    let helper;
    try {
      helper = await import('./real-artifact.js');
    } catch (error) {
      console.warn('Artifact helper unavailable:', error.message);
      return;
    }
    const confirmed = helper.userConfirmsBackendWrite(
      `Persist the definition of task "${task.name}" to the ipfs_kit_py artifact store and scheduling ledger?`
    );
    if (!confirmed) return;
    try {
      const definition = {
        schema: 'swissknife.cron.task-definition.v1',
        id: task.id,
        name: task.name,
        description: task.description || '',
        templateId: task.templateId || 'custom',
        schedule: task.schedule,
        enabled: task.enabled,
        enableP2P: task.enableP2P,
        priority: task.priority,
        fields: task.fields || {},
        createdAt: new Date(task.createdAt).toISOString()
      };
      const persisted = await helper.persistArtifactRecord({
        record: definition,
        profile: 'cron-task-definition',
        kind: 'task-definition'
      });
      task.definitionCid = persisted.cid;
      const appended = await helper.appendDagEvent({
        event_type: 'cron.task.scheduled',
        task_id: task.id,
        task_name: task.name,
        definition_cid: persisted.cid,
        schedule: task.schedule,
        created_at: new Date().toISOString()
      });
      task.ledgerEventCid = appended.event_cid;
      this.scheduledTasks.set(task.id, task);
      this.saveTasks();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('Task definition persistence failed:', message);
      this.showNotification(`Task saved locally; backend ledger failed: ${message}`, 'error');
    }
  }

  generateTaskId() {
    return 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  }

  async runTaskNow(taskId) {
    const task = this.scheduledTasks.get(taskId);
    if (!task) return;
    
    this.showNotification(`Running task "${task.name}"...`, 'info');
    
    const runningTask = {
      ...task,
      startedAt: Date.now(),
      progress: 0
    };
    
    this.runningTasks.set(taskId, runningTask);
    await this.loadSchedulerData();
    
    // Execute task
    try {
      await this.executeTask(runningTask);
    } catch (error) {
      console.error('Task execution error:', error);
      this.showNotification(`Task "${task.name}" failed: ${error.message}`, 'error');
    }
  }

  async executeTask(task) {
    // Honest local execution: the scheduler really fired, but only templates
    // with a real local executor perform their payload. Templates without a
    // connected executor are recorded as skipped, never as fake successes.
    const startedAt = Date.now();
    let status = 'completed';
    let output;

    try {
      const outcome = await this.executeTaskPayload(task);
      output = outcome;
    } catch (error) {
      status = 'failed';
      output = `Task "${task.name}" failed: ${error.message}`;
      this.showNotification(output, 'error');
    }

    const completedAt = Date.now();
    this.taskHistory.unshift({
      id: this.generateTaskId(),
      taskId: task.id,
      taskName: task.name,
      startedAt,
      completedAt,
      duration: completedAt - startedAt,
      status,
      output
    });

    this.runningTasks.delete(task.id);
    this.saveTasks();
    await this.loadSchedulerData();

    if (status === 'completed') {
      this.showNotification(`Task "${task.name}" completed`, 'success');
    }
    await this.recordTaskRunLedger(task, status, output, startedAt, completedAt);
  }

  // Runs the task payload for real where a local executor exists. Returns a
  // human-readable outcome string. Throws when the payload cannot run.
  async executeTaskPayload(task) {
    const templateId = task.templateId;
    if (templateId === 'system-monitoring') {
      return this.runLocalHealthCheck(task);
    }
    if (task.enableP2P && this.p2pSystem && typeof this.p2pSystem.dispatchTask === 'function') {
      const receipt = await this.p2pSystem.dispatchTask(task);
      return `Dispatched to P2P executor: ${receipt || 'accepted'}`;
    }
    throw new Error(
      `No executor is connected for template "${templateId || 'custom'}" in this session, ` +
      'so the payload was not run. Connect a P2P executor or pick the System Health Check template for a local run.'
    );
  }

  // The one template with a genuinely local executor: reads real
  // browser-side signals and evaluates the task's own thresholds.
  runLocalHealthCheck(task) {
    const fields = task.fields || {};
    const readings = {
      cpuCores: (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 'n/a',
      jsHeapUsedMB: (typeof performance !== 'undefined' && performance.memory)
        ? Number((performance.memory.usedJSHeapSize / 1048576).toFixed(1))
        : 'n/a',
      jsHeapTotalMB: (typeof performance !== 'undefined' && performance.memory)
        ? Number((performance.memory.totalJSHeapSize / 1048576).toFixed(1))
        : 'n/a',
      p2pPeers: this.p2pSystem?.peers?.size ?? 0,
      runningTasks: this.runningTasks.size
    };
    const cpuThreshold = Number(fields.cpuThreshold) || 80;
    const memoryThreshold = Number(fields.memoryThreshold) || 85;
    const alerts = [];
    if (typeof readings.jsHeapUsedMB === 'number' && typeof readings.jsHeapTotalMB === 'number' && readings.jsHeapTotalMB > 0) {
      const heapPct = (readings.jsHeapUsedMB / readings.jsHeapTotalMB) * 100;
      if (heapPct >= memoryThreshold) alerts.push(`JS heap ${heapPct.toFixed(1)}% >= threshold ${memoryThreshold}%`);
    }
    return `Local health check (cpu threshold ${cpuThreshold}%, memory threshold ${memoryThreshold}%): ` +
      `cores=${readings.cpuCores}, jsHeap=${readings.jsHeapUsedMB}/${readings.jsHeapTotalMB} MB, ` +
      `p2pPeers=${readings.p2pPeers}, runningTasks=${readings.runningTasks}` +
      (alerts.length ? ` — ALERTS: ${alerts.join('; ')}` : ' — no alerts');
  }

  // Records the run in the backend scheduling ledger (kit event DAG) when the
  // task definition itself was persisted there. Best-effort: a ledger failure
  // never masks the local history entry, and its message is shown verbatim.
  async recordTaskRunLedger(task, status, output, startedAt, completedAt) {
    if (!task.definitionCid) return;
    try {
      const { appendDagEvent } = await import('./real-artifact.js');
      await appendDagEvent({
        event_type: 'cron.task.run',
        task_id: task.id,
        task_name: task.name,
        definition_cid: task.definitionCid,
        status,
        output: String(output).slice(0, 2000),
        started_at: new Date(startedAt).toISOString(),
        completed_at: new Date(completedAt).toISOString()
      });
    } catch (error) {
      console.warn('Scheduling ledger append failed:', error.message);
    }
  }

  toggleTask(taskId) {
    const task = this.scheduledTasks.get(taskId);
    if (!task) return;

    task.enabled = !task.enabled;
    this.scheduledTasks.set(taskId, task);
    this.saveTasks();
    this.displayScheduledTasks();

    this.showNotification(`Task "${task.name}" ${task.enabled ? 'enabled' : 'disabled'}`, 'info');
  }

  pauseAllTasks() {
    let count = 0;
    this.scheduledTasks.forEach(task => {
      if (task.enabled) {
        task.enabled = false;
        count++;
      }
    });
    this.saveTasks();
    this.displayScheduledTasks();
    this.showNotification(count ? `Paused ${count} task${count === 1 ? '' : 's'}` : 'No active tasks to pause', 'info');
  }

  resumeAllTasks() {
    let count = 0;
    this.scheduledTasks.forEach(task => {
      if (!task.enabled) {
        task.enabled = true;
        count++;
      }
    });
    this.saveTasks();
    this.displayScheduledTasks();
    this.showNotification(count ? `Resumed ${count} task${count === 1 ? '' : 's'}` : 'No paused tasks to resume', 'info');
  }

  runSelectedTask() {
    const firstEnabled = Array.from(this.scheduledTasks.values()).find(task => task.enabled);
    if (!firstEnabled) {
      this.showNotification('No enabled task to run', 'warning');
      return;
    }
    this.runTaskNow(firstEnabled.id);
  }

  rerunTask(taskId) {
    this.runTaskNow(taskId);
  }

  cancelTask(taskId) {
    if (this.runningTasks.delete(taskId)) {
      this.loadSchedulerData();
      this.showNotification('Running task cancelled', 'info');
    } else {
      this.showNotification('Task is not running', 'warning');
    }
  }

  viewTaskLog(taskId) {
    const entries = this.taskHistory.filter(entry => entry.taskId === taskId).slice(0, 10);
    const body = entries.length
      ? entries.map(entry => `[${new Date(entry.startedAt).toLocaleString()}] ${entry.status}: ${entry.output}`).join('\n')
      : 'No runs recorded for this task yet.';
    this.showTextDialog('Task log', body);
  }

  viewOutput(entryId) {
    const entry = this.taskHistory.find(item => item.id === entryId);
    this.showTextDialog('Run output', entry ? String(entry.output || 'No output') : 'Entry not found.');
  }

  viewHistoryDetails(entryId) {
    const entry = this.taskHistory.find(item => item.id === entryId);
    if (!entry) {
      this.showNotification('History entry not found', 'warning');
      return;
    }
    this.showTextDialog(
      'Run details',
      [
        `Task: ${entry.taskName}`,
        `Started: ${new Date(entry.startedAt).toLocaleString()}`,
        `Completed: ${entry.completedAt ? new Date(entry.completedAt).toLocaleString() : 'n/a'}`,
        `Duration: ${this.formatDuration(entry.duration || 0)}`,
        `Status: ${entry.status}`,
        `Output: ${entry.output || 'n/a'}`
      ].join('\n')
    );
  }

  clearHistory() {
    if (this.taskHistory.length === 0) {
      this.showNotification('History is already empty', 'info');
      return;
    }
    if (confirm(`Clear all ${this.taskHistory.length} history entries?`)) {
      this.taskHistory = [];
      this.saveTasks();
      this.loadHistoryData();
      this.showNotification('Execution history cleared', 'info');
    }
  }

  exportHistory() {
    this.downloadJson(`cron-history-${new Date().toISOString().slice(0, 10)}.json`, this.taskHistory);
  }

  exportTasks() {
    this.downloadJson(
      `cron-tasks-${new Date().toISOString().slice(0, 10)}.json`,
      Array.from(this.scheduledTasks.values())
    );
  }

  importTasks() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const tasks = Array.isArray(data) ? data : data.tasks || [];
        let imported = 0;
        tasks.forEach(task => {
          if (task && task.name && task.schedule) {
            task.id = task.id || this.generateTaskId();
            this.scheduledTasks.set(task.id, task);
            imported++;
          }
        });
        this.saveTasks();
        await this.loadSchedulerData();
        this.showNotification(`Imported ${imported} task${imported === 1 ? '' : 's'}`, 'success');
      } catch (error) {
        this.showNotification(`Import failed: ${error.message}`, 'error');
      }
    };
    input.click();
  }

  downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  showTextDialog(title, body) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
    overlay.innerHTML = `
      <div class="sk-card" style="border-radius:8px;max-width:560px;width:90%;max-height:70vh;display:flex;flex-direction:column;background:var(--sk-card,#17241f);">
        <div style="padding:12px 16px;border-bottom:1px solid var(--sk-border,#263a34);font-weight:600;">${title}</div>
        <pre class="sk-code" style="padding:12px 16px;overflow:auto;white-space:pre-wrap;font-size:12px;margin:0;border:none;"></pre>
        <div style="padding:12px 16px;border-top:1px solid var(--sk-border,#263a34);text-align:right;">
          <button class="sk-btn" style="padding:6px 14px;">Close</button>
        </div>
      </div>`;
    overlay.querySelector('pre').textContent = body;
    overlay.querySelector('button').onclick = () => overlay.remove();
    overlay.addEventListener('click', event => {
      if (event.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  showSettings() {
    this.showTextDialog(
      'Scheduler settings',
      [
        'Tick interval: 60s (in-browser; schedules fire while the desktop is open)',
        `Tasks: ${this.scheduledTasks.size} defined, ${this.taskHistory.length} history entries kept (max 1000)`,
        'Backend ledger: task definitions persist to ipfs_kit_py on creation when confirmed.',
        '',
        'Local data lives in the swissknife-cron-tasks browser store.'
      ].join('\n')
    );
  }

  createCustomTemplate() {
    this.showNotification('Custom templates are created from the task form: choose "Custom Task" and set any cron schedule.', 'info');
    this.showTaskCreationModal();
  }

  importTemplate() {
    this.showNotification('Template import is not available; built-in templates cover AI, ML, storage, monitoring and network tasks.', 'info');
  }

  editTask(taskId) {
    const task = this.scheduledTasks.get(taskId);
    if (!task) return;
    this.showTaskCreationModal();
    setTimeout(() => {
      const nameInput = document.getElementById('task-name');
      const descInput = document.getElementById('task-description');
      const cronInput = document.getElementById('task-cron');
      const templateSelect = document.getElementById('task-template');
      if (nameInput) nameInput.value = task.name || '';
      if (descInput) descInput.value = task.description || '';
      if (cronInput) cronInput.value = task.schedule || '';
      if (templateSelect && task.templateId) {
        templateSelect.value = task.templateId;
        this.updateTemplateFields(task.templateId);
      }
      // Saving creates a new revision; remove the old entry first.
      this.scheduledTasks.delete(taskId);
      this.saveTasks();
    }, 100);
  }

  deleteTask(taskId) {
    const task = this.scheduledTasks.get(taskId);
    if (!task) return;
    
    if (confirm(`Are you sure you want to delete task "${task.name}"?`)) {
      this.scheduledTasks.delete(taskId);
      this.saveTasks();
      this.displayScheduledTasks();
      this.updateStats();
      
      this.showNotification(`Task "${task.name}" deleted`, 'info');
    }
  }

  useTemplate(templateId) {
    const template = this.taskTemplates.find(t => t.id === templateId);
    if (!template) return;
    
    this.showTaskCreationModal();
    
    // Set template
    setTimeout(() => {
      const templateSelect = document.getElementById('task-template');
      if (templateSelect) {
        templateSelect.value = templateId;
        this.updateTemplateFields(templateId);
      }
      
      // Pre-fill name
      const nameInput = document.getElementById('task-name');
      if (nameInput) {
        nameInput.value = template.name;
      }
      
      // Pre-fill description
      const descInput = document.getElementById('task-description');
      if (descInput) {
        descInput.value = template.description;
      }
    }, 100);
  }

  startCronProcessor() {
    if (this.cronJobInterval) {
      clearInterval(this.cronJobInterval);
    }
    
    // Check every minute for tasks to run
    this.cronJobInterval = setInterval(() => {
      this.processCronTasks();
    }, 60000);
  }

  processCronTasks() {
    const now = new Date();
    
    this.scheduledTasks.forEach(task => {
      if (!task.enabled) return;
      
      // Simple cron matching (would need proper cron library for production)
      if (this.shouldRunTask(task, now)) {
        this.runTaskNow(task.id);
      }
    });
  }

  getRelativeTime(date) {
    if (!date) return 'Unknown';
    const now = Date.now();
    const diff = now - (date instanceof Date ? date.getTime() : date);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }

  applyHistoryFilter(value) {
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = startOfToday - 6 * 86400000;
    const filtered = this.taskHistory.filter(entry => {
      switch (value) {
        case 'success': return entry.status === 'completed';
        case 'failed': return entry.status === 'failed';
        case 'today': return entry.startedAt >= startOfToday;
        case 'week': return entry.startedAt >= startOfWeek;
        default: return true;
      }
    });
    const previous = this.taskHistory;
    this.taskHistory = filtered;
    this.displayExecutionHistory();
    this.taskHistory = previous;
  }

  applyTaskFilter(value) {
    const container = document.getElementById('scheduled-tasks-container');
    if (!container) return;
    const tasks = Array.from(this.scheduledTasks.values()).filter(task => {
      switch (value) {
        case 'active': return task.enabled;
        case 'paused': return !task.enabled;
        case 'ai': return task.templateId === 'ai-summary' || task.templateId === 'ai-chat-analysis';
        case 'ml': return task.templateId === 'model-training';
        case 'p2p': return task.enableP2P;
        default: return true;
      }
    });
    const previous = this.scheduledTasks;
    this.scheduledTasks = new Map(tasks.map(task => [task.id, task]));
    this.displayScheduledTasks();
    this.scheduledTasks = previous;
  }

  loadSavedTasks() {
    try {
      const saved = localStorage.getItem('swissknife-cron-tasks');
      if (saved) {
        const data = JSON.parse(saved);
        this.scheduledTasks = new Map(data.tasks || []);
        this.taskHistory = data.history || [];
      }
    } catch (error) {
      console.error('Error loading saved tasks:', error);
    }
  }

  saveTasks() {
    try {
      const data = {
        tasks: Array.from(this.scheduledTasks.entries()),
        history: this.taskHistory.slice(0, 1000) // Keep last 1000 entries
      };
      localStorage.setItem('swissknife-cron-tasks', JSON.stringify(data));
    } catch (error) {
      console.error('Error saving tasks:', error);
    }
  }

  setupP2PTasking() {
    if (!this.p2pSystem) return;
    
    this.p2pSystem.on('task:request', (request) => {
      this.handleP2PTaskRequest(request);
    });
    
    this.p2pSystem.on('task:response', (response) => {
      this.handleP2PTaskResponse(response);
    });
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  onDestroy() {
    if (this.cronJobInterval) {
      clearInterval(this.cronJobInterval);
    }
    
    if (this.p2pSystem) {
      this.p2pSystem.off('task:request');
      this.p2pSystem.off('task:response');
    }
  }
}

// Export for global access
if (typeof window !== 'undefined') {
  window.CronApp = CronApp;
  window.createCronApp = (desktop) => new CronApp(desktop);
}