/**
 * Browser utilities for SwissKnife
 */

/**
 * Generate a unique identifier
 */
export function generateId(): string {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

/**
 * Get API URL with proper base
 */
export function getApiUrl(path: string, baseUrl?: string): string {
  const base = baseUrl || detectBaseUrl();
  return `${base}${path.startsWith('/') ? path : '/' + path}`;
}

/**
 * Get stored secret key for API authentication
 */
export function getSecretKey(): string | null {
  try {
    return localStorage.getItem('goose_secret_key') || 
           localStorage.getItem('swissknife_secret_key') || 
           null;
  } catch (error) {
    console.warn('Could not get secret key:', error);
    return null;
  }
}

/**
 * Detect base URL for API calls
 */
export function detectBaseUrl(): string {
  try {
    const config = localStorage.getItem('gooseConfig');
    if (config) {
      const parsed = JSON.parse(config);
      if (parsed.GOOSE_PORT) {
        return `http://localhost:${parsed.GOOSE_PORT}`;
      }
    }
  } catch (error) {
    console.warn('Could not detect base URL from config:', error);
  }
  
  // Default fallback
  return 'http://localhost:8000';
}

/**
 * Simple event emitter for browser
 */
export class BrowserEventEmitter {
  private events: { [key: string]: Function[] } = {};

  on(event: string, callback: Function): void {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }

  emit(event: string, ...args: any[]): void {
    if (this.events[event]) {
      this.events[event].forEach(callback => callback(...args));
    }
  }

  off(event: string, callback?: Function): void {
    if (!this.events[event]) return;
    
    if (callback) {
      this.events[event] = this.events[event].filter(cb => cb !== callback);
    } else {
      this.events[event] = [];
    }
  }
}

/**
 * Browser storage utility
 */
export class BrowserStorage {
  static set(key: string, value: any): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn('Failed to save to localStorage:', error);
    }
  }

  static get(key: string): any {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.warn('Failed to read from localStorage:', error);
      return null;
    }
  }

  static remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('Failed to remove from localStorage:', error);
    }
  }
}

/**
 * Simple HTTP client for browser
 */
export class BrowserHttp {
  static async get(url: string, options: RequestInit = {}): Promise<any> {
    const response = await fetch(url, {
      method: 'GET',
      ...options
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  }

  static async post(url: string, data: any, options: RequestInit = {}): Promise<any> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: JSON.stringify(data),
      ...options
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  }
}

/**
 * Browser-compatible file operations
 */
export class BrowserFileSystem {
  static async readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  static downloadFile(content: string, filename: string, mimeType = 'text/plain'): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

/**
 * Utility to check browser capabilities
 */
export function getBrowserCapabilities() {
  return {
    webWorkers: typeof Worker !== 'undefined',
    indexedDB: typeof indexedDB !== 'undefined',
    localStorage: typeof localStorage !== 'undefined',
    fetch: typeof fetch !== 'undefined',
    webAssembly: typeof WebAssembly !== 'undefined',
    serviceWorker: 'serviceWorker' in navigator,
    webGL: (() => {
      try {
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
      } catch (e) {
        return false;
      }
    })()
  };
}
