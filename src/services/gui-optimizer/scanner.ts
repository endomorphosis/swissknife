/**
 * Non-executing GUI static scanner (GuiStaticScanner@1).
 *
 * Uses the TypeScript compiler API for JS/TS/JSX/TSX and bounded tokenizers for
 * standalone HTML/CSS. Never evaluates modules, templates, browser globals,
 * plugins, or repository scripts. Dynamic constructions lower confidence.
 */

import * as typescript from 'typescript';
import {
  GUI_OPTIMIZER_SCHEMA_VERSION,
  GUI_STATIC_EXTRACTOR_VERSION,
  GUI_STATIC_SCANNER_INTERFACE,
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
  worstGuiExtractionConfidence,
  requiresRawSourceForConfidence,
} from './models.js';

/** TypeScript compiler API (CJS/ESM interop-safe). */
const ts: typeof typescript =
  ((typescript as unknown as { default?: typeof typescript }).default ??
    typescript);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const DEFAULT_MAX_SOURCE_BYTES = 2 * 1024 * 1024;
export const DEFAULT_MAX_AST_NODES = 250_000;

export interface GuiScanSourceInput {
  readonly path: string;
  readonly content: string;
  readonly language?: GuiSourceLanguage | 'auto';
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
  const maxSourceBytes = options.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES;
  const maxAstNodes = options.maxAstNodes ?? DEFAULT_MAX_AST_NODES;
  const applicationId = options.applicationId ?? 'unknown-application';
  const screenId = options.screenId ?? 'unknown-screen';
  const packageNamespace =
    options.packageNamespace ?? 'org.hallucinate.swissknife.gui-optimizer';

  const findings: GuiSourceFinding[] = [];
  const edges: UiDependencyEdge[] = [];
  const unresolved: string[] = [];
  const sources: string[] = [];
  let findingCounter = 0;
  let edgeCounter = 0;

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
      continue;
    }
    sources.push(input.path);
    const language = resolveLanguage(input);
    const ctx: ScanContext = {
      path: input.path,
      content: input.content,
      language,
      applicationId,
      screenId,
      packageNamespace,
      maxAstNodes,
      nextFindingId: () => {
        findingCounter += 1;
        return `finding:${findingCounter.toString().padStart(4, '0')}`;
      },
      nextEdgeId: () => {
        edgeCounter += 1;
        return `edge:${edgeCounter.toString().padStart(4, '0')}`;
      },
      findings,
      edges,
      unresolved,
    };

    if (language === 'html') {
      scanHtmlDocument(ctx, input.content, 0, 'exact', 'html_tokenizer');
    } else if (language === 'css') {
      scanCssText(ctx, input.content, 0, 'exact', 'css_tokenizer');
    } else {
      scanScriptSource(ctx);
    }
  }

  findings.sort(compareFindings);
  edges.sort(compareEdges);
  unresolved.sort((a, b) => a.localeCompare(b));
  sources.sort((a, b) => a.localeCompare(b));

  const classification = worstGuiExtractionConfidence(
    findings.map(finding => finding.confidence),
  );
  const completeness: GuiCompletenessBoundary =
    unresolved.length > 0 || classification !== 'exact' ? 'partial' : 'file';

  return Object.freeze({
    schema_version: GUI_OPTIMIZER_SCHEMA_VERSION,
    extractor_version: GUI_STATIC_EXTRACTOR_VERSION,
    interface_id: GUI_STATIC_SCANNER_INTERFACE,
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
  nextFindingId: () => string;
  nextEdgeId: () => string;
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
    span: edge.span ? Object.freeze({ ...edge.span }) : null,
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

function resolveLanguage(input: GuiScanSourceInput): GuiSourceLanguage {
  if (input.language && input.language !== 'auto') {
    return input.language;
  }
  const lower = input.path.toLowerCase();
  if (lower.endsWith('.tsx')) return 'tsx';
  if (lower.endsWith('.jsx')) return 'jsx';
  if (lower.endsWith('.ts') || lower.endsWith('.mts') || lower.endsWith('.cts')) {
    return 'typescript';
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
    return 'javascript';
  }
  return 'javascript';
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

function spanFromOffsets(
  path: string,
  content: string,
  start: number,
  end: number,
): GuiSourceSpan {
  const safeStart = Math.max(0, Math.min(start, content.length));
  const safeEnd = Math.max(safeStart, Math.min(end, content.length));
  const startPos = offsetToLineColumn(content, safeStart);
  const endPos = offsetToLineColumn(content, safeEnd);
  return Object.freeze({
    path,
    start_offset: safeStart,
    end_offset: safeEnd,
    start_line: startPos.line,
    start_column: startPos.column,
    end_line: endPos.line,
    end_column: endPos.column,
  });
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
): GuiSourceSpan {
  const start = node.getStart(sourceFile, false);
  const end = node.getEnd();
  return spanFromOffsets(ctx.path, ctx.content, start, end);
}

// ---------------------------------------------------------------------------
// Finding / edge emission
// ---------------------------------------------------------------------------

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
    identitySuffix?: string;
  },
): GuiSourceFinding {
  const stableIdentity = buildStableIdentity(
    ctx,
    partial.kind,
    partial.identitySuffix ?? partial.name,
  );
  const attributes: Record<string, string> = {
    ...(partial.attributes ?? {}),
  };
  if (partial.kind === 'component') {
    attributes.package_namespace = ctx.packageNamespace;
    attributes.application_id = ctx.applicationId;
    attributes.screen_id = ctx.screenId;
  }
  const finding: GuiSourceFinding = {
    schema_version: GUI_OPTIMIZER_SCHEMA_VERSION,
    finding_id: ctx.nextFindingId(),
    kind: partial.kind,
    name: partial.name,
    stable_identity: stableIdentity,
    path: ctx.path,
    span: partial.span,
    confidence: partial.confidence,
    extraction_method: partial.extraction_method,
    extractor_version: GUI_STATIC_EXTRACTOR_VERSION,
    attributes: Object.freeze(attributes),
    evidence: partial.evidence.slice(0, 512),
    requires_raw_source: requiresRawSourceForConfidence(partial.confidence),
    language: ctx.language,
  };
  ctx.findings.push(finding);
  if (partial.confidence === 'opaque' || partial.confidence === 'heuristic') {
    ctx.unresolved.push(`${stableIdentity}:${partial.confidence}`);
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
  },
): void {
  ctx.edges.push({
    schema_version: GUI_OPTIMIZER_SCHEMA_VERSION,
    edge_id: ctx.nextEdgeId(),
    source_identity: partial.source,
    target_identity: partial.target,
    relation: partial.relation,
    span: partial.span,
    extraction_method: partial.extraction_method,
    confidence: partial.confidence,
    extractor_version: GUI_STATIC_EXTRACTOR_VERSION,
  });
}

function buildStableIdentity(
  ctx: ScanContext,
  kind: GuiFindingKind,
  name: string,
): string {
  const normalized = name
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9._:/-]+/g, '_')
    .slice(0, 180);
  return `${ctx.applicationId}/${ctx.screenId}/${kind}/${normalized || 'anonymous'}`;
}

function compareFindings(a: GuiSourceFinding, b: GuiSourceFinding): number {
  return (
    a.path.localeCompare(b.path) ||
    a.span.start_offset - b.span.start_offset ||
    a.kind.localeCompare(b.kind) ||
    a.name.localeCompare(b.name) ||
    a.finding_id.localeCompare(b.finding_id)
  );
}

function compareEdges(a: UiDependencyEdge, b: UiDependencyEdge): number {
  return (
    a.source_identity.localeCompare(b.source_identity) ||
    a.target_identity.localeCompare(b.target_identity) ||
    a.relation.localeCompare(b.relation) ||
    a.edge_id.localeCompare(b.edge_id)
  );
}

// ---------------------------------------------------------------------------
// Script / TS / JSX scanning
// ---------------------------------------------------------------------------

function scanScriptSource(ctx: ScanContext): void {
  const sourceFile = ts.createSourceFile(
    ctx.path,
    ctx.content,
    ts.ScriptTarget.ES2022,
    true,
    scriptKindFor(ctx.language),
  );

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
      span: spanFromOffsets(ctx.path, ctx.content, 0, Math.min(1, ctx.content.length)),
      confidence: 'opaque',
      extraction_method: 'typescript_compiler_api',
      evidence: `AST exceeded ${ctx.maxAstNodes} nodes; incomplete scan.`,
    });
    return;
  }

  const visit = (node: ts.Node, parentComponent: string | null): void => {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      maybeEmitFunctionComponent(ctx, sourceFile, node, parentComponent);
    }
    if (ts.isClassDeclaration(node)) {
      maybeEmitClassComponent(ctx, sourceFile, node);
    }
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      extractJsx(ctx, sourceFile, node, parentComponent);
    }
    if (ts.isCallExpression(node)) {
      extractCallPatterns(ctx, sourceFile, node, parentComponent);
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      extractGlobalAccess(ctx, sourceFile, node);
    }
    if (ts.isBinaryExpression(node)) {
      extractAssignments(ctx, sourceFile, node, parentComponent);
    }
    if (
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node) ||
      ts.isStringLiteral(node)
    ) {
      extractTemplateOrString(ctx, sourceFile, node, parentComponent);
    }
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      extractImportExport(ctx, sourceFile, node);
    }
    if (ts.isVariableDeclaration(node)) {
      extractStateLike(ctx, sourceFile, node, parentComponent);
    }

    ts.forEachChild(node, child => visit(child, parentComponent));
  };

  visit(sourceFile, null);
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
): void {
  const name = componentNameFromFunction(node);
  if (!name || !looksLikeComponentName(name)) return;
  if (!functionBodyHasJsx(node)) return;
  const finding = emitFinding(ctx, {
    kind: 'component',
    name,
    span: nodeSpan(ctx, sourceFile, node),
    confidence: 'exact',
    extraction_method: 'typescript_compiler_api',
    attributes: {
      component_kind: 'react_function',
      parent: parentComponent ?? '',
    },
    evidence: `React function component ${name}`,
    identitySuffix: name,
  });
  // Re-walk body with this component as parent for containment edges.
  const body = node.body;
  if (!body) return;
  const walk = (child: ts.Node): void => {
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
      const childName = jsxTagName(child);
      if (childName) {
        emitEdge(ctx, {
          source: finding.stable_identity,
          target: buildStableIdentity(ctx, classifyJsxTag(childName), childName),
          relation: 'renders',
          span: nodeSpan(ctx, sourceFile, child),
          confidence: 'exact',
          extraction_method: 'jsx_ast',
        });
      }
    }
    ts.forEachChild(child, walk);
  };
  walk(body);
}

function maybeEmitClassComponent(
  ctx: ScanContext,
  sourceFile: ts.SourceFile,
  node: ts.ClassDeclaration,
): void {
  const name = node.name?.text;
  if (!name || !looksLikeComponentName(name)) return;
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
        /^(React\.)?(Component|PureComponent)$/.test(typeNode.expression.getText(sourceFile)),
      ),
    ) ?? false;
  if (!hasRender && !extendsReact && !functionBodyHasJsx(node)) return;
  emitFinding(ctx, {
    kind: 'component',
    name,
    span: nodeSpan(ctx, sourceFile, node),
    confidence: 'exact',
    extraction_method: 'typescript_compiler_api',
    attributes: {
      component_kind: 'react_class',
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

function extractJsx(
  ctx: ScanContext,
  sourceFile: ts.SourceFile,
  node: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment,
  parentComponent: string | null,
): void {
  if (ts.isJsxFragment(node)) {
    emitFinding(ctx, {
      kind: 'element',
      name: 'Fragment',
      span: nodeSpan(ctx, sourceFile, node),
      confidence: 'exact',
      extraction_method: 'jsx_ast',
      attributes: { parent: parentComponent ?? '' },
      evidence: 'JSX fragment',
    });
    return;
  }

  const tag = jsxTagName(node);
  if (!tag) return;
  const kind = classifyJsxTag(tag);
  const attributes = collectJsxAttributes(
    sourceFile,
    ts.isJsxElement(node) ? node.openingElement : node,
  );
  let confidence: GuiExtractionConfidence = 'exact';
  if (attributes['__dynamic_component'] === 'true') {
    confidence = 'opaque';
  }
  if (tag === 'script' && /https?:\/\//i.test(attributes.src ?? '')) {
    confidence = 'opaque';
  }

  const finding = emitFinding(ctx, {
    kind,
    name: tag,
    span: nodeSpan(ctx, sourceFile, node),
    confidence,
    extraction_method: 'jsx_ast',
    attributes: {
      ...attributes,
      parent: parentComponent ?? '',
    },
    evidence: `JSX <${tag}>`,
    identitySuffix: `${tag}:${attributes.id || attributes['data-testid'] || attributes.name || attributes['data-action'] || attributes.role || 'node'}`,
  });

  if (attributes.dangerouslySetInnerHTML) {
    emitFinding(ctx, {
      kind: 'dynamic_uncertainty',
      name: 'dangerouslySetInnerHTML',
      span: nodeSpan(ctx, sourceFile, node),
      confidence: 'opaque',
      extraction_method: 'jsx_ast',
      attributes: { host: finding.stable_identity },
      evidence: 'Runtime HTML insertion via dangerouslySetInnerHTML',
    });
  }

  for (const [key, value] of Object.entries(attributes)) {
    if (key.startsWith('aria-') || key === 'role' || key === 'tabIndex' || key === 'tabindex') {
      emitFinding(ctx, {
        kind: 'accessibility',
        name: key,
        span: nodeSpan(ctx, sourceFile, node),
        confidence: value.startsWith('{') ? 'conservative' : 'exact',
        extraction_method: 'jsx_ast',
        attributes: { value, host: finding.stable_identity },
        evidence: `Accessibility attribute ${key}=${value}`,
        identitySuffix: `${finding.name}:${key}`,
      });
    }
    if (key === 'style') {
      emitFinding(ctx, {
        kind: 'style',
        name: 'inline-style',
        span: nodeSpan(ctx, sourceFile, node),
        confidence: value.includes('{') ? 'conservative' : 'exact',
        extraction_method: 'jsx_ast',
        attributes: { value, host: finding.stable_identity },
        evidence: 'Inline style binding',
      });
      emitEdge(ctx, {
        source: finding.stable_identity,
        target: buildStableIdentity(ctx, 'style', 'inline-style'),
        relation: 'styled_by',
        span: nodeSpan(ctx, sourceFile, node),
        confidence: 'exact',
        extraction_method: 'jsx_ast',
      });
    }
    if (key === 'className' || key === 'class') {
      emitFinding(ctx, {
        kind: 'style',
        name: value,
        span: nodeSpan(ctx, sourceFile, node),
        confidence: value.includes('{') || value.includes('${') ? 'conservative' : 'exact',
        extraction_method: 'jsx_ast',
        attributes: { class: value, host: finding.stable_identity },
        evidence: `Class binding ${value}`,
      });
    }
    if (/^on[A-Z]/.test(key) || key.startsWith('on')) {
      const handlerConfidence: GuiExtractionConfidence =
        value.includes('=>') || value.includes('function') || value.startsWith('{')
          ? 'conservative'
          : 'exact';
      emitFinding(ctx, {
        kind: 'event_handler',
        name: key,
        span: nodeSpan(ctx, sourceFile, node),
        confidence: handlerConfidence,
        extraction_method: 'jsx_ast',
        attributes: { handler: value, host: finding.stable_identity },
        evidence: `Event handler ${key}`,
        identitySuffix: `${finding.name}:${key}`,
      });
    }
    if (key === 'href' || key === 'to' || key === 'action') {
      const isExternal = /^(https?:|mailto:|\/\/)/i.test(value);
      emitFinding(ctx, {
        kind: isExternal ? 'external_navigation' : 'route',
        name: value,
        span: nodeSpan(ctx, sourceFile, node),
        confidence: value.includes('{') || value.includes('${') ? 'conservative' : 'exact',
        extraction_method: 'jsx_ast',
        attributes: { attr: key, host: finding.stable_identity },
        evidence: `Navigation target ${value}`,
      });
      if (!isExternal && !value.includes('{')) {
        emitEdge(ctx, {
          source: finding.stable_identity,
          target: buildStableIdentity(ctx, 'route', value),
          relation: 'routes_to',
          span: nodeSpan(ctx, sourceFile, node),
          confidence: 'exact',
          extraction_method: 'jsx_ast',
        });
      }
    }
    if (key === 'data-action' || key === 'data-capability' || key === 'data-testid') {
      const actionConfidence: GuiExtractionConfidence =
        value.includes('${') || value.includes('+') || value.includes('{')
          ? 'conservative'
          : 'exact';
      emitFinding(ctx, {
        kind: 'action_binding',
        name: value,
        span: nodeSpan(ctx, sourceFile, node),
        confidence: actionConfidence,
        extraction_method: 'jsx_ast',
        attributes: { attr: key, host: finding.stable_identity },
        evidence: `Action binding ${key}=${value}`,
      });
      emitEdge(ctx, {
        source: finding.stable_identity,
        target: buildStableIdentity(ctx, 'action_binding', value),
        relation: 'invokes_action',
        span: nodeSpan(ctx, sourceFile, node),
        confidence: actionConfidence,
        extraction_method: 'jsx_ast',
      });
    }
    if (/confirm/i.test(key) || /confirm/i.test(value)) {
      emitFinding(ctx, {
        kind: 'confirmation',
        name: `${key}:${value}`,
        span: nodeSpan(ctx, sourceFile, node),
        confidence: 'exact',
        extraction_method: 'jsx_ast',
        attributes: { host: finding.stable_identity },
        evidence: 'Confirmation-related binding',
      });
      emitEdge(ctx, {
        source: finding.stable_identity,
        target: buildStableIdentity(ctx, 'confirmation', value || key),
        relation: 'requires_confirmation',
        span: nodeSpan(ctx, sourceFile, node),
        confidence: 'exact',
        extraction_method: 'jsx_ast',
      });
    }
    if (/delete|destroy|remove|danger|destructive/i.test(value) || /danger/i.test(key)) {
      emitFinding(ctx, {
        kind: 'destructive_action',
        name: value || key,
        span: nodeSpan(ctx, sourceFile, node),
        confidence: 'heuristic',
        extraction_method: 'pattern_match',
        attributes: { host: finding.stable_identity },
        evidence: 'Potentially destructive action naming',
      });
    }
  }

  if (ts.isJsxElement(node)) {
    for (const child of node.children) {
      if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
        const childTag = jsxTagName(child);
        if (!childTag) continue;
        emitEdge(ctx, {
          source: finding.stable_identity,
          target: buildStableIdentity(
            ctx,
            classifyJsxTag(childTag),
            childTag,
          ),
          relation: 'contains',
          span: nodeSpan(ctx, sourceFile, child),
          confidence: 'exact',
          extraction_method: 'jsx_ast',
        });
      }
    }
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
        // Dynamic component indirection.
        if (!ts.isStringLiteral(prop.initializer) && !ts.isNoSubstitutionTemplateLiteral(prop.initializer)) {
          attrs.__dynamic_component = 'true';
        }
      }
    }
  }
  // Member expression tags like components[name]
  const tagText = element.tagName.getText(sourceFile);
  if (tagText.includes('[') || tagText.includes('.')) {
    if (!/^[A-Za-z0-9.]+$/.test(tagText) || tagText.includes('[')) {
      attrs.__dynamic_component = 'true';
    }
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
  const span = nodeSpan(ctx, sourceFile, node);

  if (
    callee === 'eval' ||
    callee === 'Function' ||
    callee.endsWith('.eval') ||
    callee === 'setTimeout' ||
    callee === 'setInterval'
  ) {
    const confidence: GuiExtractionConfidence =
      callee === 'eval' || callee === 'Function' ? 'opaque' : 'heuristic';
    emitFinding(ctx, {
      kind: 'dynamic_uncertainty',
      name: callee,
      span,
      confidence,
      extraction_method: 'typescript_compiler_api',
      attributes: { parent: parentComponent ?? '' },
      evidence: `Dynamic call ${callee}`,
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
    emitFinding(ctx, {
      kind: 'dynamic_uncertainty',
      name: callee,
      span,
      confidence: 'conservative',
      extraction_method: 'typescript_compiler_api',
      evidence: `Imperative DOM mutation ${callee}`,
    });
  }

  if (
    callee.endsWith('.querySelector') ||
    callee.endsWith('.querySelectorAll') ||
    callee.endsWith('.getElementById') ||
    callee.endsWith('.addEventListener')
  ) {
    const arg0 = node.arguments[0]?.getText(sourceFile) ?? '';
    const confidence: GuiExtractionConfidence =
      arg0.includes('+') || arg0.includes('${') || arg0.includes('`')
        ? 'conservative'
        : 'exact';
    const kind: GuiFindingKind = callee.endsWith('.addEventListener')
      ? 'event_handler'
      : 'element';
    emitFinding(ctx, {
      kind,
      name: `${callee}:${arg0 || 'unknown'}`,
      span,
      confidence,
      extraction_method: 'typescript_compiler_api',
      attributes: { selector_or_event: arg0 },
      evidence: `DOM API ${callee}`,
    });
  }

  if (callee === 'fetch' || callee.endsWith('.fetch') || callee.includes('invoke') || callee.includes('request')) {
    emitFinding(ctx, {
      kind: 'async_operation',
      name: callee,
      span,
      confidence: 'conservative',
      extraction_method: 'typescript_compiler_api',
      evidence: `Async/service call ${callee}`,
    });
  }

  if (callee === 'require' || callee === 'import') {
    emitFinding(ctx, {
      kind: 'import',
      name: node.arguments[0]?.getText(sourceFile) ?? callee,
      span,
      confidence: 'exact',
      extraction_method: 'typescript_compiler_api',
      evidence: `Module load expression ${callee}`,
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
      });
    }
  }

  // useState / useReducer
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

  // i18n / localization
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
    emitFinding(ctx, {
      kind: 'localization',
      name: key || callee,
      span,
      confidence,
      extraction_method: 'typescript_compiler_api',
      evidence: `Localization call ${callee}`,
    });
  }
}

function extractGlobalAccess(
  ctx: ScanContext,
  sourceFile: ts.SourceFile,
  node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): void {
  const text = node.getText(sourceFile);
  if (
    text.startsWith('window.') ||
    text.startsWith('globalThis.') ||
    text.startsWith('self.') ||
    text.startsWith('document.')
  ) {
    // Skip common exact-safe DOM roots already handled as calls.
    if (
      text === 'document.createElement' ||
      text.startsWith('document.querySelector') ||
      text.startsWith('document.getElementById')
    ) {
      return;
    }
    const confidence: GuiExtractionConfidence = text.includes('[')
      ? 'opaque'
      : 'conservative';
    emitFinding(ctx, {
      kind: 'host_boundary',
      name: text,
      span: nodeSpan(ctx, sourceFile, node),
      confidence,
      extraction_method: 'typescript_compiler_api',
      evidence: `Browser/global access ${text}`,
    });
  }
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
      span: nodeSpan(ctx, sourceFile, node),
      confidence: 'opaque',
      extraction_method: 'typescript_compiler_api',
      attributes: { parent: parentComponent ?? '' },
      evidence: `Runtime HTML assignment to ${left}`,
    });
  }
  if (left.includes('.style.') || left.endsWith('.className')) {
    emitFinding(ctx, {
      kind: 'style',
      name: left,
      span: nodeSpan(ctx, sourceFile, node),
      confidence: 'conservative',
      extraction_method: 'typescript_compiler_api',
      evidence: `Imperative style mutation ${left}`,
    });
  }
  if (left.endsWith('.onsubmit') || /\.on[a-z]+$/i.test(left)) {
    emitFinding(ctx, {
      kind: 'event_handler',
      name: left,
      span: nodeSpan(ctx, sourceFile, node),
      confidence: 'conservative',
      extraction_method: 'typescript_compiler_api',
      evidence: `Imperative handler assignment ${left}`,
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
  // Use the exact source slice so spans stay aligned with the enclosing file.
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
      span: nodeSpan(ctx, sourceFile, node),
      confidence,
      extraction_method: 'template_literal_html',
      attributes: {
        interpolated: hasInterpolation ? 'true' : 'false',
        parent: parentComponent ?? '',
      },
      evidence: 'HTML-like template or string literal',
    });
    scanHtmlDocument(
      ctx,
      raw,
      innerStart,
      confidence,
      'template_literal_html',
      finding.stable_identity,
    );
  }

  if (looksLikeCss(raw)) {
    const confidence: GuiExtractionConfidence = hasInterpolation
      ? 'conservative'
      : 'exact';
    scanCssText(ctx, raw, innerStart, confidence, 'css_tokenizer');
  }
}

function extractImportExport(
  ctx: ScanContext,
  sourceFile: ts.SourceFile,
  node: ts.ImportDeclaration | ts.ExportDeclaration,
): void {
  const moduleSpecifier = node.moduleSpecifier;
  if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) return;
  emitFinding(ctx, {
    kind: 'import',
    name: moduleSpecifier.text,
    span: nodeSpan(ctx, sourceFile, node),
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
      span: nodeSpan(ctx, sourceFile, node),
      confidence: 'exact',
      extraction_method: 'typescript_compiler_api',
      attributes: {
        component_kind: 'react_function',
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
      span: nodeSpan(ctx, sourceFile, node),
      confidence: 'exact',
      extraction_method: 'typescript_compiler_api',
      attributes: { parent: parentComponent ?? '', initializer: init.slice(0, 120) },
      evidence: `State-like binding ${name}`,
    });
  }
  if (name.includes('schema') || init.includes('schema')) {
    emitFinding(ctx, {
      kind: 'validation',
      name,
      span: nodeSpan(ctx, sourceFile, node),
      confidence: 'conservative',
      extraction_method: 'pattern_match',
      evidence: `Schema/validation binding ${name}`,
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
  }> = [
    {
      re: /new\s+Function\s*\(/g,
      kind: 'dynamic_uncertainty',
      confidence: 'opaque',
      name: 'new_Function',
      evidence: 'new Function constructor',
    },
    {
      re: /\beval\s*\(/g,
      kind: 'dynamic_uncertainty',
      confidence: 'opaque',
      name: 'eval',
      evidence: 'eval() call',
    },
    {
      re: /document\.write\s*\(/g,
      kind: 'dynamic_uncertainty',
      confidence: 'opaque',
      name: 'document.write',
      evidence: 'document.write HTML insertion',
    },
    {
      re: /<script[^>]+src\s*=\s*["']https?:\/\//gi,
      kind: 'script',
      confidence: 'opaque',
      name: 'remote_script',
      evidence: 'Remote script reference',
    },
    {
      re: /customElements\.define\s*\(/g,
      kind: 'widget',
      confidence: 'conservative',
      name: 'customElements.define',
      evidence: 'Custom element registration',
    },
    {
      re: /form\s*=\s*document\.createElement\s*\(\s*['"]form['"]\s*\)/g,
      kind: 'form',
      confidence: 'opaque',
      name: 'runtime_generated_form',
      evidence: 'Runtime-generated form',
    },
  ];

  for (const pattern of patterns) {
    pattern.re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.re.exec(ctx.content)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      // Avoid duplicates for constructs already extracted via AST when exact.
      const already = ctx.findings.some(
        finding =>
          finding.path === ctx.path &&
          finding.span.start_offset === start &&
          finding.name === pattern.name,
      );
      if (already) continue;
      emitFinding(ctx, {
        kind: pattern.kind,
        name: pattern.name,
        span: spanFromOffsets(ctx.path, ctx.content, start, end),
        confidence: pattern.confidence,
        extraction_method: 'pattern_match',
        evidence: pattern.evidence,
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

  while ((match = tagRe.exec(html)) !== null) {
    const full = match[0];
    if (full.startsWith('<!--')) continue;
    const tag = match[1];
    const attrText = match[2] ?? '';
    const selfClosing = match[3] === '/' || VOID_HTML_TAGS.has(tag.toLowerCase());
    const isClose = full.startsWith('</');
    const start = baseOffset + match.index;
    const end = start + full.length;
    const span = spanFromOffsets(ctx.path, ctx.content, start, end);
    const attrs = parseHtmlAttributes(attrText);
    const lower = tag.toLowerCase();

    if (isClose) {
      openStack.pop();
      continue;
    }

    let confidence = baseConfidence;
    if (lower === 'script') {
      const src = attrs.src ?? '';
      if (/^https?:\/\//i.test(src) || src.startsWith('//')) {
        confidence = 'opaque';
      } else if (src) {
        confidence = 'conservative';
      } else {
        confidence = 'opaque';
      }
      emitFinding(ctx, {
        kind: 'script',
        name: src || 'inline-script',
        span,
        confidence,
        extraction_method: method,
        attributes: attrs,
        evidence: 'Script tag in HTML',
      });
    }

    if (attrs.is || (attrs['data-widget'] && attrs['data-widget'].includes('${'))) {
      confidence = worstGuiExtractionConfidence([confidence, 'opaque']);
    }

    const kind = classifyHtmlTag(lower, attrs);
    const finding = emitFinding(ctx, {
      kind,
      name: tag,
      span,
      confidence,
      extraction_method: method,
      attributes: attrs,
      evidence: `HTML <${tag}>`,
      identitySuffix: `${tag}:${attrs.id || attrs['data-testid'] || attrs.name || attrs['data-action'] || attrs.role || 'node'}`,
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
  return 'element';
}

function parseHtmlAttributes(text: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe =
    /([:@A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
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

    if (key.startsWith('aria-') || key === 'role' || key === 'tabindex') {
      emitFinding(ctx, {
        kind: 'accessibility',
        name: key,
        span,
        confidence,
        extraction_method: method,
        attributes: { value, host: host.stable_identity },
        evidence: `HTML accessibility ${key}`,
        identitySuffix: `${host.name}:${key}`,
      });
    }
    if (key === 'class' || key === 'style') {
      emitFinding(ctx, {
        kind: 'style',
        name: value,
        span,
        confidence,
        extraction_method: method,
        attributes: { attr: key, host: host.stable_identity },
        evidence: `HTML ${key}`,
      });
      emitEdge(ctx, {
        source: host.stable_identity,
        target: buildStableIdentity(ctx, 'style', value.slice(0, 80) || key),
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
      });
    }
    if (key === 'href' || key === 'action' || key === 'formaction') {
      const external = /^(https?:|mailto:|\/\/)/i.test(value);
      emitFinding(ctx, {
        kind: external ? 'external_navigation' : 'route',
        name: value,
        span,
        confidence,
        extraction_method: method,
        attributes: { attr: key, host: host.stable_identity },
        evidence: `HTML navigation ${key}=${value}`,
      });
      if (!external && !dynamic) {
        emitEdge(ctx, {
          source: host.stable_identity,
          target: buildStableIdentity(ctx, 'route', value),
          relation: 'routes_to',
          span,
          confidence,
          extraction_method: method,
        });
      }
    }
    if (key === 'data-action' || key === 'data-capability') {
      emitFinding(ctx, {
        kind: 'action_binding',
        name: value,
        span,
        confidence: dynamic ? 'conservative' : 'exact',
        extraction_method: method,
        attributes: { attr: key, host: host.stable_identity },
        evidence: `HTML action ${key}=${value}`,
      });
      emitEdge(ctx, {
        source: host.stable_identity,
        target: buildStableIdentity(ctx, 'action_binding', value),
        relation: 'invokes_action',
        span,
        confidence: dynamic ? 'conservative' : 'exact',
        extraction_method: method,
      });
    }
    if (/confirm/i.test(key) || /confirm/i.test(value)) {
      emitFinding(ctx, {
        kind: 'confirmation',
        name: `${key}:${value}`,
        span,
        confidence: 'exact',
        extraction_method: method,
        attributes: { host: host.stable_identity },
        evidence: 'HTML confirmation control',
      });
      emitEdge(ctx, {
        source: host.stable_identity,
        target: buildStableIdentity(ctx, 'confirmation', value || key),
        relation: 'requires_confirmation',
        span,
        confidence: 'exact',
        extraction_method: method,
      });
    }
    if (key === 'type' && (value === 'submit' || host.kind === 'form')) {
      emitEdge(ctx, {
        source: host.stable_identity,
        target: buildStableIdentity(ctx, 'form', 'submit'),
        relation: 'submits',
        span,
        confidence,
        extraction_method: method,
      });
    }
    if (key === 'required' || key === 'pattern' || key === 'minlength' || key === 'maxlength') {
      emitFinding(ctx, {
        kind: 'validation',
        name: key,
        span,
        confidence,
        extraction_method: method,
        attributes: { value, host: host.stable_identity },
        evidence: `HTML validation constraint ${key}`,
      });
      emitEdge(ctx, {
        source: host.stable_identity,
        target: buildStableIdentity(ctx, 'validation', key),
        relation: 'validates',
        span,
        confidence,
        extraction_method: method,
      });
    }
    if (key === 'autofocus' || key === 'tabindex') {
      emitFinding(ctx, {
        kind: 'focus',
        name: key,
        span,
        confidence,
        extraction_method: method,
        attributes: { value, host: host.stable_identity },
        evidence: `Focus-related attribute ${key}`,
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
): void {
  const mediaRe = /@media([^{]+)\{/g;
  let match: RegExpExecArray | null;
  while ((match = mediaRe.exec(css)) !== null) {
    const query = match[1].trim();
    const start = baseOffset + match.index;
    const end = start + match[0].length;
    emitFinding(ctx, {
      kind: 'media_query',
      name: query,
      span: spanFromOffsets(ctx.path, ctx.content, start, end),
      confidence: baseConfidence,
      extraction_method: method,
      evidence: `@media ${query}`,
    });
    emitEdge(ctx, {
      source: buildStableIdentity(ctx, 'component', ctx.screenId),
      target: buildStableIdentity(ctx, 'media_query', query),
      relation: 'responsive_variant_of',
      span: spanFromOffsets(ctx.path, ctx.content, start, end),
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
    emitFinding(ctx, {
      kind: 'design_token',
      name: token,
      span: spanFromOffsets(ctx.path, ctx.content, start, end),
      confidence: baseConfidence,
      extraction_method: method,
      evidence: `Design token ${token}`,
    });
    emitEdge(ctx, {
      source: buildStableIdentity(ctx, 'component', ctx.screenId),
      target: buildStableIdentity(ctx, 'design_token', token),
      relation: 'uses_design_token',
      span: spanFromOffsets(ctx.path, ctx.content, start, end),
      confidence: baseConfidence,
      extraction_method: method,
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
      span: spanFromOffsets(ctx.path, ctx.content, start, end),
      confidence: baseConfidence,
      extraction_method: method,
      attributes: { body: match[2].trim().slice(0, 160) },
      evidence: `CSS rule ${selector}`,
    });
  }
}

// Re-export extractor constant for consumers/tests.
export { GUI_STATIC_EXTRACTOR_VERSION } from './models.js';
