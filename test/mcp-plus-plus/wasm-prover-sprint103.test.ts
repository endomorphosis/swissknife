import { mkPredicate } from '../../src/services/tdfol-core';
import { ModalLogicType } from '../../src/services/modal-tableaux';
import {
  BoxChars,
  CounterModel,
  CounterModelExtractor,
  GraphLayout,
  KripkeStructure,
  extractCountermodel,
  visualizeCountermodel,
} from '../../src/services/kripke-structure';
import {
  DCECStringParser,
  parseDcec,
  parseDcecSafe,
} from '../../src/services/tdfol-dcec-parser';
import {
  MVPCircuit,
  TDFOLv1DerivationCircuit,
  ZKPCircuit,
  completeZkpAttestationRecord,
  createImplicationCircuit,
  createKnowledgeOfAxiomsCircuit,
} from '../../src/services/zkp-circuits';

describe('PORT-228 TDFOL countermodel and DCEC parser remainders', () => {
  it('builds Python-shaped CounterModel renderings and extraction helpers', () => {
    const kripke = new KripkeStructure(ModalLogicType.K);
    kripke.addWorld(0);
    kripke.addWorld(1);
    kripke.addAccessibility(0, 1);
    kripke.setAtomTrue(0, 'P');

    const countermodel = new CounterModel({
      formula: '□P → P',
      kripke,
      explanation: ['K does not require reflexivity'],
    });

    expect(countermodel.toAsciiArt()).toContain('→ w0: {P}');
    expect(countermodel.toDot()).toContain('w0 -> w1;');
    expect(JSON.parse(countermodel.toJson())).toMatchObject({
      formula: '□P → P',
      kripke_structure: { initial_world: 0, logic_type: ModalLogicType.K },
      explanation: ['K does not require reflexivity'],
    });
    expect(visualizeCountermodel(countermodel, 'ascii')).toBe(countermodel.toAsciiArt());
    expect(BoxChars.ARROW_RIGHT).toBe('→');
    expect(new GraphLayout({ 0: [0, 0] }, 320, 200)).toMatchObject({ width: 320, height: 200 });

    const branch = {
      is_closed: false,
      worlds: {
        0: { formulas: [mkPredicate('P'), 'Q(x)'] },
        1: { formulas: [] },
      },
      accessibility: { 0: [1] },
    };
    const extracted = extractCountermodel('◇P', branch, ModalLogicType.K);
    expect(extracted.kripke.isAtomTrue(0, 'P')).toBe(true);
    expect(extracted.kripke.isAtomTrue(0, 'Q')).toBe(true);
    expect(new CounterModelExtractor().extract('P', branch)).toBeInstanceOf(CounterModel);
  });

  it('parses DCEC strings to existing TDFOL core formula nodes', () => {
    const parser = new DCECStringParser();
    const implication = parser.parse('(implies P(x) Q(x))');
    const deontic = parseDcec('(O (always P))');

    expect(implication.toDict()).toMatchObject({
      kind: 'binary',
      operator: '→',
      left: { kind: 'predicate', name: 'P' },
      right: { kind: 'predicate', name: 'Q' },
    });
    expect(deontic.toDict()).toMatchObject({
      kind: 'deontic',
      operator: 'O',
      formula: { kind: 'temporal', operator: '□' },
    });
    expect(parseDcecSafe('(and P)')).toBeNull();
  });
});

describe('PORT-229 ZKP circuit reconciliation', () => {
  it('adds Python-compatible circuit classes and R1CS projection', () => {
    const circuit = new ZKPCircuit();
    const p = circuit.addInput('P');
    const q = circuit.addInput('Q');
    const both = circuit.addAndGate(p, q);
    circuit.setOutput(circuit.addNotGate(both));

    expect(circuit.numInputs()).toBe(2);
    expect(circuit.numGates()).toBe(2);
    expect(circuit.numWires()).toBe(4);
    expect(circuit.getCircuitHash()).toMatch(/^[0-9a-f]{64}$/);
    expect(circuit.toR1cs()).toMatchObject({
      num_constraints: 2,
      public_inputs: [3],
      constraints: [
        { type: 'multiplication', A: 0, B: 1, C: 2 },
        { type: 'not_composition', inputs: [2], output: 3 },
      ],
    });

    const implication = createImplicationCircuit(2);
    expect(implication.toString()).toBe('ZKPCircuit(inputs=3, gates=2, wires=5)');
  });

  it('reconciles MVP/TDFOL derivation circuits and attestation record completion', () => {
    const mvp = createKnowledgeOfAxiomsCircuit(1);
    expect(mvp).toBeInstanceOf(MVPCircuit);
    expect(mvp.compile()).toMatchObject({
      version: 1,
      type: 'knowledge_of_axioms',
      num_inputs: 4,
      num_constraints: 1,
    });
    expect(mvp.verifyConstraints(
      { circuit_version: 1, ruleset_id: 'TDFOL_v1' },
      { circuit_version: 1, ruleset_id: 'TDFOL_v1' },
    )).toBe(true);

    const tdfol = new TDFOLv1DerivationCircuit();
    expect(tdfol.compile()).toMatchObject({ version: 2, type: 'tdfol_v1_horn_derivation' });
    expect(tdfol.verifyConstraints(
      { circuit_version: 2, ruleset_id: 'TDFOL_v1', theorem: 'Q', intermediate_steps: ['P', 'Q'] },
      { circuit_version: 2, ruleset_id: 'TDFOL_v1' },
    )).toBe(true);

    const completed = completeZkpAttestationRecord({
      proof_data: 'proof',
      public_inputs: {
        circuit_id: 'provekit_knowledge_of_axioms',
        circuit_version: 1,
        theorem_hash: 'a'.repeat(64),
        axioms_commitment: 'b'.repeat(64),
        ruleset_id: 'TDFOL_v1',
      },
    });
    expect(completed).toMatchObject({
      proof_digest: expect.stringMatching(/^[0-9a-f]{64}$/),
      attestation_ref: expect.stringMatching(/^[0-9a-f]{64}$/),
      attestation_view: {
        circuit_ref: 'provekit_knowledge_of_axioms:v1',
        theorem_hash: 'a'.repeat(64),
      },
    });
  });
});
