/**
 * TDFOL NL LLM Prompt Builder — T-211
 *
 * Port of ipfs_datasets_py/logic/TDFOL/nl/llm.py
 *
 * Provides:
 *  - Prompt-builder functions for NL → TDFOL LLM conversion
 *  - `LLMParseResult` data class
 *  - `LLMResponseCache` — CID-keyed in-memory cache with LRU eviction
 */

import { sha256Hex } from '../../shared/shared-browser-crypto.js';

// ---------------------------------------------------------------------------
// System prompt templates
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert logician specialising in Temporal Deontic First-Order Logic (TDFOL).
Your task is to convert natural language legal or policy text into well-formed TDFOL formulas.

TDFOL operators:
- ∀x (forall x)          — universal quantification
- ∃x (exists x)          — existential quantification
- □φ (always φ)           — temporal necessity (G in LTL)
- ◊φ (eventually φ)       — temporal possibility (F in LTL)
- O(φ)   — obligation: it is obligatory that φ
- P(φ)   — permission: it is permitted that φ
- F(φ)   — prohibition: it is forbidden that φ
- →       — implication
- ∧ / ∨  — conjunction / disjunction
- ¬       — negation

Convert the user's input accurately and concisely.`;

const VALIDATION_PROMPT = `You are a TDFOL formula validator. Verify that the following formula is syntactically correct and semantically meaningful in TDFOL. Respond with "VALID" if the formula is correct, or explain any errors.`;

const ERROR_CORRECTION_PROMPT = `You are a TDFOL formula corrector. The following formula has errors:

Formula: {formula}
Errors:
{errors}

Please correct the formula and return only the corrected TDFOL formula.`;

const OPERATOR_PROMPTS: Record<string, string> = {
  universal:           '- Universal quantification: ∀x.P(x) — for all x, P holds',
  existential:         '- Existential quantification: ∃x.P(x) — there exists x such that P holds',
  obligation:          '- Obligation: O(pay(alice, bob)) — it is obligatory that alice pays bob',
  permission:          '- Permission: P(access(user, resource)) — it is permitted to access',
  forbidden:           '- Prohibition: F(disclose(party, data)) — it is forbidden to disclose',
  temporal_always:     '- Always: □P — P holds at all future times',
  temporal_eventually: '- Eventually: ◊P — P will hold at some future time',
};

const FEW_SHOT_EXAMPLES: Record<string, Array<{ input: string; output: string }>> = {
  basic: [
    { input: 'All contractors must pay taxes.',                 output: '∀x.Contractor(x) → O(pay(x, taxes))' },
    { input: 'Employees may take sick leave.',                  output: '∀x.Employee(x) → P(takeSickLeave(x))' },
    { input: 'No party shall disclose confidential data.',      output: '∀x.Party(x) → F(disclose(x, confidentialData))' },
  ],
  intermediate: [
    { input: 'If a contractor fails to pay, the contract is terminated.',
      output: '∀x.(Contractor(x) ∧ ¬pays(x)) → terminated(contract)' },
    { input: 'Employees must always submit reports on time.',
      output: '∀x.Employee(x) → □O(submitReport(x, onTime))' },
  ],
  advanced: [
    { input: 'Eventually, all outstanding payments must be settled.',
      output: '◊(∀x.Outstanding(x) → O(settle(x)))' },
    { input: 'If knowledge of breach occurs, the party must immediately notify.',
      output: '∀x.(Party(x) ∧ knows(x, breach)) → O(notify(x, immediately))' },
  ],
};

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

/**
 * Build a complete prompt for NL → TDFOL LLM conversion.
 *
 * @param text              Natural language text to convert.
 * @param includeExamples   Include few-shot examples (default true).
 * @param complexity        Example complexity `'basic'|'intermediate'|'advanced'`.
 * @param operatorHints     Optional list of operator hint keys.
 */
export function buildConversionPrompt(
  text: string,
  includeExamples = true,
  complexity: 'basic' | 'intermediate' | 'advanced' = 'basic',
  operatorHints?: string[],
): string {
  const parts: string[] = [SYSTEM_PROMPT, ''];

  if (operatorHints && operatorHints.length > 0) {
    parts.push('Relevant operators:');
    for (const hint of operatorHints) {
      if (hint in OPERATOR_PROMPTS) parts.push(OPERATOR_PROMPTS[hint]);
    }
    parts.push('');
  }

  if (includeExamples) {
    const examples = FEW_SHOT_EXAMPLES[complexity] ?? FEW_SHOT_EXAMPLES['basic'];
    parts.push('Examples:');
    for (const ex of examples) {
      parts.push(`Input: ${ex.input}`);
      parts.push(`Output: ${ex.output}`);
      parts.push('');
    }
  }

  parts.push('Now convert this text to TDFOL:');
  parts.push(`Input: ${text}`);
  parts.push('Output:');

  return parts.join('\n');
}

/** Build a prompt for formula validation. */
export function buildValidationPrompt(formula: string): string {
  return `${VALIDATION_PROMPT}\n\nFormula: ${formula}`;
}

/** Build a prompt for error correction. */
export function buildErrorCorrectionPrompt(formula: string, errors: string[]): string {
  const errorList = errors.map(e => `- ${e}`).join('\n');
  return ERROR_CORRECTION_PROMPT
    .replace('{formula}', formula)
    .replace('{errors}', errorList);
}

/**
 * Analyse text and return relevant operator hint keys.
 *
 * @example
 * getOperatorHintsForText('All employees must submit reports')
 * // → ['universal', 'obligation']
 */
export function getOperatorHintsForText(text: string): string[] {
  const lower = text.toLowerCase();
  const hints: string[] = [];

  if (/\b(all|every|each)\b/.test(lower))                           hints.push('universal');
  if (/\b(some|exists|there is)\b/.test(lower))                     hints.push('existential');
  if (/\b(must|required|shall|obligated)\b/.test(lower))            hints.push('obligation');
  if (/\b(may|allowed|can|permitted)\b/.test(lower))                hints.push('permission');
  if (/\b(must not|prohibited|forbidden|shall not)\b/.test(lower))  hints.push('forbidden');
  if (/\b(always|perpetually|forever)\b/.test(lower))               hints.push('temporal_always');
  if (/\b(eventually|someday|will)\b/.test(lower))                  hints.push('temporal_eventually');

  return hints;
}

// ---------------------------------------------------------------------------
// LLMParseResult
// ---------------------------------------------------------------------------

/** Result from LLM-enhanced NL→TDFOL parsing. */
export interface LLMParseResult {
  success: boolean;
  formula: string;
  confidence: number; // [0, 1]
  method: 'pattern' | 'llm' | 'hybrid' | 'unknown';
  parseTimeMs: number;
  llmProvider: string | null;
  cacheHit: boolean;
  errors: string[];
  metadata: Record<string, unknown>;
}

export function makeLLMParseResult(partial: Partial<LLMParseResult> = {}): LLMParseResult {
  return {
    success: false,
    formula: '',
    confidence: 0,
    method: 'unknown',
    parseTimeMs: 0,
    llmProvider: null,
    cacheHit: false,
    errors: [],
    metadata: {},
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// LLMResponseCache
// ---------------------------------------------------------------------------

interface CacheEntry {
  formula: string;
  confidence: number;
  insertedAt: number;
}

/**
 * In-memory LRU cache for LLM responses.
 *
 * Keys are SHA-256 content hashes (hex) of the {text, provider, promptHash}
 * tuple — mirroring the CIDv1 approach used in the Python original.
 * (Real CID generation requires a WASM multiformats library; this port
 * uses the Web Crypto API SHA-256 as a sufficient substitute.)
 *
 * TypeScript port of `LLMResponseCache` from
 * `ipfs_datasets_py/logic/TDFOL/nl/llm.py`.
 */
export class LLMResponseCache {
  private readonly store = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;

  constructor(private readonly maxSize = 1_000) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Look up a cached response.
   *
   * @returns `{formula, confidence}` or `null` on miss.
   */
  async get(text: string, provider: string, promptHash: string): Promise<{ formula: string; confidence: number } | null> {
    const key = await this._makeKey(text, provider, promptHash);
    const entry = this.store.get(key);
    if (entry) {
      this.hits++;
      return { formula: entry.formula, confidence: entry.confidence };
    }
    this.misses++;
    return null;
  }

  /** Store a formula+confidence pair. Evicts the oldest entry when full. */
  async put(text: string, provider: string, promptHash: string, formula: string, confidence: number): Promise<void> {
    const key = await this._makeKey(text, provider, promptHash);
    if (this.store.size >= this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(key, { formula, confidence, insertedAt: Date.now() });
  }

  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  get size(): number { return this.store.size; }

  stats(): Record<string, number> {
    const total = this.hits + this.misses;
    return {
      size: this.store.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async _makeKey(text: string, provider: string, promptHash: string): Promise<string> {
    const payload = JSON.stringify({ text, provider, promptHash, version: '1.0' });
    return `sha256-${sha256Hex(payload)}`;
  }
}
