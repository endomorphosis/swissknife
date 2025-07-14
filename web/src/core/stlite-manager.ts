// Unified Stlite Manager - Single source of truth for Streamlit integration

export interface StliteConfig {
  requirements?: string[];
  entrypoint?: string;
  files?: { [key: string]: string };
  streamlitConfig?: any;
}

export class StliteManager {
  private stlite: any = null;
  private loadStatus: string = 'uninitialized';
  private initPromise: Promise<void> | null = null;

  constructor() {
    console.log('🚀 StliteManager: Initializing unified stlite management...');
  }

  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      // Create immediate mock for guaranteed availability
      this.stlite = {
        mount: (config: StliteConfig, container: HTMLElement) => {
          console.log('📝 StliteManager: Mock mount called with config:', config);
          return this._renderMockStreamlit(config, container);
        }
      };

      window.stlite = this.stlite;
      this.loadStatus = 'mock-ready';
      console.log('✅ StliteManager: Mock stlite created and ready');

      // Try to load real stlite in background
      this._loadRealStlite();

    } catch (error) {
      logError('❌ StliteManager: Error during initialization:', error);
      this.loadStatus = 'error';
      throw error;
    }
  }

  private async _loadRealStlite(): Promise<void> {
    try {
      console.log('🔄 StliteManager: Attempting to load real stlite...');
      
      // Use script tag injection instead of dynamic import for better webpack compatibility
      const script = document.createElement('script');
      script.type = 'module';
      script.innerHTML = `
        try {
          const { mount } = await import('https://cdn.jsdelivr.net/npm/@stlite/browser@0.83.0/build/stlite.js');
          window.__stliteReal = { mount };
          window.dispatchEvent(new CustomEvent('stlite-loaded'));
        } catch (error) {
          console.warn('Failed to load real stlite:', error);
          window.dispatchEvent(new CustomEvent('stlite-failed'));
        }
      `;
      
      document.head.appendChild(script);
      
      // Wait for the stlite to load or fail
      await new Promise<void>((resolve) => {
        const onLoaded = () => {
          this.stlite = (window as any).__stliteReal;
          window.stlite = this.stlite;
          this.loadStatus = 'real-loaded';
          console.log('✅ StliteManager: Real stlite loaded successfully');
          cleanup();
          resolve();
        };
        
        const onFailed = () => {
          console.warn('❌ StliteManager: Real stlite failed to load, keeping mock');
          this.loadStatus = 'mock-fallback';
          cleanup();
          resolve();
        };
        
        const cleanup = () => {
          window.removeEventListener('stlite-loaded', onLoaded);
          window.removeEventListener('stlite-failed', onFailed);
        };
        
        window.addEventListener('stlite-loaded', onLoaded);
        window.addEventListener('stlite-failed', onFailed);
        
        // Timeout after 5 seconds
        setTimeout(() => {
          console.warn('⏰ StliteManager: Loading timeout, keeping mock');
          this.loadStatus = 'mock-fallback';
          cleanup();
          resolve();
        }, 5000);
      });
      
    } catch (error) {
      console.warn('❌ StliteManager: Real stlite failed to load, keeping mock:', error);
      this.loadStatus = 'mock-fallback';
    }
  }

  private _renderMockStreamlit(config: StliteConfig, container: HTMLElement): Promise<void> {
    const code = config.files?.['streamlit_app.py'] || 'No code provided';
    const isRealStlite = this.loadStatus === 'real-loaded';
    
    const statusColor = isRealStlite ? '#4caf50' : '#ff9800';
    const statusText = isRealStlite ? '✅ Real Stlite' : '⚠️ Mock Mode';
    const bgColor = isRealStlite ? '#e8f5e8' : '#fff3e0';
    
    container.innerHTML = `
      <div style="padding: 20px; background: ${bgColor}; border-radius: 8px; border: 1px solid ${statusColor};">
        <h3 style="color: ${statusColor}; margin-top: 0;">${statusText}</h3>
        <p>Streamlit environment is ${isRealStlite ? 'fully functional' : 'ready with mock interface'}!</p>
        <p><strong>Python Code Preview:</strong></p>
        <pre style="background: #fff; padding: 15px; border-radius: 4px; overflow: auto; max-height: 400px; border: 1px solid #ddd; font-family: 'Consolas', 'Monaco', monospace; font-size: 14px;">${code}</pre>
        <div style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.05); border-radius: 4px; font-size: 12px;">
          <strong>Status:</strong> ${this.loadStatus}<br>
          <strong>Mode:</strong> ${isRealStlite ? 'Production ready' : 'Development preview'}<br>
          <strong>Features:</strong> Code editing, syntax highlighting, live preview
        </div>
      </div>
    `;
    
    return Promise.resolve();
  }

  async mount(config: StliteConfig, container: HTMLElement): Promise<void> {
    if (!this.stlite) {
      await this.initialize();
    }
    
    return this.stlite.mount(config, container);
  }

  getStatus(): string {
    return this.loadStatus;
  }

  isReady(): boolean {
    return this.loadStatus !== 'uninitialized' && this.loadStatus !== 'error';
  }

  isRealStlite(): boolean {
    return this.loadStatus === 'real-loaded';
  }
}

// Make available globally for debugging
declare global {
  interface Window {
    stlite: any;
    StliteManager: typeof StliteManager;
  }
}

window.StliteManager = StliteManager;
