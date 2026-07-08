/**
 * deontic-logic-core.ts
 *
 * Extended deontic logic core types — a richer operator set than the basic O/P/F.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/converters/deontic_logic_core.py
 *
 * Provides:
 *   DeonticOperatorExt  — O/P/F/S/R/L/POW/IMM
 *   LogicConnective     — ∧/∨/¬/→/↔/∃/∀
 *   TemporalOperatorExt — □/◊/X/U/S
 *   LegalAgent          — identifier/name/agentType/properties
 *   DeonticContext      — jurisdiction/legalDomain/temporal
 *   ExtendedDeonticFormula — formula with full extended operators
 *   DeonticRuleSetExt   — collection of extended formulas with query
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum DeonticOperatorExt {
  OBLIGATION     = 'O',    // O(φ) — obligatory
  PERMISSION     = 'P',    // P(φ) — permitted
  PROHIBITION    = 'F',    // F(φ) — forbidden
  SUPEREROGATION = 'S',    // S(φ) — supererogatory (above duty)
  RIGHT          = 'R',    // R(φ) — a right
  LIBERTY        = 'L',    // L(φ) — a liberty/privilege
  POWER          = 'POW',  // POW(φ) — power to bring about
  IMMUNITY       = 'IMM',  // IMM(φ) — immunity from
}

export enum LogicConnective {
  AND            = '∧',
  OR             = '∨',
  NOT            = '¬',
  IMPLIES        = '→',
  BICONDITIONAL  = '↔',
  EXISTS         = '∃',
  FORALL         = '∀',
}

export enum TemporalOperatorExt {
  ALWAYS         = '□',
  EVENTUALLY     = '◊',
  NEXT           = 'X',
  UNTIL          = 'U',
  SINCE          = 'S',
}

// ---------------------------------------------------------------------------
// LegalAgent
// ---------------------------------------------------------------------------

export interface LegalAgent {
  identifier: string;
  name: string;
  agentType: 'person' | 'organization' | 'role' | 'government' | 'unknown';
  properties: Record<string, unknown>;
  toDict(): Record<string, unknown>;
}

export function makeLegalAgent(
  identifier: string,
  name: string,
  agentType: LegalAgent['agentType'] = 'unknown',
  properties: Record<string, unknown> = {},
): LegalAgent {
  return {
    identifier, name, agentType, properties,
    toDict() {
      return { identifier, name, agent_type: agentType, properties };
    },
  };
}

// ---------------------------------------------------------------------------
// DeonticContext
// ---------------------------------------------------------------------------

export interface DeonticContext {
  jurisdiction: string | null;
  legalDomain: string | null;
  temporalScope: { start?: string; end?: string } | null;
  agents: LegalAgent[];
}

export function makeContext(opts: Partial<DeonticContext> = {}): DeonticContext {
  return {
    jurisdiction: opts.jurisdiction ?? null,
    legalDomain: opts.legalDomain ?? null,
    temporalScope: opts.temporalScope ?? null,
    agents: opts.agents ?? [],
  };
}

// ---------------------------------------------------------------------------
// ExtendedDeonticFormula
// ---------------------------------------------------------------------------

export interface ExtendedDeonticFormula {
  formulaId: string;
  operator: DeonticOperatorExt;
  content: string;
  agent?: LegalAgent;
  conditions: string[];
  temporalOp?: TemporalOperatorExt;
  confidence: number;
  context?: DeonticContext;
  toDict(): Record<string, unknown>;
  toString(): string;
}

export function makeExtFormula(
  operator: DeonticOperatorExt,
  content: string,
  opts: {
    formulaId?: string;
    agent?: LegalAgent;
    conditions?: string[];
    temporalOp?: TemporalOperatorExt;
    confidence?: number;
    context?: DeonticContext;
  } = {},
): ExtendedDeonticFormula {
  const formulaId = opts.formulaId ??
    `${operator}:${content.slice(0, 20).replace(/\s+/g, '_')}`;
  const f: ExtendedDeonticFormula = {
    formulaId,
    operator,
    content,
    agent: opts.agent,
    conditions: opts.conditions ?? [],
    temporalOp: opts.temporalOp,
    confidence: opts.confidence ?? 0.9,
    context: opts.context,
    toDict() {
      return {
        formula_id: formulaId,
        operator,
        content,
        agent: opts.agent?.toDict() ?? null,
        conditions: opts.conditions ?? [],
        temporal_op: opts.temporalOp ?? null,
        confidence: opts.confidence ?? 0.9,
      };
    },
    toString() {
      const agentStr = opts.agent ? `[${opts.agent.name}]` : '';
      const temporal = opts.temporalOp ? `${opts.temporalOp}` : '';
      return `${temporal}${operator}${agentStr}(${content})`;
    },
  };
  return f;
}

// ---------------------------------------------------------------------------
// DeonticRuleSetExt
// ---------------------------------------------------------------------------

export class DeonticRuleSetExt {
  readonly name: string;
  private _formulas: ExtendedDeonticFormula[] = [];

  constructor(name: string, formulas: ExtendedDeonticFormula[] = []) {
    this.name = name;
    this._formulas = [...formulas];
  }

  get formulas(): readonly ExtendedDeonticFormula[] { return this._formulas; }
  get size(): number { return this._formulas.length; }

  addFormula(f: ExtendedDeonticFormula): void {
    this._formulas.push(f);
  }

  /** Query formulas by operator type. */
  query(operator: DeonticOperatorExt): ExtendedDeonticFormula[] {
    return this._formulas.filter(f => f.operator === operator);
  }

  /** Find formulas whose content contains `keyword`. */
  search(keyword: string): ExtendedDeonticFormula[] {
    const lower = keyword.toLowerCase();
    return this._formulas.filter(f => f.content.toLowerCase().includes(lower));
  }

  /** Get all obligation formulas. */
  obligations(): ExtendedDeonticFormula[] {
    return this.query(DeonticOperatorExt.OBLIGATION);
  }

  /** Get all permission formulas. */
  permissions(): ExtendedDeonticFormula[] {
    return this.query(DeonticOperatorExt.PERMISSION);
  }

  /** Get all prohibition formulas. */
  prohibitions(): ExtendedDeonticFormula[] {
    return this.query(DeonticOperatorExt.PROHIBITION);
  }

  toDict(): Record<string, unknown> {
    return {
      name: this.name,
      formula_count: this._formulas.length,
      by_operator: {
        O: this.obligations().length,
        P: this.permissions().length,
        F: this.prohibitions().length,
        S: this.query(DeonticOperatorExt.SUPEREROGATION).length,
        R: this.query(DeonticOperatorExt.RIGHT).length,
        L: this.query(DeonticOperatorExt.LIBERTY).length,
        POW: this.query(DeonticOperatorExt.POWER).length,
        IMM: this.query(DeonticOperatorExt.IMMUNITY).length,
      },
    };
  }
}

function coerceLegalAgent(agent: LegalAgent | string | undefined): LegalAgent | undefined {
  if (!agent) return undefined;
  if (typeof agent !== 'string') return agent;
  const id = agent.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'agent';
  return makeLegalAgent(id, agent, 'unknown');
}

function dateIsInvalid(value: string): boolean {
  return Number.isNaN(Date.parse(value));
}

export class DeonticLogicValidator {
  static validateFormula(formula: ExtendedDeonticFormula): string[] {
    const errors: string[] = [];
    if (!formula.content.trim()) errors.push('Formula must have a proposition');
    if (!Object.values(DeonticOperatorExt).includes(formula.operator)) {
      errors.push('Formula must have a valid deontic operator');
    }
    if (formula.confidence < 0 || formula.confidence > 1) {
      errors.push('Confidence must be between 0.0 and 1.0');
    }
    const temporalScope = formula.context?.temporalScope;
    if (temporalScope?.start && dateIsInvalid(temporalScope.start)) {
      errors.push('Invalid datetime format in temporal conditions');
    }
    if (temporalScope?.end && dateIsInvalid(temporalScope.end)) {
      errors.push('Invalid datetime format in temporal conditions');
    }
    if (temporalScope?.start && temporalScope?.end && Date.parse(temporalScope.start) >= Date.parse(temporalScope.end)) {
      errors.push('Start time must be before end time in temporal conditions');
    }
    return errors;
  }

  static validateRuleSet(ruleSet: DeonticRuleSetExt): string[] {
    const errors: string[] = [];
    if (!ruleSet.name.trim()) errors.push('Rule set must have a name');
    if (ruleSet.formulas.length === 0) errors.push('Rule set must contain at least one formula');
    ruleSet.formulas.forEach((formula, index) => {
      for (const error of DeonticLogicValidator.validateFormula(formula)) {
        errors.push(`Formula ${index}: ${error}`);
      }
    });
    for (let i = 0; i < ruleSet.formulas.length; i++) {
      for (let j = i + 1; j < ruleSet.formulas.length; j++) {
        const left = ruleSet.formulas[i];
        const right = ruleSet.formulas[j];
        if (left.content === right.content && left.agent?.identifier === right.agent?.identifier) {
          const ops = new Set([left.operator, right.operator]);
          if (ops.has(DeonticOperatorExt.OBLIGATION) && ops.has(DeonticOperatorExt.PROHIBITION)) {
            errors.push(`Consistency conflict: Direct conflict: obligation vs prohibition between formulas ${left.formulaId} and ${right.formulaId}`);
          }
          if (ops.has(DeonticOperatorExt.PERMISSION) && ops.has(DeonticOperatorExt.PROHIBITION)) {
            errors.push(`Consistency conflict: Conflict: permission vs prohibition between formulas ${left.formulaId} and ${right.formulaId}`);
          }
        }
      }
    }
    return errors;
  }

  static validate_formula(formula: ExtendedDeonticFormula): string[] {
    return DeonticLogicValidator.validateFormula(formula);
  }

  static validate_rule_set(ruleSet: DeonticRuleSetExt): string[] {
    return DeonticLogicValidator.validateRuleSet(ruleSet);
  }
}

export function createObligation(
  proposition: string,
  agent?: LegalAgent | string,
  conditions: string[] = [],
  opts: Omit<Parameters<typeof makeExtFormula>[2], 'agent' | 'conditions'> = {},
): ExtendedDeonticFormula {
  return makeExtFormula(DeonticOperatorExt.OBLIGATION, proposition, {
    ...opts,
    agent: coerceLegalAgent(agent),
    conditions,
  });
}

export function createPermission(
  proposition: string,
  agent?: LegalAgent | string,
  conditions: string[] = [],
  opts: Omit<Parameters<typeof makeExtFormula>[2], 'agent' | 'conditions'> = {},
): ExtendedDeonticFormula {
  return makeExtFormula(DeonticOperatorExt.PERMISSION, proposition, {
    ...opts,
    agent: coerceLegalAgent(agent),
    conditions,
  });
}

export function createProhibition(
  proposition: string,
  agent?: LegalAgent | string,
  conditions: string[] = [],
  opts: Omit<Parameters<typeof makeExtFormula>[2], 'agent' | 'conditions'> = {},
): ExtendedDeonticFormula {
  return makeExtFormula(DeonticOperatorExt.PROHIBITION, proposition, {
    ...opts,
    agent: coerceLegalAgent(agent),
    conditions,
  });
}

export function demonstrateDeonticLogic(): DeonticRuleSetExt {
  const contractor = makeLegalAgent('contractor_001', 'ABC Construction LLC', 'organization');
  const client = makeLegalAgent('client_001', 'City of Springfield', 'government');
  const context = makeContext({
    jurisdiction: 'State of Illinois',
    legalDomain: 'contract',
    agents: [contractor, client],
  });
  return new DeonticRuleSetExt('Springfield Construction Contract', [
    createObligation('complete_construction_work_by_deadline', contractor, ['contract_is_valid', 'no_force_majeure_events'], { context }),
    createPermission('inspect_construction_work', client, ['provide_24_hour_notice'], { context }),
    createProhibition('use_substandard_materials', contractor, [], { context }),
  ]);
}

export const create_obligation = createObligation;
export const create_permission = createPermission;
export const create_prohibition = createProhibition;
export const demonstrate_deontic_logic = demonstrateDeonticLogic;
