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

interface OwnerFailureDetails { message: string; code?: string | number; type?: string }
class OwnerAdapterFailure extends Error {
  constructor(readonly details: OwnerFailureDetails) { super(details.message); }
}

function safeOwnerErrorText(value: string): string {
  return value.split(/\n(?:Traceback|\s*File ")/)[0].slice(0, 2048)
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/(?:\/home\/|\/Users\/)[^\s"']+/g, '[private path]');
}

/** Extract only protocol error fields; never export traceback/credentials. */
function ownerFailure(value: unknown, fallback = 'Owner adapter rejected the tool call.'): OwnerAdapterFailure {
  const pending: unknown[] = [value];
  const seen = new Set<object>();
  let plainText: string | undefined;
  while (pending.length && seen.size < 64) {
    const candidate = pending.shift();
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || seen.has(candidate)) continue;
    seen.add(candidate);
    const record = candidate as Record<string, unknown>;
    const nestedError = record.error && typeof record.error === 'object' ? record.error as Record<string, unknown> : null;
    const message = typeof record.error === 'string' ? record.error
      : nestedError && typeof nestedError.message === 'string' ? nestedError.message
        : typeof record.message === 'string' ? record.message : null;
    if (message) {
      const details: OwnerFailureDetails = { message: safeOwnerErrorText(message) };
      const code = nestedError?.code ?? record.code;
      if (typeof code === 'number' && Number.isFinite(code)) details.code = code;
      else if (typeof code === 'string' && /^[A-Za-z0-9_.:-]{1,100}$/.test(code)) details.code = code;
      const type = nestedError?.type ?? record.error_type;
      if (typeof type === 'string' && /^[A-Za-z0-9_.:-]{1,100}$/.test(type)) details.type = type;
      return new OwnerAdapterFailure(details);
    }
    for (const key of ['error', 'result', 'response']) if (record[key] && typeof record[key] === 'object') pending.push(record[key]);
    for (const item of Array.isArray(record.content) ? record.content.slice(0, 24) : []) {
      if (!item || typeof item !== 'object') continue;
      if (item.json && typeof item.json === 'object') pending.push(item.json);
      if (typeof item.text === 'string') {
        try { pending.push(JSON.parse(item.text)); }
        catch { plainText ??= safeOwnerErrorText(item.text); }
      }
    }
  }
  return new OwnerAdapterFailure({ message: plainText || fallback });
}

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
        : 'failed', { error: safeOwnerErrorText(message),
          ...(error instanceof OwnerAdapterFailure ? { owner_error: error.details } : {}) });
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
      throw ownerFailure(response.error, 'Owner adapter returned a JSON-RPC error.');
    }
    if ('result' in response) {
      const result = response.result;
      if (result && typeof result === 'object' && (result as { isError?: unknown }).isError === true) {
        throw ownerFailure(result);
      }
      assertOwnerResultSucceeded(result);
      return result;
    }
  }
  assertOwnerResultSucceeded(value);
  return value;
}

/** Transport wrappers retain their proof fields, but cannot hide MCP errors. */
function assertOwnerResultSucceeded(value: unknown): void {
  const pending: unknown[] = [value];
  const seen = new Set<object>();
  const failures = new Set(['failed', 'error', 'unsupported', 'unreachable', 'denied']);
  while (pending.length) {
    const candidate = pending.shift();
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || seen.has(candidate)) continue;
    if (seen.size >= 64) throw new Error('Owner adapter returned an excessive result envelope.');
    seen.add(candidate);
    const record = candidate as Record<string, unknown>;
    if (record.isError === true || record.ok === false || record.success === false
      || failures.has(String(record.outcome || '')) || failures.has(String(record.status || ''))
      || (record.error && record.ok !== true && record.success !== true)) {
      throw ownerFailure(record);
    }
    // Follow protocol envelopes, never arbitrary application data fields.
    for (const key of ['result', 'response']) {
      if (record[key] && typeof record[key] === 'object') pending.push(record[key]);
    }
    for (const item of Array.isArray(record.content) ? record.content : []) {
      if (!item || typeof item !== 'object') continue;
      if (item.json && typeof item.json === 'object') pending.push(item.json);
      if (item.type === 'text' && typeof item.text === 'string') {
        try { pending.push(JSON.parse(item.text)); } catch { /* Plain tool text is not an envelope. */ }
      }
    }
  }
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
