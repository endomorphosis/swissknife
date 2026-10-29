import { invokeNativeTool } from '../live-tool-gateway.js';

const OPERATIONS = {
  'mcp++:ipfs_kit_py/artifacts/put': ['persist_artifact', 'artifacts_put'],
  'mcp++:ipfs_kit_py/artifacts/get': ['retrieve_artifact', 'artifacts_get'],
  'mcp++:ipfs_kit_py/dag/append': ['append_event', 'dag_append'],
  'mcp++:ipfs_kit_py/dag/history': ['read_event_history', 'dag_history'],
  'mcp++:ipfs_kit_py/ipfs_pubsub_publish': ['exchange_peer_messages', 'ipfs_pubsub_publish'],
};

export function networkNativeAttributes(appId, tool) {
  const [operation, exactTool] = OPERATIONS[tool] || [];
  if (!operation) throw new Error(`No reviewed network operation for ${tool}.`);
  return `data-native-gateway-binding="${appId}.ipfs_kit_py.${operation}" data-native-tool-id="${exactTool}"`;
}

export function unwrapNetworkToolResult(result) {
  let current = result;
  for (let depth = 0; depth < 8 && current && typeof current === 'object'; depth++) {
    const json = Array.isArray(current.content) ? current.content.find(item => item.type === 'json') : null;
    if (json) { current = json.json; continue; }
    const text = Array.isArray(current.content) ? current.content.find(item => item.type === 'text')?.text : null;
    if (text) {
      try { current = JSON.parse(text); continue; } catch { /* actual non-JSON text remains intact */ }
    }
    if (current.result !== undefined && !current.cid && !current.event_cid && !current.events) { current = current.result; continue; }
    break;
  }
  return current;
}

export class NetworkPreview extends Error {
  constructor(result, response) {
    super('Validated dry-run preview; no remote change was made.');
    this.name = 'NetworkPreview';
    this.preview = true;
    this.result = result;
    this.response = response;
  }
}

export async function invokeNetworkNativeTool(container, appId, tool, payload, trigger = null) {
  const [operation, exactTool] = OPERATIONS[tool] || [];
  if (!operation) throw new Error(`No reviewed network operation for ${tool}.`);
  if (!container) throw new Error('The originating network application window is unavailable.');
  const bindingId = `${appId}.ipfs_kit_py.${operation}`;
  trigger ||= [...container.querySelectorAll('[data-native-gateway-binding]')].find(button =>
    button.dataset.nativeGatewayBinding === bindingId && button.dataset.nativeToolId === exactTool) || null;
  const response = await invokeNativeTool(container, appId, bindingId, { toolId: exactTool, payload, trigger });
  if (response === null) return null;
  if (response.ok !== true || response.outcome !== 'executed') throw new Error(response.error?.message || response.error || `The ${exactTool} owner invocation failed.`);
  const result = unwrapNetworkToolResult(response.result);
  if (result?.isError === true || result?.ok === false || result?.status === 'error') throw new Error(result.error || result.message || `The ${exactTool} owner returned an error.`);
  if (exactTool === 'artifacts_get' && result?.found === true && (result.verified !== true || result.cid !== payload.cid)) throw new Error('The owner did not verify the requested artifact CID.');
  if (result?.dry_run === true && result?.mutation_performed === false) {
    if (exactTool === 'artifacts_put' && (result.persisted !== false || result.expected_cid !== payload.cid)) throw new Error('Artifact preview did not validate the requested CID without persistence.');
    throw new NetworkPreview(result, response);
  }
  return result;
}
