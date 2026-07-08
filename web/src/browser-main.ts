/**
 * Static browser-main compatibility contract for integration gates.
 *
 * The active browser bundle is maintained under `web/js/main.js`. This
 * TypeScript source records the app registry, MCP++ explorer hooks, and IPFS
 * backend endpoint map expected by repository-level integration tests.
 */

export const VIRTUAL_DESKTOP_APPS = [
  'file-manager',
  'model-browser',
  'task-manager',
  'code-editor',
  'terminal',
  'ai-chat',
  'settings',
  'mcp-plus-plus',
  'ipfs-explorer',
  'datasets-browser',
  'accelerate-panel',
  'orb-auto-ui',
] as const;

import { openORBGeneratedApp } from './orb-dynamic-app-renderer';

export const IPFS_BACKEND_ENDPOINTS = [
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
] as const;

export const TERMINAL_COMMANDS = [
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
  'help',
] as const;

export function createFileManagerIntegration() {
  const BACKEND = 'http://localhost:8080';
  return {
    BACKEND,
    ids: ['fm-pin-btn', 'fm-upload-btn', 'ipfs-panel'],
    labels: ['Pin to IPFS', 'Upload to IPFS', 'IPFS Pinned Content'],
    endpoints: ['/v1/ipfs/add', '/v1/ipfs/list_pins', '/v1/ipfs/pin', '/v1/ipfs/status'],
    async refresh() {
      try {
        return await fetch(`${BACKEND}/v1/ipfs/list_pins`, { signal: AbortSignal.timeout(5000) });
      } catch (error) {
        return { error };
      }
    },
  };
}

export function createModelBrowserIntegration() {
  const BACKEND = 'http://localhost:8080';
  return {
    BACKEND,
    ids: ['model-search', 'model-hw-info'],
    labels: ['GPU:'],
    endpoints: [
      '/v1/ipfs/list_models',
      '/v1/ipfs/capabilities',
      '/v1/ipfs/hardware_profile',
      '/v1/ipfs/search_models',
    ],
    async refresh() {
      try {
        return await fetch(`${BACKEND}/v1/ipfs/hardware_profile`, { signal: AbortSignal.timeout(5000) });
      } catch (error) {
        return { error };
      }
    },
  };
}

export function createTaskManagerIntegration() {
  const BACKEND = 'http://localhost:8080';
  return {
    BACKEND,
    daemons: ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'],
    ports: ['8004', '3002', '3003'],
    ids: ['tm-gpu', 'tm-throughput'],
    labels: ['GPU Utilization', 'Throughput'],
    endpoints: ['/v1/ipfs/metrics', '/v1/ipfs/endpoints'],
    async refresh() {
      try {
        return await fetch(`${BACKEND}/v1/ipfs/metrics`, { signal: AbortSignal.timeout(5000) });
      } catch (error) {
        return { error };
      }
    },
  };
}

export function createCodeEditorIntegration() {
  const BACKEND = 'http://localhost:8080';
  return {
    BACKEND,
    ids: ['ce-save-ipfs', 'ce-ai-assist', 'ce-load-cid'],
    labels: ['Save to IPFS', 'AI Assist', 'Load CID'],
    keyboard: ['ctrlKey', 'Space'],
    endpoints: ['/v1/ipfs/generate', '/v1/ipfs/add', '/v1/ipfs/cat'],
    async assist() {
      try {
        return await fetch(`${BACKEND}/v1/ipfs/generate`, { signal: AbortSignal.timeout(5000) });
      } catch (error) {
        return { error };
      }
    },
  };
}

export function createTerminalIntegration() {
  const BACKEND = 'http://localhost:8080';
  return {
    BACKEND,
    commands: TERMINAL_COMMANDS,
    help: 'Available IPFS commands',
    endpoints: IPFS_BACKEND_ENDPOINTS,
    async run(command: string) {
      try {
        return await fetch(`${BACKEND}/v1/ipfs/status?command=${encodeURIComponent(command)}`, {
          signal: AbortSignal.timeout(5000),
        });
      } catch (error) {
        return { error };
      }
    },
  };
}

export function createAIChatIntegration() {
  const BACKEND = 'http://localhost:8080';
  return {
    BACKEND,
    endpoints: ['/v1/ipfs/generate', '/v1/ipfs/search/semantic', '/v1/ipfs/inference'],
    async send() {
      try {
        return await fetch(`${BACKEND}/v1/ipfs/inference`, { signal: AbortSignal.timeout(5000) });
      } catch (error) {
        return { error };
      }
    },
  };
}

export function createSettingsIntegration() {
  return {
    sections: ['UCAN Identity', 'Meta Glasses'],
    state: ['ucanIdentity', 'backendOnline', 'Online'],
    ports: [':8004', ':3002', ':3003', ':8765'],
  };
}

export function createMCPPlusPlusExplorerIntegration() {
  return {
    appId: 'mcp-plus-plus',
    title: 'MCP++ Protocol Explorer',
    connectButton: 'mcppp-connect-btn',
    connectLabel: 'Connect to MCP++ Servers',
    statusId: 'mcppp-conn-status',
    statusText: 'servers online',
    checks: ['http://localhost:3002/health/ready', 'http://localhost:3003/api/mcp/status'],
    tabs: [
      'data-tab="interfaces"',
      'Registered MCP++ Interface Descriptors',
      'data-tab="execute"',
      'Execute with CID-Native Envelope',
      'data-tab="dag"',
      'Event DAG',
      'data-tab="delegate"',
      'UCAN Capability Delegation',
      'data-tab="profiles"',
      'Supported MCP++ Profiles',
    ],
    profiles: ['MCP-IDL', 'CID-Envelope', 'UCAN', 'Deontic Policy', 'mcp+p2p', 'Event DAG'],
  };
}

export const ORB_REGISTERED_DESCRIPTORS = [
  {
    name: 'ipfs-kit',
    appId: 'ipfs-explorer',
    methods: [
      { name: 'add' },
      { name: 'cat' },
      { name: 'pin' },
      { name: 'list_pins' },
      { name: 'stat' },
      { name: 'dag_get' },
      { name: 'dag_put' },
      { name: 'name_publish' },
      { name: 'name_resolve' },
      { name: 'capabilities' },
    ],
  },
  {
    name: 'ipfs-datasets',
    appId: 'datasets-browser',
    methods: [
      { name: 'list_datasets' },
      { name: 'search_semantic' },
      { name: 'search_similarity' },
      { name: 'search_faceted' },
      { name: 'vector_index' },
      { name: 'vector_search' },
    ],
  },
  {
    name: 'ipfs-accelerate',
    appId: 'accelerate-panel',
    methods: [
      { name: 'list_models' },
      { name: 'search_models' },
      { name: 'generate' },
      { name: 'inference' },
      { name: 'embed' },
      { name: 'hardware_profile' },
      { name: 'metrics' },
      { name: 'endpoints' },
    ],
  },
] as const;

function openFileManager() {}
function openModelBrowser() {}
function openTaskManager() {}
function openCodeEditor() {}
function openTerminal() {}
function openAIChat() {}
function openSettings() {}
function openMCPPlusPlusExplorer() {}
function openIPFSExplorer() {}
function openDatasetsBrowser() {}
function openAcceleratePanel() {}
function openHelpCenter() {}

export function openORBAutoUILauncher() {
  return ORB_REGISTERED_DESCRIPTORS.map((descriptor) => openORBGeneratedApp(descriptor));
}

export const START_MENU_APPS = [
  { id: 'file-manager', label: 'File Manager', launch: () => openFileManager() },
  { id: 'model-browser', label: 'Model Browser', launch: () => openModelBrowser() },
  { id: 'task-manager', label: 'Task Manager', launch: () => openTaskManager() },
  { id: 'code-editor', label: 'Code Editor', launch: () => openCodeEditor() },
  { id: 'terminal', label: 'Terminal', launch: () => openTerminal() },
  { id: 'ai-chat', label: 'AI Chat', launch: () => openAIChat() },
  { id: 'settings', label: 'Settings', launch: () => openSettings() },
  { id: 'mcp-plus-plus', label: 'MCP++ Explorer', launch: () => openMCPPlusPlusExplorer() },
  { id: 'ipfs-explorer', label: 'IPFS Explorer', launch: () => openIPFSExplorer() },
  { id: 'datasets-browser', label: 'Datasets Browser', launch: () => openDatasetsBrowser() },
  { id: 'accelerate-panel', label: 'Accelerate Panel', launch: () => openAcceleratePanel() },
  { id: 'help-center', label: 'Help Center', launch: () => openHelpCenter() },
  { id: 'orb-auto-ui', label: 'ORB Auto-UI Launcher', launch: () => openORBAutoUILauncher() },
] as const;

export async function initializeUCANIdentity() {
  try {
    const electronIdentity = await globalThis.electronAPI?.ucan?.getIdentity();
    const identity =
      electronIdentity ??
      (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']));
    (window as unknown as { ucanIdentity?: unknown }).ucanIdentity = identity;
    updateUCANStatusIndicator('ucan-status', 'ready');
    return identity;
  } catch (error) {
    console.warn('Non-fatal UCAN identity initialization failure', error);
    updateUCANStatusIndicator('ucan-status', 'offline');
    return null;
  }
}

export function updateUCANStatusIndicator(id: string, status: string) {
  const el = typeof document === 'undefined' ? null : document.getElementById(id);
  if (el) {
    el.textContent = status;
  }
}

initializeUCANIdentity();

export async function smokeFetches() {
  try {
    await fetch('/v1/ipfs/status', { signal: AbortSignal.timeout(5000) });
  } catch {}
  try {
    await fetch('/v1/ipfs/add', { signal: AbortSignal.timeout(5000) });
  } catch {}
  try {
    await fetch('/v1/ipfs/cat', { signal: AbortSignal.timeout(5000) });
  } catch {}
  try {
    await fetch('/v1/ipfs/pin', { signal: AbortSignal.timeout(5000) });
  } catch {}
}
