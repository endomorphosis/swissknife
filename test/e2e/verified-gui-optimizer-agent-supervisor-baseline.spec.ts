import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
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
import {
  compileUiBaseline,
  makeUiMetricSnapshot,
  type ObjectiveMetricId,
} from '../../src/services/gui-optimizer/baseline.js';
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
import {
  AGENT_SUPERVISOR_APPLICATION_ID,
  AGENT_SUPERVISOR_SCREEN_ID,
  EXPECTED_TERMINAL_STATES,
  REQUIRED_SCENARIO_KINDS,
  STABLE_SCENARIO_IDS,
  VIEWPORT_SPEC_INTERFACE,
  VIEWPORT_SPEC_SCHEMA,
  type ScenarioKind,
} from '../../src/services/gui-optimizer/scenario-catalog.js';
import {
  extractUiStateMachineFromFacts,
  makeUiEventDefinition,
  makeUiStateDefinition,
  makeUiTransitionDefinition,
} from '../../src/services/gui-optimizer/state-machine.js';
import {
  evaluateVisualRegression,
  type VisualRegressionEvaluationResult,
} from '../../src/services/gui-optimizer/visual-regression.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(600_000);

const SPEC_DIR = dirname(fileURLToPath(import.meta.url));
const SWISSKNIFE_ROOT = resolve(SPEC_DIR, '../..');
const WORKSPACE_ROOT = resolve(SWISSKNIFE_ROOT, '..');
const CONFIG_PATH = join(
  SWISSKNIFE_ROOT,
  'build-tools/configs/playwright.verified-gui-optimizer.config.ts',
);
const FIXTURE_DIR = join(
  SWISSKNIFE_ROOT,
  'test/fixtures/gui-optimizer/agent-supervisor',
);
const EVIDENCE_DIR = join(
  WORKSPACE_ROOT,
  'implementation_plan/evidence/verified_gui_optimizer',
);
const BASELINE_EVIDENCE_PATH = join(
  EVIDENCE_DIR,
  'agent-supervisor-browser-baseline.json',
);
const ARTIFACTS_EVIDENCE_PATH = join(
  EVIDENCE_DIR,
  'agent-supervisor-browser-baseline-artifacts.json',
);

const INTERFACE = 'AgentSupervisorBrowserBaseline@1' as const;
const SCHEMA = 'agent-supervisor-browser-baseline/v1' as const;
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
const EXTRACTOR_ID = 'extractor:vgo-068-playwright';
const EXTRACTOR_VERSION = '1.0.0';
const COMPONENT_ID = 'comp:AgentSupervisorConsole';
const REPOSITORY_ID =
  'repository:sha256:4e580c9c70ff41fdb7d1ace5f049df8d73c5dd7ea0d7fdfa5977b35b13476ee3';
const NAMED_SPECS = Object.freeze([
  'test/e2e/agent-supervisor-console.spec.ts',
  'test/e2e/agent-supervisor-goal-task-lifecycle.spec.ts',
  'test/e2e/verified-gui-optimizer-agent-supervisor-baseline.spec.ts',
]);
const PYTHON_INTERPRETER = '/usr/bin/python3.12';
const CLOSED_MANIFEST_KEYS = Object.freeze([
  'artifact_cids',
  'entries',
  'interface',
  'run_id',
  'schema_version',
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
const VIEWPORTS = Object.freeze({
  mobile: Object.freeze({ width: 390, height: 844, device_scale_factor: 1 }),
  desktop: Object.freeze({ width: 1280, height: 800, device_scale_factor: 1 }),
  wide: Object.freeze({ width: 1600, height: 1000, device_scale_factor: 1 }),
});
const EXPECTED_TAB_ORDER = Object.freeze([
  'control:goals-tree',
  'control:queue',
  'control:prompt-input',
  'control:submit',
]);

type ArtifactKind = 'screenshot' | 'accessibility' | 'trace' | 'baseline' | 'receipt' | 'manifest';

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

interface ScenarioCapture {
  readonly kind: ScenarioKind;
  readonly scenario_id: string;
  readonly terminal_state: string;
  readonly viewport: { width: number; height: number; device_scale_factor: number };
  readonly color_scheme: string;
  readonly text_scale_percent: number;
  readonly screenshot: StoredArtifact;
  readonly screenshot_width: number;
  readonly screenshot_height: number;
  readonly screenshot_digest: string;
  readonly accessibility: StoredArtifact;
  readonly accessibility_receipt_id: string;
  readonly accessibility_identity: string;
  readonly automated_pass_count: number;
  readonly violation_ids: readonly string[];
  readonly manual_check_ids: readonly string[];
  readonly unsupported_criteria: readonly string[];
  readonly keyboard_result: string;
  readonly visual: StoredArtifact;
  readonly visual_decision: string;
  readonly visual_receipt_id: string;
  readonly pixel_diff_percent: number;
  readonly structural_diff_percent: number;
  readonly interaction: StoredArtifact;
  readonly interaction_receipt_id: string;
  readonly interaction_identity: string;
  readonly focus_sequence: readonly string[];
  readonly overflow: {
    readonly horizontal_overflow_count: number;
    readonly viewport_overflow_count: number;
    readonly clipping_count: number;
  };
  readonly problems: readonly BaselineProblem[];
}

interface BaselineProblem {
  readonly code: string;
  readonly scenario_id: string;
  readonly evidence_level: 'automated' | 'structural' | 'heuristic';
  readonly live_confirmed: boolean;
  readonly hidden: false;
  readonly message: string;
}

interface CaptureBundle {
  readonly browser: string;
  readonly browser_version: string;
  readonly repository_revision: string;
  readonly cas_root: string;
  readonly captures: readonly ScenarioCapture[];
  readonly first_baseline_identity: string;
  readonly second_baseline_identity: string;
  readonly first_interaction_identity: string;
  readonly second_interaction_identity: string;
  readonly first_accessibility_identity: string;
  readonly second_accessibility_identity: string;
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
  readonly baseline_receipt: Record<string, unknown>;
}

let bundle: CaptureBundle | undefined;
const CAS_ROOT = resolveEvidenceCasRoot();

function resolveEvidenceCasRoot(): string {
  const fromEnv =
    process.env.VGO_EVIDENCE_CAS_ROOT
    || process.env.GUI_OPTIMIZER_ARTIFACT_ROOT;
  const raw = fromEnv && fromEnv.trim().length > 0
    ? fromEnv.trim()
    : join(SWISSKNIFE_ROOT, 'test-results/verified-gui-optimizer/vgo-054-cas');
  // GuiEvidenceArtifactStore@1 rejects relative and broad roots. Never persist
  // CAS bytes under the committed worktree data/ tree; only the durable
  // manifest and baseline receipt are declared outputs. test-results/ is
  // gitignored. Validation HOME is a fresh ipfs-accelerate-validation-home-*
  // directory, so this path is never an operator profile cache.
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

function prettyCanonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function atomicWrite(path: string, body: Uint8Array | string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.part`;
  writeFileSync(tmp, body);
  renameSync(tmp, path);
}

function makeGate(
  scenarioId: string,
  checkerId: string,
  checkerVersion: string,
  revision: string,
): ReuseGate {
  return {
    repository_id: REPOSITORY_ID,
    repository_revision: revision,
    component_id: COMPONENT_ID,
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
  const request: Record<string, unknown> = {
    op: 'put',
    kind,
    binding: closedBinding(binding),
    bytes_b64: body.toString('base64'),
  };
  const response = invokeEvidenceStore(request);
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

function putManifest(runId: string, artifacts: readonly StoredArtifact[], revision: string) {
  const identityPayload = closedManifestPayload(runId, artifacts);
  const identity = canonicalIdentity(identityPayload, {
    domain: DOMAIN_MANIFEST,
    schemaVersion: MANIFEST_SCHEMA,
  });
  const stored = putArtifact(
    identityPayload,
    'manifest',
    makeGate('scenario:vgo-068-manifest', 'checker:evidence-manifest@1', '1.0.0', revision),
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

function scenarioViewport(kind: ScenarioKind) {
  if (kind === 'viewport_mobile') return VIEWPORTS.mobile;
  if (kind === 'viewport_wide') return VIEWPORTS.wide;
  return VIEWPORTS.desktop;
}

function fixtureHostHtml(): string {
  const html = readFileSync(join(FIXTURE_DIR, 'fixture-host.html'), 'utf8');
  const services = readFileSync(join(FIXTURE_DIR, 'fixture-services.js'), 'utf8');
  return html.replace(
    '<script src="fixture-services.js"></script>',
    `<script>${services}</script>`,
  );
}

async function openFixtureHost(page: Page, scenarioId: string): Promise<void> {
  await page.setContent(fixtureHostHtml(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean((window as unknown as {
    __agentSupervisorFixtureHost?: { applyScenario(id: string): unknown };
  }).__agentSupervisorFixtureHost));
  await page.evaluate(id => {
    const host = (window as unknown as {
      __agentSupervisorFixtureHost: { applyScenario(next: string): unknown };
    }).__agentSupervisorFixtureHost;
    host.applyScenario(id);
  }, scenarioId);
  await page.waitForSelector('[data-testid="agent-supervisor-app"]');
}

async function captureLiveDom(page: Page): Promise<LiveDomSnapshot> {
  return page.evaluate(() => {
    const walk = (node: Element): Record<string, unknown> => {
      const style = window.getComputedStyle(node);
      const attrs: Record<string, string> = {};
      for (const attr of Array.from(node.attributes)) {
        attrs[attr.name] = attr.value;
      }
      const role = node.getAttribute('role')
        || (node.tagName === 'DIALOG' ? 'dialog' : undefined);
      const name = node.getAttribute('aria-label')
        || (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
          ? node.labels?.[0]?.textContent?.trim()
          : undefined)
        || (node instanceof HTMLElement ? node.innerText.trim().slice(0, 80) : undefined);
      return {
        tag: node.tagName.toLowerCase(),
        node_id: node.getAttribute('data-control')
          || node.getAttribute('data-testid')
          || node.id
          || undefined,
        id: node.id || undefined,
        role,
        name: name || undefined,
        type: node.getAttribute('type') || undefined,
        attributes: attrs,
        text: node instanceof HTMLElement ? node.innerText.trim().slice(0, 160) : '',
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
    const context = canvas.getContext('2d');
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

async function measureOverflow(page: Page): Promise<ScenarioCapture['overflow']> {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let horizontal = 0;
    let viewport = 0;
    let clipping = 0;
    for (const node of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
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

function buildStateMachine() {
  const screen = AGENT_SUPERVISOR_SCREEN_ID;
  return extractUiStateMachineFromFacts({
    application_id: AGENT_SUPERVISOR_APPLICATION_ID,
    screen_id: screen,
    machine_id: 'sm:agent-supervisor:vgo-068',
    states: [
      makeUiStateDefinition({ state_id: 'state:ready', kind: 'ready', screen_id: screen, label: 'Ready', is_initial: true }),
      makeUiStateDefinition({ state_id: 'state:loading', kind: 'loading', screen_id: screen, label: 'Loading' }),
      makeUiStateDefinition({ state_id: 'state:success', kind: 'success', screen_id: screen, label: 'Success', is_terminal: true }),
      makeUiStateDefinition({ state_id: 'state:empty', kind: 'empty', screen_id: screen, label: 'Empty' }),
      makeUiStateDefinition({ state_id: 'state:recovery', kind: 'recovery', screen_id: screen, label: 'Recovery' }),
      makeUiStateDefinition({ state_id: 'state:failure', kind: 'failure', screen_id: screen, label: 'Failure', is_terminal: true }),
      makeUiStateDefinition({ state_id: 'state:unavailable', kind: 'unavailable', screen_id: screen, label: 'Unavailable', is_terminal: true }),
      makeUiStateDefinition({ state_id: 'state:confirmation', kind: 'confirmation', screen_id: screen, label: 'Confirm' }),
    ],
    events: [
      makeUiEventDefinition({ event_id: 'event:focus', kind: 'focus', name: 'focus' }),
      makeUiEventDefinition({ event_id: 'event:tab', kind: 'keyboard_activation', name: 'tab' }),
      makeUiEventDefinition({ event_id: 'event:submit', kind: 'submit', name: 'submit' }),
      makeUiEventDefinition({ event_id: 'event:confirmation-grant', kind: 'confirmation_grant', name: 'grant' }),
      makeUiEventDefinition({ event_id: 'event:confirmation-denial', kind: 'confirmation_denial', name: 'deny' }),
      makeUiEventDefinition({ event_id: 'event:service-unavailable', kind: 'service_unavailable', name: 'unavailable' }),
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
        transition_id: 't:loading-focus',
        from_state_id: 'state:loading',
        to_state_id: 'state:loading',
        event_id: 'event:focus',
        is_noop: true,
      }),
      makeUiTransitionDefinition({
        transition_id: 't:success-focus',
        from_state_id: 'state:success',
        to_state_id: 'state:success',
        event_id: 'event:focus',
        is_noop: true,
      }),
      makeUiTransitionDefinition({
        transition_id: 't:empty-focus',
        from_state_id: 'state:empty',
        to_state_id: 'state:empty',
        event_id: 'event:focus',
        is_noop: true,
      }),
      makeUiTransitionDefinition({
        transition_id: 't:recovery-focus',
        from_state_id: 'state:recovery',
        to_state_id: 'state:recovery',
        event_id: 'event:focus',
        is_noop: true,
      }),
      makeUiTransitionDefinition({
        transition_id: 't:failure-focus',
        from_state_id: 'state:failure',
        to_state_id: 'state:failure',
        event_id: 'event:focus',
        is_noop: true,
      }),
      makeUiTransitionDefinition({
        transition_id: 't:unavailable-focus',
        from_state_id: 'state:unavailable',
        to_state_id: 'state:unavailable',
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
      makeUiTransitionDefinition({
        transition_id: 't:confirm-deny',
        from_state_id: 'state:confirmation',
        to_state_id: 'state:ready',
        event_id: 'event:confirmation-denial',
      }),
      makeUiTransitionDefinition({
        transition_id: 't:ready-unavailable',
        from_state_id: 'state:ready',
        to_state_id: 'state:unavailable',
        event_id: 'event:service-unavailable',
      }),
    ],
  });
}

function visibleControls() {
  return [
    makeUiVisibleControl({ control_id: 'control:goals-tree', role: 'tree', action_id: 'action:select-goal' }),
    makeUiVisibleControl({ control_id: 'control:queue', role: 'listbox', action_id: 'action:select-task' }),
    makeUiVisibleControl({ control_id: 'control:prompt-input', role: 'textbox', action_id: 'action:submit-steering' }),
    makeUiVisibleControl({ control_id: 'control:submit', role: 'button', action_id: 'action:submit-steering' }),
    makeUiVisibleControl({ control_id: 'control:confirm-grant', role: 'button', action_id: 'action:confirm-grant' }),
    makeUiVisibleControl({ control_id: 'control:confirm-deny', role: 'button', action_id: 'action:confirm-deny' }),
  ];
}

function interactionSteps(kind: ScenarioKind) {
  if (kind === 'keyboard_only') {
    return [
      makeUiInteractionStepInput({
        step_id: 'step:keyboard-focus',
        kind: 'focus',
        target_control_id: 'control:goals-tree',
        event_id: 'event:focus',
        expected_focus_id: 'control:goals-tree',
        keyboard: true,
      }),
      makeUiInteractionStepInput({
        step_id: 'step:keyboard-tab',
        kind: 'tab',
        target_control_id: 'control:queue',
        event_id: 'event:tab',
        expected_focus_id: 'control:queue',
        keyboard: true,
      }),
    ];
  }
  if (kind === 'confirmation_grant') {
    return [
      makeUiInteractionStepInput({
        step_id: 'step:open-confirm',
        kind: 'submit',
        target_control_id: 'control:submit',
        event_id: 'event:submit',
        confirmation_id: 'confirm:prompt-steering',
      }),
      makeUiInteractionStepInput({
        step_id: 'step:grant',
        kind: 'confirmation_grant',
        target_control_id: 'control:confirm-grant',
        event_id: 'event:confirmation-grant',
        confirmation_id: 'confirm:prompt-steering',
      }),
    ];
  }
  if (kind === 'confirmation_deny') {
    return [
      makeUiInteractionStepInput({
        step_id: 'step:open-confirm',
        kind: 'submit',
        target_control_id: 'control:submit',
        event_id: 'event:submit',
        confirmation_id: 'confirm:prompt-steering',
      }),
      makeUiInteractionStepInput({
        step_id: 'step:deny',
        kind: 'confirmation_denial',
        target_control_id: 'control:confirm-deny',
        event_id: 'event:confirmation-denial',
        confirmation_id: 'confirm:prompt-steering',
      }),
    ];
  }
  if (kind === 'service_unavailable') {
    return [
      makeUiInteractionStepInput({
        step_id: 'step:observe-unavailable',
        kind: 'focus',
        target_control_id: 'control:goals-tree',
        event_id: 'event:focus',
        expected_focus_id: 'control:goals-tree',
        service_outcome: 'service_unavailable',
      }),
    ];
  }
  return [
    makeUiInteractionStepInput({
      step_id: 'step:observe',
      kind: 'focus',
      target_control_id: 'control:goals-tree',
      event_id: 'event:focus',
      expected_focus_id: 'control:goals-tree',
    }),
  ];
}

function initialStateFor(kind: ScenarioKind): string {
  if (kind === 'loading') return 'state:loading';
  if (kind === 'success' || kind === 'valid_submission' || kind === 'confirmation_grant') return 'state:success';
  if (kind === 'empty') return 'state:empty';
  if (kind === 'recoverable_failure') return 'state:recovery';
  if (kind === 'unrecoverable_failure') return 'state:failure';
  if (kind === 'service_unavailable') return 'state:unavailable';
  return 'state:ready';
}

async function driveScenario(page: Page, kind: ScenarioKind): Promise<void> {
  if (kind === 'keyboard_only') {
    const first = page.locator('[data-supervisor-focusable]').first();
    await first.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    return;
  }
  if (kind === 'confirmation_grant') {
    const grant = page.locator('[data-testid="confirmation-grant"]');
    await expect(grant).toHaveCount(1);
    await grant.click();
    return;
  }
  if (kind === 'confirmation_deny') {
    const deny = page.locator('[data-testid="confirmation-deny"]');
    await expect(deny).toHaveCount(1);
    await deny.click();
    return;
  }
  if (kind === 'invalid_submission') {
    await page.locator('[data-testid="steering-submit"]').click();
  }
}

function collectProblems(
  kind: ScenarioKind,
  scenarioId: string,
  terminalState: string,
  a11y: AccessibilityEvaluationResult,
  overflow: ScenarioCapture['overflow'],
  appState: { errorAssociation: boolean; confirmationAuthoritative: boolean; production: boolean },
): BaselineProblem[] {
  const problems: BaselineProblem[] = [];
  const expected = EXPECTED_TERMINAL_STATES[kind];
  if (!expected.includes(terminalState as typeof expected[number])) {
    problems.push({
      code: 'terminal-state-mismatch',
      scenario_id: scenarioId,
      evidence_level: 'automated',
      live_confirmed: true,
      hidden: false,
      message: `Live terminal state ${terminalState} is outside ${expected.join(',')}.`,
    });
  }
  for (const finding of a11y.findings.filter(item => item.disposition === 'violation')) {
    problems.push({
      code: finding.rule_id,
      scenario_id: scenarioId,
      evidence_level: 'automated',
      live_confirmed: true,
      hidden: false,
      message: finding.message,
    });
  }
  if (overflow.horizontal_overflow_count > 0) {
    problems.push({
      code: 'horizontal-overflow',
      scenario_id: scenarioId,
      evidence_level: 'automated',
      live_confirmed: true,
      hidden: false,
      message: `${overflow.horizontal_overflow_count} horizontal overflow regions`,
    });
  }
  if (overflow.viewport_overflow_count > 0) {
    problems.push({
      code: 'viewport-overflow',
      scenario_id: scenarioId,
      evidence_level: 'automated',
      live_confirmed: true,
      hidden: false,
      message: `${overflow.viewport_overflow_count} viewport overflow regions`,
    });
  }
  if (overflow.clipping_count > 0) {
    problems.push({
      code: 'clipping',
      scenario_id: scenarioId,
      evidence_level: 'automated',
      live_confirmed: true,
      hidden: false,
      message: `${overflow.clipping_count} clipped regions`,
    });
  }
  if (kind === 'invalid_submission' && !appState.errorAssociation) {
    problems.push({
      code: 'missing-field-error-association',
      scenario_id: scenarioId,
      evidence_level: 'automated',
      live_confirmed: true,
      hidden: false,
      message: 'Steering validation feedback is rendered without aria-invalid/aria-describedby/aria-errormessage.',
    });
  }
  if ((kind === 'confirmation_grant' || kind === 'confirmation_deny') && !appState.confirmationAuthoritative) {
    problems.push({
      code: 'static-confirmation-is-not-argument-digest-bound',
      scenario_id: scenarioId,
      evidence_level: 'structural',
      live_confirmed: true,
      hidden: false,
      message: 'Fixture confirmation is not an authoritative allow and is not bound to a current argument digest.',
    });
  }
  if (appState.production) {
    problems.push({
      code: 'production-service-used',
      scenario_id: scenarioId,
      evidence_level: 'automated',
      live_confirmed: true,
      hidden: false,
      message: 'Production services or credentials were observed.',
    });
  }
  return problems;
}

function compileMetrics(captures: readonly ScenarioCapture[]) {
  const values: Partial<Record<ObjectiveMetricId, number>> = {
    accessibility_violation_count: captures.reduce((sum, item) => sum + item.violation_ids.length, 0),
    accessibility_critical_count: captures.reduce(
      (sum, item) => sum + item.problems.filter(problem => problem.code.includes('duplicate') || problem.code.includes('unlabeled')).length,
      0,
    ),
    unlabeled_control_count: captures.reduce(
      (sum, item) => sum + item.problems.filter(problem => problem.code.includes('name') || problem.code.includes('unlabeled')).length,
      0,
    ),
    horizontal_overflow_count: captures.reduce((sum, item) => sum + item.overflow.horizontal_overflow_count, 0),
    clipping_count: captures.reduce((sum, item) => sum + item.overflow.clipping_count, 0),
    viewport_overflow_count: captures.reduce((sum, item) => sum + item.overflow.viewport_overflow_count, 0),
    interaction_step_count: captures.reduce((sum, item) => sum + item.focus_sequence.length, 0),
    keyboard_step_count: captures.filter(item => item.kind === 'keyboard_only').reduce((sum, item) => sum + item.focus_sequence.length, 0),
    confirmation_failure_count: captures.filter(item => item.kind === 'confirmation_deny').length,
    unsupported_check_count: UNSUPPORTED_WCAG_CRITERIA.length,
    automated_pass_count: captures.reduce((sum, item) => sum + item.automated_pass_count, 0),
    screenshot_width: captures.find(item => item.kind === 'viewport_desktop')?.screenshot_width ?? 0,
    screenshot_height: captures.find(item => item.kind === 'viewport_desktop')?.screenshot_height ?? 0,
    pixel_diff_percent: 0,
    structural_diff_percent: 0,
    unresolved_observation_count: captures.reduce((sum, item) => sum + item.problems.length, 0),
  };
  return makeUiMetricSnapshot(values);
}

async function captureScenario(
  page: Page,
  kind: ScenarioKind,
  revision: string,
  browser: string,
  browserVersion: string,
): Promise<ScenarioCapture> {
  const scenarioId = STABLE_SCENARIO_IDS[kind];
  const viewport = scenarioViewport(kind);
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.emulateMedia({
    colorScheme: kind === 'dark_mode' ? 'dark' : 'light',
    reducedMotion: kind === 'reduced_motion' ? 'reduce' : 'no-preference',
  });
  await openFixtureHost(page, scenarioId);
  await driveScenario(page, kind);

  const app = page.locator('[data-testid="agent-supervisor-app"]');
  await expect(app).toHaveCount(1);
  const terminalState = `state:${await app.getAttribute('data-state')}`;

  const png = await app.screenshot({ type: 'png', animations: 'disabled' });
  const pngBuffer = Buffer.from(png);
  const dimensions = pngDimensions(pngBuffer);
  const rgba = await captureRgba(page, pngBuffer);
  const visual: VisualRegressionEvaluationResult = evaluateVisualRegression({
    application_id: AGENT_SUPERVISOR_APPLICATION_ID,
    screen_id: AGENT_SUPERVISOR_SCREEN_ID,
    scenario_id: scenarioId,
    repository_revision: revision,
    capture: {
      source: 'browser',
      width: rgba.width,
      height: rgba.height,
      data: rgba.data,
      browser,
      browser_version: browserVersion,
    },
    viewport: {
      interface: VIEWPORT_SPEC_INTERFACE,
      schema_version: VIEWPORT_SPEC_SCHEMA,
      width: viewport.width,
      height: viewport.height,
      device_scale_factor: viewport.device_scale_factor,
    },
    color_scheme: kind === 'dark_mode' ? 'dark' : 'light',
    locale: 'en-US',
    text_scale_percent: kind === 'text_scale_200' ? 200 : 100,
    browser,
    browser_version: browserVersion,
  });

  const snapshot = await captureLiveDom(page);
  const a11y = evaluateLiveDomAccessibility({
    application_id: AGENT_SUPERVISOR_APPLICATION_ID,
    screen_id: AGENT_SUPERVISOR_SCREEN_ID,
    scenario_id: scenarioId,
    repository_revision: revision,
    snapshot,
    expected_tab_order: [...EXPECTED_TAB_ORDER],
    screen_reader_reviewed: false,
    evidence_level: 'automated',
  });

  const overflow = await measureOverflow(page);
  const errorAssociation = await page.evaluate(() => {
    const error = document.querySelector('[data-testid="steering-error"]');
    const field = document.querySelector('[data-testid="steering-prompt"]');
    if (!field) return false;
    if (!error) return true;
    return Boolean(
      field.getAttribute('aria-invalid')
      || field.getAttribute('aria-describedby')
      || field.getAttribute('aria-errormessage'),
    );
  });
  const confirmationAuthoritative = await page.evaluate(() => {
    const authority = document.querySelector('[data-testid="confirmation-authority"]');
    if (!authority) return false;
    return /authoritative=true/.test(authority.textContent || '');
  });
  const production = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="fixture-host"]');
    const appNode = document.querySelector('[data-testid="agent-supervisor-app"]');
    return host?.getAttribute('data-can-issue-authoritative-allow') === 'true'
      || appNode?.getAttribute('data-transport') !== 'fixture';
  });

  const interaction: UiInteractionRunResult = runInteractionScenario({
    application_id: AGENT_SUPERVISOR_APPLICATION_ID,
    screen_id: AGENT_SUPERVISOR_SCREEN_ID,
    scenario_id: scenarioId,
    repository_revision: revision,
    state_machine: buildStateMachine(),
    visible_controls: visibleControls(),
    expected_terminal_states: [...EXPECTED_TERMINAL_STATES[kind]],
    initial_state_id: kind === 'confirmation_grant' || kind === 'confirmation_deny'
      ? 'state:ready'
      : initialStateFor(kind),
    steps: interactionSteps(kind),
    evidence_level: 'automated',
  });

  const screenshot = putArtifact(
    pngBuffer,
    'screenshot',
    makeGate(scenarioId, 'checker:visual-regression@1', '1.0.0', revision),
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
    makeGate(scenarioId, 'checker:accessibility@1', '1.0.0', revision),
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
    makeGate(scenarioId, 'checker:visual-regression@1', '1.0.0', revision),
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
    makeGate(scenarioId, 'checker:interaction@1', '1.0.0', revision),
  );

  const problems = collectProblems(kind, scenarioId, terminalState, a11y, overflow, {
    errorAssociation,
    confirmationAuthoritative,
    production,
  });

  return {
    kind,
    scenario_id: scenarioId,
    terminal_state: terminalState,
    viewport,
    color_scheme: kind === 'dark_mode' ? 'dark' : 'light',
    text_scale_percent: kind === 'text_scale_200' ? 200 : 100,
    screenshot,
    screenshot_width: dimensions.width,
    screenshot_height: dimensions.height,
    screenshot_digest: visual.receipt.screenshot_digest,
    accessibility,
    accessibility_receipt_id: a11y.receipt.receipt_id,
    accessibility_identity: a11y.receipt_identity,
    automated_pass_count: a11y.receipt.automated_pass_count,
    violation_ids: a11y.receipt.violation_ids,
    manual_check_ids: a11y.receipt.manual_check_ids,
    unsupported_criteria: a11y.receipt.unsupported_criteria,
    keyboard_result: a11y.receipt.keyboard_result,
    visual: visualStored,
    visual_decision: visual.receipt.decision,
    visual_receipt_id: visual.receipt.receipt_id,
    pixel_diff_percent: visual.receipt.pixel_diff_percent,
    structural_diff_percent: visual.receipt.structural_diff_percent,
    interaction: interactionStored,
    interaction_receipt_id: interaction.receipt.receipt_id,
    interaction_identity: interaction.receipt_identity,
    focus_sequence: interaction.receipt.focus_sequence,
    overflow,
    problems,
  };
}

function writeEvidence(next: CaptureBundle): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  atomicWrite(BASELINE_EVIDENCE_PATH, prettyCanonicalJson(next.baseline_receipt));
  atomicWrite(ARTIFACTS_EVIDENCE_PATH, prettyCanonicalJson(next.manifest.identity_payload));
}

function buildBaselineReceipt(
  captures: readonly ScenarioCapture[],
  firstIdentity: string,
  secondIdentity: string,
  firstInteraction: string,
  secondInteraction: string,
  firstA11y: string,
  secondA11y: string,
  manifest: CaptureBundle['manifest'],
  browser: string,
  browserVersion: string,
  revision: string,
): Record<string, unknown> {
  const metrics = compileMetrics(captures);
  const compiled = compileUiBaseline({
    application_id: AGENT_SUPERVISOR_APPLICATION_ID,
    screen_id: AGENT_SUPERVISOR_SCREEN_ID,
    repository_revision: revision,
    scenario_ids: captures.map(item => item.scenario_id),
    metrics,
    artifact_digests: [...new Set(captures.flatMap(item => [
      item.screenshot.digest,
      item.accessibility.digest,
      item.interaction.digest,
    ]))],
    extractor_version: EXTRACTOR_VERSION,
  });
  const problems = captures.flatMap(item => item.problems);
  problems.push({
    code: 'existing-accessibility-coverage-is-not-live-dom-audit',
    scenario_id: STABLE_SCENARIO_IDS.initial_load,
    evidence_level: 'structural',
    live_confirmed: true,
    hidden: false,
    message: 'Automated success is not WCAG certification; screen-reader review was not performed.',
  });
  problems.push({
    code: 'visual-baseline-missing-comparison-target',
    scenario_id: STABLE_SCENARIO_IDS.initial_load,
    evidence_level: 'structural',
    live_confirmed: true,
    hidden: false,
    message: 'This capture establishes the visual baseline. Pixel difference is an observation, not an automatic regression.',
  });
  return {
    analysis_classification: 'conservative',
    application_id: AGENT_SUPERVISOR_APPLICATION_ID,
    artifact_manifest_cid: manifest.cid,
    artifact_manifest_digest: manifest.digest,
    baseline_identity: compiled.baseline_identity.digest,
    browser,
    browser_version: browserVersion,
    can_issue_authoritative_allow: false,
    canonical_json_profile: 'gui-optimizer-canonical-json/v1',
    channel: 'chromium',
    claim_boundary: {
      pixel_change_is_neutral_observation: true,
      screen_reader_reviewed: false,
      ui_visibility_authorizes: false,
      verified_authorization: false,
      verified_complete_security: false,
      verified_live_accessibility: true,
      verified_live_interaction: true,
      verified_live_visual: true,
      verified_wcag: false,
    },
    deterministic_rerun: {
      accessibility_identities_match: firstA11y === secondA11y,
      baseline_identities_match: firstIdentity === secondIdentity,
      first_accessibility_identity: firstA11y,
      first_baseline_identity: firstIdentity,
      first_interaction_identity: firstInteraction,
      interaction_identities_match: firstInteraction === secondInteraction,
      second_accessibility_identity: secondA11y,
      second_baseline_identity: secondIdentity,
      second_interaction_identity: secondInteraction,
    },
    extractor_interface: INTERFACE,
    extractor_schema_version: SCHEMA,
    extractor_version: EXTRACTOR_VERSION,
    fixture_host_interface: 'AgentSupervisorFixtureHost@1',
    fixture_services_interface: 'AgentSupervisorFixtureServices@1',
    headless_shell_used: false,
    interaction_receipts: captures.map(item => ({
      focus_sequence: item.focus_sequence,
      receipt_id: item.interaction_receipt_id,
      receipt_identity: item.interaction_identity,
      scenario_id: item.scenario_id,
      trace_cid: item.interaction.cid,
    })),
    interface: INTERFACE,
    manual_check_ids: [...MANUAL_CHECK_IDS],
    metric_snapshot: compiled.metrics,
    problems: problems.map(item => ({ ...item, hidden: false })),
    repository_id: REPOSITORY_ID,
    repository_revision: revision,
    schema_version: SCHEMA,
    screen_id: AGENT_SUPERVISOR_SCREEN_ID,
    screenshot_observations: captures.map(item => ({
      cid: item.screenshot.cid,
      digest: item.screenshot.digest,
      height: item.screenshot_height,
      scenario_id: item.scenario_id,
      width: item.screenshot_width,
    })),
    task_id: 'VGO-068',
    ui_baseline: compiled.baseline,
    unsupported_criteria: [...UNSUPPORTED_WCAG_CRITERIA],
    uses_production_credentials: false,
    uses_production_services: false,
    verification_status: 'structurally_valid',
    visual_receipts: captures.map(item => ({
      decision: item.visual_decision,
      pixel_diff_percent: item.pixel_diff_percent,
      receipt_id: item.visual_receipt_id,
      scenario_id: item.scenario_id,
      screenshot_digest: item.screenshot_digest,
      structural_diff_percent: item.structural_diff_percent,
    })),
    accessibility_receipts: captures.map(item => ({
      automated_pass_count: item.automated_pass_count,
      cid: item.accessibility.cid,
      keyboard_result: item.keyboard_result,
      manual_check_ids: item.manual_check_ids,
      receipt_id: item.accessibility_receipt_id,
      receipt_identity: item.accessibility_identity,
      scenario_id: item.scenario_id,
      unsupported_criteria: item.unsupported_criteria,
      violation_ids: item.violation_ids,
    })),
  };
}

test.describe('VGO-068 Agent Supervisor browser baseline', () => {
  test('dedicated config discovers every named spec and pins installed full Chromium', async () => {
    const source = readFileSync(CONFIG_PATH, 'utf8');
    expect(source).toContain("channel: 'chromium'");
    expect(source).toContain("browserName: 'chromium'");
    expect(source).toContain('reuseExistingServer: false');
    expect(source).toContain("PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL = '0'");
    expect(source).toContain('PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD');
    expect(source).toContain('stablePortForPath');
    expect(source).toContain('resolveSealedChromiumExecutable');
    expect(source).toContain('/usr/bin/chromium');
    expect(source).not.toContain('chromium-headless-shell');
    expect(source).not.toContain('reuseExistingServer: true');
    expect(source).not.toContain("channel: 'chrome'");
    expect(source).toContain('VERIFIED_GUI_OPTIMIZER_NAMED_SPECS');
    expect(source).toContain('VERIFIED_GUI_OPTIMIZER_TEST_MATCH');
    expect(source).toContain('**/agent-supervisor-console.spec.ts');
    expect(source).toContain('**/agent-supervisor-goal-task-lifecycle.spec.ts');
    expect(source).toContain('**/verified-gui-optimizer-agent-supervisor-baseline.spec.ts');
    expect(source).toContain('**/verified-gui-optimizer-*.spec.ts');
    expect([...NAMED_SPECS]).toEqual([
      'test/e2e/agent-supervisor-console.spec.ts',
      'test/e2e/agent-supervisor-goal-task-lifecycle.spec.ts',
      'test/e2e/verified-gui-optimizer-agent-supervisor-baseline.spec.ts',
    ]);
    for (const relative of NAMED_SPECS) {
      const fileName = relative.split('/').pop() as string;
      expect(source, relative).toContain(fileName);
      expect(existsSync(join(SWISSKNIFE_ROOT, relative)), relative).toBe(true);
    }
    expect(process.env.PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL).toBe('0');
    expect(existsSync(PYTHON_INTERPRETER)).toBe(true);
  });

  test('captures live fixture scenarios, stores CAS artifacts, and reports baseline problems', async ({ page, browserName, browser }) => {
    expect(browserName).toBe('chromium');
    expect(process.env.PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL).toBe('0');
    const version = browser.version();
    expect(version.length).toBeGreaterThan(0);

    const revision = repositoryRevision();
    mkdirSync(CAS_ROOT, { recursive: true });
    expect(CAS_ROOT.includes(`${join(WORKSPACE_ROOT, 'data', 'agent_supervisor')}`)).toBe(false);

    const captures: ScenarioCapture[] = [];
    for (const [index, kind] of REQUIRED_SCENARIO_KINDS.entries()) {
      console.log(
        `[vgo-068] heartbeat capture ${kind} ${index + 1}/${REQUIRED_SCENARIO_KINDS.length}`,
      );
      captures.push(await captureScenario(page, kind, revision, 'chromium', version));
    }

    await page.setViewportSize({
      width: VIEWPORTS.desktop.width,
      height: VIEWPORTS.desktop.height,
    });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
    const rerunA11y = await (async () => {
      await openFixtureHost(page, STABLE_SCENARIO_IDS.initial_load);
      const snapshot = await captureLiveDom(page);
      return evaluateLiveDomAccessibility({
        application_id: AGENT_SUPERVISOR_APPLICATION_ID,
        screen_id: AGENT_SUPERVISOR_SCREEN_ID,
        scenario_id: STABLE_SCENARIO_IDS.initial_load,
        repository_revision: revision,
        snapshot,
        expected_tab_order: [...EXPECTED_TAB_ORDER],
        screen_reader_reviewed: false,
        evidence_level: 'automated',
      });
    })();
    const rerunInteraction = runInteractionScenario({
      application_id: AGENT_SUPERVISOR_APPLICATION_ID,
      screen_id: AGENT_SUPERVISOR_SCREEN_ID,
      scenario_id: STABLE_SCENARIO_IDS.initial_load,
      repository_revision: revision,
      state_machine: buildStateMachine(),
      visible_controls: visibleControls(),
      expected_terminal_states: [...EXPECTED_TERMINAL_STATES.initial_load],
      initial_state_id: 'state:ready',
      steps: interactionSteps('initial_load'),
      evidence_level: 'automated',
    });

    const metrics = compileMetrics(captures);
    const firstBaseline = compileUiBaseline({
      application_id: AGENT_SUPERVISOR_APPLICATION_ID,
      screen_id: AGENT_SUPERVISOR_SCREEN_ID,
      repository_revision: revision,
      scenario_ids: captures.map(item => item.scenario_id),
      metrics,
      artifact_digests: [...new Set(captures.flatMap(item => [
        item.screenshot.digest,
        item.accessibility.digest,
        item.interaction.digest,
      ]))],
      extractor_version: EXTRACTOR_VERSION,
    });
    const secondBaseline = compileUiBaseline({
      application_id: AGENT_SUPERVISOR_APPLICATION_ID,
      screen_id: AGENT_SUPERVISOR_SCREEN_ID,
      repository_revision: revision,
      scenario_ids: captures.map(item => item.scenario_id),
      metrics,
      artifact_digests: [...new Set(captures.flatMap(item => [
        item.screenshot.digest,
        item.accessibility.digest,
        item.interaction.digest,
      ]))],
      extractor_version: EXTRACTOR_VERSION,
    });

    const stored = captures.flatMap(item => [
      item.screenshot,
      item.accessibility,
      item.visual,
      item.interaction,
    ]);
    const manifest = putManifest('vgo-068-agent-supervisor-browser-baseline', stored, revision);
    const initial = captures.find(item => item.kind === 'initial_load');
    if (!initial) throw new Error('initial_load capture missing');

    const receipt = buildBaselineReceipt(
      captures,
      firstBaseline.baseline_identity.digest,
      secondBaseline.baseline_identity.digest,
      initial.interaction_identity,
      rerunInteraction.receipt_identity,
      initial.accessibility_identity,
      rerunA11y.receipt_identity,
      manifest,
      'chromium',
      version,
      revision,
    );
    putArtifact(
      receipt,
      'baseline',
      makeGate('scenario:vgo-068-baseline', 'checker:ui-baseline@1', '1.0.0', revision),
    );
    bundle = {
      browser: 'chromium',
      browser_version: version,
      repository_revision: revision,
      cas_root: CAS_ROOT,
      captures,
      first_baseline_identity: firstBaseline.baseline_identity.digest,
      second_baseline_identity: secondBaseline.baseline_identity.digest,
      first_interaction_identity: initial.interaction_identity,
      second_interaction_identity: rerunInteraction.receipt_identity,
      first_accessibility_identity: initial.accessibility_identity,
      second_accessibility_identity: rerunA11y.receipt_identity,
      manifest,
      baseline_receipt: receipt,
    };
    writeEvidence(bundle);

    expect(captures.map(item => item.kind)).toEqual([...REQUIRED_SCENARIO_KINDS]);
    expect(captures).toHaveLength(REQUIRED_SCENARIO_KINDS.length);
    expect(bundle.first_baseline_identity).toBe(bundle.second_baseline_identity);
    expect(bundle.first_interaction_identity).toBe(bundle.second_interaction_identity);
    expect(bundle.first_accessibility_identity).toBe(bundle.second_accessibility_identity);
    expect(receipt.uses_production_services).toBe(false);
    expect(receipt.uses_production_credentials).toBe(false);
    expect(receipt.can_issue_authoritative_allow).toBe(false);
    expect(receipt.headless_shell_used).toBe(false);
    const problems = receipt.problems as BaselineProblem[];
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every(item => item.hidden === false)).toBe(true);
    expect(problems.some(item => item.code === 'missing-field-error-association')).toBe(true);
    expect(problems.some(item => item.code === 'static-confirmation-is-not-argument-digest-bound')).toBe(true);
    expect(receipt.unsupported_criteria).toEqual([...UNSUPPORTED_WCAG_CRITERIA]);
    expect(receipt.manual_check_ids).toEqual([...MANUAL_CHECK_IDS]);
    expect((receipt.claim_boundary as { verified_wcag: boolean }).verified_wcag).toBe(false);
    expect(serializeAccessibilityReceipt(rerunA11y.receipt).length).toBeGreaterThan(0);
    expect(serializeInteractionReceipt(rerunInteraction.receipt).length).toBeGreaterThan(0);
    expect(serializeUiInteractionTrace(rerunInteraction.trace).length).toBeGreaterThan(0);
    for (const capture of captures) {
      expect(capture.screenshot.size_bytes).toBeGreaterThan(0);
      expect(capture.screenshot.media_type).toBe('image/png');
      expect(getArtifact(capture.screenshot.cid).subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
    }
  });

  test('screenshot, trace, and accessibility CIDs resolve and rehash through the durable manifest', async () => {
    if (!bundle) throw new Error('baseline capture did not run');
    const committed = JSON.parse(readFileSync(ARTIFACTS_EVIDENCE_PATH, 'utf8')) as CaptureBundle['manifest']['identity_payload'];
    expect(Object.keys(committed).sort()).toEqual([...CLOSED_MANIFEST_KEYS]);
    expect(committed.interface).toBe(MANIFEST_INTERFACE);
    expect(committed.schema_version).toBe(MANIFEST_SCHEMA);
    expect(committed.artifact_cids).toEqual(bundle.manifest.identity_payload.artifact_cids);
    expect(committed.entries).toEqual(bundle.manifest.identity_payload.entries);

    const resolvedManifest = getArtifact(bundle.manifest.cid);
    expect(cidV1(resolvedManifest)).toBe(bundle.manifest.cid);
    expect(sha256Digest(resolvedManifest)).toBe(sha256Digest(canonicalJsonBytes({
      artifact_cids: committed.artifact_cids,
      entries: committed.entries,
      interface: committed.interface,
      run_id: committed.run_id,
      schema_version: committed.schema_version,
    })));

    const kinds = new Set<string>();
    for (const cid of committed.artifact_cids) {
      const body = getArtifact(cid);
      expect(cidV1(body)).toBe(cid);
      kinds.add((committed.entries.find(entry => entry.cid === cid) as { kind: string }).kind);
    }
    expect(kinds.has('screenshot')).toBe(true);
    expect(kinds.has('accessibility')).toBe(true);
    expect(kinds.has('trace')).toBe(true);

    const baseline = JSON.parse(readFileSync(BASELINE_EVIDENCE_PATH, 'utf8')) as {
      artifact_manifest_cid: string;
      screenshot_observations: Array<{ cid: string; digest: string }>;
      accessibility_receipts: Array<{ cid: string }>;
      interaction_receipts: Array<{ trace_cid: string }>;
      deterministic_rerun: { baseline_identities_match: boolean; interaction_identities_match: boolean; accessibility_identities_match: boolean };
    };
    expect(baseline.artifact_manifest_cid).toBe(bundle.manifest.cid);
    expect(baseline.deterministic_rerun.baseline_identities_match).toBe(true);
    expect(baseline.deterministic_rerun.interaction_identities_match).toBe(true);
    expect(baseline.deterministic_rerun.accessibility_identities_match).toBe(true);
    for (const shot of baseline.screenshot_observations) {
      const body = getArtifact(shot.cid);
      expect(sha256Digest(body)).toBe(shot.digest);
    }
    for (const receipt of baseline.accessibility_receipts) {
      expect(cidV1(getArtifact(receipt.cid))).toBe(receipt.cid);
    }
    for (const receipt of baseline.interaction_receipts) {
      expect(cidV1(getArtifact(receipt.trace_cid))).toBe(receipt.trace_cid);
    }
  });

  test('does not use production services or hide unsupported review items', async () => {
    if (!bundle) throw new Error('baseline capture did not run');
    const baseline = JSON.parse(readFileSync(BASELINE_EVIDENCE_PATH, 'utf8')) as {
      uses_production_services: boolean;
      uses_production_credentials: boolean;
      can_issue_authoritative_allow: boolean;
      unsupported_criteria: string[];
      manual_check_ids: string[];
      problems: BaselineProblem[];
      claim_boundary: { verified_wcag: boolean; screen_reader_reviewed: boolean };
    };
    expect(baseline.uses_production_services).toBe(false);
    expect(baseline.uses_production_credentials).toBe(false);
    expect(baseline.can_issue_authoritative_allow).toBe(false);
    expect(baseline.claim_boundary.verified_wcag).toBe(false);
    expect(baseline.claim_boundary.screen_reader_reviewed).toBe(false);
    expect(baseline.unsupported_criteria).toEqual([...UNSUPPORTED_WCAG_CRITERIA]);
    expect(baseline.manual_check_ids).toContain('manual:screen-reader-review');
    expect(baseline.problems.some(item => item.hidden)).toBe(false);
    expect(baseline.problems.some(item => item.code === 'missing-field-error-association' && item.live_confirmed)).toBe(true);
    expect(bundle.cas_root.includes(`${join(WORKSPACE_ROOT, 'data', 'agent_supervisor')}`)).toBe(false);
  });
});
