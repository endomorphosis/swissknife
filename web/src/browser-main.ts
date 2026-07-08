/**
 * Browser Main Entry Point
 * 
 * This is the main entry point for the SwissKnife browser application.
 * It initializes the desktop environment and integrates with the compiled TypeScript core.
 */

import { SwissKnifeBrowserCore } from './swissknife-browser-core';
import { ORBDynamicAppRenderer, openORBGeneratedApp } from './orb-dynamic-app-renderer';

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

// ---------------------------------------------------------------------------
// UCAN Identity Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize a UCAN DID:key identity for this session.
 * In Electron mode, retrieves from the main process via IPC.
 * In standalone browser mode, generates an ephemeral identity using Web Crypto.
 */
async function initializeUCANIdentity(): Promise<void> {
  try {
    // Try Electron IPC first (if running inside hallucinate_app)
    if ((window as any).electronAPI?.ucan) {
      const identity = await (window as any).electronAPI.ucan.getIdentity();
      if (identity) {
        (window as any).ucanIdentity = identity;
        console.log(`[UCAN] Identity loaded from Electron: ${identity.did}`);
        updateUCANStatusIndicator(identity.did);
        return;
      }
    }

    // Fallback: generate ephemeral Web Crypto identity for standalone browser mode
    const keyPair = await crypto.subtle.generateKey(
      { name: 'Ed25519' } as any,
      true,
      ['sign', 'verify']
    ).catch(() => {
      // Ed25519 may not be available; fall back to ECDSA P-256
      return crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
      );
    });

    const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const keyBytes = new Uint8Array(publicKeyRaw);
    
    // Generate DID:key from public key (simplified - uses hex encoding for browser)
    const hexKey = Array.from(keyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const did = `did:key:z${hexKey.slice(0, 48)}`;
    
    const identity = {
      did,
      createdAt: new Date().toISOString(),
      capabilities: ['mcp-plus-plus/invoke', 'ipfs/pin', 'ipfs/add'],
      ephemeral: true,
    };

    (window as any).ucanIdentity = identity;
    (window as any).ucanKeyPair = keyPair;
    
    console.log(`[UCAN] Ephemeral identity created: ${did}`);
    updateUCANStatusIndicator(did);
  } catch (err) {
    console.warn('[UCAN] Failed to initialize identity:', err);
    // Non-fatal — app works without UCAN, just without auth capabilities
  }
}

function updateUCANStatusIndicator(did: string): void {
  const indicator = document.getElementById('ucan-status');
  if (indicator) {
    indicator.className = 'status-indicator online';
    indicator.title = `UCAN: ${did}`;
  }
  
  // Update taskbar identity display
  const taskbarIdentity = document.getElementById('taskbar-identity');
  if (taskbarIdentity) {
    taskbarIdentity.textContent = `🔑 ${did.slice(0, 20)}...`;
    taskbarIdentity.title = did;
  }
}

async function initializeDesktop(swissknife: SwissKnifeBrowserCore) {
  // Initialize UCAN identity for this session
  await initializeUCANIdentity();
  
  // Initialize desktop icons
  initializeDesktopIcons(swissknife);
  
  // Initialize taskbar
  initializeTaskbar(swissknife);
  
  // Initialize window manager
  initializeWindowManager();
  
  // Initialize Meta Glasses control plane
  initializeGlassesControlPlane(swissknife);
  
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

/**
 * Meta Glasses Control Plane Integration
 * 
 * Manages the glasses display lifecycle for all desktop apps. Handles:
 * - App launching/switching via voice ("Hey Meta, open terminal")
 * - Focus traversal (dpad/gesture)
 * - Action activation
 * - App stack navigation (back gesture)
 * - Keyboard shortcuts for simulator mode
 */
function initializeGlassesControlPlane(swissknife: SwissKnifeBrowserCore) {
  // Glasses control plane state (in-browser simulation)
  const glassesState = {
    connected: false,
    activeAppId: null as string | null,
    focusIndex: 0,
    appStack: [] as string[],
    renderPath: 'simulator' as 'dat-native' | 'display-webapp' | 'simulator',
  };

  // App display registry (mirrors glasses-app-control-plane.ts)
  const GLASSES_APPS: Record<string, { name: string; icon: string; actions: string[] }> = {
    'terminal': { name: 'Terminal', icon: '💻', actions: ['voice-command', 'clear-screen'] },
    'ai-chat': { name: 'AI Chat', icon: '🤖', actions: ['voice-message', 'read-aloud', 'clear-chat'] },
    'file-manager': { name: 'File Manager', icon: '📁', actions: ['open-file', 'go-up', 'pin-to-ipfs'] },
    'settings': { name: 'Settings', icon: '⚙️', actions: ['toggle-setting', 'save-settings'] },
    'code-editor': { name: 'Code Editor', icon: '📝', actions: ['save-file', 'run-code', 'ai-assist'] },
    'task-manager': { name: 'Task Manager', icon: '📊', actions: ['kill-task', 'refresh-tasks'] },
    'model-browser': { name: 'Model Browser', icon: '🧠', actions: ['load-model', 'search-models', 'model-info'] },
    'ipfs-explorer': { name: 'IPFS Explorer', icon: '🌐', actions: ['add-content', 'browse-pins', 'resolve-name'] },
    'datasets-browser': { name: 'Datasets', icon: '📊', actions: ['voice-search', 'voice-generate', 'embed-content'] },
    'accelerate-panel': { name: 'Accelerate', icon: '⚡', actions: ['run-inference', 'view-metrics'] },
    'idl-explorer': { name: 'IDL Explorer', icon: '🔗', actions: ['discover-interfaces', 'invoke-method'] },
    'glasses-preview': { name: 'Glasses Config', icon: '👓', actions: ['calibrate', 'toggle-display'] },
  };

  // Expose control plane to global scope for external access (DAT SDK, mobile bridge)
  (window as any).glassesControlPlane = {
    state: glassesState,
    apps: GLASSES_APPS,

    openApp(appId: string) {
      if (!GLASSES_APPS[appId]) return null;
      if (glassesState.activeAppId) glassesState.appStack.push(glassesState.activeAppId);
      glassesState.activeAppId = appId;
      glassesState.focusIndex = 0;
      this._notifyUpdate();
      return GLASSES_APPS[appId];
    },

    goBack() {
      const prev = glassesState.appStack.pop();
      if (prev) {
        glassesState.activeAppId = prev;
        glassesState.focusIndex = 0;
        this._notifyUpdate();
      }
      return prev ? GLASSES_APPS[prev] : null;
    },

    focusNext() {
      if (!glassesState.activeAppId) return null;
      const actions = GLASSES_APPS[glassesState.activeAppId].actions;
      glassesState.focusIndex = (glassesState.focusIndex + 1) % actions.length;
      this._notifyUpdate();
      return { action: actions[glassesState.focusIndex], index: glassesState.focusIndex };
    },

    focusPrevious() {
      if (!glassesState.activeAppId) return null;
      const actions = GLASSES_APPS[glassesState.activeAppId].actions;
      glassesState.focusIndex = (glassesState.focusIndex - 1 + actions.length) % actions.length;
      this._notifyUpdate();
      return { action: actions[glassesState.focusIndex], index: glassesState.focusIndex };
    },

    activate() {
      if (!glassesState.activeAppId) return null;
      const actions = GLASSES_APPS[glassesState.activeAppId].actions;
      return { appId: glassesState.activeAppId, action: actions[glassesState.focusIndex] };
    },

    listApps() {
      return Object.entries(GLASSES_APPS).map(([id, app]) => ({ id, ...app }));
    },

    getDisplay() {
      if (!glassesState.activeAppId) return null;
      const app = GLASSES_APPS[glassesState.activeAppId];
      return { appId: glassesState.activeAppId, ...app, focusIndex: glassesState.focusIndex };
    },

    _notifyUpdate() {
      // Dispatch custom event for glasses display components to listen to
      window.dispatchEvent(new CustomEvent('glasses-control-plane-update', {
        detail: { state: glassesState, app: glassesState.activeAppId ? GLASSES_APPS[glassesState.activeAppId] : null },
      }));
    },
  };

  // Keyboard shortcuts for glasses simulator (Ctrl+G prefix)
  let glassesMode = false;
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'g') {
      glassesMode = !glassesMode;
      console.log(`[Glasses Simulator] ${glassesMode ? 'ACTIVE' : 'INACTIVE'} - Use arrows + Enter`);
      e.preventDefault();
      return;
    }
    if (!glassesMode) return;

    const cp = (window as any).glassesControlPlane;
    if (e.key === 'ArrowDown') { cp.focusNext(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { cp.focusPrevious(); e.preventDefault(); }
    else if (e.key === 'Enter') { const action = cp.activate(); if (action) console.log('[Glasses] Activate:', action); e.preventDefault(); }
    else if (e.key === 'Escape') { cp.goBack(); e.preventDefault(); }
    else if (e.key === 'v') { 
      // Voice simulator: prompt for transcript
      const transcript = prompt('[Glasses Voice] Say something:');
      if (transcript) {
        cp.handleVoice(transcript).then((result: any) => {
          if (result) console.log('[Glasses Voice]', result.intent, result.result);
          else console.log('[Glasses Voice] Unrecognized:', transcript);
        });
      }
      e.preventDefault();
    }
  });

  // Expose enhanced control plane API
  (window as any).glassesControlPlane.handleVoice = async (transcript: string) => {
    const cp = (window as any).glassesControlPlane;
    // Voice intent recognition
    const VOICE_PATTERNS = [
      { pattern: /^(open|launch|start|show)\s+(.+)$/i, intent: 'app.open', slot: 'appName' },
      { pattern: /^(go\s+)?back$/i, intent: 'app.back' },
      { pattern: /^next$/i, intent: 'focus.next' },
      { pattern: /^(previous|prev)$/i, intent: 'focus.previous' },
      { pattern: /^(select|confirm|activate|ok|go)$/i, intent: 'action.activate' },
      { pattern: /^search\s+(.+)$/i, intent: 'search.semantic', slot: 'query' },
      { pattern: /^generate\s+(.+)$/i, intent: 'generate.text', slot: 'prompt' },
      { pattern: /^(run|start)\s+inference$/i, intent: 'accelerate.inference' },
      { pattern: /^home$/i, intent: 'app.home' },
    ];

    const APP_ALIASES: Record<string, string> = {
      'terminal': 'terminal', 'console': 'terminal', 'shell': 'terminal',
      'chat': 'ai-chat', 'ai': 'ai-chat', 'assistant': 'ai-chat',
      'files': 'file-manager', 'file manager': 'file-manager',
      'settings': 'settings', 'config': 'settings',
      'editor': 'code-editor', 'code': 'code-editor',
      'tasks': 'task-manager', 'processes': 'task-manager',
      'models': 'model-browser',
      'ipfs': 'ipfs-explorer', 'storage': 'ipfs-explorer',
      'datasets': 'datasets-browser', 'data': 'datasets-browser',
      'accelerate': 'accelerate-panel', 'gpu': 'accelerate-panel',
      'interfaces': 'idl-explorer', 'idl': 'idl-explorer',
      'glasses': 'glasses-preview', 'display': 'glasses-preview',
    };

    const clean = transcript.trim().toLowerCase();
    for (const { pattern, intent, slot } of VOICE_PATTERNS) {
      const match = clean.match(pattern);
      if (match) {
        if (intent === 'app.open') {
          const name = match[2]?.toLowerCase();
          const appId = APP_ALIASES[name];
          if (appId) { cp.openApp(appId); return { intent, result: { appId } }; }
        } else if (intent === 'app.back') { cp.goBack(); return { intent, result: {} }; }
        else if (intent === 'focus.next') { return { intent, result: cp.focusNext() }; }
        else if (intent === 'focus.previous') { return { intent, result: cp.focusPrevious() }; }
        else if (intent === 'action.activate') { return { intent, result: cp.activate() }; }
        else if (intent === 'search.semantic') {
          const query = match[1];
          try {
            const r = await fetch(`http://localhost:8080/v1/ipfs/search/semantic`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, top_k: 5 }) });
            return { intent, result: await r.json() };
          } catch (e: any) { return { intent, result: { error: e.message } }; }
        }
        else if (intent === 'generate.text') {
          const prompt = match[1];
          try {
            const r = await fetch(`http://localhost:8080/v1/ipfs/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
            return { intent, result: await r.json() };
          } catch (e: any) { return { intent, result: { error: e.message } }; }
        }
        return { intent, result: null };
      }
    }
    return null;
  };

  // Gesture simulation API
  (window as any).glassesControlPlane.handleGesture = (gestureType: string) => {
    const cp = (window as any).glassesControlPlane;
    const gestureMap: Record<string, () => any> = {
      'swipe_left': () => cp.goBack(),
      'swipe_right': () => cp.focusNext(),
      'tap': () => cp.activate(),
      'double_tap': () => { /* app switcher */ },
      'flick_right': () => cp.focusNext(),
      'flick_left': () => cp.focusPrevious(),
      'head_nod': () => cp.activate(),
      'head_shake': () => { /* dismiss notification */ },
    };
    const handler = gestureMap[gestureType];
    if (handler) return handler();
    return null;
  };

  // Notification API
  const notificationQueue: Array<{ id: string; title: string; priority: string; ttlMs: number }> = [];
  (window as any).glassesControlPlane.notify = (title: string, priority = 'normal', ttlMs = 5000) => {
    const id = `notif_${Date.now()}`;
    notificationQueue.push({ id, title, priority, ttlMs });
    console.log(`[Glasses Notification] ${priority}: ${title}`);
    setTimeout(() => { const idx = notificationQueue.findIndex(n => n.id === id); if (idx >= 0) notificationQueue.splice(idx, 1); }, ttlMs);
    return id;
  };
  (window as any).glassesControlPlane.getNotifications = () => [...notificationQueue];

  console.log('[Glasses Control Plane] Enhanced - 12 apps, voice/gesture/notifications. Ctrl+G to toggle, V for voice.');
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
    'idl-explorer': () => openIDLExplorer(swissknife),
    'glasses-preview': () => openGlassesPreview(swissknife),
    'orb-auto-ui': () => openORBAutoUILauncher(swissknife),
    'mcp-plus-plus': () => openMCPPlusPlusExplorer(swissknife),
  };
  
  const openApp = applications[appName as keyof typeof applications];
  if (openApp) {
    await openApp();
  } else {
    throw new Error(`Unknown application: ${appName}`);
  }
}

type BrowserMainCapability = {
  tool: string;
  policy: string;
  serviceFamily: string;
  descriptorPackId: string;
  interfacePrefix: string;
};

const BROWSER_MAIN_IPFS_CAPABILITIES: Record<string, BrowserMainCapability> = {
  'ipfs.kit.tool.node_id': browserMainCapability('node_id', 'read', 'ipfs_kit_py', 'ipfs_kit'),
  'ipfs.kit.tool.ipfs_add': browserMainCapability('ipfs_add', 'write', 'ipfs_kit_py', 'ipfs_kit'),
  'ipfs.kit.tool.ipfs_cat': browserMainCapability('ipfs_cat', 'read', 'ipfs_kit_py', 'ipfs_kit'),
  'ipfs.kit.tool.ipfs_ls': browserMainCapability('ipfs_ls', 'read', 'ipfs_kit_py', 'ipfs_kit'),
  'ipfs.kit.tool.pin_add': browserMainCapability('pin_add', 'write', 'ipfs_kit_py', 'ipfs_kit'),
  'ipfs.kit.tool.pin_rm': browserMainCapability('pin_rm', 'destructive', 'ipfs_kit_py', 'ipfs_kit'),
  'ipfs.kit.tool.get_pinset': browserMainCapability('get_pinset', 'read', 'ipfs_kit_py', 'ipfs_kit'),
  'ipfs.kit.tool.block_stat': browserMainCapability('block_stat', 'read', 'ipfs_kit_py', 'ipfs_kit'),
  'ipfs.kit.tool.dag_get': browserMainCapability('dag_get', 'read', 'ipfs_kit_py', 'ipfs_kit'),
  'ipfs.kit.tool.dag_put': browserMainCapability('dag_put', 'write', 'ipfs_kit_py', 'ipfs_kit'),
  'ipfs.kit.tool.name_publish': browserMainCapability('name_publish', 'write', 'ipfs_kit_py', 'ipfs_kit'),
  'ipfs.kit.tool.name_resolve': browserMainCapability('name_resolve', 'read', 'ipfs_kit_py', 'ipfs_kit'),
  'ipfs.datasets.operation.browse': browserMainCapability('browse', 'read', 'ipfs_datasets_py', 'ipfs_datasets'),
  'ipfs.datasets.operation.get': browserMainCapability('get', 'read', 'ipfs_datasets_py', 'ipfs_datasets'),
  'ipfs.datasets.operation.index': browserMainCapability('index', 'write', 'ipfs_datasets_py', 'ipfs_datasets'),
  'ipfs.datasets.operation.pin': browserMainCapability('pin', 'write', 'ipfs_datasets_py', 'ipfs_datasets'),
  'ipfs.datasets.operation.publish': browserMainCapability('publish', 'write', 'ipfs_datasets_py', 'ipfs_datasets'),
  'ipfs.datasets.operation.sync_status': browserMainCapability('sync_status', 'read', 'ipfs_datasets_py', 'ipfs_datasets'),
  'ipfs.accelerate.operation.hardware_profile': browserMainCapability('hardware_profile', 'read', 'ipfs_accelerate_py', 'ipfs_accelerate'),
  'ipfs.accelerate.operation.run_inference_job': browserMainCapability('run_inference_job', 'write', 'ipfs_accelerate_py', 'ipfs_accelerate'),
  'ipfs.accelerate.operation.job_status': browserMainCapability('job_status', 'read', 'ipfs_accelerate_py', 'ipfs_accelerate'),
  'ipfs.accelerate.operation.telemetry': browserMainCapability('telemetry', 'read', 'ipfs_accelerate_py', 'ipfs_accelerate'),
};

function browserMainCapability(tool: string, policy: string, serviceFamily: string, interfacePrefix: string): BrowserMainCapability {
  return {
    tool,
    policy,
    serviceFamily,
    descriptorPackId: `${serviceFamily}.mcp_dashboard.descriptor_pack.v1`,
    interfacePrefix,
  };
}

async function invokeBrowserMainIPFSCapability(
  appId: string,
  capabilityId: string,
  input: Record<string, unknown> = {},
) {
  const startedAt = new Date();
  const capability = BROWSER_MAIN_IPFS_CAPABILITIES[capabilityId];
  const correlationId = `browser-main-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (!capability) {
    return buildBrowserMainEnvelope({
      status: 'error',
      summary: `Capability ${capabilityId} is not registered.`,
      error: { code: 'CAPABILITY_NOT_FOUND', message: `Capability ${capabilityId} is not registered.` },
      output: null,
      appId,
      capabilityId,
      tool: capabilityId,
      policy: 'read',
      serviceFamily: 'unknown',
      descriptorPackId: undefined,
      interfacePrefix: 'unknown',
      correlationId,
      startedAt,
      warnings: [],
    });
  }

  try {
    const output = await invokeBrowserMainIPFSTool(capability.tool, input);
    return buildBrowserMainEnvelope({
      status: 'ok',
      summary: `Invoked ${capability.tool} through the app capability gateway.`,
      output,
      appId,
      capabilityId,
      tool: capability.tool,
      policy: capability.policy,
      serviceFamily: capability.serviceFamily,
      descriptorPackId: capability.descriptorPackId,
      interfacePrefix: capability.interfacePrefix,
      correlationId,
      startedAt,
      warnings: [],
    });
  } catch (error: any) {
    return buildBrowserMainEnvelope({
      status: 'degraded',
      summary: `${capability.tool} is unavailable; returning descriptor-backed fallback output.`,
      error: { code: 'TRANSPORT_UNAVAILABLE', message: error?.message || String(error) },
      output: { fallback: true, capability_id: capabilityId, mcp_tool_name: capability.tool, input },
      appId,
      capabilityId,
      tool: capability.tool,
      policy: capability.policy,
      serviceFamily: capability.serviceFamily,
      descriptorPackId: capability.descriptorPackId,
      interfacePrefix: capability.interfacePrefix,
      correlationId,
      startedAt,
      warnings: ['No live IPFS transport was available in browser-main.'],
    });
  }
}

async function invokeBrowserMainIPFSTool(tool: string, input: Record<string, unknown>) {
  if (tool === 'browse' || tool === 'get' || tool === 'index' || tool === 'publish' || tool === 'sync_status' || tool === 'hardware_profile' || tool === 'run_inference_job' || tool === 'job_status' || tool === 'telemetry') {
    throw new Error(`No live browser-main descriptor transport is registered for ${tool}.`);
  }
  const api = (window as any).SwissKnife?.ipfs || (window as any).ipfs;
  if (!api) throw new Error('No live IPFS transport is registered.');
  if (tool === 'node_id') return callBrowserMainIPFS(api, [['id'], ['getPeerId'], ['status']], []);
  if (tool === 'ipfs_add') return callBrowserMainIPFS(api, [['add'], ['addFile'], ['addContent']], [input.file || input.content || input.file_path || '']);
  if (tool === 'ipfs_cat') return callBrowserMainIPFS(api, [['cat'], ['get']], [input.cid || input.path]);
  if (tool === 'ipfs_ls') return callBrowserMainIPFS(api, [['ls'], ['files', 'ls']], [input.path || input.cid || '/']);
  if (tool === 'pin_add') return callBrowserMainIPFS(api, [['pin'], ['pin', 'add']], [input.cid || input.path]);
  if (tool === 'pin_rm') return callBrowserMainIPFS(api, [['unpin'], ['pin', 'rm'], ['pin', 'remove']], [input.cid || input.path]);
  if (tool === 'get_pinset') return callBrowserMainIPFS(api, [['listPins'], ['pins'], ['pin', 'ls']], []);
  if (tool === 'block_stat') return callBrowserMainIPFS(api, [['stat'], ['block', 'stat'], ['object', 'stat']], [input.cid || input.path]);
  if (tool === 'dag_get') return callBrowserMainIPFS(api, [['dag', 'get']], [input.cid || input.path]);
  if (tool === 'dag_put') return callBrowserMainIPFS(api, [['dag', 'put']], [input.data || input]);
  if (tool === 'name_publish') return callBrowserMainIPFS(api, [['name', 'publish'], ['namePublish']], [input.path || input.cid, input.name].filter(Boolean));
  if (tool === 'name_resolve') return callBrowserMainIPFS(api, [['name', 'resolve'], ['nameResolve']], [input.name || input.path]);
  throw new Error(`No browser-main transport mapper exists for ${tool}.`);
}

async function callBrowserMainIPFS(api: any, paths: string[][], args: unknown[]) {
  for (const path of paths) {
    const fn = path.reduce((cursor, key) => cursor?.[key], api);
    if (typeof fn === 'function') {
      const parent = path.slice(0, -1).reduce((cursor, key) => cursor?.[key], api) || api;
      return await fn.apply(parent, args);
    }
  }
  throw new Error(`IPFS API does not expose any of: ${paths.map(path => path.join('.')).join(', ')}`);
}

function buildBrowserMainEnvelope(input: any) {
  const finishedAt = new Date();
  const policy = {
    policy_class: input.policy,
    confirmation_policy: input.policy === 'read' ? 'none' : input.policy === 'destructive' ? 'confirm_destructive' : 'confirm',
    receipt_policy: input.policy === 'read' ? 'optional' : 'required_for_side_effects',
    decision: 'not_evaluated',
    reasons: [],
  };
  const trace = {
    correlation_id: input.correlationId,
    app_id: input.appId,
    requested_app_id: input.appId,
    capability_id: input.capabilityId,
    execution_mode: 'direct_import',
    service_family: input.serviceFamily,
    descriptor_pack_id: input.descriptorPackId,
    mcp_tool_name: input.tool,
    mcp_plus_plus_interface: `${input.interfacePrefix}/browser-main.${input.tool}`,
    started_at: input.startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: Math.max(0, finishedAt.getTime() - input.startedAt.getTime()),
    transport: input.status === 'ok' ? 'browser-main-ipfs-api' : 'descriptor-fallback',
    warnings: input.warnings,
  };
  return {
    schema: 'swissknife.app-result-envelope.v1',
    status: input.status,
    summary: input.summary,
    output: input.output,
    ...(input.error ? { error: input.error } : {}),
    artifact_refs: [],
    receipt_refs: [{
      receipt_cid: `browser-main:${input.correlationId}:${input.capabilityId}`,
      receipt_schema: 'swissknife.app-capability-receipt.v1',
      service_family: input.serviceFamily,
      capability_id: input.capabilityId,
    }],
    event_dag_refs: [{
      event_cid: `browser-main-event:${input.correlationId}:${input.capabilityId}`,
      parents: [],
      event_type: 'app_capability_invocation',
    }],
    policy,
    trace,
  };
}

function formatBrowserMainEnvelope(envelope: any): string {
  return JSON.stringify(envelope, null, 2);
}

function renderBrowserMainEnvelope(envelope: any): string {
  const color = envelope.status === 'ok' ? '#166534' : envelope.status === 'degraded' ? '#92400e' : '#991b1b';
  return `<div class="app-capability-envelope" data-envelope-status="${envelope.status}" style="padding:12px;border:1px solid ${color};border-radius:6px;color:${color};">
    <strong>App Capability Envelope: ${envelope.status}</strong>
    <pre style="white-space:pre-wrap;color:#111827;">${escapeHTML(formatBrowserMainEnvelope(envelope))}</pre>
  </div>`;
}

function escapeHTML(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function openTerminal(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('terminal', 'SwissKnife Terminal', 600, 400);
  const content = window.querySelector('.window-content') as HTMLElement;
  const BACKEND = 'http://localhost:8080';
  content.innerHTML = `
    <div id="terminal-container" style="
      font-family: 'Courier New', monospace;
      background: #1e1e1e;
      color: #ffffff;
      padding: 10px;
      height: 100%;
      overflow-y: auto;
    ">
      <div id="terminal-output"><div style="color:#6b7280;">SwissKnife Terminal v0.1 — Type 'help' for IPFS commands</div></div>
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

  // Built-in IPFS CLI commands that route to MCP backend
  const ipfsCommands: Record<string, (args: string) => Promise<string>> = {
    'ipfs status': async () => formatBrowserMainEnvelope(await invokeBrowserMainIPFSCapability('terminal', 'ipfs.kit.tool.node_id', { operation: 'status' })),
    'ipfs add': async (args) => formatBrowserMainEnvelope(await invokeBrowserMainIPFSCapability('terminal', 'ipfs.kit.tool.ipfs_add', { content: args })),
    'ipfs cat': async (args) => formatBrowserMainEnvelope(await invokeBrowserMainIPFSCapability('terminal', 'ipfs.kit.tool.ipfs_cat', { cid: args })),
    'ipfs pin': async (args) => formatBrowserMainEnvelope(await invokeBrowserMainIPFSCapability('terminal', 'ipfs.kit.tool.pin_add', { cid: args })),
    'ipfs pins': async () => formatBrowserMainEnvelope(await invokeBrowserMainIPFSCapability('terminal', 'ipfs.kit.tool.get_pinset', { operation: 'list_pins' })),
    'ipfs stat': async (args) => formatBrowserMainEnvelope(await invokeBrowserMainIPFSCapability('terminal', 'ipfs.kit.tool.block_stat', { cid: args })),
    'ipfs unpin': async (args) => formatBrowserMainEnvelope(await invokeBrowserMainIPFSCapability('terminal', 'ipfs.kit.tool.pin_rm', { cid: args })),
    'ipfs resolve': async (args) => formatBrowserMainEnvelope(await invokeBrowserMainIPFSCapability('terminal', 'ipfs.kit.tool.name_resolve', { name: args })),
    'ipfs dag get': async (args) => formatBrowserMainEnvelope(await invokeBrowserMainIPFSCapability('terminal', 'ipfs.kit.tool.dag_get', { cid: args })),
    'ipfs dag put': async (args) => formatBrowserMainEnvelope(await invokeBrowserMainIPFSCapability('terminal', 'ipfs.kit.tool.dag_put', { data: args })),
    'ipfs name publish': async (args) => { const [cid, name] = args.split(' '); return formatBrowserMainEnvelope(await invokeBrowserMainIPFSCapability('terminal', 'ipfs.kit.tool.name_publish', { cid, path: cid, name })); },
    'ipfs name resolve': async (args) => formatBrowserMainEnvelope(await invokeBrowserMainIPFSCapability('terminal', 'ipfs.kit.tool.name_resolve', { name: args })),
    'ipfs embed': async (args) => { const r = await fetch(`${BACKEND}/v1/ipfs/embed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: args }) }); return JSON.stringify(await r.json(), null, 2); },
    'ipfs models': async () => { const r = await fetch(`${BACKEND}/v1/ipfs/list_models`); return JSON.stringify(await r.json(), null, 2); },
    'ipfs capabilities': async () => { const r = await fetch(`${BACKEND}/v1/ipfs/capabilities`); return JSON.stringify(await r.json(), null, 2); },
    'ipfs hardware': async () => { const r = await fetch(`${BACKEND}/v1/ipfs/hardware_profile`); return JSON.stringify(await r.json(), null, 2); },
    'ipfs metrics': async () => { const r = await fetch(`${BACKEND}/v1/ipfs/metrics`); return JSON.stringify(await r.json(), null, 2); },
    'ipfs datasets': async () => { const r = await fetch(`${BACKEND}/v1/ipfs/list_datasets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); return JSON.stringify(await r.json(), null, 2); },
    'ipfs search': async (args) => { const r = await fetch(`${BACKEND}/v1/ipfs/search/semantic`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: args, top_k: 5 }) }); return JSON.stringify(await r.json(), null, 2); },
    'ipfs search similar': async (args) => { const r = await fetch(`${BACKEND}/v1/ipfs/search/similarity`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: args, top_k: 5 }) }); return JSON.stringify(await r.json(), null, 2); },
    'ipfs search faceted': async (args) => { const r = await fetch(`${BACKEND}/v1/ipfs/search/faceted`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: args, facets: [] }) }); return JSON.stringify(await r.json(), null, 2); },
    'ipfs vector index': async (args) => { const r = await fetch(`${BACKEND}/v1/ipfs/vector/index`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collection: args || 'default' }) }); return JSON.stringify(await r.json(), null, 2); },
    'ipfs vector search': async (args) => { const r = await fetch(`${BACKEND}/v1/ipfs/vector/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: args, top_k: 5 }) }); return JSON.stringify(await r.json(), null, 2); },
    'ipfs vector metadata': async (args) => { const r = await fetch(`${BACKEND}/v1/ipfs/vector/metadata`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collection: args || 'default' }) }); return JSON.stringify(await r.json(), null, 2); },
    'ipfs scrape': async (args) => { const r = await fetch(`${BACKEND}/v1/ipfs/scrape/url`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: args }) }); return JSON.stringify(await r.json(), null, 2); },
    'ipfs scrape batch': async (args) => { const urls = args.split(' '); const r = await fetch(`${BACKEND}/v1/ipfs/scrape/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls }) }); return JSON.stringify(await r.json(), null, 2); },
    'ipfs workflow': async (args) => { const r = await fetch(`${BACKEND}/v1/ipfs/workflow/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workflow: args || 'default', steps: [] }) }); return JSON.stringify(await r.json(), null, 2); },
    'ipfs generate': async (args) => { const r = await fetch(`${BACKEND}/v1/ipfs/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: args }) }); return JSON.stringify(await r.json(), null, 2); },
    'ipfs inference': async (args) => { const r = await fetch(`${BACKEND}/v1/ipfs/inference`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'default', input: args }) }); return JSON.stringify(await r.json(), null, 2); },
    'help': async () => `Available IPFS commands:
  === ipfs_kit_py (Core IPFS) ===
  ipfs status            - Check backend status
  ipfs add <text>        - Add content to IPFS
  ipfs cat <cid>         - Fetch content by CID
  ipfs pin <cid>         - Pin content
  ipfs unpin <cid>       - Unpin content
  ipfs pins              - List pinned content
  ipfs stat <cid>        - Get object stats
  ipfs resolve <path>    - Resolve IPFS path
  ipfs dag get <cid>     - Get DAG node
  ipfs dag put <data>    - Put DAG node
  ipfs name publish <cid> [name] - Publish to IPNS
  ipfs name resolve <name>       - Resolve IPNS name

  === ipfs_accelerate_py (AI/GPU) ===
  ipfs models            - List available models
  ipfs capabilities      - Hardware capabilities
  ipfs hardware          - Hardware profile
  ipfs metrics           - GPU/inference metrics
  ipfs inference <text>  - Run inference
  ipfs embed <text>      - Generate embeddings

  === ipfs_datasets_py (Data/Search) ===
  ipfs datasets          - List datasets
  ipfs search <query>    - Semantic search
  ipfs search similar <q> - Similarity search
  ipfs search faceted <q> - Faceted search
  ipfs generate <prompt> - Generate text
  ipfs vector index [col] - Index vectors
  ipfs vector search <q>  - Vector search
  ipfs vector metadata [col] - Vector metadata
  ipfs scrape <url>       - Scrape URL
  ipfs scrape batch <urls> - Batch scrape (space-separated)
  ipfs workflow <name>    - Execute workflow`,
  };
  
  input.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
      const command = input.value.trim();
      if (command) {
        output.innerHTML += `<div style="margin: 5px 0;"><span style="color: #00ff00;">swissknife:$ </span>${command}</div>`;
        
        try {
          // Try IPFS command first
          const cmdKey = Object.keys(ipfsCommands).find(k => command.startsWith(k));
          if (cmdKey) {
            const args = command.slice(cmdKey.length).trim();
            const result = await ipfsCommands[cmdKey](args);
            output.innerHTML += `<div style="margin: 5px 0; white-space: pre-wrap; color: #a5f3fc;">${result}</div>`;
          } else {
            // Fallback to SwissKnife core
            const result = await swissknife.executeCommand(command);
            if (result.output) output.innerHTML += `<div style="margin: 5px 0; white-space: pre-wrap;">${result.output}</div>`;
            if (result.error) output.innerHTML += `<div style="margin: 5px 0; color: #ff6b6b;">${result.error}</div>`;
          }
        } catch (error: any) {
          output.innerHTML += `<div style="margin: 5px 0; color: #ff6b6b;">Error: ${error.message}</div>`;
        }
        
        input.value = '';
        const container = content.querySelector('#terminal-container') as HTMLElement;
        container.scrollTop = container.scrollHeight;
      }
    }
  });
  
  input.focus();
}

async function openAIChat(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('ai-chat', 'AI Chat Assistant', 500, 600);
  const content = window.querySelector('.window-content') as HTMLElement;
  const BACKEND = 'http://localhost:8080';
  
  content.innerHTML = `
    <div style="display: flex; flex-direction: column; height: 100%;">
      <div style="display:flex;gap:6px;padding:6px 8px;border-bottom:1px solid #e5e7eb;background:#f8fafc;">
        <select id="chat-backend" style="padding:4px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:11px;">
          <option value="generate">ipfs_datasets (generate)</option>
          <option value="inference">ipfs_accelerate (inference)</option>
          <option value="semantic_search">Semantic Search</option>
          <option value="similarity_search">Similarity Search</option>
          <option value="embed">Embed Text</option>
          <option value="vector_search">Vector Search</option>
          <option value="scrape">Scrape URL</option>
          <option value="workflow">Execute Workflow</option>
        </select>
        <span id="chat-status" style="margin-left:auto;font-size:10px;padding:3px 6px;border-radius:8px;background:#fef3c7;color:#92400e;">Checking...</span>
      </div>
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
  const backendSelect = content.querySelector('#chat-backend') as HTMLSelectElement;
  const statusEl = content.querySelector('#chat-status') as HTMLElement;

  // Check backend status
  fetch(`${BACKEND}/v1/ipfs/status`, { signal: AbortSignal.timeout(3000) })
    .then(r => { statusEl.textContent = r.ok ? 'MCP Online' : 'Offline'; statusEl.style.background = r.ok ? '#dcfce7' : '#fee2e2'; statusEl.style.color = r.ok ? '#166534' : '#991b1b'; })
    .catch(() => { statusEl.textContent = 'Offline'; statusEl.style.background = '#fee2e2'; statusEl.style.color = '#991b1b'; });
  
  const sendMessage = async () => {
    const message = input.value.trim();
    if (!message) return;
    
    messages.innerHTML += `
      <div style="margin: 10px 0; text-align: right;">
        <div style="display: inline-block; background: #667eea; color: white; padding: 8px 12px; border-radius: 12px; max-width: 70%;">${message}</div>
      </div>
    `;
    input.value = '';
    messages.scrollTop = messages.scrollHeight;
    
    try {
      const backend = backendSelect.value;
      let responseText = '';

      if (backend === 'generate') {
        const r = await fetch(`${BACKEND}/v1/ipfs/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: message, max_tokens: 500 }) });
        const data = await r.json();
        responseText = data.generated_text || data.text || JSON.stringify(data);
      } else if (backend === 'inference') {
        const r = await fetch(`${BACKEND}/v1/ipfs/inference`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'default', input: message }) });
        const data = await r.json();
        responseText = data.output || data.result || JSON.stringify(data);
      } else if (backend === 'semantic_search') {
        const r = await fetch(`${BACKEND}/v1/ipfs/search/semantic`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: message, top_k: 5 }) });
        const data = await r.json();
        responseText = (data.results || []).map((r: any) => `• ${r.title || r.text || JSON.stringify(r)}`).join('\n') || 'No results found';
      } else if (backend === 'similarity_search') {
        const r = await fetch(`${BACKEND}/v1/ipfs/search/similarity`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: message, top_k: 5 }) });
        const data = await r.json();
        responseText = (data.results || []).map((r: any) => `• ${r.score?.toFixed(3) || '?'} — ${r.text || r.title || JSON.stringify(r)}`).join('\n') || 'No similar results';
      } else if (backend === 'embed') {
        const r = await fetch(`${BACKEND}/v1/ipfs/embed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: message }) });
        const data = await r.json();
        const vec = data.embedding || data.vector || [];
        responseText = `Embedding (${vec.length}D): [${(Array.isArray(vec) ? vec.slice(0, 5).map((v: number) => v.toFixed(4)).join(', ') : '...')}...]`;
      } else if (backend === 'vector_search') {
        const r = await fetch(`${BACKEND}/v1/ipfs/vector/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: message, top_k: 5 }) });
        const data = await r.json();
        responseText = (data.results || []).map((r: any) => `• ${r.score?.toFixed(3) || '?'} — ${r.id || r.text || JSON.stringify(r)}`).join('\n') || 'No vector results';
      } else if (backend === 'scrape') {
        const r = await fetch(`${BACKEND}/v1/ipfs/scrape/url`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: message }) });
        const data = await r.json();
        responseText = data.content?.slice(0, 500) || data.text?.slice(0, 500) || JSON.stringify(data).slice(0, 500);
      } else if (backend === 'workflow') {
        const r = await fetch(`${BACKEND}/v1/ipfs/workflow/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workflow: message, steps: [] }) });
        const data = await r.json();
        responseText = data.result || data.output || JSON.stringify(data);
      }

      messages.innerHTML += `
        <div style="margin: 10px 0;">
          <div style="display: inline-block; background: white; color: #333; padding: 8px 12px; border-radius: 12px; max-width: 70%; box-shadow: 0 1px 3px rgba(0,0,0,0.1); white-space: pre-wrap;">${responseText}</div>
        </div>
      `;
    } catch (error: any) {
      // Fallback to local SwissKnife if backend unavailable
      try {
        const response = await swissknife.generateAIResponse(message);
        messages.innerHTML += `<div style="margin: 10px 0;"><div style="display: inline-block; background: white; color: #333; padding: 8px 12px; border-radius: 12px; max-width: 70%; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">${response.content}</div></div>`;
      } catch (e: any) {
        messages.innerHTML += `<div style="margin: 10px 0;"><div style="display: inline-block; background: #fee2e2; color: #991b1b; padding: 8px 12px; border-radius: 12px; max-width: 70%;">Error: ${error.message}</div></div>`;
      }
    }
    messages.scrollTop = messages.scrollHeight;
  };
  
  sendButton.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') sendMessage(); });
  input.focus();
}

async function openFileManager(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('file-manager', 'File Manager', 700, 500);
  const content = window.querySelector('.window-content') as HTMLElement;
  const BACKEND = 'http://localhost:8080';
  
  content.innerHTML = `
    <div style="display: flex; flex-direction: column; height: 100%; font-family: system-ui;">
      <div style="display:flex;gap:6px;padding:8px;border-bottom:1px solid #e5e7eb;background:#f8fafc;">
        <input type="text" id="current-path" value="/" readonly style="flex:1;padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;background:#f9fafb;font-size:12px;">
        <button id="fm-pin-btn" style="padding:6px 12px;background:#10b981;color:white;border:none;border-radius:4px;font-size:11px;cursor:pointer;" title="Pin current file to IPFS">📌 Pin to IPFS</button>
        <button id="fm-unpin-btn" style="padding:6px 12px;background:#ef4444;color:white;border:none;border-radius:4px;font-size:11px;cursor:pointer;" title="Unpin from IPFS">🗑️ Unpin</button>
        <button id="fm-upload-btn" style="padding:6px 12px;background:#3b82f6;color:white;border:none;border-radius:4px;font-size:11px;cursor:pointer;">⬆️ Upload to IPFS</button>
        <button id="fm-resolve-btn" style="padding:6px 12px;background:#8b5cf6;color:white;border:none;border-radius:4px;font-size:11px;cursor:pointer;" title="Resolve IPFS path">🔗 Resolve</button>
      </div>
      <div style="display:flex;flex:1;overflow:hidden;">
        <div id="file-list" style="flex:1;overflow-y:auto;background:white;"></div>
        <div id="ipfs-panel" style="width:250px;border-left:1px solid #e5e7eb;padding:8px;overflow-y:auto;background:#f9fafb;">
          <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:8px;">📦 IPFS Pinned Content</div>
          <div id="ipfs-pins" style="font-size:10px;color:#6b7280;">Loading pins...</div>
        </div>
      </div>
      <div style="padding:4px 8px;border-top:1px solid #e5e7eb;font-size:10px;color:#6b7280;background:#f8fafc;">
        IPFS Kit: <span id="fm-ipfs-status">checking...</span>
      </div>
    </div>
  `;

  const fileList = content.querySelector('#file-list') as HTMLElement;
  const pinsPanel = content.querySelector('#ipfs-pins') as HTMLElement;
  const ipfsStatus = content.querySelector('#fm-ipfs-status') as HTMLElement;

  // Check IPFS backend
  fetch(`${BACKEND}/v1/ipfs/status`, { signal: AbortSignal.timeout(3000) })
    .then(r => { ipfsStatus.textContent = r.ok ? '✅ online' : '❌ offline'; })
    .catch(() => { ipfsStatus.textContent = '❌ offline'; });

  // Load pinned content from IPFS Kit
  try {
    const r = await fetch(`${BACKEND}/v1/ipfs/list_pins`, { signal: AbortSignal.timeout(5000) });
    const data = await r.json();
    const pins = data.pins || data || [];
    pinsPanel.innerHTML = Array.isArray(pins) && pins.length > 0
      ? pins.slice(0, 20).map((p: any) => `<div style="padding:3px 0;font-family:monospace;border-bottom:1px solid #f3f4f6;cursor:pointer;" title="Click to fetch" data-cid="${typeof p === 'string' ? p : p.cid}">${(typeof p === 'string' ? p : p.cid || '').slice(0, 18)}...</div>`).join('')
      : '<div style="color:#9ca3af;">No pins found</div>';
  } catch { pinsPanel.innerHTML = '<div style="color:#9ca3af;">Backend unavailable</div>'; }

  // Pin to IPFS
  content.querySelector('#fm-pin-btn')?.addEventListener('click', async () => {
    const cid = prompt('Enter CID to pin:');
    if (!cid) return;
    try {
      await fetch(`${BACKEND}/v1/ipfs/pin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cid }) });
      alert(`Pinned: ${cid}`);
    } catch (e: any) { alert(`Pin failed: ${e.message}`); }
  });

  // Upload to IPFS
  content.querySelector('#fm-upload-btn')?.addEventListener('click', async () => {
    const text = prompt('Enter content to upload to IPFS:');
    if (!text) return;
    try {
      const r = await fetch(`${BACKEND}/v1/ipfs/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text }) });
      const data = await r.json();
      alert(`Uploaded! CID: ${data.cid || data.Hash || JSON.stringify(data)}`);
    } catch (e: any) { alert(`Upload failed: ${e.message}`); }
  });

  // Unpin from IPFS
  content.querySelector('#fm-unpin-btn')?.addEventListener('click', async () => {
    const cid = prompt('Enter CID to unpin:');
    if (!cid) return;
    try {
      await fetch(`${BACKEND}/v1/ipfs/unpin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cid }) });
      alert(`Unpinned: ${cid}`);
    } catch (e: any) { alert(`Unpin failed: ${e.message}`); }
  });

  // Resolve IPFS path
  content.querySelector('#fm-resolve-btn')?.addEventListener('click', async () => {
    const path = prompt('Enter IPFS path to resolve (e.g., /ipns/example.com):');
    if (!path) return;
    try {
      const r = await fetch(`${BACKEND}/v1/ipfs/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
      const data = await r.json();
      alert(`Resolved: ${JSON.stringify(data)}`);
    } catch (e: any) { alert(`Resolve failed: ${e.message}`); }
  });

  // Load local file listing
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
  const BACKEND = 'http://localhost:8080';
  
  // Check backend status
  let backendOnline = false;
  try { const r = await fetch(`${BACKEND}/v1/ipfs/status`, { signal: AbortSignal.timeout(3000) }); backendOnline = r.ok; } catch {}

  const ucanDid = (window as any).ucanIdentity?.did || 'Not initialized';
  
  content.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 16px; padding: 12px; font-family: system-ui; font-size: 13px;">
      <h3 style="margin:0;">SwissKnife Settings</h3>
      
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
        <h4 style="margin:0 0 8px;font-size:12px;">🔑 UCAN Identity</h4>
        <div style="font-family:monospace;font-size:11px;word-break:break-all;color:#4b5563;background:#fff;padding:6px;border-radius:4px;">${ucanDid}</div>
      </div>
      
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
        <h4 style="margin:0 0 8px;font-size:12px;">🔌 MCP Backend</h4>
        <div style="display:grid;gap:4px;font-size:11px;">
          <div>Backend URL: <code>${BACKEND}</code> <span style="color:${backendOnline ? '#16a34a' : '#dc2626'};">${backendOnline ? '● Online' : '○ Offline'}</span></div>
          <div>IPFS Kit MCP: <code>:8004</code></div>
          <div>IPFS Datasets MCP: <code>:3002</code></div>
          <div>IPFS Accelerate MCP: <code>:3003</code></div>
          <div>SwissKnife Web: <code>:8765</code></div>
        </div>
      </div>
      
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
        <h4 style="margin:0 0 8px;font-size:12px;">⚙️ Application</h4>
        <div style="display:grid;gap:4px;font-size:11px;">
          <div>Storage: IndexedDB</div>
          <div>AI Models: ${swissknife.getAvailableModels().join(', ') || 'None (using MCP backends)'}</div>
          <div>Desktop Apps: 13</div>
          <div>Meta Glasses: ${(window as any).glassesControlPlane ? 'Ready' : 'Not initialized'}</div>
        </div>
      </div>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
        <h4 style="margin:0 0 8px;font-size:12px;">ℹ️ About</h4>
        <div style="font-size:11px;">
          <div>SwissKnife Virtual Desktop v0.0.53</div>
          <div>Build: TypeScript + Webpack</div>
          <div>ORB/IDL: Auto-UI generation enabled</div>
        </div>
      </div>
    </div>
  `;
}

async function openCodeEditor(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('code-editor', 'VibeCode Editor', 800, 600);
  const content = window.querySelector('.window-content') as HTMLElement;
  const BACKEND = 'http://localhost:8080';
  
  content.innerHTML = `
    <div style="display: flex; flex-direction: column; height: 100%; font-family: system-ui;">
      <div style="display:flex;gap:6px;padding:8px;border-bottom:1px solid #e5e7eb;background:#f8fafc;align-items:center;">
        <input type="text" id="ce-filename" placeholder="filename.ts" style="padding:5px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;width:180px;">
        <button id="ce-save-ipfs" style="padding:5px 10px;background:#10b981;color:white;border:none;border-radius:4px;font-size:11px;cursor:pointer;" title="Save to IPFS">💾 Save to IPFS</button>
        <button id="ce-ai-assist" style="padding:5px 10px;background:#8b5cf6;color:white;border:none;border-radius:4px;font-size:11px;cursor:pointer;" title="AI Code Assist">🤖 AI Assist</button>
        <button id="ce-load-cid" style="padding:5px 10px;background:#3b82f6;color:white;border:none;border-radius:4px;font-size:11px;cursor:pointer;" title="Load from IPFS CID">📥 Load CID</button>
        <span id="ce-status" style="margin-left:auto;font-size:10px;color:#6b7280;"></span>
      </div>
      <textarea id="ce-editor" style="
        flex: 1;
        border: none;
        padding: 12px;
        font-family: 'Courier New', monospace;
        font-size: 13px;
        resize: none;
        outline: none;
        background: #1e1e1e;
        color: #d4d4d4;
        line-height: 1.5;
      " placeholder="// Start coding... Use AI Assist (Ctrl+Space) for suggestions"></textarea>
      <div id="ce-ai-output" style="max-height:120px;overflow-y:auto;border-top:1px solid #e5e7eb;padding:8px;font-size:11px;background:#fefce8;display:none;"></div>
    </div>
  `;

  const editor = content.querySelector('#ce-editor') as HTMLTextAreaElement;
  const statusEl = content.querySelector('#ce-status') as HTMLElement;
  const aiOutput = content.querySelector('#ce-ai-output') as HTMLElement;

  // Save to IPFS
  content.querySelector('#ce-save-ipfs')?.addEventListener('click', async () => {
    const code = editor.value;
    if (!code.trim()) { statusEl.textContent = 'Nothing to save'; return; }
    statusEl.textContent = 'Saving to IPFS...';
    try {
      const r = await fetch(`${BACKEND}/v1/ipfs/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: code }) });
      const data = await r.json();
      const cid = data.cid || data.Hash || '';
      statusEl.textContent = `Saved! CID: ${cid.slice(0, 20)}...`;
    } catch (e: any) { statusEl.textContent = `Save failed: ${e.message}`; }
  });

  // Load from CID
  content.querySelector('#ce-load-cid')?.addEventListener('click', async () => {
    const cid = prompt('Enter CID to load:');
    if (!cid) return;
    statusEl.textContent = 'Loading from IPFS...';
    try {
      const r = await fetch(`${BACKEND}/v1/ipfs/cat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cid }) });
      const data = await r.json();
      editor.value = data.content || data.data || JSON.stringify(data);
      statusEl.textContent = `Loaded from ${cid.slice(0, 12)}...`;
    } catch (e: any) { statusEl.textContent = `Load failed: ${e.message}`; }
  });

  // AI Assist (uses ipfs_datasets_py generate endpoint)
  content.querySelector('#ce-ai-assist')?.addEventListener('click', async () => {
    const code = editor.value;
    const prompt_text = code.trim() ? `Complete or improve this code:\n\n${code.slice(-500)}` : 'Write a hello world TypeScript function';
    statusEl.textContent = 'AI generating...';
    aiOutput.style.display = 'block';
    aiOutput.innerHTML = '<em>Generating...</em>';
    try {
      const r = await fetch(`${BACKEND}/v1/ipfs/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: prompt_text }) });
      const data = await r.json();
      const generated = data.text || data.generated_text || data.result || '';
      aiOutput.innerHTML = `<strong>AI Suggestion:</strong><pre style="margin:4px 0;font-size:11px;white-space:pre-wrap;">${generated}</pre><button id="ce-apply-ai" style="font-size:10px;padding:2px 8px;background:#8b5cf6;color:white;border:none;border-radius:3px;cursor:pointer;">Apply</button>`;
      content.querySelector('#ce-apply-ai')?.addEventListener('click', () => { editor.value += '\n' + generated; aiOutput.style.display = 'none'; });
      statusEl.textContent = 'AI suggestion ready';
    } catch (e: any) { aiOutput.innerHTML = `<span style="color:red;">Error: ${e.message}</span>`; statusEl.textContent = 'AI failed'; }
  });

  // Keyboard shortcut
  editor.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.code === 'Space') { e.preventDefault(); (content.querySelector('#ce-ai-assist') as HTMLElement)?.click(); }
  });
}

async function openTaskManager(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('task-manager', 'Task Manager', 600, 450);
  const content = window.querySelector('.window-content') as HTMLElement;
  const BACKEND = 'http://localhost:8080';
  
  content.innerHTML = `
    <div style="font-family:system-ui;padding:12px;height:100%;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="margin:0;font-size:14px;">System & MCP Metrics</h3>
        <button id="tm-refresh" style="padding:4px 10px;background:#3b82f6;color:white;border:none;border-radius:4px;font-size:11px;cursor:pointer;">Refresh</button>
      </div>
      
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px;">
          <div style="font-size:10px;color:#166534;font-weight:600;">Memory</div>
          <div style="font-size:16px;font-weight:700;color:#15803d;" id="tm-memory">--</div>
        </div>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:10px;">
          <div style="font-size:10px;color:#1e40af;font-weight:600;">GPU Utilization</div>
          <div style="font-size:16px;font-weight:700;color:#1d4ed8;" id="tm-gpu">--</div>
        </div>
        <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:10px;">
          <div style="font-size:10px;color:#92400e;font-weight:600;">Throughput</div>
          <div style="font-size:16px;font-weight:700;color:#b45309;" id="tm-throughput">--</div>
        </div>
        <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:6px;padding:10px;">
          <div style="font-size:10px;color:#5b21b6;font-weight:600;">Endpoints</div>
          <div style="font-size:16px;font-weight:700;color:#6d28d9;" id="tm-endpoints">--</div>
        </div>
      </div>
      
      <div style="margin-bottom:12px;">
        <h4 style="font-size:12px;margin:0 0 8px;">MCP Daemon Status</h4>
        <div id="tm-daemons" style="font-size:11px;color:#6b7280;">Checking MCP daemons...</div>
      </div>
      
      <div>
        <h4 style="font-size:12px;margin:0 0 8px;">Active Endpoints</h4>
        <div id="tm-endpoint-list" style="font-size:10px;font-family:monospace;color:#4b5563;">Loading...</div>
      </div>
    </div>
  `;

  async function refreshMetrics() {
    // Local metrics
    const mem = (performance as any).memory;
    (content.querySelector('#tm-memory') as HTMLElement).textContent = mem ? `${Math.round(mem.usedJSHeapSize / 1024 / 1024)}MB` : 'N/A';

    // Backend metrics from ipfs_accelerate_py
    try {
      const [metricsResp, endpointsResp] = await Promise.allSettled([
        fetch(`${BACKEND}/v1/ipfs/metrics`, { signal: AbortSignal.timeout(3000) }),
        fetch(`${BACKEND}/v1/ipfs/endpoints`, { signal: AbortSignal.timeout(3000) }),
      ]);

      if (metricsResp.status === 'fulfilled' && metricsResp.value.ok) {
        const m = await metricsResp.value.json();
        (content.querySelector('#tm-gpu') as HTMLElement).textContent = `${m.utilization || 0}%`;
        (content.querySelector('#tm-throughput') as HTMLElement).textContent = `${m.throughput || 0} req/s`;
      }

      if (endpointsResp.status === 'fulfilled' && endpointsResp.value.ok) {
        const e = await endpointsResp.value.json();
        const endpoints = e.endpoints || e || [];
        (content.querySelector('#tm-endpoints') as HTMLElement).textContent = `${endpoints.length} active`;
        (content.querySelector('#tm-endpoint-list') as HTMLElement).innerHTML = endpoints.slice(0, 10).map((ep: any) => 
          `<div style="padding:2px 0;border-bottom:1px solid #f3f4f6;">${typeof ep === 'string' ? ep : ep.url || ep.name || JSON.stringify(ep)}</div>`
        ).join('') || 'No endpoints';
      }
    } catch {}

    // MCP daemon status
    const daemons = [
      { name: 'ipfs_kit_py', port: 8004 },
      { name: 'ipfs_datasets_py', port: 3002 },
      { name: 'ipfs_accelerate_py', port: 3003 },
    ];
    const daemonStatuses = await Promise.allSettled(
      daemons.map(d => fetch(`http://localhost:${d.port}/`, { signal: AbortSignal.timeout(2000) }))
    );
    (content.querySelector('#tm-daemons') as HTMLElement).innerHTML = daemons.map((d, i) => {
      const ok = daemonStatuses[i].status === 'fulfilled';
      return `<div style="padding:3px 0;"><span style="color:${ok ? '#16a34a' : '#dc2626'};">${ok ? '●' : '○'}</span> ${d.name} (:${d.port})</div>`;
    }).join('');
  }

  content.querySelector('#tm-refresh')?.addEventListener('click', refreshMetrics);
  await refreshMetrics();
}

async function openModelBrowser(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('model-browser', 'Model Browser', 700, 500);
  const content = window.querySelector('.window-content') as HTMLElement;
  const BACKEND = 'http://localhost:8080';
  
  content.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;font-family:system-ui;">
      <div style="display:flex;gap:8px;padding:10px;border-bottom:1px solid #e5e7eb;background:#f8fafc;">
        <input type="text" id="model-search" placeholder="Search models..." style="flex:1;padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;">
        <button id="model-refresh" style="padding:6px 12px;background:#3b82f6;color:white;border:none;border-radius:4px;font-size:11px;cursor:pointer;">🔄 Refresh</button>
        <span id="model-status" style="font-size:10px;padding:4px 8px;border-radius:8px;background:#fef3c7;color:#92400e;align-self:center;">...</span>
      </div>
      <div style="display:flex;gap:8px;padding:6px 10px;border-bottom:1px solid #e5e7eb;">
        <span id="model-hw-info" style="font-size:10px;color:#6b7280;">Hardware: detecting...</span>
      </div>
      <div id="model-list" style="flex:1;overflow-y:auto;padding:10px;">
        <div style="text-align:center;padding:40px;color:#9ca3af;">Loading models from ipfs_accelerate_py...</div>
      </div>
    </div>
  `;

  const modelList = content.querySelector('#model-list') as HTMLElement;
  const statusEl = content.querySelector('#model-status') as HTMLElement;
  const hwInfo = content.querySelector('#model-hw-info') as HTMLElement;

  async function loadModels() {
    try {
      const [modelsResp, hwResp, capsResp] = await Promise.allSettled([
        fetch(`${BACKEND}/v1/ipfs/list_models`, { signal: AbortSignal.timeout(5000) }),
        fetch(`${BACKEND}/v1/ipfs/hardware_profile`, { signal: AbortSignal.timeout(5000) }),
        fetch(`${BACKEND}/v1/ipfs/capabilities`, { signal: AbortSignal.timeout(5000) }),
      ]);

      // Hardware info
      if (hwResp.status === 'fulfilled' && hwResp.value.ok) {
        const hw = await hwResp.value.json();
        hwInfo.textContent = `GPU: ${(hw.gpus || []).length} | Memory: ${hw.memory_gb || '?'}GB | CPU: ${hw.cpu_cores || '?'} cores`;
      }

      // Models list
      if (modelsResp.status === 'fulfilled' && modelsResp.value.ok) {
        const data = await modelsResp.value.json();
        const models = data.models || data || [];
        statusEl.textContent = `${models.length} models`;
        statusEl.style.background = '#dcfce7'; statusEl.style.color = '#166534';
        
        modelList.innerHTML = models.length > 0
          ? models.map((m: any) => `
            <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <strong style="font-size:13px;">${typeof m === 'string' ? m : m.name || m.id || 'Unknown'}</strong>
                <span style="font-size:10px;background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:3px;">${m.backend || m.type || 'model'}</span>
              </div>
              ${m.size ? `<div style="font-size:10px;color:#6b7280;margin-top:4px;">Size: ${m.size}</div>` : ''}
            </div>
          `).join('')
          : '<div style="text-align:center;padding:20px;color:#6b7280;">No models available. Start ipfs_accelerate_py MCP server.</div>';
      } else {
        statusEl.textContent = 'Offline'; statusEl.style.background = '#fee2e2'; statusEl.style.color = '#991b1b';
        modelList.innerHTML = '<div style="text-align:center;padding:20px;color:#ef4444;">Backend unavailable. Ensure MCP daemons are running.</div>';
      }
    } catch (e: any) {
      statusEl.textContent = 'Error'; modelList.innerHTML = `<div style="padding:20px;color:#ef4444;">${e.message}</div>`;
    }
  }

  content.querySelector('#model-refresh')?.addEventListener('click', loadModels);
  content.querySelector('#model-search')?.addEventListener('input', async (e) => {
    const query = (e.target as HTMLInputElement).value.trim();
    if (query.length < 2) return;
    try {
      const r = await fetch(`${BACKEND}/v1/ipfs/search_models`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
      const data = await r.json();
      const results = data.results || data.models || [];
      modelList.innerHTML = results.map((m: any) => `<div style="padding:8px;border-bottom:1px solid #f3f4f6;font-size:12px;">${typeof m === 'string' ? m : m.name || JSON.stringify(m)}</div>`).join('') || '<div style="padding:20px;color:#6b7280;">No results</div>';
    } catch {}
  });

  await loadModels();
}
async function openIPFSExplorer(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('ipfs-explorer', 'IPFS Explorer', 750, 550);
  const content = window.querySelector('.window-content') as HTMLElement;
  
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
        App capability gateway | ipfs_kit_py descriptor pack | Ready
      </div>
    </div>
  `;
  
  const cidInput = content.querySelector('#ipfs-cid-input') as HTMLInputElement;
  const contentArea = content.querySelector('#ipfs-content-area') as HTMLElement;
  const statusBadge = content.querySelector('#ipfs-status-badge') as HTMLElement;
  const statusBar = content.querySelector('#ipfs-status-bar') as HTMLElement;
  
  // Check backend status
  const statusEnvelope = await invokeBrowserMainIPFSCapability('ipfs-explorer', 'ipfs.kit.tool.node_id', { operation: 'status' });
  if (statusEnvelope.status === 'ok') {
    statusBadge.textContent = 'Online';
    statusBadge.style.background = '#dcfce7';
    statusBadge.style.color = '#166534';
  } else {
    statusBadge.textContent = 'Degraded';
    statusBadge.style.background = '#fee2e2';
    statusBadge.style.color = '#991b1b';
  }
  
  // Fetch content
  content.querySelector('#ipfs-fetch-btn')?.addEventListener('click', async () => {
    const cid = cidInput.value.trim();
    if (!cid) return;
    contentArea.innerHTML = '<div style="padding: 20px; color: #64748b;">Fetching...</div>';
    const envelope = await invokeBrowserMainIPFSCapability('ipfs-explorer', 'ipfs.kit.tool.ipfs_cat', { cid });
    contentArea.innerHTML = renderBrowserMainEnvelope(envelope);
    statusBar.textContent = `${envelope.status}: ${envelope.summary}`;
  });
  
  // Stat
  content.querySelector('#ipfs-stat-btn')?.addEventListener('click', async () => {
    const cid = cidInput.value.trim();
    if (!cid) return;
    const envelope = await invokeBrowserMainIPFSCapability('ipfs-explorer', 'ipfs.kit.tool.block_stat', { cid });
    contentArea.innerHTML = renderBrowserMainEnvelope(envelope);
    statusBar.textContent = `${envelope.status}: ${envelope.summary}`;
  });
  
  // Pin
  content.querySelector('#ipfs-pin-btn')?.addEventListener('click', async () => {
    const cid = cidInput.value.trim();
    if (!cid) return;
    const envelope = await invokeBrowserMainIPFSCapability('ipfs-explorer', 'ipfs.kit.tool.pin_add', { cid });
    contentArea.innerHTML = renderBrowserMainEnvelope(envelope);
    statusBar.textContent = `${envelope.status}: ${envelope.summary}`;
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
        const envelope = await invokeBrowserMainIPFSCapability('ipfs-explorer', 'ipfs.kit.tool.get_pinset', { operation: 'list_pins' });
        contentArea.innerHTML = renderBrowserMainEnvelope(envelope);
      } else if (tabName === 'dag') {
        contentArea.innerHTML = `<div style="padding: 20px; color: #64748b;">Enter a CID and click Fetch to explore its DAG structure.</div>`;
        const cid = cidInput.value.trim();
        if (cid) {
          const envelope = await invokeBrowserMainIPFSCapability('ipfs-explorer', 'ipfs.kit.tool.dag_get', { cid });
          contentArea.innerHTML = renderBrowserMainEnvelope(envelope);
        }
      } else if (tabName === 'names') {
        const name = cidInput.value.trim();
        if (name) {
          const envelope = await invokeBrowserMainIPFSCapability('ipfs-explorer', 'ipfs.kit.tool.name_resolve', { name });
          contentArea.innerHTML = renderBrowserMainEnvelope(envelope);
        } else {
          contentArea.innerHTML = '<div style="padding: 20px; color: #64748b;">Enter an IPNS name to resolve.</div>';
        }
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
    <div class="context-menu-item" data-app="orb-auto-ui">🪄 ORB Auto-UI Launcher</div>
    <div class="context-menu-item" data-app="mcp-plus-plus">🔬 MCP++ Protocol Explorer</div>
    <div class="context-menu-item" data-app="idl-explorer">🔗 IDL Interface Explorer</div>
    <div class="context-menu-item" data-app="glasses-preview">👓 Meta Glasses Preview</div>
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

  // Update glasses indicator
  const glassesStatus = document.getElementById('glasses-status');
  if (glassesStatus) {
    const cp = (window as any).glassesControlPlane;
    glassesStatus.className = `status-indicator ${cp?.state?.activeAppId ? 'online' : 'offline'}`;
    glassesStatus.title = cp?.state?.activeAppId ? `Glasses: ${cp.state.activeAppId}` : 'Glasses: Disconnected';
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

// ---------------------------------------------------------------------------
// IDL Interface Explorer - auto-generates UI from registered descriptors
// ---------------------------------------------------------------------------

async function openIDLExplorer(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('idl-explorer', 'IDL Interface Explorer', 750, 600);
  const content = window.querySelector('.window-content') as HTMLElement;

  const PROFILES = BROWSER_MAIN_DESCRIPTOR_REGISTRY.map(descriptor => ({
    name: descriptor.ui?.display_name || descriptor.name,
    id: descriptor.name,
    template: descriptor.ui?.primary_template || 'explorer',
    methods: descriptor.methods,
    tags: descriptor.tags || [],
    interface_cid: descriptor.interface_cid,
  }));

  content.innerHTML = `
    <div style="padding:16px;font-family:system-ui;height:100%;overflow-y:auto;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <h2 style="margin:0;font-size:1.1rem;">🔗 MCP-IDL Interface Registry</h2>
        <span style="background:#4a6cf7;color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;">ORB Discovery</span>
      </div>
      <p style="color:#6b7280;font-size:12px;margin-bottom:16px;">
        Registered interfaces are discoverable through the ORB capability router.
        Select an interface to see its methods, schemas, and auto-generated UI template.
      </p>
      <div id="idl-profiles" style="display:grid;gap:12px;">
        ${PROFILES.map(p => `
          <div class="idl-profile-card" data-profile="${p.id}" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;cursor:pointer;transition:all 0.2s;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <strong style="font-size:13px;">${p.name}</strong>
                <span style="margin-left:8px;font-size:10px;background:#dbeafe;color:#1e40af;padding:1px 6px;border-radius:4px;">${p.template}</span>
              </div>
              <span style="font-size:11px;color:#6b7280;">${p.methods.length} methods</span>
            </div>
            <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">
              ${p.tags.map(t => `<span style="font-size:10px;background:#f3f4f6;padding:1px 6px;border-radius:3px;color:#4b5563;">${t}</span>`).join('')}
            </div>
            <div style="margin-top:8px;font-family:monospace;font-size:10px;color:#9ca3af;">
              CID: ${p.interface_cid}
            </div>
          </div>
        `).join('')}
      </div>
      <div id="idl-detail" style="margin-top:16px;"></div>
    </div>
  `;

  content.querySelectorAll('.idl-profile-card').forEach(card => {
    card.addEventListener('click', () => {
      const profileId = (card as HTMLElement).dataset.profile;
      const profile = PROFILES.find(p => p.id === profileId);
      if (!profile) return;
      const detail = content.querySelector('#idl-detail') as HTMLElement;
      detail.innerHTML = `
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;">
          <h3 style="margin:0 0 8px;font-size:0.95rem;">${profile.name} - Method Signatures</h3>
          <div style="display:grid;gap:6px;max-height:250px;overflow-y:auto;">
            ${profile.methods.map((m: any) => `
              <div style="background:#f9fafb;padding:6px 10px;border-radius:4px;font-family:monospace;font-size:11px;display:flex;justify-content:space-between;">
                <span style="color:#1e40af;font-weight:600;">${m.name}()</span>
                <span style="color:#6b7280;">${m.capability_id || 'descriptor-only'}</span>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb;">
            <strong style="font-size:11px;">UI Template:</strong> <code style="font-size:11px;">${profile.template}</code>
            <span style="margin-left:12px;font-size:11px;">| <strong>ORB Transport:</strong> <code>http</code></span>
            <span style="margin-left:12px;font-size:11px;">| <strong>Meta Glasses:</strong> ✓ DAT-native</span>
          </div>
        </div>
      `;
    });
  });
}

// ---------------------------------------------------------------------------
// Meta Glasses Preview - simulates AR display widget rendering
// ---------------------------------------------------------------------------

async function openGlassesPreview(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('glasses-preview', 'Meta Glasses Widget Preview', 650, 650);
  const content = window.querySelector('.window-content') as HTMLElement;

  content.innerHTML = `
    <div style="padding:16px;font-family:system-ui;height:100%;display:flex;flex-direction:column;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <h2 style="margin:0;font-size:1.1rem;">👓 Meta Glasses Widget Preview</h2>
        <span style="background:#10b981;color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;">DAT-native</span>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <button class="glasses-tab active" data-widget="kit" style="padding:4px 12px;border:1px solid #d1d5db;border-radius:4px;background:#4a6cf7;color:#fff;cursor:pointer;font-size:11px;">IPFS Kit</button>
        <button class="glasses-tab" data-widget="datasets" style="padding:4px 12px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:pointer;font-size:11px;">Datasets</button>
        <button class="glasses-tab" data-widget="accelerate" style="padding:4px 12px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:pointer;font-size:11px;">Accelerate</button>
      </div>
      <div style="flex:1;display:flex;justify-content:center;align-items:center;">
        <div id="glasses-viewport" style="width:300px;height:300px;border-radius:50%;background:#111;position:relative;overflow:hidden;border:3px solid #333;">
          <div id="glasses-display" style="position:absolute;inset:25px;background:#1a1a2e;border-radius:4px;padding:12px;display:flex;flex-direction:column;gap:6px;"></div>
        </div>
      </div>
      <div style="text-align:center;font-size:11px;color:#6b7280;margin-top:8px;">
        Simulated 600x600 viewport (scaled to fit) • Meta Ray-Ban Display Class
      </div>
    </div>
  `;

  const widgets: Record<string, { title: string; regions: Array<{ label: string; value: string; kind: string }> }> = {
    kit: {
      title: 'IPFS Storage',
      regions: [
        { label: 'Pins', value: '12 pinned', kind: 'status' },
        { label: 'Size', value: '48.2 MB', kind: 'status' },
        { label: 'Latest', value: 'bafy2bz...kd4f', kind: 'text' },
        { label: '', value: '[ Add ] [ Browse ]', kind: 'action' },
      ],
    },
    datasets: {
      title: 'Datasets & Search',
      regions: [
        { label: 'Collections', value: '3 indexed', kind: 'status' },
        { label: 'Results', value: 'Say "search" to query', kind: 'text' },
        { label: '', value: '[ Search ] [ Generate ] [ Embed ]', kind: 'action' },
      ],
    },
    accelerate: {
      title: 'Accelerate',
      regions: [
        { label: 'GPU', value: '45% util', kind: 'status' },
        { label: 'Latency', value: '23ms p50', kind: 'status' },
        { label: 'Model', value: 'llama-3.1-8b', kind: 'text' },
        { label: 'Queue', value: 'Idle', kind: 'progress' },
        { label: '', value: '[ Infer ] [ Metrics ]', kind: 'action' },
      ],
    },
  };

  function renderWidget(name: string) {
    const display = content.querySelector('#glasses-display') as HTMLElement;
    const w = widgets[name];
    display.innerHTML = `
      <div style="color:#4ade80;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">${w.title}</div>
      ${w.regions.map(r => {
        if (r.kind === 'status') return `<div style="display:flex;justify-content:space-between;color:#e5e7eb;font-size:9px;"><span style="color:#9ca3af;">${r.label}</span><span style="color:#60a5fa;font-family:monospace;">${r.value}</span></div>`;
        if (r.kind === 'action') return `<div style="color:#a78bfa;font-size:9px;text-align:center;margin-top:auto;border-top:1px solid #333;padding-top:6px;">${r.value}</div>`;
        if (r.kind === 'progress') return `<div style="color:#fbbf24;font-size:9px;"><span style="color:#9ca3af;">${r.label}:</span> ${r.value}</div>`;
        return `<div style="color:#e5e7eb;font-size:9px;font-family:monospace;">${r.label ? r.label + ': ' : ''}${r.value}</div>`;
      }).join('')}
    `;
  }

  content.querySelectorAll('.glasses-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      content.querySelectorAll('.glasses-tab').forEach(t => { (t as HTMLElement).style.background = '#fff'; (t as HTMLElement).style.color = '#333'; });
      (tab as HTMLElement).style.background = '#4a6cf7';
      (tab as HTMLElement).style.color = '#fff';
      renderWidget((tab as HTMLElement).dataset.widget || 'kit');
    });
  });

  renderWidget('kit');
}

// ---------------------------------------------------------------------------
// ORB Auto-UI Launcher - dynamically opens apps from IDL descriptors
// ---------------------------------------------------------------------------

const BROWSER_MAIN_DESCRIPTOR_REGISTRY = [
  {
    name: 'ipfs-kit',
    namespace: 'dev.hallucinate.ipfs.kit',
    version: '1.0.0',
    service_family: 'ipfs_kit_py',
    interface_cid: 'sha256:browser-main-ipfs-kit-descriptor-v1',
    tags: ['ipfs', 'storage', 'dag', 'ipns', 'pinning'],
    methods: [
      { name: 'node_id', capability_id: 'ipfs.kit.tool.node_id', inputSchema: { type: 'object', properties: {} }, outputSchema: { type: 'object', properties: { id: { type: 'string' } } } },
      { name: 'ipfs_add', capability_id: 'ipfs.kit.tool.ipfs_add', inputSchema: { type: 'object', properties: { content: { type: 'string' }, filename: { type: 'string' }, pin: { type: 'boolean' } }, required: ['content'] }, outputSchema: { type: 'object', properties: { cid: { type: 'string' }, size: { type: 'number' } } } },
      { name: 'ipfs_cat', capability_id: 'ipfs.kit.tool.ipfs_cat', inputSchema: { type: 'object', properties: { cid: { type: 'string' }, path: { type: 'string' } } }, outputSchema: { type: 'object', properties: { content: { type: 'string' } } } },
      { name: 'ipfs_ls', capability_id: 'ipfs.kit.tool.ipfs_ls', inputSchema: { type: 'object', properties: { path: { type: 'string' }, cid: { type: 'string' } } }, outputSchema: { type: 'object', properties: { items: { type: 'array' } } } },
      { name: 'pin_add', capability_id: 'ipfs.kit.tool.pin_add', inputSchema: { type: 'object', properties: { cid: { type: 'string' }, path: { type: 'string' } } }, outputSchema: { type: 'object', properties: { pinned: { type: 'boolean' } } } },
      { name: 'pin_rm', capability_id: 'ipfs.kit.tool.pin_rm', inputSchema: { type: 'object', properties: { cid: { type: 'string' }, path: { type: 'string' } } }, outputSchema: { type: 'object', properties: { unpinned: { type: 'boolean' } } } },
      { name: 'get_pinset', capability_id: 'ipfs.kit.tool.get_pinset', inputSchema: { type: 'object', properties: {} }, outputSchema: { type: 'object', properties: { pins: { type: 'array' } } } },
      { name: 'block_stat', capability_id: 'ipfs.kit.tool.block_stat', inputSchema: { type: 'object', properties: { cid: { type: 'string' }, path: { type: 'string' } } }, outputSchema: { type: 'object', properties: { size: { type: 'number' }, blocks: { type: 'number' } } } },
      { name: 'dag_get', capability_id: 'ipfs.kit.tool.dag_get', inputSchema: { type: 'object', properties: { cid: { type: 'string' }, path: { type: 'string' } } }, outputSchema: { type: 'object', properties: { data: { type: 'object' } } } },
      { name: 'dag_put', capability_id: 'ipfs.kit.tool.dag_put', inputSchema: { type: 'object', properties: { data: { type: 'object' }, pin: { type: 'boolean' } }, required: ['data'] }, outputSchema: { type: 'object', properties: { cid: { type: 'string' } } } },
      { name: 'name_publish', capability_id: 'ipfs.kit.tool.name_publish', inputSchema: { type: 'object', properties: { cid: { type: 'string' }, path: { type: 'string' }, name: { type: 'string' } } }, outputSchema: { type: 'object', properties: { name: { type: 'string' }, value: { type: 'string' } } } },
      { name: 'name_resolve', capability_id: 'ipfs.kit.tool.name_resolve', inputSchema: { type: 'object', properties: { name: { type: 'string' }, path: { type: 'string' } } }, outputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
    ],
    ui: { primary_template: 'explorer', icon: '📦', display_name: 'IPFS Kit', category: 'storage' },
  },
  {
    name: 'ipfs-datasets',
    namespace: 'dev.hallucinate.ipfs.datasets',
    version: '1.0.0',
    service_family: 'ipfs_datasets_py',
    interface_cid: 'sha256:browser-main-ipfs-datasets-descriptor-v1',
    tags: ['datasets', 'search', 'vectors', 'provenance'],
    methods: [
      { name: 'browse', capability_id: 'ipfs.datasets.operation.browse', inputSchema: { type: 'object', properties: { root_cid: { type: 'string' }, path: { type: 'string' }, limit: { type: 'number' } } }, outputSchema: { type: 'object', properties: { entries: { type: 'array' } } } },
      { name: 'get', capability_id: 'ipfs.datasets.operation.get', inputSchema: { type: 'object', properties: { dataset_id: { type: 'string' }, cid: { type: 'string' }, path: { type: 'string' } } }, outputSchema: { type: 'object', properties: { record: { type: 'object' } } } },
      { name: 'index', capability_id: 'ipfs.datasets.operation.index', inputSchema: { type: 'object', properties: { dataset_id: { type: 'string' }, root_cid: { type: 'string' }, schema: { type: 'object' } } }, outputSchema: { type: 'object', properties: { indexed: { type: 'number' }, index_cid: { type: 'string' } } } },
      { name: 'pin', capability_id: 'ipfs.datasets.operation.pin', inputSchema: { type: 'object', properties: { dataset_id: { type: 'string' }, cid: { type: 'string' } } }, outputSchema: { type: 'object', properties: { pinned: { type: 'boolean' } } } },
      { name: 'publish', capability_id: 'ipfs.datasets.operation.publish', inputSchema: { type: 'object', properties: { dataset_id: { type: 'string' }, metadata: { type: 'object' } } }, outputSchema: { type: 'object', properties: { dataset_cid: { type: 'string' }, provenance_cid: { type: 'string' } } } },
      { name: 'sync_status', capability_id: 'ipfs.datasets.operation.sync_status', inputSchema: { type: 'object', properties: { dataset_id: { type: 'string' } } }, outputSchema: { type: 'object', properties: { status: { type: 'string' }, frontier: { type: 'array' } } } },
    ],
    ui: { primary_template: 'dashboard', icon: '📊', display_name: 'IPFS Datasets', category: 'datasets' },
  },
  {
    name: 'ipfs-accelerate',
    namespace: 'dev.hallucinate.ipfs.accelerate',
    version: '1.0.0',
    service_family: 'ipfs_accelerate_py',
    interface_cid: 'sha256:browser-main-ipfs-accelerate-descriptor-v1',
    tags: ['inference', 'hardware', 'telemetry', 'jobs'],
    methods: [
      { name: 'hardware_profile', capability_id: 'ipfs.accelerate.operation.hardware_profile', inputSchema: { type: 'object', properties: {} }, outputSchema: { type: 'object', properties: { devices: { type: 'array' }, memory_gb: { type: 'number' } } } },
      { name: 'run_inference_job', capability_id: 'ipfs.accelerate.operation.run_inference_job', inputSchema: { type: 'object', properties: { model: { type: 'string' }, input: { type: 'string' }, max_tokens: { type: 'number' } }, required: ['model', 'input'] }, outputSchema: { type: 'object', properties: { job_id: { type: 'string' }, status: { type: 'string' } } } },
      { name: 'job_status', capability_id: 'ipfs.accelerate.operation.job_status', inputSchema: { type: 'object', properties: { job_id: { type: 'string' } } }, outputSchema: { type: 'object', properties: { job_id: { type: 'string' }, status: { type: 'string' }, artifacts: { type: 'array' } } } },
      { name: 'telemetry', capability_id: 'ipfs.accelerate.operation.telemetry', inputSchema: { type: 'object', properties: { window: { type: 'string', enum: ['1m', '5m', '1h'] } } }, outputSchema: { type: 'object', properties: { throughput: { type: 'number' }, utilization: { type: 'number' }, event_frontier: { type: 'array' } } } },
    ],
    ui: { primary_template: 'job-console', icon: '⚡', display_name: 'IPFS Accelerate', category: 'inference' },
  },
];

const ORB_REGISTERED_DESCRIPTORS = BROWSER_MAIN_DESCRIPTOR_REGISTRY;

if (typeof window !== 'undefined') {
  (window as any).__swissKnifeDescriptorRegistry = {
    registry_id: 'swissknife.browser-main-mcp-descriptor-registry.v1',
    list: () => BROWSER_MAIN_DESCRIPTOR_REGISTRY,
    get: (descriptorId: string) => BROWSER_MAIN_DESCRIPTOR_REGISTRY.find(d => d.name === descriptorId || (d as any).service_family === descriptorId),
    inspect: (descriptorId: string) => {
      const descriptor = BROWSER_MAIN_DESCRIPTOR_REGISTRY.find(d => d.name === descriptorId || (d as any).service_family === descriptorId);
      return descriptor ? {
        registry_id: 'swissknife.browser-main-mcp-descriptor-registry.v1',
        id: descriptor.name,
        namespace: descriptor.namespace,
        interface_cid: (descriptor as any).interface_cid,
        method_schemas: descriptor.methods.map((method: any) => ({
          method: method.name,
          capability_id: method.capability_id,
          input_schema: method.inputSchema,
          output_schema: method.outputSchema,
        })),
      } : null;
    },
    invoke: async ({ descriptor_id, operation, input, app_id }: any) => {
      const descriptor = BROWSER_MAIN_DESCRIPTOR_REGISTRY.find(d => d.name === descriptor_id || (d as any).service_family === descriptor_id);
      const method = descriptor?.methods.find((candidate: any) => candidate.name === operation);
      if (!method?.capability_id) {
        return invokeBrowserMainIPFSCapability(app_id || 'orb-auto-ui', 'descriptor.operation.missing', input || {});
      }
      return invokeBrowserMainIPFSCapability(app_id || `orb-${descriptor?.name}`, method.capability_id, input || {});
    },
  };
  (window as any).swissKnifeDescriptorRegistry = (window as any).__swissKnifeDescriptorRegistry;
}

async function openORBAutoUILauncher(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('orb-auto-ui', '🪄 ORB Auto-UI Launcher', 500, 450);
  const content = window.querySelector('.window-content') as HTMLElement;

  content.innerHTML = `
    <div style="padding:16px;font-family:system-ui;height:100%;overflow-y:auto;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <h2 style="margin:0;font-size:1rem;">🪄 ORB Auto-UI Generator</h2>
        <span style="font-size:9px;background:#f3e8ff;color:#7c3aed;padding:2px 6px;border-radius:3px;">IDL → UI</span>
      </div>
      <p style="color:#6b7280;font-size:11px;margin-bottom:16px;">
        Launch dynamically generated application interfaces from registered MCP service descriptors.
        Each app is built at runtime from the service's IDL schema — no manual UI code required.
      </p>
      <div style="display:grid;gap:10px;">
        ${ORB_REGISTERED_DESCRIPTORS.map(d => `
          <div class="orb-launch-card" data-descriptor="${d.name}" style="
            display:flex;align-items:center;gap:12px;padding:12px;background:#f9fafb;
            border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;transition:all 0.15s;">
            <span style="font-size:22px;">${d.ui?.icon || '🔧'}</span>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:600;">${d.ui?.display_name || d.name}</div>
              <div style="font-size:10px;color:#6b7280;">${d.methods.length} methods | ${d.namespace}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;">
              <span style="font-size:9px;background:#dbeafe;color:#1e40af;padding:1px 5px;border-radius:3px;">${d.ui?.primary_template}</span>
              <span style="font-size:9px;color:#9ca3af;">v${d.version}</span>
            </div>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:16px;padding:10px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;">
        <div style="font-size:10px;color:#92400e;font-weight:600;">How it works</div>
        <div style="font-size:10px;color:#78350f;margin-top:4px;">
          1. IDL descriptor defines methods + schemas<br>
          2. ORB resolves transport + endpoints<br>
          3. Auto-UI generates forms + result panels<br>
          4. Same descriptor → Glasses widget + Electron dashboard
        </div>
      </div>
    </div>
  `;

  content.querySelectorAll('.orb-launch-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
      (card as HTMLElement).style.borderColor = '#3b82f6';
      (card as HTMLElement).style.background = '#eff6ff';
    });
    card.addEventListener('mouseleave', () => {
      (card as HTMLElement).style.borderColor = '#e5e7eb';
      (card as HTMLElement).style.background = '#f9fafb';
    });
    card.addEventListener('click', () => {
      const name = (card as HTMLElement).dataset.descriptor;
      const descriptor = ORB_REGISTERED_DESCRIPTORS.find(d => d.name === name);
      if (descriptor) {
        openORBGeneratedApp(descriptor as any, createWindow);
      }
    });
  });
}

// --- MCP++ Protocol Explorer Desktop App ---

async function openMCPPlusPlusExplorer(swissknife: SwissKnifeBrowserCore) {
  const window = createWindow('mcp-plus-plus', '🔬 MCP++ Protocol Explorer', 750, 550);
  const content = window.querySelector('.window-content') as HTMLElement;
  const mcpPlusPlusBackendEndpoints = [
    '/v1/ipfs/status', '/v1/ipfs/add', '/v1/ipfs/cat',
    '/v1/ipfs/pin', '/v1/ipfs/unpin', '/v1/ipfs/resolve',
    '/v1/ipfs/list_pins', '/v1/ipfs/stat',
    '/v1/ipfs/dag/get', '/v1/ipfs/dag/put',
    '/v1/ipfs/name/publish', '/v1/ipfs/name/resolve',
    '/v1/ipfs/embed', '/v1/ipfs/generate', '/v1/ipfs/inference',
    '/v1/ipfs/list_models', '/v1/ipfs/capabilities',
    '/v1/ipfs/hardware_profile', '/v1/ipfs/metrics',
    '/v1/ipfs/endpoints', '/v1/ipfs/search_models',
    '/v1/ipfs/list_datasets',
    '/v1/ipfs/search/semantic', '/v1/ipfs/search/similarity',
    '/v1/ipfs/search/faceted',
    '/v1/ipfs/vector/index', '/v1/ipfs/vector/search',
    '/v1/ipfs/vector/metadata',
    '/v1/ipfs/scrape/url', '/v1/ipfs/scrape/batch',
    '/v1/ipfs/workflow/execute',
  ] as const;
  // In-browser MCP++ state (mirrors the TypeScript client)
  const interfaces = BROWSER_MAIN_DESCRIPTOR_REGISTRY.map(descriptor => ({
    name: descriptor.name,
    namespace: descriptor.namespace,
    version: descriptor.version,
    cid: descriptor.interface_cid,
    methods: descriptor.methods.length,
    method_defs: descriptor.methods,
    tags: descriptor.tags,
  }));

  const eventDAG: any[] = [];

  content.innerHTML = `
    <div style="font-family:system-ui;height:100%;display:flex;flex-direction:column;">
      <div style="display:flex;border-bottom:1px solid #e5e7eb;">
        <button class="mcppp-tab active" data-tab="interfaces" style="padding:8px 14px;border:none;background:#eff6ff;color:#1e40af;cursor:pointer;font-size:11px;font-weight:600;">Interfaces</button>
        <button class="mcppp-tab" data-tab="execute" style="padding:8px 14px;border:none;background:transparent;cursor:pointer;font-size:11px;">Execute</button>
        <button class="mcppp-tab" data-tab="dag" style="padding:8px 14px;border:none;background:transparent;cursor:pointer;font-size:11px;">Event DAG</button>
        <button class="mcppp-tab" data-tab="delegate" style="padding:8px 14px;border:none;background:transparent;cursor:pointer;font-size:11px;">UCAN</button>
        <button class="mcppp-tab" data-tab="profiles" style="padding:8px 14px;border:none;background:transparent;cursor:pointer;font-size:11px;">Profiles</button>
      </div>
      <div id="mcppp-content" style="flex:1;overflow-y:auto;padding:12px;"></div>
    </div>
  `;

  const contentArea = content.querySelector('#mcppp-content') as HTMLElement;
  
  function renderTab(tab: string) {
    content.querySelectorAll('.mcppp-tab').forEach(t => {
      (t as HTMLElement).style.background = t.getAttribute('data-tab') === tab ? '#eff6ff' : 'transparent';
      (t as HTMLElement).style.color = t.getAttribute('data-tab') === tab ? '#1e40af' : '#4b5563';
    });

    switch (tab) {
      case 'interfaces':
        contentArea.innerHTML = `
          <div style="display:flex;gap:8px;margin-bottom:12px;padding:8px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;">
            <button id="mcppp-connect-btn" style="padding:6px 12px;background:#3b82f6;color:white;border:none;border-radius:4px;font-size:11px;cursor:pointer;">🔌 Connect to MCP++ Servers</button>
            <span id="mcppp-conn-status" style="font-size:10px;align-self:center;color:#6b7280;">Not connected</span>
          </div>
          <h3 style="margin:0 0 12px;font-size:14px;">📋 Registered MCP++ Interface Descriptors</h3>
          ${interfaces.map(i => `
            <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <strong style="font-size:13px;">${i.name}</strong>
                <span style="font-size:10px;background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:3px;">${i.namespace}</span>
              </div>
              <div style="font-size:10px;color:#6b7280;margin-top:4px;">
                CID: <code>${i.cid}</code> | v${i.version} | ${i.methods} methods
              </div>
              <div style="margin-top:4px;">${i.tags.map(t => `<span style="font-size:9px;background:#f3f4f6;padding:1px 4px;border-radius:2px;margin-right:3px;">${t}</span>`).join('')}</div>
            </div>
          `).join('')}
          <div style="margin-top:12px;padding:8px;background:#f9fafb;border-radius:6px;font-size:10px;color:#6b7280;">
            Profiles required: mcp++/cid-envelope, mcp++/ucan | Total methods: ${interfaces.reduce((s, i) => s + i.methods, 0)} | Backend endpoints: ${mcpPlusPlusBackendEndpoints.length}
          </div>
          <div style="margin-top:8px;padding:8px;background:#f9fafb;border-radius:6px;font-size:10px;color:#6b7280;">
            <strong>Live Servers:</strong><br>
            • ipfs_datasets_py (port 3002): MCP-IDL, CID-Envelope, UCAN, Deontic Policy, Event DAG, P2P<br>
            • ipfs_accelerate_py (port 3003): Trio-native MCP++, P2P taskqueue, workflows
          </div>
        `;
        content.querySelector('#mcppp-connect-btn')?.addEventListener('click', async () => {
          const statusEl = content.querySelector('#mcppp-conn-status') as HTMLElement;
          statusEl.textContent = 'Connecting...';
          const servers = [
            { name: 'ipfs_datasets_py', url: 'http://localhost:3002/health/ready' },
            { name: 'ipfs_accelerate_py', url: 'http://localhost:3003/api/mcp/status' },
          ];
          const results = await Promise.allSettled(servers.map(s => fetch(s.url, { signal: AbortSignal.timeout(3000) })));
          const connected = results.filter(r => r.status === 'fulfilled' && (r.value as Response).ok).length;
          statusEl.textContent = `${connected}/${servers.length} servers online`;
          statusEl.style.color = connected > 0 ? '#16a34a' : '#dc2626';
        });
        break;

      case 'execute':
        contentArea.innerHTML = `
          <h3 style="margin:0 0 12px;font-size:14px;">⚡ Execute with CID-Native Envelope</h3>
          <div style="display:grid;gap:8px;">
            <select id="mcppp-iface" style="padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;">
              ${interfaces.map(i => `<option value="${i.name}">${i.name} (${i.methods} methods)</option>`).join('')}
            </select>
            <input type="text" id="mcppp-method" placeholder="Method or capability id (blank = first descriptor method)" style="padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;">
            <textarea id="mcppp-input" placeholder='{"content": "hello world"}' style="height:60px;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:11px;font-family:monospace;resize:none;"></textarea>
            <button id="mcppp-exec-btn" style="padding:8px;background:#3b82f6;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;">🚀 Execute with Envelope</button>
          </div>
          <div id="mcppp-result" style="margin-top:12px;font-size:11px;font-family:monospace;white-space:pre-wrap;"></div>
        `;
        content.querySelector('#mcppp-exec-btn')?.addEventListener('click', async () => {
          const method = (content.querySelector('#mcppp-method') as HTMLInputElement).value;
          const inputJson = (content.querySelector('#mcppp-input') as HTMLTextAreaElement).value;
          const resultEl = content.querySelector('#mcppp-result') as HTMLElement;
          
          resultEl.innerHTML = '<span style="color:#6b7280;">Executing...</span>';
          try {
            const iface = (content.querySelector('#mcppp-iface') as HTMLSelectElement).value;
            const descriptor = BROWSER_MAIN_DESCRIPTOR_REGISTRY.find(d => d.name === iface);
            const operation = descriptor?.methods.find((candidate: any) => (
              candidate.name === method
              || candidate.capability_id === method
              || (!method && Boolean(candidate.capability_id))
            ));
            if (!descriptor || !operation?.capability_id) {
              resultEl.innerHTML = '<span style="color:red;">Descriptor operation was not found in the shared registry.</span>';
              return;
            }
            const input = inputJson ? JSON.parse(inputJson) : {};
            const envelope = await invokeBrowserMainIPFSCapability('mcp-plus-plus', operation.capability_id, input);
            const event = envelope.event_dag_refs?.[0];
            eventDAG.push({
              event_cid: event?.event_cid || `browser-main-event:${Date.now()}`,
              method: operation.name,
              timestamp: envelope.trace?.finished_at || new Date().toISOString(),
              success: envelope.status !== 'error',
            });
            resultEl.innerHTML = renderBrowserMainEnvelope(envelope);
          } catch (e: any) {
            resultEl.innerHTML = `<span style="color:red;">Error: ${e.message}</span>`;
          }
        });
        break;

      case 'dag':
        contentArea.innerHTML = `
          <h3 style="margin:0 0 12px;font-size:14px;">🌳 Event DAG (Provenance Graph)</h3>
          ${eventDAG.length > 0 ? `
            <div style="font-size:10px;color:#6b7280;margin-bottom:8px;">Frontier: ${eventDAG.length} events | Last: ${eventDAG[eventDAG.length-1]?.timestamp}</div>
            ${eventDAG.map((e, i) => `
              <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #f3f4f6;">
                <span style="color:${e.success ? '#16a34a' : '#dc2626'};">${e.success ? '●' : '○'}</span>
                <span style="font-size:10px;font-family:monospace;">${e.event_cid.slice(0, 16)}...</span>
                <span style="font-size:11px;">${e.method}</span>
                <span style="font-size:9px;color:#9ca3af;margin-left:auto;">${e.timestamp}</span>
              </div>
            `).join('')}
          ` : `
            <div style="text-align:center;padding:40px;color:#9ca3af;">
              <div style="font-size:24px;margin-bottom:8px;">🌿</div>
              <div>Event DAG is empty. Execute methods in the Execute tab to build the provenance graph.</div>
            </div>
          `}
        `;
        break;

      case 'delegate':
        contentArea.innerHTML = `
          <h3 style="margin:0 0 12px;font-size:14px;">🔑 UCAN Capability Delegation</h3>
          <div style="display:grid;gap:8px;">
            <input type="text" id="mcppp-aud" placeholder="Audience DID (did:key:z6Mk...)" style="padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;">
            <select id="mcppp-del-iface" style="padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;">
              ${interfaces.map(i => `<option value="${i.cid}">${i.name}</option>`).join('')}
            </select>
            <input type="text" id="mcppp-del-method" placeholder="Method (* for all)" value="*" style="padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;">
            <input type="number" id="mcppp-del-hours" value="24" style="padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;" placeholder="Expiration (hours)">
            <button id="mcppp-del-btn" style="padding:8px;background:#8b5cf6;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;">🔐 Create Delegation</button>
          </div>
          <div id="mcppp-del-result" style="margin-top:12px;font-size:11px;"></div>
        `;
        content.querySelector('#mcppp-del-btn')?.addEventListener('click', () => {
          const aud = (content.querySelector('#mcppp-aud') as HTMLInputElement).value || 'did:key:z6MkExample';
          const hours = parseInt((content.querySelector('#mcppp-del-hours') as HTMLInputElement).value) || 24;
          const proof_cid = 'bafy' + Math.random().toString(36).slice(2, 20);
          (content.querySelector('#mcppp-del-result') as HTMLElement).innerHTML = `
            <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:6px;padding:8px;">
              <div style="color:#5b21b6;font-weight:600;">✅ Delegation Created</div>
              <div>Issuer: did:key:z6MkswissknifeCLI</div>
              <div>Audience: ${aud}</div>
              <div>Proof CID: ${proof_cid}</div>
              <div>Expires: ${new Date(Date.now() + hours * 3600000).toISOString()}</div>
              <div>Capabilities: all methods on selected interface</div>
            </div>
          `;
        });
        break;

      case 'profiles':
        contentArea.innerHTML = `
          <h3 style="margin:0 0 12px;font-size:14px;">📦 Supported MCP++ Profiles</h3>
          <div style="display:grid;gap:8px;">
            ${[
              { id: 'A', name: 'MCP-IDL', desc: 'CID-addressed interface contracts with runtime discovery', status: '✅ Active' },
              { id: 'B', name: 'CID-Envelope', desc: 'Immutable execution artifacts (intents, decisions, receipts)', status: '✅ Active' },
              { id: 'C', name: 'UCAN', desc: 'Capability delegation chains with attenuation', status: '✅ Active' },
              { id: 'D', name: 'Deontic Policy', desc: 'Temporal permission/prohibition/obligation evaluation', status: '✅ Active' },
              { id: 'E', name: 'mcp+p2p', desc: 'P2P transport binding over libp2p', status: '🟡 Ready' },
              { id: '+', name: 'Event DAG', desc: 'Append-only provenance graph with Merkle ordering', status: '✅ Active' },
            ].map(p => `
              <div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px;">
                <div style="display:flex;justify-content:space-between;">
                  <strong style="font-size:12px;">Profile ${p.id}: ${p.name}</strong>
                  <span style="font-size:10px;">${p.status}</span>
                </div>
                <div style="font-size:11px;color:#6b7280;margin-top:2px;">${p.desc}</div>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:12px;background:#f9fafb;border-radius:6px;padding:8px;font-size:10px;color:#6b7280;">
            Protocol: /mcp+p2p/1.0.0 | Spec: MCP++ Draft | Compatible with baseline MCP
          </div>
        `;
        break;
    }
  }

  // Tab switching
  content.querySelectorAll('.mcppp-tab').forEach(tab => {
    tab.addEventListener('click', () => renderTab(tab.getAttribute('data-tab') || 'interfaces'));
  });

  renderTab('interfaces');
}

// Track start time
(window as any).startTime = Date.now();
