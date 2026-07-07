/**
 * LegalNormDecoder — deterministic text renderer for `LegalNormIR`.
 *
 * Mirrors ipfs_datasets_py/logic/deontic/decoder.py (932 lines):
 *   decode_legal_norm_ir(norm) → DecodedLegalText
 *   decoded_phrase_slot_text_map(decoded, opts?) → Record<string,string[]>
 *   _decode_deontic_clause(), _decode_definition(), _decode_applicability(),
 *   _decode_exemption(), _decode_lifecycle(), _decode_penalty()
 *
 * The decoder is intentionally conservative — it renders normalized legal text
 * from `LegalNormIR` slots and fixed grammar templates only.  No heuristics,
 * NLP, or LLM calls.  Each phrase is tagged with a slot name for provenance.
 *
 * Sprint 17, T-93.
 * Reference: ipfs_datasets_py/logic/deontic/decoder.py §decode_legal_norm_ir
 */

import type { LegalNormIR } from './legal-norm-ir.js';

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/** One phrase in a decoded legal sentence. */
export interface DecodedPhrase {
  readonly text:            string;
  /** Source slot name in `LegalNormIR`. */
  readonly slot:            string;
  /** Character spans within source_text where this phrase appears. */
  readonly spans:           Array<[number, number]>;
  /** True for fixed grammar words (connectors, punctuation). */
  readonly fixed:           boolean;
  /** True for provenance-only phrases (not rendered in output text). */
  readonly provenance_only: boolean;
}

/** Decoded text with source-grounding metadata. */
export interface DecodedLegalText {
  readonly source_id:        string;
  readonly text:             string;
  readonly phrases:          DecodedPhrase[];
  readonly support_span:     [number, number];
  readonly parser_warnings:  string[];
  readonly missing_slots:    string[];
}

// ---------------------------------------------------------------------------
// Core entry point
// ---------------------------------------------------------------------------

/**
 * Render normalized legal text from a `LegalNormIR`.
 *
 * Python ref: `decode_legal_norm_ir(norm)`.
 */
export function decodeLegalNormIR(norm: LegalNormIR): DecodedLegalText {
  let phrases: DecodedPhrase[];
  let missing: string[];

  if (norm.modality === 'DEF' || norm.norm_type === 'definition') {
    [phrases, missing] = _decodeDefinition(norm);
  } else if (norm.modality === 'APP' || norm.norm_type === 'applicability') {
    [phrases, missing] = _decodeApplicability(norm);
  } else if (norm.modality === 'EXEMPT' || norm.norm_type === 'exemption') {
    [phrases, missing] = _decodeExemption(norm);
  } else if (norm.modality === 'LIFE' || norm.norm_type === 'instrument_lifecycle') {
    [phrases, missing] = _decodeLifecycle(norm);
  } else if (norm.norm_type === 'penalty') {
    [phrases, missing] = _decodePenalty(norm);
  } else {
    [phrases, missing] = _decodeDeonticClause(norm);
  }

  return {
    source_id:       norm.source_id,
    text:            _sentenceFromPhrases(phrases),
    phrases,
    support_span:    [norm.support_span.start, norm.support_span.end],
    parser_warnings: [...norm.quality.parser_warnings],
    missing_slots:   missing,
  };
}

/**
 * Return decoded phrase texts grouped by source slot.
 *
 * Python ref: `decoded_phrase_slot_text_map(decoded, ...)`.
 */
export function decodedPhraseSlotTextMap(
  decoded: DecodedLegalText,
  opts: { includeFixed?: boolean; includeProvenanceOnly?: boolean } = {},
): Record<string, string[]> {
  const { includeFixed = false, includeProvenanceOnly = true } = opts;
  const result: Record<string, string[]> = {};

  for (const phrase of decoded.phrases) {
    if (phrase.fixed && !includeFixed) continue;
    if (phrase.provenance_only && !includeProvenanceOnly) continue;

    const slot = (phrase.slot ?? '').trim();
    const text = _clean(phrase.text);
    if (!slot || !text) continue;

    if (!result[slot]) result[slot] = [];
    if (!result[slot].includes(text)) result[slot].push(text);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Modality → modal phrase
// ---------------------------------------------------------------------------

function _modalPhrase(modality: string): string {
  const m = modality.toUpperCase();
  if (m === 'O' || m === 'OBLIGATION' || m === 'SHALL' || m === 'MUST') return 'must';
  if (m === 'P' || m === 'PERMISSION' || m === 'MAY')  return 'may';
  if (m === 'F' || m === 'PROHIBITION' || m === 'FORBIDDEN') return 'must not';
  if (m === 'SHOULD') return 'should';
  return modality.toLowerCase();
}

// ---------------------------------------------------------------------------
// Deontic clause decoder
// ---------------------------------------------------------------------------

function _decodeDeonticClause(norm: LegalNormIR): [DecodedPhrase[], string[]] {
  const phrases: DecodedPhrase[] = [];
  const missing: string[] = [];

  const actor     = _clean(norm.actor);
  const action    = _clean(_stripLeadingModal(norm.action));
  const recipient = _clean(norm.recipient);
  const modal     = _modalPhrase(norm.modality);

  // Overrides
  for (const override of norm.overrides) {
    const text = _slotText(override);
    if (!text) continue;
    if (text.toLowerCase().startsWith('notwithstanding ')) {
      phrases.push(_detail(text, 'overrides'));
    } else {
      phrases.push(_fixed('notwithstanding', 'override_connector'));
      phrases.push(_detail(text, 'overrides'));
    }
    phrases.push(_fixed(',', 'override_punctuation'));
  }

  if (actor) {
    phrases.push(_phrase(actor, 'actor'));
  } else {
    missing.push('actor');
  }

  if (modal) {
    phrases.push(_phrase(modal, 'modality'));
  } else {
    missing.push('modality');
  }

  if (action) {
    phrases.push(_phrase(action, 'action'));
  } else {
    missing.push('action');
  }

  if (recipient && !_contains(action, recipient)) {
    phrases.push(_fixed('to', 'recipient_connector'));
    phrases.push(_phrase(recipient, 'recipient'));
  }

  // Conditions
  let renderedConditions = 0;
  for (const cond of norm.conditions) {
    const text = _conditionText(cond);
    if (text) {
      phrases.push(_fixed(_condConnector(cond, renderedConditions), 'condition_connector'));
      phrases.push(_detail(text, 'conditions'));
      renderedConditions++;
    }
  }

  // Temporal constraints
  let renderedTemporal = 0;
  for (const tc of norm.temporal_constraints) {
    const text = _temporalText(tc);
    if (text && !_contains(action, text)) {
      if (renderedConditions + renderedTemporal > 0) {
        phrases.push(_fixed('and', 'temporal_connector'));
      }
      phrases.push(_detail(text, 'temporal_constraints'));
      renderedTemporal++;
    }
  }

  // Exceptions
  let renderedExceptions = 0;
  for (const exc of norm.exceptions) {
    const text = _exceptionText(exc);
    if (text) {
      phrases.push(_fixed(_excConnector(exc, renderedExceptions), 'exception_connector'));
      phrases.push(_detail(text, 'exceptions'));
      renderedExceptions++;
    }
  }

  return [phrases, missing];
}

// ---------------------------------------------------------------------------
// Definition decoder
// ---------------------------------------------------------------------------

function _decodeDefinition(norm: LegalNormIR): [DecodedPhrase[], string[]] {
  const phrases: DecodedPhrase[] = [];
  const missing: string[] = [];

  const actor  = _clean(norm.actor);
  const action = _clean(norm.action);

  if (actor) {
    phrases.push(_phrase(actor, 'actor'));
  } else {
    missing.push('actor');
  }
  phrases.push(_fixed('means', 'definition_connector'));
  if (action) {
    phrases.push(_phrase(action, 'action'));
  } else {
    missing.push('action');
  }

  return [phrases, missing];
}

// ---------------------------------------------------------------------------
// Applicability decoder
// ---------------------------------------------------------------------------

function _decodeApplicability(norm: LegalNormIR): [DecodedPhrase[], string[]] {
  const phrases: DecodedPhrase[] = [];
  const missing: string[] = [];

  phrases.push(_fixed('This section applies to', 'applicability_prefix'));
  const actor = _clean(norm.actor);
  if (actor) {
    phrases.push(_phrase(actor, 'actor'));
  } else {
    missing.push('actor');
  }
  for (const cond of norm.conditions) {
    const text = _conditionText(cond);
    if (text) {
      phrases.push(_fixed('when', 'condition_connector'));
      phrases.push(_detail(text, 'conditions'));
    }
  }

  return [phrases, missing];
}

// ---------------------------------------------------------------------------
// Exemption decoder
// ---------------------------------------------------------------------------

function _decodeExemption(norm: LegalNormIR): [DecodedPhrase[], string[]] {
  const phrases: DecodedPhrase[] = [];
  const missing: string[] = [];

  const actor  = _clean(norm.actor);
  const action = _clean(norm.action);

  if (actor) {
    phrases.push(_phrase(actor, 'actor'));
  } else {
    missing.push('actor');
  }
  phrases.push(_fixed('is not required to', 'exemption_modal'));
  if (action) {
    phrases.push(_phrase(action, 'action'));
  } else {
    missing.push('action');
  }
  for (const cond of norm.conditions) {
    const text = _conditionText(cond);
    if (text) {
      phrases.push(_fixed('when', 'condition_connector'));
      phrases.push(_detail(text, 'conditions'));
    }
  }

  return [phrases, missing];
}

// ---------------------------------------------------------------------------
// Lifecycle decoder (stub)
// ---------------------------------------------------------------------------

function _decodeLifecycle(norm: LegalNormIR): [DecodedPhrase[], string[]] {
  const phrases: DecodedPhrase[] = [];
  const missing: string[] = [];
  const actor  = _clean(norm.actor);
  const action = _clean(norm.action);
  if (actor)  phrases.push(_phrase(actor, 'actor'));  else missing.push('actor');
  if (action) phrases.push(_phrase(action, 'action')); else missing.push('action');
  return [phrases, missing];
}

// ---------------------------------------------------------------------------
// Penalty decoder (stub)
// ---------------------------------------------------------------------------

function _decodePenalty(norm: LegalNormIR): [DecodedPhrase[], string[]] {
  const phrases: DecodedPhrase[] = [];
  const missing: string[] = [];
  const amount = _clean(String((norm.penalty['amount'] as string | undefined) ?? ''));
  if (amount) {
    phrases.push(_fixed('A penalty of', 'penalty_prefix'));
    phrases.push(_phrase(amount, 'penalty'));
    phrases.push(_fixed('may be imposed.', 'penalty_suffix'));
  } else {
    missing.push('penalty_amount');
  }
  return [phrases, missing];
}

// ---------------------------------------------------------------------------
// Phrase helpers
// ---------------------------------------------------------------------------

function _phrase(text: string, slot: string): DecodedPhrase {
  return { text: text.trim(), slot, spans: [], fixed: false, provenance_only: false };
}

function _fixed(text: string, slot: string): DecodedPhrase {
  return { text: text.trim(), slot, spans: [], fixed: true, provenance_only: false };
}

function _detail(text: string, slot: string): DecodedPhrase {
  return { text: text.trim(), slot, spans: [], fixed: false, provenance_only: false };
}

// ---------------------------------------------------------------------------
// Sentence assembly
// ---------------------------------------------------------------------------

function _sentenceFromPhrases(phrases: DecodedPhrase[]): string {
  const words = phrases
    .filter(p => !p.provenance_only)
    .map(p => p.text.trim())
    .filter(Boolean);

  let sentence = words.join(' ').replace(/\s+([.,;!?])/g, '$1').trim();
  if (sentence && !/[.!?]$/.test(sentence)) sentence += '.';
  // Capitalise first letter
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

// ---------------------------------------------------------------------------
// Slot text extractors
// ---------------------------------------------------------------------------

function _slotText(slot: Record<string, unknown>): string {
  for (const key of ['text', 'value', 'content', 'description']) {
    const v = slot[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function _conditionText(cond: Record<string, unknown>): string {
  return _slotText(cond) || _clean(String(cond['condition'] ?? ''));
}

function _temporalText(tc: Record<string, unknown>): string {
  return _slotText(tc) || _clean(String(tc['constraint'] ?? ''));
}

function _exceptionText(exc: Record<string, unknown>): string {
  return _slotText(exc) || _clean(String(exc['exception'] ?? ''));
}

function _condConnector(cond: Record<string, unknown>, rendered: number): string {
  const ct = String(cond['condition_type'] ?? '').toLowerCase();
  if (ct === 'when' || ct === 'if_then') return rendered === 0 ? 'when' : 'and when';
  return rendered === 0 ? 'if' : 'and';
}

function _excConnector(_exc: Record<string, unknown>, rendered: number): string {
  return rendered === 0 ? 'unless' : 'and unless';
}

function _stripLeadingModal(action: string): string {
  return action.replace(/^\s*(?:must|shall|may|should|can|will)\s+/i, '').trim();
}

function _contains(a: string, b: string): boolean {
  return a.toLowerCase().includes(b.toLowerCase());
}

function _clean(s: string): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}
