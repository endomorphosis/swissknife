/**
 * modal-logic-extension.ts
 *
 * Modal logic extensions for deontic formula classification and conversion.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/converters/modal_logic_extension.py
 *
 * Provides:
 *   ModalFormula          — modal formula with type + operators + confidence
 *   LogicClassification   — classification of a text's logic type
 *   AdvancedLogicConverter — convert text to modal formulas + classify
 *   convertToModal()      — convenience wrapper
 *   detectLogicType()     — convenience wrapper
 */

// ---------------------------------------------------------------------------
// ModalFormula
// ---------------------------------------------------------------------------

export type ModalType = 'alethic' | 'temporal' | 'deontic' | 'epistemic' | 'unknown';

export interface ModalFormula {
  formula: string;
  modalType: ModalType;
  operators: string[];
  baseFormula: string;
  confidence: number;
  semanticContext: Record<string, unknown>;
}

export function makeModalFormula(
  formula: string,
  modalType: ModalType,
  operators: string[],
  baseFormula: string,
  confidence: number,
  semanticContext: Record<string, unknown> = {},
): ModalFormula {
  return { formula, modalType, operators, baseFormula, confidence, semanticContext };
}

// ---------------------------------------------------------------------------
// LogicClassification
// ---------------------------------------------------------------------------

export interface LogicClassification {
  logicType: string;
  confidence: number;
  indicators: string[];
  context: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Type detection patterns
// ---------------------------------------------------------------------------

const DEONTIC_PATTERNS = /\b(shall|must|may|obligat|permit|prohibit|forbidden|duty|right|liability)\b/i;
const TEMPORAL_PATTERNS = /\b(always|eventually|until|since|next|before|after|when|during|□|◊)\b/i;
const EPISTEMIC_PATTERNS = /\b(believe|know|assert|assume|think|consider|hold that)\b/i;
const ALETHIC_PATTERNS   = /\b(necessarily|possibly|contingent|modal|□|◊|could|would)\b/i;

const DEONTIC_OPERATORS   = ['O', 'P', 'F'];
const TEMPORAL_OPERATORS  = ['□', '◊', 'U', 'S', 'X', 'G'];
const EPISTEMIC_OPERATORS = ['B', 'K', 'C'];
const ALETHIC_OPERATORS   = ['□', '◊', '∀', '∃'];

function classifyModalType(text: string): { type: ModalType; confidence: number; indicators: string[] } {
  const indicators: string[] = [];
  let maxScore = 0;
  let bestType: ModalType = 'unknown';

  const scores: Array<[ModalType, RegExp]> = [
    ['deontic',   DEONTIC_PATTERNS],
    ['temporal',  TEMPORAL_PATTERNS],
    ['epistemic', EPISTEMIC_PATTERNS],
    ['alethic',   ALETHIC_PATTERNS],
  ];

  for (const [type, pattern] of scores) {
    const matches = text.match(new RegExp(pattern.source, 'gi')) ?? [];
    if (matches.length > maxScore) {
      maxScore = matches.length;
      bestType = type;
      indicators.push(...matches.slice(0, 3));
    }
  }

  const confidence = Math.min(1.0, maxScore * 0.25 + 0.1);
  return { type: bestType, confidence, indicators: [...new Set(indicators)] };
}

function extractOperators(text: string, modalType: ModalType): string[] {
  const ops: string[] = [];
  const allOps =
    modalType === 'deontic'   ? DEONTIC_OPERATORS :
    modalType === 'temporal'  ? TEMPORAL_OPERATORS :
    modalType === 'epistemic' ? EPISTEMIC_OPERATORS :
    ALETHIC_OPERATORS;

  for (const op of allOps) {
    if (text.includes(op)) ops.push(op);
  }
  return ops;
}

// ---------------------------------------------------------------------------
// AdvancedLogicConverter
// ---------------------------------------------------------------------------

export class AdvancedLogicConverter {
  /**
   * Convert `text` to a `ModalFormula`.
   */
  toModal(text: string, confidenceThreshold = 0.0): ModalFormula {
    const { type, confidence, indicators } = classifyModalType(text);
    const operators = extractOperators(text, type);

    // Build a simplified modal formula expression
    const baseFormula = text.replace(/\s+/g, ' ').trim().slice(0, 80);
    let formula = baseFormula;
    if (type === 'deontic' && operators.length > 0) {
      formula = `${operators[0]}(${baseFormula.slice(0, 40)})`;
    } else if (type === 'temporal' && operators.length > 0) {
      formula = `${operators[0]}(${baseFormula.slice(0, 40)})`;
    }

    return makeModalFormula(formula, type, operators, baseFormula, confidence, {
      indicators,
      confidence_threshold: confidenceThreshold,
    });
  }

  /**
   * Classify the logic type of `text`.
   */
  classify(text: string): LogicClassification {
    const { type, confidence, indicators } = classifyModalType(text);
    return {
      logicType: type,
      confidence,
      indicators,
      context: { text_length: text.length },
    };
  }

  /**
   * Convert a list of texts to modal formulas.
   */
  convertBatch(texts: string[]): ModalFormula[] {
    return texts.map(t => this.toModal(t));
  }
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

const _converter = new AdvancedLogicConverter();

/** Convert `text` to a `ModalFormula`. */
export function convertToModal(text: string, confidenceThreshold = 0.7): ModalFormula {
  return _converter.toModal(text, confidenceThreshold);
}

/** Detect and classify the logic type of `text`. */
export function detectLogicType(text: string): LogicClassification {
  return _converter.classify(text);
}
