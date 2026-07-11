/**
 * LegalNormBuilder — builds `LegalNormIR` instances from analyzer output.
 *
 * Bridges `DeonticTextAnalyzer` (Sprint 12) statement extraction → `LegalNormIR`
 * for downstream use by `LegalNormDecoder` (Sprint 17) and `DeonticGraph` (Sprint 16).
 *
 * Sprint 17, T-94.
 */

import { buildLegalNormIR } from './deontic-legal-norm-ir.js';
import type { LegalNormIR } from './deontic-legal-norm-ir.js';
import type { DeonticStatement } from './deontic-deontic-text-analyzer.js';

function statementProposition(statement: DeonticStatement): string {
  return (statement as DeonticStatement & { proposition?: string }).proposition ?? statement.action;
}

/** Mapping from DeonticTextAnalyzer modality → LegalNormIR modality code. */
const MODALITY_MAP: Record<DeonticStatement['modality'], string> = {
  obligation:  'O',
  permission:  'P',
  prohibition: 'F',
};

/**
 * LegalNormBuilder — helpers for constructing `LegalNormIR` from extracted norms.
 */
export class LegalNormBuilder {
  /**
   * Build a single `LegalNormIR` from a `DeonticStatement`.
   */
  static fromStatement(
    stmt: DeonticStatement,
    opts: { schemaVersion?: string; citation?: string } = {},
  ): LegalNormIR {
    const proposition = statementProposition(stmt);
    return buildLegalNormIR({
      source_id:           stmt.id,
      schema_version:      opts.schemaVersion ?? '1.0',
      canonical_citation:  opts.citation ?? stmt.source,
      parent_source_id:    stmt.source,
      source_text:         stmt.context,
      support_text:        proposition,
      modality:            MODALITY_MAP[stmt.modality] ?? stmt.modality.toUpperCase(),
      norm_type:           stmt.modality,
      actor:               stmt.entity,
      actor_type:          'general',
      action:              proposition,
      action_verb:         proposition.split(/\s+/)[0] ?? '',
      action_object:       proposition.split(/\s+/).slice(1).join(' '),
      recipient:           '',
      conditions:          stmt.conditions.map(c => ({ text: c })),
      exceptions:          stmt.exceptions.map(e => ({ text: e })),
      quality: {
        schema_valid:          stmt.confidence >= 0.5,
        slot_coverage:         stmt.confidence,
        scaffold_quality:      stmt.confidence,
        quality_label:         stmt.confidence >= 0.8 ? 'high' : stmt.confidence >= 0.5 ? 'medium' : 'low',
        parser_warnings:       [],
        promotable_to_theorem: stmt.confidence >= 0.7,
        export_readiness:      {},
      },
    });
  }

  /**
   * Build an array of `LegalNormIR` from a list of `DeonticStatement` objects.
   */
  static fromStatements(
    stmts: DeonticStatement[],
    opts: { schemaVersion?: string; citation?: string } = {},
  ): LegalNormIR[] {
    return stmts.map(s => LegalNormBuilder.fromStatement(s, opts));
  }
}
