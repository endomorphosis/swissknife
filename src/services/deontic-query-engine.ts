/**
 * deontic-query-engine.ts
 *
 * Deontic logic query engine with compliance checking.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/domain/deontic_query_engine.py
 *
 * Provides:
 *   QueryType          — enum of supported query types
 *   DeonticFormula     — formula record with operator/agent/action
 *   DeonticRuleSet     — collection of formulas with metadata
 *   QueryResult        — result of a deontic query (toDict())
 *   ComplianceResult   — result of a compliance check (toDict())
 *   LogicConflict      — detected conflict between formulas
 *   DeonticQueryEngine — query engine with index-based lookup
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum QueryType {
  OBLIGATIONS          = 'obligations',
  PERMISSIONS          = 'permissions',
  PROHIBITIONS         = 'prohibitions',
  AGENT_DUTIES         = 'agent_duties',
  COMPLIANCE_CHECK     = 'compliance_check',
  TEMPORAL_CONSTRAINTS = 'temporal_constraints',
  CONFLICTS            = 'conflicts',
}

export enum DeonticOp {
  OBLIGATION  = 'O',
  PERMISSION  = 'P',
  PROHIBITION = 'F',
}

// ---------------------------------------------------------------------------
// DeonticFormula
// ---------------------------------------------------------------------------

export interface DeonticFormula {
  formulaId: string;
  operator: DeonticOp;
  agent: string;
  action: string;
  conditions: string[];
  temporal?: string;
  confidence: number;
  sourceText: string;
  toDict(): Record<string, unknown>;
}

export function makeDeonticFormula(
  operator: DeonticOp,
  agent: string,
  action: string,
  opts: { conditions?: string[]; temporal?: string; sourceText?: string; formulaId?: string; confidence?: number } = {},
): DeonticFormula {
  const formulaId = opts.formulaId ?? `${operator}:${agent}:${action.slice(0, 20).replace(/\s+/g, '_')}`;
  return {
    formulaId,
    operator, agent, action,
    conditions: opts.conditions ?? [],
    temporal: opts.temporal,
    confidence: opts.confidence ?? 0.9,
    sourceText: opts.sourceText ?? '',
    toDict() {
      return {
        formula_id: formulaId,
        operator, agent, action,
        conditions: opts.conditions ?? [],
        temporal: opts.temporal ?? null,
        confidence: opts.confidence ?? 0.9,
        source_text: opts.sourceText ?? '',
      };
    },
  };
}

// ---------------------------------------------------------------------------
// DeonticRuleSet
// ---------------------------------------------------------------------------

export interface DeonticRuleSet {
  name: string;
  formulas: DeonticFormula[];
  metadata: Record<string, unknown>;
}

export function makeRuleSet(name: string, formulas: DeonticFormula[] = []): DeonticRuleSet {
  return { name, formulas, metadata: {} };
}

// ---------------------------------------------------------------------------
// QueryResult
// ---------------------------------------------------------------------------

export class QueryResult {
  queryType: QueryType;
  matchingFormulas: DeonticFormula[];
  totalMatches: number;
  confidenceScores: number[];
  queryMetadata: Record<string, unknown>;
  reasoning: string;

  constructor(queryType: QueryType, formulas: DeonticFormula[] = [], reasoning = '') {
    this.queryType = queryType;
    this.matchingFormulas = formulas;
    this.totalMatches = formulas.length;
    this.confidenceScores = formulas.map(f => f.confidence);
    this.queryMetadata = {};
    this.reasoning = reasoning;
  }

  toDict(): Record<string, unknown> {
    return {
      query_type: this.queryType,
      total_matches: this.totalMatches,
      matching_formulas: this.matchingFormulas.map(f => f.toDict()),
      confidence_scores: this.confidenceScores,
      query_metadata: this.queryMetadata,
      reasoning: this.reasoning,
    };
  }
}

// ---------------------------------------------------------------------------
// ComplianceResult
// ---------------------------------------------------------------------------

export class ComplianceResult {
  isCompliant: boolean;
  complianceScore: number;
  violatedObligations: DeonticFormula[];
  missingPermissions: DeonticFormula[];
  violatedProhibitions: DeonticFormula[];
  reasoning: string;
  recommendations: string[];

  constructor(opts: {
    isCompliant: boolean;
    complianceScore?: number;
    violatedObligations?: DeonticFormula[];
    missingPermissions?: DeonticFormula[];
    violatedProhibitions?: DeonticFormula[];
    reasoning?: string;
    recommendations?: string[];
  }) {
    this.isCompliant = opts.isCompliant;
    this.complianceScore = opts.complianceScore ?? (opts.isCompliant ? 1.0 : 0.0);
    this.violatedObligations = opts.violatedObligations ?? [];
    this.missingPermissions = opts.missingPermissions ?? [];
    this.violatedProhibitions = opts.violatedProhibitions ?? [];
    this.reasoning = opts.reasoning ?? '';
    this.recommendations = opts.recommendations ?? [];
  }

  toDict(): Record<string, unknown> {
    return {
      is_compliant: this.isCompliant,
      compliance_score: this.complianceScore,
      violated_obligations: this.violatedObligations.map(f => f.toDict()),
      missing_permissions: this.missingPermissions.map(f => f.toDict()),
      violated_prohibitions: this.violatedProhibitions.map(f => f.toDict()),
      reasoning: this.reasoning,
      recommendations: this.recommendations,
    };
  }
}

// ---------------------------------------------------------------------------
// LogicConflict
// ---------------------------------------------------------------------------

export interface LogicConflict {
  conflictType: 'obligation_prohibition' | 'contradictory_permissions' | 'temporal_overlap' | 'unknown';
  formula1: DeonticFormula;
  formula2: DeonticFormula;
  explanation: string;
  severity: 'critical' | 'high' | 'warning' | 'medium' | 'low' | 'info';  // PORT-162: aligned with Python (critical/warning/info) + TS (high/medium/low)
}

// ---------------------------------------------------------------------------
// DeonticQueryEngine
// ---------------------------------------------------------------------------

export class DeonticQueryEngine {
  private ruleSet: DeonticRuleSet | null = null;
  private operatorIndex = new Map<DeonticOp, DeonticFormula[]>();
  private agentIndex = new Map<string, DeonticFormula[]>();

  constructor(ruleSet?: DeonticRuleSet) {
    if (ruleSet) this.loadRuleSet(ruleSet);
  }

  loadRuleSet(ruleSet: DeonticRuleSet): void {
    this.ruleSet = ruleSet;
    this._buildIndexes(ruleSet.formulas);
  }

  private _buildIndexes(formulas: DeonticFormula[]): void {
    this.operatorIndex.clear();
    this.agentIndex.clear();
    for (const f of formulas) {
      if (!this.operatorIndex.has(f.operator)) this.operatorIndex.set(f.operator, []);
      this.operatorIndex.get(f.operator)!.push(f);

      const agentKey = f.agent.toLowerCase();
      if (!this.agentIndex.has(agentKey)) this.agentIndex.set(agentKey, []);
      this.agentIndex.get(agentKey)!.push(f);
    }
  }

  /** Query the rule set by QueryType. */
  query(queryType: QueryType, agentFilter?: string): QueryResult {
    if (!this.ruleSet) return new QueryResult(queryType, [], 'No rule set loaded');

    let formulas: DeonticFormula[] = [];

    switch (queryType) {
      case QueryType.OBLIGATIONS:
        formulas = this.operatorIndex.get(DeonticOp.OBLIGATION) ?? [];
        break;
      case QueryType.PERMISSIONS:
        formulas = this.operatorIndex.get(DeonticOp.PERMISSION) ?? [];
        break;
      case QueryType.PROHIBITIONS:
        formulas = this.operatorIndex.get(DeonticOp.PROHIBITION) ?? [];
        break;
      case QueryType.AGENT_DUTIES:
        if (agentFilter) {
          formulas = this.agentIndex.get(agentFilter.toLowerCase()) ?? [];
        } else {
          formulas = [...(this.operatorIndex.get(DeonticOp.OBLIGATION) ?? [])];
        }
        break;
      case QueryType.CONFLICTS:
        return new QueryResult(queryType, [], `${this.detectConflicts().length} conflict(s) found`);
      case QueryType.TEMPORAL_CONSTRAINTS:
        formulas = (this.ruleSet.formulas).filter(f => f.temporal || f.conditions.some(c => /day|week|month|year|within|before|after/i.test(c)));
        break;
      case QueryType.COMPLIANCE_CHECK:
        formulas = [...this.ruleSet.formulas];
        break;
    }

    return new QueryResult(queryType, formulas, `Found ${formulas.length} matching formula(s)`);
  }

  /** Check whether an action by an agent complies with the rule set. */
  checkCompliance(action: string, agentName?: string): ComplianceResult {
    if (!this.ruleSet) {
      return new ComplianceResult({ isCompliant: true, reasoning: 'No rule set — nothing to check' });
    }

    const actionLower = action.toLowerCase();
    const agentKey = (agentName ?? '').toLowerCase();

    // Check prohibitions
    const prohibitions = this.operatorIndex.get(DeonticOp.PROHIBITION) ?? [];
    const violated = prohibitions.filter(f =>
      f.action.toLowerCase().includes(actionLower.slice(0, 20)) ||
      (agentKey && f.agent.toLowerCase() === agentKey && f.action.toLowerCase().includes(actionLower.slice(0, 10)))
    );

    if (violated.length > 0) {
      return new ComplianceResult({
        isCompliant: false,
        complianceScore: 0,
        violatedProhibitions: violated,
        reasoning: `Action "${action}" violates ${violated.length} prohibition(s)`,
        recommendations: violated.map(f => `Remove or revise: ${f.action}`),
      });
    }

    // Check obligations — agent must fulfill these
    const obligations = this.operatorIndex.get(DeonticOp.OBLIGATION) ?? [];
    const agentObl = agentKey ? obligations.filter(f => f.agent.toLowerCase() === agentKey) : [];

    return new ComplianceResult({
      isCompliant: true,
      complianceScore: 1.0,
      violatedObligations: [],
      reasoning: `Action "${action}" complies with all rules. ${agentObl.length} obligation(s) remain for agent.`,
    });
  }

  /** Detect conflicts between formulas in the rule set. */
  detectConflicts(): LogicConflict[] {
    const conflicts: LogicConflict[] = [];
    const all = this.ruleSet?.formulas ?? [];

    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const f1 = all[i], f2 = all[j];
        if (f1.agent === f2.agent && f1.action.toLowerCase() === f2.action.toLowerCase()) {
          if (
            (f1.operator === DeonticOp.OBLIGATION && f2.operator === DeonticOp.PROHIBITION) ||
            (f1.operator === DeonticOp.PROHIBITION && f2.operator === DeonticOp.OBLIGATION)
          ) {
            conflicts.push({
              conflictType: 'obligation_prohibition',
              formula1: f1,
              formula2: f2,
              explanation: `Agent "${f1.agent}" is both obligated and prohibited from "${f1.action}"`,
              severity: 'high',
            });
          }
        }
      }
    }
    return conflicts;
  }
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

export function createQueryEngine(ruleSet?: DeonticRuleSet): DeonticQueryEngine {
  return new DeonticQueryEngine(ruleSet);
}

// PORT-141: Convert action→proposition for Python⇄TS interchange
// Python DeonticFormula uses .proposition; TS uses .action
export function toPropositionField<T extends { action: string }>(formula: T): T & { proposition: string } {
  return { ...formula, proposition: formula.action };
}
export function fromPropositionField<T extends { proposition: string }>(formula: T): T & { action: string } {
  return { ...formula, action: formula.proposition };
}
