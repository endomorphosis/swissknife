export type BrowserStorageAdapterKind = 'indexeddb' | 'opfs' | 'cache-storage' | 'ipfs';

export type BrowserStorageCapabilityName =
  | 'indexeddb'
  | 'opfs'
  | 'cache-storage'
  | 'ipfs-adapter'
  | 'filesystem'
  | 'path'
  | 'process';

export interface BrowserStorageCapabilityStatus {
  name: BrowserStorageCapabilityName;
  adapter: BrowserStorageAdapterKind | 'host-only';
  supported: boolean;
  enabled: boolean;
  reason?: string;
}

export interface BrowserStorageCapabilityGap {
  name: BrowserStorageCapabilityName;
  adapter: BrowserStorageAdapterKind | 'host-only';
  reason: string;
}

export interface BrowserStorageRuntimeReport {
  runtime: 'browser';
  browserSafe: true;
  activeAdapter?: BrowserStorageAdapterKind;
  capabilities: BrowserStorageCapabilityStatus[];
  gaps: BrowserStorageCapabilityGap[];
  hostOnly: BrowserStorageCapabilityStatus[];
}

export interface BrowserStorageItemMetadata {
  key: string;
  size: number;
  contentType?: string;
  createdAt: number;
  updatedAt?: number;
  tags?: string[];
  adapter: BrowserStorageAdapterKind;
}

export interface BrowserStorageListOptions {
  prefix?: string;
  limit?: number;
  offset?: number;
}

export interface BrowserStoragePutOptions {
  contentType?: string;
  tags?: string[];
  key?: string;
}

export interface BrowserStoragePutResult {
  key: string;
  size: number;
  adapter: BrowserStorageAdapterKind;
}

export type BrowserStorageContent = string | Uint8Array | ArrayBuffer | Blob;

export interface BrowserStorageProvider {
  readonly kind: BrowserStorageAdapterKind;
  readonly report: BrowserStorageRuntimeReport;
  put(content: BrowserStorageContent, options?: BrowserStoragePutOptions): Promise<BrowserStoragePutResult>;
  get(key: string): Promise<Uint8Array>;
  getText(key: string): Promise<string>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  list(options?: BrowserStorageListOptions): Promise<BrowserStorageItemMetadata[]>;
  getMetadata(key: string): Promise<BrowserStorageItemMetadata | undefined>;
  clear(): Promise<void>;
}

export type HostStorageAdapterKind = 'filesystem';

export type HostStorageCapabilityName =
  | 'filesystem'
  | 'path'
  | 'process-env'
  | 'indexeddb'
  | 'opfs'
  | 'cache-storage'
  | 'ipfs-adapter';

export interface HostStorageCapabilityStatus {
  name: HostStorageCapabilityName;
  adapter: HostStorageAdapterKind | 'browser-only';
  supported: boolean;
  enabled: boolean;
  reason?: string;
}

export interface HostStorageCapabilityGap {
  name: HostStorageCapabilityName;
  adapter: HostStorageAdapterKind | 'browser-only';
  reason: string;
}

export interface HostStorageRuntimeReport {
  runtime: 'host';
  browserSafe: false;
  activeAdapter: HostStorageAdapterKind;
  capabilities: HostStorageCapabilityStatus[];
  browserOnly: HostStorageCapabilityStatus[];
  gaps: HostStorageCapabilityGap[];
}

export interface HostStorageItemMetadata {
  key: string;
  size: number;
  contentType?: string;
  createdAt: number;
  updatedAt?: number;
  tags?: string[];
  adapter: HostStorageAdapterKind;
}

export interface HostStorageListOptions {
  prefix?: string;
  limit?: number;
  offset?: number;
}

export interface HostStoragePutOptions {
  contentType?: string;
  tags?: string[];
  key?: string;
}

export interface HostStoragePutResult {
  key: string;
  size: number;
  adapter: HostStorageAdapterKind;
}

