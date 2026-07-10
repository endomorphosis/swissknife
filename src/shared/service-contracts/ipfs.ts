export type BrowserIPFSCapabilityName =
  | 'gateway-read'
  | 'http-api-read'
  | 'http-api-write'
  | 'http-api-pin'
  | 'libp2p-runtime'
  | 'libp2p-content-routing'
  | 'libp2p-pubsub'
  | 'daemon'
  | 'filesystem'
  | 'python'
  | 'native-ipfs';

export type BrowserIPFSAdapterKind = 'gateway' | 'http-api' | 'libp2p' | 'host-only';

export interface BrowserIPFSCapabilityStatus {
  name: BrowserIPFSCapabilityName;
  adapter: BrowserIPFSAdapterKind;
  supported: boolean;
  enabled: boolean;
  endpoint?: string;
  reason?: string;
}

export interface BrowserIPFSCapabilityGap {
  name: BrowserIPFSCapabilityName;
  adapter: BrowserIPFSAdapterKind;
  reason: string;
}

export interface BrowserIPFSLibp2pCapabilityGap {
  name: string;
  packageName: string;
  code: string;
  reason: string;
}

export interface BrowserIPFSLibp2pRuntimeReport {
  enabled: boolean;
  capabilities: readonly unknown[];
  gaps: BrowserIPFSLibp2pCapabilityGap[];
}

export interface BrowserIPFSLibp2pRuntimeOptions {
  enabled?: boolean;
  includeWebRTC?: boolean;
  includeWebSockets?: boolean;
  includeCircuitRelay?: boolean;
  includeNoise?: boolean;
  includeYamux?: boolean;
  includeIdentify?: boolean;
  includeGossipSub?: boolean;
  libp2pOptions?: Record<string, unknown>;
  importModule?: (specifier: string) => Promise<Record<string, unknown>>;
}

export interface BrowserIPFSRuntimeReport {
  runtime: 'browser';
  browserSafe: true;
  capabilities: BrowserIPFSCapabilityStatus[];
  gaps: BrowserIPFSCapabilityGap[];
  hostOnly: BrowserIPFSCapabilityStatus[];
  libp2p?: BrowserIPFSLibp2pRuntimeReport;
}

export interface BrowserIPFSGatewayOptions {
  enabled?: boolean;
  baseUrl?: string;
  headers?: Record<string, string>;
}

export interface BrowserIPFSHttpApiOptions {
  enabled?: boolean;
  baseUrl?: string;
  headers?: Record<string, string>;
}

export interface BrowserIPFSTransportOptions {
  gateway?: BrowserIPFSGatewayOptions;
  httpApi?: BrowserIPFSHttpApiOptions;
  libp2p?: BrowserIPFSLibp2pRuntimeOptions & {
    enabled?: boolean;
    contentRouting?: boolean;
    pubsub?: boolean;
  };
  fetch?: typeof globalThis.fetch;
  requestTimeoutMs?: number;
}

export interface BrowserIPFSAddOptions {
  filename?: string;
  pin?: boolean;
  wrapWithDirectory?: boolean;
  cidVersion?: 0 | 1;
  hashAlg?: string;
}

export interface BrowserIPFSAddResult {
  cid: string;
  size: number;
  path?: string;
}

export interface BrowserIPFSPinStatus {
  cid: string;
  type: string;
}

export type BrowserIPFSContent =
  | string
  | Blob
  | ArrayBuffer
  | Uint8Array
  | FormData;

export interface BrowserIPFSCatOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface BrowserIPFSApiOptions extends BrowserIPFSCatOptions {
  headers?: Record<string, string>;
}

export interface BrowserIPFSTransport {
  readonly report: BrowserIPFSRuntimeReport;
  cat(cidOrPath: string, options?: BrowserIPFSCatOptions): Promise<Uint8Array>;
  catText(cidOrPath: string, options?: BrowserIPFSCatOptions): Promise<string>;
  add(content: BrowserIPFSContent, options?: BrowserIPFSAddOptions & BrowserIPFSApiOptions): Promise<BrowserIPFSAddResult>;
  pin(cid: string, options?: BrowserIPFSApiOptions & { recursive?: boolean }): Promise<boolean>;
  unpin(cid: string, options?: BrowserIPFSApiOptions & { recursive?: boolean }): Promise<boolean>;
  listPins(type?: string, options?: BrowserIPFSApiOptions): Promise<BrowserIPFSPinStatus[]>;
  id(options?: BrowserIPFSApiOptions): Promise<unknown>;
  version(options?: BrowserIPFSApiOptions): Promise<unknown>;
  getLibp2pConfig(): Promise<{ config: Record<string, unknown>; report: BrowserIPFSLibp2pRuntimeReport }>;
  createLibp2pNode(): Promise<{ node: unknown; config: Record<string, unknown>; report: BrowserIPFSLibp2pRuntimeReport }>;
}

export type HostIPFSCapabilityName =
  | 'http-api-read'
  | 'http-api-write'
  | 'http-api-pin'
  | 'daemon'
  | 'filesystem'
  | 'python'
  | 'native-ipfs';

export interface HostIPFSCapabilityStatus {
  name: HostIPFSCapabilityName;
  supported: boolean;
  enabled: boolean;
  adapter: 'http-api' | 'daemon' | 'filesystem' | 'python' | 'native-ipfs';
  command?: string;
  endpoint?: string;
  reason?: string;
}

export interface HostIPFSRuntimeReport {
  runtime: 'host';
  browserSafe: false;
  capabilities: HostIPFSCapabilityStatus[];
}

export interface HostIPFSDaemonOptions {
  repoPath?: string;
  profile?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface HostIPFSCommandResult {
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
}

