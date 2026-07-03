/**
 * legal-symbolic-analyzer.ts
 *
 * Legal text symbolic analysis — extracts deontic propositions, entities,
 * and temporal conditions from legal text.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/domain/legal_symbolic_analyzer.py
 *
 * Provides:
 *   LegalDomain           — enum of recognized legal domains
 *   DeonticOperator       — O | P | F
 *   LegalAnalysisResult   — full analysis result
 *   DeonticProposition    — extracted deontic statement
 *   LegalEntity           — identified legal entity
 *   TemporalCondition     — temporal constraint
 *   LegalSymbolicAnalyzer — main analyzer (heuristic, no ML deps)
 *   LegalReasoningEngine  — higher-level reasoning over analysis
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum LegalDomain {
  CONTRACT       = 'contract',
  CRIMINAL       = 'criminal',
  CONSTITUTIONAL = 'constitutional',
  ADMINISTRATIVE = 'administrative',
  CIVIL          = 'civil',
  REGULATORY     = 'regulatory',
  UNKNOWN        = 'unknown',
}

export enum DeonticOperator {
  OBLIGATION  = 'O',
  PERMISSION  = 'P',
  PROHIBITION = 'F',
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

export interface LegalAnalysisResult {
  legalDomain: LegalDomain | null;
  primaryParties: string[];
  legalConcepts: string[];
  deonticStatements: DeonticProposition[];
  temporalExpressions: string[];
  conditions: string[];
  confidence: number;
  reasoning: string;
}

export interface DeonticProposition {
  operator: DeonticOperator;
  agent: string | null;
  action: string;
  conditions: string[];
  confidence: number;
  sourceText: string;
  reasoning: string;
}

export interface LegalEntity {
  name: string;
  entityType: 'person' | 'organization' | 'government' | 'unknown';
  role: string;
  confidence: number;
  properties: Record<string, unknown>;
}

export interface TemporalCondition {
  expression: string;
  conditionType: 'deadline' | 'duration' | 'periodicity' | 'sequence' | 'unknown';
  confidence: number;
}

// ---------------------------------------------------------------------------
// Heuristic helpers
// ---------------------------------------------------------------------------

const OBLIGATION_PATTERNS = /\b(shall|must|required to|obligated to|mandated to|has a duty to)\b/i;
const PERMISSION_PATTERNS = /\b(may|is permitted to|is allowed to|is authorized to|is entitled to)\b/i;
const PROHIBITION_PATTERNS = /\b(shall not|must not|is prohibited from|is forbidden to|cannot)\b/i;
const TEMPORAL_PATTERNS = /\b(within \d+ days?|before [A-Z]\w+|after [A-Z]\w+|upon [a-z]+ing|annually|monthly|immediately|no later than)\b/i;
const ENTITY_PATTERNS = /\b(the contractor|the client|the party|the state|the agency|the court|the plaintiff|the defendant|the officer|the board|the commission)\b/gi;
const CONCEPT_PATTERNS = /\b(obligation|right|duty|liability|contract|agreement|penalty|fine|remedy|jurisdiction|warrant|consent)\b/gi;

const DOMAIN_SIGNALS: Array<[RegExp, LegalDomain]> = [
  [/\b(contract|agreement|breach|consideration|offer|acceptance)\b/i, LegalDomain.CONTRACT],
  [/\b(criminal|offense|felony|misdemeanor|conviction|sentence)\b/i, LegalDomain.CRIMINAL],
  [/\b(constitution|amendment|rights|due process|equal protection)\b/i, LegalDomain.CONSTITUTIONAL],
  [/\b(regulation|regulatory|agency|administrative|permit|license)\b/i, LegalDomain.REGULATORY],
  [/\b(civil|tort|negligence|damages|plaintiff|defendant)\b/i, LegalDomain.CIVIL],
];

function detectDomain(text: string): LegalDomain {
  for (const [pattern, domain] of DOMAIN_SIGNALS) {
    if (pattern.test(text)) return domain;
  }
  return LegalDomain.UNKNOWN;
}

function extractEntities(text: string): LegalEntity[] {
  const entities: LegalEntity[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(ENTITY_PATTERNS.source, 'gi');
  while ((m = re.exec(text)) !== null) {
    const name = m[0].replace(/^the\s+/i, '').trim();
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const entityType = /state|agency|court|board|commission|government/i.test(name) ? 'government'
      : /contractor|company|corporation|organization/i.test(name) ? 'organization'
      : 'person';
    entities.push({ name, entityType, role: key, confidence: 0.7, properties: {} });
  }
  return entities;
}

function extractDeonticPropositions(sentences: string[]): DeonticProposition[] {
  const props: DeonticProposition[] = [];
  for (const sent of sentences) {
    let operator: DeonticOperator;
    if (PROHIBITION_PATTERNS.test(sent)) operator = DeonticOperator.PROHIBITION;
    else if (PERMISSION_PATTERNS.test(sent)) operator = DeonticOperator.PERMISSION;
    else if (OBLIGATION_PATTERNS.test(sent)) operator = DeonticOperator.OBLIGATION;
    else continue;

    const agentMatch = sent.match(/^(?:the\s+)?(\w+(?:\s+\w+)?)\s+(?:shall|must|may|cannot)/i);
    const agent = agentMatch ? agentMatch[1].trim() : null;
    const action = sent.slice(0, 80).trim();
    const conditions = TEMPORAL_PATTERNS.test(sent)
      ? [sent.match(TEMPORAL_PATTERNS)![0]] : [];

    props.push({ operator, agent, action, conditions, confidence: 0.75, sourceText: sent, reasoning: 'heuristic_pattern_match' });
  }
  return props;
}

function extractTemporalConditionsInternal(text: string): TemporalCondition[] {
  const conditions: TemporalCondition[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(TEMPORAL_PATTERNS.source, 'gi');
  while ((m = re.exec(text)) !== null) {
    const expression = m[0];
    const conditionType = /\d+ days?|\d+ hours?|\d+ weeks?|no later than|within/.test(expression) ? 'deadline'
      : /annually|monthly|weekly|quarterly|periodically/.test(expression) ? 'periodicity'
      : /after|before|upon|prior to|sequence/.test(expression) ? 'sequence'
      : 'unknown';
    conditions.push({ expression, conditionType, confidence: 0.8 });
  }
  return conditions;
}

function extractConcepts(text: string): string[] {
  const concepts = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(CONCEPT_PATTERNS.source, 'gi');
  while ((m = re.exec(text)) !== null) concepts.add(m[0].toLowerCase());
  return [...concepts];
}

// ---------------------------------------------------------------------------
// LegalSymbolicAnalyzer
// ---------------------------------------------------------------------------

export class LegalSymbolicAnalyzer {
  /**
   * Analyze legal text and return a structured `LegalAnalysisResult`.
   * Uses heuristic patterns (no ML dependencies).
   */
  analyze(text: string): LegalAnalysisResult {
    if (!text?.trim()) {
      return {
        legalDomain: null, primaryParties: [], legalConcepts: [],
        deonticStatements: [], temporalExpressions: [], conditions: [],
        confidence: 0, reasoning: 'Empty input',
      };
    }

    const sentences = text.split(/[.;!?]/).map(s => s.trim()).filter(s => s.length > 5);
    const entities = extractEntities(text);
    const deonticStatements = extractDeonticPropositions(sentences);
    const temporalConditions = extractTemporalConditionsInternal(text);
    const concepts = extractConcepts(text);
    const domain = detectDomain(text);

    return {
      legalDomain: domain,
      primaryParties: entities.map(e => e.name),
      legalConcepts: concepts,
      deonticStatements,
      temporalExpressions: temporalConditions.map(t => t.expression),
      conditions: temporalConditions.map(t => t.expression),
      confidence: deonticStatements.length > 0 ? 0.75 : 0.4,
      reasoning: 'heuristic_pattern_analysis',
    };
  }

  /** Extract only deontic propositions from text. */
  extractDeonticPropositions(text: string): DeonticProposition[] {
    const sentences = text.split(/[.;!?]/).map(s => s.trim()).filter(s => s.length > 5);
    return extractDeonticPropositions(sentences);
  }

  /** Extract legal entities. */
  extractEntities(text: string): LegalEntity[] {
    return extractEntities(text);
  }

  /**
   * PORT-133: Public temporal condition extraction.
   * Classifies temporal expressions as deadline / periodicity / sequence / unknown.
   */
  extractTemporalConditions(text: string): TemporalCondition[] {
    return extractTemporalConditionsInternal(text);
  }
}

// ---------------------------------------------------------------------------
// LegalReasoningEngine
// ---------------------------------------------------------------------------

export interface ReasoningResult {
  query: string;
  answer: string;
  confidence: number;
  supportingFacts: string[];
  deonticImplications: string[];
}

export class LegalReasoningEngine {
  private analyzer: LegalSymbolicAnalyzer;

  constructor(analyzer?: LegalSymbolicAnalyzer) {
    this.analyzer = analyzer ?? new LegalSymbolicAnalyzer();
  }

  /**
   * Reason about a legal `query` given a `context` text.
   */
  reason(query: string, context: string): ReasoningResult {
    const analysis = this.analyzer.analyze(context);
    const queryLower = query.toLowerCase();
    const supportingFacts: string[] = [];
    const deonticImplications: string[] = [];

    // Match query terms to extracted propositions
    for (const prop of analysis.deonticStatements) {
      if (prop.action.toLowerCase().includes(queryLower.slice(0, 20))) {
        supportingFacts.push(prop.sourceText);
        deonticImplications.push(`${prop.operator}(${prop.action.slice(0, 40)})`);
      }
    }

    const answer = supportingFacts.length > 0
      ? `Found ${supportingFacts.length} relevant deontic statement(s) addressing: ${query}`
      : `No directly relevant deontic statements found for: ${query}`;

    return {
      query,
      answer,
      confidence: analysis.confidence,
      supportingFacts,
      deonticImplications,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function createLegalAnalyzer(): LegalSymbolicAnalyzer {
  return new LegalSymbolicAnalyzer();
}

export function createLegalReasoningEngine(): LegalReasoningEngine {
  return new LegalReasoningEngine();
}
