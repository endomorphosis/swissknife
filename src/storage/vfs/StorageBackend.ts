// src/storage/vfs/StorageBackend.ts
export abstract class StorageBackend {
  abstract readonly name: string;
  abstract readonly protocol: string;
  abstract readonly capabilities: BackendCapabilities;

  abstract async connect(config: BackendConfig): Promise<void>;
  abstract async disconnect(): Promise<void>;
  
  abstract async exists(path: string): Promise<boolean>;
  abstract async read(path: string): Promise<Buffer>;
  abstract async write(path: string, data: Buffer): Promise<string>;
  abstract async delete(path: string): Promise<void>;
  abstract async list(path: string): Promise<BackendEntry[]>;
  abstract async stat(path: string): Promise<BackendStats>;
  
  abstract async getMetadata(path: string): Promise<BackendMetadata>;
  abstract async setMetadata(path: string, metadata: BackendMetadata): Promise<void>;
}