import {
  analyzeNormativeSentence,
  buildCanonicalCitation,
  buildDocumentExportTablesFromIr,
  buildFormalLogicRecordFromIr,
  buildProcedureEventRecordsFromIr,
  buildProofObligationRecordFromIr,
  buildRepairQueueRecordFromIr,
  extractEnforcementLinks,
  extractNormativeElements,
  parserElementToFormula,
  resolveCrossReferences,
  segmentLegalText,
  summarizeParserElements,
  summarizePhase8ParserMetrics,
  summarizeProverSyntaxTargetCoverage,
} from '../../src/services/deontic-legal-text-engine';

describe('PORT-227 deontic legal-text engine compatibility layer', () => {
  it('segments text and extracts normative elements with parser fields', () => {
    const text = 'The operator shall file a report within 30 days unless exempt under section 9. The agency may inspect records.';
    const segments = segmentLegalText(text);
    const elements = extractNormativeElements(text);

    expect(segments).toHaveLength(2);
    expect(elements).toHaveLength(2);
    expect(elements[0]).toMatchObject({
      schema_version: 'deterministic_deontic_ts_v1',
      norm_type: 'obligation',
      deontic_operator: 'O',
      subject: 'operator',
      actor_type: 'legal_entity',
      conditions: [],
      exceptions: expect.arrayContaining(['exempt under section 9']),
      cross_references: ['section 9'],
      document_type: 'statute',
    });
    expect(elements[1]).toMatchObject({
      norm_type: 'permission',
      deontic_operator: 'P',
      subject: 'agency',
      action: 'inspect records',
    });
  });

  it('analyzes a sentence and resolves citations, references, and enforcement links', () => {
    const element = analyzeNormativeSentence(
      'Section 12 requires that the operator shall file a report before inspection unless waived under section 9.',
      'regulation',
      { sourceId: 's12' },
    );

    expect(element).toMatchObject({
      source_id: 's12',
      canonical_citation: '§ 12',
      document_type: 'regulation',
      temporal_constraints: expect.arrayContaining(['before inspection unless waived under section 9']),
      exceptions: expect.arrayContaining(['waived under section 9']),
      cross_references: ['section 9'],
    });
    expect(buildCanonicalCitation('See § 44(a).', 'fallback')).toBe('§ 44(a)');
    expect(resolveCrossReferences(element!, [{ source_id: 's9', canonical_citation: '§ 9' }])).toEqual([
      {
        reference: 'section 9',
        canonical_citation: '§ 9',
        target_source_id: 's9',
        target_exists: true,
        resolution_status: 'resolved',
      },
    ]);
    expect(extractEnforcementLinks('Failure to file a report is a violation and is punishable by a fine.')).toEqual([
      expect.objectContaining({ type: 'penalty', sanction: 'a fine' }),
      expect.objectContaining({ type: 'violation_trigger', action: 'file a report' }),
    ]);
  });

  it('builds formula/export/proof/repair/procedure records from parser elements', () => {
    const element = analyzeNormativeSentence(
      'The operator shall file a report before inspection.',
      'statute',
      { sourceId: 's1', canonicalCitation: '§ 1' },
    )!;
    const formula = parserElementToFormula(element);
    const formal = buildFormalLogicRecordFromIr(element);
    const proof = buildProofObligationRecordFromIr(element);
    const repair = buildRepairQueueRecordFromIr({ ...element, promotable_to_theorem: false });
    const procedure = buildProcedureEventRecordsFromIr(element);
    const tables = buildDocumentExportTablesFromIr([element]);

    expect(formula).toMatch(/^O\(.+\)$/);
    expect(formal).toMatchObject({
      source_id: 's1',
      canonical_citation: '§ 1',
      target_logic: 'dcec',
      formula,
    });
    expect(proof).toMatchObject({ source_id: 's1', formula_id: formal.formula_id });
    expect(repair).toMatchObject({ source_id: 's1', formula_id: formal.formula_id, requires_llm_repair: false });
    expect(procedure[0]).toMatchObject({ source_id: 's1', relation: 'temporal_constraint' });
    expect(tables).toMatchObject({
      canonical: [expect.objectContaining({ source_id: 's1' })],
      formal_logic: [expect.objectContaining({ source_id: 's1' })],
      proof_obligations: [expect.objectContaining({ source_id: 's1' })],
      procedure_event_records: [expect.objectContaining({ source_id: 's1' })],
    });
  });

  it('summarizes parser and prover target metrics', () => {
    const elements = extractNormativeElements('The operator shall file a report. The agency may inspect records.');
    const formalRecords = elements.map(buildFormalLogicRecordFromIr);

    expect(summarizeParserElements(elements)).toMatchObject({
      element_count: 2,
      norm_type_distribution: { obligation: 1, permission: 1 },
      modality_distribution: { O: 1, P: 1 },
    });
    expect(summarizePhase8ParserMetrics(elements)).toMatchObject({
      phase8_record_count: 2,
      export_table_counts: expect.objectContaining({ canonical: 2, formal_logic: 2 }),
    });
    expect(summarizeProverSyntaxTargetCoverage(formalRecords)).toMatchObject({
      record_count: 2,
      target_distribution: { dcec: 2 },
    });
  });
});
