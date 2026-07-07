/**
 * CEC Grammar Engine — T-270
 * Port of CEC/native/grammar_engine.py (437L)
 */

export enum Category {
  UTTERANCE = 'Utterance', SENTENCE = 'Sentence',
  BOOLEAN = 'Boolean', CLAUSE = 'Cl',
  AGENT = 'Agent', ACTION_TYPE = 'ActionType', EVENT = 'Event',
  MOMENT = 'Moment', FLUENT = 'Fluent', CLASS = 'Class',
  DOMAIN = 'Dom', ENTITY = 'Entity', OBJECT = 'Object',
  QUERY = 'Query',
  NOUN_PHRASE = 'NP', VERB_PHRASE = 'VP', NOUN = 'N', VERB = 'V',
  ADJECTIVE = 'A', ADVERB = 'Adv', PREPOSITION = 'Prep',
  DETERMINER = 'Det', CONJUNCTION = 'Conj',
}

export interface GrammarRule {
  name: string;
  category: Category;
  constituents: Category[];
  semanticFn: (values: unknown[]) => unknown;
  linearizeFn?: (value: unknown) => string;
}

export interface LexicalEntry {
  word: string;
  category: Category;
  semantics: unknown;
  features?: Record<string, unknown>;
}

export interface ParseNode {
  category: Category;
  word?: string;
  children?: ParseNode[];
  semantics?: unknown;
}

export class GrammarEngine {
  private readonly rules: GrammarRule[] = [];
  private readonly lexicon = new Map<string, LexicalEntry[]>();

  addRule(rule: GrammarRule): void { this.rules.push(rule); }

  addLexicalEntry(entry: LexicalEntry): void {
    const key = entry.word.toLowerCase();
    const existing = this.lexicon.get(key) ?? [];
    existing.push(entry);
    this.lexicon.set(key, existing);
  }

  parse(text: string): ParseNode[] {
    const tokens = text.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    return tokens.map(tok => {
      const entries = this.lexicon.get(tok) ?? [];
      if (entries.length > 0) {
        return { category: entries[0].category, word: tok, semantics: entries[0].semantics };
      }
      return { category: Category.ENTITY, word: tok };
    });
  }

  lookupWord(word: string): LexicalEntry[] {
    return this.lexicon.get(word.toLowerCase()) ?? [];
  }

  getCategories(): Category[] { return Object.values(Category); }
  getRules(): GrammarRule[] { return this.rules; }
}

export class CompositeGrammar {
  private readonly engines: GrammarEngine[] = [];

  addGrammar(engine: GrammarEngine): void { this.engines.push(engine); }

  lookup(word: string): LexicalEntry[] {
    for (const e of this.engines) {
      const r = e.lookupWord(word);
      if (r.length > 0) return r;
    }
    return [];
  }

  parse(text: string): ParseNode[] {
    return this.engines[0]?.parse(text) ?? [];
  }
}

export function makeBinaryRule(name: string, cat: Category, left: Category, right: Category, fn: (l: unknown, r: unknown) => unknown): GrammarRule {
  return { name, category: cat, constituents: [left, right], semanticFn: ([l, r]) => fn(l, r) };
}

export function makeUnaryRule(name: string, cat: Category, child: Category, fn: (v: unknown) => unknown): GrammarRule {
  return { name, category: cat, constituents: [child], semanticFn: ([v]) => fn(v) };
}
