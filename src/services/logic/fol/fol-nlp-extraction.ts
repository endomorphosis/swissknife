/**
 * NLP predicate extraction compatibility layer.
 *
 * TypeScript port of ipfs_datasets_py/logic/fol/utils/nlp_predicate_extractor.py.
 * The TS runtime intentionally has no spaCy dependency; it exposes the same
 * public surface and falls back to deterministic regex extraction.
 */

import {
  extractLogicalRelations,
  extractPredicates,
  normalizePredicateName,
} from './fol-parser.js';

export function getSpacyModel(_modelName = 'en_core_web_sm'): null {
  return null;
}

export function extractPredicatesNlp(
  text: string,
  _useSpacy = true,
  _spacyModel = 'en_core_web_sm',
): Record<string, string[]> {
  const predicates = extractPredicates(text);
  return {
    nouns: predicates.nouns,
    verbs: predicates.verbs,
    adjectives: predicates.adjectives,
    relations: predicates.relations,
    entities: [],
  };
}

export function extractSemanticRoles(text: string, _useSpacy = true): Array<Record<string, unknown>> {
  const roles: Array<Record<string, unknown>> = [];
  for (const match of String(text).matchAll(/\b([A-Z][a-z]+|\w+)\s+(must|should|shall|may|can|will)\s+([a-z]+)(?:\s+([A-Z][a-z]+|\w+))?/gi)) {
    roles.push({
      agent: match[1],
      action: match[3],
      patient: match[4] ?? null,
      location: null,
      time: null,
    });
  }
  return roles;
}

export function extractLogicalRelationsNlp(text: string, _useSpacy = true): Array<Record<string, unknown>> {
  return extractLogicalRelations(text).map(relation => ({ ...relation }));
}

export function getExtractionStats(): Record<string, unknown> {
  return {
    spacy_available: false,
    model_loaded: false,
    fallback_mode: true,
  };
}

export function normalizePredicate(predicate: string): string {
  return normalizePredicateName(String(predicate).replace(/_/g, ' '));
}

export const get_spacy_model = getSpacyModel;
export const extract_predicates_nlp = extractPredicatesNlp;
export const extract_semantic_roles = extractSemanticRoles;
export const extract_logical_relations_nlp = extractLogicalRelationsNlp;
export const get_extraction_stats = getExtractionStats;
