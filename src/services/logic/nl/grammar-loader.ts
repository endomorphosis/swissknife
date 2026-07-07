/**
 * CEC Grammar Loader — PORT-177
 *
 * Port of ipfs_datasets_py/logic/CEC/native/grammar_loader.py.
 *
 * Dedicated data-driven grammar loader for DCEC/NL grammars. This keeps
 * default grammars available in code while allowing callers to register or
 * load JSON grammar bundles at runtime.
 */

export interface GrammarConfig {
  language: string;
  enableCaching?: boolean;
  maxCacheSize?: number;
}

export interface GrammarRule {
  lhs: string;
  rhs: string[];
  raw: string;
}

export interface LoadedGrammar {
  language: string;
  lexicon: Record<string, string[]>;
  rules: string[];
  parsedRules: GrammarRule[];
  metadata: Record<string, unknown>;
}

export class GrammarLoader {
  private readonly cache = new Map<string, LoadedGrammar>();

  constructor(private readonly config: GrammarConfig = { language: 'en', enableCaching: true, maxCacheSize: 32 }) {}

  load(language = this.config.language): LoadedGrammar {
    const cached = this.cache.get(language);
    if (cached) return cached;

    const grammar = defaultGrammar(language);
    this.putCache(language, grammar);
    return grammar;
  }

  loadFromObject(grammar: Omit<LoadedGrammar, 'parsedRules'> & { parsedRules?: GrammarRule[] }): LoadedGrammar {
    const loaded: LoadedGrammar = {
      language: grammar.language,
      lexicon: normalizeLexicon(grammar.lexicon),
      rules: [...grammar.rules],
      parsedRules: grammar.parsedRules ?? grammar.rules.map(parseGrammarRule),
      metadata: { ...grammar.metadata },
    };
    this.validate(loaded);
    this.putCache(loaded.language, loaded);
    return loaded;
  }

  loadFromJson(json: string): LoadedGrammar {
    const parsed = JSON.parse(json) as Omit<LoadedGrammar, 'parsedRules'> & { parsedRules?: GrammarRule[] };
    return this.loadFromObject(parsed);
  }

  registerGrammar(grammar: Omit<LoadedGrammar, 'parsedRules'> & { parsedRules?: GrammarRule[] }): LoadedGrammar {
    return this.loadFromObject(grammar);
  }

  get(language: string): LoadedGrammar | null {
    return this.cache.get(language) ?? null;
  }

  validate(grammar: LoadedGrammar): boolean {
    if (!grammar.language.trim()) throw new Error('Grammar language is required');
    if (!grammar.rules.length) throw new Error(`Grammar ${grammar.language} has no rules`);
    for (const [category, values] of Object.entries(grammar.lexicon)) {
      if (!Array.isArray(values)) throw new Error(`Lexicon category ${category} must be a list`);
    }
    for (const rule of grammar.parsedRules) {
      if (!rule.lhs || rule.rhs.length === 0) throw new Error(`Invalid grammar rule: ${rule.raw}`);
    }
    return true;
  }

  clearCache(): void {
    this.cache.clear();
  }

  listLanguages(): string[] {
    return Array.from(this.cache.keys()).sort();
  }

  private putCache(language: string, grammar: LoadedGrammar): void {
    if (this.config.enableCaching === false) return;
    const max = this.config.maxCacheSize ?? 32;
    if (this.cache.size >= max) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(language, grammar);
  }
}

let defaultLoader: GrammarLoader | null = null;

export function getGrammarLoader(config?: GrammarConfig): GrammarLoader {
  if (!defaultLoader || config) defaultLoader = new GrammarLoader(config);
  return defaultLoader;
}

export function parseGrammarRule(raw: string): GrammarRule {
  const parts = raw.split(/→|->/);
  if (parts.length !== 2) {
    throw new Error(`Invalid grammar rule: ${raw}`);
  }
  const lhs = parts[0]!.trim();
  const rhs = parts[1]!.split(/\s+/).map(s => s.trim()).filter(Boolean);
  return { lhs, rhs, raw };
}

function defaultGrammar(language: string): LoadedGrammar {
  const lexicon: Record<string, string[]> = {
    obligation: ['must', 'shall', 'should', 'required', 'obligated'],
    permission: ['may', 'can', 'allowed', 'permitted'],
    prohibition: ['must not', 'shall not', 'forbidden', 'prohibited'],
    agent: ['contractor', 'employee', 'party', 'vendor', 'user'],
    action: ['pay', 'deliver', 'disclose', 'retain', 'delete'],
  };

  if (language === 'pt') {
    lexicon.obligation = ['deve', 'deverá', 'é necessário'];
    lexicon.permission = ['pode', 'é permitido', 'tem permissão'];
    lexicon.prohibition = ['não deve', 'não pode', 'é proibido'];
    lexicon.agent = ['contratante', 'empregado', 'titular', 'empresa'];
  }

  const rules = ['S -> NP VP', 'VP -> Modal Verb NP', 'Modal -> obligation permission prohibition'];
  return {
    language,
    lexicon,
    rules,
    parsedRules: rules.map(parseGrammarRule),
    metadata: { source: 'default', port: 'PORT-177' },
  };
}

function normalizeLexicon(lexicon: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(lexicon).map(([key, values]) => [key, Array.from(new Set(values.map(v => v.trim()).filter(Boolean)))]),
  );
}
