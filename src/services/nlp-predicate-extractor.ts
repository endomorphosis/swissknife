/**
 * NLP Predicate Extractor — T-285 (Sprint 62)
 * Port of fol/utils/nlp_predicate_extractor.py (403L)
 * Regex-based (no spaCy dependency).
 */

export interface ExtractedPredicates { unary: string[]; binary: string[]; ternary: string[] }
export interface SemanticRole { role: string; filler: string }

const VERB_RE   = /\b([A-Za-z]+(?:s|ed|ing)?)\s+([A-Za-z]+)\b/g;
const PREP_RE   = /\b([A-Za-z]+)\s+of\s+([A-Za-z]+)\b/gi;
const SUBJ_OBJ  = /\b([A-Z][a-z]+)\s+(\w+s?)\s+([A-Z][a-z]+)\b/g;

export function extractPredicatesNlp(text: string): ExtractedPredicates {
  const unary:  Set<string> = new Set();
  const binary: Set<string> = new Set();
  const ternary: Set<string> = new Set();

  // Unary: extract capitalised noun-like tokens as entity predicates
  for (const m of text.matchAll(/\b([A-Z][a-z]+)\b/g)) {
    unary.add(`${m[1]}(x)`);
  }

  // Binary: verb + object pairs
  const vr = new RegExp(VERB_RE.source, 'g');
  for (const m of text.matchAll(vr)) {
    const verb = normalisePredicate(m[1]);
    const obj  = normalisePredicate(m[2]);
    if (verb && obj) binary.add(`${verb}(x, ${obj})`);
  }

  // Ternary: subject-verb-object triples
  const sr = new RegExp(SUBJ_OBJ.source, 'g');
  for (const m of text.matchAll(sr)) {
    const subj = normalisePredicate(m[1]);
    const verb = normalisePredicate(m[2]);
    const obj  = normalisePredicate(m[3]);
    if (subj && verb && obj) ternary.add(`${verb}(${subj}, ${obj}, context)`);
  }

  return { unary: [...unary], binary: [...binary], ternary: [...ternary] };
}

export function normalisePredicate(predicate: string): string {
  return predicate
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^(is|are|was|were|be)_/, '')
    .trim();
}

export function extractSemanticRoles(text: string): SemanticRole[] {
  const roles: SemanticRole[] = [];
  // Agent: look for "NP must/shall/may VB"
  for (const m of text.matchAll(/([A-Z][a-z]+)\s+(?:must|shall|may|can|will)\s+([a-z]+)/g)) {
    roles.push({ role: 'AGENT', filler: m[1] });
    roles.push({ role: 'ACTION', filler: m[2] });
  }
  // Theme: "VB NP"
  for (const m of text.matchAll(/(?:pay|deliver|submit|report|notify)\s+([a-z]+)/gi)) {
    roles.push({ role: 'THEME', filler: m[1] });
  }
  return roles;
}
