/**
 * Grammar NL Policy Compiler — T-243 (Sprint 54)
 *
 * Port of ipfs_datasets_py/logic/CEC/nl/grammar_nl_policy_compiler.py
 *
 * Compiles natural-language policy text into typed PolicyClause records
 * using the DCECEnglishGrammar parser. Falls back to heuristic pattern
 * matching when the grammar engine is unavailable.
 */

import { PatternMatcher, PatternType } from './tdfol-nl-patterns';

// ---------------------------------------------------------------------------
// Clause type constants
// ---------------------------------------------------------------------------

export const CLAUSE_TYPE_PERMISSION  = 'permission';
export const CLAUSE_TYPE_PROHIBITION = 'prohibition';
export const CLAUSE_TYPE_OBLIGATION  = 'obligation';

export type ClauseType = typeof CLAUSE_TYPE_PERMISSION | typeof CLAUSE_TYPE_PROHIBITION | typeof CLAUSE_TYPE_OBLIGATION;

// ---------------------------------------------------------------------------
// PolicyClause
// ---------------------------------------------------------------------------

export interface PolicyClause {
  clauseType: ClauseType;
  actor: string | null;
  action: string;
  resource: string | null;
  raw: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// GrammarCompilationResult
// ---------------------------------------------------------------------------

/**
 * Result of a grammar-based NL → PolicyClause compilation.
 *
 * TypeScript port of `GrammarCompilationResult` from
 * `ipfs_datasets_py/logic/CEC/nl/grammar_nl_policy_compiler.py`.
 */
export class GrammarCompilationResult {
  readonly text: string;
  readonly clauses: PolicyClause[];
  readonly policyCid: string;
  readonly warnings: string[];
  readonly parseMethod: string;
  readonly formulaTriples: Array<[string, string, string]>; // [actor, action, clauseType]

  constructor(params: {
    text: string;
    clauses?: PolicyClause[];
    policyCid?: string;
    warnings?: string[];
    parseMethod?: string;
    formulaTriples?: Array<[string, string, string]>;
  }) {
    this.text         = params.text;
    this.clauses      = params.clauses ?? [];
    this.policyCid    = params.policyCid ?? '';
    this.warnings     = params.warnings ?? [];
    this.parseMethod  = params.parseMethod ?? 'grammar';
    this.formulaTriples = params.formulaTriples ?? [];
  }

  get success(): boolean { return this.clauses.length > 0; }

  get prohibitionClauses(): PolicyClause[] {
    return this.clauses.filter(c => c.clauseType === CLAUSE_TYPE_PROHIBITION);
  }

  get permissionClauses(): PolicyClause[] {
    return this.clauses.filter(c => c.clauseType === CLAUSE_TYPE_PERMISSION);
  }

  get obligationClauses(): PolicyClause[] {
    return this.clauses.filter(c => c.clauseType === CLAUSE_TYPE_OBLIGATION);
  }

  toDict(): Record<string, unknown> {
    return {
      text: this.text,
      clauses: this.clauses,
      policyCid: this.policyCid,
      warnings: this.warnings,
      parseMethod: this.parseMethod,
      success: this.success,
    };
  }
}

// ---------------------------------------------------------------------------
// Compiler statistics
// ---------------------------------------------------------------------------

export interface CompilerStats {
  totalCompiled: number;
  succeeded: number;
  failed: number;
  totalClauses: number;
}

// ---------------------------------------------------------------------------
// GrammarNLPolicyCompiler
// ---------------------------------------------------------------------------

/**
 * Grammar-based NL → PolicyClause compiler.
 *
 * TypeScript port of `GrammarNLPolicyCompiler` from
 * `ipfs_datasets_py/logic/CEC/nl/grammar_nl_policy_compiler.py`.
 *
 * Uses `PatternMatcher` (regex-based) as the grammar engine since the full
 * DCECEnglishGrammar EBNF is not available in the TypeScript runtime without
 * a native bridge.
 */
export class GrammarNLPolicyCompiler {
  private readonly matcher = new PatternMatcher();
  private readonly stats: CompilerStats = { totalCompiled: 0, succeeded: 0, failed: 0, totalClauses: 0 };

  /**
   * Compile a single NL text string into policy clauses.
   */
  compile(text: string): GrammarCompilationResult {
    this.stats.totalCompiled++;
    const warnings: string[] = [];

    try {
      const matches = this.matcher.match(text);
      const clauses: PolicyClause[] = [];
      const formulaTriples: Array<[string, string, string]> = [];

      for (const m of matches) {
        let clauseType: ClauseType;
        switch (m.pattern.type) {
          case PatternType.OBLIGATION:
            clauseType = CLAUSE_TYPE_OBLIGATION; break;
          case PatternType.PERMISSION:
            clauseType = CLAUSE_TYPE_PERMISSION; break;
          case PatternType.PROHIBITION:
            clauseType = CLAUSE_TYPE_PROHIBITION; break;
          default:
            continue; // skip temporal/conditional/universal for policy clauses
        }

        const actor  = m.entities['agent'] ?? null;
        const action = m.entities['action'] ?? m.text;
        const resource = m.entities['resource'] ?? null;

        clauses.push({ clauseType, actor, action, resource, raw: m.text, confidence: m.confidence });
        if (actor) formulaTriples.push([actor, action, clauseType]);
      }

      if (clauses.length === 0) {
        warnings.push('No policy clauses detected; text may not contain deontic operators.');
      }

      const result = new GrammarCompilationResult({ text, clauses, warnings, parseMethod: 'pattern_fallback', formulaTriples });
      if (result.success) this.stats.succeeded++; else this.stats.failed++;
      this.stats.totalClauses += clauses.length;
      return result;
    } catch (err) {
      this.stats.failed++;
      warnings.push(`Compilation error: ${err}`);
      return new GrammarCompilationResult({ text, warnings, parseMethod: 'error' });
    }
  }

  /** Compile multiple texts in sequence. */
  compileBatch(texts: string[]): GrammarCompilationResult[] {
    return texts.map(t => this.compile(t));
  }

  getStats(): Readonly<CompilerStats> { return { ...this.stats }; }
}

// ---------------------------------------------------------------------------
// Module-level convenience
// ---------------------------------------------------------------------------

/**
 * Module-level convenience function mirroring `grammar_compile_nl_to_policy()`.
 */
export function grammarCompileNlToPolicy(text: string): GrammarCompilationResult {
  return new GrammarNLPolicyCompiler().compile(text);
}
