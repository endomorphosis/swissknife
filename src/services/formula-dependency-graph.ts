/**
 * FormulaDependencyGraph — dependency analysis between TDFOL/DCEC formulas.
 *
 * Mirrors ipfs_datasets_py/logic/TDFOL/formula_dependency_graph.py (889 lines):
 *   FormulaType / DependencyType (enums)
 *   DependencyNode / DependencyEdge
 *   FormulaDependencyGraph (addNode/addEdge/topologicalSort/detectCycles/findProofChain)
 *
 * Sprint 23, T-118.
 * Reference: ipfs_datasets_py/logic/TDFOL/formula_dependency_graph.py
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type FormulaType =
  | 'axiom'
  | 'theorem'
  | 'lemma'
  | 'hypothesis'
  | 'conclusion'
  | 'definition'
  | 'goal';

export type DependencyType =
  | 'REQUIRES'      // A requires B to hold first
  | 'SUPPORTS'      // A provides evidence for B
  | 'CONTRADICTS'   // A contradicts B
  | 'DERIVES'       // A is derived from B via a rule
  | 'REFINES';      // A is a more specific version of B

// ---------------------------------------------------------------------------
// DependencyNode / DependencyEdge
// ---------------------------------------------------------------------------

export interface DependencyNode {
  readonly id:           string;
  readonly formula:      string;
  readonly formulaType:  FormulaType;
  readonly metadata:     Record<string, unknown>;
}

export interface DependencyEdge {
  readonly sourceId:      string;
  readonly targetId:      string;
  readonly depType:       DependencyType;
  readonly weight:        number;
  readonly metadata:      Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// FormulaDependencyGraph
// ---------------------------------------------------------------------------

/**
 * A directed graph of formula dependencies, supporting topological sort,
 * cycle detection, and proof-chain finding.
 *
 * Python ref: `FormulaDependencyGraph` in formula_dependency_graph.py.
 */
export class FormulaDependencyGraph {
  private readonly _nodes = new Map<string, DependencyNode>();
  private readonly _edges: DependencyEdge[] = [];
  private readonly _adj   = new Map<string, string[]>();  // nodeId → [targetId]
  private readonly _radj  = new Map<string, string[]>();  // nodeId → [sourceId]

  // ---------------------------------------------------------------------------
  // Mutation
  // ---------------------------------------------------------------------------

  addNode(node: DependencyNode): void {
    this._nodes.set(node.id, node);
    if (!this._adj.has(node.id))  this._adj.set(node.id, []);
    if (!this._radj.has(node.id)) this._radj.set(node.id, []);
  }

  addEdge(edge: DependencyEdge): void {
    this._edges.push(edge);
    if (!this._adj.has(edge.sourceId)) this._adj.set(edge.sourceId, []);
    if (!this._radj.has(edge.targetId)) this._radj.set(edge.targetId, []);
    this._adj.get(edge.sourceId)!.push(edge.targetId);
    this._radj.get(edge.targetId)!.push(edge.sourceId);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getNode(id: string): DependencyNode | undefined { return this._nodes.get(id); }
  get nodes(): ReadonlyMap<string, DependencyNode> { return this._nodes; }
  get edges(): readonly DependencyEdge[] { return this._edges; }

  /** Direct dependencies (outgoing edges) of a node. */
  getDependencies(id: string): string[] {
    return [...(this._adj.get(id) ?? [])];
  }

  /** Nodes that depend on this one (incoming edges). */
  getDependents(id: string): string[] {
    return [...(this._radj.get(id) ?? [])];
  }

  /** Get transitive dependencies of `id` (BFS). */
  getTransitiveDeps(id: string): Set<string> {
    const visited = new Set<string>();
    const queue   = [id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const dep of this._adj.get(cur) ?? []) {
        if (!visited.has(dep)) { visited.add(dep); queue.push(dep); }
      }
    }
    visited.delete(id);
    return visited;
  }

  // ---------------------------------------------------------------------------
  // Topological sort (Kahn's algorithm)
  // ---------------------------------------------------------------------------

  /**
   * Return formulas in dependency order (dependencies first).
   * Throws if the graph has cycles.
   *
   * Python ref: `FormulaDependencyGraph.topological_sort()`.
   */
  topologicalSort(): DependencyNode[] {
    const inDegree = new Map<string, number>();
    for (const id of this._nodes.keys()) inDegree.set(id, 0);
    for (const edge of this._edges) {
      inDegree.set(edge.targetId, (inDegree.get(edge.targetId) ?? 0) + 1);
    }

    const queue = [...this._nodes.keys()].filter(id => inDegree.get(id) === 0);
    const result: DependencyNode[] = [];

    while (queue.length > 0) {
      const id   = queue.shift()!;
      const node = this._nodes.get(id);
      if (node) result.push(node);

      for (const dep of this._adj.get(id) ?? []) {
        const newDeg = (inDegree.get(dep) ?? 1) - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) queue.push(dep);
      }
    }

    if (result.length < this._nodes.size) {
      throw new Error('FormulaDependencyGraph.topologicalSort: graph contains cycles');
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Cycle detection (DFS)
  // ---------------------------------------------------------------------------

  /**
   * Detect all cycles in the graph.
   * Returns an array of cycles (each cycle is an array of node IDs).
   *
   * Python ref: `FormulaDependencyGraph.detect_cycles()`.
   */
  detectCycles(): string[][] {
    const cycles: string[][] = [];
    const visited  = new Set<string>();
    const inStack  = new Set<string>();
    const stack:   string[] = [];

    const dfs = (id: string): void => {
      visited.add(id);
      inStack.add(id);
      stack.push(id);

      for (const neighbour of this._adj.get(id) ?? []) {
        if (!visited.has(neighbour)) {
          dfs(neighbour);
        } else if (inStack.has(neighbour)) {
          // Found a cycle — extract it
          const cycleStart = stack.indexOf(neighbour);
          cycles.push([...stack.slice(cycleStart), neighbour]);
        }
      }

      stack.pop();
      inStack.delete(id);
    };

    for (const id of this._nodes.keys()) {
      if (!visited.has(id)) dfs(id);
    }

    return cycles;
  }

  // ---------------------------------------------------------------------------
  // Proof chain
  // ---------------------------------------------------------------------------

  /**
   * Find a dependency chain from `startId` to `goalId` (BFS).
   * Returns the path as an array of node IDs, or null if unreachable.
   *
   * Python ref: `find_proof_chain()` in formula_dependency_graph.py.
   */
  findProofChain(startId: string, goalId: string): string[] | null {
    if (startId === goalId) return [startId];

    const visited = new Set<string>([startId]);
    const queue: Array<{ id: string; path: string[] }> = [{ id: startId, path: [startId] }];

    while (queue.length > 0) {
      const { id, path } = queue.shift()!;
      for (const neighbour of this._adj.get(id) ?? []) {
        if (neighbour === goalId) return [...path, goalId];
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          queue.push({ id: neighbour, path: [...path, neighbour] });
        }
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // PORT-084: analysis helpers
  // ---------------------------------------------------------------------------

  /**
   * Return all nodes that (transitively) depend on `id` — i.e., traverse
   * the reverse adjacency from `id` upward.
   */
  getAllDependents(id: string): Set<string> {
    const visited = new Set<string>();
    const queue = [...(this._radj.get(id) ?? [])];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (!visited.has(cur)) {
        visited.add(cur);
        queue.push(...(this._radj.get(cur) ?? []));
      }
    }
    return visited;
  }

  /**
   * Shortest path from `from` to `to` through the dependant-direction graph
   * (BFS over `_radj`). Returns null when no path exists.
   */
  findCriticalPath(from: string, to: string): string[] | null {
    if (from === to) return [from];
    const visited = new Set<string>([from]);
    const queue: Array<{ id: string; path: string[] }> = [
      { id: from, path: [from] },
    ];
    while (queue.length > 0) {
      const { id, path } = queue.shift()!;
      for (const next of this._radj.get(id) ?? []) {
        const newPath = [...path, next];
        if (next === to) return newPath;
        if (!visited.has(next)) {
          visited.add(next);
          queue.push({ id: next, path: newPath });
        }
      }
    }
    return null;
  }

  /**
   * All paths from `from` to `to` through the dependant-direction graph
   * (DFS over `_radj`). Optional `maxLen` caps the path length.
   */
  findAllPaths(from: string, to: string, maxLen?: number): string[][] {
    const results: string[][] = [];
    const dfs = (cur: string, path: string[], visited: Set<string>): void => {
      if (cur === to && path.length > 1) { results.push([...path]); return; }
      if (maxLen !== undefined && path.length >= maxLen) return;
      for (const next of this._radj.get(cur) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          dfs(next, [...path, next], visited);
          visited.delete(next);
        }
      }
    };
    dfs(from, [from], new Set([from]));
    return results;
  }

  /**
   * Return the IDs of axiom nodes that have no dependants.
   */
  findUnusedAxioms(): string[] {
    const unused: string[] = [];
    for (const [id, node] of this._nodes) {
      if (node.formulaType === 'axiom' && (this._radj.get(id) ?? []).length === 0) {
        unused.push(id);
      }
    }
    return unused;
  }

  /**
   * Return all (dependent, dependency) pairs — direct and transitive.
   * Each pair is [dependentId, dependencyId].
   */
  findRedundantFormulas(): [string, string][] {
    const pairs: [string, string][] = [];
    for (const id of this._nodes.keys()) {
      const deps = this.getTransitiveDeps(id);
      for (const dep of deps) pairs.push([id, dep]);
    }
    return pairs;
  }

  /**
   * Summary statistics for the graph.
   */
  getStatistics(): {
    num_nodes: number; num_edges: number; num_axioms: number;
    num_theorems: number; has_cycles: boolean;
    node_types: Record<string, number>; edge_types: Record<string, number>;
  } {
    const node_types: Record<string, number> = {};
    for (const node of this._nodes.values()) {
      node_types[node.formulaType] = (node_types[node.formulaType] ?? 0) + 1;
    }
    const edge_types: Record<string, number> = {};
    for (const edge of this._edges) {
      edge_types[edge.depType] = (edge_types[edge.depType] ?? 0) + 1;
    }
    return {
      num_nodes:    this._nodes.size,
      num_edges:    this._edges.length,
      num_axioms:   node_types['axiom']   ?? 0,
      num_theorems: node_types['theorem'] ?? 0,
      has_cycles:   this.detectCycles().length > 0,
      node_types,
      edge_types,
    };
  }

  // ---------------------------------------------------------------------------
  // PORT-084: GraphViz DOT export (full clustered form)
  // ---------------------------------------------------------------------------

  exportDot(opts: {
    highlightPath?: string[];
    includeLabels?: boolean;
    clusterByType?: boolean;
  } = {}): string {
    const { highlightPath, includeLabels = true, clusterByType = true } = opts;
    const highlightSet = new Set(highlightPath ?? []);

    // Build edge highlight set: edges where both endpoints are in the highlighted path
    const highlightEdgeSet = new Set<string>();
    if (highlightPath && highlightPath.length > 1) {
      for (let i = 0; i < highlightPath.length - 1; i++) {
        const a = highlightPath[i]!, b = highlightPath[i + 1]!;
        // Check both directions since edges might go either way
        highlightEdgeSet.add(`${a}->${b}`);
        highlightEdgeSet.add(`${b}->${a}`);
      }
    }

    // Assign deterministic node names
    const nodeIds = [...this._nodes.keys()];
    const idxMap = new Map<string, number>(nodeIds.map((id, i) => [id, i]));
    const nodeName = (id: string) => `n${idxMap.get(id) ?? 0}`;

    const TYPE_STYLES: Record<string, string> = {
      axiom:    'shape=box, style=filled, fillcolor=lightblue',
      lemma:    'shape=ellipse, style=filled, fillcolor=lightyellow',
      theorem:  'shape=diamond, style=filled, fillcolor=lightgreen',
      hypothesis: 'shape=box, style=dashed',
    };

    const lines: string[] = ['digraph DependencyGraph {', '  rankdir=TB;', '  node [fontname="Helvetica"];'];

    if (clusterByType) {
      // Group nodes into clusters by formulaType
      const byType = new Map<string, string[]>();
      for (const [id, node] of this._nodes) {
        if (!byType.has(node.formulaType)) byType.set(node.formulaType, []);
        byType.get(node.formulaType)!.push(id);
      }
      for (const [type, ids] of byType) {
        lines.push(`  subgraph cluster_${type} {`);
        lines.push(`    label="${type}s";`);
        for (const id of ids) {
          const node = this._nodes.get(id)!;
          const label = (node.metadata?.['name'] as string | undefined) ?? id;
          const style = TYPE_STYLES[type] ?? 'shape=ellipse';
          const highlight = highlightSet.has(id) ? ', penwidth=3, color=red' : '';
          lines.push(`    ${nodeName(id)} [${style}${highlight}${includeLabels ? `, label="${label}"` : ''}];`);
        }
        lines.push('  }');
      }
    } else {
      for (const [id, node] of this._nodes) {
        const label = (node.metadata?.['name'] as string | undefined) ?? id;
        const style = TYPE_STYLES[node.formulaType] ?? 'shape=ellipse';
        const highlight = highlightSet.has(id) ? ', penwidth=3, color=red' : '';
        lines.push(`  ${nodeName(id)} [${style}${highlight}${includeLabels ? `, label="${label}"` : ''}];`);
      }
    }

    // Edges
    for (const edge of this._edges) {
      const src = nodeName(edge.sourceId), tgt = nodeName(edge.targetId);
      const isHighlighted = highlightEdgeSet.has(`${edge.sourceId}->${edge.targetId}`) ||
                            highlightEdgeSet.has(`${edge.targetId}->${edge.sourceId}`);
      const edgeStyle = isHighlighted ? ' [color=red, penwidth=2]' : '';
      const ruleName  = edge.metadata?.['rule_name'] as string | undefined;
      const edgeLabel = includeLabels && ruleName ? ` [label="${ruleName}"${isHighlighted ? ', color=red, penwidth=2' : ''}]` : edgeStyle;
      lines.push(`  ${src} -> ${tgt}${edgeLabel};`);
    }

    lines.push('}');
    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Serialisation
  // ---------------------------------------------------------------------------

  toDict(): Record<string, unknown> {
    return {
      nodes: Object.fromEntries([...this._nodes.entries()].map(([k, v]) => [k, v])),
      edges: this._edges,
      node_count: this._nodes.size,
      edge_count: this._edges.length,
    };
  }
}


// PORT-084: legacy module-level DOT helper (delegates to exportDot)
export function formulaDependencyGraphToDot(nodes: string[], edges: Array<[string, string]>): string {
  const g = new FormulaDependencyGraph();
  nodes.forEach((n, i) => g.addNode({ id: n, formula: n, formulaType: 'theorem', metadata: {} }));
  edges.forEach(([a, b]) => g.addEdge({ sourceId: a, targetId: b, depType: 'DERIVES', weight: 1, metadata: {} }));
  return g.exportDot();
}
