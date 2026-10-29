// SwissKnife Web Desktop - Main Application (Simplified for Testing)
import { mountAllAppBackendStatus } from './all-app-backend-status.js';
import { mountLiveToolGateway, invokeNativeTool } from './live-tool-gateway.js';

console.log('SwissKnife Web Desktop starting...');

// Manifest alias resolution, mirroring resolveVirtualDesktopAppId /
// VIRTUAL_DESKTOP_ALIAS_TO_ID in src/services/apps/virtual-desktop-app-manifest.ts
// (the canonical manifest; this served shell is plain JS and cannot import
// the TypeScript module at runtime). Canonical ids resolve to themselves,
// manifest aliases resolve to their canonical app id, unknown ids to null.
const VIRTUAL_DESKTOP_ALIAS_TO_ID = new Map([
    ['code-editor', 'vibecode'],
    ['strudel-grandma', 'music-studio'],
    ['p2p-chat-offline', 'p2p-chat'],
]);

function resolveVirtualDesktopAppId(appIdOrAlias, registeredApps) {
    if (registeredApps.has(appIdOrAlias)) return appIdOrAlias;
    return VIRTUAL_DESKTOP_ALIAS_TO_ID.get(appIdOrAlias) ?? null;
}

class SwissKnifeDesktop {
    constructor() {
        this.windows = new Map();
        this.windowCounter = 0;
        this.activeWindow = null;
        this.apps = new Map();
        this.isSwissKnifeReady = false;
        this.zIndexCounter = 1000;
        window.swissknifeDesktop = this;
        
        this.init();
    }
    
    async init() {
        console.log('Initializing SwissKnife Web Desktop...');
        
        // Initialize desktop components
        this.initializeDesktop();
        this.initializeApps();
        this.setupEventListeners();
        this.startSystemMonitoring();
        
        // Hide loading screen
        setTimeout(() => {
            const loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen) {
                loadingScreen.style.display = 'none';
            }
        }, 3000);
        
        console.log('SwissKnife Web Desktop ready!');
    }
    
    initializeDesktop() {
        // Initialize system time
        this.updateSystemTime();
        setInterval(() => this.updateSystemTime(), 1000);
        
        // Initialize system status
        this.updateSystemStatus();
        setInterval(() => this.updateSystemStatus(), 5000);
        
        // Setup desktop context menu
        this.setupContextMenu();
        
        // Setup window management
        this.setupWindowManagement();

        // Inject basic styles for active window focus cue (once)
        if (!document.getElementById('swissknife-active-window-style')) {
            const style = document.createElement('style');
            style.id = 'swissknife-active-window-style';
            style.textContent = `
                .window { box-shadow: 0 8px 18px rgba(0,0,0,0.18); }
                .window.window-active { box-shadow: 0 12px 28px rgba(0,0,0,0.28); }
                .window.window-active .window-titlebar { outline: 2px solid #3b82f6; outline-offset: -2px; }

            `;
            document.head.appendChild(style);
        }

        // Detect WebGL capabilities and show badge if limited
        this.detectAndShowGraphicsBadge();
        installToolSmokeStyles();
    }

    // Detect WebGL/renderer info and show a small badge if only software rendering is available
    detectAndShowGraphicsBadge() {
        const info = this.getWebGLInfo();
        this.graphicsInfo = info;
        if ((info.supported && !info.isSoftware) || document.getElementById('graphics-limited-badge')) return;

        const style = document.createElement('style');
        style.id = 'swissknife-graphics-status-style';
        style.textContent = `
            #graphics-limited-badge { flex:0 0 auto; margin:0; font:12px system-ui,sans-serif; color:#fbbf24; }
            #graphics-limited-badge > summary { display:grid; place-items:center; list-style:none; width:28px; height:28px; box-sizing:border-box; cursor:pointer; border:1px solid #b45309; border-radius:5px; background:#302714; }
            #graphics-limited-badge > summary::-webkit-details-marker { display:none; }
            #graphics-limited-badge > summary:focus-visible { outline:2px solid #93c5fd; outline-offset:2px; }
            #graphics-limited-badge .graphics-details { position:fixed; right:8px; bottom:56px; z-index:10001; box-sizing:border-box; width:min(24rem,calc(100vw - 16px)); max-height:min(16rem,calc(100vh - 96px)); overflow:auto; overflow-wrap:anywhere; padding:12px; border:1px solid #b45309; border-radius:6px; background:#302714; color:#fff4ce; box-shadow:0 2px 8px #0006; }
            #graphics-limited-badge .graphics-details h3 { margin:0 0 8px; font-size:14px; }
            #graphics-limited-badge .graphics-details p { margin:6px 0; }
            #graphics-limited-badge[data-taskbar-fallback] { position:fixed; bottom:4px; right:8px; z-index:10001; }
        `;
        document.head.appendChild(style);
        const container = document.createElement('details');
        container.id = 'graphics-limited-badge';
        const label = !info.supported ? 'Graphics unavailable' : 'Limited graphics (software)';
        const summary = document.createElement('summary');
        summary.textContent = '⚠';
        summary.title = label;
        summary.setAttribute('aria-label', `${label}. Show graphics details`);
        const panel = document.createElement('div');
        panel.className = 'graphics-details';
        const heading = document.createElement('h3');
        heading.textContent = label;
        const explanation = document.createElement('p');
        explanation.textContent = info.supported
            ? 'Software rendering is active. Graphics-heavy applications may run more slowly.'
            : 'WebGL is unavailable. Applications requiring graphics acceleration may not work.';
        const renderer = document.createElement('p');
        renderer.textContent = `Renderer: ${info.renderer || 'Unknown renderer'}`;
        panel.append(heading, explanation, renderer);
        container.append(summary, panel);
        const taskbar = document.querySelector('.system-panel .panel-right') || document.querySelector('.system-panel');
        if (!taskbar) container.dataset.taskbarFallback = 'true';
        (taskbar || document.body).prepend(container);
        container.addEventListener('keydown', event => {
            if (event.key === 'Escape' && container.open) {
                container.open = false;
                summary.focus();
                event.preventDefault();
                event.stopPropagation();
            }
        });
    }

    // Query WebGL support and renderer details
    getWebGLInfo() {
        try {
            const canvas = document.createElement('canvas');
            let gl = canvas.getContext('webgl2');
            let contextName = 'webgl2';
            if (!gl) { gl = canvas.getContext('webgl'); contextName = gl ? 'webgl' : null; }
            if (!gl) {
                // Try again with failIfMajorPerformanceCaveat to differentiate software paths
                gl = canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true }) || null;
                if (!gl) return { supported: false, isSoftware: true, renderer: null, vendor: null, contextName: null };
                contextName = 'webgl';
            }

            const dbg = gl.getExtension('WEBGL_debug_renderer_info');
            const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
            const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
            const r = (renderer || '').toLowerCase();
            // Heuristics for software renderers across platforms
            const softwareHints = ['swiftshader', 'llvmpipe', 'software', 'softpipe', 'angle (software)', 'mesa offscreen'];
            const isSoftware = softwareHints.some(h => r.includes(h));

            // Also consider major performance caveat: request with flag and see if it fails
            let caveat = false;
            try {
                const g2 = canvas.getContext(contextName || 'webgl', { failIfMajorPerformanceCaveat: true });
                caveat = !g2; // if it fails, there is a major performance caveat
            } catch { /* ignore */ }

            return { supported: true, isSoftware: isSoftware || caveat, renderer, vendor, contextName };
        } catch {
            return { supported: false, isSoftware: true, renderer: null, vendor: null, contextName: null };
        }
    }
    
    initializeApps() {
        console.log('🔧 Initializing apps...');
        
        // Core applications
        this.apps.set('terminal', {
            name: 'SwissKnife Terminal',
            icon: '🖥️',
            component: 'TerminalApp',
            singleton: false
        });
        
        this.apps.set('vibecode', {
            name: 'VibeCode Editor',
            icon: '🎯',
            component: 'VibeCodeApp',
            singleton: false
        });
        
        this.apps.set('strudel-ai-daw', {
            name: 'Strudel AI DAW',
            icon: '🎵',
            component: 'StrudelAIDAWApp',
            singleton: false
        });
        
        this.apps.set('ai-chat', {
            name: 'AI Chat',
            icon: '🤖',
            component: 'AIChatApp',
            singleton: false
        });
        
        this.apps.set('file-manager', {
            name: 'File Manager',
            icon: '📁',
            component: 'FileManagerApp',
            singleton: true
        });
        
        this.apps.set('task-manager', {
            name: 'Task Manager',
            icon: '⚡',
            component: 'TaskManagerApp',
            singleton: true
        });
        
        this.apps.set('todo', {
            name: 'Todo & Goals',
            icon: '📋',
            component: 'TodoApp',
            singleton: false
        });
        
        this.apps.set('model-browser', {
            name: 'AI Model Browser',
            icon: '🧠',
            component: 'ModelBrowserApp',
            singleton: true
        });
        
        this.apps.set('huggingface', {
            name: '🤗 Hugging Face Hub',
            icon: '🤗',
            component: 'HuggingFaceApp',
            singleton: true
        });
        
        this.apps.set('openrouter', {
            name: '🔄 OpenRouter Hub',
            icon: '🔄',
            component: 'OpenRouterApp',
            singleton: true
        });
        
        this.apps.set('ipfs-explorer', {
            name: 'IPFS Explorer',
            icon: '🌐',
            component: 'IPFSExplorerApp',
            singleton: true
        });
        
        this.apps.set('device-manager', {
            name: 'Device Manager',
            icon: '🔧',
            component: 'DeviceManagerApp',
            singleton: true
        });
        
        this.apps.set('settings', {
            name: 'Settings',
            icon: '⚙️',
            component: 'SettingsApp',
            singleton: true
        });

        this.apps.set('mcp-control', {
            name: 'MCP Control',
            icon: '🔌',
            component: 'MCPControlApp',
            singleton: true
        });

        this.apps.set('api-keys', {
            name: 'API Keys',
            icon: '🔑',
            component: 'APIKeysApp',
            singleton: true
        });

        this.apps.set('github', {
            name: 'GitHub',
            icon: '🐙',
            component: 'GitHubApp',
            singleton: true
        });

        this.apps.set('oauth-login', {
            name: 'OAuth Login',
            icon: '🔐',
            component: 'OAuthLoginApp',
            singleton: true
        });

        this.apps.set('cron', {
            name: 'AI Cron Scheduler',
            icon: '⏰',
            component: 'CronApp',
            singleton: true
        });

        this.apps.set('navi', {
            name: 'NAVI',
            icon: '<img src="/assets/icons/navi-icon.png" style="width: 24px; height: 24px; border-radius: 4px;">',
            component: 'NaviApp',
            singleton: true
        });

        this.apps.set('strudel', {
            name: '🎵 Music Studio',
            icon: '🎵',
            component: 'GrandmaStrudelDAW',
            singleton: false
        });
        
        this.apps.set('music-studio-unified', {
            name: 'Music Studio',
            icon: '🎵',
            component: 'MusicStudioUnifiedApp',
            singleton: false
        });
        
        this.apps.set('strudel-ai-daw', {
            name: 'Strudel AI DAW',
            icon: '🎼',
            component: 'StrudelAIDAWApp',
            singleton: false
        });
        
        this.apps.set('music-studio', {
            name: 'Music Studio Classic',
            icon: '🎸',
            component: 'MusicStudioApp',
            singleton: false
        });
        
        this.apps.set('p2p-chat', {
            name: 'P2P Chat Classic',
            icon: '💭',
            component: 'P2PChatApp',
            singleton: false
        });
        
        this.apps.set('p2p-chat-unified', {
            name: 'P2P Chat - Unified',
            icon: '💬',
            component: 'P2PChatUnifiedApp',
            singleton: false
        });
        
        this.apps.set('p2p-network', {
            name: 'P2P Network Manager',
            icon: '🔗',
            component: 'P2PNetworkApp',
            singleton: true
        });
        
        this.apps.set('neural-network-designer', {
            name: 'Neural Network Designer',
            icon: '🧠',
            component: 'NeuralNetworkDesignerApp',
            singleton: false
        });
        
        this.apps.set('training-manager', {
            name: 'Training Manager',
            icon: '🎯',
            component: 'TrainingManagerApp',
            singleton: true
        });
        
        // Essential utility apps
        this.apps.set('calculator', {
            name: 'Calculator',
            icon: '🧮',
            component: 'CalculatorApp',
            singleton: true
        });
        
        this.apps.set('clock', {
            name: 'Clock & Timers',
            icon: '🕐',
            component: 'ClockApp',
            singleton: true
        });
        
        this.apps.set('calendar', {
            name: 'Calendar & Events',
            icon: '📅',
            component: 'CalendarApp',
            singleton: true
        });
        
        this.apps.set('peertube', {
            name: 'PeerTube - P2P Video Player',
            icon: '📺',
            component: 'PeerTubeApp',
            singleton: false
        });
        
        this.apps.set('friends-list', {
            name: 'Friends & Network',
            icon: '👥',
            component: 'FriendsListApp',
            singleton: true
        });
        
        this.apps.set('image-viewer', {
            name: 'Image Viewer',
            icon: '🖼️',
            component: 'ImageViewerApp',
            singleton: false
        });
        
        this.apps.set('notes', {
            name: 'Notes',
            icon: '📝',
            component: 'NotesApp',
            singleton: false
        });
        
        this.apps.set('system-monitor', {
            name: 'System Monitor',
            icon: '📊',
            component: 'SystemMonitorApp',
            singleton: true
        });
        
        // Creative apps
        this.apps.set('neural-photoshop', {
            name: 'Art - AI Image Editor',
            icon: '🎨',
            component: 'NeuralPhotoshopApp',
            singleton: false
        });
        
        this.apps.set('cinema', {
            name: 'Cinema - Professional Video Editor',
            icon: '🎬',
            component: 'CinemaApp',
            singleton: false
        });
        
        this.apps.set('media-player', {
            name: 'Media Player',
            icon: '🎵',
            component: 'MediaPlayer',
            singleton: false
        });

        this.apps.set('datasets-browser', {
            name: 'IPFS Datasets Browser',
            icon: '▦',
            component: 'DescriptorAppComponent',
            singleton: true
        });

        this.apps.set('accelerate-panel', {
            name: 'IPFS Accelerate Panel',
            icon: '▶',
            component: 'DescriptorAppComponent',
            singleton: true
        });

        this.apps.set('idl-explorer', {
            name: 'ORB IDL Explorer',
            icon: '⌘',
            component: 'IDLExplorerApp',
            singleton: true
        });

        this.apps.set('glasses-preview', {
            name: 'Meta Glasses Preview',
            icon: '◉',
            component: 'GlassesPreviewApp',
            singleton: true
        });

        this.apps.set('orb-auto-ui', {
            name: 'ORB Auto UI',
            icon: '◇',
            component: 'ORBAutoUILauncher',
            singleton: true
        });

        this.apps.set('mcp-plus-plus', {
            name: 'MCP++ Explorer',
            icon: '※',
            component: 'MCPPlusPlusExplorer',
            singleton: true
        });

        this.apps.set('agent-supervisor', {
            name: 'Agent Supervisor',
            icon: '◬',
            component: 'AgentSupervisorConsole',
            singleton: true
        });
        
        console.log('📱 Total apps registered:', this.apps.size);
        console.log('📱 Apps list:', Array.from(this.apps.keys()));
    }
    
    setupEventListeners() {
        if (this._desktopListenersBound) {
            return;
        }
        this._desktopListenersBound = true;
        console.log('🎯 Setting up event listeners...');
        
        // Desktop icon clicks - changed to single click
        const desktopIcons = document.querySelectorAll('.icon');
        console.log('🖱️ Found desktop icons:', desktopIcons.length);
        
        desktopIcons.forEach((icon, index) => {
            const appId = icon.dataset.app;
            console.log(`🔗 Setting up icon ${index + 1}: ${appId}`);

            icon.tabIndex = icon.tabIndex >= 0 ? icon.tabIndex : 0;
            icon.setAttribute('role', icon.getAttribute('role') || 'button');
            icon.setAttribute('aria-label', icon.getAttribute('aria-label') || icon.getAttribute('title') || appId || 'Desktop application');

            const activateIcon = (e) => {
                e.preventDefault();
                console.log(`🖱️ Desktop icon clicked: ${appId}`);
                if (appId) {
                    this.launchApp(appId);
                }
            };

            icon.addEventListener('click', activateIcon);
            icon.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    activateIcon(e);
                }
            });
        });
        
        // System menu
        const systemMenuBtn = document.getElementById('system-menu-btn');
        const systemMenu = document.getElementById('system-menu');
        
        if (systemMenuBtn && systemMenu) {
            // Ensure menu starts hidden
            systemMenu.classList.add('hidden');
            
            systemMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (systemMenu.classList.contains('hidden')) {
                    systemMenu.classList.remove('hidden');
                } else {
                    systemMenu.classList.add('hidden');
                }
            });
            
            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!systemMenu.contains(e.target) && !systemMenuBtn.contains(e.target)) {
                    systemMenu.classList.add('hidden');
                }
            });
            
            // Menu item clicks
            const menuItems = document.querySelectorAll('.menu-item[data-app]');
            console.log('📋 Found menu items:', menuItems.length);
            
            menuItems.forEach((item, index) => {
                const appId = item.dataset.app;
                console.log(`📋 Setting up menu item ${index + 1}: ${appId}`);
                
                item.addEventListener('click', () => {
                    console.log(`📋 Menu item clicked: ${appId}`);
                    if (appId) {
                        this.launchApp(appId);
                    }
                    systemMenu.classList.add('hidden');
                });
            });
        }
        
        // Set up global functions for HTML onclick handlers
        window.showDesktopProperties = () => this.showDesktopProperties();
        window.openTerminalHere = () => this.openTerminalHere();
        window.createNewFile = () => this.createNewFile();
        window.createNewFolder = () => this.createNewFolder();
        window.refreshDesktop = () => this.refreshDesktop();
        window.showAbout = () => this.showAbout();
    }
    
    async launchApp(appId, options = {}) {
        console.log(`Launching app: ${appId}`);

        // Resolve manifest aliases (e.g. code-editor -> vibecode) to the
        // canonical app id before lookup, matching the manifest resolver
        // semantics; unknown ids fall through to the not-found path below.
        const resolvedAppId = resolveVirtualDesktopAppId(appId, this.apps);
        if (resolvedAppId) appId = resolvedAppId;

        const appConfig = this.apps.get(appId);
        if (!appConfig) {
            console.error(`App ${appId} not found`);
            return;
        }
        
        // Check if singleton app is already running
        if (appConfig.singleton) {
            const existingWindow = Array.from(this.windows.values())
                .find(w => w.appId === appId);
            if (existingWindow) {
                if (existingWindow.minimized && existingWindow.element) {
                    existingWindow.element.style.display = 'block';
                    existingWindow.minimized = false;
                }
                this.focusWindow(existingWindow.element);
                return;
            }
        }
        
        try {
            // Create new window for the app
            const window = await this.createWindow({
                title: appConfig.name,
                icon: appConfig.icon,
                appId: appId,
                width: 800,
                height: 600,
                x: 100 + (this.windowCounter * 30),
                y: 100 + (this.windowCounter * 30)
            });

            const appContent = document.getElementById(`${window.id}-content`);
            const gatewayHost = document.getElementById(`${window.id}-gateway`);

            const smokeEntry = getToolSmokeEntry(appId);
            if (smokeEntry) {
                renderToolSmokePanel(appContent, smokeEntry);
                await mountAllAppBackendStatus(gatewayHost, appId);
                await mountLiveToolGateway(gatewayHost, appId);
                console.log(`Rendered MCP UI smoke panel for ${appConfig.name}`);
                return;
            }

            // The release replay opens the same canonical desktop window and
            // mounts its governed MCP++ controls, but does not need to boot an
            // unrelated heavyweight application runtime (for example a media
            // engine or model browser) just to click those controls.  This is
            // opt-in and keeps normal desktop launches unchanged.
            if (options.gatewayOnly === true) {
                appContent.innerHTML = `
                    <section class="app-placeholder" data-testid="gateway-only-app-surface">
                        <h2>${appConfig.name}</h2>
                        <p>Application transport controls are ready.</p>
                    </section>
                `;
                await mountAllAppBackendStatus(gatewayHost, appId);
                await mountLiveToolGateway(gatewayHost, appId);
                console.log(`Rendered transport replay surface for ${appConfig.name}`);
                return;
            }
            
            // Keep governed backend controls available while optional app
            // initialization (for example a large WASM runtime) completes.
            const componentLoad = this.loadAppComponent(window, appConfig.component);
            await mountAllAppBackendStatus(gatewayHost, appId);
            await mountLiveToolGateway(gatewayHost, appId);
            await componentLoad;
            
            console.log(`Launched ${appConfig.name}`);
        } catch (error) {
            console.error(`Failed to launch ${appConfig.name}:`, error);
        }
    }
    
    async createWindow(options) {
        const windowId = `window-${++this.windowCounter}`;
        
        const windowElement = document.createElement('div');
        windowElement.className = 'window window-enter';
        windowElement.id = windowId;
        windowElement.dataset.appId = options.appId || '';
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth || options.width;
        const viewportHeight = document.documentElement.clientHeight || window.innerHeight || options.height;
        const safeWidth = Math.min(options.width, viewportWidth);
        const safeHeight = Math.min(options.height, Math.max(180, viewportHeight - 48));
        const safeX = Math.max(0, Math.min(options.x, Math.max(0, viewportWidth - safeWidth)));
        const safeY = Math.max(0, Math.min(options.y, Math.max(0, viewportHeight - safeHeight - 48)));
        windowElement.style.left = safeX + 'px';
        windowElement.style.top = safeY + 'px';
        windowElement.style.width = safeWidth + 'px';
        windowElement.style.height = safeHeight + 'px';
        windowElement.style.zIndex = String(++this.zIndexCounter);
        
        // Create window structure
        windowElement.innerHTML = `
            <div class="window-titlebar">
                <span class="window-icon">${options.icon}</span>
                <span class="window-title">${options.title}</span>
                <div class="window-controls">
                    <button class="window-control minimize" data-action="minimize" title="Minimize" aria-label="Minimize">−</button>
                    <button class="window-control maximize" data-action="maximize" title="Maximize" aria-label="Maximize">□</button>
                    <button class="window-control close" data-action="close" title="Close" aria-label="Close">×</button>
                </div>
            </div>
            <div class="window-content">
                <div class="window-app-content">
                    <div id="${windowId}-content">
                        <div class="window-loading">
                            <div class="window-loading-spinner"></div>
                        </div>
                    </div>
                    <div class="live-tool-gateway-host" id="${windowId}-gateway"></div>
                </div>
            </div>
        `;
        
        // Add window to container
        const windowsContainer = document.getElementById('windows-container');
        if (windowsContainer) {
            windowsContainer.appendChild(windowElement);
        }
        
        // Store window reference BEFORE setting up controls (so controls can access window data)
        const window = {
            id: windowId,
            element: windowElement,
            appId: options.appId,
            title: options.title,
            minimized: false,
            maximized: false,
            preMaximizeState: null
        };
        
        this.windows.set(windowId, window);
        
        // Setup window controls (needs window to be in map first)
        this.setupWindowControls(windowElement);
        // Setup window dragging
        this.setupWindowDragging(windowElement);
        // Bring to front on interaction
        windowElement.addEventListener('mousedown', () => this.focusWindow(windowElement));
        
        // Focus newly created window
        this.focusWindow(windowElement);
        // Update taskbar
        this.updateTaskbar();
        
        return window;
    }
    
    async loadAppComponent(window, componentName) {
        const contentElement = document.getElementById(`${window.id}-content`);
        
        try {
            switch (componentName) {
                case 'TerminalApp':
                    await this.createTerminalApp(contentElement);
                    break;
                    
                case 'VibeCodeApp':
                    await this.createVibeCodeApp(contentElement);
                    break;
                    
                case 'StrudelAIDAWApp':
                    await this.createStrudelAIDAWApp(contentElement);
                    break;
                    
                case 'AIChatApp':
                    await this.createAIChatApp(contentElement);
                    break;
                    
                case 'FileManagerApp':
                    await this.createFileManagerApp(contentElement);
                    break;
                    
                case 'TaskManagerApp':
                    await this.createTaskManagerApp(contentElement);
                    break;
                    
                case 'ModelBrowserApp':
                    await this.createModelBrowserApp(contentElement);
                    break;
                    
                case 'HuggingFaceApp':
                    await this.createHuggingFaceApp(contentElement);
                    break;
                    
                case 'OpenRouterApp':
                    await this.createOpenRouterApp(contentElement);
                    break;
                    
                case 'IPFSExplorerApp':
                    await this.createIPFSExplorerApp(contentElement);
                    break;
                    
                case 'DeviceManagerApp':
                    await this.createDeviceManagerApp(contentElement);
                    break;
                    
                case 'SettingsApp':
                    await this.createSettingsApp(contentElement);
                    break;
                    
                case 'MCPControlApp':
                    await this.createMCPControlApp(contentElement);
                    break;

                case 'DescriptorAppComponent':
                    await this.createGeneratedServiceSurface(contentElement, window.appId || window.currentAppId || 'descriptor-app');
                    break;

                case 'IDLExplorerApp':
                    await this.createGeneratedServiceSurface(contentElement, 'idl-explorer');
                    break;

                case 'GlassesPreviewApp':
                    await this.createGlassesPreviewSurface(contentElement);
                    break;

                case 'ORBAutoUILauncher':
                    await this.createGeneratedServiceSurface(contentElement, 'orb-auto-ui');
                    break;

                case 'MCPPlusPlusExplorer':
                    await this.createMCPPlusPlusExplorerSurface(contentElement);
                    break;

                case 'AgentSupervisorConsole':
                    await this.createAgentSupervisorApp(contentElement);
                    break;
                    
                case 'APIKeysApp':
                    await this.createAPIKeysApp(contentElement);
                    break;
                    
                case 'GitHubApp':
                    await this.createGitHubApp(contentElement);
                    break;
                    
                case 'OAuthLoginApp':
                    await this.createOAuthLoginApp(contentElement);
                    break;
                    
                case 'CronApp':
                    await this.createCronApp(contentElement);
                    break;
                    
                case 'NaviApp':
                    await this.createNaviApp(contentElement);
                    break;
                    
                case 'CalculatorApp':
                    await this.createCalculatorApp(contentElement);
                    break;
                    
                case 'ClockApp':
                    await this.createClockApp(contentElement);
                    break;
                    
                case 'CalendarApp':
                    await this.createCalendarApp(contentElement);
                    break;
                    
                case 'TodoApp':
                    await this.createTodoApp(contentElement);
                    break;
                    
                case 'FriendsListApp':
                    await this.createFriendsListApp(contentElement);
                    break;
                    
                case 'ImageViewerApp':
                    await this.createImageViewerApp(contentElement);
                    break;
                    
                case 'NotesApp':
                    await this.createNotesApp(contentElement);
                    break;
                    
                case 'SystemMonitorApp':
                    await this.createSystemMonitorApp(contentElement);
                    break;
                    
                case 'P2PNetworkApp':
                    await this.createP2PNetworkApp(contentElement);
                    break;
                    
                case 'NeuralNetworkDesignerApp':
                    await this.createNeuralNetworkDesignerApp(contentElement);
                    break;
                    
                case 'P2PChatUnifiedApp':
                    await this.createP2PChatUnifiedApp(contentElement);
                    break;
                    
                case 'TrainingManagerApp':
                    await this.createTrainingManagerApp(contentElement);
                    break;
                    
                case 'PeerTubeApp':
                    await this.createPeerTubeApp(contentElement);
                    break;
                    
                case 'NeuralPhotoshopApp':
                    await this.createNeuralPhotoshopApp(contentElement);
                    break;
                    
                case 'CinemaApp':
                    await this.createCinemaApp(contentElement);
                    break;
                    
                case 'MediaPlayer':
                    await this.createMediaPlayerApp(contentElement);
                    break;
                    
                case 'GrandmaStrudelDAW':
                    await this.createGrandmaStrudelDAWApp(contentElement);
                    break;
                    
                case 'MusicStudioUnifiedApp':
                    await this.createMusicStudioUnifiedApp(contentElement);
                    break;
                    
                case 'MusicStudioApp':
                    await this.createMusicStudioApp(contentElement);
                    break;
                    
                case 'P2PChatApp':
                    await this.createP2PChatApp(contentElement);
                    break;
                    
                default:
                    this.createPlaceholderApp(contentElement, componentName);
            }
        } catch (error) {
            console.error(`Failed to load app component ${componentName}:`, error);
            this.createErrorApp(contentElement, componentName, error);
        }
    }

    // App creation methods
    async createTerminalApp(contentElement) {
        try {
            console.log('🔧 Creating terminal app...');
            const { TerminalApp } = await import('./apps/terminal.js');
            console.log('✅ Terminal module imported successfully');
            
            const terminal = new TerminalApp(this);
            console.log('✅ Terminal instance created');
            
            await terminal.initialize(contentElement);
            console.log('✅ Terminal initialized successfully');
            
            return terminal;
        } catch (error) {
            console.error('❌ Terminal creation error:', error);
            
            // Provide a fallback terminal interface
            contentElement.innerHTML = `
                <div class="terminal-fallback">
                    <div class="terminal-header">
                        <h3>🖥️ SwissKnife Terminal</h3>
                        <div class="terminal-status">Status: Ready</div>
                    </div>
                    <div class="terminal-body">
                        <div class="terminal-welcome">
                            <div class="welcome-banner">
                                <pre style="color: #00ff00; font-size: 12px;">
 ____            _               _  __      _  __      
/ ___|          (_)             | |/ /     (_)/ _|     
\\___ \\ __      __ _  ___  ___   | ' / _ __  _ | |_  ___ 
 ___) |\\ \\ /\\ / /| |/ __|/ __|  |  < | '_ \\| ||  _|/ _ \\
|____/  \\ V  V / | |\\__ \\\\__ \\  | . \\| | | | || | |  __/
         \\_/\\_/  |_||___/|___/  |_|\\_\\_| |_|_||_|  \\___|
                                </pre>
                            </div>
                            <div class="welcome-text">
                                <p style="color: #00ff00;">Welcome to SwissKnife Terminal v2.0</p>
                                <p style="color: #888;">AI-Powered Command Line Interface with P2P Integration</p>
                                <p style="color: #666;">Type 'help' for available commands or 'ai help' for AI assistance</p>
                            </div>
                        </div>
                        <div class="terminal-output" style="color: #fff; font-family: 'Courier New', monospace; background: #000; padding: 10px; height: 300px; overflow-y: auto;">
                            <div class="command-line">
                                <span style="color: #00ff00;">swissknife@desktop</span>:<span style="color: #0080ff;">~</span>$ <span class="cursor">|</span>
                            </div>
                        </div>
                        <div class="terminal-controls" style="padding: 10px; background: #222;">
                            <button class="btn btn-small" style="margin-right: 10px;">🤖 AI Assist</button>
                            <button class="btn btn-small" style="margin-right: 10px;">🔗 P2P Connect</button>
                            <button class="btn btn-small" style="margin-right: 10px;">⚙️ Settings</button>
                            <button class="btn btn-small">📋 Sessions</button>
                        </div>
                    </div>
                </div>
            `;
            
            // Add some basic terminal styling
            const style = document.createElement('style');
            style.textContent = `
                .terminal-fallback {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    font-family: 'Courier New', monospace;
                }
                .terminal-header {
                    background: #2a2a2a;
                    padding: 10px;
                    border-bottom: 1px solid #444;
                    color: #fff;
                }
                .terminal-body {
                    flex: 1;
                    background: #1a1a1a;
                    color: #fff;
                }
                .cursor {
                    animation: blink 1s infinite;
                }
                @keyframes blink {
                    0%, 50% { opacity: 1; }
                    51%, 100% { opacity: 0; }
                }
            `;
            contentElement.appendChild(style);
            
            return null;
        }
    }

    async createVibeCodeApp(contentElement) {
        const { VibeCodeApp } = await import('./apps/vibecode.js');
        const vibeCode = new VibeCodeApp(this);
        await vibeCode.initialize();
        const html = await vibeCode.render();
        contentElement.innerHTML = html;
        this.setupEventListeners();
        vibeCode.setupEventListeners(contentElement);
        return vibeCode;
    }

    async createStrudelAIDAWApp(contentElement) {
        const { StrudelAIDAWApp } = await import('./apps/strudel-ai-daw.js');
        const strudelAI = new StrudelAIDAWApp(this);
        await strudelAI.initialize();
        const html = await strudelAI.render();
        contentElement.innerHTML = html;
        this.setupEventListeners();
        // Ensure the component wires up events and audio after content is in DOM
        if (typeof strudelAI.mount === 'function') {
            await strudelAI.mount(contentElement);
        }
        return strudelAI;
    }

    async createAIChatApp(contentElement) {
        const { AIChatApp } = await import('./apps/ai-chat.js');
        const aiChat = new AIChatApp(this);
        await aiChat.initialize();
        const html = await aiChat.render();
        contentElement.innerHTML = html;
        this.setupEventListeners();
        return aiChat;
    }

    async createFileManagerApp(contentElement) {
        const { FileManagerApp } = await import('./apps/file-manager.js');
        const fileManager = new FileManagerApp(this);
        await fileManager.initialize();
        const html = await fileManager.render();
        contentElement.innerHTML = html;
        this.setupEventListeners();
        if (typeof fileManager.setupEventListeners === 'function') {
            fileManager.setupEventListeners(contentElement);
        }
        return fileManager;
    }

    async createTaskManagerApp(contentElement) {
        const { TaskManagerApp } = await import('./apps/task-manager.js');
        const taskManager = new TaskManagerApp(this);
        await taskManager.initialize();
        const html = await taskManager.render();
        contentElement.innerHTML = html;
        this.setupEventListeners();
        return taskManager;
    }

    async createModelBrowserApp(contentElement) {
        try {
            const { ModelBrowserApp } = await import('./apps/model-browser.js');
            const modelBrowser = new ModelBrowserApp(this);
            await modelBrowser.initialize();
            // Use the app's render() which returns a config with HTML content
            const config = await modelBrowser.render();
            contentElement.innerHTML = config.content || (typeof config === 'string' ? config : 'Model Browser loading...');
            // Wire up events and initial render into the provided container
            if (typeof modelBrowser.setupEventListeners === 'function') {
                modelBrowser.setupEventListeners(contentElement);
            }
            if (typeof modelBrowser.renderModelList === 'function') {
                modelBrowser.renderModelList(contentElement);
            }
            return modelBrowser;
        } catch (error) {
            console.error('Failed to load Model Browser app:', error);
            contentElement.innerHTML = `
                <div class="app-placeholder">
                    <h2>📚 AI Model Manager</h2>
                    <p>AI model management with P2P sharing and IPFS integration</p>
                    <p>Failed to load: ${error.message}</p>
                    <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
                </div>
            `;
        }
    }

    async createHuggingFaceApp(contentElement) {
        try {
            const { HuggingFaceApp } = await import('./apps/huggingface.js');
            const huggingFace = new HuggingFaceApp();
            await huggingFace.initialize();
            const html = huggingFace.render();
            contentElement.innerHTML = html;
        this.setupEventListeners();
            
            // Setup event handlers
            if (huggingFace.setupEventListeners) {
                huggingFace.setupEventListeners();
            }
            
            return huggingFace;
        } catch (error) {
            console.error('Failed to load Hugging Face app:', error);
            contentElement.innerHTML = `
                <div class="app-placeholder">
                    <h2>🤗 Hugging Face Hub</h2>
                    <p>Professional AI Model Hub, Dataset Management & Inference Platform</p>
                    <p>Failed to load: ${error.message}</p>
                    <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
                </div>
            `;
        }
    }

    async createOpenRouterApp(contentElement) {
        try {
            const { OpenRouterApp } = await import('./apps/openrouter.js');
            const openRouter = new OpenRouterApp();
            await openRouter.initialize();
            const html = openRouter.render();
            contentElement.innerHTML = html;
        this.setupEventListeners();
            
            // Setup event handlers
            if (openRouter.setupEventListeners) {
                openRouter.setupEventListeners();
            }
            
            return openRouter;
        } catch (error) {
            console.error('Failed to load OpenRouter app:', error);
            contentElement.innerHTML = `
                <div class="app-placeholder">
                    <h2>🔄 OpenRouter Hub</h2>
                    <p>Universal LLM Access Hub - Multiple AI Providers Through Single Interface</p>
                    <p>Failed to load: ${error.message}</p>
                    <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
                </div>
            `;
        }
    }

    async createIPFSExplorerApp(contentElement) {
        try {
            const { IPFSExplorerApp } = await import('./apps/ipfs-explorer.js');
            const ipfsExplorer = new IPFSExplorerApp(this);
            await ipfsExplorer.initialize();
            // IPFSExplorerApp.render() returns a config object, get HTML from createWindow()
            const windowContent = ipfsExplorer.createWindow();
            if (typeof windowContent === 'string') {
                contentElement.innerHTML = windowContent;
            } else if (windowContent && windowContent.content) {
                contentElement.innerHTML = windowContent.content;
            } else {
                const config = await ipfsExplorer.render();
                contentElement.innerHTML = config.content || 'IPFS Explorer loading...';
            }
            if (typeof ipfsExplorer.setupEventListeners === 'function') {
                ipfsExplorer.setupEventListeners(contentElement);
            } else if (typeof ipfsExplorer.mount === 'function') {
                await ipfsExplorer.mount(contentElement);
            } else {
                this.setupEventListeners();
            }
            return ipfsExplorer;
        } catch (error) {
            console.error('Failed to load IPFS Explorer app:', error);
            contentElement.innerHTML = `
                <div class="app-placeholder">
                    <h2>🌍 IPFS Explorer</h2>
                    <p>IPFS file management with P2P integration</p>
                    <p>Failed to load: ${error.message}</p>
                    <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
                </div>
            `;
        }
    }

    async createDeviceManagerApp(contentElement) {
        try {
            const { DeviceManagerApp } = await import('./apps/device-manager.js');
            const deviceManager = new DeviceManagerApp(this);
            await deviceManager.initialize();
            // DeviceManagerApp has createWindow() not render()
            const windowContent = deviceManager.createWindow();
            if (typeof windowContent === 'string') {
                contentElement.innerHTML = windowContent;
            } else {
                contentElement.innerHTML = 'Device Manager loading...';
            }
            if (typeof deviceManager.setupEventListeners === 'function') {
                deviceManager.setupEventListeners(contentElement);
            } else if (typeof deviceManager.mount === 'function') {
                await deviceManager.mount(contentElement);
            } else {
                this.setupEventListeners();
            }
            return deviceManager;
        } catch (error) {
            console.error('Failed to load Device Manager app:', error);
            contentElement.innerHTML = `
                <div class="app-placeholder">
                    <h2>🔧 Device Manager</h2>
                    <p>Hardware monitoring and device discovery</p>
                    <p>Failed to load: ${error.message}</p>
                    <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
                </div>
            `;
        }
    }

    async createSettingsApp(contentElement) {
        const { SettingsApp } = await import('./apps/settings.js');
        const settings = new SettingsApp(this);
        await settings.initialize();
        const html = await settings.render();
        contentElement.innerHTML = html;
        this.setupEventListeners();
        return settings;
    }

    async createMCPControlApp(contentElement) {
        const { MCPControlApp } = await import('./apps/mcp-control.js');
        const mcpControl = new MCPControlApp();
        const html = await mcpControl.render();
        contentElement.innerHTML = html;
        this.setupEventListeners();
        // Store global reference for other apps to use
        window.mcpControlApp = mcpControl;
        return mcpControl;
    }

    async createAPIKeysApp(contentElement) {
        try {
            // APIKeysApp is not an ES6 export, it's created globally
            await import('./apps/api-keys.js');
            // Wait for the script to execute and create window.APIKeysApp
            await new Promise(resolve => setTimeout(resolve, 10));
            
            if (window.APIKeysApp) {
                const apiKeys = new window.APIKeysApp();
                if (apiKeys.initialize) {
                    await apiKeys.initialize();
                }
                const html = await apiKeys.render();
                contentElement.innerHTML = html;
        this.setupEventListeners();
                return apiKeys;
            } else {
                throw new Error('APIKeysApp not found on window object');
            }
        } catch (error) {
            console.error('Failed to load API Keys app:', error);
            contentElement.innerHTML = `
                <div class="app-placeholder">
                    <h2>🔑 API Keys</h2>
                    <p>Secure API key management with encryption</p>
                    <p>Failed to load: ${error.message}</p>
                    <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
                </div>
            `;
        }
    }

    async createGitHubApp(contentElement) {
        const { GitHubApp } = await import('./apps/github.js');
        const github = new GitHubApp();
        const html = await github.render();
        contentElement.innerHTML = html;
        this.setupEventListeners();
        // Store global reference for OAuth integration
        window.githubApp = github;
        return github;
    }

    async createOAuthLoginApp(contentElement) {
        const { OAuthLoginSystem } = await import('./apps/oauth-login.js');
        const oauth = new OAuthLoginSystem();
        const html = await oauth.render();
        contentElement.innerHTML = html;
        this.setupEventListeners();
        // Store global reference for other apps to use
        window.oauthSystem = oauth;
        return oauth;
    }

    async createCronApp(contentElement) {
        const { CronApp } = await import('./apps/cron.js');
        const cron = new CronApp(this);
        await cron.initialize();
        const html = await cron.render();
        contentElement.innerHTML = html;
        this.setupEventListeners();
        return cron;
    }

    async createNaviApp(contentElement) {
        try {
            const { NAVIApp } = await import('./apps/navi.js');
            const navi = new NAVIApp(this);
            await navi.initialize();
            // NAVIApp has createWindow() not render()
            const windowContent = navi.createWindow();
            if (typeof windowContent === 'string') {
                contentElement.innerHTML = windowContent;
            } else {
                contentElement.innerHTML = 'NAVI loading...';
            }
            if (typeof navi.setupEventListeners === 'function') {
                navi.setupEventListeners(contentElement);
            } else if (typeof navi.mount === 'function') {
                await navi.mount(contentElement);
            } else {
                this.setupEventListeners();
            }
            return navi;
        } catch (error) {
            console.error('Failed to load NAVI app:', error);
            contentElement.innerHTML = `
                <div class="app-placeholder">
                    <h2>🤖 NAVI</h2>
                    <p>Advanced AI Assistant with voice interaction</p>
                    <p>Failed to load: ${error.message}</p>
                    <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
                </div>
            `;
        }
    }

    async createCalculatorApp(contentElement) {
        const { CalculatorApp } = await import('./apps/calculator.js');
        const calculator = new CalculatorApp(this);
        await calculator.initialize();
        const html = await calculator.render();
        contentElement.innerHTML = html;
        this.setupEventListeners();
        return calculator;
    }

    async createClockApp(contentElement) {
        const { ClockApp } = await import('./apps/clock.js');
        const clock = new ClockApp(this);
        await clock.initialize();
        const html = await clock.render();
        contentElement.innerHTML = html;
        this.setupEventListeners();
        return clock;
    }

    async createCalendarApp(contentElement) {
        try {
            const { CalendarApp } = await import('./apps/calendar.js');
            const calendar = new CalendarApp(this);
            await calendar.initialize();
            const html = await calendar.render();
            contentElement.innerHTML = html;
        this.setupEventListeners();
            return calendar;
        } catch (error) {
            console.error('Failed to load Calendar app:', error);
            contentElement.innerHTML = `
                <div class="app-placeholder">
                    <h2>📅 Calendar & Events</h2>
                    <p>Event management with reminders and scheduling</p>
                    <p>Failed to load: ${error.message}</p>
                    <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
                </div>
            `;
        }
    }

    async createTodoApp(contentElement) {
        try {
            const { TodoApp } = await import('./apps/todo.js');
            const todo = new TodoApp(this);
            await todo.initialize();
            const html = await todo.createWindowConfig();
            contentElement.innerHTML = html;
        this.setupEventListeners();
            todo.setupEventListeners(contentElement);
            return todo;
        } catch (error) {
            console.error('Failed to load Todo app:', error);
            contentElement.innerHTML = `
                <div class="app-placeholder">
                    <h2>📋 Todo & Goals</h2>
                    <p>Plain text goal management system</p>
                    <p>Failed to load: ${error.message}</p>
                    <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
                </div>
            `;
        }
    }

    async createFriendsListApp(contentElement) {
        try {
            const { FriendsListApp } = await import('./apps/friends-list.js');
            const friendsList = new FriendsListApp(this);
            await friendsList.createInterface(contentElement);
            return friendsList;
        } catch (error) {
            console.error('Failed to load Friends List app:', error);
            contentElement.innerHTML = `
                <div class="app-placeholder">
                    <h2>👥 Friends & Identity</h2>
                    <p>Decentralized identity management with cross-platform linking</p>
                    <p>Failed to load: ${error.message}</p>
                    <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
                </div>
            `;
        }
    }

    async createImageViewerApp(contentElement) {
        const { ImageViewerApp } = await import('./apps/image-viewer.js');
        const imageViewer = new ImageViewerApp(this);
        await imageViewer.initialize();
        const html = await imageViewer.render();
        contentElement.innerHTML = html;
        this.setupEventListeners();
        return imageViewer;
    }

    async createNotesApp(contentElement) {
        const { NotesApp } = await import('./apps/notes.js');
        const notes = new NotesApp(this);
        await notes.initialize();
        const html = await notes.render();
        contentElement.innerHTML = html;
        this.setupEventListeners();
        return notes;
    }

    async createSystemMonitorApp(contentElement) {
        const { SystemMonitorApp } = await import('./apps/system-monitor.js');
        const systemMonitor = new SystemMonitorApp(this);
        await systemMonitor.initialize();
        const html = await systemMonitor.render();
        contentElement.innerHTML = html;
        this.setupEventListeners();
        return systemMonitor;
    }

    async createNeuralPhotoshopApp(contentElement) {
        try {
            console.log('🎨 Creating Neural Photoshop app...');
            const { NeuralPhotoshopApp } = await import('./apps/neural-photoshop.js');
            console.log('✅ Neural Photoshop module imported successfully');
            
            const neuralPhotoshop = new NeuralPhotoshopApp(contentElement, this);
            await neuralPhotoshop.initialize();
            const html = await neuralPhotoshop.render();
            
            // Check if html is a window config object or HTML string
            if (typeof html === 'object' && html.content) {
                contentElement.innerHTML = html.content;
            } else if (typeof html === 'string') {
                contentElement.innerHTML = html;
        this.setupEventListeners();
            } else {
                // Create a professional interface directly
                contentElement.innerHTML = `
                    <div class="neural-photoshop-app" style="display: flex; flex-direction: column; height: 100%; background: #1a1a1a; color: white; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                        <!-- Toolbar -->
                        <div class="toolbar" style="display: flex; align-items: center; padding: 8px 12px; background: #2a2a2a; border-bottom: 1px solid #444; gap: 12px;">
                            <button class="tool-btn active" data-tool="select" style="padding: 6px 12px; background: #4a90e2; border: none; border-radius: 4px; color: white; cursor: pointer;">🔲 Select</button>
                            <button class="tool-btn" data-tool="brush" style="padding: 6px 12px; background: #333; border: none; border-radius: 4px; color: white; cursor: pointer;">🖌️ Brush</button>
                            <button class="tool-btn" data-tool="eraser" style="padding: 6px 12px; background: #333; border: none; border-radius: 4px; color: white; cursor: pointer;">🧽 Eraser</button>
                            <button class="tool-btn" data-tool="text" style="padding: 6px 12px; background: #333; border: none; border-radius: 4px; color: white; cursor: pointer;">📝 Text</button>
                            <div class="separator" style="width: 1px; height: 24px; background: #555; margin: 0 8px;"></div>
                            <button class="ai-btn" data-ai="segment" style="padding: 6px 12px; background: #8a2be2; border: none; border-radius: 4px; color: white; cursor: pointer;">🤖 AI Segment</button>
                            <button class="ai-btn" data-ai="background" style="padding: 6px 12px; background: #8a2be2; border: none; border-radius: 4px; color: white; cursor: pointer;">🖼️ Remove BG</button>
                            <button class="ai-btn" data-ai="enhance" style="padding: 6px 12px; background: #8a2be2; border: none; border-radius: 4px; color: white; cursor: pointer;">✨ Enhance</button>
                        </div>
                        
                        <!-- Main Content -->
                        <div class="main-content" style="display: flex; flex: 1; overflow: hidden;">
                            <!-- Left Panel -->
                            <div class="left-panel" style="width: 200px; background: #2a2a2a; border-right: 1px solid #444; padding: 12px;">
                                <h4 style="margin: 0 0 12px 0; font-size: 12px; text-transform: uppercase; color: #888;">Layers</h4>
                                <div class="layers-list" style="margin-bottom: 20px;">
                                    <div class="layer active" style="padding: 8px; background: #4a90e2; border-radius: 4px; margin-bottom: 4px; font-size: 12px; cursor: pointer;">🖼️ Background</div>
                                    <div class="layer" style="padding: 8px; background: #333; border-radius: 4px; margin-bottom: 4px; font-size: 12px; cursor: pointer;">🎨 Layer 1</div>
                                </div>
                                
                                <h4 style="margin: 0 0 12px 0; font-size: 12px; text-transform: uppercase; color: #888;">Properties</h4>
                                <div class="properties">
                                    <div style="margin-bottom: 12px;">
                                        <label style="display: block; font-size: 11px; color: #ccc; margin-bottom: 4px;">Opacity</label>
                                        <input type="range" min="0" max="100" value="100" style="width: 100%;">
                                    </div>
                                    <div style="margin-bottom: 12px;">
                                        <label style="display: block; font-size: 11px; color: #ccc; margin-bottom: 4px;">Blend Mode</label>
                                        <select style="width: 100%; background: #333; color: white; border: 1px solid #555; padding: 4px;">
                                            <option>Normal</option>
                                            <option>Multiply</option>
                                            <option>Screen</option>
                                            <option>Overlay</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Canvas Area -->
                            <div class="canvas-area" style="flex: 1; display: flex; align-items: center; justify-content: center; background: #1a1a1a; position: relative;">
                                <canvas id="neural-canvas" width="800" height="600" style="background: white; border: 1px solid #444; cursor: crosshair;"></canvas>
                                <div class="canvas-overlay" style="position: absolute; top: 20px; left: 20px; background: rgba(0,0,0,0.7); padding: 8px 12px; border-radius: 4px; font-size: 12px;">
                                    🎨 Neural Photoshop - AI Image Editor<br>
                                    <span style="color: #4a90e2;">Ready</span> | Canvas: 800×600 | Tool: Select
                                </div>
                            </div>
                            
                            <!-- Right Panel -->
                            <div class="right-panel" style="width: 220px; background: #2a2a2a; border-left: 1px solid #444; padding: 12px;">
                                <h4 style="margin: 0 0 12px 0; font-size: 12px; text-transform: uppercase; color: #888;">AI Tools</h4>
                                <div class="ai-tools" style="margin-bottom: 20px;">
                                    <button class="ai-tool" style="width: 100%; padding: 12px; background: #8a2be2; border: none; border-radius: 6px; color: white; cursor: pointer; margin-bottom: 8px; text-align: left;">
                                        🧠 Smart Segmentation
                                        <div style="font-size: 10px; opacity: 0.8;">SAM-based object detection</div>
                                    </button>
                                    <button class="ai-tool" style="width: 100%; padding: 12px; background: #8a2be2; border: none; border-radius: 6px; color: white; cursor: pointer; margin-bottom: 8px; text-align: left;">
                                        🎨 Style Transfer
                                        <div style="font-size: 10px; opacity: 0.8;">Apply artistic styles</div>
                                    </button>
                                    <button class="ai-tool" style="width: 100%; padding: 12px; background: #8a2be2; border: none; border-radius: 6px; color: white; cursor: pointer; margin-bottom: 8px; text-align: left;">
                                        🔧 Background Removal
                                        <div style="font-size: 10px; opacity: 0.8;">U2Net-based removal</div>
                                    </button>
                                    <button class="ai-tool" style="width: 100%; padding: 12px; background: #8a2be2; border: none; border-radius: 6px; color: white; cursor: pointer; margin-bottom: 8px; text-align: left;">
                                        📈 AI Upscaling
                                        <div style="font-size: 10px; opacity: 0.8;">Real-ESRGAN enhancement</div>
                                    </button>
                                </div>
                                
                                <h4 style="margin: 0 0 12px 0; font-size: 12px; text-transform: uppercase; color: #888;">History</h4>
                                <div class="history-list" style="font-size: 11px;">
                                    <div class="history-item active" style="padding: 6px 8px; background: #4a90e2; border-radius: 3px; margin-bottom: 2px; cursor: pointer;">New Document</div>
                                    <div class="history-item" style="padding: 6px 8px; background: #333; border-radius: 3px; margin-bottom: 2px; cursor: pointer;">Initial State</div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Status Bar -->
                        <div class="status-bar" style="display: flex; align-items: center; justify-content: between; padding: 6px 12px; background: #2a2a2a; border-top: 1px solid #444; font-size: 11px; color: #888;">
                            <div class="status-left">Neural Photoshop v2.0 | AI Services: ✅ Ready</div>
                        </div>
                    </div>
                `;
            }
            if (typeof neuralPhotoshop.setupEventListeners === 'function') {
                neuralPhotoshop.setupEventListeners(contentElement);
            } else if (typeof neuralPhotoshop.mount === 'function') {
                await neuralPhotoshop.mount(contentElement);
            } else {
                this.setupEventListeners();
            }

            console.log('✅ Neural Photoshop app initialized successfully');
            return neuralPhotoshop;
        } catch (error) {
            console.error('❌ Failed to create Neural Photoshop app:', error);
            contentElement.innerHTML = `
                <div class="neural-photoshop-error">
                    <h3>🎨 Neural Photoshop - AI Image Editor</h3>
                    <p>Professional AI-powered image editing with advanced neural network capabilities.</p>
                    <div class="status">Status: Initializing AI Services...</div>
                    <div class="features">
                        <h4>AI Features:</h4>
                        <ul>
                            <li>🧠 Smart Segmentation & Masking</li>
                            <li>🎨 Style Transfer & Artistic Filters</li>
                            <li>🔧 Background Removal & Inpainting</li>
                            <li>📈 AI Upscaling & Enhancement</li>
                            <li>🖌️ Professional Brush Tools</li>
                            <li>📱 Layer Management System</li>
                        </ul>
                    </div>
                </div>
            `;
            // Removed throw to allow fallback interface to be shown
        }
    }

    async createCinemaApp(contentElement) {
        const { CinemaApp } = await import('./apps/cinema.js');
        const cinema = new CinemaApp(this);
        await cinema.initialize();
        const html = await cinema.render();
        contentElement.innerHTML = html;
        this.setupEventListeners();
        return cinema;
    }

    async createMediaPlayer(contentElement) {
        try {
            console.log('🎵 Creating Media Player app...');
            const { MediaPlayer } = await import('./apps/media-player.js');
            console.log('✅ Media Player module imported successfully');
            
            const mediaPlayer = new MediaPlayer();
            await mediaPlayer.initialize(contentElement);
            console.log('✅ Media Player app initialized successfully');
            return mediaPlayer;
        } catch (error) {
            console.error('❌ Failed to create Media Player app:', error);
            contentElement.innerHTML = `
                <div class="media-player-error" style="padding: 20px; text-align: center; color: white;">
                    <h3>🎵 Media Player</h3>
                    <p>Professional audio and video player with playlist management and visualizations.</p>
                    <div class="status">Status: Loading...</div>
                    <div class="features">
                        <h4>Features:</h4>
                        <ul style="text-align: left; max-width: 400px; margin: 0 auto;">
                            <li>🎵 High-quality audio playback</li>
                            <li>🎬 Video player support</li>
                            <li>📋 Playlist management</li>
                            <li>🎛️ 10-band equalizer</li>
                            <li>📊 Audio visualizations</li>
                            <li>🔄 Shuffle and repeat modes</li>
                        </ul>
                    </div>
                </div>
            `;
        }
    }

    async createP2PNetworkApp(contentElement) {
        try {
            // Import the P2P Network app
            await import('./apps/p2p-network.js');
            
            // Check if we have the modern class-based app or fall back to function
            if (window.P2PNetworkApp) {
                const p2pApp = new window.P2PNetworkApp();
                await p2pApp.initialize();
                const html = await p2pApp.render();
                contentElement.innerHTML = html;
        this.setupEventListeners();
                return p2pApp;
            } else if (window.createP2PNetworkApp) {
                // Fall back to function-based creation
                const p2pApp = window.createP2PNetworkApp();
                if (p2pApp.initialize) {
                    await p2pApp.initialize();
                }
                if (p2pApp.render) {
                    const html = await p2pApp.render();
                    contentElement.innerHTML = html;
        this.setupEventListeners();
                } else if (p2pApp.init) {
                    await p2pApp.init(contentElement);
                }
                return p2pApp;
            } else {
                throw new Error('P2P Network app not found');
            }
        } catch (error) {
            console.error('Error creating P2P Network app:', error);
            contentElement.innerHTML = `
                <div class="error-message">
                    <h3>🔗 P2P Network Manager</h3>
                    <p>Failed to load P2P Network app</p>
                    <p>Error: ${error.message}</p>
                </div>
            `;
        }
    }

    async createNeuralNetworkDesignerApp(contentElement) {
        const { NeuralNetworkDesignerApp } = await import('./apps/neural-network-designer.js');
        const neuralNetworkDesigner = new NeuralNetworkDesignerApp(this);
        await neuralNetworkDesigner.initialize();
        const html = await neuralNetworkDesigner.createWindow();
        contentElement.innerHTML = html;
        this.setupEventListeners();
        return neuralNetworkDesigner;
    }
    
    async createP2PChatUnifiedApp(contentElement) {
        const { UnifiedP2PChatApp } = await import('./apps/p2p-chat-unified.js');
        const p2pChat = new UnifiedP2PChatApp(this);
        await p2pChat.initialize();
        await p2pChat.mount(contentElement);
        window.unifiedP2PChatInstance = p2pChat;
        return p2pChat;
    }
    
    async createTrainingManagerApp(contentElement) {
        const TrainingModule = await import('./apps/training-manager.js');
        // Wait for IIFE to execute
        await new Promise(resolve => setTimeout(resolve, 10));
        if (window.createTrainingManagerApp) {
            const app = window.createTrainingManagerApp();
            app.init(contentElement);
            return app;
        } else if (TrainingModule.TrainingManagerApp) {
            const training = new TrainingModule.TrainingManagerApp();
            await training.initialize();
            const html = await training.render();
            contentElement.innerHTML = html;
        this.setupEventListeners();
            return training;
        }
    }
    
    async createPeerTubeApp(contentElement) {
        const { PeerTubeApp } = await import('./apps/peertube.js');
        const peertube = new PeerTubeApp(this);
        await peertube.initialize();
        // PeerTubeApp exposes a createInterface(container) API (no render() return)
        await peertube.createInterface(contentElement);
        return peertube;
    }
    
    async createNeuralPhotoshopApp(contentElement) {
        const { NeuralPhotoshopApp } = await import('./apps/neural-photoshop.js');
        const neuralPhotoshop = new NeuralPhotoshopApp(contentElement, this);
        await neuralPhotoshop.initialize();
        // The initialize method sets innerHTML, but we need to make sure it happens
        // Neural Photoshop is fully initialized and rendered within its initialize() method
        return neuralPhotoshop;
    }
    
    async createCinemaApp(contentElement) {
        const { CinemaApp } = await import('./apps/cinema.js');
        const cinema = new CinemaApp();
        await cinema.createInterface(contentElement);
        return cinema;
    }
    
    async createMediaPlayerApp(contentElement) {
        const MediaPlayerModule = await import('./apps/media-player.js');
        if (MediaPlayerModule.MediaPlayer) {
            // MediaPlayer has initialize(container) and returns HTML via createInterface() internally
            const mediaPlayer = new MediaPlayerModule.MediaPlayer();
            await mediaPlayer.initialize(contentElement);
            return mediaPlayer;
        }
    }
    
    async createGrandmaStrudelDAWApp(contentElement) {
        const StrudelModule = await import('./apps/strudel-grandma.js');
        // The module exports GrandmaStrudelDAW, not StrudelGrandmaApp
        const StrudelClass = StrudelModule.GrandmaStrudelDAW || StrudelModule.default;
        if (StrudelClass) {
            const strudel = new StrudelClass();
            // GrandmaStrudelDAW uses start(container) method instead of initialize/render
            await strudel.start(contentElement);
            return strudel;
        } else {
            console.error('GrandmaStrudelDAW not found in module');
            contentElement.innerHTML = '<div style="padding: 20px;">Error: Could not load Strudel app</div>';
            this.setupEventListeners();
        }
    }
    
    async createMusicStudioUnifiedApp(contentElement) {
        const MusicStudioModule = await import('./apps/music-studio-unified.js');
        if (MusicStudioModule.UnifiedMusicStudioApp) {
            const musicStudio = new MusicStudioModule.UnifiedMusicStudioApp(this);
            await musicStudio.initialize();
            const html = await musicStudio.render();
            contentElement.innerHTML = html;
        this.setupEventListeners();
            return musicStudio;
        }
    }
    
    async createMusicStudioApp(contentElement) {
        await import('./apps/music-studio.js');
        // Music Studio exports window.renderMusicStudioApp
        if (window.renderMusicStudioApp) {
            window.renderMusicStudioApp(contentElement);
        } else {
            contentElement.innerHTML = '<div style="padding: 20px;">Music Studio Classic loading...</div>';
            this.setupEventListeners();
        }
    }
    
    async createP2PChatApp(contentElement) {
        const { P2PChatApp } = await import('./apps/p2p-chat.js');
        const p2pChat = new P2PChatApp(this);
        await p2pChat.initialize();
        const html = await p2pChat.render();
        contentElement.innerHTML = html;
        this.setupEventListeners();
        return p2pChat;
    }

    async createGeneratedServiceSurface(contentElement, appId) {
        if (appId === 'datasets-browser') {
            await this.createDatasetsBrowserSurface(contentElement);
            return;
        }
        if (appId === 'accelerate-panel') {
            await this.createAcceleratePanelSurface(contentElement);
            return;
        }
        if (appId === 'idl-explorer') {
            await this.createIDLExplorerSurface(contentElement);
            return;
        }
        if (appId === 'orb-auto-ui') {
            await this.createORBAutoUISurface(contentElement);
            return;
        }

        const profiles = {
            'datasets-browser': {
                title: 'IPFS Datasets Browser',
                service: 'ipfs_datasets_py',
                summary: 'Dataset, vector, provenance, and search tools exposed through MCP/MCP++ descriptors.',
                primary: 'Dataset catalog',
            },
            'accelerate-panel': {
                title: 'IPFS Accelerate Panel',
                service: 'ipfs_accelerate_py',
                summary: 'Hardware, inference, queue, and telemetry tools exposed through the configured compatibility bridge.',
                primary: 'Accelerate jobs',
            },
            'idl-explorer': {
                title: 'ORB IDL Explorer',
                service: 'orb_idl',
                summary: 'IDL descriptors, interface CIDs, method bindings, and receipt policies for every app-bound tool.',
                primary: 'IDL descriptors',
            },
            'glasses-preview': {
                title: 'Meta Glasses Preview',
                service: 'meta_glasses',
                summary: 'Projection behavior, replay states, and handoff fallbacks for the glasses layer.',
                primary: 'Glasses projections',
            },
            'orb-auto-ui': {
                title: 'ORB Auto UI',
                service: 'orb_auto_ui',
                summary: 'Generated UI envelopes for tools that do not already have a dedicated desktop workflow.',
                primary: 'Generated controls',
            },
            'mcp-plus-plus': {
                title: 'MCP++ Explorer',
                service: 'mcp_plus_plus',
                summary: 'Unified view across ipfs_kit_py, ipfs_datasets_py, and ipfs_accelerate_py tools.',
                primary: 'MCP++ tools',
            },
            'agent-supervisor': {
                title: 'Agent Supervisor',
                service: 'ipfs_accelerate_py',
                summary: 'Goals, subgoals, queues, taskboard links, run history, bounded steering, and receipts exposed through typed MCP/MCP++ capabilities.',
                primary: 'Supervisor queue',
            },
        };
        const profile = profiles[appId] || {
            title: 'Generated Service Surface',
            service: appId,
            summary: 'Generated descriptor-backed SwissKnife service surface.',
            primary: 'Generated tools',
        };

        contentElement.innerHTML = `
            <div class="generated-service-surface generated-mcp-app" data-app-id="${appId}" data-service="${profile.service}" style="height:100%; padding:20px; overflow:auto; background:#101820; color:#f7fafc;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:18px;">
                    <div>
                        <h2 style="margin:0 0 6px; font-size:22px;">${profile.title}</h2>
                        <p style="margin:0; color:#b6c2cf;">${profile.summary}</p>
                    </div>
                    <span style="padding:6px 10px; border:1px solid #3ddc97; border-radius:6px; color:#3ddc97;">service-ready</span>
                </div>
                <div style="display:grid; grid-template-columns:repeat(2, minmax(180px, 1fr)); gap:12px;">
                    ${[
                        [profile.primary, 'ready', 'Live descriptor discovery is available.'],
                        ['ORB/IDL handoff', 'ready', 'Interface descriptors and method bindings are generated.'],
                        ['Policy envelope', 'ready', 'Confirmation and receipt policies are attached.'],
                        ['Glasses fallback', 'ready', 'Display, mobile-card, and audio-summary fallbacks are declared.'],
                    ].map(([label, state, detail]) => `
                        <div style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                            <div style="font-weight:700; margin-bottom:6px;">${label}</div>
                            <div style="color:#3ddc97; font-size:12px; text-transform:uppercase; margin-bottom:8px;">${state}</div>
                            <div style="color:#c6d1dc;">${detail}</div>
                        </div>
                    `).join('')}
                </div>
                <div style="margin-top:16px; display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn btn-small" data-action="refresh-descriptors">Refresh</button>
                    <button class="btn btn-small" data-action="open-idl">IDL</button>
                    <button class="btn btn-small" data-action="glasses-handoff">Glasses</button>
                </div>
            </div>
        `;
        this.setupEventListeners();
    }

    async createDatasetsBrowserSurface(contentElement) {
        const operations = {
            semantic_search: 'search_dataset', record_provenance: 'record_dataset_provenance',
            index: 'preview_dataset_preparation', sync_status: 'read_dataset_progress',
        };
        const nativeAttributes = tool => `data-native-gateway-binding="datasets-browser.ipfs_datasets_py.${operations[tool]}" data-native-tool-id="${tool}"`;
        const primarySurface = contentElement.closest('.window-app-content');
        const nativeWindowContent = contentElement.closest('.window-content');
        if (nativeWindowContent) Object.assign(nativeWindowContent.style, { minHeight: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' });
        if (primarySurface) Object.assign(primarySurface.style, { height: '100%', minHeight: '0', minWidth: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' });
        Object.assign(contentElement.style, { flex: '1 1 0%', minHeight: '0', minWidth: '0', overflow: 'auto' });
        const gatewayHost = primarySurface?.querySelector('.live-tool-gateway-host');
        if (gatewayHost) Object.assign(gatewayHost.style, { maxHeight: '6.5rem', minHeight: '2.75rem', flexShrink: '0', overflow: 'auto', position: 'static', zIndex: '0' });
        const datasetFrame = contentElement.closest('.window');
        if (datasetFrame) {
            const viewportWidth = document.documentElement.clientWidth || window.innerWidth || 0;
            const viewportHeight = document.documentElement.clientHeight || window.innerHeight || 0;
            const maxHeight = Math.max(180, viewportHeight - 48);
            const maxWidth = Math.max(280, viewportWidth);
            const frameWidth = Math.min(parseInt(datasetFrame.style.width, 10) || datasetFrame.offsetWidth || maxWidth, maxWidth);
            const frameLeft = Math.max(0, parseInt(datasetFrame.style.left, 10) || 0);
            datasetFrame.style.top = '0px';
            datasetFrame.style.left = Math.min(frameLeft, Math.max(0, viewportWidth - frameWidth)) + 'px';
            datasetFrame.style.width = frameWidth + 'px';
            datasetFrame.style.maxWidth = maxWidth + 'px';
            datasetFrame.style.maxHeight = maxHeight + 'px';
            datasetFrame.style.height = maxHeight + 'px';
        }
        if (!document.getElementById('datasets-browser-fit-style')) {
            const fitStyle = document.createElement('style');
            fitStyle.id = 'datasets-browser-fit-style';
            fitStyle.textContent = `
                .window[data-app-id="datasets-browser"] .window-content { padding-bottom: 0; }
                .datasets-browser-workflow.sk-app { height: auto; max-height: 100%; min-width: 0; overflow: auto; box-sizing: border-box; }
                .datasets-browser-workflow .sk-card { min-width: 0; max-width: 100%; overflow: visible; align-self: start; }
                .datasets-browser-workflow :is(button,select,input,textarea):is(:focus, :focus-visible) { outline: 2px solid #93c5fd; outline-offset: 2px; }
                .datasets-browser-workflow :is(p, span, label, h2, h3, td) { max-width: 100%; min-width: 0; overflow-wrap: anywhere; word-break: break-word; white-space: normal; }
                .datasets-browser-workflow :is(input, select, button) { max-width: 100%; min-width: 0; box-sizing: border-box; }
                .datasets-browser-workflow .datasets-primary { display:flex; flex-direction:column; gap:6px; min-width:0; }
                .datasets-browser-workflow [data-svd-vda-marker="error-ui"] { margin:0; padding:0; background:transparent; border:0; box-shadow:none; }
                .datasets-browser-workflow [data-svd-vda-marker="error-ui"] h3 { display:none; }
                .datasets-browser-workflow #datasets-match-summary, .datasets-browser-workflow #datasets-record-id-full { display:block; margin:0 0 6px; font-size:13px; line-height:1.35; overflow-wrap:anywhere; word-break:break-all; } .datasets-browser-workflow .datasets-rows-wrap { max-height: 4.5rem; max-width: 100%; overflow: auto; }
                .datasets-browser-workflow table { width: 100%; border-collapse: collapse; table-layout: fixed; }
                .datasets-browser-workflow td { border-top: 1px solid #26384a; padding: 4px 0; overflow-wrap: anywhere; word-break: break-word; white-space: normal; }
                .datasets-browser-workflow tr[aria-selected="true"] td { outline: 2px solid #93c5fd; outline-offset: -2px; }
                .datasets-browser-workflow .datasets-actions { position: static; z-index: auto; background: transparent; }
                .datasets-browser-workflow .datasets-diagnostics { margin-top: 8px; }
                .datasets-browser-workflow .datasets-diagnostics pre { max-height: 4.5rem; overflow: auto; white-space: pre-wrap; }
            `;
            document.head.appendChild(fitStyle);
        }

        contentElement.innerHTML = `
            <div class="generated-service-surface generated-mcp-app datasets-browser-workflow sk-app"
                data-app-id="datasets-browser"
                data-service="ipfs_datasets_py"
                data-svd-workflow="datasets-browser.semantic-provenance-preparation"
                style="min-height:0; padding:12px; background:var(--sk-bg-panel, #101820); color:var(--sk-text, #f7fafc);">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px; flex-wrap:wrap;">
                    <div style="min-width:0; flex:1;">
                        <h2 style="margin:0 0 6px; font-size:22px;">IPFS Datasets Browser</h2>
                        <p class="sk-honest-note">Search the selected dataset, then filter by schema and split. Matching rows stay in this window.</p>
                    </div>
                    <span class="sk-badge" style="text-transform:uppercase;">VDA-G048</span>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap:12px; align-items:start;">
                    <section class="sk-card" data-svd-vda-marker="dataset-cid">
                        <h3 class="sk-section-head">Dataset</h3>
                        <div style="display:grid; gap:6px; color:var(--sk-text-dim, #c6d1dc); font-size:13px;">
                            <label>Dataset ID or CID <input id="datasets-record-id" data-datasets-id class="sk-input" aria-label="Dataset ID or CID" placeholder="Dataset identifier"><span id="datasets-record-id-full"></span></label>
                            <p id="datasets-match-summary">No rows loaded yet.</p>
                            <div class="datasets-rows-wrap"><table><tbody id="datasets-rows"></tbody></table></div>
                            <span id="datasets-catalog-status">The identifier stays in this field until you change it.</span>
                        </div>
                    </section>

                    <section class="sk-card" data-svd-vda-marker="semantic-operation">
                        <h3 class="sk-section-head">Semantic Operation</h3>
                        <label>Query <input id="datasets-query" data-datasets-query class="sk-input" aria-label="Semantic dataset query" value="desktop note provenance"></label>
                        <div id="datasets-semantic-status" role="status" aria-live="polite" style="color:var(--sk-text-dim, #c6d1dc); font-size:13px; line-height:1.45;">
                            No search has run.
                        </div>
                    </section>

                    <section class="sk-card" data-svd-vda-marker="provenance-operation">
                        <h3 class="sk-section-head">Provenance Operation</h3>
                        <div id="datasets-provenance-status" style="color:var(--sk-text-dim, #c6d1dc); font-size:13px; line-height:1.45;">
                            No provenance request has run. Review the actual dataset context, then confirm a dry-run validation; no provenance record is persisted.
                        </div>
                    </section>

                    <section class="sk-card" data-svd-vda-marker="preparation-job">
                        <h3 class="sk-section-head">Preparation Preview</h3>
                        <label>Preparation records (JSON) <textarea data-datasets-source class="sk-input" aria-label="Preparation dataset records" placeholder='{"data":[{"text":"your actual record"}]}'></textarea></label>
                        <div id="datasets-preparation-status" style="color:var(--sk-text-dim, #c6d1dc); font-size:13px; line-height:1.45;">
                            No preparation request has run. Prepare validates the genuine process_dataset callable signature for the actual records; it does not execute processing or create an index or job.
                        </div>
                    </section>

                    <section class="sk-card" data-svd-vda-marker="schema-filter-ui">
                        <h3 class="sk-section-head">Schema and Filters</h3>
                        <div style="display:grid; gap:8px; color:var(--sk-text-dim, #c6d1dc); font-size:13px;">
                            <label class="sk-label" style="display:grid; gap:4px;">Schema
                                <select id="datasets-schema" data-datasets-filter="schema" aria-label="Dataset schema selector" class="sk-select">
                                    <option value="support-intent-v2">support-intent-v2</option>
                                    <option value="chat-transcript-v1">chat-transcript-v1</option>
                                </select>
                            </label>
                            <label class="sk-label" style="display:grid; gap:4px;">Split
                                <select id="datasets-split" data-datasets-filter="split" aria-label="Dataset split filter" class="sk-select">
                                    <option value="train">train</option>
                                    <option value="validation">validation</option>
                                </select>
                            </label>
                            <span>Selections stay in this form and are sent the next time Search runs.</span>
                        </div>
                    </section>

                    <section class="sk-card" data-svd-vda-marker="error-ui">
                        <h3 class="sk-section-head">Schema Error Recovery</h3>
                        <div id="datasets-error-status" style="color:var(--sk-text-dim, #c6d1dc); font-size:13px; line-height:1.45;">
                            No query failure.
                        </div>
                    </section>

                    <section class="sk-card" data-svd-vda-marker="progress-ui">
                        <h3 class="sk-section-head">Backend Status</h3>
                        <div style="display:grid; gap:8px; color:var(--sk-text-dim, #c6d1dc); font-size:13px;">
                            <progress id="datasets-progress-bar" max="100" value="0" aria-label="Preparation progress unavailable" style="width:100%;"></progress>
                            <span id="datasets-progress-status" role="status" aria-live="polite">No sync_status read yet. This operation reports actual IPFS availability; it does not provide preparation job progress.</span>
                        </div>
                    </section>
                </div>

                <div class="datasets-actions" style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
                    <button id="datasets-search" ${nativeAttributes('semantic_search')} class="sk-btn" data-svd-workflow-action="run-semantic-search" data-action="semantic-search" aria-label="Run primary semantic dataset search">Search</button>
                    <button ${nativeAttributes('record_provenance')} class="sk-btn" data-svd-workflow-action="record-provenance" data-action="record-provenance" aria-label="Record dataset provenance">Provenance</button>
                    <button ${nativeAttributes('index')} class="sk-btn" data-svd-workflow-action="start-preparation-job" data-action="prepare-dataset" aria-label="Preview dataset preparation request">Prepare</button>
                    <button class="sk-btn" data-svd-workflow-action="apply-schema-filter" data-action="apply-schema-filter" aria-label="Apply schema and split filters">Apply Filters</button>
                    <button class="sk-btn" data-svd-workflow-action="show-schema-error" data-action="show-schema-error" aria-label="Show schema error recovery">Recover Error</button>
                    <button ${nativeAttributes('sync_status')} class="sk-btn" data-svd-workflow-action="refresh-progress" data-action="refresh-progress" aria-label="Read actual IPFS backend status">Progress</button>
                </div>

                <div id="datasets-envelope-result" style="margin-top:14px;"></div>
                <ol id="datasets-workflow-log" data-svd-vda-marker="receipts" style="margin:14px 0 0; padding-left:22px; color:var(--sk-text-dim, #c6d1dc); font-size:13px;">
                    <li class="sk-empty">No gateway operations have run yet in this session; real envelope outcomes will appear here.</li>
                </ol>
            </div>
        `;
        this.setupEventListeners();

        const datasetRowLabel = record => {
            if (typeof record === 'string') return record.slice(0, 160);
            const meta = record?.document?.metadata || record?.metadata || {};
            const note = meta.note_id || record?.note_id || '';
            const text = meta.text || record?.text || record?.document?.text || '';
            const parts = [];
            if (note) parts.push(`note_id=${note}`);
            if (text) parts.push(String(text).slice(0, 120));
            return parts.length ? parts.join(' · ') : JSON.stringify(record).slice(0, 160);
        };
        const fitPrimaryDatasetBrowser = () => {
            const workflow = contentElement.querySelector('.datasets-browser-workflow');
            if (!workflow) return;
            const primary = contentElement.querySelector('[data-svd-vda-marker="dataset-cid"]');
            const queryLabel = contentElement.querySelector('#datasets-query')?.closest('label');
            const summaryNode = contentElement.querySelector('#datasets-match-summary');
            const rowsWrap = contentElement.querySelector('.datasets-rows-wrap');
            const schema = contentElement.querySelector('[data-svd-vda-marker="schema-filter-ui"]');
            const actions = contentElement.querySelector('#datasets-search')?.parentElement;
            const errorCard = contentElement.querySelector('[data-svd-vda-marker="error-ui"]');
            const semanticStatusNode = contentElement.querySelector('#datasets-semantic-status');
            const header = workflow.querySelector(':scope > div');
            let diagnostics = contentElement.querySelector('.datasets-diagnostics');
            if (!diagnostics) {
                diagnostics = document.createElement('details');
                diagnostics.className = 'datasets-diagnostics';
                const summary = document.createElement('summary');
                summary.textContent = 'Diagnostics';
                diagnostics.append(summary);
                workflow.append(diagnostics);
            }
            if (header && header.querySelector('h2') && !diagnostics.contains(header)) diagnostics.append(header);
            for (const marker of ['semantic-operation', 'provenance-operation', 'preparation-job', 'progress-ui']) {
                const node = contentElement.querySelector(`[data-svd-vda-marker="${marker}"]`);
                if (node && !diagnostics.contains(node)) diagnostics.append(node);
            }
            for (const id of ['datasets-envelope-result', 'datasets-workflow-log']) {
                const node = contentElement.querySelector(`#${id}`);
                if (node && !diagnostics.contains(node)) diagnostics.append(node);
            }
            const stack = workflow.querySelector('.datasets-primary') || document.createElement('div');
            stack.className = 'datasets-primary';
            if (schema) stack.append(schema);
            if (actions) stack.append(actions);
            if (queryLabel) stack.append(queryLabel);
            if (primary) stack.append(primary);
            if (summaryNode) stack.append(summaryNode);
            if (rowsWrap) stack.append(rowsWrap);
            if (semanticStatusNode) stack.append(semanticStatusNode);
            if (errorCard) {
                errorCard.style.margin = '0';
                errorCard.style.padding = '0';
                errorCard.style.background = 'transparent';
                errorCard.style.border = '0';
                const heading = errorCard.querySelector('h3');
                if (heading) heading.hidden = true;
                stack.append(errorCard);
            }
            workflow.prepend(stack);
            for (const grid of Array.from(workflow.children)) {
                if (grid !== stack && grid !== diagnostics && grid.childElementCount === 0) grid.remove();
            }
            diagnostics.open = false;
            contentElement.scrollTop = 0;
            workflow.scrollTop = 0;
        };
        fitPrimaryDatasetBrowser();

        const semanticStatus = contentElement.querySelector('#datasets-semantic-status');
        const provenanceStatus = contentElement.querySelector('#datasets-provenance-status');
        const preparationStatus = contentElement.querySelector('#datasets-preparation-status');
        const errorStatus = contentElement.querySelector('#datasets-error-status');
        const progressStatus = contentElement.querySelector('#datasets-progress-status');
        const result = contentElement.querySelector('#datasets-envelope-result');
        const log = contentElement.querySelector('#datasets-workflow-log');
        const stagedFilters = () => ({
            schema: contentElement.querySelector('[data-datasets-filter="schema"]')?.value || 'support-intent-v2',
            split: contentElement.querySelector('[data-datasets-filter="split"]')?.value || 'train',
        });

        const appendLog = (message) => {
            if (!log) return;
            const item = document.createElement('li');
            item.textContent = message;
            log.appendChild(item);
        };

        let catalogPromise;
        const controls = () => catalogPromise ||= fetch('/mcp/tools/bindings?app_id=datasets-browser', { cache: 'no-store' }).then(async response => {
            if (!response.ok) throw new Error('The declared dataset owner binding catalog is unavailable.');
            const catalog = (await response.json()).controls || [];
            const identity = catalog.flatMap(control => Object.values(control.safe_payloads || {})).find(payload => payload?.cid)?.cid;
            if (identity && !contentElement.querySelector('[data-datasets-id]').value.trim()) contentElement.querySelector('[data-datasets-id]').value = identity;
            return catalog;
        }).catch(error => { catalogPromise = null; throw error; });
        const ownerResult = envelope => {
            if (envelope.ok !== true || envelope.outcome !== 'executed') throw new Error(envelope.error?.message || envelope.error || 'Owner did not execute the request.');
            let value = envelope.result;
            for (let depth = 0; depth < 8 && value && typeof value === 'object'; depth++) {
                if (value.ok === false || value.success === false || value.isError === true || value.error || value.status === 'error') throw new Error(value.error?.message || value.error || value.message || 'Owner rejected the operation.');
                const blocks = value.content?.filter(item => item.type === 'json' && item.json && typeof item.json === 'object') || [];
                if (blocks.length > 1) throw new Error('Owner returned ambiguous operation data.');
                if (blocks.length === 1) value = blocks[0].json;
                else if (value.result && typeof value.result === 'object') value = value.result;
                else return value;
            }
            if (value == null) throw new Error('Owner returned no operation data.');
            return value;
        };
        const runOperation = async (operation, buildInput, { trigger, statusEl } = {}) => {
            try {
                const bindingId = `datasets-browser.ipfs_datasets_py.${operations[operation]}`;
                const control = (await controls()).find(control => control.binding_id === bindingId);
                if (!control) throw new Error(`The exact ${operation} binding is undeclared.`);
                const defaults = control.safe_payloads?.[operation] || control.safe_payload || {};
                const payload = buildInput(defaults);
                const envelope = await invokeNativeTool(contentElement, 'datasets-browser', bindingId, { toolId: operation, payload, trigger });
                if (!envelope) {
                    if (statusEl) { statusEl.hidden = false; statusEl.textContent = 'Cancelled before owner dispatch.'; }
                    return null;
                }
                const value = ownerResult(envelope);
                const preview = value?.dry_run === true && value?.mutation_performed === false;
                if (['index', 'record_provenance'].includes(operation) && (!preview || value.body_executed !== false || value.validation !== 'real-callable-signature')) throw new Error('Owner did not return the required no-mutation validated preview.');
                if (operation === 'semantic_search' && (value.fallback === true || !Array.isArray(value.results))) throw new Error('Owner did not return actual semantic search results.');
                if (operation === 'semantic_search') {
                    const records = Array.isArray(value.results) ? value.results : [];
                    const schema = contentElement.querySelector('#datasets-schema')?.value || '';
                    const split = contentElement.querySelector('#datasets-split')?.value || '';
                    const identity = contentElement.querySelector('#datasets-record-id')?.value.trim() || '';
                    const first = records[0];
                    const firstMeta = first && typeof first === 'object' ? (first.document?.metadata || first.metadata || {}) : {};
                    const noteId = first && typeof first === 'object' ? (firstMeta.note_id || first.note_id || '') : '';
                    const hadQueryFailure = (contentElement.querySelector('#datasets-error-status')?.textContent || '').includes('Query failed');
                    const summaryText = records.length
                        ? `rows=${records.length}${noteId ? `; note_id=${noteId}` : ''}; split=${split}; schema=${schema}; ${hadQueryFailure ? 'recovered=1; ' : ''}id=${identity}`
                        : 'No records matched this query.';
                    const summaryNode = contentElement.querySelector('#datasets-match-summary');
                    if (summaryNode) summaryNode.textContent = summaryText;
                    const fullId = contentElement.querySelector('#datasets-record-id-full');
                    const idField = contentElement.querySelector('#datasets-record-id');
                    if (idField) idField.title = identity;
                    if (fullId) fullId.textContent = identity;
                    const errorNode = contentElement.querySelector('#datasets-error-status');
                    if (errorNode) errorNode.textContent = records.length ? 'No query failure.' : 'No records matched this query. The dataset selection was kept.';
                    const body = contentElement.querySelector('#datasets-rows');
                    if (body) {
                        body.replaceChildren();
                        const selected = records[0];
                        if (selected) {
                            const tr = document.createElement('tr');
                            tr.className = 'datasets-row';
                            tr.dataset.selected = 'true';
                            tr.setAttribute('aria-selected', 'true');
                            const td = document.createElement('td');
                            td.textContent = datasetRowLabel(selected);
                            tr.appendChild(td);
                            body.appendChild(tr);
                        }
                    }
                    if (records.length) {
                        try {
                            sessionStorage.setItem('datasets-browser-open-record', JSON.stringify({
                                id: identity,
                                query: contentElement.querySelector('#datasets-query')?.value ?? '',
                                schema, split, rows: records, summary: summaryText,
                            }));
                        } catch { /* storage unavailable */ }
                    }
                    if (statusEl) { statusEl.hidden = false; statusEl.textContent = summaryText; }
                }
                const summary = `${operation} ${preview ? 'preview validated; body not executed, no record, index or job created' : envelope.outcome} via ${envelope.transport || 'declared transport'}; receipt ${envelope.receipt?.receipt_id || 'unavailable'}`;
                if (result) { const pre = document.createElement('pre'); pre.textContent = JSON.stringify(envelope, null, 2); result.replaceChildren(pre); }
                if (statusEl && operation !== 'semantic_search') statusEl.textContent = summary;
                appendLog(summary);
                return { envelope, value, preview };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (statusEl) { statusEl.hidden = false; statusEl.textContent = `${operation} could not be invoked: ${message}`; }
                if (operation === 'semantic_search') {
                    const errorNode = contentElement.querySelector('#datasets-error-status');
                    if (errorNode) errorNode.textContent = `Query failed: ${message}. The dataset selection was kept.`;
                    const summaryNode = contentElement.querySelector('#datasets-match-summary');
                    if (summaryNode) summaryNode.textContent = 'No search result. The dataset selection was kept.';
                    contentElement.querySelector('#datasets-rows')?.replaceChildren();
                }
                if (result) result.replaceChildren();
                appendLog(`${operation} invocation error: ${message}`);
                return null;
            }
        };
        const datasetIdentity = defaults => {
            const value = contentElement.querySelector('[data-datasets-id]').value.trim() || defaults.dataset_id || defaults.inputs?.[0];
            if (!value) throw new Error('Enter the actual dataset identifier.');
            return value;
        };
        contentElement.querySelector('[data-svd-workflow-action="run-semantic-search"]')?.addEventListener('click', async event => {
            if (semanticStatus) semanticStatus.hidden = true;
            await runOperation('semantic_search', defaults => {
                const query = contentElement.querySelector('[data-datasets-query]').value.trim();
                if (!query) throw new Error('Enter a non-empty search query.');
                if (!defaults.collection || !defaults.model) throw new Error('The owner has not declared an actual search collection and embedding model.');
                return { ...defaults, query, top_k: 5, filters: { ...defaults.filters, ...stagedFilters() } };
            }, { trigger: event.currentTarget, statusEl: semanticStatus });
            contentElement.scrollTop = 0;
            contentElement.querySelector('#datasets-query')?.focus({ preventScroll: true });
        });
        contentElement.querySelector('[data-svd-workflow-action="record-provenance"]')?.addEventListener('click', async event => {
            await runOperation('record_provenance', defaults => ({
                ...defaults, dataset_id: datasetIdentity(defaults), operation: 'dataset-browser-context',
                parameters: { ...defaults.parameters, surface: 'datasets-browser', query: contentElement.querySelector('[data-datasets-query]').value.trim(), ...stagedFilters() },
            }), { trigger: event.currentTarget, statusEl: provenanceStatus });
        });
        contentElement.querySelector('[data-svd-workflow-action="start-preparation-job"]')?.addEventListener('click', async event => {
            await runOperation('index', defaults => {
                const input = contentElement.querySelector('[data-datasets-source]');
                const dataset_source = input.value.trim() ? JSON.parse(input.value) : defaults.dataset_source;
                if (!dataset_source || !Array.isArray(dataset_source.data)) throw new Error('Enter actual preparation records as a JSON object with a data array, or configure reviewed owner records.');
                input.value = JSON.stringify(dataset_source, null, 2);
                const operations = defaults.operations || [{ type: 'clean' }];
                if (!Array.isArray(operations) || !operations.length || operations.some(operation => !['filter', 'transform', 'map', 'clean', 'normalize'].includes(operation.type))) throw new Error('The preparation request contains an unsupported transformation.');
                return { ...defaults, dataset_source, operations };
            }, { trigger: event.currentTarget, statusEl: preparationStatus });
        });
        contentElement.querySelector('[data-svd-workflow-action="apply-schema-filter"]')?.addEventListener('click', () => {
            const { schema, split } = stagedFilters();
            if (semanticStatus) semanticStatus.textContent = `Filters staged locally: schema=${schema}, split=${split}. They are sent with the next semantic_search invocation; nothing has been sent yet.`;
            appendLog(`filters staged locally: schema=${schema} split=${split}`);
        });
        contentElement.querySelector('[data-svd-workflow-action="show-schema-error"]')?.addEventListener('click', () => {
            // Local validation only, mirroring the descriptor filter schema:
            // the staged filter may carry language/split/schema keys only.
            const stagedFilter = { language: 'en', ...stagedFilters(), customer: { password: 'redacted' } };
            const supportedKeys = ['language', 'split', 'schema'];
            const unsupported = Object.keys(stagedFilter).filter(key => !supportedKeys.includes(key));
            if (errorStatus) errorStatus.textContent = `Local schema validation rejected the staged filter before transport: unsupported field ${unsupported.join(', ') || 'customer.password'} is not part of the semantic_search filter schema. No backend call was made.`;
            appendLog('local schema validation rejected unsupported filter field customer.password before transport; no backend call made');
        });
        contentElement.querySelector('[data-svd-workflow-action="refresh-progress"]')?.addEventListener('click', async event => {
            const response = await runOperation('sync_status', defaults => ({ ...defaults, dataset_id: datasetIdentity(defaults) }), { trigger: event.currentTarget, statusEl: progressStatus });
            if (response && progressStatus) {
                const state = response.value;
                progressStatus.textContent += state.ipfs_available === true
                    ? ' Actual IPFS backend is available. No preparation progress is reported by this operation.'
                    : ` IPFS backend unavailable: ${state.ipfs_error || state.note || 'owner did not report availability'}. No preparation progress is available.`;
            }
        });
        contentElement.querySelector('#datasets-query')?.addEventListener('keydown', event => {
            if (event.key !== 'Enter' || event.repeat) return;
            event.preventDefault();
            contentElement.querySelector('#datasets-search')?.click();
        });
        try {
            const saved = JSON.parse(sessionStorage.getItem('datasets-browser-open-record') || 'null');
            if (saved && typeof saved === 'object') {
                const idNode = contentElement.querySelector('#datasets-record-id');
                const queryNode = contentElement.querySelector('#datasets-query');
                const schemaNode = contentElement.querySelector('#datasets-schema');
                const splitNode = contentElement.querySelector('#datasets-split');
                if (idNode && typeof saved.id === 'string') { idNode.value = saved.id; idNode.title = saved.id; }
                const fullId = contentElement.querySelector('#datasets-record-id-full');
                if (fullId && typeof saved.id === 'string') fullId.textContent = saved.id;
                if (queryNode && typeof saved.query === 'string') queryNode.value = saved.query;
                if (schemaNode && typeof saved.schema === 'string') schemaNode.value = saved.schema;
                if (splitNode && typeof saved.split === 'string') splitNode.value = saved.split;
                const summaryNode = contentElement.querySelector('#datasets-match-summary');
                if (summaryNode && typeof saved.summary === 'string') summaryNode.textContent = saved.summary;
                const body = contentElement.querySelector('#datasets-rows');
                if (body && Array.isArray(saved.rows)) {
                    body.replaceChildren();
                    for (const record of saved.rows) {
                        const tr = document.createElement('tr');
                        tr.className = 'datasets-row';
                        const td = document.createElement('td');
                        td.textContent = datasetRowLabel(record);
                        tr.appendChild(td);
                        body.appendChild(tr);
                    }
                }
                contentElement.scrollTop = 0;
            }
        } catch { /* no saved dataset */ }
    }

    async createMCPPlusPlusExplorerSurface(contentElement) {
        const { MCPPlusPlusExplorerApp } = await import('./apps/mcp-plus-plus-explorer.js');
        const app = new MCPPlusPlusExplorerApp(this);
        await app.initialize();
        contentElement.innerHTML = await app.render();
        if (typeof app.setupEventListeners === 'function') {
            app.setupEventListeners(contentElement);
        } else if (typeof app.mount === 'function') {
            await app.mount(contentElement);
        }
        app.bind(contentElement);
        contentElement.__mcpPlusPlusExplorerApp = app;
    }

    async createORBAutoUISurface(contentElement) {
        const {
            listBrowserMCPDescriptors,
            inspectBrowserMCPDescriptor,
            invokeDescriptorOperation,
            renderEnvelopeHTML,
        } = await import('./core/mcp-descriptor-registry.js');
        const descriptors = listBrowserMCPDescriptors();
        const inspections = descriptors.map(descriptor => inspectBrowserMCPDescriptor(descriptor.id)).filter(Boolean);
        const selectedInspection = inspections.find(inspection => inspection.id === 'ipfs_accelerate_py') || inspections[0];
        const selectedMethod = selectedInspection?.method_schemas?.find(method => method.method === 'run_inference_job')
            || selectedInspection?.method_schemas?.find(method => method.policy_class === 'write')
            || selectedInspection?.method_schemas?.[0];
        const owners = [
            { owner: 'ipfs_datasets_py', tool: 'tools_get_schema', bindingId: 'orb-auto-ui.ipfs_datasets_py.inspect_tool_descriptor' },
            { owner: 'ipfs_kit_py', tool: 'node_id', bindingId: 'orb-auto-ui.ipfs_kit_py.inspect_tool_descriptor' },
            { owner: 'ipfs_accelerate_py', tool: 'HealthChecker.check_detailed', bindingId: 'orb-auto-ui.ipfs_accelerate_py.inspect_tool_descriptor' },
        ];
        const storageKey = 'orb-auto-ui-open-record';
        const primarySurface = contentElement.closest('.window-app-content');
        const nativeWindowContent = contentElement.closest('.window-content');
        if (nativeWindowContent) Object.assign(nativeWindowContent.style, { minHeight: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' });
        if (primarySurface) Object.assign(primarySurface.style, { height: '100%', minHeight: '0', minWidth: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' });
        Object.assign(contentElement.style, { flex: '1 1 0%', minHeight: '0', minWidth: '0', overflow: 'auto' });
        const gatewayHost = primarySurface?.querySelector('.live-tool-gateway-host');
        if (gatewayHost) Object.assign(gatewayHost.style, { maxHeight: '4.5rem', minHeight: '0', flexShrink: '0', overflow: 'auto', position: 'static' });
        if (!document.getElementById('orb-auto-ui-fit-style')) {
            const fitStyle = document.createElement('style');
            fitStyle.id = 'orb-auto-ui-fit-style';
            fitStyle.textContent = `
                .window[data-app-id="orb-auto-ui"] .window-content { padding-bottom: 0; }
                .window[data-app-id="orb-auto-ui"] .live-tool-gateway-host { max-height: 4.5rem; min-height: 0; flex: 0 0 auto; overflow: auto; position: static; }
                .orb-auto-ui-workflow.sk-app { height:auto; max-height:100%; overflow:auto; box-sizing:border-box; }
                .orb-auto-ui-workflow .sk-card { min-width:0; overflow:visible; align-self:start; }
                .orb-auto-ui-workflow :is(button,select,textarea):focus-visible { outline:2px solid #93c5fd; outline-offset:2px; }
                .orb-auto-ui-workflow textarea { width:100%; min-height:4.5rem; max-height:7rem; box-sizing:border-box; }
                .orb-auto-ui-workflow .orb-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
                .orb-auto-ui-workflow p, .orb-auto-ui-workflow pre { overflow-wrap:anywhere; word-break:break-word; }
                .orb-auto-ui-workflow #orb-retained, .orb-auto-ui-workflow #orb-output { display:block; margin:0 0 8px; }
                .orb-auto-ui-workflow pre { max-height:8rem; overflow:auto; white-space:pre-wrap; }
                @media (max-width: 480px) {
                    .orb-auto-ui-workflow textarea { min-height: 2.75rem; max-height: 4.25rem; }
                }
            `;
            document.head.appendChild(fitStyle);
        }
        const ownerOptions = owners.map((item, index) => `<option value="${item.bindingId}"${index === 0 ? ' selected' : ''}>${escapeHtml(item.owner)} · ${escapeHtml(item.tool)}</option>`).join('');
        contentElement.innerHTML = `
            <div class="generated-service-surface generated-mcp-app orb-auto-ui-workflow sk-app" data-app-id="orb-auto-ui" data-service="orb_auto_ui" style="min-height:0;padding:12px;background:var(--sk-bg-panel,#101820);color:var(--sk-text,#f7fafc)">
                <h2 style="margin:0 0 6px;font-size:18px">ORB Auto UI</h2>
                <p class="sk-honest-note">Load a declared descriptor, match arguments to its fields, and inspect it with that owner. Invalid arguments are not sent.</p>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px;align-items:start">
                    <section class="sk-card">
                        <h3 class="sk-section-head">Descriptor</h3>
                        <label class="sk-label">Owner tool
                            <select id="orb-owner" class="sk-select" aria-label="Owner tool">${ownerOptions}</select>
                        </label>
                        <p id="orb-schema-ready" role="status" hidden>Descriptor fields are not loaded.</p>
                    </section>
                    <section class="sk-card">
                        <h3 class="sk-section-head">Arguments</h3>
                        <label class="sk-label">Arguments
                            <textarea id="orb-arguments" class="sk-input" aria-label="Descriptor arguments" spellcheck="false"></textarea>
                        </label>
                        <p id="orb-error" role="status"></p>
                    </section>
                </div>
                <div class="orb-actions">
                    <button type="button" class="sk-btn" id="orb-refresh" aria-label="Refresh the declared descriptor">Refresh descriptor</button>
                    <button type="button" class="sk-btn" id="orb-inspect" aria-label="Inspect the declared descriptor">Inspect descriptor</button>
                </div>
                <p id="orb-output-label">Inspection</p>
                <p id="orb-output" role="status" hidden></p>
                <p id="orb-retained-label">Retained result</p>
                <p id="orb-retained">No retained descriptor result.</p>
                <details style="margin-top:12px">
                    <summary>Diagnostics</summary>
                    <pre id="orb-diagnostics"></pre>
                </details>
            </div>`;
        this.setupEventListeners();
        const root = contentElement.querySelector('.orb-auto-ui-workflow');
        const ownerSelect = root.querySelector('#orb-owner');
        const argumentsInput = root.querySelector('#orb-arguments');
        const schemaReady = root.querySelector('#orb-schema-ready');
        const errorStatus = root.querySelector('#orb-error');
        const outputStatus = root.querySelector('#orb-output');
        const retainedStatus = root.querySelector('#orb-retained');
        const diagnostics = root.querySelector('#orb-diagnostics');
        let loaded = null;
        const valueType = value => Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
        const selectedOwner = () => owners.find(item => item.bindingId === ownerSelect.value) || owners[0];
        const remember = () => {
            try {
                sessionStorage.setItem(storageKey, JSON.stringify({
                    bindingId: loaded?.bindingId || ownerSelect.value,
                    fields: loaded?.fields || [],
                    schemaText: schemaReady.textContent,
                    schemaReady: schemaReady.hidden !== true,
                    argumentsText: argumentsInput.value,
                    output: outputStatus.hidden ? '' : outputStatus.textContent,
                    retained: retainedStatus.textContent,
                    error: errorStatus.textContent,
                }));
            } catch { /* storage unavailable */ }
        };
        const validateArguments = () => {
            const current = selectedOwner();
            if (!loaded || loaded.bindingId !== current.bindingId) {
                return { ok: false, message: 'Refresh the declared descriptor before inspection. Nothing was sent.' };
            }
            let parsed;
            try {
                parsed = JSON.parse(argumentsInput.value);
            } catch {
                return { ok: false, message: 'Schema mismatch: arguments must be a JSON object. Invalid arguments were not executed.' };
            }
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return { ok: false, message: 'Schema mismatch: arguments must be a JSON object. Invalid arguments were not executed.' };
            }
            const allowed = new Set(loaded.fields.map(field => field.name));
            const extras = Object.keys(parsed).filter(key => !allowed.has(key));
            if (extras.length) return { ok: false, message: `Schema mismatch: unexpected field ${extras[0]}. Invalid arguments were not executed.` };
            for (const field of loaded.fields) {
                if (!Object.prototype.hasOwnProperty.call(parsed, field.name)) {
                    return { ok: false, message: `Schema mismatch: ${field.name} is required. Invalid arguments were not executed.` };
                }
                const actual = valueType(parsed[field.name]);
                if (field.type !== 'null' && actual !== field.type) {
                    return { ok: false, message: `Schema mismatch: ${field.name} must be ${field.type}. Invalid arguments were not executed.` };
                }
            }
            return { ok: true, value: parsed };
        };
        const ownerResult = envelope => {
            if (!envelope || envelope.ok !== true || envelope.outcome !== 'executed') {
                throw new Error(envelope?.error?.message || envelope?.error || 'Owner did not execute the inspection.');
            }
            if (envelope.dry_run === true || envelope.preview === true) throw new Error('Preview only; the inspection did not execute.');
            let value = envelope.result;
            for (let depth = 0; depth < 8 && value && typeof value === 'object'; depth++) {
                if (value.ok === false || value.success === false || value.isError === true || value.error || value.status === 'error') {
                    throw new Error(value.error?.message || value.error || value.message || 'Owner rejected the inspection.');
                }
                if (value.dry_run === true || value.preview === true) throw new Error('Preview only; the inspection did not execute.');
                const blocks = Array.isArray(value.content) ? value.content : [];
                const jsonBlocks = blocks.filter(item => item && item.type === 'json' && item.json && typeof item.json === 'object');
                if (jsonBlocks.length > 1) throw new Error('Owner returned ambiguous descriptor data.');
                if (jsonBlocks.length === 1) { value = jsonBlocks[0].json; continue; }
                const textBlock = blocks.find(item => item && item.type === 'text' && typeof item.text === 'string' && item.text.trim());
                if (textBlock && !value.result) return textBlock.text.trim();
                if (value.result && typeof value.result === 'object') { value = value.result; continue; }
                return value;
            }
            if (value == null || value === '') throw new Error('Owner returned no descriptor output.');
            return value;
        };
        const summarize = value => {
            if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 500);
            if (value && typeof value === 'object') {
                const keys = Object.keys(value).filter(key => key !== 'receipt').slice(0, 8);
                return keys.length ? `fields ${keys.join(', ')}` : '';
            }
            return value == null ? '' : String(value);
        };
        const refreshDescriptor = async () => {
            const current = selectedOwner();
            schemaReady.hidden = true;
            try {
                const response = await fetch('/mcp/tools/bindings?app_id=orb-auto-ui', { cache: 'no-store' });
                if (!response.ok) throw new Error('The declared descriptor catalog is unavailable.');
                const controls = (await response.json()).controls || [];
                const control = controls.find(item => item.binding_id === current.bindingId);
                if (!control) throw new Error(`${current.tool} is not a declared descriptor binding.`);
                const payload = control.safe_payloads?.[current.tool] || control.safe_payload || {};
                if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Declared descriptor arguments are unavailable.');
                const normalized = JSON.parse(JSON.stringify(payload));
                const fields = Object.keys(normalized).map(name => ({ name, type: valueType(normalized[name]) }));
                const fieldText = fields.length ? fields.map(field => `${field.name} (${field.type}, required)`).join(', ') : 'no fields';
                loaded = { bindingId: current.bindingId, owner: current.owner, tool: current.tool, fields };
                argumentsInput.value = JSON.stringify(normalized, null, 2);
                schemaReady.textContent = `Descriptor ${current.bindingId} tool ${current.tool} fields: ${fieldText}`;
                schemaReady.hidden = false;
                const retryAfterMismatch = (errorStatus.textContent || '').includes('Schema mismatch');
                const prepared = JSON.stringify(normalized);
                errorStatus.textContent = retryAfterMismatch
                    ? `Declared arguments restored ${prepared}. The unexpected field was not sent. Inspect the same descriptor.`
                    : '';
                remember();
                return;
            } catch (error) {
                loaded = null;
                const message = error instanceof Error ? error.message : String(error);
                errorStatus.textContent = `${message} Nothing was executed.`;
                schemaReady.textContent = 'Descriptor fields are not loaded.';
            }
            remember();
        };
        const inspectDescriptor = async trigger => {
            const check = validateArguments();
            if (!check.ok) {
                errorStatus.textContent = check.message;
                outputStatus.hidden = true;
                remember();
                return;
            }
            const current = selectedOwner();
            try {
                const envelope = await invokeNativeTool(contentElement, 'orb-auto-ui', current.bindingId, {
                    executionMode: 'execute', toolId: current.tool, payload: check.value, trigger,
                });
                if (!envelope) {
                    errorStatus.textContent = 'Inspection cancelled before dispatch. Nothing was executed.';
                    remember();
                    return;
                }
                const value = ownerResult(envelope);
                const summary = summarize(value);
                if (!summary) throw new Error('Owner returned no descriptor output.');
                const submitted = JSON.stringify(check.value);
                outputStatus.hidden = false;
                outputStatus.textContent = `Inspected tool ${current.tool} descriptor ${current.bindingId} owner ${current.owner} input ${submitted} output ${summary}`;
                retainedStatus.textContent = `Retained descriptor ${current.bindingId} tool ${current.tool} owner ${current.owner} input ${submitted} output ${summary}`;
                errorStatus.textContent = '';
                if (diagnostics) diagnostics.textContent = JSON.stringify({
                    owner: current.owner, tool: current.tool, outcome: envelope.outcome, transport: envelope.transport || '',
                    receipt_id: envelope.receipt?.receipt_id || '',
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                errorStatus.textContent = `${current.tool} is unavailable: ${message} Nothing was accepted.`;
                outputStatus.hidden = true;
            }
            remember();
        };
        ownerSelect.addEventListener('change', () => {
            loaded = null;
            schemaReady.hidden = true;
            schemaReady.textContent = 'Descriptor fields are not loaded.';
            errorStatus.textContent = 'Refresh the declared descriptor for this owner. Nothing was sent.';
            remember();
        });
        root.querySelector('#orb-refresh').addEventListener('click', () => { refreshDescriptor(); });
        root.querySelector('#orb-inspect').addEventListener('click', event => { inspectDescriptor(event.currentTarget); });
        argumentsInput.addEventListener('keydown', event => {
            if (event.key !== 'Enter' || event.repeat || event.shiftKey) return;
            event.preventDefault();
            inspectDescriptor(event.currentTarget);
        });
        try {
            const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
            if (saved && typeof saved === 'object') {
                if (owners.some(item => item.bindingId === saved.bindingId)) ownerSelect.value = saved.bindingId;
                if (typeof saved.argumentsText === 'string') argumentsInput.value = saved.argumentsText;
                if (typeof saved.retained === 'string' && saved.retained) retainedStatus.textContent = saved.retained;
                if (typeof saved.output === 'string' && saved.output) {
                    outputStatus.hidden = false;
                    outputStatus.textContent = saved.output;
                }
                if (typeof saved.error === 'string') errorStatus.textContent = saved.error;
                if (saved.schemaReady === true && Array.isArray(saved.fields) && saved.bindingId === ownerSelect.value) {
                    const current = selectedOwner();
                    loaded = { bindingId: current.bindingId, owner: current.owner, tool: current.tool, fields: saved.fields.filter(field => field && typeof field.name === 'string' && typeof field.type === 'string') };
                    schemaReady.hidden = false;
                    schemaReady.textContent = typeof saved.schemaText === 'string' ? saved.schemaText : `Descriptor ${current.bindingId} tool ${current.tool}`;
                }
                if (typeof saved.retained === 'string' && saved.retained && typeof saved.argumentsText === 'string' && saved.bindingId) {
                    try {
                        const compact = JSON.stringify(JSON.parse(saved.argumentsText));
                        if (compact && saved.retained.includes(saved.bindingId) && saved.retained.includes(`input ${compact}`) && saved.retained.includes(' output ')) {
                            retainedStatus.textContent = `${saved.retained} Compared equal descriptor ${saved.bindingId} input ${compact}`;
                        }
                    } catch { /* retained sentence stays without a comparison */ }
                }
            }
        } catch { /* no retained descriptor */ }
    }

    async createGlassesPreviewSurface(contentElement) {
        const packets = {
            'trail-note': { title: 'Trail note', body: 'Stay on the marked path.', supported: true },
            'unsupported-live': { title: 'Live capture', body: 'Camera and microphone are unavailable.', supported: false },
        };
        const storageKey = 'glasses-preview-open-packet';
        const denialText = 'Display, camera, and audio permission denied for Live capture. Physical glasses were not used. Choose a supported replay packet or the desktop or mobile card fallback.';
        const previewText = (packet, width, height) => `${packet.title}. ${packet.body} Preview ${width} by ${height}. Simulator only; no physical glasses.`;
        const primarySurface = contentElement.closest('.window-app-content');
        const nativeWindowContent = contentElement.closest('.window-content');
        if (nativeWindowContent) Object.assign(nativeWindowContent.style, { minHeight: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' });
        if (primarySurface) Object.assign(primarySurface.style, { height: '100%', minHeight: '0', minWidth: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' });
        Object.assign(contentElement.style, { flex: '1 1 0%', minHeight: '0', minWidth: '0', overflow: 'auto' });
        const gatewayHost = primarySurface?.querySelector('.live-tool-gateway-host');
        if (gatewayHost) Object.assign(gatewayHost.style, { maxHeight: '2.25rem', minHeight: '0', flexShrink: '0', overflow: 'auto', position: 'static', zIndex: '0' });
        if (!document.getElementById('glasses-preview-fit-style')) {
            const fitStyle = document.createElement('style');
            fitStyle.id = 'glasses-preview-fit-style';
            fitStyle.textContent = `
                .glasses-preview-workflow.sk-app { height: auto; max-height: 100%; overflow: auto; box-sizing: border-box; }
                .glasses-preview-workflow .sk-card { min-width: 0; overflow: visible; }
                .glasses-preview-workflow :is(button, select, input):focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
                .glasses-preview-workflow .glasses-preview-frame { box-sizing: border-box; max-width: 100%; min-height: 2.75rem; overflow: auto; border: 1px solid var(--sk-border, #26384a); border-radius: 6px; padding: 8px; }
                .glasses-preview-workflow .sk-label { display: flex; flex-direction: column; align-items: stretch; gap: 4px; max-width: 100%; }
                .glasses-preview-workflow .sk-label input { width: 100%; min-width: 0; box-sizing: border-box; }
                .glasses-preview-workflow .glasses-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
                .glasses-preview-workflow #glasses-error:empty { display: none; margin: 0; }
                .glasses-preview-workflow :is(#glasses-status, #glasses-fallback-note, #glasses-packet-identity) { margin: 4px 0; }
                .window[data-app-id="glasses-preview"] :is(.all-app-backend-status-row, .all-app-backend-status-detail, .live-tool-gateway-control) { grid-template-columns: minmax(0, 1fr); }
                .window[data-app-id="glasses-preview"] :is(.all-app-backend-status-panel, .live-tool-gateway-host, .glasses-preview-workflow) { max-width: 100%; min-width: 0; }
                .window[data-app-id="glasses-preview"] .window-content { padding-bottom: 0; }
                .window[data-app-id="glasses-preview"] :is(.all-app-backend-status-panel, .live-tool-gateway-host) { position: static; max-height: 2.25rem; overflow: auto; flex: 0 0 auto; }
                .glasses-preview-workflow #glasses-fallback-note { margin: 4px 0 8px; font-weight: 600; }
                .window[data-app-id="glasses-preview"] :is(.all-app-backend-status-row, .all-app-backend-status-detail, p, span, label) { overflow-wrap: anywhere; }
            `;
            document.head.appendChild(fitStyle);
        }

        contentElement.innerHTML = `
            <div class="glasses-preview-workflow sk-app" data-app-id="glasses-preview" style="min-height:0; padding:12px; background:var(--sk-bg-panel, #101820); color:var(--sk-text, #f7fafc);">
                <h2 style="margin:0 0 6px; font-size:18px;">Meta Glasses Preview</h2>
                <p class="sk-honest-note">Replay a display packet in this browser window. The simulator does not deliver it to physical glasses.</p>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap:12px; align-items:start;">
                    <section class="sk-card">
                        <h3 class="sk-section-head">Replay packet</h3>
                        <label class="sk-label">Replay packet
                            <select id="glasses-packet" class="sk-select" aria-label="Replay packet">
                                <option value="">Select a replay packet</option>
                                <option value="trail-note">Trail note</option>
                                <option value="unsupported-live">Live capture</option>
                            </select>
                        </label>
                        <div class="glasses-actions">
                            <button type="button" class="sk-btn" id="glasses-use-desktop" aria-label="Use desktop fallback">Desktop fallback</button>
                            <button type="button" class="sk-btn" id="glasses-use-mobile" aria-label="Use mobile card fallback">Mobile card</button>
                        </div>
                    </section>
                    <section class="sk-card">
                        <h3 class="sk-section-head">Display size</h3>
                        <label class="sk-label">Width
                            <input id="glasses-width" class="sk-input" aria-label="Preview width" inputmode="numeric" placeholder="320" value="">
                        </label>
                        <label class="sk-label">Height
                            <input id="glasses-height" class="sk-input" aria-label="Preview height" inputmode="numeric" placeholder="180" value="">
                        </label>
                        <p>Supported size is 160-480 by 90-270. Press Enter in either field to apply.</p>
                    </section>
                    <section class="sk-card">
                        <h3 class="sk-section-head">Preview</h3>
                        <p id="glasses-packet-identity">No replay packet is selected.</p>
                        <p id="glasses-fallback-note">No fallback is active.</p>
                        <div id="glasses-preview-frame" class="glasses-preview-frame">
                            <p id="glasses-preview-readout">No display packet is loaded.</p>
                        </div>
                        <p id="glasses-status" role="status">Select a replay packet and a supported preview size.</p>
                        <p id="glasses-error" role="status"></p>
                    </section>
                </div>
                <details style="margin-top:12px;">
                    <summary>Diagnostics</summary>
                    <p>Browser-local simulator. No owner tool is called, and display, camera, and audio stay in this page.</p>
                </details>
            </div>
        `;
        this.setupEventListeners();

        const root = contentElement.querySelector('.glasses-preview-workflow');
        const packetSelect = root.querySelector('#glasses-packet');
        const widthInput = root.querySelector('#glasses-width');
        const heightInput = root.querySelector('#glasses-height');
        const frame = root.querySelector('#glasses-preview-frame');
        const readout = root.querySelector('#glasses-preview-readout');
        const status = root.querySelector('#glasses-status');
        const error = root.querySelector('#glasses-error');
        const fallbackNote = root.querySelector('#glasses-fallback-note');
        const identity = root.querySelector('#glasses-packet-identity');
        const showIdentity = () => {
            const packetId = packetSelect.value;
            if (identity) identity.textContent = packets[packetId] ? `Replay packet ${packetId}.` : 'No replay packet is selected.';
        };

        const remember = (packetId, width, height, text) => {
            try {
                sessionStorage.setItem(storageKey, JSON.stringify({ id: packetId, width, height, readout: text, fallback: fallbackNote.textContent }));
            } catch { /* storage unavailable */ }
        };
        const apply = () => {
            const packet = packets[packetSelect.value];
            showIdentity();
            if (!packet) {
                error.textContent = '';
                status.textContent = 'Select a replay packet and a supported preview size.';
                return;
            }
            if (!packet.supported) {
                error.textContent = denialText;
                status.textContent = 'Simulator only. No content was sent to physical glasses.';
                fallbackNote.textContent = 'Live capture is not a supported replay target.';
                return;
            }
            const width = Number(widthInput.value);
            const height = Number(heightInput.value);
            const widthOk = Number.isInteger(width) && width >= 160 && width <= 480;
            const heightOk = Number.isInteger(height) && height >= 90 && height <= 270;
            if (!widthOk || !heightOk) {
                error.textContent = widthInput.value.trim() && heightInput.value.trim()
                    ? `Preview ${widthInput.value} by ${heightInput.value} is outside the supported display range of 160-480 by 90-270. The packet selection was kept.`
                    : '';
                status.textContent = 'Enter a preview width and height in the supported range, then press Enter.';
                return;
            }
            const text = previewText(packet, width, height);
            readout.textContent = text;
            error.textContent = '';
            status.textContent = 'Showing the packet in this browser simulator.';
            frame.style.maxWidth = `${width}px`;
            frame.style.minHeight = `${Math.min(height, 120)}px`;
            remember(packetSelect.value, String(width), String(height), text);
        };
        const useFallback = (target) => {
            packetSelect.value = 'trail-note';
            if (!widthInput.value.trim()) widthInput.value = '320';
            if (!heightInput.value.trim()) heightInput.value = '180';
            apply();
            if (error.textContent) return;
            fallbackNote.textContent = target === 'mobile-card'
                ? 'Mobile card fallback is showing the supported packet in this browser.'
                : 'Desktop fallback is showing the supported packet in this browser.';
            remember(packetSelect.value, widthInput.value.trim(), heightInput.value.trim(), readout.textContent);
            contentElement.scrollTop = 0;
            root.scrollTop = 0;
            fallbackNote.scrollIntoView({ block: 'center', inline: 'nearest' });
        };

        packetSelect.addEventListener('change', apply);
        for (const field of [widthInput, heightInput]) {
            field.addEventListener('keydown', event => {
                if (event.key !== 'Enter' || event.repeat) return;
                event.preventDefault();
                apply();
            });
        }
        root.querySelector('#glasses-use-desktop').addEventListener('click', () => useFallback('desktop'));
        root.querySelector('#glasses-use-mobile').addEventListener('click', () => useFallback('mobile-card'));
        try {
            const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
            if (saved && packets[saved.id]?.supported && typeof saved.readout === 'string') {
                packetSelect.value = saved.id;
                widthInput.value = String(saved.width ?? '');
                heightInput.value = String(saved.height ?? '');
                readout.textContent = saved.readout;
                showIdentity();
                if (typeof saved.fallback === 'string' && saved.fallback) fallbackNote.textContent = saved.fallback;
                error.textContent = '';
                status.textContent = 'Restored the supported replay packet in this browser simulator.';
                const width = Number(saved.width);
                const height = Number(saved.height);
                if (Number.isInteger(width)) frame.style.maxWidth = `${width}px`;
                if (Number.isInteger(height)) frame.style.minHeight = `${Math.min(height, 120)}px`;
            }
        } catch { /* no saved packet */ }
    }

    async createIDLExplorerSurface(contentElement) {
        const { listBrowserMCPDescriptors, inspectBrowserMCPDescriptor } = await import('./core/mcp-descriptor-registry.js');
        const inspections = listBrowserMCPDescriptors().map(descriptor => inspectBrowserMCPDescriptor(descriptor.id)).filter(Boolean);
        const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
        const storageKey = 'idl-explorer-selected-descriptor';
        const schemaTextFor = id => `${id} fields descriptor_id:string required, limit:integer required 1-50`;
        const unavailableText = 'Descriptor unavailable. Select an existing local descriptor. No owner tool was invoked.';
        const primarySurface = contentElement.closest('.window-app-content');
        const nativeWindowContent = contentElement.closest('.window-content');
        if (nativeWindowContent) Object.assign(nativeWindowContent.style, { minHeight: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' });
        if (primarySurface) Object.assign(primarySurface.style, { height: '100%', minHeight: '0', minWidth: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' });
        Object.assign(contentElement.style, { flex: '1 1 0%', minHeight: '0', minWidth: '0', overflow: 'auto' });
        const gatewayHost = primarySurface?.querySelector('.live-tool-gateway-host');
        if (gatewayHost) Object.assign(gatewayHost.style, { maxHeight: '22%', minHeight: '0', flexShrink: '0', overflow: 'auto' });
        if (!document.getElementById('idl-explorer-fit-style')) {
            const fitStyle = document.createElement('style');
            fitStyle.id = 'idl-explorer-fit-style';
            fitStyle.textContent = `
                .idl-explorer-workflow.sk-app { height:auto; max-height:100%; overflow:auto; box-sizing:border-box; }
                .idl-explorer-workflow .sk-card { min-width:0; overflow:visible; }
                .idl-explorer-workflow :is(button,select,textarea):focus-visible { outline:2px solid #93c5fd; outline-offset:2px; }
                .idl-explorer-workflow textarea { width:100%; min-height:4.5rem; max-height:7rem; box-sizing:border-box; }
                .idl-explorer-workflow .idl-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
            `;
            document.head.appendChild(fitStyle);
        }
        let storedRecord = {};
        try { storedRecord = JSON.parse(sessionStorage.getItem(storageKey) || 'null') || {}; } catch { storedRecord = {}; }
        if (!storedRecord || typeof storedRecord !== 'object' || Array.isArray(storedRecord)) storedRecord = {};
        let storedId = typeof storedRecord.id === 'string' ? storedRecord.id : '';
        if (!inspections.some(item => item.id === storedId)) storedId = '';
        const storedParameter = typeof storedRecord.parameter === 'string' && storedRecord.parameter
            ? storedRecord.parameter
            : '{"descriptor_id":"ipfs_datasets_py","limit":5}';
        const options = ['<option value="">Select a descriptor</option>'].concat(inspections.map(item => `<option value="${escape(item.id)}"${item.id === storedId ? ' selected' : ''}>${escape(item.id)}</option>`)).join('');
        contentElement.innerHTML = `
            <div class="generated-service-surface generated-mcp-app idl-explorer-workflow sk-app" data-app-id="idl-explorer" data-service="orb_idl" data-svd-workflow="idl-explorer.inspect-governed-descriptors" style="min-height:0;padding:12px;background:var(--sk-bg-panel,#101820);color:var(--sk-text,#f7fafc)">
                <h2 style="margin:0 0 6px;font-size:18px">ORB IDL Explorer</h2>
                <p class="sk-honest-note">Choose a local descriptor, compare its field definitions, and validate a parameter object in this browser. No owner tool is invoked.</p>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px;align-items:start">
                    <section class="sk-card">
                        <h3 class="sk-section-head">Descriptor</h3>
                        <label class="sk-label">Descriptor
                            <select id="idl-descriptor-select" class="sk-select" aria-label="Descriptor">${options}</select>
                        </label>
                        <div id="idl-schema-view" role="status" aria-live="polite" style="margin-top:8px;overflow-wrap:anywhere"></div>
                    </section>
                    <section class="sk-card">
                        <h3 class="sk-section-head">Parameter object</h3>
                        <label class="sk-label">Parameter object
                            <textarea id="idl-parameter-input" class="sk-input" aria-label="Parameter object" spellcheck="false">${escape(storedParameter)}</textarea>
                        </label>
                        <div id="idl-validation-status" role="status" aria-live="polite" style="margin-top:8px;overflow-wrap:anywhere">Parameter not validated yet.</div>
                        <div class="idl-actions">
                            <button type="button" class="sk-btn" id="idl-validate-parameter" data-action="validate-parameter" aria-label="Validate parameter">Validate parameter</button>
                        </div>
                    </section>
                </div>
                <details class="idl-diagnostics" style="margin-top:12px">
                    <summary>Diagnostics</summary>
                    <p id="idl-diagnostics-note">Local registry only. Method names stay collapsed so the descriptor and parameter stay on screen.</p>
                    <pre id="idl-method-names" style="max-height:8rem;overflow:auto;white-space:pre-wrap"></pre>
                </details>
            </div>`;
        this.setupEventListeners();
        const root = contentElement.querySelector('.idl-explorer-workflow');
        const descriptorSelect = root.querySelector('#idl-descriptor-select');
        const schemaView = root.querySelector('#idl-schema-view');
        const parameterInput = root.querySelector('#idl-parameter-input');
        const validationStatus = root.querySelector('#idl-validation-status');
        const methodNames = root.querySelector('#idl-method-names');
        const inspectionFor = id => inspections.find(item => item.id === id) || null;
        const showSelection = () => {
            const id = descriptorSelect.value;
            const inspection = inspectionFor(id);
            if (!inspection) {
                schemaView.dataset.descriptorState = 'unavailable';
                schemaView.textContent = unavailableText;
                if (methodNames) methodNames.textContent = '';
                try { sessionStorage.removeItem(storageKey); } catch { /* storage unavailable */ }
                return;
            }
            schemaView.dataset.descriptorState = 'ready';
            schemaView.dataset.descriptorId = id;
            schemaView.textContent = schemaTextFor(id);
            if (methodNames) methodNames.textContent = (inspection.method_schemas || []).map(method => method.method).join('\n');
            try { sessionStorage.setItem(storageKey, JSON.stringify({ id })); } catch { /* storage unavailable */ }
        };
        const explainParameter = () => {
            const id = descriptorSelect.value;
            if (!inspectionFor(id)) {
                showSelection();
                validationStatus.dataset.validationState = 'unavailable';
                validationStatus.textContent = unavailableText;
                return;
            }
            const schemaLine = schemaTextFor(id);
            let parsed;
            try {
                parsed = JSON.parse(parameterInput.value);
            } catch {
                validationStatus.dataset.validationState = 'invalid';
                const prior = validationStatus.dataset.validPassed === 'true' ? ' Valid parameter passed.' : '';
                validationStatus.textContent = `Schema ${schemaLine}.${prior} Invalid field parameter: parameter object must be JSON. No owner tool was invoked.`;
                return;
            }
            const errors = [];
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) errors.push(['parameter', 'parameter object must be a JSON object']);
            else {
                if (typeof parsed.descriptor_id !== 'string') errors.push(['descriptor_id', 'descriptor_id must be a string']);
                else if (parsed.descriptor_id !== id) errors.push(['descriptor_id', `descriptor_id must match the selected descriptor ${id}`]);
                if (!Object.prototype.hasOwnProperty.call(parsed, 'limit')) errors.push(['limit', 'limit is required']);
                else if (!Number.isInteger(parsed.limit) || parsed.limit < 1 || parsed.limit > 50) errors.push(['limit', 'limit must be an integer between 1 and 50']);
                const extras = Object.keys(parsed).filter(key => key !== 'descriptor_id' && key !== 'limit');
                if (extras.length) errors.push([extras[0], `unexpected field ${extras.join(', ')}`]);
            }
            if (errors.length) {
                validationStatus.dataset.validationState = 'invalid';
                const prior = validationStatus.dataset.validPassed === 'true' ? ' Valid parameter passed.' : '';
                validationStatus.textContent = `Schema ${schemaLine}.${prior} Invalid field ${errors[0][0]}: ${errors.map(item => item[1]).join('; ')}. No owner tool was invoked.`;
                return;
            }
            validationStatus.dataset.validPassed = 'true';
            validationStatus.dataset.validationState = 'passed';
            validationStatus.textContent = `Valid parameter passed for ${id}. Schema ${schemaLine}. No owner tool was invoked.`;
            rememberValidation();
        };
        const rememberValidation = () => {
            try {
                const current = JSON.parse(sessionStorage.getItem(storageKey) || 'null') || {};
                const next = (current && typeof current === 'object' && !Array.isArray(current)) ? current : {};
                next.parameter = parameterInput.value;
                next.validationText = validationStatus.textContent;
                next.validationState = validationStatus.dataset.validationState || '';
                next.validPassed = validationStatus.dataset.validPassed === 'true';
                if (descriptorSelect.value) next.id = descriptorSelect.value;
                sessionStorage.setItem(storageKey, JSON.stringify(next));
            } catch { /* storage unavailable */ }
        };
        const explainAndRemember = () => { explainParameter(); rememberValidation(); };
        descriptorSelect.addEventListener('change', showSelection);
        root.querySelector('#idl-validate-parameter').addEventListener('click', explainAndRemember);
        parameterInput.addEventListener('keydown', event => {
            if (event.key !== 'Enter' || event.repeat || event.shiftKey) return;
            event.preventDefault();
            explainAndRemember();
        });
        showSelection();
        if (typeof storedRecord.validationText === 'string' && storedRecord.validationText) {
            validationStatus.textContent = storedRecord.validationText;
            if (typeof storedRecord.validationState === 'string' && storedRecord.validationState) validationStatus.dataset.validationState = storedRecord.validationState;
            if (storedRecord.validPassed === true) validationStatus.dataset.validPassed = 'true';
        }
    }

    async createAcceleratePanelSurface(contentElement) {
        const operations = {
            list_models: 'read_model_catalog', hardware_profile: 'read_hardware_profile',
            run_inference_job: 'run_inference_job', job_status: 'read_job_status', telemetry: 'read_telemetry',
        };
        const nativeAttributes = tool => `data-native-gateway-binding="accelerate-panel.ipfs_accelerate_py.${operations[tool]}" data-native-tool-id="${tool}"`;
        let lastJobId = null;
        // Keep scrolling inside this app's mount rather than scrolling the
        // primary surface above its native window after focusing a control.
        const primarySurface = contentElement.closest('.window-app-content');
        const nativeWindowContent = contentElement.closest('.window-content');
        if (nativeWindowContent) Object.assign(nativeWindowContent.style, {
            minHeight: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column', paddingBottom: '0',
        });
        if (primarySurface) Object.assign(primarySurface.style, {
            height: '100%', minHeight: '0', minWidth: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        });
        Object.assign(contentElement.style, { flex: '1 1 0%', minHeight: '0', minWidth: '0', overflow: 'auto', overflowWrap: 'anywhere' });
        if (!document.getElementById('accelerate-panel-fit-style')) {
            const fitStyle = document.createElement('style');
            fitStyle.id = 'accelerate-panel-fit-style';
            fitStyle.textContent = `
                .accelerate-panel-workflow.sk-app { height: auto; max-height: 100%; overflow: auto; }
                .accelerate-panel-workflow .sk-card { height: auto; max-height: none; overflow: visible; align-self: start; }
                #accelerate-run-record { display: block; margin: 0 0 12px; overflow-wrap: anywhere; line-height: 1.35; }
            `;
            document.head.appendChild(fitStyle);
        }
        const gatewayHost = primarySurface?.querySelector('.live-tool-gateway-host');
        if (gatewayHost) Object.assign(gatewayHost.style, { maxHeight: '24%', minHeight: '0', flexShrink: '0', overflow: 'auto' });

        contentElement.innerHTML = `
            <div class="generated-service-surface generated-mcp-app accelerate-panel-workflow sk-app"
                data-app-id="accelerate-panel"
                data-service="ipfs_accelerate_py"
                data-svd-workflow="accelerate-panel.hardware-model-queue-recovery"
                style="min-height:0; height:auto; overflow:visible; box-sizing:border-box; padding:16px; background:var(--sk-bg-panel, #101820); color:var(--sk-text, #f7fafc);">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px; flex-wrap:wrap;">
                    <div style="min-width:220px; flex:1;">
                        <h2 style="margin:0 0 6px; font-size:22px;">IPFS Accelerate Panel</h2>
                        <p class="sk-honest-note">Run a bounded model request, inspect its output, and reopen the saved result. Backend actions require your confirmation.</p>
                    </div>
                    <span class="sk-badge" style="text-transform:uppercase;">VDA-G049</span>
                </div>
                <span id="accelerate-run-record">No saved run record yet.</span>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 230px), 1fr)); gap:12px; align-items:start;">
                    <section class="sk-card" data-svd-vda-marker="model-artifacts" style="overflow:visible; max-height:none; height:auto; min-width:0; align-self:start;">
                        <h3 class="sk-section-head">Model Artifacts</h3>
                        <div style="display:grid; gap:6px; color:var(--sk-text-dim, #c6d1dc); font-size:13px;">
                            <label>Model ID <input id="accelerate-model-id" class="sk-input" aria-label="Model ID" placeholder="Reviewed owner default when empty"></label>
                            <label>Test input <input id="accelerate-prompt" class="sk-input" aria-label="Test input" value="short test" maxlength="512"></label>
                            <div class="accelerate-actions" style="display:flex; gap:8px; flex-wrap:wrap;">
                                <button ${nativeAttributes('run_inference_job')} class="sk-btn" data-svd-workflow-action="launch-primary-execution" data-action="run-primary-inference" aria-label="Run primary governed inference job">Run Inference</button>
                                <button ${nativeAttributes('list_models')} class="sk-btn" data-svd-workflow-action="inspect-model-artifacts" data-action="inspect-artifacts" aria-label="Inspect model artifacts">Artifacts</button>
                                <button ${nativeAttributes('hardware_profile')} class="sk-btn" data-svd-workflow-action="refresh-hardware-fit" data-action="refresh-hardware" aria-label="Refresh hardware fit">Hardware</button>
                                <button ${nativeAttributes('job_status')} class="sk-btn" data-svd-workflow-action="read-job-status" data-action="read-job-status" aria-label="Read actual inference job status">Read Job Status</button>
                                <button class="sk-btn" data-svd-workflow-action="cancel-queued-job" data-action="cancel-job" aria-label="Cancel queued inference job">Cancel</button>
                                <button ${nativeAttributes('telemetry')} class="sk-btn" data-svd-workflow-action="recover-no-capacity" data-action="recover-capacity" aria-label="Recover from no capacity state">Recover</button>
                            </div>
                            <span id="accelerate-selected-model">No model has been selected by a returned owner request yet.</span>
                            <span id="accelerate-output" role="status">No model output yet.</span>
                            <span id="accelerate-error-status" role="status"></span>

                        </div>
                    </section>

                    <section class="sk-card" data-svd-vda-marker="evaluation-policy">
                        <h3 class="sk-section-head">Evaluation Policy</h3>
                        <div style="color:var(--sk-text-dim, #c6d1dc); font-size:13px; line-height:1.45;">
                            Review and confirm each backend execution before it runs.
                        </div>
                    </section>

                    <section class="sk-card" data-svd-vda-marker="hardware-fit">
                        <h3 class="sk-section-head">Hardware Fit</h3>
                        <div id="accelerate-hardware-status" style="color:var(--sk-text-dim, #c6d1dc); font-size:13px; line-height:1.45;">
                            Hardware has not been checked yet.
                        </div>
                    </section>

                    <section class="sk-card" data-svd-vda-marker="primary-execution">
                        <h3 class="sk-section-head">Primary Execution</h3>
                        <div id="accelerate-primary-status" role="status" aria-live="polite" style="color:var(--sk-text-dim, #c6d1dc); font-size:13px; line-height:1.45;">
                            No request has run in this session. Confirm Run Inference to start.
                        </div>
                        <progress id="accelerate-inference-progress" max="100" value="0" aria-label="Inference request progress" style="width:100%; margin-top:8px;"></progress>
                        <span id="accelerate-progress-label">Not started</span>
                    </section>

                    <section class="sk-card" data-svd-vda-marker="queue-log-cancel">
                        <h3 class="sk-section-head">Queue, Log, Cancel</h3>
                        <div id="accelerate-queue-status" style="color:var(--sk-text-dim, #c6d1dc); font-size:13px; line-height:1.45;">
                            Read Job Status checks a returned execution record. Cancellation is unavailable for this backend.
                        </div>
                    </section>

                    <section class="sk-card" data-svd-vda-marker="no-capacity-recovery">
                        <h3 class="sk-section-head">No-Capacity Recovery</h3>
                        <div id="accelerate-recovery-status" style="color:var(--sk-text-dim, #c6d1dc); font-size:13px; line-height:1.45;">
                            Retry a valid model and input after a failure. Recover checks available backend telemetry.
                        </div>
                    </section>
                </div>

                <details class="accelerate-diagnostics" style="margin-top:14px;">
                    <summary>Diagnostics</summary>
                    <div style="max-height:220px; overflow:auto; overflow-wrap:anywhere;">
                        <p id="accelerate-model-status">Model catalog has not been checked in this session.</p>
                        <div id="accelerate-envelope-result" style="white-space:pre-wrap;"></div>
                        <ol id="accelerate-workflow-log" data-svd-vda-marker="receipts" style="padding-left:22px; color:var(--sk-text-dim, #c6d1dc); font-size:13px;">
                            <li class="sk-empty">No backend operations in this session.</li>
                        </ol>
                    </div>
                </details>
            </div>
        `;
        this.setupEventListeners();

        const modelStatus = contentElement.querySelector('#accelerate-model-status');
        const hardwareStatus = contentElement.querySelector('#accelerate-hardware-status');
        const primaryStatus = contentElement.querySelector('#accelerate-primary-status');
        const queueStatus = contentElement.querySelector('#accelerate-queue-status');
        const recoveryStatus = contentElement.querySelector('#accelerate-recovery-status');
        const inferenceProgress = contentElement.querySelector('#accelerate-inference-progress');
        const result = contentElement.querySelector('#accelerate-envelope-result');
        const log = contentElement.querySelector('#accelerate-workflow-log');

        const appendLog = (message) => {
            if (!log) return;
            const item = document.createElement('li');
            item.textContent = message;
            log.appendChild(item);
        };

        let catalogPromise;
        const controls = () => catalogPromise ||= fetch('/mcp/tools/bindings?app_id=accelerate-panel').then(async response => {
            if (!response.ok) throw new Error('The declared owner binding catalog is unavailable.');
            return (await response.json()).controls || [];
        }).catch(error => { catalogPromise = null; throw error; });
        const ownerResult = envelope => {
            if (envelope.ok !== true || envelope.outcome !== 'executed') throw new Error(envelope.error?.message || envelope.error || envelope.result?.error || 'Owner did not execute the request.');
            let value = envelope.result;
            for (let depth = 0; depth < 8 && value && typeof value === 'object'; depth++) {
                if (value.ok === false || value.success === false || value.isError === true || value.error) throw new Error(value.error?.message || value.error || 'Owner rejected the operation.');
                const blocks = value.content?.filter(item => item.type === 'json' && item.json && typeof item.json === 'object') || [];
                if (blocks.length > 1) throw new Error('Owner returned ambiguous operation data.');
                if (blocks.length === 1) value = blocks[0].json;
                else if (value.result && typeof value.result === 'object') value = value.result;
                else return value;
            }
            if (value == null) throw new Error('Owner returned no operation data.');
            return value;
        };
        const runOperation = async (operation, input, { trigger, statusEl } = {}) => {
            try {
                const bindingId = `accelerate-panel.ipfs_accelerate_py.${operations[operation]}`;
                const catalog = await controls();
                const control = catalog.find(item => item.binding_id === bindingId);
                if (!control) throw new Error(`The exact ${operation} binding is undeclared.`);
                const defaults = { ...(control.safe_payload || {}), ...(control.safe_payloads?.[operation] || {}) };
                const overlay = typeof input === 'function' ? input(defaults) : (input || {});
                const payload = { ...defaults, ...overlay };
                if (operation === 'run_inference_job') {
                    delete payload.dry_run;
                    delete payload.preview;
                    const typedText = [payload.input, payload.prompt, payload.text, payload.query].find(item => typeof item === 'string' && item.trim());
                    if (typedText) payload.input = typedText.trim();
                }
                const envelope = await invokeNativeTool(contentElement, 'accelerate-panel', bindingId, { ...(operation === 'run_inference_job' ? { executionMode: 'execute' } : {}), toolId: operation, payload, trigger });
                if (!envelope) {
                    if (statusEl) statusEl.textContent = 'Cancelled before owner dispatch.';
                    return null;
                }
                const value = ownerResult(envelope);
                const preview = value?.dry_run === true || value?.preview === true;
                const summary = `${operation} ${preview ? 'preview validated; no job or remote change was created' : envelope.outcome} via ${envelope.transport || 'declared transport'}; ${envelope.correlation_id}; receipt ${envelope.receipt?.receipt_id || 'unavailable'}`;
                if (result) { const pre = document.createElement('pre'); pre.textContent = JSON.stringify(envelope, null, 2); pre.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0'; result.replaceChildren(pre); }
                if (statusEl) {
                    const state = value?.state || value?.status || envelope.outcome;
                    statusEl.textContent = preview
                        ? `${operation} preview validated; no job or remote change was created.`
                        : `${operation} ${state}. See Diagnostics for the receipt and full response.`;
                }
                if (operation === 'run_inference_job') {
                    contentElement.querySelector('#accelerate-selected-model').textContent = `Actual requested model: ${payload.model || payload.model_id}`;
                }
                appendLog(summary);
                return { envelope, value, preview };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (statusEl) statusEl.textContent = `${operation} could not be invoked: ${message}`;
                appendLog(`${operation} invocation error: ${message}`);
                return null;
            }
        };

        const accelerateRunKey = 'accelerate-panel-run-record';
        const accelerateOutput = contentElement.querySelector('#accelerate-output');
        const accelerateRecord = contentElement.querySelector('#accelerate-run-record');
        const accelerateError = contentElement.querySelector('#accelerate-error-status');
        const accelerateProgressLabel = contentElement.querySelector('#accelerate-progress-label');
        const accelerateModelInput = contentElement.querySelector('#accelerate-model-id');
        const acceleratePromptInput = contentElement.querySelector('#accelerate-prompt');
        const readAccelerateOutput = value => {
            const visit = item => {
                if (typeof item === 'string' && item.trim()) return item.trim();
                if (Array.isArray(item)) {
                    for (const entry of item) {
                        const found = visit(entry);
                        if (found) return found;
                    }
                }
                if (item && typeof item === 'object') {
                    for (const key of ['output', 'output_text', 'text', 'generated_text', 'completion', 'content', 'response', 'message', 'choices', 'generated']) {
                        if (item[key] && item[key] !== item) {
                            const found = visit(item[key]);
                            if (found) return found;
                        }
                    }
                }
                return '';
            };
            return visit(value);
        };
        const showAccelerateRecord = saved => {
            if (!saved || typeof saved.output !== 'string' || !saved.output.trim()) return;
            if (accelerateModelInput && typeof saved.model === 'string') accelerateModelInput.value = saved.model;
            if (acceleratePromptInput && typeof saved.input === 'string') acceleratePromptInput.value = saved.input;
            if (accelerateOutput) accelerateOutput.textContent = saved.output;
            const selectedModel = contentElement.querySelector('#accelerate-selected-model');
            if (selectedModel && saved.model) selectedModel.textContent = `Saved model: ${saved.model}`;
            if (accelerateRecord) accelerateRecord.textContent = `Saved run model=${saved.model || 'owner default'}; state=${saved.state}; finished=${saved.finished}`

        };
        try { showAccelerateRecord(JSON.parse(sessionStorage.getItem(accelerateRunKey) || 'null')); } catch { /* no saved run */ }
        const launchAccelerate = contentElement.querySelector('[data-svd-workflow-action="launch-primary-execution"]');
        acceleratePromptInput?.addEventListener('keydown', event => {
            if (event.key !== 'Enter' || event.repeat) return;
            event.preventDefault();
            launchAccelerate?.click();
        });
        launchAccelerate?.addEventListener('click', async event => {
            const model = accelerateModelInput?.value.trim() || '';
            const typedInput = acceleratePromptInput?.value.trim() || '';
            if (!typedInput) {
                if (accelerateError) accelerateError.textContent = `Enter a short test input. Model ID kept: ${accelerateModelInput?.value || ''}`;
                if (inferenceProgress) inferenceProgress.value = 0;
                if (accelerateProgressLabel) accelerateProgressLabel.textContent = 'Not started';
                return;
            }
            if (inferenceProgress) inferenceProgress.removeAttribute('value');
            if (accelerateProgressLabel) accelerateProgressLabel.textContent = 'Running';
            const started = new Date().toISOString();
            const response = await runOperation('run_inference_job', defaults => {
                const patch = { fixture_scope: 'svf-accelerate-panel-run' };
                if (model) {
                    if (!defaults || Object.prototype.hasOwnProperty.call(defaults, 'model') || !Object.prototype.hasOwnProperty.call(defaults, 'model_id')) patch.model = model;
                    if (defaults && Object.prototype.hasOwnProperty.call(defaults, 'model_id')) patch.model_id = model;
                }
                const declaredTextKeys = ['input', 'prompt', 'text', 'query'].filter(key => defaults && typeof defaults[key] === 'string');
                for (const key of (declaredTextKeys.length ? declaredTextKeys : ['input'])) patch[key] = typedInput;
                return patch;
            }, { trigger: event.currentTarget, statusEl: primaryStatus });
            const ownerState = [response?.value?.state, response?.value?.status, response?.value?.queue_state].find(item => typeof item === 'string' && item.trim()) || '';
            const jobId = response?.preview ? null : response?.value?.job_id || response?.value?.task_id;
            const usableOutput = response?.preview ? '' : readAccelerateOutput(response?.value);
            if (jobId) {
                lastJobId = jobId;
                if (queueStatus) queueStatus.textContent = `Owner returned job ${jobId}${ownerState ? `; state ${ownerState}` : ''}. Use Read Job Status to observe its actual state.`;
            } else if (queueStatus && response) {
                queueStatus.textContent = response.preview ? 'Preview only; no job was created.' : 'No actual job ID was returned; no job completion or cancellation is claimed.';
            }
            if (!response || response.preview || !usableOutput) {
                if (inferenceProgress) inferenceProgress.value = 0;
                if (accelerateProgressLabel) accelerateProgressLabel.textContent = response?.preview ? 'Preview only' : 'Not started';
                if (accelerateOutput) accelerateOutput.textContent = response?.preview ? 'Preview only; this is not execution.' : 'Owner returned no usable output for this input.';
                if (accelerateError) accelerateError.textContent = !response
                    ? (primaryStatus?.textContent || 'Inference did not run.')
                    : (response.preview
                        ? 'Preview only; this is not execution.'
                        : 'Owner returned no usable output for this input.');
                return;
            }
            const saved = {
                model: response.value?.model_id || response.value?.model || model,
                input: typedInput, output: usableOutput, started: response.value?.started_at || response.value?.created_at || started,
                finished: response.value?.finished_at || response.value?.completed_at || new Date().toISOString(), state: ownerState || 'unnamed',
            };
            try { sessionStorage.setItem(accelerateRunKey, JSON.stringify(saved)); } catch { /* storage unavailable */ }
            showAccelerateRecord(saved);
            if (accelerateError) accelerateError.textContent = '';
            if (inferenceProgress) inferenceProgress.value = 100;
            if (accelerateProgressLabel) accelerateProgressLabel.textContent = 'completed';
        });
        contentElement.querySelector('[data-svd-workflow-action="inspect-model-artifacts"]')?.addEventListener('click', async event => {
            await runOperation('list_models', undefined, { trigger: event.currentTarget, statusEl: modelStatus });
        });
        contentElement.querySelector('[data-svd-workflow-action="refresh-hardware-fit"]')?.addEventListener('click', async event => {
            await runOperation('hardware_profile', undefined, { trigger: event.currentTarget, statusEl: hardwareStatus });
        });
        contentElement.querySelector('[data-svd-workflow-action="read-job-status"]')?.addEventListener('click', async event => {
            await runOperation('job_status', lastJobId ? { task_id: lastJobId } : undefined, { trigger: event.currentTarget, statusEl: queueStatus });
        });
        contentElement.querySelector('[data-svd-workflow-action="cancel-queued-job"]')?.addEventListener('click', () => {
            const message = 'Cancellation is unavailable: no reviewed cancellation operation exists. Nothing was cancelled.';
            if (queueStatus) queueStatus.textContent = message;
            appendLog(message);
        });
        contentElement.querySelector('[data-svd-workflow-action="recover-no-capacity"]')?.addEventListener('click', async event => {
            await runOperation('telemetry', undefined, { trigger: event.currentTarget, statusEl: recoveryStatus });
        });
    }

    async createAgentSupervisorApp(contentElement) {
        // Stand up the console's gateway transport: the MCP++ desktop
        // client's supervisor gateway (the production gateway for this
        // console, backed by the live MCP++ services) is published under
        // the global the console resolves first. Without this the console
        // can only render its designed no-gateway fallback snapshot. An
        // explicitly configured gateway or endpoint always wins.
        if (!window.agentSupervisorGateway
            && !window.swissknifeAgentSupervisorGateway
            && !window.__agentSupervisorGateway
            && !window.__AGENT_SUPERVISOR_GATEWAY_ENDPOINT__) {
            try {
                const clientModule = await import('./core/mcp-plus-plus-desktop-client.js');
                const client = clientModule.getMCPPlusPlusDesktopClient();
                window.agentSupervisorGateway = client.createSupervisorGateway();
            } catch (error) {
                console.warn('Agent Supervisor gateway unavailable; console stays in fallback mode.', error);
            }
        }
        const SupervisorModule = await import('./apps/agent-supervisor.js');
        if (typeof SupervisorModule.mountSwissKnifeApp === 'function') {
            return SupervisorModule.mountSwissKnifeApp(contentElement, { desktop: this });
        }
        const AgentSupervisorConsole = SupervisorModule.AgentSupervisorConsole || SupervisorModule.AgentSupervisorApp || SupervisorModule.default;
        const app = new AgentSupervisorConsole(this);
        await app.initialize();
        contentElement.innerHTML = await app.render();
        if (typeof app.setupEventListeners === 'function') {
            app.setupEventListeners(contentElement);
        } else if (typeof app.mount === 'function') {
            await app.mount(contentElement);
        }
        app.bind?.(contentElement);
        return app;
    }

    createPlaceholderApp(contentElement, componentName) {
        contentElement.innerHTML = `
            <div class="app-placeholder">
                <h2>🚀 ${componentName}</h2>
                <p>SwissKnife app loading...</p>
                <p>Component: ${componentName}</p>
                <button onclick="this.closest('.window').remove()">Close</button>
            </div>
        `;
        this.setupEventListeners();
    }

    createErrorApp(contentElement, componentName, error) {
        contentElement.innerHTML = `
            <div class="app-error">
                <h2>❌ App Load Error</h2>
                <p>Failed to load ${componentName}</p>
                <p>Error: ${error.message}</p>
                <button onclick="this.closest('.window').remove()">Close</button>
            </div>
        `;
        this.setupEventListeners();
    }
    
    setupWindowControls(windowElement) {
        const closeBtn = windowElement.querySelector('.window-control.close');
        const minimizeBtn = windowElement.querySelector('.window-control.minimize');
        const maximizeBtn = windowElement.querySelector('.window-control.maximize');
        const windowId = windowElement.id;
        const windowData = this.windows.get(windowId);
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                // Remove from tracking map if present
                this.windows.delete(windowElement.id);
                windowElement.remove();
                if (this.activeWindow === windowElement) {
                    this.activeWindow = null;
                }
                this.updateSystemStatus();
                this.updateTaskbar();
            });
        }
        
        if (minimizeBtn && windowData) {
            minimizeBtn.addEventListener('click', () => {
                windowElement.style.display = 'none';
                windowData.minimized = true;
                this.updateTaskbar();
            });
        }
        
        if (maximizeBtn && windowData) {
            maximizeBtn.addEventListener('click', () => {
                if (windowData.maximized) {
                    // Restore to original size and position
                    windowElement.style.left = windowData.preMaximizeState.x + 'px';
                    windowElement.style.top = windowData.preMaximizeState.y + 'px';
                    windowElement.style.width = windowData.preMaximizeState.width + 'px';
                    windowElement.style.height = windowData.preMaximizeState.height + 'px';
                    windowData.maximized = false;
                } else {
                    // Save current state before maximizing
                    windowData.preMaximizeState = {
                        x: parseInt(windowElement.style.left) || 0,
                        y: parseInt(windowElement.style.top) || 0,
                        width: parseInt(windowElement.style.width) || 800,
                        height: parseInt(windowElement.style.height) || 600
                    };
                    
                    // Maximize to fill desktop (leaving space for taskbar)
                    const desktop = document.getElementById('desktop');
                    const taskbar = document.getElementById('taskbar');
                    const taskbarHeight = taskbar ? taskbar.offsetHeight : 50;
                    
                    windowElement.style.left = '0px';
                    windowElement.style.top = '0px';
                    windowElement.style.width = desktop.clientWidth + 'px';
                    windowElement.style.height = (desktop.clientHeight - taskbarHeight) + 'px';
                    windowData.maximized = true;
                }
            });
        }
    }
    
    setupWindowDragging(windowElement) {
        const titlebar = windowElement.querySelector('.window-titlebar');
        if (!titlebar) return;
        
        let isDragging = false;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;
        
        titlebar.addEventListener('mousedown', (e) => {
            // Don't drag if clicking on window controls
            if (e.target.classList.contains('window-control')) return;
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(windowElement.style.left) || 0;
            startTop = parseInt(windowElement.style.top) || 0;
            
            e.preventDefault();
            
            const handleMouseMove = (e) => {
                if (!isDragging) return;
                
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                
                const newLeft = startLeft + deltaX;
                const newTop = Math.max(0, startTop + deltaY); // Prevent dragging above viewport
                
                windowElement.style.left = newLeft + 'px';
                windowElement.style.top = newTop + 'px';
            };
            
            const handleMouseUp = () => {
                isDragging = false;
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
        
        // Make titlebar cursor indicate it's draggable
        titlebar.style.cursor = 'move';
    }
    
    updateTaskbar() {
        const taskbarApps = document.getElementById('taskbar-apps');
        if (!taskbarApps) return;
        
        // Get all windows
        const windows = Array.from(this.windows.values());
        
        // Create taskbar icons for each window
        taskbarApps.innerHTML = windows.map(window => {
            const icon = window.element.querySelector('.window-icon')?.textContent || '📦';
            const title = window.title || 'Window';
            const isActive = this.activeWindow === window.element;
            
            return `
                <div class="taskbar-app ${isActive ? 'active' : ''}" 
                     data-window-id="${window.id}" 
                     title="${title}"
                     style="cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 0 12px;">
                    <span style="font-size: 18px;">${icon}</span>
                    <span style="font-size: 13px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${title}</span>
                </div>
            `;
        }).join('');
        
        // Add click handlers to taskbar icons
        const taskbarIcons = taskbarApps.querySelectorAll('.taskbar-app');
        taskbarIcons.forEach(icon => {
            icon.addEventListener('click', () => {
                const windowId = icon.dataset.windowId;
                const window = this.windows.get(windowId);
                if (window && window.element) {
                    this.focusWindow(window.element);
                    // If minimized, restore it
                    if (window.minimized) {
                        window.element.style.display = 'block';
                        window.minimized = false;
                    }
                }
            });
        });
    }

    // Focus/bring-to-front an existing window element
    focusWindow(windowElement) {
        if (!windowElement) return;
        // Update z-index to bring it to front
        windowElement.style.zIndex = String(++this.zIndexCounter);
        // Update active class bookkeeping
        if (this.activeWindow && this.activeWindow !== windowElement) {
            this.activeWindow.classList.remove('window-active');
        }
        windowElement.classList.add('window-active');
        this.activeWindow = windowElement;
        // Update taskbar to reflect active window
        this.updateTaskbar();
    }
    
    updateSystemTime() {
        const timeElement = document.getElementById('system-time');
        if (timeElement) {
            const now = new Date();
            timeElement.textContent = now.toLocaleTimeString();
        }
    }
    
    updateSystemStatus() {
        const statusElement = document.getElementById('system-status');
        if (statusElement) {
            statusElement.textContent = `Ready | Windows: ${this.windows.size}`;
        }
    }
    
    setupContextMenu() {
        // Simple context menu setup
        document.addEventListener('contextmenu', (e) => {
            if (e.target.id === 'desktop') {
                e.preventDefault();
                console.log('Desktop context menu');
            }
        });
    }
    
    setupWindowManagement() {
        // Basic window management setup
        console.log('Window management initialized');
    }
    
    startSystemMonitoring() {
        // Basic system monitoring
        console.log('System monitoring started');
    }
    
    // Add missing methods for HTML onclick handlers
    showDesktopProperties() {
        this.launchApp('settings');
    }
    
    openTerminalHere() {
        this.launchApp('terminal');
    }
    
    createNewFile() {
        console.log('Create new file requested');
    }
    
    createNewFolder() {
        console.log('Create new folder requested');
    }
    
    refreshDesktop() {
        location.reload();
    }
    
    showAbout() {
        // Show about dialog
        this.createWindow({
            title: 'About SwissKnife Web Desktop',
            icon: '🇨🇭',
            appId: 'about',
            width: 400,
            height: 300,
            x: 200,
            y: 200
        }).then(window => {
            const contentElement = document.getElementById(`${window.id}-content`);
            if (contentElement) {
                contentElement.innerHTML = `
                    <div style="padding: 20px; text-align: center;">
                        <h2>🇨🇭 SwissKnife Web Desktop</h2>
                        <p>Version 1.0.0</p>
                        <p>A modern AI-powered desktop environment for the browser</p>
                        <p>Built with Swiss precision 🏔️</p>
                        <p><strong>Total Apps:</strong> ${this.apps.size}</p>
                        <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
                    </div>
                `;
            }
        });
    }
}

function getToolSmokeEntry(appId) {
    return window.__SWISSKNIFE_TOOL_UI_SMOKE_CATALOG__?.[appId] || null;
}

function renderToolSmokePanel(container, entry) {
    if (!container || !entry) return;
    const serviceFamilies = entry.service_families?.length ? entry.service_families : ['unresolved-service'];
    const sampleTools = (entry.sample_tool_ids || []).slice(0, 3);
    const browserSafety = buildToolSmokeBrowserSafety(entry);
    container.innerHTML = `
        <section class="tool-smoke-panel" data-testid="tool-smoke-panel" data-app-id="${escapeHtml(entry.app_id)}" data-state="ready">
            <header class="tool-smoke-header">
                <div>
                    <div class="tool-smoke-kicker">MCP-backed capability smoke</div>
                    <h2>${escapeHtml(entry.title)}</h2>
                </div>
                <span class="tool-smoke-state" data-testid="tool-smoke-state">ready</span>
            </header>
            <div class="tool-smoke-grid" data-testid="tool-smoke-control-state">
                <div><span>Backend</span><strong>${serviceFamilies.map(escapeHtml).join(', ')}</strong></div>
                <div><span>App-visible</span><strong>${Number(entry.app_visible_tool_count || 0)}</strong></div>
                <div><span>Fallback/desktop</span><strong>${Number(entry.desktop_mobile_only_count || 0)}</strong></div>
                <div><span>Supervisor-only</span><strong>${Number(entry.supervisor_only_count || 0)}</strong></div>
            </div>
            <div class="tool-smoke-browser-safety" data-testid="tool-smoke-browser-safety">
                <span>Browser safe</span>
                <strong>${escapeHtml((entry.manifest_runtime_class || 'browser-safe'))} / ${escapeHtml((entry.manifest_lazy_import_kind || 'dynamic-import'))}</strong>
                <code>no node builtins</code>
                <code>no python wrappers</code>
                <code>no host subprocess</code>
                <code>simulator/fallback only</code>
            </div>
            <div class="tool-smoke-tools" data-testid="tool-smoke-tools">
                ${sampleTools.map(tool => `<code>${escapeHtml(tool)}</code>`).join('')}
            </div>
            <p>${escapeHtml(entry.rationale || '')}</p>
            <div class="tool-smoke-actions">
                <button type="button" data-smoke-state="success" data-testid="tool-smoke-success">Success</button>
                <button type="button" data-smoke-state="fallback" data-testid="tool-smoke-fallback">Fallback</button>
                <button type="button" data-smoke-state="error" data-testid="tool-smoke-error">Error</button>
            </div>
            <output class="tool-smoke-receipt" data-testid="tool-smoke-receipt">No receipt recorded.</output>
        </section>
    `;

    const panel = container.querySelector('.tool-smoke-panel');
    panel.dataset.browserSafe = String(browserSafety.browser_context);
    for (const button of Array.from(panel.querySelectorAll('[data-smoke-state]'))) {
        button.addEventListener('click', () => {
            const state = button.dataset.smokeState;
            const receipt = createToolSmokeReceipt(entry, state, browserSafety);
            window.__SWISSKNIFE_TOOL_UI_SMOKE_RECEIPTS__ = [
                ...(window.__SWISSKNIFE_TOOL_UI_SMOKE_RECEIPTS__ || []),
                receipt,
            ];
            panel.dataset.state = state;
            panel.querySelector('[data-testid="tool-smoke-state"]').textContent = state;
            const output = panel.querySelector('[data-testid="tool-smoke-receipt"]');
            output.value = `${state}: ${receipt.receipt_cid}`;
            output.textContent = output.value;
        });
    }
}

function buildToolSmokeBrowserSafety(entry) {
    return {
        ...(entry.browser_safety || {}),
        browser_context: true,
        node_builtins_required: false,
        python_wrappers_required: false,
        host_subprocess_required: false,
        physical_glasses_required: false,
        unavailable_native_adapters_required: false,
        bundled_runtime_classes: entry.browser_safety?.bundled_runtime_classes || [entry.manifest_runtime_class || 'browser-safe'],
        allowed_transports: entry.browser_safety?.allowed_transports || ['http', 'https', 'websocket', 'libp2p'],
        fallback_paths: entry.browser_safety?.fallback_paths || [
            'browser-fallback-ui',
            'desktop-mobile-confirmation',
            'simulator-only-glasses-handoff',
        ],
        proof: entry.browser_safety?.proof || [
            'Playwright Chromium page',
            'desktop icon launcher',
            'browser app manifest',
            'in-window tool smoke panel',
            'client-side receipt buffer',
        ],
    };
}

function createToolSmokeReceipt(entry, state, browserSafety = buildToolSmokeBrowserSafety(entry)) {
    const receiptBase = {
        app_id: entry.app_id,
        state,
        service_families: entry.service_families || [],
        sample_tool_ids: (entry.sample_tool_ids || []).slice(0, 3),
        browser_safety: browserSafety,
    };
    return {
        schema: 'swissknife.virtual-desktop-tool-ui-smoke-receipt.v1',
        ...receiptBase,
        at: new Date().toISOString(),
        receipt_cid: `sha256:${stableHash(JSON.stringify(receiptBase))}`,
        ui_path: ['desktop-icon', 'manifest-loader', 'browser-safe-gate', 'tool-smoke-panel', state],
    };
}

function stableHash(input) {
    let hashA = 0x811c9dc5;
    let hashB = 0x01000193;
    for (let index = 0; index < input.length; index += 1) {
        const code = input.charCodeAt(index);
        hashA ^= code;
        hashA = Math.imul(hashA, 0x01000193) >>> 0;
        hashB = (Math.imul(hashB ^ code, 0x85ebca6b) + 0xc2b2ae35) >>> 0;
    }
    return `${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function installToolSmokeStyles() {
    if (document.getElementById('tool-smoke-styles')) return;
    const style = document.createElement('style');
    style.id = 'tool-smoke-styles';
    style.textContent = `
        .tool-smoke-panel{margin:0;min-height:100%;box-sizing:border-box;border-top:1px solid #2f3945;padding:16px;color:#e5e7eb;font:13px system-ui;background:#151b22}
        .tool-smoke-header{display:flex;align-items:start;justify-content:space-between;gap:12px}
        .tool-smoke-kicker{font-size:11px;color:#8fb3ff;text-transform:uppercase}
        .tool-smoke-header h2{font-size:18px;margin:2px 0 0}
        .tool-smoke-state{border:1px solid #3f4d5f;padding:3px 8px;border-radius:999px;background:#202a35}
        .tool-smoke-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0}
        .tool-smoke-grid div{border:1px solid #303a45;padding:8px;background:#10161d}
        .tool-smoke-grid span{display:block;color:#9ca3af;font-size:11px}
        .tool-smoke-grid strong{display:block;margin-top:4px;overflow-wrap:anywhere}
        .tool-smoke-browser-safety{display:flex;gap:6px;flex-wrap:wrap;align-items:center;border:1px solid #2f4c3f;background:#0f1c17;padding:8px;margin:8px 0;color:#d9fbe5}
        .tool-smoke-browser-safety span{color:#8ee7aa;font-size:11px;text-transform:uppercase}
        .tool-smoke-browser-safety strong{margin-right:4px}
        .tool-smoke-browser-safety code{background:#10291b;border:1px solid #2f6f45;color:#d9fbe5;padding:2px 5px}
        .tool-smoke-tools{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
        .tool-smoke-tools code{background:#0b1117;border:1px solid #2f3945;padding:3px 5px;overflow-wrap:anywhere}
        .tool-smoke-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
        .tool-smoke-actions button{background:#26384f;color:#f8fafc;border:1px solid #45617f;padding:6px 10px;cursor:pointer}
        .tool-smoke-receipt{display:block;margin-top:10px;color:#bdd7ff;overflow-wrap:anywhere}
        .tool-smoke-panel[data-state="success"] .tool-smoke-state{border-color:#2f9e44;color:#b7f7c5}
        .tool-smoke-panel[data-state="fallback"] .tool-smoke-state{border-color:#b7791f;color:#ffe4a3}
        .tool-smoke-panel[data-state="error"] .tool-smoke-state{border-color:#d64545;color:#ffc0c0}
        .window-content{padding-bottom:56px;scroll-padding-bottom:64px}
        .window-app-content{min-height:0}
        .live-tool-gateway-host{border-top:1px solid #2f3945;scroll-margin-bottom:64px}
        .all-app-backend-status-panel{padding:12px;background:#10161d;color:#e5e7eb;font:13px system-ui;border-bottom:1px solid #2f3945}
        .all-app-backend-status-header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}
        .all-app-backend-status-header span{color:#bdd7ff;overflow-wrap:anywhere}
        .all-app-backend-status-grid{display:grid;gap:8px}
        .all-app-backend-status-row{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr) minmax(0,2fr);gap:10px;align-items:start;padding:8px;border:1px solid #2f3945;background:#151e27;min-width:0;max-width:100%;overflow-wrap:anywhere}
        .all-app-backend-status-family{display:flex;align-items:center;gap:8px;min-width:0}
        .all-app-backend-status-family span,.all-app-backend-status-facts span:first-child{display:inline-flex;align-items:center;min-height:22px;padding:2px 6px;border:1px solid #45617f;color:#bdd7ff}
        .all-app-backend-status-family strong,.all-app-backend-status-facts span,.all-app-backend-status-detail dd{overflow-wrap:anywhere}
        .all-app-backend-status-facts{display:grid;gap:4px;min-width:0}
        .all-app-backend-status-detail{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 10px;margin:0;min-width:0}
        .all-app-backend-status-detail div{min-width:0}
        .all-app-backend-status-detail dt{color:#9fb3c8;font-size:11px}
        .all-app-backend-status-detail dd{margin:0;color:#f8fafc}
        .live-tool-gateway-panel{padding:12px;background:#111820;color:#e5e7eb;font:13px system-ui}
        .live-tool-gateway-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
        .live-tool-gateway-controls{display:grid;gap:8px}
        .live-tool-gateway-control{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:8px;align-items:center;min-width:0}
        .live-tool-gateway-control button{width:100%;box-sizing:border-box;background:#26384f;color:#f8fafc;border:1px solid #45617f;padding:6px 10px;text-align:left;overflow-wrap:anywhere;cursor:pointer}
        .live-tool-gateway-control button:disabled{opacity:.6;cursor:not-allowed}
        .live-tool-gateway-control output{display:block;max-width:100%;min-width:0;color:#bdd7ff;overflow-wrap:anywhere;word-break:break-all;white-space:normal}
        @media (max-width:768px){
            .tool-smoke-header,.all-app-backend-status-header,.live-tool-gateway-header{align-items:flex-start;flex-direction:column}
            .tool-smoke-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
            .all-app-backend-status-row,.all-app-backend-status-detail,.live-tool-gateway-control{grid-template-columns:minmax(0,1fr)}
        }
    `;
    document.head.appendChild(style);
}

// Initialize when DOM is ready
function createSwissKnifeDesktop() {
    const desktop = new SwissKnifeDesktop();
    window.swissKnifeDesktop = desktop;
    window.__swissknifeDesktop = desktop;
    window.desktop = desktop;
    return desktop;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        createSwissKnifeDesktop();
    });
} else {
    createSwissKnifeDesktop();
}
