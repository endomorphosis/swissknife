/**
 * DeonticGraph — typed graph for tracking deontic rules and supporting nodes.
 *
 * Mirrors ipfs_datasets_py/logic/deontic/graph.py (573 lines):
 *   class DeonticNodeType (enum)
 *   class DeonticModality (enum)
 *   class DeonticNode (dataclass)
 *   class DeonticRule (dataclass)
 *   class DeonticConflict (dataclass)
 *   class DeonticRuleAssessment (dataclass)
 *   class DeonticGraph (container)
 *
 * A DeonticGraph tracks the full normative structure of a policy or legal
 * document as a typed directed graph:
 *   - Nodes represent actors, facts, conditions, actions, outcomes, authorities.
 *   - Rules represent normative relations (obligation, prohibition, permission,
 *     entitlement) between source nodes and a governed target node.
 *   - The graph supports conflict detection, rule assessment, and export.
 *
 * T-88.
 * Reference: ipfs_datasets_py/logic/deontic/graph.py §DeonticGraph
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** Types of nodes in the deontic graph.  Python ref: DeonticNodeType. */
export type DeonticNodeType =
  | 'actor'       // An agent subject to norms
  | 'fact'        // A ground proposition used as evidence
  | 'condition'   // A conditional trigger for a rule
  | 'action'      // An act governed by a norm
  | 'outcome'     // An effect or consequence of an action
  | 'authority';  // A legal/regulatory authority that issues a norm

/** Supported deontic modalities.  Python ref: DeonticModality. */
export type DeonticModality =
  | 'obligation'    // O(φ) — must do
  | 'prohibition'   // F(φ) — must not do
  | 'permission'    // P(φ) — may do
  | 'entitlement';  // R(φ) — has a right to do

// ---------------------------------------------------------------------------
// Node and Rule types
// ---------------------------------------------------------------------------

/** A node in the deontic graph.  Python ref: DeonticNode dataclass. */
export interface DeonticNode {
  readonly id:         string;
  readonly node_type:  DeonticNodeType;
  readonly label:      string;
  active:              boolean;
  confidence:          number;
  attributes:          Record<string, unknown>;
}

/** A deontic rule connecting source nodes to a governed target. */
export interface DeonticRule {
  readonly id:           string;
  readonly modality:     DeonticModality;
  /** IDs of the source nodes whose activation triggers the rule. */
  readonly source_ids:   string[];
  /** ID of the node governed by this rule. */
  readonly target_id:    string;
  readonly predicate:    string;
  active:                boolean;
  confidence:            number;
  readonly authority_ids: string[];
  readonly evidence_ids:  string[];
  attributes:            Record<string, unknown>;
}

/** A conflict between two rules.  Python ref: DeonticConflict dataclass. */
export interface DeonticConflict {
  readonly rule_id:              string;
  readonly conflicting_rule_id:  string;
  readonly target_id:            string;
  readonly modalities:           [DeonticModality, DeonticModality];
  readonly reason:               string;
}

/** Assessment of a single rule's satisfied/missing sources. */
export interface DeonticRuleAssessment {
  readonly rule_id:           string;
  readonly target_id:         string;
  readonly modality:          DeonticModality;
  readonly active:            boolean;
  readonly satisfied_sources: string[];
  readonly missing_sources:   string[];
  readonly authority_ids:     string[];
  readonly evidence_ids:      string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True when `m1` and `m2` are modally incompatible. */
function modalitiesConflict(m1: DeonticModality, m2: DeonticModality): boolean {
  return (
    (m1 === 'obligation' && m2 === 'prohibition') ||
    (m1 === 'prohibition' && m2 === 'obligation') ||
    (m1 === 'permission'  && m2 === 'prohibition') ||
    (m1 === 'prohibition' && m2 === 'permission')
  );
}

// ---------------------------------------------------------------------------
// DeonticGraph
// ---------------------------------------------------------------------------

/**
 * DeonticGraph — container for deontic rules and their supporting nodes.
 *
 * Usage:
 * ```ts
 * const graph = new DeonticGraph();
 * const actorId = graph.addNode({ id: 'actor1', node_type: 'actor', label: 'User', active: true, confidence: 1, attributes: {} });
 * const actionId = graph.addNode({ id: 'action1', node_type: 'action', label: 'log_access', active: false, confidence: 0.9, attributes: {} });
 * graph.addRule({ id: 'r1', modality: 'obligation', source_ids: ['actor1'], target_id: 'action1', predicate: 'must', active: true, confidence: 0.95, authority_ids: [], evidence_ids: [], attributes: {} });
 * const conflicts = graph.detectConflicts();
 * const summary = graph.summary();
 * ```
 */
export class DeonticGraph {
  private readonly _nodes = new Map<string, DeonticNode>();
  private readonly _rules = new Map<string, DeonticRule>();
  private readonly _metadata: Record<string, unknown>;

  constructor() {
    this._metadata = {
      created_at:   new Date().toISOString(),
      last_updated: new Date().toISOString(),
      version:      '1.0.0',
    };
  }

  // ---------------------------------------------------------------------------
  // Mutation
  // ---------------------------------------------------------------------------

  addNode(node: DeonticNode): string {
    this._nodes.set(node.id, { ...node });
    this._updateMetadata();
    return node.id;
  }

  addRule(rule: DeonticRule): string {
    this._rules.set(rule.id, { ...rule });
    this._updateMetadata();
    return rule.id;
  }

  // ---------------------------------------------------------------------------
  // Queries — nodes
  // ---------------------------------------------------------------------------

  getNode(nodeId: string): DeonticNode | undefined {
    return this._nodes.get(nodeId);
  }

  get nodes(): ReadonlyMap<string, DeonticNode> { return this._nodes; }
  get rules(): ReadonlyMap<string, DeonticRule> { return this._rules; }

  nodesByType(type: DeonticNodeType): DeonticNode[] {
    return [...this._nodes.values()].filter(n => n.node_type === type);
  }

  // ---------------------------------------------------------------------------
  // Queries — rules
  // ---------------------------------------------------------------------------

  activeRules(): DeonticRule[] {
    return [...this._rules.values()].filter(r => r.active);
  }

  inactiveRules(): DeonticRule[] {
    return [...this._rules.values()].filter(r => !r.active);
  }

  rulesForTarget(targetId: string): DeonticRule[] {
    return [...this._rules.values()].filter(r => r.target_id === targetId);
  }

  rulesForSource(sourceId: string): DeonticRule[] {
    return [...this._rules.values()].filter(r => r.source_ids.includes(sourceId));
  }

  governedTargets(): string[] {
    const seen = new Set<string>();
    for (const r of this._rules.values()) seen.add(r.target_id);
    return [...seen];
  }

  // ---------------------------------------------------------------------------
  // Distributions
  // ---------------------------------------------------------------------------

  modalityDistribution(): Record<DeonticModality, number> {
    const counts: Record<string, number> = {};
    for (const rule of this.activeRules()) {
      counts[rule.modality] = (counts[rule.modality] ?? 0) + 1;
    }
    return counts as Record<DeonticModality, number>;
  }

  nodeTypeDistribution(): Record<DeonticNodeType, number> {
    const counts: Record<string, number> = {};
    for (const node of this._nodes.values()) {
      counts[node.node_type] = (counts[node.node_type] ?? 0) + 1;
    }
    return counts as Record<DeonticNodeType, number>;
  }

  // ---------------------------------------------------------------------------
  // Assessment
  // ---------------------------------------------------------------------------

  /**
   * Assess each rule's source satisfaction status.
   *
   * A source is "satisfied" when its node is present AND active.
   * Returns a list of `DeonticRuleAssessment` records.
   *
   * Python ref: DeonticGraph.assess_rules()
   */
  assessRules(): DeonticRuleAssessment[] {
    return [...this._rules.values()].map(rule => {
      const satisfied: string[] = [];
      const missing: string[]   = [];

      for (const srcId of rule.source_ids) {
        const node = this._nodes.get(srcId);
        if (!node) {
          missing.push(srcId);
        } else if (node.active) {
          satisfied.push(srcId);
        } else {
          missing.push(srcId);
        }
      }

      return {
        rule_id:            rule.id,
        target_id:          rule.target_id,
        modality:           rule.modality,
        active:             rule.active,
        satisfied_sources:  satisfied,
        missing_sources:    missing,
        authority_ids:      [...rule.authority_ids],
        evidence_ids:       [...rule.evidence_ids],
      };
    });
  }

  /**
   * Summarise how many rules have all sources satisfied vs. missing sources.
   *
   * Python ref: DeonticGraph.source_gap_summary()
   */
  sourceGapSummary(): { rule_count: number; fully_supported_rule_count: number; rules_with_gaps: DeonticRuleAssessment[] } {
    const assessments = this.assessRules();
    return {
      rule_count:                   assessments.length,
      fully_supported_rule_count:   assessments.filter(a => a.missing_sources.length === 0).length,
      rules_with_gaps:              assessments.filter(a => a.missing_sources.length > 0),
    };
  }

  /**
   * Detect normative conflicts — pairs of rules governing the same target and
   * predicate with incompatible modalities (e.g. O+F on the same action).
   *
   * Python ref: DeonticGraph.detect_conflicts()
   */
  detectConflicts(onlyActive = true): DeonticConflict[] {
    const candidates = onlyActive
      ? [...this._rules.values()].filter(r => r.active)
      : [...this._rules.values()];

    const conflicts: DeonticConflict[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const left  = candidates[i];
        const right = candidates[j];

        if (left.target_id !== right.target_id) continue;
        if (left.predicate  !== right.predicate) continue;
        if (!modalitiesConflict(left.modality, right.modality)) continue;

        const pairKey = [left.id, right.id].sort().join('|');
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        conflicts.push({
          rule_id:             left.id,
          conflicting_rule_id: right.id,
          target_id:           left.target_id,
          modalities:          [left.modality, right.modality],
          reason:              'Rules govern the same target and predicate with incompatible modalities.',
        });
      }
    }
    return conflicts;
  }

  /**
   * Export the graph as reasoning rows (one per rule assessment).
   * Python ref: DeonticGraph.export_reasoning_rows()
   */
  exportReasoningRows(): Array<Record<string, unknown>> {
    return this.assessRules().map(assessment => {
      const target = this._nodes.get(assessment.target_id);
      return {
        rule_id:            assessment.rule_id,
        target_id:          assessment.target_id,
        target_label:       target?.label ?? assessment.target_id,
        modality:           assessment.modality,
        active:             assessment.active,
        satisfied_sources:  assessment.satisfied_sources,
        missing_sources:    assessment.missing_sources,
        authority_ids:      assessment.authority_ids,
        evidence_ids:       assessment.evidence_ids,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  summary(): Record<string, unknown> {
    return {
      total_nodes:            this._nodes.size,
      total_rules:            this._rules.size,
      active_rule_count:      this.activeRules().length,
      inactive_rule_count:    this.inactiveRules().length,
      node_types:             this.nodeTypeDistribution(),
      modalities:             this.modalityDistribution(),
      governed_target_count:  this.governedTargets().length,
    };
  }

  // ---------------------------------------------------------------------------
  // Serialisation
  // ---------------------------------------------------------------------------

  toDict(): Record<string, unknown> {
    return {
      metadata: { ...this._metadata },
      nodes:    Object.fromEntries([...this._nodes.entries()].map(([k, v]) => [k, { ...v }])),
      rules:    Object.fromEntries([...this._rules.entries()].map(([k, v]) => [k, { ...v, source_ids: [...v.source_ids], authority_ids: [...v.authority_ids], evidence_ids: [...v.evidence_ids] }])),
      summary:  this.summary(),
    };
  }

  static fromDict(data: Record<string, unknown>): DeonticGraph {
    const graph = new DeonticGraph();
    const nodes = (data['nodes'] ?? {}) as Record<string, DeonticNode>;
    const rules = (data['rules'] ?? {}) as Record<string, DeonticRule>;
    for (const node of Object.values(nodes)) graph.addNode(node);
    for (const rule of Object.values(rules)) graph.addRule(rule);
    return graph;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private _updateMetadata(): void {
    (this._metadata as Record<string, string>)['last_updated'] = new Date().toISOString();
  }
}
