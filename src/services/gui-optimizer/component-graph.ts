/**
 * Typed UI dependency graph compiler (UiComponentGraph@1).
 *
 * Consumes non-executing VGO-002 scanner findings/edges and compiles a finite,
 * versioned dependency graph. Every edge carries source/target logical identity
 * (source_component_id / target_component_id), a closed relation, extraction
 * method, confidence, extractor version, and an available source_span (null
 * when absent). Unsupported targets remain unresolved rather than invented.
 *
 * Graph validation and completion receipts bind the exact accepted VGO-002
 * task CID and the current scanner wire schema so rescued output produced
 * against a superseded scanner revision is never completion evidence. This
 * module never executes repository source.
 */

import { sha256Hex } from '../shared/shared-browser-crypto.js';
import {
  GUI_DEPENDENCY_RELATIONS,
  GUI_EXTRACTION_METHODS,
  GUI_SOURCE_FINDING_INTERFACE,
  GUI_SOURCE_FINDING_SCHEMA,
  GUI_STATIC_EXTRACTOR_VERSION,
  GUI_STATIC_SCANNER_INTERFACE,
  GUI_STATIC_SCAN_RESULT_SCHEMA,
  SOURCE_SPAN_INTERFACE,
  SOURCE_SPAN_SCHEMA,
  UI_DEPENDENCY_EDGE_INTERFACE,
  UI_DEPENDENCY_EDGE_SCHEMA,
  type GuiAnalysisClassification,
  type GuiCompletenessBoundary,
  type GuiDependencyRelation,
  type GuiExtractionConfidence,
  type GuiExtractionMethod,
  type GuiFindingKind,
  type GuiSourceFinding,
  type GuiSourceSpan,
  type GuiStaticScanResult,
  type GuiVerificationStatus,
  type UiDependencyEdge,
  decodeUiDependencyEdge,
  makeSourceSpan,
  worstGuiExtractionConfidence,
} from './models.js';

// ---------------------------------------------------------------------------
// Interface / version identity
// ---------------------------------------------------------------------------

export const UI_COMPONENT_GRAPH_INTERFACE = 'UiComponentGraph@1' as const;
export const UI_COMPONENT_GRAPH_SCHEMA = 'ui-component-graph/v1' as const;
export const UI_COMPONENT_GRAPH_EXTRACTOR_VERSION =
  'gui-component-graph@1.0.0' as const;
export const UI_COMPONENT_GRAPH_COMPLETION_RECEIPT_INTERFACE =
  'UiComponentGraphCompletionReceipt@1' as const;
export const UI_COMPONENT_GRAPH_COMPLETION_RECEIPT_SCHEMA =
  'ui-component-graph-completion-receipt/v1' as const;

/** Closed relation vocabulary (UiDependencyRelation@1). */
export const UI_DEPENDENCY_RELATIONS = GUI_DEPENDENCY_RELATIONS;
export type UiDependencyRelation = GuiDependencyRelation;

/**
 * Current scanner wire schema binding for the accepted VGO-002 revision.
 * Field names and values mirror the live TypeScript wire models so a
 * superseded scanner revision cannot silently satisfy graph validation.
 */
export const ACCEPTED_VGO_002_SCANNER_WIRE_SCHEMA = Object.freeze({
  task_id: 'VGO-002' as const,
  scanner_interface: GUI_STATIC_SCANNER_INTERFACE,
  scan_result_schema: GUI_STATIC_SCAN_RESULT_SCHEMA,
  source_finding_interface: GUI_SOURCE_FINDING_INTERFACE,
  source_finding_schema: GUI_SOURCE_FINDING_SCHEMA,
  dependency_edge_interface: UI_DEPENDENCY_EDGE_INTERFACE,
  dependency_edge_schema: UI_DEPENDENCY_EDGE_SCHEMA,
  source_span_interface: SOURCE_SPAN_INTERFACE,
  source_span_schema: SOURCE_SPAN_SCHEMA,
  extractor_version: GUI_STATIC_EXTRACTOR_VERSION,
  extraction_methods: Object.freeze([...GUI_EXTRACTION_METHODS]),
  dependency_relations: Object.freeze([...GUI_DEPENDENCY_RELATIONS]),
  edge_fields: Object.freeze([
    'interface',
    'schema_version',
    'source_component_id',
    'target_component_id',
    'relation',
    'extraction_method',
    'extractor_version',
    'confidence',
    'source_span',
    'notes',
  ] as const),
});

export type AcceptedVgo002ScannerWireSchema =
  typeof ACCEPTED_VGO_002_SCANNER_WIRE_SCHEMA;

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('canonical JSON rejects non-finite numbers');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter(key => record[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new Error(`canonical JSON cannot encode ${typeof value}`);
}

/**
 * Content-addressed identity of the accepted VGO-002 scanner wire binding.
 * Completion evidence must carry this exact CID; any other value indicates a
 * superseded or foreign scanner revision.
 */
export const ACCEPTED_VGO_002_TASK_CID =
  `sha256:${sha256Hex(canonicalJson(ACCEPTED_VGO_002_SCANNER_WIRE_SCHEMA))}`;

// ---------------------------------------------------------------------------
// Wire / public types
// ---------------------------------------------------------------------------

export interface UiGraphNode {
  readonly schema_version: typeof UI_COMPONENT_GRAPH_SCHEMA;
  readonly identity: string;
  readonly kind: GuiFindingKind | 'unknown';
  readonly name: string;
  readonly path: string | null;
  readonly confidence: GuiExtractionConfidence;
  readonly finding_ids: readonly string[];
  readonly requires_raw_source: boolean;
}

export interface UiComponentGraph {
  readonly interface: typeof UI_COMPONENT_GRAPH_INTERFACE;
  readonly schema_version: typeof UI_COMPONENT_GRAPH_SCHEMA;
  readonly extractor_version: typeof UI_COMPONENT_GRAPH_EXTRACTOR_VERSION;
  /** Exact accepted VGO-002 task CID bound into every compiled graph. */
  readonly accepted_vgo_002_task_cid: string;
  /** Current scanner wire schema fingerprint bound into every compiled graph. */
  readonly scanner_wire_schema: AcceptedVgo002ScannerWireSchema;
  readonly scanner_extractor_version: string;
  readonly application_id: string;
  readonly screen_id: string;
  readonly package_namespace: string;
  readonly sources: readonly string[];
  readonly nodes: readonly UiGraphNode[];
  readonly edges: readonly UiDependencyEdge[];
  readonly analysis_classification: GuiAnalysisClassification;
  readonly verification_status: GuiVerificationStatus;
  readonly completeness_boundary: GuiCompletenessBoundary;
  readonly unresolved: readonly string[];
  readonly executed_code: false;
}

export interface UiComponentGraphBuildOptions {
  readonly applicationId?: string;
  readonly screenId?: string;
  readonly packageNamespace?: string;
}

export interface UiComponentGraphFacts {
  readonly findings: readonly GuiSourceFinding[];
  readonly edges?: readonly UiDependencyEdge[];
  readonly unresolved?: readonly string[];
  readonly sources?: readonly string[];
  readonly scanner_extractor_version?: string;
  readonly scanner_interface?: string;
  readonly scanner_schema_version?: string;
  readonly analysis_classification?: GuiAnalysisClassification;
  readonly verification_status?: GuiVerificationStatus;
  readonly completeness_boundary?: GuiCompletenessBoundary;
  /**
   * Optional caller-supplied VGO-002 task CID. When present it must equal
   * ACCEPTED_VGO_002_TASK_CID; mismatched values fail closed (superseded
   * revision).
   */
  readonly accepted_vgo_002_task_cid?: string;
}

export interface UiComponentGraphBuilder {
  readonly extractorVersion: typeof UI_COMPONENT_GRAPH_EXTRACTOR_VERSION;
  readonly acceptedVgo002TaskCid: string;
  buildFromScan(
    scan: GuiStaticScanResult,
    options?: UiComponentGraphBuildOptions,
  ): UiComponentGraph;
  buildFromFacts(
    facts: UiComponentGraphFacts,
    options?: UiComponentGraphBuildOptions,
  ): UiComponentGraph;
}

export interface UiComponentGraphValidationIssue {
  readonly code: string;
  readonly message: string;
}

export interface UiComponentGraphValidationResult {
  readonly ok: boolean;
  readonly accepted_vgo_002_task_cid: string;
  readonly scanner_wire_schema: AcceptedVgo002ScannerWireSchema;
  readonly issues: readonly UiComponentGraphValidationIssue[];
}

export interface UiComponentGraphCompletionReceipt {
  readonly interface: typeof UI_COMPONENT_GRAPH_COMPLETION_RECEIPT_INTERFACE;
  readonly schema_version: typeof UI_COMPONENT_GRAPH_COMPLETION_RECEIPT_SCHEMA;
  readonly accepted_vgo_002_task_cid: string;
  readonly scanner_wire_schema: AcceptedVgo002ScannerWireSchema;
  readonly graph_interface: typeof UI_COMPONENT_GRAPH_INTERFACE;
  readonly graph_schema_version: typeof UI_COMPONENT_GRAPH_SCHEMA;
  readonly graph_extractor_version: typeof UI_COMPONENT_GRAPH_EXTRACTOR_VERSION;
  readonly scanner_extractor_version: string;
  readonly application_id: string;
  readonly screen_id: string;
  readonly edge_count: number;
  readonly node_count: number;
  readonly unresolved_count: number;
  readonly analysis_classification: GuiAnalysisClassification;
  readonly verification_status: GuiVerificationStatus;
  readonly completeness_boundary: GuiCompletenessBoundary;
  readonly executed_code: false;
  readonly validation_ok: true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createUiComponentGraphBuilder(): UiComponentGraphBuilder {
  return {
    extractorVersion: UI_COMPONENT_GRAPH_EXTRACTOR_VERSION,
    acceptedVgo002TaskCid: ACCEPTED_VGO_002_TASK_CID,
    buildFromScan(scan, options) {
      return buildUiComponentGraph(scan, options);
    },
    buildFromFacts(facts, options) {
      return buildUiComponentGraphFromFacts(facts, options);
    },
  };
}

export function buildUiComponentGraph(
  scan: GuiStaticScanResult,
  options: UiComponentGraphBuildOptions = {},
): UiComponentGraph {
  if (scan.executed_code !== false) {
    throw new Error('UiComponentGraph refuses scans that executed repository code');
  }
  if (scan.interface !== GUI_STATIC_SCANNER_INTERFACE) {
    throw new Error(
      `UiComponentGraph refuses scan interface ${String(scan.interface)}; expected ${GUI_STATIC_SCANNER_INTERFACE}`,
    );
  }
  if (scan.schema_version !== GUI_STATIC_SCAN_RESULT_SCHEMA) {
    throw new Error(
      `UiComponentGraph refuses scan schema ${String(scan.schema_version)}; expected ${GUI_STATIC_SCAN_RESULT_SCHEMA}`,
    );
  }
  if (scan.extractor_version !== GUI_STATIC_EXTRACTOR_VERSION) {
    throw new Error(
      `UiComponentGraph refuses superseded scanner extractor ${String(scan.extractor_version)}; expected ${GUI_STATIC_EXTRACTOR_VERSION}`,
    );
  }
  return buildUiComponentGraphFromFacts(
    {
      findings: scan.findings,
      edges: scan.edges,
      unresolved: scan.unresolved,
      sources: scan.sources,
      scanner_extractor_version: scan.extractor_version,
      scanner_interface: scan.interface,
      scanner_schema_version: scan.schema_version,
      analysis_classification: scan.analysis_classification,
      verification_status: scan.verification_status,
      completeness_boundary: scan.completeness_boundary,
      accepted_vgo_002_task_cid: ACCEPTED_VGO_002_TASK_CID,
    },
    options,
  );
}

export function buildUiComponentGraphFromFacts(
  facts: UiComponentGraphFacts,
  options: UiComponentGraphBuildOptions = {},
): UiComponentGraph {
  assertAcceptedScannerRevision(facts);

  const findings = [...(facts.findings ?? [])];
  const scannerEdges = [...(facts.edges ?? [])];
  const unresolved = new Set<string>(facts.unresolved ?? []);
  const sources = [...(facts.sources ?? deriveSources(findings))].sort((a, b) =>
    a.localeCompare(b),
  );

  const identityContext = resolveIdentityContext(findings, options);
  const findingByIdentity = indexFindingsByIdentity(findings);
  const knownIdentities = new Set<string>(findingByIdentity.keys());

  // Seed known identities from scanner edges so exact targets remain addressable.
  for (const edge of scannerEdges) {
    if (edge?.source_component_id) knownIdentities.add(edge.source_component_id);
    if (edge?.target_component_id) knownIdentities.add(edge.target_component_id);
  }

  const edges: UiDependencyEdge[] = [];
  const seenEdgeKeys = new Set<string>();

  const pushEdge = (partial: {
    source_component_id: string;
    target_component_id: string;
    relation: UiDependencyRelation;
    source_span: GuiSourceSpan | null;
    extraction_method: GuiExtractionMethod;
    confidence: GuiExtractionConfidence;
    extractor_version: string;
    notes?: string;
  }): void => {
    const key = edgeKey(
      partial.source_component_id,
      partial.target_component_id,
      partial.relation,
    );
    if (seenEdgeKeys.has(key)) return;
    seenEdgeKeys.add(key);

    const edge = decodeUiDependencyEdge({
      interface: UI_DEPENDENCY_EDGE_INTERFACE,
      schema_version: UI_DEPENDENCY_EDGE_SCHEMA,
      source_component_id: partial.source_component_id,
      target_component_id: partial.target_component_id,
      relation: partial.relation,
      extraction_method: partial.extraction_method,
      extractor_version: partial.extractor_version,
      confidence: partial.confidence,
      source_span: partial.source_span
        ? freezeSpan(partial.source_span)
        : null,
      notes: partial.notes ?? '',
    });
    edges.push(edge);
  };

  // 1) Preserve scanner edges; never invent missing endpoints.
  for (const raw of scannerEdges) {
    let edge: UiDependencyEdge;
    try {
      edge = decodeUiDependencyEdge(JSON.parse(JSON.stringify(raw)));
    } catch {
      const label =
        raw && typeof raw === 'object' && 'source_component_id' in raw
          ? String((raw as { source_component_id: unknown }).source_component_id)
          : 'unknown';
      unresolved.add(`scanner-edge:${label}:invalid`);
      continue;
    }
    if (!isFiniteRelation(edge.relation)) {
      unresolved.add(
        `${edge.source_component_id}->${edge.target_component_id}:invalid_relation`,
      );
      continue;
    }
    if (!edge.source_component_id || !edge.target_component_id) {
      unresolved.add(
        `${edge.source_component_id || 'missing'}->${edge.target_component_id || 'missing'}:missing_endpoint`,
      );
      continue;
    }
    if (!knownIdentities.has(edge.target_component_id)) {
      // Scanner may emit exact logical targets that are not findings (routes,
      // actions). Keep them addressable without inventing new structure.
      knownIdentities.add(edge.target_component_id);
    }
    if (!knownIdentities.has(edge.source_component_id)) {
      knownIdentities.add(edge.source_component_id);
    }
    if (edge.confidence === 'opaque' || edge.confidence === 'heuristic') {
      unresolved.add(
        `${edge.target_component_id}:${edge.relation}:${edge.confidence}`,
      );
    }
    if (edge.target_component_id.startsWith('unresolved:')) {
      unresolved.add(
        `${edge.source_component_id}->${edge.target_component_id}:unresolved_target`,
      );
    }
    pushEdge({
      source_component_id: edge.source_component_id,
      target_component_id: edge.target_component_id,
      relation: edge.relation,
      source_span: edge.source_span,
      extraction_method: edge.extraction_method,
      confidence: edge.confidence,
      extractor_version: edge.extractor_version || GUI_STATIC_EXTRACTOR_VERSION,
      notes: edge.notes,
    });
  }

  // 2) Compile additional relation edges from findings without inventing targets.
  for (const finding of findings) {
    knownIdentities.add(finding.stable_identity);

    if (
      finding.confidence === 'opaque' ||
      finding.confidence === 'heuristic' ||
      finding.requires_raw_source
    ) {
      unresolved.add(`${finding.stable_identity}:${finding.confidence}`);
    }

    const derived = deriveRelationsForFinding(finding, findingByIdentity);
    for (const candidate of derived) {
      if (!isFiniteRelation(candidate.relation)) {
        unresolved.add(
          `${finding.stable_identity}:unsupported_relation:${String(candidate.relation)}`,
        );
        continue;
      }

      const source = candidate.source_component_id;
      const target = candidate.target_component_id;

      if (!source) {
        unresolved.add(
          `${finding.stable_identity}:${candidate.relation}:missing_source`,
        );
        continue;
      }
      if (!target) {
        unresolved.add(
          `${finding.stable_identity}:${candidate.relation}:missing_target`,
        );
        continue;
      }
      if (!isLogicalIdentity(source) || !isLogicalIdentity(target)) {
        unresolved.add(
          `${finding.stable_identity}:${candidate.relation}:invalid_identity`,
        );
        continue;
      }

      // Never invent endpoints that have no logical identity in the fact set.
      // Free-form unresolved labels stay unresolved and do not become edges.
      if (candidate.target_unresolved) {
        unresolved.add(target);
        continue;
      }

      knownIdentities.add(source);
      knownIdentities.add(target);

      pushEdge({
        source_component_id: source,
        target_component_id: target,
        relation: candidate.relation,
        source_span: candidate.source_span ?? finding.span,
        extraction_method: candidate.extraction_method,
        confidence: candidate.confidence,
        extractor_version: UI_COMPONENT_GRAPH_EXTRACTOR_VERSION,
        notes: candidate.notes ?? `compiled:${finding.kind}`,
      });
    }
  }

  const nodes = buildNodes(findings, knownIdentities, edges);
  const edgeConfidences = edges.map(edge => edge.confidence);
  const findingConfidences = findings.map(finding => finding.confidence);
  const classification =
    facts.analysis_classification ??
    worstGuiExtractionConfidence([...edgeConfidences, ...findingConfidences]);

  const completeness: GuiCompletenessBoundary =
    facts.completeness_boundary ??
    (unresolved.size > 0 || classification !== 'exact'
      ? 'partial'
      : 'complete_within_boundary');

  edges.sort(compareEdges);
  nodes.sort(compareNodes);
  const unresolvedList = [...unresolved].sort((a, b) => a.localeCompare(b));

  return Object.freeze({
    interface: UI_COMPONENT_GRAPH_INTERFACE,
    schema_version: UI_COMPONENT_GRAPH_SCHEMA,
    extractor_version: UI_COMPONENT_GRAPH_EXTRACTOR_VERSION,
    accepted_vgo_002_task_cid: ACCEPTED_VGO_002_TASK_CID,
    scanner_wire_schema: ACCEPTED_VGO_002_SCANNER_WIRE_SCHEMA,
    scanner_extractor_version:
      facts.scanner_extractor_version ?? GUI_STATIC_EXTRACTOR_VERSION,
    application_id: identityContext.applicationId,
    screen_id: identityContext.screenId,
    package_namespace: identityContext.packageNamespace,
    sources: Object.freeze(sources),
    nodes: Object.freeze(nodes.map(freezeNode)),
    edges: Object.freeze(edges.map(freezeEdge)),
    analysis_classification: classification,
    verification_status: facts.verification_status ?? 'unverified',
    completeness_boundary: completeness,
    unresolved: Object.freeze(unresolvedList),
    executed_code: false as const,
  });
}

/**
 * Validate a graph against edge completeness, the accepted VGO-002 task CID,
 * and the current scanner wire schema. Fail-closed: any mismatch is an issue.
 */
export function validateUiComponentGraph(
  graph: UiComponentGraph,
): UiComponentGraphValidationResult {
  const issues: UiComponentGraphValidationIssue[] = [];

  if (graph.interface !== UI_COMPONENT_GRAPH_INTERFACE) {
    issues.push({
      code: 'graph_interface_mismatch',
      message: `expected ${UI_COMPONENT_GRAPH_INTERFACE}, got ${String(graph.interface)}`,
    });
  }
  if (graph.schema_version !== UI_COMPONENT_GRAPH_SCHEMA) {
    issues.push({
      code: 'graph_schema_mismatch',
      message: `expected ${UI_COMPONENT_GRAPH_SCHEMA}, got ${String(graph.schema_version)}`,
    });
  }
  if (graph.extractor_version !== UI_COMPONENT_GRAPH_EXTRACTOR_VERSION) {
    issues.push({
      code: 'graph_extractor_mismatch',
      message: `expected ${UI_COMPONENT_GRAPH_EXTRACTOR_VERSION}, got ${String(graph.extractor_version)}`,
    });
  }
  if (graph.accepted_vgo_002_task_cid !== ACCEPTED_VGO_002_TASK_CID) {
    issues.push({
      code: 'vgo_002_task_cid_mismatch',
      message:
        'graph does not bind the exact accepted VGO-002 task CID; rescued output against a superseded scanner revision is not completion evidence',
    });
  }
  if (!scannerWireSchemaMatches(graph.scanner_wire_schema)) {
    issues.push({
      code: 'scanner_wire_schema_mismatch',
      message:
        'graph scanner wire schema does not match the current accepted VGO-002 wire schema',
    });
  }
  if (graph.scanner_extractor_version !== GUI_STATIC_EXTRACTOR_VERSION) {
    issues.push({
      code: 'scanner_extractor_superseded',
      message: `scanner extractor ${String(graph.scanner_extractor_version)} is not the current accepted ${GUI_STATIC_EXTRACTOR_VERSION}`,
    });
  }
  if (graph.executed_code !== false) {
    issues.push({
      code: 'executed_code',
      message: 'graph claims repository code execution',
    });
  }

  for (const edge of graph.edges ?? []) {
    try {
      decodeUiDependencyEdge(JSON.parse(JSON.stringify(edge)));
    } catch (error) {
      issues.push({
        code: 'edge_decode_failed',
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (!isFiniteRelation(edge.relation)) {
      issues.push({
        code: 'edge_relation_invalid',
        message: `edge relation ${String(edge.relation)} is not finite`,
      });
    }
    if (!edge.source_component_id || !edge.target_component_id) {
      issues.push({
        code: 'edge_identity_missing',
        message: 'edge missing source/target logical identity',
      });
    }
    if (!edge.extraction_method || !edge.extractor_version || !edge.confidence) {
      issues.push({
        code: 'edge_metadata_missing',
        message: 'edge missing extraction method, confidence, or extractor version',
      });
    }
    // Span is available when present; null is explicit rather than omitted.
    if (!('source_span' in edge)) {
      issues.push({
        code: 'edge_span_missing',
        message: 'edge missing available source_span field',
      });
    }
  }

  for (const node of graph.nodes ?? []) {
    if (node.identity.startsWith('unresolved:')) {
      issues.push({
        code: 'invented_unresolved_node',
        message: `node ${node.identity} invents an unresolved identity`,
      });
    }
  }

  return Object.freeze({
    ok: issues.length === 0,
    accepted_vgo_002_task_cid: ACCEPTED_VGO_002_TASK_CID,
    scanner_wire_schema: ACCEPTED_VGO_002_SCANNER_WIRE_SCHEMA,
    issues: Object.freeze(issues),
  });
}

/**
 * Build a completion receipt only when validation binds the exact accepted
 * VGO-002 task CID and current scanner wire schema. Superseded revisions throw.
 */
export function buildUiComponentGraphCompletionReceipt(
  graph: UiComponentGraph,
): UiComponentGraphCompletionReceipt {
  const validation = validateUiComponentGraph(graph);
  if (!validation.ok) {
    const summary = validation.issues
      .map(issue => `${issue.code}: ${issue.message}`)
      .join('; ');
    throw new Error(
      `UiComponentGraph completion receipt refused: ${summary || 'validation failed'}`,
    );
  }
  return Object.freeze({
    interface: UI_COMPONENT_GRAPH_COMPLETION_RECEIPT_INTERFACE,
    schema_version: UI_COMPONENT_GRAPH_COMPLETION_RECEIPT_SCHEMA,
    accepted_vgo_002_task_cid: ACCEPTED_VGO_002_TASK_CID,
    scanner_wire_schema: ACCEPTED_VGO_002_SCANNER_WIRE_SCHEMA,
    graph_interface: UI_COMPONENT_GRAPH_INTERFACE,
    graph_schema_version: UI_COMPONENT_GRAPH_SCHEMA,
    graph_extractor_version: UI_COMPONENT_GRAPH_EXTRACTOR_VERSION,
    scanner_extractor_version: graph.scanner_extractor_version,
    application_id: graph.application_id,
    screen_id: graph.screen_id,
    edge_count: graph.edges.length,
    node_count: graph.nodes.length,
    unresolved_count: graph.unresolved.length,
    analysis_classification: graph.analysis_classification,
    verification_status: graph.verification_status,
    completeness_boundary: graph.completeness_boundary,
    executed_code: false as const,
    validation_ok: true as const,
  });
}

// ---------------------------------------------------------------------------
// Relation compilation
// ---------------------------------------------------------------------------

interface DerivedEdgeCandidate {
  source_component_id: string | null;
  target_component_id: string | null;
  relation: UiDependencyRelation;
  source_span: GuiSourceSpan | null;
  extraction_method: GuiExtractionMethod;
  confidence: GuiExtractionConfidence;
  notes?: string;
  /** When true, the target is an unresolved label and must not become an edge. */
  target_unresolved?: boolean;
}

function deriveRelationsForFinding(
  finding: GuiSourceFinding,
  findingByIdentity: Map<string, GuiSourceFinding[]>,
): DerivedEdgeCandidate[] {
  const out: DerivedEdgeCandidate[] = [];
  const host = resolveHostIdentity(finding, findingByIdentity);
  const attrs = finding.attributes ?? {};
  const method = normalizeExtractionMethod(finding.extraction_method);
  const confidence = finding.confidence;
  const span = finding.span;

  const add = (
    relation: UiDependencyRelation,
    source: string | null,
    target: string | null,
    extra?: Partial<DerivedEdgeCandidate>,
  ): void => {
    out.push({
      source_component_id: source,
      target_component_id: target,
      relation,
      source_span: span,
      extraction_method: method,
      confidence,
      ...extra,
    });
  };

  switch (finding.kind) {
    case 'component':
    case 'element':
    case 'menu':
    case 'button':
    case 'link':
    case 'input':
    case 'label':
    case 'form':
    case 'template_html':
    case 'widget':
    case 'script':
    case 'import':
    case 'prop':
    case 'event_handler':
    case 'async_operation':
    case 'keyboard':
    case 'focus':
    case 'accessibility':
    case 'external_navigation':
    case 'host_boundary':
    case 'dynamic_uncertainty':
    case 'policy':
    case 'parent':
    case 'child':
      // Structural edges for these kinds are primarily scanner-owned
      // (renders/contains). Host-boundary/policy crossings compile below.
      break;
    case 'dialog': {
      add('opens_dialog', host, finding.stable_identity);
      if (/close|dismiss|cancel/i.test(finding.name) || attrs.closes === 'true') {
        add('closes_dialog', host, finding.stable_identity);
      }
      break;
    }
    case 'state': {
      // useState/read bindings → reads_state; setter-like names → updates_state.
      if (/set[A-Z]|dispatch|update|write/i.test(finding.name)) {
        add('updates_state', host, finding.stable_identity);
      } else {
        add('reads_state', host, finding.stable_identity);
        // Component-local state also implies the component can update it.
        if (
          host &&
          /useState|State\b|state\b/i.test(finding.name + finding.evidence)
        ) {
          add('updates_state', host, finding.stable_identity);
        }
      }
      break;
    }
    case 'reducer': {
      add('updates_state', host, finding.stable_identity);
      add('reads_state', host, finding.stable_identity);
      break;
    }
    case 'route': {
      add('routes_to', host, finding.stable_identity);
      break;
    }
    case 'validation': {
      if (/schema/i.test(finding.name) || /schema/i.test(finding.evidence)) {
        add('depends_on_schema', host, finding.stable_identity);
      } else {
        add('validates', host, finding.stable_identity);
      }
      break;
    }
    case 'action_binding': {
      add('invokes_action', host, finding.stable_identity);
      break;
    }
    case 'confirmation': {
      add('requires_confirmation', host, finding.stable_identity);
      break;
    }
    case 'destructive_action': {
      // Destructive actions require confirmation when a confirmation finding
      // is co-located; otherwise remain unresolved rather than inventing one.
      const confirmation = findSiblingByKind(
        finding,
        findingByIdentity,
        'confirmation',
      );
      if (confirmation) {
        add(
          'requires_confirmation',
          finding.stable_identity,
          confirmation.stable_identity,
        );
      } else {
        add(
          'requires_confirmation',
          finding.stable_identity,
          `unresolved:confirmation:${finding.stable_identity}`,
          { target_unresolved: true },
        );
      }
      break;
    }
    case 'style': {
      add('styled_by', host, finding.stable_identity);
      break;
    }
    case 'design_token': {
      add('uses_design_token', host, finding.stable_identity);
      break;
    }
    case 'localization': {
      add('localized_by', host, finding.stable_identity);
      break;
    }
    case 'media_query': {
      add('responsive_variant_of', host, finding.stable_identity);
      break;
    }
    default: {
      // Exhaustiveness guard: unknown kinds never invent edges.
      break;
    }
  }

  // Attribute-driven finite relations that any finding may carry.
  if (attrs.policy || attrs.depends_on_policy || /policy/i.test(finding.name)) {
    const policyTarget =
      attrs.policy ||
      attrs.depends_on_policy ||
      (finding.kind === 'host_boundary' || finding.kind === 'policy'
        ? finding.stable_identity
        : null);
    if (policyTarget && isLogicalIdentity(policyTarget)) {
      add(
        'depends_on_policy',
        host ?? finding.stable_identity,
        policyTarget === finding.stable_identity
          ? finding.stable_identity
          : policyTarget,
      );
    } else if (finding.kind === 'host_boundary' || finding.kind === 'policy') {
      add('depends_on_policy', host, finding.stable_identity);
    } else {
      add(
        'depends_on_policy',
        host ?? finding.stable_identity,
        `unresolved:policy:${finding.stable_identity}`,
        { target_unresolved: true },
      );
    }
  }

  if (attrs.schema || attrs.depends_on_schema) {
    const schemaTarget = attrs.schema || attrs.depends_on_schema;
    if (schemaTarget && isLogicalIdentity(schemaTarget)) {
      add(
        'depends_on_schema',
        host ?? finding.stable_identity,
        schemaTarget,
      );
    } else {
      add(
        'depends_on_schema',
        host ?? finding.stable_identity,
        `unresolved:schema:${finding.stable_identity}`,
        { target_unresolved: true },
      );
    }
  }

  if (attrs.tested_by || attrs.test_id || attrs['data-testid']) {
    const testTarget = attrs.tested_by;
    if (testTarget && isLogicalIdentity(testTarget)) {
      // Only accept an already-addressable logical test identity.
      add('tested_by', finding.stable_identity, testTarget);
    } else {
      // data-testid / bare test_id are handles, not test artifacts. Keep
      // them unresolved rather than inventing a test node.
      const label = attrs.tested_by || attrs.test_id || attrs['data-testid'];
      add(
        'tested_by',
        finding.stable_identity,
        `unresolved:test:${label}`,
        { target_unresolved: true },
      );
    }
  }

  if (attrs.screenshot_by || attrs.screenshot) {
    const shot = attrs.screenshot_by || attrs.screenshot;
    if (shot && isLogicalIdentity(shot)) {
      add('screenshot_by', finding.stable_identity, shot);
    } else {
      add(
        'screenshot_by',
        finding.stable_identity,
        `unresolved:screenshot:${finding.stable_identity}`,
        { target_unresolved: true },
      );
    }
  }

  if (
    attrs.device_projection_of ||
    attrs.device ||
    /device_projection|glasses|projection/i.test(finding.name)
  ) {
    const device =
      attrs.device_projection_of ||
      attrs.device ||
      finding.stable_identity;
    if (device && isLogicalIdentity(device)) {
      add(
        'device_projection_of',
        finding.stable_identity,
        device === finding.stable_identity ? finding.stable_identity : device,
      );
    } else {
      add(
        'device_projection_of',
        finding.stable_identity,
        `unresolved:device:${finding.stable_identity}`,
        { target_unresolved: true },
      );
    }
  }

  if (
    finding.kind === 'button' ||
    finding.kind === 'form' ||
    finding.kind === 'input'
  ) {
    if (
      attrs.type === 'submit' ||
      /submit/i.test(finding.name) ||
      attrs.submits === 'true'
    ) {
      add(
        'submits',
        finding.stable_identity,
        attrs.form && isLogicalIdentity(attrs.form)
          ? attrs.form
          : host ?? finding.stable_identity,
      );
    }
  }

  if (
    /close.*dialog|dismiss.*dialog|onClose|onDismiss/i.test(finding.name) ||
    attrs.closes_dialog === 'true'
  ) {
    const dialogTarget =
      attrs.dialog && isLogicalIdentity(attrs.dialog)
        ? attrs.dialog
        : findSiblingByKind(finding, findingByIdentity, 'dialog')
            ?.stable_identity ?? null;
    if (dialogTarget) {
      add('closes_dialog', finding.stable_identity, dialogTarget);
    } else {
      add(
        'closes_dialog',
        finding.stable_identity,
        `unresolved:dialog:${finding.stable_identity}`,
        { target_unresolved: true },
      );
    }
  }

  // Opaque dynamic uncertainty never gains invented structural edges beyond
  // the explicit unresolved markers already recorded.
  if (finding.kind === 'dynamic_uncertainty' && finding.confidence === 'opaque') {
    // Intentionally no invented edges.
  }

  return out;
}

// ---------------------------------------------------------------------------
// Identity / node helpers
// ---------------------------------------------------------------------------

function assertAcceptedScannerRevision(facts: UiComponentGraphFacts): void {
  if (
    facts.accepted_vgo_002_task_cid !== undefined &&
    facts.accepted_vgo_002_task_cid !== ACCEPTED_VGO_002_TASK_CID
  ) {
    throw new Error(
      `UiComponentGraph refuses facts bound to superseded VGO-002 task CID ${facts.accepted_vgo_002_task_cid}`,
    );
  }
  if (
    facts.scanner_interface !== undefined &&
    facts.scanner_interface !== GUI_STATIC_SCANNER_INTERFACE
  ) {
    throw new Error(
      `UiComponentGraph refuses scanner interface ${facts.scanner_interface}`,
    );
  }
  if (
    facts.scanner_schema_version !== undefined &&
    facts.scanner_schema_version !== GUI_STATIC_SCAN_RESULT_SCHEMA
  ) {
    throw new Error(
      `UiComponentGraph refuses scanner schema ${facts.scanner_schema_version}`,
    );
  }
  if (
    facts.scanner_extractor_version !== undefined &&
    facts.scanner_extractor_version !== GUI_STATIC_EXTRACTOR_VERSION
  ) {
    throw new Error(
      `UiComponentGraph refuses superseded scanner extractor ${facts.scanner_extractor_version}`,
    );
  }
}

function resolveIdentityContext(
  findings: readonly GuiSourceFinding[],
  options: UiComponentGraphBuildOptions,
): {
  applicationId: string;
  screenId: string;
  packageNamespace: string;
} {
  const component = findings.find(f => f.kind === 'component');
  return {
    applicationId:
      options.applicationId ??
      component?.attributes.application_id ??
      parseIdentitySegment(component?.stable_identity, 0) ??
      'unknown-application',
    screenId:
      options.screenId ??
      component?.attributes.screen_id ??
      parseIdentitySegment(component?.stable_identity, 1) ??
      'unknown-screen',
    packageNamespace:
      options.packageNamespace ??
      component?.attributes.package_namespace ??
      'org.hallucinate.swissknife.gui-optimizer',
  };
}

function parseIdentitySegment(
  identity: string | undefined,
  index: number,
): string | null {
  if (!identity) return null;
  const parts = identity.split('/');
  return parts[index] ?? null;
}

function indexFindingsByIdentity(
  findings: readonly GuiSourceFinding[],
): Map<string, GuiSourceFinding[]> {
  const map = new Map<string, GuiSourceFinding[]>();
  for (const finding of findings) {
    const list = map.get(finding.stable_identity) ?? [];
    list.push(finding);
    map.set(finding.stable_identity, list);
  }
  return map;
}

function resolveHostIdentity(
  finding: GuiSourceFinding,
  findingByIdentity: Map<string, GuiSourceFinding[]>,
): string | null {
  const attrs = finding.attributes ?? {};
  for (const key of ['host', 'parent', 'component', 'owner'] as const) {
    const value = attrs[key];
    if (value && isLogicalIdentity(value)) {
      return value;
    }
  }

  // Prefer a same-path component finding as structural host.
  const components = [...findingByIdentity.values()]
    .flat()
    .filter(
      candidate =>
        candidate.kind === 'component' &&
        candidate.path === finding.path &&
        candidate.stable_identity !== finding.stable_identity,
    )
    .sort(
      (a, b) =>
        a.span.start_line - b.span.start_line ||
        a.span.start_column - b.span.start_column ||
        a.stable_identity.localeCompare(b.stable_identity),
    );

  if (components.length === 1) {
    return components[0].stable_identity;
  }
  if (components.length > 1) {
    // Choose the nearest preceding component by span when available.
    const preceding = components
      .filter(
        c =>
          c.span.start_line < finding.span.start_line ||
          (c.span.start_line === finding.span.start_line &&
            c.span.start_column <= finding.span.start_column),
      )
      .sort(
        (a, b) =>
          b.span.start_line - a.span.start_line ||
          b.span.start_column - a.span.start_column,
      );
    if (preceding[0]) return preceding[0].stable_identity;
  }

  return null;
}

function findSiblingByKind(
  finding: GuiSourceFinding,
  findingByIdentity: Map<string, GuiSourceFinding[]>,
  kind: GuiFindingKind,
): GuiSourceFinding | null {
  const siblings = [...findingByIdentity.values()]
    .flat()
    .filter(
      candidate =>
        candidate.kind === kind &&
        candidate.path === finding.path &&
        candidate.stable_identity !== finding.stable_identity,
    )
    .sort(
      (a, b) =>
        Math.abs(a.span.start_line - finding.span.start_line) -
          Math.abs(b.span.start_line - finding.span.start_line) ||
        Math.abs(a.span.start_column - finding.span.start_column) -
          Math.abs(b.span.start_column - finding.span.start_column) ||
        a.stable_identity.localeCompare(b.stable_identity),
    );
  return siblings[0] ?? null;
}

function buildNodes(
  findings: readonly GuiSourceFinding[],
  knownIdentities: ReadonlySet<string>,
  edges: readonly UiDependencyEdge[],
): UiGraphNode[] {
  const nodes = new Map<string, UiGraphNode>();

  for (const finding of findings) {
    const existing = nodes.get(finding.stable_identity);
    if (!existing) {
      nodes.set(
        finding.stable_identity,
        freezeNode({
          schema_version: UI_COMPONENT_GRAPH_SCHEMA,
          identity: finding.stable_identity,
          kind: finding.kind,
          name: finding.name,
          path: finding.path,
          confidence: finding.confidence,
          finding_ids: [finding.finding_id],
          requires_raw_source: finding.requires_raw_source,
        }),
      );
      continue;
    }
    nodes.set(
      finding.stable_identity,
      freezeNode({
        ...existing,
        confidence: worstGuiExtractionConfidence([
          existing.confidence,
          finding.confidence,
        ]),
        finding_ids: Object.freeze(
          [...existing.finding_ids, finding.finding_id].sort((a, b) =>
            a.localeCompare(b),
          ),
        ),
        requires_raw_source:
          existing.requires_raw_source || finding.requires_raw_source,
      }),
    );
  }

  // Ensure every resolved edge endpoint is represented as a node.
  for (const edge of edges) {
    for (const identity of [
      edge.source_component_id,
      edge.target_component_id,
    ]) {
      if (identity.startsWith('unresolved:')) continue;
      if (nodes.has(identity)) continue;
      const kind = kindFromIdentity(identity);
      nodes.set(
        identity,
        freezeNode({
          schema_version: UI_COMPONENT_GRAPH_SCHEMA,
          identity,
          kind,
          name: identity.split('/').pop() ?? identity,
          path: null,
          confidence: 'exact',
          finding_ids: Object.freeze([]),
          requires_raw_source: false,
        }),
      );
    }
  }

  // Identities observed only as unresolved labels are intentionally omitted.
  for (const identity of knownIdentities) {
    if (identity.startsWith('unresolved:')) continue;
    if (nodes.has(identity)) continue;
    nodes.set(
      identity,
      freezeNode({
        schema_version: UI_COMPONENT_GRAPH_SCHEMA,
        identity,
        kind: kindFromIdentity(identity),
        name: identity.split('/').pop() ?? identity,
        path: null,
        confidence: 'exact',
        finding_ids: Object.freeze([]),
        requires_raw_source: false,
      }),
    );
  }

  return [...nodes.values()];
}

function kindFromIdentity(identity: string): GuiFindingKind | 'unknown' {
  const parts = identity.split('/');
  const kind = parts.length >= 3 ? parts[2] : '';
  const known: readonly GuiFindingKind[] = [
    'component',
    'element',
    'route',
    'dialog',
    'menu',
    'form',
    'button',
    'link',
    'input',
    'label',
    'validation',
    'prop',
    'state',
    'reducer',
    'event_handler',
    'async_operation',
    'keyboard',
    'focus',
    'accessibility',
    'style',
    'design_token',
    'media_query',
    'localization',
    'action_binding',
    'confirmation',
    'destructive_action',
    'external_navigation',
    'host_boundary',
    'template_html',
    'dynamic_uncertainty',
    'import',
    'script',
    'widget',
    'policy',
    'parent',
    'child',
  ];
  return (known as readonly string[]).includes(kind)
    ? (kind as GuiFindingKind)
    : 'unknown';
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const RELATION_SET = new Set<string>(UI_DEPENDENCY_RELATIONS);
const METHOD_SET = new Set<string>(GUI_EXTRACTION_METHODS);
const IDENTITY_RE = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/;

function isFiniteRelation(value: string): value is UiDependencyRelation {
  return RELATION_SET.has(value);
}

function isLogicalIdentity(value: string): boolean {
  return typeof value === 'string' && IDENTITY_RE.test(value);
}

function normalizeExtractionMethod(
  value: string,
): GuiExtractionMethod {
  if (METHOD_SET.has(value)) return value as GuiExtractionMethod;
  return 'heuristic_inference';
}

function edgeKey(
  source: string,
  target: string,
  relation: UiDependencyRelation,
): string {
  return `${source}\0${target}\0${relation}`;
}

function deriveSources(findings: readonly GuiSourceFinding[]): string[] {
  return [...new Set(findings.map(f => f.path))];
}

function freezeSpan(span: GuiSourceSpan): GuiSourceSpan {
  return makeSourceSpan({
    path: span.path,
    start_line: span.start_line,
    start_column: span.start_column,
    end_line: span.end_line,
    end_column: span.end_column,
  });
}

function freezeEdge(edge: UiDependencyEdge): UiDependencyEdge {
  return decodeUiDependencyEdge(JSON.parse(JSON.stringify(edge)));
}

function freezeNode(node: UiGraphNode): UiGraphNode {
  return Object.freeze({
    ...node,
    finding_ids: Object.freeze([...node.finding_ids]),
  });
}

function compareEdges(a: UiDependencyEdge, b: UiDependencyEdge): number {
  return (
    a.source_component_id.localeCompare(b.source_component_id) ||
    a.target_component_id.localeCompare(b.target_component_id) ||
    a.relation.localeCompare(b.relation) ||
    a.notes.localeCompare(b.notes)
  );
}

function compareNodes(a: UiGraphNode, b: UiGraphNode): number {
  return (
    a.identity.localeCompare(b.identity) ||
    a.kind.localeCompare(b.kind) ||
    a.name.localeCompare(b.name)
  );
}

function scannerWireSchemaMatches(
  schema: AcceptedVgo002ScannerWireSchema | unknown,
): boolean {
  if (!schema || typeof schema !== 'object') return false;
  const actual = schema as AcceptedVgo002ScannerWireSchema;
  return (
    canonicalJson(actual) ===
    canonicalJson(ACCEPTED_VGO_002_SCANNER_WIRE_SCHEMA)
  );
}

// Re-export edge type for consumers of UiDependencyEdge@1.
export type { UiDependencyEdge };
