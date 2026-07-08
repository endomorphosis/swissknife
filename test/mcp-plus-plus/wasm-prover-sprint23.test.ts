/**
 * WASM Prover Sprint 23 — TDFOL Core Types + Proof Tree + Formula Dependency Graph.
 *
 * Tasks:
 *   T-116: tdfol-core.ts — TDFOL node hierarchy + TDFOLKnowledgeBase
 *   T-117: proof-tree.ts — ProofTreeNode + ProofTree + ASCII rendering
 *   T-118: formula-dependency-graph.ts — FormulaDependencyGraph
 *   T-119: ≥10 tests
 *
 * Sprint 23 (Phase 23 — TDFOL Core Types + Proof Tree + Formula Dependency Graph, P2).
 */

import {
  mkVariable, mkConstant, mkPredicate, mkBinary, mkUnary, mkQuantified,
  mkDeontic, mkTemporal, TDFOLKnowledgeBase,
  BinaryTemporalFormula,
  ExpansionContext,
  ExpansionResult,
  create_always,
  create_conjunction,
  create_disjunction,
  create_eventually,
  create_existential,
  create_implication,
  create_negation,
  create_next,
  create_obligation,
  create_permission,
  create_prohibition,
  create_universal,
  create_until,
} from '../../src/services/tdfol-core.js';
import {
  ProofTreeNode, ProofTree, ProofTreeBuilder, ProofTreeVisualizer,
} from '../../src/services/proof-tree.js';
import {
  FormulaDependencyGraph,
} from '../../src/services/formula-dependency-graph.js';
import type { DependencyNode } from '../../src/services/formula-dependency-graph.js';

// ---------------------------------------------------------------------------
// T-116: TDFOL Core Types
// ---------------------------------------------------------------------------

describe('T-116 TDFOL Core Types', () => {
  it('mkVariable creates a variable with correct toStr', () => {
    const v = mkVariable('x', 'Agent');
    expect(v.kind).toBe('variable');
    expect(v.name).toBe('x');
    expect(v.sort).toBe('Agent');
    expect(v.toStr()).toBe('x:Agent');
  });

  it('mkConstant creates a constant', () => {
    const c = mkConstant('alice', 'Alice');
    expect(c.kind).toBe('constant');
    expect(c.toStr()).toBe('alice');
    expect(c.toDict()['name']).toBe('alice');
  });

  it('mkPredicate creates predicate with args', () => {
    const x = mkVariable('x');
    const p = mkPredicate('LogAccess', [x]);
    expect(p.kind).toBe('predicate');
    expect(p.toStr()).toBe('LogAccess(x)');
    expect(p.negated).toBe(false);
  });

  it('mkUnary negates a predicate', () => {
    const p = mkPredicate('P');
    const neg = mkUnary(p);
    expect(neg.kind).toBe('unary');
    expect(neg.toStr()).toBe('¬P');
  });

  it('mkBinary builds AND/OR/IMPLIES formulas', () => {
    const p = mkPredicate('P');
    const q = mkPredicate('Q');
    const impl = mkBinary('→', p, q);
    expect(impl.kind).toBe('binary');
    expect(impl.toStr()).toBe('P → Q');
    expect(impl.toStr(true)).toBe('(P → Q)');
  });

  it('mkQuantified builds ∀ formula', () => {
    const body = mkPredicate('Human', [mkVariable('x')]);
    const qf = mkQuantified('∀', 'x', body, 'Agent');
    expect(qf.kind).toBe('quantified');
    expect(qf.toStr()).toContain('∀x:Agent');
    expect(qf.toStr()).toContain('Human(x)');
  });

  it('mkDeontic builds O/P/F formula', () => {
    const body = mkPredicate('LogAccess');
    const obl = mkDeontic('O', body, 'agent1');
    expect(obl.kind).toBe('deontic');
    expect(obl.toStr()).toBe('O[agent1](LogAccess)');
  });

  it('mkTemporal builds □/◊ formula', () => {
    const body = mkPredicate('Safe');
    const always = mkTemporal('□', body);
    expect(always.kind).toBe('temporal');
    expect(always.toStr()).toBe('□(Safe)');
  });

  it('TDFOLKnowledgeBase stores axioms/theorems/goals', () => {
    const kb = new TDFOLKnowledgeBase();
    kb.addAxiom(mkPredicate('P'), 'ax1');
    kb.addTheorem(mkPredicate('Q'));
    kb.addGoal(mkPredicate('R'));
    expect(kb.size).toBe(3);
    expect(kb.getByRole('axiom')).toHaveLength(1);
    expect(kb.getByRole('goal')).toHaveLength(1);
    expect(kb.getFormulas()).toHaveLength(3);
  });

  it('TDFOLKnowledgeBase.addDefinition stores and retrieves', () => {
    const kb = new TDFOLKnowledgeBase();
    const f = mkPredicate('IsAgent');
    kb.addDefinition('IsAgent', f);
    expect(kb.getDefinition('IsAgent')).toBe(f);
    expect(kb.size).toBe(1);
  });

  it('Python-compatible formula constructors build native TDFOL AST nodes', () => {
    const x = mkVariable('x', 'Agent');
    const p = mkPredicate('P', [x]);
    const q = mkPredicate('Q', [x]);

    expect(create_implication(p, q).toStr(true)).toBe('(P(x:Agent) → Q(x:Agent))');
    expect(create_conjunction(p, q).toStr()).toBe('P(x:Agent) ∧ Q(x:Agent)');
    expect(create_disjunction(p, q).toStr()).toBe('P(x:Agent) ∨ Q(x:Agent)');
    expect(create_negation(p).toStr()).toBe('¬P(x:Agent)');
    expect(create_universal(x, p).toStr()).toContain('∀x:Agent');
    expect(create_existential('y', q).toStr()).toContain('∃y');
    expect(create_obligation(p, x).operator).toBe('O');
    expect(create_permission(p, 'agent1').toStr()).toBe('P[agent1](P(x:Agent))');
    expect(create_prohibition(p).toStr()).toBe('F(P(x:Agent))');
    expect(create_always(p).toStr()).toBe('□(P(x:Agent))');
    expect(create_eventually(p).toStr()).toBe('◊(P(x:Agent))');
    expect(create_next(p).toStr()).toBe('X(P(x:Agent))');
  });

  it('BinaryTemporalFormula and create_until preserve binary temporal structure', () => {
    const p = mkPredicate('P');
    const q = mkPredicate('Q');
    const until = create_until(p, q);
    expect(until).toBeInstanceOf(BinaryTemporalFormula);
    expect(until.kind).toBe('temporal');
    expect(until.operator).toBe('U');
    expect(until.formula).toBe(p);
    expect(until.until).toBe(q);
    expect(until.toStr()).toBe('(P U Q)');
    expect(until.toDict()['binaryTemporal']).toBe(true);
  });

  it('ExpansionContext and ExpansionResult expose tableaux expansion payloads', () => {
    const p = mkPredicate('P');
    const q = mkPredicate('Q');
    const context = new ExpansionContext(p, true, 2, [q], { source: 'test' });
    expect(context.toDict()['world_id']).toBe(2);

    const linear = ExpansionResult.linear([p, false], [q, true]);
    expect(linear.isBranching).toBe(false);
    expect(linear.branches).toHaveLength(1);

    const branching = ExpansionResult.branching([[p, false]], [[q, false]]);
    expect(branching.isBranching).toBe(true);
    expect(branching.toDict()['is_branching']).toBe(true);
  });

  it('variadic conjunction/disjunction reject empty inputs', () => {
    expect(() => create_conjunction()).toThrow('Cannot create conjunction');
    expect(() => create_disjunction()).toThrow('Cannot create disjunction');
  });
});

// ---------------------------------------------------------------------------
// T-117: ProofTree
// ---------------------------------------------------------------------------

describe('T-117 ProofTreeNode and ProofTree', () => {
  function makeSimpleTree(): ProofTree {
    const premise1 = new ProofTreeNode({ formula: 'P(x)', nodeType: 'axiom', stepNumber: 1 });
    const premise2 = new ProofTreeNode({ formula: 'P(x) → Q(x)', nodeType: 'axiom', stepNumber: 2 });
    const theorem  = new ProofTreeNode({
      formula: 'Q(x)', nodeType: 'theorem', ruleName: 'ModusPonens',
      stepNumber: 3, children: [premise1, premise2],
    });
    return new ProofTree(theorem);
  }

  it('ProofTreeNode.isLeaf() returns true for premises', () => {
    const node = new ProofTreeNode({ formula: 'P', nodeType: 'axiom' });
    expect(node.isLeaf()).toBe(true);
  });

  it('ProofTree.allNodes() returns all nodes DFS', () => {
    const tree = makeSimpleTree();
    expect(tree.allNodes()).toHaveLength(3);
  });

  it('ProofTree.leaves() returns leaf nodes', () => {
    const tree = makeSimpleTree();
    const leaves = tree.leaves();
    expect(leaves).toHaveLength(2);
    expect(leaves.every(n => n.isLeaf())).toBe(true);
  });

  it('ProofTree.findByFormula locates a node', () => {
    const tree = makeSimpleTree();
    const node = tree.findByFormula('Q(x)');
    expect(node).toBeDefined();
    expect(node!.nodeType).toBe('theorem');
  });

  it('ProofTree.toAscii generates non-empty ASCII tree', () => {
    const tree = makeSimpleTree();
    const ascii = tree.toAscii('expanded', 'normal');
    expect(ascii).toContain('Q(x)');
    expect(ascii).toContain('P(x)');
    expect(ascii.split('\n').length).toBeGreaterThan(1);
  });

  it('ProofTreeBuilder.fromProofResult builds from WasmProofResult', () => {
    const result = { proved: true, sat: true, unsat: false, reason: 'proved' as const, prover_id: 'tdfol-native', proof_time_ms: 5 };
    const tree = ProofTreeBuilder.fromProofResult('O(log)', result, ['P(x)', 'P(x) → O(log)']);
    expect(tree.root.nodeType).toBe('theorem');
    expect(tree.root.children).toHaveLength(2);
  });

  it('ProofTreeNode.toDict serialises correctly', () => {
    const node = new ProofTreeNode({ formula: 'P', nodeType: 'axiom', ruleName: 'Ax', stepNumber: 1 });
    const d = node.toDict();
    expect(d['formula']).toBe('P');
    expect(d['node_type']).toBe('axiom');
    expect(d['rule_name']).toBe('Ax');
  });
});

// ---------------------------------------------------------------------------
// T-118: FormulaDependencyGraph
// ---------------------------------------------------------------------------

describe('T-118 FormulaDependencyGraph', () => {
  function makeNode(id: string, formula: string): DependencyNode {
    return { id, formula, formulaType: 'axiom', metadata: {} };
  }

  it('addNode and getDependencies work', () => {
    const g = new FormulaDependencyGraph();
    g.addNode(makeNode('a', 'P(x)'));
    g.addNode(makeNode('b', 'Q(x)'));
    g.addEdge({ sourceId: 'a', targetId: 'b', depType: 'REQUIRES', weight: 1, metadata: {} });
    expect(g.getDependencies('a')).toContain('b');
    expect(g.getDependents('b')).toContain('a');
  });

  it('topologicalSort returns dependency-first order', () => {
    const g = new FormulaDependencyGraph();
    g.addNode(makeNode('c', 'R(x)'));
    g.addNode(makeNode('a', 'P(x)'));
    g.addNode(makeNode('b', 'Q(x)'));
    g.addEdge({ sourceId: 'b', targetId: 'c', depType: 'DERIVES', weight: 1, metadata: {} });
    g.addEdge({ sourceId: 'a', targetId: 'b', depType: 'DERIVES', weight: 1, metadata: {} });
    const sorted = g.topologicalSort();
    const ids = sorted.map(n => n.id);
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'));
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('c'));
  });

  it('detectCycles returns empty for acyclic graph', () => {
    const g = new FormulaDependencyGraph();
    g.addNode(makeNode('a', 'A')); g.addNode(makeNode('b', 'B'));
    g.addEdge({ sourceId: 'a', targetId: 'b', depType: 'REQUIRES', weight: 1, metadata: {} });
    expect(g.detectCycles()).toHaveLength(0);
  });

  it('detectCycles finds a cycle', () => {
    const g = new FormulaDependencyGraph();
    g.addNode(makeNode('a', 'A')); g.addNode(makeNode('b', 'B'));
    g.addEdge({ sourceId: 'a', targetId: 'b', depType: 'REQUIRES', weight: 1, metadata: {} });
    g.addEdge({ sourceId: 'b', targetId: 'a', depType: 'REQUIRES', weight: 1, metadata: {} });
    expect(g.detectCycles().length).toBeGreaterThan(0);
  });

  it('findProofChain finds path between nodes', () => {
    const g = new FormulaDependencyGraph();
    g.addNode(makeNode('a', 'A')); g.addNode(makeNode('b', 'B')); g.addNode(makeNode('c', 'C'));
    g.addEdge({ sourceId: 'a', targetId: 'b', depType: 'DERIVES', weight: 1, metadata: {} });
    g.addEdge({ sourceId: 'b', targetId: 'c', depType: 'DERIVES', weight: 1, metadata: {} });
    const chain = g.findProofChain('a', 'c');
    expect(chain).toEqual(['a', 'b', 'c']);
  });

  it('findProofChain returns null when unreachable', () => {
    const g = new FormulaDependencyGraph();
    g.addNode(makeNode('a', 'A')); g.addNode(makeNode('b', 'B'));
    expect(g.findProofChain('a', 'b')).toBeNull();
  });

  it('getTransitiveDeps returns all reachable deps', () => {
    const g = new FormulaDependencyGraph();
    g.addNode(makeNode('a', 'A')); g.addNode(makeNode('b', 'B')); g.addNode(makeNode('c', 'C'));
    g.addEdge({ sourceId: 'a', targetId: 'b', depType: 'DERIVES', weight: 1, metadata: {} });
    g.addEdge({ sourceId: 'b', targetId: 'c', depType: 'DERIVES', weight: 1, metadata: {} });
    const deps = g.getTransitiveDeps('a');
    expect(deps.has('b')).toBe(true);
    expect(deps.has('c')).toBe(true);
    expect(deps.has('a')).toBe(false);
  });
});
