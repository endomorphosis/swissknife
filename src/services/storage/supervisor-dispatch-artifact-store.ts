/**
 * Browser-safe persistence for governed Agent Supervisor dispatch evidence.
 *
 * The store deliberately knows nothing about a Kubo HTTP API, the filesystem,
 * or backend credentials.  A Helia-compatible adapter and any kit/Kubo peers
 * are injected by the browser integration.  This makes the policy boundary
 * enforceable in browser builds while retaining CID exchange interoperability.
 */

import { sha256Hex } from '../shared/shared-browser-crypto.js';

export const SUPERVISOR_DISPATCH_ARTIFACT_SCHEMA =
  'swissknife.supervisor-dispatch-artifact.v1' as const;
export const SUPERVISOR_DISPATCH_MANIFEST_SCHEMA =
  'swissknife.supervisor-dispatch-manifest.v1' as const;
export const SUPERVISOR_DISPATCH_CHECKPOINT_SCHEMA =
  'swissknife.supervisor-dispatch-event-dag-checkpoint.v1' as const;

export type SupervisorDispatchArtifactKind =
  | 'goal'
  | 'task'
  | 'receipt'
  | 'event_dag_checkpoint'
  | 'dispatch_manifest';
export type SupervisorDispatchRetention = 'ephemeral' | 'session' | 'pinned' | 'policy_controlled';
export type SupervisorDispatchStorageState = 'stored' | 'denied' | 'unavailable';
export type SupervisorDispatchRetrievalState = 'found' | 'not_found' | 'denied' | 'unavailable';
export type SupervisorDispatchBackend = 'helia' | 'approved-peer' | 'cache' | 'none';
export type SupervisorDispatchPeerKind = 'kit' | 'kubo';

export interface SupervisorDispatchHeliaAdapter {
  /** Persist canonical artifact bytes. The adapter must preserve the requested CID. */
  put(bytes: Uint8Array, options: { cid: string; pin: boolean }): Promise<{ cid: string }>;
  /** Resolve canonical artifact bytes from the browser-safe Helia path. */
  get(cid: string): Promise<Uint8Array | string | unknown>;
}

export interface SupervisorDispatchApprovedPeer {
  id: string;
  kind: SupervisorDispatchPeerKind;
  /** Approval is supplied by a trusted policy/discovery layer, never the payload. */
  approved: boolean;
  get(cid: string): Promise<Uint8Array | string | unknown>;
}

export interface SupervisorDispatchArtifactPolicy {
  /** Persistence is fail-closed unless this is true. */
  allow_persistence: boolean;
  /** Only these artifacts may cross the persistence boundary. */
  allowed_kinds?: readonly SupervisorDispatchArtifactKind[];
  retention: SupervisorDispatchRetention;
  /** Pinning is allowed only for pinned or policy-controlled retention. */
  allow_pin?: boolean;
  /** Allows an in-memory redacted cache when Helia/peers are unavailable. */
  allow_cache_fallback?: boolean;
  /** Policy-approved remote peer IDs eligible for compatible retrieval. */
  approved_peer_ids?: readonly string[];
  /** Defaults to true. A caller cannot persist an unredacted dispatch accidentally. */
  require_redaction?: boolean;
  /** Recorded policy intent; governed dispatch persistence still always requires a receipt. */
  require_receipt?: boolean;
  /** Recorded policy intent; governed dispatch persistence still always requires an event-DAG checkpoint. */
  require_event_dag?: boolean;
}

export interface SupervisorDispatchArtifactInput {
  dispatch_id: string;
  correlation_id: string;
  goal: unknown;
  task: unknown;
  receipt: unknown;
  event_dag: {
    event_id?: string;
    parents?: readonly string[];
    events?: unknown;
    compaction_certificate_cid?: string;
    archive_cid?: string;
    [key: string]: unknown;
  };
  /** A policy CID or equivalent immutable policy reference. */
  policy_cid: string;
  policy_outcome: 'permit' | 'deny' | 'require_confirmation';
}

export interface SupervisorDispatchArtifactReference {
  kind: SupervisorDispatchArtifactKind;
  cid: string;
  retention: SupervisorDispatchRetention;
  pinned: boolean;
  redacted: true;
  redacted_paths: readonly string[];
  created_at: string;
  compaction_certificate_cid?: string;
  archive_cid?: string;
}

export interface SupervisorDispatchPersistResult {
  state: SupervisorDispatchStorageState;
  reason?: string;
  dispatch_cid?: string;
  artifacts: Partial<Record<SupervisorDispatchArtifactKind, SupervisorDispatchArtifactReference>>;
  cache_fallback_used: boolean;
}

export interface SupervisorDispatchRetrieveResult<T = unknown> {
  state: SupervisorDispatchRetrievalState;
  reason?: string;
  cid: string;
  kind?: SupervisorDispatchArtifactKind;
  backend: SupervisorDispatchBackend;
  peer_id?: string;
  verified: boolean;
  value?: T;
  reference?: SupervisorDispatchArtifactReference;
}

export interface SupervisorDispatchArtifactStoreOptions {
  helia?: SupervisorDispatchHeliaAdapter;
  peers?: readonly SupervisorDispatchApprovedPeer[];
  now?: () => Date;
}

interface EncodedArtifact {
  cid: string;
  bytes: Uint8Array;
  value: Record<string, unknown>;
  reference: SupervisorDispatchArtifactReference;
}

const SECRET_KEY = /(?:^|_)(password|passphrase|secret|token|authorization|credential|cookie|api_?key|private_?key|access_?key)(?:$|_)/i;
const REDACTED = '[REDACTED]';

/** A content-addressed, policy-gated artifact store for supervisor dispatches. */
export class SupervisorDispatchArtifactStore {
  private readonly cache = new Map<string, EncodedArtifact>();
  private readonly now: () => Date;

  constructor(private readonly options: SupervisorDispatchArtifactStoreOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  async persist(input: SupervisorDispatchArtifactInput, policy: SupervisorDispatchArtifactPolicy): Promise<SupervisorDispatchPersistResult> {
    const invalid = validateInput(input, policy);
    if (invalid) return { state: 'denied', reason: invalid, artifacts: {}, cache_fallback_used: false };
    if (!policy.allow_persistence) {
      return { state: 'denied', reason: 'Persistence is not permitted by the dispatch policy.', artifacts: {}, cache_fallback_used: false };
    }

    const createdAt = this.now().toISOString();
    const artifacts: EncodedArtifact[] = [];
    const refs: Partial<Record<SupervisorDispatchArtifactKind, SupervisorDispatchArtifactReference>> = {};
    try {
      for (const [kind, payload] of [
        ['goal', input.goal], ['task', input.task], ['receipt', input.receipt],
      ] as const) {
        const encoded = this.encodeArtifact(kind, input, payload, createdAt, policy);
        await this.store(encoded, policy);
        artifacts.push(encoded);
        refs[kind] = encoded.reference;
      }
      const goalReference = refs.goal;
      const taskReference = refs.task;
      const receiptReference = refs.receipt;
      if (!goalReference || !taskReference || !receiptReference) {
        throw new Error('The required governed-dispatch artifacts could not be prepared.');
      }

      const checkpointPayload = {
        ...input.event_dag,
        schema: SUPERVISOR_DISPATCH_CHECKPOINT_SCHEMA,
        dispatch_id: input.dispatch_id,
        correlation_id: input.correlation_id,
        policy_cid: input.policy_cid,
        policy_outcome: input.policy_outcome,
        receipt_cid: receiptReference.cid,
        goal_cid: goalReference.cid,
        task_cid: taskReference.cid,
        parents: uniqueStrings([...(input.event_dag.parents ?? []), receiptReference.cid]),
      };
      const checkpoint = this.encodeArtifact('event_dag_checkpoint', input, checkpointPayload, createdAt, policy);
      await this.store(checkpoint, policy);
      artifacts.push(checkpoint);
      refs.event_dag_checkpoint = checkpoint.reference;

      const manifestPayload = {
        schema: SUPERVISOR_DISPATCH_MANIFEST_SCHEMA,
        dispatch_id: input.dispatch_id,
        correlation_id: input.correlation_id,
        policy_cid: input.policy_cid,
        policy_outcome: input.policy_outcome,
        artifacts: artifactReferences(refs).map(reference => ({
          kind: reference.kind,
          cid: reference.cid,
          retention: reference.retention,
          compaction_certificate_cid: reference.compaction_certificate_cid,
          archive_cid: reference.archive_cid,
        })).sort((left, right) => left.kind.localeCompare(right.kind)),
      };
      const manifest = this.encodeArtifact('dispatch_manifest', input, manifestPayload, createdAt, policy);
      await this.store(manifest, policy);
      artifacts.push(manifest);
      refs.dispatch_manifest = manifest.reference;
      // A cache entry is useful only when it represents a completed governed
      // dispatch.  Caching while the Helia write sequence is incomplete could
      // otherwise make a partial artifact set look retrievable.
      if (policy.allow_cache_fallback) {
        for (const artifact of artifacts) this.cache.set(artifact.cid, artifact);
      }
      return {
        state: 'stored', dispatch_cid: manifest.cid, artifacts: refs,
        cache_fallback_used: false,
      };
    } catch (error) {
      return {
        state: 'unavailable',
        reason: error instanceof Error ? error.message : 'The browser Helia artifact path is unavailable.',
        artifacts: refs,
        cache_fallback_used: false,
      };
    }
  }

  async retrieve<T = unknown>(
    cid: string,
    policy: Pick<SupervisorDispatchArtifactPolicy, 'allow_persistence' | 'allow_cache_fallback' | 'approved_peer_ids'>,
  ): Promise<SupervisorDispatchRetrieveResult<T>> {
    if (!isContentCid(cid)) {
      return { state: 'denied', reason: 'A valid content CID is required for retrieval.', cid, backend: 'none', verified: false };
    }
    if (!policy.allow_persistence) {
      return { state: 'denied', reason: 'Retrieval is not permitted by the dispatch policy.', cid, backend: 'none', verified: false };
    }
    let attempted = false;
    let unavailable = false;
    const helia = this.options.helia;
    const local = await this.readFrom('helia', cid, helia ? () => helia.get(cid) : undefined);
    attempted ||= local.attempted;
    unavailable ||= local.unavailable;
    if (local.result) return local.result as SupervisorDispatchRetrieveResult<T>;

    for (const peer of this.options.peers ?? []) {
      if (!isApprovedPeer(peer, policy)) continue;
      const remote = await this.readFrom('approved-peer', cid, () => peer.get(cid), peer.id);
      attempted ||= remote.attempted;
      unavailable ||= remote.unavailable;
      if (remote.result) return remote.result as SupervisorDispatchRetrieveResult<T>;
    }

    if (policy.allow_cache_fallback) {
      const cached = this.cache.get(cid);
      if (cached) {
        return {
          state: 'found', cid, kind: cached.reference.kind, backend: 'cache', verified: true,
          value: cached.value as T, reference: cached.reference,
        };
      }
    }
    if (!attempted || unavailable) {
      return { state: 'unavailable', reason: 'The browser Helia path and approved retrieval peers are unavailable.', cid, backend: 'none', verified: false };
    }
    return { state: 'not_found', reason: 'CID was not present in the browser Helia path or approved peers.', cid, backend: 'none', verified: false };
  }

  async retrieveDispatch(
    dispatchCid: string,
    policy: Pick<SupervisorDispatchArtifactPolicy, 'allow_persistence' | 'allow_cache_fallback' | 'approved_peer_ids'>,
  ): Promise<SupervisorDispatchRetrieveResult<Record<string, unknown>>> {
    const result = await this.retrieve<Record<string, unknown>>(dispatchCid, policy);
    if (result.state !== 'found') return result;
    const payload = result.value?.payload as Record<string, unknown> | undefined;
    if (result.kind !== 'dispatch_manifest' || payload?.schema !== SUPERVISOR_DISPATCH_MANIFEST_SCHEMA) {
      return { ...result, state: 'denied', reason: 'CID does not identify a supervisor dispatch manifest.' };
    }
    return result;
  }

  clearCache(): void {
    this.cache.clear();
  }

  private encodeArtifact(
    kind: SupervisorDispatchArtifactKind,
    input: SupervisorDispatchArtifactInput,
    payload: unknown,
    createdAt: string,
    policy: SupervisorDispatchArtifactPolicy,
  ): EncodedArtifact {
    const redaction = redact(payload);
    const body = {
      schema: SUPERVISOR_DISPATCH_ARTIFACT_SCHEMA,
      kind,
      dispatch_id: input.dispatch_id,
      correlation_id: input.correlation_id,
      policy_cid: input.policy_cid,
      policy_outcome: input.policy_outcome,
      created_at: createdAt,
      retention: policy.retention,
      pinned: shouldPin(policy),
      redacted: true as const,
      redacted_paths: redaction.paths,
      payload: redaction.value,
    };
    const bytes = encodeCanonical(body);
    const cid = cidForBytes(bytes);
    const eventDag = kind === 'event_dag_checkpoint' ? redaction.value as Record<string, unknown> : undefined;
    return {
      cid, bytes, value: body,
      reference: {
        kind, cid, retention: policy.retention, pinned: shouldPin(policy), redacted: true,
        redacted_paths: redaction.paths, created_at: createdAt,
        compaction_certificate_cid: stringValue(eventDag?.compaction_certificate_cid),
        archive_cid: stringValue(eventDag?.archive_cid),
      },
    };
  }

  private async store(artifact: EncodedArtifact, policy: SupervisorDispatchArtifactPolicy): Promise<void> {
    if (!isAllowedKind(artifact.reference.kind, policy)) {
      throw new Error(`${artifact.reference.kind} persistence is not permitted by the dispatch policy.`);
    }
    if (!this.options.helia) throw new Error('The browser-safe Helia artifact path is unavailable.');
    const stored = await this.options.helia.put(artifact.bytes, { cid: artifact.cid, pin: artifact.reference.pinned });
    if (!stored || stored.cid !== artifact.cid) {
      throw new Error('Helia returned a CID that does not match the canonical dispatch artifact.');
    }
  }

  private async readFrom(
    backend: SupervisorDispatchBackend,
    cid: string,
    get: (() => Promise<Uint8Array | string | unknown>) | undefined,
    peerId?: string,
  ): Promise<{ result?: SupervisorDispatchRetrieveResult; attempted: boolean; unavailable: boolean }> {
    if (!get) return { attempted: false, unavailable: false };
    try {
      const bytes = toBytes(await get());
      if (!bytes || !cidMatches(cid, bytes)) return { attempted: true, unavailable: false };
      const value = parseCanonical(bytes);
      if (!isStoredArtifact(value)) return { attempted: true, unavailable: false };
      const reference = referenceFromValue(cid, value);
      if (!reference) return { attempted: true, unavailable: false };
      return { result: { state: 'found', cid, kind: reference.kind, backend, peer_id: peerId, verified: true, value, reference }, attempted: true, unavailable: false };
    } catch {
      return { attempted: true, unavailable: true };
    }
  }
}

export function createSupervisorDispatchArtifactStore(options: SupervisorDispatchArtifactStoreOptions = {}): SupervisorDispatchArtifactStore {
  return new SupervisorDispatchArtifactStore(options);
}

/** Deterministic CID used by this browser-safe artifact envelope format. */
export function supervisorDispatchArtifactCid(value: unknown): string {
  return cidForBytes(encodeCanonical(value));
}

function validateInput(input: SupervisorDispatchArtifactInput, policy: SupervisorDispatchArtifactPolicy): string | undefined {
  if (!input.dispatch_id || !input.correlation_id || !input.policy_cid) return 'Dispatch ID, correlation ID, and policy CID are required.';
  if (!isContentCid(input.policy_cid)) return 'The governing policy reference must be a content CID.';
  if (input.policy_outcome !== 'permit') return 'Only policy-permitted dispatches may persist artifacts.';
  if (input.goal === undefined || input.task === undefined) return 'Goal and task artifacts are required for a governed dispatch.';
  if (input.receipt === undefined) return 'A receipt is required before dispatch persistence.';
  if (input.event_dag === undefined) return 'An event-DAG checkpoint is required before dispatch persistence.';
  if (![input.goal, input.task, input.receipt, input.event_dag].every(value => isCanonicalJsonValue(value))) {
    return 'Governed-dispatch artifacts must contain finite, acyclic JSON-compatible values.';
  }
  if (policy.require_redaction !== false && !redact(input).redacted) return 'Redaction is required by policy.';
  const requiredKinds: SupervisorDispatchArtifactKind[] = ['goal', 'task', 'receipt', 'event_dag_checkpoint', 'dispatch_manifest'];
  const allowedKinds = policy.allowed_kinds;
  if (allowedKinds && requiredKinds.some(kind => !allowedKinds.includes(kind))) {
    return 'The dispatch policy must permit every required governed-dispatch artifact kind.';
  }
  if (!isRetention(policy.retention)) return 'The dispatch retention policy is invalid.';
  const parents = input.event_dag.parents;
  if (parents !== undefined && (!Array.isArray(parents) || !parents.every(isContentCid))) {
    return 'Event-DAG parent references must be content CIDs.';
  }
  const dagRefs = [input.event_dag.compaction_certificate_cid, input.event_dag.archive_cid]
    .filter((value): value is string => value !== undefined);
  if (!dagRefs.every(isContentCid)) return 'Event-DAG archive and compaction certificate references must be content CIDs.';
  return undefined;
}

function isAllowedKind(kind: SupervisorDispatchArtifactKind, policy: SupervisorDispatchArtifactPolicy): boolean {
  return !policy.allowed_kinds || policy.allowed_kinds.includes(kind);
}

function shouldPin(policy: SupervisorDispatchArtifactPolicy): boolean {
  return policy.allow_pin === true && (policy.retention === 'pinned' || policy.retention === 'policy_controlled');
}

function isApprovedPeer(peer: SupervisorDispatchApprovedPeer, policy: Pick<SupervisorDispatchArtifactPolicy, 'approved_peer_ids'>): boolean {
  return peer.approved && (policy.approved_peer_ids?.includes(peer.id) ?? false);
}

function redact(value: unknown, path = '$'): { value: unknown; paths: string[]; redacted: boolean } {
  if (Array.isArray(value)) {
    const items = value.map((item, index) => redact(item, `${path}[${index}]`));
    return { value: items.map(item => item.value), paths: items.flatMap(item => item.paths), redacted: items.every(item => item.redacted) };
  }
  if (value !== null && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    const paths: string[] = [];
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const nextPath = `${path}.${key}`;
      if (isSensitiveKey(key)) {
        output[key] = REDACTED;
        paths.push(nextPath);
      } else {
        const nested = redact((value as Record<string, unknown>)[key], nextPath);
        output[key] = nested.value;
        paths.push(...nested.paths);
      }
    }
    return { value: output, paths, redacted: true };
  }
  return { value, paths: [], redacted: true };
}

/**
 * Normalize common JavaScript property spellings before applying the redaction
 * policy.  Dispatch payloads often originate in JSON (snake_case), but UI and
 * SDK callers commonly use camelCase.  Both forms must have identical privacy
 * treatment at the storage boundary.
 */
function isSensitiveKey(key: string): boolean {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
  return SECRET_KEY.test(normalized);
}

function isCanonicalJsonValue(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;

  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.every(item => isCanonicalJsonValue(item, ancestors));
    return Object.keys(value as Record<string, unknown>)
      .every(key => isCanonicalJsonValue((value as Record<string, unknown>)[key], ancestors));
  } catch {
    return false;
  } finally {
    ancestors.delete(value);
  }
}

function encodeCanonical(value: unknown): Uint8Array {
  return new TextEncoder().encode(stableStringify(value));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().filter(key => record[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function cidForBytes(bytes: Uint8Array): string {
  return `sha256:${sha256Hex(bytes)}`;
}

function isContentCid(cid: string): boolean {
  return /^sha256:[0-9a-f]{64}$/.test(cid) || /^b[a-z2-7]{20,}$/i.test(cid);
}

function cidMatches(cid: string, bytes: Uint8Array): boolean {
  // Browser-safe dispatch artifacts use sha256 CIDs. Other IPFS CID forms may
  // be linked in a checkpoint, but are never treated as verified payloads here.
  return cid.startsWith('sha256:') && cidForBytes(bytes) === cid;
}

function toBytes(value: Uint8Array | string | unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value && typeof value === 'object') return encodeCanonical(value);
  return undefined;
}

function parseCanonical(bytes: Uint8Array): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function isStoredArtifact(value: Record<string, unknown> | undefined): value is Record<string, unknown> {
  return value?.schema === SUPERVISOR_DISPATCH_ARTIFACT_SCHEMA && typeof value.kind === 'string' && value.redacted === true;
}

function referenceFromValue(cid: string, value: Record<string, unknown>): SupervisorDispatchArtifactReference | undefined {
  if (!isArtifactKind(value.kind) || typeof value.created_at !== 'string' || !Array.isArray(value.redacted_paths)) return undefined;
  const payload = value.payload as Record<string, unknown> | undefined;
  return {
    kind: value.kind, cid,
    retention: isRetention(value.retention) ? value.retention : 'policy_controlled',
    pinned: value.pinned === true,
    redacted: true,
    redacted_paths: value.redacted_paths.filter((path): path is string => typeof path === 'string'), created_at: value.created_at,
    compaction_certificate_cid: value.kind === 'event_dag_checkpoint' ? stringValue(payload?.compaction_certificate_cid) : undefined,
    archive_cid: value.kind === 'event_dag_checkpoint' ? stringValue(payload?.archive_cid) : undefined,
  };
}

function isArtifactKind(value: unknown): value is SupervisorDispatchArtifactKind {
  return value === 'goal' || value === 'task' || value === 'receipt' || value === 'event_dag_checkpoint' || value === 'dispatch_manifest';
}

function isRetention(value: unknown): value is SupervisorDispatchRetention {
  return value === 'ephemeral' || value === 'session' || value === 'pinned' || value === 'policy_controlled';
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter(value => typeof value === 'string' && value.length > 0))].sort();
}

function artifactReferences(
  references: Partial<Record<SupervisorDispatchArtifactKind, SupervisorDispatchArtifactReference>>,
): SupervisorDispatchArtifactReference[] {
  return Object.values(references).filter(
    (reference): reference is SupervisorDispatchArtifactReference => reference !== undefined,
  );
}
