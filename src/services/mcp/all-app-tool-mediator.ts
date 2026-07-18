import {
  getExecutableAppBackendDisposition,
  type ExecutableBackendBinding,
} from '../apps/all-app-executable-backend-contract.js';
import { getAllAppLiveToolBinding } from '../apps/all-app-live-tool-bindings.js';
import {
  ALL_APP_TOOL_GATEWAY_PROTOCOL,
  type BrowserMediatedToolCall,
} from './all-app-tool-gateway.js';

/**
 * Server-side half of the desktop gateway.  It is deliberately transport
 * agnostic so an HTTP framework can mount it at `/mcp/tools/call` without
 * giving a browser application the adapter endpoint, credentials, or a
 * process reference.
 */
export interface MediatedOwnerToolCall {
  owner: BrowserMediatedToolCall['owner'];
  tool_id: string;
  correlation_id: string;
  payload: Readonly<Record<string, unknown>>;
  dry_run: boolean;
  policy: BrowserMediatedToolCall['input']['policy'];
}

export interface MediatedOwnerAdapter {
  invoke(call: MediatedOwnerToolCall): Promise<unknown>;
}

export interface AllAppToolMediatorOptions {
  adapters: Readonly<Partial<Record<BrowserMediatedToolCall['owner'], MediatedOwnerAdapter>>>;
  now?: () => Date;
  receiptId?: (call: BrowserMediatedToolCall) => string;
  eventDagRef?: (call: BrowserMediatedToolCall) => string;
}

export interface AllAppToolMediatorResponse {
  ok: boolean;
  owner: BrowserMediatedToolCall['owner'];
  tool_id: string;
  transport: BrowserMediatedToolCall['transport'];
  correlation_id: string;
  outcome: 'executed' | 'denied' | 'unsupported' | 'unreachable' | 'failed';
  result: unknown;
  receipt: {
    receipt_id: string;
    owner: BrowserMediatedToolCall['owner'];
    tool_id: string;
    transport: BrowserMediatedToolCall['transport'];
    correlation_id: string;
    policy_outcome: BrowserMediatedToolCall['input']['policy']['outcome'];
    outcome: 'executed' | 'denied' | 'unsupported' | 'unreachable' | 'failed';
    received_at: string;
    receipt_refs: readonly string[];
    event_dag_refs: readonly string[];
  };
}

const FORBIDDEN_KEYS = new Set([
  'authorization', 'backend_credentials', 'bearer_token', 'api_key', 'password', 'secret',
  'host_path', 'file_path', 'filesystem_path', 'python_process', 'process_command', 'stdio',
  'url', 'endpoint', 'base_url', 'backend_url',
]);

export class AllAppToolMediator {
  private readonly now: () => Date;
  private readonly receiptId: (call: BrowserMediatedToolCall) => string;
  private readonly eventDagRef: (call: BrowserMediatedToolCall) => string;

  constructor(private readonly options: AllAppToolMediatorOptions) {
    this.now = options.now ?? (() => new Date());
    this.receiptId = options.receiptId ?? (call => `receipt:${call.correlation_id}`);
    this.eventDagRef = options.eventDagRef ?? (call => `event-dag:${call.correlation_id}`);
  }

  async dispatch(call: BrowserMediatedToolCall): Promise<AllAppToolMediatorResponse> {
    const binding = bindingFor(call);
    if (!binding) return this.response(call, 'unsupported', { error: 'binding_identity_mismatch' });
    if (call.protocol !== ALL_APP_TOOL_GATEWAY_PROTOCOL || call.receipt_required !== true) {
      return this.response(call, 'failed', { error: 'invalid_gateway_protocol' });
    }
    if (forbiddenPayloadPath(call.input.payload)) {
      return this.response(call, 'failed', { error: 'forbidden_browser_payload' });
    }
    if (call.input.policy.outcome === 'deny') {
      return this.response(call, 'denied', { error: 'policy_denied' });
    }
    // Side-effecting declarations are never sent live by the desktop unless
    // their policy confirmation is explicit. The app bootstrap uses dry-run
    // for these controls by default.
    if (binding.mediated_intent.mutates_remote_state
      && !call.input.policy.dry_run
      && call.input.policy.consent !== 'granted') {
      return this.response(call, 'denied', { error: 'confirmation_required' });
    }
    const adapter = this.options.adapters[call.owner];
    if (!adapter) return this.response(call, 'unreachable', { error: 'owner_adapter_unavailable' });
    try {
      const output = await adapter.invoke({
        owner: call.owner,
        tool_id: call.tool_id,
        correlation_id: call.correlation_id,
        payload: call.input.payload,
        dry_run: call.input.policy.dry_run,
        policy: call.input.policy,
      });
      return this.response(call, 'executed', unwrapMcpResult(output));
    } catch (error) {
      return this.response(call, 'unreachable', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private response(
    call: BrowserMediatedToolCall,
    outcome: AllAppToolMediatorResponse['outcome'],
    result: unknown,
  ): AllAppToolMediatorResponse {
    const receiptId = this.receiptId(call);
    const eventDagRef = this.eventDagRef(call);
    return {
      ok: outcome === 'executed', owner: call.owner, tool_id: call.tool_id, transport: call.transport,
      correlation_id: call.correlation_id, outcome, result,
      receipt: {
        receipt_id: receiptId, owner: call.owner, tool_id: call.tool_id, transport: call.transport,
        correlation_id: call.correlation_id, policy_outcome: call.input.policy.outcome, outcome,
        received_at: this.now().toISOString(), receipt_refs: [receiptId], event_dag_refs: [eventDagRef],
      },
    };
  }
}

export function createAllAppToolMediator(options: AllAppToolMediatorOptions): AllAppToolMediator {
  return new AllAppToolMediator(options);
}

/** Framework-neutral route helper for Connect/Vite/Node HTTP integrations. */
export async function dispatchSameOriginToolCall(
  mediator: AllAppToolMediator,
  body: unknown,
): Promise<AllAppToolMediatorResponse> {
  return mediator.dispatch(body as BrowserMediatedToolCall);
}

function bindingFor(call: BrowserMediatedToolCall): ExecutableBackendBinding | null {
  const live = getAllAppLiveToolBinding(call.binding_id);
  const app = getExecutableAppBackendDisposition(call.app_id);
  const binding = app?.backend_bindings.find(candidate => candidate.binding_id === call.binding_id);
  if (!live || !binding || call.route !== binding.transport_policy.gateway_route || live.app_id !== call.app_id || binding.owner !== call.owner
    || binding.mediated_intent.intent_id !== call.intent_id
    || !binding.tool_selection.preferred_tool_ids.includes(call.tool_id)
    || !binding.transport_policy.allowed_transports.includes(call.transport)) return null;
  return binding;
}

function forbiddenPayloadPath(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(forbiddenPayloadPath);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) =>
    FORBIDDEN_KEYS.has(key.toLowerCase()) || forbiddenPayloadPath(child));
}

function unwrapMcpResult(value: unknown): unknown {
  if (value && typeof value === 'object' && 'jsonrpc' in value && 'result' in value) {
    return (value as { result: unknown }).result;
  }
  return value;
}
