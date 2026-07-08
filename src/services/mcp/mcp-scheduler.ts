/**
 * Risk Scoring & Multi-Agent Scheduling (MCP++ Phase 8)
 *
 * Implements:
 *  - `RiskScorer`    — derives a risk score from the Event DAG
 *  - `MCPScheduler`  — priority-queue scheduler for tool calls
 *  - Neighbourhood coordination heuristic (§10.2)
 *
 * References: docs/spec/risk-scheduling.md in endomorphosis/Mcp-Plus-Plus
 */

<<<<<<< HEAD
import { BrowserEventEmitter } from '../shared/browser-event-emitter.js';
import { EventDAG, StoredEventNode } from './mcp-event-dag.js';
=======
import { EventEmitter } from 'events';
import { EventDAG, StoredEventNode } from '../event-dag.js';
>>>>>>> 1569811 (chore: add pending swissknife staged changes)

// ---------------------------------------------------------------------------
// Risk Scoring
// ---------------------------------------------------------------------------

export interface RiskFactors {
  /** Number of policy violations in causal history */
  policyViolations: number;
  /** Number of unresolved / overdue obligations in causal history */
  missedObligations: number;
  /** Number of events with no proof (unauthorised invocations) */
  unauthorisedInvocations: number;
  /** Number of disputed receipts */
  disputedReceipts: number;
}

export interface RiskScore {
  /** 0.0 (no risk) to 1.0 (maximum risk) */
  score: number;
  factors: RiskFactors;
}

export class RiskScorer {
  private dag: EventDAG;
  /** Set of disputed receipt CIDs (populated by external dispute resolution) */
  private disputedReceipts: Set<string> = new Set();

  constructor(dag?: EventDAG) {
    this.dag = dag ?? EventDAG.getInstance();
  }

  /** Mark a receipt CID as disputed. */
  disputeReceipt(receiptCid: string): void {
    this.disputedReceipts.add(receiptCid);
  }

  /**
   * Compute a risk score for a proposed tool call given its causal history.
   *
   * @param envelopeCid  CID of the proposed execution envelope (may be absent if not yet created)
   * @param parentCids   Parent event CIDs for the proposed tool call
   */
  computeRisk(parentCids: string[]): RiskScore {
    const factors: RiskFactors = {
      policyViolations: 0,
      missedObligations: 0,
      unauthorisedInvocations: 0,
      disputedReceipts: 0,
    };

    const visited = new Set<string>();
    const queue = [...parentCids];

    while (queue.length > 0) {
      const cid = queue.shift()!;
      if (visited.has(cid)) continue;
      visited.add(cid);

      const node = this.dag.getNode(cid);
      if (!node) continue;

      factors.policyViolations += countViolations(node);
      factors.missedObligations += countMissedObligations(node);
      factors.unauthorisedInvocations += node.proofs.length === 0 ? 1 : 0;
      for (const outputCid of node.outputs) {
        if (this.disputedReceipts.has(outputCid)) {
          factors.disputedReceipts++;
        }
      }

      for (const parentCid of node.parents) {
        if (!visited.has(parentCid)) queue.push(parentCid);
      }
    }

    const score = normaliseScore(factors);
    return { score, factors };
  }
}

function countViolations(node: StoredEventNode): number {
  // A DENY decision indicates a policy violation that still proceeded.
  return node.decision_outcome === 'DENY' ? 1 : 0;
}

function countMissedObligations(node: StoredEventNode): number {
  return node.obligation_overdue ? 1 : 0;
}

function normaliseScore(factors: RiskFactors): number {
  // Weighted sum, capped at 1.0
  const raw =
    factors.policyViolations * 0.4 +
    factors.missedObligations * 0.3 +
    factors.unauthorisedInvocations * 0.2 +
    factors.disputedReceipts * 0.1;
  return Math.min(raw, 1.0);
}

// ---------------------------------------------------------------------------
// Priority Queue (min-heap by effective priority)
// ---------------------------------------------------------------------------

export interface ScheduledCall<T = unknown> {
  id: string;
  call: T;
  /** Lower value = higher priority (runs first) */
  priorityHint: number;
  /** Risk-adjusted effective priority (computed by scheduler) */
  effectivePriority: number;
  /** Peer cluster hint for neighbourhood coordination */
  peerCluster?: string;
  enqueuedAt: number;
}

class MinHeap<T> {
  private heap: ScheduledCall<T>[] = [];

  push(item: ScheduledCall<T>): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): ScheduledCall<T> | null {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  peek(): ScheduledCall<T> | null {
    return this.heap[0] ?? null;
  }

  get size(): number {
    return this.heap.length;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.heap[parent].effectivePriority <= this.heap[i].effectivePriority) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  private siftDown(i: number): void {
    const n = this.heap.length;
    for (;;) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.heap[l].effectivePriority < this.heap[smallest].effectivePriority) smallest = l;
      if (r < n && this.heap[r].effectivePriority < this.heap[smallest].effectivePriority) smallest = r;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}

// ---------------------------------------------------------------------------
// MCPScheduler
// ---------------------------------------------------------------------------

export interface SchedulerOptions {
  riskScorer?: RiskScorer;
  dag?: EventDAG;
  /** Weight applied to risk score when computing effective priority */
  riskWeight?: number;
  /** Max concurrent in-flight calls (default: 8) */
  maxConcurrent?: number;
}

export type CallExecutor<T> = (call: T) => Promise<unknown>;

export class MCPScheduler<T = unknown> extends BrowserEventEmitter {
  private queue = new MinHeap<T>();
  private inFlight = 0;
  private riskScorer: RiskScorer;
  private riskWeight: number;
  private maxConcurrent: number;
  private executor: CallExecutor<T> | null = null;
  private idCounter = 0;

  constructor(options: SchedulerOptions = {}) {
    super();
    this.riskScorer = options.riskScorer ?? new RiskScorer(options.dag);
    this.riskWeight = options.riskWeight ?? 2.0;
    this.maxConcurrent = options.maxConcurrent ?? 8;
  }

  /** Register the async executor that actually dispatches tool calls. */
  setExecutor(executor: CallExecutor<T>): void {
    this.executor = executor;
  }

  /**
   * Enqueue a tool call.
   *
   * Effective priority = priorityHint + riskWeight × riskScore
   * (lower = executes sooner).
   *
   * @param call         Tool call payload
   * @param priorityHint base priority (0 = highest)
   * @param parentCids   Parent event CIDs for risk computation
   * @param peerCluster  Optional cluster label for neighbourhood grouping
   */
  scheduleToolCall(
    call: T,
    priorityHint = 0,
    parentCids: string[] = [],
    peerCluster?: string,
  ): string {
    const id = `sched-${++this.idCounter}`;
    const riskScore = this.riskScorer.computeRisk(parentCids);
    const effectivePriority = priorityHint + this.riskWeight * riskScore.score;

    const item: ScheduledCall<T> = {
      id,
      call,
      priorityHint,
      effectivePriority,
      peerCluster,
      enqueuedAt: Date.now(),
    };
    this.queue.push(item);
    this.emit('enqueued', item);
    this.drain();
    return id;
  }

  // -------------------------------------------------------------------------
  // Neighbourhood coordination heuristic (§10.2)
  // -------------------------------------------------------------------------

  /**
   * Attempt to group calls to the same peer cluster.
   * Moves matching items to the front by lowering their effective priority by 0.5.
   */
  private boostCluster(peerCluster: string): void {
    // We rebuild the queue if needed — for small queues this is acceptable.
    // A production system would use a clustered priority queue.
    const all: ScheduledCall<T>[] = [];
    for (;;) {
      const item = this.queue.pop();
      if (!item) break;
      if (item.peerCluster === peerCluster) {
        item.effectivePriority = Math.max(0, item.effectivePriority - 0.5);
      }
      all.push(item);
    }
    for (const item of all) this.queue.push(item);
  }

  private drain(): void {
    if (!this.executor) return;
    while (this.inFlight < this.maxConcurrent && this.queue.size > 0) {
      const item = this.queue.pop();
      if (!item) break;

      if (item.peerCluster) this.boostCluster(item.peerCluster);

      this.inFlight++;
      this.emit('executing', item);
      this.executor(item.call)
        .then(result => {
          this.inFlight--;
          this.emit('completed', item, result);
          this.drain();
        })
        .catch(err => {
          this.inFlight--;
          this.emit('failed', item, err);
          this.drain();
        });
    }
  }

  get queueSize(): number {
    return this.queue.size;
  }

  get inFlightCount(): number {
    return this.inFlight;
  }
}
