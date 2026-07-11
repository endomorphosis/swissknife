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

export interface ExtractedPredicates {
  unary: string[];
  binary: string[];
  ternary: string[];
  nouns: string[];
  verbs: string[];
  adjectives: string[];
  relations: string[];
  entities: string[];
}

export interface SemanticRole {
  agent?: string;
  action?: string;
  patient?: string | null;
  location?: string | null;
  time?: string | null;
  role?: string;
  filler?: string;
}

export function getSpacyModel(_modelName = 'en_core_web_sm'): null {
  return null;
}

export function extractPredicatesNlp(
  text: string,
  _useSpacy = true,
  _spacyModel = 'en_core_web_sm',
): ExtractedPredicates {
  const predicates = extractPredicates(text);
  const unary = new Set<string>();
  const binary = new Set<string>();
  const ternary = new Set<string>();

  for (const entity of String(text).matchAll(/\b([A-Z][a-z]+)\b/g)) {
    unary.add(`${entity[1]}(x)`);
  }

  for (const relation of predicates.relations) {
    const predicate = normalisePredicate(relation);
    if (predicate) binary.add(`${predicate}(x, y)`);
  }

  for (const match of String(text).matchAll(/\b([A-Z][a-z]+)\s+(\w+s?)\s+([A-Z][a-z]+)\b/g)) {
    const subject = normalisePredicate(match[1]);
    const predicate = normalisePredicate(match[2]);
    const object = normalisePredicate(match[3]);
    if (subject && predicate && object) {
      ternary.add(`${predicate}(${subject}, ${object}, context)`);
    }
  }

  return {
    unary: [...unary],
    binary: [...binary],
    ternary: [...ternary],
    nouns: predicates.nouns,
    verbs: predicates.verbs,
    adjectives: predicates.adjectives,
    relations: predicates.relations,
    entities: [],
  };
}

export function extractSemanticRoles(text: string, _useSpacy = true): SemanticRole[] {
  const roles: SemanticRole[] = [];
  for (const match of String(text).matchAll(/\b([A-Z][a-z]+|\w+)\s+(must|should|shall|may|can|will)\s+([a-z]+)(?:\s+([A-Z][a-z]+|\w+))?/gi)) {
    roles.push({
      agent: match[1],
      action: match[3],
      patient: match[4] ?? null,
      location: null,
      time: null,
      role: 'AGENT',
      filler: match[1],
    });
    roles.push({
      role: 'ACTION',
      filler: match[3],
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

export function normalisePredicate(predicate: string): string {
  return normalizePredicate(predicate);
}

export const get_spacy_model = getSpacyModel;
export const extract_predicates_nlp = extractPredicatesNlp;
export const extract_semantic_roles = extractSemanticRoles;
export const extract_logical_relations_nlp = extractLogicalRelationsNlp;
export const get_extraction_stats = getExtractionStats;
