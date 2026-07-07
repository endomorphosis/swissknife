/**
 * Proof Storage and Problem Parsers
 * Ports of: TDFOL/p2p/ipfs_proof_storage.py (346L),
 *           CEC/native/problem_parser.py (346L),
 *           CEC/native/grammar_loader.py (304L)
 */

import { sha256Hex } from '../../shared/browser-crypto.js';

// ---------------------------------------------------------------------------
// T-304a — IPFS Proof Storage (ipfs_proof_storage.py)
// ---------------------------------------------------------------------------

export interface StoredProof {
  cid:       string;
  formula:   string;
  proof:     unknown;
  timestamp: number;
  metadata:  Record<string, unknown>;
}

export interface ProofStorageStats {
  totalStored: number;
  totalRetrieved: number;
  cacheHits: number;
}

export class IPFSProofStorage {
  private readonly _store = new Map<string, StoredProof>();
  private readonly stats: ProofStorageStats = { totalStored: 0, totalRetrieved: 0, cacheHits: 0 };

  private _cid(formula: string, proof: unknown): string {
    const raw = JSON.stringify({ formula, proof });
    try { return 'bafk-' + sha256Hex(raw).slice(0, 32); }
    catch { return 'bafk-' + raw.slice(0, 32).replace(/\W/g, ''); }
  }

  async store(formula: string, proof: unknown, metadata: Record<string, unknown> = {}): Promise<string> {
    const cid = this._cid(formula, proof);
    this._store.set(cid, { cid, formula, proof, timestamp: Date.now(), metadata });
    this.stats.totalStored++;
    return cid;
  }

  async retrieve(cid: string): Promise<StoredProof | null> {
    const p = this._store.get(cid);
    if (p) { this.stats.cacheHits++; return p; }
    this.stats.totalRetrieved++;
    return null;
  }

  async list(): Promise<StoredProof[]> { return [...this._store.values()]; }

  async delete(cid: string): Promise<boolean> { return this._store.delete(cid); }

  getStats(): Readonly<ProofStorageStats> { return { ...this.stats }; }
}

let _defaultStorage: IPFSProofStorage | null = null;
export function getDefaultProofStorage(): IPFSProofStorage {
  if (!_defaultStorage) _defaultStorage = new IPFSProofStorage();
  return _defaultStorage;
}

// ---------------------------------------------------------------------------
// T-304b — Problem Parser (problem_parser.py)
// ---------------------------------------------------------------------------

export interface TPTPFormula { name: string; role: string; formula: string; source?: string }
export interface ProblemFile  { name: string; axioms: TPTPFormula[]; conjectures: TPTPFormula[] }

export class TPTPParser {
  parse(text: string): TPTPFormula[] {
    const formulas: TPTPFormula[] = [];
    // fof(name, role, formula).
    for (const m of text.matchAll(/fof\((\w+),\s*(\w+),\s*([^)]+(?:\([^)]*\)[^)]*)*)\)\./g)) {
      formulas.push({ name: m[1], role: m[2], formula: m[3].trim() });
    }
    // cnf(name, role, formula).
    for (const m of text.matchAll(/cnf\((\w+),\s*(\w+),\s*([^)]+)\)\./g)) {
      formulas.push({ name: m[1], role: m[2], formula: m[3].trim() });
    }
    return formulas;
  }
}

export class ProblemParser {
  private readonly tptp = new TPTPParser();

  parse(text: string): ProblemFile {
    const formulas = this.tptp.parse(text);
    return {
      name:        'problem',
      axioms:      formulas.filter(f => ['axiom', 'hypothesis', 'assumption'].includes(f.role)),
      conjectures: formulas.filter(f => ['conjecture', 'negated_conjecture'].includes(f.role)),
    };
  }

  parseFile(_filepath: string): ProblemFile {
    // In pure-TS without fs we return empty problem
    return { name: _filepath, axioms: [], conjectures: [] };
  }
}

export function parseProblemFile(filepath: string): ProblemFile {
  return new ProblemParser().parseFile(filepath);
}

// ---------------------------------------------------------------------------
// T-304c — Grammar Loader (grammar_loader.py)
// ---------------------------------------------------------------------------

export interface GrammarConfig { language: string; modelName?: string; enableCaching?: boolean; maxCacheSize?: number }
export interface LoadedGrammar  { language: string; lexicon: Record<string, string[]>; rules: string[] }

export class GrammarLoader {
  private readonly cache = new Map<string, LoadedGrammar>();

  constructor(private readonly config: GrammarConfig = { language: 'en' }) {}

  load(language: string): LoadedGrammar {
    const cached = this.cache.get(language);
    if (cached) return cached;

    // Default grammar bundle
    const grammar: LoadedGrammar = {
      language,
      lexicon: {
        obligation:  ['must', 'shall', 'should', 'required', 'obligated'],
        permission:  ['may', 'can', 'allowed', 'permitted'],
        prohibition: ['must not', 'shall not', 'forbidden', 'prohibited'],
        agent:       ['contractor', 'employee', 'party', 'vendor', 'user'],
      },
      rules: [
        'S → NP VP', 'VP → Modal V NP', 'Modal → must|may|shall',
      ],
    };

    this.cache.set(language, grammar);
    return grammar;
  }

  get(language: string): LoadedGrammar | null { return this.cache.get(language) ?? null; }

  clearCache(): void { this.cache.clear(); }
}

let _grammarLoader: GrammarLoader | null = null;
export function getGrammarLoader(configPath?: string): GrammarLoader {
  if (!_grammarLoader) _grammarLoader = new GrammarLoader();
  return _grammarLoader;
}
