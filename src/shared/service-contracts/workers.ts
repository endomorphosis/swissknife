export type BrowserWorkerAdapterKind = 'dedicated-worker' | 'shared-worker';

export type BrowserWorkerCapabilityName =
  | 'worker'
  | 'shared-worker'
  | 'module-worker'
  | 'transferable-objects'
  | 'worker-threads'
  | 'child-process'
  | 'filesystem';

export interface BrowserWorkerCapabilityStatus {
  name: BrowserWorkerCapabilityName;
  adapter: BrowserWorkerAdapterKind | 'host-only';
  supported: boolean;
  enabled: boolean;
  reason?: string;
}

export interface BrowserWorkerCapabilityGap {
  name: BrowserWorkerCapabilityName;
  adapter: BrowserWorkerAdapterKind | 'host-only';
  reason: string;
}

export interface BrowserWorkerRuntimeReport {
  runtime: 'browser';
  browserSafe: true;
  capabilities: BrowserWorkerCapabilityStatus[];
  gaps: BrowserWorkerCapabilityGap[];
  hostOnly: BrowserWorkerCapabilityStatus[];
}

export interface BrowserWorkerTaskMessage {
  type: 'task';
  taskId: string;
  taskType: string;
  data: unknown;
}

export interface BrowserWorkerResponseMessage {
  type: 'response';
  taskId: string;
  result?: unknown;
  error?: string;
}

export interface BrowserWorkerStatusMessage {
  type: 'status';
  workerId: string;
  status: 'idle' | 'busy' | 'error' | 'terminated';
  error?: string;
}

export interface BrowserWorkerReadyMessage {
  type: 'ready';
  workerId: string;
  capabilities?: Record<string, unknown>;
}

export type BrowserWorkerOutboundMessage = BrowserWorkerTaskMessage;

export type BrowserWorkerInboundMessage =
  | BrowserWorkerResponseMessage
  | BrowserWorkerStatusMessage
  | BrowserWorkerReadyMessage;

export interface BrowserWorkerTaskOptions {
  transfer?: Transferable[];
  timeoutMs?: number;
}

export type HostWorkerAdapterKind = 'worker-threads' | 'subprocess';

export type HostWorkerCapabilityName =
  | 'worker-threads'
  | 'subprocess'
  | 'filesystem'
  | 'shared-array-buffer'
  | 'worker'
  | 'shared-worker';

export interface HostWorkerCapabilityStatus {
  name: HostWorkerCapabilityName;
  adapter: HostWorkerAdapterKind | 'browser-only';
  supported: boolean;
  enabled: boolean;
  reason?: string;
}

export interface HostWorkerCapabilityGap {
  name: HostWorkerCapabilityName;
  adapter: HostWorkerAdapterKind | 'browser-only';
  reason: string;
}

export interface HostWorkerRuntimeReport {
  runtime: 'host';
  browserSafe: false;
  capabilities: HostWorkerCapabilityStatus[];
  gaps: HostWorkerCapabilityGap[];
  browserOnly: HostWorkerCapabilityStatus[];
}

export interface HostSubprocessTaskMessage {
  type: 'task';
  taskId: string;
  taskType: string;
  data: unknown;
}

export interface HostSubprocessResponseMessage {
  type: 'response';
  taskId: string;
  result?: unknown;
  error?: string;
}

export type HostSubprocessInboundMessage = HostSubprocessResponseMessage;

