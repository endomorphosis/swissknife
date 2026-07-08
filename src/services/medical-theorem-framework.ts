/**
 * medical-theorem-framework.ts
 *
 * Medical theorem generation and validation.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/domain/medical_theorem_framework.py
 *
 * Provides:
 *   MedicalTheoremType    — causal/risk/treatment/population/temporal/adverse
 *   ConfidenceLevel       — VERY_HIGH/HIGH/MODERATE/LOW/VERY_LOW
 *   MedicalEntity         — entity in a medical theorem
 *   TemporalConstraint    — time-related constraint
 *   MedicalTheorem        — a complete medical theorem
 *   MedicalTheoremGenerator — generate and validate theorems from text
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum MedicalTheoremType {
  CAUSAL_RELATIONSHIP  = 'causal',
  RISK_ASSESSMENT      = 'risk',
  TREATMENT_OUTCOME    = 'treatment',
  POPULATION_EFFECT    = 'population',
  TEMPORAL_PROGRESSION = 'temporal',
  ADVERSE_EVENT        = 'adverse',
}

export enum ConfidenceLevel {
  VERY_HIGH = 'very_high',  // > 90%
  HIGH      = 'high',       // 75–90%
  MODERATE  = 'moderate',   // 50–75%
  LOW       = 'low',        // 25–50%
  VERY_LOW  = 'very_low',   // < 25%
}

function scoreToLevel(score: number): ConfidenceLevel {
  if (score >= 0.9) return ConfidenceLevel.VERY_HIGH;
  if (score >= 0.75) return ConfidenceLevel.HIGH;
  if (score >= 0.5) return ConfidenceLevel.MODERATE;
  if (score >= 0.25) return ConfidenceLevel.LOW;
  return ConfidenceLevel.VERY_LOW;
}

// ---------------------------------------------------------------------------
// MedicalEntity
// ---------------------------------------------------------------------------

export interface MedicalEntity {
  entityType: 'substance' | 'condition' | 'treatment' | 'outcome' | 'population' | 'unknown';
  name: string;
  properties: Record<string, unknown>;
}

export function makeMedicalEntity(
  name: string,
  entityType: MedicalEntity['entityType'] = 'unknown',
  properties: Record<string, unknown> = {},
): MedicalEntity {
  return { name, entityType, properties };
}

// ---------------------------------------------------------------------------
// TemporalConstraint
// ---------------------------------------------------------------------------

export interface TemporalConstraint {
  timeToEffectDays?: number;
  durationDays?: number;
  timeWindowDays?: number;
  temporalOperator: 'before' | 'after' | 'during' | 'within' | 'unknown';
}

export function makeTemporalConstraint(
  temporalOperator: TemporalConstraint['temporalOperator'] = 'unknown',
  opts: Omit<TemporalConstraint, 'temporalOperator'> = {},
): TemporalConstraint {
  return { temporalOperator, ...opts };
}

// ---------------------------------------------------------------------------
// MedicalTheorem
// ---------------------------------------------------------------------------

export class MedicalTheorem {
  readonly theoremId: string;
  readonly theoremType: MedicalTheoremType;
  readonly subject: MedicalEntity;
  readonly predicate: string;
  readonly object: MedicalEntity;
  readonly confidence: number;
  readonly confidenceLevel: ConfidenceLevel;
  readonly temporalConstraint: TemporalConstraint | null;
  readonly populationContext: string;
  readonly evidenceStrength: string;
  readonly sourceText: string;

  constructor(opts: {
    theoremId: string;
    theoremType: MedicalTheoremType;
    subject: MedicalEntity;
    predicate: string;
    object: MedicalEntity;
    confidence?: number;
    temporalConstraint?: TemporalConstraint | null;
    populationContext?: string;
    evidenceStrength?: string;
    sourceText?: string;
  }) {
    this.theoremId = opts.theoremId;
    this.theoremType = opts.theoremType;
    this.subject = opts.subject;
    this.predicate = opts.predicate;
    this.object = opts.object;
    this.confidence = opts.confidence ?? 0.5;
    this.confidenceLevel = scoreToLevel(this.confidence);
    this.temporalConstraint = opts.temporalConstraint ?? null;
    this.populationContext = opts.populationContext ?? 'general';
    this.evidenceStrength = opts.evidenceStrength ?? 'observational';
    this.sourceText = opts.sourceText ?? '';
  }

  /** Render as a logical formula string. */
  toFormula(): string {
    const tc = this.temporalConstraint;
    const temporal = tc ? ` [${tc.temporalOperator}]` : '';
    return `${this.theoremType.toUpperCase()}(${this.subject.name}, ${this.predicate}, ${this.object.name})${temporal}`;
  }

  toDict(): Record<string, unknown> {
    return {
      theorem_id: this.theoremId,
      theorem_type: this.theoremType,
      subject: this.subject,
      predicate: this.predicate,
      object: this.object,
      confidence: this.confidence,
      confidence_level: this.confidenceLevel,
      temporal_constraint: this.temporalConstraint,
      population_context: this.populationContext,
      evidence_strength: this.evidenceStrength,
      formula: this.toFormula(),
    };
  }
}

// ---------------------------------------------------------------------------
// Pattern detection
// ---------------------------------------------------------------------------

const CAUSAL_RE    = /\b(causes|leads to|results in|produces|induces)\b/i;
const RISK_RE      = /\b(increases risk|decreases risk|associated with|risk factor)\b/i;
const TREATMENT_RE = /\b(treats|reduces|improves|relieves|therapy|treatment)\b/i;
const TEMPORAL_RE  = /\b(after|before|within|during|following)\b/i;
const ADVERSE_RE   = /\b(side effect|adverse|complication|contraindicated)\b/i;

function detectTheoremType(text: string): MedicalTheoremType {
  if (ADVERSE_RE.test(text))    return MedicalTheoremType.ADVERSE_EVENT;
  if (CAUSAL_RE.test(text))     return MedicalTheoremType.CAUSAL_RELATIONSHIP;
  if (RISK_RE.test(text))       return MedicalTheoremType.RISK_ASSESSMENT;
  if (TREATMENT_RE.test(text))  return MedicalTheoremType.TREATMENT_OUTCOME;
  if (TEMPORAL_RE.test(text))   return MedicalTheoremType.TEMPORAL_PROGRESSION;
  return MedicalTheoremType.POPULATION_EFFECT;
}

function extractEntities(text: string): { subject: MedicalEntity; object: MedicalEntity; predicate: string } {
  const words = text.split(/\s+/);
  const subject = makeMedicalEntity(words[0] ?? 'Substance', 'substance');
  const obj = makeMedicalEntity(words[words.length - 1] ?? 'Outcome', 'outcome');
  const verbMatch = text.match(/\b(causes|leads to|treats|reduces|increases|associated with|side effect)\b/i);
  const predicate = verbMatch ? verbMatch[1] : 'relates_to';
  return { subject, object: obj, predicate };
}

let _theoremCounter = 0;

// ---------------------------------------------------------------------------
// MedicalTheoremGenerator
// ---------------------------------------------------------------------------

export class MedicalTheoremGenerator {
  /**
   * Generate a MedicalTheorem from a text snippet.
   */
  generateFromText(text: string): MedicalTheorem {
    const theoremType = detectTheoremType(text);
    const { subject, object, predicate } = extractEntities(text);
    const temporalMatch = text.match(TEMPORAL_RE);
    const temporalConstraint = temporalMatch
      ? makeTemporalConstraint(temporalMatch[1].toLowerCase() as TemporalConstraint['temporalOperator'])
      : null;

    // Confidence heuristic: more specific keywords → higher confidence
    const keywordCount = [CAUSAL_RE, RISK_RE, TREATMENT_RE].filter(re => re.test(text)).length;
    const confidence = Math.min(0.9, 0.4 + keywordCount * 0.2);

    return new MedicalTheorem({
      theoremId: `med:thm:${++_theoremCounter}`,
      theoremType,
      subject,
      predicate,
      object,
      confidence,
      temporalConstraint,
      sourceText: text.slice(0, 150),
    });
  }

  /**
   * Validate a theorem for internal consistency.
   */
  validateTheorem(theorem: MedicalTheorem): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!theorem.subject.name) errors.push('Subject name is empty');
    if (!theorem.object.name) errors.push('Object name is empty');
    if (!theorem.predicate) errors.push('Predicate is empty');
    if (theorem.confidence < 0 || theorem.confidence > 1) errors.push('Confidence out of [0, 1]');
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Generate theorems from a list of texts.
   */
  generateBatch(texts: string[]): MedicalTheorem[] {
    return texts.map(t => this.generateFromText(t));
  }
}

// ---------------------------------------------------------------------------
// FuzzyLogicValidator (simplified)
// ---------------------------------------------------------------------------

export class FuzzyLogicValidator {
  /** Validate a theorem with fuzzy confidence scoring. */
  validate(theorem: MedicalTheorem, threshold = 0.5): { valid: boolean; fuzzyScore: number } {
    const fuzzyScore = theorem.confidence;
    return { valid: fuzzyScore >= threshold, fuzzyScore };
  }
}
