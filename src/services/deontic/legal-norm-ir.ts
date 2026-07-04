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

export interface LegalNormProvenanceRecord {
  readonly slot: string;
  readonly status: 'grounded' | 'ungrounded' | 'missing';
  readonly present: boolean;
  readonly grounded: boolean;
  readonly missing: boolean;
  readonly ungrounded: boolean;
  readonly spans: Array<[number, number]>;
  readonly value: unknown;
}

export interface LegalNormSlotProvenance {
  readonly source_id: string;
  readonly support_span: [number, number];
  readonly checked_slots: string[];
  readonly grounded_slots: string[];
  readonly missing_slots: string[];
  readonly ungrounded_slots: string[];
  readonly slot_grounding: LegalNormProvenanceRecord[];
}

export const DEFAULT_IR_PROVENANCE_SLOTS = [
  'actor',
  'modality',
  'action',
  'mental_state',
  'recipient',
  'conditions',
  'exceptions',
  'temporal_constraints',
  'cross_references',
];

export const DEFAULT_PHASE8_QUALITY_CORE_SLOTS = ['actor', 'modality', 'action'];
export const DEFAULT_PHASE8_QUALITY_OPTIONAL_SLOTS = [
  'recipient',
  'mental_state',
  'conditions',
  'exceptions',
  'overrides',
  'temporal_constraints',
  'cross_references',
  'resolved_cross_references',
  'defined_terms',
  'penalty',
  'procedure',
  'ontology_terms',
];

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
  readonly kg_relationship_hints: Array<Record<string, unknown>>;
  readonly field_spans:      Record<string, unknown>;
  readonly formal_terms:     Record<string, unknown>;
  readonly legal_frame:      Record<string, unknown>;
  readonly section_context:  Record<string, unknown>;
  readonly actor_entities:   string[];
  readonly definition_scope: Record<string, unknown>;

  // --- Phase-8 / round-trip metadata ---
  readonly modifiers:        Array<Record<string, unknown>>;
  readonly temporal_bounds:  Record<string, unknown>;
  readonly deontic_operator: string;
  readonly jurisdiction:     string;
  readonly effective_date:   string;
  readonly expiration_date:  string;
  readonly provenance:       Record<string, unknown>;
  readonly support_map:      Record<string, unknown>;
  readonly phase8_required_slots: string[];
  readonly parser_context:   Record<string, unknown>;
  readonly formula_metadata: Record<string, unknown>;

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
    kg_relationship_hints:       partial.kg_relationship_hints ?? [],
    field_spans:                 partial.field_spans ?? {},
    formal_terms:                partial.formal_terms ?? {},
    legal_frame:                 partial.legal_frame ?? {},
    section_context:             partial.section_context ?? {},
    actor_entities:              partial.actor_entities ?? [],
    definition_scope:            partial.definition_scope ?? {},
    modifiers:                   partial.modifiers ?? [],
    temporal_bounds:             partial.temporal_bounds ?? {},
    deontic_operator:            partial.deontic_operator ?? partial.modality,
    jurisdiction:                partial.jurisdiction ?? '',
    effective_date:              partial.effective_date ?? '',
    expiration_date:             partial.expiration_date ?? '',
    provenance:                  partial.provenance ?? {},
    support_map:                 partial.support_map ?? {},
    phase8_required_slots:       partial.phase8_required_slots ?? [],
    parser_context:              partial.parser_context ?? {},
    formula_metadata:            partial.formula_metadata ?? {},
    quality:                     partial.quality ?? emptyQuality(),
  };
}

export function parserElementToIR(element: Record<string, unknown>): LegalNormIR {
  return buildLegalNormIR({
    source_id: textValue(element['source_id']) || textValue(element['id']),
    schema_version: textValue(element['schema_version']) || '1.0',
    canonical_citation: textValue(element['canonical_citation']) || textValue(element['citation']),
    parent_source_id: textValue(element['parent_source_id']),
    enumeration_label: textValue(element['enumeration_label']),
    enumeration_index: numberOrNull(element['enumeration_index']),
    is_enumerated_child: Boolean(element['parent_source_id'] || element['enumeration_label']),
    source_text: textValue(element['source_text']) || textValue(element['text']),
    support_text: textValue(element['support_text']),
    source_span: spanFromValue(element['source_span'] ?? element['support_span']),
    support_span: spanFromValue(element['support_span']),
    modality: textValue(element['modality']) || textValue(element['deontic_operator']) || textValue(element['operator']),
    norm_type: textValue(element['norm_type']) || textValue(element['type']) || 'obligation',
    actor: textValue(element['actor']) || textValue(element['subject']) || textValue(element['entity']),
    actor_type: textValue(element['actor_type']) || textValue(element['entity_type']),
    action: textValue(element['action']) || textValue(element['predicate']) || textValue(element['description']),
    mental_state: textValue(element['mental_state']),
    action_verb: textValue(element['action_verb']),
    action_object: textValue(element['action_object']),
    recipient: textValue(element['recipient']),
    conditions: recordList(element['conditions'] ?? element['condition_details']),
    exceptions: recordList(element['exceptions'] ?? element['exception_details']),
    overrides: recordList(element['overrides'] ?? element['override_clause_details']),
    temporal_constraints: recordList(element['temporal_constraints'] ?? element['temporal_constraint_details']),
    cross_references: recordList(element['cross_references'] ?? element['cross_reference_details']),
    resolved_cross_references: recordList(element['resolved_cross_references']),
    defined_terms: recordList(element['defined_terms'] ?? element['defined_term_refs']),
    penalty: recordValue(element['penalty']),
    procedure: recordValue(element['procedure']),
    ontology_terms: recordList(element['ontology_terms']),
    kg_relationship_hints: recordList(element['kg_relationship_hints']),
    field_spans: recordValue(element['field_spans']),
    formal_terms: recordValue(element['formal_terms']),
    legal_frame: recordValue(element['legal_frame']),
    section_context: recordValue(element['section_context']),
    actor_entities: stringList(element['actor_entities']),
    definition_scope: recordValue(element['definition_scope']),
    modifiers: recordList(element['modifiers']),
    temporal_bounds: recordValue(element['temporal_bounds']),
    deontic_operator: textValue(element['deontic_operator']),
    jurisdiction: textValue(element['jurisdiction']),
    effective_date: textValue(element['effective_date']),
    expiration_date: textValue(element['expiration_date']),
    provenance: recordValue(element['provenance']),
    support_map: recordValue(element['support_map']),
    phase8_required_slots: stringList(element['phase8_required_slots']),
    parser_context: recordValue(element['parser_context']),
    formula_metadata: recordValue(element['formula_metadata']),
    quality: qualityFromValue(element['quality'] ?? element),
  });
}

export function legalNormIRProofReady(norm: LegalNormIR): boolean {
  return Boolean(norm.quality.promotable_to_theorem);
}

export function legalNormIRBlockers(norm: LegalNormIR): string[] {
  const readiness = norm.quality.export_readiness ?? {};
  const blockers = readiness['blockers'];
  if (Array.isArray(blockers)) return stringList(blockers);
  return [...norm.quality.parser_warnings];
}

export function parserWarningsRequireDecoderValidation(warnings: readonly string[]): boolean {
  const warningSet = new Set(warnings.map(warning => warning.trim()).filter(Boolean));
  if (
    warningSet.has('cross_reference_requires_resolution') &&
    warningSet.has('exception_requires_scope_review')
  ) {
    return true;
  }

  return warnings.some(warning => {
    const normalized = warning.trim();
    return normalized.length > 0 && !decoderWarningNonBlockers.has(normalized);
  });
}

export function legalNormIRDecoderRequiresValidation(norm: LegalNormIR): boolean {
  return parserWarningsRequireDecoderValidation(norm.quality.parser_warnings);
}

export function legalNormIRCanonicalModality(norm: LegalNormIR): string {
  const modality = norm.modality.trim().toUpperCase();
  if (['O', 'OBLIGATION', 'SHALL', 'MUST'].includes(modality)) return 'O';
  if (['P', 'PERMISSION', 'MAY'].includes(modality)) return 'P';
  if (['F', 'PROHIBITION', 'FORBIDDEN', 'MUST NOT', 'SHALL NOT'].includes(modality)) return 'F';
  if (['DEF', 'DEFINITION'].includes(modality) || norm.norm_type === 'definition') return 'DEF';
  if (['APP', 'APPLICABILITY'].includes(modality) || norm.norm_type === 'applicability') return 'APP';
  if (['EXEMPT', 'EXEMPTION'].includes(modality) || norm.norm_type === 'exemption') return 'EXEMPT';
  if (['LIFE', 'LIFECYCLE'].includes(modality) || norm.norm_type === 'instrument_lifecycle') return 'LIFE';
  if (['PURP', 'PURPOSE'].includes(modality) || norm.norm_type === 'purpose') return 'PURP';
  return modality || norm.modality;
}

export function legalNormIRToDict(norm: LegalNormIR): Record<string, unknown> {
  return {
    ...norm,
    source_span: [norm.source_span.start, norm.source_span.end],
    support_span: [norm.support_span.start, norm.support_span.end],
    proof_ready: legalNormIRProofReady(norm),
    blockers: legalNormIRBlockers(norm),
    canonical_modality: legalNormIRCanonicalModality(norm),
    decoder_requires_validation: legalNormIRDecoderRequiresValidation(norm),
  };
}

export function legalNormIRPhase8RequiredSlots(
  norm: LegalNormIR,
  coreSlots: string[] = DEFAULT_PHASE8_QUALITY_CORE_SLOTS,
  optionalSlots: string[] = DEFAULT_PHASE8_QUALITY_OPTIONAL_SLOTS,
): string[] {
  const explicit = norm.phase8_required_slots.filter(Boolean);
  if (explicit.length > 0) return dedupe(explicit);

  const normType = norm.norm_type.trim().toLowerCase();
  const modality = norm.modality.trim().toUpperCase();
  const core = normType === 'definition' || modality === 'DEF'
    ? ['actor']
    : ['applicability', 'exemption', 'instrument_lifecycle', 'purpose'].includes(normType) ||
      ['APP', 'EXEMPT', 'LIFE', 'PURP'].includes(modality)
      ? ['actor', 'action']
      : coreSlots;

  const required = [...core];
  for (const slot of optionalSlots) {
    if (!required.includes(slot) && !isEmptySlot(slotValue(norm, slot))) required.push(slot);
  }
  return dedupe(required);
}

export function legalNormIRSlotProvenance(
  norm: LegalNormIR,
  slots: string[] = DEFAULT_IR_PROVENANCE_SLOTS,
): LegalNormSlotProvenance {
  const slot_grounding = dedupe(slots).map(slot => {
    const value = slotValue(norm, slot);
    const present = !isEmptySlot(value);
    const spans = slotSpans(norm, slot, value);
    const status = spans.length > 0 ? 'grounded' : present ? 'ungrounded' : 'missing';
    return {
      slot,
      status,
      present,
      grounded: status === 'grounded',
      missing: status === 'missing',
      ungrounded: status === 'ungrounded',
      spans,
      value,
    } as LegalNormProvenanceRecord;
  });

  return {
    source_id: norm.source_id,
    support_span: [norm.support_span.start, norm.support_span.end],
    checked_slots: slot_grounding.map(record => record.slot),
    grounded_slots: slot_grounding.filter(record => record.grounded).map(record => record.slot),
    missing_slots: slot_grounding.filter(record => record.missing).map(record => record.slot),
    ungrounded_slots: slot_grounding.filter(record => record.ungrounded).map(record => record.slot),
    slot_grounding,
  };
}

const decoderWarningNonBlockers = new Set([
  'cross_reference_requires_resolution',
  'enumerated_clause_requires_item_level_review',
  'exception_requires_scope_review',
  'overlong_action_span',
  'definition connector inserted',
  'fixed grammar connector inserted',
]);

export const parser_warnings_require_decoder_validation = parserWarningsRequireDecoderValidation;

function slotValue(norm: LegalNormIR, slot: string): unknown {
  if (slot === 'cross_references') {
    return [...norm.cross_references, ...norm.resolved_cross_references];
  }
  return (norm as unknown as Record<string, unknown>)[slot];
}

function slotSpans(norm: LegalNormIR, slot: string, value: unknown): Array<[number, number]> {
  const spans = [
    ...spansFromValue(norm.field_spans[slot]),
    ...nestedSpans(value),
  ];
  if (spans.length === 0 && typeof value === 'string') spans.push(...textSpans(norm, value));
  if (spans.length === 0 && ['conditions', 'exceptions', 'overrides', 'temporal_constraints', 'cross_references'].includes(slot)) {
    spans.push(...structuredTextSpans(norm, value));
  }
  return dedupeSpans(spans);
}

function textSpans(norm: LegalNormIR, text: string): Array<[number, number]> {
  const needle = text.trim();
  if (!needle) return [];
  const supportOffset = norm.support_text.toLowerCase().indexOf(needle.toLowerCase());
  if (supportOffset >= 0) {
    return [[norm.support_span.start + supportOffset, norm.support_span.start + supportOffset + needle.length]];
  }
  const sourceOffset = norm.source_text.toLowerCase().indexOf(needle.toLowerCase());
  if (sourceOffset >= 0) return [[sourceOffset, sourceOffset + needle.length]];
  return [];
}

function structuredTextSpans(norm: LegalNormIR, value: unknown): Array<[number, number]> {
  return structuredTextValues(value).flatMap(text => textSpans(norm, text));
}

function structuredTextValues(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return dedupe(value.flatMap(item => structuredTextValues(item)));
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return dedupe(['value', 'normalized_text', 'raw_text', 'text', 'canonical_citation', 'citation', 'target']
      .map(key => textValue(record[key]))
      .filter(Boolean));
  }
  return [];
}

function nestedSpans(value: unknown): Array<[number, number]> {
  if (Array.isArray(value) && value.length === 2 && value.every(item => typeof item === 'number')) {
    return [[value[0], value[1]] as [number, number]];
  }
  if (Array.isArray(value)) return value.flatMap(item => nestedSpans(item));
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return [
      ...spansFromValue(record['span']),
      ...spansFromValue(record['source_span']),
      ...spansFromValue(record['support_span']),
      ...spansFromValue(record['clause_span']),
      ...Object.values(record).flatMap(item => nestedSpans(item)),
    ];
  }
  return [];
}

function spansFromValue(value: unknown): Array<[number, number]> {
  if (Array.isArray(value) && value.length === 2 && value.every(item => typeof item === 'number')) {
    return [[value[0], value[1]] as [number, number]];
  }
  if (Array.isArray(value)) return value.flatMap(item => spansFromValue(item));
  if (typeof value === 'object' && value !== null && 'start' in value && 'end' in value) {
    const span = value as Record<string, unknown>;
    if (typeof span['start'] === 'number' && typeof span['end'] === 'number') return [[span['start'], span['end']]];
  }
  return [];
}

function isEmptySlot(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function spanFromValue(value: unknown): SourceSpan {
  const spans = spansFromValue(value);
  if (spans[0]) return { start: spans[0][0], end: spans[0][1] };
  return emptySpan();
}

function recordList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(item => typeof item === 'object' && item !== null).map(item => ({ ...(item as Record<string, unknown>) }));
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => String(item)).filter(Boolean) : [];
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim();
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function qualityFromValue(value: unknown): LegalNormQuality {
  const record = recordValue(value);
  const nested = recordValue(record['quality']);
  const source = Object.keys(nested).length > 0 ? nested : record;
  return {
    schema_valid: Boolean(source['schema_valid']),
    slot_coverage: typeof source['slot_coverage'] === 'number' ? source['slot_coverage'] : 0,
    scaffold_quality: typeof source['scaffold_quality'] === 'number' ? source['scaffold_quality'] : 0,
    quality_label: textValue(source['quality_label']),
    parser_warnings: stringList(source['parser_warnings']),
    promotable_to_theorem: Boolean(source['promotable_to_theorem']),
    export_readiness: recordValue(source['export_readiness']),
  };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function dedupeSpans(spans: Array<[number, number]>): Array<[number, number]> {
  const seen = new Set<string>();
  return spans.filter(([start, end]) => {
    const key = `${start}:${end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
