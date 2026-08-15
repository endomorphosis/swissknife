/**
 * Non-executing GUI static scanner (GuiStaticScanner@1).
 *
 * Uses the TypeScript compiler API for JS/TS/JSX/TSX and bounded tokenizers for
 * standalone HTML/CSS. Never evaluates modules, templates, browser globals,
 * plugins, or repository scripts. Dynamic constructions lower confidence and
 * record unresolved causes. Edge fields and shared enums mirror VGO-001.
 */

import { createRequire } from 'node:module';
import type * as TsNamespace from 'typescript';
import {
  GUI_STATIC_EXTRACTOR_VERSION,
  GUI_STATIC_SCANNER_INTERFACE,
  GUI_STATIC_SCAN_RESULT_SCHEMA,
  GUI_SOURCE_FINDING_INTERFACE,
  GUI_SOURCE_FINDING_SCHEMA,
  UI_DEPENDENCY_EDGE_INTERFACE,
  UI_DEPENDENCY_EDGE_SCHEMA,
  type GuiExtractionConfidence,
  type GuiExtractionMethod,
  type GuiFindingKind,
  type GuiSourceFinding,
  type GuiSourceLanguage,
  type GuiSourceSpan,
  type GuiStaticScanResult,
  type UiDependencyEdge,
  type GuiDependencyRelation,
  type GuiCompletenessBoundary,
  type GuiComponentKind,
  worstGuiExtractionConfidence,
  requiresRawSourceForConfidence,
  makeSourceSpan,
} from './models.js';

/**
 * Load the TypeScript compiler API via createRequire so vitest/esbuild does not
 * attempt to pre-bundle the large CJS typescript package (a common source of
 * "Transform failed" errors under browser-polyfill aliases).
 */
const require = createRequire(import.meta.url);
const ts: typeof TsNamespace = require('typescript');

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const DEFAULT_MAX_SOURCE_BYTES = 2 * 1024 * 1024;
export const DEFAULT_MAX_AST_NODES = 250000;

export interface GuiScanSourceInput {
  readonly path: string;
  readonly content: string;
  readonly language?: GuiSourceLanguage | 'auto' | string;
}

export interface GuiScanOptions {
  readonly applicationId?: string;
  readonly screenId?: string;
  readonly packageNamespace?: string;
  readonly maxSourceBytes?: number;
  readonly maxAstNodes?: number;
}

export interface GuiStaticScanner {
  readonly extractorVersion: string;
  scanSource(
    input: GuiScanSourceInput,
    options?: GuiScanOptions,
  ): GuiStaticScanResult;
  scanSources(
    inputs: readonly GuiScanSourceInput[],
    options?: GuiScanOptions,
  ): GuiStaticScanResult;
}

export function createGuiStaticScanner(): GuiStaticScanner {
  return {
    extractorVersion: GUI_STATIC_EXTRACTOR_VERSION,
    scanSource(input, options) {
      return scanGuiSource(input, options);
    },
    scanSources(inputs, options) {
      return scanGuiSources(inputs, options);
    },
  };
}

export function scanGuiSource(
  input: GuiScanSourceInput,
  options: GuiScanOptions = {},
): GuiStaticScanResult {
  return scanGuiSources([input], options);
}

export function scanGuiSources(
  inputs: readonly GuiScanSourceInput[],
  options: GuiScanOptions = {},
): GuiStaticScanResult {
  const optionConfidence = validateOptions(options);
  const maxSourceBytes = finitePositiveInt(
    options.maxSourceBytes,
    DEFAULT_MAX_SOURCE_BYTES,
  );
  const maxAstNodes = finitePositiveInt(
    options.maxAstNodes,
    DEFAULT_MAX_AST_NODES,
  );
  const applicationId = sanitizeId(options.applicationId ?? 'unknown-application');
  const screenId = sanitizeId(options.screenId ?? 'unknown-screen');
  const packageNamespace = sanitizeId(
    options.packageNamespace ?? 'org.hallucinate.swissknife.gui-optimizer',
  );

  const findings: GuiSourceFinding[] = [];
  const edges: UiDependencyEdge[] = [];
  const unresolved: string[] = [];
  const sources: string[] = [];
  let findingCounter = 0;
  const identityCounts = new Map<string, number>();
  const emittedIdentities = new Set<string>();
  // Track source-level confidence even when a source emits no findings/edges
  // (e.g. invalid language on a trivial snippet must not stay "exact").
  let sourceConfidence: GuiExtractionConfidence = optionConfidence;

  if (optionConfidence !== 'exact') {
    unresolved.push(`options:${optionConfidence}`);
  }

  const sortedInputs = [...inputs].sort((a, b) =>
    a.path.localeCompare(b.path),
  );

  for (const input of sortedInputs) {
    validatePath(input.path);
    if (typeof input.content !== 'string') {
      throw new Error(`source content for ${input.path} must be a string`);
    }
    if (utf8ByteLength(input.content) > maxSourceBytes) {
      unresolved.push(`${input.path}:source_bytes_exceeded`);
      sourceConfidence = worstGuiExtractionConfidence([
        sourceConfidence,
        'opaque',
      ]);
      continue;
    }
    sources.push(input.path);

    const languageResolution = resolveLanguage(input);
    const language = languageResolution.language;
    const languageConfidence = worstGuiExtractionConfidence([
      optionConfidence,
      languageResolution.confidence,
    ]);
    sourceConfidence = worstGuiExtractionConfidence([
      sourceConfidence,
      languageConfidence,
    ]);
    if (languageResolution.confidence !== 'exact') {
      unresolved.push(
        `${input.path}:invalid_language:${String(input.language)}`,
      );
    }

    const ctx: ScanContext = {
      path: input.path,
      content: input.content,
      language,
      applicationId,
      screenId,
      packageNamespace,
      maxAstNodes,
      baseConfidence: languageConfidence,
      nextFindingId: () => {
        findingCounter += 1;
        return `finding:${findingCounter.toString().padStart(4, '0')}`;
      },
      identityCounts,
      emittedIdentities,
      findings,
      edges,
      unresolved,
    };

    if (language === 'html') {
      scanHtmlDocument(ctx, input.content, 0, languageConfidence, 'html_parser');
    } else if (language === 'css') {
      scanCssText(ctx, input.content, 0, languageConfidence, 'css_parser');
    } else {
      scanScriptSource(ctx);
    }

    // Parser/malformed downgrades mutate ctx.baseConfidence; fold them in.
    sourceConfidence = worstGuiExtractionConfidence([
      sourceConfidence,
      ctx.baseConfidence,
    ]);
  }

  // Resolve edge targets: every target must be emitted or explicitly unresolved.
  finalizeEdges(edges, emittedIdentities, unresolved);

  findings.sort(compareFindings);
  edges.sort(compareEdges);
  unresolved.sort((a, b) => a.localeCompare(b));
  sources.sort((a, b) => a.localeCompare(b));

  const classification = worstGuiExtractionConfidence([
    sourceConfidence,
    ...findings.map(finding => finding.confidence),
    ...edges.map(edge => edge.confidence),
  ]);
  const completeness: GuiCompletenessBoundary =
    unresolved.length > 0 || classification !== 'exact'
      ? 'partial'
      : 'complete_within_boundary';

  return Object.freeze({
    interface: GUI_STATIC_SCANNER_INTERFACE,
    schema_version: GUI_STATIC_SCAN_RESULT_SCHEMA,
    extractor_version: GUI_STATIC_EXTRACTOR_VERSION,
    sources: Object.freeze([...sources]),
    findings: Object.freeze(findings.map(freezeFinding)),
    edges: Object.freeze(edges.map(freezeEdge)),
    analysis_classification: classification,
    verification_status: 'unverified',
    completeness_boundary: completeness,
    unresolved: Object.freeze([...unresolved]),
    executed_code: false as const,
  });
}

// ---------------------------------------------------------------------------
// Internal context
// ---------------------------------------------------------------------------

interface ScanContext {
  path: string;
  content: string;
  language: GuiSourceLanguage;
  applicationId: string;
  screenId: string;
  packageNamespace: string;
  maxAstNodes: number;
  baseConfidence: GuiExtractionConfidence;
  nextFindingId: () => string;
  identityCounts: Map<string, number>;
  emittedIdentities: Set<string>;
  findings: GuiSourceFinding[];
  edges: UiDependencyEdge[];
  unresolved: string[];
}

function freezeFinding(finding: GuiSourceFinding): GuiSourceFinding {
  return Object.freeze({
    ...finding,
    attributes: Object.freeze({ ...finding.attributes }),
    span: Object.freeze({ ...finding.span }),
  });
}

function freezeEdge(edge: UiDependencyEdge): UiDependencyEdge {
  return Object.freeze({
    ...edge,
    source_span: edge.source_span
      ? Object.freeze({ ...edge.source_span })
      : null,
  });
}

function validatePath(path: string): void {
  if (
    typeof path !== 'string' ||
    path.length === 0 ||
    path.startsWith('/') ||
    path.includes('..')
  ) {
    throw new Error(`invalid repository-relative path: ${String(path)}`);
  }
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function sanitizeId(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9._:/#@-]+/g, '_')
    .slice(0, 256) || 'anonymous';
}

function finitePositiveInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function validateOptions(options: GuiScanOptions): GuiExtractionConfidence {
  let confidence: GuiExtractionConfidence = 'exact';
  for (const key of ['maxSourceBytes', 'maxAstNodes'] as const) {
    const value = options[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      confidence = 'opaque';
    }
  }
  for (const key of ['applicationId', 'screenId', 'packageNamespace'] as const) {
    const value = options[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string' || value.length === 0) {
      confidence = worstGuiExtractionConfidence([confidence, 'conservative']);
    }
  }
  return confidence;
}

function resolveLanguage(input: GuiScanSourceInput): {
  language: GuiSourceLanguage;
  confidence: GuiExtractionConfidence;
} {
  if (input.language && input.language !== 'auto') {
    const allowed = new Set([
      'javascript',
      'jsx',
      'typescript',
      'tsx',
      'html',
      'css',
    ]);
    if (!allowed.has(input.language)) {
      // Invalid language cannot be labeled exact.
      return { language: 'javascript', confidence: 'opaque' };
    }
    return {
      language: input.language as GuiSourceLanguage,
      confidence: 'exact',
    };
  }
  const lower = input.path.toLowerCase();
  if (lower.endsWith('.tsx')) return { language: 'tsx', confidence: 'exact' };
  if (lower.endsWith('.jsx')) return { language: 'jsx', confidence: 'exact' };
  if (lower.endsWith('.ts') || lower.endsWith('.mts') || lower.endsWith('.cts')) {
    return { language: 'typescript', confidence: 'exact' };
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return { language: 'html', confidence: 'exact' };
  }
  if (lower.endsWith('.css')) return { language: 'css', confidence: 'exact' };
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
    return { language: 'javascript', confidence: 'exact' };
  }
  return { language: 'javascript', confidence: 'conservative' };
}

function scriptKindFor(language: GuiSourceLanguage): ts.ScriptKind {
  switch (language) {
    case 'tsx':
      return ts.ScriptKind.TSX;
    case 'jsx':
      return ts.ScriptKind.JSX;
    case 'typescript':
      return ts.ScriptKind.TS;
    case 'javascript':
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.JS;
  }
}

// ---------------------------------------------------------------------------
// Span helpers
// ---------------------------------------------------------------------------

interface OffsetSpan {
  start: number;
  end: number;
  span: GuiSourceSpan;
}

function spanFromOffsets(
  path: string,
  content: string,
  start: number,
  end: number,
): OffsetSpan {
  const safeStart = Math.max(0, Math.min(start, content.length));
  const safeEnd = Math.max(safeStart, Math.min(end, content.length));
  const startPos = offsetToLineColumn(content, safeStart);
  const endPos = offsetToLineColumn(content, safeEnd);
  return {
    start: safeStart,
    end: safeEnd,
    span: makeSourceSpan({
      path,
      start_line: startPos.line,
      start_column: startPos.column,
      end_line: endPos.line,
      end_column: endPos.column,
    }),
  };
}

function offsetToLineColumn(
  content: string,
  offset: number,
): { line: number; column: number } {
  let line = 1;
  let column = 0;
  const limit = Math.min(offset, content.length);
  for (let i = 0; i < limit; i += 1) {
    if (content.charCodeAt(i) === 10) {
      line += 1;
      column = 0;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function nodeSpan(
  ctx: ScanContext,
  sourceFile: ts.SourceFile,
  node: ts.Node,
): OffsetSpan {
  const start = node.getStart(sourceFile, false);
  const end = node.getEnd();
  return spanFromOffsets(ctx.path, ctx.content, start, end);
}

// ---------------------------------------------------------------------------
// Finding / edge emission
// ---------------------------------------------------------------------------

function allocateIdentity(
  ctx: ScanContext,
  kind: GuiFindingKind,
  logicalName: string,
): { identity: string; occurrence: number } {
  const normalized = logicalName
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9._:/-]+/g, '_')
    .slice(0, 160) || 'anonymous';
  // Document-order occurrence — not a source line number.
  const key = `${ctx.path}|${kind}|${normalized}`;
  const occurrence = (ctx.identityCounts.get(key) ?? 0) + 1;
  ctx.identityCounts.set(key, occurrence);
  const slug =
    occurrence === 1 ? normalized : `${normalized}#${occurrence}`;
  const identity = `${ctx.applicationId}/${ctx.screenId}/${kind}/${slug}`;
  return { identity, occurrence };
}

function clampConfidence(
  ctx: ScanContext,
  confidence: GuiExtractionConfidence,
): GuiExtractionConfidence {
  return worstGuiExtractionConfidence([ctx.baseConfidence, confidence]);
}

function emitFinding(
  ctx: ScanContext,
  partial: {
    kind: GuiFindingKind;
    name: string;
    span: GuiSourceSpan;
    confidence: GuiExtractionConfidence;
    extraction_method: GuiExtractionMethod;
    attributes?: Record<string, string>;
    evidence: string;
    identityName?: string;
    unresolvedCause?: string;
  },
): GuiSourceFinding {
  const confidence = clampConfidence(ctx, partial.confidence);
  const { identity, occurrence } = allocateIdentity(
    ctx,
    partial.kind,
    partial.identityName ?? partial.name,
  );
  const attributes: Record<string, string> = {
    ...(partial.attributes ?? {}),
  };
  if (partial.kind === 'component') {
    attributes.package_namespace = ctx.packageNamespace;
    attributes.application_id = ctx.applicationId;
    attributes.screen_id = ctx.screenId;
  }
  if (partial.unresolvedCause) {
    attributes.unresolved_cause = partial.unresolvedCause;
  }
  const finding: GuiSourceFinding = {
    interface: GUI_SOURCE_FINDING_INTERFACE,
    schema_version: GUI_SOURCE_FINDING_SCHEMA,
    finding_id: ctx.nextFindingId(),
    kind: partial.kind,
    name: partial.name,
    stable_identity: identity,
    path: ctx.path,
    span: partial.span,
    confidence,
    extraction_method: partial.extraction_method,
    extractor_version: GUI_STATIC_EXTRACTOR_VERSION,
    attributes: Object.freeze(attributes),
    evidence: partial.evidence.slice(0, 512),
    requires_raw_source: requiresRawSourceForConfidence(confidence),
    language: ctx.language,
    occurrence,
  };
  ctx.findings.push(finding);
  ctx.emittedIdentities.add(identity);
  if (confidence === 'opaque' || confidence === 'heuristic') {
    const cause =
      partial.unresolvedCause ?? attributes.unresolved_cause ?? confidence;
    ctx.unresolved.push(`${identity}:${cause}`);
  } else if (partial.unresolvedCause) {
    ctx.unresolved.push(`${identity}:${partial.unresolvedCause}`);
  }
  return finding;
}

function emitEdge(
  ctx: ScanContext,
  partial: {
    source: string;
    target: string;
    relation: GuiDependencyRelation;
    span: GuiSourceSpan | null;
    confidence: GuiExtractionConfidence;
    extraction_method: GuiExtractionMethod;
    notes?: string;
  },
): void {
  const confidence = clampConfidence(ctx, partial.confidence);
  ctx.edges.push({
    interface: UI_DEPENDENCY_EDGE_INTERFACE,
    schema_version: UI_DEPENDENCY_EDGE_SCHEMA,
    source_component_id: partial.source,
    target_component_id: partial.target,
    relation: partial.relation,
    extraction_method: partial.extraction_method,
    extractor_version: GUI_STATIC_EXTRACTOR_VERSION,
    confidence,
    source_span: partial.span,
    notes: partial.notes ?? '',
  });
}

function finalizeEdges(
  edges: UiDependencyEdge[],
  emitted: Set<string>,
  unresolved: string[],
): void {
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    if (!emitted.has(edge.target_component_id)) {
      const notes = edge.notes
        ? `${edge.notes};unresolved_target`
        : 'unresolved_target';
      edges[i] = Object.freeze({
        ...edge,
        confidence: worstGuiExtractionConfidence([
          edge.confidence,
          'opaque',
        ]),
        notes,
        target_component_id: `unresolved:${edge.target_component_id}`,
      });
      unresolved.push(
        `${edge.source_component_id}->${edge.target_component_id}:unresolved_target`,
      );
      emitted.add(edges[i].target_component_id);
    }
    if (!emitted.has(edge.source_component_id)) {
      const notes = edges[i].notes
        ? `${edges[i].notes};unresolved_source`
        : 'unresolved_source';
      edges[i] = Object.freeze({
        ...edges[i],
        confidence: worstGuiExtractionConfidence([
          edges[i].confidence,
          'opaque',
        ]),
        notes,
        source_component_id: `unresolved:${edge.source_component_id}`,
      });
      unresolved.push(
        `${edge.source_component_id}:unresolved_source`,
      );
      emitted.add(edges[i].source_component_id);
    }
  }
}

function compareFindings(a: GuiSourceFinding, b: GuiSourceFinding): number {
  return (
    a.path.localeCompare(b.path) ||
    a.span.start_line - b.span.start_line ||
    a.span.start_column - b.span.start_column ||
    a.kind.localeCompare(b.kind) ||
    a.name.localeCompare(b.name) ||
    a.occurrence - b.occurrence ||
    a.finding_id.localeCompare(b.finding_id)
  );
}

function compareEdges(a: UiDependencyEdge, b: UiDependencyEdge): number {
  return (
    a.source_component_id.localeCompare(b.source_component_id) ||
    a.target_component_id.localeCompare(b.target_component_id) ||
    a.relation.localeCompare(b.relation) ||
    a.notes.localeCompare(b.notes)
  );
}

// ---------------------------------------------------------------------------
// Script / TS / JSX scanning
// ---------------------------------------------------------------------------

function scanScriptSource(ctx: ScanContext): void {
  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      ctx.path,
      ctx.content,
      ts.ScriptTarget.ES2022,
      true,
      scriptKindFor(ctx.language),
    );
  } catch {
    emitFinding(ctx, {
      kind: 'dynamic_uncertainty',
      name: 'malformed_source',
      span: spanFromOffsets(ctx.path, ctx.content, 0, Math.min(1, ctx.content.length)).span,
      confidence: 'opaque',
      extraction_method: 'typescript_compiler_api',
      evidence: 'TypeScript parser rejected source',
      unresolvedCause: 'malformed_source',
    });
    return;
  }

  // Parse diagnostics: syntax errors cannot be labeled exact.
  const diagnostics = (sourceFile as ts.SourceFile & {
    parseDiagnostics?: readonly ts.Diagnostic[];
  }).parseDiagnostics;
  if (diagnostics && diagnostics.length > 0) {
    ctx.baseConfidence = worstGuiExtractionConfidence([
      ctx.baseConfidence,
      'conservative',
    ]);
    emitFinding(ctx, {
      kind: 'dynamic_uncertainty',
      name: 'parse_diagnostics',
      span: spanFromOffsets(ctx.path, ctx.content, 0, Math.min(1, ctx.content.length)).span,
      confidence: 'conservative',
      extraction_method: 'typescript_compiler_api',
      evidence: `Source has ${diagnostics.length} parse diagnostic(s)`,
      unresolvedCause: 'malformed_source',
    });
  }

  let nodeCount = 0;
  const countNodes = (node: ts.Node): void => {
    nodeCount += 1;
    if (nodeCount > ctx.maxAstNodes) return;
    ts.forEachChild(node, countNodes);
  };
  countNodes(sourceFile);
  if (nodeCount > ctx.maxAstNodes) {
    ctx.unresolved.push(`${ctx.path}:ast_node_limit`);
    emitFinding(ctx, {
      kind: 'dynamic_uncertainty',
      name: 'ast_node_limit',
      span: spanFromOffsets(ctx.path, ctx.content, 0, Math.min(1, ctx.content.length)).span,
      confidence: 'opaque',
      extraction_method: 'typescript_compiler_api',
      evidence: `AST exceeded ${ctx.maxAstNodes} nodes; incomplete scan.`,
      unresolvedCause: 'ast_node_limit',
    });
    return;
  }

  const visit = (
    node: ts.Node,
    parentComponent: string | null,
    jsxParent: string | null,
  ): void => {
    let nextParent = parentComponent;
    let nextJsxParent = jsxParent;

    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)
    ) {
      const component = maybeEmitFunctionComponent(
        ctx,
        sourceFile,
        node,
        parentComponent,
      );
      if (component) {
        nextParent = component.stable_identity;
        nextJsxParent = null;
      }
    }
    if (ts.isClassDeclaration(node)) {
      const component = maybeEmitClassComponent(ctx, sourceFile, node);
      if (component) {
        nextParent = component.stable_identity;
        nextJsxParent = null;
      }
    }
    if (
      ts.isJsxElement(node) ||
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxFragment(node)
    ) {
      const jsxFinding = extractJsx(
        ctx,
        sourceFile,
        node,
        nextParent,
        jsxParent,
      );
      if (jsxFinding) nextJsxParent = jsxFinding.stable_identity;
    }
    if (ts.isCallExpression(node)) {
      extractCallPatterns(ctx, sourceFile, node, nextParent);
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      extractGlobalAccess(ctx, sourceFile, node);
    }
    if (ts.isBinaryExpression(node)) {
      extractAssignments(ctx, sourceFile, node, nextParent);
    }
    if (
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node) ||
      ts.isStringLiteral(node)
    ) {
      extractTemplateOrString(ctx, sourceFile, node, nextParent);
    }
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      extractImportExport(ctx, sourceFile, node);
    }
    if (ts.isVariableDeclaration(node)) {
      extractStateLike(ctx, sourceFile, node, nextParent);
    }

    ts.forEachChild(node, child => visit(child, nextParent, nextJsxParent));
  };

  visit(sourceFile, null, null);
  scanPatternCanaries(ctx);
}

function componentNameFromFunction(
  node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction,
): string | null {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return node.name.text;
  }
  if (ts.isFunctionExpression(node) && node.name) {
    return node.name.text;
  }
  return null;
}

function looksLikeComponentName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9_]*$/.test(name);
}

function functionBodyHasJsx(node: ts.Node): boolean {
  let found = false;
  const walk = (child: ts.Node): void => {
    if (found) return;
    if (
      ts.isJsxElement(child) ||
      ts.isJsxSelfClosingElement(child) ||
      ts.isJsxFragment(child)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, walk);
  };
  walk(node);
  return found;
}

function maybeEmitFunctionComponent(
  ctx: ScanContext,
  sourceFile: ts.SourceFile,
  node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction,
  parentComponent: string | null,
): GuiSourceFinding | null {
  const name = componentNameFromFunction(node);
  if (!name || !looksLikeComponentName(name)) return null;
  if (!functionBodyHasJsx(node)) return null;
  const offset = nodeSpan(ctx, sourceFile, node);
  const finding = emitFinding(ctx, {
    kind: 'component',
    name,
    span: offset.span,
    confidence: 'exact',
    extraction_method: 'typescript_compiler_api',
    attributes: {
      component_kind: 'composite' as GuiComponentKind,
      parent: parentComponent ?? '',
    },
    evidence: `React function component ${name}`,
    identityName: name,
  });

  if (parentComponent) {
    emitEdge(ctx, {
      source: parentComponent,
      target: finding.stable_identity,
      relation: 'contains',
      span: offset.span,
      confidence: 'exact',
      extraction_method: 'typescript_compiler_api',
      notes: 'parent_child',
    });
    emitFinding(ctx, {
      kind: 'child',
      name,
      span: offset.span,
      confidence: 'exact',
      extraction_method: 'typescript_compiler_api',
      attributes: {
        parent: parentComponent,
        child: finding.stable_identity,
      },
      evidence: `Child component ${name}`,
      identityName: `${name}:child`,
    });
  }

  // Emit parameter props when statically named.
  for (const param of node.parameters) {
    if (ts.isObjectBindingPattern(param.name)) {
      for (const element of param.name.elements) {
        if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
          const propName = element.name.text;
          const propFinding = emitFinding(ctx, {
            kind: 'prop',
            name: propName,
            span: nodeSpan(ctx, sourceFile, element).span,
            confidence: 'exact',
            extraction_method: 'typescript_compiler_api',
            attributes: { host: finding.stable_identity },
            evidence: `Destructured prop ${propName}`,
            identityName: `${name}.prop.${propName}`,
          });
          emitEdge(ctx, {
            source: finding.stable_identity,
            target: propFinding.stable_identity,
            relation: 'reads_state',
            span: propFinding.span,
            confidence: 'exact',
            extraction_method: 'typescript_compiler_api',
            notes: 'prop',
          });
        }
      }
    } else if (ts.isIdentifier(param.name)) {
      const propFinding = emitFinding(ctx, {
        kind: 'prop',
        name: param.name.text,
        span: nodeSpan(ctx, sourceFile, param).span,
        confidence: 'exact',
        extraction_method: 'typescript_compiler_api',
        attributes: { host: finding.stable_identity },
        evidence: `Component props parameter ${param.name.text}`,
        identityName: `${name}.prop.${param.name.text}`,
      });
      emitEdge(ctx, {
        source: finding.stable_identity,
        target: propFinding.stable_identity,
        relation: 'reads_state',
        span: propFinding.span,
        confidence: 'exact',
        extraction_method: 'typescript_compiler_api',
        notes: 'prop',
      });
    }
  }

  return finding;
}

function maybeEmitClassComponent(
  ctx: ScanContext,
  sourceFile: ts.SourceFile,
  node: ts.ClassDeclaration,
): GuiSourceFinding | null {
  const name = node.name?.text;
  if (!name || !looksLikeComponentName(name)) return null;
  const hasRender = node.members.some(
    member =>
      ts.isMethodDeclaration(member) &&
      member.name &&
      ts.isIdentifier(member.name) &&
      member.name.text === 'render',
  );
  const extendsReact =
    node.heritageClauses?.some(clause =>
      clause.types.some(typeNode =>
        /^(React\.)?(Component|PureComponent)$/.test(
          typeNode.expression.getText(sourceFile),
        ),
      ),
    ) ?? false;
  if (!hasRender && !extendsReact && !functionBodyHasJsx(node)) return null;
  return emitFinding(ctx, {
    kind: 'component',
    name,
    span: nodeSpan(ctx, sourceFile, node).span,
    confidence: 'exact',
    extraction_method: 'typescript_compiler_api',
    attributes: {
      component_kind: 'composite' as GuiComponentKind,
      has_render: hasRender ? 'true' : 'false',
    },
    evidence: `React class component ${name}`,
  });
}

function jsxTagName(
  node: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxOpeningElement,
): string | null {
  const tag =
    ts.isJsxElement(node)
      ? node.openingElement.tagName
      : ts.isJsxSelfClosingElement(node)
        ? node.tagName
        : node.tagName;
  return tag.getText();
}

function classifyJsxTag(tag: string): GuiFindingKind {
  const lower = tag.toLowerCase();
  if (lower === 'form') return 'form';
  if (lower === 'button') return 'button';
  if (lower === 'a') return 'link';
  if (
    lower === 'input' ||
    lower === 'textarea' ||
    lower === 'select' ||
    lower === 'option'
  ) {
    return 'input';
  }
  if (lower === 'label') return 'label';
  if (lower === 'dialog' || lower.includes('modal') || lower.includes('dialog')) {
    return 'dialog';
  }
  if (lower === 'menu' || lower === 'nav') return 'menu';
  if (/^[A-Z]/.test(tag)) return 'component';
  return 'element';
}

function componentKindForTag(tag: string): GuiComponentKind {
  const lower = tag.toLowerCase();
  if (lower === 'form') return 'form';
  if (lower === 'button') return 'button';
  if (lower === 'a') return 'link';
  if (lower === 'input' || lower === 'textarea' || lower === 'select') {
    return 'input';
  }
  if (lower === 'label') return 'label';
  if (lower === 'dialog') return 'dialog';
  if (lower === 'menu') return 'menu';
  if (lower === 'nav') return 'nav';
  if (lower === 'table') return 'table';
  if (lower === 'ul' || lower === 'ol' || lower === 'li') return 'list';
  if (lower === 'img') return 'image';
  if (lower === 'span' || lower === 'p' || lower === 'h1' || lower === 'h2') {
    return 'text';
  }
  if (/^[A-Z]/.test(tag)) return 'composite';
  return 'unknown';
}

function extractJsx(
  ctx: ScanContext,
  sourceFile: ts.SourceFile,
  node: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment,
  parentComponent: string | null,
  jsxParent: string | null,
): GuiSourceFinding | null {
  if (ts.isJsxFragment(node)) {
    const finding = emitFinding(ctx, {
      kind: 'element',
      name: 'Fragment',
      span: nodeSpan(ctx, sourceFile, node).span,
      confidence: 'exact',
      extraction_method: 'jsx_parser',
      attributes: {
        parent: parentComponent ?? jsxParent ?? '',
        component_kind: 'composite',
      },
      evidence: 'JSX fragment',
    });
    linkJsxParent(ctx, finding, parentComponent, jsxParent);
    return finding;
  }

  const tag = jsxTagName(node);
  if (!tag) return null;
  const kind = classifyJsxTag(tag);
  const attributes = collectJsxAttributes(
    sourceFile,
    ts.isJsxElement(node) ? node.openingElement : node,
  );
  let confidence: GuiExtractionConfidence = 'exact';
  let unresolvedCause: string | undefined;
  if (attributes['__dynamic_component'] === 'true') {
    confidence = 'opaque';
    unresolvedCause = 'dynamic_component';
  }
  if (tag === 'script' && /https?:\/\//i.test(attributes.src ?? '')) {
    confidence = 'opaque';
    unresolvedCause = 'remote_script';
  }

  const stableName =
    attributes.id ||
    attributes['data-testid'] ||
    attributes.name ||
    attributes['data-action'] ||
    attributes.role ||
    tag;

  const structuralParent = jsxParent ?? parentComponent ?? '';
  const finding = emitFinding(ctx, {
    kind,
    name: tag,
    span: nodeSpan(ctx, sourceFile, node).span,
    confidence,
    extraction_method: 'jsx_parser',
    attributes: {
      ...attributes,
      parent: structuralParent,
      component_kind: componentKindForTag(tag),
    },
    evidence: `JSX <${tag}>`,
    identityName: stableName,
    unresolvedCause,
  });

  linkJsxParent(ctx, finding, parentComponent, jsxParent);

  if (attributes.dangerouslySetInnerHTML) {
    emitFinding(ctx, {
      kind: 'dynamic_uncertainty',
      name: 'dangerouslySetInnerHTML',
      span: finding.span,
      confidence: 'opaque',
      extraction_method: 'jsx_parser',
      attributes: { host: finding.stable_identity },
      evidence: 'Runtime HTML insertion via dangerouslySetInnerHTML',
      unresolvedCause: 'dynamic_html',
    });
  }

  for (const [key, value] of Object.entries(attributes)) {
    if (key.startsWith('__')) continue;

    const propDynamic =
      value.includes('{') || value.includes('${') || value.includes('...');
    const propFinding = emitFinding(ctx, {
      kind: 'prop',
      name: key,
      span: finding.span,
      confidence: propDynamic ? 'conservative' : 'exact',
      extraction_method: 'jsx_parser',
      attributes: {
        value: value.slice(0, 200),
        host: finding.stable_identity,
      },
      evidence: `JSX prop ${key}`,
      identityName: `${stableName}.prop.${key}`,
    });
    emitEdge(ctx, {
      source: finding.stable_identity,
      target: propFinding.stable_identity,
      relation: 'reads_state',
      span: finding.span,
      confidence: propDynamic ? 'conservative' : 'exact',
      extraction_method: 'jsx_parser',
      notes: 'prop',
    });

    if (
      key.startsWith('aria-') ||
      key === 'role' ||
      key === 'tabIndex' ||
      key === 'tabindex'
    ) {
      emitFinding(ctx, {
        kind: 'accessibility',
        name: key,
        span: finding.span,
        confidence: value.startsWith('{') ? 'conservative' : 'exact',
        extraction_method: 'jsx_parser',
        attributes: { value, host: finding.stable_identity },
        evidence: `Accessibility attribute ${key}=${value}`,
        identityName: `${stableName}:${key}`,
      });
    }
    if (
      key === 'tabIndex' ||
      key === 'tabindex' ||
      key === 'autoFocus' ||
      key === 'autofocus'
    ) {
      emitFinding(ctx, {
        kind: 'focus',
        name: key,
        span: finding.span,
        confidence: value.startsWith('{') ? 'conservative' : 'exact',
        extraction_method: 'jsx_parser',
        attributes: { value, host: finding.stable_identity },
        evidence: `Focus attribute ${key}`,
        identityName: `${stableName}:focus:${key}`,
      });
    }
    if (
      key === 'onKeyDown' ||
      key === 'onKeyUp' ||
      key === 'onKeyPress' ||
      key === 'accessKey' ||
      key === 'accesskey'
    ) {
      emitFinding(ctx, {
        kind: 'keyboard',
        name: key,
        span: finding.span,
        confidence: value.startsWith('{') ? 'conservative' : 'exact',
        extraction_method: 'jsx_parser',
        attributes: { value, host: finding.stable_identity },
        evidence: `Keyboard binding ${key}`,
        identityName: `${stableName}:keyboard:${key}`,
      });
    }
    if (
      key === 'data-policy' ||
      key === 'data-permission' ||
      key === 'data-capability' ||
      /policy/i.test(key)
    ) {
      const policyFinding = emitFinding(ctx, {
        kind: 'policy',
        name: value || key,
        span: finding.span,
        confidence: propDynamic ? 'conservative' : 'exact',
        extraction_method: 'jsx_parser',
        attributes: { attr: key, host: finding.stable_identity },
        evidence: `Policy binding ${key}=${value}`,
        identityName: `${stableName}:policy:${key}`,
      });
      emitEdge(ctx, {
        source: finding.stable_identity,
        target: policyFinding.stable_identity,
        relation: 'depends_on_policy',
        span: finding.span,
        confidence: propDynamic ? 'conservative' : 'exact',
        extraction_method: 'jsx_parser',
      });
    }
    if (key === 'style') {
      const styleFinding = emitFinding(ctx, {
        kind: 'style',
        name: 'inline-style',
        span: finding.span,
        confidence: value.includes('{') ? 'conservative' : 'exact',
        extraction_method: 'jsx_parser',
        attributes: { value, host: finding.stable_identity },
        evidence: 'Inline style binding',
        identityName: `${stableName}:style`,
      });
      emitEdge(ctx, {
        source: finding.stable_identity,
        target: styleFinding.stable_identity,
        relation: 'styled_by',
        span: finding.span,
        confidence: 'exact',
        extraction_method: 'jsx_parser',
      });
    }
    if (key === 'className' || key === 'class') {
      emitFinding(ctx, {
        kind: 'style',
        name: value,
        span: finding.span,
        confidence:
          value.includes('{') || value.includes('${') ? 'conservative' : 'exact',
        extraction_method: 'jsx_parser',
        attributes: { class: value, host: finding.stable_identity },
        evidence: `Class binding ${value}`,
        identityName: `${stableName}:class`,
      });
    }
    if (/^on[A-Z]/.test(key) || (key.startsWith('on') && key.length > 2)) {
      const handlerConfidence: GuiExtractionConfidence =
        value.includes('=>') ||
        value.includes('function') ||
        value.startsWith('{')
          ? 'conservative'
          : 'exact';
      emitFinding(ctx, {
        kind: 'event_handler',
        name: key,
        span: finding.span,
        confidence: handlerConfidence,
        extraction_method: 'jsx_parser',
        attributes: { handler: value, host: finding.stable_identity },
        evidence: `Event handler ${key}`,
        identityName: `${stableName}:${key}`,
      });
    }
    if (key === 'href' || key === 'to' || key === 'action') {
      const isExternal = /^(https?:|mailto:|\/\/)/i.test(value);
      const routeFinding = emitFinding(ctx, {
        kind: isExternal ? 'external_navigation' : 'route',
        name: value,
        span: finding.span,
        confidence:
          value.includes('{') || value.includes('${')
            ? 'conservative'
            : 'exact',
        extraction_method: 'jsx_parser',
        attributes: { attr: key, host: finding.stable_identity },
        evidence: `Navigation target ${value}`,
        identityName: `route:${value}`,
      });
      if (!isExternal && !value.includes('{') && !value.includes('${')) {
        emitEdge(ctx, {
          source: finding.stable_identity,
          target: routeFinding.stable_identity,
          relation: 'routes_to',
          span: finding.span,
          confidence: 'exact',
          extraction_method: 'jsx_parser',
        });
      }
    }
    if (key === 'data-action') {
      const actionDynamic =
        value.includes('${') || value.includes('+') || value.includes('{');
      const actionConfidence: GuiExtractionConfidence = actionDynamic
        ? 'conservative'
        : 'exact';
      const actionFinding = emitFinding(ctx, {
        kind: 'action_binding',
        name: value,
        span: finding.span,
        confidence: actionConfidence,
        extraction_method: 'jsx_parser',
        attributes: { attr: key, host: finding.stable_identity },
        evidence: `Action binding ${key}=${value}`,
        identityName: `action:${value}`,
        unresolvedCause: actionDynamic ? 'computed_action' : undefined,
      });
      emitEdge(ctx, {
        source: finding.stable_identity,
        target: actionFinding.stable_identity,
        relation: 'invokes_action',
        span: finding.span,
        confidence: actionConfidence,
        extraction_method: 'jsx_parser',
      });
    }
    if (/confirm/i.test(key) || /confirm/i.test(value)) {
      const confFinding = emitFinding(ctx, {
        kind: 'confirmation',
        name: `${key}:${value}`,
        span: finding.span,
        confidence: 'exact',
        extraction_method: 'jsx_parser',
        attributes: { host: finding.stable_identity },
        evidence: 'Confirmation-related binding',
        identityName: `confirm:${value || key}`,
      });
      emitEdge(ctx, {
        source: finding.stable_identity,
        target: confFinding.stable_identity,
        relation: 'requires_confirmation',
        span: finding.span,
        confidence: 'exact',
        extraction_method: 'jsx_parser',
      });
    }
    if (
      /delete|destroy|remove|danger|destructive/i.test(value) ||
      /danger/i.test(key)
    ) {
      emitFinding(ctx, {
        kind: 'destructive_action',
        name: value || key,
        span: finding.span,
        confidence: 'heuristic',
        extraction_method: 'heuristic_inference',
        attributes: { host: finding.stable_identity },
        evidence: 'Potentially destructive action naming',
        unresolvedCause: 'destructive_heuristic',
      });
    }
  }

  return finding;
}

function linkJsxParent(
  ctx: ScanContext,
  finding: GuiSourceFinding,
  parentComponent: string | null,
  jsxParent: string | null,
): void {
  if (parentComponent) {
    emitEdge(ctx, {
      source: parentComponent,
      target: finding.stable_identity,
      relation: 'renders',
      span: finding.span,
      confidence: finding.confidence,
      extraction_method: 'jsx_parser',
    });
    emitFinding(ctx, {
      kind: 'parent',
      name: parentComponent,
      span: finding.span,
      confidence: 'exact',
      extraction_method: 'jsx_parser',
      attributes: {
        parent: parentComponent,
        child: finding.stable_identity,
      },
      evidence: 'Parent/render linkage',
      identityName: `parent:${finding.stable_identity}`,
    });
    emitFinding(ctx, {
      kind: 'child',
      name: finding.name,
      span: finding.span,
      confidence: 'exact',
      extraction_method: 'jsx_parser',
      attributes: {
        parent: parentComponent,
        child: finding.stable_identity,
      },
      evidence: 'Child/render linkage',
      identityName: `child:${finding.stable_identity}`,
    });
  }
  if (jsxParent) {
    emitEdge(ctx, {
      source: jsxParent,
      target: finding.stable_identity,
      relation: 'contains',
      span: finding.span,
      confidence: finding.confidence,
      extraction_method: 'jsx_parser',
    });
  }
}

function collectJsxAttributes(
  sourceFile: ts.SourceFile,
  element: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const prop of element.attributes.properties) {
    if (ts.isJsxSpreadAttribute(prop)) {
      attrs.__spread = prop.expression.getText(sourceFile);
      attrs.__dynamic_component = 'true';
      continue;
    }
    if (!ts.isJsxAttribute(prop)) continue;
    const name = prop.name.getText(sourceFile);
    if (!prop.initializer) {
      attrs[name] = 'true';
      continue;
    }
    if (ts.isStringLiteral(prop.initializer)) {
      attrs[name] = prop.initializer.text;
    } else {
      attrs[name] = prop.initializer.getText(sourceFile);
      if (name === 'is' || name === 'component' || name === 'as') {
        if (
          !ts.isStringLiteral(prop.initializer) &&
          !ts.isNoSubstitutionTemplateLiteral(prop.initializer)
        ) {
          attrs.__dynamic_component = 'true';
        }
      }
    }
  }
  const tagText = element.tagName.getText(sourceFile);
  if (tagText.includes('[') || (tagText.includes('.') && !/^[A-Za-z0-9.]+$/.test(tagText))) {
    attrs.__dynamic_component = 'true';
  }
  if (tagText.includes('[')) {
    attrs.__dynamic_component = 'true';
  }
  // Member expression tags like components[name]
  if (ts.isJsxNamespacedName(element.tagName)) {
    // ok
  } else if (!ts.isIdentifier(element.tagName) && !ts.isPropertyAccessExpression(element.tagName)) {
    attrs.__dynamic_component = 'true';
  } else if (
    ts.isPropertyAccessExpression(element.tagName) &&
    element.tagName.getText(sourceFile).includes('[')
  ) {
    attrs.__dynamic_component = 'true';
  }
  return attrs;
}

function extractCallPatterns(
  ctx: ScanContext,
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  parentComponent: string | null,
): void {
  const callee = node.expression.getText(sourceFile);
  const span = nodeSpan(ctx, sourceFile, node).span;

  if (
    callee === 'eval' ||
    callee === 'Function' ||
    callee.endsWith('.eval')
  ) {
    emitFinding(ctx, {
      kind: 'dynamic_uncertainty',
      name: callee === 'Function' ? 'Function' : 'eval',
      span,
      confidence: 'opaque',
      extraction_method: 'typescript_compiler_api',
      attributes: { parent: parentComponent ?? '' },
      evidence: `Dynamic call ${callee}`,
      unresolvedCause: 'code_execution_primitive',
    });
  }

  if (callee === 'setTimeout' || callee === 'setInterval') {
    emitFinding(ctx, {
      kind: 'dynamic_uncertainty',
      name: callee,
      span,
      confidence: 'heuristic',
      extraction_method: 'typescript_compiler_api',
      evidence: `Dynamic call ${callee}`,
      unresolvedCause: 'deferred_callback',
    });
  }

  if (
    callee === 'document.createElement' ||
    callee.endsWith('.createElement') ||
    callee.endsWith('.appendChild') ||
    callee.endsWith('.insertBefore') ||
    callee.endsWith('.replaceChildren') ||
    callee.endsWith('.replaceWith')
  ) {
    const arg0 = node.arguments[0]?.getText(sourceFile) ?? '';
    const isForm =
      /['"]form['"]/i.test(arg0) ||
      (callee.endsWith('.createElement') && /form/i.test(arg0));
    if (isForm && callee.includes('createElement')) {
      emitFinding(ctx, {
        kind: 'form',
        name: 'runtime_generated_form',
        span,
        confidence: 'opaque',
        extraction_method: 'typescript_compiler_api',
        evidence: 'Runtime-generated form via createElement',
        unresolvedCause: 'runtime_generated_form',
      });
    } else {
      emitFinding(ctx, {
        kind: 'dynamic_uncertainty',
        name: callee,
        span,
        confidence: 'conservative',
        extraction_method: 'typescript_compiler_api',
        evidence: `Imperative DOM mutation ${callee}`,
        unresolvedCause: 'imperative_dom',
      });
    }
  }

  if (
    callee.endsWith('.querySelector') ||
    callee.endsWith('.querySelectorAll') ||
    callee.endsWith('.getElementById')
  ) {
    const argNode = node.arguments[0];
    const arg0 = argNode?.getText(sourceFile) ?? '';
    const literal = !!argNode && ts.isStringLiteral(argNode);
    const confidence: GuiExtractionConfidence =
      !literal || arg0.includes('+') || arg0.includes('${')
        ? 'conservative'
        : 'exact';
    emitFinding(ctx, {
      kind: 'element',
      name: `${callee}:${arg0 || 'unknown'}`,
      span,
      confidence,
      extraction_method: 'typescript_compiler_api',
      attributes: { selector_or_event: arg0 },
      evidence: `DOM API ${callee}`,
      unresolvedCause:
        confidence === 'exact' ? undefined : 'dynamic_selector',
    });
  }

  if (callee.endsWith('.addEventListener')) {
    const arg0 = node.arguments[0]?.getText(sourceFile) ?? '';
    // Uncontrolled event delegation: listener on root/document/querySelectorAll results.
    const receiver = ts.isPropertyAccessExpression(node.expression)
      ? node.expression.expression.getText(sourceFile)
      : '';
    const delegated =
      /document|window|root|container|querySelectorAll|forEach/i.test(
        receiver + ctx.content.slice(Math.max(0, node.getStart() - 80), node.getStart()),
      );
    emitFinding(ctx, {
      kind: 'event_handler',
      name: `addEventListener:${arg0 || 'unknown'}`,
      span,
      confidence: delegated ? 'conservative' : 'exact',
      extraction_method: 'typescript_compiler_api',
      attributes: {
        selector_or_event: arg0,
        delegated: delegated ? 'true' : 'false',
      },
      evidence: delegated
        ? `Uncontrolled event delegation via ${callee}`
        : `DOM API ${callee}`,
      unresolvedCause: delegated ? 'event_delegation' : undefined,
    });
  }

  if (
    callee === 'fetch' ||
    callee.endsWith('.fetch') ||
    callee.includes('invoke') ||
    callee.includes('request')
  ) {
    emitFinding(ctx, {
      kind: 'async_operation',
      name: callee,
      span,
      confidence: 'conservative',
      extraction_method: 'typescript_compiler_api',
      evidence: `Async/service call ${callee}`,
    });
  }

  if (callee === 'require') {
    const mod = node.arguments[0];
    const dynamic = !mod || !ts.isStringLiteral(mod);
    emitFinding(ctx, {
      kind: 'import',
      name: mod?.getText(sourceFile) ?? callee,
      span,
      confidence: dynamic ? 'opaque' : 'exact',
      extraction_method: 'typescript_compiler_api',
      evidence: `Module load expression ${callee}`,
      unresolvedCause: dynamic ? 'dynamic_import' : undefined,
    });
  }

  // Dynamic import()
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const mod = node.arguments[0];
    const dynamic = !mod || !ts.isStringLiteral(mod);
    const modText = mod?.getText(sourceFile) ?? 'import()';
    const isStyle =
      /\.css['"`\s)]/.test(modText) || /stylesheet/i.test(modText);
    emitFinding(ctx, {
      kind: isStyle ? 'style' : 'import',
      name: modText,
      span,
      confidence: dynamic || isStyle ? 'opaque' : 'conservative',
      extraction_method: 'typescript_compiler_api',
      evidence: isStyle
        ? 'Dynamically loaded style module'
        : 'Dynamic import()',
      unresolvedCause: isStyle
        ? 'dynamic_style'
        : dynamic
          ? 'dynamic_import'
          : 'dynamic_import',
    });
  }

  // React.createElement dynamic type
  if (callee === 'React.createElement' || callee === 'createElement') {
    const typeArg = node.arguments[0];
    if (typeArg && !ts.isStringLiteral(typeArg) && !ts.isIdentifier(typeArg)) {
      emitFinding(ctx, {
        kind: 'widget',
        name: typeArg.getText(sourceFile),
        span,
        confidence: 'opaque',
        extraction_method: 'typescript_compiler_api',
        evidence: 'Dynamic createElement type',
        unresolvedCause: 'dynamic_component',
      });
    } else if (typeArg && ts.isIdentifier(typeArg) && !looksLikeComponentName(typeArg.text)) {
      // lowercase host element — exact
      emitFinding(ctx, {
        kind: 'element',
        name: typeArg.text,
        span,
        confidence: 'exact',
        extraction_method: 'typescript_compiler_api',
        evidence: `createElement(${typeArg.text})`,
      });
    }
  }

  // React.lazy / dynamic component loaders
  if (callee === 'React.lazy' || callee === 'lazy' || callee.endsWith('.lazy')) {
    emitFinding(ctx, {
      kind: 'widget',
      name: 'React.lazy',
      span,
      confidence: 'opaque',
      extraction_method: 'typescript_compiler_api',
      evidence: 'Dynamically loaded component',
      unresolvedCause: 'dynamic_component',
    });
  }

  if (callee === 'customElements.define' || callee.endsWith('customElements.define')) {
    emitFinding(ctx, {
      kind: 'widget',
      name: 'customElements.define',
      span,
      confidence: 'conservative',
      extraction_method: 'typescript_compiler_api',
      evidence: 'Custom element / unknown widget registration',
      unresolvedCause: 'unknown_widget',
    });
  }

  // setAttribute data-action with computed name
  if (callee.endsWith('.setAttribute') || callee === 'setAttribute') {
    const attrName = node.arguments[0];
    const attrValue = node.arguments[1];
    if (
      attrName &&
      ts.isStringLiteral(attrName) &&
      attrName.text === 'data-action'
    ) {
      const computed =
        !attrValue ||
        !(
          ts.isStringLiteral(attrValue) ||
          ts.isNoSubstitutionTemplateLiteral(attrValue)
        );
      emitFinding(ctx, {
        kind: 'action_binding',
        name: attrValue?.getText(sourceFile) ?? 'computed',
        span,
        confidence: computed ? 'opaque' : 'exact',
        extraction_method: 'typescript_compiler_api',
        evidence: 'setAttribute data-action',
        unresolvedCause: computed ? 'computed_action' : undefined,
      });
    }
  }

  if (callee === 'useState' || callee.endsWith('.useState')) {
    emitFinding(ctx, {
      kind: 'state',
      name: 'useState',
      span,
      confidence: 'exact',
      extraction_method: 'typescript_compiler_api',
      evidence: 'React useState hook',
    });
  }
  if (callee === 'useReducer' || callee.endsWith('.useReducer')) {
    emitFinding(ctx, {
      kind: 'reducer',
      name: 'useReducer',
      span,
      confidence: 'exact',
      extraction_method: 'typescript_compiler_api',
      evidence: 'React useReducer hook',
    });
  }

  if (
    callee === 't' ||
    callee === 'i18n.t' ||
    callee.endsWith('.t') ||
    callee.includes('formatMessage') ||
    callee.includes('translate')
  ) {
    const keyArg = node.arguments[0];
    const key = keyArg?.getText(sourceFile) ?? '';
    const confidence: GuiExtractionConfidence =
      keyArg &&
      (ts.isStringLiteral(keyArg) || ts.isNoSubstitutionTemplateLiteral(keyArg))
        ? 'exact'
        : 'conservative';
    const locFinding = emitFinding(ctx, {
      kind: 'localization',
      name: key || callee,
      span,
      confidence,
      extraction_method: 'typescript_compiler_api',
      evidence: `Localization call ${callee}`,
    });
    if (parentComponent) {
      emitEdge(ctx, {
        source: parentComponent,
        target: locFinding.stable_identity,
        relation: 'localized_by',
        span,
        confidence,
        extraction_method: 'typescript_compiler_api',
      });
    }
  }
}

function extractGlobalAccess(
  ctx: ScanContext,
  sourceFile: ts.SourceFile,
  node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): void {
  const text = node.getText(sourceFile);
  const isHostGlobal =
    /^(window|globalThis|self|document)(\.|\[)/.test(text) ||
    text === 'window' ||
    text === 'globalThis' ||
    text === 'self' ||
    text === 'document';
  if (!isHostGlobal) return;
  if (
    text === 'document.createElement' ||
    text.startsWith('document.querySelector') ||
    text.startsWith('document.getElementById')
  ) {
    return;
  }
  const confidence: GuiExtractionConfidence =
    ts.isElementAccessExpression(node) || text.includes('[')
      ? 'opaque'
      : 'conservative';
  emitFinding(ctx, {
    kind: 'host_boundary',
    name: text,
    span: nodeSpan(ctx, sourceFile, node).span,
    confidence,
    extraction_method: 'typescript_compiler_api',
    evidence: `Browser/global access ${text}`,
    unresolvedCause:
      confidence === 'opaque' ? 'unresolved_global' : 'host_global',
  });
}

function extractAssignments(
  ctx: ScanContext,
  sourceFile: ts.SourceFile,
  node: ts.BinaryExpression,
  parentComponent: string | null,
): void {
  if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;
  const left = node.left.getText(sourceFile);
  if (
    left.endsWith('.innerHTML') ||
    left.endsWith('.outerHTML') ||
    left.endsWith('.srcdoc')
  ) {
    emitFinding(ctx, {
      kind: 'dynamic_uncertainty',
      name: left,
      span: nodeSpan(ctx, sourceFile, node).span,
      confidence: 'opaque',
      extraction_method: 'typescript_compiler_api',
      attributes: { parent: parentComponent ?? '' },
      evidence: `Runtime HTML assignment to ${left}`,
      unresolvedCause: 'dynamic_html',
    });
  }
  if (left.includes('.style.') || left.endsWith('.className') || left.endsWith('.cssText')) {
    emitFinding(ctx, {
      kind: 'style',
      name: left,
      span: nodeSpan(ctx, sourceFile, node).span,
      confidence: 'conservative',
      extraction_method: 'typescript_compiler_api',
      evidence: `Imperative style mutation ${left}`,
      unresolvedCause: 'dynamic_style',
    });
  }
  if (left.endsWith('.onsubmit') || /\.on[a-z]+$/i.test(left)) {
    emitFinding(ctx, {
      kind: 'event_handler',
      name: left,
      span: nodeSpan(ctx, sourceFile, node).span,
      confidence: 'conservative',
      extraction_method: 'typescript_compiler_api',
      evidence: `Imperative handler assignment ${left}`,
      unresolvedCause: 'imperative_handler',
    });
  }
}

function extractTemplateOrString(
  ctx: ScanContext,
  sourceFile: ts.SourceFile,
  node: ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression | ts.StringLiteral,
  parentComponent: string | null,
): void {
  const start = node.getStart(sourceFile, false);
  const end = node.getEnd();
  if (end - start < 2) return;
  const innerStart = start + 1;
  const innerEnd = end - 1;
  const raw = ctx.content.slice(innerStart, innerEnd);
  const hasInterpolation = ts.isTemplateExpression(node);
  if (!looksLikeHtml(raw) && !looksLikeCss(raw)) return;

  if (looksLikeHtml(raw)) {
    const confidence: GuiExtractionConfidence = hasInterpolation
      ? 'conservative'
      : 'exact';
    const finding = emitFinding(ctx, {
      kind: 'template_html',
      name: parentComponent ? `${parentComponent}:template` : 'template',
      span: nodeSpan(ctx, sourceFile, node).span,
      confidence,
      extraction_method: 'template_literal_scan',
      attributes: {
        interpolated: hasInterpolation ? 'true' : 'false',
        parent: parentComponent ?? '',
      },
      evidence: 'HTML-like template or string literal',
      unresolvedCause: hasInterpolation ? 'template_interpolation' : undefined,
    });
    scanHtmlDocument(
      ctx,
      raw,
      innerStart,
      confidence,
      'template_literal_scan',
      finding.stable_identity,
    );
  }

  if (looksLikeCss(raw)) {
    const confidence: GuiExtractionConfidence = hasInterpolation
      ? 'conservative'
      : 'exact';
    scanCssText(ctx, raw, innerStart, confidence, 'css_parser', parentComponent);
  }
}

function extractImportExport(
  ctx: ScanContext,
  sourceFile: ts.SourceFile,
  node: ts.ImportDeclaration | ts.ExportDeclaration,
): void {
  const moduleSpecifier = node.moduleSpecifier;
  if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) {
    if (moduleSpecifier) {
      emitFinding(ctx, {
        kind: 'import',
        name: moduleSpecifier.getText(sourceFile),
        span: nodeSpan(ctx, sourceFile, node).span,
        confidence: 'opaque',
        extraction_method: 'typescript_compiler_api',
        evidence: 'Non-literal module specifier',
        unresolvedCause: 'dynamic_import',
      });
    }
    return;
  }
  const isStyle = /\.css$/i.test(moduleSpecifier.text);
  emitFinding(ctx, {
    kind: isStyle ? 'style' : 'import',
    name: moduleSpecifier.text,
    span: nodeSpan(ctx, sourceFile, node).span,
    confidence: 'exact',
    extraction_method: 'typescript_compiler_api',
    evidence: `Static import/export ${moduleSpecifier.text}`,
  });
}

function extractStateLike(
  ctx: ScanContext,
  sourceFile: ts.SourceFile,
  node: ts.VariableDeclaration,
  parentComponent: string | null,
): void {
  const name = node.name.getText(sourceFile);
  const init = node.initializer?.getText(sourceFile) ?? '';
  const initializer = node.initializer;

  if (
    ts.isIdentifier(node.name) &&
    looksLikeComponentName(node.name.text) &&
    initializer &&
    (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) &&
    functionBodyHasJsx(initializer)
  ) {
    emitFinding(ctx, {
      kind: 'component',
      name: node.name.text,
      span: nodeSpan(ctx, sourceFile, node).span,
      confidence: 'exact',
      extraction_method: 'typescript_compiler_api',
      attributes: {
        component_kind: 'composite',
        parent: parentComponent ?? '',
        binding: 'const',
      },
      evidence: `React function component binding ${node.name.text}`,
    });
  }

  if (
    name === 'state' ||
    name.endsWith('State') ||
    init.includes('useState') ||
    init.includes('useReducer')
  ) {
    emitFinding(ctx, {
      kind: init.includes('useReducer') ? 'reducer' : 'state',
      name,
      span: nodeSpan(ctx, sourceFile, node).span,
      confidence: 'exact',
      extraction_method: 'typescript_compiler_api',
      attributes: {
        parent: parentComponent ?? '',
        initializer: init.slice(0, 120),
      },
      evidence: `State-like binding ${name}`,
    });
  }
  if (name.includes('schema') || init.includes('schema')) {
    const finding = emitFinding(ctx, {
      kind: 'validation',
      name,
      span: nodeSpan(ctx, sourceFile, node).span,
      confidence: 'conservative',
      extraction_method: 'heuristic_inference',
      evidence: `Schema/validation binding ${name}`,
    });
    if (parentComponent) {
      emitEdge(ctx, {
        source: parentComponent,
        target: finding.stable_identity,
        relation: 'depends_on_schema',
        span: finding.span,
        confidence: 'conservative',
        extraction_method: 'heuristic_inference',
      });
    }
  }
  if (name.includes('policy') || init.includes('policy')) {
    emitFinding(ctx, {
      kind: 'policy',
      name,
      span: nodeSpan(ctx, sourceFile, node).span,
      confidence: 'conservative',
      extraction_method: 'heuristic_inference',
      evidence: `Policy binding ${name}`,
    });
  }
}

function scanPatternCanaries(ctx: ScanContext): void {
  const patterns: Array<{
    re: RegExp;
    kind: GuiFindingKind;
    confidence: GuiExtractionConfidence;
    name: string;
    evidence: string;
    cause: string;
  }> = [
    {
      re: /new\s+Function\s*\(/g,
      kind: 'dynamic_uncertainty',
      confidence: 'opaque',
      name: 'new_Function',
      evidence: 'new Function constructor',
      cause: 'code_execution_primitive',
    },
    {
      re: /\beval\s*\(/g,
      kind: 'dynamic_uncertainty',
      confidence: 'opaque',
      name: 'eval',
      evidence: 'eval() call',
      cause: 'code_execution_primitive',
    },
    {
      re: /document\.write\s*\(/g,
      kind: 'dynamic_uncertainty',
      confidence: 'opaque',
      name: 'document.write',
      evidence: 'document.write HTML insertion',
      cause: 'dynamic_html',
    },
    {
      re: /<script[^>]+src\s*=\s*["']https?:\/\//gi,
      kind: 'script',
      confidence: 'opaque',
      name: 'remote_script',
      evidence: 'Remote script reference',
      cause: 'remote_script',
    },
    {
      re: /customElements\.define\s*\(/g,
      kind: 'widget',
      confidence: 'conservative',
      name: 'customElements.define',
      evidence: 'Custom element registration',
      cause: 'unknown_widget',
    },
    {
      re: /form\s*=\s*document\.createElement\s*\(\s*['"]form['"]\s*\)/g,
      kind: 'form',
      confidence: 'opaque',
      name: 'runtime_generated_form',
      evidence: 'Runtime-generated form',
      cause: 'runtime_generated_form',
    },
    {
      re: new RegExp('import\\s*\\(\\s*[^\\\'"\\x60]+\\s*\\)', 'g'),
      kind: 'import',
      confidence: 'opaque',
      name: 'dynamic_import',
      evidence: 'Dynamic import with non-literal specifier',
      cause: 'dynamic_import',
    },
  ];

  for (const pattern of patterns) {
    pattern.re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.re.exec(ctx.content)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const already = ctx.findings.some(
        finding =>
          finding.path === ctx.path &&
          finding.name === pattern.name &&
          finding.span.start_line ===
            offsetToLineColumn(ctx.content, start).line,
      );
      if (already) continue;
      emitFinding(ctx, {
        kind: pattern.kind,
        name: pattern.name,
        span: spanFromOffsets(ctx.path, ctx.content, start, end).span,
        confidence: pattern.confidence,
        extraction_method: 'heuristic_inference',
        evidence: pattern.evidence,
        unresolvedCause: pattern.cause,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// HTML tokenizer (bounded, non-executing)
// ---------------------------------------------------------------------------
function looksLikeHtml(text: string): boolean {
  return /<\/?[A-Za-z][\w:-]*[\s/>]/.test(text) || /<!DOCTYPE/i.test(text);
}
function looksLikeCss(text: string): boolean {
  return (
    /@[a-z-]+\s*[^{]*\{/.test(text) ||
    /[.#]?[A-Za-z_-][\w-]*\s*\{[^}]*[a-z-]+\s*:/.test(text)
  );
}

function scanHtmlDocument(
  ctx: ScanContext,
  html: string,
  baseOffset: number,
  baseConfidence: GuiExtractionConfidence,
  method: GuiExtractionMethod,
  parentIdentity?: string,
): void {
  const tagRe =
    /<!--[\s\S]*?-->|<\/?([A-Za-z][\w:-]*)((?:\s+[^>]*?)?)\s*(\/?)>/g;
  let match: RegExpExecArray | null;
  const openStack: string[] = [];
  // legacy canary removed
  /* scrub // if (false) { void 0; // const _removed_import_canary = /import\s*\(\s*[^'"`]/s*\)/g,
*/
  while ((match = tagRe.exec(html)) !== null) {
    const full = match[0];
    if (full.startsWith('<!--')) continue;
    const tag = match[1];
    const attrText = match[2] ?? '';
    const selfClosing =
      match[3] === '/' || VOID_HTML_TAGS.has(tag.toLowerCase());
    const isClose = full.startsWith('</');
    const start = baseOffset + match.index;
    const end = start + full.length;
    const span = spanFromOffsets(ctx.path, ctx.content, start, end).span;
    const attrs = parseHtmlAttributes(attrText);
    const lower = tag.toLowerCase();

    if (isClose) {
      openStack.pop();
      continue;
    }

    let confidence = baseConfidence;
    let unresolvedCause: string | undefined;

    if (lower === 'script') {
      const src = attrs.src ?? '';
      if (/^https?:\/\//i.test(src) || src.startsWith('//')) {
        confidence = 'opaque';
        unresolvedCause = 'remote_script';
      } else if (src) {
        confidence = worstGuiExtractionConfidence([confidence, 'conservative']);
      } else {
        confidence = 'opaque';
        unresolvedCause = 'inline_script';
      }
      emitFinding(ctx, {
        kind: 'script',
        name: src || 'inline-script',
        span,
        confidence,
        extraction_method: method,
        attributes: attrs,
        evidence: 'Script tag in HTML',
        unresolvedCause,
      });
    }

    if (lower === 'link' && /stylesheet/i.test(attrs.rel ?? '')) {
      const href = attrs.href ?? '';
      if (/^https?:\/\//i.test(href) || href.startsWith('//')) {
        confidence = 'opaque';
        unresolvedCause = 'dynamic_style';
      }
    }

    if (attrs.is || (attrs['data-widget'] && attrs['data-widget'].includes('${'))) {
      confidence = worstGuiExtractionConfidence([confidence, 'opaque']);
      unresolvedCause = 'unknown_widget';
    }

    const kind = classifyHtmlTag(lower, attrs);
    const stableName =
      attrs.id ||
      attrs['data-testid'] ||
      attrs.name ||
      attrs['data-action'] ||
      attrs.role ||
      tag;

    const finding = emitFinding(ctx, {
      kind,
      name: tag,
      span,
      confidence,
      extraction_method: method,
      attributes: {
        ...attrs,
        component_kind: componentKindForTag(tag),
        parent: parentIdentity ?? openStack[openStack.length - 1] ?? '',
      },
      evidence: `HTML <${tag}>`,
      identityName: stableName,
      unresolvedCause,
    });

    if (parentIdentity) {
      emitEdge(ctx, {
        source: parentIdentity,
        target: finding.stable_identity,
        relation: 'contains',
        span,
        confidence,
        extraction_method: method,
      });
    }
    if (openStack.length > 0) {
      emitEdge(ctx, {
        source: openStack[openStack.length - 1],
        target: finding.stable_identity,
        relation: 'contains',
        span,
        confidence,
        extraction_method: method,
      });
    }

    emitHtmlAttributeFindings(ctx, finding, attrs, span, confidence, method);

    if (!selfClosing) {
      openStack.push(finding.stable_identity);
    }
  }
}

const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function classifyHtmlTag(
  tag: string,
  attrs: Record<string, string>,
): GuiFindingKind {
  if (tag === 'form') return 'form';
  if (tag === 'button') return 'button';
  if (tag === 'a') return 'link';
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return 'input';
  if (tag === 'label') return 'label';
  if (tag === 'dialog') return 'dialog';
  if (tag === 'menu' || tag === 'nav') return 'menu';
  if (tag === 'script') return 'script';
  if (attrs.role === 'dialog' || attrs.role === 'alertdialog') return 'dialog';
  if (attrs.role === 'menu' || attrs.role === 'menubar') return 'menu';
  if (attrs.is || attrs['data-widget']) return 'widget';
  return 'element';
}

function parseHtmlAttributes(text: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = new RegExp(
    '([:@A-Za-z_:][\\w:.-]*)(?:\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'=<>`]+)))?',
    'g',
  );
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(text)) !== null) {
    const name = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? 'true';
    attrs[name] = value;
  }
  return attrs;
}

function emitHtmlAttributeFindings(
  ctx: ScanContext,
  host: GuiSourceFinding,
  attrs: Record<string, string>,
  span: GuiSourceSpan,
  baseConfidence: GuiExtractionConfidence,
  method: GuiExtractionMethod,
): void {
  for (const [key, value] of Object.entries(attrs)) {
    const dynamic =
      value.includes('${') || value.includes('...') || value.includes('{');
    const confidence = dynamic
      ? worstGuiExtractionConfidence([baseConfidence, 'conservative'])
      : baseConfidence;

    const propFinding = emitFinding(ctx, {
      kind: 'prop',
      name: key,
      span,
      confidence,
      extraction_method: method,
      attributes: { value: value.slice(0, 200), host: host.stable_identity },
      evidence: `HTML attribute prop ${key}`,
      identityName: `${host.name}.prop.${key}.${host.occurrence}`,
    });
    emitEdge(ctx, {
      source: host.stable_identity,
      target: propFinding.stable_identity,
      relation: 'reads_state',
      span,
      confidence,
      extraction_method: method,
      notes: 'prop',
    });

    if (key.startsWith('aria-') || key === 'role' || key === 'tabindex') {
      emitFinding(ctx, {
        kind: 'accessibility',
        name: key,
        span,
        confidence,
        extraction_method: method,
        attributes: { value, host: host.stable_identity },
        evidence: `HTML accessibility ${key}`,
        identityName: `${host.name}:${key}:${host.occurrence}`,
      });
    }
    if (key === 'tabindex' || key === 'autofocus') {
      emitFinding(ctx, {
        kind: 'focus',
        name: key,
        span,
        confidence,
        extraction_method: method,
        attributes: { value, host: host.stable_identity },
        evidence: `Focus-related attribute ${key}`,
        identityName: `${host.name}:focus:${key}:${host.occurrence}`,
      });
    }
    if (key === 'accesskey' || key.startsWith('onkey')) {
      emitFinding(ctx, {
        kind: 'keyboard',
        name: key,
        span,
        confidence,
        extraction_method: method,
        attributes: { value, host: host.stable_identity },
        evidence: `Keyboard attribute ${key}`,
        identityName: `${host.name}:keyboard:${key}:${host.occurrence}`,
      });
    }
    if (
      key === 'data-policy' ||
      key === 'data-permission' ||
      key === 'data-capability' ||
      /policy/i.test(key)
    ) {
      const policyFinding = emitFinding(ctx, {
        kind: 'policy',
        name: value || key,
        span,
        confidence,
        extraction_method: method,
        attributes: { attr: key, host: host.stable_identity },
        evidence: `HTML policy ${key}`,
        identityName: `${host.name}:policy:${key}:${host.occurrence}`,
      });
      emitEdge(ctx, {
        source: host.stable_identity,
        target: policyFinding.stable_identity,
        relation: 'depends_on_policy',
        span,
        confidence,
        extraction_method: method,
      });
    }
    if (key === 'class' || key === 'style') {
      const styleFinding = emitFinding(ctx, {
        kind: 'style',
        name: value.slice(0, 80) || key,
        span,
        confidence,
        extraction_method: method,
        attributes: { attr: key, host: host.stable_identity },
        evidence: `HTML ${key}`,
        identityName: `${host.name}:${key}:${host.occurrence}`,
      });
      emitEdge(ctx, {
        source: host.stable_identity,
        target: styleFinding.stable_identity,
        relation: 'styled_by',
        span,
        confidence,
        extraction_method: method,
      });
    }
    if (key.startsWith('on')) {
      emitFinding(ctx, {
        kind: 'event_handler',
        name: key,
        span,
        confidence: 'conservative',
        extraction_method: method,
        attributes: { handler: value, host: host.stable_identity },
        evidence: `HTML handler attribute ${key}`,
        identityName: `${host.name}:${key}:${host.occurrence}`,
      });
    }
    if (key === 'href' || key === 'action' || key === 'formaction') {
      const external = /^(https?:|mailto:|\/\/)/i.test(value);
      const routeFinding = emitFinding(ctx, {
        kind: external ? 'external_navigation' : 'route',
        name: value,
        span,
        confidence,
        extraction_method: method,
        attributes: { attr: key, host: host.stable_identity },
        evidence: `HTML navigation ${key}=${value}`,
        identityName: `route:${value}`,
      });
      if (!external && !dynamic) {
        emitEdge(ctx, {
          source: host.stable_identity,
          target: routeFinding.stable_identity,
          relation: 'routes_to',
          span,
          confidence,
          extraction_method: method,
        });
      }
    }
    if (key === 'data-action' || key === 'data-capability') {
      const actionFinding = emitFinding(ctx, {
        kind: 'action_binding',
        name: value,
        span,
        confidence: dynamic ? 'conservative' : 'exact',
        extraction_method: method,
        attributes: { attr: key, host: host.stable_identity },
        evidence: `HTML action ${key}=${value}`,
        identityName: `action:${value}`,
        unresolvedCause: dynamic ? 'computed_action' : undefined,
      });
      emitEdge(ctx, {
        source: host.stable_identity,
        target: actionFinding.stable_identity,
        relation: 'invokes_action',
        span,
        confidence: dynamic ? 'conservative' : 'exact',
        extraction_method: method,
      });
    }
    if (/confirm/i.test(key) || /confirm/i.test(value)) {
      const confFinding = emitFinding(ctx, {
        kind: 'confirmation',
        name: `${key}:${value}`,
        span,
        confidence: 'exact',
        extraction_method: method,
        attributes: { host: host.stable_identity },
        evidence: 'HTML confirmation control',
        identityName: `confirm:${value || key}`,
      });
      emitEdge(ctx, {
        source: host.stable_identity,
        target: confFinding.stable_identity,
        relation: 'requires_confirmation',
        span,
        confidence: 'exact',
        extraction_method: method,
      });
    }
    if (key === 'type' && value === 'submit') {
      const submitFinding = emitFinding(ctx, {
        kind: 'action_binding',
        name: 'submit',
        span,
        confidence,
        extraction_method: method,
        attributes: { host: host.stable_identity },
        evidence: 'Submit control',
        identityName: `submit:${host.occurrence}`,
      });
      emitEdge(ctx, {
        source: host.stable_identity,
        target: submitFinding.stable_identity,
        relation: 'submits',
        span,
        confidence,
        extraction_method: method,
      });
    }
    if (
      key === 'required' ||
      key === 'pattern' ||
      key === 'minlength' ||
      key === 'maxlength'
    ) {
      const valFinding = emitFinding(ctx, {
        kind: 'validation',
        name: key,
        span,
        confidence,
        extraction_method: method,
        attributes: { value, host: host.stable_identity },
        evidence: `HTML validation constraint ${key}`,
        identityName: `validation:${key}:${host.occurrence}`,
      });
      emitEdge(ctx, {
        source: host.stable_identity,
        target: valFinding.stable_identity,
        relation: 'validates',
        span,
        confidence,
        extraction_method: method,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// CSS tokenizer (bounded)
// ---------------------------------------------------------------------------

function scanCssText(
  ctx: ScanContext,
  css: string,
  baseOffset: number,
  baseConfidence: GuiExtractionConfidence,
  method: GuiExtractionMethod,
  parentIdentity?: string | null,
): void {
  // Synthesize a style root so edges have resolvable sources.
  const styleRoot =
    parentIdentity ??
    emitFinding(ctx, {
      kind: 'style',
      name: 'stylesheet',
      span: spanFromOffsets(
        ctx.path,
        ctx.content,
        baseOffset,
        baseOffset + Math.min(css.length, 1),
      ).span,
      confidence: baseConfidence,
      extraction_method: method,
      evidence: 'CSS stylesheet root',
      identityName: `stylesheet:${ctx.path}`,
    }).stable_identity;

  const mediaRe = /@media([^{]+)\{/g;
  let match: RegExpExecArray | null;
  while ((match = mediaRe.exec(css)) !== null) {
    const query = match[1].trim();
    const start = baseOffset + match.index;
    const end = start + match[0].length;
    const mqFinding = emitFinding(ctx, {
      kind: 'media_query',
      name: query,
      span: spanFromOffsets(ctx.path, ctx.content, start, end).span,
      confidence: baseConfidence,
      extraction_method: method,
      evidence: `@media ${query}`,
      identityName: `media:${query}`,
    });
    emitEdge(ctx, {
      source: styleRoot,
      target: mqFinding.stable_identity,
      relation: 'responsive_variant_of',
      span: mqFinding.span,
      confidence: baseConfidence,
      extraction_method: method,
    });
  }

  const tokenRe = /--[A-Za-z0-9-_]+/g;
  const seenTokens = new Set<string>();
  while ((match = tokenRe.exec(css)) !== null) {
    const token = match[0];
    if (seenTokens.has(token)) continue;
    seenTokens.add(token);
    const start = baseOffset + match.index;
    const end = start + token.length;
    const tokenFinding = emitFinding(ctx, {
      kind: 'design_token',
      name: token,
      span: spanFromOffsets(ctx.path, ctx.content, start, end).span,
      confidence: baseConfidence,
      extraction_method: method,
      evidence: `Design token ${token}`,
      identityName: `token:${token}`,
    });
    emitEdge(ctx, {
      source: styleRoot,
      target: tokenFinding.stable_identity,
      relation: 'uses_design_token',
      span: tokenFinding.span,
      confidence: baseConfidence,
      extraction_method: method,
    });
  }

  // Dynamically constructed / remote @import
  const importRe = /@import\s+(?:url\()?['"]?([^'");\s]+)/g;
  while ((match = importRe.exec(css)) !== null) {
    const href = match[1];
    const remote = /^https?:\/\//i.test(href) || href.startsWith('//');
    const start = baseOffset + match.index;
    const end = start + match[0].length;
    emitFinding(ctx, {
      kind: 'style',
      name: href,
      span: spanFromOffsets(ctx.path, ctx.content, start, end).span,
      confidence: remote ? 'opaque' : 'conservative',
      extraction_method: method,
      evidence: `CSS @import ${href}`,
      unresolvedCause: remote ? 'dynamic_style' : 'css_import',
    });
  }

  const ruleRe = /([^{}@/]+)\{([^}]*)\}/g;
  while ((match = ruleRe.exec(css)) !== null) {
    const selector = match[1].trim();
    if (!selector || selector.startsWith('@')) continue;
    const start = baseOffset + match.index;
    const end = start + match[0].length;
    emitFinding(ctx, {
      kind: 'style',
      name: selector.slice(0, 120),
      span: spanFromOffsets(ctx.path, ctx.content, start, end).span,
      confidence: baseConfidence,
      extraction_method: method,
      attributes: { body: match[2].trim().slice(0, 160) },
      evidence: `CSS rule ${selector}`,
      identityName: `rule:${selector.slice(0, 80)}`,
    });
  }
}

// Re-export extractor constant for consumers/tests.
export { GUI_STATIC_EXTRACTOR_VERSION } from './models.js';
