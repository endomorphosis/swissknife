/**
 * Reasoning Normalization Pipeline — TDFOL Forward Chaining + NL Preprocessor +
 * Ambiguity Resolver + Semantic Normalizer + Text to FOL + Legal Text to Deontic
 * Ports of: TDFOL/strategies/forward_chaining.py (327L),
 *           TDFOL/nl/tdfol_nl_preprocessor.py (327L),
 *           CEC/native/ambiguity_resolver.py (323L),
 *           flogic/semantic_normalizer.py (322L),
 *           fol/text_to_fol.py (321L),
 *           deontic/legal_text_to_deontic.py (305L)
 */

import { PatternMatcher, PatternType } from '../shared/tdfol-nl-patterns.js';
import { DeonticAnalyzer } from '../deontic/deontic-analyzer.js';

// ---------------------------------------------------------------------------
// T-297 — TDFOL Forward Chaining Strategy
// ---------------------------------------------------------------------------

export interface FCStrategyStats { proofsAttempted: number; proofsSucceeded: number; totalSteps: number }

export class ForwardChainingStrategy {
  private readonly stats: FCStrategyStats = { proofsAttempted: 0, proofsSucceeded: 0, totalSteps: 0 };
  constructor(readonly maxSteps = 100) {}

  prove(goal: string, axioms: string[]): { isProved: boolean; steps: string[]; elapsedMs: number } {
    const t0 = performance.now();
    this.stats.proofsAttempted++;
    const known = new Set<string>(axioms);
    const steps: string[] = [];

    if (known.has(goal)) {
      this.stats.proofsSucceeded++;
      return { isProved: true, steps, elapsedMs: performance.now() - t0 };
    }

    let stepCount = 0, changed = true;
    while (changed && stepCount < this.maxSteps) {
      changed = false; stepCount++;
      for (const a of [...known]) {
        const idx = a.indexOf('→');
        if (idx < 0) continue;
        const ant = a.slice(0, idx).trim(), cons = a.slice(idx+1).trim();
        if (known.has(ant) && !known.has(cons)) {
          known.add(cons); steps.push(`MP: ${ant}, ${a} ⊢ ${cons}`);
          changed = true; if (cons === goal) { changed = false; break; }
        }
      }
    }

    const proved = known.has(goal);
    if (proved) this.stats.proofsSucceeded++;
    this.stats.totalSteps += steps.length;
    return { isProved: proved, steps, elapsedMs: performance.now() - t0 };
  }

  getStats(): Readonly<FCStrategyStats> { return { ...this.stats }; }
}

// ---------------------------------------------------------------------------
// T-298 — TDFOL NL Preprocessor
// ---------------------------------------------------------------------------

export enum NLEntityType { AGENT='agent', OBJECT='object', EVENT='event', TIME='time', LOCATION='location' }

export interface NLEntity { text: string; type: NLEntityType; start: number; end: number }
export interface TemporalExpression { text: string; normalized: string; start: number }
export interface DependencyRelation { head: string; dep: string; relation: string }

export interface ProcessedDocument {
  text:          string;
  sentences:     string[];
  entities:      NLEntity[];
  temporalExprs: TemporalExpression[];
  dependencies:  DependencyRelation[];
  tokens:        string[];
}

const TEMP_RE = /\b(?:within\s+\d+\s+(?:days?|hours?|weeks?|months?)|by\s+\d{4}[-\/]\d{2}[-\/]\d{2}|(?:always|eventually|until|after|before))\b/gi;

export function preprocess(text: string): ProcessedDocument {
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const tokens    = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);

  const entities: NLEntity[] = [];
  for (const m of text.matchAll(/\b([A-Z][a-z]+)\b/g)) {
    entities.push({ text: m[1], type: NLEntityType.AGENT, start: m.index!, end: m.index! + m[1].length });
  }

  const temporalExprs: TemporalExpression[] = [];
  for (const m of text.matchAll(TEMP_RE)) {
    temporalExprs.push({ text: m[0], normalized: m[0].toLowerCase(), start: m.index! });
  }

  const dependencies: DependencyRelation[] = [];
  const words = text.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    dependencies.push({ head: words[i-1], dep: words[i], relation: 'NEXT' });
  }

  return { text, sentences, entities, temporalExprs, dependencies, tokens };
}

// ---------------------------------------------------------------------------
// T-299 — CEC Ambiguity Resolver
// ---------------------------------------------------------------------------

export enum DisambiguationStrategy { FIRST='first', HIGHEST_SCORE='highest_score', SEMANTIC='semantic', STATISTICAL='statistical' }

export interface ParseScore { parseId: string; score: number; formula: string; confidence: number }

export class AmbiguityResolver {
  resolve(parses: ParseScore[], strategy: DisambiguationStrategy = DisambiguationStrategy.HIGHEST_SCORE): ParseScore | null {
    if (parses.length === 0) return null;
    switch (strategy) {
      case DisambiguationStrategy.FIRST: return parses[0];
      case DisambiguationStrategy.HIGHEST_SCORE: return parses.reduce((best, p) => p.score > best.score ? p : best, parses[0]);
      default: return parses[0];
    }
  }

  score(formula: string, context: string[] = []): number {
    // Heuristic: longer formula with more context matches = higher score
    const contextHits = context.filter(c => formula.includes(c)).length;
    return Math.min(1.0, (formula.length / 100) * 0.5 + (contextHits / Math.max(1, context.length)) * 0.5);
  }
}

export class SemanticDisambiguator extends AmbiguityResolver {
  disambiguate(parses: ParseScore[], semanticContext: string[]): ParseScore | null {
    const scored = parses.map(p => ({ ...p, score: this.score(p.formula, semanticContext) }));
    return this.resolve(scored, DisambiguationStrategy.HIGHEST_SCORE);
  }
}

export class StatisticalDisambiguator extends AmbiguityResolver {
  private readonly frequencies = new Map<string, number>();

  recordUsage(formula: string): void {
    this.frequencies.set(formula, (this.frequencies.get(formula) ?? 0) + 1);
  }

  disambiguate(parses: ParseScore[]): ParseScore | null {
    const total = [...this.frequencies.values()].reduce((s, v) => s + v, 1);
    const scored = parses.map(p => ({ ...p, score: (this.frequencies.get(p.formula) ?? 0) / total }));
    return this.resolve(scored, DisambiguationStrategy.HIGHEST_SCORE);
  }
}

// ---------------------------------------------------------------------------
// T-300 — FLogic Semantic Normalizer
// ---------------------------------------------------------------------------

export interface NormalizerStats { normalized: number; cacheHits: number; avgMs: number }

export class SemanticNormalizer {
  private readonly cache = new Map<string, string>();
  private readonly stats: NormalizerStats = { normalized: 0, cacheHits: 0, avgMs: 0 };

  normalize(text: string): string {
    const cached = this.cache.get(text);
    if (cached) { this.stats.cacheHits++; return cached; }
    const t0 = performance.now();
    this.stats.normalized++;
    const result = text
      .toLowerCase()
      .replace(/\b(?:the|a|an)\b/g, '')        // strip articles
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s→∧∨¬∀∃□◇↔(),.]/g, '')   // keep logic symbols
      .trim();
    const elapsed = performance.now() - t0;
    this.stats.avgMs = ((this.stats.normalized - 1) * this.stats.avgMs + elapsed) / this.stats.normalized;
    this.cache.set(text, result);
    return result;
  }

  normalizeAll(texts: string[]): string[] { return texts.map(t => this.normalize(t)); }
  getStats(): Readonly<NormalizerStats> { return { ...this.stats }; }
}

let _globalNormalizer: SemanticNormalizer | null = null;
export function getGlobalNormalizer(): SemanticNormalizer {
  if (!_globalNormalizer) _globalNormalizer = new SemanticNormalizer();
  return _globalNormalizer;
}

// ---------------------------------------------------------------------------
// T-301 — FOL Text to FOL
// ---------------------------------------------------------------------------

export interface FOLConversionResult { text: string; formula: string; confidence: number; operators: string[] }

export function convertTextToFol(text: string): FOLConversionResult {
  const lower = text.toLowerCase();
  const operators: string[] = [];
  let formula = '';

  if (/\b(?:all|every|each)\b/.test(lower)) { operators.push('∀'); formula = `∀x.P(x)`; }
  else if (/\b(?:some|there exists)\b/.test(lower)) { operators.push('∃'); formula = `∃x.P(x)`; }
  else if (/\bif\b.+\bthen\b/.test(lower)) { operators.push('→'); formula = `P → Q`; }
  else { formula = `P`; }

  if (/\b(?:must|shall)\b/.test(lower)) { operators.push('O'); formula = `O(${formula})`; }
  else if (/\bmay\b/.test(lower)) { operators.push('P'); formula = `P(${formula})`; }

  const confidence = operators.length > 0 ? 0.7 : 0.3;
  return { text, formula, confidence, operators };
}

export function extractTextFromDataset(dataset: Record<string, unknown>): string[] {
  const texts: string[] = [];
  const docs = (dataset['documents'] ?? dataset['texts'] ?? dataset['data']) as unknown[];
  if (Array.isArray(docs)) {
    for (const d of docs) {
      if (typeof d === 'string') texts.push(d);
      else if (d && typeof d === 'object') {
        const content = (d as Record<string, unknown>)['content'] ?? (d as Record<string, unknown>)['text'];
        if (typeof content === 'string') texts.push(content);
      }
    }
  }
  return texts;
}

export function getQuantifierDistribution(results: FOLConversionResult[]): Record<string, number> {
  const dist: Record<string, number> = { '∀': 0, '∃': 0, 'none': 0 };
  for (const r of results) {
    if (r.operators.includes('∀')) dist['∀']++;
    else if (r.operators.includes('∃')) dist['∃']++;
    else dist['none']++;
  }
  return dist;
}

export function getOperatorDistribution(results: FOLConversionResult[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const r of results) {
    for (const op of r.operators) dist[op] = (dist[op] ?? 0) + 1;
  }
  return dist;
}

// ---------------------------------------------------------------------------
// T-302 — Deontic Legal Text to Deontic
// ---------------------------------------------------------------------------

export interface LegalConversionResult {
  text:         string;
  clauses:      Array<{ modality: string; action: string; actor: string|null; confidence: number }>;
  formula:      string;
  jurisdiction: string;
  documentType: string;
  confidence:   number;
}

export function legalTextToDeontic(text: string, opts: { jurisdiction?: string; documentType?: string } = {}): LegalConversionResult {
  const jurisdiction = opts.jurisdiction ?? 'general';
  const documentType = opts.documentType ?? 'statute';
  const matcher = new PatternMatcher();
  const matches = matcher.match(text);
  const clauses: LegalConversionResult['clauses'] = [];

  for (const m of matches) {
    let modality = '';
    if (m.pattern.type === PatternType.OBLIGATION)   modality = 'obligation';
    else if (m.pattern.type === PatternType.PERMISSION)  modality = 'permission';
    else if (m.pattern.type === PatternType.PROHIBITION) modality = 'prohibition';
    else continue;
    clauses.push({ modality, action: m.entities['action'] ?? m.text, actor: m.entities['agent'] ?? null, confidence: m.confidence });
  }

  const formula = clauses.map(c => {
    const op = c.modality === 'obligation' ? 'O' : c.modality === 'permission' ? 'P' : 'F';
    return `${op}(${c.action.replace(/\s+/g, '_')})`;
  }).join(' ∧ ');

  const confidence = clauses.length > 0 ? clauses.reduce((s, c) => s + c.confidence, 0) / clauses.length : 0;
  return { text, clauses, formula, jurisdiction, documentType, confidence };
}

export function extractLegalTextFromDataset(dataset: Record<string, unknown>): string[] {
  return extractTextFromDataset(dataset);
}

export function convertResultToLegacyFormat(result: LegalConversionResult, originalText: string): Record<string, unknown> {
  return {
    input_text:    originalText,
    formula:       result.formula,
    clauses:       result.clauses,
    confidence:    result.confidence,
    jurisdiction:  result.jurisdiction,
    document_type: result.documentType,
    success:       result.clauses.length > 0,
  };
}
