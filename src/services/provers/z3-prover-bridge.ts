/**
 * Z3 Prover Bridge — T-248 (Sprint 55)
 *
 * Port of ipfs_datasets_py/logic/external_provers/smt/z3_prover_bridge.py
 *
 * TypeScript interface layer for the Z3 SMT solver.  When the real Z3 WASM
 * bridge is available through WasmProverHub it is delegated to; otherwise a
 * syntactic fallback returns UNKNOWN.
 *
 * Note: This file is distinct from z3-adapter.ts (which lives in the CEC
 * provers namespace).  The bridge is the external-prover-facing API.
 */

import type { Formula, SortKind, Term } from '../logic/tdfol/tdfol-core.js';

// ---------------------------------------------------------------------------
// Z3ProofResult
// ---------------------------------------------------------------------------

export interface Z3ProofResult {
  /** True if the formula is valid (negation is unsatisfiable). */
  isValid: boolean;
  /** True if the formula is satisfiable. */
  isSat: boolean;
  /** True if the formula is unsatisfiable. */
  isUnsat: boolean;
  /** Model (if satisfiable). */
  model: Record<string, unknown> | null;
  /** Unsatisfiable core clauses. */
  unsatCore: string[] | null;
  /** Human-readable result reason. */
  reason: 'sat' | 'unsat' | 'valid' | 'unknown' | 'timeout' | 'error';
  /** Wall-clock time in seconds. */
  proofTime: number;
  /** Raw Z3 result object (null in pure-TS runtime). */
  z3Result: unknown | null;
}

export function z3Proved(result: Z3ProofResult): boolean { return result.isValid; }

// ---------------------------------------------------------------------------
// TDFOLToZ3Converter
// ---------------------------------------------------------------------------

/**
 * Best-effort TDFOL → Z3 SMT-LIB2 string converter.
 *
 * Structural port of `TDFOLToZ3Converter` from `z3_prover_bridge.py`.
 * Full conversion requires z3-solver; this stub produces SMT-LIB2 text.
 */
export class TDFOLToZ3Converter {
  convert(formula: string | Formula): string {
    if (isFormulaAst(formula)) return this.convertFormula(formula);
    return formula
      .replace(/∀\s*(\w+)\s*\./g, '(forall (($1 Bool))')
      .replace(/∃\s*(\w+)\s*\./g, '(exists (($1 Bool))')
      .replace(/∧/g, ' and ')
      .replace(/∨/g, ' or ')
      .replace(/¬/g, 'not ')
      .replace(/→/g, '=> ')
      .replace(/↔/g, '= ')
      .replace(/O\(([^)]+)\)/g, '(obligation $1)')
      .replace(/P\(([^)]+)\)/g, '(permission $1)')
      .replace(/F\(([^)]+)\)/g, '(forbidden $1)')
      .trim();
  }

  /** PORT-020: Accept a TDFOL Formula AST object and convert to a SMT-LIB2 term. */
  convertFormula(formula: Formula | string): string {
    if (typeof formula === 'string') return this.convert(formula);
    const ctx = createSmtContext();
    return formulaToSmt(formula, ctx);
  }

  /** Return an SMT-LIB2 assertion string for the negation of `formula`. */
  toSmtAssertion(formula: string | Formula): string {
    const converted = this.convert(formula);
    return `(assert (not ${converted}))`;
  }

  /** Build a complete validity-check query: axioms ∧ ¬formula is unsatisfiable. */
  toSmtLib(formula: string | Formula, axioms: Array<string | Formula> = []): string {
    if (typeof formula === 'string' && axioms.every(a => typeof a === 'string')) {
      return [
        '(set-logic ALL)',
        ...axioms.map(a => `(assert ${this.convert(a as string)})`),
        this.toSmtAssertion(formula),
        '(check-sat)',
        '(get-model)',
      ].join('\n');
    }

    const ctx = createSmtContext();
    const axiomTerms = axioms.map(a => typeof a === 'string' ? this.convert(a) : formulaToSmt(a, ctx));
    const formulaTerm = typeof formula === 'string' ? this.convert(formula) : formulaToSmt(formula, ctx);
    return [
      '(set-logic ALL)',
      ...Array.from(ctx.sorts).sort().map(s => `(declare-sort ${s} 0)`),
      ...Array.from(ctx.declarations).sort(),
      ...axiomTerms.map(a => `(assert ${a})`),
      `(assert (not ${formulaTerm}))`,
      '(check-sat)',
      '(get-model)',
    ].join('\n');
  }
}

interface SmtContext {
  declarations: Set<string>;
  sorts: Set<string>;
  boundVariables: Set<string>;
}

function createSmtContext(): SmtContext {
  return { declarations: new Set(), sorts: new Set(), boundVariables: new Set() };
}

function isFormulaAst(value: unknown): value is Formula {
  return Boolean(value && typeof value === 'object' && 'kind' in value && typeof (value as { toStr?: unknown }).toStr === 'function');
}

function smtSort(sort?: SortKind): string {
  if (!sort || sort === 'Proposition') return 'Bool';
  return smtIdentifier(sort);
}

function ensureSort(ctx: SmtContext, sort?: SortKind): string {
  const mapped = smtSort(sort);
  if (mapped !== 'Bool') ctx.sorts.add(mapped);
  return mapped;
}

function smtIdentifier(raw: string): string {
  const text = String(raw || 'unnamed');
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) return text;
  return `|${text.replace(/[|\\]/g, '_')}|`;
}

function termSort(term: Term): string {
  switch (term.kind) {
    case 'variable': return smtSort(term.sort);
    case 'constant': return smtSort(term.sort);
    case 'function_app': return smtSort(term.returnSort);
  }
}

function termToSmt(term: Term, ctx: SmtContext): string {
  switch (term.kind) {
    case 'variable':
      return smtIdentifier(term.name);
    case 'constant': {
      const name = smtIdentifier(term.name);
      if (!ctx.boundVariables.has(term.name)) {
        ctx.declarations.add(`(declare-const ${name} ${ensureSort(ctx, term.sort)})`);
      }
      return name;
    }
    case 'function_app': {
      const name = smtIdentifier(term.funcName);
      const argSorts = term.args.map(termSort);
      for (const arg of term.args) ensureTermSorts(arg, ctx);
      const returnSort = ensureSort(ctx, term.returnSort);
      ctx.declarations.add(`(declare-fun ${name} (${argSorts.join(' ')}) ${returnSort})`);
      return `(${name}${term.args.length ? ` ${term.args.map(a => termToSmt(a, ctx)).join(' ')}` : ''})`;
    }
  }
}

function ensureTermSorts(term: Term, ctx: SmtContext): void {
  switch (term.kind) {
    case 'variable':
    case 'constant':
      ensureSort(ctx, term.sort);
      return;
    case 'function_app':
      ensureSort(ctx, term.returnSort);
      for (const arg of term.args) ensureTermSorts(arg, ctx);
      return;
  }
}

function formulaToSmt(formula: Formula, ctx: SmtContext): string {
  switch (formula.kind) {
    case 'predicate': {
      const name = smtIdentifier(formula.name);
      if (formula.args.length === 0) {
        ctx.declarations.add(`(declare-const ${name} Bool)`);
        return formula.negated ? `(not ${name})` : name;
      }
      const argSorts = formula.args.map(termSort);
      for (const arg of formula.args) ensureTermSorts(arg, ctx);
      ctx.declarations.add(`(declare-fun ${name} (${argSorts.join(' ')}) Bool)`);
      const term = `(${name} ${formula.args.map(a => termToSmt(a, ctx)).join(' ')})`;
      return formula.negated ? `(not ${term})` : term;
    }
    case 'unary':
      return `(not ${formulaToSmt(formula.operand, ctx)})`;
    case 'binary': {
      const left = formulaToSmt(formula.left, ctx);
      const right = formulaToSmt(formula.right, ctx);
      const op = formula.operator === '∧' ? 'and'
        : formula.operator === '∨' ? 'or'
        : formula.operator === '→' ? '=>'
        : formula.operator === '↔' ? '='
        : formula.operator === '⊕' ? 'xor'
        : formula.operator;
      return `(${op} ${left} ${right})`;
    }
    case 'quantified': {
      const variableName = smtIdentifier(formula.variable);
      const sort = ensureSort(ctx, formula.variableTerm?.sort ?? formula.sort);
      ctx.boundVariables.add(formula.variable);
      const body = formulaToSmt(formula.body, ctx);
      ctx.boundVariables.delete(formula.variable);
      return `(${formula.quantifier === '∀' ? 'forall' : 'exists'} ((${variableName} ${sort})) ${body})`;
    }
    case 'deontic': {
      const inner = formulaToSmt(formula.formula, ctx);
      const op = smtIdentifier(formula.operator);
      if (formula.agentTerm) {
        ensureTermSorts(formula.agentTerm, ctx);
        ctx.declarations.add(`(declare-fun ${op}_agent (${termSort(formula.agentTerm)} Bool) Bool)`);
        return `(${op}_agent ${termToSmt(formula.agentTerm, ctx)} ${inner})`;
      }
      ctx.declarations.add(`(declare-fun ${op} (Bool) Bool)`);
      return `(${op} ${inner})`;
    }
    case 'temporal': {
      const names: Record<string, string> = {
        '□': 'Always',
        '◊': 'Eventually',
        X: 'Next',
        U: 'Until',
        S: 'Since',
        W: 'WeakUntil',
        R: 'Release',
      };
      const op = names[formula.operator] ?? smtIdentifier(formula.operator);
      if (formula.until) {
        ctx.declarations.add(`(declare-fun ${op} (Bool Bool) Bool)`);
        return `(${op} ${formulaToSmt(formula.formula, ctx)} ${formulaToSmt(formula.until, ctx)})`;
      }
      ctx.declarations.add(`(declare-fun ${op} (Bool) Bool)`);
      return `(${op} ${formulaToSmt(formula.formula, ctx)})`;
    }
  }
}

// ---------------------------------------------------------------------------
// Z3ProverBridge
// ---------------------------------------------------------------------------

export interface Z3BridgeStats {
  queriesTotal: number;
  valid: number;
  unknown: number;
  errors: number;
  cacheHits: number;
  totalTimeMs: number;
}

/**
 * Bridge to the Z3 SMT solver.
 *
 * TypeScript port of `Z3ProverBridge` from
 * `ipfs_datasets_py/logic/external_provers/smt/z3_prover_bridge.py`.
 *
 * When Z3 WASM is available via `WasmProverHub` the call is delegated;
 * otherwise a syntactic fallback returns UNKNOWN.
 */
export class Z3ProverBridge {
  private readonly converter = new TDFOLToZ3Converter();
  private readonly cache: Map<string, Z3ProofResult> | null;
  private readonly stats: Z3BridgeStats = {
    queriesTotal: 0, valid: 0, unknown: 0, errors: 0, cacheHits: 0, totalTimeMs: 0,
  };

  constructor(readonly timeout = 5.0, readonly enableCache = true) {
    this.cache = enableCache ? new Map() : null;
  }

  /** Attempt to prove `formula` given optional `axioms`. */
  async prove(formula: string | Formula, axioms: Array<string | Formula> = [], timeout?: number): Promise<Z3ProofResult> {
    const t0 = performance.now();
    const formulaText = typeof formula === 'string' ? formula : this.converter.toSmtLib(formula, axioms);
    const axiomText = axioms.map(a => typeof a === 'string' ? a : this.converter.convertFormula(a));
    const cacheKey = `${formulaText}|${axiomText.join(',')}`;
    const cached = this.cache?.get(cacheKey);
    if (cached) { this.stats.cacheHits++; return cached; }

    this.stats.queriesTotal++;
    const result = await this._queryZ3(formulaText, axiomText, timeout ?? this.timeout);
    const elapsed = performance.now() - t0;
    this.stats.totalTimeMs += elapsed;

    if (result.isValid) this.stats.valid++; else if (result.reason === 'error') this.stats.errors++; else this.stats.unknown++;
    this.cache?.set(cacheKey, result);
    return result;
  }

  /** Returns the reason string for a formula. */
  async check(formula: string): Promise<string> {
    return (await this.prove(formula)).reason;
  }

  /** Returns true if a Z3 WASM bridge is detectable. */
  isAvailable(): boolean {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { WasmProverHub } = require('./wasm-prover-hub');
      return typeof WasmProverHub === 'function';
    } catch { return false; }
  }

  getStats(): Readonly<Z3BridgeStats> { return { ...this.stats }; }
  clearCache(): void { this.cache?.clear(); }

  // -------------------------------------------------------------------------

  private async _queryZ3(formula: string, axioms: string[], timeoutSecs: number): Promise<Z3ProofResult> {
    const t0 = performance.now();

    // Delegate to WasmProverHub when available
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { WasmProverHub } = require('./wasm-prover-hub');
      const hub = new WasmProverHub();
      await hub.initialize();
      if (hub.getAvailableProvers().includes('z3')) {
        const r = await Promise.race([
          hub.prove('z3', formula, axioms),
          new Promise<null>(res => setTimeout(res, timeoutSecs * 1000)),
        ]);
        if (r === null) return this._timeoutResult(t0);
        return { isValid: r.isProved, isSat: r.isProved, isUnsat: !r.isProved, model: null, unsatCore: null, reason: r.isProved ? 'valid' : 'unknown', proofTime: (performance.now() - t0) / 1000, z3Result: null };
      }
    } catch { /* no Z3 WASM available */ }

    return { isValid: false, isSat: false, isUnsat: false, model: null, unsatCore: null, reason: 'unknown', proofTime: (performance.now() - t0) / 1000, z3Result: null };
  }

  private _timeoutResult(t0: number): Z3ProofResult {
    return { isValid: false, isSat: false, isUnsat: false, model: null, unsatCore: null, reason: 'timeout', proofTime: (performance.now() - t0) / 1000, z3Result: null };
  }
}

// ---------------------------------------------------------------------------
// Convenience function
// ---------------------------------------------------------------------------

/** Module-level convenience matching `prove_with_z3()`. */
export async function proveWithZ3(
  formula: string | Formula,
  axioms?: Array<string | Formula>,
  timeout = 5.0,
): Promise<Z3ProofResult> {
  return new Z3ProverBridge(timeout).prove(formula, axioms ?? []);
}

/** Returns true if Z3 solver is detectable in the current runtime. */
export function ensureZ3Available(): boolean {
  return new Z3ProverBridge().isAvailable();
}
