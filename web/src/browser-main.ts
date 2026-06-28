/**
 * Browser Main Entry Point
 * 
 * This is the main entry point for the SwissKnife browser application.
 * It initializes the desktop environment and integrates with the compiled TypeScript core.
 */

import { SwissKnifeBrowserCore } from './swissknife-browser-core';

// Global error handling
window.addEventListener('error', (event) => {
  console.error('Browser Error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Promise Rejection:', event.reason);
});

// Initialize SwissKnife when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  console.log('SwissKnife Browser - Initializing...');
  
  try {
    // Initialize SwissKnife core
    const swissknife = new SwissKnifeBrowserCore({
      storage: {
        type: 'indexeddb',
        dbName: 'swissknife-web'
      },
      ai: {
        autoRegisterModels: true,
        autoRegisterTools: true
      },
      config: {
        debug: true
      }
    });
    
    await swissknife.initialize();
    
    // Make SwissKnife globally available
    (window as any).SwissKnife = swissknife;
    
    // Initialize desktop environment
    await initializeDesktop(swissknife);
    
    console.log('SwissKnife Browser - Initialized successfully');
    
  } catch (error) {
    console.error('Failed to initialize SwissKnife:', error);
    showError('Failed to initialize SwissKnife: ' + error.message);
  }
});

async function initializeDesktop(swissknife: SwissKnifeBrowserCore) {
  // Initialize desktop icons
  initializeDesktopIcons(swissknife);
  
  // Initialize taskbar
  initializeTaskbar(swissknife);
  
  // Initialize window manager
  initializeWindowManager();
  
  // Hide loading overlay
  hideLoadingOverlay();
}

function initializeDesktopIcons(swissknife: SwissKnifeBrowserCore) {
  const icons = document.querySelectorAll('.desktop-icon');
  
  icons.forEach(icon => {
    icon.addEventListener('click', async (event) => {
      const target = event.currentTarget as HTMLElement;
      const appName = target.getAttribute('data-app');
      
      if (appName) {
        try {
          await openApplication(appName, swissknife);
        } catch (error) {
          console.error(`Failed to open application ${appName}:`, error);
          showError(`Failed to open ${appName}: ` + error.message);
        }
      }
    });
    
    // Add double-click support
    icon.addEventListener('dblclick', (event) => {
      event.preventDefault();
      icon.dispatchEvent(new Event('click'));
    });
  });
}

function initializeTaskbar(swissknife: SwissKnifeBrowserCore) {
  const startButton = document.getElementById('start-button');
  
  if (startButton) {
    startButton.addEventListener('click', () => {
      // Show start menu or application launcher
      showStartMenu(swissknife);
    });
  }
  
  // Update status indicators
  updateStatusIndicators(swissknife);
  setInterval(() => updateStatusIndicators(swissknife), 5000);
}

function initializeWindowManager() {
  // Window management functionality
  document.addEventListener('click', (event) => {
    // Close context menus when clicking elsewhere
    const contextMenus = document.querySelectorAll('.context-menu');
    contextMenus.forEach(menu => menu.remove());
  });
  
  // Handle window dragging, resizing, etc.
  setupWindowDragging();
}

function setupWindowDragging() {
  let draggedWindow: HTMLElement | null = null;
  let dragOffset = { x: 0, y: 0 };
  
  document.addEventListener('mousedown', (event) => {
    const target = event.target as HTMLElement;
    const windowHeader = target.closest('.window-header');
    
    if (windowHeader) {
      const window = windowHeader.closest('.window') as HTMLElement;
      if (window) {
        draggedWindow = window;
        const rect = window.getBoundingClientRect();
        dragOffset = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top
        };
        window.style.zIndex = '1000';
      }
    }
  });
  
  document.addEventListener('mousemove', (event) => {
    if (draggedWindow) {
      draggedWindow.style.left = (event.clientX - dragOffset.x) + 'px';
      draggedWindow.style.top = (event.clientY - dragOffset.y) + 'px';
    }
  });
  
  document.addEventListener('mouseup', () => {
    if (draggedWindow) {
      draggedWindow.style.zIndex = '100';
      draggedWindow = null;
    }
  });
}

async function openApplication(appName: string, swissknife: SwissKnifeBrowserCore) {
  console.log(`Opening application: ${appName}`);
  
  const applications = {
    'terminal': () => openTerminal(swissknife),
    'ai-chat': () => openAIChat(swissknife),
    'file-manager': () => openFileManager(swissknife),
    'settings': () => openSettings(swissknife),
    'code-editor': () => openCodeEditor(swissknife),
    'task-manager': () => openTaskManager(swissknife),
    'model-browser': () => openModelBrowser(swissknife),
    'ipfs-explorer': () => openIPFSExplorer(swissknife),
    'datasets-browser': () => openDatasetsBrowser(swissknife),
    'accelerate-panel': () => openAcceleratePanel(swissknife),
  };
  
  const openApp = applications[appName as keyof typeof applications];
  if (openApp) {
    await openApp();
  } else {
    throw new Error(`Unknown application: ${appName}`);
  }
}

async function openTerminal(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('terminal', 'SwissKnife Terminal', 600, 400);
  const content = window.querySelector('.window-content') as HTMLElement;
  
  content.innerHTML = `
    <div id="terminal-container" style="
      font-family: 'Courier New', monospace;
      background: #1e1e1e;
      color: #ffffff;
      padding: 10px;
      height: 100%;
      overflow-y: auto;
    ">
      <div id="terminal-output"></div>
      <div style="display: flex; align-items: center;">
        <span style="color: #00ff00;">swissknife:$ </span>
        <input type="text" id="terminal-input" style="
          background: transparent;
          border: none;
          color: white;
          outline: none;
          flex: 1;
          font-family: inherit;
        " autocomplete="off">
      </div>
    </div>
  `;
  
  const input = content.querySelector('#terminal-input') as HTMLInputElement;
  const output = content.querySelector('#terminal-output') as HTMLElement;
  
  input.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
      const command = input.value.trim();
      if (command) {
        output.innerHTML += `<div style="margin: 5px 0;"><span style="color: #00ff00;">swissknife:$ </span>${command}</div>`;
        
        try {
          const result = await swissknife.executeCommand(command);
          if (result.output) {
            output.innerHTML += `<div style="margin: 5px 0; white-space: pre-wrap;">${result.output}</div>`;
          }
          if (result.error) {
            output.innerHTML += `<div style="margin: 5px 0; color: #ff6b6b;">${result.error}</div>`;
          }
        } catch (error) {
          output.innerHTML += `<div style="margin: 5px 0; color: #ff6b6b;">Error: ${error.message}</div>`;
        }
        
        input.value = '';
        output.scrollTop = output.scrollHeight;
      }
    }
  });
  
  input.focus();
}

async function openAIChat(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('ai-chat', 'AI Chat Assistant', 500, 600);
  const content = window.querySelector('.window-content') as HTMLElement;
  
  content.innerHTML = `
    <div style="display: flex; flex-direction: column; height: 100%;">
      <div id="chat-messages" style="
        flex: 1;
        overflow-y: auto;
        padding: 10px;
        background: #f5f5f5;
        border-radius: 8px;
        margin-bottom: 10px;
      "></div>
      <div style="display: flex; gap: 10px;">
        <input type="text" id="chat-input" placeholder="Ask me anything..." style="
          flex: 1;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          outline: none;
        ">
        <button id="send-button" style="
          padding: 10px 20px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        ">Send</button>
      </div>
    </div>
  `;
  
  const messages = content.querySelector('#chat-messages') as HTMLElement;
  const input = content.querySelector('#chat-input') as HTMLInputElement;
  const sendButton = content.querySelector('#send-button') as HTMLElement;
  
  const sendMessage = async () => {
    const message = input.value.trim();
    if (!message) return;
    
    // Add user message
    messages.innerHTML += `
      <div style="margin: 10px 0; text-align: right;">
        <div style="
          display: inline-block;
          background: #667eea;
          color: white;
          padding: 8px 12px;
          border-radius: 12px;
          max-width: 70%;
        ">${message}</div>
      </div>
    `;
    
    input.value = '';
    messages.scrollTop = messages.scrollHeight;
    
    try {
      const response = await swissknife.generateAIResponse(message);
      
      // Add AI response
      messages.innerHTML += `
        <div style="margin: 10px 0;">
          <div style="
            display: inline-block;
            background: white;
            color: #333;
            padding: 8px 12px;
            border-radius: 12px;
            max-width: 70%;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          ">${response.content}</div>
        </div>
      `;
    } catch (error) {
      messages.innerHTML += `
        <div style="margin: 10px 0;">
          <div style="
            display: inline-block;
            background: #ff6b6b;
            color: white;
            padding: 8px 12px;
            border-radius: 12px;
            max-width: 70%;
          ">Error: ${error.message}</div>
        </div>
      `;
    }
    
    messages.scrollTop = messages.scrollHeight;
  };
  
  sendButton.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      sendMessage();
    }
  });
  
  input.focus();
}

async function openFileManager(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('file-manager', 'File Manager', 700, 500);
  const content = window.querySelector('.window-content') as HTMLElement;
  
  content.innerHTML = `
    <div style="display: flex; flex-direction: column; height: 100%;">
      <div style="margin-bottom: 10px;">
        <input type="text" id="current-path" value="/" readonly style="
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          background: #f9f9f9;
        ">
      </div>
      <div id="file-list" style="
        flex: 1;
        border: 1px solid #ddd;
        border-radius: 4px;
        overflow-y: auto;
        background: white;
      "></div>
    </div>
  `;
  
  await refreshFileList(swissknife, content);
}

async function refreshFileList(swissknife: SwissKnifeBrowserCore, container: HTMLElement) {
  const pathInput = container.querySelector('#current-path') as HTMLInputElement;
  const fileList = container.querySelector('#file-list') as HTMLElement;
  const currentPath = pathInput.value;
  
  try {
    const result = await swissknife.executeCommand(`ls ${currentPath}`);
    const files = result.output ? result.output.split('\n').filter(f => f.trim()) : [];
    
    fileList.innerHTML = files.map(file => `
      <div style="
        padding: 8px 12px;
        border-bottom: 1px solid #eee;
        cursor: pointer;
        transition: background 0.2s;
      " onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'">
        📁 ${file}
      </div>
    `).join('');
  } catch (error) {
    fileList.innerHTML = `<div style="padding: 20px; text-align: center; color: #666;">Error loading directory</div>`;
  }
}

async function openSettings(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('settings', 'Settings', 600, 500);
  const content = window.querySelector('.window-content') as HTMLElement;
  
  content.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 20px;">
      <h3>SwissKnife Settings</h3>
      
      <div>
        <h4>Storage Settings</h4>
        <p>Storage Type: IndexedDB</p>
        <p>Available Models: ${swissknife.getAvailableModels().join(', ') || 'None configured'}</p>
      </div>
      
      <div>
        <h4>AI Settings</h4>
        <label style="display: block; margin: 10px 0;">
          <input type="checkbox" id="enable-local-models"> Enable Local Models
        </label>
        <label style="display: block; margin: 10px 0;">
          <input type="checkbox" id="enable-web-workers" checked> Use Web Workers
        </label>
      </div>
      
      <div>
        <h4>About</h4>
        <p>SwissKnife Browser Edition</p>
        <p>Version: 0.0.53</p>
        <p>Build: Webpack + TypeScript</p>
      </div>
    </div>
  `;
}

async function openCodeEditor(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('code-editor', 'VibeCode Editor', 800, 600);
  const content = window.querySelector('.window-content') as HTMLElement;
  
  content.innerHTML = `
    <div style="display: flex; flex-direction: column; height: 100%;">
      <div style="border-bottom: 1px solid #ddd; padding: 10px;">
        <input type="text" placeholder="Enter filename..." style="padding: 5px; border: 1px solid #ddd; border-radius: 3px;">
        <button style="padding: 5px 10px; margin-left: 10px; background: #667eea; color: white; border: none; border-radius: 3px;">Open</button>
        <button style="padding: 5px 10px; margin-left: 5px; background: #28a745; color: white; border: none; border-radius: 3px;">Save</button>
      </div>
      <textarea style="
        flex: 1;
        border: none;
        padding: 10px;
        font-family: 'Courier New', monospace;
        font-size: 14px;
        resize: none;
        outline: none;
      " placeholder="// Start coding..."></textarea>
    </div>
  `;
}

async function openTaskManager(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('task-manager', 'Task Manager', 600, 400);
  const content = window.querySelector('.window-content') as HTMLElement;
  
  content.innerHTML = `
    <div>
      <h3>Active Tasks</h3>
      <p>No active tasks</p>
      
      <h3 style="margin-top: 20px;">System Status</h3>
      <div style="font-family: monospace; background: #f5f5f5; padding: 10px; border-radius: 4px;">
        Memory Usage: ~${Math.round((performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0)}MB<br>
        Storage: IndexedDB<br>
        AI Status: ${swissknife.getAvailableModels().length > 0 ? 'Ready' : 'No models configured'}<br>
        Uptime: ${Math.floor((Date.now() - (window as any).startTime || Date.now()) / 1000)}s
      </div>
    </div>
  `;
}

async function openModelBrowser(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('model-browser', 'Model Browser', 700, 500);
  const content = window.querySelector('.window-content') as HTMLElement;
  
  const models = swissknife.getAvailableModels();
  
  content.innerHTML = `
    <div>
      <h3>Available AI Models</h3>
      ${models.length > 0 ? 
        models.map(model => `
          <div style="
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 15px;
            margin: 10px 0;
            background: white;
          ">
            <h4>${model}</h4>
            <p>Status: Ready</p>
            <button style="
              background: #667eea;
              color: white;
              border: none;
              padding: 5px 15px;
              border-radius: 4px;
              cursor: pointer;
            ">Test Model</button>
          </div>
        `).join('') :
        '<p>No models configured. Please add AI API keys in Settings.</p>'
      }
    </div>
  `;
}

async function openIPFSExplorer(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('ipfs-explorer', 'IPFS Explorer', 750, 550);
  const content = window.querySelector('.window-content') as HTMLElement;
  
  const BACKEND = 'http://localhost:8080';
  
  content.innerHTML = `
    <div style="display: flex; flex-direction: column; height: 100%; font-family: system-ui, sans-serif;">
      <div style="display: flex; gap: 8px; padding: 10px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
        <input type="text" id="ipfs-cid-input" placeholder="Enter CID (e.g., QmXYZ...)" style="
          flex: 1; padding: 8px 12px; border: 1px solid #cbd5e0; border-radius: 6px; font-size: 13px;
        ">
        <button id="ipfs-fetch-btn" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">Fetch</button>
        <button id="ipfs-stat-btn" style="padding: 8px 16px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">Stat</button>
        <button id="ipfs-pin-btn" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">Pin</button>
      </div>
      
      <div style="display: flex; gap: 8px; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; background: #f1f5f9;">
        <button class="ipfs-tab active" data-tab="content" style="padding: 6px 12px; border: 1px solid #cbd5e0; border-radius: 4px; background: #fff; cursor: pointer; font-size: 12px;">Content</button>
        <button class="ipfs-tab" data-tab="pins" style="padding: 6px 12px; border: 1px solid #cbd5e0; border-radius: 4px; background: transparent; cursor: pointer; font-size: 12px;">Pinned</button>
        <button class="ipfs-tab" data-tab="dag" style="padding: 6px 12px; border: 1px solid #cbd5e0; border-radius: 4px; background: transparent; cursor: pointer; font-size: 12px;">DAG</button>
        <button class="ipfs-tab" data-tab="names" style="padding: 6px 12px; border: 1px solid #cbd5e0; border-radius: 4px; background: transparent; cursor: pointer; font-size: 12px;">IPNS</button>
        <span id="ipfs-status-badge" style="margin-left: auto; font-size: 11px; padding: 4px 8px; border-radius: 10px; background: #fef3c7; color: #92400e;">Checking...</span>
      </div>
      
      <div id="ipfs-content-area" style="flex: 1; padding: 12px; overflow-y: auto; background: #fff;">
        <div style="text-align: center; padding: 40px; color: #94a3b8;">
          Enter a CID above and click Fetch, or browse pinned content.
        </div>
      </div>
      
      <div id="ipfs-status-bar" style="padding: 6px 12px; border-top: 1px solid #e2e8f0; background: #f8fafc; font-size: 11px; color: #64748b;">
        Backend: localhost:8080 | Kit: :8004 | Ready
      </div>
    </div>
  `;
  
  const cidInput = content.querySelector('#ipfs-cid-input') as HTMLInputElement;
  const contentArea = content.querySelector('#ipfs-content-area') as HTMLElement;
  const statusBadge = content.querySelector('#ipfs-status-badge') as HTMLElement;
  const statusBar = content.querySelector('#ipfs-status-bar') as HTMLElement;
  
  async function backendFetch(path: string, opts: any = {}) {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const resp = await fetch(`${BACKEND}${path}`, { ...opts, signal: ctrl.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }
  
  // Check backend status
  try {
    await backendFetch('/v1/ipfs/status');
    statusBadge.textContent = 'Online';
    statusBadge.style.background = '#dcfce7';
    statusBadge.style.color = '#166534';
  } catch {
    statusBadge.textContent = 'Offline';
    statusBadge.style.background = '#fee2e2';
    statusBadge.style.color = '#991b1b';
  }
  
  // Fetch content
  content.querySelector('#ipfs-fetch-btn')?.addEventListener('click', async () => {
    const cid = cidInput.value.trim();
    if (!cid) return;
    contentArea.innerHTML = '<div style="padding: 20px; color: #64748b;">Fetching...</div>';
    try {
      const data = await backendFetch(`/v1/ipfs/cat?cid=${encodeURIComponent(cid)}`);
      contentArea.innerHTML = `<pre style="padding: 12px; background: #1e293b; color: #e2e8f0; border-radius: 6px; font-size: 12px; overflow: auto; white-space: pre-wrap;">${JSON.stringify(data, null, 2)}</pre>`;
      statusBar.textContent = `Fetched CID: ${cid.slice(0, 20)}...`;
    } catch (e: any) {
      contentArea.innerHTML = `<div style="padding: 20px; color: #ef4444;">Error: ${e.message}</div>`;
    }
  });
  
  // Stat
  content.querySelector('#ipfs-stat-btn')?.addEventListener('click', async () => {
    const cid = cidInput.value.trim();
    if (!cid) return;
    try {
      const data = await backendFetch(`/v1/ipfs/stat?cid=${encodeURIComponent(cid)}`);
      contentArea.innerHTML = `<pre style="padding: 12px; background: #f0fdf4; color: #166534; border-radius: 6px; font-size: 12px; overflow: auto;">${JSON.stringify(data, null, 2)}</pre>`;
    } catch (e: any) {
      contentArea.innerHTML = `<div style="padding: 20px; color: #ef4444;">Error: ${e.message}</div>`;
    }
  });
  
  // Pin
  content.querySelector('#ipfs-pin-btn')?.addEventListener('click', async () => {
    const cid = cidInput.value.trim();
    if (!cid) return;
    try {
      await backendFetch('/v1/ipfs/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cid }) });
      statusBar.textContent = `Pinned: ${cid.slice(0, 20)}...`;
    } catch (e: any) {
      contentArea.innerHTML = `<div style="padding: 20px; color: #ef4444;">Pin failed: ${e.message}</div>`;
    }
  });
  
  // Tab switching
  content.querySelectorAll('.ipfs-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      content.querySelectorAll('.ipfs-tab').forEach(t => { (t as HTMLElement).style.background = 'transparent'; t.classList.remove('active'); });
      (tab as HTMLElement).style.background = '#fff';
      tab.classList.add('active');
      const tabName = (tab as HTMLElement).dataset.tab;
      
      if (tabName === 'pins') {
        contentArea.innerHTML = '<div style="padding: 20px; color: #64748b;">Loading pins...</div>';
        try {
          const data = await backendFetch('/v1/ipfs/list_pins');
          const pins = data.pins || data || [];
          contentArea.innerHTML = Array.isArray(pins) && pins.length > 0
            ? pins.map((p: any) => `<div style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-family: monospace; font-size: 12px;">${typeof p === 'string' ? p : p.cid || JSON.stringify(p)}</div>`).join('')
            : `<pre style="padding: 12px; font-size: 12px;">${JSON.stringify(data, null, 2)}</pre>`;
        } catch (e: any) {
          contentArea.innerHTML = `<div style="padding: 20px; color: #ef4444;">Error: ${e.message}</div>`;
        }
      } else if (tabName === 'dag') {
        contentArea.innerHTML = `<div style="padding: 20px; color: #64748b;">Enter a CID and click Fetch to explore its DAG structure.</div>`;
        const cid = cidInput.value.trim();
        if (cid) {
          try {
            const data = await backendFetch(`/v1/ipfs/dag/get?cid=${encodeURIComponent(cid)}`);
            contentArea.innerHTML = `<pre style="padding: 12px; background: #fffbeb; color: #78350f; border-radius: 6px; font-size: 12px; overflow: auto;">${JSON.stringify(data, null, 2)}</pre>`;
          } catch (e: any) {
            contentArea.innerHTML = `<div style="padding: 20px; color: #ef4444;">DAG error: ${e.message}</div>`;
          }
        }
      } else if (tabName === 'names') {
        contentArea.innerHTML = '<div style="padding: 20px; color: #64748b;">IPNS name operations. Enter a name to resolve or a CID to publish.</div>';
      } else {
        contentArea.innerHTML = '<div style="text-align: center; padding: 40px; color: #94a3b8;">Enter a CID above and click Fetch.</div>';
      }
    });
  });
}

async function openDatasetsBrowser(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('datasets-browser', 'IPFS Datasets Browser', 700, 500);
  const content = window.querySelector('.window-content') as HTMLElement;
  const BACKEND = 'http://localhost:8080';
  
  content.innerHTML = `
    <div style="display: flex; flex-direction: column; height: 100%; font-family: system-ui, sans-serif;">
      <div style="padding: 12px; border-bottom: 1px solid #e2e8f0; background: #f0fdf4;">
        <div style="display: flex; gap: 8px;">
          <input type="text" id="ds-search" placeholder="Search datasets..." style="flex: 1; padding: 8px 12px; border: 1px solid #86efac; border-radius: 6px; font-size: 13px;">
          <button id="ds-search-btn" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer;">Search</button>
          <button id="ds-list-btn" style="padding: 8px 16px; background: #059669; color: white; border: none; border-radius: 6px; cursor: pointer;">List All</button>
        </div>
      </div>
      
      <div style="padding: 10px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
        <strong style="font-size: 12px; color: #475569;">Quick Actions:</strong>
        <button class="ds-action" data-action="embed" style="margin-left: 8px; padding: 4px 10px; border: 1px solid #cbd5e0; border-radius: 4px; background: white; cursor: pointer; font-size: 12px;">Generate Embeddings</button>
        <button class="ds-action" data-action="generate" style="margin-left: 4px; padding: 4px 10px; border: 1px solid #cbd5e0; border-radius: 4px; background: white; cursor: pointer; font-size: 12px;">Generate Text</button>
      </div>
      
      <div id="ds-results" style="flex: 1; padding: 12px; overflow-y: auto;">
        <div style="text-align: center; padding: 40px; color: #94a3b8;">Search or list datasets to get started.</div>
      </div>
    </div>
  `;
  
  const results = content.querySelector('#ds-results') as HTMLElement;
  
  async function backendFetch(path: string, opts: any = {}) {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const resp = await fetch(`${BACKEND}${path}`, { ...opts, signal: ctrl.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }
  
  content.querySelector('#ds-list-btn')?.addEventListener('click', async () => {
    results.innerHTML = '<div style="padding: 20px; color: #64748b;">Loading datasets...</div>';
    try {
      const data = await backendFetch('/v1/ipfs/list_datasets');
      results.innerHTML = `<pre style="padding: 12px; background: #f0fdf4; border-radius: 6px; font-size: 12px; overflow: auto;">${JSON.stringify(data, null, 2)}</pre>`;
    } catch (e: any) {
      results.innerHTML = `<div style="padding: 20px; color: #ef4444;">Error: ${e.message}</div>`;
    }
  });
  
  content.querySelector('#ds-search-btn')?.addEventListener('click', async () => {
    const query = (content.querySelector('#ds-search') as HTMLInputElement).value.trim();
    if (!query) return;
    results.innerHTML = '<div style="padding: 20px; color: #64748b;">Searching...</div>';
    try {
      const data = await backendFetch(`/v1/ipfs/search_datasets?query=${encodeURIComponent(query)}`);
      results.innerHTML = `<pre style="padding: 12px; background: #f0fdf4; border-radius: 6px; font-size: 12px; overflow: auto;">${JSON.stringify(data, null, 2)}</pre>`;
    } catch (e: any) {
      results.innerHTML = `<div style="padding: 20px; color: #ef4444;">Error: ${e.message}</div>`;
    }
  });
  
  content.querySelectorAll('.ds-action').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = (btn as HTMLElement).dataset.action;
      if (action === 'embed') {
        const text = prompt('Enter text to embed:');
        if (!text) return;
        results.innerHTML = '<div style="padding: 20px; color: #64748b;">Generating embeddings...</div>';
        try {
          const data = await backendFetch('/v1/ipfs/embed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texts: [text] }) });
          results.innerHTML = `<pre style="padding: 12px; background: #eff6ff; border-radius: 6px; font-size: 12px; overflow: auto;">${JSON.stringify(data, null, 2)}</pre>`;
        } catch (e: any) {
          results.innerHTML = `<div style="padding: 20px; color: #ef4444;">Error: ${e.message}</div>`;
        }
      } else if (action === 'generate') {
        const promptText = prompt('Enter generation prompt:');
        if (!promptText) return;
        results.innerHTML = '<div style="padding: 20px; color: #64748b;">Generating...</div>';
        try {
          const data = await backendFetch('/v1/ipfs/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: promptText }) });
          results.innerHTML = `<pre style="padding: 12px; background: #faf5ff; border-radius: 6px; font-size: 12px; overflow: auto;">${JSON.stringify(data, null, 2)}</pre>`;
        } catch (e: any) {
          results.innerHTML = `<div style="padding: 20px; color: #ef4444;">Error: ${e.message}</div>`;
        }
      }
    });
  });
}

async function openAcceleratePanel(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('accelerate-panel', 'IPFS Accelerate', 700, 550);
  const content = window.querySelector('.window-content') as HTMLElement;
  const BACKEND = 'http://localhost:8080';
  
  content.innerHTML = `
    <div style="display: flex; flex-direction: column; height: 100%; font-family: system-ui, sans-serif;">
      <div style="display: flex; gap: 8px; padding: 10px; border-bottom: 1px solid #e2e8f0; background: #fffbeb;">
        <button id="acc-hw" style="padding: 8px 14px; background: #f59e0b; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">Hardware Profile</button>
        <button id="acc-models" style="padding: 8px 14px; background: #d97706; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">List Models</button>
        <button id="acc-metrics" style="padding: 8px 14px; background: #b45309; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">Metrics</button>
        <button id="acc-endpoints" style="padding: 8px 14px; background: #92400e; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">Endpoints</button>
      </div>
      
      <div style="padding: 10px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
        <div style="display: flex; gap: 8px; align-items: center;">
          <input type="text" id="acc-model-search" placeholder="Search models..." style="flex: 1; padding: 8px 12px; border: 1px solid #fcd34d; border-radius: 6px; font-size: 13px;">
          <button id="acc-search-btn" style="padding: 8px 14px; background: #f59e0b; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">Search</button>
        </div>
      </div>
      
      <div id="acc-results" style="flex: 1; padding: 12px; overflow-y: auto;">
        <div style="text-align: center; padding: 40px; color: #94a3b8;">
          Click a button above to query the IPFS Accelerate backend.
        </div>
      </div>
    </div>
  `;
  
  const results = content.querySelector('#acc-results') as HTMLElement;
  
  async function backendFetch(path: string) {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const resp = await fetch(`${BACKEND}${path}`, { signal: ctrl.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }
  
  const actions = {
    'acc-hw': '/v1/ipfs/hardware_profile',
    'acc-models': '/v1/ipfs/list_models',
    'acc-metrics': '/v1/ipfs/metrics',
    'acc-endpoints': '/v1/ipfs/endpoints',
  };
  
  Object.entries(actions).forEach(([id, path]) => {
    content.querySelector(`#${id}`)?.addEventListener('click', async () => {
      results.innerHTML = '<div style="padding: 20px; color: #64748b;">Loading...</div>';
      try {
        const data = await backendFetch(path);
        results.innerHTML = `<pre style="padding: 12px; background: #fffbeb; color: #78350f; border-radius: 6px; font-size: 12px; overflow: auto; white-space: pre-wrap;">${JSON.stringify(data, null, 2)}</pre>`;
      } catch (e: any) {
        results.innerHTML = `<div style="padding: 20px; color: #ef4444;">Error: ${e.message}</div>`;
      }
    });
  });
  
  content.querySelector('#acc-search-btn')?.addEventListener('click', async () => {
    const query = (content.querySelector('#acc-model-search') as HTMLInputElement).value.trim();
    if (!query) return;
    results.innerHTML = '<div style="padding: 20px; color: #64748b;">Searching models...</div>';
    try {
      const data = await backendFetch(`/v1/ipfs/search_models?query=${encodeURIComponent(query)}`);
      results.innerHTML = `<pre style="padding: 12px; background: #fffbeb; color: #78350f; border-radius: 6px; font-size: 12px; overflow: auto; white-space: pre-wrap;">${JSON.stringify(data, null, 2)}</pre>`;
    } catch (e: any) {
      results.innerHTML = `<div style="padding: 20px; color: #ef4444;">Error: ${e.message}</div>`;
    }
  });
}

function createWindow(id: string, title: string, width: number, height: number): HTMLElement {
  const window = document.createElement('div');
  window.className = 'window';
  window.id = `window-${id}`;
  window.style.cssText = `
    left: ${50 + Math.random() * 100}px;
    top: ${50 + Math.random() * 100}px;
    width: ${width}px;
    height: ${height}px;
  `;
  
  window.innerHTML = `
    <div class="window-header">
      <div class="window-title">${title}</div>
      <div class="window-controls">
        <div class="window-control minimize"></div>
        <div class="window-control maximize"></div>
        <div class="window-control close"></div>
      </div>
    </div>
    <div class="window-content"></div>
  `;
  
  // Add window controls
  const closeBtn = window.querySelector('.window-control.close');
  closeBtn?.addEventListener('click', () => {
    window.remove();
    updateTaskbar();
  });
  
  document.getElementById('desktop')?.appendChild(window);
  updateTaskbar();
  
  return window;
}

function updateTaskbar() {
  const taskbarApps = document.getElementById('taskbar-apps');
  const windows = document.querySelectorAll('.window');
  
  if (taskbarApps) {
    taskbarApps.innerHTML = Array.from(windows).map(window => {
      const title = window.querySelector('.window-title')?.textContent || 'Window';
      return `
        <div class="taskbar-app active" title="${title}">
          ${title.charAt(0)}
        </div>
      `;
    }).join('');
  }
}

function showStartMenu(swissknife: SwissKnifeBrowserCore) {
  // Simple start menu implementation
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.cssText = `
    left: 20px;
    bottom: 60px;
    width: 200px;
  `;
  
  menu.innerHTML = `
    <div class="context-menu-item" data-app="file-manager">📁 File Manager</div>
    <div class="context-menu-item" data-app="terminal">💻 Terminal</div>
    <div class="context-menu-item" data-app="ai-chat">🤖 AI Chat</div>
    <div class="context-menu-item" data-app="ipfs-explorer">🌐 IPFS Explorer</div>
    <div class="context-menu-item" data-app="datasets-browser">📊 Datasets Browser</div>
    <div class="context-menu-item" data-app="accelerate-panel">⚡ Accelerate Panel</div>
    <div class="context-menu-item" data-app="model-browser">🧠 Model Browser</div>
    <div class="context-menu-item" data-app="code-editor">📝 Code Editor</div>
    <div class="context-menu-item" data-app="settings">⚙️ Settings</div>
  `;
  
  // Wire up menu item clicks
  menu.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', async () => {
      const appName = (item as HTMLElement).dataset.app;
      if (appName) {
        menu.remove();
        try { await openApplication(appName, swissknife); } catch (e: any) { showError(e.message); }
      }
    });
  });
  
  document.body.appendChild(menu);
  
  // Auto-close after 3 seconds
  setTimeout(() => menu.remove(), 3000);
}

function updateStatusIndicators(swissknife: SwissKnifeBrowserCore) {
  const aiStatus = document.getElementById('ai-status');
  const storageStatus = document.getElementById('storage-status');
  const networkStatus = document.getElementById('network-status');
  const ipfsStatus = document.getElementById('ipfs-status');
  
  if (aiStatus) {
    aiStatus.className = `status-indicator ${swissknife.getAvailableModels().length > 0 ? 'online' : 'offline'}`;
  }
  
  if (storageStatus) {
    storageStatus.className = 'status-indicator online'; // Storage is always available
  }
  
  if (networkStatus) {
    networkStatus.className = `status-indicator ${navigator.onLine ? 'online' : 'offline'}`;
  }
  
  // Check IPFS backend connectivity
  if (ipfsStatus) {
    fetch('http://localhost:8080/v1/ipfs/status', { signal: AbortSignal.timeout(3000) })
      .then(r => { ipfsStatus.className = `status-indicator ${r.ok ? 'online' : 'offline'}`; })
      .catch(() => { ipfsStatus.className = 'status-indicator offline'; });
  }
}

function hideLoadingOverlay() {
  const loading = document.getElementById('loading');
  if (loading) {
    loading.style.opacity = '0';
    loading.style.transition = 'opacity 0.5s ease';
    setTimeout(() => {
      loading.style.display = 'none';
    }, 500);
  }
}

function showError(message: string) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #f44336;
    color: white;
    padding: 16px;
    border-radius: 8px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    max-width: 400px;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 5000);
}

// Track start time
(window as any).startTime = Date.now();
