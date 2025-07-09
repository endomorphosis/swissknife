import { BrowserEventEmitter } from '../utils/browser-utils';
// Assuming these are available from the core SwissKnife project
import { ConfigManager } from '@swissknife/core/config/config-manager';
import { EnvironmentDetector } from '@swissknife/core/config/environment-detector';

export class SwissKnifeConfigAdapter extends BrowserEventEmitter {
  private configManager: ConfigManager;
  private environmentDetector: EnvironmentDetector;
  private initialized = false;

  constructor() {
    super();
    // Initialize with dummy values for now, actual initialization in `initialize`
    this.configManager = {} as ConfigManager;
    this.environmentDetector = {} as EnvironmentDetector;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('Initializing SwissKnife Config Adapter...');
    this.configManager = ConfigManager.getInstance();
    this.environmentDetector = new EnvironmentDetector();
    
    await this.loadConfiguration();
    await this.detectEnvironment();

    this.initialized = true;
    console.log('✅ SwissKnife Config Adapter initialized');
  }

  private async loadConfiguration() {
    console.log('Loading configuration...');
    // Load from multiple sources
    const browserConfig = this.loadBrowserConfig();
    const serverConfig = await this.loadServerConfig();
    const localConfig = await this.loadLocalConfig();
    
    // Merge configurations with priority
    this.configManager.merge([localConfig, serverConfig, browserConfig]);
  }

  private loadBrowserConfig(): any {
    // Load configuration from browser-specific storage (e.g., localStorage, IndexedDB)
    console.log('Loading browser configuration...');
    try {
      const storedConfig = localStorage.getItem('swissknife_browser_config');
      return storedConfig ? JSON.parse(storedConfig) : {};
    } catch (error) {
      console.warn('Failed to load browser config:', error);
      return {};
    }
  }

  private async loadServerConfig(): Promise<any> {
    // Fetch configuration from a backend server
    console.log('Loading server configuration...');
    try {
      const response = await fetch('/api/config'); // Assuming a config API endpoint
      if (response.ok) {
        return await response.json();
      }
      console.warn('Failed to fetch server config:', response.statusText);
      return {};
    } catch (error) {
      console.warn('Error fetching server config:', error);
      return {};
    }
  }

  private async loadLocalConfig(): Promise<any> {
    // Load configuration from local file system (if File System Access API is available)
    console.log('Loading local configuration...');
    // This would typically involve using the SwissKnifeStorageAdapter's localFileSystem
    // For now, a placeholder
    return {};
  }

  private async detectEnvironment(): Promise<void> {
    console.log('Detecting environment...');
    // Use EnvironmentDetector to set environment-specific configurations
    // Example: this.environmentDetector.detectAndApply(this.configManager);
  }

  // Public methods to access configuration
  get(key: string, defaultValue?: any): any {
    if (!this.initialized) {
      console.warn('Config adapter not initialized. Returning default value.');
      return defaultValue;
    }
    return this.configManager.get(key, defaultValue);
  }

  set(key: string, value: any): void {
    if (!this.initialized) {
      console.warn('Config adapter not initialized. Cannot set value.');
      return;
    }
    this.configManager.set(key, value);
    // Optionally, persist changes to browser storage
    localStorage.setItem('swissknife_browser_config', JSON.stringify(this.configManager.getAll()));
    this.emit('configChanged', { key, value });
  }

  // Dispose method for cleanup
  async dispose(): Promise<void> {
    console.log('Disposing SwissKnifeConfigAdapter resources...');
    this.initialized = false;
    // Any cleanup logic here
  }
}
