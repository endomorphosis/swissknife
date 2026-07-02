/**
 * DCEC Prototypes + TDFOL Performance Engine — T-274 + T-275 (Sprint 60)
 * Ports of CEC/native/dcec_prototypes.py (435L) and TDFOL/tdfol_performance_engine.py (427L)
 */

// ---------------------------------------------------------------------------
// DCECPrototypeNamespace (T-274)
// ---------------------------------------------------------------------------

import { Sort, DCECFunction, DCECPredicate, makeSort, makeFunction, makePredicate, SORT_OBJECT } from './dcec-core-types';

export class DCECPrototypeNamespace {
  private readonly sorts   = new Map<string, Sort>();
  private readonly preds   = new Map<string, DCECPredicate>();
  private readonly fns     = new Map<string, DCECFunction>();

  registerSort(name: string, parent?: string): Sort {
    const s = makeSort(name, parent);
    this.sorts.set(name, s);
    return s;
  }

  registerPredicate(name: string, argSorts: Sort[]): DCECPredicate {
    const p = makePredicate(name, argSorts);
    this.preds.set(name, p);
    return p;
  }

  registerFunction(name: string, argSorts: Sort[], returnSort: Sort = SORT_OBJECT): DCECFunction {
    const f = makeFunction(name, argSorts, returnSort);
    this.fns.set(name, f);
    return f;
  }

  lookupSort(name: string): Sort | null { return this.sorts.get(name) ?? null; }
  lookupPredicate(name: string): DCECPredicate | null { return this.preds.get(name) ?? null; }
  lookupFunction(name: string): DCECFunction | null { return this.fns.get(name) ?? null; }

  export(): { sorts: Sort[]; predicates: DCECPredicate[]; functions: DCECFunction[] } {
    return {
      sorts:      [...this.sorts.values()],
      predicates: [...this.preds.values()],
      functions:  [...this.fns.values()],
    };
  }
}

// ---------------------------------------------------------------------------
// TDFOLPerformanceEngine (T-275)
// ---------------------------------------------------------------------------

export interface BenchmarkResult {
  formula:      string;
  repetitions:  number;
  avgMs:        number;
  minMs:        number;
  maxMs:        number;
  p95Ms:        number;
  successRate:  number;
}

export interface ProfileResult {
  name:       string;
  totalMs:    number;
  calls:      number;
  avgMs:      number;
}

export class TDFOLPerformanceEngine {
  private readonly profiles = new Map<string, { totalMs: number; calls: number }>();

  /**
   * Benchmark a formula proving function over `reps` repetitions.
   */
  async benchmark(
    formula: string,
    axioms: string[],
    reps = 10,
    proveFn?: (formula: string, axioms: string[]) => boolean | Promise<boolean>,
  ): Promise<BenchmarkResult> {
    const times: number[] = [];
    let successes = 0;

    const fn = proveFn ?? ((f, ax) => {
      const known = new Set<string>(ax);
      let proved = known.has(f);
      if (!proved) {
        let changed = true;
        while (changed) {
          changed = false;
          for (const a of [...known]) {
            const idx = a.indexOf('→');
            if (idx < 0) continue;
            const ant = a.slice(0, idx).trim(), cons = a.slice(idx + 1).trim();
            if (known.has(ant) && !known.has(cons)) { known.add(cons); changed = true; if (cons === f) { proved = true; break; } }
          }
          if (proved) break;
        }
      }
      return proved;
    });

    for (let i = 0; i < reps; i++) {
      const t0 = performance.now();
      const result = await Promise.resolve(fn(formula, axioms));
      times.push(performance.now() - t0);
      if (result) successes++;
    }

    times.sort((a, b) => a - b);
    const avg = times.reduce((s, t) => s + t, 0) / times.length;
    const p95 = times[Math.floor(times.length * 0.95)] ?? times[times.length - 1];

    return {
      formula, repetitions: reps,
      avgMs: Math.round(avg * 100) / 100,
      minMs: times[0], maxMs: times[times.length - 1], p95Ms: p95,
      successRate: successes / reps,
    };
  }

  /**
   * Time a synchronous function and accumulate profile data.
   */
  profile<T>(name: string, fn: () => T): T {
    const t0 = performance.now();
    const result = fn();
    const elapsed = performance.now() - t0;
    const existing = this.profiles.get(name) ?? { totalMs: 0, calls: 0 };
    this.profiles.set(name, { totalMs: existing.totalMs + elapsed, calls: existing.calls + 1 });
    return result;
  }

  getReport(): ProfileResult[] {
    return [...this.profiles.entries()].map(([name, { totalMs, calls }]) => ({
      name, totalMs: Math.round(totalMs * 100) / 100, calls,
      avgMs: Math.round(totalMs / calls * 100) / 100,
    })).sort((a, b) => b.totalMs - a.totalMs);
  }

  reset(): void { this.profiles.clear(); }
}
