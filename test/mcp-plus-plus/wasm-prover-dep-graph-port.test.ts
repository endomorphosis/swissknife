/**
 * Conformance: §12.8 PORT-084 — Formula dependency-graph analysis + DOT export.
 *
 * Verifies the TS `FormulaDependencyGraph` matches the Python reference
 *   ipfs_datasets_py/logic/TDFOL/formula_dependency_graph.py
 * for the previously-missing surface: transitive dependents, critical/all
 * shortest paths, unused-axiom & redundancy detection, statistics, and GraphViz
 * DOT export.
 */

import {
  FormulaDependencyGraph,
  type DependencyNode,
  type DependencyEdge,
} from '../../src/services/formula-dependency-graph';

function node(id: string, formulaType: DependencyNode['formulaType'], name?: string): DependencyNode {
  return { id, formula: `${id}_formula`, formulaType, metadata: name ? { name } : {} };
}
function edge(sourceId: string, targetId: string, rule?: string): DependencyEdge {
  return { sourceId, targetId, depType: 'DERIVES', weight: 1, metadata: rule ? { rule_name: rule } : {} };
}

/** A (axiom) <- L (lemma) <- C (theorem); B is an unused axiom. */
function buildGraph(): FormulaDependencyGraph {
  const g = new FormulaDependencyGraph();
  g.addNode(node('A', 'axiom', 'AxiomA'));
  g.addNode(node('B', 'axiom', 'AxiomB'));
  g.addNode(node('L', 'lemma', 'LemmaL'));
  g.addNode(node('C', 'theorem', 'TheoremC'));
  g.addEdge(edge('L', 'A', 'ModusPonens')); // L depends on A
  g.addEdge(edge('C', 'L', 'Simplification')); // C depends on L
  return g;
}

describe('PORT-084 dependency-graph analysis', () => {
  it('getAllDependents returns transitive dependents', () => {
    const g = buildGraph();
    expect(g.getAllDependents('A')).toEqual(new Set(['L', 'C']));
    expect(g.getAllDependents('C')).toEqual(new Set()); // nothing depends on the theorem
  });

  it('findCriticalPath returns the shortest axiom→theorem path', () => {
    const g = buildGraph();
    expect(g.findCriticalPath('A', 'C')).toEqual(['A', 'L', 'C']);
    expect(g.findCriticalPath('A', 'A')).toEqual(['A']);
    expect(g.findCriticalPath('A', 'ZZZ')).toBeNull();
  });

  it('findAllPaths enumerates every dependents-direction path', () => {
    const g = buildGraph();
    expect(g.findAllPaths('A', 'C')).toEqual([['A', 'L', 'C']]);
    expect(g.findAllPaths('A', 'C', 1)).toEqual([]); // bounded below the required length
  });

  it('findUnusedAxioms returns only axioms with no dependents', () => {
    const g = buildGraph();
    expect(g.findUnusedAxioms()).toEqual(['B']); // A is used by L
  });

  it('findRedundantFormulas returns (dependent, dependency) pairs', () => {
    const g = buildGraph();
    const pairs = g.findRedundantFormulas().map(p => p.join('<-'));
    expect(pairs).toContain('L<-A');
    expect(pairs).toContain('C<-A');
    expect(pairs).toContain('C<-L');
    expect(pairs).toHaveLength(3);
  });

  it('getStatistics summarises the graph', () => {
    const stats = buildGraph().getStatistics();
    expect(stats.num_nodes).toBe(4);
    expect(stats.num_edges).toBe(2);
    expect(stats.num_axioms).toBe(2);
    expect(stats.num_theorems).toBe(1);
    expect(stats.has_cycles).toBe(false);
    expect(stats.node_types).toEqual({ axiom: 2, lemma: 1, theorem: 1 });
    expect(stats.edge_types).toEqual({ DERIVES: 2 });
  });

  it('getStatistics reports cycles when present', () => {
    const g = new FormulaDependencyGraph();
    g.addNode(node('X', 'theorem'));
    g.addNode(node('Y', 'theorem'));
    g.addEdge(edge('X', 'Y'));
    g.addEdge(edge('Y', 'X'));
    expect(g.getStatistics().has_cycles).toBe(true);
  });
});

describe('PORT-084 GraphViz DOT export', () => {
  it('emits a valid clustered digraph with typed nodes and directed edges', () => {
    const dot = buildGraph().exportDot();
    expect(dot.startsWith('digraph DependencyGraph {')).toBe(true);
    expect(dot).toContain('subgraph cluster_axiom');
    expect(dot).toContain('subgraph cluster_theorem');
    expect(dot).toContain('fillcolor=lightblue'); // axiom style
    expect(dot).toContain('label="AxiomA"'); // uses metadata.name
    expect(dot).toContain('label="ModusPonens"'); // edge rule label
    expect(dot).toMatch(/n\d+ -> n\d+/); // directed edges
    expect(dot.trimEnd().endsWith('}')).toBe(true);
  });

  it('highlights the requested path in red', () => {
    const dot = buildGraph().exportDot({ highlightPath: ['A', 'L', 'C'] });
    expect(dot).toContain('penwidth=3, color=red'); // highlighted node
    expect(dot).toContain('color=red, penwidth=2'); // highlighted edge
  });

  it('honours includeLabels=false and clusterByType=false', () => {
    const dot = buildGraph().exportDot({ includeLabels: false, clusterByType: false });
    expect(dot).not.toContain('subgraph cluster_');
    expect(dot).not.toContain('label="ModusPonens"');
  });
});
