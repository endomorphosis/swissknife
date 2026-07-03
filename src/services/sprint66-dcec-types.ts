/**
 * Sprint 66 — DCEC Types + TPTP Utils + DCEC-to-UCAN Bridge
 * Ports of: CEC/native/dcec_types.py (385L),
 *           CEC/provers/tptp_utils.py (259L),
 *           CEC/nl/dcec_to_ucan_bridge.py (257L)
 */

// ---------------------------------------------------------------------------
// T-307a — DCEC Type Enums & Sorts (dcec_types.py)
// ---------------------------------------------------------------------------

export enum DeonticOperator {
  OBLIGATION  = 'O',   // O(agent, action)     must/shall
  PERMISSION  = 'P',   // P(agent, action)     may/can
  PROHIBITION = 'F',   // F(agent, action)     forbidden
  WAIVER      = 'W',   // W(agent, right)      waiver of right
}

export enum CognitiveOperator {
  KNOWS    = 'K',   // K(agent, phi)  agent knows phi
  BELIEVES = 'B',   // B(agent, phi)  agent believes phi
  DESIRES  = 'D',   // D(agent, phi)  agent desires phi
  INTENDS  = 'I',   // I(agent, phi)  agent intends phi
  GOAL     = 'G',   // PORT-095: G(agent, phi)  agent has goal phi (matches dcec-core-types.ts)
  // Note: Python has PERCEPTION='P' but that collides with DeonticOperator.PERMISSION='P' — intentionally omitted (PORT-097)
}

export enum LogicalConnective {
  AND         = '∧',
  OR          = '∨',
  NOT         = '¬',
  IMPLIES     = '→',
  BICONDITIONAL = '↔',
  XOR         = '⊕',
}

export enum TemporalOperator {
  ALWAYS    = 'G',   // globally
  EVENTUALLY = 'F',  // finally
  NEXT      = 'X',
  UNTIL     = 'U',
  SINCE     = 'S',
}

// ------ Sorts -----

export interface Sort { name: string; superSort?: string; description?: string }
export interface Variable { name: string; sort: Sort }
export interface DCECFunction  { name: string; argSorts: Sort[]; returnSort: Sort }
export interface DCECPredicate { name: string; argSorts: Sort[] }

export const BaseSort: Sort       = { name: 'Entity' };
export const AgentSort: Sort      = { name: 'Agent',  superSort: 'Entity' };
export const ActionSort: Sort     = { name: 'Action', superSort: 'Entity' };
export const TimeSort: Sort       = { name: 'Time',   superSort: 'Entity' };

export function makeVariable(name: string, sort: Sort = BaseSort): Variable { return { name, sort }; }
export function makeFunction(name: string, argSorts: Sort[], returnSort: Sort = BaseSort): DCECFunction {
  return { name, argSorts, returnSort };
}
export function makePredicate(name: string, argSorts: Sort[]): DCECPredicate { return { name, argSorts }; }

// ---------------------------------------------------------------------------
// T-307b — TPTP Utilities (tptp_utils.py)
// ---------------------------------------------------------------------------

export interface TPTPFormulaEntry { name: string; role: string; formula: string }
export interface TPTPProblem { name: string; axioms: TPTPFormulaEntry[]; conjectures: TPTPFormulaEntry[] }

/** Translate a symbolic formula string to TPTP notation (best-effort) */
export function formulaToTPTP(formula: string): string {
  return formula
    .replace(/∧/g,  ' & ')
    .replace(/∨/g,  ' | ')
    .replace(/¬/g,  '~')
    .replace(/→/g,  ' => ')
    .replace(/↔/g,  ' <=> ')
    .replace(/∀(\w+)/g, '![X$1]:')
    .replace(/∃(\w+)/g, '?[X$1]:')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createTPTPProblem(
  name: string,
  axioms: TPTPFormulaEntry[],
  conjectures: TPTPFormulaEntry[],
): string {
  const lines: string[] = [];
  for (const ax of axioms) {
    lines.push(`fof(${ax.name}, ${ax.role}, ${formulaToTPTP(ax.formula)}).`);
  }
  for (const c of conjectures) {
    lines.push(`fof(${c.name}, conjecture, ${formulaToTPTP(c.formula)}).`);
  }
  return lines.join('\n');
}

export class TPTPConverter {
  convert(formula: string): string { return formulaToTPTP(formula); }

  formatProblem(axioms: TPTPFormulaEntry[], conjectures: TPTPFormulaEntry[]): string {
    return createTPTPProblem('problem', axioms, conjectures);
  }

  parseRoles(tptpText: string): TPTPFormulaEntry[] {
    const results: TPTPFormulaEntry[] = [];
    // Match fof( name, role, <rest>) where rest can include nested parens
    const re = /fof\((\w+),\s*(\w+),\s*((?:[^()]+|\([^()]*\))+)\)\./g;
    for (const m of tptpText.matchAll(re)) {
      results.push({ name: m[1], role: m[2], formula: m[3].trim() });
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// T-307c — DCEC-to-UCAN Bridge (dcec_to_ucan_bridge.py)
// ---------------------------------------------------------------------------

export interface DenyCapability { resource: string; ability: string; reason?: string }
export interface BridgeResult { success: boolean; ucanClaims: unknown[]; errors: string[] }

export class DCECToUCANMapping {
  private readonly map = new Map<string, string>([
    ['O', 'ucan/obligation'],
    ['P', 'ucan/permission'],
    ['F', 'ucan/prohibition'],
  ]);

  abilityFor(operator: string, action: string): { resource: string; ability: string } {
    const ns = this.map.get(operator) ?? 'ucan/unknown';
    return { resource: action, ability: `${ns}/${action}` };
  }
}

export class DCECToUCANBridge {
  private readonly mapping = new DCECToUCANMapping();

  convert(formula: string): BridgeResult {
    const errors: string[] = [];
    const ucanClaims: unknown[] = [];

    // Simple pattern: O(agent, action) or F(agent, action)
    for (const m of formula.matchAll(/([OPF])\(([^,)]+),\s*([^)]+)\)/g)) {
      const [, op, agent, action] = m;
      const { resource, ability } = this.mapping.abilityFor(op, action.trim());
      ucanClaims.push({ issuer: agent.trim(), resource, ability });
    }

    if (ucanClaims.length === 0) errors.push('No mappable DCEC clauses found');

    return { success: ucanClaims.length > 0, ucanClaims, errors };
  }

  buildDenyCapability(resource: string, action: string, reason?: string): DenyCapability {
    return { resource, ability: `ucan/prohibition/${action}`, reason };
  }
}
