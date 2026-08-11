/**
 * Typed UI dependency graph compiler (UiComponentGraph@1).
 *
 * Consumes non-executing scanner findings/edges and compiles a finite,
 * versioned dependency graph. Every edge carries source/target logical
 * identity, a closed relation, extraction method, confidence, extractor
 * version, and an optional source span. Unsupported or unresolved targets
 * are recorded explicitly rather than invented. This module never executes
 * repository source.
 */

import {
  GUI_DEPENDENCY_RELATIONS,
  GUI_OPTIMIZER_SCHEMA_VERSION,
  GUI_STATIC_EXTRACTOR_VERSION,
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
  worstGuiExtractionConfidence,
} from './models.js';

// ---------------------------------------------------------------------------
// Interface / version identity
// ---------------------------------------------------------------------------

export const UI_COMPONENT_GRAPH_INTERFACE = 'UiComponentGraph@1' as const;
export const UI_COMPONENT_GRAPH_EXTRACTOR_VERSION =
  'gui-component-graph@1.0.0' as const;

/** Closed relation vocabulary (UiDependencyRelation@1). */
export const UI_DEPENDENCY_RELATIONS = GUI_DEPENDENCY_RELATIONS;
export type UiDependencyRelation = GuiDependencyRelation;

// ---------------------------------------------------------------------------
// Wire / public types
// ---------------------------------------------------------------------------

export interface UiGraphNode {
  readonly schema_version: typeof GUI_OPTIMIZER_SCHEMA_VERSION;
  readonly identity: string;
  readonly kind: GuiFindingKind | 'unknown';
  readonly name: string;
  readonly path: string | null;
  readonly confidence: GuiExtractionConfidence;
  readonly finding_ids: readonly string[];
  readonly requires_raw_source: boolean;
}

export interface UiComponentGraph {
  readonly schema_version: typeof GUI_OPTIMIZER_SCHEMA_VERSION;
  readonly interface_id: typeof UI_COMPONENT_GRAPH_INTERFACE;
  readonly extractor_version: typeof UI_COMPONENT_GRAPH_EXTRACTOR_VERSION;
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
  readonly analysis_classification?: GuiAnalysisClassification;
  readonly verification_status?: GuiVerificationStatus;
  readonly completeness_boundary?: GuiCompletenessBoundary;
}

export interface UiComponentGraphBuilder {
  readonly extractorVersion: typeof UI_COMPONENT_GRAPH_EXTRACTOR_VERSION;
  buildFromScan(
    scan: GuiStaticScanResult,
    options?: UiComponentGraphBuildOptions,
  ): UiComponentGraph;
  buildFromFacts(
    facts: UiComponentGraphFacts,
    options?: UiComponentGraphBuildOptions,
  ): UiComponentGraph;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createUiComponentGraphBuilder(): UiComponentGraphBuilder {
  return {
    extractorVersion: UI_COMPONENT_GRAPH_EXTRACTOR_VERSION,
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
  return buildUiComponentGraphFromFacts(
    {
      findings: scan.findings,
      edges: scan.edges,
      unresolved: scan.unresolved,
      sources: scan.sources,
      scanner_extractor_version: scan.extractor_version,
      analysis_classification: scan.analysis_classification,
      verification_status: scan.verification_status,
      completeness_boundary: scan.completeness_boundary,
    },
    options,
  );
}

export function buildUiComponentGraphFromFacts(
  facts: UiComponentGraphFacts,
  options: UiComponentGraphBuildOptions = {},
): UiComponentGraph {
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
    knownIdentities.add(edge.source_identity);
    knownIdentities.add(edge.target_identity);
  }

  const edges: UiDependencyEdge[] = [];
  const seenEdgeKeys = new Set<string>();
  let edgeCounter = 0;

  const pushEdge = (partial: {
    source_identity: string;
    target_identity: string;
    relation: UiDependencyRelation;
    span: GuiSourceSpan | null;
    extraction_method: GuiExtractionMethod;
    confidence: GuiExtractionConfidence;
    extractor_version: string;
    edge_id?: string;
  }): void => {
    const key = edgeKey(
      partial.source_identity,
      partial.target_identity,
      partial.relation,
    );
    if (seenEdgeKeys.has(key)) return;
    seenEdgeKeys.add(key);
    edgeCounter += 1;
    const edge: UiDependencyEdge = Object.freeze({
      schema_version: GUI_OPTIMIZER_SCHEMA_VERSION,
      edge_id:
        partial.edge_id ??
        `graph-edge:${edgeCounter.toString().padStart(4, '0')}`,
      source_identity: partial.source_identity,
      target_identity: partial.target_identity,
      relation: partial.relation,
      span: partial.span ? Object.freeze({ ...partial.span }) : null,
      extraction_method: partial.extraction_method,
      confidence: partial.confidence,
      extractor_version: partial.extractor_version,
    });
    // Validate closed edge shape via the shared decoder contract.
    decodeUiDependencyEdge(JSON.parse(JSON.stringify(edge)));
    edges.push(edge);
  };

  // 1) Preserve scanner edges; never invent missing endpoints.
  for (const raw of scannerEdges) {
    let edge: UiDependencyEdge;
    try {
      edge = decodeUiDependencyEdge(JSON.parse(JSON.stringify(raw)));
    } catch {
      const label =
        raw && typeof raw === 'object' && 'edge_id' in raw
          ? String((raw as { edge_id: unknown }).edge_id)
          : 'unknown';
      unresolved.add(`scanner-edge:${label}:invalid`);
      continue;
    }
    if (!isFiniteRelation(edge.relation)) {
      unresolved.add(`${edge.edge_id}:invalid_relation`);
      continue;
    }
    if (!edge.source_identity || !edge.target_identity) {
      unresolved.add(`${edge.edge_id}:missing_endpoint`);
      continue;
    }
    if (!knownIdentities.has(edge.target_identity)) {
      // Scanner may emit exact logical targets that are not findings (routes,
      // actions). Keep them addressable without inventing new structure.
      knownIdentities.add(edge.target_identity);
    }
    if (!knownIdentities.has(edge.source_identity)) {
      knownIdentities.add(edge.source_identity);
    }
    if (
      edge.confidence === 'opaque' ||
      edge.confidence === 'heuristic'
    ) {
      unresolved.add(
        `${edge.target_identity}:${edge.relation}:${edge.confidence}`,
      );
    }
    pushEdge({
      source_identity: edge.source_identity,
      target_identity: edge.target_identity,
      relation: edge.relation,
      span: edge.span,
      extraction_method: edge.extraction_method,
      confidence: edge.confidence,
      extractor_version: edge.extractor_version || GUI_STATIC_EXTRACTOR_VERSION,
      edge_id: edge.edge_id,
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

      const source = candidate.source_identity;
      const target = candidate.target_identity;

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

      // Never invent endpoints that have no logical identity in the fact set
      // and no scanner-provided address. If a candidate points at a free-form
      // unresolved label, keep it unresolved.
      if (candidate.target_unresolved) {
        unresolved.add(target);
        continue;
      }

      knownIdentities.add(source);
      knownIdentities.add(target);

      pushEdge({
        source_identity: source,
        target_identity: target,
        relation: candidate.relation,
        span: candidate.span ?? finding.span,
        extraction_method: candidate.extraction_method,
        confidence: candidate.confidence,
        extractor_version: UI_COMPONENT_GRAPH_EXTRACTOR_VERSION,
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
    (unresolved.size > 0 || classification !== 'exact' ? 'partial' : 'screen');

  edges.sort(compareEdges);
  nodes.sort(compareNodes);
  const unresolvedList = [...unresolved].sort((a, b) => a.localeCompare(b));

  return Object.freeze({
    schema_version: GUI_OPTIMIZER_SCHEMA_VERSION,
    interface_id: UI_COMPONENT_GRAPH_INTERFACE,
    extractor_version: UI_COMPONENT_GRAPH_EXTRACTOR_VERSION,
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

// ---------------------------------------------------------------------------
// Relation compilation
// ---------------------------------------------------------------------------

interface DerivedEdgeCandidate {
  source_identity: string | null;
  target_identity: string | null;
  relation: UiDependencyRelation;
  span: GuiSourceSpan | null;
  extraction_method: GuiExtractionMethod;
  confidence: GuiExtractionConfidence;
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
  const method: GuiExtractionMethod =
    finding.extraction_method === 'conservative_inference'
      ? 'conservative_inference'
      : finding.extraction_method;
  const confidence = finding.confidence;
  const span = finding.span;

  const add = (
    relation: UiDependencyRelation,
    source: string | null,
    target: string | null,
    extra?: Partial<DerivedEdgeCandidate>,
  ): void => {
    out.push({
      source_identity: source,
      target_identity: target,
      relation,
      span,
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
        if (host && /useState|State\b|state\b/i.test(finding.name + finding.evidence)) {
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
      (finding.kind === 'host_boundary' ? finding.stable_identity : null);
    if (policyTarget && isLogicalIdentity(policyTarget)) {
      add(
        'depends_on_policy',
        host ?? finding.stable_identity,
        policyTarget === finding.stable_identity
          ? finding.stable_identity
          : policyTarget,
      );
    } else if (finding.kind === 'host_boundary') {
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
    if (!host) {
      // Already unresolved via confidence; nothing further to invent.
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Identity / node helpers
// ---------------------------------------------------------------------------

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
        a.span.start_offset - b.span.start_offset ||
        a.stable_identity.localeCompare(b.stable_identity),
    );

  if (components.length === 1) {
    return components[0].stable_identity;
  }
  if (components.length > 1) {
    // Choose the nearest preceding component by span when available.
    const preceding = components
      .filter(c => c.span.start_offset <= finding.span.start_offset)
      .sort((a, b) => b.span.start_offset - a.span.start_offset);
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
        Math.abs(a.span.start_offset - finding.span.start_offset) -
          Math.abs(b.span.start_offset - finding.span.start_offset) ||
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
          schema_version: GUI_OPTIMIZER_SCHEMA_VERSION,
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

  // Ensure every edge endpoint is represented as a node (logical identity only).
  for (const edge of edges) {
    for (const identity of [edge.source_identity, edge.target_identity]) {
      if (nodes.has(identity)) continue;
      const kind = kindFromIdentity(identity);
      nodes.set(
        identity,
        freezeNode({
          schema_version: GUI_OPTIMIZER_SCHEMA_VERSION,
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
        schema_version: GUI_OPTIMIZER_SCHEMA_VERSION,
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
  ];
  return (known as readonly string[]).includes(kind)
    ? (kind as GuiFindingKind)
    : 'unknown';
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const RELATION_SET = new Set<string>(UI_DEPENDENCY_RELATIONS);
const IDENTITY_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

function isFiniteRelation(value: string): value is UiDependencyRelation {
  return RELATION_SET.has(value);
}

function isLogicalIdentity(value: string): boolean {
  return typeof value === 'string' && IDENTITY_RE.test(value);
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

function freezeEdge(edge: UiDependencyEdge): UiDependencyEdge {
  return Object.freeze({
    ...edge,
    span: edge.span ? Object.freeze({ ...edge.span }) : null,
  });
}

function freezeNode(node: UiGraphNode): UiGraphNode {
  return Object.freeze({
    ...node,
    finding_ids: Object.freeze([...node.finding_ids]),
  });
}

function compareEdges(a: UiDependencyEdge, b: UiDependencyEdge): number {
  return (
    a.source_identity.localeCompare(b.source_identity) ||
    a.target_identity.localeCompare(b.target_identity) ||
    a.relation.localeCompare(b.relation) ||
    a.edge_id.localeCompare(b.edge_id)
  );
}

function compareNodes(a: UiGraphNode, b: UiGraphNode): number {
  return (
    a.identity.localeCompare(b.identity) ||
    a.kind.localeCompare(b.kind) ||
    a.name.localeCompare(b.name)
  );
}

// Re-export edge type for consumers of UiDependencyEdge@1.
export type { UiDependencyEdge };
