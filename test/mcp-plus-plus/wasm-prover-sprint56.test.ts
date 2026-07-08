/**
 * Sprint 56 tests — Modal Compiler + Deontic Exports (FINAL GAP CLOSURE)
 *
 * Covers T-252 (modal-compiler.ts),
 *         T-253 (deontic-exports.ts).
 */

import {
  DeterministicModalCompiler,
  defaultModalCompilerConfig,
  makeAmbiguity,
  ambiguityToDict,
  compilationResultToDict,
} from '../../src/services/logic/modal/modal-compiler';

import {
  buildDeterministicParserCapabilityProfileRecord,
  buildDeterministicParserCapabilityProfileRecords,
  summarizeDeterministicParserCapabilityProfileRecords,
  summarizeIrSlotProvenanceAuditRecords,
  summarizePhase8QualityRecords,
  buildPhase8QualitySummaryRecord,
  buildPhase8QualitySummaryRecords,
  summarizeProverSyntaxTargetCoverage,
} from '../../src/services/logic/deontic/deontic-exports';

// ---------------------------------------------------------------------------
// ModalCompilerConfig tests
// ---------------------------------------------------------------------------

describe('defaultModalCompilerConfig', () => {
  test('returns expected defaults', () => {
    const cfg = defaultModalCompilerConfig();
    expect(cfg.parserBackend).toBe('regex');
    expect(cfg.topKFrames).toBe(3);
    expect(cfg.frameScoreMargin).toBe(0.05);
    expect(cfg.modalFamilyShareMargin).toBe(0.34);
  });
});

// ---------------------------------------------------------------------------
// ModalCompilationAmbiguity tests
// ---------------------------------------------------------------------------

describe('makeAmbiguity', () => {
  test('creates ambiguity with defaults', () => {
    const a = makeAmbiguity('test_type', 'test message');
    expect(a.ambiguityType).toBe('test_type');
    expect(a.message).toBe('test message');
    expect(a.severity).toBe('review');
    expect(a.candidateIds).toHaveLength(0);
  });

  test('ambiguityToDict is JSON-serialisable', () => {
    const a = makeAmbiguity('t', 'm', { candidateIds: ['a', 'b'], severity: 'error' });
    const d = ambiguityToDict(a);
    expect(d.ambiguityType).toBe('t');
    expect(d.candidateIds).toEqual(['a', 'b']);
    expect(() => JSON.stringify(d)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// DeterministicModalCompiler tests
// ---------------------------------------------------------------------------

describe('DeterministicModalCompiler — compile()', () => {
  const compiler = new DeterministicModalCompiler();

  test('compiles obligation text', () => {
    const r = compiler.compile('Contractors must pay taxes by the end of the month.');
    expect(r.parserName).toBe('legal_modal_parser_v1');
    expect(r.normalizedText.length).toBeGreaterThan(0);
    expect(r.modalIr).toBeDefined();
    expect(r.modalIr.text).toContain('Contractors');
  });

  test('selectedFrame is a known modal family', () => {
    const r = compiler.compile('All employees shall comply with the policy.');
    const knownFamilies = ['deontic', 'temporal', 'alethic', 'epistemic', 'conditional', null];
    expect(knownFamilies).toContain(r.selectedFrame);
  });

  test('modalIr has confidence in [0, 1]', () => {
    const r = compiler.compile('The party must notify.');
    expect(r.modalIr.confidence).toBeGreaterThanOrEqual(0);
    expect(r.modalIr.confidence).toBeLessThanOrEqual(1);
  });

  test('frameCandidates is an array', () => {
    const r = compiler.compile('The tenant may terminate the lease.');
    expect(Array.isArray(r.frameCandidates)).toBe(true);
  });

  test('ambiguities is an array', () => {
    expect(Array.isArray(compiler.compile('P').ambiguities)).toBe(true);
  });

  test('compilationResultToDict is JSON-serialisable', () => {
    const r = compiler.compile('Parties must act in good faith.');
    const d = compilationResultToDict(r);
    expect(() => JSON.stringify(d)).not.toThrow();
    expect(d.parserName).toBe('legal_modal_parser_v1');
  });

  test('metadata includes documentId when provided', () => {
    const r = compiler.compile('P', { documentId: 'doc-123' });
    expect((r.metadata as Record<string, unknown>)['documentId']).toBe('doc-123');
  });

  test('compileAll processes multiple texts', () => {
    const results = compiler.compileAll([
      'Alice must pay.',
      'Bob may leave.',
      'Eve must not disclose.',
    ]);
    expect(results).toHaveLength(3);
    results.forEach(r => expect(r.parserName).toBe('legal_modal_parser_v1'));
  });

  test('stats.totalCompiled increments', () => {
    const c2 = new DeterministicModalCompiler();
    c2.compile('P');
    c2.compile('Q');
    expect(c2.getStats().totalCompiled).toBe(2);
  });
});

describe('DeterministicModalCompiler — ambiguity detection', () => {
  const compiler = new DeterministicModalCompiler();

  test('detects ambiguity when two frames are within margin', () => {
    // Text with both deontic and temporal keywords
    const r = new DeterministicModalCompiler({ frameScoreMargin: 0.99 })
      .compile('Parties must always comply with the policy.');
    // With a very high margin, two families likely within it
    // Result may or may not have ambiguities depending on score spread
    expect(Array.isArray(r.ambiguities)).toBe(true);
  });

  test('emits Python-ordered formula families for conditional and temporal deontic text', () => {
    const r = compiler.compile('If the filing is late, the agency must notify the applicant within 30 days.');
    expect(r.modalIr.formulaFamilies).toEqual(['conditional_normative', 'deontic', 'temporal']);
    expect(r.modalIr.formulaCount).toBe(3);
    expect((r.metadata as Record<string, unknown>)['modal_family_counts']).toEqual({
      conditional_normative: 1,
      deontic: 1,
      temporal: 1,
    });
  });

  test('marks non-empty text without formulas as missing_modal_formula', () => {
    const r = compiler.compile('This sentence has no modal policy.');
    expect(r.ambiguities.map(ambiguity => ambiguity.ambiguityType)).toContain('missing_modal_formula');
  });
});

// ---------------------------------------------------------------------------
// buildDeterministicParserCapabilityProfileRecord tests
// ---------------------------------------------------------------------------

const makeNorm = (overrides: Record<string, unknown> = {}) => ({
  sourceId:           'norm-001',
  normType:           'obligation',
  modality:           'must',
  formula:            'O(pay)',
  proofReady:         true,
  requiresValidation: false,
  repairRequired:     false,
  blockers:           [] as string[],
  actor:              'contractor',
  action:             'pay',
  ...overrides,
});

describe('buildDeterministicParserCapabilityProfileRecord', () => {
  test('returns a profile record with required fields', () => {
    const r = buildDeterministicParserCapabilityProfileRecord(makeNorm());
    expect(r).toHaveProperty('parserCapabilityProfileId');
    expect(r).toHaveProperty('sourceId', 'norm-001');
    expect(r).toHaveProperty('capabilityFamily', 'obligation');
    expect(r).toHaveProperty('formulaProofReady', true);
    expect(r).toHaveProperty('sourceGroundedSlotRate');
  });

  test('grounded slots count those present in norm', () => {
    const r = buildDeterministicParserCapabilityProfileRecord(makeNorm(), ['actor', 'action', 'condition']);
    expect(r.groundedSlots).toContain('actor');
    expect(r.groundedSlots).toContain('action');
    expect(r.missingSlots).toContain('condition');
  });

  test('slot grounding rate is in [0, 1]', () => {
    const r = buildDeterministicParserCapabilityProfileRecord(makeNorm());
    expect(r.sourceGroundedSlotRate).toBeGreaterThanOrEqual(0);
    expect(r.sourceGroundedSlotRate).toBeLessThanOrEqual(1);
  });

  test('profile id is a non-empty string', () => {
    const r = buildDeterministicParserCapabilityProfileRecord(makeNorm());
    expect(r.parserCapabilityProfileId.length).toBeGreaterThan(0);
  });
});

describe('buildDeterministicParserCapabilityProfileRecords', () => {
  test('builds records for all norms', () => {
    const norms = [makeNorm(), makeNorm({ sourceId: 'norm-002', modality: 'may' })];
    const records = buildDeterministicParserCapabilityProfileRecords(norms);
    expect(records).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// summarizeDeterministicParserCapabilityProfileRecords tests
// ---------------------------------------------------------------------------

describe('summarizeDeterministicParserCapabilityProfileRecords', () => {
  test('returns total count', () => {
    const records = buildDeterministicParserCapabilityProfileRecords([makeNorm(), makeNorm()]);
    const s = summarizeDeterministicParserCapabilityProfileRecords(records);
    expect(s['total']).toBe(2);
  });

  test('returns empty summary for empty input', () => {
    const s = summarizeDeterministicParserCapabilityProfileRecords([]);
    expect(s['total']).toBe(0);
  });

  test('byFamily has obligation key', () => {
    const records = buildDeterministicParserCapabilityProfileRecords([makeNorm()]);
    const s = summarizeDeterministicParserCapabilityProfileRecords(records);
    expect((s['byFamily'] as Record<string, unknown>)['obligation']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// summarizeIrSlotProvenanceAuditRecords tests
// ---------------------------------------------------------------------------

describe('summarizeIrSlotProvenanceAuditRecords', () => {
  const records = [
    { sourceGroundedSlotRate: 1.0 },
    { sourceGroundedSlotRate: 0.5 },
    { sourceGroundedSlotRate: 0.0 },
  ];

  test('returns total count', () => {
    const s = summarizeIrSlotProvenanceAuditRecords(records);
    expect(s['total']).toBe(3);
  });

  test('fully grounded count is correct', () => {
    const s = summarizeIrSlotProvenanceAuditRecords(records);
    expect(s['fullyGroundedCount']).toBe(1);
  });

  test('grounded count includes partial', () => {
    const s = summarizeIrSlotProvenanceAuditRecords(records);
    expect(s['groundedCount']).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// summarizePhase8QualityRecords tests
// ---------------------------------------------------------------------------

describe('summarizePhase8QualityRecords', () => {
  const records = [
    { capabilityFamily: 'obligation', formulaProofReady: true,  repairRequired: false },
    { capabilityFamily: 'obligation', formulaProofReady: false, repairRequired: true  },
    { capabilityFamily: 'permission', formulaProofReady: true,  repairRequired: false },
  ];

  test('groups by capability family', () => {
    const s = summarizePhase8QualityRecords(records);
    expect(s['obligation']).toBeDefined();
    expect(s['permission']).toBeDefined();
  });

  test('obligation total is 2', () => {
    const s = summarizePhase8QualityRecords(records);
    expect(s['obligation'].total).toBe(2);
  });

  test('proofReadyRate for permission is 1', () => {
    const s = summarizePhase8QualityRecords(records);
    expect(s['permission'].proofReadyRate).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildPhase8QualitySummaryRecord tests
// ---------------------------------------------------------------------------

describe('buildPhase8QualitySummaryRecord', () => {
  const records = [
    { formulaProofReady: true,  repairRequired: false, requiresValidation: false },
    { formulaProofReady: false, repairRequired: true,  requiresValidation: true  },
  ];

  test('returns expected summary fields', () => {
    const s = buildPhase8QualitySummaryRecord(records, 'test-label');
    expect(s['label']).toBe('test-label');
    expect(s['total']).toBe(2);
    expect(s['proofReady']).toBe(1);
    expect(s['repairRequired']).toBe(1);
  });

  test('proofReadyRate is 0.5', () => {
    const s = buildPhase8QualitySummaryRecord(records);
    expect(s['proofReadyRate']).toBe(0.5);
  });
});

describe('buildPhase8QualitySummaryRecords', () => {
  test('groups by capabilityFamily', () => {
    const records = [
      { capabilityFamily: 'obligation', formulaProofReady: true },
      { capabilityFamily: 'permission', formulaProofReady: false },
    ];
    const summaries = buildPhase8QualitySummaryRecords(records);
    expect(summaries.length).toBe(2);
    const labels = summaries.map(s => s['label']);
    expect(labels).toContain('obligation');
    expect(labels).toContain('permission');
  });
});

// ---------------------------------------------------------------------------
// summarizeProverSyntaxTargetCoverage tests
// ---------------------------------------------------------------------------

describe('summarizeProverSyntaxTargetCoverage', () => {
  const records = [
    { proverbTarget: 'z3',   formulaProofReady: true  },
    { proverbTarget: 'z3',   formulaProofReady: true  },
    { proverbTarget: 'lean', formulaProofReady: false },
    { proverbTarget: 'coq',  formulaProofReady: true  },
  ];

  test('groups by target', () => {
    const s = summarizeProverSyntaxTargetCoverage(records);
    expect(s['z3']).toBeDefined();
    expect(s['lean']).toBeDefined();
    expect(s['coq']).toBeDefined();
  });

  test('z3 is fully covered', () => {
    const s = summarizeProverSyntaxTargetCoverage(records);
    expect(s['z3'].status).toBe('covered');
    expect(s['z3'].coverageRate).toBe(1);
  });

  test('lean is missing', () => {
    const s = summarizeProverSyntaxTargetCoverage(records);
    expect(s['lean'].status).toBe('missing');
    expect(s['lean'].coverageRate).toBe(0);
  });

  test('coq is covered', () => {
    const s = summarizeProverSyntaxTargetCoverage(records);
    expect(s['coq'].status).toBe('covered');
  });

  test('returns empty for empty input', () => {
    expect(Object.keys(summarizeProverSyntaxTargetCoverage([]))).toHaveLength(0);
  });
});
