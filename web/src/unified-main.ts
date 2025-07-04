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

// Enhanced Streamlit Editor
import { StreamlitEditorApp } from './apps/streamlit-editor';

class UnifiedSwissKnifeApp {
    private stlite: StliteManager;
    private legacySystemReady: boolean = false;

    constructor() {
        this.init();
    }

    private async init() {
        console.log('🚀 UNIFIED: Initializing enhanced SwissKnife Web Desktop...');

        // Initialize unified stlite management FIRST
        await this.initializeStlite();
        
        // Wait for legacy system to be ready, then enhance it
        this.waitForLegacySystem();
        
        console.log('✅ UNIFIED: Enhanced SwissKnife Web Desktop ready!');
    }

    private async initializeStlite() {
        // Unified stlite initialization - replaces all the scattered scripts
        this.stlite = new StliteManager();
        await this.stlite.initialize();
        
        console.log('✅ UNIFIED: Stlite management system ready');
    }

    private waitForLegacySystem() {
        // Wait for the legacy main.js system to initialize
        const checkLegacySystem = () => {
            if (window.desktop && window.desktop.apps) {
                this.legacySystemReady = true;
                this.enhanceLegacySystem();
            } else {
                setTimeout(checkLegacySystem, 100);
            }
        };
        
        checkLegacySystem();
    }

    private enhanceLegacySystem() {
        console.log('� UNIFIED: Enhancing legacy system with unified features...');
        
        // Replace the old vibecode app with unified Streamlit Editor
        this.enhanceVibeCodeApp();
        
        // Add global unified access
        this.setupGlobalAccess();
        
        console.log('✅ UNIFIED: Legacy system enhanced successfully');
    }

    private enhanceVibeCodeApp() {
        // Override the legacy VibeCodeApp with our unified version
        if (window.desktop && window.desktop.apps) {
            const vibeCodeConfig = window.desktop.apps.get('vibecode');
            if (vibeCodeConfig) {
                // Update the app configuration
                vibeCodeConfig.name = 'Streamlit Editor';
                vibeCodeConfig.icon = '⭐';
                vibeCodeConfig.title = 'Unified Streamlit Development Environment';
                
                // Store reference to unified stlite
                vibeCodeConfig.stliteManager = this.stlite;
                
                console.log('✅ UNIFIED: VibeCode enhanced with unified Streamlit editor');
            }
        }
        
        // Enhance the vibecode app launch to use unified stlite
        const originalLaunchApp = window.desktop?.launchApp?.bind(window.desktop);
        if (originalLaunchApp) {
            window.desktop.launchApp = (appId: string) => {
                if (appId === 'vibecode') {
                    console.log('🚀 UNIFIED: Launching enhanced Streamlit Editor...');
                    this.launchUnifiedStreamlitEditor();
                } else {
                    originalLaunchApp(appId);
                }
            };
        }
    }

    private launchUnifiedStreamlitEditor() {
        // Create enhanced Streamlit Editor using the legacy window system
        if (window.desktop && window.desktop.createWindow) {
            const streamlitApp = new StreamlitEditorApp({
                swissknife: (window as any).swissknife,
                stlite: this.stlite,
                windows: (window as any).desktop
            });

            const appWindow = (window as any).desktop.createWindow({
                title: '⭐ Streamlit Editor',
                icon: '⭐',
                content: streamlitApp.render(),
                width: 1200,
                height: 800,
                app: streamlitApp
            });

            streamlitApp.onMount(appWindow);
            
            console.log('✅ UNIFIED: Enhanced Streamlit Editor launched successfully');
        }
    }

    private setupGlobalAccess() {
        // Provide global access to unified features
        window.unifiedSwissKnife = this;
        window.stliteManager = this.stlite;
        
        // Enhanced debugging capabilities
        window.debugUnified = {
            stliteStatus: () => this.stlite.getStatus(),
            isStliteReady: () => this.stlite.isReady(),
            isRealStlite: () => this.stlite.isRealStlite(),
            launchStreamlitEditor: () => this.launchUnifiedStreamlitEditor(),
            systemReady: () => this.legacySystemReady
        };
        
        console.log('🔧 UNIFIED: Global access and debugging tools available');
    }

    // Public API
    public getStliteManager(): StliteManager {
        return this.stlite;
    }

    public isReady(): boolean {
        return this.legacySystemReady && this.stlite.isReady();
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
