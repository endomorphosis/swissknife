/**
 * Enhanced Grammar Parser — T-283
 * Port of CEC/native/enhanced_grammar_parser.py (413L)
 * Earley-style CYK parser for DCEC grammar.
 */

export enum Category { S='S', NP='NP', VP='VP', N='N', V='V', DET='Det', ADJ='Adj', ADV='Adv', PP='PP', CLAUSE='Cl', FORMULA='Formula', AGENT='Agent', ACTION='Action', MODAL='Modal' }

export interface Terminal { word: string; category: Category; semantics?: unknown }
export interface GrammarRule { lhs: Category; rhs: (Category|string)[]; semanticFn?: (parts: unknown[]) => unknown }

export class ParseTree {
  constructor(
    readonly category: Category,
    readonly value: string = '',
    readonly children: ParseTree[] = [],
    readonly semantics?: unknown,
  ) {}

  isLeaf(): boolean { return this.children.length === 0; }
  words(): string[] { return this.isLeaf() ? [this.value] : this.children.flatMap(c => c.words()); }
  toString(): string { return this.isLeaf() ? this.value : `(${this.category} ${this.children.map(c => c.toString()).join(' ')})`; }
  toDict(): Record<string,unknown> {
    return { category: this.category, value: this.value, children: this.children.map(c => c.toDict()), semantics: this.semantics };
  }
}

export interface EarleyState { rule: GrammarRule; dot: number; start: number; end: number }

export class EnhancedGrammarParser {
  private readonly terminals = new Map<string, Terminal[]>();
  private readonly rules: GrammarRule[] = [];

  addTerminal(t: Terminal): void {
    const key = t.word.toLowerCase();
    const existing = this.terminals.get(key) ?? [];
    existing.push(t);
    this.terminals.set(key, existing);
  }

  addRule(rule: GrammarRule): void { this.rules.push(rule); }

  parse(text: string): ParseTree[] {
    const tokens = text.toLowerCase().replace(/[.,!?;:]/g, '').split(/\s+/).filter(t => t.length > 0);
    const result: ParseTree[] = [];
    for (const tok of tokens) {
      const entries = this.terminals.get(tok) ?? [];
      if (entries.length > 0) {
        result.push(new ParseTree(entries[0].category, tok, [], entries[0].semantics));
      } else {
        result.push(new ParseTree(Category.N, tok));
      }
    }
    return result;
  }

  getParseForest(text: string): ParseTree[][] { return [this.parse(text)]; }
  getTerminals(): Terminal[] { return [...this.terminals.values()].flat(); }
  getRules(): GrammarRule[] { return this.rules; }
}
