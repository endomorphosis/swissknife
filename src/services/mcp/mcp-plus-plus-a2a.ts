/**
 * SwissKnifeA2AAdapter@1 — MCP++ A2A execution extension adapter.
 *
 * Maps A2A Agent Card, Task, Message, Artifact, status, cancel, and streaming
 * onto MCP++ envelope/state/receipt evidence without inventing a competing
 * public task lifecycle (a2a-extension.md; ADR-0006; MCPP-057).
 *
 * Wire extension URI: https://mcplusplus.io/extensions/execution/v1
 * Working alias (non-wire): io.mcplusplus.execution@1
 *
 * Bound SwissKnife checkout adaptation of the Python A2ATaskAdapter@1
 * (ipfs_accelerate_py.mcp_server.mcplusplus.a2a_adapter / MCPP-056).
 */

import { createHash, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Interface / identity pins
// ---------------------------------------------------------------------------

export const INTERFACE = 'SwissKnifeA2AAdapter@1';
export const REFERENCE_INTERFACE = 'A2ATaskAdapter@1';
export const EXTENSION_URI = 'https://mcplusplus.io/extensions/execution/v1';
export const WORKING_ALIAS = 'io.mcplusplus.execution@1';
export const METADATA_KEY_PREFIX = 'https://mcplusplus.io/extensions/execution/v1/';
export const CANONICALIZATION = 'mcpp-jcs-v1';
export const TASK_ID = 'MCPP-057';

export const SCHEMA_AGENT_EXTENSION = 'mcp++/a2a/agent-extension@1';
export const SCHEMA_EXTENSION_PARAMS = 'mcp++/a2a/extension-params@1';
export const SCHEMA_ACTIVATION = 'mcp++/a2a/activation@1';
export const SCHEMA_TASK_METADATA = 'mcp++/a2a/task-metadata@1';
export const SCHEMA_TERMINAL_EVIDENCE = 'mcp++/a2a/terminal-evidence@1';
export const SCHEMA_ENVELOPE = 'mcp++/execution/envelope@1';
export const SCHEMA_RECEIPT = 'mcp++/execution/receipt@1';
export const SCHEMA_STATE_REF = 'mcp++/state/state-ref@1';

export const ALLOWED_PROFILES = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
export const DEFAULT_PROFILES: readonly string[] = ['A', 'B', 'C', 'D', 'F', 'G'];

export const MCP_BINDING_CURRENT = 'mcp-binding/2026-07-28';
export const MCP_BINDING_LEGACY = 'mcp-binding/legacy-2024-11-05';
export const ALLOWED_MCP_BINDINGS = new Set([MCP_BINDING_CURRENT, MCP_BINDING_LEGACY]);

export const TaskState = {
  SUBMITTED: 'submitted',
  WORKING: 'working',
  INPUT_REQUIRED: 'input-required',
  AUTH_REQUIRED: 'auth-required',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELED: 'canceled',
  REJECTED: 'rejected',
} as const;

export type TaskStateValue = (typeof TaskState)[keyof typeof TaskState];

export const TERMINAL_TASK_STATES = new Set<string>([
  TaskState.COMPLETED,
  TaskState.FAILED,
  TaskState.CANCELED,
  TaskState.REJECTED,
]);

export const ERR_MALFORMED_EXTENSION_URI = 'A2A_MALFORMED_EXTENSION_URI';
export const ERR_MALFORMED_EXTENSION = 'A2A_MALFORMED_EXTENSION';
export const ERR_MISSING_RECEIPT_CID = 'A2A_MISSING_RECEIPT_CID';
export const ERR_UNSUPPORTED_PROFILE = 'A2A_UNSUPPORTED_PROFILE';
export const ERR_PROFILE_NOT_SUBSET = 'A2A_PROFILE_NOT_SUBSET';
export const ERR_EXTENSION_REQUIRED = 'A2A_EXTENSION_SUPPORT_REQUIRED';
export const ERR_TASK_NOT_CANCELABLE = 'A2A_TASK_NOT_CANCELABLE';
export const ERR_TASK_NOT_FOUND = 'A2A_TASK_NOT_FOUND';
export const ERR_UNSUPPORTED_EXTENSION = 'A2A_UNSUPPORTED_EXTENSION';
export const ERR_NOT_ACTIVATED = 'A2A_EXTENSION_NOT_ACTIVATED';

const CID_RE = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})$/;
const HTTPS_URI_RE = /^https:\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$/;
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

const DEMO_INTERFACE_CID = 'bafkreigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

// ---------------------------------------------------------------------------
// Errors / results
// ---------------------------------------------------------------------------

export class A2AExtensionError extends Error {
  readonly code: string;
  readonly path: string;
  readonly details: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    opts: { path?: string; details?: Record<string, unknown> } = {},
  ) {
    super(opts.path ? `${opts.path}: ${message}` : message);
    this.name = 'A2AExtensionError';
    this.code = code || ERR_MALFORMED_EXTENSION;
    this.path = opts.path ?? '';
    this.details = { ...(opts.details ?? {}) };
  }

  toDict(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      path: this.path,
      details: deepCopy(this.details),
    };
  }
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  code?: string | null;
  metadata: Record<string, unknown>;
}

function validationOk(metadata: Record<string, unknown> = {}): ValidationResult {
  return { ok: true, errors: [], code: null, metadata };
}

function validationFail(
  code: string,
  errors: string[],
  metadata: Record<string, unknown> = {},
): ValidationResult {
  return { ok: false, errors, code, metadata };
}

function raiseIfFailed(result: ValidationResult): void {
  if (!result.ok) {
    throw new A2AExtensionError(
      result.code || ERR_MALFORMED_EXTENSION,
      result.errors.join('; ') || 'validation failed',
      { details: result.metadata },
    );
  }
}

// ---------------------------------------------------------------------------
// Canonicalization / CID helpers
// ---------------------------------------------------------------------------

function deepCopy<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32[(value << (5 - bits)) & 31];
  }
  return output;
}

export function canonicalizeJson(payload: unknown): Buffer {
  return Buffer.from(JSON.stringify(stableValue(payload)), 'utf8');
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .filter((k) => record[k] !== undefined)
        .map((k) => [k, stableValue(record[k])]),
    );
  }
  return value;
}

export function computeCid(payload: unknown): string {
  const bytes = Buffer.from(JSON.stringify(stableValue(payload)), 'utf8');
  return cidForBytes(bytes);
}

export function cidForBytes(data: Buffer | Uint8Array | string): string {
  const input = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
  const digest = createHash('sha256').update(input).digest();
  const cidBytes = Buffer.concat([Buffer.from([0x01, 0x55, 0x12, 0x20]), digest]);
  return `b${base32Encode(cidBytes)}`;
}

export function isValidCid(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!text || text.length < 46 || text.length > 128) return false;
  return CID_RE.test(text);
}

export function namespacedMetadata(short: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(short || {})) {
    if (String(key).startsWith('https://')) {
      out[String(key)] = deepCopy(value);
    } else {
      out[`${METADATA_KEY_PREFIX}${key}`] = deepCopy(value);
    }
  }
  return out;
}

export function denamespaceMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    const k = String(key);
    if (k.startsWith(METADATA_KEY_PREFIX)) {
      out[k.slice(METADATA_KEY_PREFIX.length)] = deepCopy(value);
    } else {
      out[k] = deepCopy(value);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Extension validation (fail-closed)
// ---------------------------------------------------------------------------

export function isConfirmedExtensionUri(uri: unknown): boolean {
  return typeof uri === 'string' && uri.trim() === EXTENSION_URI;
}

export function isWireExtensionUriShape(uri: unknown): boolean {
  if (typeof uri !== 'string') return false;
  const text = uri.trim();
  return Boolean(text && HTTPS_URI_RE.test(text));
}

export function classifyExtensionUri(uri: unknown): { ok: boolean; code?: string } {
  if (typeof uri !== 'string' || !uri.trim()) {
    return { ok: false, code: ERR_MALFORMED_EXTENSION_URI };
  }
  const text = uri.trim();
  if (text === EXTENSION_URI) return { ok: true };
  return { ok: false, code: ERR_MALFORMED_EXTENSION_URI };
}

function validateProfileLetters(
  profiles: unknown,
  path = 'profiles',
): ValidationResult {
  if (profiles == null) return validationOk({ [path]: [] });
  if (!Array.isArray(profiles)) {
    return validationFail(ERR_MALFORMED_EXTENSION, [`${path} must be an array of profile letters`]);
  }
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (let idx = 0; idx < profiles.length; idx += 1) {
    const item = profiles[idx];
    if (typeof item !== 'string' || !ALLOWED_PROFILES.has(item)) {
      return validationFail(
        ERR_UNSUPPORTED_PROFILE,
        [`${path}[${idx}] unsupported profile letter: ${JSON.stringify(item)}`],
        { profile: item },
      );
    }
    if (seen.has(item)) {
      return validationFail(ERR_MALFORMED_EXTENSION, [`${path} contains duplicate profile ${JSON.stringify(item)}`]);
    }
    seen.add(item);
    ordered.push(item);
  }
  return validationOk({ [path]: ordered });
}

export function validateExtensionParams(params: unknown): ValidationResult {
  if (params == null) return validationOk({ params: {} });
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return validationFail(ERR_MALFORMED_EXTENSION, ['params must be an object']);
  }
  const data = { ...(params as Record<string, unknown>) };
  const allowed = new Set([
    'schema',
    'profiles',
    'envelope_schema',
    'receipt_schema',
    'state_ref_schema',
    'mcp_bindings',
    'interface_cids',
    'canonicalization',
    'alias',
  ]);
  const extra = Object.keys(data).filter((k) => !allowed.has(k));
  if (extra.length) {
    return validationFail(ERR_MALFORMED_EXTENSION, [`params has unknown keys: ${extra.sort().join(',')}`]);
  }
  if ('schema' in data && data.schema !== SCHEMA_EXTENSION_PARAMS) {
    return validationFail(ERR_MALFORMED_EXTENSION, [`params.schema must be ${SCHEMA_EXTENSION_PARAMS}`]);
  }
  if ('profiles' in data) {
    const pr = validateProfileLetters(data.profiles, 'params.profiles');
    if (!pr.ok) return pr;
  }
  for (const [markerKey, expected] of [
    ['envelope_schema', SCHEMA_ENVELOPE],
    ['receipt_schema', SCHEMA_RECEIPT],
    ['state_ref_schema', SCHEMA_STATE_REF],
  ] as const) {
    if (markerKey in data && data[markerKey] !== expected) {
      return validationFail(ERR_MALFORMED_EXTENSION, [`params.${markerKey} must be ${expected}`]);
    }
  }
  if ('mcp_bindings' in data) {
    const bindings = data.mcp_bindings;
    if (!Array.isArray(bindings) || !bindings.length) {
      return validationFail(ERR_MALFORMED_EXTENSION, ['params.mcp_bindings must be a non-empty array']);
    }
    for (const b of bindings) {
      if (!ALLOWED_MCP_BINDINGS.has(String(b))) {
        return validationFail(ERR_MALFORMED_EXTENSION, [`unknown mcp binding id: ${JSON.stringify(b)}`]);
      }
    }
  }
  if ('interface_cids' in data) {
    const cids = data.interface_cids;
    if (!Array.isArray(cids)) {
      return validationFail(ERR_MALFORMED_EXTENSION, ['params.interface_cids must be an array']);
    }
    for (const cid of cids) {
      if (!isValidCid(cid)) {
        return validationFail(ERR_MALFORMED_EXTENSION, [`invalid interface_cid: ${JSON.stringify(cid)}`]);
      }
    }
  }
  if ('canonicalization' in data && data.canonicalization !== CANONICALIZATION) {
    return validationFail(ERR_MALFORMED_EXTENSION, [`canonicalization must be ${CANONICALIZATION}`]);
  }
  if ('alias' in data && data.alias !== WORKING_ALIAS) {
    return validationFail(ERR_MALFORMED_EXTENSION, [`alias must be ${WORKING_ALIAS} when present`]);
  }
  return validationOk({ params: deepCopy(data) });
}

export function validateAgentExtension(payload: unknown): ValidationResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return validationFail(ERR_MALFORMED_EXTENSION, ['AgentExtension must be an object']);
  }
  const data = payload as Record<string, unknown>;
  if (!('uri' in data)) {
    return validationFail(ERR_MALFORMED_EXTENSION, ['AgentExtension.uri is required']);
  }
  const classified = classifyExtensionUri(data.uri);
  if (!classified.ok) {
    return validationFail(
      classified.code || ERR_MALFORMED_EXTENSION_URI,
      [`AgentExtension.uri must be ${EXTENSION_URI}; got ${JSON.stringify(data.uri)}`],
      { uri: data.uri },
    );
  }
  if ('schema' in data && data.schema !== SCHEMA_AGENT_EXTENSION) {
    return validationFail(ERR_MALFORMED_EXTENSION, [`schema must be ${SCHEMA_AGENT_EXTENSION}`]);
  }
  if ('params' in data) {
    const pr = validateExtensionParams(data.params);
    if (!pr.ok) return pr;
  }
  return validationOk({ uri: EXTENSION_URI });
}

export function parseA2AExtensionsHeader(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((x) => String(x).trim()).filter(Boolean);
  }
  const text = String(value).trim();
  if (!text) return [];
  return text.split(',').map((p) => p.trim()).filter(Boolean);
}

export function validateActivation(
  payload: unknown,
  opts: { require_execution?: boolean } = {},
): ValidationResult {
  const requireExecution = Boolean(opts.require_execution);
  let extensions: string[];
  let data: Record<string, unknown>;

  if (typeof payload === 'string' || Array.isArray(payload)) {
    extensions = parseA2AExtensionsHeader(payload);
    data = {
      schema: SCHEMA_ACTIVATION,
      a2a_extensions: extensions,
      mcp_plus_plus_execution_activated: extensions.includes(EXTENSION_URI),
    };
  } else if (payload && typeof payload === 'object') {
    data = { ...(payload as Record<string, unknown>) };
    extensions = parseA2AExtensionsHeader(data.a2a_extensions);
    data.a2a_extensions = extensions;
  } else {
    return validationFail(ERR_MALFORMED_EXTENSION, [
      'activation must be an object or A2A-Extensions header value',
    ]);
  }

  if (!extensions.length) {
    return validationFail(ERR_MALFORMED_EXTENSION, ['a2a_extensions must contain at least one URI']);
  }

  for (const uri of extensions) {
    if (!isWireExtensionUriShape(uri)) {
      return validationFail(
        ERR_MALFORMED_EXTENSION_URI,
        [`A2A-Extensions entry is not an HTTPS URI: ${JSON.stringify(uri)}`],
        { uri },
      );
    }
  }

  const activated = extensions.includes(EXTENSION_URI);
  if (data.mcp_plus_plus_execution_activated === true && !activated) {
    return validationFail(ERR_MALFORMED_EXTENSION, [
      'mcp_plus_plus_execution_activated true but execution URI missing',
    ]);
  }
  if (requireExecution && !activated) {
    return validationFail(ERR_NOT_ACTIVATED, [`activation must include ${EXTENSION_URI}`]);
  }

  return validationOk({
    a2a_extensions: [...extensions],
    mcp_plus_plus_execution_activated: activated,
    echo: activated ? [...extensions] : [],
  });
}

export function validateTaskMetadata(payload: unknown): ValidationResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return validationFail(ERR_MALFORMED_EXTENSION, ['task metadata must be an object']);
  }
  const data = denamespaceMetadata(payload as Record<string, unknown>);
  const allowed = new Set([
    'schema',
    'envelope_cid',
    'result_cid',
    'receipt_cid',
    'event_cid',
    'output_cid',
    'input_cid',
    'intent_cid',
    'interface_cid',
    'method',
    'state_ref_cids',
    'proof_cid',
    'proof_cids',
    'delegation_cid',
    'delegation_cids',
    'decision_cid',
    'profiles',
    'profile',
    'required_abilities',
    'resource',
    'audience',
  ]);
  const extra = Object.keys(data).filter((k) => !allowed.has(k));
  if (extra.length) {
    return validationFail(ERR_MALFORMED_EXTENSION, [`task metadata unknown keys: ${extra.sort().join(',')}`]);
  }
  if ('schema' in data && data.schema !== SCHEMA_TASK_METADATA) {
    return validationFail(ERR_MALFORMED_EXTENSION, [`schema must be ${SCHEMA_TASK_METADATA}`]);
  }
  for (const key of [
    'envelope_cid',
    'result_cid',
    'receipt_cid',
    'event_cid',
    'output_cid',
    'input_cid',
    'intent_cid',
    'interface_cid',
    'proof_cid',
    'delegation_cid',
    'decision_cid',
  ]) {
    if (key in data && !isValidCid(data[key])) {
      return validationFail(ERR_MALFORMED_EXTENSION, [`${key} is not a valid CID`]);
    }
  }
  for (const listKey of ['state_ref_cids', 'proof_cids', 'delegation_cids']) {
    if (listKey in data) {
      const items = data[listKey];
      if (!Array.isArray(items)) {
        return validationFail(ERR_MALFORMED_EXTENSION, [`${listKey} must be an array`]);
      }
      for (const cid of items) {
        if (!isValidCid(cid)) {
          return validationFail(ERR_MALFORMED_EXTENSION, [`${listKey} contains invalid CID`]);
        }
      }
    }
  }
  if ('profiles' in data) {
    const pr = validateProfileLetters(data.profiles);
    if (!pr.ok) return pr;
  }
  if ('profile' in data && !ALLOWED_PROFILES.has(String(data.profile))) {
    return validationFail(ERR_UNSUPPORTED_PROFILE, [
      `unsupported profile letter: ${JSON.stringify(data.profile)}`,
    ]);
  }
  return validationOk({ task_metadata: deepCopy(data) });
}

export function validateTerminalEvidence(payload: unknown): ValidationResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return validationFail(ERR_MALFORMED_EXTENSION, ['terminal evidence must be an object']);
  }
  const data = payload as Record<string, unknown>;
  if (data.schema !== SCHEMA_TERMINAL_EVIDENCE) {
    return validationFail(ERR_MALFORMED_EXTENSION, [`schema must be ${SCHEMA_TERMINAL_EVIDENCE}`]);
  }
  const classified = classifyExtensionUri(data.extension_uri);
  if (!classified.ok) {
    return validationFail(
      classified.code || ERR_MALFORMED_EXTENSION_URI,
      ['extension_uri must be the confirmed execution URI'],
    );
  }
  const state = data.task_state;
  if (typeof state !== 'string' || !TERMINAL_TASK_STATES.has(state)) {
    return validationFail(ERR_MALFORMED_EXTENSION, [
      `task_state must be a terminal A2A state; got ${JSON.stringify(state)} (non-A2A public status names are forbidden)`,
    ]);
  }
  const portable = Boolean(data.portable);
  if (portable && state === TaskState.COMPLETED) {
    if (!isValidCid(data.receipt_cid)) {
      return validationFail(ERR_MISSING_RECEIPT_CID, [
        'portable completed terminal evidence requires receipt_cid',
      ]);
    }
    if (!isValidCid(data.envelope_cid)) {
      return validationFail(ERR_MALFORMED_EXTENSION, [
        'portable completed terminal evidence requires envelope_cid',
      ]);
    }
  }
  for (const key of [
    'envelope_cid',
    'result_cid',
    'receipt_cid',
    'event_cid',
    'output_cid',
    'proof_cid',
    'decision_cid',
    'delegation_cid',
  ]) {
    if (key in data && data[key] != null && !isValidCid(data[key])) {
      return validationFail(ERR_MALFORMED_EXTENSION, [`${key} is not a valid CID`]);
    }
  }
  return validationOk({ terminal: deepCopy(data) });
}

export function validateProfileRequest(
  advertised: string[],
  requested: string[],
  opts: { extension_uri?: string } = {},
): ValidationResult {
  const extensionUri = opts.extension_uri ?? EXTENSION_URI;
  if (!isConfirmedExtensionUri(extensionUri)) {
    return validationFail(ERR_MALFORMED_EXTENSION_URI, [
      'profile request requires confirmed extension URI',
    ]);
  }
  const adv = validateProfileLetters(advertised, 'advertised_profiles');
  if (!adv.ok) return adv;
  const req = validateProfileLetters(requested, 'requested_profiles');
  if (!req.ok) return req;
  const advSet = new Set((adv.metadata.advertised_profiles as string[]) || []);
  const reqList = (req.metadata.requested_profiles as string[]) || [];
  const missing = reqList.filter((p) => !advSet.has(p));
  if (missing.length) {
    return validationFail(
      ERR_PROFILE_NOT_SUBSET,
      [`requested profiles not advertised: ${JSON.stringify(missing)}`],
      { missing, advertised: [...advSet].sort() },
    );
  }
  return validationOk({ advertised: [...advSet].sort(), requested: reqList });
}

export function mapResultStatusToTaskState(resultStatus: string): string {
  const mapping: Record<string, string> = {
    succeeded: TaskState.COMPLETED,
    failed: TaskState.FAILED,
    timed_out: TaskState.FAILED,
    cancelled: TaskState.CANCELED,
    canceled: TaskState.CANCELED,
    rejected: TaskState.REJECTED,
    compensated: TaskState.COMPLETED,
  };
  const key = String(resultStatus || '').trim().toLowerCase();
  if (!(key in mapping)) {
    throw new A2AExtensionError(
      ERR_MALFORMED_EXTENSION,
      `unknown ExecutionResult status for A2A mapping: ${JSON.stringify(resultStatus)}`,
    );
  }
  return mapping[key];
}

// ---------------------------------------------------------------------------
// Event DAG (A2A-scoped, independent per agent)
// ---------------------------------------------------------------------------

export class A2AEventDAGStore {
  private readonly events = new Map<string, { payload: Record<string, unknown>; parents: string[] }>();

  hasEvent(eventCid: string): boolean {
    return this.events.has(eventCid);
  }

  addEvent(eventCid: string, payload: Record<string, unknown>): void {
    const parents = Array.isArray(payload.parents)
      ? (payload.parents as unknown[]).map(String).filter(Boolean)
      : [];
    const existing = this.events.get(eventCid);
    if (existing) {
      const same =
        JSON.stringify(stableValue(existing.payload)) === JSON.stringify(stableValue(payload)) &&
        JSON.stringify(existing.parents) === JSON.stringify(parents);
      if (same) return;
      throw new Error(`conflicting_event:${eventCid}`);
    }
    for (const parent of parents) {
      if (!this.events.has(parent)) throw new Error(`missing_parent:${parent}`);
    }
    this.events.set(eventCid, { payload: deepCopy(payload), parents: [...parents] });
  }

  getLineage(eventCid: string): string[] {
    if (!this.events.has(eventCid)) return [];
    const lineage = [eventCid];
    let current = eventCid;
    while (true) {
      const node = this.events.get(current)!;
      if (!node.parents.length) break;
      const parent = [...node.parents].sort()[0];
      lineage.push(parent);
      current = parent;
    }
    return lineage.reverse();
  }

  stats(): { event_count: number; root_count: number; edge_count: number } {
    let roots = 0;
    let edges = 0;
    for (const node of this.events.values()) {
      if (!node.parents.length) roots += 1;
      edges += node.parents.length;
    }
    return { event_count: this.events.size, root_count: roots, edge_count: edges };
  }

  exportSnapshot(): { version: number; events: Array<{ event_cid: string; payload: Record<string, unknown> }> } {
    const events = [...this.events.keys()].sort().map((eventCid) => {
      const node = this.events.get(eventCid)!;
      const payload = deepCopy(node.payload);
      payload.parents = [...node.parents];
      return { event_cid: eventCid, payload };
    });
    return { version: 1, events };
  }
}

// ---------------------------------------------------------------------------
// Task record
// ---------------------------------------------------------------------------

export class A2ATaskRecord {
  taskId: string;
  contextId: string;
  state: string;
  agentId: string;
  metadata: Record<string, unknown> = {};
  messages: Record<string, unknown>[] = [];
  artifacts: Record<string, unknown>[] = [];
  stream: Record<string, unknown>[] = [];
  attempt = 0;
  createdAtMs = 0;
  updatedAtMs = 0;
  cancelRequested = false;
  durableCancelId: string | null = null;
  parentEventCids: string[] = [];
  lastEventCid: string | null = null;
  envelopeCid: string | null = null;
  receiptCid: string | null = null;
  resultCid: string | null = null;
  outputCid: string | null = null;
  error: Record<string, unknown> | null = null;

  constructor(init: {
    taskId: string;
    contextId: string;
    state: string;
    agentId: string;
    createdAtMs?: number;
    updatedAtMs?: number;
    attempt?: number;
  }) {
    this.taskId = init.taskId;
    this.contextId = init.contextId;
    this.state = init.state;
    this.agentId = init.agentId;
    this.createdAtMs = init.createdAtMs ?? 0;
    this.updatedAtMs = init.updatedAtMs ?? 0;
    this.attempt = init.attempt ?? 0;
  }

  isTerminal(): boolean {
    return TERMINAL_TASK_STATES.has(this.state);
  }

  publicView(): Record<string, unknown> {
    const publicMetaKeys = new Set([
      'envelope_cid',
      'result_cid',
      'receipt_cid',
      'event_cid',
      'output_cid',
      'input_cid',
      'intent_cid',
      'interface_cid',
      'method',
      'profiles',
      'profile',
      'proof_cid',
      'proof_cids',
      'delegation_cid',
      'delegation_cids',
      'decision_cid',
      'state_ref_cids',
      'durable_cancel_id',
      'prior_task_id',
    ]);
    const publicMeta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this.metadata)) {
      if (publicMetaKeys.has(k)) publicMeta[k] = v;
    }
    return {
      id: this.taskId,
      contextId: this.contextId,
      status: {
        state: this.state,
        timestamp: this.updatedAtMs,
        message: this.error
          ? {
              role: 'agent',
              parts: [{ kind: 'text', text: String(this.error.message ?? '') }],
              metadata: {},
            }
          : null,
      },
      metadata: namespacedMetadata(publicMeta),
      artifacts: deepCopy(this.artifacts),
      history: deepCopy(this.messages),
      attempt: this.attempt,
      extension_uri: EXTENSION_URI,
    };
  }
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export interface A2AAgentOptions {
  agentId: string;
  name: string;
  url: string;
  did: string;
  profiles?: string[];
  interfaceCids?: string[];
  mcpBindings?: string[];
  extensionRequired?: boolean;
  skills?: Record<string, unknown>[];
  version?: string;
  streaming?: boolean;
}

export class A2AAgent {
  readonly agentId: string;
  readonly name: string;
  readonly url: string;
  readonly did: string;
  profiles: string[];
  interfaceCids: string[];
  mcpBindings: string[];
  extensionRequired: boolean;
  skills: Record<string, unknown>[];
  version: string;
  streaming: boolean;
  readonly eventDag = new A2AEventDAGStore();
  readonly durableCancels = new Map<string, Record<string, unknown>>();
  readonly artifacts = new Map<string, Record<string, unknown>>();
  private readonly tasks = new Map<string, A2ATaskRecord>();
  private seq = 0;

  constructor(opts: A2AAgentOptions) {
    this.agentId = opts.agentId;
    this.name = opts.name;
    this.url = opts.url;
    this.did = opts.did;
    const pr = validateProfileLetters(opts.profiles ?? [...DEFAULT_PROFILES]);
    raiseIfFailed(pr);
    this.profiles = (pr.metadata.profiles as string[]) || [...DEFAULT_PROFILES];
    this.interfaceCids = opts.interfaceCids?.length
      ? [...opts.interfaceCids]
      : [DEMO_INTERFACE_CID];
    for (const cid of this.interfaceCids) {
      if (!isValidCid(cid)) {
        throw new A2AExtensionError(ERR_MALFORMED_EXTENSION, `invalid interface_cid on agent: ${JSON.stringify(cid)}`);
      }
    }
    this.mcpBindings = opts.mcpBindings?.length
      ? [...opts.mcpBindings]
      : [MCP_BINDING_CURRENT, MCP_BINDING_LEGACY];
    this.extensionRequired = Boolean(opts.extensionRequired);
    this.version = opts.version ?? '1.0.0';
    this.streaming = opts.streaming ?? true;
    this.skills = opts.skills?.length
      ? deepCopy(opts.skills)
      : [
          {
            id: 'repo.status',
            name: 'Repository status',
            description: 'Return git working tree status via MCP-IDL.',
            tags: ['vcs', 'git'],
            metadata: namespacedMetadata({
              interface_cid: this.interfaceCids[0],
              method: 'repo.status',
              profiles: ['A', 'B'],
            }),
          },
        ];
  }

  agentExtension(): Record<string, unknown> {
    const ext = {
      schema: SCHEMA_AGENT_EXTENSION,
      uri: EXTENSION_URI,
      description:
        'MCP++ execution mapping: envelopes, state refs, receipts, and proofs on A2A Task.',
      required: this.extensionRequired,
      params: {
        schema: SCHEMA_EXTENSION_PARAMS,
        profiles: [...this.profiles],
        envelope_schema: SCHEMA_ENVELOPE,
        receipt_schema: SCHEMA_RECEIPT,
        state_ref_schema: SCHEMA_STATE_REF,
        mcp_bindings: [...this.mcpBindings],
        interface_cids: [...this.interfaceCids],
        canonicalization: CANONICALIZATION,
        alias: WORKING_ALIAS,
      },
    };
    raiseIfFailed(validateAgentExtension(ext));
    return ext;
  }

  /** Agent Card equivalent for SwissKnife / A2A discovery. */
  agentCard(): Record<string, unknown> {
    return {
      name: this.name,
      description: `SwissKnife MCP++ A2A agent ${this.agentId}`,
      url: this.url,
      version: this.version,
      protocolVersion: '0.3.0',
      preferredTransport: 'JSONRPC',
      capabilities: {
        streaming: this.streaming,
        pushNotifications: false,
        extensions: [this.agentExtension()],
      },
      skills: deepCopy(this.skills),
      defaultInputModes: ['text/plain', 'application/json'],
      defaultOutputModes: ['application/json'],
      metadata: namespacedMetadata({
        agent_id: this.agentId,
        did: this.did,
        profiles: [...this.profiles],
        runtime: 'swissknife',
        adapter: INTERFACE,
      }),
    };
  }

  private nowMs(): number {
    return Date.now();
  }

  private nextTaskId(): string {
    this.seq += 1;
    return `task-${this.agentId}-${String(this.seq).padStart(4, '0')}-${randomBytes(4).toString('hex')}`;
  }

  getTask(taskId: string): A2ATaskRecord {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new A2AExtensionError(ERR_TASK_NOT_FOUND, `task not found: ${taskId}`);
    }
    return task;
  }

  listTasks(): string[] {
    return [...this.tasks.keys()].sort();
  }

  storeArtifact(payload: Record<string, unknown>): string {
    const cid = computeCid(payload);
    this.artifacts.set(cid, deepCopy(payload));
    return cid;
  }

  appendEvent(opts: {
    kind: string;
    taskId: string;
    parents?: string[];
    extra?: Record<string, unknown>;
  }): string {
    const parentList = (opts.parents ?? []).filter(Boolean);
    const payload: Record<string, unknown> = {
      schema: 'mcp++/a2a/event@1',
      kind: opts.kind,
      task_id: opts.taskId,
      agent_id: this.agentId,
      extension_uri: EXTENSION_URI,
      parents: parentList,
      created_at_ms: this.nowMs(),
      ...(opts.extra ? deepCopy(opts.extra) : {}),
    };
    payload.parents = parentList;
    const eventCid = computeCid(payload);
    this.eventDag.addEvent(eventCid, payload);
    return eventCid;
  }

  activate(
    a2aExtensions: unknown,
    opts: { requireExecution?: boolean | null } = {},
  ): Record<string, unknown> {
    const require =
      opts.requireExecution == null ? this.extensionRequired : Boolean(opts.requireExecution);
    const result = validateActivation(a2aExtensions, { require_execution: require });
    if (!result.ok) {
      if (
        require &&
        (result.code === ERR_NOT_ACTIVATED || result.code === ERR_MALFORMED_EXTENSION)
      ) {
        if (!parseA2AExtensionsHeader(a2aExtensions).includes(EXTENSION_URI)) {
          throw new A2AExtensionError(
            ERR_EXTENSION_REQUIRED,
            'Agent requires MCP++ execution extension activation',
            { details: result.metadata },
          );
        }
      }
      raiseIfFailed(result);
    }
    const activated = Boolean(result.metadata.mcp_plus_plus_execution_activated);
    return {
      activated,
      a2a_extensions: [...((result.metadata.a2a_extensions as string[]) || [])],
      echo: [...((result.metadata.echo as string[]) || [])],
      extension_uri: activated ? EXTENSION_URI : null,
    };
  }

  private assertProfilesAllowed(requested: string[]): void {
    raiseIfFailed(validateProfileRequest(this.profiles, requested));
  }

  sendMessage(opts: {
    message: Record<string, unknown>;
    a2aExtensions: unknown;
    contextId?: string | null;
    taskId?: string | null;
    requestedProfiles?: string[];
    execute?: boolean;
    fail?: boolean;
    holdOpen?: boolean;
  }): Record<string, unknown> {
    const activation = this.activate(opts.a2aExtensions);
    if (!activation.activated) {
      if (this.extensionRequired) {
        throw new A2AExtensionError(
          ERR_EXTENSION_REQUIRED,
          'execution extension required but not activated',
        );
      }
      throw new A2AExtensionError(
        ERR_NOT_ACTIVATED,
        `A2A-Extensions must include ${EXTENSION_URI} for MCP++ handoff`,
      );
    }

    const profiles = opts.requestedProfiles ?? ['A', 'B'];
    this.assertProfilesAllowed(profiles);

    const msg = { ...(opts.message || {}) };
    const msgMeta = denamespaceMetadata((msg.metadata as Record<string, unknown>) || {});
    const tm = validateTaskMetadata(msgMeta);
    if (!tm.ok && Object.keys(msgMeta).length) {
      raiseIfFailed(tm);
    }

    const now = this.nowMs();
    let task: A2ATaskRecord;
    if (opts.taskId && this.tasks.has(opts.taskId)) {
      task = this.tasks.get(opts.taskId)!;
      if (task.isTerminal()) {
        throw new A2AExtensionError(
          ERR_MALFORMED_EXTENSION,
          'cannot append to terminal task; use retry()',
          { details: { task_id: opts.taskId } },
        );
      }
    } else {
      const tid = opts.taskId || this.nextTaskId();
      task = new A2ATaskRecord({
        taskId: tid,
        contextId:
          opts.contextId ||
          String(msg.contextId || `ctx-${randomBytes(6).toString('hex')}`),
        state: TaskState.SUBMITTED,
        agentId: this.agentId,
        createdAtMs: now,
        updatedAtMs: now,
        attempt: 1,
      });
      this.tasks.set(tid, task);
    }

    task.messages.push(deepCopy(msg));
    const requester =
      msg.from ||
      msg.requester ||
      ((msg.metadata as Record<string, unknown>) || {}).from ||
      'did:key:client';
    Object.assign(task.metadata, {
      profiles,
      method:
        msgMeta.method ||
        (typeof msg.skill === 'string' ? msg.skill : null) ||
        'repo.status',
      interface_cid: msgMeta.interface_cid || this.interfaceCids[0],
      requester,
    });
    if (msgMeta.input_cid) task.metadata.input_cid = msgMeta.input_cid;
    if (msgMeta.envelope_cid) {
      task.envelopeCid = String(msgMeta.envelope_cid);
      task.metadata.envelope_cid = task.envelopeCid;
    }

    const submitEvent = this.appendEvent({
      kind: 'task.submitted',
      taskId: task.taskId,
      parents: [...task.parentEventCids],
      extra: { state: TaskState.SUBMITTED, attempt: task.attempt },
    });
    task.lastEventCid = submitEvent;
    task.metadata.event_cid = submitEvent;
    task.state = TaskState.WORKING;
    task.updatedAtMs = this.nowMs();
    const workEvent = this.appendEvent({
      kind: 'task.working',
      taskId: task.taskId,
      parents: [submitEvent],
      extra: { state: TaskState.WORKING, attempt: task.attempt },
    });
    task.lastEventCid = workEvent;
    task.metadata.event_cid = workEvent;
    task.stream.push({
      kind: 'status',
      task_id: task.taskId,
      state: TaskState.WORKING,
      metadata: { event_cid: workEvent },
      attempt: task.attempt,
    });

    if (opts.holdOpen) return task.publicView();

    if (opts.execute !== false) {
      if (opts.fail) {
        this.failTask(task, { code: 'EXECUTION_FAILED', message: 'forced failure' });
      } else {
        this.completeTask(task);
      }
    }
    return task.publicView();
  }

  private mintExecutionBundle(
    task: A2ATaskRecord,
    opts: { resultStatus: string; output?: Record<string, unknown> },
  ): Record<string, string> {
    const method = String(task.metadata.method || 'repo.status');
    const interfaceCid = String(task.metadata.interface_cid || this.interfaceCids[0]);
    const inputPayload = {
      schema: 'mcp++/a2a/input@1',
      task_id: task.taskId,
      method,
      parts: task.messages.map((m) => m.parts).filter(Array.isArray),
    };
    const inputCid = String(task.metadata.input_cid || this.storeArtifact(inputPayload));
    const intent = {
      schema: 'mcp++/execution/intent@1',
      interface_cid: interfaceCid,
      method,
      input_cid: inputCid,
      correlation_id: task.taskId,
    };
    const intentCid = this.storeArtifact(intent);
    const envelope = {
      schema: SCHEMA_ENVELOPE,
      interface_cid: interfaceCid,
      method,
      input_cid: inputCid,
      intent_cid: intentCid,
      correlation_id: task.taskId,
      requester: task.metadata.requester || 'did:key:client',
      parents: [...task.parentEventCids],
      extension_uri: EXTENSION_URI,
    };
    const envelopeCid = task.envelopeCid || this.storeArtifact(envelope);
    const outputPayload = opts.output ?? {
      schema: 'mcp++/a2a/output@1',
      task_id: task.taskId,
      method,
      status: opts.resultStatus,
      summary: `${method} completed`,
      runtime: 'swissknife',
    };
    const outputCid = this.storeArtifact(outputPayload);
    const result = {
      schema: 'mcp++/execution/result@1',
      status: opts.resultStatus,
      envelope_cid: envelopeCid,
      output_cids: [outputCid],
      primary_output_cid: outputCid,
      correlation_id: task.taskId,
    };
    const resultCid = this.storeArtifact(result);
    const receipt = {
      schema: SCHEMA_RECEIPT,
      envelope_cid: envelopeCid,
      result_cid: resultCid,
      output_cid: outputCid,
      intent_cid: intentCid,
      correlation_id: task.taskId,
      extension_uri: EXTENSION_URI,
      status: opts.resultStatus,
    };
    const receiptCid = this.storeArtifact(receipt);
    const parents = task.lastEventCid ? [task.lastEventCid] : [];
    const eventCid = this.appendEvent({
      kind: 'task.terminal',
      taskId: task.taskId,
      parents,
      extra: {
        state: mapResultStatusToTaskState(opts.resultStatus),
        envelope_cid: envelopeCid,
        result_cid: resultCid,
        receipt_cid: receiptCid,
        output_cid: outputCid,
        result_status: opts.resultStatus,
        attempt: task.attempt,
      },
    });
    return {
      input_cid: inputCid,
      intent_cid: intentCid,
      envelope_cid: envelopeCid,
      result_cid: resultCid,
      receipt_cid: receiptCid,
      output_cid: outputCid,
      event_cid: eventCid,
      result_status: opts.resultStatus,
    };
  }

  private completeTask(task: A2ATaskRecord, output?: Record<string, unknown>): void {
    if (task.cancelRequested) {
      this.cancelTaskInternal(task, 'cancel-before-complete');
      return;
    }
    const bundle = this.mintExecutionBundle(task, { resultStatus: 'succeeded', output });
    task.state = TaskState.COMPLETED;
    task.envelopeCid = bundle.envelope_cid;
    task.resultCid = bundle.result_cid;
    task.receiptCid = bundle.receipt_cid;
    task.outputCid = bundle.output_cid;
    task.lastEventCid = bundle.event_cid;
    Object.assign(task.metadata, {
      envelope_cid: bundle.envelope_cid,
      result_cid: bundle.result_cid,
      receipt_cid: bundle.receipt_cid,
      event_cid: bundle.event_cid,
      output_cid: bundle.output_cid,
      input_cid: bundle.input_cid,
      intent_cid: bundle.intent_cid,
    });
    task.artifacts.push({
      artifactId: `artifact-${task.taskId}`,
      name: 'primary-output',
      parts: [
        {
          kind: 'data',
          data: {
            output_cid: bundle.output_cid,
            result_cid: bundle.result_cid,
          },
        },
      ],
      metadata: namespacedMetadata({
        output_cid: bundle.output_cid,
        receipt_cid: bundle.receipt_cid,
        event_cid: bundle.event_cid,
        envelope_cid: bundle.envelope_cid,
      }),
    });
    task.updatedAtMs = this.nowMs();
    task.stream.push({
      kind: 'terminal',
      task_id: task.taskId,
      state: TaskState.COMPLETED,
      metadata: { ...task.metadata },
      attempt: task.attempt,
    });
  }

  private failTask(task: A2ATaskRecord, err: { code: string; message: string }): void {
    if (task.cancelRequested) {
      this.cancelTaskInternal(task, 'cancel-before-fail');
      return;
    }
    const bundle = this.mintExecutionBundle(task, {
      resultStatus: 'failed',
      output: {
        schema: 'mcp++/a2a/output@1',
        task_id: task.taskId,
        error: { code: err.code, message: err.message },
      },
    });
    task.state = TaskState.FAILED;
    task.error = { code: err.code, message: err.message };
    task.envelopeCid = bundle.envelope_cid;
    task.resultCid = bundle.result_cid;
    task.receiptCid = bundle.receipt_cid;
    task.outputCid = bundle.output_cid;
    task.lastEventCid = bundle.event_cid;
    Object.assign(task.metadata, {
      envelope_cid: bundle.envelope_cid,
      result_cid: bundle.result_cid,
      receipt_cid: bundle.receipt_cid,
      event_cid: bundle.event_cid,
      output_cid: bundle.output_cid,
    });
    task.updatedAtMs = this.nowMs();
    task.stream.push({
      kind: 'terminal',
      task_id: task.taskId,
      state: TaskState.FAILED,
      metadata: { ...task.metadata },
      message: err.message,
      attempt: task.attempt,
    });
  }

  private cancelTaskInternal(task: A2ATaskRecord, reason: string): void {
    const parents = task.lastEventCid ? [task.lastEventCid] : [];
    const cancelJournal = {
      schema: 'mcp++/durable/cancel@1',
      task_id: task.taskId,
      agent_id: this.agentId,
      reason,
      requested_at_ms: this.nowMs(),
      extension_uri: EXTENSION_URI,
      parents,
    };
    const durableId = computeCid(cancelJournal);
    this.durableCancels.set(durableId, cancelJournal);
    task.durableCancelId = durableId;

    const eventCid = this.appendEvent({
      kind: 'task.canceled',
      taskId: task.taskId,
      parents,
      extra: {
        state: TaskState.CANCELED,
        reason,
        durable_cancel_id: durableId,
        attempt: task.attempt,
      },
    });
    const cancelReceipt = {
      schema: SCHEMA_RECEIPT,
      correlation_id: task.taskId,
      status: 'cancelled',
      extension_uri: EXTENSION_URI,
      durable_cancel_id: durableId,
      event_cid: eventCid,
    };
    const receiptCid = this.storeArtifact(cancelReceipt);

    task.state = TaskState.CANCELED;
    task.cancelRequested = true;
    task.lastEventCid = eventCid;
    task.receiptCid = receiptCid;
    task.error = { code: 'CANCELED', message: reason };
    Object.assign(task.metadata, {
      event_cid: eventCid,
      receipt_cid: receiptCid,
      durable_cancel_id: durableId,
    });
    task.updatedAtMs = this.nowMs();
    task.stream.push({
      kind: 'terminal',
      task_id: task.taskId,
      state: TaskState.CANCELED,
      metadata: { ...task.metadata },
      message: reason,
      attempt: task.attempt,
    });
  }

  cancelTask(taskId: string, opts: { reason?: string } = {}): Record<string, unknown> {
    const task = this.getTask(taskId);
    if (task.isTerminal()) {
      throw new A2AExtensionError(
        ERR_TASK_NOT_CANCELABLE,
        `task ${taskId} is already terminal (${task.state})`,
        { details: { state: task.state } },
      );
    }
    task.cancelRequested = true;
    this.cancelTaskInternal(task, opts.reason ?? 'client-cancel');
    return task.publicView();
  }

  retryTask(
    taskId: string,
    opts: {
      a2aExtensions: unknown;
      message?: Record<string, unknown>;
      execute?: boolean;
      fail?: boolean;
    },
  ): Record<string, unknown> {
    const prior = this.getTask(taskId);
    if (prior.state !== TaskState.FAILED && prior.state !== TaskState.CANCELED) {
      throw new A2AExtensionError(
        ERR_MALFORMED_EXTENSION,
        `retry only allowed from failed/canceled; got ${prior.state}`,
      );
    }
    const parentEvents = prior.lastEventCid ? [prior.lastEventCid] : [];
    let retryMessage = opts.message ? { ...opts.message } : null;
    if (!retryMessage) {
      retryMessage = {
        role: 'user',
        parts: [{ kind: 'text', text: `retry ${taskId}` }],
        metadata: namespacedMetadata({
          method: prior.metadata.method || 'repo.status',
          interface_cid: prior.metadata.interface_cid || this.interfaceCids[0],
        }),
      };
    }
    const view = this.sendMessage({
      message: retryMessage,
      a2aExtensions: opts.a2aExtensions,
      contextId: prior.contextId,
      execute: false,
      holdOpen: true,
      requestedProfiles: (prior.metadata.profiles as string[]) || ['A', 'B'],
    });
    const newId = String(view.id);
    const task = this.getTask(newId);
    task.attempt = prior.attempt + 1;
    task.parentEventCids = [...parentEvents];
    if (parentEvents.length) {
      const link = this.appendEvent({
        kind: 'task.retry',
        taskId: task.taskId,
        parents: [...parentEvents, ...(task.lastEventCid ? [task.lastEventCid] : [])],
        extra: {
          prior_task_id: prior.taskId,
          attempt: task.attempt,
          state: TaskState.WORKING,
        },
      });
      task.lastEventCid = link;
      task.metadata.event_cid = link;
      task.metadata.prior_task_id = prior.taskId;
    }
    if (opts.execute !== false) {
      if (opts.fail) {
        this.failTask(task, { code: 'EXECUTION_FAILED', message: 'retry failed' });
      } else {
        this.completeTask(task);
      }
    }
    return task.publicView();
  }

  *streamTask(taskId: string): Generator<Record<string, unknown>> {
    const task = this.getTask(taskId);
    for (const event of task.stream) {
      yield deepCopy(event);
    }
    yield {
      kind: task.isTerminal() ? 'terminal' : 'status',
      task_id: task.taskId,
      state: task.state,
      metadata: { ...task.metadata },
      attempt: task.attempt,
    };
  }

  terminalEvidence(taskId: string, opts: { portable?: boolean } = {}): Record<string, unknown> {
    const task = this.getTask(taskId);
    if (!task.isTerminal()) {
      throw new A2AExtensionError(
        ERR_MALFORMED_EXTENSION,
        `task ${taskId} is not terminal (${task.state})`,
      );
    }
    const portable = (opts.portable !== false) && task.state === TaskState.COMPLETED;
    const evidence: Record<string, unknown> = {
      schema: SCHEMA_TERMINAL_EVIDENCE,
      extension_uri: EXTENSION_URI,
      task_id: task.taskId,
      task_state: task.state,
      portable,
    };
    if (task.envelopeCid) evidence.envelope_cid = task.envelopeCid;
    if (task.resultCid) evidence.result_cid = task.resultCid;
    if (task.receiptCid) evidence.receipt_cid = task.receiptCid;
    if (task.lastEventCid) evidence.event_cid = task.lastEventCid;
    if (task.outputCid) evidence.output_cid = task.outputCid;
    if (task.error) evidence.error = deepCopy(task.error);
    raiseIfFailed(validateTerminalEvidence(evidence));
    return evidence;
  }

  eventLineage(taskId: string): string[] {
    const task = this.getTask(taskId);
    if (!task.lastEventCid) return [];
    return this.eventDag.getLineage(task.lastEventCid);
  }

  cancelEvents(taskId: string): Record<string, unknown>[] {
    const snapshot = this.eventDag.exportSnapshot();
    const out: Record<string, unknown>[] = [];
    for (const item of snapshot.events) {
      const payload = item.payload || {};
      if (payload.kind === 'task.canceled' && payload.task_id === taskId) {
        out.push(deepCopy(payload));
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// SwissKnifeA2AAdapter@1 facade
// ---------------------------------------------------------------------------

export class SwissKnifeA2AAdapter {
  static readonly interface = INTERFACE;
  static readonly extensionUri = EXTENSION_URI;
  static readonly workingAlias = WORKING_ALIAS;
  static readonly algorithm = CANONICALIZATION;
  static readonly taskId = TASK_ID;

  readonly interface = INTERFACE;
  readonly extensionUri = EXTENSION_URI;
  readonly workingAlias = WORKING_ALIAS;
  readonly algorithm = CANONICALIZATION;
  readonly taskId = TASK_ID;

  private readonly agents = new Map<string, A2AAgent>();

  createAgent(opts: {
    agentId?: string;
    name?: string;
    url?: string;
    did?: string;
    profiles?: string[];
    extensionRequired?: boolean;
    interfaceCids?: string[];
  } = {}): A2AAgent {
    const aid = opts.agentId || `agent-${randomBytes(4).toString('hex')}`;
    const agent = new A2AAgent({
      agentId: aid,
      name: opts.name || `SwissKnife MCP++ Agent ${aid}`,
      url: opts.url || `https://swissknife.local/a2a/${aid}`,
      did: opts.did || `did:key:swissknife-${aid}`,
      profiles: opts.profiles ?? [...DEFAULT_PROFILES],
      extensionRequired: opts.extensionRequired,
      interfaceCids: opts.interfaceCids,
    });
    this.agents.set(aid, agent);
    return agent;
  }

  getAgent(agentId: string): A2AAgent {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new A2AExtensionError(ERR_TASK_NOT_FOUND, `agent not found: ${agentId}`);
    }
    return agent;
  }

  validateAgentExtension(payload: unknown): ValidationResult {
    return validateAgentExtension(payload);
  }

  validateActivation(payload: unknown, opts?: { require_execution?: boolean }): ValidationResult {
    return validateActivation(payload, opts);
  }

  validateTaskMetadata(payload: unknown): ValidationResult {
    return validateTaskMetadata(payload);
  }

  validateTerminalEvidence(payload: unknown): ValidationResult {
    return validateTerminalEvidence(payload);
  }

  validateProfileRequest(
    advertised: string[],
    requested: string[],
    opts?: { extension_uri?: string },
  ): ValidationResult {
    return validateProfileRequest(advertised, requested, opts);
  }

  discover(server: A2AAgent): Record<string, unknown> {
    const card = server.agentCard();
    const extensions =
      ((card.capabilities as Record<string, unknown>)?.extensions as unknown[]) || [];
    if (!extensions.length) {
      throw new A2AExtensionError(ERR_UNSUPPORTED_EXTENSION, 'server Agent Card has no extensions');
    }
    raiseIfFailed(validateAgentExtension(extensions[0]));
    return card;
  }

  /**
   * Two-agent handoff: client discovers server Agent Card, activates the
   * execution extension, and completes an evidence-bearing Send Message.
   */
  handoff(
    client: A2AAgent,
    server: A2AAgent,
    opts: {
      text?: string;
      method?: string;
      requestedProfiles?: string[];
      a2aExtensions?: unknown;
      holdOpen?: boolean;
      fail?: boolean;
      execute?: boolean;
      contextId?: string;
    } = {},
  ): Record<string, unknown> {
    if (client.agentId === server.agentId && client === server) {
      throw new A2AExtensionError(
        ERR_MALFORMED_EXTENSION,
        'handoff requires two independently instantiated agents',
      );
    }

    const card = this.discover(server);
    const extensions = opts.a2aExtensions ?? [EXTENSION_URI];
    const method = opts.method ?? 'repo.status';
    const requestedProfiles = opts.requestedProfiles ?? ['A', 'B'];

    const message: Record<string, unknown> = {
      role: 'user',
      messageId: `msg-${randomBytes(6).toString('hex')}`,
      parts: [{ kind: 'text', text: opts.text ?? 'run repo.status' }],
      metadata: namespacedMetadata({
        method,
        interface_cid: server.interfaceCids[0],
        profiles: requestedProfiles,
      }),
      from: client.did,
    };
    if (opts.contextId) message.contextId = opts.contextId;

    const taskView = server.sendMessage({
      message,
      a2aExtensions: extensions,
      contextId: opts.contextId,
      requestedProfiles,
      execute: opts.execute !== false,
      fail: opts.fail,
      holdOpen: opts.holdOpen,
    });

    const result: Record<string, unknown> = {
      interface: INTERFACE,
      reference_interface: REFERENCE_INTERFACE,
      extension_uri: EXTENSION_URI,
      client_agent_id: client.agentId,
      server_agent_id: server.agentId,
      client_did: client.did,
      server_did: server.did,
      agent_card_name: card.name,
      task: taskView,
      activated_extensions: parseA2AExtensionsHeader(extensions),
      runtime: 'swissknife',
    };

    const state = ((taskView.status as Record<string, unknown>) || {}).state;
    if (typeof state === 'string' && TERMINAL_TASK_STATES.has(state)) {
      const portable = state === TaskState.COMPLETED;
      let evidence: Record<string, unknown>;
      try {
        evidence = server.terminalEvidence(String(taskView.id), { portable });
      } catch {
        evidence = server.terminalEvidence(String(taskView.id), { portable: false });
      }
      result.terminal_evidence = evidence;
      result.event_lineage = server.eventLineage(String(taskView.id));
    }
    return result;
  }

  cancel(
    server: A2AAgent,
    taskId: string,
    opts: { reason?: string } = {},
  ): Record<string, unknown> {
    const view = server.cancelTask(taskId, { reason: opts.reason ?? 'client-cancel' });
    return {
      task: view,
      cancel_events: server.cancelEvents(taskId),
      durable_cancels: Object.fromEntries(server.durableCancels),
      event_lineage: server.eventLineage(taskId),
    };
  }
}

/** Factory matching SwissKnife adapter naming conventions. */
export function createSwissKnifeA2AAdapter(): SwissKnifeA2AAdapter {
  return new SwissKnifeA2AAdapter();
}

export default SwissKnifeA2AAdapter;
