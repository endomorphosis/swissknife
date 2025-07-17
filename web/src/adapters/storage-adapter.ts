import { BrowserEventEmitter } from '../utils/browser-utils';

export class SwissKnifeStorageAdapter extends BrowserEventEmitter {
  private initialized = false;
  private storage: Map<string, any> = new Map();

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    console.log('Initializing SwissKnife Storage Adapter (mock for web)...');
    this.initialized = true;
    console.log('✅ SwissKnife Storage Adapter (mock) initialized');
  }

  async store(key: string, data: any): Promise<void> {
    console.warn(`Attempted to store data for key ${key} in web environment.`);
    this.storage.set(key, data);
    this.emit('dataStored', { key, data });
  }

  async retrieve(key: string): Promise<any | undefined> {
    console.warn(`Attempted to retrieve data for key ${key} in web environment.`);
    return this.storage.get(key);
  }

  async delete(key: string): Promise<void> {
    console.warn(`Attempted to delete data for key ${key} in web environment.`);
    this.storage.delete(key);
    this.emit('dataDeleted', { key });
  }

  async dispose(): Promise<void> {
    console.log('Disposing SwissKnifeStorageAdapter (mock) resources...');
    this.initialized = false;
  }
}
