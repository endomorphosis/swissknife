export interface StorageBackend {
  name: string;
  config: any;
  // Add methods that all storage backends should implement
  // e.g., read(path: string): Promise<Buffer>;
  // write(path: string, data: Buffer): Promise<string>;
  // list(path: string): Promise<VFSEntry[]>;
  // stat(path: string): Promise<VFSStats>;
}

export interface VFSEntry {
  name: string;
  isDirectory: boolean;
  size?: number;
  backend?: string;
}

export interface VFSStats {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  // Add other relevant stats like creation time, modification time, etc.
}

export class PathResolver {
  // Placeholder for PathResolver class
}

export class CacheManager {
  // Placeholder for CacheManager class
}

export class MetadataStore {
  // Placeholder for MetadataStore class
}

export interface SyncReport {
  filesUpdated: number;
  // Add other relevant sync stats
}
