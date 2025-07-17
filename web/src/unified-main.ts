// SwissKnife Unified Web Application
// This enhances the existing system with unified stlite integration

import '../css/aero-enhanced.css';
import '../css/desktop.css';
import '../css/windows.css';
import '../css/terminal.css';
import '../css/apps.css';
import '../css/strudel.css';

// Polyfills for Node.js globals
(window as any).process = (window as any).process || {};
(window as any).process.env = (window as any).process.env || {};
(window as any).Buffer = (window as any).Buffer || require('buffer').Buffer;

// Unified Stlite integration
import { StliteManager } from './core/stlite-manager';
import { BrowserStorageAdapter } from './adapters/browser-storage-adapter';
import { initializeErrorLogger, logError } from './utils/error-logger';
import SwissKnifeBrowser from '../js/swissknife-browser'; // Import SwissKnifeBrowser
import { Desktop as SwissKnifeDesktop } from './desktop-core'; // Import the main desktop core

// Enhanced Streamlit Editor
import { StreamlitEditor } from './apps/streamlit-editor';

class UnifiedSwissKnifeApp {
    private stlite: StliteManager;
    private storageAdapter: BrowserStorageAdapter;
    private swissknife: typeof SwissKnifeBrowser; // Type for SwissKnifeBrowser
    private desktop: SwissKnifeDesktop; // Type for SwissKnifeDesktop

    constructor() {
        this.storageAdapter = new BrowserStorageAdapter({ type: 'indexeddb' }); // Or 'localstorage' or 'memory'
        initializeErrorLogger(this.storageAdapter);
        this.swissknife = SwissKnifeBrowser; // Assign the imported SwissKnifeBrowser
        this.desktop = new SwissKnifeDesktop(); // Initialize the main desktop core
        this.init();
    }

    private async init() {
        console.log('🚀 UNIFIED: Initializing enhanced SwissKnife Web Desktop...');

        // Initialize SwissKnifeBrowser
        await this.swissknife.initialize({
            config: { storage: 'localstorage' },
            storage: { type: 'indexeddb', dbName: 'swissknife-web' },
            ai: { autoRegisterModels: true, autoRegisterTools: true },
            openaiApiKey: localStorage.getItem('swissknife_openai_key')
        });
        (window as any).swissknife = this.swissknife; // Make it globally accessible for now

        // Initialize the main desktop
        await this.desktop.init();
        (window as any).desktop = this.desktop; // Make it globally accessible

        // Initialize unified stlite management FIRST
        await this.initializeStlite();
        
        this.initializeDesktopApps(); // Use the desktop's app initialization
        this.setupGlobalAccess();
        
        console.log('✅ UNIFIED: Enhanced SwissKnife Web Desktop ready!');
    }

    private async initializeStlite() {
        // Unified stlite initialization - replaces all the scattered scripts
        this.stlite = new StliteManager();
        await this.stlite.initialize();
        
        console.log('✅ UNIFIED: Stlite management system ready');
    }

    private initializeDesktopApps() {
        // Use the desktop's existing app launching mechanism
        const icons = document.querySelectorAll('.icon[data-app]');
        icons.forEach(icon => {
            icon.addEventListener('click', (e) => {
                const app = (e.currentTarget as HTMLElement).getAttribute('data-app');
                console.log(`📱 Opening app: ${app}`);
                
                if (app === 'vibecode') {
                    this.launchUnifiedStreamlitEditor();
                } else {
                    // Use the desktop's launchApp for other applications
                    this.desktop.launchApp(app);
                }
            });
        });

        // Update system time (handled by desktop-core)
        // this.updateSystemTime();
        // setInterval(() => this.updateSystemTime(), 1000);
    }

    private launchUnifiedStreamlitEditor() {
        const streamlitApp = new StreamlitEditor({
            swissknife: this.swissknife, // Pass the initialized swissknife instance
            stlite: this.stlite,
            windows: this.desktop // Pass the desktop instance
        });

        // Use the desktop's createWindow method
        this.desktop.createWindow({
            title: 'VibeCode Editor',
            icon: '📝',
            appId: 'vibecode',
            width: 1000,
            height: 700
        }).then(appWindow => {
            streamlitApp.onMount(appWindow);
        });
    }

    private setupGlobalAccess() {
        // Provide global access to unified features
        window.unifiedSwissKnife = this;
        window.stliteManager = this.stlite;
        window.swissknife = this.swissknife; // Ensure global access to swissknife instance
        window.desktop = this.desktop; // Ensure global access to desktop instance
        
        console.log('🔧 UNIFIED: Global access and debugging tools available');
    }

    // Public API
    public getStliteManager(): StliteManager {
        return this.stlite;
    }

    public getSwissKnife(): typeof SwissKnifeBrowser {
        return this.swissknife;
    }

    public getDesktop(): SwissKnifeDesktop {
        return this.desktop;
    }
}

// Enhanced global interface
declare global {
    interface Window {
        unifiedSwissKnife: UnifiedSwissKnifeApp;
        stliteManager: StliteManager;
        debugUnified: any;
        desktop: SwissKnifeDesktop; // Stronger typing
        swissknife: typeof SwissKnifeBrowser; // Stronger typing
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.unifiedSwissKnife = new UnifiedSwissKnifeApp();
});

export default UnifiedSwissKnifeApp;
