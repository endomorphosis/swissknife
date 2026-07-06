/**
 * Enhanced FOL Converter — PORT-187 (Sprint 91)
 *
 * Adds confidence scoring, lightweight NLP enrichment, semantic role extraction,
 * and conversion monitoring around the existing FOL converter.
 */

import { FOLConverter } from '../../logic-converters.js';

export interface SemanticRole {
  role: 'agent' | 'action' | 'patient' | 'condition';
  text: string;
}

export interface EnhancedFOLConversionResult {
  text: string;
  formula: string;
  confidence: number;
  semanticRoles: SemanticRole[];
  predicates: string[];
  features: Record<string, number | boolean>;
  elapsedMs: number;
  errors: string[];
}

export interface FOLConverterMonitorStats {
  totalConversions: number;
  failures: number;
  avgConfidence: number;
  avgElapsedMs: number;
}

export class FOLConversionMonitor {
  private stats: FOLConverterMonitorStats = { totalConversions: 0, failures: 0, avgConfidence: 0, avgElapsedMs: 0 };

  record(result: EnhancedFOLConversionResult): void {
    this.stats.totalConversions++;
    if (result.errors.length) this.stats.failures++;
    this.stats.avgConfidence = rollingAverage(this.stats.avgConfidence, result.confidence, this.stats.totalConversions);
    this.stats.avgElapsedMs = rollingAverage(this.stats.avgElapsedMs, result.elapsedMs, this.stats.totalConversions);
  }

  getStats(): Readonly<FOLConverterMonitorStats> {
    return { ...this.stats };
  }

  reset(): void {
    this.stats = { totalConversions: 0, failures: 0, avgConfidence: 0, avgElapsedMs: 0 };
  }
}

export class EnhancedFOLConverter {
  private readonly converter = new FOLConverter();

  constructor(private readonly monitor = new FOLConversionMonitor()) {}

  convert(text: string): EnhancedFOLConversionResult {
    const start = performance.now();
    const base = this.converter.convert(text);
    const semanticRoles = extractSemanticRoles(text);
    const predicates = extractPredicates(base.output);
    const features = extractFeatures(text, base.output, semanticRoles);
    const confidence = scoreConfidence(base.confidence, features, semanticRoles, predicates);
    const result: EnhancedFOLConversionResult = {
      text,
      formula: base.output,
      confidence,
      semanticRoles,
      predicates,
      features,
      elapsedMs: performance.now() - start,
      errors: base.errors,
    };
    this.monitor.record(result);
    return result;
  }

  convertBatch(texts: string[]): EnhancedFOLConversionResult[] {
    return texts.map(text => this.convert(text));
  }

  getMonitorStats(): Readonly<FOLConverterMonitorStats> {
    return this.monitor.getStats();
  }
}

export function extractSemanticRoles(text: string): SemanticRole[] {
  const roles: SemanticRole[] = [];
  const conditional = text.match(/^if\s+(.+?),?\s+then\s+(.+)$/i);
  if (conditional) roles.push({ role: 'condition', text: conditional[1]!.trim() });

  const modal = text.match(/\b([A-Z]?[a-z]+(?:\s+[A-Z]?[a-z]+)?)\s+(must|shall|may|can|should|is required to|is permitted to)\s+(.+)$/i);
  if (modal) {
    roles.push({ role: 'agent', text: modal[1]!.trim() });
    roles.push({ role: 'action', text: modal[3]!.trim() });
    const patient = modal[3]!.match(/\b(?:the|a|an)\s+([a-z][\w-]*(?:\s+[a-z][\w-]*)?)$/i);
    if (patient) roles.push({ role: 'patient', text: patient[1]!.trim() });
  }
  return roles;
}

export function extractPredicates(formula: string): string[] {
  const names = new Set<string>();
  for (const match of formula.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) {
    if (!['O', 'P', 'F'].includes(match[1]!)) names.add(match[1]!);
  }
  return [...names];
}

function extractFeatures(text: string, formula: string, roles: SemanticRole[]): Record<string, number | boolean> {
  return {
    hasQuantifier: /[∀∃]|\b(?:all|every|some|exists)\b/i.test(text + formula),
    hasImplication: /→|if\s+.+then/i.test(text + formula),
    hasDeonticModal: /\b(?:must|shall|may|can|prohibited|forbidden)\b/i.test(text),
    semanticRoleCount: roles.length,
    tokenCount: text.split(/\s+/).filter(Boolean).length,
    predicateCount: extractPredicates(formula).length,
  };
}

function scoreConfidence(
  baseConfidence: number,
  features: Record<string, number | boolean>,
  roles: SemanticRole[],
  predicates: string[],
): number {
  let score = baseConfidence;
  if (features.hasQuantifier) score += 0.05;
  if (features.hasImplication) score += 0.05;
  if (roles.length >= 2) score += 0.08;
  if (predicates.length > 0) score += 0.04;
  return Math.max(0, Math.min(1, score));
}

function rollingAverage(current: number, value: number, count: number): number {
  return ((current * (count - 1)) + value) / count;
}
