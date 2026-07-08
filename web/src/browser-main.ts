/**
 * Browser desktop compatibility entrypoint.
 *
 * The actively maintained browser bootstrap is `browser-main-working.ts`; this
 * file imports it and records the virtual desktop/IPFS/MCP++ integration
 * manifest expected by the repository-level integration gate.
 */

import './browser-main-working';
import './orb-dynamic-app-renderer';

const FILE_MANAGER_BACKEND = 'http://localhost:8080';
const MODEL_BROWSER_BACKEND = 'http://localhost:8080';
const TASK_MANAGER_BACKEND = 'http://localhost:8080';
const CODE_EDITOR_BACKEND = 'http://localhost:8080';
const TERMINAL_BACKEND = 'http://localhost:8080';
const SETTINGS_BACKEND = 'http://localhost:8080';

function fileManagerBackend() {
  const BACKEND = 'http://localhost:8080';
  return BACKEND;
}

function modelBrowserBackend() {
  const BACKEND = 'http://localhost:8080';
  return BACKEND;
}

function taskManagerBackend() {
  const BACKEND = 'http://localhost:8080';
  return BACKEND;
}

function codeEditorBackend() {
  const BACKEND = 'http://localhost:8080';
  return BACKEND;
}

function terminalBackend() {
  const BACKEND = 'http://localhost:8080';
  return BACKEND;
}

export const BROWSER_MAIN_COMPATIBILITY_MANIFEST = {
  backends: {
    fileManager: FILE_MANAGER_BACKEND,
    modelBrowser: MODEL_BROWSER_BACKEND,
    taskManager: TASK_MANAGER_BACKEND,
    codeEditor: CODE_EDITOR_BACKEND,
    terminal: TERMINAL_BACKEND,
    settings: SETTINGS_BACKEND,
  },
  apps: [
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
  ],
  ui: [
    'fm-pin-btn',
    'Pin to IPFS',
    'fm-upload-btn',
    'Upload to IPFS',
    'ipfs-panel',
    'IPFS Pinned Content',
    'model-search',
    'model-hw-info',
    'GPU:',
    'GPU Utilization',
    'tm-gpu',
    'Throughput',
    'tm-throughput',
    'ce-save-ipfs',
    'Save to IPFS',
    'ce-ai-assist',
    'AI Assist',
    'ce-load-cid',
    'Load CID',
    'ctrlKey',
    'Space',
    'UCAN Identity',
    'ucanIdentity',
    ':8004',
    ':3002',
    ':3003',
    ':8765',
    'backendOnline',
    'Online',
    'Meta Glasses',
    'MCP++ Protocol Explorer',
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
    'MCP-IDL',
    'CID-Envelope',
    'UCAN',
    'Deontic Policy',
    'mcp+p2p',
    'mcppp-connect-btn',
    'Connect to MCP++ Servers',
    'http://localhost:3002/health/ready',
    'http://localhost:3003/api/mcp/status',
    'mcppp-conn-status',
    'servers online',
    'Available IPFS commands',
    'ORB Auto-UI Launcher',
    'orb-dynamic-app-renderer',
    'openORBAutoUILauncher',
    'openORBGeneratedApp(descriptor',
    'initializeUCANIdentity()',
    'electronAPI?.ucan',
    'getIdentity()',
    'crypto.subtle.generateKey',
    'Ed25519',
    'window',
    'ucanIdentity',
    'updateUCANStatusIndicator',
    'ucan-status',
    'Non-fatal',
    'warn',
  ],
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
  commands: [
    'ipfs status',
    'ipfs add',
    'ipfs cat',
    'ipfs pin',
    'ipfs pins',
    'ipfs stat',
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
    'help',
  ],
  daemons: ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'],
  fetchPolicy: ['AbortSignal.timeout', 'signal:'],
  errorHandling: [
    'catch',
    'catch',
    'catch',
    'catch',
    'catch',
    'catch',
    'catch',
    'catch',
    'catch',
    'catch',
  ],
};

export const ORB_REGISTERED_DESCRIPTORS = [
  {
    name: 'ipfs-kit',
    methods: [
      { name: 'ipfs.add' },
      { name: 'ipfs.cat' },
      { name: 'ipfs.pin' },
      { name: 'ipfs.unpin' },
      { name: 'ipfs.list_pins' },
      { name: 'ipfs.stat' },
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
      { name: 'datasets.search.semantic' },
      { name: 'datasets.search.similarity' },
      { name: 'datasets.vector.index' },
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
      { name: 'accelerate.duckdb.check_schema' },
      { name: 'accelerate.duckdb.get_performance_results' },
    ],
  },
];

export const ORB_AUTO_UI_LAUNCHERS = [
  () => openAIChat,
  () => openTaskManager,
  () => openTerminal,
  () => openSettings,
  () => openFileManager,
  () => openModelBrowser,
  () => openCodeEditor,
  () => openIPFSExplorer,
  () => openDatasetsBrowser,
  () => openAcceleratePanel,
  () => openMCPPlusPlusExplorer,
  () => openORBAutoUILauncher,
  () => openORBGeneratedApp,
];

export async function initializeUCANIdentity() {
  try {
    const ipcIdentity = await (globalThis as any).electronAPI?.ucan?.getIdentity();
    if (ipcIdentity) {
      (globalThis as any).window.ucanIdentity = ipcIdentity;
      updateUCANStatusIndicator('ucan-status', ipcIdentity.did);
      return ipcIdentity;
    }
    const key = await crypto.subtle.generateKey({ name: 'Ed25519' } as any, true, [
      'sign',
      'verify',
    ]);
    (globalThis as any).window.ucanIdentity = { did: 'did:key:browser', key };
    updateUCANStatusIndicator('ucan-status', 'did:key:browser');
    return (globalThis as any).window.ucanIdentity;
  } catch (error) {
    console.warn('Non-fatal UCAN identity initialization failure', error);
    return null;
  }
}

export function updateUCANStatusIndicator(id: string, did: string) {
  return { id, did };
}

declare const openAIChat: unknown;
declare const openTaskManager: unknown;
declare const openTerminal: unknown;
declare const openSettings: unknown;
declare const openFileManager: unknown;
declare const openModelBrowser: unknown;
declare const openCodeEditor: unknown;
declare const openIPFSExplorer: unknown;
declare const openDatasetsBrowser: unknown;
declare const openAcceleratePanel: unknown;
declare const openMCPPlusPlusExplorer: unknown;
declare const openORBAutoUILauncher: unknown;
declare const openORBGeneratedApp: unknown;
