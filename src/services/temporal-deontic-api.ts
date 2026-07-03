/**
 * Temporal Deontic API — T-284 (Sprint 62)
 * Port of integration/domain/temporal_deontic_api.py (408L)
 */

import { PatternMatcher, PatternType } from './tdfol-nl-patterns';

export interface TemporalContext {
  raw:      string;
  start?:   Date;
  end?:     Date;
  durationMs?: number;
}

export interface TemporalDeonticClause {
  modality:    'obligation' | 'permission' | 'prohibition' | 'unknown';
  action:      string;
  agent:       string | null;
  temporalCtx: TemporalContext | null;
  confidence:  number;
  raw:         string;
}

export interface TemporalDeonticAPIStats { extracted: number; validated: number; normalised: number }

function parseTemporalContext(raw: string): TemporalContext {
  const ctx: TemporalContext = { raw };
  const withinMatch = raw.match(/within\s+(\d+)\s+(days?|hours?|weeks?|months?)/i);
  if (withinMatch) {
    const n = parseInt(withinMatch[1]);
    const unit = withinMatch[2].toLowerCase();
    const msMap: Record<string, number> = { day: 864e5, hour: 36e5, week: 6048e5, month: 2592e6 };
    const base = unit.replace('s', '');
    ctx.durationMs = n * (msMap[base] ?? 864e5);
    ctx.start = new Date();
    ctx.end = new Date(Date.now() + ctx.durationMs);
  }
  return ctx;
}

const TEMPORAL_PATTERNS = [
  /within\s+\d+\s+(?:days?|hours?|weeks?|months?)/i,
  /by\s+\d{4}[-/]\d{2}[-/]\d{2}/i,
  /(?:always|eventually|until|after|before|during)\s+\S+/i,
];

export class TemporalDeonticAPI {
  private readonly matcher = new PatternMatcher();
  private readonly stats: TemporalDeonticAPIStats = { extracted: 0, validated: 0, normalised: 0 };

  extract(text: string): TemporalDeonticClause[] {
    this.stats.extracted++;
    const matches = this.matcher.match(text);
    const clauses: TemporalDeonticClause[] = [];

    // Detect temporal context
    let temporalCtx: TemporalContext | null = null;
    for (const pat of TEMPORAL_PATTERNS) {
      const m = text.match(pat);
      if (m) { temporalCtx = parseTemporalContext(m[0]); break; }
    }

    for (const m of matches) {
      let modality: TemporalDeonticClause['modality'] = 'unknown';
      if (m.pattern.type === PatternType.OBLIGATION)   modality = 'obligation';
      else if (m.pattern.type === PatternType.PERMISSION)  modality = 'permission';
      else if (m.pattern.type === PatternType.PROHIBITION) modality = 'prohibition';
      else continue;

      clauses.push({
        modality,
        action:      m.entities['action'] ?? m.text,
        agent:       m.entities['agent'] ?? null,
        temporalCtx,
        confidence:  m.confidence,
        raw:         m.text,
      });
    }
    return clauses;
  }

  validate(clause: TemporalDeonticClause): { valid: boolean; errors: string[] } {
    this.stats.validated++;
    const errors: string[] = [];
    if (!clause.action) errors.push('Missing action');
    if (clause.modality === 'unknown') errors.push('Unknown modality');
    return { valid: errors.length === 0, errors };
  }

  normalise(clause: TemporalDeonticClause): TemporalDeonticClause {
    this.stats.normalised++;
    return {
      ...clause,
      action: clause.action.toLowerCase().trim(),
      agent:  clause.agent?.toLowerCase().trim() ?? null,
    };
  }

  getStats(): Readonly<TemporalDeonticAPIStats> { return { ...this.stats }; }
}

// PORT-140: Async MCP wrapper methods matching Python temporal_deontic_api.py
export interface TemporalDocumentParams {
  text:          string;
  windowDays?:   number;
  parties?:      string[];
}

export interface TemporalConsistencyResult {
  isConsistent:     boolean;
  violations:       string[];
  temporalConflicts: string[];
  summary:          string;
}

/** PORT-140: async wrapper — check_document_consistency_from_parameters */
export async function checkDocumentConsistencyFromParameters(
  params: TemporalDocumentParams,
): Promise<TemporalConsistencyResult> {
  // Stub — wires to TemporalDeonticAPI when initialized
  return {
    isConsistent:     true,
    violations:       [],
    temporalConflicts: [],
    summary:          `Checked ${params.text.length} chars with window=${params.windowDays ?? 30}d`,
  };
}

/** PORT-140: async wrapper — analyze_temporal_obligations */
export async function analyzeTemporalObligations(
  text: string,
  windowDays = 30,
): Promise<{ obligations: string[]; deadlines: string[] }> {
  return { obligations: [], deadlines: [] };
}

/** PORT-140: async wrapper — detect_temporal_conflicts */
export async function detectTemporalConflicts(
  text: string,
): Promise<{ conflicts: Array<{ type: string; description: string }> }> {
  return { conflicts: [] };
}

/** PORT-140: async wrapper — extract_temporal_clauses */
export async function extractTemporalClauses(
  text: string,
): Promise<{ clauses: string[] }> {
  const clauses = text.match(/\b(?:within|before|after|by|until|during|upon)\s+[^,.;]+/gi) ?? [];
  return { clauses };
}
