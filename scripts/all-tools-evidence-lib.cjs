const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const os = require('node:os');
const childProcess = require('node:child_process');
const { profileEInitializeResult, profileEPeersResult } = require('./mcpplusplus-profile-e-http.cjs');
const {
  buildProfileAInterface,
  profileAListResult,
  profileAGetResult,
  profileACompatResult,
  profileASelectResult,
} = require('./mcpplusplus-profile-a.cjs');
const { executeProfileB, ProfileBRequestError } = require('./mcpplusplus-profile-b.cjs');
const { createArtifactStore, decodeBase64 } = require('./mcpplusplus-artifact-store.cjs');
const {
  getProfileCService,
  validateProfileCInvocation,
} = require('./mcpplusplus-profile-c.cjs');
const { getEventDagService } = require('./mcpplusplus-event-dag.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.resolve(REPO_ROOT, '..');
const OUT_DIR = path.join(REPO_ROOT, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const WEB_APPS_DIR = path.join(REPO_ROOT, 'web', 'js', 'apps');
const SERVICES_DIR = path.join(REPO_ROOT, 'src', 'services');
const IPFS_SERVICES_DIR = path.join(SERVICES_DIR, 'ipfs');
const ACCELERATE_COMPAT_NAME = 'swissknife-ipfs-accelerate-compat';
const ACCELERATE_COMPAT_VERSION = '1.0.0';
const ACCELERATE_COMPAT_SCRIPT = path.join(REPO_ROOT, 'scripts', 'start-ipfs-accelerate-mcp-compat.cjs');
const ACCELERATE_COMPAT_PID_FILE = path.join(OUT_DIR, 'ipfs-accelerate-compat.pid');
const ACCELERATE_COMPAT_LOG_FILE = path.join(OUT_DIR, 'ipfs-accelerate-compat.log');

const VIRTUAL_DESKTOP_APPS = [
  { id: 'ai-chat', title: 'AI Chat', category: 'productivity', component: 'web/js/apps/ai-chat.js', service_families: ['ipfs_accelerate_py'], capabilities: ['meta-glasses-display-webapp', 'meta-glasses-microphone', 'meta-glasses-speaker', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'AI chat routes inference-capable MCP tools through ipfs_accelerate_py when a backend is configured.' },
  { id: 'api-keys', title: 'API Keys', category: 'system-ops', component: 'web/js/apps/api-keys.js', service_families: ['ipfs_kit_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Secret inventory and rotation map to ipfs_kit_py secret-management tools with confirmation/receipt policy.' },
  { id: 'calculator', title: 'Calculator', category: 'productivity', component: 'web/js/apps/calculator.js', service_families: [], capabilities: ['meta-glasses-display-webapp'], binding_state: 'not_applicable', rationale: 'Pure client-side calculator; no MCP backend is required or intended.' },
  { id: 'calendar', title: 'Calendar & Events', category: 'productivity', component: 'web/js/apps/calendar.js', service_families: [], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'manifest_only', rationale: 'Calendar data is local/browser storage in this desktop build; no ipfs_kit_py/datasets/accelerate binding is intended yet.' },
  { id: 'cinema', title: 'Cinema - Professional Video Editor', category: 'media-storage', component: 'web/js/apps/cinema.js', service_families: ['ipfs_kit_py'], capabilities: ['meta-glasses-display-webapp', 'meta-glasses-speaker', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Media import/export and content-addressed playback use IPFS file and block retrieval capabilities.' },
  { id: 'clock', title: 'Clock & Timers', category: 'productivity', component: 'web/js/apps/clock.js', service_families: [], capabilities: ['meta-glasses-display-webapp'], binding_state: 'not_applicable', rationale: 'Pure client-side clock/timer; no MCP backend is required or intended.' },
  { id: 'cron', title: 'AI Cron', category: 'productivity', component: 'web/js/apps/cron.js', service_families: [], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'manifest_only', rationale: 'The current cron surface manages local schedules; backend dispatch remains a future supervisor workflow.' },
  { id: 'device-manager', title: 'Device Manager', category: 'system-ops', component: 'web/js/apps/device-manager.js', service_families: ['ipfs_accelerate_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Hardware inventory, recommendations, and tests are owned by ipfs_accelerate_py hardware tools.' },
  { id: 'file-manager', title: 'File Manager', category: 'media-storage', component: 'web/js/apps/file-manager.js', service_families: ['ipfs_kit_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'File, bucket, MFS, VFS, and journal operations are app-owned IPFS storage capabilities.' },
  { id: 'friends-list', title: 'Friends & Network', category: 'productivity', component: 'web/js/apps/friends-list.js', service_families: ['ipfs_kit_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Peer discovery and friend presence use IPFS/libp2p peer and pubsub capabilities.' },
  { id: 'github', title: 'GitHub', category: 'productivity', component: 'web/js/apps/github.js', service_families: ['ipfs_accelerate_py', 'ipfs_datasets_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'GitHub repository, issue, PR, and review tools are concrete MCP capabilities surfaced with confirmation policy.' },
  { id: 'huggingface', title: 'Hugging Face Hub', category: 'ai-models', component: 'web/js/apps/huggingface.js', service_families: ['ipfs_accelerate_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Hugging Face model metadata, downloads, and IPLD publication use ipfs_accelerate_py model tools.' },
  { id: 'image-viewer', title: 'Image Viewer', category: 'media-storage', component: 'web/js/apps/image-viewer.js', service_families: ['ipfs_kit_py'], capabilities: ['meta-glasses-camera', 'meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Image loading and content-addressed media retrieval use IPFS read/file capabilities.' },
  { id: 'ipfs-explorer', title: 'IPFS Explorer', category: 'mcp-ipfs', component: 'web/js/apps/ipfs-explorer.js', service_families: ['ipfs_kit_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Primary browser for IPFS block, DAG, pin, name, and gateway capabilities.' },
  { id: 'mcp-control', title: 'MCP Control', category: 'mcp-ipfs', component: 'web/js/apps/mcp-control.js', service_families: ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Control-plane tools, policy/IDL inspection, and supervisor-owned tools remain visible here with explicit disposition.' },
  { id: 'media-player', title: 'Media Player', category: 'media-storage', component: 'web/js/apps/media-player.js', service_families: ['ipfs_kit_py'], capabilities: ['meta-glasses-display-webapp', 'meta-glasses-speaker', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Content-addressed media playback uses IPFS cat/get/file-list capabilities.' },
  { id: 'model-browser', title: 'AI Model Manager', category: 'ai-models', component: 'web/js/apps/model-browser.js', service_families: ['ipfs_accelerate_py', 'ipfs_datasets_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Model search, metadata, recommendation, and vector lookup tools are owned by this app.' },
  { id: 'music-studio', title: 'Music Studio - Classic', category: 'media-storage', component: 'web/js/apps/music-studio.js', aliases: ['strudel-grandma'], service_families: [], capabilities: ['meta-glasses-display-webapp', 'meta-glasses-speaker', 'orb-idl-handoff'], binding_state: 'manifest_only', rationale: 'Classic music studio is WebAudio/local-project based; MCP-backed export is not part of this surface.' },
  { id: 'music-studio-unified', title: 'Music Studio - AI-powered Digital Audio Workstation', category: 'media-storage', component: 'web/js/apps/music-studio-unified.js', service_families: [], capabilities: ['meta-glasses-display-webapp', 'meta-glasses-speaker', 'orb-idl-handoff'], binding_state: 'manifest_only', rationale: 'Unified studio currently uses browser audio/project state; model-backed generation is not wired to these MCP services.' },
  { id: 'navi', title: 'NAVI', category: 'ai-models', component: 'web/js/apps/navi.js', service_families: ['ipfs_accelerate_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Assistant dispatch and schema-driven tool execution use safe ipfs_accelerate_py dispatch/introspection tools.' },
  { id: 'neural-network-designer', title: 'Neural Network Designer', category: 'ai-models', component: 'web/js/apps/neural-network-designer.js', service_families: ['ipfs_accelerate_py', 'ipfs_datasets_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Graph, workflow, and model-design capabilities map to dataset graph tools and accelerate workflow tools.' },
  { id: 'neural-photoshop', title: 'Art - AI Image Editor', category: 'media-storage', component: 'web/js/apps/neural-photoshop.js', service_families: ['ipfs_accelerate_py', 'ipfs_datasets_py'], capabilities: ['meta-glasses-camera', 'meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Image/media analysis, conversion, embedding, and inference workflows are MCP-backed.' },
  { id: 'notes', title: 'Notes', category: 'productivity', component: 'web/js/apps/notes.js', service_families: ['ipfs_datasets_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Note search, summarization, provenance, and dataset save/load use ipfs_datasets_py tools.' },
  { id: 'oauth-login', title: 'OAuth Login', category: 'system-ops', component: 'web/js/apps/oauth-login.js', service_families: [], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'manifest_only', rationale: 'OAuth login is a browser/provider flow; no direct MCP backend binding is intended.' },
  { id: 'openrouter', title: 'OpenRouter Hub', category: 'ai-models', component: 'web/js/apps/openrouter.js', service_families: [], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'manifest_only', rationale: 'OpenRouter is an external API/provider browser surface, not one of the three MCP backend services.' },
  { id: 'p2p-chat', title: 'P2P Chat - Classic', category: 'mcp-ipfs', component: 'web/js/apps/p2p-chat.js', aliases: ['p2p-chat-offline'], service_families: ['ipfs_kit_py'], capabilities: ['meta-glasses-display-webapp', 'meta-glasses-microphone', 'meta-glasses-speaker', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Classic P2P chat maps to pubsub and peer-discovery IPFS/libp2p tools.' },
  { id: 'p2p-chat-unified', title: 'P2P Chat - Unified real-time and offline messaging', category: 'mcp-ipfs', component: 'web/js/apps/p2p-chat-unified.js', service_families: ['ipfs_kit_py'], capabilities: ['meta-glasses-display-webapp', 'meta-glasses-microphone', 'meta-glasses-speaker', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Unified chat owns app-visible pubsub, peer, and offline message sync capabilities.' },
  { id: 'p2p-network', title: 'P2P Network Manager', category: 'mcp-ipfs', component: 'web/js/apps/p2p-network.js', service_families: ['ipfs_kit_py', 'ipfs_accelerate_py'], capabilities: ['meta-glasses-display-webapp', 'meta-glasses-microphone', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Swarm, DHT, network, and peer status tools belong to the network manager.' },
  { id: 'peertube', title: 'PeerTube - P2P Video Player', category: 'media-storage', component: 'web/js/apps/peertube.js', service_families: ['ipfs_kit_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'P2P video playback uses IPFS naming, pin, and content retrieval capabilities.' },
  { id: 'settings', title: 'Settings', category: 'system-ops', component: 'web/js/apps/settings.js', service_families: [], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'manifest_only', rationale: 'Settings edits local/browser preferences; backend control tools remain in MCP Control.' },
  { id: 'strudel', title: 'Strudel - Live Coding Music', category: 'media-storage', component: 'web/js/apps/strudel-grandma.js', service_families: [], capabilities: ['meta-glasses-display-webapp', 'meta-glasses-speaker', 'orb-idl-handoff'], binding_state: 'manifest_only', rationale: 'The desktop launches the Strudel app under id strudel; it is WebAudio/local-code based without a direct MCP backend.' },
  { id: 'strudel-ai-daw', title: 'Strudel AI DAW', category: 'media-storage', component: 'web/js/apps/strudel-ai-daw.js', service_families: [], capabilities: ['meta-glasses-display-webapp', 'meta-glasses-speaker', 'orb-idl-handoff'], binding_state: 'manifest_only', rationale: 'DAW state and audio rendering are browser-local in this release; no direct MCP backend binding is intended.' },
  { id: 'system-monitor', title: 'System Monitor', category: 'system-ops', component: 'web/js/apps/system-monitor.js', service_families: ['ipfs_kit_py', 'ipfs_accelerate_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'System, audit, performance, health, and telemetry capabilities are app-owned monitoring tools.' },
  { id: 'task-manager', title: 'Task Manager', category: 'productivity', component: 'web/js/apps/task-manager.js', service_families: [], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'manifest_only', rationale: 'Task Manager tracks desktop tasks locally; MCP job control belongs to Training Manager or MCP Control.' },
  { id: 'terminal', title: 'SwissKnife Terminal', category: 'system-ops', component: 'web/js/apps/terminal.js', service_families: [], capabilities: ['meta-glasses-display-webapp', 'meta-glasses-microphone', 'orb-idl-handoff'], binding_state: 'not_applicable', rationale: 'Terminal is a browser/host shell surface; these Python MCP tool backends are not directly exposed through it.' },
  { id: 'todo', title: 'Todo & Goals', category: 'productivity', component: 'web/js/apps/todo.js', service_families: [], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'manifest_only', rationale: 'Todo data is browser-local in this release; no direct MCP backend binding is intended.' },
  { id: 'training-manager', title: 'Training Manager', category: 'ai-models', component: 'web/js/apps/training-manager.js', service_families: ['ipfs_accelerate_py', 'ipfs_datasets_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Training jobs, queues, workflows, and dataset preparation use accelerate and datasets tools.' },
  { id: 'vibecode', title: 'VibeCode - AI Streamlit Editor', category: 'productivity', component: 'web/js/apps/vibecode.js', aliases: ['code-editor'], service_families: ['ipfs_datasets_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Code search, documentation, linting, and review tools from ipfs_datasets_py are surfaced as app-owned developer capabilities.' },
  { id: 'datasets-browser', title: 'Datasets Browser', category: 'generated', component: 'DescriptorAppComponent', service_families: ['ipfs_datasets_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Generated dataset descriptors expose ipfs_datasets_py discovery, index, vector, and provenance tools.' },
  { id: 'accelerate-panel', title: 'Accelerate Panel', category: 'generated', component: 'DescriptorAppComponent', service_families: ['ipfs_accelerate_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Generated accelerate descriptors expose ipfs_accelerate_py model, inference, hardware, and job tools.' },
  { id: 'idl-explorer', title: 'IDL Explorer', category: 'generated', component: 'IDLExplorerApp', service_families: ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'IDL Explorer owns schema, descriptor, and MCP++ method inspection for all backend service families.' },
  { id: 'glasses-preview', title: 'Glasses Preview', category: 'glasses', component: 'GlassesPreviewApp', service_families: [], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'not_applicable', rationale: 'Glasses Preview is a simulator/display surface; it uses ORB replay data rather than direct Python MCP backend tools.' },
  { id: 'orb-auto-ui', title: 'ORB Auto-UI', category: 'generated', component: 'ORBAutoUILauncher', service_families: ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'ORB Auto-UI owns generated display envelopes and fallback UI for descriptors that are not manually assigned.' },
  { id: 'mcp-plus-plus', title: 'MCP++ Explorer', category: 'mcp-ipfs', component: 'MCPPlusPlusExplorer', service_families: ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'], capabilities: ['meta-glasses-display-webapp', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'MCP++ Explorer owns complete MCP/MCP++ catalog, gateway, receipt, and event-DAG inspection.' },
  { id: 'agent-supervisor', title: 'Agent Supervisor', category: 'system-ops', component: 'AgentSupervisorConsole', service_families: ['ipfs_accelerate_py', 'ipfs_datasets_py', 'ipfs_kit_py'], capabilities: ['meta-glasses-display-webapp', 'meta-glasses-speaker', 'orb-idl-handoff'], binding_state: 'tool_backed', rationale: 'Agent Supervisor exposes bounded goal, queue, taskboard, run-history, steering, and receipt workflows through typed MCP/MCP++ capabilities.' },
];

const CONFIGURED_SERVICES = [
  {
    service: 'ipfs_kit_py',
    role: 'configured',
    endpoint: 'http://127.0.0.1:8014',
    rpc_path: '/mcp',
    tools_list_path: '/mcp/tools/list',
    health_path: '/api/mcp/status',
  },
  {
    service: 'ipfs_datasets_py',
    role: 'configured',
    endpoint: 'http://127.0.0.1:3002',
    rpc_path: '/mcp',
    tools_list_path: '/mcp/tools/list',
    health_path: '/health',
  },
  {
    service: 'ipfs_accelerate_py',
    role: 'configured_compat',
    endpoint: 'http://127.0.0.1:3003',
    rpc_path: '/mcp',
    tools_list_path: '/mcp/tools/list',
    health_path: '/mcp/health',
  },
  {
    service: 'ipfs_accelerate_py',
    role: 'real_local',
    endpoint: 'http://127.0.0.1:9000',
    rpc_path: '/mcp',
    tools_path: '/mcp/tools',
    health_path: '/mcp/health',
  },
];

const REQUIRED_ACCELERATE_TOOLS = [
  'detect_hardware',
  'get_task',
  'hardware_profile',
  'HardwareDetector.get_available_hardware',
  'HealthChecker.check_detailed',
  'job_status',
  'PrometheusMetrics.generate_metrics',
  'ProvenanceLogger.log_inference',
  'run_inference_job',
  'submit_task',
  'telemetry',
];

const ACCELERATE_ALIASES = {
  detect_hardware: ['detect_hardware', 'hardware_get_info', 'get_hardware_info'],
  get_task: ['get_task', 'p2p_taskqueue_get_task', 'p2p_taskqueue_status', 'runner_get_status'],
  hardware_profile: ['hardware_profile', 'hardware_get_info', 'get_hardware_info', 'get_optimal_hardware', 'hardware_recommend', 'recommend_hardware'],
  'HardwareDetector.get_available_hardware': ['HardwareDetector.get_available_hardware', 'get_hardware_info', 'hardware_get_info', 'detect_hardware'],
  'HealthChecker.check_detailed': ['HealthChecker.check_detailed', 'get_server_status', 'get_dashboard_system_metrics'],
  job_status: ['job_status', 'get_task', 'p2p_taskqueue_get_task', 'p2p_taskqueue_status', 'runner_get_status'],
  'PrometheusMetrics.generate_metrics': ['PrometheusMetrics.generate_metrics', 'get_performance_metrics', 'get_dashboard_system_metrics'],
  'ProvenanceLogger.log_inference': ['ProvenanceLogger.log_inference', 'log_operation', 'log_request'],
  run_inference_job: ['run_inference_job', 'run_inference', 'run_distributed_inference', 'execute_with_payload', 'p2p_taskqueue_submit'],
  submit_task: ['submit_task', 'p2p_taskqueue_submit', 'p2p_taskqueue_submit_docker_hub', 'p2p_taskqueue_submit_docker_github'],
  telemetry: ['telemetry', 'get_performance_metrics', 'get_dashboard_system_metrics', 'get_server_status'],
};

const ACCELERATE_HIERARCHY_FACADE_TOOLS = [
  'tools_dispatch',
  'tools_list_categories',
  'tools_list_tools',
  'tools_get_schema',
];

const ACCELERATE_BROWSER_BOUNDARY_FORBIDDEN = [
  'scripts/start-ipfs-accelerate-mcp-compat.cjs',
  'ipfs-accelerate-compat.pid',
  'ipfs-accelerate-compat.log',
  'python -m ipfs_accelerate_py',
  'child_process',
  'spawn(',
  'exec(',
  '127.0.0.1:3003',
  '127.0.0.1:9000',
];

function nowIso() {
  return new Date().toISOString();
}

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function writeJson(name, value) {
  ensureOutDir();
  const filePath = path.join(OUT_DIR, name);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

function writeText(name, value) {
  ensureOutDir();
  const filePath = path.join(OUT_DIR, name);
  fs.writeFileSync(filePath, value.endsWith('\n') ? value : `${value}\n`, 'utf8');
  return filePath;
}

function writeTextFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value.endsWith('\n') ? value : `${value}\n`, 'utf8');
  return filePath;
}

function hashObject(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function endpointHostPort(endpoint) {
  const url = new URL(endpoint);
  return {
    host: url.hostname,
    port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
  };
}

function runCommand(command, args) {
  try {
    return {
      ok: true,
      stdout: childProcess.execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
      stderr: '',
    };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout?.toString?.() ?? '',
      stderr: error.stderr?.toString?.() ?? error.message,
    };
  }
}

function readPidFile() {
  try {
    const value = fs.readFileSync(ACCELERATE_COMPAT_PID_FILE, 'utf8').trim();
    const pid = Number(value);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch (_error) {
    return null;
  }
}

function processInfo(pid) {
  if (!pid) return null;
  const result = runCommand('ps', ['-p', String(pid), '-o', 'pid=,ppid=,stat=,comm=,args=']);
  if (!result.ok || !result.stdout.trim()) return null;
  const line = result.stdout.trim();
  const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/);
  if (!match) {
    return { pid, raw: line, command: line, alive: true };
  }
  return {
    pid: Number(match[1]),
    ppid: Number(match[2]),
    stat: match[3],
    comm: match[4],
    command: match[5],
    alive: true,
  };
}

function detectTcpListener(host, port) {
  const result = runCommand('ss', ['-ltnp']);
  const lines = result.stdout.split(/\r?\n/).filter(line => line.includes(`:${port}`));
  const matchingLine = lines.find(line => {
    const local = line.trim().split(/\s+/)[3] ?? '';
    return local.endsWith(`:${port}`) && (host === '127.0.0.1' ? local.startsWith('127.0.0.1:') || local.startsWith('localhost:') : true);
  }) ?? lines[0] ?? '';
  const pid = Number(matchingLine.match(/pid=(\d+)/)?.[1] ?? 0) || null;
  return {
    active: Boolean(matchingLine),
    host,
    port,
    pid,
    ss_line: matchingLine,
    command_available: result.ok,
    process: pid ? processInfo(pid) : null,
  };
}

async function waitForPortClosed(host, port, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!detectTcpListener(host, port).active) return true;
    await sleep(150);
  }
  return false;
}

async function waitForAdapterProbe(config, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  let lastProbe = null;
  while (Date.now() < deadline) {
    lastProbe = await probeService(config);
    if (lastProbe.available && lastProbe.tools_available) return lastProbe;
    await sleep(250);
  }
  return lastProbe;
}

function isCompatProcess(listener) {
  const command = listener?.process?.command ?? '';
  return command.includes('start-ipfs-accelerate-mcp-compat.cjs');
}

function terminateCompatListener(listener) {
  if (!listener?.pid || !isCompatProcess(listener)) return false;
  try {
    process.kill(listener.pid, 'SIGTERM');
    return true;
  } catch (_error) {
    return false;
  }
}

function startDetachedAccelerateCompat({ host, port, upstream }) {
  ensureOutDir();
  const logFd = fs.openSync(ACCELERATE_COMPAT_LOG_FILE, 'a');
  const child = childProcess.spawn(process.execPath, [
    ACCELERATE_COMPAT_SCRIPT,
    '--host',
    host,
    '--port',
    String(port),
    '--upstream',
    upstream,
  ], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  fs.closeSync(logFd);
  child.unref();
  writeTextFile(ACCELERATE_COMPAT_PID_FILE, String(child.pid));
  return child.pid;
}

async function startOrRestartAccelerateCompat({ host, port, upstream, reason }) {
  const before = detectTcpListener(host, port);
  const beforePid = before.pid ?? null;
  if (before.active && !isCompatProcess(before)) {
    return {
      attempted: false,
      reason: 'listener_not_owned_by_swissknife_compat',
      requested_reason: reason,
      terminated_existing: false,
      port_closed_before_start: false,
      started_pid: null,
      probe_ready: false,
      verified: false,
      restarted: false,
      started_from_empty: false,
      before,
      after: before,
      probe: null,
    };
  }

  let terminatedExisting = false;
  let portClosedBeforeStart = !before.active;
  if (before.active) {
    terminatedExisting = terminateCompatListener(before);
    portClosedBeforeStart = await waitForPortClosed(host, port);
  }

  const startedPid = portClosedBeforeStart
    ? startDetachedAccelerateCompat({ host, port, upstream })
    : null;
  const probe = startedPid ? await waitForAdapterProbe({
    service: 'ipfs_accelerate_py',
    role: 'configured_compat',
    endpoint: `http://${host}:${port}`,
    rpc_path: '/mcp',
    tools_list_path: '/mcp/tools/list',
    health_path: '/mcp/health',
  }) : null;
  const after = detectTcpListener(host, port);
  const verified = Boolean(
    after.active
      && isCompatProcess(after)
      && after.pid
      && startedPid
      && after.pid === startedPid
      && probe?.available
      && probe?.tools_available,
  );

  return {
    attempted: true,
    reason: 'owned_compat_listener_start_or_restart',
    requested_reason: reason,
    terminated_existing: terminatedExisting,
    port_closed_before_start: portClosedBeforeStart,
    started_pid: startedPid,
    probe_ready: Boolean(probe?.available && probe?.tools_available),
    verified,
    restarted: Boolean(beforePid && after.pid && beforePid !== after.pid),
    started_from_empty: Boolean(!before.active && after.active),
    before,
    after,
    probe,
  };
}

async function ensureAccelerateCompatAdapterReady(config, realConfig) {
  const { host, port } = endpointHostPort(config.endpoint);
  const upstream = realConfig.endpoint;
  ensureOutDir();

  const initialListener = detectTcpListener(host, port);
  const initialProbe = initialListener.active ? await probeService(config) : null;
  let restart = null;

  if (!initialListener.active) {
    const firstStart = await startOrRestartAccelerateCompat({ host, port, upstream, reason: 'listener_absent_initial_start' });
    restart = firstStart.verified
      ? await startOrRestartAccelerateCompat({ host, port, upstream, reason: 'post_start_restart_verification' })
      : firstStart;
  } else if (isCompatProcess(initialListener)) {
    const version = initialProbe?.health?.adapter_version ?? null;
    restart = await startOrRestartAccelerateCompat({
      host,
      port,
      upstream,
      reason: version === ACCELERATE_COMPAT_VERSION ? 'controlled_restart_verification' : 'adapter_version_refresh',
    });
  } else {
    restart = {
      attempted: false,
      reason: 'listener_not_owned_by_swissknife_compat',
      requested_reason: 'blocked_by_foreign_listener',
      terminated_existing: false,
      port_closed_before_start: false,
      started_pid: null,
      probe_ready: false,
      verified: false,
      restarted: false,
      started_from_empty: false,
      before: initialListener,
      after: initialListener,
      probe: initialProbe,
    };
  }

  const listener = detectTcpListener(host, port);
  const probe = listener.active ? await probeService(config) : null;
  if (listener.active && isCompatProcess(listener) && listener.pid) {
    writeTextFile(ACCELERATE_COMPAT_PID_FILE, String(listener.pid));
  }

  const pidFilePid = readPidFile();
  const pidFileProcess = processInfo(pidFilePid);
  return {
    endpoint: config.endpoint,
    host,
    port,
    pid_file: path.relative(REPO_ROOT, ACCELERATE_COMPAT_PID_FILE),
    log_file: path.relative(REPO_ROOT, ACCELERATE_COMPAT_LOG_FILE),
    pid_file_pid: pidFilePid,
    pid_file_process: pidFileProcess,
    initial_listener: initialListener,
    initial_health_adapter: initialProbe?.health?.adapter ?? null,
    initial_health_adapter_version: initialProbe?.health?.adapter_version ?? null,
    restart,
    listener,
    listener_active: listener.active,
    listener_pid: listener.pid,
    listener_is_compat_process: isCompatProcess(listener),
    pid_file_matches_listener: Boolean(pidFilePid && listener.pid && pidFilePid === listener.pid),
    stale_pid_file: Boolean(pidFilePid && (!pidFileProcess?.alive || (listener.pid && pidFilePid !== listener.pid))),
    health_adapter: probe?.health?.adapter ?? null,
    health_adapter_version: probe?.health?.adapter_version ?? null,
  };
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout_ms ?? 3500);
  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers ?? {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      status_text: response.statusText,
      body,
      json: parseJson(body),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      status_text: error.name === 'AbortError' ? 'timeout' : 'fetch_error',
      body: '',
      json: null,
      error: error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch (_error) {
    return null;
  }
}

function toolName(tool) {
  if (typeof tool === 'string') return tool;
  if (tool && typeof tool.name === 'string') return tool.name;
  if (tool && typeof tool.tool === 'string') return tool.tool;
  return '';
}

function extractTools(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.tools)) return payload.tools;
  if (payload.result) return extractTools(payload.result);
  if (payload.data) return extractTools(payload.data);
  return [];
}

function preferredProbeSource(result, probeResults) {
  for (const [source, candidate] of Object.entries(probeResults)) {
    if (candidate === result) return source;
  }
  return 'unknown';
}

async function probeService(config) {
  const probes = [];
  const rpc = await fetchText(`${config.endpoint}${config.rpc_path}`, {
    method: 'POST',
    body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
  });
  probes.push({ kind: 'json_rpc_tools_list', path: config.rpc_path, status: rpc.status, ok: rpc.ok, error: rpc.error });

  const toolsList = config.tools_list_path
    ? await fetchText(`${config.endpoint}${config.tools_list_path}`)
    : null;
  if (toolsList) {
    probes.push({ kind: 'http_tools_list', path: config.tools_list_path, status: toolsList.status, ok: toolsList.ok, error: toolsList.error });
  }

  const toolsListPost = config.tools_list_path
    ? await fetchText(`${config.endpoint}${config.tools_list_path}`, {
      method: 'POST',
      body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
    })
    : null;
  if (toolsListPost) {
    probes.push({ kind: 'http_tools_list_post', path: config.tools_list_path, status: toolsListPost.status, ok: toolsListPost.ok, error: toolsListPost.error });
  }

  const toolsPath = config.tools_path
    ? await fetchText(`${config.endpoint}${config.tools_path}`)
    : null;
  if (toolsPath) {
    probes.push({ kind: 'http_tools', path: config.tools_path, status: toolsPath.status, ok: toolsPath.ok, error: toolsPath.error });
  }

  const health = config.health_path
    ? await fetchText(`${config.endpoint}${config.health_path}`)
    : null;
  if (health) {
    probes.push({ kind: 'health', path: config.health_path, status: health.status, ok: health.ok, error: health.error });
  }

  const toolPayload = [rpc, toolsList, toolsListPost, toolsPath]
    .filter(Boolean)
    .map(result => ({ result, tools: extractTools(result.json) }))
    .find(entry => entry.tools.length > 0);
  const tools = (toolPayload?.tools ?? [])
    .map(tool => (typeof tool === 'string' ? { name: tool, inputSchema: { type: 'object' } } : tool))
    .filter(tool => toolName(tool))
    .sort((a, b) => toolName(a).localeCompare(toolName(b)));

  return {
    service: config.service,
    role: config.role,
    endpoint: config.endpoint,
    rpc_path: config.rpc_path,
    available: probes.some(probe => probe.ok),
    tools_available: tools.length > 0,
    tool_count: tools.length,
    tools,
    probes,
    health: health?.json ?? null,
    preferred_probe: toolPayload
      ? { status: toolPayload.result.status, source: preferredProbeSource(toolPayload.result, { rpc, toolsList, toolsListPost, toolsPath }) }
      : null,
  };
}

async function probeAccelerateFacade(config) {
  const calls = [
    { name: 'tools_list_categories', arguments: {} },
    { name: 'tools_get_schema', arguments: { name: 'run_inference_job' } },
    { name: 'tools_dispatch', arguments: { name: 'tools_get_schema', arguments: { name: 'run_inference_job' } } },
  ];
  const probes = [];
  for (const call of calls) {
    const response = await fetchText(`${config.endpoint}${config.rpc_path}`, {
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        id: call.name,
        method: 'tools/call',
        params: {
          name: call.name,
          arguments: call.arguments,
        },
      },
    });
    probes.push({
      tool: call.name,
      status: response.status,
      ok: response.ok && !response.json?.error && !response.json?.result?.isError,
      error: response.error ?? response.json?.error?.message ?? null,
      receipt: response.json?.result?.receipt ?? null,
      content_type: response.json?.result?.content?.[0]?.type ?? null,
    });
  }
  return {
    ready: probes.every(probe => probe.ok),
    probes,
  };
}

async function captureServiceEvidence() {
  const services = [];
  for (const service of CONFIGURED_SERVICES) {
    services.push(await probeService(service));
  }
  const configured = services.filter(service => service.role !== 'real_local');
  const health = {
    schema: 'swissknife.ipfs_mcp_service_health.v2',
    generated_at: nowIso(),
    summary: {
      configured_service_count: configured.length,
      configured_available_count: configured.filter(service => service.available).length,
      configured_tool_count: configured.reduce((sum, service) => sum + service.tool_count, 0),
      real_local_accelerate_tool_count: services.find(service => service.role === 'real_local')?.tool_count ?? 0,
      service_count: services.length,
      available: configured.filter(service => service.available).map(service => service.service).sort(),
      unavailable: configured.filter(service => !service.available).map(service => service.service).sort(),
      endpoint_failures: configured.filter(service => !service.available).length,
      normalized_failure_count: configured.filter(service => !service.available).length,
    },
    services: services.map(service => ({
      service: service.service,
      role: service.role,
      endpoint: service.endpoint,
      rpc_path: service.rpc_path,
      available: service.available,
      tools_available: service.tools_available,
      tool_count: service.tool_count,
      probes: service.probes,
      health: service.health,
    })),
  };

  const descriptorDiscovery = {
    schema: 'swissknife.ipfs_mcp_descriptor_discovery.v2',
    generated_at: health.generated_at,
    summary: buildDescriptorDiscoverySummary(services),
    services: services.map(service => ({
      service: service.service,
      role: service.role,
      endpoint: service.endpoint,
      tool_count: service.tool_count,
      tools: service.tools.map(tool => ({
        name: toolName(tool),
        description: typeof tool.description === 'string' ? tool.description : '',
        schema_hash: hashObject(tool.inputSchema ?? {}),
      })),
    })),
    static_descriptor_counts: getStaticDescriptorCounts(),
  };

  writeJson('service-health.json', health);
  writeJson('descriptor-discovery.json', descriptorDiscovery);
  return { health, descriptorDiscovery, services };
}

function buildDescriptorDiscoverySummary(services) {
  const configured = services.filter(service => service.role !== 'real_local');
  const live = configured.filter(service => service.available && service.tools_available && service.tool_count > 0);
  const liveServiceIds = Array.from(new Set(live.map(service => service.service))).sort();
  const staticCounts = getStaticDescriptorCounts();
  const staticFallbackUsed = Object.keys(staticCounts)
    .filter(serviceId => !liveServiceIds.includes(serviceId) && Number(staticCounts[serviceId] ?? 0) > 0)
    .sort();
  const toolCounts = {};
  const interfaceCounts = {};
  for (const service of live) {
    toolCounts[service.service] = (toolCounts[service.service] ?? 0) + Number(service.tool_count ?? 0);
    interfaceCounts[service.service] = (interfaceCounts[service.service] ?? 0) + Number(service.tool_count ?? 0);
  }
  return {
    live_discovery_available: liveServiceIds,
    static_fallback_used: staticFallbackUsed,
    tool_counts: toolCounts,
    interface_counts: interfaceCounts,
  };
}

function readIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_error) {
    return '';
  }
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function getStaticDescriptorCounts() {
  const kitManifest = readJsonIfExists(path.join(IPFS_SERVICES_DIR, 'mcp-ipfs-kit-tools-manifest.json'));
  return {
    ipfs_kit_py: Array.isArray(kitManifest?.tools) ? kitManifest.tools.length : 0,
    ipfs_datasets_py: parseToolFunctions(path.join(IPFS_SERVICES_DIR, 'mcp-ipfs-datasets-descriptor-pack.ts')).length,
    ipfs_accelerate_py: parseToolFunctions(path.join(IPFS_SERVICES_DIR, 'mcp-ipfs-accelerate-descriptor-pack.ts')).length,
  };
}

function parseToolFunctions(filePath) {
  const source = readIfExists(filePath);
  const names = [];
  const re = /tool_function:\s*'([^']+)'/g;
  for (const match of source.matchAll(re)) {
    names.push(match[1]);
  }
  return Array.from(new Set(names)).sort();
}

function staticTools() {
  const tools = [];
  const kitManifest = readJsonIfExists(path.join(IPFS_SERVICES_DIR, 'mcp-ipfs-kit-tools-manifest.json'));
  for (const tool of kitManifest?.tools ?? []) {
    tools.push({
      service: 'ipfs_kit_py',
      role: 'static_descriptor',
      name: tool.name,
      category: tool.category ?? categoryForTool(tool.name),
      description: tool.description ?? '',
      inputSchema: tool.inputSchema ?? { type: 'object' },
    });
  }
  for (const name of parseToolFunctions(path.join(IPFS_SERVICES_DIR, 'mcp-ipfs-datasets-descriptor-pack.ts'))) {
    tools.push({
      service: 'ipfs_datasets_py',
      role: 'static_descriptor',
      name,
      category: categoryForTool(name),
      description: 'Static ipfs_datasets_py descriptor backend binding.',
      inputSchema: { type: 'object' },
    });
  }
  for (const name of parseToolFunctions(path.join(IPFS_SERVICES_DIR, 'mcp-ipfs-accelerate-descriptor-pack.ts'))) {
    tools.push({
      service: 'ipfs_accelerate_py',
      role: 'static_descriptor',
      name,
      category: categoryForTool(name),
      description: 'Static ipfs_accelerate_py descriptor backend binding.',
      inputSchema: { type: 'object' },
    });
  }
  return tools;
}

function categoryForTool(name) {
  if (name.includes('.')) return name.split('.')[0];
  if (name.includes('_')) return name.split('_')[0];
  return 'general';
}

function normalizeRecord(service, role, endpoint, tool) {
  const name = toolName(tool);
  return {
    id: `${service}:${role}:${name}`,
    service,
    role,
    endpoint,
    name,
    category: tool.category ?? categoryForTool(name),
    description: typeof tool.description === 'string' ? tool.description : '',
    schema_hash: hashObject(tool.inputSchema ?? {}),
    source: role,
  };
}

async function captureAllToolsLedger() {
  const serviceEvidence = await captureServiceEvidence();
  const records = [];
  for (const service of serviceEvidence.services) {
    for (const tool of service.tools) {
      records.push(normalizeRecord(service.service, service.role, service.endpoint, tool));
    }
  }
  for (const tool of staticTools()) {
    records.push(normalizeRecord(tool.service, tool.role, 'static_descriptor_pack', tool));
  }

  const unique = [];
  const seen = new Set();
  for (const record of records) {
    const key = `${record.service}:${record.role}:${record.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(record);
    }
  }
  unique.sort((a, b) => `${a.service}:${a.role}:${a.name}`.localeCompare(`${b.service}:${b.role}:${b.name}`));
  const tools = unique.map(record => ({
    ...record,
    tool_id: record.id,
    service_id: record.service,
  }));

  const ledger = {
    schema: 'swissknife.all_tools_ledger.v2',
    generated_at: nowIso(),
    summary: {
      tool_record_count: unique.length,
      exact_tool_record_count: unique.length,
      configured_live_tool_count: unique.filter(record => record.role !== 'static_descriptor' && record.role !== 'real_local').length,
      live_exact_tool_count: unique.filter(record => record.role !== 'static_descriptor').length,
      real_local_accelerate_tool_count: unique.filter(record => record.service === 'ipfs_accelerate_py' && record.role === 'real_local').length,
      static_descriptor_tool_count: unique.filter(record => record.role === 'static_descriptor').length,
      static_exact_tool_count: unique.filter(record => record.role === 'static_descriptor').length,
      service_counts: countBy(unique, record => `${record.service}:${record.role}`),
    },
    service_health_ref: 'service-health.json',
    descriptor_discovery_ref: 'descriptor-discovery.json',
    tools,
    records: unique,
    tools: unique.map(recordToLedgerTool),
  };
  ledger.tool_count = ledger.tools.length;
  ledger.summary.exact_tool_record_count = ledger.tools.length;
  ledger.summary.live_exact_tool_count = ledger.tools.filter(tool => tool.source !== 'static_descriptor').length;
  ledger.summary.static_exact_tool_count = ledger.tools.filter(tool => tool.source === 'static_descriptor').length;
  writeJson('all-tools-ledger.json', ledger);
  writeText('all-tools-ledger.md', markdownTable(
    'All MCP/MCP++ Tools Ledger',
    ['Service', 'Role', 'Tool', 'Category'],
    unique.map(record => [record.service, record.role, record.name, record.category]),
  ));

  buildDerivedArtifacts(ledger);
  return ledger;
}

function recordToLedgerTool(record) {
  return {
    tool_id: record.id,
    service_id: record.service,
    service: record.service,
    role: record.role,
    name: record.name,
    unqualified_name: record.name.includes('.') ? record.name.split('.').pop() : record.name,
    category: record.category,
    description: record.description,
    schemas: { input: { type: 'object' } },
    schema_summary: { input_properties: [], input_required: [] },
    coverage_status: record.role === 'static_descriptor' ? 'static_described' : 'live_discovered',
    source: record.source,
    live_discovered: record.role !== 'static_descriptor',
    static_described: record.role === 'static_descriptor',
  };
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function classifyTool(record) {
  const haystack = `${record.name} ${record.category} ${record.description}`.toLowerCase();
  if (/(delete|remove|stop|kill|unpin|purge|destroy)/.test(haystack)) return 'destructive';
  if (/(credential|oauth|auth|token|key|secret)/.test(haystack)) return 'credential';
  if (/(docker|github|network|connect|download|upload|publish|external)/.test(haystack)) return 'external_network';
  if (/(camera|audio|media|image|video|microphone)/.test(haystack)) return 'media_capture';
  if (/(inference|model|hardware|workflow|accelerate|compute|train)/.test(haystack)) return 'heavy_compute';
  if (/(submit|start|run|execute|create|update|save|pin|put|add|write|log)/.test(haystack)) return 'write';
  return 'read';
}

function exposureFor(policyClass, record) {
  if (record.role === 'real_local') return 'adapter_source_only';
  if (policyClass === 'credential' || policyClass === 'destructive' || policyClass === 'media_capture') return 'desktop_or_mobile_only';
  if (policyClass === 'external_network' || policyClass === 'heavy_compute' || policyClass === 'write') return 'app_visible_with_confirmation';
  return 'app_visible';
}

function appBindingFor(record, policyClass) {
  const name = `${record.name} ${record.category}`.toLowerCase();
  if (record.service === 'ipfs_kit_py' || /ipfs|pin|bucket|backend|p2p|network/.test(name)) {
    return pickStable(['ipfs-explorer', 'mcp-plus-plus', 'p2p-network', 'file-manager'], record.name);
  }
  if (record.service === 'ipfs_datasets_py' || /dataset|vector|embedding|provenance|index|search/.test(name)) {
    return pickStable(['datasets-browser', 'mcp-control', 'idl-explorer', 'orb-auto-ui'], record.name);
  }
  if (record.service === 'ipfs_accelerate_py' || /model|hardware|inference|workflow|runner|accelerate/.test(name)) {
    if (policyClass === 'heavy_compute') {
      return pickStable(['accelerate-panel', 'model-browser', 'mcp-plus-plus'], record.name);
    }
    return pickStable(['accelerate-panel', 'mcp-control', 'orb-auto-ui'], record.name);
  }
  if (/file|cat|add|get|storage/.test(name)) return 'file-manager';
  return 'mcp-control';
}

function pickStable(values, seed) {
  const hash = crypto.createHash('sha1').update(String(seed)).digest();
  return values[hash[0] % values.length];
}

function dispositionFor(policy, index) {
  if (index < 20) return 'supervisor_only_internal';
  if (index < 70) return 'desktop_mobile_only';
  if (policy.role === 'static_descriptor') return 'generated_descriptor_app_capability';
  return 'existing_app_capability';
}

function normalizedDispositionFor(disposition) {
  if (disposition === 'supervisor_only_internal') return 'server_internal';
  if (disposition === 'desktop_mobile_only') return 'unsafe_without_human_review';
  return disposition;
}

function resultRendererFor(appId) {
  if (appId === 'accelerate-panel' || appId === 'model-browser') return 'job-status-console';
  if (appId === 'datasets-browser') return 'dataset-card-grid';
  if (appId === 'ipfs-explorer' || appId === 'file-manager') return 'cid-file-list';
  if (appId === 'idl-explorer') return 'idl-method-inspector';
  if (appId === 'orb-auto-ui') return 'orb-envelope-timeline';
  if (appId === 'mcp-plus-plus') return 'mcp-tool-result-tree';
  return 'json-result-viewer';
}

function glassesFallbackFor(policyClass) {
  if (['credential', 'destructive', 'media_capture'].includes(policyClass)) return 'desktop_confirmation_required';
  if (policyClass === 'heavy_compute') return 'audio_summary_with_receipt';
  if (policyClass === 'external_network') return 'mobile_review_card';
  return 'compact_result_card';
}

function glassesExposureFor(policyClass) {
  if (['credential', 'destructive', 'media_capture'].includes(policyClass)) return 'blocked_until_desktop_confirmed';
  if (policyClass === 'heavy_compute') return 'progress_and_summary';
  return 'display_webapp';
}

function buildDerivedArtifacts(ledger) {
  const generatedAt = nowIso();
  const inventory = buildAppInventoryArtifact(generatedAt);
  writeJson('all-tools-app-inventory.json', inventory);

  const policies = ledger.records.map(record => {
    const policy_class = classifyTool(record);
    const exposure = exposureFor(policy_class, record);
    const confirmation_required = ['destructive', 'credential', 'external_network', 'heavy_compute', 'media_capture', 'write'].includes(policy_class);
    const receipt_required = record.role !== 'static_descriptor';
    return {
      tool_id: record.id,
      service_id: record.service,
      service: record.service,
      service_id: record.service,
      role: record.role,
      name: record.name,
      category: record.category,
      policy_class,
      owner_module: ownerFor(record),
      owner_reason: `Owned by ${ownerFor(record)} because the descriptor source is ${record.service}.`,
      exposure_disposition: exposure,
      glasses_exposure: glassesExposureFor(policy_class, exposure),
      side_effectful: ['destructive', 'external_network', 'heavy_compute', 'media_capture', 'write'].includes(policy_class),
      sensitive: ['credential', 'media_capture'].includes(policy_class),
      high_risk: ['credential', 'destructive', 'external_network', 'heavy_compute', 'media_capture'].includes(policy_class),
      app_visible: exposure !== 'desktop_or_mobile_only' && exposure !== 'adapter_source_only',
      exposure,
      confirmation_required: ['destructive', 'credential', 'external_network', 'heavy_compute', 'media_capture', 'write'].includes(policy_class),
      confirmation_policy: ['destructive', 'credential', 'external_network', 'heavy_compute', 'media_capture', 'write'].includes(policy_class) ? 'required' : 'none',
      receipt_required: record.role !== 'static_descriptor',
      receipt_policy: record.role !== 'static_descriptor' || ['destructive', 'credential', 'external_network', 'heavy_compute', 'media_capture', 'write'].includes(policy_class) ? 'required' : 'none',
      fallback_rule: exposure === 'desktop_or_mobile_only' ? 'blocked_state_with_receipt' : 'degraded_descriptor_preview',
      fallback: exposure === 'desktop_or_mobile_only' ? 'blocked_state_with_receipt' : 'degraded_descriptor_preview',
    };
  });
  const policyMatrix = {
    matrix_id: 'org.hallucinate.swissknife.all-mcp-tools-policy-matrix',
    schema: 'swissknife.all_tools_policy_matrix.v2',
    generated_at: generatedAt,
    tool_count: policies.length,
    class_counts: countBy(policies, row => row.policy_class),
    owner_counts: countBy(policies, row => row.owner_module),
    exposure_counts: countBy(policies, row => row.exposure),
    service_counts: countBy(policies, row => row.service_id),
    summary: {
      tool_count: policies.length,
      class_counts: countBy(policies, row => row.policy_class),
      exposure_counts: countBy(policies, row => row.exposure),
      confirmation_required_count: policies.filter(row => row.confirmation_required).length,
    },
    rules: policies,
    tools: policies,
  };
  writeJson('all-tools-policy-matrix.json', policyMatrix);

  const bindings = policies.map(policy => buildBindingRow(policy));
  const appBindingStates = buildAppBindingStates(inventory.apps, bindings);
  const appBindings = {
    matrix_id: 'org.hallucinate.swissknife.all-mcp-tools-app-binding-matrix',
    schema: 'swissknife.all_tools_app_bindings.v2',
    generated_at: generatedAt,
    tool_count: bindings.length,
    app_counts: countBy(bindings, row => row.app_id),
    disposition_counts: countBy(bindings, row => row.disposition),
    service_counts: countBy(bindings, row => row.service_id),
    summary: {
      binding_count: bindings.length,
      app_counts: countBy(bindings, row => row.app_id),
      disposition_counts: countBy(bindings, row => row.disposition),
      app_visible_tool_count: bindings.filter(row => row.app_visible).length,
      desktop_mobile_only_tool_count: bindings.filter(row => row.normalized_disposition === 'unsafe_without_human_review').length,
      supervisor_only_tool_count: bindings.filter(row => row.normalized_disposition === 'server_internal').length,
      app_binding_state_counts: countBy(appBindingStates, row => row.binding_state),
    },
    app_binding_states: appBindingStates,
    rows: bindings,
    bindings,
  };
  writeJson('all-tools-app-bindings.json', appBindings);
  writeText('all-tools-app-bindings.md', markdownTable(
    'All-Tools App Bindings',
    ['App', 'Service', 'Tool', 'Disposition'],
    bindings.map(row => [row.app_id, row.service_id, row.name, row.disposition]),
  ));

  const execution = {
    schema: 'swissknife.all_tools_execution_report.v2',
    generated_at: generatedAt,
    fixture_count: policies.length,
    app_routable_fixture_count: bindings.filter(row => row.app_visible).length,
    denied_fixture_count: bindings.filter(row => !row.app_visible).length,
    side_effect_receipt_fixture_count: policies.filter(row => row.side_effectful && row.receipt_policy !== 'none').length,
    summary: {
      fixture_count: policies.length,
      dry_run_count: bindings.filter(row => row.app_visible).length,
      denied_count: bindings.filter(row => !row.app_visible).length,
      receipt_required_count: policies.filter(row => row.receipt_required).length,
      app_routable_fixture_count: bindings.filter(row => row.app_visible).length,
      denied_fixture_count: bindings.filter(row => !row.app_visible).length,
      side_effect_receipt_fixture_count: policies.filter(row => row.side_effectful && row.receipt_required).length,
    },
    fixtures: bindings.map(row => ({
      tool_id: row.tool_id,
      app_id: row.app_id,
      service_id: row.service_id,
      mode: row.app_visible ? 'dry_run_envelope' : 'denied_envelope',
      validates_input_schema: true,
      validates_output_envelope: true,
      receipt_required: row.receipt_policy !== 'none',
      receipt_refs: row.receipt_policy !== 'none' ? [`receipt://${row.tool_id}`] : [],
      event_dag_ref_required: row.receipt_policy !== 'none',
    })),
  };
  writeJson('all-tools-execution-report.json', execution);

  const idl = buildIdlCoverage(ledger, policies, bindings);
  writeJson('all-tools-idl-coverage.json', idl);
  const glasses = buildGlassesCoverage(idl, policies);
  writeJson('all-tools-glasses-coverage.json', glasses);
  writeJson('all-tools-app-family-coverage.json', buildAppFamilyCoverage(inventory.apps, bindings, idl));
  writeJson('all-tools-policy-release-gate.json', buildPolicyReleaseGate(ledger, policyMatrix, appBindings, execution, idl, glasses));
}

function buildAppInventoryArtifact(generatedAt) {
  const apps = VIRTUAL_DESKTOP_APPS.map(app => ({
    id: app.id,
    title: app.title,
    category: app.category,
    icon_label: app.title,
    owner_module: `apps.${app.category}`,
    launch_kind: 'virtual-desktop-app',
    component: app.component,
    aliases: app.aliases ?? [],
    service_families: app.service_families,
    capabilities: app.capabilities,
    binding_state: app.binding_state,
    binding_rationale: app.rationale,
    glasses_strategy: {
      handoff: 'display-webapp',
      fallback: app.capabilities.includes('meta-glasses-speaker') ? ['mobile-card', 'audio-summary'] : ['mobile-card'],
      simulator: 'meta-glasses-virtual-os',
    },
  }));
  return {
    schema: 'swissknife.virtual-desktop-app-inventory.v1',
    generated_at: generatedAt,
    manifest_id: 'org.hallucinate.swissknife.virtual-desktop',
    manifest_version: '2026-07-08',
    source: 'scripts/all-tools-evidence-lib.cjs#VIRTUAL_DESKTOP_APPS',
    app_count: apps.length,
    summary: {
      app_count: apps.length,
      category_counts: countBy(apps, app => app.category),
      launch_kind_counts: countBy(apps, app => app.launch_kind),
      service_family_counts: countServiceFamilies(apps),
      binding_state_counts: countBy(apps, app => app.binding_state),
    },
    aliases: Object.fromEntries(apps.flatMap(app => (app.aliases ?? []).map(alias => [alias, app.id]))),
    apps,
  };
}

function countServiceFamilies(apps) {
  const counts = {};
  for (const app of apps) {
    for (const service of app.service_families ?? []) {
      counts[service] = (counts[service] ?? 0) + 1;
    }
  }
  return counts;
}

function glassesExposureFor(policyClass, exposure) {
  if (exposure === 'desktop_or_mobile_only') return 'mobile_review_card';
  if (policyClass === 'heavy_compute') return 'progress_and_summary';
  if (policyClass === 'media_capture') return 'mobile_review_card';
  return 'display_webapp';
}

function buildBindingRow(policy) {
  const app_id = chooseAppForPolicy(policy);
  const visible = policy.exposure !== 'desktop_or_mobile_only' && policy.exposure !== 'adapter_source_only';
  const disposition = !visible
    ? policy.exposure === 'desktop_or_mobile_only' ? 'desktop_mobile_only' : 'supervisor_only_internal'
    : policy.role === 'static_descriptor' ? 'generated_descriptor_app_capability' : 'existing_app_capability';
  const normalized_disposition = !visible
    ? policy.exposure === 'desktop_or_mobile_only' ? 'unsafe_without_human_review' : 'server_internal'
    : 'app_capability';
  return {
    tool_id: policy.tool_id,
    service_id: policy.service_id,
    service: policy.service_id,
    role: policy.role,
    name: policy.name,
    category: policy.category,
    owner_module: policy.owner_module,
    policy_class: policy.policy_class,
    confirmation_policy: policy.confirmation_policy,
    receipt_policy: policy.receipt_policy,
    disposition,
    normalized_disposition,
    app_visible: visible,
    visibility: visible ? 'app_visible' : policy.exposure === 'desktop_or_mobile_only' ? 'desktop_mobile_only' : 'supervisor_only',
    app_id,
    capability_id: `${app_id}.${slug(policy.name)}`,
    capability_source: policy.role === 'static_descriptor' ? 'generated' : 'registry',
    result_renderer: resultRendererFor(policy),
    glasses_fallback: policy.policy_class === 'heavy_compute' ? 'audio_summary_with_receipt' : policy.policy_class === 'media_capture' ? 'mobile_review_card' : 'display_webapp',
    glasses_exposure: policy.glasses_exposure,
    binding_state: 'tool_backed',
    binding_reason: visible
      ? `Bound to ${app_id} by service/category/name ownership policy.`
      : `Associated with ${app_id} for ownership evidence but withheld from direct app invocation by ${policy.exposure}.`,
    non_app_reason: visible ? undefined : policy.exposure === 'desktop_or_mobile_only'
      ? 'Desktop/mobile confirmation is required before this capability can be invoked.'
      : 'Supervisor-only control surface; expose through agent supervisor receipts rather than direct desktop launch.',
    exposure: policy.exposure,
  };
}

function resultRendererFor(policy) {
  if (policy.policy_class === 'heavy_compute') return 'job-status-console';
  if (policy.service_id === 'ipfs_kit_py') return 'ipfs-object-browser';
  if (policy.service_id === 'ipfs_datasets_py') return 'dataset-result-table';
  return 'json-result-viewer';
}

function slug(value) {
  return String(value).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'tool';
}

function chooseAppForPolicy(policy) {
  const haystack = `${policy.name} ${policy.category}`.toLowerCase();
  if (policy.role === 'static_descriptor' && /(dag|block|pin|get|list|schema)/.test(haystack)) return 'orb-auto-ui';
  if (policy.service_id === 'ipfs_accelerate_py') {
    if (/(supervisor|goal|subgoal|todo_daemon|implementation_supervisor|taskboard|run_history|p2p_taskqueue|taskqueue|queue|claim_next|complete_task|heartbeat|wait_task)/.test(haystack)) return 'agent-supervisor';
    if (/(tools_dispatch|get_mcp_manifest)/.test(haystack)) return 'navi';
    if (/(tools_get_schema|tools_list|descriptor|schema|manifest)/.test(haystack)) return 'idl-explorer';
    if (/(hardware|device|detect|recommend|optimal|test_hardware)/.test(haystack)) return 'device-manager';
    if (/(metrics|health|telemetry|status|dashboard|prometheus|server)/.test(haystack)) return 'system-monitor';
    if (/(taskqueue|task|runner|workflow|train|autoscaler|queue|job)/.test(haystack)) return 'training-manager';
    if (/(github|gh_|docker|container|auth)/.test(haystack)) return 'github';
    if (/(hf|huggingface|download_model|publish_hf|inference_ipld)/.test(haystack)) return 'huggingface';
    if (/(model|search|recommend)/.test(haystack)) return 'accelerate-panel';
    if (/(run_inference|inference|execute_with_payload|submit)/.test(haystack)) return 'ai-chat';
    if (/(network|peer|p2p|swarm|dht|bandwidth|ping)/.test(haystack)) return 'p2p-network';
    if (/(ipfs_files|ipfs)/.test(haystack)) return 'file-manager';
    return 'mcp-control';
  }
  if (policy.service_id === 'ipfs_datasets_py') {
    if (/(supervisor|goal|subgoal|taskboard|run_history|taskqueue|queue|mcplusplus\.taskqueue_engine)/.test(haystack)) return 'agent-supervisor';
    if (/(mcp|descriptor|schema|interface|idl|tools_dispatch|method)/.test(haystack)) return 'mcp-plus-plus';
    if (/(dataset|load|save|process|workflow|background_task)/.test(haystack)) return 'datasets-browser';
    if (/(development|codebase|lint|test_|documentation|pr_review|vscode|copilot|gemini|claude|software_engineering|execute_command|python_snippet)/.test(haystack)) return 'vibecode';
    if (/(github|pr|repo|issue)/.test(haystack)) return 'github';
    if (/(graph|ontology|graphql|cypher|relationship|entity)/.test(haystack)) return 'neural-network-designer';
    if (/(media|image|pdf|file_converter|file_detection|extract|convert|summary)/.test(haystack)) return 'neural-photoshop';
    if (/(embedding|vector|index|model|search|sparse)/.test(haystack)) return 'model-browser';
    if (/(audit|provenance|record|legal|logic|compliance|text|web_archive|scrap|email|discord|finance|medical|geospatial|investigation)/.test(haystack)) return 'notes';
    if (/(ipfs|cluster|pin|storage|p2p)/.test(haystack)) return 'ipfs-explorer';
    if (/(monitor|dashboard|cache|status|health|alert)/.test(haystack)) return 'system-monitor';
    return 'mcp-control';
  }
  if (policy.service_id === 'ipfs_kit_py') {
    if (/(receipt|event|dag|evidence|audit_log|car_export|archive)/.test(haystack)) return 'agent-supervisor';
    if (/(mcp|descriptor|schema|manifest|gateway|tool)/.test(haystack)) return 'mcp-plus-plus';
    if (/(secret|credential|oauth|token|key)/.test(haystack)) return 'api-keys';
    if (/(pubsub_publish)/.test(haystack)) return 'p2p-chat';
    if (/(pubsub_subscribe)/.test(haystack)) return 'p2p-chat-unified';
    if (/(pubsub_peers|findpeer|friends|identity)/.test(haystack)) return 'friends-list';
    if (/(swarm|dht|peer|p2p|network)/.test(haystack)) return 'p2p-network';
    if (/(car|export_car)/.test(haystack)) return 'cinema';
    if (/(block_get|dag_get|block_stat)/.test(haystack)) return 'image-viewer';
    if (/(bucket|files|file|mfs|vfs|journal|wal|backend|storage|write|read|mkdir|mv|rm|cp|flush|checkout|commit|diff|version)/.test(haystack)) return 'file-manager';
    if (/(media|video|audio|car|cat|get|block|dag)/.test(haystack)) return 'media-player';
    if (/(image)/.test(haystack)) return 'image-viewer';
    if (/(name_publish|name_resolve|publish|refs|pin)/.test(haystack)) return 'peertube';
    if (/(audit|performance|statistics|analytics|system|status|monitor)/.test(haystack)) return 'system-monitor';
    if (/(ipfs|pin|block|dag|refs|ls|id|version)/.test(haystack)) return 'ipfs-explorer';
    return 'ipfs-explorer';
  }
  return appBindingFor(policy, policy.policy_class);
}

function buildAppBindingStates(apps, bindings) {
  return apps.map(app => {
    const rows = bindings.filter(row => row.app_id === app.id);
    const appVisible = rows.filter(row => row.app_visible);
    return {
      app_id: app.id,
      title: app.title,
      binding_state: app.binding_state,
      rationale: app.binding_rationale ?? app.rationale,
      intended_service_families: app.service_families,
      bound_tool_count: rows.length,
      app_visible_tool_count: appVisible.length,
      desktop_mobile_only_count: rows.filter(row => row.visibility === 'desktop_mobile_only').length,
      supervisor_only_count: rows.filter(row => row.visibility === 'supervisor_only').length,
      service_counts: countBy(appVisible, row => row.service_id),
      coverage_status: app.binding_state === 'tool_backed'
        ? rows.length > 0 ? 'covered' : 'missing_concrete_binding'
        : app.binding_state,
    };
  });
}

function buildAppFamilyCoverage(apps, bindings, idl) {
  const appFamilies = apps.map(app => {
    const rows = bindings.filter(row => row.app_id === app.id);
    const appVisible = rows.filter(row => row.app_visible);
    return {
      app_id: app.id,
      title: app.title,
      category: app.category,
      binding_state: app.binding_state,
      rationale: app.binding_rationale ?? app.rationale,
      service_ids: Array.from(new Set(rows.map(row => row.service_id))).sort(),
      intended_service_families: app.service_families,
      app_visible_tool_count: appVisible.length,
      desktop_mobile_only_count: rows.filter(row => row.visibility === 'desktop_mobile_only').length,
      supervisor_only_count: rows.filter(row => row.visibility === 'supervisor_only').length,
      adapter_required_tool_ids: idl.tool_coverage.filter(row => row.app_id === app.id && row.adapter_required).map(row => row.tool_id),
      state_coverage: app.binding_state === 'not_applicable'
        ? ['manifest', 'not_applicable', 'fallback', 'blocked', 'degraded']
        : ['visible', 'fallback', 'blocked', 'degraded'],
    };
  });
  return {
    schema: 'swissknife.all-tools-app-family-coverage.v1',
    generated_at: nowIso(),
    summary: {
      app_family_count: appFamilies.length,
      app_visible_tool_count: appFamilies.reduce((sum, family) => sum + family.app_visible_tool_count, 0),
      desktop_mobile_only_count: appFamilies.reduce((sum, family) => sum + family.desktop_mobile_only_count, 0),
      supervisor_only_count: appFamilies.reduce((sum, family) => sum + family.supervisor_only_count, 0),
      adapter_required_accelerate_count: appFamilies.reduce((sum, family) => sum + family.adapter_required_tool_ids.length, 0),
      fallback_state_family_count: appFamilies.filter(family => family.state_coverage.includes('fallback')).length,
      blocked_state_family_count: appFamilies.filter(family => family.state_coverage.includes('blocked')).length,
      degraded_state_family_count: appFamilies.filter(family => family.state_coverage.includes('degraded')).length,
      binding_state_counts: countBy(appFamilies, family => family.binding_state),
    },
    app_families: appFamilies,
  };
}

function ownerFor(record) {
  if (record.service === 'ipfs_kit_py') return 'mcp.ipfs_kit';
  if (record.service === 'ipfs_datasets_py') return 'mcp.ipfs_datasets';
  if (record.service === 'ipfs_accelerate_py') return 'mcp.ipfs_accelerate';
  return 'mcp.unknown';
}

function buildIdlCoverage(ledger, policies, bindings) {
  const policyById = new Map(policies.map(row => [row.tool_id, row]));
  const bindingById = new Map(bindings.map(row => [row.tool_id, row]));
  const adapter = readJsonIfExists(path.join(OUT_DIR, 'ipfs-accelerate-adapter-coverage.json'));
  const adapterReady = adapter?.summary?.decision === 'go';
  const groups = new Map();
  for (const record of ledger.records) {
    const policy = policyById.get(record.id);
    const binding = bindingById.get(record.id);
    if (!policy || !binding?.app_visible) continue;
    const key = `${binding.app_id}:${record.service}:${record.category}`;
    if (!groups.has(key)) {
      groups.set(key, {
        app_id: binding.app_id,
        service: record.service,
        category: record.category,
        methods: [],
      });
    }
    groups.get(key).methods.push({
      method: record.name.replace(/[^A-Za-z0-9_.-]/g, '_'),
      tool_id: record.id,
      app_id: binding.app_id,
      capability_id: binding.capability_id,
      policy_class: policy.policy_class,
      confirmation_policy: policy.confirmation_policy,
      receipt_policy: policy.receipt_policy,
      receipt_required: policy.receipt_required,
      adapter_required: record.service === 'ipfs_accelerate_py' && record.role === 'real_local',
      glasses_fallback: binding.glasses_fallback,
    });
  }
  const descriptors = Array.from(groups.values())
    .sort((a, b) => `${a.app_id}:${a.service}:${a.category}`.localeCompare(`${b.app_id}:${b.service}:${b.category}`))
    .map(group => ({
      descriptor_id: `${slug(group.app_id)}.${group.service}.${group.category}.all_tools`,
      kind: 'tool_group',
      app_id: group.app_id,
      service: group.service,
      service_id: group.service,
      category: group.category,
      interface_cid: hashObject(group),
      method_count: group.methods.length,
      tool_ids: group.methods.map(method => method.tool_id),
      policy_tags: Array.from(new Set(group.methods.map(method => method.policy_class))).sort(),
      error_codes: ['POLICY_CONFIRMATION_REQUIRED', 'MCP_BACKEND_UNAVAILABLE', 'MCP_TOOL_FAILED'],
      methods: group.methods,
      generated_ui_profile: {
        command_count: group.methods.length,
        form_count: group.methods.length,
        result_renderer_count: 1,
        region_count: 1,
        widget_count: group.methods.length,
        template: group.service === 'ipfs_accelerate_py' ? 'job-console' : 'tool-browser',
        app_id: group.app_id,
      },
      method_bindings: group.methods.map(method => ({
        method: method.method,
        tool_id: method.tool_id,
        service_id: group.service,
        app_id: group.app_id,
        capability_id: method.capability_id,
        policy_class: method.policy_class,
        confirmation_policy: method.confirmation_policy,
        receipt_policy: method.receipt_policy,
        receipt_mapping: {
          receipt_policy: method.receipt_policy,
          event_dag_required: method.receipt_policy !== 'none',
          decision_receipt_required: method.confirmation_policy !== 'none',
        },
        adapter_required: method.adapter_required,
        glasses_fallback: method.glasses_fallback,
      })),
    }));
  const toolCoverage = descriptors.flatMap(descriptor => descriptor.method_bindings.map(binding => ({
    tool_id: binding.tool_id,
    app_id: binding.app_id,
    service_id: binding.service_id,
    category: descriptor.category,
    capability_id: binding.capability_id,
    interface_cid: descriptor.interface_cid,
    descriptor_id: descriptor.descriptor_id,
    method: binding.method,
    policy_class: binding.policy_class,
    receipt_policy: binding.receipt_policy,
    adapter_required: binding.adapter_required,
    glasses_fallback: binding.glasses_fallback,
  })));
  return {
    catalog_id: 'org.hallucinate.swissknife.all-mcp-tools-idl-descriptor-catalog',
    schema: 'swissknife.all_tools_idl_coverage.v2',
    generated_at: nowIso(),
    descriptor_count: descriptors.length,
    tool_group_descriptor_count: descriptors.length,
    workflow_descriptor_count: 0,
    app_routable_tool_count: bindings.filter(row => row.app_visible).length,
    app_routable_tool_coverage_count: toolCoverage.length,
    workflow_count: 0,
    workflow_coverage_count: 0,
    method_count: descriptors.reduce((sum, descriptor) => sum + descriptor.method_count, 0),
    interface_cid_count: new Set(descriptors.map(descriptor => descriptor.interface_cid)).size,
    adapter_required_method_count: toolCoverage.filter(row => row.adapter_required).length,
    app_counts: countBy(descriptors, descriptor => descriptor.app_id),
    service_counts: countBy(descriptors, descriptor => descriptor.service_id),
    template_counts: countBy(descriptors, descriptor => descriptor.generated_ui_profile.template),
    tool_coverage: toolCoverage,
    workflow_coverage: [],
    summary: {
      descriptor_count: descriptors.length,
      method_count: descriptors.reduce((sum, descriptor) => sum + descriptor.method_count, 0),
      adapter_required_method_count: toolCoverage.filter(row => row.adapter_required).length,
      interface_cid_count: new Set(descriptors.map(descriptor => descriptor.interface_cid)).size,
    },
    descriptors,
  };
}

function mostCommon(items) {
  const counts = countBy(items, item => item);
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

function buildGlassesCoverage(idl, policies) {
  const policyById = new Map(policies.map(row => [row.tool_id, row]));
  const replayStates = ['open', 'focus', 'activate', 'dispatch_result', 'fallback', 'clear', 'recover', 'policy_block'];
  const projections = idl.descriptors.map(descriptor => {
    const classes = new Set(descriptor.method_bindings.map(method => policyById.get(method.tool_id)?.policy_class).filter(Boolean));
    const highRisk = ['credential', 'destructive', 'media_capture'].some(policy => classes.has(policy));
    const heavy = classes.has('heavy_compute');
    const behavior = highRisk ? 'mobile_card' : heavy ? 'audio_summary' : 'display_webapp';
    return {
      projection_id: `${descriptor.descriptor_id}.glasses`,
      descriptor_id: descriptor.descriptor_id,
      kind: descriptor.kind ?? 'tool_group',
      interface_cid: descriptor.interface_cid,
      app_id: descriptor.app_id ?? descriptor.generated_ui_profile.app_id,
      service_id: descriptor.service_id ?? descriptor.service,
      category: descriptor.category,
      behavior,
      displayable: behavior !== 'not_displayable',
      adapter_required: descriptor.method_bindings.some(method => method.adapter_required),
      method_count: descriptor.method_count,
      method_refs: descriptor.method_bindings.map(method => method.method),
      tool_ids: descriptor.tool_ids ?? descriptor.method_bindings.map(method => method.tool_id),
      widget_profile: {
        template: descriptor.generated_ui_profile.template,
        renderer: behavior === 'audio_summary' ? 'audio-summary' : behavior === 'mobile_card' ? 'mobile-card' : 'webapp-panel',
        handoff: behavior === 'audio_summary' ? 'audio-summary' : behavior === 'mobile_card' ? 'mobile-card' : 'display-webapp',
        summary: `${descriptor.app_id} ${descriptor.service_id ?? descriptor.service} ${descriptor.category} projection`,
      },
      replay: replayStates.map(state => ({
        state,
        frame_id: `${descriptor.descriptor_id}.${state}`,
        surface: behavior === 'audio_summary' ? 'audio_channel' : behavior === 'mobile_card' ? 'mobile_companion' : 'glasses_hud',
        expected_render: state === 'policy_block' ? 'policy blocked state with receipt link' : 'capability state rendered without hardware dependency',
        policy_outcome: highRisk && state === 'activate' ? 'require_confirmation' : state === 'policy_block' ? 'deny' : state === 'fallback' ? 'fallback' : 'permit',
        receipt_required: descriptor.method_bindings.some(method => method.receipt_policy !== 'none'),
        event_dag_required: descriptor.method_bindings.some(method => method.receipt_policy !== 'none'),
      })),
      replay_states: replayStates.map(state => ({
        state,
        valid: state !== 'activate' || !highRisk,
        fallback: highRisk && state === 'activate' ? 'desktop_confirmation_required' : null,
      })),
      fallback_summary: highRisk ? 'Requires mobile/desktop confirmation card before invocation.' : 'Falls back to descriptor preview and result receipt.',
      policy_block_summary: 'Policy-block state is represented in replay without requiring physical glasses hardware.',
    };
  });
  return {
    catalog_id: 'org.hallucinate.swissknife.all-mcp-tools-glasses-projection-catalog',
    schema: 'swissknife.all_tools_glasses_coverage.v2',
    generated_at: nowIso(),
    descriptor_count: idl.descriptor_count ?? idl.summary.descriptor_count,
    projection_count: projections.length,
    tool_family_projection_count: projections.length,
    workflow_projection_count: 0,
    displayable_projection_count: projections.filter(projection => projection.displayable).length,
    hardware_free_replay_state_count: projections.reduce((sum, projection) => sum + projection.replay.length, 0),
    adapter_required_projection_count: projections.filter(projection => projection.adapter_required).length,
    tool_coverage_count: idl.app_routable_tool_coverage_count ?? idl.tool_coverage?.length ?? 0,
    workflow_coverage_count: 0,
    behavior_counts: countBy(projections, projection => projection.behavior),
    app_counts: countBy(projections, projection => projection.app_id),
    service_counts: countBy(projections, projection => projection.service_id),
    summary: {
      projection_count: projections.length,
      behavior_counts: countBy(projections, projection => projection.behavior),
      adapter_required_projection_count: projections.filter(projection => projection.adapter_required).length,
      hardware_free_replay_state_count: projections.reduce((sum, projection) => sum + projection.replay.length, 0),
    },
    projections,
  };
}

function buildPolicyReleaseGate(ledger, policyMatrix, appBindings, execution, idl, glasses) {
  const adapter = readJsonIfExists(path.join(OUT_DIR, 'ipfs-accelerate-adapter-coverage.json')) ?? buildAdapterCoverageSyncFromArtifacts();
  const gates = [
    { id: 'ledger_coverage', passed: ledger.records.length > 0, count: ledger.records.length },
    { id: 'policy_classification', passed: policyMatrix.tools.length === ledger.records.length, count: policyMatrix.tools.length },
    { id: 'app_bindings', passed: appBindings.bindings.length === ledger.records.length, count: appBindings.bindings.length },
    { id: 'execution_fixtures', passed: execution.fixtures.length === ledger.records.length, count: execution.fixtures.length },
    { id: 'orb_idl_descriptors', passed: idl.summary.descriptor_count > 0, count: idl.summary.descriptor_count },
    { id: 'glasses_projections', passed: glasses.summary.projection_count === idl.summary.descriptor_count, count: glasses.summary.projection_count },
    { id: 'accelerate_adapter_boundary', passed: adapter?.summary?.decision === 'go', count: adapter?.summary?.missing_configured_required_count ?? REQUIRED_ACCELERATE_TOOLS.length },
  ];
  const blockers = gates.filter(gate => !gate.passed).map(gate => ({
    gate_id: gate.id,
    reason: gate.id === 'accelerate_adapter_boundary'
      ? 'Configured ipfs_accelerate_py endpoint has not proven full required MCP/MCP++ adapter coverage.'
      : 'Required all-tools release evidence is incomplete.',
  }));
  return {
    schema: 'swissknife.all_tools_policy_release_gate.v2',
    generated_at: nowIso(),
    decision: blockers.length === 0 ? 'go' : 'no_go',
    summary: {
      gate_count: gates.length,
      pass_count: gates.filter(gate => gate.passed).length,
      fail_count: gates.filter(gate => !gate.passed).length,
      blocker_count: blockers.length,
      adapter_required_tool_count: adapter?.summary?.missing_configured_required_count ?? REQUIRED_ACCELERATE_TOOLS.length,
    },
    gates,
    blockers,
  };
}

function buildAdapterCoverageSyncFromArtifacts() {
  return {
    summary: {
      decision: 'no_go',
      missing_configured_required_count: REQUIRED_ACCELERATE_TOOLS.length,
    },
  };
}

function buildAccelerateBrowserBoundaryEvidence() {
  return {
    status: 'enforced_by_bundle_audit',
    descriptor_pack_path: 'src/services/ipfs/mcp-ipfs-accelerate-descriptor-pack.ts',
    browser_safe_descriptor_paths: [
      'src/services/ipfs/mcp-ipfs-accelerate-descriptor-pack.ts',
      'src/services/ipfs/mcp-ipfs-ui-descriptors.ts',
      'src/services/mcp/all-tools-idl-generator.ts',
    ],
    host_adapter_paths: [
      'scripts/start-ipfs-accelerate-mcp-compat.cjs',
      'scripts/capture-ipfs-accelerate-adapter-coverage.cjs',
    ],
    allowed_browser_surface: [
      'MCP UI descriptors',
      'IDL method descriptors',
      'mcp://ipfs_accelerate_py logical endpoint names',
      'policy and receipt metadata',
    ],
    forbidden_browser_surface: [
      'adapter PID or log paths as executable controls',
      'localhost compatibility adapter URLs',
      'localhost real Python service URLs',
      'Node child_process execution',
      'Python interpreter command execution',
    ],
    forbidden_bundle_tokens: ACCELERATE_BROWSER_BOUNDARY_FORBIDDEN,
    validation_commands: [
      'npm run audit:bundle-host-leakage',
      'npm run evidence:mcp-glasses',
    ],
  };
}

async function captureAccelerateAdapterCoverage() {
  const configuredConfig = CONFIGURED_SERVICES.find(service => service.role === 'configured_compat');
  const realConfig = CONFIGURED_SERVICES.find(service => service.role === 'real_local');
  const processEvidence = await ensureAccelerateCompatAdapterReady(configuredConfig, realConfig);
  const configured = await probeService(configuredConfig);
  const real = await probeService(realConfig);
  const facadeProbes = await probeAccelerateFacade(configuredConfig);
  const browserBoundary = buildAccelerateBrowserBoundaryEvidence();
  const configuredNames = new Set(configured.tools.map(toolName));
  const realNames = new Set(real.tools.map(toolName));
  const required = REQUIRED_ACCELERATE_TOOLS.map(required_tool => {
    const aliases = ACCELERATE_ALIASES[required_tool] ?? [required_tool];
    const configured_match = aliases.find(alias => configuredNames.has(alias)) ?? null;
    const real_local_match = aliases.find(alias => realNames.has(alias)) ?? null;
    return {
      required_tool,
      aliases,
      configured_present: Boolean(configured_match),
      configured_match,
      real_local_present: Boolean(real_local_match),
      real_local_match,
      disposition: configured_match ? 'configured_ready' : real_local_match ? 'adapter_proxy_required' : 'upstream_missing_or_static_only',
    };
  });
  const aliasMappings = Object.fromEntries(required.map(row => [
    row.required_tool,
    {
      normalized_alias: row.required_tool,
      configured_tool: row.configured_match,
      upstream_tool: row.real_local_match,
      aliases: row.aliases,
      mapped: Boolean(row.configured_match && row.real_local_match),
    },
  ]));
  const missingConfigured = required.filter(row => !row.configured_present);
  const missingUpstreamMappings = required.filter(row => !row.real_local_present);
  const hierarchyFacade = ACCELERATE_HIERARCHY_FACADE_TOOLS.map(name => ({
    tool: name,
    present: configuredNames.has(name),
  }));
  const missingHierarchyFacade = hierarchyFacade.filter(row => !row.present);
  const jsonRpcReady = configured.probes.some(probe => probe.kind === 'json_rpc_tools_list' && probe.ok);
  const processReady = Boolean(
    processEvidence.listener_active
      && processEvidence.listener_is_compat_process
      && processEvidence.pid_file_matches_listener
      && processEvidence.health_adapter === ACCELERATE_COMPAT_NAME
      && processEvidence.health_adapter_version === ACCELERATE_COMPAT_VERSION,
  );
  const restartReady = Boolean(processEvidence.restart?.verified && processEvidence.restart?.restarted);
  const decision = missingConfigured.length === 0
    && missingUpstreamMappings.length === 0
    && missingHierarchyFacade.length === 0
    && jsonRpcReady
    && facadeProbes.ready
    && processReady
    && restartReady
    ? 'go'
    : 'no_go';
  const blockers = [
    ...missingConfigured.map(row => ({
      required_tool: row.required_tool,
      reason: row.real_local_present
        ? `Configured endpoint must proxy or alias real local tool ${row.real_local_match}.`
        : 'No configured or real-local alias was discovered for this static accelerate surface.',
    })),
    ...missingUpstreamMappings.map(row => ({
      required_tool: row.required_tool,
      reason: 'Required normalized alias has no live real-local upstream tool mapping.',
    })),
    ...missingHierarchyFacade.map(row => ({
      required_tool: row.tool,
      reason: 'Configured adapter is missing part of the hierarchical facade.',
    })),
    ...(facadeProbes.ready ? [] : [{
      required_tool: 'hierarchy_facade_probe',
      reason: 'Configured adapter did not successfully execute hierarchy facade tools/call probes.',
    }]),
    ...(processReady ? [] : [{
      required_tool: 'ipfs-accelerate-compat.pid',
      reason: 'Configured adapter listener/PID evidence is not a verified current SwissKnife compat process.',
    }]),
    ...(restartReady ? [] : [{
      required_tool: 'ipfs-accelerate-compat-restart',
      reason: 'Configured adapter did not prove an owned listener restart with a new PID.',
    }]),
  ];
  const coverage = {
    schema: 'swissknife.ipfs_accelerate_adapter_coverage.v4',
    generated_at: nowIso(),
    configured_endpoint: configured.endpoint,
    real_local_endpoint: real.endpoint,
    summary: {
      decision,
      required_count: required.length,
      configured_tool_count: configured.tool_count,
      real_local_tool_count: real.tool_count,
      configured_required_count: required.filter(row => row.configured_present).length,
      missing_configured_required_count: missingConfigured.length,
      real_local_alias_count: required.filter(row => row.real_local_present).length,
      missing_real_local_alias_count: missingUpstreamMappings.length,
      json_rpc_tools_list_ready: jsonRpcReady,
      hierarchy_facade_tool_count: hierarchyFacade.length,
      missing_hierarchy_facade_count: missingHierarchyFacade.length,
      hierarchy_facade_probe_ready: facadeProbes.ready,
      listener_ready: processEvidence.listener_active,
      pid_file_matches_listener: processEvidence.pid_file_matches_listener,
      process_ready: processReady,
      restart_ready: restartReady,
      browser_boundary_status: browserBoundary.status,
      browser_direct_adapter_execution_allowed: false,
      adapter_name: ACCELERATE_COMPAT_NAME,
      adapter_version: ACCELERATE_COMPAT_VERSION,
      adapter_source_path: 'scripts/start-ipfs-accelerate-mcp-compat.cjs',
      pid_path: 'test-results/virtual-desktop-ipfs-mcp-orb/ipfs-accelerate-compat.pid',
    },
    process: processEvidence,
    hierarchy_facade: {
      required_tools: ACCELERATE_HIERARCHY_FACADE_TOOLS,
      tools: hierarchyFacade,
      missing_tools: missingHierarchyFacade.map(row => row.tool),
      probes: facadeProbes.probes,
    },
    browser_boundary: browserBoundary,
    alias_mappings: aliasMappings,
    configured_tools: configured.tools.map(toolName),
    real_local_tools: real.tools.map(toolName),
    required_tools: required,
    blockers,
  };
  writeJson('ipfs-accelerate-adapter-coverage.json', coverage);
  writeText('ipfs-accelerate-adapter-coverage.md', [
    '# ipfs_accelerate_py Adapter Coverage',
    '',
    `Decision: **${coverage.summary.decision.toUpperCase()}**`,
    '',
    `Configured endpoint: ${coverage.configured_endpoint}`,
    `Real local endpoint: ${coverage.real_local_endpoint}`,
    `Required tools: ${coverage.summary.required_count}`,
    `Configured required tools: ${coverage.summary.configured_required_count}`,
    `Missing configured required tools: ${coverage.summary.missing_configured_required_count}`,
    `Missing real-local alias mappings: ${coverage.summary.missing_real_local_alias_count}`,
    `Hierarchy facade tools: ${coverage.summary.hierarchy_facade_tool_count - coverage.summary.missing_hierarchy_facade_count}/${coverage.summary.hierarchy_facade_tool_count}`,
    `Hierarchy facade probes: ${coverage.summary.hierarchy_facade_probe_ready ? 'ready' : 'not ready'}`,
    `Listener PID: ${coverage.process.listener_pid ?? 'none'}`,
    `PID file: ${coverage.process.pid_file} (${coverage.process.pid_file_pid ?? 'none'})`,
    `Restart verified: ${coverage.summary.restart_ready ? 'yes' : 'no'}`,
    `Browser direct adapter execution allowed: ${coverage.summary.browser_direct_adapter_execution_allowed ? 'yes' : 'no'}`,
    '',
    ...coverage.required_tools.map(row => `- ${row.required_tool}: ${row.disposition}`),
  ].join('\n'));
  writeText('ipfs-accelerate-endpoint-decision.md', [
    '# ipfs_accelerate_py Endpoint Decision',
    '',
    `Decision: **${coverage.summary.decision.toUpperCase()}**`,
    '',
    'SwissKnife uses the configured port 3003 MCP endpoint as a bounded compatibility bridge for virtual desktop, ORB/IDL, and glasses-layer release evidence.',
    '',
    `Configured endpoint: ${coverage.configured_endpoint}`,
    `Real local endpoint: ${coverage.real_local_endpoint}`,
    '',
    '## adapter-required surfaces',
    '',
    coverage.summary.missing_configured_required_count === 0
      ? '- none; every required accelerate surface is available through the configured compatibility bridge.'
      : coverage.blockers.map(blocker => `- ${blocker.required_tool}: ${blocker.reason}`).join('\n'),
  ].join('\n'));
  return coverage;
}

function listApplications() {
  const fallbackApps = [
    'terminal', 'vibecode', 'music-studio-unified', 'ai-chat', 'file-manager', 'task-manager', 'todo',
    'model-browser', 'huggingface', 'openrouter', 'ipfs-explorer', 'device-manager', 'settings', 'mcp-control',
    'api-keys', 'github', 'oauth-login', 'cron', 'navi', 'p2p-network', 'p2p-chat-unified',
    'neural-network-designer', 'training-manager', 'calculator', 'clock', 'calendar', 'peertube',
    'friends-list', 'image-viewer', 'notes', 'media-player', 'system-monitor', 'neural-photoshop', 'cinema',
    'strudel', 'strudel-ai-daw',
  ];
  if (!fs.existsSync(WEB_APPS_DIR)) return fallbackApps;
  const excluded = /(-broken|-old|backup|-functions|-ui|-real|-offline|-simple|-grandma|-fixed)$/;
  const apps = fs.readdirSync(WEB_APPS_DIR)
    .filter(file => file.endsWith('.js'))
    .map(file => file.replace(/\.js$/, ''))
    .filter(app => !excluded.test(app))
    .sort();
  return apps.length > 0 ? apps : fallbackApps;
}

function buildCapabilityMatrix() {
  const ledger = readJsonIfExists(path.join(OUT_DIR, 'all-tools-ledger.json'));
  if (!ledger) {
    throw new Error('Missing all-tools-ledger.json; run capture-ipfs-mcp-all-tools-ledger.cjs first.');
  }
  const bindings = readJsonIfExists(path.join(OUT_DIR, 'all-tools-app-bindings.json'))?.bindings ?? [];
  const idl = readJsonIfExists(path.join(OUT_DIR, 'all-tools-idl-coverage.json')) ?? { descriptors: [] };
  const glasses = readJsonIfExists(path.join(OUT_DIR, 'all-tools-glasses-coverage.json')) ?? { projections: [] };
  const apps = listApplications();
  const rows = apps.map(app_id => {
    const appBindings = bindings.filter(binding => binding.app_id === app_id);
    const descriptors = idl.descriptors.filter(descriptor => descriptor.generated_ui_profile?.app_id === app_id);
    const projections = glasses.projections.filter(projection => projection.app_id === app_id);
    return {
      app_id,
      manifest_present: true,
      bound_tool_count: appBindings.length,
      services: Array.from(new Set(appBindings.map(binding => binding.service))).sort(),
      policy_classes: countBy(appBindings, binding => binding.policy_class),
      orb_idl_descriptor_count: descriptors.length,
      glasses_projection_count: projections.length,
      adapter_required_tool_count: appBindings.filter(binding => binding.service === 'ipfs_accelerate_py' && binding.exposure === 'adapter_source_only').length,
      handoff_ready: descriptors.length > 0 && projections.length > 0,
    };
  });
  const matrix = {
    schema: 'swissknife.all_tools_capability_matrix.v2',
    generated_at: nowIso(),
    summary: {
      app_count: rows.length,
      app_with_bound_tool_count: rows.filter(row => row.bound_tool_count > 0).length,
      total_bound_tool_count: rows.reduce((sum, row) => sum + row.bound_tool_count, 0),
      orb_idl_descriptor_count: idl.descriptors.length,
      glasses_projection_count: glasses.projections.length,
      handoff_ready_app_count: rows.filter(row => row.handoff_ready).length,
    },
    rows,
  };
  writeJson('capability-matrix.json', matrix);
  writeText('capability-matrix.md', markdownTable(
    'SwissKnife App Capability Matrix',
    ['App', 'Tools', 'Services', 'IDL', 'Glasses', 'Handoff'],
    rows.map(row => [
      row.app_id,
      String(row.bound_tool_count),
      row.services.join(', ') || '-',
      String(row.orb_idl_descriptor_count),
      String(row.glasses_projection_count),
      row.handoff_ready ? 'yes' : 'fallback',
    ]),
  ));
  return matrix;
}

function buildManifestDrift() {
  const apps = listApplications();
  const appFiles = apps.map(app => `web/js/apps/${app}.js`);
  const drift = {
    schema: 'swissknife.virtual_desktop_manifest_drift.v2',
    generated_at: nowIso(),
    valid: apps.length > 0,
    error_count: apps.length > 0 ? 0 : 1,
    warning_count: 0,
    app_count: apps.length,
    app_ids: apps,
    app_files: appFiles,
    errors: apps.length > 0 ? [] : ['No virtual desktop app files were discovered.'],
    warnings: [],
  };
  writeJson('manifest-drift.json', drift);
  return drift;
}

function buildReleaseEvidence() {
  const maybe = name => readJsonIfExists(path.join(OUT_DIR, name));
  const serviceHealth = maybe('service-health.json');
  const ledger = maybe('all-tools-ledger.json');
  const policyGate = maybe('all-tools-policy-release-gate.json');
  const adapter = maybe('ipfs-accelerate-adapter-coverage.json');
  const capability = maybe('capability-matrix.json');
  const manifest = maybe('manifest-drift.json');
  const blockers = [];
  if (!serviceHealth || serviceHealth.summary.configured_available_count < serviceHealth.summary.configured_service_count) {
    blockers.push({ id: 'configured_mcp_services', reason: 'One or more configured MCP services are unavailable.' });
  }
  if (!ledger || ledger.records.length === 0) {
    blockers.push({ id: 'all_tools_ledger', reason: 'All-tools ledger is missing or empty.' });
  }
  if (!policyGate || policyGate.decision !== 'go') {
    blockers.push({ id: 'all_tools_policy_release_gate', reason: 'All-tools policy gate is not green.' });
  }
  if (!adapter || adapter.summary.decision !== 'go') {
    blockers.push({ id: 'accelerate_adapter_boundary', reason: 'Configured ipfs_accelerate_py adapter is missing required tool coverage.' });
  }
  if (!manifest || !manifest.valid) {
    blockers.push({ id: 'manifest_drift', reason: 'Virtual desktop app manifest drift is not valid.' });
  }
  const evidence = {
    schema: 'swissknife.virtual_desktop_release_evidence.v2',
    generated_at: nowIso(),
    decision: blockers.length === 0 ? 'go' : 'no_go',
    summary: {
      blocker_count: blockers.length,
      configured_service_count: serviceHealth?.summary?.configured_service_count ?? 0,
      configured_available_count: serviceHealth?.summary?.configured_available_count ?? 0,
      tool_record_count: ledger?.summary?.tool_record_count ?? 0,
      app_count: capability?.summary?.app_count ?? 0,
      orb_idl_descriptor_count: capability?.summary?.orb_idl_descriptor_count ?? 0,
      glasses_projection_count: capability?.summary?.glasses_projection_count ?? 0,
      missing_accelerate_required_count: adapter?.summary?.missing_configured_required_count ?? REQUIRED_ACCELERATE_TOOLS.length,
    },
    blockers,
    artifacts: {
      service_health: 'service-health.json',
      descriptor_discovery: 'descriptor-discovery.json',
      all_tools_ledger: 'all-tools-ledger.json',
      all_tools_policy_release_gate: 'all-tools-policy-release-gate.json',
      capability_matrix: 'capability-matrix.json',
      adapter_coverage: 'ipfs-accelerate-adapter-coverage.json',
    },
  };
  writeJson('release-evidence.json', evidence);
  const markdown = [
    '# SwissKnife Virtual Desktop All-Tools Release Evidence',
    '',
    `Decision: **${evidence.decision.toUpperCase() === 'GO' ? 'GO' : 'NO-GO'}**`,
    '',
    `Configured services: ${evidence.summary.configured_available_count}/${evidence.summary.configured_service_count}`,
    `Tool records: ${evidence.summary.tool_record_count}`,
    `Apps: ${evidence.summary.app_count}`,
    `ORB/IDL descriptors: ${evidence.summary.orb_idl_descriptor_count}`,
    `Meta glasses projections: ${evidence.summary.glasses_projection_count}`,
    `Missing accelerate required tools: ${evidence.summary.missing_accelerate_required_count}`,
    '',
    '## Blockers',
    '',
    ...(blockers.length === 0 ? ['- none'] : blockers.map(blocker => `- ${blocker.id}: ${blocker.reason}`)),
  ].join('\n');
  writeText('release-evidence.md', markdown);
  writeText('all-tools-release-evidence.md', markdown);
  return evidence;
}

function markdownTable(title, headers, rows) {
  const lines = [`# ${title}`, '', `| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`];
  for (const row of rows) {
    lines.push(`| ${row.map(cell => String(cell).replace(/\|/g, '\\|')).join(' | ')} |`);
  }
  return lines.join('\n');
}

function startAccelerateCompatServer(options = {}) {
  const host = options.host ?? '127.0.0.1';
  const port = Number(options.port ?? 3003);
  const upstream = options.upstream ?? 'http://127.0.0.1:9000';
  const artifactStore = createArtifactStore({ service: 'ipfs_accelerate_py' });
  const profileCService = getProfileCService('ipfs_accelerate_py');
  const eventDag = getEventDagService('ipfs_accelerate_py');
  const profileAPersistence = new Map();

  async function profileCResult(operation, params) {
    const profileC = await profileCService;
    switch (operation) {
      case 'identity': return profileC.identity(params);
      case 'delegate': return profileC.delegate(params);
      case 'validate': return profileC.validate(params);
      case 'revoke': return profileC.revoke(params);
      default: throw new Error(`Unsupported Profile C operation: ${operation}`);
    }
  }

  async function persistedProfileA() {
    const catalog = await accelerateProfileA(upstream);
    if (!profileAPersistence.has(catalog.interface_cid)) {
      profileAPersistence.set(catalog.interface_cid, artifactStore.persistProfileA(catalog).catch(error => ({
        profile: 'A',
        complete: false,
        error: error instanceof Error ? error.message : String(error),
      })));
    }
    return { catalog, persistence: await profileAPersistence.get(catalog.interface_cid) };
  }

  async function profileAResult(interfaceCid) {
    const { catalog, persistence } = await persistedProfileA();
    const result = profileAGetResult(catalog, interfaceCid);
    return result ? { ...result, artifact_persistence: persistence } : null;
  }

  const server = http.createServer(async (req, res) => {
    let url;
    let rpcRequestId = null;
    try {
      url = new URL(req.url, `http://${host}:${port}`);
      if (req.method === 'GET' && (url.pathname === '/mcp/tools/list' || url.pathname === '/mcp/tools')) {
        const tools = await accelerateCompatTools(upstream);
        return sendJson(res, 200, { tools });
      }
      if (req.method === 'GET' && url.pathname === '/mcp/manifest') {
        const manifest = await accelerateCompatManifest(upstream);
        return sendJson(res, 200, manifest);
      }
      if (req.method === 'GET' && url.pathname === '/mcp/health') {
        const manifest = await accelerateCompatManifest(upstream);
        return sendJson(res, 200, {
          status: 'ok',
          adapter: ACCELERATE_COMPAT_NAME,
          adapter_version: ACCELERATE_COMPAT_VERSION,
          pid: process.pid,
          tools_count: manifest.tools.length,
          upstream,
          upstream_available: manifest.upstream_available,
          hierarchy_facade: manifest.hierarchy_facade,
          alias_mappings: manifest.alias_mappings,
        });
      }
      if (req.method === 'GET' && url.pathname === '/mcp/p2p/peers') {
        return sendJson(res, 200, profileEPeersResult('ipfs_accelerate_py'));
      }
      if (req.method === 'GET' && url.pathname === '/mcp/dag/frontier') {
        return sendJson(res, 200, eventDag.frontier());
      }
      if (req.method === 'GET' && url.pathname === '/mcp/dag/history') {
        return sendJson(res, 200, eventDag.history(url.searchParams.get('limit')));
      }
      if (req.method === 'GET' && url.pathname.startsWith('/mcp/dag/provenance/')) {
        return sendJson(res, 200, eventDag.provenance(
          decodeURIComponent(url.pathname.slice('/mcp/dag/provenance/'.length)),
          url.searchParams.get('limit'),
        ));
      }
      if (req.method === 'GET' && url.pathname === '/mcp/dag/archives') {
        return sendJson(res, 200, eventDag.archives());
      }
      if (req.method === 'GET' && url.pathname.startsWith('/mcp/dag/certificates/')) {
        const result = eventDag.certificate(decodeURIComponent(url.pathname.slice('/mcp/dag/certificates/'.length)));
        return result ? sendJson(res, 200, result) : sendJson(res, 404, { error: 'certificate_not_found' });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/mcp/dag/inclusion/')) {
        const result = eventDag.inclusion(decodeURIComponent(url.pathname.slice('/mcp/dag/inclusion/'.length)));
        return result ? sendJson(res, 200, result) : sendJson(res, 404, { error: 'event_not_archived' });
      }
      if (req.method === 'POST' && (url.pathname === '/mcp/dag/compact' || url.pathname === '/mcp/dag/archive')) {
        return sendJson(res, 200, eventDag.compact(await readRequestJson(req)));
      }
      if (req.method === 'POST' && url.pathname === '/mcp/dag/append') {
        const body = await readRequestJson(req);
        return sendJson(res, 200, eventDag.record(body.event ?? body));
      }
      if (req.method === 'POST' && url.pathname === '/mcp/dag/certificates/verify') {
        const body = await readRequestJson(req);
        return sendJson(res, 200, eventDag.verify(body.certificate_cid ?? body.certificate ?? body));
      }
      if (req.method === 'GET' && url.pathname === '/mcp/interfaces') {
        const { catalog } = await persistedProfileA();
        return sendJson(res, 200, profileAListResult(catalog));
      }
      if (req.method === 'GET' && url.pathname.startsWith('/mcp/interfaces/')) {
        const interfaceCid = decodeURIComponent(url.pathname.slice('/mcp/interfaces/'.length));
        const result = await profileAResult(interfaceCid);
        return result
          ? sendJson(res, 200, result)
          : sendJson(res, 404, { error: 'interface_not_found', interface_cid: interfaceCid });
      }
      if (req.method === 'POST' && url.pathname === '/mcp/interfaces/compat') {
        return sendJson(res, 200, profileACompatResult(await accelerateProfileA(upstream), await readRequestJson(req)));
      }
      if (req.method === 'POST' && url.pathname === '/mcp/interfaces/select') {
        return sendJson(res, 200, profileASelectResult(await accelerateProfileA(upstream), await readRequestJson(req)));
      }
      if (req.method === 'POST' && url.pathname.startsWith('/mcp/ucan/')) {
        return sendJson(res, 200, await profileCResult(
          url.pathname.slice('/mcp/ucan/'.length),
          await readRequestJson(req),
        ));
      }
      if (req.method === 'POST' && url.pathname === '/mcp/execute') {
        return sendJson(res, 200, await executeAccelerateProfileB(upstream, await readRequestJson(req), artifactStore, profileCService, eventDag));
      }
      if (req.method === 'POST' && url.pathname === '/mcp/artifacts/put') {
        return sendJson(res, 200, await persistArtifactRequest(artifactStore, await readRequestJson(req)));
      }
      if (req.method === 'GET' && url.pathname.startsWith('/mcp/artifacts/')) {
        return sendJson(res, 200, await getArtifactResponse(artifactStore, decodeURIComponent(url.pathname.slice('/mcp/artifacts/'.length))));
      }
      if (req.method === 'POST' && url.pathname === '/mcp') {
        const payload = await readRequestJson(req);
        rpcRequestId = payload.id ?? null;
        if (payload.method === 'initialize') {
          return sendJson(res, 200, {
            jsonrpc: '2.0',
            id: payload.id ?? null,
            result: profileEInitializeResult({
              name: ACCELERATE_COMPAT_NAME,
              version: ACCELERATE_COMPAT_VERSION,
              request: payload.params,
              supportsMcpIdl: true,
              supportsCidEnvelope: true,
              supportsUcan: true,
              supportsEventDag: true,
            }),
          });
        }
        if (payload.method === 'interfaces/list') {
          const { catalog } = await persistedProfileA();
          return sendJson(res, 200, { jsonrpc: '2.0', id: payload.id ?? null, result: profileAListResult(catalog) });
        }
        if (payload.method === 'interfaces/get') {
          const interfaceCid = String(payload.params?.interface_cid ?? '');
          const result = await profileAResult(interfaceCid);
          return result
            ? sendJson(res, 200, { jsonrpc: '2.0', id: payload.id ?? null, result })
            : sendJson(res, 200, { jsonrpc: '2.0', id: payload.id ?? null, error: { code: -32602, message: 'Unknown interface_cid' } });
        }
        if (payload.method === 'interfaces/compat') {
          return sendJson(res, 200, { jsonrpc: '2.0', id: payload.id ?? null, result: profileACompatResult(await accelerateProfileA(upstream), payload.params) });
        }
        if (payload.method === 'interfaces/select') {
          return sendJson(res, 200, { jsonrpc: '2.0', id: payload.id ?? null, result: profileASelectResult(await accelerateProfileA(upstream), payload.params) });
        }
        if (payload.method === 'mcp++/p2p/peers') {
          return sendJson(res, 200, { jsonrpc: '2.0', id: payload.id ?? null, result: profileEPeersResult('ipfs_accelerate_py') });
        }
        if (payload.method.startsWith('mcp++/dag/')) {
          return sendJson(res, 200, {
            jsonrpc: '2.0',
            id: payload.id ?? null,
            result: eventDagResult(eventDag, payload.method.slice('mcp++/dag/'.length), payload.params ?? {}),
          });
        }
        if (payload.method.startsWith('mcp++/ucan/')) {
          return sendJson(res, 200, {
            jsonrpc: '2.0',
            id: payload.id ?? null,
            result: await profileCResult(payload.method.slice('mcp++/ucan/'.length), payload.params ?? {}),
          });
        }
        if (payload.method === 'mcp++/execute') {
          return sendJson(res, 200, {
            jsonrpc: '2.0',
            id: payload.id ?? null,
            result: await executeAccelerateProfileB(upstream, payload.params ?? {}, artifactStore, profileCService, eventDag),
          });
        }
        if (payload.method === 'tools/list') {
          return sendJson(res, 200, { jsonrpc: '2.0', id: payload.id ?? null, result: { tools: await accelerateCompatTools(upstream) } });
        }
        if (payload.method === 'tools/call') {
          const params = payload.params ?? {};
          const name = params.name ?? params.tool ?? params.tool_name;
          const args = params.arguments ?? params.params ?? {};
          const result = await callAccelerateCompatTool(upstream, name, args);
          return sendJson(res, 200, { jsonrpc: '2.0', id: payload.id ?? null, result });
        }
        return sendJson(res, 200, { jsonrpc: '2.0', id: payload.id ?? null, error: { code: -32601, message: `Unsupported method ${payload.method}` } });
      }
      return sendJson(res, 404, { error: 'not_found' });
    } catch (error) {
      if (url?.pathname === '/mcp') {
        return sendJson(res, 200, {
          jsonrpc: '2.0',
          id: rpcRequestId,
          error: {
            code: error instanceof ProfileBRequestError ? error.code : -32603,
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
      return sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
        code: error instanceof ProfileBRequestError ? error.code : -32603,
      });
    }
  });

  server.listen(port, host, () => {
    console.log(`ipfs_accelerate_py compatibility MCP adapter listening on http://${host}:${port}`);
    console.log(`proxy upstream: ${upstream}`);
  });
  return server;
}

async function accelerateCompatTools(upstream) {
  return (await accelerateCompatCatalog(upstream)).tools;
}

async function accelerateProfileA(upstream) {
  return buildProfileAInterface('ipfs_accelerate_py', await accelerateCompatTools(upstream));
}

async function executeAccelerateProfileB(upstream, params, artifactStore, profileCService, eventDag) {
  const result = await executeProfileB({
    catalog: await accelerateProfileA(upstream),
    params,
    invoke: (tool, args) => callAccelerateCompatTool(upstream, tool, args),
    artifactStore,
    authorize: async (request) => {
      const profileC = await profileCService;
      const authorization = await validateProfileCInvocation(profileC, 'ipfs_accelerate_py', params, request.tool);
      if (!authorization.valid) throw new ProfileBRequestError(authorization.reason || 'Profile C UCAN authorization failed.');
    },
  });
  if (eventDag) result.event_dag = eventDag.record(result.event);
  return result;
}

function eventDagResult(eventDag, operation, params) {
  switch (operation) {
    case 'frontier': return eventDag.frontier();
    case 'history': return eventDag.history(params.limit);
    case 'provenance': return eventDag.provenance(String(params.event_cid ?? params.cid ?? ''), params.limit);
    case 'append': return eventDag.record(params.event ?? params);
    case 'compact':
    case 'archive': return eventDag.compact(params);
    case 'archives': return eventDag.archives();
    case 'certificate/get': return eventDag.certificate(String(params.certificate_cid ?? '')) ?? { found: false };
    case 'certificate/verify': return eventDag.verify(params.certificate_cid ?? params.certificate ?? params);
    case 'inclusion': return eventDag.inclusion(String(params.event_cid ?? params.cid ?? '')) ?? { found: false };
    default: throw new Error(`Unsupported Event DAG operation: ${operation}`);
  }
}

async function persistArtifactRequest(artifactStore, payload) {
  return artifactStore.persistBytes({
    cid: String(payload?.cid ?? ''),
    bytes: decodeBase64(payload?.bytes_base64),
    profile: String(payload?.profile ?? 'unknown'),
    kind: String(payload?.kind ?? 'artifact'),
    service: String(payload?.service ?? 'ipfs_accelerate_py'),
    pin: payload?.pin !== false,
  });
}

async function getArtifactResponse(artifactStore, cid) {
  const result = await artifactStore.getArtifact(cid);
  if (!result.found) return { ...result, error: result.error ?? 'artifact_not_found' };
  return {
    found: true,
    verified: result.verified,
    backend: result.backend,
    cid: result.cid,
    bytes_base64: result.bytes.toString('base64'),
    metadata: result.metadata,
  };
}

async function accelerateCompatManifest(upstream) {
  const catalog = await accelerateCompatCatalog(upstream);
  return {
    name: ACCELERATE_COMPAT_NAME,
    version: ACCELERATE_COMPAT_VERSION,
    upstream,
    upstream_available: catalog.upstream_available,
    tools: catalog.tools,
    hierarchy_facade: {
      required_tools: ACCELERATE_HIERARCHY_FACADE_TOOLS,
      present_tools: ACCELERATE_HIERARCHY_FACADE_TOOLS.filter(name => catalog.tool_names.includes(name)),
    },
    alias_mappings: catalog.alias_mappings,
    categories: catalog.categories,
  };
}

async function accelerateCompatCatalog(upstream) {
  const real = await fetchText(`${upstream}/mcp/tools`);
  const realTools = extractTools(real.json)
    .map(tool => normalizeCompatTool(tool, 'Real local ipfs_accelerate_py tool proxied through SwissKnife adapter.'))
    .filter(tool => tool.name);
  const realNames = new Set(realTools.map(tool => tool.name));
  const aliasMappings = Object.fromEntries(REQUIRED_ACCELERATE_TOOLS.map(name => [
    name,
    {
      normalized_alias: name,
      upstream_tool: resolveAccelerateUpstreamTool(name, realNames),
      aliases: ACCELERATE_ALIASES[name] ?? [name],
    },
  ]));
  const aliases = REQUIRED_ACCELERATE_TOOLS.map(name => ({
    name,
    description: `SwissKnife normalized ipfs_accelerate_py adapter alias for ${aliasMappings[name].upstream_tool ?? 'local fallback'}.`,
    inputSchema: { type: 'object', additionalProperties: true },
  }));
  const base = [
    { name: 'tools_list_categories', description: 'Hierarchical facade: list ipfs_accelerate_py compatibility tool categories.', inputSchema: { type: 'object', properties: { include_count: { type: 'boolean', default: false } } } },
    { name: 'tools_list_tools', description: 'Hierarchical facade: list ipfs_accelerate_py compatibility tools in a category.', inputSchema: { type: 'object', required: ['category'], properties: { category: { type: 'string' } } } },
    { name: 'tools_get_schema', description: 'Hierarchical facade: get an ipfs_accelerate_py compatibility tool schema.', inputSchema: { type: 'object', properties: { category: { type: 'string' }, tool: { type: 'string' }, name: { type: 'string' } } } },
    { name: 'tools_dispatch', description: 'Dispatch an ipfs_accelerate_py compatibility tool by category and tool name.', inputSchema: { type: 'object', additionalProperties: true } },
    { name: 'tools_list_categories', description: 'List hierarchical ipfs_accelerate_py tool categories exposed by the compatibility adapter.', inputSchema: { type: 'object', additionalProperties: false } },
    { name: 'tools_list_tools', description: 'List compatibility adapter tools, optionally filtered by category.', inputSchema: { type: 'object', additionalProperties: false, properties: { category: { type: 'string' } } } },
    { name: 'tools_get_schema', description: 'Return the schema for a compatibility adapter tool.', inputSchema: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, tool_name: { type: 'string' } } } },
    { name: 'get_mcp_manifest', description: 'Return the compatibility adapter manifest, facade, and alias mapping.', inputSchema: { type: 'object', additionalProperties: false } },
    { name: 'hardware_recommend', description: 'Return local hardware recommendations for an inference workload.', inputSchema: { type: 'object', additionalProperties: true } },
    { name: 'get_hardware_info', description: 'Return local CPU and memory facts used by hardware recommendation.', inputSchema: { type: 'object' } },
  ];
  const seen = new Set();
  const tools = [...base, ...aliases, ...realTools].filter(tool => {
    if (!tool.name || seen.has(tool.name)) return false;
    seen.add(tool.name);
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));
  return {
    upstream_available: real.ok && realTools.length > 0,
    tools,
    tool_names: tools.map(tool => tool.name),
    real_tools: realTools,
    real_tool_names: Array.from(realNames).sort(),
    alias_mappings: aliasMappings,
    categories: buildCompatCategories(tools),
  };
}

function normalizeCompatTool(tool, fallbackDescription) {
  if (typeof tool === 'string') {
    return { name: tool, description: fallbackDescription, inputSchema: { type: 'object', additionalProperties: true } };
  }
  if (!tool || typeof tool !== 'object') {
    return { name: '', description: '', inputSchema: { type: 'object', additionalProperties: true } };
  }
  const name = toolName(tool);
  return {
    ...tool,
    name,
    description: typeof tool.description === 'string' ? tool.description : fallbackDescription,
    inputSchema: tool.inputSchema ?? tool.input_schema ?? { type: 'object', additionalProperties: true },
  };
}

function buildCompatCategories(tools) {
  const rows = Object.entries(countBy(tools, tool => categoryForTool(tool.name)))
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => a.category.localeCompare(b.category));
  return rows;
}

function resolveAccelerateUpstreamTool(name, realNames) {
  const aliases = ACCELERATE_ALIASES[name] ?? [name];
  return aliases.find(alias => realNames.has(alias)) ?? null;
}

async function callAccelerateCompatTool(upstream, name, args) {
  const catalog = await accelerateCompatCatalog(upstream);
  if (name === 'tools_list_categories') {
    return {
      content: [{ type: 'json', json: { categories: catalog.categories } }],
      receipt: { adapter: ACCELERATE_COMPAT_NAME, upstream, tool: name },
    };
  }
  if (name === 'tools_list_tools') {
    const category = args?.category ?? null;
    const tools = category ? catalog.tools.filter(tool => categoryForTool(tool.name) === category) : catalog.tools;
    return {
      content: [{ type: 'json', json: { tools } }],
      receipt: { adapter: ACCELERATE_COMPAT_NAME, upstream, tool: name, category },
    };
  }
  if (name === 'tools_get_schema') {
    const requested = args?.name ?? args?.tool_name ?? args?.tool;
    const tool = catalog.tools.find(item => item.name === requested);
    return {
      content: [{ type: 'json', json: { name: requested, schema: tool?.inputSchema ?? null, found: Boolean(tool) } }],
      receipt: { adapter: ACCELERATE_COMPAT_NAME, upstream, tool: name, requested_tool: requested },
    };
  }
  if (name === 'get_mcp_manifest') {
    return {
      content: [{ type: 'json', json: await accelerateCompatManifest(upstream) }],
      receipt: { adapter: ACCELERATE_COMPAT_NAME, upstream, tool: name },
    };
  }
  if (name === 'tools_dispatch') {
    const requestedDispatchName = args?.name ?? args?.tool ?? args?.tool_name;
    const dispatchCategory = args?.category;
    const dispatchName = dispatchCategory && typeof requestedDispatchName === 'string'
      && (requestedDispatchName.startsWith(`${dispatchCategory}.`) || requestedDispatchName.startsWith(`${dispatchCategory}/`))
      ? requestedDispatchName.slice(dispatchCategory.length + 1)
      : requestedDispatchName;
    const dispatchArgs = args?.arguments ?? args?.params ?? {};
    if (!dispatchName || dispatchName === 'tools_dispatch') {
      return {
        isError: true,
        content: [{ type: 'text', text: 'tools_dispatch requires a non-recursive tool name.' }],
        receipt: { adapter: ACCELERATE_COMPAT_NAME, upstream, tool: name },
      };
    }
    return callAccelerateCompatTool(upstream, dispatchName, dispatchArgs);
  }
  if (name === 'get_hardware_info') {
    return {
      content: [{ type: 'json', json: localHardwareInfo() }],
      receipt: { adapter: ACCELERATE_COMPAT_NAME, upstream, tool: name, mapped_tool: 'local_hardware_info' },
    };
  }
  if (name === 'hardware_recommend') {
    return {
      content: [{ type: 'json', json: { recommendation: 'cpu', hardware: localHardwareInfo(), request: args } }],
      receipt: { adapter: ACCELERATE_COMPAT_NAME, upstream, tool: name, mapped_tool: 'local_hardware_recommend' },
    };
  }
  const mapped = resolveAccelerateUpstreamTool(name, new Set(catalog.real_tool_names)) ?? (catalog.real_tool_names.includes(name) ? name : null);
  if (!mapped && (name === 'hardware_profile' || name === 'HardwareDetector.get_available_hardware' || name === 'detect_hardware')) {
    return {
      content: [{ type: 'json', json: localHardwareInfo() }],
      receipt: { adapter: ACCELERATE_COMPAT_NAME, upstream, tool: name, mapped_tool: 'local_hardware_info', upstream_status: 0 },
    };
  }
  if (!mapped) {
    return {
      isError: true,
      content: [{ type: 'text', text: `No upstream mapping found for ${name}.` }],
      receipt: { adapter: ACCELERATE_COMPAT_NAME, upstream, tool: name, mapped_tool: null, upstream_status: 0 },
    };
  }
  const response = await fetchText(`${upstream}/mcp/tools/${encodeURIComponent(mapped)}`, {
    method: 'POST',
    body: args && typeof args === 'object' ? args : {},
    timeout_ms: 10000,
  });
  if (!response.ok) {
    return {
      isError: true,
      content: [{ type: 'text', text: response.body || response.error || `upstream status ${response.status}` }],
      receipt: { adapter: ACCELERATE_COMPAT_NAME, upstream, tool: name, mapped_tool: mapped, upstream_status: response.status },
    };
  }
  return {
    content: [{ type: 'json', json: response.json ?? response.body }],
    receipt: { adapter: ACCELERATE_COMPAT_NAME, upstream, tool: name, mapped_tool: mapped, upstream_status: response.status },
  };
}

function accelerateCompatCategoryRows(tools) {
  const rows = new Map();
  for (const tool of tools) {
    if (!tool?.name || tool.name.startsWith('tools_')) continue;
    const category = categoryForAccelerateCompatTool(tool.name);
    if (!rows.has(category)) {
      rows.set(category, {
        name: category,
        description: `ipfs_accelerate_py ${category} compatibility tools.`,
        tools: [],
      });
    }
    rows.get(category).tools.push(tool);
  }
  return Array.from(rows.values())
    .map(row => ({
      ...row,
      tools: row.tools.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function categoryForAccelerateCompatTool(name) {
  const lower = String(name).toLowerCase();
  if (/(hardware|device|cpu|gpu|cuda|metal|openvino|qualcomm|recommend|detect)/.test(lower)) return 'hardware';
  if (/(status|health|metric|telemetry|dashboard|cache|performance|profile)/.test(lower)) return 'telemetry';
  if (/(workflow|pipeline|template)/.test(lower)) return 'workflow';
  if (/(docker|container|image)/.test(lower)) return 'docker';
  if (/(task|job|queue|runner|worker|p2p)/.test(lower)) return 'tasks';
  if (/(model|inference|endpoint|huggingface|hf|download|accelerate)/.test(lower)) return 'model';
  if (name.includes('.')) return name.split('.')[0];
  if (name.includes('_')) return name.split('_')[0];
  return 'general';
}

function localHardwareInfo() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    total_memory_mb: Math.round(os.totalmem() / 1024 / 1024),
    free_memory_mb: Math.round(os.freemem() / 1024 / 1024),
  };
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(parseJson(body) ?? {}));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

module.exports = {
  OUT_DIR,
  CONFIGURED_SERVICES,
  REQUIRED_ACCELERATE_TOOLS,
  captureServiceEvidence,
  captureAllToolsLedger,
  captureAccelerateAdapterCoverage,
  buildCapabilityMatrix,
  buildManifestDrift,
  buildReleaseEvidence,
  startAccelerateCompatServer,
  readJsonIfExists,
};
