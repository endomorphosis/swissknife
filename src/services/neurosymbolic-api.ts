/**
 * neurosymbolic-api.ts
 *
 * Unified neurosymbolic reasoning API.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/symbolic/neurosymbolic_api.py
 *
 * Provides:
 *   ReasoningCapabilities — static description of rule/prover counts
 *   NeurosymbolicProofResult — outcome of a prove() call
 *   NeurosymbolicReasoner — main entry point for neurosymbolic reasoning
 *   getReasoner() — module-level singleton
 */

// ---------------------------------------------------------------------------
// ReasoningCapabilities
// ---------------------------------------------------------------------------

export interface ReasoningCapabilities {
  tdfolRules: number;
  cecRules: number;
  totalRules: number;
  modalProvers: string[];
  grammarAvailable: boolean;
  shadowproverAvailable: boolean;
}

export const DEFAULT_CAPABILITIES: ReasoningCapabilities = {
  tdfolRules: 40,
  cecRules: 87,
  totalRules: 127,
  modalProvers: ['K', 'S4', 'S5', 'D', 'CognitiveCalculus'],
  grammarAvailable: false,
  shadowproverAvailable: false,
};

// ---------------------------------------------------------------------------
// NeurosymbolicProofResult
// ---------------------------------------------------------------------------

export interface NeurosymbolicProofResult {
  formula: string;
  proved: boolean;
  method: string;
  confidence: number;
  steps: string[];
  timeMs: number;
  explanation?: string;
}

// ---------------------------------------------------------------------------
// Knowledge base entry
// ---------------------------------------------------------------------------

interface KnowledgeEntry {
  text: string;
  formula: string;
  addedAt: number;
}

// ---------------------------------------------------------------------------
// Simple formula parser (heuristic)
// ---------------------------------------------------------------------------

const OBLIGATION_RE = /\b(must|shall|required to|obligated to)\b/i;
const PERMISSION_RE = /\b(may|permitted to|allowed to)\b/i;
const PROHIBITION_RE = /\b(shall not|must not|prohibited|forbidden)\b/i;
const CAUSAL_RE = /\b(causes|implies|leads to|therefore)\b/i;

function textToFormula(text: string): string {
  const t = text.trim();
  if (PROHIBITION_RE.test(t)) return `F(${t.slice(0, 40)})`;
  if (PERMISSION_RE.test(t)) return `P(${t.slice(0, 40)})`;
  if (OBLIGATION_RE.test(t)) return `O(${t.slice(0, 40)})`;
  if (CAUSAL_RE.test(t)) {
    const [ant, , cons] = t.split(/causes|implies|therefore/i);
    return `(${(ant ?? t).trim().slice(0, 25)} → ${(cons ?? t).trim().slice(0, 25)})`;
  }
  return t.slice(0, 60);
}

// ---------------------------------------------------------------------------
// NeurosymbolicReasoner
// ---------------------------------------------------------------------------

export class NeurosymbolicReasoner {
  private kb: KnowledgeEntry[] = [];
  private stats = { proveAttempts: 0, proved: 0, failed: 0 };
  private capabilities: ReasoningCapabilities;

  constructor(capabilities: ReasoningCapabilities = DEFAULT_CAPABILITIES) {
    this.capabilities = { ...capabilities };
  }

  getCapabilities(): ReasoningCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Add a piece of knowledge (natural language or formula) to the KB.
   */
  addKnowledge(text: string): string {
    const formula = textToFormula(text);
    this.kb.push({ text, formula, addedAt: Date.now() });
    return formula;
  }

  /** Return all knowledge base entries as formula strings. */
  listKnowledge(): string[] {
    return this.kb.map(e => e.formula);
  }

  /**
   * Parse text to extract a canonical formula string.
   */
  parse(text: string): string {
    return textToFormula(text);
  }

  /**
   * Attempt to prove `formula` using the KB + basic inference.
   */
  prove(formula: string): NeurosymbolicProofResult {
    const t0 = performance.now();
    this.stats.proveAttempts++;
    const formulaTrim = formula.trim();

    // 1. Direct KB lookup
    for (const entry of this.kb) {
      if (entry.formula === formulaTrim || entry.text === formulaTrim) {
        this.stats.proved++;
        return {
          formula: formulaTrim, proved: true, method: 'kb_lookup', confidence: 0.95,
          steps: [`Found in KB: "${entry.text.slice(0, 40)}"`],
          timeMs: performance.now() - t0,
        };
      }
    }

    // 2. Modus ponens: if P→Q in KB and P in KB, conclude Q
    for (const e1 of this.kb) {
      const impMatch = e1.formula.match(/^\((.+) → (.+)\)$/);
      if (!impMatch) continue;
      const [, ant, cons] = impMatch;
      if (cons.trim() === formulaTrim) {
        for (const e2 of this.kb) {
          if (e2.formula.trim() === ant.trim()) {
            this.stats.proved++;
            return {
              formula: formulaTrim, proved: true, method: 'modus_ponens', confidence: 0.85,
              steps: [`Premise: ${e2.formula}`, `Rule: ${e1.formula}`, `Conclusion: ${formulaTrim}`],
              timeMs: performance.now() - t0,
            };
          }
        }
      }
    }

    this.stats.failed++;
    return {
      formula: formulaTrim, proved: false, method: 'exhausted', confidence: 0,
      steps: [], timeMs: performance.now() - t0,
      explanation: `Cannot prove "${formulaTrim.slice(0, 40)}" from ${this.kb.length} KB entries`,
    };
  }

  /**
   * Explain a formula in natural language.
   */
  explain(formula: string): string {
    if (formula.startsWith('O(')) return `It is obligatory that: ${formula.slice(2, -1)}`;
    if (formula.startsWith('P(')) return `It is permitted that: ${formula.slice(2, -1)}`;
    if (formula.startsWith('F(')) return `It is forbidden that: ${formula.slice(2, -1)}`;
    if (formula.includes('→')) return `If the antecedent holds, then: ${formula}`;
    return `Formula: ${formula}`;
  }

  getStats(): Record<string, unknown> {
    return {
      kb_size: this.kb.length,
      prove_attempts: this.stats.proveAttempts,
      proved: this.stats.proved,
      failed: this.stats.failed,
      success_rate: this.stats.proveAttempts > 0 ? this.stats.proved / this.stats.proveAttempts : 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _reasoner: NeurosymbolicReasoner | null = null;

export function getReasoner(): NeurosymbolicReasoner {
  if (!_reasoner) _reasoner = new NeurosymbolicReasoner();
  return _reasoner;
}

export function resetReasoner(): void {
  _reasoner = null;
}
