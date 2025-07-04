// SwissKnife Web Desktop - Main Application
import '../css/aero-enhanced.css';
import '../css/desktop.css';
import '../css/windows.css';
import '../css/terminal.css';
import '../css/apps.css';
import SwissKnife from './swissknife-browser.js';
import DesktopEnhancer from './desktop-enhancer.js';

class SwissKnifeDesktop {
    constructor() {
        this.windows = new Map();
        this.windowCounter = 0;
        this.activeWindow = null;
        this.apps = new Map();
        this.swissknife = SwissKnife;
        this.isSwissKnifeReady = false;
        this.enhancer = null;
        this.currentTheme = 'day'; // 'day' or 'sunset'
        
        this.init();
    }
    
    async init() {
        console.log('Initializing SwissKnife Web Desktop...');
        
        // Add error handlers for missing backend API calls
        this.setupMockApiHandlers();
        
        // Initialize the real SwissKnife core
        try {
            const result = await this.swissknife.initialize({
                config: { storage: 'localstorage' },
                storage: { type: 'indexeddb', dbName: 'swissknife-web' },
                ai: { autoRegisterModels: true, autoRegisterTools: true },
                openaiApiKey: localStorage.getItem('swissknife_openai_key')
            });
            
            if (result.success) {
                this.isSwissKnifeReady = true;
                console.log('SwissKnife core initialized successfully');
            } else {
                console.warn('SwissKnife core initialization failed:', result.error);
                // Continue with limited functionality
            }
        } catch (error) {
            console.error('Error initializing SwissKnife core:', error);
            // Continue with limited functionality
        }
        
        // Initialize desktop enhancer
        await this.initializeEnhancer();
        
        // Initialize desktop components
        this.initializeDesktop();
        this.initializeApps();
        this.initializeTheme();
        this.setupEventListeners();
        this.startSystemMonitoring();
        
        // Hide loading screen
        setTimeout(() => {
            document.getElementById('loading-screen').style.display = 'none';
        }, 3000);
        
        // Debug: Check DOM structure after initialization
        setTimeout(() => {
            this.debugDOMStructure();
        }, 4000);
        
        // Set up global functions for HTML onclick handlers
        window.showDesktopProperties = () => this.showDesktopProperties();
        window.openTerminalHere = () => this.openTerminalHere();
        window.createNewFile = () => this.createNewFile();
        window.createNewFolder = () => this.createNewFolder();
        window.refreshDesktop = () => this.refreshDesktop();
        window.showAbout = () => this.showAbout();
        
        console.log('SwissKnife Web Desktop ready!');
    }
    
    debugDOMStructure() {
        console.log('🔍 DEBUG: Checking DOM structure...');
        
        // Check desktop icons
        const desktopIcons = document.querySelectorAll('.desktop-icons .icon');
        console.log('🖥️ Desktop icons found:', desktopIcons.length);
        
        desktopIcons.forEach((icon, index) => {
            const appId = icon.dataset.app;
            const label = icon.querySelector('.icon-label')?.textContent;
            console.log(`  Icon ${index + 1}: ${appId} (${label})`);
        });
        
        // Check system menu items
        const menuItems = document.querySelectorAll('.system-menu .menu-item[data-app]');
        console.log('📋 System menu items found:', menuItems.length);
        
        menuItems.forEach((item, index) => {
            const appId = item.dataset.app;
            const text = item.textContent.trim();
            console.log(`  Menu item ${index + 1}: ${appId} (${text})`);
        });
        
        // Check if navi icon image is loaded
        const naviIcon = document.querySelector('.icon[data-app="navi"] img');
        if (naviIcon) {
            console.log('🤖 NAVI icon found, checking if image loaded...');
            if (naviIcon.complete && naviIcon.naturalHeight !== 0) {
                console.log('✅ NAVI icon image loaded successfully');
            } else {
                console.log('❌ NAVI icon image failed to load');
                naviIcon.addEventListener('load', () => console.log('✅ NAVI icon image loaded (delayed)'));
                naviIcon.addEventListener('error', () => console.log('❌ NAVI icon image error'));
            }
        } else {
            console.log('❌ NAVI icon not found in DOM');
        }
        
        // Test manual app launch
        console.log('🧪 Testing manual app launches...');
        console.log('🧪 To test NAVI: desktop.launchApp("navi")');
        console.log('🧪 To test Device Manager: desktop.launchApp("device-manager")');
    }
    
    initializeDesktop() {
        // Initialize system time
        this.updateSystemTime();
        setInterval(() => this.updateSystemTime(), 1000);
        
        // Initialize system status
        this.updateSystemStatus();
        setInterval(() => this.updateSystemStatus(), 30000); // Reduced from 5000 to 30000 (30 seconds)
        
        // Setup desktop context menu
        this.setupContextMenu();
        
        // Setup window management
        this.setupWindowManagement();
    }
    
    async initializeEnhancer() {
        // Initialize desktop enhancer for Aero effects, window snapping, etc.
        try {
            this.enhancer = new DesktopEnhancer();
            console.log('Desktop enhancer initialized successfully');
        } catch (error) {
            console.error('Failed to initialize desktop enhancer:', error);
        }
    }
    
    initializeTheme() {
        // Check for saved theme preference
        const savedTheme = localStorage.getItem('swissknife-theme') || 'day';
        this.setTheme(savedTheme);
        
        // Add theme toggle to system panel
        this.addThemeToggle();
    }
    
    addThemeToggle() {
        const systemStatus = document.querySelector('.system-status');
        const themeToggle = document.createElement('span');
        themeToggle.className = 'status-indicator theme-toggle';
        themeToggle.id = 'theme-toggle';
        themeToggle.innerHTML = this.currentTheme === 'day' ? '☀️' : '🌅';
        themeToggle.title = `Switch to ${this.currentTheme === 'day' ? 'Sunset' : 'Day'} Mode`;
        themeToggle.addEventListener('click', () => this.toggleTheme());
        
        // Insert before the first child of system-status
        systemStatus.insertBefore(themeToggle, systemStatus.firstChild);
    }
    
    toggleTheme() {
        const newTheme = this.currentTheme === 'day' ? 'sunset' : 'day';
        this.setTheme(newTheme);
        localStorage.setItem('swissknife-theme', newTheme);
    }
    
    setTheme(theme) {
        this.currentTheme = theme;
        const body = document.body;
        const desktopBg = document.querySelector('.desktop-background');
        const themeToggle = document.getElementById('theme-toggle');
        
        // Remove previous theme classes
        body.classList.remove('theme-day', 'theme-sunset');
        
        // Add new theme class
        body.classList.add(`theme-${theme}`);
        
        // Update background image
        if (desktopBg) {
            if (theme === 'day') {
                // Bright daylight Swiss Alps
                desktopBg.style.backgroundImage = "url('https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop&q=80')";
            } else {
                // Sunset/golden hour Swiss Alps
                desktopBg.style.backgroundImage = "url('https://images.unsplash.com/photo-1544550285-f813152fb2fd?w=1920&h=1080&fit=crop&q=80')";
            }
        }
        
        // Update theme toggle icon
        if (themeToggle) {
            themeToggle.innerHTML = theme === 'day' ? '☀️' : '🌅';
            themeToggle.title = `Switch to ${theme === 'day' ? 'Sunset' : 'Day'} Mode`;
        }
        
        console.log(`Theme switched to: ${theme}`);
    }
    
    initializeApps() {
        console.log('🔧 Initializing apps...');
        
        // Register available applications
        this.apps.set('terminal', {
            name: 'SwissKnife Terminal',
            icon: '🖥️',
            component: 'TerminalApp',
            singleton: false
        });
        console.log('✅ Registered terminal app');
        
        this.apps.set('vibecode', {
            name: 'VibeCode Editor',
            icon: '📝',
            component: 'VibeCodeApp',
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
        
        this.apps.set('model-browser', {
            name: 'Model Browser',
            icon: '🧠',
            component: 'ModelBrowserApp',
            singleton: true
        });
        
        this.apps.set('ipfs-explorer', {
            name: 'IPFS Explorer',
            icon: '🌐',
            component: 'IPFSExplorerApp',
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

        this.apps.set('cron', {
            name: 'AI Cron Scheduler',
            icon: '⏰',
            component: 'CronApp',
            singleton: true
        });

        this.apps.set('device-manager', {
            name: 'Device Manager',
            icon: '🔧',
            component: 'DeviceManagerApp',
            singleton: true
        });
        console.log('✅ Registered device-manager app');

        this.apps.set('navi', {
            name: 'NAVI',
            icon: '<img src="/assets/icons/navi-icon.png" style="width: 24px; height: 24px; border-radius: 4px;">',
            component: 'NaviApp',
            singleton: true
        });
        console.log('✅ Registered navi app');
        
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
                this.launchApp(appId);
            });
        });
        
        // System menu
        const systemMenuBtn = document.getElementById('system-menu-btn');
        const systemMenu = document.getElementById('system-menu');
        
        // Ensure menu starts hidden
        systemMenu.classList.remove('visible');
        
        systemMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (systemMenu.classList.contains('visible')) {
                systemMenu.classList.remove('visible');
            } else {
                systemMenu.classList.add('visible');
            }
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!systemMenu.contains(e.target) && !systemMenuBtn.contains(e.target)) {
                systemMenu.classList.remove('visible');
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
                this.launchApp(appId);
                systemMenu.classList.remove('visible');
            });
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', () => {
            systemMenu.classList.remove('visible');
        });
        
        // Desktop right-click context menu
        document.addEventListener('contextmenu', (e) => {
            if (e.target.classList.contains('desktop-background') || 
                e.target.classList.contains('desktop')) {
                e.preventDefault();
                this.showContextMenu(e.clientX, e.clientY);
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
        });
        
        // Window management events
        document.addEventListener('mousedown', (e) => {
            if (e.target.closest('.window')) {
                this.focusWindow(e.target.closest('.window'));
            }
        });
    }
    
    async launchApp(appId) {
        console.log(`🚀 Launching app: ${appId}`);
        
        const appConfig = this.apps.get(appId);
        if (!appConfig) {
            console.error(`❌ App ${appId} not found in registered apps`);
            console.log('📱 Available apps:', Array.from(this.apps.keys()));
            return;
        }
        
        console.log(`✅ Found app config for ${appId}:`, appConfig);

        // Check if singleton app is already running
        if (appConfig.singleton) {
            const existingWindow = Array.from(this.windows.values())
                .find(w => w.appId === appId);
            if (existingWindow) {
                console.log(`🔄 Focusing existing window for ${appId}`);
                this.focusWindow(existingWindow.element);
                return;
            }
        }

        try {
            console.log(`🪟 Creating window for ${appId}...`);
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
            
            console.log(`🎨 Loading app component: ${appConfig.component}`);
            // Load app component
            await this.loadAppComponent(window, appConfig.component);
            
            console.log(`✅ Successfully launched ${appConfig.name}`);
        } catch (error) {
            console.error(`❌ Failed to launch ${appConfig.name}:`, error);
        }
    }
    
    async createWindow(options) {
        const windowId = `window-${++this.windowCounter}`;
        
        const windowElement = document.createElement('div');
        windowElement.className = 'window window-enter';
        windowElement.id = windowId;
        windowElement.setAttribute('data-window-id', windowId);
        windowElement.style.left = options.x + 'px';
        windowElement.style.top = options.y + 'px';
        windowElement.style.width = options.width + 'px';
        windowElement.style.height = options.height + 'px';
        
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
        
        // Add resize handles
        this.addResizeHandles(windowElement);
        
        // Add window to container
        document.getElementById('windows-container').appendChild(windowElement);
        
        // Setup window controls
        this.setupWindowControls(windowElement);
        
        // Make window draggable
        this.makeWindowDraggable(windowElement);
        
        // Store window reference
        const window = {
            id: windowId,
            element: windowElement,
            appId: options.appId,
            title: options.title,
            minimized: false,
            maximized: false,
            x: options.x,
            y: options.y,
            width: options.width,
            height: options.height,
            isSnapped: false,
            snapZone: null
        };
        
        this.windows.set(windowId, window);
        
        // Focus the new window
        this.focusWindow(windowElement);
        
        // Add to taskbar
        this.addToTaskbar(window);
        
        return window;
    }
    
    async loadAppComponent(window, componentName) {
        console.log(`🎨 Loading app component: ${componentName}`);
        
        try {
            // Get the content element
            const contentElement = document.getElementById(`${window.id}-content`);
            if (!contentElement) {
                throw new Error(`Content element not found for window ${window.id}`);
            }
            
            // Handle different app types
            let appInstance;
            
            switch (componentName.toLowerCase()) {
                case 'terminalapp':
                    console.log('🖥️ Loading Terminal app...');
                    // Import and instantiate Terminal app
                    const TerminalModule = await import('./apps/terminal.js');
                    const TerminalApp = TerminalModule.TerminalApp;
                    appInstance = new TerminalApp(contentElement, this);
                    break;
                    
                case 'devicemanagerapp':
                    console.log('🔧 Loading Device Manager app...');
                    // Device Manager
                    this.loadDeviceManagerApp(contentElement);
                    break;
                    
                case 'naviapp':
                    console.log('🤖 Loading NAVI app...');
                    // NAVI App - loads the chat application
                    this.loadNaviApp(contentElement);
                    break;
                    
                case 'aichatapp':
                    // Placeholder for AI Chat app
                    contentElement.innerHTML = `
                        <div class="app-placeholder">
                            <h2>🤖 AI Chat</h2>
                            <p>AI Chat functionality will be implemented here.</p>
                            <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
                        </div>
                    `;
                    break;
                    
                case 'filemanagerapp':
                    // Placeholder for File Manager
                    contentElement.innerHTML = `
                        <div class="app-placeholder">
                            <h2>📁 File Manager</h2>
                            <p>File management functionality will be implemented here.</p>
                            <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
                        </div>
                    `;
                    break;
                    
                case 'vibecodeapp':
                    // Placeholder for VibeCode
                    contentElement.innerHTML = `
                        <div class="app-placeholder">
                            <h2>💻 VibeCode</h2>
                            <p>WebNN/WebGPU powered code editor will be implemented here.</p>
                            <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
                        </div>
                    `;
                    break;
                    
                case 'settingsapp':
                    // Placeholder for Settings
                    contentElement.innerHTML = `
                        <div class="app-placeholder">
                            <h2>⚙️ Settings</h2>
                            <p>Configuration settings will be implemented here.</p>
                            <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
                        </div>
                    `;
                    break;
                    
                case 'apikeysapp':
                    // API Keys Manager
                    this.loadAPIKeysApp(contentElement);
                    break;
                    
                case 'mcpcontrolapp':
                    // MCP Control Panel
                    this.loadMCPControlApp(contentElement);
                    break;
                    
                case 'taskmanagerapp':
                    // Task Manager
                    this.loadTaskManagerApp(contentElement);
                    break;
                    
                case 'modelbrowserapp':
                    // Model Browser
                    this.loadModelBrowserApp(contentElement);
                    break;
                    
                case 'ipfsexplorerapp':
                    // IPFS Explorer
                    this.loadIPFSExplorerApp(contentElement);
                    break;
                    
                case 'cronapp':
                    // AI Cron Scheduler
                    this.loadCronApp(contentElement);
                    break;
                    
                case 'devicemanagerapp':
                    // Device Manager
                    this.loadDeviceManagerApp(contentElement);
                    break;
                    
                case 'naviapp':
                    // NAVI App - loads the chat application
                    this.loadNaviApp(contentElement);
                    break;
                    
                default:
                    throw new Error(`Unknown app component: ${componentName}`);
            }
            
            // Store app instance reference if created
            if (appInstance) {
                window.appInstance = appInstance;
            }
            
        } catch (error) {
            console.error(`Failed to load app component ${componentName}:`, error);
            
            // Show error in window
            const contentElement = document.getElementById(`${window.id}-content`);
            contentElement.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #f48771;">
                    <h3>Failed to load application</h3>
                    <p>${error.message}</p>
                    <button onclick="this.closest('.window').remove()" style="margin-top: 10px; padding: 5px 10px;">Close</button>
                </div>
            `;
        }
    }
    
    loadCronApp(contentElement) {
        contentElement.innerHTML = `
            <div class="cron-app">
                <div class="cron-header">
                    <h2>⏰ AI Cron Scheduler</h2>
                    <p>Schedule AI-powered actions and automated tasks</p>
                </div>
                
                <div class="cron-tabs">
                    <button class="cron-tab active" data-tab="active">Active Crons</button>
                    <button class="cron-tab" data-tab="create">Create New</button>
                    <button class="cron-tab" data-tab="history">History</button>
                </div>
                
                <div class="cron-content">
                    <!-- Active Crons Tab -->
                    <div class="cron-tab-content active" id="active-crons">
                        <div class="cron-list" id="cron-list">
                            <div class="cron-item">
                                <div class="cron-icon">🤖</div>
                                <div class="cron-details">
                                    <div class="cron-name">Daily Code Review</div>
                                    <div class="cron-schedule">Every day at 09:00</div>
                                    <div class="cron-description">AI analyzes recent commits and provides suggestions</div>
                                </div>
                                <div class="cron-status active">Active</div>
                                <div class="cron-actions">
                                    <button class="btn-small">Edit</button>
                                    <button class="btn-small btn-danger">Delete</button>
                                </div>
                            </div>
                            
                            <div class="cron-item">
                                <div class="cron-icon">📊</div>
                                <div class="cron-details">
                                    <div class="cron-name">Weekly Performance Report</div>
                                    <div class="cron-schedule">Fridays at 17:00</div>
                                    <div class="cron-description">Generate and send performance analytics</div>
                                </div>
                                <div class="cron-status active">Active</div>
                                <div class="cron-actions">
                                    <button class="btn-small">Edit</button>
                                    <button class="btn-small btn-danger">Delete</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Create New Cron Tab -->
                    <div class="cron-tab-content" id="create-cron">
                        <form class="cron-form" id="cron-form">
                            <div class="form-group">
                                <label>Cron Name</label>
                                <input type="text" id="cron-name" placeholder="Enter a descriptive name" required>
                            </div>
                            
                            <div class="form-group">
                                <label>Schedule</label>
                                <div class="schedule-builder">
                                    <select id="schedule-type">
                                        <option value="daily">Daily</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="monthly">Monthly</option>
                                        <option value="custom">Custom Cron</option>
                                    </select>
                                    <input type="time" id="schedule-time" value="09:00">
                                    <input type="text" id="cron-expression" placeholder="0 9 * * *" style="display:none;">
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label>AI Action Type</label>
                                <select id="action-type">
                                    <option value="analysis">Code Analysis</option>
                                    <option value="summary">Generate Summary</option>
                                    <option value="report">Performance Report</option>
                                    <option value="backup">Automated Backup</option>
                                    <option value="custom">Custom AI Prompt</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label>Description/Instructions</label>
                                <textarea id="cron-description" rows="3" placeholder="Describe what this cron should do..."></textarea>
                            </div>
                            
                            <div class="form-group" id="ai-prompt-group" style="display:none;">
                                <label>AI Prompt</label>
                                <textarea id="ai-prompt" rows="4" placeholder="Enter the AI prompt to execute..."></textarea>
                            </div>
                            
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" id="send-notifications"> Send notifications when executed
                                </label>
                            </div>
                            
                            <div class="form-actions">
                                <button type="submit" class="btn-primary">Create Cron</button>
                                <button type="button" class="btn-secondary" onclick="document.getElementById('cron-form').reset()">Reset</button>
                            </div>
                        </form>
                    </div>
                    
                    <!-- History Tab -->
                    <div class="cron-tab-content" id="cron-history">
                        <div class="history-list">
                            <div class="history-item">
                                <div class="history-time">2025-06-27 09:00:15</div>
                                <div class="history-name">Daily Code Review</div>
                                <div class="history-status success">Success</div>
                                <div class="history-result">Analyzed 15 files, found 3 suggestions</div>
                            </div>
                            <div class="history-item">
                                <div class="history-time">2025-06-26 17:00:32</div>
                                <div class="history-name">Weekly Performance Report</div>
                                <div class="history-status success">Success</div>
                                <div class="history-result">Report generated and sent</div>
                            </div>
                            <div class="history-item">
                                <div class="history-time">2025-06-26 09:00:12</div>
                                <div class="history-name">Daily Code Review</div>
                                <div class="history-status error">Error</div>
                                <div class="history-result">API rate limit exceeded</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Initialize cron app functionality
        this.initializeCronApp(contentElement);
    }
    
    initializeCronApp(contentElement) {
        // Tab switching
        const tabs = contentElement.querySelectorAll('.cron-tab');
        const tabContents = contentElement.querySelectorAll('.cron-tab-content');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                
                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Update active content
                tabContents.forEach(content => content.classList.remove('active'));
                const targetContent = contentElement.querySelector(`#${tabName === 'active' ? 'active-crons' : tabName === 'create' ? 'create-cron' : 'cron-history'}`);
                if (targetContent) targetContent.classList.add('active');
                
                // Refresh active crons list when that tab is selected
                if (tabName === 'active') {
                    this.refreshActiveCrons(contentElement);
                }
            });
        });
        
        // Schedule type handling
        const scheduleType = contentElement.querySelector('#schedule-type');
        const cronExpression = contentElement.querySelector('#cron-expression');
        const scheduleTime = contentElement.querySelector('#schedule-time');
        
        scheduleType.addEventListener('change', () => {
            if (scheduleType.value === 'custom') {
                cronExpression.style.display = 'block';
                scheduleTime.style.display = 'none';
            } else {
                cronExpression.style.display = 'none';
                scheduleTime.style.display = 'block';
            }
        });
        
        // Action type handling
        const actionType = contentElement.querySelector('#action-type');
        const aiPromptGroup = contentElement.querySelector('#ai-prompt-group');
        
        actionType.addEventListener('change', () => {
            if (actionType.value === 'custom') {
                aiPromptGroup.style.display = 'block';
            } else {
                aiPromptGroup.style.display = 'none';
            }
        });
        
        // Form submission
        const cronForm = contentElement.querySelector('#cron-form');
        cronForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createNewCron(contentElement);
        });
        
        // Initialize active crons list on first load
        this.refreshActiveCrons(contentElement);
        
        // Load any existing crons and schedule them
        this.loadExistingCrons();
    }
    
    createNewCron(contentElement) {
        const form = contentElement.querySelector('#cron-form');
        const formData = new FormData(form);
        
        const cronData = {
            id: Date.now().toString(),
            name: contentElement.querySelector('#cron-name').value,
            scheduleType: contentElement.querySelector('#schedule-type').value,
            time: contentElement.querySelector('#schedule-time').value,
            cronExpression: contentElement.querySelector('#cron-expression').value,
            actionType: contentElement.querySelector('#action-type').value,
            description: contentElement.querySelector('#cron-description').value,
            aiPrompt: contentElement.querySelector('#ai-prompt').value,
            notifications: contentElement.querySelector('#send-notifications').checked,
            created: new Date().toISOString(),
            lastRun: null,
            nextRun: this.calculateNextRun(contentElement.querySelector('#schedule-type').value, contentElement.querySelector('#schedule-time').value),
            status: 'active'
        };
        
        // Store in localStorage for persistence
        let savedCrons = JSON.parse(localStorage.getItem('swissknife-crons') || '[]');
        savedCrons.push(cronData);
        localStorage.setItem('swissknife-crons', JSON.stringify(savedCrons));
        
        // Schedule the actual cron job
        this.scheduleCronJob(cronData);
        
        console.log('Creating new cron:', cronData);
        
        // Show success notification
        this.showNotification('AI Cron job created successfully! 🤖⏰', 'success');
        
        // Switch to active crons tab
        const activeTab = contentElement.querySelector('.cron-tab[data-tab="active"]');
        activeTab.click();
        
        // Refresh the active crons list
        this.refreshActiveCrons(contentElement);
        
        // Reset form
        form.reset();
    }
    
    calculateNextRun(scheduleType, time) {
        const now = new Date();
        const [hours, minutes] = time.split(':').map(Number);
        
        let nextRun = new Date();
        nextRun.setHours(hours, minutes, 0, 0);
        
        // If the time has already passed today, schedule for tomorrow/next occurrence
        if (nextRun <= now) {
            switch (scheduleType) {
                case 'daily':
                    nextRun.setDate(nextRun.getDate() + 1);
                    break;
                case 'weekly':
                    nextRun.setDate(nextRun.getDate() + 7);
                    break;
                case 'monthly':
                    nextRun.setMonth(nextRun.getMonth() + 1);
                    break;
                default:
                    nextRun.setDate(nextRun.getDate() + 1);
            }
        }
        
        return nextRun.toISOString();
    }
    
    scheduleCronJob(cronData) {
        // Calculate time until next run
        const nextRun = new Date(cronData.nextRun);
        const now = new Date();
        const timeUntilRun = nextRun.getTime() - now.getTime();
        
        if (timeUntilRun > 0) {
            setTimeout(() => {
                this.executeCronJob(cronData);
            }, timeUntilRun);
            
            console.log(`Cron job "${cronData.name}" scheduled to run at ${nextRun.toLocaleString()}`);
        }
    }
    
    async executeCronJob(cronData) {
        console.log(`Executing cron job: ${cronData.name}`);
        
        try {
            let result = null;
            
            switch (cronData.actionType) {
                case 'ai-chat':
                    if (this.isSwissKnifeReady) {
                        result = await this.swissknife.ai.chat(cronData.aiPrompt);
                    }
                    break;
                case 'system-report':
                    result = this.generateSystemReport();
                    break;
                case 'backup':
                    result = await this.performBackup();
                    break;
                case 'custom':
                    if (this.isSwissKnifeReady && cronData.aiPrompt) {
                        result = await this.swissknife.ai.chat(cronData.aiPrompt);
                    }
                    break;
            }
            
            // Update cron data
            const savedCrons = JSON.parse(localStorage.getItem('swissknife-crons') || '[]');
            const cronIndex = savedCrons.findIndex(c => c.id === cronData.id);
            if (cronIndex !== -1) {
                savedCrons[cronIndex].lastRun = new Date().toISOString();
                savedCrons[cronIndex].nextRun = this.calculateNextRun(cronData.scheduleType, cronData.time);
                localStorage.setItem('swissknife-crons', JSON.stringify(savedCrons));
                
                // Schedule next run
                this.scheduleCronJob(savedCrons[cronIndex]);
            }
            
            // Show notification if enabled
            if (cronData.notifications) {
                this.showNotification(`Cron job "${cronData.name}" completed successfully! ✅`, 'success');
            }
            
        } catch (error) {
            console.error(`Error executing cron job "${cronData.name}":`, error);
            if (cronData.notifications) {
                this.showNotification(`Cron job "${cronData.name}" failed: ${error.message}`, 'error');
            }
        }
    }
    
    refreshActiveCrons(contentElement) {
        const cronList = contentElement.querySelector('#cron-list');
        const savedCrons = JSON.parse(localStorage.getItem('swissknife-crons') || '[]');
        
        cronList.innerHTML = '';
        
        if (savedCrons.length === 0) {
            cronList.innerHTML = `
                <div style="text-align: center; padding: 40px; opacity: 0.7;">
                    <div style="font-size: 48px; margin-bottom: 16px;">⏰</div>
                    <p>No active cron jobs yet.</p>
                    <p>Create your first AI-powered scheduled task!</p>
                </div>
            `;
            return;
        }
        
        savedCrons.forEach(cron => {
            const nextRun = new Date(cron.nextRun);
            const cronItem = document.createElement('div');
            cronItem.className = 'cron-item';
            cronItem.innerHTML = `
                <div class="cron-icon">🤖</div>
                <div class="cron-details">
                    <div class="cron-name">${cron.name}</div>
                    <div class="cron-schedule">${this.formatSchedule(cron)}</div>
                    <div class="cron-description">${cron.description}</div>
                    <div class="cron-description" style="margin-top: 4px; font-size: 11px;">
                        Next run: ${nextRun.toLocaleString()}
                    </div>
                </div>
                <div class="cron-status ${cron.status}">${cron.status}</div>
                <div class="cron-actions">
                    <button class="btn-small" onclick="desktop.editCron('${cron.id}')">Edit</button>
                    <button class="btn-small" onclick="desktop.toggleCron('${cron.id}')">${cron.status === 'active' ? 'Pause' : 'Resume'}</button>
                    <button class="btn-small btn-danger" onclick="desktop.deleteCron('${cron.id}')">Delete</button>
                </div>
            `;
            cronList.appendChild(cronItem);
        });
    }
    
    formatSchedule(cronData) {
        if (cronData.scheduleType === 'custom') {
            return `Custom: ${cronData.cronExpression}`;
        } else {
            const time = cronData.time;
            switch (cronData.scheduleType) {
                case 'daily':
                    return `Every day at ${time}`;
                case 'weekly':
                    return `Weekly at ${time}`;
                case 'monthly':
                    return `Monthly at ${time}`;
                default:
                    return `${cronData.scheduleType} at ${time}`;
            }
        }
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
                <span class="notification-message">${message}</span>
            </div>
        `;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Show notification
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Hide and remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    setupWindowControls(windowElement) {
        const minimizeBtn = windowElement.querySelector('.window-control.minimize');
        const maximizeBtn = windowElement.querySelector('.window-control.maximize');
        const closeBtn = windowElement.querySelector('.window-control.close');
        
        minimizeBtn.addEventListener('click', () => {
            this.minimizeWindow(windowElement);
        });
        
        maximizeBtn.addEventListener('click', () => {
            this.toggleMaximizeWindow(windowElement);
        });
        
        closeBtn.addEventListener('click', () => {
            this.closeWindow(windowElement);
        });
    }
    
    makeWindowDraggable(windowElement) {
        const titlebar = windowElement.querySelector('.window-titlebar');
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        
        titlebar.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('window-control')) return;
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(windowElement.style.left);
            startTop = parseInt(windowElement.style.top);
            
            // Set up snapping state
            this.dragState.isDragging = true;
            this.dragState.draggedWindow = windowElement;
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            
            e.preventDefault();
        });
        
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            // Check if window is currently snapped and should be unsnapped
            const windowId = windowElement.getAttribute('data-window-id') || windowElement.id;
            const windowData = this.windows.get(windowId);
            
            if (windowData && windowData.isSnapped) {
                // Unsnap the window when starting to drag
                this.unSnapWindow(windowElement);
                
                // Restore a more reasonable size for dragging
                const newWidth = Math.min(800, Math.max(400, windowData.preSnapState?.width || 600));
                const newHeight = Math.min(600, Math.max(300, windowData.preSnapState?.height || 400));
                
                // Position window under cursor
                const newLeft = e.clientX - newWidth / 2;
                const newTop = Math.max(0, e.clientY - 30); // 30px for titlebar
                
                windowElement.style.width = newWidth + 'px';
                windowElement.style.height = newHeight + 'px';
                windowElement.style.left = newLeft + 'px';
                windowElement.style.top = newTop + 'px';
                
                // Update start positions for continued dragging
                startX = e.clientX;
                startY = e.clientY;
                startLeft = newLeft;
                startTop = newTop;
                
                if (windowData) {
                    windowData.x = newLeft;
                    windowData.y = newTop;
                    windowData.width = newWidth;
                    windowData.height = newHeight;
                }
                
                return; // Don't continue with normal drag logic this frame
            }
            
            const newLeft = startLeft + deltaX;
            const newTop = Math.max(0, startTop + deltaY); // Prevent dragging above desktop
            
            windowElement.style.left = newLeft + 'px';
            windowElement.style.top = newTop + 'px';
            
            // Update window data
            if (windowData) {
                windowData.x = newLeft;
                windowData.y = newTop;
            }
        };
        
        const handleMouseUp = () => {
            isDragging = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
            // Snapping is handled by the global mouse handlers in setupWindowSnapping
        };
    }
    
    addResizeHandles(windowElement) {
        const handles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
        
        handles.forEach(direction => {
            const handle = document.createElement('div');
            handle.className = `window-resize-handle ${direction}`;
            
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.startResize(windowElement, direction, e);
            });
            
            windowElement.appendChild(handle);
        });
    }
    
    startResize(windowElement, direction, e) {
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = parseInt(windowElement.style.width);
        const startHeight = parseInt(windowElement.style.height);
        const startLeft = parseInt(windowElement.style.left);
        const startTop = parseInt(windowElement.style.top);
        
        windowElement.classList.add('resizing');
        
        function handleMouseMove(e) {
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            if (direction.includes('e')) {
                windowElement.style.width = Math.max(320, startWidth + deltaX) + 'px';
            }
            if (direction.includes('w')) {
                const newWidth = Math.max(320, startWidth - deltaX);
                windowElement.style.width = newWidth + 'px';
                windowElement.style.left = startLeft + (startWidth - newWidth) + 'px';
            }
            if (direction.includes('s')) {
                windowElement.style.height = Math.max(200, startHeight + deltaY) + 'px';
            }
            if (direction.includes('n')) {
                const newHeight = Math.max(200, startHeight - deltaY);
                windowElement.style.height = newHeight + 'px';
                windowElement.style.top = startTop + (startHeight - newHeight) + 'px';
            }
        }
        
        function handleMouseUp() {
            windowElement.classList.remove('resizing');
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        }
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }
    
    focusWindow(windowElement) {
        // Remove focus from all windows
        document.querySelectorAll('.window').forEach(w => {
            w.classList.remove('focused');
        });
        
        // Focus the selected window
        windowElement.classList.add('focused');
        this.activeWindow = windowElement;
        
        // Update taskbar
        this.updateTaskbar();
    }
    
    minimizeWindow(windowElement) {
        windowElement.classList.add('minimized');
        const windowId = windowElement.id;
        const window = this.windows.get(windowId);
        if (window) {
            window.minimized = true;
        }
        this.updateTaskbar();
    }
    
    toggleMaximizeWindow(windowElement) {
        const windowId = windowElement.id;
        const window = this.windows.get(windowId);
        
        if (window.maximized) {
            windowElement.classList.remove('maximized');
            window.maximized = false;
        } else {
            windowElement.classList.add('maximized');
            window.maximized = true;
        }
        
        this.updateTaskbar();
    }
    
    closeWindow(windowElement) {
        const windowId = windowElement.id;
        const window = this.windows.get(windowId);
        
        if (window) {
            // Cleanup app instance
            if (window.appInstance && window.appInstance.cleanup) {
                window.appInstance.cleanup();
            }
            
            // Remove from taskbar
            this.removeFromTaskbar(window);
            
            // Remove window
            windowElement.classList.add('window-exit');
            setTimeout(() => {
                windowElement.remove();
                this.windows.delete(windowId);
            }, 200);
        }
    }
    
    addToTaskbar(window) {
        const taskbarApps = document.getElementById('taskbar-apps');
        
        const taskbarItem = document.createElement('div');
        taskbarItem.className = 'taskbar-app';
        taskbarItem.id = `taskbar-${window.id}`;
        taskbarItem.innerHTML = `
            <span class="taskbar-app-icon">${this.apps.get(window.appId)?.icon || '📱'}</span>
            <span class="taskbar-app-title">${window.title}</span>
        `;
        
        taskbarItem.addEventListener('click', () => {
            if (window.minimized) {
                window.element.classList.remove('minimized');
                window.minimized = false;
            }
            this.focusWindow(window.element);
        });
        
        taskbarApps.appendChild(taskbarItem);
    }
    
    removeFromTaskbar(window) {
        const taskbarItem = document.getElementById(`taskbar-${window.id}`);
        if (taskbarItem) {
            taskbarItem.remove();
        }
    }
    
    updateTaskbar() {
        document.querySelectorAll('.taskbar-app').forEach(item => {
            item.classList.remove('active');
        });
        
        if (this.activeWindow) {
            const taskbarItem = document.getElementById(`taskbar-${this.activeWindow.id}`);
            if (taskbarItem) {
                taskbarItem.classList.add('active');
            }
        }
    }
    
    updateSystemTime() {
        const timeElement = document.getElementById('system-time');
        if (!timeElement) return;
        
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit',
            hour12: false 
        });
        const dateString = now.toLocaleDateString([], {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        
        // Add timezone info
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const shortTimezone = timezone.split('/').pop();
        
        timeElement.innerHTML = `
            <div class="system-time-main">${timeString}</div>
            <div class="system-time-date">${dateString}</div>
            <div class="system-time-zone">${shortTimezone}</div>
        `;
    }
    
    updateSystemStatus() {
        const hwStatus = this.swissknife.getHardwareStatus();
        
        // Update AI status
        const aiStatus = document.getElementById('ai-status');
        aiStatus.className = 'status-indicator ' + (hwStatus.webnn ? 'active' : 'inactive');
        aiStatus.title = `AI Engine: ${hwStatus.webnn ? 'WebNN Available' : 'API Only'}`;
        
        // Update IPFS status
        const ipfsStatus = document.getElementById('ipfs-status');
        ipfsStatus.className = 'status-indicator inactive'; // TODO: implement IPFS detection
        ipfsStatus.title = 'IPFS: Not connected';
        
        // Update GPU status
        const gpuStatus = document.getElementById('gpu-status');
        gpuStatus.className = 'status-indicator ' + (hwStatus.webgpu ? 'active' : 'inactive');
        gpuStatus.title = `GPU: ${hwStatus.webgpu ? 'WebGPU Available' : 'Not available'}`;
    }
    
    setupContextMenu() {
        // Add taskbar right-click functionality
        const systemPanel = document.querySelector('.system-panel');
        systemPanel.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showTaskbarContextMenu(e.clientX, e.clientY);
        });
        
        // Add taskbar app right-click functionality
        document.addEventListener('contextmenu', (e) => {
            if (e.target.closest('.taskbar-app')) {
                e.preventDefault();
                const taskbarApp = e.target.closest('.taskbar-app');
                const windowId = taskbarApp.id.replace('taskbar-', '');
                this.showTaskbarAppContextMenu(e.clientX, e.clientY, windowId);
            }
        });
    }
    
    setupWindowManagement() {
        // Set up window snapping functionality
        this.setupWindowSnapping();
        
        // Set up window drag boundaries
        this.setupDragBoundaries();
        
        // Set up snap zones
        this.createSnapZones();
    }
    
    setupWindowSnapping() {
        // Track dragging state for snapping
        this.dragState = {
            isDragging: false,
            draggedWindow: null,
            snapZones: [],
            snapThreshold: 20 // pixels from edge to trigger snap
        };
        
        // Listen for window drag events
        document.addEventListener('mousemove', (e) => {
            if (this.dragState.isDragging) {
                this.handleWindowDragSnapping(e);
            }
        });
        
        document.addEventListener('mouseup', (e) => {
            if (this.dragState.isDragging) {
                this.handleWindowSnapRelease(e);
            }
        });
    }
    
    createSnapZones() {
        // Define snap zones for different window arrangements
        const desktop = document.getElementById('desktop');
        const rect = desktop.getBoundingClientRect();
        const taskbarHeight = 40;
        const availableHeight = rect.height - taskbarHeight;
        
        // Calculate intelligent sizing based on screen thirds and minimum sizes
        const minWidth = 400  // Minimum readable width
        const minHeight = 300 // Minimum readable height
        
        // Use thirds of screen for better content display
        const oneThirdWidth = Math.max(minWidth, rect.width / 3);
        const twoThirdsWidth = Math.max(minWidth * 1.5, (rect.width * 2) / 3);
        const halfWidth = Math.max(minWidth, rect.width / 2);
        const fullWidth = rect.width;
        
        const oneThirdHeight = Math.max(minHeight, availableHeight / 3);
        const halfHeight = Math.max(minHeight, availableHeight / 2);
        const twoThirdsHeight = Math.max(minHeight * 1.5, (availableHeight * 2) / 3);
        const fullHeight = availableHeight;
        
        this.dragState.snapZones = [
            // Full screen (top edge - larger trigger area)
            {
                name: 'fullscreen',
                x: 0, y: 0, width: fullWidth, height: fullHeight,
                trigger: { x: rect.width * 0.3, y: 0, width: rect.width * 0.4, height: 30 }
            },
            // Left third (left edge)
            {
                name: 'left-third',
                x: 0, y: 0, width: oneThirdWidth, height: fullHeight,
                trigger: { x: 0, y: 100, width: 30, height: availableHeight - 200 }
            },
            // Right third (right edge)
            {
                name: 'right-third',
                x: rect.width - oneThirdWidth, y: 0, width: oneThirdWidth, height: fullHeight,
                trigger: { x: rect.width - 30, y: 100, width: 30, height: availableHeight - 200 }
            },
            // Left half (left edge - center area)
            {
                name: 'left-half',
                x: 0, y: 0, width: halfWidth, height: fullHeight,
                trigger: { x: 0, y: 50, width: 20, height: availableHeight - 100 }
            },
            // Right half (right edge - center area)
            {
                name: 'right-half',
                x: halfWidth, y: 0, width: halfWidth, height: fullHeight,
                trigger: { x: rect.width - 20, y: 50, width: 20, height: availableHeight - 100 }
            },
            // Top-left quarter (corner - larger for easier targeting)
            {
                name: 'top-left-quarter',
                x: 0, y: 0, width: halfWidth, height: halfHeight,
                trigger: { x: 0, y: 0, width: 60, height: 60 }
            },
            // Top-right quarter
            {
                name: 'top-right-quarter',
                x: halfWidth, y: 0, width: halfWidth, height: halfHeight,
                trigger: { x: rect.width - 60, y: 0, width: 60, height: 60 }
            },
            // Bottom-left quarter
            {
                name: 'bottom-left-quarter',
                x: 0, y: halfHeight, width: halfWidth, height: halfHeight,
                trigger: { x: 0, y: availableHeight - 60, width: 60, height: 60 }
            },
            // Bottom-right quarter
            {
                name: 'bottom-right-quarter',
                x: halfWidth, y: halfHeight, width: halfWidth, height: halfHeight,
                trigger: { x: rect.width - 60, y: availableHeight - 60, width: 60, height: 60 }
            },
            // Top two-thirds (for content-heavy apps)
            {
                name: 'top-two-thirds',
                x: 0, y: 0, width: fullWidth, height: twoThirdsHeight,
                trigger: { x: rect.width * 0.2, y: 0, width: rect.width * 0.6, height: 15 }
            },
            // Center third (for focused work)
            {
                name: 'center-third',
                x: oneThirdWidth, y: oneThirdHeight, width: oneThirdWidth, height: oneThirdHeight,
                trigger: { x: rect.width * 0.4, y: availableHeight * 0.4, width: rect.width * 0.2, height: availableHeight * 0.2 }
            }
        ];
    }
        
    handleWindowDragSnapping(e) {
        if (!this.dragState.draggedWindow) return;
        
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        
        // Prioritize corner snaps, then edge snaps
        const cornerZones = this.dragState.snapZones.filter(zone =>
            zone.name.includes('quarter') || zone.name.includes('corner')
        );
        const edgeZones = this.dragState.snapZones.filter(zone => 
            zone.name.includes('half') || zone.name.includes('third')
        );
        const specialZones = this.dragState.snapZones.filter(zone => 
            zone.name.includes('fullscreen') || zone.name.includes('center')
        );
        
        // Check corners first (highest priority)
        let activeZone = cornerZones.find(zone => this.isInTriggerArea(mouseX, mouseY, zone.trigger));
        
        // Then check edges if no corner match
        if (!activeZone) {
            activeZone = edgeZones.find(zone => this.isInTriggerArea(mouseX, mouseY, zone.trigger));
        }
        
        // Finally check special zones
        if (!activeZone) {
            activeZone = specialZones.find(zone => this.isInTriggerArea(mouseX, mouseY, zone.trigger));
        }
        
        // Show/hide snap preview
        this.showSnapPreview(activeZone);
    }
    
    isInTriggerArea(mouseX, mouseY, trigger) {
        return mouseX >= trigger.x && mouseX <= trigger.x + trigger.width &&
               mouseY >= trigger.y && mouseY <= trigger.y + trigger.height;
    }
    
    showSnapPreview(zone) {
        // Remove existing preview
        const existingPreview = document.querySelector('.snap-preview');
        if (existingPreview) {
            existingPreview.remove();
        }
        
        if (zone) {
            // Create snap preview
            const preview = document.createElement('div');
            preview.className = 'snap-preview';
            preview.style.cssText = `
                position: fixed;
                left: ${zone.x}px;
                top: ${zone.y}px;
                width: ${zone.width}px;
                height: ${zone.height}px;
                background: rgba(220, 53, 69, 0.3);
                border: 2px solid rgba(220, 53, 69, 0.8);
                pointer-events: none;
                z-index: 10000;
                border-radius: 8px;
                backdrop-filter: blur(2px);
            `;
            document.body.appendChild(preview);
            
            // Store active zone for snap release
            this.dragState.activeSnapZone = zone;
        } else {
            this.dragState.activeSnapZone = null;
        }
    }
    
    handleWindowSnapRelease(e) {
        const window = this.dragState.draggedWindow;
        const zone = this.dragState.activeSnapZone;
        
        // Remove snap preview
        const preview = document.querySelector('.snap-preview');
        if (preview) {
            preview.remove();
        }
        
        // Apply snap if in zone
        if (window && zone) {
            this.snapWindowToZone(window, zone);
        }
        
        // Reset drag state
        this.dragState.isDragging = false;
        this.dragState.draggedWindow = null;
        this.dragState.activeSnapZone = null;
    }
    
    snapWindowToZone(windowElement, zone) {
        // Animate window to snap position
        windowElement.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
        windowElement.style.left = zone.x + 'px';
        windowElement.style.top = zone.y + 'px';
        windowElement.style.width = zone.width + 'px';
        windowElement.style.height = zone.height + 'px';
        
        // Add snapped class for styling
        windowElement.classList.add('window-snapped');
        
        // Disable resize handles when snapped
        const resizeHandles = windowElement.querySelectorAll('.window-resize-handle');
        resizeHandles.forEach(handle => {
            handle.style.display = 'none';
        });
        
        // Update window data
        const windowId = windowElement.getAttribute('data-window-id');
        const windowData = this.windows.get(windowId);
        if (windowData) {
            windowData.x = zone.x;
            windowData.y = zone.y;
            windowData.width = zone.width;
            windowData.height = zone.height;
            windowData.isSnapped = true;
            windowData.snapZone = zone.name;
            windowData.preSnapState = {
                x: windowData.x,
                y: windowData.y,
                width: windowData.width,
                height: windowData.height
            };
        }
        
        // Remove transition after animation
        setTimeout(() => {
            windowElement.style.transition = '';
        }, 300);
        
        console.log(`Window snapped to ${zone.name} (${zone.width}x${zone.height})`);
    }
    
    unSnapWindow(windowElement) {
        // Remove snapped class
        windowElement.classList.remove('window-snapped');
        
        // Re-enable resize handles
        const resizeHandles = windowElement.querySelectorAll('.window-resize-handle');
        resizeHandles.forEach(handle => {
            handle.style.display = '';
        });
        
        // Update window data
        const windowId = windowElement.getAttribute('data-window-id');
        const windowData = this.windows.get(windowId);
        if (windowData) {
            windowData.isSnapped = false;
            windowData.snapZone = null;
        }
    }
    
    setupDragBoundaries() {
        // Ensure windows can't be dragged outside the desktop area
        // This is handled in the window creation and drag handlers
    }
    
    handleKeyboardShortcuts(e) {
        // Handle keyboard shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 't':
                    e.preventDefault();
                    this.launchApp('terminal');
                    break;
                case 'e':
                    e.preventDefault();
                    this.launchApp('vibecode');
                    break;
                case 'w':
                    if (this.activeWindow) {
                        e.preventDefault();
                        this.closeWindow(this.activeWindow);
                    }
                    break;
            }
        }
    }
    
    showContextMenu(x, y) {
        const contextMenu = document.getElementById('context-menu');
        contextMenu.style.left = x + 'px';
        contextMenu.style.top = y + 'px';
        contextMenu.classList.remove('hidden');
        
        // Hide context menu when clicking elsewhere
        const hideMenu = (e) => {
            if (!contextMenu.contains(e.target)) {
                contextMenu.classList.add('hidden');
                document.removeEventListener('click', hideMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', hideMenu);
        }, 10);
    }
    
    showTaskbarContextMenu(x, y) {
        console.log('SwissKnife: Showing taskbar context menu at', x, y);
        
        // Create taskbar context menu if it doesn't exist
        let taskbarMenu = document.getElementById('taskbar-context-menu');
        if (!taskbarMenu) {
            taskbarMenu = document.createElement('div');
            taskbarMenu.id = 'taskbar-context-menu';
            taskbarMenu.className = 'context-menu hidden';
            taskbarMenu.innerHTML = `
                <div class="context-menu-item" data-action="task-manager">Task Manager</div>
                <div class="context-menu-item" data-action="system-settings">System Settings</div>
                <div class="context-menu-item" data-action="about">About SwissKnife</div>
            `;
            document.body.appendChild(taskbarMenu);
            
            // Add event listeners for menu items
            taskbarMenu.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                if (action) {
                    console.log('SwissKnife: Taskbar context menu action:', action);
                    this.handleTaskbarMenuAction(action);
                    taskbarMenu.classList.add('hidden');
                }
            });
        }
        
        taskbarMenu.style.left = x + 'px';
        taskbarMenu.style.top = y + 'px';
        taskbarMenu.classList.remove('hidden');
        
        // Hide menu when clicking elsewhere
        const hideMenu = (e) => {
            if (!taskbarMenu.contains(e.target)) {
                taskbarMenu.classList.add('hidden');
                document.removeEventListener('click', hideMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', hideMenu);
        }, 10);
    }
    
    showTaskbarAppContextMenu(x, y, windowId) {
        console.log('SwissKnife: Showing taskbar app context menu for window:', windowId);
        
        // Create taskbar app context menu if it doesn't exist
        let appMenu = document.getElementById('taskbar-app-context-menu');
        if (!appMenu) {
            appMenu = document.createElement('div');
            appMenu.id = 'taskbar-app-context-menu';
            appMenu.className = 'context-menu hidden';
            appMenu.innerHTML = `
                <div class="context-menu-item" data-action="restore">Restore</div>
                <div class="context-menu-item" data-action="minimize">Minimize</div>
                <div class="context-menu-item" data-action="maximize">Maximize</div>
                <div class="context-menu-separator"></div>
                <div class="context-menu-item" data-action="close">Close</div>
            `;
            document.body.appendChild(appMenu);
            
            // Add event listeners for menu items
            appMenu.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                if (action && this.currentAppWindowId) {
                    console.log('SwissKnife: Taskbar app context menu action:', action, 'for window:', this.currentAppWindowId);
                    this.handleAppMenuAction(action, this.currentAppWindowId);
                    appMenu.classList.add('hidden');
                }
            });
        }
        
        // Store the window ID for the menu action handler
        this.currentAppWindowId = windowId;
        
        appMenu.style.left = x + 'px';
        appMenu.style.top = y + 'px';
        appMenu.classList.remove('hidden');
        
        // Hide menu when clicking elsewhere
        const hideMenu = (e) => {
            if (!appMenu.contains(e.target)) {
                appMenu.classList.add('hidden');
                document.removeEventListener('click', hideMenu);
                this.currentAppWindowId = null;
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', hideMenu);
        }, 10);
    }
    
    handleTaskbarMenuAction(action) {
        console.log('SwissKnife: Handling taskbar menu action:', action);
        switch (action) {
            case 'task-manager':
                // Open task manager (could be implemented as an app)
                console.log('SwissKnife: Opening task manager');
                break;
            case 'system-settings':
                // Open system settings
                console.log('SwissKnife: Opening system settings');
                break;
            case 'about':
                // Show about dialog
                console.log('SwissKnife: Showing about dialog');
                this.showAboutDialog();
                break;
        }
    }
    
    handleAppMenuAction(action, windowId) {
        console.log('SwissKnife: Handling app menu action:', action, 'for window:', windowId);
        const windowElement = document.getElementById(windowId);
        if (!windowElement) {
            console.error('SwissKnife: Window not found:', windowId);
            return;
        }
        
        switch (action) {
            case 'restore':
                this.restoreWindow(windowId);
                break;
            case 'minimize':
                this.minimizeWindow(windowId);
                break;
            case 'maximize':
                this.maximizeWindow(windowId);
                break;
            case 'close':
                this.closeWindow(windowId);
                break;
        }
    }
    
    showAboutDialog() {
        console.log('SwissKnife: Showing about dialog');
        // Create a simple about dialog
        const aboutDialog = document.createElement('div');
        aboutDialog.className = 'modal-overlay';
        aboutDialog.innerHTML = `
            <div class="modal-content">
                <h2>About SwissKnife Desktop</h2>
                <p>SwissKnife Desktop Environment</p>
                <p>Version 1.0.0</p>
                <p>A modern web-based desktop experience</p>
                <button onclick="this.closest('.modal-overlay').remove()">Close</button>
            </div>
        `;
        document.body.appendChild(aboutDialog);
    }
    
    startSystemMonitoring() {
        // Monitor system performance, memory usage, etc.
        setInterval(() => {
            // Update system metrics
            this.updateSystemMetrics();
        }, 10000);
    }
    
    updateSystemMetrics() {
        // Collect and display system metrics
        const metrics = {
            memory: performance.memory ? {
                used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
                limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
            } : null,
            windows: this.windows.size,
            fps: this.calculateFPS()
        };
        
        // Could display these in a system monitor or debug panel
        console.debug('System metrics:', metrics);
    }
    
    calculateFPS() {
        // Simple FPS calculation
        // Implementation would track frame rates
        return 60; // Placeholder
    }
    
    loadExistingCrons() {
        const savedCrons = JSON.parse(localStorage.getItem('swissknife-crons') || '[]');
        savedCrons.forEach(cron => {
            if (cron.status === 'active') {
                this.scheduleCronJob(cron);
            }
        });
        console.log(`Loaded ${savedCrons.filter(c => c.status === 'active').length} active cron jobs`);
    }
    
    loadAPIKeysApp(contentElement) {
        contentElement.innerHTML = `
            <div class="api-keys-app">
                <div class="app-header">
                    <h2>🔑 API Key Manager</h2>
                    <p>Manage your API keys for various services</p>
                </div>
                
                <div class="api-keys-content">
                    <div class="api-keys-list">
                        <div class="api-key-item">
                            <div class="api-key-service">🤖 OpenAI</div>
                            <div class="api-key-status">
                                <span class="status-indicator ${localStorage.getItem('swissknife_openai_key') ? 'active' : 'inactive'}">
                                    ${localStorage.getItem('swissknife_openai_key') ? 'Configured' : 'Not Set'}
                                </span>
                            </div>
                            <div class="api-key-actions">
                                <button class="btn-small" onclick="this.closest('.api-keys-app').querySelector('#openai-key-input').style.display='block'">
                                    ${localStorage.getItem('swissknife_openai_key') ? 'Update' : 'Set'}
                                </button>
                                ${localStorage.getItem('swissknife_openai_key') ? '<button class="btn-small btn-danger" onclick="localStorage.removeItem(\'swissknife_openai_key\'); location.reload();">Remove</button>' : ''}
                            </div>
                        </div>
                        
                        <div class="api-key-input-group" id="openai-key-input" style="display: none;">
                            <input type="password" id="openai-key" placeholder="Enter your OpenAI API key" value="${localStorage.getItem('swissknife_openai_key') || ''}">
                            <button onclick="localStorage.setItem('swissknife_openai_key', document.getElementById('openai-key').value); location.reload();" class="btn-primary">Save</button>
                            <button onclick="document.getElementById('openai-key-input').style.display='none'" class="btn-secondary">Cancel</button>
                        </div>
                        
                        <div class="api-key-item">
                            <div class="api-key-service">🧠 Anthropic</div>
                            <div class="api-key-status">
                                <span class="status-indicator inactive">Not Set</span>
                            </div>
                            <div class="api-key-actions">
                                <button class="btn-small">Set</button>
                            </div>
                        </div>
                        
                        <div class="api-key-item">
                            <div class="api-key-service">🌐 IPFS</div>
                            <div class="api-key-status">
                                <span class="status-indicator inactive">Not Connected</span>
                            </div>
                            <div class="api-key-actions">
                                <button class="btn-small">Configure</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="api-keys-help">
                        <h3>📖 Help</h3>
                        <p>• API keys are stored locally in your browser</p>
                        <p>• Keys are never transmitted except to their respective services</p>
                        <p>• You can remove keys at any time</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    loadMCPControlApp(contentElement) {
        contentElement.innerHTML = `
            <div class="mcp-control-app">
                <div class="app-header">
                    <h2>🔌 MCP Server Control</h2>
                    <p>Manage Model Context Protocol servers</p>
                </div>
                
                <div class="mcp-servers-list">
                    <div class="mcp-server-item">
                        <div class="mcp-server-info">
                            <div class="mcp-server-name">Local File System</div>
                            <div class="mcp-server-url">mcp://localhost:3000</div>
                        </div>
                        <div class="mcp-server-status">
                            <span class="status-indicator active">Connected</span>
                        </div>
                        <div class="mcp-server-actions">
                            <button class="btn-small">Configure</button>
                            <button class="btn-small btn-danger">Disconnect</button>
                        </div>
                    </div>
                    
                    <div class="mcp-server-item">
                        <div class="mcp-server-info">
                            <div class="mcp-server-name">IPFS Gateway</div>
                            <div class="mcp-server-url">mcp://ipfs:5001</div>
                        </div>
                        <div class="mcp-server-status">
                            <span class="status-indicator inactive">Disconnected</span>
                        </div>
                        <div class="mcp-server-actions">
                            <button class="btn-small">Connect</button>
                            <button class="btn-small">Configure</button>
                        </div>
                    </div>
                </div>
                
                <div class="mcp-add-server">
                    <h3>Add New Server</h3>
                    <div class="form-group">
                        <input type="text" placeholder="Server Name" class="form-control">
                        <input type="url" placeholder="MCP Server URL" class="form-control">
                        <button class="btn-primary">Add Server</button>
                    </div>
                </div>
            </div>
        `;
    }
    
    loadTaskManagerApp(contentElement) {
        contentElement.innerHTML = `
            <div class="task-manager-app">
                <div class="app-header">
                    <h2>⚡ Task Manager</h2>
                    <p>Monitor system performance and running processes</p>
                </div>
                
                <div class="task-tabs">
                    <button class="task-tab active" data-tab="processes">Processes</button>
                    <button class="task-tab" data-tab="performance">Performance</button>
                    <button class="task-tab" data-tab="network">Network</button>
                </div>
                
                <div class="task-content">
                    <div class="task-tab-content active" id="processes">
                        <div class="process-list">
                            <div class="process-item">
                                <div class="process-name">SwissKnife Desktop</div>
                                <div class="process-cpu">15%</div>
                                <div class="process-memory">42 MB</div>
                                <div class="process-status">Running</div>
                            </div>
                            <div class="process-item">
                                <div class="process-name">AI Engine</div>
                                <div class="process-cpu">8%</div>
                                <div class="process-memory">128 MB</div>
                                <div class="process-status">Running</div>
                            </div>
                            <div class="process-item">
                                <div class="process-name">IPFS Node</div>
                                <div class="process-cpu">2%</div>
                                <div class="process-memory">64 MB</div>
                                <div class="process-status">Stopped</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    loadModelBrowserApp(contentElement) {
        contentElement.innerHTML = `
            <div class="model-browser-app">
                <div class="app-header">
                    <h2>🧠 Model Browser</h2>
                    <p>Browse and manage AI models</p>
                </div>
                
                <div class="model-categories">
                    <button class="model-category active">All Models</button>
                    <button class="model-category">Language</button>
                    <button class="model-category">Vision</button>
                    <button class="model-category">Audio</button>
                    <button class="model-category">Local</button>
                </div>
                
                <div class="model-grid">
                    <div class="model-card">
                        <div class="model-icon">🤖</div>
                        <div class="model-info">
                            <div class="model-name">GPT-4</div>
                            <div class="model-provider">OpenAI</div>
                            <div class="model-description">Advanced language model</div>
                        </div>
                        <div class="model-status">
                            <span class="status-indicator ${localStorage.getItem('swissknife_openai_key') ? 'active' : 'inactive'}">
                                ${localStorage.getItem('swissknife_openai_key') ? 'Available' : 'API Key Required'}
                            </span>
                        </div>
                    </div>
                    
                    <div class="model-card">
                        <div class="model-icon">👁️</div>
                        <div class="model-info">
                            <div class="model-name">CLIP</div>
                            <div class="model-provider">Local</div>
                            <div class="model-description">Vision-language model</div>
                        </div>
                        <div class="model-status">
                            <span class="status-indicator inactive">Not Loaded</span>
                        </div>
                    </div>
                    
                    <div class="model-card">
                        <div class="model-icon">🎵</div>
                        <div class="model-info">
                            <div class="model-name">Whisper</div>
                            <div class="model-provider">OpenAI</div>
                            <div class="model-description">Speech recognition</div>
                        </div>
                        <div class="model-status">
                            <span class="status-indicator inactive">Not Available</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    loadIPFSExplorerApp(contentElement) {
        contentElement.innerHTML = `
            <div class="ipfs-explorer-app">
                <div class="app-header">
                    <h2>🌐 IPFS Explorer</h2>
                    <p>Explore the InterPlanetary File System</p>
                </div>
                
                <div class="ipfs-toolbar">
                    <input type="text" placeholder="Enter IPFS hash or path" class="ipfs-address-bar">
                    <button class="btn-primary">Go</button>
                    <button class="btn-secondary">Pin</button>
                </div>
                
                <div class="ipfs-status">
                    <div class="ipfs-connection">
                        <span class="status-indicator inactive">Disconnected</span>
                        <span>No IPFS node detected</span>
                    </div>
                </div>
                
                <div class="ipfs-content">
                    <!-- Dynamic content for IPFS files and folders will be loaded here -->
                </div>
            </div>
        `;
    }
    
    loadTerminalApp(contentElement) {
        contentElement.innerHTML = `
            <div class="terminal-app">
                <div class="app-header">
                    <h2>🖥️ SwissKnife Terminal</h2>
                    <p>Run SwissKnife CLI commands in your browser</p>
                </div>
                <div class="terminal-window" id="terminal-window">
                    <div class="terminal-output" id="terminal-output"></div>
                    <input class="terminal-input" id="terminal-input" placeholder="Type a command..." autofocus />
                </div>
            </div>
        `;
        // ... Optionally add JS for terminal emulation ...
    }

    loadAIChatApp(contentElement) {
        contentElement.innerHTML = `
            <div class="ai-chat-app">
                <div class="app-header">
                    <h2>🤖 AI Chat</h2>
                    <p>Chat with SwissKnife AI</p>
                </div>
                <div class="chat-window" id="chat-window"></div>
                <div class="chat-input-bar">
                    <input type="text" id="chat-input" placeholder="Ask me anything..." />
                    <button class="btn-primary" id="chat-send">Send</button>
                </div>
            </div>
        `;
        // ... Optionally add JS for chat functionality ...
    }

    loadFileManagerApp(contentElement) {
        contentElement.innerHTML = `
            <div class="file-manager-app">
                <div class="app-header">
                    <h2>📁 File Manager</h2>
                    <p>Browse and manage your files</p>
                </div>
                <div class="file-list" id="file-list">
                    <div class="file-item">📄 README.md</div>
                    <div class="file-item">📁 src/</div>
                    <div class="file-item">📁 web/</div>
                </div>
            </div>
        `;
        // ... Optionally add JS for file management ...
    }

    loadVibeCodeApp(contentElement) {
        contentElement.innerHTML = `
            <div class="vibecode-app">
                <div class="app-header">
                    <h2>📝 VibeCode Editor</h2>
                    <p>Lightweight code editing in the browser</p>
                </div>
                <textarea class="vibecode-editor" style="width:100%;height:calc(100% - 80px);"></textarea>
            </div>
        `;
    }

    loadSettingsApp(contentElement) {
        contentElement.innerHTML = `
            <div class="settings-app">
                <div class="app-header">
                    <h2>⚙️ Settings</h2>
                    <p>Customize your SwissKnife Desktop experience</p>
                </div>
                <div class="settings-list">
                    <div class="settings-item">
                        <label>Theme</label>
                        <button class="btn-small" onclick="desktop.toggleTheme()">Toggle Day/Sunset</button>
                    </div>
                    <div class="settings-item">
                        <label>Reset Layout</label>
                        <button class="btn-small" onclick="location.reload()">Reset</button>
                    </div>
                </div>
            </div>
        `;
    }

    loadDeviceManagerApp(contentElement) {
        contentElement.innerHTML = `
            <div class="device-manager-app">
                <div class="app-header">
                    <h2>🔧 Device Manager</h2>
                    <p>View and manage system devices</p>
                </div>
                
                <div class="device-tabs">
                    <button class="device-tab active" data-tab="devices">Devices</button>
                    <button class="device-tab" data-tab="drivers">Drivers</button>
                    <button class="device-tab" data-tab="performance">Performance</button>
                </div>
                
                <div class="device-content">
                    <!-- Devices Tab -->
                    <div class="device-tab-content active" id="devices-tab">
                        <div class="device-tree">
                            <div class="device-category">
                                <div class="category-header">
                                    <span class="category-icon">🖥️</span>
                                    <span class="category-name">Display adapters</span>
                                    <span class="expand-icon">▼</span>
                                </div>
                                <div class="category-items">
                                    <div class="device-item">
                                        <span class="device-icon">📺</span>
                                        <span class="device-name">Generic Display Adapter</span>
                                        <span class="device-status working">Working</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="device-category">
                                <div class="category-header">
                                    <span class="category-icon">🔊</span>
                                    <span class="category-name">Audio devices</span>
                                    <span class="expand-icon">▼</span>
                                </div>
                                <div class="category-items">
                                    <div class="device-item">
                                        <span class="device-icon">🎵</span>
                                        <span class="device-name">Default Audio Device</span>
                                        <span class="device-status working">Working</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="device-category">
                                <div class="category-header">
                                    <span class="category-icon">🖱️</span>
                                    <span class="category-name">Input devices</span>
                                    <span class="expand-icon">▼</span>
                                </div>
                                <div class="category-items">
                                    <div class="device-item">
                                        <span class="device-icon">⌨️</span>
                                        <span class="device-name">Standard Keyboard</span>
                                        <span class="device-status working">Working</span>
                                    </div>
                                    <div class="device-item">
                                        <span class="device-icon">🖱️</span>
                                        <span class="device-name">Standard Mouse</span>
                                        <span class="device-status working">Working</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="device-category">
                                <div class="category-header">
                                    <span class="category-icon">🌐</span>
                                    <span class="category-name">Network adapters</span>
                                    <span class="expand-icon">▼</span>
                                </div>
                                <div class="category-items">
                                    <div class="device-item">
                                        <span class="device-icon">📡</span>
                                        <span class="device-name">Network Adapter</span>
                                        <span class="device-status working">Working</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Drivers Tab -->
                    <div class="device-tab-content" id="drivers-tab">
                        <div class="drivers-list">
                            <div class="driver-item">
                                <div class="driver-info">
                                    <div class="driver-name">Browser WebGL Driver</div>
                                    <div class="driver-version">Version 1.0.0</div>
                                    <div class="driver-date">Date: ${new Date().toLocaleDateString()}</div>
                                </div>
                                <div class="driver-status working">Up to date</div>
                            </div>
                            
                            <div class="driver-item">
                                <div class="driver-info">
                                    <div class="driver-name">Web Audio API Driver</div>
                                    <div class="driver-version">Version 1.0.0</div>
                                    <div class="driver-date">Date: ${new Date().toLocaleDateString()}</div>
                                </div>
                                <div class="driver-status working">Up to date</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Performance Tab -->
                    <div class="device-tab-content" id="performance-tab">
                        <div class="performance-metrics">
                            <div class="metric-card">
                                <div class="metric-title">CPU Usage</div>
                                <div class="metric-value" id="cpu-usage">0%</div>
                                <div class="metric-bar">
                                    <div class="metric-fill" style="width: 0%"></div>
                                </div>
                            </div>
                            
                            <div class="metric-card">
                                <div class="metric-title">Memory Usage</div>
                                <div class="metric-value" id="memory-usage">0 MB</div>
                                <div class="metric-bar">
                                    <div class="metric-fill" style="width: 0%"></div>
                                </div>
                            </div>
                            
                            <div class="metric-card">
                                <div class="metric-title">GPU Memory</div>
                                <div class="metric-value" id="gpu-memory">Unknown</div>
                                <div class="metric-bar">
                                    <div class="metric-fill" style="width: 0%"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add tab switching functionality
        const tabButtons = contentElement.querySelectorAll('.device-tab');
        const tabContents = contentElement.querySelectorAll('.device-tab-content');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.dataset.tab;
                
                // Remove active class from all tabs and contents
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                
                // Add active class to clicked tab and corresponding content
                button.classList.add('active');
                const targetContent = contentElement.querySelector(`#${tabName}-tab`);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
            });
        });
        
        // Add category expand/collapse functionality
        const categoryHeaders = contentElement.querySelectorAll('.category-header');
        categoryHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const category = header.parentElement;
                const items = category.querySelector('.category-items');
                const expandIcon = header.querySelector('.expand-icon');
                
                if (category.classList.contains('collapsed')) {
                    category.classList.remove('collapsed');
                    items.style.display = 'block';
                    expandIcon.textContent = '▼';
                } else {
                    category.classList.add('collapsed');
                    items.style.display = 'none';
                    expandIcon.textContent = '▶';
                }
            });
        });
        
        // Simulate performance metrics
        const updatePerformanceMetrics = () => {
            const cpuUsage = Math.floor(Math.random() * 100);
            const memoryUsage = Math.floor(Math.random() * 8192); // MB
            
            const cpuElement = contentElement.querySelector('#cpu-usage');
            const memoryElement = contentElement.querySelector('#memory-usage');
            
            if (cpuElement) {
                cpuElement.textContent = `${cpuUsage}%`;
                const cpuBar = cpuElement.parentElement.querySelector('.metric-fill');
                if (cpuBar) cpuBar.style.width = `${cpuUsage}%`;
            }
            
            if (memoryElement) {
                memoryElement.textContent = `${memoryUsage} MB`;
                const memoryBar = memoryElement.parentElement.querySelector('.metric-fill');
                if (memoryBar) memoryBar.style.width = `${(memoryUsage / 8192) * 100}%`;
            }
        };
        
        // Update performance metrics every 2 seconds
        const performanceInterval = setInterval(updatePerformanceMetrics, 2000);
        updatePerformanceMetrics(); // Initial update
        
        // Clean up interval when window is closed
        const windowElement = contentElement.closest('.window');
        if (windowElement) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.removedNodes.forEach((node) => {
                            if (node === windowElement) {
                                clearInterval(performanceInterval);
                                observer.disconnect();
                            }
                        });
                    }
                });
            });
            observer.observe(windowElement.parentElement, { childList: true });
        }
    }

    loadNaviApp(contentElement) {
        // Check if the chat app exists before creating iframe
        const chatAppPath = window.location.origin + '/chat/webapp/app.html';
        
        contentElement.innerHTML = `
            <div class="navi-app" style="width: 100%; height: 100%; position: relative;">
                <div class="navi-loading" style="display: flex; align-items: center; justify-content: center; height: 100%; background: #f5f5f5;">
                    <div style="text-align: center;">
                        <img src="/assets/icons/navi-icon.png" style="width: 64px; height: 64px; border-radius: 8px; margin-bottom: 16px;">
                        <h3>Loading NAVI...</h3>
                        <p>Initializing chat application</p>
                    </div>
                </div>
            </div>
        `;
        
        // Test if chat app is available first
        fetch(chatAppPath, { method: 'HEAD' })
            .then(response => {
                if (response.ok) {
                    // Chat app exists, load it in iframe
                    this.loadNaviIframe(contentElement, chatAppPath);
                } else {
                    // Chat app not found, show placeholder
                    this.showNaviPlaceholder(contentElement);
                }
            })
            .catch(() => {
                // Network error or chat app not available
                this.showNaviPlaceholder(contentElement);
            });
    }
    
    loadNaviIframe(contentElement, chatAppPath) {
        const iframe = document.createElement('iframe');
        iframe.src = chatAppPath;
        iframe.style.cssText = `
            width: 100%; 
            height: 100%; 
            border: none; 
            background: white;
        `;
        iframe.allow = "camera; microphone; autoplay";
        iframe.sandbox = "allow-scripts allow-same-origin allow-forms allow-popups allow-modals";
        iframe.title = "NAVI Chat Application";
        
        // Handle iframe load success
        iframe.addEventListener('load', () => {
            const loadingDiv = contentElement.querySelector('.navi-loading');
            if (loadingDiv) {
                loadingDiv.style.display = 'none';
            }
        });
        
        // Handle iframe load errors
        iframe.addEventListener('error', () => {
            this.showNaviPlaceholder(contentElement);
        });
        
        // Add cleanup when window is closed
        const windowElement = contentElement.closest('.window');
        if (windowElement) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.removedNodes.forEach((node) => {
                            if (node === windowElement) {
                                // Clean up iframe when window is closed
                                if (iframe.parentNode) {
                                    iframe.src = 'about:blank';
                                    iframe.remove();
                                }
                                observer.disconnect();
                            }
                        });
                    }
                });
            });
            observer.observe(windowElement.parentElement, { childList: true });
        }
        
        contentElement.querySelector('.navi-app').appendChild(iframe);
    }
    
    showNaviPlaceholder(contentElement) {
        contentElement.innerHTML = `
            <div class="app-placeholder" style="padding: 20px; text-align: center; height: 100%; display: flex; flex-direction: column; justify-content: center;">
                <img src="/assets/icons/navi-icon.png" style="width: 64px; height: 64px; border-radius: 8px; margin: 0 auto 16px;">
                <h2>NAVI Chat Application</h2>
                <p>The NAVI chat application is not currently available.</p>
                <p>Please ensure the chat application is properly installed in the <code>/chat</code> directory.</p>
                <div style="margin-top: 20px;">
                    <button onclick="location.reload()" style="margin: 5px; padding: 8px 16px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Reload Application
                    </button>
                    <button onclick="this.closest('.window').querySelector('.window-control.close').click()" style="margin: 5px; padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Close
                    </button>
                </div>
            </div>
        `;
    }

    showDesktopProperties() {
        this.launchApp('settings');
    }
    
    openTerminalHere() {
        this.launchApp('terminal');
    }
    
    createNewFile() {
        // TODO: Implement file creation
        console.log('Create new file requested');
    }
    
    createNewFolder() {
        // TODO: Implement folder creation
        console.log('Create new folder requested');
    }
    
    refreshDesktop() {
        location.reload();
    }
    
    showAbout() {
        this.createWindow({
            title: 'About SwissKnife Web Desktop',
            width: 400,
            height: 300,
            content: `
                <div class="about-content" style="padding: 20px; text-align: center;">
                    <h2>🇨🇭 SwissKnife Web Desktop</h2>
                    <p>Version 1.0.0</p>
                    <p>A Windows 7 Aero-inspired desktop environment for the browser</p>
                    <p>Built with Swiss precision 🏔️</p>
                    <br>
                    <p><strong>Features:</strong></p>
                    <ul style="text-align: left; display: inline-block;">
                        <li>AI-powered terminal and chat</li>
                        <li>File management</li>
                        <li>Code editing with VibeCode</li>
                        <li>IPFS integration</li>
                        <li>Window snapping and Aero effects</li>
                    </ul>
                </div>
            `
        });
    }

    setupMockApiHandlers() {
        // Intercept and mock API calls that would normally go to a backend server
        const originalFetch = window.fetch;
        window.fetch = async (url, options = {}) => {
            // Handle status endpoints that don't exist in static hosting
            if (url.includes('/status') || url.includes('/api/status')) {
                console.log(`Mocking API call to: ${url}`);
                return new Response(JSON.stringify({
                    status: 'ok',
                    version: '1.0.0',
                    services: {
                        ipfs: false,
                        ai: true,
                        storage: true
                    },
                    timestamp: new Date().toISOString()
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            
            // For all other requests, use the original fetch
            return originalFetch(url, options);
        };
    }
}

window.addEventListener('DOMContentLoaded', () => {
    // Initialize SwissKnife Desktop when DOM is fully loaded
    window.desktop = new SwissKnifeDesktop();
});