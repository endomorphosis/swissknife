/**
 * Phrase-level provenance and audit helpers for LegalNormDecoder output.
 *
 * The decoder already tags each phrase with a LegalNormIR slot.  This module
 * turns those phrase tags into an auditable trail: rendered spans, inferred
 * source spans, slot support maps, and loss reasons when a phrase cannot be
 * grounded in source text.
 */

import type { DecodedLegalText, DecodedPhrase } from './legal-norm-decoder.js';
import { decodeLegalNormIR, decodedPhraseSlotTextMap } from './legal-norm-decoder.js';
import type { LegalNormIR } from './legal-norm-ir.js';

export interface DecodedPhraseAuditRecord {
  readonly phraseIndex: number;
  readonly slot: string;
  readonly text: string;
  readonly renderedStart: number;
  readonly renderedEnd: number;
  readonly sourceSpans: Array<[number, number]>;
  readonly sourceTexts: string[];
  readonly fixed: boolean;
  readonly provenanceOnly: boolean;
  readonly grounded: boolean;
}

export interface DecoderSlotSupportRecord {
  readonly slot: string;
  readonly texts: string[];
  readonly sourceSpans: Array<[number, number]>;
  readonly sourceTexts: string[];
  readonly phraseIndexes: number[];
  readonly fixedPhraseCount: number;
  readonly groundedPhraseCount: number;
  readonly phraseCount: number;
  readonly grounded: boolean;
}

export interface DecoderAuditTrail {
  readonly sourceId: string;
  readonly renderedText: string;
  readonly supportSpan: [number, number];
  readonly phraseCount: number;
  readonly renderedPhraseCount: number;
  readonly fixedPhraseCount: number;
  readonly provenanceOnlyPhraseCount: number;
  readonly groundedPhraseCount: number;
  readonly sourceCoverageRate: number;
  readonly missingSlots: string[];
  readonly parserWarnings: string[];
  readonly slotTextMap: Record<string, string[]>;
  readonly slotSupportMap: Record<string, DecoderSlotSupportRecord>;
  readonly phrases: DecodedPhraseAuditRecord[];
  readonly hasLoss: boolean;
  readonly lossReasons: string[];
}

export function traceDecodedPhraseToSource(
  norm: LegalNormIR,
  phrase: DecodedPhrase,
): Pick<DecodedPhraseAuditRecord, 'sourceSpans' | 'sourceTexts' | 'grounded'> {
  const explicitSpans = phrase.spans
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end >= start)
    .map(([start, end]) => [start, end] as [number, number]);

  const inferredSpans = explicitSpans.length > 0
    ? explicitSpans
    : inferSourceSpans(norm, phrase.text);

  return {
    sourceSpans: inferredSpans,
    sourceTexts: inferredSpans.map(([start, end]) => norm.source_text.slice(start, end)),
    grounded: phrase.fixed || phrase.provenance_only || inferredSpans.length > 0,
  };
}

export function buildDecodedPhraseAuditRecords(
  norm: LegalNormIR,
  decoded: DecodedLegalText = decodeLegalNormIR(norm),
): DecodedPhraseAuditRecord[] {
  const renderedText = decoded.text;
  let cursor = 0;

  return decoded.phrases.map((phrase, phraseIndex) => {
    const text = phrase.text.trim();
    const renderedStart = text ? findRenderedSpan(renderedText, text, cursor) : -1;
    const renderedEnd = renderedStart >= 0 ? renderedStart + text.length : -1;
    if (renderedEnd > cursor) cursor = renderedEnd;

    const traced = traceDecodedPhraseToSource(norm, phrase);
    return {
      phraseIndex,
      slot: phrase.slot,
      text,
      renderedStart,
      renderedEnd,
      sourceSpans: traced.sourceSpans,
      sourceTexts: traced.sourceTexts,
      fixed: phrase.fixed,
      provenanceOnly: phrase.provenance_only,
      grounded: traced.grounded,
    };
  });
}

export function buildDecoderSlotSupportMap(
  phrases: DecodedPhraseAuditRecord[],
): Record<string, DecoderSlotSupportRecord> {
  const grouped = new Map<string, DecodedPhraseAuditRecord[]>();
  for (const phrase of phrases) {
    const slot = phrase.slot.trim();
    if (!slot) continue;
    const records = grouped.get(slot) ?? [];
    records.push(phrase);
    grouped.set(slot, records);
  }

  const out: Record<string, DecoderSlotSupportRecord> = {};
  for (const [slot, records] of grouped) {
    const texts = unique(records.map(record => record.text).filter(Boolean));
    const sourceSpans = records.flatMap(record => record.sourceSpans);
    const sourceTexts = unique(records.flatMap(record => record.sourceTexts).filter(Boolean));
    const fixedPhraseCount = records.filter(record => record.fixed).length;
    const groundedPhraseCount = records.filter(record => record.grounded).length;
    out[slot] = {
      slot,
      texts,
      sourceSpans,
      sourceTexts,
      phraseIndexes: records.map(record => record.phraseIndex),
      fixedPhraseCount,
      groundedPhraseCount,
      phraseCount: records.length,
      grounded: records.length > 0 && records.every(record => record.grounded),
    };
  }
  return out;
}

export function buildDecoderAuditTrail(
  norm: LegalNormIR,
  decoded: DecodedLegalText = decodeLegalNormIR(norm),
): DecoderAuditTrail {
  const phrases = buildDecodedPhraseAuditRecords(norm, decoded);
  const sourceRelevant = phrases.filter(phrase => !phrase.fixed && !phrase.provenanceOnly);
  const groundedPhraseCount = sourceRelevant.filter(phrase => phrase.grounded).length;
  const sourceCoverageRate = roundRatio(groundedPhraseCount, sourceRelevant.length);
  const slotSupportMap = buildDecoderSlotSupportMap(phrases);
  const lossReasons = buildLossReasons(decoded, phrases, sourceRelevant);

  return {
    sourceId: norm.source_id,
    renderedText: decoded.text,
    supportSpan: decoded.support_span,
    phraseCount: phrases.length,
    renderedPhraseCount: phrases.filter(phrase => !phrase.provenanceOnly).length,
    fixedPhraseCount: phrases.filter(phrase => phrase.fixed).length,
    provenanceOnlyPhraseCount: phrases.filter(phrase => phrase.provenanceOnly).length,
    groundedPhraseCount,
    sourceCoverageRate,
    missingSlots: [...decoded.missing_slots],
    parserWarnings: [...decoded.parser_warnings],
    slotTextMap: decodedPhraseSlotTextMap(decoded, { includeFixed: false, includeProvenanceOnly: true }),
    slotSupportMap,
    phrases,
    hasLoss: lossReasons.length > 0,
    lossReasons,
  };
}

function inferSourceSpans(norm: LegalNormIR, phraseText: string): Array<[number, number]> {
  const text = phraseText.trim();
  if (!text || !norm.source_text) return [];

  const spans: Array<[number, number]> = [];
  const haystack = norm.source_text.toLowerCase();
  const needle = text.toLowerCase();
  let offset = 0;
  while (offset < haystack.length) {
    const index = haystack.indexOf(needle, offset);
    if (index < 0) break;
    spans.push([index, index + text.length]);
    offset = index + Math.max(needle.length, 1);
  }

  if (spans.length > 0) return spans;

  const support = norm.support_text || '';
  if (!support) return [];
  const supportIndex = support.toLowerCase().indexOf(needle);
  if (supportIndex < 0) return [];
  const start = norm.support_span.start + supportIndex;
  return [[start, start + text.length]];
}

function findRenderedSpan(renderedText: string, phraseText: string, cursor: number): number {
  const exact = renderedText.indexOf(phraseText, cursor);
  if (exact >= 0) return exact;
  const lower = renderedText.toLowerCase();
  return lower.indexOf(phraseText.toLowerCase(), cursor);
}

function buildLossReasons(
  decoded: DecodedLegalText,
  phrases: DecodedPhraseAuditRecord[],
  sourceRelevant: DecodedPhraseAuditRecord[],
): string[] {
  const reasons: string[] = [];
  for (const slot of decoded.missing_slots) {
    reasons.push(`missing required slot: ${slot}`);
  }
  for (const warning of decoded.parser_warnings) {
    reasons.push(`parser warning: ${warning}`);
  }
  for (const phrase of sourceRelevant) {
    if (!phrase.grounded) {
      reasons.push(`ungrounded phrase: ${phrase.slot}=${phrase.text}`);
    }
  }
  if (phrases.some(phrase => phrase.renderedStart < 0 && !phrase.provenanceOnly)) {
    reasons.push('one or more phrases could not be located in rendered text');
  }
  return unique(reasons);
}

function roundRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 1;
  return Math.round((numerator / denominator) * 1_000_000) / 1_000_000;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
