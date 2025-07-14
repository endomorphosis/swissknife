/**
 * Browser Storage Adapter
 * 
 * Adapts the SwissKnife storage system for browser environments
 * using IndexedDB, localStorage, or memory storage
 */

export interface BrowserStorageOptions {
  type: 'localstorage' | 'indexeddb' | 'memory';
  dbName?: string;
  version?: number;
}

export interface StorageItemMetadata {
  contentType?: string;
  size?: number;
  createdAt: number;
  updatedAt?: number;
  tags?: string[];
  [key: string]: any;
}

export interface ListOptions {
  limit?: number;
  prefix?: string;
  offset?: number;
  tag?: string | string[];
  sortBy?: 'createdAt' | 'updatedAt' | 'size';
  sortDirection?: 'asc' | 'desc';
}

export interface AddOptions {
  filename?: string;
  contentType?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  pin?: boolean;
  wrapWithDirectory?: boolean;
  onlyHash?: boolean;
}

export class BrowserStorageAdapter {
  private storageType: string;
  private dbName: string;
  private db: IDBDatabase | null = null;
  private memoryStore: Map<string, any> = new Map();

  constructor(options: BrowserStorageOptions) {
    this.storageType = options.type;
    this.dbName = options.dbName || 'swissknife-web';
  }

  async initialize(): Promise<void> {
    switch (this.storageType) {
      case 'indexeddb':
        await this.initializeIndexedDB();
        break;
      case 'localstorage':
        // localStorage is ready immediately
        break;
      case 'memory':
        // Memory storage is ready immediately
        break;
      default:
        throw new Error(`Unsupported storage type: ${this.storageType}`);
    }
  }

  private async initializeIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object stores for different data types
        if (!db.objectStoreNames.contains('data')) {
          db.createObjectStore('data', { keyPath: 'key' });
        }
        
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files', { keyPath: 'path' });
        }
        
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config', { keyPath: 'key' });
        }
        
        if (!db.objectStoreNames.contains('errors')) {
          db.createObjectStore('errors', { keyPath: 'timestamp' });
        }
      };
    });
  }

  async store(key: string, data: any): Promise<void> {
    switch (this.storageType) {
      case 'indexeddb':
        return this.storeIndexedDB(key, data);
      case 'localstorage':
        return this.storeLocalStorage(key, data);
      case 'memory':
        return this.storeMemory(key, data);
    }
  }

  async retrieve(key: string): Promise<any> {
    switch (this.storageType) {
      case 'indexeddb':
        return this.retrieveIndexedDB(key);
      case 'localstorage':
        return this.retrieveLocalStorage(key);
      case 'memory':
        return this.retrieveMemory(key);
    }
  }

  async delete(key: string): Promise<void> {
    switch (this.storageType) {
      case 'indexeddb':
        return this.deleteIndexedDB(key);
      case 'localstorage':
        return this.deleteLocalStorage(key);
      case 'memory':
        return this.deleteMemory(key);
    }
  }

  async list(prefix?: string): Promise<string[]> {
    switch (this.storageType) {
      case 'indexeddb':
        return this.listIndexedDB(prefix);
      case 'localstorage':
        return this.listLocalStorage(prefix);
      case 'memory':
        return this.listMemory(prefix);
      default:
        return [];
    }
  }

  async saveErrorLog(error: ErrorLogEntry): Promise<void> {
    switch (this.storageType) {
      case 'indexeddb':
        return this.saveErrorLogIndexedDB(error);
      case 'localstorage':
        return this.saveErrorLogLocalStorage(error);
      case 'memory':
        return this.saveErrorLogMemory(error);
    }
  }

  async getErrorLogs(): Promise<ErrorLogEntry[]> {
    switch (this.storageType) {
      case 'indexeddb':
        return this.getErrorLogsIndexedDB();
      case 'localstorage':
        return this.getErrorLogsLocalStorage();
      case 'memory':
        return this.getErrorLogsMemory();
      default:
        return [];
    }
  }

  async clearErrorLogs(): Promise<void> {
    switch (this.storageType) {
      case 'indexeddb':
        return this.clearErrorLogsIndexedDB();
      case 'localstorage':
        return this.clearErrorLogsLocalStorage();
      case 'memory':
        return this.clearErrorLogsMemory();
    }
  }

  // IndexedDB implementations
  private async storeIndexedDB(key: string, data: any): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['data'], 'readwrite');
      const store = transaction.objectStore('data');
      const request = store.put({ key, data, timestamp: Date.now() });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async retrieveIndexedDB(key: string): Promise<any> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['data'], 'readonly');
      const store = transaction.objectStore('data');
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.data : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async deleteIndexedDB(key: string): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['data'], 'readwrite');
      const store = transaction.objectStore('data');
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async listIndexedDB(prefix?: string): Promise<string[]> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['data'], 'readonly');
      const store = transaction.objectStore('data');
      const request = store.getAllKeys();

      request.onsuccess = () => {
        let keys = request.result as string[];
        if (prefix) {
          keys = keys.filter(key => key.startsWith(prefix));
        }
        resolve(keys);
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async saveErrorLogIndexedDB(error: ErrorLogEntry): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['errors'], 'readwrite');
      const store = transaction.objectStore('errors');
      const request = store.put(error);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async getErrorLogsIndexedDB(): Promise<ErrorLogEntry[]> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['errors'], 'readonly');
      const store = transaction.objectStore('errors');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as ErrorLogEntry[]);
      request.onerror = () => reject(request.error);
    });
  }

  private async clearErrorLogsIndexedDB(): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['errors'], 'readwrite');
      const store = transaction.objectStore('errors');
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // localStorage implementations
  private async storeLocalStorage(key: string, data: any): Promise<void> {
    try {
      const serialized = JSON.stringify({
        data,
        timestamp: Date.now()
      });
      localStorage.setItem(`swissknife:${key}`, serialized);
    } catch (error) {
      throw new Error(`Failed to store in localStorage: ${error}`);
    }
  }

  private async retrieveLocalStorage(key: string): Promise<any> {
    try {
      const item = localStorage.getItem(`swissknife:${key}`);
      if (!item) return null;
      
      const parsed = JSON.parse(item);
      return parsed.data;
    } catch (error) {
      console.warn(`Failed to retrieve from localStorage: ${error}`);
      return null;
    }
  }

  private async deleteLocalStorage(key: string): Promise<void> {
    localStorage.removeItem(`swissknife:${key}`);
  }

  private async listLocalStorage(prefix?: string): Promise<string[]> {
    const keys: string[] = [];
    const swissKnifePrefix = 'swissknife:';
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(swissKnifePrefix)) {
        const cleanKey = key.substring(swissKnifePrefix.length);
        if (!prefix || cleanKey.startsWith(prefix)) {
          keys.push(cleanKey);
        }
      }
    }
    
    return keys;
  }

  private async saveErrorLogLocalStorage(error: ErrorLogEntry): Promise<void> {
    try {
      const logs = await this.getErrorLogsLocalStorage();
      logs.push(error);
      localStorage.setItem('swissknife:error_logs', JSON.stringify(logs));
    } catch (e) {
      console.error('Failed to save error log to localStorage:', e);
    }
  }

  private async getErrorLogsLocalStorage(): Promise<ErrorLogEntry[]> {
    try {
      const logs = localStorage.getItem('swissknife:error_logs');
      return logs ? JSON.parse(logs) : [];
    } catch (e) {
      logError('Failed to retrieve error logs from localStorage:', e);
      return [];
    }
  }

  private async clearErrorLogsLocalStorage(): Promise<void> {
    localStorage.removeItem('swissknife:error_logs');
  }

  // Memory implementations
  private async storeMemory(key: string, data: any): Promise<void> {
    this.memoryStore.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  private async retrieveMemory(key: string): Promise<any> {
    const item = this.memoryStore.get(key);
    return item ? item.data : null;
  }

  private async deleteMemory(key: string): Promise<void> {
    this.memoryStore.delete(key);
  }

  private async listMemory(prefix?: string): Promise<string[]> {
    const keys = Array.from(this.memoryStore.keys());
    return prefix ? keys.filter(key => key.startsWith(prefix)) : keys;
  }

  private async saveErrorLogMemory(error: ErrorLogEntry): Promise<void> {
    let logs = this.memoryStore.get('error_logs') || [];
    logs.push(error);
    this.memoryStore.set('error_logs', logs);
  }

  private async getErrorLogsMemory(): Promise<ErrorLogEntry[]> {
    return this.memoryStore.get('error_logs') || [];
  }

  private async clearErrorLogsMemory(): Promise<void> {
    this.memoryStore.delete('error_logs');
  }

  async dispose(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.memoryStore.clear();
  }

  // File system compatibility methods for SwissKnife
  async writeFile(path: string, data: any): Promise<void> {
    await this.store(`file:${path}`, data);
  }

  async readFile(path: string): Promise<any> {
    return await this.retrieve(`file:${path}`);
  }

  async deleteFile(path: string): Promise<void> {
    await this.delete(`file:${path}`);
  }

  async listFiles(directory?: string): Promise<string[]> {
    const keys = await this.list('file:');
    const files = keys.map(key => key.substring(5)); // Remove 'file:' prefix
    
    if (directory) {
      return files.filter(file => file.startsWith(directory));
    }
    
    return files;
  }

  async exists(path: string): Promise<boolean> {
    const data = await this.retrieve(`file:${path}`);
    return data !== null;
  }
}
