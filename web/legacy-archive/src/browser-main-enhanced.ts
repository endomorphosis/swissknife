/**
 * Enhanced SwissKnife Browser Main - Now with TypeScript integration
 */

// Import polyfills first
import './polyfills/browser-polyfills';

// Core SwissKnife utilities and integration bridge
import { generateId } from './utils/browser-utils';
import { swissknifeBridge, SwissKnifeBrowserBridge } from './swissknife-browser-bridge';

interface SwissKnifeApp {
  id: string;
  name: string;
  icon: string;
  description: string;
  handler: () => void;
}

class SwissKnifeBrowser {
  private apps: SwissKnifeApp[] = [];
  private initialized = false;
  private bridge: SwissKnifeBrowserBridge;

  constructor() {
    this.bridge = swissknifeBridge;
    this.setupBridgeEventHandlers();
    this.setupApps();
  }

  private setupApps(): void {
    this.apps = [
      {
        id: generateId(),
        name: 'AI Chat',
        icon: '🤖',
        description: 'Chat with AI models',
        handler: () => this.openAIChat()
      },
      {
        id: generateId(),
        name: 'File Manager',
        icon: '📁',
        description: 'Browse and manage files',
        handler: () => this.openFileManager()
      },
      {
        id: generateId(),
        name: 'Terminal',
        icon: '💻',
        description: 'Web-based terminal',
        handler: () => this.openTerminal()
      },
      {
        id: generateId(),
        name: 'Task Manager',
        icon: '📋',
        description: 'Manage tasks and workflows',
        handler: () => this.openTaskManager()
      },
      {
        id: generateId(),
        name: 'Graph Visualizer',
        icon: '🕸️',
        description: 'Visualize data relationships',
        handler: () => this.openGraphVisualizer()
      },
      {
        id: generateId(),
        name: 'Settings',
        icon: '⚙️',
        description: 'Configure SwissKnife',
        handler: () => this.openSettings()
      }
    ];
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize the SwissKnife bridge first
      await this.bridge.initialize();
      
      this.createDesktopEnvironment();
      this.setupEventHandlers();
      this.showWelcomeMessage();
      this.initialized = true;
      
      console.log('🔪 SwissKnife Browser Environment Initialized!');
      console.log('🌉 Connected to SwissKnife TypeScript functionality via bridge');
    } catch (error) {
      console.error('Failed to initialize SwissKnife Browser:', error);
      throw error;
    }
  }

  private createDesktopEnvironment(): void {
    const container = document.createElement('div');
    container.className = 'swissknife-desktop';
    container.innerHTML = `
      <style>
        .swissknife-desktop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: white;
          overflow: hidden;
        }
        .desktop-header {
          background: rgba(0, 0, 0, 0.2);
          padding: 10px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          backdrop-filter: blur(10px);
        }
        .desktop-title {
          font-size: 18px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .desktop-status {
          font-size: 14px;
          opacity: 0.8;
        }
        .desktop-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 20px;
          padding: 40px;
          max-width: 800px;
          margin: 0 auto;
        }
        .app-icon {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          padding: 20px;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
        }
        .app-icon:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
        }
        .app-emoji {
          font-size: 32px;
          margin-bottom: 8px;
          display: block;
        }
        .app-name {
          font-weight: 600;
          margin-bottom: 4px;
        }
        .app-description {
          font-size: 12px;
          opacity: 0.7;
          line-height: 1.3;
        }
        .welcome-panel {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(0, 0, 0, 0.8);
          border-radius: 12px;
          padding: 30px;
          text-align: center;
          max-width: 500px;
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .welcome-panel h2 {
          margin: 0 0 15px 0;
          font-size: 24px;
        }
        .welcome-panel p {
          margin: 0 0 20px 0;
          opacity: 0.8;
          line-height: 1.6;
        }
        .close-welcome {
          background: #4CAF50;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
        }
        .close-welcome:hover {
          background: #45a049;
        }
        .hidden {
          display: none;
        }
      </style>
      
      <div class="desktop-header">
        <div class="desktop-title">
          🔪 SwissKnife Browser
          <span style="font-size: 12px; background: rgba(76, 175, 80, 0.2); padding: 2px 8px; border-radius: 10px; color: #4CAF50;">v1.0.0</span>
        </div>
        <div class="desktop-status">
          Ready • ${this.apps.length} apps available
        </div>
      </div>
      
      <div class="desktop-grid">
        ${this.apps.map(app => `
          <div class="app-icon" data-app-id="${app.id}">
            <span class="app-emoji">${app.icon}</span>
            <div class="app-name">${app.name}</div>
            <div class="app-description">${app.description}</div>
          </div>
        `).join('')}
      </div>
      
      <div id="welcome-panel" class="welcome-panel">
        <h2>🎉 Welcome to SwissKnife Browser!</h2>
        <p>
          You've successfully integrated the SwissKnife TypeScript codebase with your browser environment!
          This demonstrates webpack compilation, browser compatibility, and modular architecture.
        </p>
        <p>
          <strong>Features Ready:</strong><br>
          ✅ TypeScript compilation<br>
          ✅ Browser adapters<br>
          ✅ Modular architecture<br>
          ✅ Desktop environment<br>
        </p>
        <button class="close-welcome" onclick="document.getElementById('welcome-panel').classList.add('hidden')">
          Start Using SwissKnife
        </button>
      </div>
    `;

    // Clear body and add our desktop
    document.body.innerHTML = '';
    document.body.appendChild(container);
  }

  private setupBridgeEventHandlers(): void {
    // Listen for bridge events to update UI
    this.bridge.on('initialized', (data) => {
      console.log('🌉 Bridge initialized with capabilities:', data.capabilities);
    });

    this.bridge.on('ai:requestStarted', (data) => {
      console.log('🤖 AI request started:', data);
    });

    this.bridge.on('ai:requestCompleted', (data) => {
      console.log('🤖 AI request completed:', data);
    });

    this.bridge.on('task:created', (task) => {
      console.log('📋 Task created:', task);
    });

    this.bridge.on('task:completed', (data) => {
      console.log('📋 Task completed:', data);
    });

    this.bridge.on('window:openRequested', (windowData) => {
      this.handleWindowOpenRequest(windowData);
    });

    this.bridge.on('fullIntegrationReady', (data) => {
      console.log('🚀 Full integration ready:', data);
      this.showIntegrationStatus(data);
    });
  }

  private handleWindowOpenRequest(windowData: any): void {
    switch (windowData.type) {
      case 'ai-chat':
        this.openEnhancedAIChat(windowData.data);
        break;
      case 'task-manager':
        this.openEnhancedTaskManager(windowData.data);
        break;
      case 'file-manager':
        this.openEnhancedFileManager(windowData.data);
        break;
    }
  }

  private showIntegrationStatus(data: any): void {
    // Update welcome panel or show notification about integration status
    const statusElement = document.getElementById('integration-status');
    if (statusElement) {
      statusElement.innerHTML = `
        <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 10px 0;">
          <h4 style="margin: 0 0 10px 0; color: #2d5016;">🚀 Integration Status</h4>
          <p style="margin: 0; color: #2d5016;">${data.message}</p>
          <details style="margin-top: 10px;">
            <summary style="cursor: pointer; font-weight: 600;">Available Adapters</summary>
            <ul style="margin: 5px 0; padding-left: 20px;">
              ${data.adapters.map((adapter: string) => `<li>✅ ${adapter}</li>`).join('')}
            </ul>
          </details>
        </div>
      `;
    }
  }

  private setupEventHandlers(): void {
    // App click handlers
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const appIcon = target.closest('.app-icon') as HTMLElement;
      
      if (appIcon) {
        const appId = appIcon.dataset.appId;
        const app = this.apps.find(a => a.id === appId);
        if (app) {
          app.handler();
        }
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case '1':
            event.preventDefault();
            this.openAIChat();
            break;
          case '2':
            event.preventDefault();
            this.openTerminal();
            break;
          case '3':
            event.preventDefault();
            this.openFileManager();
            break;
        }
      }
    });
  }

  private showWelcomeMessage(): void {
    // Welcome panel is shown by default in HTML
    setTimeout(() => {
      const panel = document.getElementById('welcome-panel');
      if (panel && !panel.classList.contains('hidden')) {
        console.log('👋 Welcome! Click on any app icon to get started.');
      }
    }, 1000);
  }

  // App handlers - now integrated with SwissKnife bridge
  private openAIChat(): void {
    this.bridge.openAIChat();
  }

  private openTerminal(): void {
    this.showAppWindow('Terminal', '💻', `
      <div style="padding: 20px;">
        <h3>Web Terminal</h3>
        <p>Browser-based terminal using SwissKnife command system.</p>
        <div style="background: #000; color: #0f0; padding: 15px; border-radius: 8px; font-family: monospace; margin: 15px 0;">
          $ swissknife --version<br>
          SwissKnife v1.0.0-browser<br>
          $ swissknife status<br>
          ✅ Bridge: Connected<br>
          ✅ AI: ${this.bridge.getCurrentAIProvider()?.name || 'Not configured'}<br>
          ✅ Tasks: ${this.bridge.getTaskStatistics().total} tasks<br>
          $ █
        </div>
        <button onclick="window.swissknifeBridge.executeTask('terminal-test')">Execute Test Command</button>
      </div>
    `);
  }

  private openFileManager(): void {
    this.bridge.openFileManager();
  }

  private openTaskManager(): void {
    this.bridge.openTaskManager();
  }

  // Enhanced app handlers using bridge data
  private openEnhancedAIChat(data: any): void {
    const providers = data.providers || [];
    const currentProvider = data.currentProvider;
    
    this.showAppWindow('AI Chat', '🤖', `
      <div style="padding: 20px;">
        <h3>AI Chat Interface</h3>
        <p>Connected to SwissKnife AI system with ${providers.length} providers available.</p>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <label style="display: block; margin-bottom: 10px;">
            <strong>AI Provider:</strong>
            <select id="ai-provider" style="margin-left: 10px; padding: 5px;">
              ${providers.map((p: any) => `
                <option value="${p.name.toLowerCase()}" ${p.name.toLowerCase() === currentProvider?.name?.toLowerCase() ? 'selected' : ''}>
                  ${p.name} (${p.models.length} models)
                </option>
              `).join('')}
            </select>
          </label>
          
          <div style="margin: 10px 0;">
            <textarea id="ai-prompt" placeholder="Enter your message..." 
              style="width: 100%; height: 100px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; resize: vertical;"></textarea>
          </div>
          
          <button onclick="window.testAIChat()" style="background: #007bff; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
            Send Message
          </button>
        </div>
        
        <div id="ai-response" style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 15px 0; display: none;">
          <strong>AI Response:</strong>
          <div id="ai-response-content"></div>
        </div>

        <script>
          window.testAIChat = async function() {
            const prompt = document.getElementById('ai-prompt').value;
            const responseDiv = document.getElementById('ai-response');
            const contentDiv = document.getElementById('ai-response-content');
            
            if (!prompt.trim()) {
              alert('Please enter a message');
              return;
            }
            
            responseDiv.style.display = 'block';
            contentDiv.innerHTML = 'Thinking...';
            
            try {
              const response = await window.swissknifeBridge.generateAIResponse(prompt);
              contentDiv.innerHTML = response.content.replace(/\\n/g, '<br>');
            } catch (error) {
              contentDiv.innerHTML = 'Error: ' + error.message;
            }
          };
        </script>
      </div>
    `);
  }

  private openEnhancedTaskManager(data: any): void {
    const tasks = data.tasks || [];
    const stats = data.statistics || {};
    
    this.showAppWindow('Task Manager', '📋', `
      <div style="padding: 20px;">
        <h3>Task Manager</h3>
        <p>Connected to SwissKnife task system with Graph-of-Thought integration.</p>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px; margin: 15px 0;">
          <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: bold; color: #1976d2;">${stats.total || 0}</div>
            <div style="color: #1976d2;">Total Tasks</div>
          </div>
          <div style="background: #fff3e0; padding: 15px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: bold; color: #f57c00;">${stats.running || 0}</div>
            <div style="color: #f57c00;">Running</div>
          </div>
          <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: bold; color: #388e3c;">${stats.completed || 0}</div>
            <div style="color: #388e3c;">Completed</div>
          </div>
        </div>
        
        <div style="margin: 20px 0;">
          <button onclick="window.createDemoTask()" style="background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px;">
            Create Demo Task
          </button>
          <button onclick="window.showTaskList()" style="background: #007bff; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
            View All Tasks
          </button>
        </div>
        
        <div id="task-list" style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
          ${tasks.length > 0 ? tasks.map((task: any) => `
            <div style="background: white; padding: 10px; margin: 5px 0; border-radius: 4px; border-left: 4px solid ${
              task.status === 'completed' ? '#28a745' : 
              task.status === 'running' ? '#ffc107' : 
              task.status === 'failed' ? '#dc3545' : '#6c757d'
            };">
              <strong>${task.title}</strong>
              <span style="float: right; font-size: 12px; color: #666;">${task.status}</span>
              <br>
              <small style="color: #666;">${task.description || 'No description'}</small>
            </div>
          `).join('') : '<div style="text-align: center; color: #666;">No tasks yet. Create one to get started!</div>'}
        </div>

        <script>
          window.createDemoTask = function() {
            const task = window.swissknifeBridge.createTask({
              title: 'Demo Task ' + Date.now(),
              description: 'A demonstration task created from the browser interface',
              priority: 'medium'
            });
            alert('Task created: ' + task.title);
            window.location.reload();
          };
          
          window.showTaskList = function() {
            const tasks = window.swissknifeBridge.listTasks();
            console.log('Current tasks:', tasks);
            alert('Check console for full task list');
          };
        </script>
      </div>
    `);
  }

  private openEnhancedFileManager(data: any): void {
    const capabilities = data.capabilities || {};
    
    this.showAppWindow('File Manager', '📁', `
      <div style="padding: 20px;">
        <h3>File Manager</h3>
        <p>Browser-based file management with SwissKnife integration.</p>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h4>Browser Capabilities:</h4>
          <ul style="margin: 0; padding-left: 20px;">
            <li>📁 Local Storage: ${capabilities.localStorage ? '✅' : '❌'}</li>
            <li>🗄️ IndexedDB: ${capabilities.indexedDB ? '✅' : '❌'}</li>
            <li>📤 File API: ${typeof FileReader !== 'undefined' ? '✅' : '❌'}</li>
            <li>📥 Download API: ${typeof URL.createObjectURL !== 'undefined' ? '✅' : '❌'}</li>
          </ul>
        </div>
        
        <div style="margin: 20px 0;">
          <input type="file" id="file-input" style="margin-right: 10px;">
          <button onclick="window.handleFileUpload()" style="background: #007bff; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px;">
            Load File
          </button>
          <button onclick="window.exportData()" style="background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
            Export Data
          </button>
        </div>
        
        <div id="file-content" style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; min-height: 100px;">
          <div style="text-align: center; color: #666;">Select a file to view its contents</div>
        </div>

        <script>
          window.handleFileUpload = function() {
            const fileInput = document.getElementById('file-input');
            const file = fileInput.files[0];
            if (!file) {
              alert('Please select a file');
              return;
            }
            
            const reader = new FileReader();
            reader.onload = function(e) {
              document.getElementById('file-content').innerHTML = 
                '<pre style="white-space: pre-wrap; max-height: 300px; overflow-y: auto;">' + 
                e.target.result + 
                '</pre>';
            };
            reader.readAsText(file);
          };
          
          window.exportData = async function() {
            try {
              const data = await window.swissknifeBridge.exportData();
              const blob = new Blob([data], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'swissknife-data.json';
              a.click();
              URL.revokeObjectURL(url);
            } catch (error) {
              alert('Export failed: ' + error.message);
            }
          };
        </script>
      </div>
    `);
  }
    this.showAppWindow('Graph Visualizer', '🕸️', `
      <div style="padding: 20px;">
        <h3>Graph Visualizer</h3>
        <p>Visualize data relationships and Graph-of-Thought structures.</p>
        <div style="background: #fff3e0; color: #333; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <strong>Visualization Features:</strong><br>
          • Task dependency graphs<br>
          • AI reasoning chains<br>
          • Data flow diagrams<br>
        </div>
        <button onclick="alert('Graph Visualizer ready for integration!')">View Graphs</button>
      </div>
    `);
  }

  private openSettings(): void {
    this.showAppWindow('Settings', '⚙️', `
      <div style="padding: 20px;">
        <h3>SwissKnife Settings</h3>
        <p>Configure your SwissKnife browser environment.</p>
        <div style="margin: 15px 0;">
          <label style="display: block; margin: 10px 0;">
            <input type="checkbox" checked> Enable AI features
          </label>
          <label style="display: block; margin: 10px 0;">
            <input type="checkbox" checked> Use IndexedDB storage
          </label>
          <label style="display: block; margin: 10px 0;">
            <input type="checkbox"> Debug mode
          </label>
        </div>
        <button onclick="alert('Settings saved!')">Save Settings</button>
      </div>
    `);
  }

  private showAppWindow(title: string, icon: string, content: string): void {
    // Remove any existing app windows
    const existingWindow = document.querySelector('.app-window');
    if (existingWindow) {
      existingWindow.remove();
    }

    const windowElement = document.createElement('div');
    windowElement.className = 'app-window';
    windowElement.innerHTML = `
      <style>
        .app-window {
          position: fixed;
          top: 10%;
          left: 50%;
          transform: translateX(-50%);
          width: 90%;
          max-width: 600px;
          background: white;
          color: #333;
          border-radius: 12px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          z-index: 1000;
          overflow: hidden;
        }
        .app-window-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 15px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .app-window-title {
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .app-window-close {
          background: rgba(255, 255, 255, 0.2);
          border: none;
          color: white;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 16px;
        }
        .app-window-close:hover {
          background: rgba(255, 255, 255, 0.3);
        }
        .app-window-content {
          max-height: 70vh;
          overflow-y: auto;
        }
      </style>
      
      <div class="app-window-header">
        <div class="app-window-title">
          ${icon} ${title}
        </div>
        <button class="app-window-close" onclick="this.closest('.app-window').remove()">×</button>
      </div>
      <div class="app-window-content">
        ${content}
      </div>
    `;

    document.body.appendChild(windowElement);
  }

  // Public API
  getApps(): SwissKnifeApp[] {
    return [...this.apps];
  }

  addApp(app: SwissKnifeApp): void {
    this.apps.push(app);
    if (this.initialized) {
      // Refresh desktop if already initialized
      this.createDesktopEnvironment();
      this.setupEventHandlers();
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getBridge(): SwissKnifeBrowserBridge {
    return this.bridge;
  }
}

// Initialize when DOM is ready
const swissknifeBrowser = new SwissKnifeBrowser();

const initializeApp = async () => {
  try {
    await swissknifeBrowser.initialize();
    console.log('🚀 SwissKnife Browser is ready!');
    
    // Make both the browser and bridge globally available for debugging and interaction
    (window as any).swissknife = swissknifeBrowser;
    (window as any).swissknifeBridge = swissknifeBrowser.getBridge();
    
    // Initialize full integration
    await swissknifeBrowser.getBridge().integrateWithFullSwissKnife();
    
  } catch (error) {
    console.error('❌ Failed to initialize SwissKnife Browser:', error);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

export { SwissKnifeBrowser, swissknifeBrowser };
