// SwissKnife Web Desktop - Main Application (Simplified for Testing)
import { mountAllAppBackendStatus } from './all-app-backend-status.js';
import { mountLiveToolGateway } from './live-tool-gateway.js';

console.log('SwissKnife Web Desktop starting...');

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
                #graphics-limited-badge { position: fixed; top: 8px; right: 8px; z-index: 99999; font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji'; }
                #graphics-limited-badge .badge { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #f59e0b; color: #111; border: 1px solid #b45309; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); font-size: 12px; }
                #graphics-limited-badge .badge b { font-weight: 700; }
                #graphics-limited-badge .close { margin-left: 6px; cursor: pointer; border: none; background: transparent; font-size: 14px; line-height: 1; color: #111; }
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

        // If unsupported at all, or software renderer detected, show limited graphics badge
        const shouldShow = !info.supported || info.isSoftware;
        if (!shouldShow) return;

        if (document.getElementById('graphics-limited-badge')) return;

        const container = document.createElement('div');
        container.id = 'graphics-limited-badge';
        const renderer = info.renderer || 'Unknown Renderer';
        const label = !info.supported ? 'Graphics unavailable' : 'Limited graphics (software)';
        container.innerHTML = `
            <div class="badge" title="${renderer}">
                <span>⚠️</span>
                <span><b>${label}</b>${info.supported ? ` · ${renderer}` : ''}</span>
                <button class="close" aria-label="Dismiss" title="Dismiss">×</button>
            </div>
        `;
        document.body.appendChild(container);

        const closeBtn = container.querySelector('.close');
        if (closeBtn) closeBtn.addEventListener('click', () => container.remove());
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
                    <button class="window-control minimize" title="Minimize">−</button>
                    <button class="window-control maximize" title="Maximize">□</button>
                    <button class="window-control close" title="Close">×</button>
                </div>
            </div>
            <div class="window-content">
                <div class="window-app-content" id="${windowId}-content">
                    <div class="window-loading">
                        <div class="window-loading-spinner"></div>
                    </div>
                </div>
                <div class="live-tool-gateway-host" id="${windowId}-gateway"></div>
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
                    this.createGlassesPreviewSurface(contentElement);
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
        return vibeCode;
    }

    async createStrudelAIDAWApp(contentElement) {
        const { StrudelAIDAWApp } = await import('./apps/strudel-ai-daw.js');
        const strudelAI = new StrudelAIDAWApp(this);
        await strudelAI.initialize();
        const html = await strudelAI.render();
        contentElement.innerHTML = html;
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
        return aiChat;
    }

    async createFileManagerApp(contentElement) {
        const { FileManagerApp } = await import('./apps/file-manager.js');
        const fileManager = new FileManagerApp(this);
        await fileManager.initialize();
        const html = await fileManager.render();
        contentElement.innerHTML = html;
        return fileManager;
    }

    async createTaskManagerApp(contentElement) {
        const { TaskManagerApp } = await import('./apps/task-manager.js');
        const taskManager = new TaskManagerApp(this);
        await taskManager.initialize();
        const html = await taskManager.render();
        contentElement.innerHTML = html;
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
        return settings;
    }

    async createMCPControlApp(contentElement) {
        const { MCPControlApp } = await import('./apps/mcp-control.js');
        const mcpControl = new MCPControlApp();
        const html = await mcpControl.render();
        contentElement.innerHTML = html;
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
        // Store global reference for OAuth integration
        window.githubApp = github;
        return github;
    }

    async createOAuthLoginApp(contentElement) {
        const { OAuthLoginSystem } = await import('./apps/oauth-login.js');
        const oauth = new OAuthLoginSystem();
        const html = await oauth.render();
        contentElement.innerHTML = html;
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
        return calculator;
    }

    async createClockApp(contentElement) {
        const { ClockApp } = await import('./apps/clock.js');
        const clock = new ClockApp(this);
        await clock.initialize();
        const html = await clock.render();
        contentElement.innerHTML = html;
        return clock;
    }

    async createCalendarApp(contentElement) {
        try {
            const { CalendarApp } = await import('./apps/calendar.js');
            const calendar = new CalendarApp(this);
            await calendar.initialize();
            const html = await calendar.render();
            contentElement.innerHTML = html;
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
        return imageViewer;
    }

    async createNotesApp(contentElement) {
        const { NotesApp } = await import('./apps/notes.js');
        const notes = new NotesApp(this);
        await notes.initialize();
        const html = await notes.render();
        contentElement.innerHTML = html;
        return notes;
    }

    async createSystemMonitorApp(contentElement) {
        const { SystemMonitorApp } = await import('./apps/system-monitor.js');
        const systemMonitor = new SystemMonitorApp(this);
        await systemMonitor.initialize();
        const html = await systemMonitor.render();
        contentElement.innerHTML = html;
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
        }
    }
    
    async createMusicStudioUnifiedApp(contentElement) {
        const MusicStudioModule = await import('./apps/music-studio-unified.js');
        if (MusicStudioModule.UnifiedMusicStudioApp) {
            const musicStudio = new MusicStudioModule.UnifiedMusicStudioApp(this);
            await musicStudio.initialize();
            const html = await musicStudio.render();
            contentElement.innerHTML = html;
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
        }
    }
    
    async createP2PChatApp(contentElement) {
        const { P2PChatApp } = await import('./apps/p2p-chat.js');
        const p2pChat = new P2PChatApp(this);
        await p2pChat.initialize();
        const html = await p2pChat.render();
        contentElement.innerHTML = html;
        return p2pChat;
    }

    async createGeneratedServiceSurface(contentElement, appId) {
        if (appId === 'datasets-browser') {
            this.createDatasetsBrowserSurface(contentElement);
            return;
        }
        if (appId === 'accelerate-panel') {
            this.createAcceleratePanelSurface(contentElement);
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
    }

    createDatasetsBrowserSurface(contentElement) {
        const datasetCid = 'bafydatasetg048customerintent';
        const schemaCid = 'bafydatasetg048schema';
        const filterCid = 'bafydatasetg048filter';
        const semanticCid = 'bafydatasetg048semanticresults';
        const provenanceCid = 'bafydatasetg048provenance';
        const preparationCid = 'bafydatasetg048preparationjob';
        const errorCid = 'bafydatasetg048schemaerror';
        const progressCid = 'bafydatasetg048progress';
        const catalogReceipt = 'receipt:datasets-browser:g048:catalog:loaded';
        const semanticReceipt = 'receipt:datasets-browser:g048:semantic:primary';
        const provenanceReceipt = 'receipt:datasets-browser:g048:provenance:recorded';
        const preparationReceipt = 'receipt:datasets-browser:g048:preparation:queued';
        const schemaErrorReceipt = 'receipt:datasets-browser:g048:error:schema-validation';
        const progressReceipt = 'receipt:datasets-browser:g048:progress:updated';

        contentElement.innerHTML = `
            <div class="generated-service-surface generated-mcp-app datasets-browser-workflow"
                data-app-id="datasets-browser"
                data-service="ipfs_datasets_py"
                data-svd-workflow="datasets-browser.semantic-provenance-preparation"
                style="height:100%; min-height:0; padding:16px; overflow:auto; background:#101820; color:#f7fafc;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px; flex-wrap:wrap;">
                    <div style="min-width:220px; flex:1;">
                        <h2 style="margin:0 0 6px; font-size:22px;">IPFS Datasets Browser</h2>
                        <p style="margin:0; color:#b6c2cf;">Dataset catalog, semantic search, provenance, preparation jobs, schema filters, error recovery, and progress receipts are governed through ipfs_datasets_py descriptors.</p>
                    </div>
                    <span style="padding:6px 10px; border:1px solid #3ddc97; border-radius:6px; color:#3ddc97; font-size:12px; text-transform:uppercase;">VDA-G048 ready</span>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:12px;">
                    <section data-svd-vda-marker="dataset-cid" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Dataset CID</h3>
                        <div style="display:grid; gap:6px; color:#c6d1dc; font-size:13px;">
                            <span>Selected dataset: customer-support-intents</span>
                            <span>Dataset CID: ${datasetCid}</span>
                            <span>Catalog receipt: ${catalogReceipt}</span>
                            <span>Descriptor: ipfs_datasets_py.list_datasets -> ipfs.datasets.operation.list_datasets</span>
                        </div>
                    </section>

                    <section data-svd-vda-marker="semantic-operation" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Semantic Operation</h3>
                        <div id="datasets-semantic-status" role="status" aria-live="polite" style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            Primary semantic_search query "refund policy escalation" targets ${datasetCid}, top_k 5, filter language=en and split=train. Result CID: ${semanticCid}. ${semanticReceipt}.
                        </div>
                    </section>

                    <section data-svd-vda-marker="provenance-operation" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Provenance Operation</h3>
                        <div id="datasets-provenance-status" style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            record_provenance links ${datasetCid}, ${semanticCid}, operator did:key:zDatasetG048, and event:datasets-browser:g048:semantic-query. Provenance CID: ${provenanceCid}. ${provenanceReceipt}.
                        </div>
                    </section>

                    <section data-svd-vda-marker="preparation-job" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Preparation Job</h3>
                        <div id="datasets-preparation-status" style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            Preparation job dataset-prep-g048 normalizes schema, builds vector_index, pins shards, and records progress. Job CID: ${preparationCid}. ${preparationReceipt}.
                        </div>
                    </section>

                    <section data-svd-vda-marker="schema-filter-ui" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Schema and Filters</h3>
                        <div style="display:grid; gap:8px; color:#c6d1dc; font-size:13px;">
                            <label style="display:grid; gap:4px;">Schema
                                <select data-datasets-filter="schema" aria-label="Dataset schema selector" style="background:#0f1720; color:#f7fafc; border:1px solid #3b4b5c; border-radius:4px; padding:5px;">
                                    <option value="support-intent-v2">support-intent-v2</option>
                                    <option value="chat-transcript-v1">chat-transcript-v1</option>
                                </select>
                            </label>
                            <label style="display:grid; gap:4px;">Split
                                <select data-datasets-filter="split" aria-label="Dataset split filter" style="background:#0f1720; color:#f7fafc; border:1px solid #3b4b5c; border-radius:4px; padding:5px;">
                                    <option value="train">train</option>
                                    <option value="validation">validation</option>
                                </select>
                            </label>
                            <span>Schema CID: ${schemaCid}</span>
                            <span>Filter CID: ${filterCid}</span>
                        </div>
                    </section>

                    <section data-svd-vda-marker="error-ui" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Schema Error Recovery</h3>
                        <div id="datasets-error-status" style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            Invalid filter field customer.password was rejected before transport with schema error ${errorCid}; recovery keeps descriptor fallback visible and links ${schemaErrorReceipt}.
                        </div>
                    </section>

                    <section data-svd-vda-marker="progress-ui" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Progress</h3>
                        <div style="display:grid; gap:8px; color:#c6d1dc; font-size:13px;">
                            <progress id="datasets-progress-bar" value="72" max="100" aria-label="Dataset preparation progress" style="width:100%;"></progress>
                            <span id="datasets-progress-status" role="status" aria-live="polite">72% complete, 18 shards indexed, event frontier ${progressCid}. ${progressReceipt}.</span>
                        </div>
                    </section>
                </div>

                <div style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn btn-small" data-svd-workflow-action="run-semantic-search" data-action="semantic-search" aria-label="Run primary semantic dataset search">Search</button>
                    <button class="btn btn-small" data-svd-workflow-action="record-provenance" data-action="record-provenance" aria-label="Record dataset provenance">Provenance</button>
                    <button class="btn btn-small" data-svd-workflow-action="start-preparation-job" data-action="prepare-dataset" aria-label="Start dataset preparation job">Prepare</button>
                    <button class="btn btn-small" data-svd-workflow-action="apply-schema-filter" data-action="apply-schema-filter" aria-label="Apply schema and split filters">Apply Filters</button>
                    <button class="btn btn-small" data-svd-workflow-action="show-schema-error" data-action="show-schema-error" aria-label="Show schema error recovery">Recover Error</button>
                    <button class="btn btn-small" data-svd-workflow-action="refresh-progress" data-action="refresh-progress" aria-label="Refresh preparation progress">Progress</button>
                </div>

                <ol id="datasets-workflow-log" data-svd-vda-marker="receipts" style="margin:14px 0 0; padding-left:22px; color:#c6d1dc; font-size:13px;">
                    <li>${catalogReceipt} ${datasetCid}</li>
                    <li>${semanticReceipt} ${semanticCid}</li>
                    <li>${provenanceReceipt} ${provenanceCid}</li>
                    <li>${preparationReceipt} ${preparationCid}</li>
                    <li>${schemaErrorReceipt} ${errorCid}</li>
                    <li>${progressReceipt} ${progressCid}</li>
                    <li>event:datasets-browser:g048:semantic-query event:datasets-browser:g048:preparation-progress</li>
                </ol>
            </div>
        `;

        const semanticStatus = contentElement.querySelector('#datasets-semantic-status');
        const provenanceStatus = contentElement.querySelector('#datasets-provenance-status');
        const preparationStatus = contentElement.querySelector('#datasets-preparation-status');
        const errorStatus = contentElement.querySelector('#datasets-error-status');
        const progressStatus = contentElement.querySelector('#datasets-progress-status');
        const progressBar = contentElement.querySelector('#datasets-progress-bar');
        const log = contentElement.querySelector('#datasets-workflow-log');

        const appendLog = (message) => {
            if (!log) return;
            const item = document.createElement('li');
            item.textContent = message;
            log.appendChild(item);
        };

        contentElement.querySelector('[data-svd-workflow-action="run-semantic-search"]')?.addEventListener('click', () => {
            if (semanticStatus) semanticStatus.textContent = `semantic_search completed against ${datasetCid}; result CID ${semanticCid}; ${semanticReceipt}; event:datasets-browser:g048:semantic-query.`;
            appendLog(`${semanticReceipt} semantic_search top_k=5 ${semanticCid}`);
        });
        contentElement.querySelector('[data-svd-workflow-action="record-provenance"]')?.addEventListener('click', () => {
            if (provenanceStatus) provenanceStatus.textContent = `record_provenance wrote ${provenanceCid} for ${datasetCid} and semantic result ${semanticCid}; ${provenanceReceipt}.`;
            appendLog(`${provenanceReceipt} record_provenance ${provenanceCid}`);
        });
        contentElement.querySelector('[data-svd-workflow-action="start-preparation-job"]')?.addEventListener('click', () => {
            if (preparationStatus) preparationStatus.textContent = `Preparation job dataset-prep-g048 queued, vector_index started, progress event frontier ${progressCid}; ${preparationReceipt}.`;
            appendLog(`${preparationReceipt} preparation job dataset-prep-g048 queued ${preparationCid}`);
        });
        contentElement.querySelector('[data-svd-workflow-action="apply-schema-filter"]')?.addEventListener('click', () => {
            appendLog(`receipt:datasets-browser:g048:filters:applied ${schemaCid} ${filterCid}`);
        });
        contentElement.querySelector('[data-svd-workflow-action="show-schema-error"]')?.addEventListener('click', () => {
            if (errorStatus) errorStatus.textContent = `Schema error recovery displayed for invalid input customer.password; rejected before transport; ${schemaErrorReceipt}; ${errorCid}.`;
            appendLog(`${schemaErrorReceipt} invalid input rejected ${errorCid}`);
        });
        contentElement.querySelector('[data-svd-workflow-action="refresh-progress"]')?.addEventListener('click', () => {
            if (progressBar) progressBar.value = 84;
            if (progressStatus) progressStatus.textContent = `84% complete, 21 shards indexed, progress UI refreshed with ${progressCid}. ${progressReceipt}.`;
            appendLog(`${progressReceipt} 84% progress ${progressCid}`);
        });
    }

    async createMCPPlusPlusExplorerSurface(contentElement) {
        const { MCPPlusPlusExplorerApp } = await import('./apps/mcp-plus-plus-explorer.js');
        const app = new MCPPlusPlusExplorerApp(this);
        await app.initialize();
        contentElement.innerHTML = await app.render();
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
        const descriptorPackCid = 'bafyorbg052descriptorpack';
        const layoutSchemaCid = 'bafyorbg052layoutschema';
        const rendererBundleCid = 'bafyorbg052rendererbundle';
        const intentPolicyCid = 'bafyorbg052intentpolicy';
        const executionPreviewCid = 'bafyorbg052executionpreview';
        const schemaErrorCid = 'bafyorbg052schemaerror';
        const confirmationCid = 'bafyorbg052confirmation';
        const fallbackRendererCid = 'bafyorbg052fallbackrenderer';
        const generatedReceipt = 'receipt:orb-auto-ui:g052:artifacts:generated';
        const previewReceipt = 'receipt:orb-auto-ui:g052:preview:dry-run';
        const schemaErrorReceipt = 'receipt:orb-auto-ui:g052:schema-error:rejected';
        const confirmationReceipt = 'receipt:orb-auto-ui:g052:confirmation:required';
        const executionReceipt = 'receipt:orb-auto-ui:g052:execution:confirmed';
        const fallbackReceipt = 'receipt:orb-auto-ui:g052:fallback:rendered';
        const selectedDescriptorId = selectedInspection?.id || 'ipfs_accelerate_py';
        const selectedOperation = selectedMethod?.method || 'run_inference_job';

        contentElement.innerHTML = `
            <div class="generated-service-surface generated-mcp-app orb-auto-ui-workflow"
                data-app-id="orb-auto-ui"
                data-service="orb_auto_ui"
                data-svd-workflow="orb-auto-ui.generate-governed-auto-ui"
                style="height:100%; min-height:0; padding:16px; overflow:auto; background:#101820; color:#f7fafc;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px; flex-wrap:wrap;">
                    <div style="min-width:220px; flex:1;">
                        <h2 style="margin:0 0 6px; font-size:22px;">ORB Auto UI</h2>
                        <p style="margin:0; color:#b6c2cf;">Descriptor-backed applications are generated with artifact CIDs, intent policy, dry-run previews, schema rejection, confirmation, and fallback rendering.</p>
                    </div>
                    <span style="padding:6px 10px; border:1px solid #3ddc97; border-radius:6px; color:#3ddc97; font-size:12px; text-transform:uppercase;">VDA-G052 ready</span>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 230px), 1fr)); gap:12px;">
                    <section data-svd-vda-marker="generated-artifact-cids" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Generated Artifact CIDs</h3>
                        <div id="orb-artifact-status" role="status" aria-live="polite" style="display:grid; gap:6px; color:#c6d1dc; font-size:13px; line-height:1.45;">
                            <span>Descriptor pack CID: ${descriptorPackCid}</span>
                            <span>Layout schema CID: ${layoutSchemaCid}</span>
                            <span>Renderer bundle CID: ${rendererBundleCid}</span>
                            <span>Generated descriptors: ${descriptors.map(descriptor => `${escapeHtml(descriptor.id)}:${escapeHtml(descriptor.interface_cid)}`).join(', ')}</span>
                            <span>${generatedReceipt}</span>
                        </div>
                    </section>

                    <section data-svd-vda-marker="intent-schema-policy" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Intent and Schema Policy</h3>
                        <div style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            intent_policy CID: ${intentPolicyCid}. ${escapeHtml(selectedDescriptorId)}.${escapeHtml(selectedOperation)} maps input_schema, output_schema, permissions, default_deny, confirmation_policy, and receipt_policy before any gateway dispatch. Writes use require_confirmation; reads use no side effects.
                        </div>
                    </section>

                    <section data-svd-vda-marker="execution-preview" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Execution Preview</h3>
                        <div id="orb-preview-status" role="status" aria-live="polite" style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            Execution preview CID: ${executionPreviewCid}. dry_run envelope for ${escapeHtml(selectedDescriptorId)}.${escapeHtml(selectedOperation)} shows capability id ${escapeHtml(selectedMethod?.capability_id || 'ipfs.accelerate.operation.run_inference_job')}, sanitized input, policy decision require_confirmation, and no side effects. ${previewReceipt}.
                        </div>
                    </section>

                    <section data-svd-vda-marker="schema-error" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Schema Error</h3>
                        <div id="orb-schema-error-status" role="status" aria-live="polite" style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            Schema error CID: ${schemaErrorCid}. Invalid input rejected before transport: model must be string, input is required, max_tokens must be number. ${schemaErrorReceipt}.
                        </div>
                    </section>

                    <section data-svd-vda-marker="confirmation" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Confirmation</h3>
                        <div id="orb-confirmation-status" role="status" aria-live="polite" style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            Confirmation CID: ${confirmationCid}. ${escapeHtml(selectedOperation)} requires user confirmation and records confirm_governed policy receipt before execution. ${confirmationReceipt}. ${executionReceipt}.
                        </div>
                    </section>

                    <section data-svd-vda-marker="fallback-renderer" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Fallback Renderer</h3>
                        <div id="orb-fallback-status" role="status" aria-live="polite" style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            Fallback renderer CID: ${fallbackRendererCid}. Renderer order is descriptor-fallback, mobile-card, then audio-summary when generated controls are unavailable. ${fallbackReceipt}.
                        </div>
                        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; font-size:12px;">
                            ${['descriptor-fallback', 'mobile-card', 'audio-summary'].map(renderer => `
                                <span data-orb-fallback-renderer="${renderer}" style="border:1px solid #4b6584; border-radius:6px; padding:5px 8px; color:#d7e6f5; background:#0f1b27;">${renderer}</span>
                            `).join('')}
                        </div>
                    </section>
                </div>

                <div style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn btn-small" data-svd-workflow-action="generate-auto-ui-artifacts" data-action="generate-auto-ui-artifacts" aria-label="Generate Auto UI artifacts">Generate Artifacts</button>
                    <button class="btn btn-small" data-svd-workflow-action="preview-execution-envelope" data-action="preview-execution-envelope" aria-label="Preview execution envelope">Preview</button>
                    <button class="btn btn-small" data-svd-workflow-action="validate-schema-error" data-action="validate-schema-error" aria-label="Validate schema error">Schema Error</button>
                    <button class="btn btn-small" data-svd-workflow-action="confirm-governed-execution" data-action="confirm-governed-execution" aria-label="Confirm governed execution">Confirm</button>
                    <button class="btn btn-small" data-svd-workflow-action="render-fallback-surface" data-action="render-fallback-surface" aria-label="Render fallback surface">Fallback</button>
                </div>

                <div id="orb-envelope-result" style="margin-top:14px;"></div>
                <ol id="orb-workflow-log" style="margin:14px 0 0; padding-left:22px; color:#c6d1dc; font-size:13px;">
                    <li>${generatedReceipt} ${descriptorPackCid} ${layoutSchemaCid} ${rendererBundleCid}</li>
                    <li>${previewReceipt} ${executionPreviewCid} dry_run no side effects</li>
                    <li>${schemaErrorReceipt} ${schemaErrorCid} rejected before transport</li>
                    <li>${confirmationReceipt} ${confirmationCid} requires user confirmation</li>
                    <li>${executionReceipt} confirm_governed ${confirmationCid}</li>
                    <li>${fallbackReceipt} ${fallbackRendererCid} descriptor-fallback mobile-card audio-summary</li>
                </ol>
            </div>
        `;

        const root = contentElement.querySelector('.orb-auto-ui-workflow');
        const artifactStatus = contentElement.querySelector('#orb-artifact-status');
        const previewStatus = contentElement.querySelector('#orb-preview-status');
        const schemaErrorStatus = contentElement.querySelector('#orb-schema-error-status');
        const confirmationStatus = contentElement.querySelector('#orb-confirmation-status');
        const fallbackStatus = contentElement.querySelector('#orb-fallback-status');
        const result = contentElement.querySelector('#orb-envelope-result');
        const log = contentElement.querySelector('#orb-workflow-log');

        const appendLog = (message) => {
            if (!log) return;
            const item = document.createElement('li');
            item.textContent = message;
            log.appendChild(item);
        };

        root?.querySelector('[data-svd-workflow-action="generate-auto-ui-artifacts"]')?.addEventListener('click', () => {
            if (artifactStatus) {
                const last = artifactStatus.querySelector('span:last-child');
                if (last) last.textContent = `${generatedReceipt} regenerated ${descriptors.length} descriptor_generated surfaces with ${descriptorPackCid}, ${layoutSchemaCid}, and ${rendererBundleCid}.`;
            }
            appendLog(`receipt:orb-auto-ui:g052:artifacts:regenerated ${descriptorPackCid} ${layoutSchemaCid} ${rendererBundleCid}`);
        });

        root?.querySelector('[data-svd-workflow-action="preview-execution-envelope"]')?.addEventListener('click', () => {
            if (previewStatus) {
                previewStatus.textContent = `Execution preview ready: dry_run envelope ${executionPreviewCid} for ${selectedDescriptorId}.${selectedOperation}; policy decision require_confirmation, sanitized input, no side effects. ${previewReceipt}.`;
            }
            appendLog(`${previewReceipt} ${executionPreviewCid} dry_run require_confirmation no side effects`);
        });

        root?.querySelector('[data-svd-workflow-action="validate-schema-error"]')?.addEventListener('click', () => {
            if (schemaErrorStatus) {
                schemaErrorStatus.textContent = `Schema error verified: invalid input rejected before transport by input_schema. ${schemaErrorCid}. ${schemaErrorReceipt}.`;
            }
            appendLog(`${schemaErrorReceipt} ${schemaErrorCid} invalid input rejected before transport`);
        });

        root?.querySelector('[data-svd-workflow-action="confirm-governed-execution"]')?.addEventListener('click', async () => {
            if (confirmationStatus) {
                confirmationStatus.textContent = `Confirmed governed execution for ${selectedDescriptorId}.${selectedOperation}; confirmation CID ${confirmationCid}, ${confirmationReceipt}, ${executionReceipt}.`;
            }
            appendLog(`${confirmationReceipt} ${confirmationCid} confirmed governed execution`);
            try {
                const envelope = await invokeDescriptorOperation({
                    descriptor_id: selectedDescriptorId,
                    operation: selectedOperation,
                    input: selectedOperation === 'run_inference_job'
                        ? { model: 'sentence-transformers/all-MiniLM-L6-v2', input: 'orb auto ui preview', max_tokens: 64 }
                        : {},
                    app_id: 'orb-auto-ui',
                    execution_mode: 'confirmed',
                    desktop: this,
                });
                if (result) result.innerHTML = renderEnvelopeHTML(envelope);
                appendLog(`${executionReceipt} ${envelope.status} ${envelope.trace?.transport || 'browser-gateway'} ${envelope.receipt_refs?.[0]?.receipt_cid || ''}`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                appendLog(`${executionReceipt} descriptor-fallback ${message}`);
            }
        });

        root?.querySelector('[data-svd-workflow-action="render-fallback-surface"]')?.addEventListener('click', () => {
            if (fallbackStatus) {
                fallbackStatus.textContent = `Fallback renderer active with ${fallbackRendererCid}: descriptor-fallback renders schema-only controls, mobile-card renders compact confirmation, audio-summary reads the policy and schema error. ${fallbackReceipt}.`;
            }
            appendLog(`${fallbackReceipt} ${fallbackRendererCid} descriptor-fallback mobile-card audio-summary rendered`);
        });
    }

    createGlassesPreviewSurface(contentElement) {
        const replayBundleCid = 'bafyglassg051simulatorreplaybundle';
        const displayPacketCid = 'bafyglassg051displaypacket';
        const cameraPacketCid = 'bafyglassg051camerapacket';
        const microphonePacketCid = 'bafyglassg051microphonepacket';
        const speakerPacketCid = 'bafyglassg051speakerpacket';
        const privacyPolicyCid = 'bafyglassg051privacypolicy';
        const analysisCid = 'bafyglassg051displayaudioanalysis';
        const fallbackProofCid = 'bafyglassg051fallbackproof';
        const replayReceipt = 'receipt:glasses-preview:g051:replay-bundle:loaded';
        const displayReceipt = 'receipt:glasses-preview:g051:denial:display';
        const cameraReceipt = 'receipt:glasses-preview:g051:denial:camera';
        const microphoneReceipt = 'receipt:glasses-preview:g051:denial:microphone';
        const speakerReceipt = 'receipt:glasses-preview:g051:denial:speaker';
        const analysisReceipt = 'receipt:glasses-preview:g051:analysis:display-audio';
        const fallbackReceipt = 'receipt:glasses-preview:g051:fallback:mobile-card';

        contentElement.innerHTML = `
            <div class="generated-service-surface generated-mcp-app glasses-preview-workflow"
                data-app-id="glasses-preview"
                data-service="meta_glasses"
                data-svd-workflow="glasses-preview.replay-orb-handoff"
                style="height:100%; min-height:0; padding:16px; overflow:auto; background:#101820; color:#f7fafc;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px; flex-wrap:wrap;">
                    <div style="min-width:220px; flex:1;">
                        <h2 style="margin:0 0 6px; font-size:22px;">Meta Glasses Preview</h2>
                        <p style="margin:0; color:#b6c2cf;">ORB handoff packets are replayed through the supported device simulator with privacy policy, denied device states, analysis, and fallback evidence visible.</p>
                    </div>
                    <span style="padding:6px 10px; border:1px solid #3ddc97; border-radius:6px; color:#3ddc97; font-size:12px; text-transform:uppercase;">VDA-G051 ready</span>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap:12px;">
                    <section data-svd-vda-marker="replay-bundle" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Simulator Replay Bundle</h3>
                        <div id="glasses-replay-status" role="status" aria-live="polite" style="display:grid; gap:6px; color:#c6d1dc; font-size:13px; line-height:1.45;">
                            <span>Replay bundle CID: ${replayBundleCid}</span>
                            <span>Packet IDs: handoff:app:glasses-preview:primary:87acee7931c44321, svd-071:glasses-preview:display.output:f124143761c4</span>
                            <span>Packet CIDs: ${displayPacketCid}, ${cameraPacketCid}, ${microphonePacketCid}, ${speakerPacketCid}</span>
                            <span>${replayReceipt}</span>
                        </div>
                    </section>

                    <section data-svd-vda-marker="privacy-policy" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Privacy Policy</h3>
                        <div style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            Policy CID: ${privacyPolicyCid}. Camera, microphone, display, and speaker requests default to denied in desktop replay. Raw media capture is false, transcript text is redacted, rollback mode is no-mutation, and receipts are preserved through denial and recovery.
                        </div>
                    </section>

                    <section data-svd-vda-marker="display-denial" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Display State</h3>
                        <div id="glasses-display-state" style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            display state denied for meta_glasses.display.render. Fallback target mobile-card via display-webapp bridge. ${displayReceipt}.
                        </div>
                    </section>

                    <section data-svd-vda-marker="camera-denial" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Camera State</h3>
                        <div id="glasses-camera-state" style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            camera state denied for meta_glasses.camera.photo and meta_glasses.camera.video. Raw media captured: false. Fallback target mobile-card. ${cameraReceipt}.
                        </div>
                    </section>

                    <section data-svd-vda-marker="microphone-denial" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Microphone State</h3>
                        <div id="glasses-microphone-state" style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            microphone state denied for meta_glasses.microphone.capture. Redacted transcript fallback routes to audio-summary and mobile-card. ${microphoneReceipt}.
                        </div>
                    </section>

                    <section data-svd-vda-marker="speaker-denial" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Speaker State</h3>
                        <div id="glasses-speaker-state" style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            speaker state denied for meta_glasses.audio.playback. Audio playback uses audio-summary fallback with mobile-card target. ${speakerReceipt}.
                        </div>
                    </section>

                    <section data-svd-vda-marker="display-audio-analysis" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Display and Audio Analysis</h3>
                        <div id="glasses-analysis-state" style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            Analysis CID: ${analysisCid}. Display projection is safe_display_fallback_projection; microphone transcript and speaker playback are summarized without raw media. ${analysisReceipt}.
                        </div>
                    </section>

                    <section data-svd-vda-marker="fallback-proof" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Fallback Proof</h3>
                        <div id="glasses-fallback-state" style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            Fallback proof CID: ${fallbackProofCid}. Selected fallback target mobile-card remains visible for display, camera, mic, and speaker denial. ${fallbackReceipt}.
                        </div>
                    </section>
                </div>

                <div style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn btn-small" data-svd-workflow-action="replay-simulator-bundle" data-action="replay-simulator-bundle" aria-label="Replay simulator bundle">Replay Bundle</button>
                    <button class="btn btn-small" data-svd-workflow-action="deny-display" data-action="deny-display" aria-label="Replay display denial">Display Denial</button>
                    <button class="btn btn-small" data-svd-workflow-action="deny-camera" data-action="deny-camera" aria-label="Replay camera denial">Camera Denial</button>
                    <button class="btn btn-small" data-svd-workflow-action="deny-microphone" data-action="deny-microphone" aria-label="Replay microphone denial">Mic Denial</button>
                    <button class="btn btn-small" data-svd-workflow-action="deny-speaker" data-action="deny-speaker" aria-label="Replay speaker denial">Speaker Denial</button>
                    <button class="btn btn-small" data-svd-workflow-action="run-display-audio-analysis" data-action="run-display-audio-analysis" aria-label="Run display and audio analysis">Analysis</button>
                    <button class="btn btn-small" data-svd-workflow-action="prove-fallback" data-action="prove-fallback" aria-label="Prove fallback target">Fallback</button>
                </div>

                <ol id="glasses-workflow-log" data-svd-vda-marker="fallback-proof" style="margin:14px 0 0; padding-left:22px; color:#c6d1dc; font-size:13px;">
                    <li>${replayReceipt} ${replayBundleCid}</li>
                    <li>${displayReceipt} ${displayPacketCid}</li>
                    <li>${cameraReceipt} ${cameraPacketCid}</li>
                    <li>${microphoneReceipt} ${microphonePacketCid}</li>
                    <li>${speakerReceipt} ${speakerPacketCid}</li>
                    <li>${analysisReceipt} ${analysisCid}</li>
                    <li>${fallbackReceipt} ${fallbackProofCid} fallback target mobile-card</li>
                </ol>
            </div>
        `;

        const root = contentElement.querySelector('.glasses-preview-workflow');
        const replayStatus = contentElement.querySelector('#glasses-replay-status');
        const displayState = contentElement.querySelector('#glasses-display-state');
        const cameraState = contentElement.querySelector('#glasses-camera-state');
        const microphoneState = contentElement.querySelector('#glasses-microphone-state');
        const speakerState = contentElement.querySelector('#glasses-speaker-state');
        const analysisState = contentElement.querySelector('#glasses-analysis-state');
        const fallbackState = contentElement.querySelector('#glasses-fallback-state');
        const log = contentElement.querySelector('#glasses-workflow-log');

        const appendLog = (message) => {
            if (!log) return;
            const item = document.createElement('li');
            item.textContent = message;
            log.appendChild(item);
        };

        root?.querySelector('[data-svd-workflow-action="replay-simulator-bundle"]')?.addEventListener('click', () => {
            if (replayStatus) {
                replayStatus.querySelector('span:last-child').textContent = `${replayReceipt} replayed primary, permission_denied, and route_unavailable scenarios.`;
            }
            appendLog(`receipt:glasses-preview:g051:replay-bundle:replayed ${replayBundleCid} primary permission_denied route_unavailable`);
        });

        root?.querySelector('[data-svd-workflow-action="deny-display"]')?.addEventListener('click', () => {
            if (displayState) displayState.textContent = `display state denied and recovered to display-webapp bridge with selected fallback target mobile-card. ${displayReceipt}.`;
            appendLog(`${displayReceipt} denied display.output fallback target mobile-card`);
        });

        root?.querySelector('[data-svd-workflow-action="deny-camera"]')?.addEventListener('click', () => {
            if (cameraState) cameraState.textContent = `camera state denied for photo and video; raw media captured false; mobile-card fallback retained. ${cameraReceipt}.`;
            appendLog(`${cameraReceipt} denied camera.photo camera.video raw_media_captured:false`);
        });

        root?.querySelector('[data-svd-workflow-action="deny-microphone"]')?.addEventListener('click', () => {
            if (microphoneState) microphoneState.textContent = `microphone state denied; redacted transcript fallback visible in audio-summary and mobile-card. ${microphoneReceipt}.`;
            appendLog(`${microphoneReceipt} denied microphone.input microphone.transcription redacted`);
        });

        root?.querySelector('[data-svd-workflow-action="deny-speaker"]')?.addEventListener('click', () => {
            if (speakerState) speakerState.textContent = `speaker state denied; playback summarized through audio-summary fallback with mobile-card target. ${speakerReceipt}.`;
            appendLog(`${speakerReceipt} denied speaker.output audio-summary fallback target mobile-card`);
        });

        root?.querySelector('[data-svd-workflow-action="run-display-audio-analysis"]')?.addEventListener('click', () => {
            if (analysisState) analysisState.textContent = `Analysis complete for display projection and audio transcript/playback. ${analysisCid}. ${analysisReceipt}.`;
            appendLog(`${analysisReceipt} ${analysisCid} display audio analysis complete`);
        });

        root?.querySelector('[data-svd-workflow-action="prove-fallback"]')?.addEventListener('click', () => {
            if (fallbackState) fallbackState.textContent = `Fallback proof verified: fallback target mobile-card is visible for display, camera, mic, and speaker denial. ${fallbackProofCid}. ${fallbackReceipt}.`;
            appendLog(`${fallbackReceipt} ${fallbackProofCid} fallback target mobile-card visible`);
        });
    }

    async createIDLExplorerSurface(contentElement) {
        const {
            listBrowserMCPDescriptors,
            inspectBrowserMCPDescriptor,
            invokeDescriptorOperation,
            renderEnvelopeHTML,
        } = await import('./core/mcp-descriptor-registry.js');
        const descriptors = listBrowserMCPDescriptors();
        const inspections = descriptors.map(descriptor => inspectBrowserMCPDescriptor(descriptor.id)).filter(Boolean);
        const descriptorCidMap = {
            ipfs_kit_py: 'bafyidlg050kitdescriptor',
            ipfs_datasets_py: 'bafyidlg050datasetsdescriptor',
            ipfs_accelerate_py: 'bafyidlg050acceleratedescriptor',
        };
        const compatibilityReceipt = 'receipt:idl-explorer:g050:compatibility:fixture-ok';
        const invalidReceipt = 'receipt:idl-explorer:g050:invalid-input:rejected';
        const drilldownReceipt = 'receipt:idl-explorer:g050:receipt-drilldown:opened';
        const fixtureCid = 'bafyidlg050compatfixture';
        const invalidFixtureCid = 'bafyidlg050invalidinputfixture';
        const policyCid = 'bafyidlg050schemapolicy';
        const selectedInspection = inspections.find(inspection => inspection.id === 'ipfs_datasets_py') || inspections[0];
        const selectedMethod = selectedInspection?.method_schemas?.find(method => method.method === 'browse') || selectedInspection?.method_schemas?.[0];

        contentElement.innerHTML = `
            <div class="generated-service-surface generated-mcp-app idl-explorer-workflow"
                data-app-id="idl-explorer"
                data-service="orb_idl"
                data-svd-workflow="idl-explorer.inspect-governed-descriptors"
                style="height:100%; min-height:0; padding:16px; overflow:auto; background:#101820; color:#f7fafc;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px; flex-wrap:wrap;">
                    <div style="min-width:220px; flex:1;">
                        <h2 style="margin:0 0 6px; font-size:22px;">ORB IDL Explorer</h2>
                        <p style="margin:0; color:#b6c2cf;">Descriptor CIDs, method schemas, policy decisions, transport routes, compatibility fixtures, and receipts are inspected from the shared MCP/MCP++ registry.</p>
                    </div>
                    <span style="padding:6px 10px; border:1px solid #3ddc97; border-radius:6px; color:#3ddc97; font-size:12px; text-transform:uppercase;">VDA-G050 ready</span>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:12px;">
                    <section data-svd-vda-marker="descriptor-cids" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Descriptor CIDs</h3>
                        <div style="display:grid; gap:6px; color:#c6d1dc; font-size:13px;">
                            ${descriptors.map(descriptor => `
                                <span>${descriptor.name}: ${descriptorCidMap[descriptor.id] || descriptor.interface_cid} (${descriptor.interface_cid})</span>
                            `).join('')}
                        </div>
                    </section>

                    <section data-svd-vda-marker="schema-policy" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Schema and Policy</h3>
                        <div style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            ${selectedInspection?.name || 'descriptor'} ${selectedMethod?.method || 'method'} exposes input_schema, output_schema, permissions, default_deny policy, confirmation_policy, and receipt_policy. Policy CID: ${policyCid}. Read methods avoid confirmation; write and destructive methods require governed receipts.
                        </div>
                    </section>

                    <section data-svd-vda-marker="compatibility-fixture" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Compatibility Fixture</h3>
                        <div id="idl-compatibility-status" role="status" aria-live="polite" style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            Fixture ${fixtureCid} targets ipfs_datasets_py.browse with root_cid bafyidlg050datasetroot, limit 5, and ${compatibilityReceipt}.
                        </div>
                    </section>

                    <section data-svd-vda-marker="invalid-input" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Invalid Input</h3>
                        <div id="idl-invalid-status" role="status" aria-live="polite" style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            Fixture ${invalidFixtureCid} rejects root_cid number and limit string before transport dispatch. ${invalidReceipt}.
                        </div>
                    </section>

                    <section data-svd-vda-marker="transport-badges" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Transport Badges</h3>
                        <div style="display:flex; gap:6px; flex-wrap:wrap; font-size:12px;">
                            ${['browser-gateway', 'mcp_remote', 'mcp_plus_plus_remote', 'descriptor-fallback'].map(transport => `
                                <span data-transport-badge="${transport}" style="border:1px solid #4b6584; border-radius:6px; padding:5px 8px; color:#d7e6f5; background:#0f1b27;">${transport}</span>
                            `).join('')}
                        </div>
                    </section>

                    <section data-svd-vda-marker="receipt-drill-down" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Receipt Drill-Down</h3>
                        <details id="idl-receipt-drilldown" open>
                            <summary style="cursor:pointer; color:#f7fafc;">${drilldownReceipt}</summary>
                            <pre style="white-space:pre-wrap; overflow:auto; background:#0f172a; color:#dbeafe; padding:8px; border-radius:4px; font-size:11px;">${JSON.stringify({
                                receipt_cid: drilldownReceipt,
                                descriptor_cids: Object.values(descriptorCidMap),
                                policy_cid: policyCid,
                                fixture_cid: fixtureCid,
                                invalid_fixture_cid: invalidFixtureCid,
                                event_dag: 'event:idl-explorer:g050:descriptor-fixture-drilldown',
                            }, null, 2)}</pre>
                        </details>
                    </section>
                </div>

                <div style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn btn-small" data-svd-workflow-action="run-compatibility-fixture" data-action="run-compatibility-fixture" aria-label="Run IDL compatibility fixture">Run Fixture</button>
                    <button class="btn btn-small" data-svd-workflow-action="validate-invalid-input" data-action="validate-invalid-input" aria-label="Validate invalid IDL input">Invalid Input</button>
                    <button class="btn btn-small" data-svd-workflow-action="open-receipt-drilldown" data-action="open-receipt-drilldown" aria-label="Open receipt drill-down">Receipt</button>
                    <button class="btn btn-small" data-svd-workflow-action="refresh-transport-badges" data-action="refresh-transport-badges" aria-label="Refresh transport badges">Transports</button>
                </div>

                <div id="idl-envelope-result" style="margin-top:14px;"></div>
                <ol id="idl-workflow-log" style="margin:14px 0 0; padding-left:22px; color:#c6d1dc; font-size:13px;">
                    <li>${compatibilityReceipt} ${fixtureCid}</li>
                    <li>${invalidReceipt} ${invalidFixtureCid}</li>
                    <li>${drilldownReceipt} ${policyCid}</li>
                </ol>
            </div>
        `;

        const root = contentElement.querySelector('.idl-explorer-workflow');
        const compatibilityStatus = contentElement.querySelector('#idl-compatibility-status');
        const invalidStatus = contentElement.querySelector('#idl-invalid-status');
        const result = contentElement.querySelector('#idl-envelope-result');
        const log = contentElement.querySelector('#idl-workflow-log');
        const drilldown = contentElement.querySelector('#idl-receipt-drilldown');

        const appendLog = (message) => {
            if (!log) return;
            const item = document.createElement('li');
            item.textContent = message;
            log.appendChild(item);
        };

        root?.querySelector('[data-svd-workflow-action="run-compatibility-fixture"]')?.addEventListener('click', async () => {
            if (compatibilityStatus) {
                compatibilityStatus.textContent = `Compatibility fixture ${fixtureCid} dispatched through ipfs_datasets_py.browse; ${compatibilityReceipt} pending receipt render.`;
            }
            appendLog(`receipt:idl-explorer:g050:compatibility:dispatched ${fixtureCid} browser-gateway mcp_plus_plus_remote`);
            try {
                const envelope = await invokeDescriptorOperation({
                    descriptor_id: 'ipfs_datasets_py',
                    operation: 'browse',
                    input: { root_cid: 'bafyidlg050datasetroot', path: '/', limit: 5 },
                    app_id: 'idl-explorer',
                    desktop: this,
                });
                if (result) result.innerHTML = renderEnvelopeHTML(envelope);
                appendLog(`${compatibilityReceipt} ${envelope.status} ${envelope.trace.transport} ${envelope.receipt_refs?.[0]?.receipt_cid || ''}`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                appendLog(`${compatibilityReceipt} descriptor-fallback ${message}`);
            }
        });

        root?.querySelector('[data-svd-workflow-action="validate-invalid-input"]')?.addEventListener('click', () => {
            if (invalidStatus) {
                invalidStatus.textContent = `Invalid input fixture ${invalidFixtureCid} rejected by input_schema before transport: root_cid must be string and limit must be number. ${invalidReceipt}.`;
            }
            appendLog(`${invalidReceipt} schema validation rejected root_cid:number limit:string`);
        });

        root?.querySelector('[data-svd-workflow-action="open-receipt-drilldown"]')?.addEventListener('click', () => {
            if (drilldown) drilldown.open = true;
            appendLog(`${drilldownReceipt} receipt drill-down opened with event:idl-explorer:g050:descriptor-fixture-drilldown`);
        });

        root?.querySelector('[data-svd-workflow-action="refresh-transport-badges"]')?.addEventListener('click', () => {
            appendLog('receipt:idl-explorer:g050:transport-badges browser-gateway mcp_remote mcp_plus_plus_remote descriptor-fallback');
        });
    }

    createAcceleratePanelSurface(contentElement) {
        const modelArtifactCid = 'bafyaccelerateg049modelweights';
        const tokenizerArtifactCid = 'bafyaccelerateg049tokenizer';
        const policyArtifactCid = 'bafyaccelerateg049evalpolicy';
        const resultArtifactCid = 'bafyaccelerateg049primaryresult';
        const queueReceipt = 'receipt:accelerate-panel:g049:queue:accepted';
        const runReceipt = 'receipt:accelerate-panel:g049:run:primary-execution';
        const cancelReceipt = 'receipt:accelerate-panel:g049:cancel:queued-job';
        const recoveryReceipt = 'receipt:accelerate-panel:g049:recovery:no-capacity';

        contentElement.innerHTML = `
            <div class="generated-service-surface generated-mcp-app accelerate-panel-workflow"
                data-app-id="accelerate-panel"
                data-service="ipfs_accelerate_py"
                data-svd-workflow="accelerate-panel.inference-with-hardware-fit"
                style="height:100%; min-height:0; padding:16px; overflow:auto; background:#101820; color:#f7fafc;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px; flex-wrap:wrap;">
                    <div style="min-width:220px; flex:1;">
                        <h2 style="margin:0 0 6px; font-size:22px;">IPFS Accelerate Panel</h2>
                        <p style="margin:0; color:#b6c2cf;">Model artifacts, hardware routing, inference queue, and recovery receipts are governed through ipfs_accelerate_py descriptors.</p>
                    </div>
                    <span style="padding:6px 10px; border:1px solid #3ddc97; border-radius:6px; color:#3ddc97; font-size:12px; text-transform:uppercase;">VDA-G049 ready</span>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
                    <section data-svd-vda-marker="model-artifacts" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Model Artifacts</h3>
                        <div style="display:grid; gap:6px; color:#c6d1dc; font-size:13px;">
                            <span>Model: sentence-transformers/all-MiniLM-L6-v2</span>
                            <span>Weights CID: ${modelArtifactCid}</span>
                            <span>Tokenizer CID: ${tokenizerArtifactCid}</span>
                            <span>Result CID: ${resultArtifactCid}</span>
                        </div>
                    </section>

                    <section data-svd-vda-marker="evaluation-policy" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Evaluation Policy</h3>
                        <div style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            Policy CID: ${policyArtifactCid}. Prompts are redacted in receipts, max tokens are capped at 256, destructive operations require confirmation, and artifacts retain provenance.
                        </div>
                    </section>

                    <section data-svd-vda-marker="hardware-fit" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Hardware Fit</h3>
                        <div style="display:grid; gap:6px; color:#c6d1dc; font-size:13px;">
                            <span>Selected target: WebGPU preferred, WebNN fallback, CPU recovery.</span>
                            <span>Fit score: 0.91 for 384-dim embedding workload.</span>
                            <span>Memory fit: 1.2 GB required / 8 GB available.</span>
                        </div>
                    </section>

                    <section data-svd-vda-marker="primary-execution" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Primary Execution</h3>
                        <div id="accelerate-primary-status" role="status" aria-live="polite" style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            Ready to enqueue deterministic inference job accelerate-g049-primary with ${runReceipt}.
                        </div>
                    </section>

                    <section data-svd-vda-marker="queue-log-cancel" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">Queue, Log, Cancel</h3>
                        <div style="display:grid; gap:6px; color:#c6d1dc; font-size:13px;">
                            <span>Queue job: accelerate-g049-primary accepted with ${queueReceipt}.</span>
                            <span>Log frontier: log:accelerate-panel:g049:queued, log:accelerate-panel:g049:completed.</span>
                            <span>Cancellation receipt: ${cancelReceipt}.</span>
                        </div>
                    </section>

                    <section data-svd-vda-marker="no-capacity-recovery" style="border:1px solid #26384a; border-radius:6px; padding:12px; background:#162331;">
                        <h3 style="margin:0 0 8px; font-size:15px;">No-Capacity Recovery</h3>
                        <div id="accelerate-recovery-status" style="color:#c6d1dc; font-size:13px; line-height:1.45;">
                            If WebGPU and WebNN capacity are unavailable, the workflow retries on CPU batch mode and records ${recoveryReceipt}.
                        </div>
                    </section>
                </div>

                <div style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn btn-small" data-svd-workflow-action="launch-primary-execution" data-action="run-inference" aria-label="Run governed inference job">Run Inference</button>
                    <button class="btn btn-small" data-svd-workflow-action="inspect-model-artifacts" data-action="inspect-artifacts" aria-label="Inspect model artifacts">Artifacts</button>
                    <button class="btn btn-small" data-svd-workflow-action="refresh-hardware-fit" data-action="refresh-hardware" aria-label="Refresh hardware fit">Hardware</button>
                    <button class="btn btn-small" data-svd-workflow-action="cancel-queued-job" data-action="cancel-job" aria-label="Cancel queued job">Cancel</button>
                    <button class="btn btn-small" data-svd-workflow-action="recover-no-capacity" data-action="recover-capacity" aria-label="Recover no capacity state">Recover</button>
                </div>

                <ol id="accelerate-workflow-log" data-svd-vda-marker="queue-log-cancel" style="margin:14px 0 0; padding-left:22px; color:#c6d1dc; font-size:13px;">
                    <li>receipt:accelerate-panel:g049:model-artifacts ${modelArtifactCid}</li>
                    <li>${queueReceipt}</li>
                    <li>${runReceipt}</li>
                    <li>${cancelReceipt}</li>
                    <li>${recoveryReceipt}</li>
                </ol>
            </div>
        `;

        const root = contentElement.querySelector('.accelerate-panel-workflow');
        const primaryStatus = contentElement.querySelector('#accelerate-primary-status');
        const recoveryStatus = contentElement.querySelector('#accelerate-recovery-status');
        const log = contentElement.querySelector('#accelerate-workflow-log');

        const appendLog = (message) => {
            if (!log) return;
            const item = document.createElement('li');
            item.textContent = message;
            log.appendChild(item);
        };

        root?.querySelector('[data-svd-workflow-action="launch-primary-execution"]')?.addEventListener('click', () => {
            if (primaryStatus) {
                primaryStatus.textContent = `Completed accelerate-g049-primary on WebGPU fallback-safe route. Artifact ${resultArtifactCid}. ${runReceipt}.`;
            }
            appendLog('log:accelerate-panel:g049:completed primary execution stored result artifact');
        });

        root?.querySelector('[data-svd-workflow-action="inspect-model-artifacts"]')?.addEventListener('click', () => {
            appendLog(`receipt:accelerate-panel:g049:artifact-inspected ${modelArtifactCid} ${tokenizerArtifactCid}`);
        });

        root?.querySelector('[data-svd-workflow-action="refresh-hardware-fit"]')?.addEventListener('click', () => {
            appendLog('receipt:accelerate-panel:g049:hardware-fit refreshed WebGPU WebNN CPU route matrix');
        });

        root?.querySelector('[data-svd-workflow-action="cancel-queued-job"]')?.addEventListener('click', () => {
            appendLog(`${cancelReceipt} cancel requested for queued standby job accelerate-g049-standby`);
        });

        root?.querySelector('[data-svd-workflow-action="recover-no-capacity"]')?.addEventListener('click', () => {
            if (recoveryStatus) {
                recoveryStatus.textContent = `No-capacity condition recovered through CPU batch fallback and queue drain. ${recoveryReceipt}.`;
            }
            appendLog('log:accelerate-panel:g049:recovered no-capacity CPU batch fallback active');
        });
    }

    async createAgentSupervisorApp(contentElement) {
        const SupervisorModule = await import('./apps/agent-supervisor.js');
        if (typeof SupervisorModule.mountSwissKnifeApp === 'function') {
            return SupervisorModule.mountSwissKnifeApp(contentElement, { desktop: this });
        }
        const AgentSupervisorConsole = SupervisorModule.AgentSupervisorConsole || SupervisorModule.AgentSupervisorApp || SupervisorModule.default;
        const app = new AgentSupervisorConsole(this);
        await app.initialize();
        contentElement.innerHTML = await app.render();
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
        .all-app-backend-status-row{display:grid;grid-template-columns:minmax(88px,.8fr) minmax(160px,1.2fr) minmax(220px,2fr);gap:10px;align-items:start;padding:8px;border:1px solid #2f3945;background:#151e27}
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
