/**
 * Shadow Prover Wrapper — T-267
 * Port of CEC/shadow_prover_wrapper.py (541L)
 */

export enum ProverStatus { PENDING='pending', RUNNING='running', SUCCEEDED='succeeded', FAILED='failed', TIMEOUT='timeout' }

export interface ProofTask {
  taskId:   string;
  formula:  string;
  axioms:   string[];
  timeoutMs: number;
  submitted: number;
}

export interface ProofTaskResult {
  taskId:    string;
  status:    ProverStatus;
  isProved:  boolean;
  proofSteps: string[];
  elapsedMs: number;
  error?:    string;
}

export interface ShadowProverStats {
  submitted: number; succeeded: number; failed: number; pending: number; avgElapsedMs: number;
}

export class ShadowProverWrapper {
  private readonly queue = new Map<string, ProofTask>();
  private readonly results = new Map<string, ProofTaskResult>();
  private taskCounter = 0;
  private readonly stats: ShadowProverStats = { submitted: 0, succeeded: 0, failed: 0, pending: 0, avgElapsedMs: 0 };

  submit(formula: string, axioms: string[] = [], timeoutMs = 5_000): ProofTask {
    const taskId = `task-${++this.taskCounter}`;
    const task: ProofTask = { taskId, formula, axioms, timeoutMs, submitted: Date.now() };
    this.queue.set(taskId, task);
    this.stats.submitted++;
    this.stats.pending++;
    // Immediately process synchronously (no actual subprocess)
    setImmediate(() => this._process(task));
    return task;
  }

  async getResult(taskId: string, waitMs = 100): Promise<ProofTaskResult | null> {
    // Wait briefly for async processing
    await new Promise(r => setTimeout(r, waitMs));
    return this.results.get(taskId) ?? null;
  }

  private _process(task: ProofTask): void {
    const t0 = Date.now();
    const known = new Set<string>(task.axioms);
    let proved = known.has(task.formula);
    if (!proved) {
      let changed = true;
      while (changed) {
        changed = false;
        for (const a of [...known]) {
          const idx = a.indexOf('→');
          if (idx < 0) continue;
          const ant = a.slice(0, idx).trim(), cons = a.slice(idx + 1).trim();
          if (known.has(ant) && !known.has(cons)) {
            known.add(cons); changed = true;
            if (cons === task.formula) { proved = true; break; }
          }
        }
        if (proved) break;
      }
    }
    const elapsedMs = Date.now() - t0;
    const result: ProofTaskResult = {
      taskId: task.taskId,
      status: proved ? ProverStatus.SUCCEEDED : ProverStatus.FAILED,
      isProved: proved,
      proofSteps: proved ? [`assume(${task.formula})`] : [],
      elapsedMs,
    };
    this.results.set(task.taskId, result);
    this.queue.delete(task.taskId);
    this.stats.pending = Math.max(0, this.stats.pending - 1);
    if (proved) this.stats.succeeded++; else this.stats.failed++;
    const n = this.stats.submitted;
    this.stats.avgElapsedMs = ((n - 1) * this.stats.avgElapsedMs + elapsedMs) / n;
  }

  getStats(): Readonly<ShadowProverStats> { return { ...this.stats }; }
}
