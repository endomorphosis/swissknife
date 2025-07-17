import { BrowserEventEmitter } from '../utils/browser-utils';

export class SwissKnifeConfigAdapter extends BrowserEventEmitter {
  private initialized = false;
  private config: Record<string, any> = {};

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    console.log('Initializing SwissKnife Config Adapter (mock for web)...');
    this.loadBrowserConfig();
    this.initialized = true;
    console.log('✅ SwissKnife Config Adapter (mock) initialized');
  }

  private loadBrowserConfig(): void {
    try {
      const storedConfig = localStorage.getItem('swissknife_browser_config');
      this.config = storedConfig ? JSON.parse(storedConfig) : {};
    } catch (error) {
      console.warn('Failed to load browser config:', error);
      this.config = {};
    }
  }

  get(key: string, defaultValue?: any): any {
    if (!this.initialized) {
      console.warn('Config adapter not initialized. Returning default value.');
      return defaultValue;
    }
    return this.config[key] !== undefined ? this.config[key] : defaultValue;
  }

  set(key: string, value: any): void {
    if (!this.initialized) {
      console.warn('Config adapter not initialized. Cannot set value.');
      return;
    }
    this.config[key] = value;
    localStorage.setItem('swissknife_browser_config', JSON.stringify(this.config));
    this.emit('configChanged', { key, value });
  }

  async dispose(): Promise<void> {
    console.log('Disposing SwissKnifeConfigAdapter (mock) resources...');
    this.initialized = false;
  }
}
