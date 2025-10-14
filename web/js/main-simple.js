// SwissKnife Web Desktop - Main Application (Simplified for Testing)

console.log('SwissKnife Web Desktop starting...');

class SwissKnifeDesktop {
    constructor() {
        this.windows = new Map();
        this.windowCounter = 0;
        this.activeWindow = null;
        this.apps = new Map();
        this.isSwissKnifeReady = false;
        this.zIndexCounter = 100;
        
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
            
            icon.addEventListener('click', (e) => {
                e.preventDefault();
                console.log(`🖱️ Desktop icon clicked: ${appId}`);
                if (appId) {
                    this.launchApp(appId);
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
    
    async launchApp(appId) {
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
            
            // Load app component (placeholder for now)
            await this.loadAppComponent(window, appConfig.component);
            
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
        windowElement.style.left = options.x + 'px';
        windowElement.style.top = options.y + 'px';
        windowElement.style.width = options.width + 'px';
        windowElement.style.height = options.height + 'px';
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
            <div class="window-content" id="${windowId}-content">
                <div class="window-loading">
                    <div class="window-loading-spinner"></div>
                </div>
            </div>
        `;
        
        // Add window to container
        const windowsContainer = document.getElementById('windows-container');
        if (windowsContainer) {
            windowsContainer.appendChild(windowElement);
        }
        
        // Setup window controls
        this.setupWindowControls(windowElement);
        // Setup window dragging
        this.setupWindowDragging(windowElement);
        // Bring to front on interaction
        windowElement.addEventListener('mousedown', () => this.focusWindow(windowElement));
        
        // Store window reference
        const window = {
            id: windowId,
            element: windowElement,
            appId: options.appId,
            title: options.title,
            minimized: false,
            maximized: false
        };
        
        this.windows.set(windowId, window);
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
        const html = await p2pChat.render();
        contentElement.innerHTML = html;
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
        if (StrudelModule.StrudelGrandmaApp) {
            const strudel = new StrudelModule.StrudelGrandmaApp(this);
            await strudel.initialize();
            const html = await strudel.render();
            contentElement.innerHTML = html;
            return strudel;
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
        const MusicStudioModule = await import('./apps/music-studio.js');
        if (MusicStudioModule.MusicStudioApp) {
            const musicStudio = new MusicStudioModule.MusicStudioApp(this);
            await musicStudio.initialize();
            const html = await musicStudio.render();
            contentElement.innerHTML = html;
            return musicStudio;
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
                     style="cursor: pointer;">
                    ${icon}
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

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new SwissKnifeDesktop();
    });
} else {
    new SwissKnifeDesktop();
}
