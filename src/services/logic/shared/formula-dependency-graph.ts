/**
 * FormulaDependencyGraph — dependency analysis between TDFOL/DCEC formulas.
 *
 * Mirrors ipfs_datasets_py/logic/TDFOL/formula_dependency_graph.py (889 lines):
 *   FormulaType / DependencyType (enums)
 *   DependencyNode / DependencyEdge
 *   FormulaDependencyGraph (addNode/addEdge/topologicalSort/detectCycles/findProofChain)
 *
 * T-118.
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
  // Transitive dependents / path analysis (Python-faithful) — PORT-084
  // ---------------------------------------------------------------------------

  /**
   * Transitive dependents of `id` (everything that (in)directly depends on it).
   * Mirror of {@link getTransitiveDeps} in the reverse (`_radj`) direction.
   *
   * Python ref: `FormulaDependencyGraph.get_all_dependents()`.
   */
  getAllDependents(id: string): Set<string> {
    const visited = new Set<string>();
    const queue = [id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const dep of this._radj.get(cur) ?? []) {
        if (!visited.has(dep)) { visited.add(dep); queue.push(dep); }
      }
    }
    visited.delete(id);
    return visited;
  }

  /**
   * Shortest proof path from `startId` (typically an axiom) to `endId`
   * (typically a theorem), following the dependents direction — i.e. "what is
   * derived from start until we reach end". BFS ⇒ shortest by hop count.
   * Returns node IDs, or null if unreachable.
   *
   * Python ref: `FormulaDependencyGraph.find_critical_path()`.
   */
  findCriticalPath(startId: string, endId: string): string[] | null {
    if (!this._nodes.has(startId) || !this._nodes.has(endId)) return null;
    if (startId === endId) return [startId];

    const visited = new Set<string>([startId]);
    const queue: Array<{ id: string; path: string[] }> = [{ id: startId, path: [startId] }];
    while (queue.length > 0) {
      const { id, path } = queue.shift()!;
      if (id === endId) return path;
      for (const dependent of this._radj.get(id) ?? []) {
        if (!visited.has(dependent)) {
          visited.add(dependent);
          queue.push({ id: dependent, path: [...path, dependent] });
        }
      }
    }
    return null;
  }

  /**
   * All (acyclic) paths from `startId` to `endId` in the dependents direction,
   * each path a list of node IDs. `maxLength` optionally bounds path length.
   *
   * Python ref: `FormulaDependencyGraph.find_all_paths()`.
   */
  findAllPaths(startId: string, endId: string, maxLength?: number): string[][] {
    if (!this._nodes.has(startId) || !this._nodes.has(endId)) return [];
    const allPaths: string[][] = [];

    const dfs = (current: string, path: string[], visited: Set<string>): void => {
      if (maxLength !== undefined && path.length > maxLength) return;
      if (current === endId) { allPaths.push([...path]); return; }
      for (const dependent of this._radj.get(current) ?? []) {
        if (!visited.has(dependent)) {
          visited.add(dependent);
          path.push(dependent);
          dfs(dependent, path, visited);
          path.pop();
          visited.delete(dependent);
        }
      }
    };

    dfs(startId, [startId], new Set<string>([startId]));
    return allPaths;
  }

  /**
   * Axioms that are not used in any derivation (have no dependents).
   *
   * Python ref: `FormulaDependencyGraph.find_unused_axioms()`.
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
   * Pairs `[a, b]` where `a` (transitively) depends on `b` — i.e. `a` may be
   * redundant given `b`. Each unordered pair is reported at most once.
   *
   * Python ref: `FormulaDependencyGraph.find_redundant_formulas()`.
   */
  findRedundantFormulas(): Array<[string, string]> {
    const redundant: Array<[string, string]> = [];
    const ids = [...this._nodes.keys()];
    for (let i = 0; i < ids.length; i++) {
      const f1 = ids[i];
      const deps1 = this.getTransitiveDeps(f1);
      for (let j = i + 1; j < ids.length; j++) {
        const f2 = ids[j];
        if (deps1.has(f2)) redundant.push([f1, f2]);
        else if (this.getTransitiveDeps(f2).has(f1)) redundant.push([f2, f1]);
      }
    }
    return redundant;
  }

  /**
   * Summary statistics: node/edge counts, per-type breakdowns, cycle presence,
   * and axiom/theorem counts.
   *
   * Python ref: `FormulaDependencyGraph.get_statistics()`.
   */
  getStatistics(): {
    num_nodes: number;
    num_edges: number;
    node_types: Record<string, number>;
    edge_types: Record<string, number>;
    has_cycles: boolean;
    num_axioms: number;
    num_theorems: number;
  } {
    const nodeTypes: Record<string, number> = {};
    for (const node of this._nodes.values()) {
      nodeTypes[node.formulaType] = (nodeTypes[node.formulaType] ?? 0) + 1;
    }
    const edgeTypes: Record<string, number> = {};
    for (const edge of this._edges) {
      edgeTypes[edge.depType] = (edgeTypes[edge.depType] ?? 0) + 1;
    }
    return {
      num_nodes: this._nodes.size,
      num_edges: this._edges.length,
      node_types: nodeTypes,
      edge_types: edgeTypes,
      has_cycles: this.detectCycles().length > 0,
      num_axioms: nodeTypes['axiom'] ?? 0,
      num_theorems: nodeTypes['theorem'] ?? 0,
    };
  }

  // ---------------------------------------------------------------------------
  // GraphViz DOT export
  // ---------------------------------------------------------------------------

  /**
   * Render the graph as a GraphViz DOT string (edges `source -> target`,
   * i.e. dependency direction). Nodes are coloured by formula type; an optional
   * `highlightPath` (node IDs) is drawn in red; nodes may be clustered by type.
   *
   * Returns the DOT text (the caller decides where to write it — this library
   * stays filesystem-free, unlike the Python `export_dot` which writes a file).
   *
   * Python ref: `FormulaDependencyGraph.export_dot()`.
   */
  exportDot(options: {
    highlightPath?: readonly string[];
    includeLabels?: boolean;
    clusterByType?: boolean;
  } = {}): string {
    const { highlightPath, includeLabels = true, clusterByType = true } = options;
    const highlight = new Set(highlightPath ?? []);

    const nodeStyles: Record<string, string> = {
      axiom:      'fillcolor=lightblue, style="rounded,filled"',
      theorem:    'fillcolor=lightgreen, style="rounded,filled"',
      lemma:      'fillcolor=lightcyan, style="rounded,filled"',
      goal:       'fillcolor=gold, style="rounded,filled"',
      hypothesis: 'fillcolor=lightgray, style="rounded,filled"',
      conclusion: 'fillcolor=lightyellow, style="rounded,filled"',
      definition: 'fillcolor=lavender, style="rounded,filled"',
    };
    const styleFor = (t: string): string => nodeStyles[t] ?? 'style="rounded,filled", fillcolor=white';

    // Deterministic DOT-safe id per node (insertion order).
    const dotId = new Map<string, string>();
    let i = 0;
    for (const id of this._nodes.keys()) dotId.set(id, `n${i++}`);
    const esc = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const labelOf = (id: string, node: DependencyNode): string => {
      const name = node.metadata['name'];
      return typeof name === 'string' && name ? name : (node.formula || id);
    };

    const lines: string[] = ['digraph DependencyGraph {', '  rankdir=TB;', '  node [shape=box, style=rounded];', ''];

    const emitNode = (id: string, node: DependencyNode, indent: string): void => {
      let style = styleFor(node.formulaType);
      if (highlight.has(id)) style += ', penwidth=3, color=red';
      lines.push(`${indent}${dotId.get(id)} [label="${esc(labelOf(id, node))}", ${style}];`);
    };

    if (clusterByType) {
      const groups = new Map<string, Array<[string, DependencyNode]>>();
      for (const [id, node] of this._nodes) {
        if (!groups.has(node.formulaType)) groups.set(node.formulaType, []);
        groups.get(node.formulaType)!.push([id, node]);
      }
      for (const [type, group] of groups) {
        lines.push(`  subgraph cluster_${type} {`);
        lines.push(`    label="${type.charAt(0).toUpperCase()}${type.slice(1)}";`);
        lines.push('    style=dashed;');
        lines.push('    color=gray;');
        for (const [id, node] of group) emitNode(id, node, '    ');
        lines.push('  }');
        lines.push('');
      }
    } else {
      for (const [id, node] of this._nodes) emitNode(id, node, '  ');
      lines.push('');
    }

    for (const edge of this._edges) {
      const src = dotId.get(edge.sourceId);
      const tgt = dotId.get(edge.targetId);
      if (!src || !tgt) continue;
      const attrs: string[] = [];
      const rule = edge.metadata['rule_name'] ?? edge.metadata['ruleName'];
      if (includeLabels && typeof rule === 'string' && rule) attrs.push(`label="${esc(rule)}"`);
      if (highlight.has(edge.sourceId) && highlight.has(edge.targetId)) attrs.push('color=red, penwidth=2');
      lines.push(attrs.length > 0 ? `  ${src} -> ${tgt} [${attrs.join(', ')}];` : `  ${src} -> ${tgt};`);
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
