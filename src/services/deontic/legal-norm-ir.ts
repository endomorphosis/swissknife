/**
 * LegalNormIR — typed intermediate representation for legal norms.
 *
 * Mirrors the `LegalNormIR` frozen dataclass in
 * ipfs_datasets_py/logic/deontic/ir.py (2720 lines).
 *
 * `LegalNormIR` is the canonical IR that bridges:
 *   DeonticTextAnalyzer (Sprint 12) → LegalNormIR → DeonticGraph (Sprint 16)
 *   LegalNormDecoder (Sprint 17) → rendered legal text
 *   formal provers (Z3/DCEC/TDFOL) → WasmProofResult
 *
 * Sprint 17, T-92.
 * Reference: ipfs_datasets_py/logic/deontic/ir.py §LegalNormIR
 */

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

/**
 * A character span [start, end] within source text.
 * Python ref: SourceSpan dataclass.
 */
export interface SourceSpan {
  readonly start: number;
  readonly end:   number;
}

export function emptySpan(): SourceSpan { return { start: 0, end: 0 }; }

/**
 * Quality metadata for a parsed legal norm.
 * Python ref: LegalNormQuality dataclass.
 */
export interface LegalNormQuality {
  /** True when the IR passes schema validation. */
  schema_valid:          boolean;
  /** Fraction of required slots that are filled (0–1). */
  slot_coverage:         number;
  /** Overall scaffold quality score (0–1). */
  scaffold_quality:      number;
  /** Human-readable quality label (e.g. 'high', 'medium', 'low'). */
  quality_label:         string;
  /** Non-fatal parser warnings. */
  parser_warnings:       string[];
  /** True when the norm can be exported as a theorem to an external prover. */
  promotable_to_theorem: boolean;
  /** Readiness metadata keyed by export target (e.g. 'z3', 'lean4'). */
  export_readiness:      Record<string, unknown>;
}

export function emptyQuality(): LegalNormQuality {
  return {
    schema_valid:          false,
    slot_coverage:         0,
    scaffold_quality:      0,
    quality_label:         '',
    parser_warnings:       [],
    promotable_to_theorem: false,
    export_readiness:      {},
  };
}

// ---------------------------------------------------------------------------
// LegalNormIR
// ---------------------------------------------------------------------------

/**
 * Typed intermediate representation for a single legal norm (obligation,
 * permission, prohibition, definition, exemption, penalty, etc.).
 *
 * Python ref: LegalNormIR frozen dataclass (field-order preserved).
 */
export interface LegalNormIR {
  // --- metadata ---
  readonly schema_version:     string;
  readonly source_id:          string;
  readonly canonical_citation: string;
  readonly parent_source_id:   string;
  readonly enumeration_label:  string;
  readonly enumeration_index:  number | null;
  readonly is_enumerated_child: boolean;

  // --- source ---
  readonly source_text:        string;
  readonly support_text:       string;
  readonly source_span:        SourceSpan;
  readonly support_span:       SourceSpan;

  // --- deontic fields ---
  /** 'O' = obligation, 'P' = permission, 'F' = prohibition/forbidden,
   * 'DEF' = definition, 'APP' = applicability, 'EXEMPT' = exemption, 'LIFE' = lifecycle */
  readonly modality:           string;
  readonly norm_type:          string;
  readonly actor:              string;
  readonly actor_type:         string;
  readonly action:             string;
  readonly mental_state:       string;
  readonly action_verb:        string;
  readonly action_object:      string;
  readonly recipient:          string;

  // --- structured lists ---
  readonly conditions:               Array<Record<string, unknown>>;
  readonly exceptions:               Array<Record<string, unknown>>;
  readonly overrides:                Array<Record<string, unknown>>;
  readonly temporal_constraints:     Array<Record<string, unknown>>;
  readonly cross_references:         Array<Record<string, unknown>>;
  readonly resolved_cross_references: Array<Record<string, unknown>>;
  readonly defined_terms:            Array<Record<string, unknown>>;

  // --- complex fields ---
  readonly penalty:          Record<string, unknown>;
  readonly procedure:        Record<string, unknown>;
  readonly ontology_terms:   Array<Record<string, unknown>>;

  // --- quality ---
  readonly quality:          LegalNormQuality;
}

// ---------------------------------------------------------------------------
// Constructor helper
// ---------------------------------------------------------------------------

/**
 * Build a `LegalNormIR` with sensible defaults.
 *
 * Only the fields you provide override the defaults.
 */
export function buildLegalNormIR(
  partial: Partial<LegalNormIR> & Pick<LegalNormIR, 'source_id' | 'modality' | 'actor' | 'action'>,
): LegalNormIR {
  return {
    schema_version:              '1.0',
    source_id:                   partial.source_id,
    canonical_citation:          partial.canonical_citation ?? '',
    parent_source_id:            partial.parent_source_id ?? '',
    enumeration_label:           partial.enumeration_label ?? '',
    enumeration_index:           partial.enumeration_index ?? null,
    is_enumerated_child:         partial.is_enumerated_child ?? false,
    source_text:                 partial.source_text ?? '',
    support_text:                partial.support_text ?? '',
    source_span:                 partial.source_span ?? emptySpan(),
    support_span:                partial.support_span ?? emptySpan(),
    modality:                    partial.modality,
    norm_type:                   partial.norm_type ?? 'obligation',
    actor:                       partial.actor,
    actor_type:                  partial.actor_type ?? 'general',
    action:                      partial.action,
    mental_state:                partial.mental_state ?? '',
    action_verb:                 partial.action_verb ?? '',
    action_object:               partial.action_object ?? '',
    recipient:                   partial.recipient ?? '',
    conditions:                  partial.conditions ?? [],
    exceptions:                  partial.exceptions ?? [],
    overrides:                   partial.overrides ?? [],
    temporal_constraints:        partial.temporal_constraints ?? [],
    cross_references:            partial.cross_references ?? [],
    resolved_cross_references:   partial.resolved_cross_references ?? [],
    defined_terms:               partial.defined_terms ?? [],
    penalty:                     partial.penalty ?? {},
    procedure:                   partial.procedure ?? {},
    ontology_terms:              partial.ontology_terms ?? [],
    quality:                     partial.quality ?? emptyQuality(),
  };
}
