const REQUIRED_BACKENDS = ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'];

function electronDaemonApi() {
  return globalThis.window?.electronAPI?.daemon || null;
}

function statusFromHealth(health) {
  if (!health) return 'unknown';
  if (health.status) return health.status;
  if (health.healthy === true) return 'running';
  if (health.healthy === false) return 'degraded';
  return 'unknown';
}

export function mapCatalogServerToMCPControlServer(server, launchPlanEntry = {}, statusEntry = null) {
  const toolsCall = server.tool_protocols?.tools_call || {};
  const safeProbe = toolsCall.safeProbe || {};
  const health = statusEntry?.lastHealth || null;

  return {
    name: server.daemon_id,
    displayName: server.daemon_id
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' '),
    description: server.swissknife_consumer,
    command: launchPlanEntry.entrypoint || `${server.server_package} supervised daemon`,
    args: [],
    category: 'hallucinate-backend',
    icon: server.server_package === 'ipfs_accelerate_py' ? 'AI' : 'IPFS',
    status: statusEntry?.status || statusFromHealth(health),
    pid: statusEntry?.pid || null,
    port: server.port || launchPlanEntry.port || Number(new URL(server.endpoint).port),
    startTime: statusEntry?.uptime ? Date.now() - statusEntry.uptime : null,
    autoStart: true,
    type: 'local',
    managedBy: 'hallucinate_app.electron.daemon',
    daemonId: server.daemon_id,
    serverPackage: server.server_package,
    endpoint: server.endpoint,
    rpcPath: server.rpc_path,
    healthPath: server.health_path,
    dashboardUrl: server.native_dashboard_url || server.menu_dashboard_url,
    toolsListUrl: server.tool_protocols?.tools_list?.url || null,
    safeProbeTool: safeProbe.tool_name || null,
    safeProbeReceipt: safeProbe.expected_receipt || null,
    mediationContractRef: server.control_surface_mediation_contract,
    receiptRequirements: server.control_surface_receipt_requirements || [],
    capabilities: [
      server.server_package,
      'tools/list',
      'tools/call',
      'dashboard capability catalog',
      'MCP++ compatibility',
    ],
    lastCheck: Date.now(),
    lastHealth: health,
    lastError: statusEntry?.lastError || null,
  };
}

export class HallucinateBackendBridge {
  constructor(api = electronDaemonApi()) {
    this.api = api;
    this.requiredBackends = REQUIRED_BACKENDS;
  }

  isAvailable() {
    return Boolean(
      this.api?.getDashboardCapabilityCatalog &&
      this.api?.getLaunchPlan &&
      this.api?.getAll
    );
  }

  async getSnapshot() {
    if (!this.isAvailable()) {
      return {
        available: false,
        reason: 'window.electronAPI.daemon bridge unavailable',
        servers: [],
      };
    }

    const [catalog, launchPlan, allStatus, launchGate] = await Promise.all([
      this.api.getDashboardCapabilityCatalog(),
      this.api.getLaunchPlan(),
      this.api.getAll(),
      this.api.getDaemonLaunchValidationGate?.(),
    ]);
    const launchByDaemon = new Map((launchPlan || []).map(entry => [entry.daemon_id, entry]));
    const servers = (catalog.servers || []).map(server => mapCatalogServerToMCPControlServer(
      server,
      launchByDaemon.get(server.daemon_id),
      allStatus?.[server.daemon_id] || null,
    ));

    return {
      available: true,
      catalog,
      launchPlan,
      launchGate,
      servers,
      requiredBackends: this.requiredBackends,
      ready: this.requiredBackends.every(pkg => servers.some(server => server.serverPackage === pkg)),
      evidence: [
        'Hallucinate App daemon health',
        'MCP server',
        'MCP dashboard',
        'dashboard capability catalog',
        'Swissknife applications',
        'launch Playwright validation gate',
      ],
    };
  }

  async checkHealth(daemonId) {
    return this.api?.checkHealth?.(daemonId);
  }

  async start(daemonId) {
    return this.api?.start?.(daemonId);
  }

  async stop(daemonId) {
    return this.api?.stop?.(daemonId);
  }

  async restart(daemonId) {
    return this.api?.restart?.(daemonId);
  }
}

export function getHallucinateBackendBridge() {
  if (!globalThis.window) {
    return new HallucinateBackendBridge(null);
  }
  if (!window.hallucinateBackendBridge) {
    window.hallucinateBackendBridge = new HallucinateBackendBridge();
  }
  return window.hallucinateBackendBridge;
}

if (globalThis.window) {
  window.HallucinateBackendBridge = HallucinateBackendBridge;
  window.getHallucinateBackendBridge = getHallucinateBackendBridge;
}

export default {
  HallucinateBackendBridge,
  getHallucinateBackendBridge,
  mapCatalogServerToMCPControlServer,
};
