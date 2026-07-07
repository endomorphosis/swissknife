/**
 * DeonticGraphBuilder — builds DeonticGraph instances from extracted NL output.
 *
 * Bridges the output of `DeonticTextAnalyzer` (Sprint 12) and
 * `DeonticKnowledgeBase` (Sprint 12) into a `DeonticGraph` (Sprint 16).
 *
 * Sprint 16, T-89.
 * Reference: ipfs_datasets_py/logic/deontic/graph.py §DeonticGraphBuilder
 */

import { DeonticGraph } from './deontic-graph.js';
import type { DeonticNode, DeonticRule, DeonticModality } from './deontic-graph.js';
import type { DeonticStatement, DeonticConflict as AnalyzerConflict } from './deontic-text-analyzer.js';

function statementProposition(statement: DeonticStatement): string {
  return (statement as DeonticStatement & { proposition?: string }).proposition ?? statement.action;
}

// Mapping from DeonticTextAnalyzer modalities to DeonticGraph modalities
function toGraphModality(m: DeonticStatement['modality']): DeonticModality {
  switch (m) {
    case 'obligation':  return 'obligation';
    case 'permission':  return 'permission';
    case 'prohibition': return 'prohibition';
  }
}

// Slugify for node IDs
function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 40);
}

/**
 * DeonticGraphBuilder — helpers for constructing DeonticGraph instances.
 *
 * Usage:
 * ```ts
 * const analyzer = new DeonticTextAnalyzer();
 * const stmts = analyzer.extractStatements('Users must log access.');
 * const conflicts = analyzer.detectConflicts(stmts);
 * const graph = DeonticGraphBuilder.fromStatements(stmts, conflicts);
 * console.log(graph.summary());
 * ```
 */
export class DeonticGraphBuilder {
  /**
   * Build a DeonticGraph from `DeonticTextAnalyzer` output.
   *
   * Each statement becomes:
   *   - One 'actor' node for `stmt.entity`.
  *   - One 'action' node for the statement proposition/action.
   *   - One rule connecting actor → action with the statement's modality.
   *
   * Conflicts are recorded as pairs of inactive rules (they remain in the graph
   * but are flagged so `detectConflicts()` can find them).
   *
   * @param statements Extracted deontic statements.
   * @param conflicts  Detected conflicts (from `detectConflicts()`).
   * @param entityNodeIds Optional pre-existing actor node IDs to reuse.
   */
  static fromStatements(
    statements: DeonticStatement[],
    conflicts: AnalyzerConflict[] = [],
    entityNodeIds: Map<string, string> = new Map(),
  ): DeonticGraph {
    const graph = new DeonticGraph();
    const conflictedRuleIds = new Set<string>(
      conflicts.flatMap(c => [c.statement1.id, c.statement2.id]),
    );

    for (const stmt of statements) {
      // Actor node
      const actorNodeId = entityNodeIds.get(stmt.entity) ??
        `actor_${slugify(stmt.entity)}_${stmt.id}`;

      if (!graph.getNode(actorNodeId)) {
        const actorNode: DeonticNode = {
          id:        actorNodeId,
          node_type: 'actor',
          label:     stmt.entity,
          active:    true,
          confidence: stmt.confidence,
          attributes: { source: stmt.source },
        };
        graph.addNode(actorNode);
      }

      // Action node
      const proposition = statementProposition(stmt);
      const actionNodeId = `action_${slugify(proposition)}_${stmt.id}`;
      const actionNode: DeonticNode = {
        id:        actionNodeId,
        node_type: 'action',
        label:     proposition,
        active:    true,
        confidence: stmt.confidence,
        attributes: { context: stmt.context, proposition, action: stmt.action },
      };
      graph.addNode(actionNode);

      // Deontic rule
      const ruleId = `rule_${stmt.id}`;
      const rule: DeonticRule = {
        id:            ruleId,
        modality:      toGraphModality(stmt.modality),
        source_ids:    [actorNodeId],
        target_id:     actionNodeId,
        predicate:     stmt.modality,
        active:        !conflictedRuleIds.has(stmt.id),
        confidence:    stmt.confidence,
        authority_ids: [],
        evidence_ids:  [],
        attributes:    {
          conditions: stmt.conditions,
          exceptions: stmt.exceptions,
          date:       stmt.date,
        },
      };
      graph.addRule(rule);
    }

    return graph;
  }
}
