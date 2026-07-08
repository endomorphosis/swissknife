/**
 * Portuguese Deontic and F-Logic Types
 * Ports of: CEC/nl/portuguese_parser.py (181L),
 *           integration/reasoning/deontological_reasoning_types.py (164L),
 *           flogic/flogic_types.py (144L)
 */

// ---------------------------------------------------------------------------
// T-311a — Portuguese Parser (portuguese_parser.py)
// ---------------------------------------------------------------------------

export interface PortugueseDeonticKeywords {
  obligation:  string[];
  permission:  string[];
  prohibition: string[];
  negation:    string[];
}

export function getPortugueseDeonticKeywords(): PortugueseDeonticKeywords {
  return {
    obligation:  ['deve', 'deverá', 'tem de', 'é obrigado', 'é necessário'],
    permission:  ['pode', 'poderá', 'tem permissão', 'é permitido', 'está autorizado'],
    prohibition: ['não deve', 'não pode', 'é proibido', 'é vedado', 'não tem permissão'],
    negation:    ['não', 'nunca', 'jamais', 'sem'],
  };
}

export interface PortugueseClause {
  subject:    string;
  modalType:  'obligation' | 'permission' | 'prohibition' | 'unknown';
  predicate:  string;
  raw:        string;
}

export class PortugueseParser {
  private readonly keywords = getPortugueseDeonticKeywords();

  parse(text: string): PortugueseClause[] {
    const clauses: PortugueseClause[] = [];
    const sentences = text.split(/[.;]+/).map(s => s.trim()).filter(Boolean);

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      const modal = this._detectModal(lower);
      clauses.push({
        subject:   this._extractSubject(sentence),
        modalType: modal,
        predicate: this._extractPredicate(sentence),
        raw:       sentence,
      });
    }
    return clauses;
  }

  private _detectModal(text: string): PortugueseClause['modalType'] {
    for (const kw of this.keywords.prohibition) { if (text.includes(kw)) return 'prohibition'; }
    for (const kw of this.keywords.obligation)  { if (text.includes(kw)) return 'obligation';  }
    for (const kw of this.keywords.permission)  { if (text.includes(kw)) return 'permission';  }
    return 'unknown';
  }

  private _extractSubject(text: string): string {
    return text.split(' ')[0] ?? 'unknown';
  }

  private _extractPredicate(text: string): string {
    const words = text.split(' ');
    return words.slice(1).join(' ') || 'unknown';
  }
}

// ---------------------------------------------------------------------------
// T-311b — Deontological Reasoning Types (deontological_reasoning_types.py)
// ---------------------------------------------------------------------------

export enum DeonticModality {
  OBLIGATION  = 'O',
  PERMISSION  = 'P',
  PROHIBITION = 'F',
  WAIVER      = 'W',
}

export enum ConflictType {
  DIRECT       = 'direct',        // O(a,x) ∧ F(a,x)
  INDIRECT     = 'indirect',      // obligations that jointly imply a contradiction
  PRIORITY     = 'priority',      // lower-priority norm conflicts with higher
  TEMPORAL     = 'temporal',      // conflict only during certain time intervals
  AGENT_SCOPE  = 'agent_scope',   // different agents, overlapping scope
}

export interface DeonticStatement {
  id:       string;
  modality: DeonticModality;
  agent:    string;
  action:   string;
  context?: string;
  priority: number;
  source?:  string;
}

export interface DeonticConflict {
  id:           string;
  type:         ConflictType;
  statement1:   DeonticStatement;
  statement2:   DeonticStatement;
  description:  string;
  resolved:     boolean;
}

export function detectConflict(s1: DeonticStatement, s2: DeonticStatement): DeonticConflict | null {
  // Direct: O and F for same agent+action
  if (
    s1.agent === s2.agent && s1.action === s2.action &&
    ((s1.modality === DeonticModality.OBLIGATION && s2.modality === DeonticModality.PROHIBITION) ||
     (s1.modality === DeonticModality.PROHIBITION && s2.modality === DeonticModality.OBLIGATION))
  ) {
    return {
      id:          `conflict-${s1.id}-${s2.id}`,
      type:        ConflictType.DIRECT,
      statement1:  s1,
      statement2:  s2,
      description: `Direct conflict: ${s1.agent} must and must-not ${s1.action}`,
      resolved:    false,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// T-311c — FLogic Types (flogic_types.py)
// ---------------------------------------------------------------------------

export enum FLogicStatus {
  UNKNOWN   = 'unknown',
  PROVABLE  = 'provable',
  UNPROVABLE = 'unprovable',
  TIMEOUT   = 'timeout',
  ERROR     = 'error',
}

export interface FLogicFrame {
  frameId:    string;
  className:  string;
  attributes: Record<string, unknown>;
  methods:    Record<string, string>;
  inheritsFrom?: string[];
}

export interface FLogicClass {
  classId:     string;
  name:        string;
  superClasses: string[];
  frames:      FLogicFrame[];
}

export interface FLogicQuery {
  queryId:  string;
  formula:  string;
  binding:  Record<string, string>;
  timeout?: number;
}

export interface FLogicOntology {
  ontologyId:  string;
  name:        string;
  classes:     FLogicClass[];
  axioms:      string[];
  version:     string;
}

export function makeFrame(frameId: string, className: string, attributes: Record<string, unknown> = {}): FLogicFrame {
  return { frameId, className, attributes, methods: {} };
}

export function makeOntology(name: string): FLogicOntology {
  return { ontologyId: `onto-${name}`, name, classes: [], axioms: [], version: '1.0' };
}
