/**
 * VGO-072 — browser, responsive, visual, and accessibility fixtures.
 *
 * Drives GuiBrowserFixtureSuite@1 recipes in the dedicated optimizer
 * Playwright config on installed full Chromium. Overflow/clipping and
 * focus failures are measured live. Screenshot, accessibility, and
 * interaction artifacts persist through GuiEvidenceArtifactStore@1
 * (VGO-054) and are referenced by CID. Accessibility and security
 * regressions override visual/click gains. Pixel difference is
 * classified through VisualDiffPolicy@1 regions and thresholds, never
 * assumed to be a regression and never auto-approved by snapshot update.
 */

import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MANUAL_CHECK_IDS,
  UNSUPPORTED_WCAG_CRITERIA,
  evaluateLiveDomAccessibility,
  serializeAccessibilityReceipt,
  type AccessibilityEvaluationResult,
  type LiveDomSnapshot,
} from '../../src/services/gui-optimizer/accessibility.js';
import { makeUiMetricSnapshot } from '../../src/services/gui-optimizer/baseline.js';
import { evaluateObjective } from '../../src/services/gui-optimizer/evaluator.js';
import {
  canonicalIdentity,
  cidV1,
  parseCidV1,
  sha256Digest,
} from '../../src/services/gui-optimizer/identity.js';
import {
  makeUiInteractionStepInput,
  makeUiVisibleControl,
  runInteractionScenario,
  serializeInteractionReceipt,
  serializeUiInteractionTrace,
  type UiInteractionRunResult,
} from '../../src/services/gui-optimizer/interaction-runner.js';
import { makeUiActionBinding } from '../../src/services/gui-optimizer/policy-validator.js';
import {
  VIEWPORT_SPEC_INTERFACE,
  VIEWPORT_SPEC_SCHEMA,
  type ViewportSpec,
} from '../../src/services/gui-optimizer/scenario-catalog.js';
import {
  extractUiStateMachineFromFacts,
  makeUiEventDefinition,
  makeUiStateDefinition,
  makeUiTransitionDefinition,
} from '../../src/services/gui-optimizer/state-machine.js';
import {
  decodeVisualDiffPolicy,
  evaluateVisualRegression,
  type VisualDecision,
  type VisualGateReason,
  type VisualRegressionEvaluationResult,
} from '../../src/services/gui-optimizer/visual-regression.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(600_000);

const SPEC_DIR = dirname(fileURLToPath(import.meta.url));
const SWISSKNIFE_ROOT = resolve(SPEC_DIR, '../..');
const WORKSPACE_ROOT = resolve(SWISSKNIFE_ROOT, '..');
const SUITE_PATH = join(
  SWISSKNIFE_ROOT,
  'test/fixtures/gui-optimizer/browser/a11y-visual-cases.json',
);
const CONFIG_PATH = join(
  SWISSKNIFE_ROOT,
  'build-tools/configs/playwright.verified-gui-optimizer.config.ts',
);

const SUITE_INTERFACE = 'GuiBrowserFixtureSuite@1' as const;
const SUITE_SCHEMA = 'gui-browser-fixture-suite/v1' as const;
const MANIFEST_INTERFACE = 'GuiEvidenceArtifactManifest@1' as const;
const MANIFEST_SCHEMA =
  'ipfs_accelerate_py/agent-supervisor/gui-optimizer/evidence-artifact-manifest@1' as const;
const STORE_INTERFACE = 'GuiEvidenceArtifactStore@1' as const;
const RECORD_SCHEMA =
  'ipfs_accelerate_py/agent-supervisor/gui-optimizer/evidence-artifact-record@1' as const;
const REUSE_GATE_INTERFACE = 'GuiArtifactReuseGate@1' as const;
const REUSE_GATE_SCHEMA =
  'ipfs_accelerate_py/agent-supervisor/gui-optimizer/artifact-reuse-gate@1' as const;
const DOMAIN_MANIFEST = 'gui.evidence-artifact-manifest' as const;
const EXTRACTOR_ID = 'extractor:vgo-072-playwright';
const EXTRACTOR_VERSION = '1.0.0';
const REPOSITORY_ID =
  'repository:sha256:4e580c9c70ff41fdb7d1ace5f049df8d73c5dd7ea0d7fdfa5977b35b13476ee3';
const PYTHON_INTERPRETER = '/usr/bin/python3.12';
const REQUIRED_FAMILIES = Object.freeze([
  'narrow_overflow',
  'localized_clipping',
  'focus_lifecycle',
  'keyboard_navigation',
  'contrast_labels_ids',
  'expected_forbidden_visual_regions',
  'visual_gain_a11y_regression',
  'click_reduction_confirmation_bypass',
]);

const PYTHON_STORE_HELPER = `
import base64
import json
import sys
from pathlib import Path

def _emit(payload):
    sys.stdout.write(json.dumps(payload, separators=(",", ":"), sort_keys=True))
    sys.stdout.write("\\n")

def main():
    request = json.loads(sys.stdin.read())
    roots = request.get("pythonpath") or []
    if not isinstance(roots, list) or not roots:
        raise SystemExit("pythonpath roots are required")
    sys.path[:0] = [str(item) for item in roots]
    from ipfs_accelerate_py.agent_supervisor.gui_optimizer.artifact_store import (
        default_evidence_artifact_store,
    )
    store = default_evidence_artifact_store(Path(request["host_root"]))
    op = request["op"]
    if op == "put":
        if "bytes_b64" in request:
            body = base64.b64decode(request["bytes_b64"])
        elif "text" in request:
            body = request["text"]
        else:
            body = request["payload"]
        record = store.put(body, kind=request["kind"], binding=request["binding"])
        _emit({"record": record.to_dict()})
        return
    if op == "get":
        body, record = store.get(request["cid"], kind=request.get("kind"))
        _emit({
            "bytes_b64": base64.b64encode(body).decode("ascii"),
            "record": record.to_dict(),
        })
        return
    raise SystemExit(f"unsupported store op: {op}")

if __name__ == "__main__":
    main()
`;

type ArtifactKind =
  | 'screenshot'
  | 'accessibility'
  | 'trace'
  | 'baseline'
  | 'receipt'
  | 'manifest';

interface ReuseGate {
  readonly repository_id: string;
  readonly repository_revision: string;
  readonly component_id: string;
  readonly scenario_id: string;
  readonly extractor_id: string;
  readonly extractor_version: string;
  readonly checker_id: string;
  readonly checker_version: string;
  readonly interface: typeof REUSE_GATE_INTERFACE;
  readonly schema_version: typeof REUSE_GATE_SCHEMA;
}

interface StoredArtifact {
  readonly cid: string;
  readonly digest: string;
  readonly kind: ArtifactKind;
  readonly media_type: string;
  readonly size_bytes: number;
  readonly binding: ReuseGate;
  readonly host_relative_path: string;
  readonly interface: typeof STORE_INTERFACE;
  readonly schema_version: typeof RECORD_SCHEMA;
  readonly is_current_authority: false;
}

interface ViewportRecipe {
  readonly width: number;
  readonly height: number;
  readonly device_scale_factor: number;
  readonly interface: typeof VIEWPORT_SPEC_INTERFACE;
  readonly schema_version: typeof VIEWPORT_SPEC_SCHEMA;
}

interface ControlRecipe {
  readonly id: string;
  readonly tag: string;
  readonly text?: string;
  readonly type?: string;
  readonly labeled?: boolean;
  readonly for_id?: string;
  readonly duplicate_id?: string;
  readonly color?: string;
  readonly background?: string;
  readonly width?: string;
  readonly height?: string;
  readonly overflow?: string;
  readonly nowrap?: boolean;
  readonly children?: readonly ControlRecipe[];
}

interface VisualBlocks {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface VisualVariantColors {
  readonly banner: string;
  readonly canvas: string;
  readonly confirm: string;
  readonly review: string;
  readonly unexplained: string;
}

interface Recipe {
  readonly kind: string;
  readonly controls?: readonly ControlRecipe[];
  readonly variants?: Record<string, {
    readonly controls?: readonly ControlRecipe[];
    readonly bypass_confirmation?: boolean;
    readonly banner?: string;
    readonly canvas?: string;
    readonly confirm?: string;
    readonly review?: string;
    readonly unexplained?: string;
  }>;
  readonly blocks?: Record<string, VisualBlocks>;
}

interface VisualComparison {
  readonly comparison_id: string;
  readonly baseline_variant: string;
  readonly candidate_variant: string;
  readonly expected_decision: VisualDecision;
  readonly expected_gate_reasons: readonly VisualGateReason[];
}

interface ExpectedDisposition {
  readonly acceptance_decision: 'accept' | 'reject' | 'human-review' | null;
  readonly acceptance_reason_codes?: readonly string[];
  readonly classify_pixel_diff_via_policy?: boolean;
  readonly focus_loss?: boolean;
  readonly focus_sequence_prefix?: readonly string[];
  readonly keyboard_result?: string;
  readonly min_clipping_count?: number;
  readonly min_horizontal_overflow_count?: number;
  readonly min_viewport_overflow_count?: number;
  readonly min_candidate_a11y_violations?: number;
  readonly min_baseline_click_count?: number;
  readonly candidate_click_count?: number;
  readonly bypass_rejected?: boolean;
  readonly objective_id?: string;
  readonly objective_improved?: boolean;
  readonly required_a11y_rule_ids?: readonly string[];
  readonly tab_order_matches?: boolean;
  readonly visual_decision?: string;
}

interface FixtureCase {
  readonly case_id: string;
  readonly family: string;
  readonly scenario_id: string;
  readonly title: string;
  readonly viewport: string;
  readonly locale: string;
  readonly text_scale_percent: number;
  readonly recipe: Recipe;
  readonly drive: {
    readonly kind: string;
    readonly focus_start?: string;
    readonly rerender_control?: string;
    readonly expected_tab_order?: readonly string[];
  };
  readonly expected: ExpectedDisposition;
  readonly comparisons?: readonly VisualComparison[];
  readonly visual_policy?: Record<string, unknown>;
}

interface FixtureSuite {
  readonly interface: typeof SUITE_INTERFACE;
  readonly schema_version: typeof SUITE_SCHEMA;
  readonly suite_id: string;
  readonly application_id: string;
  readonly screen_id: string;
  readonly component_id: string;
  readonly families: readonly string[];
  readonly locale: string;
  readonly timezone: string;
  readonly color_scheme: string;
  readonly viewports: Readonly<Record<string, ViewportRecipe>>;
  readonly cases: readonly FixtureCase[];
}

interface OverflowMeasurement {
  readonly horizontal_overflow_count: number;
  readonly viewport_overflow_count: number;
  readonly clipping_count: number;
}

interface VariantCapture {
  readonly variant: string;
  readonly screenshot: StoredArtifact;
  readonly screenshot_width: number;
  readonly screenshot_height: number;
  readonly screenshot_digest: string;
  readonly rgba: { width: number; height: number; data: Uint8ClampedArray };
  readonly accessibility: StoredArtifact;
  readonly a11y: AccessibilityEvaluationResult;
  readonly visual: StoredArtifact;
  readonly visual_eval: VisualRegressionEvaluationResult;
  readonly interaction: StoredArtifact;
  readonly interaction_run: UiInteractionRunResult;
  readonly overflow: OverflowMeasurement;
  readonly live_focus_sequence: readonly string[];
  readonly live_focus_id: string;
  readonly click_count: number;
  readonly dispatched_without_confirmation: boolean;
}

interface CaseRun {
  readonly fixture: FixtureCase;
  readonly variants: Record<string, VariantCapture>;
  readonly comparisons: readonly {
    readonly comparison_id: string;
    readonly decision: VisualDecision;
    readonly gate_reasons: readonly VisualGateReason[];
    readonly pixel_diff_percent: number;
    readonly unexplained_pixel_diff_percent: number;
    readonly receipt: StoredArtifact;
  }[];
}

interface SuiteRun {
  readonly suite: FixtureSuite;
  readonly browser: string;
  readonly browser_version: string;
  readonly repository_revision: string;
  readonly cas_root: string;
  readonly cases: readonly CaseRun[];
  readonly manifest: {
    readonly identity_payload: {
      readonly interface: typeof MANIFEST_INTERFACE;
      readonly schema_version: typeof MANIFEST_SCHEMA;
      readonly run_id: string;
      readonly artifact_cids: readonly string[];
      readonly entries: readonly Record<string, unknown>[];
    };
    readonly cid: string;
    readonly digest: string;
  };
}

let suiteRun: SuiteRun | undefined;
const CAS_ROOT = resolveEvidenceCasRoot();

function resolveEvidenceCasRoot(): string {
  const fromEnv =
    process.env.VGO_EVIDENCE_CAS_ROOT
    || process.env.GUI_OPTIMIZER_ARTIFACT_ROOT;
  const raw = fromEnv && fromEnv.trim().length > 0
    ? fromEnv.trim()
    : join(SWISSKNIFE_ROOT, 'test-results/verified-gui-optimizer/vgo-072-cas');
  return resolve(raw);
}

function pythonImportRoots(): readonly string[] {
  return [
    join(WORKSPACE_ROOT, 'external/ipfs_accelerate'),
    join(WORKSPACE_ROOT, 'external/ipfs_datasets'),
  ];
}

function requirePythonInterpreter(): string {
  if (!existsSync(PYTHON_INTERPRETER)) {
    throw new Error(
      `VGO-054 store requires canonical interpreter ${PYTHON_INTERPRETER}; sealed PATH has no approved digest-bound Python deployment`,
    );
  }
  return PYTHON_INTERPRETER;
}

function invokeEvidenceStore(request: Record<string, unknown>): Record<string, unknown> {
  const python = requirePythonInterpreter();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONPATH: [
      ...pythonImportRoots(),
      process.env.PYTHONPATH || '',
    ].filter(item => item.length > 0).join(':'),
    PYTHONDONTWRITEBYTECODE: '1',
  };
  let raw: string;
  try {
    raw = execFileSync(python, ['-c', PYTHON_STORE_HELPER], {
      cwd: WORKSPACE_ROOT,
      env,
      encoding: 'utf8',
      input: `${JSON.stringify({
        ...request,
        host_root: CAS_ROOT,
        pythonpath: pythonImportRoots(),
      })}\n`,
      timeout: 60_000,
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`VGO-054 GuiEvidenceArtifactStore@1 invocation failed: ${detail}`);
  }
  const line = raw.trim().split('\n').filter(Boolean).pop();
  if (!line) {
    throw new Error('VGO-054 store returned an empty response');
  }
  return JSON.parse(line) as Record<string, unknown>;
}

function repositoryRevision(): string {
  const git = existsSync('/usr/bin/git') ? '/usr/bin/git' : 'git';
  const revision = execFileSync(git, ['rev-parse', 'HEAD'], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
  }).trim();
  if (!/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error(`repository revision is not a 40-character SHA-1: ${revision}`);
  }
  return revision;
}

function canonicalJsonBytes(payload: unknown): Buffer {
  return Buffer.from(`${stableStringify(payload)}\n`, 'utf8');
}

function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('canonical JSON rejects non-finite numbers');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter(key => record[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  throw new Error(`canonical JSON cannot encode ${typeof value}`);
}

function loadSuite(): FixtureSuite {
  const raw = JSON.parse(readFileSync(SUITE_PATH, 'utf8')) as FixtureSuite;
  if (raw.interface !== SUITE_INTERFACE) {
    throw new Error(`unsupported fixture suite interface: ${String(raw.interface)}`);
  }
  if (raw.schema_version !== SUITE_SCHEMA) {
    throw new Error(`unsupported fixture suite schema: ${String(raw.schema_version)}`);
  }
  if (!Array.isArray(raw.cases) || raw.cases.length === 0) {
    throw new Error('GuiBrowserFixtureSuite@1 must declare at least one case');
  }
  const ids = new Set<string>();
  for (const item of raw.cases) {
    if (ids.has(item.case_id)) {
      throw new Error(`duplicate fixture case_id: ${item.case_id}`);
    }
    ids.add(item.case_id);
  }
  const missing = REQUIRED_FAMILIES.filter(family => !raw.families.includes(family));
  if (missing.length > 0) {
    throw new Error(`fixture suite missing required families: ${missing.join(', ')}`);
  }
  return raw;
}

function makeGate(
  suite: FixtureSuite,
  scenarioId: string,
  checkerId: string,
  checkerVersion: string,
  revision: string,
): ReuseGate {
  return {
    repository_id: REPOSITORY_ID,
    repository_revision: revision,
    component_id: suite.component_id,
    scenario_id: scenarioId,
    extractor_id: EXTRACTOR_ID,
    extractor_version: EXTRACTOR_VERSION,
    checker_id: checkerId,
    checker_version: checkerVersion,
    interface: REUSE_GATE_INTERFACE,
    schema_version: REUSE_GATE_SCHEMA,
  };
}

function mediaTypeFor(kind: ArtifactKind): string {
  return kind === 'screenshot' ? 'image/png' : 'application/json';
}

function closedBinding(binding: ReuseGate): Record<string, string> {
  return {
    checker_id: binding.checker_id,
    checker_version: binding.checker_version,
    component_id: binding.component_id,
    extractor_id: binding.extractor_id,
    extractor_version: binding.extractor_version,
    interface: REUSE_GATE_INTERFACE,
    repository_id: binding.repository_id,
    repository_revision: binding.repository_revision,
    scenario_id: binding.scenario_id,
    schema_version: REUSE_GATE_SCHEMA,
  };
}

function putArtifact(
  payload: Uint8Array | Buffer | string | Record<string, unknown>,
  kind: ArtifactKind,
  binding: ReuseGate,
): StoredArtifact {
  const body = Buffer.isBuffer(payload) || payload instanceof Uint8Array
    ? Buffer.from(payload)
    : typeof payload === 'string'
      ? Buffer.from(payload, 'utf8')
      : canonicalJsonBytes(payload);
  if (body.length < 1) {
    throw new Error('artifact payload must not be empty');
  }
  const expectedCid = cidV1(body);
  parseCidV1(expectedCid);
  const expectedDigest = sha256Digest(body);
  const response = invokeEvidenceStore({
    op: 'put',
    kind,
    binding: closedBinding(binding),
    bytes_b64: body.toString('base64'),
  });
  const record = response.record as StoredArtifact | undefined;
  if (!record || record.cid !== expectedCid || record.digest !== expectedDigest) {
    throw new Error(`VGO-054 put did not rehash to ${expectedCid}`);
  }
  if (record.is_current_authority !== false) {
    throw new Error('VGO-054 reuse must never become current authority');
  }
  if (record.kind !== kind || record.media_type !== mediaTypeFor(kind)) {
    throw new Error(`VGO-054 stored kind/media_type mismatch for ${expectedCid}`);
  }
  const roundTrip = getArtifact(record.cid);
  if (!roundTrip.equals(body) || cidV1(roundTrip) !== record.cid) {
    throw new Error(`VGO-054 stored artifact failed post-write rehash: ${record.cid}`);
  }
  return {
    cid: record.cid,
    digest: record.digest,
    kind,
    media_type: record.media_type,
    size_bytes: record.size_bytes,
    binding,
    host_relative_path: record.host_relative_path,
    interface: STORE_INTERFACE,
    schema_version: RECORD_SCHEMA,
    is_current_authority: false,
  };
}

function getArtifact(cid: string): Buffer {
  parseCidV1(cid);
  const response = invokeEvidenceStore({ op: 'get', cid });
  const record = response.record as { cid?: string; digest?: string } | undefined;
  const encoded = response.bytes_b64;
  if (!record || typeof encoded !== 'string') {
    throw new Error(`artifact CID is not present: ${cid}`);
  }
  const body = Buffer.from(encoded, 'base64');
  const recomputed = cidV1(body);
  if (recomputed !== cid || record.cid !== cid) {
    throw new Error(`stored artifact bytes do not rehash to ${cid}`);
  }
  if (record.digest !== sha256Digest(body)) {
    throw new Error(`artifact metadata does not rehash for ${cid}`);
  }
  return body;
}

function closedManifestPayload(
  runId: string,
  artifacts: readonly StoredArtifact[],
) {
  const unique = new Map<string, StoredArtifact>();
  for (const item of artifacts) {
    getArtifact(item.cid);
    if (!unique.has(item.cid)) unique.set(item.cid, item);
  }
  const entries = [...unique.values()]
    .sort((left, right) => left.cid.localeCompare(right.cid))
    .map(entry => ({
      binding: closedBinding(entry.binding),
      cid: entry.cid,
      digest: entry.digest,
      kind: entry.kind,
      media_type: entry.media_type,
      size_bytes: entry.size_bytes,
    }));
  return {
    artifact_cids: entries.map(entry => entry.cid),
    entries,
    interface: MANIFEST_INTERFACE,
    run_id: runId,
    schema_version: MANIFEST_SCHEMA,
  };
}

function putManifest(
  suite: FixtureSuite,
  runId: string,
  artifacts: readonly StoredArtifact[],
  revision: string,
) {
  const identityPayload = closedManifestPayload(runId, artifacts);
  const identity = canonicalIdentity(identityPayload, {
    domain: DOMAIN_MANIFEST,
    schemaVersion: MANIFEST_SCHEMA,
  });
  const stored = putArtifact(
    identityPayload,
    'manifest',
    makeGate(suite, 'scenario:vgo-072-manifest', 'checker:evidence-manifest@1', '1.0.0', revision),
  );
  return {
    identity_payload: identityPayload,
    cid: stored.cid,
    digest: identity.digest,
  };
}

function pngDimensions(png: Buffer): { width: number; height: number } {
  if (
    png.length < 24
    || png[0] !== 0x89
    || png[1] !== 0x50
    || png[2] !== 0x4e
    || png[3] !== 0x47
  ) {
    throw new Error('screenshot is not a live PNG capture');
  }
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderControl(control: ControlRecipe): string {
  const id = escapeHtml(control.duplicate_id || control.id);
  const controlId = escapeHtml(control.id);
  const styles: string[] = [];
  if (control.color) styles.push(`color:${control.color}`);
  if (control.background) styles.push(`background:${control.background}`);
  if (control.width) styles.push(`width:${control.width}`);
  if (control.height) styles.push(`height:${control.height}`);
  if (control.overflow) styles.push(`overflow:${control.overflow}`);
  if (control.nowrap) styles.push('white-space:nowrap');
  const styleAttr = styles.length > 0 ? ` style="${styles.join(';')}"` : '';
  const common =
    `id="${id}" data-control="${controlId}" data-testid="${controlId}"${styleAttr}`;
  if (control.tag === 'input') {
    const type = escapeHtml(control.type || 'text');
    const labeled = control.labeled === true
      ? ` aria-label="Goal"`
      : '';
    return `<input ${common} type="${type}"${labeled} />`;
  }
  if (control.tag === 'label') {
    const forId = escapeHtml(control.for_id || '');
    return `<label ${common} for="${forId}">${escapeHtml(control.text || '')}</label>`;
  }
  const children = (control.children ?? []).map(renderControl).join('');
  const text = control.text ? escapeHtml(control.text) : '';
  return `<${control.tag} ${common}>${text}${children}</${control.tag}>`;
}

function percentBox(box: VisualBlocks, color: string, controlId: string): string {
  return [
    `<div id="${escapeHtml(controlId)}" data-control="${escapeHtml(controlId)}" data-testid="${escapeHtml(controlId)}"`,
    ` style="position:absolute;left:${box.x * 100}%;top:${box.y * 100}%;`,
    `width:${box.width * 100}%;height:${box.height * 100}%;background:${color};"></div>`,
  ].join('');
}

function visualColors(recipe: Recipe, variant: string): VisualVariantColors {
  const raw = recipe.variants?.[variant] ?? {};
  return {
    banner: raw.banner || '#1d4ed8',
    canvas: raw.canvas || '#ffffff',
    confirm: raw.confirm || '#166534',
    review: raw.review || '#ffffff',
    unexplained: raw.unexplained || '#ffffff',
  };
}

function renderFixtureHtml(
  suite: FixtureSuite,
  fixture: FixtureCase,
  variant: string,
): string {
  const recipe = fixture.recipe;
  const viewport = suite.viewports[fixture.viewport];
  let body = '';
  if (recipe.kind === 'visual_blocks' && recipe.blocks) {
    const colors = visualColors(recipe, variant);
    const extras: string[] = [
      percentBox(recipe.blocks.banner, colors.banner, 'control:banner'),
      percentBox(recipe.blocks.confirm, colors.confirm, 'control:confirm'),
    ];
    if (colors.unexplained !== colors.canvas) {
      extras.push(percentBox(recipe.blocks.unexplained, colors.unexplained, 'control:unexplained'));
    }
    if (colors.review !== colors.canvas) {
      extras.push(percentBox(recipe.blocks.review, colors.review, 'control:review'));
    }
    body = extras.join('');
  } else {
    const controls = recipe.variants?.[variant]?.controls ?? recipe.controls ?? [];
    body = controls.map(renderControl).join('');
  }
  const bypass = recipe.variants?.[variant]?.bypass_confirmation === true;
  const rootOverflow = fixture.family === 'narrow_overflow' ? 'visible' : 'hidden';
  return `<!DOCTYPE html>
<html lang="en" data-interface="${SUITE_INTERFACE}" data-schema="${SUITE_SCHEMA}" data-case="${escapeHtml(fixture.case_id)}" data-variant="${escapeHtml(variant)}" data-color-scheme="${suite.color_scheme}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${viewport.width}" />
  <title>${escapeHtml(fixture.title)}</title>
  <style>
    html, body { margin: 0; padding: 0; background: #ffffff; color: #111111; font: 16px/1.4 ui-sans-serif, system-ui, sans-serif; overflow: ${rootOverflow}; }
    #fixture-root { position: relative; width: ${viewport.width}px; height: ${viewport.height}px; overflow: ${rootOverflow}; background: #ffffff; }
    button, input, label, h1, span, div { box-sizing: border-box; }
    button { margin: 8px; padding: 6px 10px; }
    input { margin: 8px; }
  </style>
</head>
<body>
  <main id="fixture-root" data-testid="fixture-root" data-case="${escapeHtml(fixture.case_id)}" data-variant="${escapeHtml(variant)}" data-bypass="${bypass ? 'true' : 'false'}">
    ${body}
    <div id="fixture-status" data-testid="fixture-status" data-clicks="0" data-dispatched="false" hidden></div>
  </main>
  <script>
    (function () {
      var root = document.getElementById('fixture-root');
      var status = document.getElementById('fixture-status');
      var clicks = 0;
      var dispatched = false;
      var confirmed = false;
      function record(target) {
        clicks += 1;
        status.setAttribute('data-clicks', String(clicks));
        status.setAttribute('data-last', target);
      }
      var submit = document.querySelector('[data-control="control:submit"]');
      var grant = document.querySelector('[data-control="control:confirm-grant"]');
      if (submit) {
        submit.addEventListener('click', function () {
          record('control:submit');
          if (root.getAttribute('data-bypass') === 'true') {
            dispatched = true;
            status.setAttribute('data-dispatched', 'true');
            status.setAttribute('data-confirmation', 'bypassed');
          } else {
            status.setAttribute('data-confirmation', 'required');
          }
        });
      }
      if (grant) {
        grant.addEventListener('click', function () {
          record('control:confirm-grant');
          confirmed = true;
          dispatched = true;
          status.setAttribute('data-dispatched', 'true');
          status.setAttribute('data-confirmation', 'granted');
        });
      }
      var rerender = document.querySelector('[data-control="control:focus-rerender"]');
      if (rerender) {
        rerender.addEventListener('click', function () {
          var first = document.querySelector('[data-control="control:focus-first"]');
          if (first && first.parentNode) first.parentNode.removeChild(first);
          if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
          }
          status.setAttribute('data-focus-loss', 'true');
        });
      }
      window.__vgo072 = {
        clicks: function () { return clicks; },
        dispatched: function () { return dispatched; },
        confirmed: function () { return confirmed; }
      };
    })();
  </script>
</body>
</html>`;
}

async function openFixture(
  page: Page,
  suite: FixtureSuite,
  fixture: FixtureCase,
  variant: string,
): Promise<void> {
  const viewport = suite.viewports[fixture.viewport];
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.setContent(renderFixtureHtml(suite, fixture, variant), {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('[data-testid="fixture-root"]');
}

async function captureLiveDom(page: Page): Promise<LiveDomSnapshot> {
  return page.evaluate(() => {
    const walk = (node: Element): Record<string, unknown> => {
      const style = window.getComputedStyle(node);
      const attrs: Record<string, string> = {};
      for (const attr of Array.from(node.attributes)) {
        attrs[attr.name] = attr.value;
      }
      const ownText = Array.from(node.childNodes)
        .filter(child => child.nodeType === Node.TEXT_NODE)
        .map(child => (child.textContent || '').trim())
        .filter(Boolean)
        .join(' ');
      const name = node.getAttribute('aria-label')
        || (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
          ? node.labels?.[0]?.textContent?.trim()
          : undefined)
        || (node instanceof HTMLElement ? ownText.slice(0, 80) : undefined);
      return {
        tag: node.tagName.toLowerCase(),
        node_id: node.getAttribute('data-control')
          || node.getAttribute('data-testid')
          || node.id
          || undefined,
        id: node.id || undefined,
        role: node.getAttribute('role') || undefined,
        name: name || undefined,
        type: node.getAttribute('type') || undefined,
        attributes: attrs,
        text: ownText || (node instanceof HTMLElement ? node.innerText.trim().slice(0, 160) : ''),
        visible: style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0',
        enabled: !(node instanceof HTMLButtonElement || node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)
          ? true
          : !node.disabled,
        focusable: node.hasAttribute('tabindex') || ['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName),
        tabindex: node.hasAttribute('tabindex')
          ? Number(node.getAttribute('tabindex'))
          : undefined,
        computed_style: {
          display: style.display,
          visibility: style.visibility,
          color: style.color,
          backgroundColor: style.backgroundColor,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          opacity: style.opacity,
        },
        children: Array.from(node.children).map(child => walk(child)),
      };
    };
    return {
      interface: 'LiveDomSnapshot@1',
      schema_version: 'live-dom-snapshot/v1',
      html: document.documentElement.outerHTML,
      lang: document.documentElement.lang || 'en',
      title: document.title,
      root: walk(document.body),
    };
  });
}

async function captureRgba(page: Page, png: Buffer): Promise<{
  width: number;
  height: number;
  data: Uint8ClampedArray;
}> {
  const decoded = await page.evaluate(async dataUrl => {
    const image = new Image();
    await new Promise<void>((resolveImage, rejectImage) => {
      image.onload = () => resolveImage();
      image.onerror = () => rejectImage(new Error('screenshot decode failed'));
      image.src = dataUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('2d context unavailable');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    return {
      width: pixels.width,
      height: pixels.height,
      data: Array.from(pixels.data),
    };
  }, `data:image/png;base64,${png.toString('base64')}`);
  return {
    width: decoded.width,
    height: decoded.height,
    data: Uint8ClampedArray.from(decoded.data),
  };
}

async function measureOverflow(page: Page): Promise<OverflowMeasurement> {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let horizontal = 0;
    let viewport = 0;
    let clipping = 0;
    for (const node of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      if (node.id === 'fixture-status') continue;
      const style = window.getComputedStyle(node);
      if (node.scrollWidth > node.clientWidth + 1) horizontal += 1;
      const box = node.getBoundingClientRect();
      if (box.width > viewportWidth + 1 || box.right > viewportWidth + 1) viewport += 1;
      if (
        (style.overflow === 'hidden' || style.overflowX === 'hidden' || style.overflowY === 'hidden')
        && (node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1)
      ) {
        clipping += 1;
      }
      if (box.bottom > viewportHeight + 8 && style.position === 'fixed') viewport += 1;
    }
    return {
      horizontal_overflow_count: horizontal,
      viewport_overflow_count: viewport,
      clipping_count: clipping,
    };
  });
}

async function liveFocusId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body) return '';
    return active.getAttribute('data-control')
      || active.getAttribute('data-testid')
      || active.id
      || '';
  });
}

async function driveVariant(
  page: Page,
  fixture: FixtureCase,
  variant: string,
): Promise<{ sequence: string[]; clickCount: number; dispatchedWithoutConfirmation: boolean }> {
  const sequence: string[] = [];
  const record = async () => {
    const id = await liveFocusId(page);
    if (id && sequence[sequence.length - 1] !== id) sequence.push(id);
  };
  if (fixture.drive.kind === 'keyboard' && fixture.drive.focus_start) {
    await page.locator(`[data-control="${fixture.drive.focus_start}"]`).focus();
    await record();
    const remaining = (fixture.drive.expected_tab_order ?? []).slice(1);
    for (const _ of remaining) {
      await page.keyboard.press('Tab');
      await record();
    }
  } else if (fixture.drive.kind === 'focus_lifecycle' && fixture.drive.focus_start) {
    await page.locator(`[data-control="${fixture.drive.focus_start}"]`).focus();
    await record();
    await page.keyboard.press('Tab');
    await record();
    if (fixture.drive.rerender_control) {
      await page.locator(`[data-control="${fixture.drive.rerender_control}"]`).click();
      await record();
    }
  } else if (fixture.drive.kind === 'confirmation_bypass') {
    const submit = page.locator('[data-control="control:submit"]');
    await submit.click();
    if (variant !== 'candidate') {
      const grant = page.locator('[data-control="control:confirm-grant"]');
      await expect(grant).toHaveCount(1);
      await grant.click();
    }
  }
  const status = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="fixture-status"]');
    return {
      clicks: Number(node?.getAttribute('data-clicks') || '0'),
      dispatched: node?.getAttribute('data-dispatched') === 'true',
      confirmation: node?.getAttribute('data-confirmation') || '',
    };
  });
  return {
    sequence,
    clickCount: status.clicks,
    dispatchedWithoutConfirmation: status.confirmation === 'bypassed',
  };
}

function collectControlIds(recipe: Recipe, variant: string): string[] {
  const controls = recipe.variants?.[variant]?.controls ?? recipe.controls ?? [];
  const ids: string[] = [];
  const walk = (items: readonly ControlRecipe[]) => {
    for (const item of items) {
      ids.push(item.id);
      if (item.children) walk(item.children);
    }
  };
  walk(controls);
  if (recipe.kind === 'visual_blocks') {
    return ['control:banner', 'control:confirm', 'control:review', 'control:unexplained'];
  }
  return ids;
}

function buildStateMachine(suite: FixtureSuite, fixture: FixtureCase) {
  const screen = suite.screen_id;
  return extractUiStateMachineFromFacts({
    application_id: suite.application_id,
    screen_id: screen,
    machine_id: `sm:vgo-072:${fixture.case_id}`,
    states: [
      makeUiStateDefinition({ state_id: 'state:ready', kind: 'ready', screen_id: screen, label: 'Ready', is_initial: true }),
      makeUiStateDefinition({ state_id: 'state:confirmation', kind: 'confirmation', screen_id: screen, label: 'Confirm' }),
      makeUiStateDefinition({ state_id: 'state:success', kind: 'success', screen_id: screen, label: 'Success', is_terminal: true }),
    ],
    events: [
      makeUiEventDefinition({ event_id: 'event:focus', kind: 'focus', name: 'focus' }),
      makeUiEventDefinition({ event_id: 'event:tab', kind: 'keyboard_activation', name: 'tab' }),
      makeUiEventDefinition({ event_id: 'event:submit', kind: 'submit', name: 'submit' }),
      makeUiEventDefinition({ event_id: 'event:confirmation-grant', kind: 'confirmation_grant', name: 'grant' }),
    ],
    transitions: [
      makeUiTransitionDefinition({
        transition_id: 't:ready-focus',
        from_state_id: 'state:ready',
        to_state_id: 'state:ready',
        event_id: 'event:focus',
        is_noop: true,
      }),
      makeUiTransitionDefinition({
        transition_id: 't:ready-tab',
        from_state_id: 'state:ready',
        to_state_id: 'state:ready',
        event_id: 'event:tab',
        is_noop: true,
      }),
      makeUiTransitionDefinition({
        transition_id: 't:ready-submit',
        from_state_id: 'state:ready',
        to_state_id: 'state:confirmation',
        event_id: 'event:submit',
      }),
      makeUiTransitionDefinition({
        transition_id: 't:confirm-grant',
        from_state_id: 'state:confirmation',
        to_state_id: 'state:success',
        event_id: 'event:confirmation-grant',
      }),
    ],
  });
}

function interactionFor(
  suite: FixtureSuite,
  fixture: FixtureCase,
  variant: string,
  revision: string,
): UiInteractionRunResult {
  const ids = collectControlIds(fixture.recipe, variant);
  const visible = ids.map(id => makeUiVisibleControl({
    control_id: id,
    role: id.includes('goal') ? 'textbox' : 'button',
    action_id: id === 'control:submit' ? 'action:dispatch' : '',
  }));
  const bindings = [
    makeUiActionBinding({
      action_id: 'action:dispatch',
      method: 'POST',
      schema_id: 'schema:dispatch',
      requires_confirmation: true,
      confirmation_id: 'confirm:dispatch',
      is_destructive: true,
    }),
  ];
  const steps = [];
  if (fixture.drive.kind === 'keyboard' && fixture.drive.expected_tab_order) {
    const order = fixture.drive.expected_tab_order;
    steps.push(makeUiInteractionStepInput({
      step_id: 'step:keyboard-focus',
      kind: 'focus',
      target_control_id: order[0],
      event_id: 'event:focus',
      expected_focus_id: order[0],
      keyboard: true,
    }));
    for (let index = 1; index < order.length; index += 1) {
      steps.push(makeUiInteractionStepInput({
        step_id: `step:keyboard-tab-${index}`,
        kind: 'tab',
        target_control_id: order[index],
        event_id: 'event:tab',
        expected_focus_id: order[index],
        keyboard: true,
      }));
    }
  } else if (fixture.drive.kind === 'focus_lifecycle' && fixture.drive.focus_start) {
    steps.push(makeUiInteractionStepInput({
      step_id: 'step:focus-first',
      kind: 'focus',
      target_control_id: fixture.drive.focus_start,
      event_id: 'event:focus',
      expected_focus_id: fixture.drive.focus_start,
    }));
    steps.push(makeUiInteractionStepInput({
      step_id: 'step:focus-tab',
      kind: 'tab',
      target_control_id: 'control:focus-second',
      event_id: 'event:tab',
      expected_focus_id: 'control:focus-second',
      keyboard: true,
    }));
    steps.push(makeUiInteractionStepInput({
      step_id: 'step:focus-loss',
      kind: 'blur',
      target_control_id: 'control:focus-second',
      expected_focus_id: '',
      notes: 'focus_loss',
    }));
  } else if (fixture.drive.kind === 'confirmation_bypass') {
    steps.push(makeUiInteractionStepInput({
      step_id: 'step:submit',
      kind: 'submit',
      target_control_id: 'control:submit',
      event_id: 'event:submit',
      action_id: 'action:dispatch',
      confirmation_id: 'confirm:dispatch',
    }));
    if (variant !== 'candidate') {
      steps.push(makeUiInteractionStepInput({
        step_id: 'step:grant',
        kind: 'confirmation_grant',
        target_control_id: 'control:confirm-grant',
        event_id: 'event:confirmation-grant',
        action_id: 'action:dispatch',
        confirmation_id: 'confirm:dispatch',
      }));
    }
  } else {
    const first = ids[0] || 'control:heading';
    steps.push(makeUiInteractionStepInput({
      step_id: 'step:observe',
      kind: 'focus',
      target_control_id: first,
      event_id: 'event:focus',
      expected_focus_id: first,
    }));
  }
  return runInteractionScenario({
    application_id: suite.application_id,
    screen_id: suite.screen_id,
    scenario_id: `${fixture.scenario_id}:${variant}`,
    repository_revision: revision,
    state_machine: buildStateMachine(suite, fixture),
    visible_controls: visible,
    action_bindings: bindings,
    expected_terminal_states: variant === 'candidate' && fixture.drive.kind === 'confirmation_bypass'
      ? ['state:confirmation']
      : ['state:ready', 'state:confirmation', 'state:success'],
    initial_state_id: 'state:ready',
    steps,
    evidence_level: 'automated',
    attempt_boundary_bypass: variant === 'candidate' && fixture.drive.kind === 'confirmation_bypass',
  });
}

function viewportSpec(suite: FixtureSuite, fixture: FixtureCase): ViewportSpec {
  const viewport = suite.viewports[fixture.viewport];
  return {
    interface: VIEWPORT_SPEC_INTERFACE,
    schema_version: VIEWPORT_SPEC_SCHEMA,
    width: viewport.width,
    height: viewport.height,
    device_scale_factor: viewport.device_scale_factor,
  };
}

function passingAuthority() {
  return {
    evidence_level: 'automated' as const,
    analysis_classification: 'exact' as const,
    verification_status: 'verified' as const,
  };
}

function caseVariants(fixture: FixtureCase): readonly string[] {
  if (fixture.recipe.kind === 'visual_blocks') {
    return ['baseline', 'expected', 'forbidden', 'review', 'unexplained'];
  }
  if (fixture.recipe.variants) {
    return Object.keys(fixture.recipe.variants);
  }
  return ['live'];
}

async function captureVariant(
  page: Page,
  suite: FixtureSuite,
  fixture: FixtureCase,
  variant: string,
  revision: string,
  browser: string,
  browserVersion: string,
): Promise<VariantCapture> {
  await openFixture(page, suite, fixture, variant);
  const driven = await driveVariant(page, fixture, variant);
  const png = Buffer.from(
    await page.locator('#fixture-root').screenshot({ type: 'png', animations: 'disabled' }),
  );
  const dimensions = pngDimensions(png);
  const rgba = await captureRgba(page, png);
  const snapshot = await captureLiveDom(page);
  const a11y = evaluateLiveDomAccessibility({
    application_id: suite.application_id,
    screen_id: suite.screen_id,
    scenario_id: `${fixture.scenario_id}:${variant}`,
    repository_revision: revision,
    snapshot,
    expected_tab_order: [...(fixture.drive.expected_tab_order ?? [])],
    screen_reader_reviewed: false,
    evidence_level: 'automated',
  });
  const visual = evaluateVisualRegression({
    application_id: suite.application_id,
    screen_id: suite.screen_id,
    scenario_id: `${fixture.scenario_id}:${variant}`,
    repository_revision: revision,
    capture: {
      source: 'browser',
      width: rgba.width,
      height: rgba.height,
      data: rgba.data,
      browser,
      browser_version: browserVersion,
    },
    viewport: viewportSpec(suite, fixture),
    color_scheme: suite.color_scheme,
    locale: fixture.locale,
    text_scale_percent: fixture.text_scale_percent,
    browser,
    browser_version: browserVersion,
  });
  const overflow = await measureOverflow(page);
  const interaction = interactionFor(suite, fixture, variant, revision);
  const scenarioKey = `${fixture.scenario_id}:${variant}`;
  const screenshot = putArtifact(
    png,
    'screenshot',
    makeGate(suite, scenarioKey, 'checker:visual-regression@1', '1.0.0', revision),
  );
  const accessibility = putArtifact(
    {
      findings: a11y.findings,
      keyboard: a11y.keyboard,
      receipt: a11y.receipt,
      receipt_identity: a11y.receipt_identity,
      unsupported_criteria: [...a11y.receipt.unsupported_criteria],
      wcag_certification_claimed: a11y.wcag_certification_claimed,
      wcag_compliance_claimed: a11y.wcag_compliance_claimed,
    },
    'accessibility',
    makeGate(suite, scenarioKey, 'checker:accessibility@1', '1.0.0', revision),
  );
  const visualStored = putArtifact(
    {
      decision: visual.receipt.decision,
      receipt: visual.receipt,
      screenshot_digest: visual.receipt.screenshot_digest,
      screenshot_height: visual.receipt.screenshot_height,
      screenshot_width: visual.receipt.screenshot_width,
    },
    'receipt',
    makeGate(suite, scenarioKey, 'checker:visual-regression@1', '1.0.0', revision),
  );
  const interactionStored = putArtifact(
    {
      focus_sequence: interaction.receipt.focus_sequence,
      receipt: interaction.receipt,
      receipt_identity: interaction.receipt_identity,
      trace: interaction.trace,
      trace_identity: interaction.normalized_trace_identity,
    },
    'trace',
    makeGate(suite, scenarioKey, 'checker:interaction@1', '1.0.0', revision),
  );
  return {
    variant,
    screenshot,
    screenshot_width: dimensions.width,
    screenshot_height: dimensions.height,
    screenshot_digest: visual.receipt.screenshot_digest,
    rgba,
    accessibility,
    a11y,
    visual: visualStored,
    visual_eval: visual,
    interaction: interactionStored,
    interaction_run: interaction,
    overflow,
    live_focus_sequence: driven.sequence,
    live_focus_id: await liveFocusId(page),
    click_count: driven.clickCount,
    dispatched_without_confirmation: driven.dispatchedWithoutConfirmation,
  };
}

function compareVariants(
  suite: FixtureSuite,
  fixture: FixtureCase,
  baseline: VariantCapture,
  candidate: VariantCapture,
  comparison: VisualComparison,
  revision: string,
  browser: string,
  browserVersion: string,
) {
  if (!fixture.visual_policy) {
    throw new Error(`${fixture.case_id} is missing visual_policy`);
  }
  const policy = decodeVisualDiffPolicy(fixture.visual_policy);
  const result = evaluateVisualRegression({
    application_id: suite.application_id,
    screen_id: suite.screen_id,
    scenario_id: `${fixture.scenario_id}:${comparison.comparison_id}`,
    repository_revision: revision,
    capture: {
      source: 'browser',
      width: candidate.rgba.width,
      height: candidate.rgba.height,
      data: candidate.rgba.data,
      browser,
      browser_version: browserVersion,
    },
    baseline: {
      source: 'browser',
      width: baseline.rgba.width,
      height: baseline.rgba.height,
      data: baseline.rgba.data,
      browser,
      browser_version: browserVersion,
    },
    policy,
    viewport: viewportSpec(suite, fixture),
    color_scheme: suite.color_scheme,
    locale: fixture.locale,
    text_scale_percent: fixture.text_scale_percent,
    browser,
    browser_version: browserVersion,
  });
  const stored = putArtifact(
    {
      comparison_id: comparison.comparison_id,
      decision: result.receipt.decision,
      gate_reasons: [...result.gate_reasons],
      measurement: result.measurement,
      receipt: result.receipt,
      screenshot_digest: result.receipt.screenshot_digest,
    },
    'receipt',
    makeGate(
      suite,
      `${fixture.scenario_id}:${comparison.comparison_id}`,
      'checker:visual-regression@1',
      '1.0.0',
      revision,
    ),
  );
  return {
    comparison_id: comparison.comparison_id,
    decision: result.receipt.decision,
    gate_reasons: result.gate_reasons,
    pixel_diff_percent: result.receipt.pixel_diff_percent,
    unexplained_pixel_diff_percent: result.measurement.unexplained_pixel_diff_percent,
    receipt: stored,
    evaluation: result,
  };
}

function requireRun(): SuiteRun {
  if (!suiteRun) {
    throw new Error('fixture suite capture did not run');
  }
  return suiteRun;
}

function caseByFamily(family: string): CaseRun {
  const found = requireRun().cases.find(item => item.fixture.family === family);
  if (!found) {
    throw new Error(`missing captured family ${family}`);
  }
  return found;
}

function primaryVariant(run: CaseRun): VariantCapture {
  return run.variants.live
    || run.variants.baseline
    || run.variants[Object.keys(run.variants)[0]];
}

test.describe('VGO-072 verified GUI optimizer browser fixtures', () => {
  test('dedicated optimizer config executes GuiBrowserFixtureSuite@1 in installed full Chromium', async ({
    page,
    browserName,
    browser,
  }) => {
    expect(browserName).toBe('chromium');
    expect(process.env.PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL).toBe('0');
    const configSource = readFileSync(CONFIG_PATH, 'utf8');
    expect(configSource).toContain("channel: 'chromium'");
    expect(configSource).toContain("**/verified-gui-optimizer-*.spec.ts");
    expect(configSource).not.toContain("channel: 'chrome'");
    expect(existsSync(PYTHON_INTERPRETER)).toBe(true);
    expect(existsSync(SUITE_PATH)).toBe(true);

    const suite = loadSuite();
    expect(suite.interface).toBe(SUITE_INTERFACE);
    expect(suite.schema_version).toBe(SUITE_SCHEMA);
    expect([...suite.families]).toEqual([...REQUIRED_FAMILIES]);
    expect(suite.cases.map(item => item.family).sort()).toEqual([...REQUIRED_FAMILIES].sort());

    const version = browser.version();
    expect(version.length).toBeGreaterThan(0);
    const revision = repositoryRevision();
    mkdirSync(CAS_ROOT, { recursive: true });
    expect(CAS_ROOT.includes(`${join(WORKSPACE_ROOT, 'data', 'agent_supervisor')}`)).toBe(false);

    const cases: CaseRun[] = [];
    const stored: StoredArtifact[] = [];
    for (const [index, fixture] of suite.cases.entries()) {
      console.log(
        `[vgo-072] heartbeat ${fixture.case_id} ${index + 1}/${suite.cases.length}`,
      );
      const variants: Record<string, VariantCapture> = {};
      for (const variant of caseVariants(fixture)) {
        const capture = await captureVariant(
          page,
          suite,
          fixture,
          variant,
          revision,
          'chromium',
          version,
        );
        variants[variant] = capture;
        stored.push(
          capture.screenshot,
          capture.accessibility,
          capture.visual,
          capture.interaction,
        );
      }
      const comparisons = [];
      for (const comparison of fixture.comparisons ?? []) {
        const baseline = variants[comparison.baseline_variant];
        const candidate = variants[comparison.candidate_variant];
        if (!baseline || !candidate) {
          throw new Error(`missing comparison variants for ${comparison.comparison_id}`);
        }
        const compared = compareVariants(
          suite,
          fixture,
          baseline,
          candidate,
          comparison,
          revision,
          'chromium',
          version,
        );
        comparisons.push(compared);
        stored.push(compared.receipt);
      }
      cases.push({ fixture, variants, comparisons });
    }

    const manifest = putManifest(suite, 'vgo-072-a11y-visual-fixtures', stored, revision);
    suiteRun = {
      suite,
      browser: 'chromium',
      browser_version: version,
      repository_revision: revision,
      cas_root: CAS_ROOT,
      cases,
      manifest,
    };

    expect(cases).toHaveLength(suite.cases.length);
    expect(manifest.identity_payload.artifact_cids.length).toBeGreaterThan(0);
    expect(serializeAccessibilityReceipt(primaryVariant(cases[0]).a11y.receipt).length).toBeGreaterThan(0);
    expect(serializeInteractionReceipt(primaryVariant(cases[0]).interaction_run.receipt).length).toBeGreaterThan(0);
    expect(serializeUiInteractionTrace(primaryVariant(cases[0]).interaction_run.trace).length).toBeGreaterThan(0);
  });

  test('artifact CIDs resolve and rehash through the VGO-054 store', () => {
    const run = requireRun();
    const payload = run.manifest.identity_payload;
    expect(payload.interface).toBe(MANIFEST_INTERFACE);
    expect(payload.schema_version).toBe(MANIFEST_SCHEMA);
    const resolvedManifest = getArtifact(run.manifest.cid);
    expect(cidV1(resolvedManifest)).toBe(run.manifest.cid);
    expect(sha256Digest(resolvedManifest)).toBe(sha256Digest(canonicalJsonBytes(payload)));

    const kinds = new Set<string>();
    for (const cid of payload.artifact_cids) {
      const body = getArtifact(cid);
      expect(cidV1(body)).toBe(cid);
      const entry = payload.entries.find(item => item.cid === cid) as { kind: string; digest: string };
      expect(sha256Digest(body)).toBe(entry.digest);
      kinds.add(entry.kind);
    }
    expect(kinds.has('screenshot')).toBe(true);
    expect(kinds.has('accessibility')).toBe(true);
    expect(kinds.has('trace')).toBe(true);
    expect(kinds.has('receipt')).toBe(true);

    for (const item of run.cases) {
      for (const capture of Object.values(item.variants)) {
        const png = getArtifact(capture.screenshot.cid);
        expect(png.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
        expect(capture.screenshot.media_type).toBe('image/png');
        expect(capture.a11y.receipt.interface).toBe('AccessibilityReceipt@1');
        expect(capture.visual_eval.receipt.interface).toBe('VisualRegressionReceipt@1');
        expect(capture.interaction_run.receipt.interface).toBe('InteractionReceipt@1');
        expect(capture.a11y.receipt.unsupported_criteria).toEqual([...UNSUPPORTED_WCAG_CRITERIA]);
        expect(capture.a11y.receipt.manual_check_ids).toEqual([...MANUAL_CHECK_IDS]);
        expect(capture.a11y.wcag_compliance_claimed).toBe(false);
        expect(capture.visual_eval.capture_source).toBe('browser');
      }
    }
  });

  test('overflow, clipping, and focus failures are measurable', () => {
    const overflow = caseByFamily('narrow_overflow');
    const liveOverflow = primaryVariant(overflow);
    expect(liveOverflow.overflow.horizontal_overflow_count)
      .toBeGreaterThanOrEqual(overflow.fixture.expected.min_horizontal_overflow_count ?? 1);
    expect(liveOverflow.overflow.viewport_overflow_count)
      .toBeGreaterThanOrEqual(overflow.fixture.expected.min_viewport_overflow_count ?? 1);

    const clipping = caseByFamily('localized_clipping');
    const liveClip = primaryVariant(clipping);
    expect(liveClip.overflow.clipping_count)
      .toBeGreaterThanOrEqual(clipping.fixture.expected.min_clipping_count ?? 1);
    expect(liveClip.overflow.horizontal_overflow_count)
      .toBeGreaterThanOrEqual(clipping.fixture.expected.min_horizontal_overflow_count ?? 1);

    const focus = caseByFamily('focus_lifecycle');
    const liveFocus = primaryVariant(focus);
    expect(liveFocus.live_focus_sequence.slice(0, 2)).toEqual([
      'control:focus-first',
      'control:focus-second',
    ]);
    expect(liveFocus.interaction_run.focus_trace.has_focus_loss).toBe(true);
    expect(liveFocus.interaction_run.focus_trace.focus_loss_step_ids).toContain('step:focus-loss');
    expect(liveFocus.live_focus_id).toBe('');

    const keyboard = caseByFamily('keyboard_navigation');
    const liveKeyboard = primaryVariant(keyboard);
    expect(liveKeyboard.live_focus_sequence).toEqual([
      'control:nav-goals',
      'control:nav-queue',
      'control:nav-submit',
    ]);
    expect(liveKeyboard.a11y.keyboard.tab_order_matches).toBe(true);
    expect(liveKeyboard.a11y.receipt.keyboard_result).toBe('satisfied');
    expect(liveKeyboard.a11y.keyboard.expected_tab_order).toEqual([
      'control:nav-goals',
      'control:nav-queue',
      'control:nav-submit',
    ]);

    const a11y = caseByFamily('contrast_labels_ids');
    const liveA11y = primaryVariant(a11y);
    const ruleIds = new Set(
      liveA11y.a11y.findings
        .filter(item => item.disposition === 'violation')
        .map(item => item.rule_id),
    );
    for (const rule of a11y.fixture.expected.required_a11y_rule_ids ?? []) {
      expect(ruleIds.has(rule), `missing a11y rule ${rule}`).toBe(true);
    }
    expect(liveA11y.a11y.receipt.violation_count).toBeGreaterThan(0);
    expect(liveA11y.a11y.blocks_automatic_acceptance).toBe(true);
  });

  test('a11y and security regressions override visual and click gains', () => {
    const run = requireRun();
    const visualGain = caseByFamily('visual_gain_a11y_regression');
    const baseline = visualGain.variants.baseline;
    const candidate = visualGain.variants.candidate;
    expect(baseline).toBeTruthy();
    expect(candidate).toBeTruthy();
    expect(baseline.overflow.horizontal_overflow_count).toBeGreaterThan(0);
    expect(candidate.overflow.horizontal_overflow_count).toBe(0);
    const candidateRules = new Set(
      candidate.a11y.findings
        .filter(item => item.disposition === 'violation')
        .map(item => item.rule_id),
    );
    for (const rule of visualGain.fixture.expected.required_a11y_rule_ids ?? []) {
      expect(candidateRules.has(rule), `candidate missing ${rule}`).toBe(true);
    }
    expect(candidate.a11y.receipt.violation_count)
      .toBeGreaterThan(baseline.a11y.receipt.violation_count);

    const visualDecision = evaluateObjective({
      application_id: run.suite.application_id,
      screen_id: run.suite.screen_id,
      repository_revision: run.repository_revision,
      objective_id: 'horizontal_overflow_count',
      scenario_ids: [visualGain.fixture.scenario_id],
      baseline_metrics: makeUiMetricSnapshot({
        horizontal_overflow_count: baseline.overflow.horizontal_overflow_count,
        accessibility_violation_count: baseline.a11y.receipt.violation_count,
      }),
      candidate_metrics: makeUiMetricSnapshot({
        horizontal_overflow_count: candidate.overflow.horizontal_overflow_count,
        accessibility_violation_count: candidate.a11y.receipt.violation_count,
      }),
      accessibility_receipts: [{
        scenario_id: visualGain.fixture.scenario_id,
        violation_count: candidate.a11y.receipt.violation_count,
        violation_ids: [...candidate.a11y.receipt.violation_ids],
        automated_pass_count: candidate.a11y.receipt.automated_pass_count,
        keyboard_result: candidate.a11y.receipt.keyboard_result,
        ...passingAuthority(),
      }],
      visual_receipts: [{
        scenario_id: visualGain.fixture.scenario_id,
        decision: 'pass',
        pixel_diff_percent: 12,
        structural_diff_percent: 0,
        unexpected_layout_shift_count: 0,
        missing_control_count: 0,
        extra_control_count: 0,
        screenshot_width: candidate.screenshot_width,
        screenshot_height: candidate.screenshot_height,
        requires_human_review: false,
        ...passingAuthority(),
      }],
      interaction_receipts: [{
        scenario_id: visualGain.fixture.scenario_id,
        step_ids: [...candidate.interaction_run.receipt.step_ids],
        unresolved_observation_ids: [...candidate.interaction_run.receipt.unresolved_observation_ids],
        confirmation_id: candidate.interaction_run.receipt.confirmation_id,
        ...passingAuthority(),
      }],
      constraint_receipts: [{
        check_ids: ['inv:unique-id'],
        statuses: ['satisfied'],
        violated_check_ids: [],
        unsupported_check_ids: [],
        ...passingAuthority(),
      }],
      policy_reports: [{
        acceptance_outcome: 'allow_automatic',
        automatic_acceptance_blocked: false,
        reason_codes: ['allowed'],
        violations: [],
      }],
      heuristic_scores: [{
        axis: 'polish',
        value: 0.95,
        evidence_level: 'heuristic',
        notes: 'candidate looks denser and more polished',
      }],
    });
    expect(visualDecision.objective_delta.direction).toBe('improved');
    expect(visualDecision.decision.decision).toBe('reject');
    expect(visualDecision.decision.hard_gate_regression).toBe(true);
    expect(visualDecision.decision.heuristic_override_attempted).toBe(true);
    expect(visualDecision.decision.blocking_reason_codes).toEqual(
      expect.arrayContaining(['accessibility_regression', 'heuristic_cannot_override']),
    );

    const clickGain = caseByFamily('click_reduction_confirmation_bypass');
    const clickBaseline = clickGain.variants.baseline;
    const clickCandidate = clickGain.variants.candidate;
    expect(clickBaseline.click_count).toBeGreaterThanOrEqual(2);
    expect(clickCandidate.click_count).toBe(1);
    expect(clickCandidate.dispatched_without_confirmation).toBe(true);
    expect(clickCandidate.interaction_run.trace.bypass_attempt_ids.length).toBeGreaterThan(0);
    expect(clickCandidate.interaction_run.receipt.unresolved_observation_ids.some(
      id => id.includes('confirmation') || id.includes('bypass'),
    )).toBe(true);

    const clickDecision = evaluateObjective({
      application_id: run.suite.application_id,
      screen_id: run.suite.screen_id,
      repository_revision: run.repository_revision,
      objective_id: 'required_action_unreachable_count',
      scenario_ids: [clickGain.fixture.scenario_id],
      baseline_metrics: makeUiMetricSnapshot({
        required_action_unreachable_count: 1,
        confirmation_failure_count: 0,
        security_violation_count: 0,
      }),
      candidate_metrics: makeUiMetricSnapshot({
        required_action_unreachable_count: 0,
        confirmation_failure_count: 1,
        security_violation_count: 1,
      }),
      accessibility_receipts: [{
        scenario_id: clickGain.fixture.scenario_id,
        violation_count: 0,
        violation_ids: [],
        automated_pass_count: clickCandidate.a11y.receipt.automated_pass_count,
        keyboard_result: clickCandidate.a11y.receipt.keyboard_result,
        ...passingAuthority(),
      }],
      visual_receipts: [{
        scenario_id: clickGain.fixture.scenario_id,
        decision: 'pass',
        pixel_diff_percent: 0,
        structural_diff_percent: 0,
        unexpected_layout_shift_count: 0,
        missing_control_count: 0,
        extra_control_count: 0,
        screenshot_width: clickCandidate.screenshot_width,
        screenshot_height: clickCandidate.screenshot_height,
        requires_human_review: false,
        ...passingAuthority(),
      }],
      interaction_receipts: [{
        scenario_id: clickGain.fixture.scenario_id,
        step_ids: [...clickCandidate.interaction_run.receipt.step_ids],
        unresolved_observation_ids: [...clickCandidate.interaction_run.receipt.unresolved_observation_ids],
        confirmation_id: clickCandidate.interaction_run.receipt.confirmation_id,
        ...passingAuthority(),
      }],
      constraint_receipts: [{
        check_ids: ['inv:confirmation'],
        statuses: ['satisfied'],
        violated_check_ids: [],
        unsupported_check_ids: [],
        ...passingAuthority(),
      }],
      policy_reports: [{
        acceptance_outcome: 'block_automatic',
        automatic_acceptance_blocked: true,
        reason_codes: [
          'confirmation_required',
          'dispatchable_prohibited_action',
        ],
        violations: [{
          code: 'confirmation_required',
          blocks_automatic_acceptance: true,
        }],
      }],
      heuristic_scores: [{
        axis: 'primary_action_prominence',
        value: 0.9,
        evidence_level: 'heuristic',
        notes: 'one-click dispatch looks faster',
      }],
    });
    expect(clickDecision.objective_delta.direction).toBe('improved');
    expect(clickDecision.decision.decision).toBe('reject');
    expect(clickDecision.decision.hard_gate_regression).toBe(true);
    expect(clickDecision.decision.blocking_reason_codes).toEqual(
      expect.arrayContaining([
        'confirmation_regression',
        'security_regression',
        'heuristic_cannot_override',
      ]),
    );
  });

  test('pixel difference is classified through region, threshold, and evidence policy', () => {
    const visual = caseByFamily('expected_forbidden_visual_regions');
    expect(visual.fixture.expected.classify_pixel_diff_via_policy).toBe(true);
    expect(visual.comparisons).toHaveLength(visual.fixture.comparisons?.length ?? 0);
    const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const playwrightSnapshotApi = 'toHave' + 'Screenshot';
    const snapshotUpdateApi = 'update' + 'Snapshots';
    const pixelRatioApi = 'maxDiff' + 'PixelRatio';
    expect(source.includes(playwrightSnapshotApi)).toBe(false);
    expect(source.includes(snapshotUpdateApi)).toBe(false);
    expect(source.includes(pixelRatioApi)).toBe(false);

    for (const comparison of visual.fixture.comparisons ?? []) {
      const actual = visual.comparisons.find(item => item.comparison_id === comparison.comparison_id);
      expect(actual, comparison.comparison_id).toBeTruthy();
      if (!actual) continue;
      expect(actual.decision, comparison.comparison_id).toBe(comparison.expected_decision);
      for (const reason of comparison.expected_gate_reasons) {
        expect(actual.gate_reasons, comparison.comparison_id).toContain(reason);
      }
    }

    const expected = visual.comparisons.find(item => item.comparison_id === 'cmp:expected-banner');
    expect(expected?.decision).toBe('pass');
    expect(expected?.unexplained_pixel_diff_percent ?? 1).toBeLessThanOrEqual(0);
    expect(expected?.gate_reasons).toEqual([]);

    const forbidden = visual.comparisons.find(item => item.comparison_id === 'cmp:forbidden-confirm');
    expect(forbidden?.decision).toBe('fail');
    expect(forbidden?.gate_reasons).toContain('forbidden_region_change');

    const review = visual.comparisons.find(item => item.comparison_id === 'cmp:review-threshold');
    expect(review?.decision).toBe('review');
    expect(review?.gate_reasons).toContain('manual_review_threshold');

    const unexplained = visual.comparisons.find(item => item.comparison_id === 'cmp:unexplained-mid');
    expect(unexplained?.decision).toBe('fail');
    expect(unexplained?.gate_reasons).toContain('unexplained_diff_exceeds_max');
    expect(unexplained?.unexplained_pixel_diff_percent ?? 0).toBeGreaterThan(5);
  });
});
