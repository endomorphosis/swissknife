/**
 * Phase-8 parser QA metrics for LegalNormIR collections.
 *
 * These helpers provide deterministic observability over legal parsing:
 * required-slot coverage, schema validity, warning density, theorem readiness,
 * export-target readiness, and repair/blocker summaries.
 */

import type { LegalNormIR } from './legal-norm-ir.js';

export interface Phase8MetricOptions {
  readonly requiredSlots?: string[];
  readonly targetOrder?: string[];
}

export interface Phase8ParserMetricRecord {
  readonly sourceId: string;
  readonly normType: string;
  readonly modality: string;
  readonly requiredSlots: string[];
  readonly filledSlots: string[];
  readonly missingSlots: string[];
  readonly slotCoverage: number;
  readonly schemaValid: boolean;
  readonly scaffoldQuality: number;
  readonly qualityLabel: string;
  readonly parserWarningCount: number;
  readonly parserWarnings: string[];
  readonly promotableToTheorem: boolean;
  readonly exportReadyTargets: string[];
  readonly blockedTargets: string[];
  readonly repairRequired: boolean;
  readonly blockers: string[];
  readonly supportGrounded: boolean;
}

export interface Phase8TargetReadinessSummary {
  readonly target: string;
  readonly ready: number;
  readonly blocked: number;
  readonly total: number;
  readonly readinessRate: number;
}

export interface Phase8ParserMetricsSummary {
  readonly totalNorms: number;
  readonly schemaValidNorms: number;
  readonly promotableNorms: number;
  readonly repairRequiredNorms: number;
  readonly completeNorms: number;
  readonly warningCount: number;
  readonly averageSlotCoverage: number;
  readonly averageScaffoldQuality: number;
  readonly missingSlotCounts: Record<string, number>;
  readonly qualityLabelCounts: Record<string, number>;
  readonly targetReadiness: Record<string, Phase8TargetReadinessSummary>;
  readonly records: Phase8ParserMetricRecord[];
}

export interface Phase8ParserQualityReport {
  readonly summary: Phase8ParserMetricsSummary;
  readonly topMissingSlots: Array<{ readonly slot: string; readonly count: number }>;
  readonly warningsBySource: Record<string, string[]>;
  readonly repairQueue: Array<{ readonly sourceId: string; readonly blockers: string[] }>;
}

const DEFAULT_REQUIRED_SLOTS = [
  'source_id',
  'modality',
  'norm_type',
  'actor',
  'action',
  'conditions',
  'exceptions',
  'temporal_constraints',
  'source_span',
  'support_span',
];

export function buildPhase8ParserMetricRecord(
  norm: LegalNormIR,
  options: Phase8MetricOptions = {},
): Phase8ParserMetricRecord {
  const requiredSlots = options.requiredSlots ?? DEFAULT_REQUIRED_SLOTS;
  const filledSlots = requiredSlots.filter(slot => slotFilled(norm, slot));
  const missingSlots = requiredSlots.filter(slot => !filledSlots.includes(slot));
  const readiness = summarizeExportReadiness(norm.quality.export_readiness, options.targetOrder);
  const blockers = collectBlockers(norm, missingSlots, readiness.blockedTargets);

  return {
    sourceId: norm.source_id,
    normType: norm.norm_type,
    modality: norm.modality,
    requiredSlots,
    filledSlots,
    missingSlots,
    slotCoverage: roundRatio(filledSlots.length, requiredSlots.length),
    schemaValid: Boolean(norm.quality.schema_valid),
    scaffoldQuality: round(norm.quality.scaffold_quality),
    qualityLabel: norm.quality.quality_label || 'unknown',
    parserWarningCount: norm.quality.parser_warnings.length,
    parserWarnings: [...norm.quality.parser_warnings],
    promotableToTheorem: Boolean(norm.quality.promotable_to_theorem),
    exportReadyTargets: readiness.readyTargets,
    blockedTargets: readiness.blockedTargets,
    repairRequired: missingSlots.length > 0 || norm.quality.parser_warnings.length > 0 || readiness.blockedTargets.length > 0,
    blockers,
    supportGrounded: spanFilled(norm.source_span) || spanFilled(norm.support_span) || Boolean(norm.support_text.trim()),
  };
}

export function buildPhase8ParserMetricRecords(
  norms: LegalNormIR[],
  options: Phase8MetricOptions = {},
): Phase8ParserMetricRecord[] {
  return norms.map(norm => buildPhase8ParserMetricRecord(norm, options));
}

export function summarizePhase8ParserMetrics(
  norms: LegalNormIR[],
  options: Phase8MetricOptions = {},
): Phase8ParserMetricsSummary {
  const records = buildPhase8ParserMetricRecords(norms, options);
  const missingSlotCounts: Record<string, number> = {};
  const qualityLabelCounts: Record<string, number> = {};
  const targetTotals = new Map<string, { ready: number; blocked: number; total: number }>();

  for (const record of records) {
    for (const slot of record.missingSlots) {
      missingSlotCounts[slot] = (missingSlotCounts[slot] ?? 0) + 1;
    }
    qualityLabelCounts[record.qualityLabel] = (qualityLabelCounts[record.qualityLabel] ?? 0) + 1;

    const targets = new Set([...record.exportReadyTargets, ...record.blockedTargets]);
    for (const target of targets) {
      const entry = targetTotals.get(target) ?? { ready: 0, blocked: 0, total: 0 };
      entry.total++;
      if (record.exportReadyTargets.includes(target)) entry.ready++;
      if (record.blockedTargets.includes(target)) entry.blocked++;
      targetTotals.set(target, entry);
    }
  }

  const targetReadiness: Record<string, Phase8TargetReadinessSummary> = {};
  for (const [target, totals] of targetTotals) {
    targetReadiness[target] = {
      target,
      ready: totals.ready,
      blocked: totals.blocked,
      total: totals.total,
      readinessRate: roundRatio(totals.ready, totals.total),
    };
  }

  return {
    totalNorms: records.length,
    schemaValidNorms: records.filter(record => record.schemaValid).length,
    promotableNorms: records.filter(record => record.promotableToTheorem).length,
    repairRequiredNorms: records.filter(record => record.repairRequired).length,
    completeNorms: records.filter(record => record.missingSlots.length === 0).length,
    warningCount: sum(records.map(record => record.parserWarningCount)),
    averageSlotCoverage: average(records.map(record => record.slotCoverage)),
    averageScaffoldQuality: average(records.map(record => record.scaffoldQuality)),
    missingSlotCounts,
    qualityLabelCounts,
    targetReadiness,
    records,
  };
}

export function buildPhase8ParserQualityReport(
  norms: LegalNormIR[],
  options: Phase8MetricOptions = {},
): Phase8ParserQualityReport {
  const summary = summarizePhase8ParserMetrics(norms, options);
  const topMissingSlots = Object.entries(summary.missingSlotCounts)
    .map(([slot, count]) => ({ slot, count }))
    .sort((a, b) => b.count - a.count || a.slot.localeCompare(b.slot));

  const warningsBySource: Record<string, string[]> = {};
  const repairQueue: Array<{ sourceId: string; blockers: string[] }> = [];
  for (const record of summary.records) {
    if (record.parserWarnings.length > 0) warningsBySource[record.sourceId] = record.parserWarnings;
    if (record.repairRequired) repairQueue.push({ sourceId: record.sourceId, blockers: record.blockers });
  }

  return {
    summary,
    topMissingSlots,
    warningsBySource,
    repairQueue,
  };
}

function summarizeExportReadiness(
  exportReadiness: Record<string, unknown>,
  targetOrder?: string[],
): { readyTargets: string[]; blockedTargets: string[] } {
  const keys = targetOrder ?? Object.keys(exportReadiness).sort();
  const readyTargets: string[] = [];
  const blockedTargets: string[] = [];

  for (const target of keys) {
    if (!(target in exportReadiness)) continue;
    const value = exportReadiness[target];
    if (isReady(value)) {
      readyTargets.push(target);
    } else {
      blockedTargets.push(target);
    }
  }
  return { readyTargets, blockedTargets };
}

function isReady(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'object' || value === null) return Boolean(value);
  const record = value as Record<string, unknown>;
  return Boolean(
    record['ready'] ??
    record['proofReady'] ??
    record['formulaProofReady'] ??
    record['valid'] ??
    record['available'],
  );
}

function collectBlockers(norm: LegalNormIR, missingSlots: string[], blockedTargets: string[]): string[] {
  const blockers = [
    ...missingSlots.map(slot => `missing slot: ${slot}`),
    ...norm.quality.parser_warnings.map(warning => `parser warning: ${warning}`),
    ...blockedTargets.map(target => `target not ready: ${target}`),
  ];
  return [...new Set(blockers)];
}

function slotFilled(norm: LegalNormIR, slot: string): boolean {
  const record = norm as unknown as Record<string, unknown>;
  const hasValue = (candidate: unknown): boolean => {
    if (Array.isArray(candidate)) return candidate.length > 0;
    if (typeof candidate === 'string') return candidate.trim().length > 0;
    return candidate !== null && candidate !== undefined;
  };
  const value = slot === 'action'
    ? (hasValue(record['action']) ? record['action'] : record['proposition'])
    : slot === 'proposition'
      ? (hasValue(record['proposition']) ? record['proposition'] : record['action'])
      : record[slot];
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (typeof value === 'object' && value !== null) {
    if ('start' in value && 'end' in value) return spanFilled(value as { start: unknown; end: unknown });
    return Object.keys(value).length > 0;
  }
  return value !== null && value !== undefined;
}

function spanFilled(span: { start: unknown; end: unknown }): boolean {
  return typeof span.start === 'number' && typeof span.end === 'number' && span.end > span.start;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return round(sum(values) / values.length);
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function roundRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 1;
  return round(numerator / denominator);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
