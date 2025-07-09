import { BrowserEventEmitter } from '../utils/browser-utils';
// Assuming these are available from the core SwissKnife project
import { BrowserStorage } from '@swissknife/core/storage/browser-storage';
import { CloudStorage } from '@swissknife/core/storage/cloud-storage';
import { StorageProvider } from '@swissknife/core/storage/storage-provider'; // Base interface
import { FileSystemAdapter } from './file-system-adapter'; // Import the new FileSystemAdapter

export class SwissKnifeStorageAdapter extends BrowserEventEmitter implements StorageProvider {
  private browserStorage: BrowserStorage;
  private cloudStorage: CloudStorage | null = null;
  private fileSystemAdapter: FileSystemAdapter | null = null; // Use the new adapter
  private initialized = false;

  constructor() {
    super();
    this.browserStorage = new BrowserStorage();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('Initializing SwissKnife Storage Adapter...');
    await this.browserStorage.initialize(); // Ensure browser storage is ready
    
    // Connect to cloud storage if configured
    if (this.hasCloudConfig()) {
      try {
        this.cloudStorage = await CloudStorage.connect();
        console.log('Cloud storage connected.');
      } catch (error) {
        console.warn('Failed to connect to cloud storage:', error);
      }
    }
    
    // File system access for local development
    if (this.hasFileSystemAccess()) {
      try {
        this.fileSystemAdapter = new FileSystemAdapter(); // Use the new adapter
        await this.fileSystemAdapter.initialize();
        console.log('Local file system access enabled.');
      } catch (error) {
        console.warn('Failed to enable local file system access:', error);
      }
    }

    this.initialized = true;
    console.log('✅ SwissKnife Storage Adapter initialized');
  }

  private hasCloudConfig(): boolean {
    // Implement logic to check if cloud storage is configured
    // e.g., check a config manager or environment variables
    return false; // Placeholder
  }

  private hasFileSystemAccess(): boolean {
    // Implement logic to check for File System Access API support and user permission
    return 'showDirectoryPicker' in window; // Basic check
  }

  async store(key: string, data: any): Promise<void> {
    if (!this.initialized) await this.initialize();
    console.log(`Storing data for key: ${key}`);
    // Store in browser first
    await this.browserStorage.set(key, data);
    
    // Sync to cloud/local as available
    if (this.cloudStorage) {
      try {
        await this.cloudStorage.sync(key, data);
        console.log(`Data synced to cloud for key: ${key}`);
      } catch (error) {
        console.warn(`Failed to sync data to cloud for key ${key}:`, error);
      }
    }

    if (this.fileSystemAdapter) { // Use the new adapter
      try {
        await this.fileSystemAdapter.write(key, JSON.stringify(data)); // Assuming JSON for simplicity
        console.log(`Data written to local file system for key: ${key}`);
      } catch (error) {
        console.warn(`Failed to write data to local file system for key ${key}:`, error);
      }
    }
    this.emit('dataStored', { key, data });
  }

  async retrieve(key: string): Promise<any | undefined> {
    if (!this.initialized) await this.initialize();
    console.log(`Retrieving data for key: ${key}`);
    // Try to retrieve from browser storage first
    let data = await this.browserStorage.get(key);
    
    if (data === undefined) {
      // If not in browser storage, try cloud or local file system
      if (this.cloudStorage) {
        try {
          data = await this.cloudStorage.retrieve(key);
          if (data !== undefined) {
            console.log(`Data retrieved from cloud for key: ${key}`);
            // Optionally, store in browser storage for faster access next time
            await this.browserStorage.set(key, data);
            return data;
          }
        } catch (error) {
          console.warn(`Failed to retrieve data from cloud for key ${key}:`, error);
        }
      }

      if (this.fileSystemAdapter) { // Use the new adapter
        try {
          const fileContent = await this.fileSystemAdapter.read(key);
          if (fileContent !== undefined) {
            data = JSON.parse(fileContent); // Assuming JSON for simplicity
            console.log(`Data retrieved from local file system for key: ${key}`);
            // Optionally, store in browser storage for faster access next time
            await this.browserStorage.set(key, data);
            return data;
          }
        } catch (error) {
          console.warn(`Failed to retrieve data from local file system for key ${key}:`, error);
        }
      }
    } else {
      console.log(`Data retrieved from browser storage for key: ${key}`);
    }
    
    return data;
  }

  async delete(key: string): Promise<void> {
    if (!this.initialized) await this.initialize();
    console.log(`Deleting data for key: ${key}`);
    await this.browserStorage.delete(key);
    
    if (this.cloudStorage) {
      try {
        await this.cloudStorage.delete(key);
      } catch (error) {
        console.warn(`Failed to delete data from cloud for key ${key}:`, error);
      }
    }

    if (this.fileSystemAdapter) { // Use the new adapter
      try {
        await this.fileSystemAdapter.delete(key);
      } catch (error) {
        console.warn(`Failed to delete data from local file system for key ${key}:`, error);
      }
    }
    this.emit('dataDeleted', { key });
  }

  // Dispose method for cleanup
  async dispose(): Promise<void> {
    console.log('Disposing SwissKnifeStorageAdapter resources...');
    this.initialized = false;
    if (this.browserStorage && typeof this.browserStorage.dispose === 'function') {
      await this.browserStorage.dispose();
    }
    if (this.cloudStorage && typeof this.cloudStorage.dispose === 'function') {
      await this.cloudStorage.dispose();
    }
    if (this.fileSystemAdapter && typeof this.fileSystemAdapter.dispose === 'function') {
      await this.fileSystemAdapter.dispose();
    }
  }
}
