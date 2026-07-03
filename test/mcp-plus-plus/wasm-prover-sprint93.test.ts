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
import { buildLegalNormIR, emptyQuality } from '../../src/services/deontic/legal-norm-ir';

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
    expect(full.records.find(record => record.target_id === 'coq')?.formula).toContain('Theorem');
    expect(full.records.find(record => record.target_id === 'tptp')?.formula).toContain('fof(');
    expect(JSON.parse(full.records.find(record => record.target_id === 'json-ir')!.formula).source_id).toBe('syntax-1');
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
