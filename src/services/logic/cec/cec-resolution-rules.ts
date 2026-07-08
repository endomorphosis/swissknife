/**
 * CEC Profiling Utils + Proof Optimization + Resolution Rules — T-286/T-287/T-288
 * Ports of CEC/optimization/profiling_utils.py (393L), CEC/native/proof_optimization.py (390L),
 * CEC/native/inference_rules/resolution.py (380L)
 */

import { CECInferenceRule } from './cec-prover-core';

// ---------------------------------------------------------------------------
// T-286 — Profiling Utils
// ---------------------------------------------------------------------------

export interface ProfilingResult {
  operation:  string;
  durationMs: number;
  callCount:  number;
  peakMemMb?: number;
  timestamp:  number;
}

export interface Bottleneck {
  operation: string;
  avgMs:     number;
  totalMs:   number;
  count:     number;
}

export class FormulaProfiler {
  private readonly results: ProfilingResult[] = [];

  profile<T>(name: string, fn: () => T): T {
    const t0 = performance.now();
    const result = fn();
    this.results.push({ operation: name, durationMs: performance.now() - t0, callCount: 1, timestamp: Date.now() });
    return result;
  }

  async profileAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const t0 = performance.now();
    const result = await fn();
    this.results.push({ operation: name, durationMs: performance.now() - t0, callCount: 1, timestamp: Date.now() });
    return result;
  }

  getResults(): ProfilingResult[] { return [...this.results]; }
  reset(): void { this.results.length = 0; }
}

export class BottleneckAnalyzer {
  analyze(results: ProfilingResult[]): Bottleneck[] {
    const grouped = new Map<string, { total: number; count: number }>();
    for (const r of results) {
      const g = grouped.get(r.operation) ?? { total: 0, count: 0 };
      g.total += r.durationMs; g.count++;
      grouped.set(r.operation, g);
    }
    return [...grouped.entries()].map(([op, { total, count }]) => ({
      operation: op, avgMs: total / count, totalMs: total, count,
    })).sort((a, b) => b.totalMs - a.totalMs);
  }

  topN(results: ProfilingResult[], n: number): Bottleneck[] {
    return this.analyze(results).slice(0, n);
  }
}

export class ProfilingReporter {
  report(results: ProfilingResult[]): string {
    if (results.length === 0) return 'No profiling data.';
    const analyzer = new BottleneckAnalyzer();
    const bottlenecks = analyzer.topN(results, 5);
    const lines = ['=== Profiling Report ===', ...bottlenecks.map(b =>
      `  ${b.operation}: avg=${b.avgMs.toFixed(2)}ms total=${b.totalMs.toFixed(2)}ms calls=${b.count}`)];
    return lines.join('\n');
  }
}

export function profileDecorator(operationName?: string) {
  return function<T extends object, Args extends unknown[], R>(
    _target: T,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<(...args: Args) => R>,
  ): TypedPropertyDescriptor<(...args: Args) => R> {
    const original = descriptor.value!;
    const name = operationName ?? propertyKey;
    descriptor.value = function(this: T, ...args: Args): R {
      const t0 = performance.now();
      const result = original.apply(this, args);
      // eslint-disable-next-line no-console
      console.debug(`[profile] ${name}: ${(performance.now() - t0).toFixed(2)}ms`);
      return result;
    };
    return descriptor;
  };
}

// ---------------------------------------------------------------------------
// T-287 — Proof Optimization
// ---------------------------------------------------------------------------

export enum PruningStrategy {
  NONE       = 'none',
  DEPTH_FIRST = 'depth_first',
  BEST_FIRST  = 'best_first',
  ITERATIVE_DEEPENING = 'iterative_deepening',
}

export interface ProofNode {
  formula:  string;
  children: ProofNode[];
  depth:    number;
  closed:   boolean;
}

export function makeProofNode(formula: string, depth = 0): ProofNode {
  return { formula, children: [], depth, closed: false };
}

export interface OptimizationMetrics {
  originalSteps: number;
  optimisedSteps: number;
  redundanciesRemoved: number;
  prunedBranches: number;
}

export class ProofTreePruner {
  prune(nodes: ProofNode[], strategy: PruningStrategy): ProofNode[] {
    switch (strategy) {
      case PruningStrategy.DEPTH_FIRST:
        return nodes.filter(n => !n.closed && n.depth < 10);
      case PruningStrategy.BEST_FIRST:
        return [...nodes].sort((a, b) => a.depth - b.depth);
      case PruningStrategy.ITERATIVE_DEEPENING: {
        const maxDepth = Math.min(5, Math.max(...nodes.map(n => n.depth)));
        return nodes.filter(n => n.depth <= maxDepth);
      }
      default:
        return nodes;
    }
  }
}

export class RedundancyEliminator {
  eliminate(steps: string[]): { steps: string[]; metrics: OptimizationMetrics } {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const s of steps) {
      if (!seen.has(s)) { seen.add(s); unique.push(s); }
    }
    return {
      steps: unique,
      metrics: {
        originalSteps:      steps.length,
        optimisedSteps:     unique.length,
        redundanciesRemoved: steps.length - unique.length,
        prunedBranches:     0,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// T-288 — Resolution Inference Rules
// ---------------------------------------------------------------------------

/** Resolve two clauses (sets of literals). Returns resolvent or null. */
function resolve(c1: Set<string>, c2: Set<string>): Set<string> | null {
  for (const lit of c1) {
    const neg = lit.startsWith('¬') ? lit.slice(1) : `¬${lit}`;
    if (c2.has(neg)) {
      const resolvent = new Set([...c1, ...c2]);
      resolvent.delete(lit); resolvent.delete(neg);
      return resolvent;
    }
  }
  return null;
}

function tokenDisj(f: string): string[] {
  return f.split(/\s*∨\s*/).map(s => s.trim()).filter(Boolean);
}

export class ResolutionRule implements CECInferenceRule {
  readonly name = 'Resolution';
  readonly description = 'C1 ∨ P, C2 ∨ ¬P ⊢ C1 ∨ C2';

  canApply(fs: string[]): boolean {
    return fs.length >= 2 && fs.some(f1 =>
      fs.some(f2 => f1 !== f2 && resolve(new Set(tokenDisj(f1)), new Set(tokenDisj(f2))) !== null));
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (let i = 0; i < fs.length; i++) {
      for (let j = i + 1; j < fs.length; j++) {
        const r = resolve(new Set(tokenDisj(fs[i])), new Set(tokenDisj(fs[j])));
        if (r) {
          const clause = [...r].join(' ∨ ') || '⊥';
          if (!fs.includes(clause)) out.push(clause);
        }
      }
    }
    return out;
  }
}

export class UnitResolutionRule implements CECInferenceRule {
  readonly name = 'UnitResolutionR';
  readonly description = 'Unit clause resolution';

  canApply(fs: string[]): boolean {
    const units = fs.filter(f => !f.includes('∨'));
    return units.length > 0 && fs.some(f => f.includes('∨'));
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    const units = fs.filter(f => !f.includes('∨'));
    const clauses = fs.filter(f => f.includes('∨'));
    for (const u of units) {
      const neg = u.startsWith('¬') ? u.slice(1) : `¬${u}`;
      for (const cl of clauses) {
        const lits = tokenDisj(cl);
        if (lits.includes(neg)) {
          const remaining = lits.filter(l => l !== neg).join(' ∨ ') || '⊥';
          if (!fs.includes(remaining)) out.push(remaining);
        }
      }
    }
    return out;
  }
}

export class FactoringRule implements CECInferenceRule {
  readonly name = 'Factoring';
  readonly description = 'Remove duplicate literals from a clause';

  canApply(fs: string[]): boolean {
    return fs.some(f => {
      const lits = tokenDisj(f);
      return new Set(lits).size < lits.length;
    });
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const f of fs) {
      const lits = tokenDisj(f);
      const unique = [...new Set(lits)];
      if (unique.length < lits.length) {
        const factored = unique.join(' ∨ ');
        if (!fs.includes(factored)) out.push(factored);
      }
    }
    return out;
  }
}

export class SubsumptionRule implements CECInferenceRule {
  readonly name = 'Subsumption';
  readonly description = 'Remove subsumed (redundant) clauses';

  canApply(fs: string[]): boolean { return fs.length >= 2; }

  apply(fs: string[]): string[] {
    // Mark subsumed: C1 subsumes C2 if lits(C1) ⊆ lits(C2)
    const toRemove = new Set<string>();
    for (const c1 of fs) {
      const lits1 = new Set(tokenDisj(c1));
      for (const c2 of fs) {
        if (c1 === c2) continue;
        const lits2 = new Set(tokenDisj(c2));
        if ([...lits1].every(l => lits2.has(l)) && lits1.size < lits2.size) {
          toRemove.add(c2);
        }
      }
    }
    return [...toRemove]; // returns the subsumed formulas (for removal awareness)
  }
}

export class CaseAnalysisRule implements CECInferenceRule {
  readonly name = 'CaseAnalysis';
  readonly description = 'P∨Q, P→R, Q→R ⊢ R';

  canApply(fs: string[]): boolean {
    const disjs = fs.filter(f => f.includes('∨'));
    const impls = fs.filter(f => f.includes('→'));
    return disjs.length > 0 && impls.length >= 2;
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    const disjs = fs.filter(f => f.includes('∨'));
    const impls = fs.filter(f => f.includes('→'));
    for (const d of disjs) {
      const [p, q] = d.split('∨').map(s => s.trim());
      for (const i1 of impls) {
        const a1 = i1.indexOf('→'), ant1 = i1.slice(0, a1).trim(), cons1 = i1.slice(a1+1).trim();
        for (const i2 of impls) {
          const a2 = i2.indexOf('→'), ant2 = i2.slice(0, a2).trim(), cons2 = i2.slice(a2+1).trim();
          if (ant1 === p && ant2 === q && cons1 === cons2 && !fs.includes(cons1)) {
            out.push(cons1);
          }
        }
      }
    }
    return out;
  }
}

export class ProofByContradictionRule implements CECInferenceRule {
  readonly name = 'ProofByContradiction';
  readonly description = 'P→⊥ ⊢ ¬P; ¬P→⊥ ⊢ P';

  canApply(fs: string[]): boolean {
    return fs.some(f => { const p = f.indexOf('→'); return p >= 0 && f.slice(p+1).trim() === '⊥'; });
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const f of fs) {
      const idx = f.indexOf('→');
      if (idx < 0 || f.slice(idx+1).trim() !== '⊥') continue;
      const ant = f.slice(0, idx).trim();
      const derived = ant.startsWith('¬') ? ant.slice(1) : `¬${ant}`;
      if (!fs.includes(derived)) out.push(derived);
    }
    return out;
  }
}

export const ALL_RESOLUTION_RULES: CECInferenceRule[] = [
  new ResolutionRule(), new UnitResolutionRule(), new FactoringRule(),
  new SubsumptionRule(), new CaseAnalysisRule(), new ProofByContradictionRule(),
];
