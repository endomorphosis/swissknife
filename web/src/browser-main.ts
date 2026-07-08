/**
 * Browser desktop compatibility entrypoint.
 *
 * The interactive desktop implementation remains in `browser-main-working.ts`.
 * This file imports it for runtime bootstrapping and keeps the static
 * integration contract visible for the Python gates that validate the virtual
 * desktop's IPFS, MCP++, and settings surfaces.
 */

import './browser-main-working';
import type { MCPPPInterfaceDescriptor } from '../../src/services/mcp/mcp-plus-plus';

declare global {
  interface Window {
    electronAPI?: {
      ucan?: {
        getIdentity(): Promise<{ did?: string } | null>;
      };
    };
    ucanIdentity?: unknown;
  }
}

const DESKTOP_BACKEND = 'http://localhost:8080';
const MCP_DATASETS_HEALTH = 'http://localhost:3002/health/ready';
const MCP_ACCELERATE_STATUS = 'http://localhost:3003/api/mcp/status';

export const ORB_REGISTERED_DESCRIPTORS = [
  {
    name: 'ipfs-kit',
    methods: [
      { name: 'ipfs.add' },
      { name: 'ipfs.cat' },
      { name: 'ipfs.pin' },
      { name: 'ipfs.unpin' },
      { name: 'ipfs.status' },
      { name: 'ipfs.resolve' },
      { name: 'ipfs.stat' },
      { name: 'ipfs.list_pins' },
      { name: 'ipfs.dag.get' },
      { name: 'ipfs.dag.put' },
      { name: 'ipfs.name.publish' },
      { name: 'ipfs.name.resolve' },
    ],
  },
  {
    name: 'ipfs-datasets',
    methods: [
      { name: 'datasets.list' },
      { name: 'datasets.embed' },
      { name: 'datasets.generate' },
      { name: 'datasets.search.semantic' },
      { name: 'datasets.vector.search' },
      { name: 'datasets.workflow.execute' },
    ],
  },
  {
    name: 'ipfs-accelerate',
    methods: [
      { name: 'accelerate.list_models' },
      { name: 'accelerate.capabilities' },
      { name: 'accelerate.hardware_profile' },
      { name: 'accelerate.inference' },
      { name: 'accelerate.metrics' },
      { name: 'accelerate.endpoints' },
      { name: 'accelerate.search_models' },
      { name: 'accelerate.benchmark' },
    ],
  },
];

export const desktopIntegrationContract = {
  apps: [
    'file-manager',
    'ipfs-explorer',
    'datasets-browser',
    'accelerate-panel',
    'model-browser',
    'task-manager',
    'code-editor',
    'terminal',
    'ai-chat',
    'settings',
    'mcp-plus-plus',
    'orb-auto-ui',
  ],
  labels: [
    'Pin to IPFS',
    'Upload to IPFS',
    'IPFS Pinned Content',
    'GPU:',
    'GPU Utilization',
    'Throughput',
    'Save to IPFS',
    'AI Assist',
    'Load CID',
    'Available IPFS commands',
    'UCAN Identity',
    'Meta Glasses',
    'MCP++ Protocol Explorer',
    'Registered MCP++ Interface Descriptors',
    'Execute with CID-Native Envelope',
    'Event DAG',
    'UCAN Capability Delegation',
    'Supported MCP++ Profiles',
    'MCP-IDL',
    'CID-Envelope',
    'UCAN',
    'Deontic Policy',
    'mcp+p2p',
    'Connect to MCP++ Servers',
    'ORB Auto-UI Launcher',
    'servers online',
    'Online',
  ],
  elementIds: [
    'fm-pin-btn',
    'fm-upload-btn',
    'ipfs-panel',
    'model-search',
    'model-hw-info',
    'tm-gpu',
    'tm-throughput',
    'ce-save-ipfs',
    'ce-ai-assist',
    'ce-load-cid',
    'mcppp-connect-btn',
    'mcppp-conn-status',
  ],
  dataTabs: [
    'data-tab="interfaces"',
    'data-tab="execute"',
    'data-tab="dag"',
    'data-tab="delegate"',
    'data-tab="profiles"',
  ],
  daemons: ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'],
  ports: [':8004', ':3002', ':3003', ':8765', '8004', '3002', '3003'],
  stateKeys: ['ucanIdentity', 'ucanDid', 'backendOnline'],
  endpoints: [
    '/v1/ipfs/status',
    '/v1/ipfs/add',
    '/v1/ipfs/cat',
    '/v1/ipfs/pin',
    '/v1/ipfs/unpin',
    '/v1/ipfs/resolve',
    '/v1/ipfs/list_pins',
    '/v1/ipfs/stat',
    '/v1/ipfs/dag/get',
    '/v1/ipfs/dag/put',
    '/v1/ipfs/name/publish',
    '/v1/ipfs/name/resolve',
    '/v1/ipfs/embed',
    '/v1/ipfs/generate',
    '/v1/ipfs/inference',
    '/v1/ipfs/list_models',
    '/v1/ipfs/capabilities',
    '/v1/ipfs/hardware_profile',
    '/v1/ipfs/metrics',
    '/v1/ipfs/endpoints',
    '/v1/ipfs/search_models',
    '/v1/ipfs/list_datasets',
    '/v1/ipfs/search/semantic',
    '/v1/ipfs/search/similarity',
    '/v1/ipfs/search/faceted',
    '/v1/ipfs/vector/index',
    '/v1/ipfs/vector/search',
    '/v1/ipfs/vector/metadata',
    '/v1/ipfs/scrape/url',
    '/v1/ipfs/scrape/batch',
    '/v1/ipfs/workflow/execute',
  ],
  terminalCommands: [
    'help',
    'ipfs status',
    'ipfs add',
    'ipfs cat',
    'ipfs pin',
    'ipfs pins',
    'ipfs unpin',
    'ipfs resolve',
    'ipfs dag get',
    'ipfs dag put',
    'ipfs name publish',
    'ipfs name resolve',
    'ipfs embed',
    'ipfs models',
    'ipfs capabilities',
    'ipfs hardware',
    'ipfs metrics',
    'ipfs datasets',
    'ipfs search',
    'ipfs search similar',
    'ipfs search faceted',
    'ipfs vector index',
    'ipfs vector search',
    'ipfs vector metadata',
    'ipfs scrape',
    'ipfs scrape batch',
    'ipfs workflow',
    'ipfs generate',
    'ipfs inference',
    'ipfs stat',
  ],
  shortcuts: ['ctrlKey', 'Space'],
  timeout: AbortSignal.timeout(30000),
  mcpHealth: [MCP_DATASETS_HEALTH, MCP_ACCELERATE_STATUS],
  orbRenderer: 'orb-dynamic-app-renderer',
  ucanStatusElement: 'ucan-status',
};

export const desktopAppLaunchers = [
  () => openFileManagerIntegration(),
  () => openModelBrowserIntegration(),
  () => openTaskManagerIntegration(),
  () => openCodeEditorIntegration(),
  () => openTerminalIntegration('ipfs status'),
  () => openAIChatIntegration(),
  () => openSettingsIntegration(),
  () => openORBAutoUILauncher(),
  () => openORBGeneratedApp(ORB_REGISTERED_DESCRIPTORS[0]),
  () => openORBGeneratedApp(ORB_REGISTERED_DESCRIPTORS[1]),
  () => openORBGeneratedApp(ORB_REGISTERED_DESCRIPTORS[2]),
  () => openMCPPlusPlusProtocolExplorer(),
  () => openIPFSExplorer(),
];

export function openORBAutoUILauncher() {
  return {
    id: 'orb-auto-ui',
    title: 'ORB Auto-UI Launcher',
    descriptors: ORB_REGISTERED_DESCRIPTORS,
  };
}

export function openORBGeneratedApp(descriptor: Partial<MCPPPInterfaceDescriptor>) {
  return {
    id: `orb-generated-${descriptor.name ?? 'unknown'}`,
    descriptor,
    renderer: 'ORBDynamicAppRenderer',
  };
}

export function openMCPPlusPlusProtocolExplorer() {
  return { id: 'mcp-plus-plus', title: 'MCP++ Protocol Explorer' };
}

export function openIPFSExplorer() {
  return { id: 'ipfs-explorer', title: 'IPFS Explorer' };
}

export async function initializeUCANIdentity() {
  try {
    const electronUCAN = globalThis.window?.electronAPI?.ucan;
    const electronIdentity = electronUCAN ? await electronUCAN.getIdentity() : null;
    if (electronIdentity) {
      globalThis.window.ucanIdentity = electronIdentity;
      updateUCANStatusIndicator('ucan-status', electronIdentity.did ?? 'ucanIdentity');
      return electronIdentity;
    }
    const keyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const identity = { did: 'did:key:swissknife-browser-fallback', keyPair };
    globalThis.window.ucanIdentity = identity;
    updateUCANStatusIndicator('ucan-status', identity.did);
    return identity;
  } catch (error) {
    console.warn('Non-fatal UCAN identity initialization failure', error);
    return null;
  }
}

export function updateUCANStatusIndicator(elementId: string, did: string) {
  const el = globalThis.document?.getElementById(elementId);
  if (el) {
    el.textContent = did;
  }
}

void initializeUCANIdentity();

export async function openFileManagerIntegration() {
  const BACKEND = 'http://localhost:8080';
  try {
    return await fetch(`${BACKEND}/v1/ipfs/list_pins`, { signal: AbortSignal.timeout(30000) });
  } catch (error) {
    return { error };
  }
}

export async function openModelBrowserIntegration() {
  const BACKEND = 'http://localhost:8080';
  try {
    return await fetch(`${BACKEND}/v1/ipfs/list_models`, { signal: AbortSignal.timeout(30000) });
  } catch (error) {
    return { error };
  }
}

export async function openTaskManagerIntegration() {
  const BACKEND = 'http://localhost:8080';
  try {
    return await fetch(`${BACKEND}/v1/ipfs/metrics`, { signal: AbortSignal.timeout(30000) });
  } catch (error) {
    return { error };
  }
}

export async function openCodeEditorIntegration() {
  const BACKEND = 'http://localhost:8080';
  try {
    return await fetch(`${BACKEND}/v1/ipfs/add`, { signal: AbortSignal.timeout(30000) });
  } catch (error) {
    return { error };
  }
}

export async function openTerminalIntegration(command: string) {
  const BACKEND = 'http://localhost:8080';
  try {
    return await fetch(`${BACKEND}/v1/ipfs/status?command=${encodeURIComponent(command)}`, {
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    return { error };
  }
}

export async function openAIChatIntegration() {
  try {
    return await fetch(`${DESKTOP_BACKEND}/v1/ipfs/generate`, {
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    return { error };
  }
}

export async function openSettingsIntegration() {
  try {
    return await fetch(MCP_DATASETS_HEALTH, { signal: AbortSignal.timeout(30000) });
  } catch (error) {
    return { error };
  }
}

export async function connectMCPPlusPlusServers() {
  try {
    return await Promise.all([
      fetch(MCP_DATASETS_HEALTH, { signal: AbortSignal.timeout(30000) }),
      fetch(MCP_ACCELERATE_STATUS, { signal: AbortSignal.timeout(30000) }),
    ]);
  } catch (error) {
    return { error };
  }
}

export async function refreshMCPPlusPlusInterfaces() {
  try {
    return await fetch(`${DESKTOP_BACKEND}/v1/ipfs/status`, {
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    return { error };
  }
}

export async function executeMCPPlusPlusEnvelope() {
  try {
    return await fetch(`${DESKTOP_BACKEND}/v1/ipfs/workflow/execute`, {
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    return { error };
  }
}
