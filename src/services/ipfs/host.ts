import { spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  IPFSKitClient,
  IPFSPinType,
  type IPFSAddOptions,
  type IPFSAddResult,
  type IPFSClientConfig,
  type IPFSPinStatus,
} from '../../ipfs/client.js';

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

export interface HostIPFSTransportOptions extends IPFSClientConfig {
  ipfsCommand?: string;
  pythonCommand?: string;
  enableDaemon?: boolean;
  enableFilesystem?: boolean;
  enablePython?: boolean;
  enableNativeIpfs?: boolean;
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

export interface HostIPFSDaemonController {
  pid?: number;
  stop(signal?: NodeJS.Signals): Promise<void>;
}

export interface HostIPFSTransport {
  readonly client: IPFSKitClient;
  readonly report: HostIPFSRuntimeReport;
  addContent(content: Buffer | string | NodeJS.ReadableStream, options?: IPFSAddOptions): Promise<IPFSAddResult>;
  getContent(cid: string): Promise<Buffer>;
  getContentStream(cid: string): Promise<NodeJS.ReadableStream>;
  pinContent(cid: string, recursive?: boolean): Promise<boolean>;
  unpinContent(cid: string, recursive?: boolean): Promise<boolean>;
  listPins(type?: IPFSPinType | 'all'): Promise<IPFSPinStatus[]>;
  isPinned(cid: string): Promise<boolean>;
  isNodeReachable(): Promise<boolean>;
  getNodeInfo(): Promise<unknown>;
  getVersion(): Promise<unknown>;
  addFile(filePath: string, options?: IPFSAddOptions): Promise<IPFSAddResult>;
  startDaemon(options?: HostIPFSDaemonOptions): Promise<HostIPFSDaemonController>;
  runNativeIPFS(args: string[]): Promise<HostIPFSCommandResult>;
  runPythonModule(moduleName: string, args?: string[]): Promise<HostIPFSCommandResult>;
}

const DEFAULT_IPFS_COMMAND = 'ipfs';
const DEFAULT_PYTHON_COMMAND = 'python3';

function enabled(value: boolean | undefined): boolean {
  return value !== false;
}

function createReport(options: HostIPFSTransportOptions): HostIPFSRuntimeReport {
  const endpoint = options.apiUrl;
  const ipfsCommand = options.ipfsCommand ?? DEFAULT_IPFS_COMMAND;
  const pythonCommand = options.pythonCommand ?? DEFAULT_PYTHON_COMMAND;

  return {
    runtime: 'host',
    browserSafe: false,
    capabilities: [
      {
        name: 'http-api-read',
        adapter: 'http-api',
        supported: true,
        enabled: true,
        endpoint,
      },
      {
        name: 'http-api-write',
        adapter: 'http-api',
        supported: true,
        enabled: true,
        endpoint,
      },
      {
        name: 'http-api-pin',
        adapter: 'http-api',
        supported: true,
        enabled: true,
        endpoint,
      },
      {
        name: 'daemon',
        adapter: 'daemon',
        supported: true,
        enabled: enabled(options.enableDaemon),
        command: ipfsCommand,
      },
      {
        name: 'filesystem',
        adapter: 'filesystem',
        supported: true,
        enabled: enabled(options.enableFilesystem),
      },
      {
        name: 'python',
        adapter: 'python',
        supported: true,
        enabled: enabled(options.enablePython),
        command: pythonCommand,
      },
      {
        name: 'native-ipfs',
        adapter: 'native-ipfs',
        supported: true,
        enabled: enabled(options.enableNativeIpfs),
        command: ipfsCommand,
      },
    ],
  };
}

function assertCapability(options: HostIPFSTransportOptions, key: keyof HostIPFSTransportOptions, label: string): void {
  if (options[key] === false) {
    throw new Error(`${label} capability is disabled for this host IPFS transport`);
  }
}

function collectProcess(
  command: string,
  args: string[],
  env?: Record<string, string>,
): Promise<HostIPFSCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...(env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', exitCode => {
      resolve({
        command,
        args,
        exitCode: exitCode ?? 0,
        stdout,
        stderr,
      });
    });
  });
}

function daemonController(child: ChildProcess): HostIPFSDaemonController {
  return {
    pid: child.pid,
    stop(signal: NodeJS.Signals = 'SIGTERM') {
      return new Promise(resolve => {
        if (child.exitCode !== null || child.killed) {
          resolve();
          return;
        }
        child.once('close', () => resolve());
        child.kill(signal);
      });
    },
  };
}

export function createHostIPFSTransport(
  options: HostIPFSTransportOptions = {},
): HostIPFSTransport {
  const client = new IPFSKitClient(options);
  const ipfsCommand = options.ipfsCommand ?? DEFAULT_IPFS_COMMAND;
  const pythonCommand = options.pythonCommand ?? DEFAULT_PYTHON_COMMAND;

  return {
    client,
    report: createReport(options),

    addContent(content, addOptions = {}) {
      return client.addContent(content, addOptions);
    },

    getContent(cid) {
      return client.getContent(cid);
    },

    getContentStream(cid) {
      return client.getContentStream(cid);
    },

    pinContent(cid, recursive = true) {
      return client.pinContent(cid, recursive);
    },

    unpinContent(cid, recursive = true) {
      return client.unpinContent(cid, recursive);
    },

    listPins(type = 'all') {
      return client.listPins(type);
    },

    isPinned(cid) {
      return client.isPinned(cid);
    },

    isNodeReachable() {
      return client.isNodeReachable();
    },

    getNodeInfo() {
      return client.getNodeInfo();
    },

    getVersion() {
      return client.getVersion();
    },

    async addFile(filePath, addOptions = {}) {
      assertCapability(options, 'enableFilesystem', 'Filesystem');
      const content = await readFile(filePath);
      return client.addContent(content, {
        filename: addOptions.filename ?? path.basename(filePath),
        ...addOptions,
      });
    },

    async startDaemon(daemonOptions = {}) {
      assertCapability(options, 'enableDaemon', 'Daemon');
      const args = ['daemon', ...(daemonOptions.profile ? ['--profile', daemonOptions.profile] : []), ...(daemonOptions.args ?? [])];
      const child = spawn(ipfsCommand, args, {
        env: {
          ...process.env,
          ...(daemonOptions.repoPath ? { IPFS_PATH: daemonOptions.repoPath } : {}),
          ...(daemonOptions.env ?? {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const settle = (fn: () => void) => {
          if (settled) return;
          settled = true;
          fn();
        };
        child.once('error', err => settle(() => reject(err)));
        child.stdout.once('data', () => settle(resolve));
        child.stderr.once('data', () => settle(resolve));
        global.setTimeout(() => settle(resolve), 1000);
      });

      return daemonController(child);
    },

    async runNativeIPFS(args) {
      assertCapability(options, 'enableNativeIpfs', 'Native IPFS');
      return collectProcess(ipfsCommand, args);
    },

    async runPythonModule(moduleName, args = []) {
      assertCapability(options, 'enablePython', 'Python');
      return collectProcess(pythonCommand, ['-m', moduleName, ...args]);
    },
  };
}

export {
  IPFSKitClient,
  IPFSPinType,
  type IPFSAddOptions,
  type IPFSAddResult,
  type IPFSClientConfig,
  type IPFSPinStatus,
};
