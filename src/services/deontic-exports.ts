/**
 * Deontic Exports — T-253 (Sprint 56)
 *
 * Port of ipfs_datasets_py/logic/deontic/exports.py (5134L — key API only)
 *
 * Summary and reporting functions for deontic norm IR quality diagnostics.
 * The Python original works with typed `LegalNormIR` objects.  This port
 * accepts generic record/dict inputs to remain dependency-free.
 */

// ---------------------------------------------------------------------------
// Shared record types
// ---------------------------------------------------------------------------

/** Generic LegalNormIR-like record (duck-typed). */
export interface NormRecord {
  sourceId?: string;
  normType?: string;
  modality?: string;
  formula?: string;
  proofReady?: boolean;
  requiresValidation?: boolean;
  repairRequired?: boolean;
  blockers?: string[];
  [key: string]: unknown;
}

/** A parser capability profile row. */
export interface ParserCapabilityProfileRecord {
  parserCapabilityProfileId: string;
  sourceId: string;
  targetLogic: string;
  capabilityFamily: string;
  normType: string;
  modality: string;
  formula: string;
  formulaProofReady: boolean;
  requiresValidation: boolean;
  repairRequired: boolean;
  blockers: string[];
  checkedSlots: string[];
  groundedSlots: string[];
  missingSlots: string[];
  sourceGroundedSlotRate: number;
}

/** A phase-8 quality summary row. */
export interface Phase8QualityRecord {
  family: string;
  total: number;
  proofReady: number;
  repairRequired: number;
  proofReadyRate: number;
  coverageRate: number;
}

/** Prover syntax target coverage row. */
export interface ProverSyntaxTargetCoverageRecord {
  proverbTarget: string;
  totalNorms: number;
  proofReadyNorms: number;
  coverageRate: number;
  status: 'covered' | 'partial' | 'missing';
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function stableId(...parts: string[]): string {
  const combined = parts.filter(Boolean).join('::');
  // Simple deterministic hash
  let h = 0x811c9dc5;
  for (const ch of combined) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function capabilityFamily(norm: NormRecord): string {
  const modality = (norm.modality ?? '').toLowerCase();
  if (/oblig|must|shall/.test(modality)) return 'obligation';
  if (/permit|may|allow/.test(modality))  return 'permission';
  if (/prohib|forbid/.test(modality))     return 'prohibition';
  return norm.normType ?? 'unknown';
}

function defaultSlots(): string[] {
  return ['actor', 'action', 'condition', 'resource', 'modality'];
}

function groundedSlots(norm: NormRecord, slots: string[]): string[] {
  return slots.filter(s => norm[s] !== undefined && norm[s] !== null && norm[s] !== '');
}

// ---------------------------------------------------------------------------
// buildDeterministicParserCapabilityProfileRecord
// ---------------------------------------------------------------------------

/**
 * Build a source-grounded parser capability profile row for one norm.
 *
 * TypeScript port of `build_deterministic_parser_capability_profile_record()`
 * from `ipfs_datasets_py/logic/deontic/exports.py`.
 */
export function buildDeterministicParserCapabilityProfileRecord(
  norm: NormRecord,
  slots: string[] = defaultSlots(),
): ParserCapabilityProfileRecord {
  const family   = capabilityFamily(norm);
  const formula  = String(norm['formula'] ?? '');
  const sourceId = String(norm['sourceId'] ?? '');
  const checked  = slots;
  const grounded = groundedSlots(norm, slots);
  const missing  = slots.filter(s => !grounded.includes(s));
  const rate     = checked.length > 0 ? grounded.length / checked.length : 0;

  return {
    parserCapabilityProfileId: stableId('parser-capability-profile', sourceId, family, formula),
    sourceId,
    targetLogic:          'deterministic_parser_capability',
    capabilityFamily:     family,
    normType:             String(norm['normType']  ?? ''),
    modality:             String(norm['modality']  ?? ''),
    formula,
    formulaProofReady:    Boolean(norm['proofReady']),
    requiresValidation:   Boolean(norm['requiresValidation']),
    repairRequired:       Boolean(norm['repairRequired']),
    blockers:             Array.isArray(norm['blockers']) ? norm['blockers'] as string[] : [],
    checkedSlots:         checked,
    groundedSlots:        grounded,
    missingSlots:         missing,
    sourceGroundedSlotRate: Math.round(rate * 1_000_000) / 1_000_000,
  };
}

// ---------------------------------------------------------------------------
// buildDeterministicParserCapabilityProfileRecords
// ---------------------------------------------------------------------------

/** Build profile records for all norms in a collection. */
export function buildDeterministicParserCapabilityProfileRecords(
  norms: NormRecord[],
  slots: string[] = defaultSlots(),
): ParserCapabilityProfileRecord[] {
  return norms.map(n => buildDeterministicParserCapabilityProfileRecord(n, slots));
}

// ---------------------------------------------------------------------------
// summarizeDeterministicParserCapabilityProfileRecords
// ---------------------------------------------------------------------------

/** Aggregate summary of parser capability profile records. */
export function summarizeDeterministicParserCapabilityProfileRecords(
  records: ParserCapabilityProfileRecord[],
): Record<string, unknown> {
  if (records.length === 0) return { total: 0 };

  const families = new Map<string, { total: number; grounded: number; proofReady: number }>();
  for (const r of records) {
    const f = families.get(r.capabilityFamily) ?? { total: 0, grounded: 0, proofReady: 0 };
    f.total++;
    f.grounded += r.sourceGroundedSlotRate;
    if (r.formulaProofReady) f.proofReady++;
    families.set(r.capabilityFamily, f);
  }

  const byFamily: Record<string, unknown> = {};
  for (const [family, stats] of families) {
    byFamily[family] = {
      total:         stats.total,
      avgSlotGroundingRate: Math.round(stats.grounded / stats.total * 1_000_000) / 1_000_000,
      proofReadyCount: stats.proofReady,
      proofReadyRate:  Math.round(stats.proofReady / stats.total * 1_000_000) / 1_000_000,
    };
  }

  return {
    total:    records.length,
    byFamily,
    avgSlotGroundingRate: records.reduce((s, r) => s + r.sourceGroundedSlotRate, 0) / records.length,
  };
}

// ---------------------------------------------------------------------------
// summarizeIrSlotProvenanceAuditRecords
// ---------------------------------------------------------------------------

/** Summarise IR slot provenance audit records. */
export function summarizeIrSlotProvenanceAuditRecords(
  records: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const total = records.length;
  const grounded = records.filter(r => r['sourceGroundedSlotRate'] as number > 0).length;
  const fullyGrounded = records.filter(r => r['sourceGroundedSlotRate'] as number >= 1).length;
  return {
    total,
    groundedCount:      grounded,
    fullyGroundedCount: fullyGrounded,
    groundingRate:      total > 0 ? Math.round(grounded      / total * 1000) / 1000 : 0,
    fullGroundingRate:  total > 0 ? Math.round(fullyGrounded / total * 1000) / 1000 : 0,
  };
}

// ---------------------------------------------------------------------------
// summarizePhase8QualityRecords
// ---------------------------------------------------------------------------

/** Summarise phase-8 quality records by capability family. */
export function summarizePhase8QualityRecords(
  records: Array<Record<string, unknown>>,
): Record<string, Phase8QualityRecord> {
  const families = new Map<string, { total: number; proofReady: number; repairRequired: number }>();

  for (const r of records) {
    const family = String(r['capabilityFamily'] ?? r['family'] ?? 'unknown');
    const f = families.get(family) ?? { total: 0, proofReady: 0, repairRequired: 0 };
    f.total++;
    if (r['formulaProofReady'] || r['proofReady']) f.proofReady++;
    if (r['repairRequired']) f.repairRequired++;
    families.set(family, f);
  }

  const out: Record<string, Phase8QualityRecord> = {};
  for (const [family, stats] of families) {
    out[family] = {
      family,
      total:         stats.total,
      proofReady:    stats.proofReady,
      repairRequired: stats.repairRequired,
      proofReadyRate: stats.total > 0 ? Math.round(stats.proofReady / stats.total * 1000) / 1000 : 0,
      coverageRate:   stats.total > 0 ? Math.round((stats.total - stats.repairRequired) / stats.total * 1000) / 1000 : 0,
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// buildPhase8QualitySummaryRecord
// ---------------------------------------------------------------------------

/** Build a single phase-8 quality summary row for a set of norm records. */
export function buildPhase8QualitySummaryRecord(
  records: Array<Record<string, unknown>>,
  label = 'all',
): Record<string, unknown> {
  const total        = records.length;
  const proofReady   = records.filter(r => r['formulaProofReady'] || r['proofReady']).length;
  const repairRequired = records.filter(r => r['repairRequired']).length;
  const needsValidation = records.filter(r => r['requiresValidation']).length;
  return {
    label,
    total,
    proofReady,
    repairRequired,
    needsValidation,
    proofReadyRate:        total > 0 ? Math.round(proofReady / total * 1000) / 1000 : 0,
    repairRequiredRate:    total > 0 ? Math.round(repairRequired / total * 1000) / 1000 : 0,
    needsValidationRate:   total > 0 ? Math.round(needsValidation / total * 1000) / 1000 : 0,
  };
}

// ---------------------------------------------------------------------------
// buildPhase8QualitySummaryRecords
// ---------------------------------------------------------------------------

/** Build phase-8 quality summary rows grouped by capability family. */
export function buildPhase8QualitySummaryRecords(
  records: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const byFamily = new Map<string, Array<Record<string, unknown>>>();
  for (const r of records) {
    const family = String(r['capabilityFamily'] ?? r['family'] ?? 'unknown');
    const arr = byFamily.get(family) ?? [];
    arr.push(r);
    byFamily.set(family, arr);
  }
  return [...byFamily.entries()].map(([family, recs]) => buildPhase8QualitySummaryRecord(recs, family));
}

// ---------------------------------------------------------------------------
// summarizeProverSyntaxTargetCoverage
// ---------------------------------------------------------------------------

/** Summarise prover syntax target coverage. */
export function summarizeProverSyntaxTargetCoverage(
  records: Array<Record<string, unknown>>,
): Record<string, ProverSyntaxTargetCoverageRecord> {
  const byTarget = new Map<string, { total: number; proofReady: number }>();
  for (const r of records) {
    const target = String(r['proverbTarget'] ?? r['target'] ?? 'unknown');
    const f = byTarget.get(target) ?? { total: 0, proofReady: 0 };
    f.total++;
    if (r['formulaProofReady'] || r['proofReady']) f.proofReady++;
    byTarget.set(target, f);
  }

  const out: Record<string, ProverSyntaxTargetCoverageRecord> = {};
  for (const [target, stats] of byTarget) {
    const rate = stats.total > 0 ? stats.proofReady / stats.total : 0;
    out[target] = {
      proverbTarget:  target,
      totalNorms:     stats.total,
      proofReadyNorms: stats.proofReady,
      coverageRate:   Math.round(rate * 1000) / 1000,
      status:         rate >= 1 ? 'covered' : rate > 0 ? 'partial' : 'missing',
    };
  }
  return out;
}
