/**
 * wasm-prover-sprint81.test.ts
 * Tests for remaining §12 PORT gap closure.
 */

import {
  canonicalDcecTypeManifest,
  DeonticOperator,
  LogicalConnective,
  normalizeDeonticOperator,
} from '../../src/services/dcec-core-types';
import {
  canonicalDcecTypeManifest as sprint66Manifest,
  CanonicalDeonticOperator,
} from '../../src/services/deontic-cognitive-logic-types';
import { TDFOLToZ3Converter } from '../../src/services/z3-prover-bridge';
import { TDFOLToCVC5Converter } from '../../src/services/cvc5-prover-bridge';
import { TDFOLToCoqConverter } from '../../src/services/provers/deontic-to-coq';
import { TDFOLToLean4Converter } from '../../src/services/provers/deontic-to-lean4';
import {
  mkBinary,
  mkConstant,
  mkDeontic,
  mkFuncApp,
  mkPredicate,
  mkQuantified,
  mkTemporal,
  mkVariable,
} from '../../src/services/tdfol-core';

// ---------------------------------------------------------------------------
// PORT-002 — canonical DCEC type module
// ---------------------------------------------------------------------------
describe('PORT-002 canonical DCEC type manifest', () => {
  it('uses dcec-core-types as the canonical operator module', () => {
    const manifest = canonicalDcecTypeManifest();
    expect(manifest.canonicalModule).toBe('dcec-core-types');
    expect(manifest.deonticOperators).toEqual(expect.arrayContaining(['O', 'P', 'F', 'W']));
    expect(manifest.cognitiveOperators).toEqual(expect.arrayContaining(['B', 'K', 'I', 'D', 'G']));
    expect(manifest.logicalConnectives).toEqual(expect.arrayContaining(['∧', '∨', '¬', '→', '↔']));
  });

  it('normalizes sprint66 aliases to canonical enum values', () => {
    expect(DeonticOperator.WAIVER).toBe('W');
    expect(LogicalConnective.BICONDITIONAL).toBe('↔');
    expect(normalizeDeonticOperator('waiver')).toBe(DeonticOperator.WAIVER);
    expect(CanonicalDeonticOperator.WAIVER).toBe(DeonticOperator.WAIVER);
    expect(sprint66Manifest().canonicalModule).toBe('dcec-core-types');
  });
});

// ---------------------------------------------------------------------------
// PORT-020 / PORT-022 — TDFOL AST to SMT-LIB2 path + symbol parity
// ---------------------------------------------------------------------------
describe('PORT-020/022 TDFOL AST to SMT-LIB2 converters', () => {
  const x = mkVariable('x', 'Agent');
  const human = mkPredicate('Human', [x]);
  const mortal = mkPredicate('Mortal', [x]);
  const theorem = mkQuantified('∀', x, mkBinary('→', human, mortal));

  it('Z3 converter emits declarations and quantified AST body', () => {
    const smt = new TDFOLToZ3Converter().toSmtLib(theorem);
    expect(smt).toContain('(declare-sort Agent 0)');
    expect(smt).toContain('(declare-fun Human (Agent) Bool)');
    expect(smt).toContain('(declare-fun Mortal (Agent) Bool)');
    expect(smt).toContain('(forall ((x Agent)) (=> (Human x) (Mortal x)))');
    expect(smt).toContain('(check-sat)');
  });

  it('Z3 converter preserves Python-style node names instead of cap/rsc mangling', () => {
    const smt = new TDFOLToZ3Converter().toSmtLib(mkPredicate('may_access', [mkConstant('alice', 'alice', 'Agent')]));
    expect(smt).toContain('(declare-fun may_access (Agent) Bool)');
    expect(smt).toContain('(declare-const alice Agent)');
    expect(smt).not.toContain('__cap__');
    expect(smt).not.toContain('P__');
  });

  it('Z3 converter encodes deontic agent terms and temporal operators', () => {
    const manager = mkFuncApp('managerOf', [x], 'Agent');
    const obligation = mkTemporal('□', mkDeontic('O', mkPredicate('Approve'), manager));
    const smt = new TDFOLToZ3Converter().toSmtLib(obligation);
    expect(smt).toContain('(declare-fun managerOf (Agent) Agent)');
    expect(smt).toContain('(declare-fun O_agent (Agent Bool) Bool)');
    expect(smt).toContain('(declare-fun Always (Bool) Bool)');
  });

  it('CVC5 converter shares the SMT-LIB2 AST path', () => {
    const smt = new TDFOLToCVC5Converter().toSmtLib(theorem);
    expect(smt).toContain('(declare-sort Agent 0)');
    expect(smt).toContain('(forall ((x Agent)) (=> (Human x) (Mortal x)))');
  });
});

// ---------------------------------------------------------------------------
// PORT-032 — TDFOL AST to Coq/Lean converter paths
// ---------------------------------------------------------------------------
describe('PORT-032 TDFOL AST to Coq/Lean converters', () => {
  const x = mkVariable('x', 'Agent');
  const theorem = mkQuantified('∀', x, mkBinary('→', mkPredicate('Human', [x]), mkPredicate('Mortal', [x])));

  it('Coq converter emits typed declarations and a quantified theorem', () => {
    const coq = new TDFOLToCoqConverter().convertFormula(theorem, 'human_mortal');
    expect(coq).toContain('Require Import Coq.Logic.Classical_Prop.');
    expect(coq).toContain('Parameter Agent : Type.');
    expect(coq).toContain('Parameter Human : Agent -> Prop.');
    expect(coq).toContain('Parameter Mortal : Agent -> Prop.');
    expect(coq).toContain('forall (x : Agent), ((Human x) -> (Mortal x))');
    expect(coq).not.toContain('[object Object]');
  });

  it('Lean converter is exported from the Lean translator path', () => {
    const lean = new TDFOLToLean4Converter().convertFormula(theorem, 'human_mortal');
    expect(lean).toContain('constant Agent : Type');
    expect(lean).toContain('constant Human : Agent -> Prop');
    expect(lean).toContain('constant Mortal : Agent -> Prop');
    expect(lean).toContain('∀ (x : Agent), ((Human x) → (Mortal x))');
    expect(lean).not.toContain('[object Object]');
  });
});
