/**
 * Simple SwissKnife Desktop Implementation
 * Lightweight version without complex TypeScript dependencies
 */

export class SimpleSwissKnifeDesktop {
    private windows = new Map();
    private windowCounter = 0;

    constructor() {
        this.init();
    }

    private init() {
        console.log('🖥️ Initializing Simple SwissKnife Desktop...');
        this.setupDesktopIcons();
        this.setupSystemMenu();
        this.setupTaskbar();
        this.updateTime();
        setInterval(() => this.updateTime(), 1000);
    }

    private setupDesktopIcons() {
        const icons = document.querySelectorAll('.desktop-icons .icon');
        console.log(`🎯 Setting up ${icons.length} desktop icons`);

        icons.forEach(icon => {
            const htmlIcon = icon as HTMLElement;
            const appId = htmlIcon.dataset.app;
            
            if (appId) {
                icon.addEventListener('click', (e) => {
                    e.preventDefault();
                    console.log(`🚀 Launching app: ${appId}`);
                    this.launchApp(appId);
                });
            }
        });
    }

    private setupSystemMenu() {
        const systemMenuBtn = document.querySelector('.system-menu-button');
        const systemMenu = document.getElementById('system-menu');

        if (systemMenuBtn && systemMenu) {
            systemMenuBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleSystemMenu();
            });

            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (!systemMenu.contains(target) && !systemMenuBtn.contains(target)) {
                    systemMenu.classList.add('hidden');
                    systemMenu.classList.remove('visible');
                }
            });
        }
    }

    private setupTaskbar() {
        const taskbar = document.getElementById('taskbar');
        if (taskbar) {
            console.log('📊 Taskbar initialized');
        }
    }

    private toggleSystemMenu() {
        const menu = document.getElementById('system-menu');
        if (menu) {
            if (menu.classList.contains('visible')) {
                menu.classList.remove('visible');
                menu.classList.add('hidden');
            } else {
                menu.classList.add('visible');
                menu.classList.remove('hidden');
            }
        }
    }

    private launchApp(appId: string) {
        console.log(`🚀 Launching application: ${appId}`);
        
        const apps: Record<string, any> = {
            'terminal': { name: 'SwissKnife Terminal', icon: '🖥️', content: 'Terminal interface for SwissKnife commands and AI interactions.' },
            'vibecode': { name: 'VibeCode Editor', icon: '📝', content: 'Advanced code editor with AI-powered assistance and syntax highlighting.' },
            'ai-chat': { name: 'AI Chat Assistant', icon: '🤖', content: 'Intelligent AI assistant for coding, analysis, and general assistance.' },
            'file-manager': { name: 'File Manager', icon: '📁', content: 'Browse and manage your files and folders with advanced features.' },
            'task-manager': { name: 'Task Manager', icon: '⚡', content: 'Monitor and manage running processes and system resources.' },
            'model-browser': { name: 'Model Browser', icon: '🧠', content: 'Browse and manage AI models from various providers and sources.' },
            'ipfs-explorer': { name: 'IPFS Explorer', icon: '🌐', content: 'Explore the InterPlanetary File System and distributed storage.' },
            'settings': { name: 'Settings', icon: '⚙️', content: 'Configure your SwissKnife desktop environment and preferences.' },
            'mcp-control': { name: 'MCP Server Control', icon: '🔌', content: 'Manage Model Context Protocol servers and connections.' },
            'api-keys': { name: 'API Key Manager', icon: '🔑', content: 'Securely manage API keys for various AI and cloud services.' }
        };

        const app = apps[appId];
        if (!app) {
            console.warn(`❌ Unknown app: ${appId}`);
            return;
        }

        // Check if app is already open
        if (this.windows.has(appId)) {
            this.focusWindow(this.windows.get(appId));
            return;
        }

        const window = this.createWindow(appId, app.name, app.icon, app.content);
        this.windows.set(appId, window);
        this.addToTaskbar(appId, app.name, app.icon);
    }

    private createWindow(appId: string, title: string, icon: string, content: string): HTMLElement {
        const container = document.getElementById('windows-container') || document.body;
        const windowId = `window-${appId}-${++this.windowCounter}`;
        
        const window = document.createElement('div');
        window.id = windowId;
        window.className = 'window focused';
        window.style.position = 'absolute';
        window.style.left = `${100 + (this.windowCounter - 1) * 30}px`;
        window.style.top = `${100 + (this.windowCounter - 1) * 30}px`;
        window.style.width = '600px';
        window.style.height = '400px';
        window.style.zIndex = '1000';

        window.innerHTML = `
            <div class="window-titlebar">
                <span style="margin-right: 8px;">${icon}</span>
                <div class="window-title">${title}</div>
                <div class="window-controls">
                    <button class="window-control minimize" title="Minimize">−</button>
                    <button class="window-control maximize" title="Maximize">□</button>
                    <button class="window-control close" title="Close">×</button>
                </div>
            </div>
            <div class="window-content">
                <h3>${icon} ${title}</h3>
                <p>${content}</p>
                <br>
                <p><strong>Features:</strong></p>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>Full Aero glass transparency effects</li>
                    <li>Swiss Alps background visible through glass</li>
                    <li>Draggable and resizable windows</li>
                    <li>Taskbar integration</li>
                    <li>Window snapping support</li>
                </ul>
                <br>
                <p><em>This is a demo window showing the ${title} application interface.</em></p>
            </div>
        `;

        container.appendChild(window);
        this.makeWindowDraggable(window);
        this.makeWindowResizable(window);
        this.setupWindowControls(window, appId);
        this.focusWindow(window);

        return window;
    }

    private makeWindowDraggable(window: HTMLElement) {
        const titlebar = window.querySelector('.window-titlebar') as HTMLElement;
        if (!titlebar) return;

        let isDragging = false;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        titlebar.addEventListener('mousedown', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('window-control')) return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(window.style.left) || 0;
            startTop = parseInt(window.style.top) || 0;

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            this.focusWindow(window);
            e.preventDefault();
        });

        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            window.style.left = `${startLeft + deltaX}px`;
            window.style.top = `${startTop + deltaY}px`;
        };

        const handleMouseUp = () => {
            isDragging = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }

    private makeWindowResizable(window: HTMLElement) {
        const resizeHandle = document.createElement('div');
        resizeHandle.style.cssText = `
            position: absolute;
            bottom: 0;
            right: 0;
            width: 20px;
            height: 20px;
            cursor: se-resize;
            background: rgba(255, 255, 255, 0.1);
            border-top-left-radius: 4px;
        `;

        window.appendChild(resizeHandle);

        let isResizing = false;
        let startX = 0, startY = 0, startWidth = 0, startHeight = 0;

        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(window.style.width);
            startHeight = parseInt(window.style.height);

            document.addEventListener('mousemove', handleResize);
            document.addEventListener('mouseup', stopResize);
            e.preventDefault();
        });

        const handleResize = (e: MouseEvent) => {
            if (!isResizing) return;
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            const newWidth = Math.max(320, startWidth + deltaX);
            const newHeight = Math.max(200, startHeight + deltaY);
            window.style.width = `${newWidth}px`;
            window.style.height = `${newHeight}px`;
        };

        const stopResize = () => {
            isResizing = false;
            document.removeEventListener('mousemove', handleResize);
            document.removeEventListener('mouseup', stopResize);
        };
    }

    private setupWindowControls(window: HTMLElement, appId: string) {
        const closeBtn = window.querySelector('.window-control.close');
        const minimizeBtn = window.querySelector('.window-control.minimize');
        const maximizeBtn = window.querySelector('.window-control.maximize');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeWindow(window, appId));
        }

        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => this.minimizeWindow(window));
        }

        if (maximizeBtn) {
            maximizeBtn.addEventListener('click', () => this.toggleMaximize(window));
        }
    }

    private focusWindow(window: HTMLElement) {
        document.querySelectorAll('.window').forEach(w => w.classList.remove('focused'));
        window.classList.add('focused');
    }

    private closeWindow(window: HTMLElement, appId: string) {
        window.remove();
        this.windows.delete(appId);
        this.removeFromTaskbar(appId);
    }

    private minimizeWindow(window: HTMLElement) {
        window.style.display = 'none';
    }

    private toggleMaximize(window: HTMLElement) {
        if (window.classList.contains('maximized')) {
            window.classList.remove('maximized');
            window.style.width = '600px';
            window.style.height = '400px';
            window.style.top = '100px';
            window.style.left = '100px';
        } else {
            window.classList.add('maximized');
            window.style.width = '100%';
            window.style.height = 'calc(100vh - 48px)';
            window.style.top = '0';
            window.style.left = '0';
        }
    }

    private addToTaskbar(appId: string, appName: string, appIcon: string) {
        const taskbar = document.getElementById('taskbar-apps');
        if (!taskbar) return;

        const item = document.createElement('div');
        item.className = 'taskbar-app active';
        item.id = `taskbar-${appId}`;
        item.innerHTML = `<span>${appIcon}</span><span>${appName}</span>`;
        
        item.addEventListener('click', () => {
            const window = this.windows.get(appId);
            if (window) {
                if (window.style.display === 'none') {
                    window.style.display = 'flex';
                    this.focusWindow(window);
                } else {
                    this.focusWindow(window);
                }
            }
        });

        taskbar.appendChild(item);
    }

    private removeFromTaskbar(appId: string) {
        const item = document.getElementById(`taskbar-${appId}`);
        if (item) {
            item.remove();
        }
    }

    private updateTime() {
        const timeElement = document.getElementById('system-time');
        if (timeElement) {
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            timeElement.textContent = timeStr;
        }
    }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new SimpleSwissKnifeDesktop();
    console.log('✅ SwissKnife Web Desktop loaded successfully!');
});
