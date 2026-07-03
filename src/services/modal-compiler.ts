/**
 * Modal Compiler — T-252 (Sprint 56)
 *
 * Port of ipfs_datasets_py/logic/modal/compiler.py (3221L — key API only)
 *
 * Deterministic legal-text → modal IR compiler.
 *
 * The Python original uses spaCy (NLP pipeline), BM25 frame selection,
 * and a full ModalRegistry.  This TypeScript port implements the same
 * public interface using the PatternMatcher + FormulaAnalyzer infrastructure
 * already available in the swissknife runtime.
 */

import { PatternMatcher, PatternType } from './tdfol-nl-patterns';
import { FormulaAnalyzer, FormulaType } from './formula-analyzer';

// ---------------------------------------------------------------------------
// ModalCompilerConfig
// ---------------------------------------------------------------------------

/**
 * Configuration for deterministic modal compilation.
 *
 * TypeScript port of `ModalCompilerConfig` from `modal/compiler.py`.
 */
export interface ModalCompilerConfig {
  parserBackend: 'regex' | 'spacy' | 'legal';
  topKFrames: number;
  frameDomain: string | null;
  frameScoreMargin: number;
  modalFamilyShareMargin: number;
  modalFamilySecondaryShareFloor: number;
  modalPrimaryFamilyMargin: number;
  modalAdaptiveFamilyMargin: number;
}

export function defaultModalCompilerConfig(): ModalCompilerConfig {
  return {
    parserBackend:                    'regex',
    topKFrames:                       3,
    frameDomain:                      null,
    frameScoreMargin:                 0.05,
    modalFamilyShareMargin:           0.34,
    modalFamilySecondaryShareFloor:   0.20,
    modalPrimaryFamilyMargin:         0.15,
    modalAdaptiveFamilyMargin:        0.15,
  };
}

// ---------------------------------------------------------------------------
// ModalCompilationAmbiguity
// ---------------------------------------------------------------------------

/** A compiler-detected ambiguity requiring review or advisor help. */
export interface ModalCompilationAmbiguity {
  ambiguityType: string;
  message: string;
  candidateIds: string[];
  severity: 'review' | 'error' | 'warning';
  metadata: Record<string, unknown>;
}

export function makeAmbiguity(
  ambiguityType: string,
  message: string,
  opts: { candidateIds?: string[]; severity?: ModalCompilationAmbiguity['severity']; metadata?: Record<string, unknown> } = {},
): ModalCompilationAmbiguity {
  return {
    ambiguityType,
    message,
    candidateIds: opts.candidateIds ?? [],
    severity:     opts.severity    ?? 'review',
    metadata:     opts.metadata    ?? {},
  };
}

export function ambiguityToDict(a: ModalCompilationAmbiguity): Record<string, unknown> {
  return { ambiguityType: a.ambiguityType, message: a.message, candidateIds: a.candidateIds, severity: a.severity, metadata: a.metadata };
}

// ---------------------------------------------------------------------------
// ModalIR (lightweight representation)
// ---------------------------------------------------------------------------

/** Lightweight modal IR document — simplified from the Python ModalIRDocument. */
export interface SimpleModalIR {
  documentId: string;
  text: string;
  normalizedText: string;
  modalFamily: string;      // e.g. 'deontic', 'temporal', 'alethic'
  confidence: number;
  operators: string[];
  slots: Record<string, string>;
}

// ---------------------------------------------------------------------------
// ModalCompilationResult
// ---------------------------------------------------------------------------

/** Result of deterministic legal text compilation. */
export interface ModalCompilationResult {
  modalIr: SimpleModalIR;
  parserName: string;
  normalizedText: string;
  frameCandidates: Array<{ frameId: string; score: number }>;
  selectedFrame: string | null;
  ambiguities: ModalCompilationAmbiguity[];
  metadata: Record<string, unknown>;
}

export function compilationResultToDict(r: ModalCompilationResult): Record<string, unknown> {
  return {
    modalIr:        r.modalIr,
    parserName:     r.parserName,
    normalizedText: r.normalizedText,
    frameCandidates: r.frameCandidates,
    selectedFrame:  r.selectedFrame,
    ambiguities:    r.ambiguities.map(ambiguityToDict),
    metadata:       r.metadata,
  };
}

// ---------------------------------------------------------------------------
// Frame detection helpers
// ---------------------------------------------------------------------------

const FRAME_KEYWORDS: Record<string, string[]> = {
  deontic:   ['must', 'shall', 'may', 'obligated', 'permitted', 'forbidden', 'prohibited'],
  temporal:  ['always', 'eventually', 'until', 'after', 'before', 'while', 'within'],
  alethic:   ['necessarily', 'possibly', 'certainly', 'inevitably'],
  epistemic: ['knows', 'believes', 'is aware', 'is certain'],
  conditional: ['if', 'when', 'provided that', 'unless'],
};

function detectModalFamily(text: string): { family: string; score: number }[] {
  const lower = text.toLowerCase();
  const scores: { family: string; score: number }[] = [];
  for (const [family, keywords] of Object.entries(FRAME_KEYWORDS)) {
    const hits = keywords.filter(k => lower.includes(k)).length;
    if (hits > 0) scores.push({ family, score: hits / keywords.length });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/[""'']/g, '"').trim();
}

// ---------------------------------------------------------------------------
// DeterministicModalCompiler
// ---------------------------------------------------------------------------

export interface CompilerStats {
  totalCompiled: number;
  withAmbiguities: number;
  avgConfidence: number;
}

/**
 * Compile legal text into modal IR with explainable frame selection.
 *
 * TypeScript port of `DeterministicModalCompiler` from
 * `ipfs_datasets_py/logic/modal/compiler.py`.
 *
 * Replaces spaCy/BM25 internals with PatternMatcher + FormulaAnalyzer.
 */
export class DeterministicModalCompiler {
  private readonly config: ModalCompilerConfig;
  private readonly matcher = new PatternMatcher();
  private readonly analyzer = new FormulaAnalyzer();
  private readonly stats: CompilerStats = { totalCompiled: 0, withAmbiguities: 0, avgConfidence: 0 };

  constructor(config?: Partial<ModalCompilerConfig>) {
    this.config = { ...defaultModalCompilerConfig(), ...config };
  }

  /**
   * Compile a single text string into a `ModalCompilationResult`.
   */
  compile(
    text: string,
    opts: { documentId?: string; citation?: string; source?: string } = {},
  ): ModalCompilationResult {
    this.stats.totalCompiled++;
    const normalized = normalizeText(text);
    const ambiguities: ModalCompilationAmbiguity[] = [];

    // Detect modal family via keyword scoring
    const familyScores = detectModalFamily(normalized);
    const topFrames = familyScores.slice(0, this.config.topKFrames).map(fs => ({
      frameId: fs.family,
      score: fs.score,
    }));

    // Handle ambiguity: two top frames within score margin
    let selectedFrame: string | null = topFrames[0]?.frameId ?? null;
    if (topFrames.length >= 2) {
      const margin = topFrames[0].score - topFrames[1].score;
      if (margin < this.config.frameScoreMargin) {
        ambiguities.push(makeAmbiguity(
          'ambiguous_modal_family',
          `Frames '${topFrames[0].frameId}' and '${topFrames[1].frameId}' are within margin (${margin.toFixed(3)} < ${this.config.frameScoreMargin})`,
          { candidateIds: [topFrames[0].frameId, topFrames[1].frameId], severity: 'review' },
        ));
      }
    }

    // Extract operators and entities via PatternMatcher
    const matches = this.matcher.match(text);
    const operators: string[] = [...new Set(matches.map(m => m.pattern.type))];
    const slots: Record<string, string> = {};
    for (const m of matches.slice(0, 3)) {
      if (m.entities['agent'])  slots['agent']  = m.entities['agent'];
      if (m.entities['action']) slots['action'] = m.entities['action'];
    }

    // Confidence: average of top frame score + pattern match density
    const patternDensity = Math.min(1, matches.length / 5);
    const confidence = familyScores.length > 0
      ? (familyScores[0].score + patternDensity) / 2
      : patternDensity * 0.5;

    if (ambiguities.length > 0) this.stats.withAmbiguities++;
    this.stats.avgConfidence =
      ((this.stats.totalCompiled - 1) * this.stats.avgConfidence + confidence) / this.stats.totalCompiled;

    const modalIr: SimpleModalIR = {
      documentId:    opts.documentId ?? `doc-${Date.now()}`,
      text:          text,
      normalizedText: normalized,
      modalFamily:   selectedFrame ?? 'unknown',
      confidence,
      operators,
      slots,
    };

    return {
      modalIr,
      parserName:    this.config.parserBackend,
      normalizedText: normalized,
      frameCandidates: topFrames,
      selectedFrame,
      ambiguities,
      metadata: {
        documentId: opts.documentId,
        citation:   opts.citation,
        source:     opts.source ?? 'legal_text',
        matchCount: matches.length,
      },
    };
  }

  /** Compile multiple texts. */
  compileAll(texts: string[]): ModalCompilationResult[] {
    return texts.map(t => this.compile(t));
  }

  getStats(): Readonly<CompilerStats> { return { ...this.stats }; }
}
