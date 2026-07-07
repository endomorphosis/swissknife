/**
 * SupportMap — evidence-tracking for deontic rules.
 *
 * Mirrors ipfs_datasets_py/logic/deontic/support_map.py (167 lines):
 *   class SupportFact
 *   class FilingSupportReference
 *   class SupportMapEntry
 *   class SupportMapBuilder
 *
 * Sprint 16, T-90.
 * Reference: ipfs_datasets_py/logic/deontic/support_map.py
 */

import type { DeonticGraph, DeonticRuleAssessment } from './deontic-graph.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A fact proposition and the evidence sources that support it.
 * Python ref: SupportFact dataclass.
 */
export interface SupportFact {
  readonly fact_id:    string;
  readonly predicate:  string;
  /** 'alleged' | 'established' | 'disputed' | 'unknown' */
  readonly status:     string;
  readonly source_ids: string[];
  readonly attributes: Record<string, unknown>;
}

/**
 * Identifies a filing and the proposition the filing relies on.
 * Python ref: FilingSupportReference dataclass.
 */
export interface FilingSupportReference {
  readonly filing_id:   string;
  readonly filing_type: string;
  readonly proposition: string;
}

/**
 * One rule-centred support-map entry.
 * Python ref: SupportMapEntry dataclass.
 */
export interface SupportMapEntry {
  readonly rule_id:       string;
  readonly target_id:     string;
  readonly target_label:  string;
  readonly modality:      string;
  readonly predicate:     string;
  readonly active:        boolean;
  readonly facts:         SupportFact[];
  readonly filings:       FilingSupportReference[];
  readonly authority_ids: string[];
  readonly evidence_ids:  string[];
}

// ---------------------------------------------------------------------------
// SupportMapBuilder
// ---------------------------------------------------------------------------

/**
 * SupportMapBuilder — builds a support map from a DeonticGraph.
 *
 * A support map summarises the evidence backing each deontic rule:
 * for each rule, it lists the facts (activated source nodes), any filing
 * references (source nodes tagged as filings), and the rule's authority chain.
 *
 * Usage:
 * ```ts
 * const entries = SupportMapBuilder.build(graph);
 * for (const entry of entries) {
 *   console.log(`${entry.rule_id}: ${entry.facts.length} facts, active=${entry.active}`);
 * }
 * ```
 */
export class SupportMapBuilder {
  /**
   * Build a support-map from the graph's rule assessments.
   *
   * @param graph  A fully populated `DeonticGraph`.
   * @returns      Array of `SupportMapEntry` — one per rule in the graph.
   */
  static build(graph: DeonticGraph): SupportMapEntry[] {
    const assessments: DeonticRuleAssessment[] = graph.assessRules();
    const entries: SupportMapEntry[] = [];

    for (const assessment of assessments) {
      const rule = graph.rules.get(assessment.rule_id);
      if (!rule) continue;

      const target = graph.getNode(assessment.target_id);

      // Build SupportFact for each satisfied source node
      const facts: SupportFact[] = [];
      for (const srcId of assessment.satisfied_sources) {
        const srcNode = graph.getNode(srcId);
        if (!srcNode) continue;
        facts.push({
          fact_id:    srcId,
          predicate:  srcNode.label,
          status:     srcNode.active ? 'established' : 'alleged',
          source_ids: [srcId],
          attributes: { ...srcNode.attributes },
        });
      }

      // Build FilingSupportReference for evidence_ids
      const filings: FilingSupportReference[] = assessment.evidence_ids.map(evId => ({
        filing_id:   evId,
        filing_type: 'evidence',
        proposition: rule.predicate,
      }));

      entries.push({
        rule_id:       assessment.rule_id,
        target_id:     assessment.target_id,
        target_label:  target?.label ?? assessment.target_id,
        modality:      assessment.modality,
        predicate:     rule.predicate,
        active:        assessment.active,
        facts,
        filings,
        authority_ids: [...assessment.authority_ids],
        evidence_ids:  [...assessment.evidence_ids],
      });
    }

    return entries;
  }

  /**
   * Build a support map and return a summary keyed by modality.
   */
  static buildSummary(graph: DeonticGraph): Record<string, { count: number; active: number; with_facts: number }> {
    const entries = SupportMapBuilder.build(graph);
    const summary: Record<string, { count: number; active: number; with_facts: number }> = {};

    for (const entry of entries) {
      if (!summary[entry.modality]) {
        summary[entry.modality] = { count: 0, active: 0, with_facts: 0 };
      }
      summary[entry.modality].count++;
      if (entry.active) summary[entry.modality].active++;
      if (entry.facts.length > 0) summary[entry.modality].with_facts++;
    }

    return summary;
  }
}
