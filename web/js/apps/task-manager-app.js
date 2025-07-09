/**
 * Task Manager App for SwissKnife Web Desktop
 */

window.TaskManagerApp = class TaskManagerApp {
  constructor(desktop) {
    this.desktop = desktop;
  }

  async initialize() {
    // No specific initialization needed for this simple app
  }

  createWindow() {
    const content = `
      <div class="task-manager-app">
          <div class="app-header">
              <h2>⚡ Task Manager</h2>
          </div>
          <div class="tasks-content">
              <div class="task-list">
                  <h3>Running Processes</h3>
                  <div class="process-item">
                      <span class="process-name">SwissKnife Desktop</span>
                      <span class="process-cpu">15%</span>
                      <span class="process-memory">128MB</span>
                  </div>
                  <div class="process-item">
                      <span class="process-name">AI Engine</span>
                      <span class="process-cpu">8%</span>
                      <span class="process-memory">64MB</span>
                  </div>
                  <div class="process-item">
                      <span class="process-name">Storage Engine</span>
                      <span class="process-cpu">3%</span>
                      <span class="process-memory">32MB</span>
                  </div>
                  <div class="process-item">
                      <span class="process-name">Window Manager</span>
                      <span class="process-cpu">2%</span>
                      <span class="process-memory">16MB</span>
                  </div>
              </div>
              <div class="system-stats">
                  <h3>System Resources</h3>
                  <div class="stat-row">
                      <span>CPU Usage:</span>
                      <div class="progress-bar">
                          <div class="progress-fill" style="width: 28%"></div>
                      </div>
                      <span>28%</span>
                  </div>
                  <div class="stat-row">
                      <span>Memory:</span>
                      <div class="progress-bar">
                          <div class="progress-fill" style="width: 45%"></div>
                      </div>
                      <span>240MB / 512MB</span>
                  </div>
                  <div class="stat-row">
                      <span>Storage:</span>
                      <div class="progress-bar">
                          <div class="progress-fill" style="width: 12%"></div>
                      </div>
                      <span>120MB / 1GB</span>
                  </div>
              </div>
          </div>
      </div>
    `;

    const window = this.desktop.createWindow({
      title: 'Task Manager',
      content: content,
      width: 600,
      height: 400,
      resizable: true
    });

    // No specific event listeners for this simple app yet

    return window;
  }
}
