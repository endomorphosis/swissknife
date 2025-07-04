/**
 * Browser-compatible Config Manager
 * Uses localStorage for configuration storage.
 */
export class BrowserConfigManager {
  private config: Record<string, any> = {};
  private storageKey: string = 'swissknife-browser-config';

  constructor(options?: { storage?: string; debug?: boolean }) {
    // Load existing config from localStorage
    try {
      const storedConfig = localStorage.getItem(this.storageKey);
      if (storedConfig) {
        this.config = JSON.parse(storedConfig);
      }
    } catch (error) {
      console.warn('Failed to load config from localStorage:', error);
    }
  }

  get<T>(key: string, defaultValue?: T): T | undefined {
    const value = this.config[key];
    if (value === undefined && defaultValue !== undefined) {
      return defaultValue;
    }
    return value as T | undefined;
  }

  set(key: string, value: any): void {
    this.config[key] = value;
    this.saveConfig();
  }

  private saveConfig(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.config));
    } catch (error) {
      console.error('Failed to save config to localStorage:', error);
    }
  }

  // Optional: Method to clear all config
  clear(): void {
    this.config = {};
    localStorage.removeItem(this.storageKey);
  }
}
