/**
 * PolicyAuditLog — structured, append-only audit trail for policy evaluations.
 *
 * Records every policy decision (allow / deny / obligations) with full
 * provenance context.  Provides: in-memory ring-buffer, optional JSONL-file
 * sink, pluggable notification callback, stats, export, replay, and a
 * process-global singleton.
 *
 * Reference parity: `ipfs_datasets_py.mcp_server.policy_audit_log.PolicyAuditLog`
 * (Phase 8 Observability).
 */

import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One immutable audit entry. */
export interface AuditEntry {
  /** Monotonic sequence number within this log (1-based). */
  seq: number;
  /** Unix timestamp (ms) when the entry was recorded. */
  timestamp: number;
  /** ISO-8601 wall clock. */
  timestamp_iso: string;
  /** CID of the policy that was evaluated. */
  policy_cid: string;
  /** CID of the intent or invocation that triggered the evaluation. */
  intent_cid: string;
  /** `'allow' | 'deny' | 'allow_with_obligations'` */
  decision: 'allow' | 'deny' | 'allow_with_obligations';
  /** Optional actor (DID) that issued the invocation. */
  actor?: string;
  /** Tool / method name from the intent. */
  tool: string;
  /** Human-readable justification string from the policy engine. */
  justification: string;
  /** Obligation descriptions spawned by this decision (if any). */
  obligations: string[];
  /** Content-addressed CID of this entry's canonical JSON (`sha256:<hex>`). */
  entry_cid: string;
  /** Caller-supplied metadata. */
  extra: Record<string, unknown>;
}

/** Summary statistics returned by `stats()`. */
export interface AuditStats {
  total: number;
  allow: number;
  deny: number;
  allow_with_obligations: number;
  /** Counts keyed by tool name. */
  by_tool: Record<string, number>;
  /** Counts keyed by actor (DID). */
  by_actor: Record<string, number>;
}

// ---------------------------------------------------------------------------
// PolicyAuditLog
// ---------------------------------------------------------------------------

/**
 * In-memory (optionally file-backed) audit trail for policy decisions.
 *
 * ```ts
 * const log = PolicyAuditLog.getInstance();
 * log.record({ policy_cid: 'sha256:...', intent_cid: 'sha256:...', decision: 'allow', tool: 'browse' });
 * console.log(log.recent(5));
 * log.export(); // → AuditEntry[]
 * ```
 */
export class PolicyAuditLog {
  private readonly entries: AuditEntry[] = [];
  private seq = 0;
  private readonly maxEntries: number;
  private readonly logPath?: string;
  private readonly sink?: (entry: AuditEntry) => void;
  private readonly counters = { allow: 0, deny: 0, allow_with_obligations: 0 };
  private readonly byTool: Record<string, number> = {};
  private readonly byActor: Record<string, number> = {};
  enabled: boolean;

  constructor(opts?: {
    enabled?: boolean;
    maxEntries?: number;
    /** Path to a JSONL file; each record appends one line. */
    logPath?: string;
    /** Callback invoked synchronously after each record(). */
    sink?: (entry: AuditEntry) => void;
  }) {
    this.enabled = opts?.enabled ?? true;
    this.maxEntries = opts?.maxEntries ?? 10_000;
    this.logPath = opts?.logPath;
    this.sink = opts?.sink;
  }

  // ---------------------------------------------------------------------------
  // Record
  // ---------------------------------------------------------------------------

  /**
   * Record a policy decision.
   *
   * @returns The created `AuditEntry`, or `null` if the log is disabled.
   */
  record(opts: {
    policy_cid: string;
    intent_cid: string;
    decision: 'allow' | 'deny' | 'allow_with_obligations';
    actor?: string;
    tool?: string;
    justification?: string;
    obligations?: string[];
    extra?: Record<string, unknown>;
    /** Override timestamp (Unix ms, defaults to `Date.now()`). */
    timestamp?: number;
    /**
     * T-40: prover that produced the policy decision.
     * Stored in `entry.extra.prover_id` when provided.
     */
    prover_id?: string;
    /**
     * T-40: time taken by the local WASM prover to decide (milliseconds).
     * Stored in `entry.extra.proof_time_ms` when provided.
     */
    proof_time_ms?: number;
  }): AuditEntry | null {
    if (!this.enabled) return null;

    const ts = opts.timestamp ?? Date.now();
    // Build extra, merging in prover_id / proof_time_ms when present (T-40)
    const extra: Record<string, unknown> = { ...(opts.extra ?? {}) };
    if (opts.prover_id !== undefined) extra.prover_id = opts.prover_id;
    if (opts.proof_time_ms !== undefined) extra.proof_time_ms = opts.proof_time_ms;

    const entry: AuditEntry = {
      seq: ++this.seq,
      timestamp: ts,
      timestamp_iso: new Date(ts).toISOString(),
      policy_cid: opts.policy_cid,
      intent_cid: opts.intent_cid,
      decision: opts.decision,
      actor: opts.actor,
      tool: opts.tool ?? 'unknown',
      justification: opts.justification ?? '',
      obligations: opts.obligations ?? [],
      entry_cid: '',
      extra,
    };
    entry.entry_cid = computeEntryCID(entry);

    // Ring-buffer eviction
    if (this.maxEntries > 0 && this.entries.length >= this.maxEntries) {
      this.entries.shift();
    }
    this.entries.push(entry);

    // Stats
    this.counters[entry.decision] = (this.counters[entry.decision] ?? 0) + 1;
    this.byTool[entry.tool] = (this.byTool[entry.tool] ?? 0) + 1;
    if (entry.actor) {
      this.byActor[entry.actor] = (this.byActor[entry.actor] ?? 0) + 1;
    }

    // Sink
    if (this.sink) {
      try { this.sink(entry); } catch { /* sink errors must never crash caller */ }
    }

    // JSONL file
    if (this.logPath) {
      try {
        appendFileSync(this.logPath, JSON.stringify(entry) + '\n', 'utf8');
      } catch { /* file errors must not crash caller */ }
    }

    return entry;
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  /** Return the `n` most-recent entries (default: 10). */
  recent(n = 10): AuditEntry[] {
    return this.entries.slice(-n);
  }

  /** Return all entries in chronological order. */
  export(): AuditEntry[] {
    return [...this.entries];
  }

  /**
   * Replay entries — call `handler(entry)` for each entry matching `filter`.
   *
   * @param handler  Called for each matching entry in insertion order.
   * @param filter   Optional predicate; defaults to all entries.
   */
  replay(
    handler: (entry: AuditEntry) => void,
    filter?: (entry: AuditEntry) => boolean,
  ): number {
    let count = 0;
    for (const entry of this.entries) {
      if (!filter || filter(entry)) {
        handler(entry);
        count++;
      }
    }
    return count;
  }

  /** Return summary statistics. */
  stats(): AuditStats {
    return {
      total: this.seq,
      allow: this.counters.allow,
      deny: this.counters.deny,
      allow_with_obligations: this.counters.allow_with_obligations,
      by_tool: { ...this.byTool },
      by_actor: { ...this.byActor },
    };
  }

  /** Number of entries currently in the in-memory buffer. */
  get size(): number {
    return this.entries.length;
  }

  /** Clear the in-memory buffer and reset counters (does not truncate the file). */
  clear(): void {
    this.entries.length = 0;
    this.counters.allow = 0;
    this.counters.deny = 0;
    this.counters.allow_with_obligations = 0;
    Object.keys(this.byTool).forEach(k => delete this.byTool[k]);
    Object.keys(this.byActor).forEach(k => delete this.byActor[k]);
    // seq is intentionally NOT reset — provides a monotone global counter
  }

  // ---------------------------------------------------------------------------
  // Singleton
  // ---------------------------------------------------------------------------

  private static _instance: PolicyAuditLog | null = null;

  static getInstance(): PolicyAuditLog {
    if (!PolicyAuditLog._instance) {
      PolicyAuditLog._instance = new PolicyAuditLog();
    }
    return PolicyAuditLog._instance;
  }

  static resetInstance(): void {
    PolicyAuditLog._instance = null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Content-addressed CID for an audit entry (excluding the `entry_cid` field). */
function computeEntryCID(entry: AuditEntry): string {
  // Exclude entry_cid itself from the hash to avoid circularity.
  const { entry_cid: _omit, ...rest } = entry;
  const canonical = JSON.stringify(rest, Object.keys(rest).sort());
  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}
