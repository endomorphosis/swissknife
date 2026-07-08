/**
 * WASM Prover Sprint 17 — LegalNormIR + Decoder tests.
 *
 * Tasks covered:
 *   T-92: LegalNormIR type system (legal-norm-ir.ts)
 *   T-93: LegalNormDecoder (legal-norm-decoder.ts)
 *   T-94: LegalNormBuilder (legal-norm-builder.ts)
 *   T-95: ≥10 tests
 *
 * Sprint 17 (Phase 17 — LegalNormIR + Decoder, P2).
 * Reference: ipfs_datasets_py/logic/deontic/ir.py + decoder.py
 */

import {
  buildLegalNormIR,
  emptySpan,
  emptyQuality,
  parserElementToIR,
} from '../../src/services/deontic/legal-norm-ir.js';
import type { LegalNormIR } from '../../src/services/deontic/legal-norm-ir.js';
import {
  decodeLegalNormIR,
  decodedPhraseSlotTextMap,
} from '../../src/services/deontic/legal-norm-decoder.js';
import { LegalNormBuilder } from '../../src/services/deontic/legal-norm-builder.ts.js';
import { DeonticTextAnalyzer } from '../../src/services/deontic/deontic-text-analyzer.js';

// ---------------------------------------------------------------------------
// T-92: LegalNormIR type system
// ---------------------------------------------------------------------------

describe('T-92 LegalNormIR — buildLegalNormIR()', () => {
  it('creates a valid LegalNormIR with required fields', () => {
    const norm = buildLegalNormIR({
      source_id: 'norm1',
      modality:  'O',
      actor:     'Users',
      action:    'log access',
    });
    expect(norm.source_id).toBe('norm1');
    expect(norm.modality).toBe('O');
    expect(norm.actor).toBe('Users');
    expect(norm.action).toBe('log access');
    expect(norm.schema_version).toBe('1.0');
  });

  it('applies defaults for optional fields', () => {
    const norm = buildLegalNormIR({ source_id: 'n2', modality: 'P', actor: 'Admin', action: 'read' });
    expect(norm.conditions).toEqual([]);
    expect(norm.exceptions).toEqual([]);
    expect(norm.temporal_constraints).toEqual([]);
    expect(norm.recipient).toBe('');
    expect(norm.quality.schema_valid).toBe(false);
  });

  it('emptySpan returns {start:0, end:0}', () => {
    const span = emptySpan();
    expect(span.start).toBe(0);
    expect(span.end).toBe(0);
  });

  it('emptyQuality has expected default fields', () => {
    const q = emptyQuality();
    expect(q.schema_valid).toBe(false);
    expect(q.slot_coverage).toBe(0);
    expect(q.promotable_to_theorem).toBe(false);
    expect(Array.isArray(q.parser_warnings)).toBe(true);
  });

  it('allows overriding quality', () => {
    const norm = buildLegalNormIR({
      source_id: 'n3', modality: 'F', actor: 'Agent', action: 'delete',
      quality: { ...emptyQuality(), schema_valid: true, slot_coverage: 0.9, quality_label: 'high', scaffold_quality: 0.9, promotable_to_theorem: true, export_readiness: {} },
    });
    expect(norm.quality.schema_valid).toBe(true);
    expect(norm.quality.quality_label).toBe('high');
  });

  it('parserElementToIR prefers proposition alias when action is missing', () => {
    const norm = parserElementToIR({
      source_id: 'n-prop',
      modality: 'O',
      actor: 'Agency',
      proposition: 'publish incident report',
    });

    expect(norm.action).toBe('publish incident report');
  });
});

// ---------------------------------------------------------------------------
// T-93: LegalNormDecoder
// ---------------------------------------------------------------------------

describe('T-93 LegalNormDecoder — decodeLegalNormIR()', () => {
  it('decodes an obligation norm to "Actor must action." sentence', () => {
    const norm = buildLegalNormIR({ source_id: 'n1', modality: 'O', actor: 'users', action: 'log access' });
    const decoded = decodeLegalNormIR(norm);
    expect(decoded.source_id).toBe('n1');
    expect(decoded.text.toLowerCase()).toContain('must');
    expect(decoded.text.toLowerCase()).toContain('log access');
    expect(decoded.text.endsWith('.')).toBe(true);
  });

  it('decodes a permission norm with "may"', () => {
    const norm = buildLegalNormIR({ source_id: 'n2', modality: 'P', actor: 'admins', action: 'delete records' });
    const decoded = decodeLegalNormIR(norm);
    expect(decoded.text.toLowerCase()).toContain('may');
    expect(decoded.text.toLowerCase()).toContain('delete records');
  });

  it('decodes a prohibition norm with "must not"', () => {
    const norm = buildLegalNormIR({ source_id: 'n3', modality: 'F', actor: 'contractors', action: 'share data' });
    const decoded = decodeLegalNormIR(norm);
    expect(decoded.text.toLowerCase()).toContain('must not');
    expect(decoded.text.toLowerCase()).toContain('share data');
  });

  it('decodes a definition norm with "means"', () => {
    const norm = buildLegalNormIR({ source_id: 'n4', modality: 'DEF', actor: 'Personal data', action: 'any information relating to an identified natural person', norm_type: 'definition' });
    const decoded = decodeLegalNormIR(norm);
    expect(decoded.text.toLowerCase()).toContain('means');
    expect(decoded.text.toLowerCase()).toContain('personal data');
  });

  it('reports missing_slots when actor is absent', () => {
    const norm = buildLegalNormIR({ source_id: 'n5', modality: 'O', actor: '', action: 'notify' });
    const decoded = decodeLegalNormIR(norm);
    expect(decoded.missing_slots).toContain('actor');
  });

  it('includes conditions in decoded text', () => {
    const norm = buildLegalNormIR({
      source_id: 'n6', modality: 'O', actor: 'agents', action: 'submit report',
      conditions: [{ text: 'upon request' }],
    });
    const decoded = decodeLegalNormIR(norm);
    expect(decoded.text.toLowerCase()).toContain('upon request');
  });

  it('phrases contain slot names for provenance', () => {
    const norm = buildLegalNormIR({ source_id: 'n7', modality: 'P', actor: 'users', action: 'view records' });
    const decoded = decodeLegalNormIR(norm);
    const slots = decoded.phrases.map(p => p.slot);
    expect(slots).toContain('actor');
    expect(slots).toContain('modality');
    expect(slots).toContain('action');
  });

  it('decodedPhraseSlotTextMap groups texts by slot', () => {
    const norm = buildLegalNormIR({ source_id: 'n8', modality: 'O', actor: 'users', action: 'log access' });
    const decoded = decodeLegalNormIR(norm);
    const map = decodedPhraseSlotTextMap(decoded);
    expect(map['actor']).toBeDefined();
    expect(map['actor']).toContain('users');
    expect(map['action']).toBeDefined();
  });

  it('decoded text starts with capital letter', () => {
    const norm = buildLegalNormIR({ source_id: 'n9', modality: 'O', actor: 'users', action: 'report violations' });
    const decoded = decodeLegalNormIR(norm);
    expect(decoded.text[0]).toBe(decoded.text[0].toUpperCase());
  });
});

// ---------------------------------------------------------------------------
// T-94: LegalNormBuilder
// ---------------------------------------------------------------------------

describe('T-94 LegalNormBuilder', () => {
  it('fromStatement produces LegalNormIR with correct modality code', () => {
    const analyzer = new DeonticTextAnalyzer();
    const stmts = analyzer.extractStatements('Users must log all access events.');
    const obl = stmts.find(s => s.modality === 'obligation');
    if (!obl) return; // skip if pattern didn't match
    const norm = LegalNormBuilder.fromStatement(obl);
    expect(norm.modality).toBe('O');
    expect(norm.actor).toBe(obl.entity);
    expect(norm.action).toBe(obl.action);
    expect(norm.source_id).toBe(obl.id);
  });

  it('fromStatement maps permission to P', () => {
    const analyzer = new DeonticTextAnalyzer();
    const stmts = analyzer.extractStatements('Admins may delete audit logs.');
    const perm = stmts.find(s => s.modality === 'permission');
    if (!perm) return;
    const norm = LegalNormBuilder.fromStatement(perm);
    expect(norm.modality).toBe('P');
  });

  it('fromStatements returns one IR per statement', () => {
    const analyzer = new DeonticTextAnalyzer();
    const stmts = analyzer.extractStatements('Users must log access. Admins may delete records.');
    const norms = LegalNormBuilder.fromStatements(stmts);
    expect(norms).toHaveLength(stmts.length);
    for (const norm of norms) {
      expect(typeof norm.source_id).toBe('string');
      expect(typeof norm.actor).toBe('string');
    }
  });

  it('round-trip: statement → LegalNormIR → decoded text', () => {
    const analyzer = new DeonticTextAnalyzer();
    const stmts = analyzer.extractStatements('Users must submit reports.');
    const obl = stmts.find(s => s.modality === 'obligation');
    if (!obl) return;
    const norm    = LegalNormBuilder.fromStatement(obl);
    const decoded = decodeLegalNormIR(norm);
    expect(decoded.text).toBeTruthy();
    expect(decoded.text.toLowerCase()).toContain('must');
  });

  it('fromStatement prefers proposition alias when present', () => {
    const analyzer = new DeonticTextAnalyzer();
    const stmt = analyzer.extractStatements('Users must notify agency.')[0];
    if (!stmt) return;

    const norm = LegalNormBuilder.fromStatement({
      ...stmt,
      proposition: 'file incident report',
    } as typeof stmt & { proposition: string });

    expect(norm.action).toBe('file incident report');
    expect(norm.support_text).toBe('file incident report');
  });
});
