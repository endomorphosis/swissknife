/**
 * legal-domain-knowledge.ts
 *
 * Legal domain knowledge base — patterns for extracting deontic logic.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/domain/legal_domain_knowledge.py
 *
 * Provides:
 *   LegalConceptType     — enum: OBLIGATION | PERMISSION | PROHIBITION | ...
 *   DeonticOperatorKind  — O | P | F
 *   LegalPattern         — regex pattern + concept metadata
 *   AgentPattern         — pattern for identifying legal agents
 *   LegalDomainKnowledge — knowledge base with pattern collections
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum LegalConceptType {
  OBLIGATION       = 'obligation',
  PERMISSION       = 'permission',
  PROHIBITION      = 'prohibition',
  CONDITION        = 'condition',
  TEMPORAL         = 'temporal',
  AGENT            = 'agent',
  PENALTY          = 'penalty',
  EXEMPTION        = 'exemption',
  // PORT-132: Python-aligned values (RIGHT/DUTY/LIABILITY/EXCEPTION/DEFINITION)
  DUTY        = 'duty',          // equivalent to OBLIGATION
  RIGHT       = 'right',
  LIABILITY   = 'liability',
  EXCEPTION   = 'exception',
  DEFINITION  = 'definition',
}

export enum LegalDomainKind {
  CONTRACT       = 'contract',
  CRIMINAL       = 'criminal',
  CONSTITUTIONAL = 'constitutional',
  ADMINISTRATIVE = 'administrative',
  CIVIL          = 'civil',
  REGULATORY     = 'regulatory',
  // PORT-130: 9 additional domains matching Python legal_domain_knowledge.py
  TORT           = 'tort',
  CORPORATE      = 'corporate',
  EMPLOYMENT     = 'employment',
  INTELLECTUAL_PROPERTY = 'intellectual_property',
  REAL_ESTATE    = 'real_estate',
  FAMILY         = 'family',
  TAX            = 'tax',
  IMMIGRATION    = 'immigration',
  ENVIRONMENTAL  = 'environmental',
}

export type DeonticOperatorKind = 'O' | 'P' | 'F';

// ---------------------------------------------------------------------------
// LegalPattern
// ---------------------------------------------------------------------------

export interface LegalPattern {
  pattern: string;
  conceptType: LegalConceptType;
  deonticOperator: DeonticOperatorKind;
  confidence: number;
  domainSpecific?: LegalDomainKind;
  description: string;
  examples: string[];
  /** Test whether a text snippet matches this pattern. */
  match(text: string): boolean;
}

export function makeLegalPattern(
  pattern: string,
  conceptType: LegalConceptType,
  deonticOperator: DeonticOperatorKind,
  opts: { confidence?: number; description?: string; examples?: string[]; domainSpecific?: LegalDomainKind } = {},
): LegalPattern {
  const re = new RegExp(pattern, 'i');
  return {
    pattern, conceptType, deonticOperator,
    confidence: opts.confidence ?? 0.9,
    domainSpecific: opts.domainSpecific,
    description: opts.description ?? '',
    examples: opts.examples ?? [],
    match(text) { return re.test(text); },
  };
}

// ---------------------------------------------------------------------------
// AgentPattern
// ---------------------------------------------------------------------------

export interface AgentPattern {
  pattern: string;
  agentType: 'person' | 'organization' | 'role' | 'government';
  description: string;
  examples: string[];
  match(text: string): boolean;
}

export function makeAgentPattern(
  pattern: string,
  agentType: AgentPattern['agentType'],
  description = '',
  examples: string[] = [],
): AgentPattern {
  const re = new RegExp(pattern, 'i');
  return { pattern, agentType, description, examples, match(text) { return re.test(text); } };
}

// ---------------------------------------------------------------------------
// LegalDomainKnowledge
// ---------------------------------------------------------------------------

export class LegalDomainKnowledge {
  obligationPatterns: LegalPattern[];
  permissionPatterns: LegalPattern[];
  prohibitionPatterns: LegalPattern[];
  agentPatterns: AgentPattern[];
  conditionPatterns: LegalPattern[];
  temporalPatterns: LegalPattern[];

  constructor() {
    this.obligationPatterns = [
      makeLegalPattern(
        '\\b(?:shall|must|is required to|is obligated to|has a duty to|is bound to)\\b',
        LegalConceptType.OBLIGATION, 'O', { confidence: 0.95, description: 'Strong obligation indicators', examples: ['The contractor shall complete', 'Party must provide'] }),
      makeLegalPattern(
        '\\b(?:will|agrees to|undertakes to|commits to|promises to)\\b',
        LegalConceptType.OBLIGATION, 'O', { confidence: 0.80, description: 'Commitment language' }),
      makeLegalPattern(
        '\\b(?:is required|required to|needs to|has to)\\b',
        LegalConceptType.OBLIGATION, 'O', { confidence: 0.85, description: 'Requirement language' }),
    ];

    this.permissionPatterns = [
      makeLegalPattern(
        '\\b(?:may|is permitted to|is allowed to|is authorized to|is entitled to|has the right to)\\b',
        LegalConceptType.PERMISSION, 'P', { confidence: 0.95, description: 'Strong permission indicators' }),
      makeLegalPattern(
        '\\b(?:can|could|is able to|is free to|at its discretion)\\b',
        LegalConceptType.PERMISSION, 'P', { confidence: 0.75, description: 'Capability/discretion language' }),
    ];

    this.prohibitionPatterns = [
      makeLegalPattern(
        '\\b(?:shall not|must not|is prohibited from|is forbidden to|cannot|may not)\\b',
        LegalConceptType.PROHIBITION, 'F', { confidence: 0.95, description: 'Strong prohibition indicators' }),
      makeLegalPattern(
        '\\b(?:is not permitted|is not allowed|is not authorized|has no right to)\\b',
        LegalConceptType.PROHIBITION, 'F', { confidence: 0.90, description: 'Negated permission' }),
    ];

    this.agentPatterns = [
      makeAgentPattern('\\b(?:the contractor|contractor)\\b', 'organization', 'Contractor party', ['the contractor shall']),
      makeAgentPattern('\\b(?:the client|client)\\b', 'organization', 'Client party'),
      makeAgentPattern('\\b(?:the state|the government|the authority)\\b', 'government', 'Government entity'),
      makeAgentPattern('\\b(?:the party|all parties|each party)\\b', 'person', 'Generic party'),
      makeAgentPattern('\\b(?:the court|the tribunal|the judge)\\b', 'government', 'Judicial authority'),
      makeAgentPattern('\\b(?:the officer|the official|the agent)\\b', 'role', 'Official role'),
    ];

    this.conditionPatterns = [
      makeLegalPattern('\\b(?:if|when|provided that|subject to|on condition that|unless)\\b', LegalConceptType.CONDITION, 'O', { confidence: 0.85, description: 'Conditional clause indicators' }),
      makeLegalPattern('\\b(?:in the event that|in case of|upon the occurrence of)\\b', LegalConceptType.CONDITION, 'O', { confidence: 0.90, description: 'Event-based conditions' }),
    ];

    this.temporalPatterns = [
      makeLegalPattern('\\b(?:within \\d+ days?|within \\d+ hours?|within \\d+ weeks?)\\b', LegalConceptType.TEMPORAL, 'O', { confidence: 0.95, description: 'Deadline with numeric duration' }),
      makeLegalPattern('\\b(?:immediately|forthwith|without delay|promptly)\\b', LegalConceptType.TEMPORAL, 'O', { confidence: 0.90, description: 'Immediate action indicators' }),
      makeLegalPattern('\\b(?:annually|monthly|weekly|quarterly|periodically)\\b', LegalConceptType.TEMPORAL, 'O', { confidence: 0.90, description: 'Periodic action indicators' }),
      makeLegalPattern('\\b(?:before|after|upon|no later than|not before|prior to)\\b', LegalConceptType.TEMPORAL, 'O', { confidence: 0.85, description: 'Temporal relationship indicators' }),
    ];
  }

  /** Return all patterns (obligation + permission + prohibition). */
  getPatterns(): LegalPattern[] {
    return [...this.obligationPatterns, ...this.permissionPatterns, ...this.prohibitionPatterns];
  }

  /** Get patterns applicable to a specific legal domain. */
  patternsForDomain(domain: LegalDomainKind): LegalPattern[] {
    return this.getPatterns().filter(p => !p.domainSpecific || p.domainSpecific === domain);
  }

  /** Extract legal concepts (concept type + matched text) from a text. */
  extractConcepts(text: string): Array<{ conceptType: LegalConceptType; matchedText: string; confidence: number }> {
    const results: Array<{ conceptType: LegalConceptType; matchedText: string; confidence: number }> = [];
    const allPatterns = [...this.getPatterns(), ...this.conditionPatterns, ...this.temporalPatterns];
    for (const pattern of allPatterns) {
      const re = new RegExp(pattern.pattern, 'ig');
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        results.push({ conceptType: pattern.conceptType, matchedText: m[0], confidence: pattern.confidence });
      }
    }
    return results;
  }

  /** Identify legal agents in text. */
  identifyAgents(text: string): Array<{ agentType: AgentPattern['agentType']; matchedText: string }> {
    const results: Array<{ agentType: AgentPattern['agentType']; matchedText: string }> = [];
    for (const pattern of this.agentPatterns) {
      const re = new RegExp(pattern.pattern, 'ig');
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        results.push({ agentType: pattern.agentType, matchedText: m[0] });
      }
    }
    return results;
  }
}
