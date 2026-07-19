import {
  getExecutableAppBackendDisposition,
  type ExecutableBackendBinding,
} from '../apps/all-app-executable-backend-contract.js';
import { getAllAppLiveToolBinding } from '../apps/all-app-live-tool-bindings.js';
import {
  ALL_APP_TOOL_GATEWAY_PROTOCOL,
  type BrowserMediatedToolCall,
} from './all-app-tool-gateway.js';
import { sha256Hex } from '../shared/shared-browser-crypto.js';

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
  /** Selected by the mediated contract, never by an owner endpoint. */
  transport: BrowserMediatedToolCall['transport'];
}

export interface MediatedOwnerAdapter {
  invoke(call: MediatedOwnerToolCall): Promise<unknown>;
}

export interface AllAppToolMediatorOptions {
  adapters: Readonly<Partial<Record<BrowserMediatedToolCall['owner'], MediatedOwnerAdapter>>>;
  now?: () => Date;
  receiptId?: (call: BrowserMediatedToolCall, result: unknown) => string;
  eventDagRef?: (call: BrowserMediatedToolCall, result: unknown) => string;
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
    persistence?: {
      status: 'persisted' | 'failed';
      backend?: string;
      receipt_cid?: string;
      event_cid?: string;
      error?: string;
    };
  };
}

const FORBIDDEN_KEYS = new Set([
  'authorization', 'backend_credentials', 'bearer_token', 'api_key', 'password', 'secret',
  'host_path', 'file_path', 'filesystem_path', 'python_process', 'process_command', 'stdio',
  'url', 'endpoint', 'base_url', 'backend_url',
]);

export class AllAppToolMediator {
  private readonly now: () => Date;
  private readonly receiptId: (call: BrowserMediatedToolCall, result: unknown) => string;
  private readonly eventDagRef: (call: BrowserMediatedToolCall, result: unknown) => string;

  constructor(private readonly options: AllAppToolMediatorOptions) {
    this.now = options.now ?? (() => new Date());
    this.receiptId = options.receiptId ?? ((call, result) => contentReference('receipt', call, result));
    this.eventDagRef = options.eventDagRef ?? ((call, result) => contentReference('event', call, result));
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
        transport: call.transport,
      });
      return this.response(call, 'executed', sanitizeOwnerResult(unwrapMcpResult(output)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.response(call, /^owner adapter returned http|fetch failed|network|connect|timed out/i.test(message)
        ? 'unreachable'
        : 'failed', { error: message });
    }
  }

  private response(
    call: BrowserMediatedToolCall,
    outcome: AllAppToolMediatorResponse['outcome'],
    result: unknown,
  ): AllAppToolMediatorResponse {
    const receiptId = this.receiptId(call, result);
    const eventDagRef = this.eventDagRef(call, result);
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
  if (value && typeof value === 'object' && 'jsonrpc' in value) {
    const response = value as { result?: unknown; error?: { code?: unknown; message?: unknown; data?: unknown } };
    if (response.error) {
      const message = typeof response.error.message === 'string'
        ? response.error.message
        : 'Owner adapter returned a JSON-RPC error.';
      throw new Error(message);
    }
    if ('result' in response) {
      const result = response.result;
      if (result && typeof result === 'object' && (result as { isError?: unknown }).isError === true) {
        const content = (result as { content?: Array<{ text?: unknown }> }).content;
        const message = typeof content?.[0]?.text === 'string'
          ? content[0].text
          : 'Owner adapter rejected the tool call.';
        throw new Error(message);
      }
      return result;
    }
  }
  return value;
}

function sanitizeOwnerResult(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeOwnerResult);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !FORBIDDEN_KEYS.has(key.toLowerCase()))
    .map(([key, child]) => [key, sanitizeOwnerResult(child)]));
}

export type GatewayArtifactKind = 'receipt' | 'event';

export function gatewayArtifactCanonicalJson(
  kind: GatewayArtifactKind,
  call: BrowserMediatedToolCall,
  result: unknown,
): string {
  return canonicalJson({ kind, call, result });
}

function contentReference(kind: GatewayArtifactKind, call: BrowserMediatedToolCall, result: unknown): string {
  const digestHex = sha256Hex(gatewayArtifactCanonicalJson(kind, call, result));
  return cidV1RawSha256(digestHex);
}

function cidV1RawSha256(digestHex: string): string {
  const bytes = new Uint8Array(4 + digestHex.length / 2);
  bytes.set([0x01, 0x55, 0x12, 0x20]);
  for (let index = 0; index < digestHex.length; index += 2) {
    bytes[4 + index / 2] = Number.parseInt(digestHex.slice(index, index + 2), 16);
  }
  return `b${base32Lower(bytes)}`;
}

function base32Lower(bytes: Uint8Array): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let accumulator = 0;
  let bits = 0;
  let result = '';
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(accumulator >> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += alphabet[(accumulator << (5 - bits)) & 31];
  return result;
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}
