/**
 * wasm-prover-sprint93.test.ts
 * Tests for §12.20 deontic provenance, metrics, and prover syntax coverage.
 */

import {
  buildDecoderAuditTrail,
  buildDecoderSlotSupportMap,
  buildDecodedPhraseAuditRecords,
  traceDecodedPhraseToSource,
} from '../../src/services/deontic/decoder-provenance';
import {
  buildPhase8ParserMetricRecord,
  buildPhase8ParserQualityReport,
  summarizePhase8ParserMetrics,
} from '../../src/services/deontic/parser-qa-metrics';
import {
  ALL_PROVER_TARGETS,
  ProverSyntaxBuilder,
  ProverSyntaxValidator,
} from '../../src/services/deontic/prover-syntax-builder';
import { decodeLegalNormIR } from '../../src/services/deontic/legal-norm-decoder';
import {
  buildLegalNormIR,
  emptyQuality,
  parserWarningsRequireDecoderValidation,
  parser_warnings_require_decoder_validation,
} from '../../src/services/deontic/legal-norm-ir';
import {
  activeRepairDetailsFromParserElements,
  buildDecoderRecordFromIR,
  buildDecoderRecordsFromIRs,
  buildDecoderSlotGroundingAuditRecord,
  buildDecoderSlotGroundingAuditRecordFromIR,
  buildDecoderSlotGroundingAuditRecordsFromIRs,
  buildIrSlotProvenanceAuditRecord,
  buildIrSlotProvenanceAuditRecords,
  buildProverSyntaxSummaryRecordFromIR,
  buildProverSyntaxTargetCoverageRecord,
  buildProverSyntaxTargetCoverageRecordsFromIRs,
  buildReconstructionSlotLossRecord,
  buildReconstructionSlotLossRecords,
  normalizeRepairRequiredEvaluation,
  parserElementHasActiveRepair,
  parserElementsForMetrics,
  parserElementsToIrAlignedExportTables,
  parserElementsWithIrExportReadiness,
  summarizeActiveRepairFromParserElements,
  summarizeDecoderReconstructionRecords,
  summarizeDecoderSlotGroundingAuditRecords,
  summarizeProverSyntaxTargetCorpusCoverage,
  summarizeProverTargetQualityGates,
  summarizeProverTargetRoleMatrix,
  summarizeProverTargetSemanticFamilies,
  summarizeReconstructionSlotLoss,
  validateExportTables,
} from '../../src/services/deontic-exports';

describe('PORT-198 decoder provenance audit trail', () => {
  it('builds phrase-level source grounding and slot support maps', () => {
    const norm = buildLegalNormIR({
      source_id: 'prov-1',
      modality: 'O',
      actor: 'Users',
      action: 'log access',
      source_text: 'Users must log access upon request.',
      support_text: 'Users must log access upon request.',
      source_span: { start: 0, end: 35 },
      support_span: { start: 0, end: 35 },
      conditions: [{ text: 'upon request' }],
      quality: { ...emptyQuality(), schema_valid: true, parser_warnings: [] },
    });

    const trail = buildDecoderAuditTrail(norm);
    expect(trail.sourceId).toBe('prov-1');
    expect(trail.slotTextMap.actor).toEqual(['Users']);
    expect(trail.slotSupportMap.actor.grounded).toBe(true);
    expect(trail.slotSupportMap.conditions.sourceTexts).toContain('upon request');
    expect(trail.sourceCoverageRate).toBe(1);
    expect(trail.hasLoss).toBe(false);
  });

  it('reports missing slots, parser warnings, and ungrounded phrases as loss reasons', () => {
    const norm = buildLegalNormIR({
      source_id: 'prov-loss',
      modality: 'O',
      actor: '',
      action: 'notify agency',
      source_text: 'Agency notice is required.',
      quality: { ...emptyQuality(), parser_warnings: ['weak actor match'] },
    });
    const trail = buildDecoderAuditTrail(norm);
    expect(trail.hasLoss).toBe(true);
    expect(trail.lossReasons).toEqual(expect.arrayContaining([
      'missing required slot: actor',
      'parser warning: weak actor match',
      'ungrounded phrase: action=notify agency',
    ]));
  });

  it('exposes reusable phrase tracing helpers', () => {
    const norm = buildLegalNormIR({
      source_id: 'prov-helpers',
      modality: 'P',
      actor: 'Admins',
      action: 'view records',
      source_text: 'Admins may view records.',
    });
    const decoded = decodeLegalNormIR(norm);
    const records = buildDecodedPhraseAuditRecords(norm, decoded);
    const supportMap = buildDecoderSlotSupportMap(records);
    const actorPhrase = decoded.phrases.find(phrase => phrase.slot === 'actor')!;

    expect(traceDecodedPhraseToSource(norm, actorPhrase).grounded).toBe(true);
    expect(supportMap.actor.phraseIndexes).toEqual([0]);
  });
});

describe('PORT-199 Phase-8 parser QA metrics', () => {
  it('builds deterministic metric records with slot, warning, and target readiness data', () => {
    const norm = buildLegalNormIR({
      source_id: 'metric-1',
      modality: 'O',
      norm_type: 'obligation',
      actor: 'Users',
      action: 'log access',
      source_span: { start: 0, end: 24 },
      quality: {
        ...emptyQuality(),
        schema_valid: true,
        scaffold_quality: 0.91,
        quality_label: 'high',
        promotable_to_theorem: true,
        export_readiness: { 'z3-smt2': true, coq: { ready: false } },
      },
    });

    const record = buildPhase8ParserMetricRecord(norm, {
      requiredSlots: ['source_id', 'modality', 'actor', 'action', 'source_span'],
    });
    expect(record.slotCoverage).toBe(1);
    expect(record.exportReadyTargets).toEqual(['z3-smt2']);
    expect(record.blockedTargets).toEqual(['coq']);
    expect(record.repairRequired).toBe(true);
    expect(record.blockers).toContain('target not ready: coq');
  });

  it('summarizes quality labels, missing slots, warning counts, and readiness rates', () => {
    const ready = buildLegalNormIR({
      source_id: 'metric-ready',
      modality: 'O',
      actor: 'Users',
      action: 'log access',
      quality: { ...emptyQuality(), schema_valid: true, quality_label: 'high', scaffold_quality: 1, promotable_to_theorem: true, export_readiness: { lean4: true } },
    });
    const needsRepair = buildLegalNormIR({
      source_id: 'metric-repair',
      modality: 'F',
      actor: '',
      action: 'share data',
      quality: { ...emptyQuality(), quality_label: 'low', parser_warnings: ['missing actor'], export_readiness: { lean4: false } },
    });

    const summary = summarizePhase8ParserMetrics([ready, needsRepair], {
      requiredSlots: ['actor', 'action'],
    });
    expect(summary.totalNorms).toBe(2);
    expect(summary.promotableNorms).toBe(1);
    expect(summary.warningCount).toBe(1);
    expect(summary.missingSlotCounts.actor).toBe(1);
    expect(summary.qualityLabelCounts.high).toBe(1);
    expect(summary.targetReadiness.lean4.readinessRate).toBe(0.5);

    const report = buildPhase8ParserQualityReport([ready, needsRepair], { requiredSlots: ['actor', 'action'] });
    expect(report.topMissingSlots[0]).toEqual({ slot: 'actor', count: 1 });
    expect(report.repairQueue.map(item => item.sourceId)).toContain('metric-repair');
  });
});

describe('PORT-200 prover syntax target coverage and validator', () => {
  it('generates syntax for every supported target without changing the legacy default list', () => {
    const norm = buildLegalNormIR({ source_id: 'syntax-1', modality: 'O', actor: 'Users', action: 'LogAccess' });

    const legacy = ProverSyntaxBuilder.buildSyntaxReport(norm);
    expect(legacy.records.map(record => record.target_id)).toEqual(['z3-smt2', 'dcec', 'tdfol', 'lean4', 'prolog']);

    const full = ProverSyntaxBuilder.buildSyntaxReport(norm, ALL_PROVER_TARGETS);
    expect(full.records.map(record => record.target_id)).toEqual(ALL_PROVER_TARGETS);
    expect(full.proposition).toBe('LogAccess');
    expect(full.action).toBe('LogAccess');
    expect(full.records.find(record => record.target_id === 'coq')?.formula).toContain('Theorem');
    expect(full.records.find(record => record.target_id === 'tptp')?.formula).toContain('fof(');
    const jsonIr = JSON.parse(full.records.find(record => record.target_id === 'json-ir')!.formula);
    expect(jsonIr.source_id).toBe('syntax-1');
    expect(jsonIr.proposition).toBe('LogAccess');
    expect(jsonIr.action).toBe('LogAccess');
  });

  it('builds target syntax maps and validates complete reports', () => {
    const norm = buildLegalNormIR({ source_id: 'syntax-2', modality: 'P', actor: 'Admins', action: 'ViewRecords' });
    const syntaxMap = ProverSyntaxBuilder.buildTargetSyntaxMap(norm);
    expect(Object.keys(syntaxMap)).toEqual(ALL_PROVER_TARGETS);
    expect(syntaxMap['smt-lib2']).toContain('assert');

    const report = ProverSyntaxBuilder.buildSyntaxReport(norm, ALL_PROVER_TARGETS);
    const validation = new ProverSyntaxValidator().validateReport(report);
    expect(validation.coverageRate).toBe(1);
    expect(validation.missingTargets).toEqual([]);
    expect(validation.allValid).toBe(true);
    expect(validation.proofReadyTargets).toEqual(ALL_PROVER_TARGETS);
  });

  it('surfaces missing targets and invalid records', () => {
    const norm = buildLegalNormIR({ source_id: 'syntax-bad', modality: 'O', actor: '', action: 'LogAccess' });
    const report = ProverSyntaxBuilder.buildSyntaxReport(norm, ['z3-smt2']);
    const validation = new ProverSyntaxValidator(['z3-smt2', 'coq']).validateReport(report);
    expect(validation.allValid).toBe(false);
    expect(validation.missingTargets).toEqual(['coq']);
    expect(validation.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'record_invalid',
      'record_warning',
      'missing_target',
    ]));
  });
});

describe('PORT-214 direct deontic export records', () => {
  const norm = buildLegalNormIR({
    source_id: 'export-1',
    canonical_citation: 'Demo Rule 1',
    modality: 'O',
    norm_type: 'obligation',
    actor: 'Users',
    action: 'log access',
    source_text: 'Users must log access upon request.',
    support_text: 'Users must log access upon request.',
    source_span: { start: 0, end: 35 },
    support_span: { start: 0, end: 35 },
    conditions: [{ text: 'upon request' }],
    quality: {
      ...emptyQuality(),
      schema_valid: true,
      scaffold_quality: 1,
      quality_label: 'high',
      promotable_to_theorem: true,
      export_readiness: {
        formula_proof_ready: true,
        formula_requires_validation: false,
        formula_repair_required: false,
        deterministic_resolution: { type: 'source_grounded_formula' },
      },
    },
  });

  it('builds decoder, IR provenance, slot grounding, and reconstruction-loss rows', () => {
    const decoder = buildDecoderRecordFromIR(norm);
    expect(decoder.source_id).toBe('export-1');
    expect(decoder.decoded_text).toContain('Users must log access');
    expect(decoder.grounded_decoded_phrase_rate).toBe(1);
    expect(buildDecoderRecordsFromIRs([norm])).toHaveLength(1);

    const irAudit = buildIrSlotProvenanceAuditRecord(norm, ['actor', 'action', 'conditions']);
    expect(irAudit.all_checked_slots_grounded).toBe(true);
    expect(buildIrSlotProvenanceAuditRecords([norm], ['actor'])).toHaveLength(1);

    const slotAudit = buildDecoderSlotGroundingAuditRecord(decoder, ['actor', 'action']);
    expect(slotAudit.slot_grounding_complete).toBe(true);
    expect(buildDecoderSlotGroundingAuditRecordFromIR(norm).source_id).toBe('export-1');
    expect(buildDecoderSlotGroundingAuditRecordsFromIRs([norm])).toHaveLength(1);

    const slotSummary = summarizeDecoderSlotGroundingAuditRecords([slotAudit]);
    expect(slotSummary.slot_grounding_complete_count).toBe(1);

    const lossSummary = summarizeReconstructionSlotLoss([decoder], ['actor', 'action']);
    expect(lossSummary.slot_reconstruction_complete).toBe(true);
    const lossRow = buildReconstructionSlotLossRecord('export-1', [decoder], ['actor', 'action']);
    expect(lossRow.requires_validation).toBe(false);
    expect(buildReconstructionSlotLossRecords([decoder], ['actor', 'action'])).toHaveLength(1);

    const decoderSummary = summarizeDecoderReconstructionRecords([decoder]);
    expect(decoderSummary.record_count).toBe(1);
  });

  it('builds prover syntax summaries and corpus-level target reports', () => {
    const summary = buildProverSyntaxSummaryRecordFromIR(norm, ['frame_logic', 'deontic_cec', 'fol']);
    expect(summary.required_targets_passed).toBe(true);
    expect(summary.targets).toEqual(['frame_logic', 'deontic_cec', 'fol']);

    const syntaxRecord = (summary.prover_syntax_records as Array<Record<string, unknown>>)[0];
    const coverageRow = buildProverSyntaxTargetCoverageRecord(syntaxRecord, ['frame_logic', 'deontic_cec', 'fol']);
    expect(coverageRow.status).toBe('covered');

    const coverage = buildProverSyntaxTargetCoverageRecordsFromIRs([norm], ['frame_logic', 'deontic_cec', 'fol']);
    expect(coverage).toHaveLength(3);
    expect(summarizeProverSyntaxTargetCorpusCoverage(coverage, ['frame_logic', 'deontic_cec', 'fol']).covered_source_count).toBe(1);
    expect(summarizeProverTargetQualityGates(coverage).all_quality_gates_passed).toBe(true);
    expect(summarizeProverTargetRoleMatrix(coverage).target_roles).toHaveProperty('frame_logic');
    expect(summarizeProverTargetSemanticFamilies(coverage).semantic_family_distribution).toHaveProperty('frame');
  });

  it('normalizes active repair details and validates IR-aligned export tables', () => {
    const blockedElement = {
      source_id: 'repair-1',
      canonical_citation: 'Demo Rule 2',
      modality: 'O',
      norm_type: 'obligation',
      actor: '',
      action: 'notify agency',
      source_text: 'The agency must be notified.',
      text: 'The agency must be notified.',
      parser_warnings: ['missing actor'],
      repair_required: true,
      llm_repair: { required: true, reasons: ['missing actor'] },
    };

    expect(parserElementHasActiveRepair(blockedElement)).toBe(true);
    const metricRow = parserElementsForMetrics([blockedElement])[0];
    expect(metricRow.active_repair_required).toBe(true);
    expect(metricRow.proposition).toBe('notify agency');
    expect(activeRepairDetailsFromParserElements([blockedElement])).toHaveLength(1);
    expect(summarizeActiveRepairFromParserElements([blockedElement]).repair_required_count).toBe(1);

    const normalized = normalizeRepairRequiredEvaluation([blockedElement], {
      repair_required_details: [{ source_id: 'repair-1', note: 'raw' }],
      metrics: { coverage_gaps: ['repair_required_count:1', 'other_gap'] },
    });
    expect(normalized.repair_required_count).toBe(1);
    expect((normalized.metrics as Record<string, unknown>).coverage_gaps).toEqual(['other_gap']);

    const readyRows = parserElementsWithIrExportReadiness([{
      source_id: 'export-1',
      modality: 'O',
      norm_type: 'obligation',
      actor: 'Users',
      action: 'log access',
      source_text: 'Users must log access.',
    }]);
    expect(readyRows[0].ir_export_readiness).toBeDefined();

    const tables = parserElementsToIrAlignedExportTables([{
      source_id: 'export-1',
      canonical_citation: 'Demo Rule 1',
      modality: 'O',
      norm_type: 'obligation',
      actor: 'Users',
      action: 'log access',
      source_text: 'Users must log access.',
      support_text: 'Users must log access.',
      quality: { ...emptyQuality(), promotable_to_theorem: true, schema_valid: true },
    }]);
    expect(tables.decoder_reconstructions).toHaveLength(1);
    expect(validateExportTables(tables).valid).toBe(true);
  });

  it('classifies decoder-blocking parser warnings like the Python IR helper', () => {
    expect(parserWarningsRequireDecoderValidation(['cross_reference_requires_resolution'])).toBe(false);
    expect(parserWarningsRequireDecoderValidation(['exception_requires_scope_review'])).toBe(false);
    expect(parserWarningsRequireDecoderValidation([
      'cross_reference_requires_resolution',
      'exception_requires_scope_review',
    ])).toBe(true);
    expect(parser_warnings_require_decoder_validation(['missing actor'])).toBe(true);
  });
});
