/**
 * I18NConflictReport — multi-language normative conflict detection report.
 *
 * Mirrors ipfs_datasets_py/logic/api.py §I18NConflictReport + detect_all_languages().
 *
 * Collects normative conflicts detected across multiple language variants of the
 * same legal text (e.g. EN/FR/DE versions of an EU regulation).
 *
 * Sprint 20, T-104.
 * Reference: ipfs_datasets_py/logic/api.py §I18NConflictReport
 */

import { DeonticTextAnalyzer } from '../../deontic/deontic-text-analyzer.js';
import type { DeonticConflict } from '../../deontic/deontic-text-analyzer.js';

// ---------------------------------------------------------------------------
// I18NConflictReport
// ---------------------------------------------------------------------------

/**
 * Multi-language conflict detection report.
 *
 * Tracks normative conflicts (`DeonticConflict`) found in each language variant
 * of a legal text.  Provides summary properties and JSON export.
 *
 * Python ref: `I18NConflictReport` in api.py.
 */
export class I18NConflictReport {
  /**
   * Map from ISO 639-1 language code → list of conflicts found in that language.
   * e.g. `{ 'en': [...], 'fr': [...], 'de': [] }`
   */
  readonly byLanguage: Map<string, DeonticConflict[]>;

  constructor(initial: Record<string, DeonticConflict[]> = {}) {
    this.byLanguage = new Map(Object.entries(initial));
  }

  /** Add conflicts for a language (merges with existing). */
  addConflicts(lang: string, conflicts: DeonticConflict[]): void {
    const existing = this.byLanguage.get(lang) ?? [];
    this.byLanguage.set(lang, [...existing, ...conflicts]);
  }

  // ---------------------------------------------------------------------------
  // Properties
  // ---------------------------------------------------------------------------

  /** Total number of conflicts across all languages. */
  get totalConflicts(): number {
    return [...this.byLanguage.values()].reduce((s, c) => s + c.length, 0);
  }

  /** Languages that produced at least one conflict. */
  get languagesWithConflicts(): string[] {
    return [...this.byLanguage.entries()]
      .filter(([, c]) => c.length > 0)
      .map(([lang]) => lang)
      .sort();
  }

  /** Language with the highest conflict count; null if no conflicts. */
  mostConflictedLanguage(): string | null {
    let best: string | null = null;
    let bestCount = 0;
    for (const [lang, conflicts] of this.byLanguage) {
      if (conflicts.length > bestCount) {
        best = lang;
        bestCount = conflicts.length;
      }
    }
    return best;
  }

  /** Language with the lowest non-zero conflict count; null if no conflicts. */
  leastConflictedLanguage(): string | null {
    let best: string | null = null;
    let bestCount = Infinity;
    for (const [lang, conflicts] of this.byLanguage) {
      if (conflicts.length > 0 && conflicts.length < bestCount) {
        best = lang;
        bestCount = conflicts.length;
      }
    }
    return best;
  }

  /** Average conflicts per language slot. */
  conflictDensity(): number {
    const n = this.byLanguage.size;
    return n === 0 ? 0 : this.totalConflicts / n;
  }

  /** Whether any language has conflicts. */
  hasConflicts(): boolean {
    return this.totalConflicts > 0;
  }

  // ---------------------------------------------------------------------------
  // Serialisation
  // ---------------------------------------------------------------------------

  toDict(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [lang, conflicts] of this.byLanguage) {
      result[lang] = conflicts;
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// detectMultilingualConflicts
// ---------------------------------------------------------------------------

/**
 * Detect normative conflicts across multiple language variants of legal texts.
 *
 * @param texts  Map from ISO 639-1 language code to the legal text for that language.
 * @param analyzer Optional `DeonticTextAnalyzer` instance (created if not provided).
 * @returns `I18NConflictReport` with per-language conflict lists.
 */
export function detectMultilingualConflicts(
  texts: Map<string, string>,
  analyzer?: DeonticTextAnalyzer,
): I18NConflictReport {
  const a = analyzer ?? new DeonticTextAnalyzer();
  const report = new I18NConflictReport();

  for (const [lang, text] of texts) {
    const statements = a.extractStatements(text, undefined, lang);
    const conflicts  = a.detectConflicts(statements);
    report.addConflicts(lang, conflicts);
  }

  return report;
}
