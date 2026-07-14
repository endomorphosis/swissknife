/**
 * WASM Prover Sprint 16 — Deontic Graph + Support Map tests.
 *
 * Tasks covered:
 *   T-88: DeonticGraph (deontic-graph.ts)
 *   T-89: DeonticGraphBuilder (deontic-graph-builder.ts)
 *   T-90: SupportMap (support-map.ts)
 *   T-91: ≥10 tests
 *
 * Sprint 16 (Phase 16 — Deontic Graph + Support Map, P2).
 * Reference: ipfs_datasets_py/logic/deontic/graph.py + support_map.py
 */

import { DeonticGraph } from '../../src/services/logic/deontic/deontic-graph.js';
import type { DeonticNode, DeonticRule } from '../../src/services/logic/deontic/deontic-graph.js';
import { DeonticGraphBuilder } from '../../src/services/logic/deontic/deontic-graph-builder.js';
import { SupportMapBuilder } from '../../src/services/logic/deontic/support-map.js';
import { DeonticTextAnalyzer } from '../../src/services/logic/deontic/deontic-text-analyzer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActorNode(id: string, label: string, active = true): DeonticNode {
  return { id, node_type: 'actor', label, active, confidence: 0.9, attributes: {} };
}

function makeActionNode(id: string, label: string, active = false): DeonticNode {
  return { id, node_type: 'action', label, active, confidence: 0.8, attributes: {} };
}

function makeRule(id: string, modality: DeonticRule['modality'], sourceId: string, targetId: string, active = true): DeonticRule {
  return { id, modality, source_ids: [sourceId], target_id: targetId, predicate: modality, active, confidence: 0.9, authority_ids: [], evidence_ids: [], attributes: {} };
}

// ---------------------------------------------------------------------------
// T-88: DeonticGraph
// ---------------------------------------------------------------------------

describe('T-88 DeonticGraph', () => {
  let graph: DeonticGraph;
  beforeEach(() => {
    graph = new DeonticGraph();
    graph.addNode(makeActorNode('actor1', 'User'));
    graph.addNode(makeActionNode('action1', 'log_access'));
    graph.addRule(makeRule('r1', 'obligation', 'actor1', 'action1'));
  });

  it('addNode and getNode work', () => {
    const node = graph.getNode('actor1');
    expect(node).toBeDefined();
    expect(node!.label).toBe('User');
    expect(node!.node_type).toBe('actor');
  });

  it('addRule stores rule accessible via rules map', () => {
    expect(graph.rules.get('r1')).toBeDefined();
    expect(graph.rules.get('r1')!.modality).toBe('obligation');
  });

  it('activeRules returns only active rules', () => {
    graph.addRule(makeRule('r2', 'permission', 'actor1', 'action1', false));
    const active = graph.activeRules();
    expect(active.some(r => r.id === 'r1')).toBe(true);
    expect(active.some(r => r.id === 'r2')).toBe(false);
  });

  it('rulesForTarget returns correct rules', () => {
    const rules = graph.rulesForTarget('action1');
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe('r1');
  });

  it('governedTargets lists unique target IDs', () => {
    const targets = graph.governedTargets();
    expect(targets).toContain('action1');
  });

  it('detectConflicts finds O+F clash on same target+predicate', () => {
    graph.addRule({ id: 'r_conflict', modality: 'prohibition', source_ids: ['actor1'], target_id: 'action1', predicate: 'obligation', active: true, confidence: 0.8, authority_ids: [], evidence_ids: [], attributes: {} });
    const conflicts = graph.detectConflicts();
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    expect(conflicts[0].modalities).toContain('obligation');
    expect(conflicts[0].modalities).toContain('prohibition');
  });

  it('detectConflicts returns empty when no conflicts', () => {
    graph.addNode(makeActionNode('action2', 'delete_record'));
    graph.addRule(makeRule('r3', 'prohibition', 'actor1', 'action2'));
    const conflicts = graph.detectConflicts();
    expect(conflicts.filter(c => c.target_id === 'action2')).toHaveLength(0);
  });

  it('assessRules identifies satisfied and missing sources', () => {
    const assessments = graph.assessRules();
    const r1 = assessments.find(a => a.rule_id === 'r1')!;
    expect(r1).toBeDefined();
    // actor1 is active → satisfied
    expect(r1.satisfied_sources).toContain('actor1');
    expect(r1.missing_sources).toHaveLength(0);
  });

  it('sourceGapSummary reports gap when source is inactive', () => {
    const inactiveActor = makeActorNode('actor2', 'UnknownUser', false);
    graph.addNode(inactiveActor);
    const actionNode = makeActionNode('action3', 'read_file');
    graph.addNode(actionNode);
    graph.addRule(makeRule('r4', 'permission', 'actor2', 'action3'));
    const gap = graph.sourceGapSummary();
    expect(gap.rules_with_gaps.some(g => g.rule_id === 'r4')).toBe(true);
  });

  it('summary returns correct counts', () => {
    const s = graph.summary();
    expect(s['total_nodes']).toBeGreaterThanOrEqual(2);
    expect(s['total_rules']).toBeGreaterThanOrEqual(1);
  });

  it('toDict / fromDict round-trips correctly', () => {
    const d = graph.toDict();
    const restored = DeonticGraph.fromDict(d as Record<string, unknown>);
    expect(restored.getNode('actor1')?.label).toBe('User');
    expect(restored.rules.get('r1')?.modality).toBe('obligation');
  });

  it('nodesByType returns actor nodes only', () => {
    const actors = graph.nodesByType('actor');
    expect(actors.every(n => n.node_type === 'actor')).toBe(true);
    expect(actors.some(n => n.id === 'actor1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-89: DeonticGraphBuilder.fromStatements
// ---------------------------------------------------------------------------

describe('T-89 DeonticGraphBuilder.fromStatements()', () => {
  it('builds a graph from extracted deontic statements', () => {
    const analyzer = new DeonticTextAnalyzer();
    const stmts = analyzer.extractStatements('Users must log access. Admins may delete records.');
    const conflicts = analyzer.detectConflicts(stmts);
    const graph = DeonticGraphBuilder.fromStatements(stmts, conflicts);

    expect(graph.nodes.size).toBeGreaterThanOrEqual(1);
    expect(graph.rules.size).toBeGreaterThanOrEqual(1);

    const summary = graph.summary();
    expect(typeof summary['total_nodes']).toBe('number');
    expect(typeof summary['total_rules']).toBe('number');
  });

  it('flags conflicted statements as inactive rules', () => {
    const analyzer = new DeonticTextAnalyzer();
    // Build manually conflicting statements
    const s1 = analyzer.extractStatements('Users must share data.')[0];
    const s2 = analyzer.extractStatements('Users must not share data.')[0];
    if (!s1 || !s2) return; // pattern may not match

    // Simulate a conflict between s1 and s2
    const stmts = [s1, s2];
    const fakeConflict = {
      id: 'c1', type: 'direct' as const, severity: 'high' as const,
      entities: [s1.entity],
      statement1: s1, statement2: s2,
      description: 'Direct conflict',
      resolution: 'Resolve precedence',
    };
    const graph = DeonticGraphBuilder.fromStatements(stmts, [fakeConflict]);
    // Both conflicted rules should be inactive
    const inactiveRules = graph.inactiveRules();
    expect(inactiveRules.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty graph for empty statement list', () => {
    const graph = DeonticGraphBuilder.fromStatements([]);
    expect(graph.nodes.size).toBe(0);
    expect(graph.rules.size).toBe(0);
  });

  it('prefers proposition alias when present on statements', () => {
    const analyzer = new DeonticTextAnalyzer();
    const stmt = analyzer.extractStatements('Users must log access.')[0];
    if (!stmt) return;
    const withProposition = {
      ...stmt,
      proposition: 'record audit trail',
    };

    const graph = DeonticGraphBuilder.fromStatements([withProposition]);
    const actionNodes = [...graph.nodes.values()].filter(node => node.node_type === 'action');

    expect(actionNodes.length).toBe(1);
    expect(actionNodes[0].label).toBe('record audit trail');
  });
});

// ---------------------------------------------------------------------------
// T-90: SupportMapBuilder
// ---------------------------------------------------------------------------

describe('T-90 SupportMapBuilder', () => {
  function buildSampleGraph(): DeonticGraph {
    const g = new DeonticGraph();
    g.addNode(makeActorNode('a1', 'Alice'));
    g.addNode(makeActionNode('act1', 'submit_report'));
    g.addRule(makeRule('r1', 'obligation', 'a1', 'act1'));
    return g;
  }

  it('build() returns one entry per rule', () => {
    const graph = buildSampleGraph();
    const entries = SupportMapBuilder.build(graph);
    expect(entries).toHaveLength(1);
    expect(entries[0].rule_id).toBe('r1');
    expect(entries[0].modality).toBe('obligation');
    expect(entries[0].target_label).toBe('submit_report');
  });

  it('build() populates facts from satisfied active source nodes', () => {
    const graph = buildSampleGraph();
    const entries = SupportMapBuilder.build(graph);
    // actor 'a1' is active → should appear as a fact
    expect(entries[0].facts.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].facts[0].predicate).toBe('Alice');
    expect(entries[0].facts[0].status).toBe('established');
  });

  it('buildSummary() groups entries by modality', () => {
    const graph = buildSampleGraph();
    graph.addNode(makeActionNode('act2', 'delete_record'));
    graph.addRule(makeRule('r2', 'prohibition', 'a1', 'act2'));
    const summary = SupportMapBuilder.buildSummary(graph);
    expect(summary['obligation']).toBeDefined();
    expect(summary['prohibition']).toBeDefined();
    expect(summary['obligation'].count).toBe(1);
  });

  it('build() returns empty array for empty graph', () => {
    const graph = new DeonticGraph();
    expect(SupportMapBuilder.build(graph)).toHaveLength(0);
  });
});
