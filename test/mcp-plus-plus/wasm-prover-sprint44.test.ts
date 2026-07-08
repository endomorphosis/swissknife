/**
 * wasm-prover-sprint44.test.ts
 *
 * Sprint 44: Modal Logic Codec + Modal IR Decompiler
 */

import {
  makeCodecConfig, ModalLogicCodecResult, DeterministicModalLogicCodec,
} from '../../src/services/modal-logic-codec.js';
import {
  DecodedModalPhrase, DecodedModalText,
  decodeModalIRDocument, modalFormulaToText, modalTextTokenSimilarity,
  ModalIRDocument,
} from '../../src/services/modal-ir-decompiler.js';

// ---------------------------------------------------------------------------
// ModalLogicCodecConfig + makeCodecConfig
// ---------------------------------------------------------------------------

describe('makeCodecConfig', () => {
  test('creates config with defaults', () => {
    const cfg = makeCodecConfig();
    expect(cfg.parserBackend).toBe('spacy');
    expect(cfg.embeddingDimensions).toBe(8);
    expect(cfg.useFlogic).toBe(true);
    expect(cfg.topKFrames).toBe(3);
  });

  test('accepts overrides', () => {
    const cfg = makeCodecConfig({ embeddingDimensions: 16, useFlogic: false });
    expect(cfg.embeddingDimensions).toBe(16);
    expect(cfg.useFlogic).toBe(false);
  });

  test('throws for embeddingDimensions < 1', () => {
    expect(() => makeCodecConfig({ embeddingDimensions: 0 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// DeterministicModalLogicCodec
// ---------------------------------------------------------------------------

describe('DeterministicModalLogicCodec', () => {
  const codec = new DeterministicModalLogicCodec();

  test('encode returns ModalLogicCodecResult', () => {
    const result = codec.encode('The contractor must deliver goods.');
    expect(result).toBeInstanceOf(ModalLogicCodecResult);
  });

  test('detects deontic family for "must"', () => {
    const result = codec.encode('The party must pay fees.');
    expect(result.targetFamily).toBe('deontic');
  });

  test('detects temporal family for "always"', () => {
    const result = codec.encode('The obligation always holds until fulfilled.');
    expect(result.targetFamily).toBe('temporal');
  });

  test('produces source and decoded embeddings', () => {
    const result = codec.encode('Must comply.');
    expect(result.sourceEmbedding.length).toBe(8);
    expect(result.decodedEmbedding.length).toBe(8);
  });

  test('embeddings have correct dimension from config', () => {
    const c = new DeterministicModalLogicCodec({ embeddingDimensions: 16 });
    const result = c.encode('O(Pay)');
    expect(result.sourceEmbedding.length).toBe(16);
  });

  test('losses are non-negative numbers', () => {
    const result = codec.encode('The defendant shall pay damages.');
    for (const v of Object.values(result.losses)) {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  test('totalLoss is sum of losses', () => {
    const result = codec.encode('Must pay.');
    const expected = Object.values(result.losses).reduce((s, v) => s + v, 0);
    expect(result.totalLoss).toBeCloseTo(expected);
  });

  test('toDict is JSON-safe', () => {
    const result = codec.encode('The contractor shall deliver goods.');
    expect(() => JSON.stringify(result.toDict())).not.toThrow();
  });

  test('encodeBatch returns same length', () => {
    const results = codec.encodeBatch(['Must pay.', 'May inspect.', 'Shall not disclose.']);
    expect(results).toHaveLength(3);
  });

  test('kgTriples include modal family', () => {
    const result = codec.encode('Must pay.');
    const families = result.kgTriples.filter(t => t['predicate'] === 'has_modal_family');
    expect(families.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// DecodedModalPhrase
// ---------------------------------------------------------------------------

describe('DecodedModalPhrase', () => {
  test('constructs with defaults', () => {
    const p = new DecodedModalPhrase({ text: 'pay fees', slot: 'action' });
    expect(p.text).toBe('pay fees');
    expect(p.slot).toBe('action');
    expect(p.fixed).toBe(false);
  });

  test('toDict is JSON-safe', () => {
    const p = new DecodedModalPhrase({ text: 'act', slot: 'modality', spans: [[0, 3]] });
    expect(() => JSON.stringify(p.toDict())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// modalFormulaToText
// ---------------------------------------------------------------------------

describe('modalFormulaToText', () => {
  test('converts O(content) to natural language', () => {
    const text = modalFormulaToText('O(pay fees)');
    expect(text).toContain('obligated');
  });

  test('converts P(content)', () => {
    const text = modalFormulaToText('P(inspect goods)');
    expect(text).toContain('permitted');
  });

  test('converts F(content)', () => {
    const text = modalFormulaToText('F(disclose)');
    expect(text).toContain('forbidden');
  });

  test('converts □(content)', () => {
    const text = modalFormulaToText('□(comply)');
    expect(text).toContain('necessarily');
  });

  test('returns formula for unknown pattern', () => {
    const text = modalFormulaToText('SomeUnknownFormula');
    expect(text).toBe('SomeUnknownFormula');
  });
});

// ---------------------------------------------------------------------------
// modalTextTokenSimilarity
// ---------------------------------------------------------------------------

describe('modalTextTokenSimilarity', () => {
  test('identical texts have similarity 1', () => {
    expect(modalTextTokenSimilarity('the contractor must pay', 'the contractor must pay')).toBeCloseTo(1.0);
  });

  test('completely different texts have similarity 0', () => {
    expect(modalTextTokenSimilarity('abc def', 'xyz pqr')).toBe(0);
  });

  test('partial overlap has similarity in (0,1)', () => {
    const sim = modalTextTokenSimilarity('the contractor must pay fees', 'the contractor must deliver goods');
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  test('empty strings return 1', () => {
    expect(modalTextTokenSimilarity('', '')).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// decodeModalIRDocument
// ---------------------------------------------------------------------------

describe('decodeModalIRDocument', () => {
  const doc: ModalIRDocument = {
    documentId: 'doc-001',
    sourceText: 'The contractor shall deliver goods. The client may inspect.',
    formulas: [
      { formulaType: 'obligation', operator: 'O', actor: 'contractor', action: 'deliver goods', sourceText: 'O[contractor](deliver goods)' },
      { formulaType: 'permission', operator: 'P', actor: 'client', action: 'inspect goods', sourceText: 'P[client](inspect goods)' },
    ],
  };

  test('returns DecodedModalText', () => {
    const result = decodeModalIRDocument(doc);
    expect(result).toBeInstanceOf(DecodedModalText);
  });

  test('sourceId matches document', () => {
    expect(decodeModalIRDocument(doc).sourceId).toBe('doc-001');
  });

  test('formula phrases match formula count', () => {
    const formulaPhrases = decodeModalIRDocument(doc).phrases.filter(phrase => phrase.slot === 'formula');
    expect(formulaPhrases).toHaveLength(2);
  });

  test('reconstructionSimilarity in [0,1]', () => {
    const result = decodeModalIRDocument(doc);
    expect(result.reconstructionSimilarity).toBeGreaterThanOrEqual(0);
    expect(result.reconstructionSimilarity).toBeLessThanOrEqual(1);
  });

  test('toDict is JSON-safe', () => {
    const result = decodeModalIRDocument(doc);
    expect(() => JSON.stringify(result.toDict())).not.toThrow();
  });

  test('empty document produces warning', () => {
    const emptyDoc: ModalIRDocument = { documentId: 'empty', formulas: [] };
    const result = decodeModalIRDocument(emptyDoc);
    expect(result.parserWarnings.length).toBeGreaterThan(0);
  });
});
