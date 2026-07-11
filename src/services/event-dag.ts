/**
 * Event DAG Provenance (MCP++ Event DAG + Ordering)
 *
 * Implements:
 *  - `EventNode` type     — per MCP++ event-dag-ordering.md
 *  - `appendEvent()`      — content-address node, link to parents
 *  - `traverseDAG()`      — causal walk from tip to roots
 *  - `getProvenance()`    — find the chain of events that produced an output_cid
 *
 * References: docs/spec/event-dag-ordering.md in endomorphosis/Mcp-Plus-Plus
 */

import { createHash, type BinaryLike } from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single node in the causal event DAG.
 * Each node commits to everything needed to deterministically replay the event.
 */
export interface EventNode {
  /** CID of the intent (what was requested) */
  intent_cid: string;
  /** CID of the interface descriptor used */
  interface_cid: string;
  /** Array of UCAN proof CIDs authorising the event */
  proofs: string[];
  /** CID of the policy decision (from temporal deontic evaluation) */
  decision_cid?: string;
  /** Outcome of the policy decision, if known */
  decision_outcome?: 'PERMIT' | 'DENY' | 'OBLIGATION_SPAWNED';
  /** Whether any spawned obligation was overdue at event time */
  obligation_overdue?: boolean;
  /** CID(s) of the output(s) produced */
  outputs: string[];
  /** Parent event CIDs — establishes causal order without global consensus */
  parents: string[];
  /** ISO-8601 wall-clock timestamp (informational; not used for ordering) */
  timestamp: string;
  /** Optional: CID of the envelope that triggered this event */
  envelope_cid?: string;
  /** Optional: correlation identifier shared by commands, receipts, streams, and workflow steps */
  correlation_id?: string;
  /** Optional: operation or workflow step name for audit display */
  operation?: string;
  /** Optional: receipt CID emitted by an ORB invocation */
  receipt_cid?: string;
  /** Optional: artifact CIDs referenced by this event */
  artifact_cids?: string[];
  /** Optional: provenance references emitted by an ORB receipt or backend event */
  provenance_refs?: string[];
}

/** A stored event node with its computed CID */
export interface StoredEventNode extends EventNode {
  /** Content identifier of this event node */
  cid: string;
}

/** Named MCP++ Profile F contract retained by local TypeScript callers. */
export const MCPPP_PROFILE_F = {
  capability: 'mcp++/event-dag',
  name: 'Profile F: Event DAG Provenance, Archival, and Compaction',
} as const;

export interface EventDAGRetentionOptions {
  hotEventMax?: number;
  epochSize?: number;
  autoCompact?: boolean;
}

export interface EventDAGCompactionCertificate {
  certificate_cid: string;
  archive_cid: string;
  merkle_root: string;
  epoch_id: number;
  event_count: number;
  root_cids: string[];
  frontier_cids: string[];
  proof_system: 'hash-commitment-v1';
  zero_knowledge: false;
  proof: string;
}

export interface EventDAGArchive {
  archive_cid: string;
  event_cids: string[];
  events: StoredEventNode[];
  merkle_layers: string[][];
  certificate: EventDAGCompactionCertificate;
}

export interface BoundedProvenance {
  events: StoredEventNode[];
  archive_boundaries: Array<{ event_cid: string; archive_cid: string; certificate_cid: string }>;
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + (value as unknown[]).map(canonicalJSON).join(',') + ']';
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .filter(k => (value as Record<string, unknown>)[k] !== undefined)
      .map(
        k =>
          `${JSON.stringify(k)}:${canonicalJSON((value as Record<string, unknown>)[k])}`,
      )
      .join(',') +
    '}'
  );
}

function computeCID(data: string | Buffer): string {
  const input = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return `sha256:${createHash('sha256').update(input as unknown as BinaryLike).digest('hex')}`;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value! > 0 ? value! : fallback;
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value! >= 0 ? value! : fallback;
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function buildMerkleTree(cids: string[]): { root: string; layers: string[][] } {
  if (cids.length === 0) return { root: hashText('empty'), layers: [[]] };
  let current = cids.map(hashText);
  const layers = [current];
  while (current.length > 1) {
    const next: string[] = [];
    for (let index = 0; index < current.length; index += 2) {
      next.push(hashText(`${current[index]}${current[index + 1] ?? current[index]}`));
    }
    current = next;
    layers.push(current);
  }
  return { root: current[0], layers };
}

function merkleProof(eventCid: string, eventCids: string[], layers: string[][]): Array<{ side: 'left' | 'right'; hash: string }> {
  let index = eventCids.indexOf(eventCid);
  if (index < 0) return [];
  const proof: Array<{ side: 'left' | 'right'; hash: string }> = [];
  for (const layer of layers.slice(0, -1)) {
    if (index % 2 === 1) {
      proof.push({ side: 'left', hash: layer[index - 1] });
    } else {
      proof.push({ side: 'right', hash: layer[Math.min(index + 1, layer.length - 1)] });
    }
    index = Math.floor(index / 2);
  }
  return proof;
}

/** Verify a Profile F Merkle inclusion proof without loading an archive's other events. */
export function verifyEventDAGInclusionProof(
  eventCid: string,
  proof: Array<{ side: 'left' | 'right'; hash: string }>,
  merkleRoot: string,
): boolean {
  let current = hashText(eventCid);
  for (const step of proof) {
    current = step.side === 'left'
      ? hashText(`${step.hash}${current}`)
      : hashText(`${current}${step.hash}`);
  }
  return current === merkleRoot;
}

// ---------------------------------------------------------------------------
// EventDAG
// ---------------------------------------------------------------------------

export class EventDAG {
  /** Primary index: cid → StoredEventNode */
  private byCid: Map<string, StoredEventNode> = new Map();
  /** Secondary index: output_cid → [event cid, ...] (one output may appear in multiple events) */
  private byOutput: Map<string, string[]> = new Map();
  /** Secondary index: correlation_id → [event cid, ...] */
  private byCorrelation: Map<string, string[]> = new Map();
  /** Secondary index: artifact CID → [event cid, ...] */
  private byArtifact: Map<string, string[]> = new Map();
  /** Most-recently appended event CIDs (tips of the DAG) */
  private tips: Set<string> = new Set();
  /** Compacted archive records. The Node adapter persists equivalent records to disk/IPFS. */
  private archives: Map<string, EventDAGArchive> = new Map();
  /** Archived event CID → archive/certificate boundary. */
  private archivedEvents: Map<string, { archive_cid: string; certificate_cid: string }> = new Map();
  private readonly hotEventMax: number;
  private readonly epochSize: number;
  private readonly autoCompact: boolean;

  constructor(options: EventDAGRetentionOptions = {}) {
    this.hotEventMax = positiveInteger(options.hotEventMax, 2000);
    this.epochSize = positiveInteger(options.epochSize, 1000);
    this.autoCompact = options.autoCompact !== false;
  }

  // -------------------------------------------------------------------------
  // Append
  // -------------------------------------------------------------------------

  /**
   * Append an event to the DAG.
   *
   * The node is deterministically content-addressed from its fields
   * (excluding `timestamp` to ensure stable CIDs in tests — timestamp is
   * included in the canonical form so it does affect the CID, but this is
   * intentional for provenance accuracy).
   *
   * @returns The CID of the stored event.
   */
  appendEvent(node: EventNode): string {
    const canonical = canonicalJSON(node);
    const cid = computeCID(canonical);

    const stored: StoredEventNode = { ...node, cid };
    this.byCid.set(cid, stored);

    // Update output index
    for (const outputCid of node.outputs) {
      if (!this.byOutput.has(outputCid)) {
        this.byOutput.set(outputCid, []);
      }
      this.byOutput.get(outputCid)!.push(cid);
    }
    if (node.correlation_id) {
      appendIndex(this.byCorrelation, node.correlation_id, cid);
    }
    for (const artifactCid of node.artifact_cids ?? []) {
      appendIndex(this.byArtifact, artifactCid, cid);
    }

    // Update tips: this event is a new tip; its parents are no longer tips
    this.tips.add(cid);
    for (const parentCid of node.parents) {
      this.tips.delete(parentCid);
    }

    if (this.autoCompact && this.byCid.size > this.hotEventMax) {
      this.compact({
        maxEvents: this.epochSize,
        retainRecent: Math.max(0, this.hotEventMax - this.epochSize),
      });
    }

    return cid;
  }

  // -------------------------------------------------------------------------
  // Traversal
  // -------------------------------------------------------------------------

  /**
   * Traverse the DAG from `tipCid` back to the root(s), visiting each node
   * in reverse-causal order (tip first, then parents, etc.).
   *
   * Uses iterative BFS to avoid stack overflows on long chains.
   *
   * @returns Array of StoredEventNodes in traversal order (tip → roots).
   */
  traverseDAG(tipCid: string): StoredEventNode[] {
    const visited = new Set<string>();
    const result: StoredEventNode[] = [];
    const queue: string[] = [tipCid];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const node = this.byCid.get(current);
      if (!node) continue; // unknown CID — skip

      result.push(node);
      for (const parentCid of node.parents) {
        if (!visited.has(parentCid)) {
          queue.push(parentCid);
        }
      }
    }

    return result;
  }

  /**
   * Return all event nodes that are currently at the frontier (tips) of the DAG.
   * These are nodes with no known descendants.
   */
  getTips(): StoredEventNode[] {
    return Array.from(this.tips)
      .map(cid => this.byCid.get(cid))
      .filter((n): n is StoredEventNode => n !== undefined);
  }

  // -------------------------------------------------------------------------
  // Provenance
  // -------------------------------------------------------------------------

  /**
   * Return the causal chain of event nodes that produced `outputCid`.
   *
   * Traverses backward from each event that lists `outputCid` in its `outputs`
   * field, collecting all ancestors.
   *
   * @returns Array of StoredEventNodes in reverse-causal order (newest first).
   */
  getProvenance(outputCid: string): StoredEventNode[] {
    const eventCids = this.byOutput.get(outputCid) ?? [];
    if (eventCids.length === 0) return [];

    const seen = new Set<string>();
    const result: StoredEventNode[] = [];

    for (const eventCid of eventCids) {
      const chain = this.traverseDAG(eventCid);
      for (const node of chain) {
        if (!seen.has(node.cid)) {
          seen.add(node.cid);
          result.push(node);
        }
      }
    }

    return result;
  }

  /**
   * Return all causally linked nodes associated with a correlation_id.
   */
  getCorrelationLineage(correlationId: string): StoredEventNode[] {
    return this.collectLineage(this.byCorrelation.get(correlationId) ?? []);
  }

  /**
   * Return lineage for an artifact CID whether it was stored in outputs or artifact_cids.
   */
  getArtifactLineage(artifactCid: string): StoredEventNode[] {
    const cids = [
      ...(this.byOutput.get(artifactCid) ?? []),
      ...(this.byArtifact.get(artifactCid) ?? []),
    ];
    return this.collectLineage(cids);
  }

  // -------------------------------------------------------------------------
  // Lookup helpers
  // -------------------------------------------------------------------------

  getByOutputCid(outputCid: string): StoredEventNode[] {
    return (this.byOutput.get(outputCid) ?? [])
      .map(cid => this.byCid.get(cid))
      .filter((n): n is StoredEventNode => n !== undefined);
  }

  getNode(cid: string): StoredEventNode | null {
    return this.byCid.get(cid) ?? null;
  }

  size(): number {
    return this.byCid.size;
  }

  /** Profile F metadata for UI and negotiation surfaces. */
  profileMetadata(): Record<string, unknown> {
    return {
      ...MCPPP_PROFILE_F,
      retention: { hot_event_max: this.hotEventMax, epoch_size: this.epochSize },
      certificate_policy: {
        default_proof_system: 'hash-commitment-v1',
        zero_knowledge: false,
        note: 'A hash commitment proves archive integrity, not zero knowledge.',
      },
    };
  }

  /** Compact oldest hot events into an archive and Merkle-backed certificate. */
  compact(options: { maxEvents?: number; retainRecent?: number } = {}): EventDAGArchive | null {
    const retainRecent = nonNegativeInteger(options.retainRecent, 0);
    const maxEvents = positiveInteger(options.maxEvents, this.epochSize);
    const ordered = [...this.byCid.values()].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    const eligible = Math.max(0, ordered.length - retainRecent);
    const events = ordered.slice(0, Math.min(maxEvents, eligible));
    if (events.length === 0) return null;

    const eventCids = events.map(event => event.cid);
    const selected = new Set(eventCids);
    const roots = events
      .filter(event => !event.parents.some(parent => selected.has(parent)))
      .map(event => event.cid);
    const frontier = events
      .filter(event => ![...this.byCid.values()].some(candidate => selected.has(candidate.cid) && candidate.parents.includes(event.cid)))
      .map(event => event.cid);
    const merkle = buildMerkleTree(eventCids);
    const archivePayload = {
      schema: 'mcp++/event-dag-archive@1',
      profile: MCPPP_PROFILE_F.capability,
      event_cids: eventCids,
      events,
      merkle_root: merkle.root,
      merkle_layers: merkle.layers,
    };
    const archiveCid = computeCID(canonicalJSON(archivePayload));
    const certificateBasis = {
      schema: 'mcp++/event-dag-compaction-certificate@1',
      profile: MCPPP_PROFILE_F.capability,
      profile_name: MCPPP_PROFILE_F.name,
      archive_cid: archiveCid,
      merkle_root: merkle.root,
      epoch_id: this.archives.size,
      event_count: eventCids.length,
      root_cids: roots,
      frontier_cids: frontier,
      proof_system: 'hash-commitment-v1' as const,
      zero_knowledge: false as const,
    };
    const certificateCid = computeCID(canonicalJSON(certificateBasis));
    const certificate: EventDAGCompactionCertificate = {
      ...certificateBasis,
      certificate_cid: certificateCid,
      proof: computeCID(canonicalJSON(certificateBasis)),
    };
    const archive: EventDAGArchive = {
      archive_cid: archiveCid,
      event_cids: eventCids,
      events,
      merkle_layers: merkle.layers,
      certificate,
    };
    this.archives.set(archiveCid, archive);
    for (const cid of eventCids) {
      this.byCid.delete(cid);
      this.archivedEvents.set(cid, { archive_cid: archiveCid, certificate_cid: certificateCid });
    }
    this.rebuildIndexes();
    return archive;
  }

  listArchives(): EventDAGArchive[] {
    return [...this.archives.values()].sort((left, right) => left.certificate.epoch_id - right.certificate.epoch_id);
  }

  getCertificate(certificateCid: string): EventDAGCompactionCertificate | null {
    return this.listArchives().find(archive => archive.certificate.certificate_cid === certificateCid)?.certificate ?? null;
  }

  verifyCertificate(certificateCid: string): boolean {
    const archive = this.listArchives().find(item => item.certificate.certificate_cid === certificateCid);
    if (!archive) return false;
    const certificate = archive.certificate;
    const merkle = buildMerkleTree(archive.event_cids);
    const basis = {
      schema: 'mcp++/event-dag-compaction-certificate@1',
      profile: MCPPP_PROFILE_F.capability,
      profile_name: MCPPP_PROFILE_F.name,
      archive_cid: archive.archive_cid,
      merkle_root: certificate.merkle_root,
      epoch_id: certificate.epoch_id,
      event_count: certificate.event_count,
      root_cids: certificate.root_cids,
      frontier_cids: certificate.frontier_cids,
      proof_system: certificate.proof_system,
      zero_knowledge: certificate.zero_knowledge,
    };
    return merkle.root === certificate.merkle_root
      && archive.event_cids.length === certificate.event_count
      && certificate.proof === computeCID(canonicalJSON(basis));
  }

  getInclusionProof(eventCid: string): { archive_cid: string; certificate_cid: string; merkle_root: string; proof: Array<{ side: 'left' | 'right'; hash: string }> } | null {
    const index = this.archivedEvents.get(eventCid);
    if (!index) return null;
    const archive = this.archives.get(index.archive_cid);
    if (!archive) return null;
    return {
      archive_cid: index.archive_cid,
      certificate_cid: index.certificate_cid,
      merkle_root: archive.certificate.merkle_root,
      proof: merkleProof(eventCid, archive.event_cids, archive.merkle_layers),
    };
  }

  /** Traverse hot history only and return archive boundaries for compacted parents. */
  traverseBounded(tipCid: string, limit = 100): BoundedProvenance {
    const queue = [tipCid];
    const seen = new Set<string>();
    const events: StoredEventNode[] = [];
    const archive_boundaries: BoundedProvenance['archive_boundaries'] = [];
    while (queue.length > 0 && events.length < positiveInteger(limit, 100)) {
      const cid = queue.shift()!;
      if (seen.has(cid)) continue;
      seen.add(cid);
      const event = this.byCid.get(cid);
      if (event) {
        events.push(event);
        queue.push(...event.parents);
        continue;
      }
      const archived = this.archivedEvents.get(cid);
      if (archived) archive_boundaries.push({ event_cid: cid, ...archived });
    }
    return { events, archive_boundaries, truncated: queue.length > 0 };
  }

  private rebuildIndexes(): void {
    this.byOutput.clear();
    this.byCorrelation.clear();
    this.byArtifact.clear();
    this.tips.clear();
    const events = [...this.byCid.values()];
    const parents = new Set(events.flatMap(event => event.parents));
    for (const event of events) {
      for (const outputCid of event.outputs) appendIndex(this.byOutput, outputCid, event.cid);
      if (event.correlation_id) appendIndex(this.byCorrelation, event.correlation_id, event.cid);
      for (const artifactCid of event.artifact_cids ?? []) appendIndex(this.byArtifact, artifactCid, event.cid);
      if (!parents.has(event.cid)) this.tips.add(event.cid);
    }
  }

  private collectLineage(eventCids: string[]): StoredEventNode[] {
    const seen = new Set<string>();
    const result: StoredEventNode[] = [];
    for (const eventCid of eventCids) {
      for (const node of this.traverseDAG(eventCid)) {
        if (!seen.has(node.cid)) {
          seen.add(node.cid);
          result.push(node);
        }
      }
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Singleton
  // -------------------------------------------------------------------------

  private static _instance: EventDAG | null = null;
  static getInstance(): EventDAG {
    if (!EventDAG._instance) {
      EventDAG._instance = new EventDAG();
    }
    return EventDAG._instance;
  }
}

function appendIndex(index: Map<string, string[]>, key: string, cid: string): void {
  if (!index.has(key)) {
    index.set(key, []);
  }
  index.get(key)!.push(cid);
}
