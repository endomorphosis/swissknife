import {
  analyzeNormativeSentence,
  buildCanonicalCitation,
  buildDeonticFormula,
  buildDocumentExportTablesFromIr,
  buildDocumentExportManifest,
  buildDocumentExportTables,
  buildExportReadiness,
  buildExportRecordBundle,
  buildFormalTerms,
  buildFormalLogicRecordFromIr,
  buildFormalLogicRecord,
  buildKgRelationshipHints,
  buildLlmRepairPayload,
  buildLogicFrame,
  buildProofObligationRecord,
  buildProcedureEventRecordsFromIr,
  buildProcedureEventRecords,
  buildProofObligationRecordFromIr,
  buildReferenceRecords,
  buildRepairQueueRecord,
  buildRepairQueueRecordFromIr,
  buildSanctionRecords,
  buildSourceId,
  classifyLegalFrame,
  classifySanctionClass,
  classifySanctionModality,
  convertLegalTextToDeontic,
  expandEnumeratedNorms,
  extractConditionDetails,
  extractConditions,
  extractCrossReferenceDetails,
  extractDefinitionBody,
  extractEnumeratedItems,
  extractEnforcementLinks,
  extractExceptionDetails,
  extractExceptions,
  extractImprisonmentDuration,
  extractLegalAction,
  extractLegalInstrumentTarget,
  extractLegalSubject,
  extractMonetaryAmountDetails,
  extractMonetaryAmounts,
  extractNormativeElements,
  extractOntologyTerms,
  extractOverrideClauseDetails,
  extractOverrideClauses,
  extractPenaltyDetails,
  extractPenaltyRecurrence,
  extractProcedureDetails,
  extractProcedureEventMentions,
  extractProcedureEventRelations,
  extractTemporalConstraintDetails,
  getExportTableSpecs,
  inferDefinitionScope,
  mergeOntologyTerms,
  migrateParserElement,
  normalizeTemporalValue,
  parserElementToFormula,
  parserElementsWithDeterministicIrReadiness,
  resolveCrossReferences,
  segmentLegalText,
  serializeExportTablesForParquet,
  summarizeParserElements,
  summarizePhase8ParserMetrics,
  summarizeProverSyntaxTargetCoverage,
  validateDocumentExportTables,
  validateParserElement,
} from '../../src/services/deontic-legal-text-engine';

describe('PORT-227 deontic legal-text engine compatibility layer', () => {
  it('segments text and extracts normative elements with parser fields', () => {
    const text = 'The operator shall file a report within 30 days unless exempt under section 9. The agency may inspect records.';
    const segments = segmentLegalText(text);
    const elements = extractNormativeElements(text);

    expect(segments).toHaveLength(2);
    expect(elements).toHaveLength(2);
    expect(elements[0]).toMatchObject({
      schema_version: 'deterministic_deontic_v12',
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

  it('directly ports deontic parser utility and export-table surfaces', () => {
    const text = 'Notwithstanding section 3, if licensed, the operator shall file a report within 30 business days after receipt unless exempt under section 9. A violation shall be punishable by a civil penalty up to $500 per violation.';
    const element = migrateParserElement({
      source_id: 's-direct',
      canonical_citation: '§ 12',
      text,
      support_text: text,
      support_span: [0, text.length],
      norm_type: 'obligation',
      deontic_operator: 'O',
      modal: 'shall',
      subject: ['operator'],
      action: ['file a report'],
      document_type: 'statute',
      conditions: extractConditions(text),
      condition_details: extractConditionDetails(text),
      exceptions: extractExceptions(text),
      exception_details: extractExceptionDetails(text),
      override_clauses: extractOverrideClauses(text),
      override_clause_details: extractOverrideClauseDetails(text),
      cross_references: extractCrossReferenceDetails(text).map(ref => ref.normalized_text),
      cross_reference_details: extractCrossReferenceDetails(text),
      temporal_constraints: extractTemporalConstraintDetails(text).map(item => item.value),
      temporal_constraint_details: extractTemporalConstraintDetails(text),
      enumerated_items: extractEnumeratedItems('The agency may (a) inspect records; and (b) issue orders.'),
      ontology_terms: extractOntologyTerms(text),
      penalty: extractPenaltyDetails(text),
      procedure: extractProcedureDetails('Upon receipt of an application, the agency shall issue notice after review before hearing.', 'issue notice'),
    });

    expect(buildSourceId(element)).toMatch(/^deontic:/);
    expect(extractConditions(text)).toContain('licensed');
    expect(extractExceptions(text)).toEqual(expect.arrayContaining(['exempt under section 9']));
    expect(extractOverrideClauses(text)).toContain('section 3');
    expect(extractCrossReferenceDetails('sections 1 through 3 and 5 U.S.C. section 552')).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'section_range', value: '1-3' }),
      expect.objectContaining({ type: 'usc', value: '5 552' }),
    ]));
    expect(normalizeTemporalValue('30 business days after receipt')).toMatchObject({ quantity: 30, unit: 'day', calendar: 'business', anchor_event: 'receipt', direction: 'after' });
    expect(extractMonetaryAmounts(text)[0]).toMatchObject({ raw_text: '$500' });
    expect(extractMonetaryAmountDetails(text)[0]).toMatchObject({ numeric_value: '500', currency: 'USD' });
    expect(extractPenaltyRecurrence(text)).toMatchObject({ type: 'per_violation' });
    expect(extractImprisonmentDuration('jail for not more than 2 years')).toMatchObject({ quantity: 2, unit: 'year' });
    expect(classifySanctionClass(text)).toBe('civil');
    expect(classifySanctionModality(text)).toBe('mandatory');
    expect(extractPenaltyDetails(text)).toMatchObject({ has_fine: true, has_range: false });
    expect(extractProcedureEventMentions('notice after review before hearing').map(item => item.event)).toEqual(['notice', 'review', 'hearing']);
    expect(extractProcedureEventRelations('The agency shall issue notice after review before hearing.', 'issue notice')).toEqual(expect.arrayContaining([
      expect.objectContaining({ relation: 'after', anchor_event: 'review' }),
      expect.objectContaining({ relation: 'before', anchor_event: 'hearing' }),
    ]));
    expect(extractProcedureDetails('Upon receipt of an application, the agency shall issue notice after review before hearing.', 'issue notice')).toMatchObject({ trigger_event: 'application', terminal_event: 'issuance' });
    expect(extractLegalSubject('Operators and residents shall file reports.')).toEqual(expect.arrayContaining(['operators', 'residents']));
    expect(extractLegalAction('The operator shall file a report before inspection.')).toContain('file a report');
    expect(extractLegalInstrumentTarget('obtain a permit before work')).toBe('permit');
    expect(extractDefinitionBody('The term agency means a public body.')).toBe('a public body');
    expect(inferDefinitionScope('As used in this section, agency means department.')).toMatchObject({ scope_type: 'section' });
    expect(mergeOntologyTerms(extractOntologyTerms(text), [{ term: 'agency', definition_body: 'public body' }])).toEqual(expect.arrayContaining([
      expect.objectContaining({ term: 'agency', type: 'defined_term' }),
    ]));

    expect(buildFormalTerms(element)).toMatchObject({ actor_id: 'operator', action_predicate: 'FileReport' });
    expect(buildLogicFrame(element)).toMatchObject({ schema_version: 'deterministic_deontic_v12', actor: 'operator' });
    expect(classifyLegalFrame(element)).toBe('penalty');
    expect(buildKgRelationshipHints(element).length).toBeGreaterThan(0);
    expect(buildLlmRepairPayload({ ...element, quality_label: 'low' })).toMatchObject({ required: true, target_schema_version: 'deterministic_deontic_v12' });
    expect(buildExportReadiness({ ...element, schema_valid: true, parser_warnings: [], llm_repair: { required: false }, promotable_to_theorem: true })).toMatchObject({ proof_ready: true });
    expect(validateParserElement(element)).toMatchObject({ valid: true });
    expect(parserElementsWithDeterministicIrReadiness([element])[0]).toHaveProperty('export_readiness');

    const formal = buildFormalLogicRecord(element);
    expect(buildDeonticFormula(element)).toContain('→ O(');
    expect(buildProofObligationRecord(element)).toMatchObject({ formula_id: formal.formula_id });
    expect(buildProcedureEventRecords(element).map(record => record.event)).toEqual(expect.arrayContaining(['application', 'notice', 'hearing']));
    expect(buildReferenceRecords(element)[0]).toMatchObject({ reference_type: 'section' });
    expect(buildSanctionRecords(element)[0]).toMatchObject({ sanction_type: 'fine' });
    expect(buildRepairQueueRecord({ ...element, llm_repair: { required: true, reasons: ['review'], prompt_hash: 'abc' } })).toMatchObject({ required: true });
    expect(expandEnumeratedNorms([element])).toHaveLength(2);

    const bundle = buildExportRecordBundle(element);
    const tables = buildDocumentExportTables([element]);
    expect(bundle).toHaveProperty('knowledge_graph_triples');
    expect(getExportTableSpecs()).toHaveProperty('knowledge_graph_triples');
    expect(validateDocumentExportTables(tables)).toMatchObject({ valid: true });
    expect(buildDocumentExportManifest([element], tables)).toMatchObject({ element_count: 1, schema_version: 'deterministic_deontic_v12' });
    expect(serializeExportTablesForParquet(tables).canonical[0].procedure).toEqual(expect.any(String));
    expect(convertLegalTextToDeontic('The agency may inspect records.')[0]).toMatchObject({ schema_version: 'deterministic_deontic_v12' });
  });
});
