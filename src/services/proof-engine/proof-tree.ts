/**
 * ProofTree — proof tree structure and ASCII renderer.
 *
 * Mirrors ipfs_datasets_py/logic/TDFOL/proof_tree_visualizer.py (999 lines):
 *   NodeType / TreeStyle / VerbosityLevel (enums)
 *   ProofTreeNode (formula/nodeType/ruleName/justification/premises/metadata)
 *   ProofTreeVisualizer (ASCII rendering)
 *
 * Sprint 23, T-117.
 * Reference: ipfs_datasets_py/logic/TDFOL/proof_tree_visualizer.py
 */

import type { WasmProofResult } from './provers/prover-types.js';

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type ProofTreeNodeType =
  | 'axiom'          // Given axiom
  | 'premise'        // Assumption
  | 'inferred'       // Derived via inference rule
  | 'theorem'        // Proved theorem
  | 'goal'           // Target to prove
  | 'contradiction'  // Contradiction (for refutation proofs)
  | 'lemma';         // Intermediate lemma

export type TreeStyle = 'compact' | 'expanded' | 'detailed';
export type VerbosityLevel = 'minimal' | 'normal' | 'detailed';

// ---------------------------------------------------------------------------
// ProofTreeNode
// ---------------------------------------------------------------------------

/**
 * A single node in a proof tree.
 * Python ref: `ProofTreeNode` dataclass in proof_tree_visualizer.py.
 */
export class ProofTreeNode {
  readonly formula:       string;
  readonly nodeType:      ProofTreeNodeType;
  readonly ruleName?:     string;
  readonly justification: string;
  readonly stepNumber:    number;
  readonly children:      ProofTreeNode[];
  readonly metadata:      Record<string, unknown>;
  readonly depth:         number;

  constructor(opts: {
    formula:       string;
    nodeType:      ProofTreeNodeType;
    ruleName?:     string;
    justification?: string;
    stepNumber?:   number;
    children?:     ProofTreeNode[];
    metadata?:     Record<string, unknown>;
    depth?:        number;
  }) {
    this.formula       = opts.formula;
    this.nodeType      = opts.nodeType;
    this.ruleName      = opts.ruleName;
    this.justification = opts.justification ?? '';
    this.stepNumber    = opts.stepNumber    ?? 0;
    this.children      = opts.children      ?? [];
    this.metadata      = opts.metadata      ?? {};
    this.depth         = opts.depth         ?? 0;
  }

  isLeaf(): boolean { return this.children.length === 0; }

  toDict(): Record<string, unknown> {
    return {
      formula:       this.formula,
      node_type:     this.nodeType,
      rule_name:     this.ruleName ?? null,
      justification: this.justification,
      step_number:   this.stepNumber,
      children:      this.children.map(c => c.toDict()),
      depth:         this.depth,
    };
  }
}

// ---------------------------------------------------------------------------
// ProofTree
// ---------------------------------------------------------------------------

/**
 * A complete proof tree rooted at a proved theorem.
 */
export class ProofTree {
  readonly root: ProofTreeNode;

  constructor(root: ProofTreeNode) {
    this.root = root;
  }

  /** All nodes in depth-first order. */
  allNodes(): ProofTreeNode[] {
    const result: ProofTreeNode[] = [];
    const dfs = (node: ProofTreeNode) => {
      result.push(node);
      for (const c of node.children) dfs(c);
    };
    dfs(this.root);
    return result;
  }

  /** Leaf nodes (premises/axioms). */
  leaves(): ProofTreeNode[] {
    return this.allNodes().filter(n => n.isLeaf());
  }

  /** Find a node by formula string. */
  findByFormula(formula: string): ProofTreeNode | undefined {
    return this.allNodes().find(n => n.formula === formula);
  }

  /** Depth of the proof tree. */
  get depth(): number {
    const maxDepth = (n: ProofTreeNode): number =>
      n.isLeaf() ? n.depth : Math.max(...n.children.map(maxDepth));
    return maxDepth(this.root);
  }

  toDict(): Record<string, unknown> {
    return {
      root:        this.root.toDict(),
      total_nodes: this.allNodes().length,
      depth:       this.depth,
    };
  }

  /**
   * Render the proof tree as an ASCII string.
   * Python ref: `ProofTreeVisualizer.render_tree()`.
   */
  toAscii(style: TreeStyle = 'normal', verbosity: VerbosityLevel = 'normal'): string {
    return ProofTreeVisualizer.renderNode(this.root, style, verbosity, '', true);
  }
}

// ---------------------------------------------------------------------------
// ProofTreeVisualizer
// ---------------------------------------------------------------------------

const BOX = {
  TEE:    '├─',
  CORNER: '└─',
  VERT:   '│ ',
  SPACE:  '  ',
};

const NODE_ICONS: Record<ProofTreeNodeType, string> = {
  axiom:         '[AX]',
  premise:       '[PR]',
  inferred:      '[INF]',
  theorem:       '[THM]',
  goal:          '[GOAL]',
  contradiction: '[CONTRA]',
  lemma:         '[LEM]',
};

export class ProofTreeVisualizer {
  /** Render a single node and its descendants recursively. */
  static renderNode(
    node: ProofTreeNode,
    style: TreeStyle,
    verbosity: VerbosityLevel,
    prefix: string,
    isLast: boolean,
  ): string {
    const connector = isLast ? BOX.CORNER : BOX.TEE;
    const icon      = NODE_ICONS[node.nodeType] ?? '[?]';

    let line = `${prefix}${prefix ? connector : ''}${icon} ${node.formula}`;

    if (verbosity !== 'minimal' && node.ruleName) {
      line += `  (${node.ruleName})`;
    }
    if (verbosity === 'detailed' && node.justification) {
      line += `  — ${node.justification}`;
    }
    if (style !== 'compact' && node.stepNumber > 0) {
      line = `[${String(node.stepNumber).padStart(2, ' ')}] ${line}`;
    }

    const lines: string[] = [line];
    const childPrefix = prefix + (isLast ? BOX.SPACE : BOX.VERT);

    for (let i = 0; i < node.children.length; i++) {
      const child    = node.children[i];
      const childLast = i === node.children.length - 1;
      lines.push(ProofTreeVisualizer.renderNode(child, style, verbosity, childPrefix, childLast));
    }

    return lines.join('\n');
  }
}

// ---------------------------------------------------------------------------
// ProofTreeBuilder
// ---------------------------------------------------------------------------

/**
 * Build a simple proof tree from a `WasmProofResult`.
 */
export class ProofTreeBuilder {
  static fromProofResult(
    goalFormula: string,
    result: WasmProofResult,
    kb: string[] = [],
  ): ProofTree {
    const premises = kb.map((f, i) => new ProofTreeNode({
      formula:    f,
      nodeType:   'axiom',
      stepNumber: i + 1,
    }));

    const nodeType: ProofTreeNodeType =
      result.reason === 'proved'   ? 'theorem' :
      result.reason === 'refuted'  ? 'contradiction' :
      'goal';

    const root = new ProofTreeNode({
      formula:       goalFormula,
      nodeType,
      ruleName:      result.reason,
      justification: result.prover_id,
      stepNumber:    kb.length + 1,
      children:      premises,
      metadata:      { proof_time_ms: result.proof_time_ms },
      depth:         1,
    });

    return new ProofTree(root);
  }
}
