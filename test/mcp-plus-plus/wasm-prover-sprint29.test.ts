/**
 * wasm-prover-sprint29.test.ts
 *
 * Sprint 29: Modal KG Bridge + Modal Synthesis
 */

import {
  flogicTriplesToGraphData, flogicTriplesToOntology, modalIrToNeo4jGraphData,
  flogicOntologyToDict, makeFLogicFrame,
} from '../../src/services/modal-kg-bridge.js';
import {
  RESIDUAL_REPAIR_ROUTES, routeAutoencoderResidual,
  ModalProgramSynthesisHint, residualSignatureForHint, synthesisHintFromRoute,
} from '../../src/services/modal-synthesis.js';

// ---------------------------------------------------------------------------
// Sample triples
// ---------------------------------------------------------------------------

const SAMPLE_TRIPLES = [
  { subject: 'doc:001', predicate: 'type', object: 'legal_modal_document' },
  { subject: 'doc:001', predicate: 'source', object: 'us_code' },
  { subject: 'formula:001', predicate: 'belongs_to_document', object: 'doc:001' },
  { subject: 'formula:001', predicate: 'modal_family', object: 'deontic' },
  { subject: 'formula:001', predicate: 'modal_operator', object: 'O' },
  { subject: 'formula:002', predicate: 'belongs_to_document', object: 'doc:001' },
  { subject: 'formula:002', predicate: 'modal_family', object: 'temporal' },
  { subject: 'formula:002', predicate: 'modal_operator', object: '□' },
];

// ---------------------------------------------------------------------------
// flogicTriplesToGraphData
// ---------------------------------------------------------------------------

describe('flogicTriplesToGraphData', () => {
  test('returns a GraphData with nodes and relationships', () => {
    const gd = flogicTriplesToGraphData(SAMPLE_TRIPLES);
    expect(gd).toHaveProperty('nodes');
    expect(gd).toHaveProperty('relationships');
    expect(gd).toHaveProperty('graphId');
    expect(gd).toHaveProperty('metadata');
  });

  test('creates one node per unique subject/object', () => {
    const gd = flogicTriplesToGraphData(SAMPLE_TRIPLES);
    expect(gd.nodes.length).toBeGreaterThan(0);
    // Unique ids only
    const ids = gd.nodes.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('node for "legal_modal_document" type gets LegalModalDocument label', () => {
    const gd = flogicTriplesToGraphData(SAMPLE_TRIPLES);
    const doc = gd.nodes.find(n => n.properties['flogic_id'] === 'doc:001');
    expect(doc).toBeDefined();
    expect(doc!.labels).toContain('LegalModalDocument');
  });

  test('formula nodes get ModalFormula label from belongs_to_document', () => {
    const gd = flogicTriplesToGraphData(SAMPLE_TRIPLES);
    const formula = gd.nodes.find(n => n.properties['flogic_id'] === 'formula:001');
    expect(formula).toBeDefined();
    expect(formula!.labels).toContain('ModalFormula');
  });

  test('modal_operator object gets ModalOperator label', () => {
    const gd = flogicTriplesToGraphData(SAMPLE_TRIPLES);
    const op = gd.nodes.find(n => n.properties['flogic_id'] === 'O');
    expect(op?.labels).toContain('ModalOperator');
  });

  test('relationships count equals triple count (non-empty triples)', () => {
    const gd = flogicTriplesToGraphData(SAMPLE_TRIPLES);
    expect(gd.relationships.length).toBe(SAMPLE_TRIPLES.length);
  });

  test('accepts graphId override', () => {
    const gd = flogicTriplesToGraphData(SAMPLE_TRIPLES, { graphId: 'custom-id' });
    expect(gd.graphId).toBe('custom-id');
  });

  test('empty triples returns empty nodes/rels', () => {
    const gd = flogicTriplesToGraphData([]);
    expect(gd.nodes).toHaveLength(0);
    expect(gd.relationships).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// flogicTriplesToOntology
// ---------------------------------------------------------------------------

describe('flogicTriplesToOntology', () => {
  test('returns FLogicOntology with name and frames', () => {
    const ont = flogicTriplesToOntology(SAMPLE_TRIPLES);
    expect(ont).toHaveProperty('name');
    expect(ont).toHaveProperty('frames');
  });

  test('creates one frame per unique subject', () => {
    const ont = flogicTriplesToOntology(SAMPLE_TRIPLES);
    const subjects = new Set(SAMPLE_TRIPLES.map(t => t.subject));
    // Frames may be fewer if objects are not subjects, but subjects must appear
    const frameIds = new Set(ont.frames.map(f => f.objectId));
    for (const s of subjects) expect(frameIds.has(s)).toBe(true);
  });

  test('"type" predicate becomes isa field', () => {
    const ont = flogicTriplesToOntology(SAMPLE_TRIPLES);
    const docFrame = ont.frames.find(f => f.objectId === 'doc:001');
    expect(docFrame?.isa).toBe('legal_modal_document');
  });

  test('scalar methods are populated', () => {
    const ont = flogicTriplesToOntology(SAMPLE_TRIPLES);
    const docFrame = ont.frames.find(f => f.objectId === 'doc:001');
    expect(docFrame?.scalarMethods['source']).toBe('us_code');
  });

  test('toErgoString returns a non-empty string', () => {
    const frame = makeFLogicFrame('x', { name: 'value' }, {}, 'Type');
    expect(frame.toErgoString().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// modalIrToNeo4jGraphData
// ---------------------------------------------------------------------------

describe('modalIrToNeo4jGraphData', () => {
  test('extracts triples from frame_logic view', () => {
    const views = {
      frame_logic: { payload: { triples: SAMPLE_TRIPLES } },
    };
    const gd = modalIrToNeo4jGraphData('doc:001', views);
    expect(gd.nodes.length).toBeGreaterThan(0);
  });

  test('returns empty graph for empty views', () => {
    const gd = modalIrToNeo4jGraphData('doc:001', {});
    expect(gd.nodes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// flogicOntologyToDict
// ---------------------------------------------------------------------------

describe('flogicOntologyToDict', () => {
  test('returns dict with frame_count and frames', () => {
    const ont = flogicTriplesToOntology(SAMPLE_TRIPLES);
    const d = flogicOntologyToDict(ont);
    expect(d['frame_count']).toBeGreaterThan(0);
    expect(Array.isArray(d['frames'])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RESIDUAL_REPAIR_ROUTES
// ---------------------------------------------------------------------------

describe('RESIDUAL_REPAIR_ROUTES', () => {
  test('contains 9 routes', () => {
    expect(Object.keys(RESIDUAL_REPAIR_ROUTES)).toHaveLength(9);
  });

  test('each route has action, targetComponent, rationale, priority', () => {
    for (const route of Object.values(RESIDUAL_REPAIR_ROUTES)) {
      expect(typeof route.action).toBe('string');
      expect(typeof route.targetComponent).toBe('string');
      expect(typeof route.rationale).toBe('string');
      expect(typeof route.priority).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// routeAutoencoderResidual
// ---------------------------------------------------------------------------

describe('routeAutoencoderResidual', () => {
  test('returns route for cross_entropy_loss', () => {
    const route = routeAutoencoderResidual('cross_entropy_loss');
    expect(route).not.toBeNull();
    expect(route!.action).toBe('refine_modal_family_cue_rules');
  });

  test('returns route for cosine_loss', () => {
    const route = routeAutoencoderResidual('cosine_loss');
    expect(route!.targetComponent).toBe('modal.autoencoder');
  });

  test('returns route for deontic_decoder_slot_loss', () => {
    const route = routeAutoencoderResidual('deontic_decoder_slot_loss');
    expect(route!.action).toBe('repair_deontic_bridge_quality_gate');
  });

  test('returns null for unknown loss name', () => {
    expect(routeAutoencoderResidual('totally_unknown_loss')).toBeNull();
  });

  test('focus hint overrides for repair_deontic_bridge_quality_gate', () => {
    const route = routeAutoencoderResidual('some_unknown_loss', {
      focus: ['repair_deontic_bridge_quality_gate'],
    });
    expect(route).not.toBeNull();
    expect(route!.targetComponent).toBe('deontic.ir');
  });
});

// ---------------------------------------------------------------------------
// ModalProgramSynthesisHint
// ---------------------------------------------------------------------------

describe('ModalProgramSynthesisHint', () => {
  test('toDict serializes all fields', () => {
    const hint = new ModalProgramSynthesisHint({
      hintId: 'h1',
      action: 'refine_rules',
      targetComponent: 'modal.compiler',
      rationale: 'Test rationale',
      priority: 0.7,
      evidence: { loss_name: 'cross_entropy_loss' },
    });
    const d = hint.toDict();
    expect(d['hint_id']).toBe('h1');
    expect(d['action']).toBe('refine_rules');
    expect(d['priority']).toBe(0.7);
    expect(d['status']).toBe('proposed');
  });

  test('defaults status to "proposed"', () => {
    const hint = new ModalProgramSynthesisHint({
      hintId: 'h2', action: 'a', targetComponent: 'c', rationale: 'r', priority: 0.1,
    });
    expect(hint.status).toBe('proposed');
  });
});

// ---------------------------------------------------------------------------
// residualSignatureForHint
// ---------------------------------------------------------------------------

describe('residualSignatureForHint', () => {
  test('returns 24-char hex string', () => {
    const hint = new ModalProgramSynthesisHint({
      hintId: 'h3', action: 'refine_rules', targetComponent: 'modal.compiler',
      rationale: 'r', priority: 0.5,
    });
    const sig = residualSignatureForHint(hint);
    expect(sig).toMatch(/^[0-9a-f]{24}$/);
  });

  test('is deterministic', () => {
    const hint = new ModalProgramSynthesisHint({
      hintId: 'h4', action: 'refine_rules', targetComponent: 'modal.compiler',
      rationale: 'r', priority: 0.5,
    });
    expect(residualSignatureForHint(hint)).toBe(residualSignatureForHint(hint));
  });
});

// ---------------------------------------------------------------------------
// synthesisHintFromRoute
// ---------------------------------------------------------------------------

describe('synthesisHintFromRoute', () => {
  test('creates a hint from a route', () => {
    const route = RESIDUAL_REPAIR_ROUTES['cross_entropy_loss'];
    const hint = synthesisHintFromRoute('cross_entropy_loss', route);
    expect(hint).toBeInstanceOf(ModalProgramSynthesisHint);
    expect(hint.action).toBe(route.action);
    expect(hint.evidence['loss_name']).toBe('cross_entropy_loss');
  });
});
