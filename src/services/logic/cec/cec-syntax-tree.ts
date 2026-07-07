/**
 * CEC Syntax Tree — T-278
 * Port of CEC/native/syntax_tree.py (419L)
 */

export enum NodeType {
  ROOT='root', SENTENCE='sentence', NOUN_PHRASE='noun_phrase',
  VERB_PHRASE='verb_phrase', CLAUSE='clause', NOUN='noun', VERB='verb',
  ADJECTIVE='adjective', ADVERB='adverb', PREPOSITION='preposition',
  DETERMINER='determiner', CONJUNCTION='conjunction', ATOM='atom',
  FORMULA='formula', OPERATOR='operator', QUANTIFIER='quantifier',
  DEONTIC='deontic', COGNITIVE='cognitive', TEMPORAL='temporal',
}

export class SyntaxNode {
  readonly children: SyntaxNode[] = [];
  readonly attributes: Record<string,unknown> = {};

  constructor(
    readonly type: NodeType,
    readonly value: string = '',
    readonly span?: [number, number],
  ) {}

  addChild(child: SyntaxNode): void { this.children.push(child); }

  findByType(type: NodeType): SyntaxNode[] {
    const results: SyntaxNode[] = [];
    if (this.type === type) results.push(this);
    for (const child of this.children) results.push(...child.findByType(type));
    return results;
  }

  isLeaf(): boolean { return this.children.length === 0; }

  depth(): number {
    if (this.isLeaf()) return 0;
    return 1 + Math.max(...this.children.map(c => c.depth()));
  }

  toDict(): Record<string,unknown> {
    return {
      type: this.type, value: this.value, span: this.span,
      attributes: this.attributes,
      children: this.children.map(c => c.toDict()),
    };
  }

  toString(): string {
    if (this.isLeaf()) return this.value;
    return `(${this.type} ${this.children.map(c => c.toString()).join(' ')})`;
  }
}

export class SyntaxTree {
  readonly root: SyntaxNode;

  constructor(root?: SyntaxNode) {
    this.root = root ?? new SyntaxNode(NodeType.ROOT);
  }

  insert(node: SyntaxNode, parent?: SyntaxNode): void {
    (parent ?? this.root).addChild(node);
  }

  find(type: NodeType): SyntaxNode[] { return this.root.findByType(type); }

  traverse(visitor: (node: SyntaxNode) => void): void {
    this._traverse(this.root, visitor);
  }

  private _traverse(node: SyntaxNode, visitor: (node: SyntaxNode) => void): void {
    visitor(node);
    for (const child of node.children) this._traverse(child, visitor);
  }

  leaves(): SyntaxNode[] {
    const ls: SyntaxNode[] = [];
    this.traverse(n => { if (n.isLeaf()) ls.push(n); });
    return ls;
  }

  toDict(): Record<string,unknown> { return { root: this.root.toDict() }; }
}
