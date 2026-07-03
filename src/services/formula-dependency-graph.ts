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
