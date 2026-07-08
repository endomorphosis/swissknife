import { getBrowserAppCapabilityGateway } from '../core/app-capability-gateway.js';

export const SYSTEM_NETWORK_LOCAL_WORKFLOW_SCHEMA = 'swissknife.system-network-local-workflow.v1';

export const SYSTEM_NETWORK_LOCAL_CAPABILITIES = Object.freeze({
  nodeStatus: 'ipfs.kit.tool.node_id',
  pinInventory: 'ipfs.kit.tool.pin_ls',
  hardwareProfile: 'ipfs.accelerate.operation.hardware_profile',
  telemetry: 'ipfs.accelerate.operation.telemetry',
  datasetBrowse: 'ipfs.datasets.operation.browse',
});

const REMOTE_CAPABILITY_KEYS = Object.freeze({
  node_status: SYSTEM_NETWORK_LOCAL_CAPABILITIES.nodeStatus,
  pin_inventory: SYSTEM_NETWORK_LOCAL_CAPABILITIES.pinInventory,
  hardware_profile: SYSTEM_NETWORK_LOCAL_CAPABILITIES.hardwareProfile,
  telemetry: SYSTEM_NETWORK_LOCAL_CAPABILITIES.telemetry,
  dataset_browse: SYSTEM_NETWORK_LOCAL_CAPABILITIES.datasetBrowse,
});

export function describeSystemNetworkLocalCapabilities(appId, {
  localCapabilities = [],
  remoteCapabilities = [],
  appSurface = 'desktop',
} = {}) {
  const remote = normalizeRemoteCapabilities(remoteCapabilities);
  return {
    app_id: appId,
    workflow_schema: SYSTEM_NETWORK_LOCAL_WORKFLOW_SCHEMA,
    app_surface: appSurface,
    local_capabilities: localCapabilities.map(capability => ({
      capability_id: `local.${appId}.${capability}`,
      service_family: 'browser-local',
      execution_mode: 'local',
      fallback_strategy: 'remain available in the browser without remote service access',
    })),
    remote_capabilities: Object.fromEntries(remote.map(([key, capabilityId]) => [key, {
      capability_id: capabilityId,
      service_family: serviceFamilyForCapability(capabilityId),
      execution_mode: 'gateway',
      fallback_strategy: 'descriptor-backed degraded envelope when the service is unavailable',
    }])),
    service_boundaries: {
      local: ['browser-local'],
      remote: Array.from(new Set(remote.map(([, capabilityId]) => serviceFamilyForCapability(capabilityId)))),
    },
  };
}

export async function runSystemNetworkLocalWorkflow({
  desktop = null,
  appId,
  appSurface = 'desktop',
  localCapabilities = [],
  remoteCapabilities = [],
  localState = {},
  summary = 'Exercise system/network/local app capability boundaries',
} = {}) {
  if (!appId) throw new Error('runSystemNetworkLocalWorkflow requires appId.');

  const capabilityDescription = describeSystemNetworkLocalCapabilities(appId, {
    localCapabilities,
    remoteCapabilities,
    appSurface,
  });
  const gateway = getBrowserAppCapabilityGateway({ desktop });
  const correlationPrefix = `${appId}-${Date.now()}`;
  const remoteEntries = normalizeRemoteCapabilities(remoteCapabilities);
  const remoteEnvelopes = {};

  for (const [key, capabilityId] of remoteEntries) {
    remoteEnvelopes[key] = await gateway.invoke({
      app_id: appId,
      capability_id: capabilityId,
      input: {
        app_id: appId,
        summary,
        local_state: localState,
        requested_boundary: key,
      },
      correlation_id: `${correlationPrefix}-${key}`,
    });
  }

  const envelopeList = Object.values(remoteEnvelopes);
  const result = {
    schema: SYSTEM_NETWORK_LOCAL_WORKFLOW_SCHEMA,
    app_id: appId,
    status: workflowStatus(envelopeList),
    app_surface: appSurface,
    capabilities: capabilityDescription,
    local_state: localState,
    remote_envelopes: remoteEnvelopes,
    receipt_refs: collectRefs(envelopeList, 'receipt_refs'),
    event_dag_refs: collectRefs(envelopeList, 'event_dag_refs'),
    fallback: envelopeList.some(envelope => envelope.status !== 'ok'),
  };

  publishLastWorkflowResult(appId, result);
  return result;
}

function normalizeRemoteCapabilities(remoteCapabilities) {
  return remoteCapabilities.map(entry => {
    if (Array.isArray(entry)) return entry;
    const capabilityId = REMOTE_CAPABILITY_KEYS[entry] || entry;
    const key = Object.entries(REMOTE_CAPABILITY_KEYS).find(([, value]) => value === capabilityId)?.[0]
      || String(entry).replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    return [key, capabilityId];
  });
}

function serviceFamilyForCapability(capabilityId) {
  if (capabilityId.startsWith('ipfs.kit.')) return 'ipfs_kit_py';
  if (capabilityId.startsWith('ipfs.accelerate.')) return 'ipfs_accelerate_py';
  if (capabilityId.startsWith('ipfs.datasets.')) return 'ipfs_datasets_py';
  return 'browser-local';
}

function workflowStatus(envelopes) {
  if (envelopes.some(envelope => envelope.status === 'error')) return 'error';
  if (envelopes.some(envelope => envelope.status === 'degraded')) return 'degraded';
  return 'ok';
}

function collectRefs(envelopes, key) {
  return envelopes.flatMap(envelope => Array.isArray(envelope?.[key]) ? envelope[key] : []);
}

function publishLastWorkflowResult(appId, result) {
  if (typeof window === 'undefined') return;
  window.__lastSystemNetworkLocalWorkflow = result;
  window.__lastSystemNetworkLocalWorkflows = window.__lastSystemNetworkLocalWorkflows || {};
  window.__lastSystemNetworkLocalWorkflows[appId] = result;
}
