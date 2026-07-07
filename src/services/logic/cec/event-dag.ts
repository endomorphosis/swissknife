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
