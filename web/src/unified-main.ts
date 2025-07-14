// SwissKnife Unified Web Application
// This enhances the existing system with unified stlite integration

import '../css/aero-enhanced.css';
import '../css/desktop.css';
import '../css/windows.css';
import '../css/terminal.css';
import '../css/apps.css';
import '../css/strudel.css';

// Unified Stlite integration
import { StliteManager } from './core/stlite-manager';
import { BrowserStorageAdapter } from './adapters/browser-storage-adapter';
import { initializeErrorLogger, logError } from './utils/error-logger';

// Enhanced Streamlit Editor
import { StreamlitEditor } from './apps/streamlit-editor';

class UnifiedSwissKnifeApp {
    private stlite: StliteManager;
    private storageAdapter: BrowserStorageAdapter;

    constructor() {
        this.storageAdapter = new BrowserStorageAdapter({ type: 'indexeddb' }); // Or 'localstorage' or 'memory'
        initializeErrorLogger(this.storageAdapter);
        this.init();
    }

    private async init() {
        console.log('🚀 UNIFIED: Initializing enhanced SwissKnife Web Desktop...');

        if (!(window as any).desktop) {
            (window as any).desktop = {
                createWindow: (options: any) => {
                    const windowsContainer = document.getElementById('windows-container');
                    if (!windowsContainer) {
                        logError('Windows container not found!');
                        return;
                    }

                    const windowElement = document.createElement('div');
                    windowElement.className = 'window';
                    windowElement.style.cssText = `
                        position: absolute;
                        top: 50px;
                        left: 50px;
                        width: ${options.width || 800}px;
                        height: ${options.height || 600}px;
                        background: white;
                        border: 1px solid #ccc;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                        z-index: 1000;
                        display: flex;
                        flex-direction: column;
                    `;

                    const titleBar = document.createElement('div');
                    titleBar.style.cssText = `
                        background: #f0f0f0;
                        padding: 8px 12px;
                        border-bottom: 1px solid #ccc;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        cursor: move;
                    `;
                    titleBar.innerHTML = `
                        <span>${options.title || 'New Window'}</span>
                        <button onclick="this.closest('.window').remove()" style="background: #ff5f56; color: white; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer;">×</button>
                    `;

                    const contentElement = document.createElement('div');
                    contentElement.style.cssText = `
                        flex: 1;
                        overflow: auto;
                    `;
                    if (typeof options.content === 'string') {
                        contentElement.innerHTML = options.content;
                    } else if (options.content instanceof HTMLElement) {
                        contentElement.appendChild(options.content);
                    }

                    windowElement.appendChild(titleBar);
                    windowElement.appendChild(contentElement);
                    windowsContainer.appendChild(windowElement);

                    // Make window draggable
                    let isDragging = false;
                    let dragOffset = { x: 0, y: 0 };

                    titleBar.addEventListener('mousedown', (e: MouseEvent) => {
                        isDragging = true;
                        const rect = windowElement.getBoundingClientRect();
                        dragOffset.x = e.clientX - rect.left;
                        dragOffset.y = e.clientY - rect.top;
                    });

                    document.addEventListener('mousemove', (e: MouseEvent) => {
                        if (isDragging) {
                            windowElement.style.left = (e.clientX - dragOffset.x) + 'px';
                            windowElement.style.top = (e.clientY - dragOffset.y) + 'px';
                        }
                    });

                    document.addEventListener('mouseup', () => {
                        isDragging = false;
                    });

                    return windowElement;
                }
            };
        }

        // Initialize unified stlite management FIRST
        await this.initializeStlite();
        
        this.initializeBasicDesktop();
        
        console.log('✅ UNIFIED: Enhanced SwissKnife Web Desktop ready!');
    }

    private async initializeStlite() {
        // Unified stlite initialization - replaces all the scattered scripts
        this.stlite = new StliteManager();
        await this.stlite.initialize();
        
        console.log('✅ UNIFIED: Stlite management system ready');
    }

    private initializeBasicDesktop() {
        // Basic desktop icon click handlers
        const icons = document.querySelectorAll('.icon[data-app]');
        icons.forEach(icon => {
            icon.addEventListener('click', (e) => {
                const app = (e.currentTarget as HTMLElement).getAttribute('data-app');
                console.log(`📱 Opening app: ${app}`);
                
                if (app === 'vibecode') {
                    this.launchUnifiedStreamlitEditor();
                } else {
                    console.log(`⚠️ App ${app} not yet implemented in this build`);
                }
            });
        });

        // Update system time
        this.updateSystemTime();
        setInterval(() => this.updateSystemTime(), 1000);
    }

    private updateSystemTime() {
        const timeElement = document.getElementById('system-time');
        if (timeElement) {
            const now = new Date();
            timeElement.textContent = now.toLocaleTimeString();
        }
    }

    private launchUnifiedStreamlitEditor() {
        const streamlitApp = new StreamlitEditor({
            swissknife: (window as any).swissknife,
            stlite: this.stlite,
            windows: (window as any).desktop // Pass the desktop object
        });

        const appWindow = streamlitApp.createWindow(); // Use the createWindow method from StreamlitEditor
        streamlitApp.onMount(appWindow); // Call onMount after the window is created and mounted to DOM
    }

    private setupGlobalAccess() {
        // Provide global access to unified features
        window.unifiedSwissKnife = this;
        window.stliteManager = this.stlite;
        
        console.log('🔧 UNIFIED: Global access and debugging tools available');
    }

    // Public API
    public getStliteManager(): StliteManager {
        return this.stlite;
    }
}

// Enhanced global interface
declare global {
    interface Window {
        unifiedSwissKnife: UnifiedSwissKnifeApp;
        stliteManager: StliteManager;
        debugUnified: any;
        desktop: any;
        swissknife: any;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.unifiedSwissKnife = new UnifiedSwissKnifeApp();
});

export default UnifiedSwissKnifeApp;
