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
  // PORT-132: concept types from the Python reference (legal_domain_knowledge.py:36-49).
  RIGHT            = 'right',
  DUTY             = 'duty',
  LIABILITY        = 'liability',
  EXCEPTION        = 'exception',
  DEFINITION       = 'definition',
}

export enum LegalDomainKind {
  CONTRACT       = 'contract',
  CRIMINAL       = 'criminal',
  CONSTITUTIONAL = 'constitutional',
  ADMINISTRATIVE = 'administrative',
  CIVIL          = 'civil',
  REGULATORY     = 'regulatory',
  // PORT-130: domains from the Python reference (legal_domain_knowledge.py:21-33).
  TORT                  = 'tort',
  CORPORATE             = 'corporate',
  EMPLOYMENT            = 'employment',
  INTELLECTUAL_PROPERTY = 'intellectual_property',
  REAL_ESTATE           = 'real_estate',
  FAMILY                = 'family',
  TAX                   = 'tax',
  IMMIGRATION           = 'immigration',
  ENVIRONMENTAL         = 'environmental',
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
      // PORT-131: responsibility- and noun-based obligations (legal_domain_knowledge.py:114-129).
      makeLegalPattern(
        '\\b(?:responsible for|liable for|accountable for|in charge of)\\b',
        LegalConceptType.OBLIGATION, 'O', { confidence: 0.80, description: 'Responsibility-based obligations', examples: ['Company responsible for damages', 'Tenant liable for repairs'] }),
      makeLegalPattern(
        '\\b(?:duty|obligation|responsibility|requirement)\\s+(?:to|of)\\b',
        LegalConceptType.OBLIGATION, 'O', { confidence: 0.90, description: 'Noun-based obligation expressions', examples: ['duty to disclose', 'obligation of care'] }),
    ];

    this.permissionPatterns = [
      makeLegalPattern(
        '\\b(?:may|is permitted to|is allowed to|is authorized to|is entitled to|has the right to)\\b',
        LegalConceptType.PERMISSION, 'P', { confidence: 0.95, description: 'Strong permission indicators' }),
      makeLegalPattern(
        '\\b(?:can|could|is able to|is free to|at its discretion)\\b',
        LegalConceptType.PERMISSION, 'P', { confidence: 0.75, description: 'Capability/discretion language' }),
      // PORT-131: entitlement-, rights- and option-based permissions (legal_domain_knowledge.py:143-166).
      makeLegalPattern(
        '\\b(?:entitled to|eligible for|qualified for|empowered to)\\b',
        LegalConceptType.PERMISSION, 'P', { confidence: 0.90, description: 'Entitlement-based permissions', examples: ['Employee entitled to benefits', 'Shareholder eligible for dividends'] }),
      makeLegalPattern(
        '\\b(?:right|privilege|liberty|freedom|discretion)\\s+(?:to|of)\\b',
        LegalConceptType.PERMISSION, 'P', { confidence: 0.85, description: 'Rights-based permissions', examples: ['right to privacy', 'freedom of speech'] }),
      makeLegalPattern(
        '\\b(?:option|choice|alternative)\\s+(?:to|of)\\b',
        LegalConceptType.PERMISSION, 'P', { confidence: 0.75, description: 'Optional permissions', examples: ['option to renew', 'choice of law'] }),
    ];

    this.prohibitionPatterns = [
      makeLegalPattern(
        '\\b(?:shall not|must not|is prohibited from|is forbidden to|cannot|may not|is barred from)\\b',
        LegalConceptType.PROHIBITION, 'F', { confidence: 0.95, description: 'Strong prohibition indicators' }),
      makeLegalPattern(
        '\\b(?:is not permitted|is not allowed|is not authorized|has no right to)\\b',
        LegalConceptType.PROHIBITION, 'F', { confidence: 0.90, description: 'Negated permission' }),
      // PORT-131: adjective/verb, invalidity and violation-based prohibitions (legal_domain_knowledge.py:180-203).
      makeLegalPattern(
        '\\b(?:prohibited|forbidden|banned|barred|restricted|prevented)\\b',
        LegalConceptType.PROHIBITION, 'F', { confidence: 0.90, description: 'Prohibition adjectives/verbs', examples: ['prohibited from entering', 'restricted from access'] }),
      makeLegalPattern(
        '\\b(?:unlawful|illegal|invalid|void|null and void|unenforceable)\\b',
        LegalConceptType.PROHIBITION, 'F', { confidence: 0.85, description: 'Legal invalidity indicators', examples: ['unlawful to discriminate', 'void if violated'] }),
      makeLegalPattern(
        '\\b(?:violation|breach|infringement|non-compliance)\\s+(?:of|with)\\b',
        LegalConceptType.PROHIBITION, 'F', { confidence: 0.80, description: 'Violation-based prohibitions', examples: ['breach of contract', 'infringement of rights'] }),
    ];

    this.agentPatterns = [
      makeAgentPattern('\\b(?:the contractor|contractor)\\b', 'organization', 'Contractor party', ['the contractor shall']),
      makeAgentPattern('\\b(?:the client|client)\\b', 'organization', 'Client party'),
      makeAgentPattern('\\b(?:the state|the government|the authority)\\b', 'government', 'Government entity'),
      makeAgentPattern('\\b(?:the party|all parties|each party)\\b', 'person', 'Generic party'),
      makeAgentPattern('\\b(?:the court|the tribunal|the judge)\\b', 'government', 'Judicial authority'),
      makeAgentPattern('\\b(?:the officer|the official|the agent)\\b', 'role', 'Official role'),
      // PORT-131: transactional/role agents from the Python reference (legal_domain_knowledge.py:215-267).
      makeAgentPattern('\\b(?:buyer|purchaser|vendee|acquirer)\\b', 'person', 'Purchasing party in transactions', ['the buyer shall pay']),
      makeAgentPattern('\\b(?:seller|vendor|grantor|transferor)\\b', 'person', 'Selling party in transactions', ['the seller warrants']),
      makeAgentPattern('\\b(?:landlord|lessor|owner)\\b', 'person', 'Property owner/lessor', ['landlord shall maintain']),
      makeAgentPattern('\\b(?:tenant|lessee|renter|occupant)\\b', 'person', 'Property tenant/lessee', ['tenant must pay']),
      makeAgentPattern('\\b(?:employer|company|corporation|business|enterprise)\\b', 'organization', 'Business entities', ['employer shall provide']),
      makeAgentPattern('\\b(?:employee|worker|staff|personnel)\\b', 'person', 'Workers/employees', ['employee must comply']),
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
