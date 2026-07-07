/**
 * deontic-logic-converter.ts
 *
 * Convert legal text / GraphRAG entities to deontic logic formulas.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/converters/deontic_logic_converter.py
 *
 * Provides:
 *   ConversionContext   — options controlling the conversion
 *   ConversionResult    — formulas + ruleSet + stats + errors
 *   DeonticLogicConverter — main converter class
 */

import { LegalDomain } from '../../legal-symbolic-analyzer.js';
import {
  DeonticFormula, DeonticRuleSet, DeonticOp,
  makeDeonticFormula, makeRuleSet,
} from './deontic-query-engine.js';

// ---------------------------------------------------------------------------
// ConversionContext
// ---------------------------------------------------------------------------

export interface ConversionContext {
  sourceDocumentPath: string;
  documentTitle: string;
  legalDomain: LegalDomain | null;
  jurisdiction: string | null;
  confidenceThreshold: number;
  enableTemporalAnalysis: boolean;
  enableAgentInference: boolean;
  enableConditionExtraction: boolean;
  toDict(): Record<string, unknown>;
}

export function makeConversionContext(
  sourceDocumentPath: string,
  opts: Partial<Omit<ConversionContext, 'sourceDocumentPath' | 'toDict'>> = {},
): ConversionContext {
  const ctx = {
    sourceDocumentPath,
    documentTitle: opts.documentTitle ?? '',
    legalDomain: opts.legalDomain ?? null,
    jurisdiction: opts.jurisdiction ?? null,
    confidenceThreshold: opts.confidenceThreshold ?? 0.5,
    enableTemporalAnalysis: opts.enableTemporalAnalysis ?? true,
    enableAgentInference: opts.enableAgentInference ?? true,
    enableConditionExtraction: opts.enableConditionExtraction ?? true,
    toDict() {
      return {
        source_document_path: sourceDocumentPath,
        document_title: ctx.documentTitle,
        legal_domain: ctx.legalDomain,
        jurisdiction: ctx.jurisdiction,
        confidence_threshold: ctx.confidenceThreshold,
        enable_temporal_analysis: ctx.enableTemporalAnalysis,
        enable_agent_inference: ctx.enableAgentInference,
        enable_condition_extraction: ctx.enableConditionExtraction,
      };
    },
  };
  return ctx;
}

// ---------------------------------------------------------------------------
// ConversionResult
// ---------------------------------------------------------------------------

export class ConversionResult {
  readonly deonticFormulas: DeonticFormula[];
  readonly ruleSet: DeonticRuleSet;
  readonly conversionMetadata: Record<string, unknown>;
  readonly errors: string[];
  readonly warnings: string[];
  readonly statistics: Record<string, number>;

  constructor(opts: {
    deonticFormulas: DeonticFormula[];
    ruleSet: DeonticRuleSet;
    conversionMetadata?: Record<string, unknown>;
    errors?: string[];
    warnings?: string[];
    statistics?: Record<string, number>;
  }) {
    this.deonticFormulas = opts.deonticFormulas;
    this.ruleSet = opts.ruleSet;
    this.conversionMetadata = opts.conversionMetadata ?? {};
    this.errors = opts.errors ?? [];
    this.warnings = opts.warnings ?? [];
    this.statistics = opts.statistics ?? {
      total_formulas: opts.deonticFormulas.length,
      obligations: opts.deonticFormulas.filter(f => f.operator === DeonticOp.OBLIGATION).length,
      permissions: opts.deonticFormulas.filter(f => f.operator === DeonticOp.PERMISSION).length,
      prohibitions: opts.deonticFormulas.filter(f => f.operator === DeonticOp.PROHIBITION).length,
    };
  }

  get success(): boolean { return this.errors.length === 0 && this.deonticFormulas.length > 0; }

  toDict(): Record<string, unknown> {
    return {
      deontic_formulas: this.deonticFormulas.map(f => f.toDict()),
      rule_set_name: this.ruleSet.name,
      conversion_metadata: this.conversionMetadata,
      errors: this.errors,
      warnings: this.warnings,
      statistics: this.statistics,
      success: this.success,
    };
  }
}

// ---------------------------------------------------------------------------
// Heuristic pattern helpers (no ML deps)
// ---------------------------------------------------------------------------

const OBLIGATION_RE = /\b(shall|must|is required to|is obligated to|has a duty to|agrees to)\b/i;
const PERMISSION_RE = /\b(may|is permitted to|is allowed to|is authorized to|is entitled to)\b/i;
const PROHIBITION_RE = /\b(shall not|must not|is prohibited from|cannot|is forbidden)\b/i;
const AGENT_RE = /^(?:the\s+)?([A-Za-z][a-zA-Z\s]{2,20}?)(?:\s+(?:shall|must|may|cannot))/i;
const ACTION_RE = /(?:shall|must|may|cannot|is (?:permitted|required|prohibited|forbidden|allowed) to)\s+(?:not\s+)?([a-zA-Z][a-zA-Z\s]{3,40}?)(?:[.,;]|$)/i;

function detectOp(s: string): DeonticOp | null {
  if (PROHIBITION_RE.test(s)) return DeonticOp.PROHIBITION;
  if (PERMISSION_RE.test(s)) return DeonticOp.PERMISSION;
  if (OBLIGATION_RE.test(s)) return DeonticOp.OBLIGATION;
  return null;
}

function extractAgent(s: string): string {
  const m = s.match(AGENT_RE);
  return m ? m[1].trim() : 'Agent';
}

function extractProposition(s: string): string {
  const m = s.match(ACTION_RE);
  return m ? m[1].trim().slice(0, 60) : s.slice(0, 40).trim();
}

// ---------------------------------------------------------------------------
// DeonticLogicConverter
// ---------------------------------------------------------------------------

export class DeonticLogicConverter {
  /**
   * Convert legal text into deontic formulas + a DeonticRuleSet.
   */
  convert(text: string, context?: ConversionContext): ConversionResult {
    const t0 = Date.now();
    const ctx = context ?? makeConversionContext('(inline)');
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!text?.trim()) {
      errors.push('Empty input text');
      return new ConversionResult({ deonticFormulas: [], ruleSet: makeRuleSet('empty'), errors });
    }

    const sentences = text
      .split(/[.;!?]/)
      .map(s => s.trim())
      .filter(s => s.length > 5);

    const formulas: DeonticFormula[] = [];
    for (const sentence of sentences) {
      const op = detectOp(sentence);
      if (!op) continue;

      const agent = ctx.enableAgentInference ? extractAgent(sentence) : 'Agent';
      const proposition = extractProposition(sentence);
      const conditions: string[] = [];

      if (ctx.enableTemporalAnalysis) {
        const temporal = sentence.match(/\b(within \d+ days?|before [A-Z]\w+|after [A-Z]\w+|upon \w+ing)\b/i);
        if (temporal) conditions.push(temporal[0]);
      }

      if (ctx.enableConditionExtraction) {
        const cond = sentence.match(/\b(if|provided that|unless|when|in the event)\b(.{5,40})/i);
        if (cond) conditions.push(cond[0].slice(0, 50).trim());
      }

      const f = makeDeonticFormula(op, agent, proposition, {
        conditions, sourceText: sentence, confidence: 0.8,
      });
      formulas.push(f);
    }

    if (formulas.length === 0) {
      warnings.push('No deontic statements detected in text');
    }

    const ruleSetName = ctx.documentTitle || ctx.sourceDocumentPath.split('/').pop() || 'converted';
    const ruleSet = makeRuleSet(ruleSetName, formulas);

    return new ConversionResult({
      deonticFormulas: formulas,
      ruleSet,
      conversionMetadata: {
        source: ctx.sourceDocumentPath,
        legal_domain: ctx.legalDomain,
        duration_ms: Date.now() - t0,
        sentence_count: sentences.length,
      },
      errors,
      warnings,
    });
  }

  /** Convert a list of entity/relationship records (from GraphRAG) to deontic formulas. */
  convertEntities(
    entities: Array<{ type: string; name: string; proposition?: string; action?: string }>,
    context?: ConversionContext,
  ): ConversionResult {
    void context;
    const formulas: DeonticFormula[] = [];
    for (const e of entities) {
      const op: DeonticOp =
        e.type === 'prohibition' ? DeonticOp.PROHIBITION :
        e.type === 'permission' ? DeonticOp.PERMISSION :
        DeonticOp.OBLIGATION;
      const proposition = e.proposition ?? e.action ?? 'Act';
      formulas.push(makeDeonticFormula(op, e.name, proposition, { confidence: 0.75 }));
    }
    const ruleSet = makeRuleSet('graphrag_entities', formulas);
    return new ConversionResult({ deonticFormulas: formulas, ruleSet });
  }
}

// PORT-113: Knowledge-graph → deontic formula conversion
export interface KGNode { id: string; type: string; label?: string; properties?: Record<string, unknown> }
export interface KGEdge { source: string; target: string; relation: string }

export function convertKnowledgeGraphToLogic(
  nodes: KGNode[],
  edges: KGEdge[],
): string[] {
  const formulas: string[] = [];
  for (const edge of edges) {
    const src = nodes.find(n => n.id === edge.source);
    const tgt = nodes.find(n => n.id === edge.target);
    if (!src || !tgt) continue;
    // Map edge relations to deontic operators
    if (/obli|must|shall|required/i.test(edge.relation))
      formulas.push(`O(${src.label ?? src.id}, ${tgt.label ?? tgt.id})`);
    else if (/permit|allow|may|can/i.test(edge.relation))
      formulas.push(`P(${src.label ?? src.id}, ${tgt.label ?? tgt.id})`);
    else if (/prohibit|forbid|must.?not/i.test(edge.relation))
      formulas.push(`F(${src.label ?? src.id}, ${tgt.label ?? tgt.id})`);
  }
  return formulas;
}

export function demonstrateDeonticConversion(): ConversionResult {
  const converter = new DeonticLogicConverter();
  const context = makeConversionContext('springfield-contract.txt', {
    documentTitle: 'Springfield Construction Contract',
    jurisdiction: 'State of Illinois',
    legalDomain: LegalDomain.CONTRACT,
  });
  return converter.convert([
    'The Contractor shall complete all work by December 31, 2024.',
    'The Client may inspect the work at any time with 24 hours notice.',
    'The Contractor shall not use materials that do not meet specifications.',
  ].join(' '), context);
}

export const demonstrate_deontic_conversion = demonstrateDeonticConversion;
