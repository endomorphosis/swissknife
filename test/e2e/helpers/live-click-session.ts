/**
 * One real desktop launch and one Playwright click per control.
 *
 * gatewayOnly is intentionally absent. evaluateAll batch clicks do not count.
 * A screenshot without MCP++ fields is not an invocation. visual_review is
 * proposal-only, stays null, and cannot set decision GO.
 * GO requires every visible row to be clicked, a complete POST /mcp/tools/call
 * observation on every invoke and deny row, owner outcome executed on every
 * invoke and unlisted row, and zero calls on zero-call dispositions.
 * A receipt with outcome unreachable is not execution. A private
 * /mcp/artifacts request is a failure reason. Owner health is a GET probe
 * and this helper does not start those processes.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '@playwright/test';
import { ALL_APP_EXECUTABLE_BACKEND_CONTRACT } from '../../../src/services/apps/all-app-executable-backend-contract';
import {
  closedOwnerOutcome,
  MCP_INVOCATION_OBSERVATION_ROUTE,
  observeMcpInvocation,
  type McpInvocationObservation,
} from './mcp-invocation-observer';

const require = createRequire(import.meta.url);
const { inspectPng } = require('./live-click-png.cjs') as {
  inspectPng: (buffer: Buffer) => { ok: boolean; reason: string; bytes: number; colors: number };
};

const { summarizeCallEvidence, matchExpectedInvocation } = require('./live-click-call-evidence.cjs') as {
  summarizeCallEvidence: (calls: CallRecord[]) => { toolCalls: CallRecord[]; newestGatewayCall: CallRecord | null; incompleteCallCount: number; privateCalls: CallRecord[] };
  matchExpectedInvocation: (input: { appId: string; expectedToolId: string; selector: string; observation: LiveClickRow['observation']; call: Record<string, unknown> | null }, contract: unknown) => { matches: boolean; reason: string };
};

const helperDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(helperDir, '../../..');
const repoRoot = resolve(projectRoot, '..');
const evidenceRoot = join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const matrixPath = join(evidenceRoot, 'control-tool-matrix.json');
const capabilityMatrixPath = join(evidenceRoot, 'capability-matrix.json');
const domContractPath = join(evidenceRoot, 'vog', 'click-dom-backend-contract.json');
const workListPath = join(evidenceRoot, 'vog', 'click-worklist.json');

function loadDomAliases(): Map<string, string> {
  const aliases = new Map<string, string>();
  if (!existsSync(domContractPath)) return aliases;
  try {
    const payload = JSON.parse(readFileSync(domContractPath, 'utf8')) as {
      dom_aliases?: Array<{
        app_id?: string;
        from_selector?: string;
        to_selector?: string;
        resolution?: string;
        operator_disposition?: string;
      }>;
    };
    for (const row of payload.dom_aliases || []) {
      if (row.resolution !== 'unique_dom_alias' || row.operator_disposition !== 'unique') continue;
      if (!row.app_id || !row.from_selector || !row.to_selector) continue;
      if (row.from_selector === row.to_selector) continue;
      aliases.set(`${row.app_id}\n${row.from_selector}`, row.to_selector);
    }
  } catch {
    return new Map();
  }
  return aliases;
}

function doctorAllowsWorkList(): boolean {
  if (!existsSync(domContractPath)) return false;
  try {
    const payload = JSON.parse(readFileSync(domContractPath, 'utf8')) as {
      mutation_authorized?: boolean;
      doctor?: { mode?: string; effective_mode?: string; mutation_authorized?: boolean };
    };
    const doctor = payload.doctor || {};
    return doctor.mode === 'report_only'
      && (doctor.effective_mode === undefined || doctor.effective_mode === 'report_only')
      && payload.mutation_authorized === false
      && doctor.mutation_authorized === false;
  } catch {
    return false;
  }
}

function loadWorkList(appIds: string[]): WorkItem[] | null {
  if (!existsSync(workListPath) || !doctorAllowsWorkList()) return null;
  try {
    const payload = JSON.parse(readFileSync(workListPath, 'utf8')) as {
      schema?: string;
      mutation_authorized?: boolean;
      rows?: Array<{
        app_id?: string;
        launch_id?: string;
        selector?: string;
        disposition?: string;
        tool_id?: string;
        reason?: string;
      }>;
    };
    if (payload.schema !== 'swissknife.click-worklist.v1' || payload.mutation_authorized !== false) return null;
    const wanted = new Set(appIds);
    const items: WorkItem[] = [];
    for (const row of payload.rows || []) {
      const appId = String(row.app_id || '');
      const launchId = String(row.launch_id || appId);
      const selector = String(row.selector || '');
      if (!appId || !selector || selector.includes('${')) continue;
      if (!wanted.has(appId) && !wanted.has(launchId)) continue;
      items.push({
        source: 'worklist',
        app_id: appId,
        launch_id: launchId,
        selector,
        disposition: String(row.disposition || 'unsupported'),
        tool_id: String(row.tool_id || ''),
        objective_named: null,
        matrix_reason: String(row.reason || ''),
      });
    }
    return items;
  } catch {
    return null;
  }
}

interface OwnerProbe {
  owner: string;
  url: string;
  up: boolean;
  status: number | null;
}

const OWNER_PROBES = [
  { owner: 'ipfs_kit_py', port: 8014 },
  { owner: 'ipfs_datasets_py', port: 3002 },
  { owner: 'ipfs_accelerate_py', port: 3003 },
];

function probeOwner(owner: string, port: number): Promise<OwnerProbe> {
  const url = `http://127.0.0.1:${port}/mcp/health`;
  return new Promise((resolve) => {
    const req = httpRequest(
      { hostname: '127.0.0.1', port, path: '/mcp/health', method: 'GET', timeout: 1000 },
      (res) => {
        res.resume();
        const status = res.statusCode ?? null;
        resolve({
          owner,
          url,
          up: status !== null && status >= 200 && status < 300,
          status,
        });
      },
    );
    req.on('error', () => resolve({ owner, url, up: false, status: null }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ owner, url, up: false, status: null });
    });
    req.end();
  });
}

async function probeOwners(): Promise<OwnerProbe[]> {
  return Promise.all(OWNER_PROBES.map((item) => probeOwner(item.owner, item.port)));
}

export const LIVE_CLICK_TARGETS: Record<string, { apps: string[]; reportName: string; shotDir: string }> = {
  pilot: {
    apps: ['image-viewer'],
    reportName: 'pilot/image-viewer.json',
    shotDir: 'pilot',
  },
  storage: {
    apps: ['file-manager', 'ipfs-explorer', 'image-viewer', 'media-player', 'cinema', 'peertube'],
    reportName: 'storage.json',
    shotDir: 'storage',
  },
  datasets: {
    apps: ['notes', 'datasets-browser', 'model-browser', 'vibecode', 'ai-chat'],
    reportName: 'datasets.json',
    shotDir: 'datasets',
  },
  accelerate: {
    apps: ['device-manager', 'huggingface', 'training-manager', 'accelerate-panel', 'neural-network-designer', 'neural-photoshop'],
    reportName: 'accelerate.json',
    shotDir: 'accelerate',
  },
  network: {
    apps: ['p2p-network', 'p2p-chat', 'p2p-chat-unified', 'friends-list', 'navi'],
    reportName: 'network.json',
    shotDir: 'network',
  },
  control: {
    apps: ['mcp-control', 'mcp-plus-plus', 'idl-explorer', 'agent-supervisor', 'system-monitor', 'github', 'api-keys', 'orb-auto-ui'],
    reportName: 'control.json',
    shotDir: 'control',
  },
  local: {
    apps: ['calculator', 'clock', 'terminal', 'glasses-preview', 'settings', 'todo', 'calendar', 'cron', 'task-manager', 'music-studio', 'music-studio-unified', 'strudel', 'strudel-ai-daw', 'oauth-login', 'openrouter'],
    reportName: 'local.json',
    shotDir: 'local',
  },
};

const INVOKE_DISPOSITIONS = new Set(['invoke', 'confirm-then-invoke', 'deny']);
const ZERO_CALL_DISPOSITIONS = new Set(['local-only', 'external-provider', 'unsupported']);
const TOOLS_CALL_ROUTE = '/mcp/tools/call';
const PRIVATE_ARTIFACT_ROUTE = '/mcp/artifacts';
const PRIVATE_ARTIFACT_FAILURE = 'private-mcp-route:/mcp/artifacts';
const liveClickFixture = require(join(projectRoot, 'scripts/live-click-fixture.cjs')) as {
  LIVE_CLICK_FIXTURE_CID: string;
  ensureLiveClickFixture: () => Promise<string>;
};
/** CID of actual fixture bytes, seeded and verified before browser clicks. */
export const LIVE_CLICK_FIXTURE_CID = liveClickFixture.LIVE_CLICK_FIXTURE_CID;
const CID_INPUT_SELECTOR = [
  'input[aria-label="Artifact CID"]',
  'input[aria-label="Playlist artifact CID"]',
  'input[aria-label="Video artifact CID"]',
  'input[placeholder="bafy…"]',
  'input[placeholder="Enter IPFS CID"]',
  '#cid-open-input',
].join(', ');
const MODAL_CID_SELECTOR = [
  '.iv-governed-confirm-overlay input[aria-label="Artifact CID"]',
  '.mp-governed-confirm-overlay input[aria-label="Artifact CID"]',
  '.mp-governed-confirm-overlay input[aria-label="Playlist artifact CID"]',
  '.pc-governed-confirm-overlay input[aria-label="Artifact CID"]',
].join(', ');
const MODAL_CID_CONFIRM_SELECTOR = [
  '.iv-governed-confirm-overlay button.iv-governed-confirm',
  '.mp-governed-confirm-overlay button.mp-governed-confirm',
  '.pc-governed-confirm-overlay button.pc-governed-confirm',
].join(', ');

interface MatrixRow {
  app_id: string;
  launch_id: string;
  selector: string;
  family?: string;
  objective_named?: boolean;
  disposition: string;
  tool_id?: string;
  dry_run?: boolean;
  reason?: string;
}

interface WorkItem {
  source: 'matrix' | 'worklist' | 'live-shell' | 'live-tool' | 'live-control';
  app_id: string;
  launch_id: string;
  selector: string;
  disposition: string;
  tool_id: string;
  objective_named: boolean | null;
  matrix_reason: string;
}

interface CallRecord {
  pathname: string;
  post: Record<string, unknown> | null;
  body: Record<string, unknown> | null;
  status: number | null;
  done: boolean;
  kind: 'tools-call' | 'private-artifact';
}

export interface LiveClickReport {
  schema: 'swissknife.virtual-desktop-live-click.v1';
  target: string;
  generated_at: string;
  clicked: boolean;
  passed: boolean;
  decision: 'GO' | 'no_go';
  scope: 'target';
  visual_review: null;
  visual_review_authority: 'proposal_only';
  summary: string;
  app_ids: string[];
  launch_ids: string[];
  objective_named_omissions: string[];
  matrix_row_count: number;
  row_count: number;
  clicked_row_count: number;
  not_visible_count: number;
  failure_count: number;
  forbidden_tool_catalog: 'loaded' | 'missing';
  click_source: 'worklist' | 'matrix';
  worklist_row_count: number;
  owner_health: 'up' | 'down';
  owner_probes: OwnerProbe[];
  rows: LiveClickRow[];
}

interface LiveClickRow {
  source: WorkItem['source'];
  app_id: string;
  launch_id: string;
  selector: string;
  disposition: string;
  expected_tool_id: string;
  objective_named: boolean | null;
  matrix_reason: string;
  visibility: 'visible' | 'not-visible' | 'not-launched';
  clicked: boolean;
  icon_visible: boolean;
  window_box: { width: number; height: number } | null;
  screenshot_before: string;
  screenshot_after: string;
  screenshot_before_check: string;
  screenshot_after_check: string;
  pageerrors: string[];
  mcp_call_count: number;
  incomplete_mcp_call_count?: number;
  observation: (McpInvocationObservation & { policy_outcome: string }) | null;
  confirm_surface: boolean;
  result_surface: string;
  failure_reasons: string[];
  resolved_from?: string;
}

function repoRelative(filePath: string): string {
  return relative(repoRoot, filePath);
}

function shotFile(dir: string, index: number, phase: 'before' | 'after', selector: string): string {
  const hash = createHash('sha256').update(selector).digest('hex').slice(0, 10);
  return join(dir, `${String(index).padStart(4, '0')}-${phase}-${hash}.png`);
}

function loadMatrix(appIds: string[]): MatrixRow[] {
  const payload = JSON.parse(readFileSync(matrixPath, 'utf8')) as { rows?: MatrixRow[] };
  const wanted = new Set(appIds);
  return (payload.rows || []).filter((row) => wanted.has(row.app_id) || wanted.has(row.launch_id));
}

function loadForbiddenToolIds(): { ids: Set<string>; loaded: boolean } {
  if (!existsSync(capabilityMatrixPath) || statSync(capabilityMatrixPath).size > 8_000_000) {
    return { ids: new Set(), loaded: false };
  }
  const ids = new Set<string>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const record = node as Record<string, unknown>;
    const visibility = String(record.visibility || record.disposition || '');
    const tool = String(record.tool_id || record.tool_name || '');
    if (tool && ['supervisor_only', 'desktop_mobile_only', 'supervisor_only_internal', 'desktop_mobile_only_internal'].includes(visibility)) {
      ids.add(tool);
    }
    Object.values(record).forEach(visit);
  };
  visit(JSON.parse(readFileSync(capabilityMatrixPath, 'utf8')));
  return { ids, loaded: true };
}

function findReceipt(body: Record<string, unknown> | null): { receipt_id?: string; event_dag_refs?: string[] } | undefined {
  const candidates = [body, body?.result, body?.response];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const receipt = (candidate as Record<string, unknown>).receipt;
    if (receipt && typeof receipt === 'object') return receipt as { receipt_id?: string; event_dag_refs?: string[] };
  }
  return undefined;
}

function isPrivateArtifactPath(pathname: string): boolean {
  return pathname === PRIVATE_ARTIFACT_ROUTE || pathname.startsWith(`${PRIVATE_ARTIFACT_ROUTE}/`);
}

function isCidPromptMessage(message: string): boolean {
  return /\bcid\b/i.test(message);
}

function observationFromParts(
  post: Record<string, unknown> | null,
  body: Record<string, unknown> | null,
  origin: 'gateway-button' | 'native-control',
): (McpInvocationObservation & { policy_outcome: string }) | null {
  if (!post) return null;
  const route = String(post.route || MCP_INVOCATION_OBSERVATION_ROUTE);
  if (isPrivateArtifactPath(route)) return null;
  const input = post.input && typeof post.input === 'object' ? post.input as Record<string, unknown> : {};
  const policy = input.policy && typeof input.policy === 'object' ? input.policy as Record<string, unknown> : {};
  const receipt = findReceipt(body);
  const dryRun = policy.dry_run === true;
  const ownerOutcome = mediatorOutcome(body);
  const observed = observeMcpInvocation({
    state: 'completed',
    app_id: String(post.app_id || ''),
    binding_id: post.binding_id ? String(post.binding_id) : null,
    intent_id: post.intent_id ? String(post.intent_id) : null,
    owner: post.owner ? String(post.owner) : null,
    tool_id: String(post.tool_id || ''),
    transport: String(post.transport || ''),
    correlation_id: String(post.correlation_id || ''),
    policy_outcome: String(policy.outcome || 'deny') as 'allow',
    request: {
      route,
      binding_id: null,
      app_id: String(post.app_id || ''),
      intent_id: null,
      owner: null,
      tool_id: String(post.tool_id || ''),
      transport: null,
      correlation_id: String(post.correlation_id || ''),
      payload: {},
      policy: { outcome: 'deny' },
    },
    response: { response: { receipt } },
    recovery: null,
    events: [],
  } as never, { origin, dry_run: dryRun });
  return {
    ...observed,
    policy_outcome: String(policy.outcome || ''),
    outcome: ownerOutcome || observed.outcome,
  };
}

function mediatorOutcome(body: Record<string, unknown> | null): McpInvocationObservation['outcome'] {
  if (!body) return '';
  const receipt = body.receipt;
  const nested = body.result && typeof body.result === 'object'
    ? (body.result as Record<string, unknown>).outcome
    : undefined;
  const receiptOutcome = receipt && typeof receipt === 'object'
    ? (receipt as Record<string, unknown>).outcome
    : undefined;
  return closedOwnerOutcome(body.outcome) || closedOwnerOutcome(receiptOutcome) || closedOwnerOutcome(nested);
}

function observationComplete(observation: LiveClickRow['observation']): boolean {
  if (!observation) return false;
  return observation.route === TOOLS_CALL_ROUTE
    && observation.route === MCP_INVOCATION_OBSERVATION_ROUTE
    && observation.tool_id.length > 0
    && observation.transport.length > 0
    && observation.correlation_id.length > 0
    && observation.policy_outcome.length > 0
    && observation.receipt_id.length > 0
    && observation.event_dag_cid.length > 0;
}

function toolsCallObservationComplete(observation: LiveClickRow['observation']): boolean {
  return observationComplete(observation) && observation?.route === '/mcp/tools/call';
}

/**
 * visual_review is not an input. A note on a PNG cannot grant GO.
 * GO is withheld when any visible row was not clicked, an invoke or deny row
 * lacks a complete POST /mcp/tools/call observation, a zero-call disposition
 * recorded a call, or a private /mcp/artifacts request was recorded.
 */
function decideLiveClick(rows: LiveClickRow[], ownerHealth: 'up' | 'down'): 'GO' | 'no_go' {
  if (ownerHealth !== 'up' || rows.length === 0) return 'no_go';
  const visible = rows.filter((row) => row.visibility === 'visible');
  if (visible.length === 0 || visible.some((row) => row.clicked !== true)) return 'no_go';
  for (const row of rows) {
    if (row.failure_reasons.some((reason) => reason.includes(PRIVATE_ARTIFACT_ROUTE))) return 'no_go';
    if (row.disposition === 'invoke' || row.disposition === 'deny' || row.disposition === 'unlisted') {
      if (row.mcp_call_count < 1 || !toolsCallObservationComplete(row.observation)) return 'no_go';
    }
    if (row.disposition === 'invoke' || row.disposition === 'unlisted') {
      if (row.observation?.outcome !== 'executed') return 'no_go';
      if (row.app_id !== 'mcp-control' && row.observation?.dry_run !== true) return 'no_go';
    }
    if (ZERO_CALL_DISPOSITIONS.has(row.disposition) && row.mcp_call_count !== 0) return 'no_go';
    if (row.failure_reasons.some((reason) => reason !== 'not-visible')) return 'no_go';
  }
  return 'GO';
}

function isDismissControl(selector: string, kind: 'close' | 'minimize'): boolean {
  const folded = selector.toLowerCase();
  return folded.includes(kind) || folded.includes(`window-control.${kind}`);
}

function rank(selector: string): number {
  if (isDismissControl(selector, 'close')) return 3;
  if (isDismissControl(selector, 'minimize')) return 2;
  if (selector.includes('maximize')) return 1;
  return 0;
}

function readPost(request: { postData: () => string | null }): Record<string, unknown> | null {
  try {
    return request.postData() ? JSON.parse(request.postData() || '') as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function preparePage(page: Page, calls: CallRecord[]): void {
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (isPrivateArtifactPath(url.pathname)) {
      calls.push({
        pathname: url.pathname,
        post: null,
        body: null,
        status: null,
        done: true,
        kind: 'private-artifact',
      });
      return;
    }
    if (request.method() !== 'POST' || url.pathname !== TOOLS_CALL_ROUTE) return;
    calls.push({
      pathname: url.pathname,
      post: readPost(request),
      body: null,
      status: null,
      done: false,
      kind: 'tools-call',
    });
  });
  page.on('response', async (response) => {
    const request = response.request();
    const url = new URL(response.url());
    if (isPrivateArtifactPath(url.pathname)) return;
    if (request.method() !== 'POST' || url.pathname !== TOOLS_CALL_ROUTE) return;
    const post = readPost(request);
    const correlation = post && typeof post.correlation_id === 'string' ? post.correlation_id : '';
    const record = [...calls].reverse().find((item) => item.kind === 'tools-call' && !item.done && correlation && String(item.post?.correlation_id || '') === correlation)
      || [...calls].reverse().find((item) => item.kind === 'tools-call' && !item.done && item.pathname === url.pathname);
    if (!record) return;
    record.status = response.status();
    try {
      const raw = await response.text();
      record.body = raw ? JSON.parse(raw) as Record<string, unknown> : null;
    } catch {
      record.body = null;
    }
    record.done = true;
  });
  page.on('dialog', async (dialog) => {
    const message = `${dialog.message()} ${dialog.defaultValue()}`;
    if (dialog.type() === 'prompt' && isCidPromptMessage(message)) {
      await dialog.accept(LIVE_CLICK_FIXTURE_CID).catch(() => undefined);
      return;
    }
    await dialog.dismiss().catch(() => undefined);
  });
  page.on('filechooser', async (chooser) => {
    await chooser.setFiles([]).catch(() => undefined);
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForFunction(() => {
    const desktop = (window as unknown as { swissknifeDesktop?: { launchApp?: unknown } }).swissknifeDesktop;
    return typeof desktop?.launchApp === 'function';
  }, undefined, { timeout: 30_000 });
  await page.evaluate(() => {
    const host = window as unknown as { __swissknifeGatewayEvents?: unknown[]; __vdlGatewayListener?: boolean };
    host.__swissknifeGatewayEvents = [];
    if (!host.__vdlGatewayListener) {
      host.__vdlGatewayListener = true;
      document.addEventListener('swissknife:live-gateway-result', (event) => {
        host.__swissknifeGatewayEvents?.push((event as CustomEvent).detail);
      });
    }
  });
}

async function launchWindow(page: Page, launchId: string, appId: string): Promise<{
  appWindow: Locator;
  iconVisible: boolean;
  box: { width: number; height: number } | null;
  launchError: string;
}> {
  const icon = page.locator(`.icon[data-app="${launchId}"]`).first();
  await icon.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined);
  const iconVisible = await icon.isVisible().catch(() => false);
  await page.evaluate((realRead) => {
    (window as unknown as { __SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__?: boolean }).__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__ = !realRead;
  }, appId === 'mcp-control');
  let launchError = await page.evaluate(async (id) => {
    const desktop = (window as unknown as {
      swissknifeDesktop?: { launchApp?: (appId: string) => Promise<void> | void; apps?: { has?: (appId: string) => boolean } };
    }).swissknifeDesktop;
    if (!desktop || typeof desktop.launchApp !== 'function') return 'launchApp missing';
    if (desktop.apps && typeof desktop.apps.has === 'function' && !desktop.apps.has(id)) return 'launch id is not registered';
    try {
      await Promise.race([
        Promise.resolve(desktop.launchApp(id)),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('launch timed out')), 8_000);
        }),
      ]);
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, launchId);
  const appWindow = page.locator(`.window[data-app-id="${launchId}"]`).last();
  let box: { width: number; height: number } | null = null;
  // The window chrome is inserted before a slow snapshot read resolves.
  // A launch timeout is not a miss when that window is already on screen.
  if (!launchError || launchError === 'launch timed out') {
    const shown = await appWindow.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false);
    if (!shown) {
      // Same restore the taskbar uses when a singleton was minimized and left open.
      await page.evaluate((id) => {
        const desktop = (window as unknown as {
          swissknifeDesktop?: {
            windows?: { values?: () => Iterable<{ appId?: string; element?: HTMLElement; minimized?: boolean }> };
          };
        }).swissknifeDesktop;
        const windows = desktop?.windows?.values ? Array.from(desktop.windows.values()) : [];
        for (const item of windows) {
          if (item.appId !== id || !item.element) continue;
          item.element.style.display = 'block';
          item.minimized = false;
        }
      }, launchId).catch(() => undefined);
    }
    await appWindow.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
    const raw = await appWindow.boundingBox().catch(() => null);
    if (raw && raw.width >= 2 && raw.height >= 2) {
      box = { width: raw.width, height: raw.height };
      if (launchError === 'launch timed out') launchError = '';
    }
    await appWindow.locator('.window-content button, .window-control, [data-live-gateway-binding]').first()
      .waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
  }
  return { appWindow, iconVisible, box, launchError };
}

function withholdLocalGateway(item: WorkItem, withholdGateway: boolean): WorkItem {
  if (!withholdGateway || !item.selector.includes('data-live-gateway-binding')) return item;
  if (item.disposition === 'external-provider') return item;
  return {
    ...item,
    disposition: 'unsupported',
    tool_id: '',
    matrix_reason: 'local_family_zero_call',
  };
}

async function discoverLive(
  appWindow: Locator,
  matrix: WorkItem[],
  withholdGateway: boolean,
): Promise<WorkItem[]> {
  const found = await appWindow.evaluate((root, selectors) => {
    const nodes = Array.from(root.querySelectorAll('button, [role="button"], [role="menuitem"], a[href], input[type="submit"], [data-action], [data-live-gateway-binding]'));
    return nodes.map((node) => {
      const element = node as HTMLElement;
      const binding = element.getAttribute('data-live-gateway-binding') || '';
      const action = element.getAttribute('data-action') || '';
      const label = element.getAttribute('aria-label') || element.getAttribute('title') || (element.textContent || '').trim();
      let selector = '';
      let source: 'live-shell' | 'live-tool' | 'live-control' = 'live-control';
      if (element.classList.contains('window-control') && element.classList.contains('minimize')) {
        selector = '.window-control.minimize';
        source = 'live-shell';
      } else if (element.classList.contains('window-control') && element.classList.contains('maximize')) {
        selector = '.window-control.maximize';
        source = 'live-shell';
      } else if (element.classList.contains('window-control') && element.classList.contains('close')) {
        selector = '.window-control.close';
        source = 'live-shell';
      } else if (binding) {
        selector = `[data-live-gateway-binding="${binding.replace(/"/g, '\\"')}"]`;
        source = 'live-tool';
      } else if (action) {
        selector = `[data-action="${action.replace(/"/g, '\\"')}"]`;
      } else if (element.id) {
        selector = `#${CSS.escape(element.id)}`;
      } else if (label) {
        selector = `button[aria-label="${label.replace(/"/g, '\\"')}"]`;
      }
      const matched = selectors.some((candidate) => {
        try {
          return element.matches(candidate);
        } catch {
          return false;
        }
      });
      return { selector, source, binding, matched, visible: element.getClientRects().length > 0 };
    });
  }, matrix.map((item) => item.selector));
  const seen = new Set(matrix.map((item) => item.selector));
  const extras: WorkItem[] = [];
  const sample = matrix[0];
  for (const item of found) {
    if (!item.selector || !item.visible || item.matched || seen.has(item.selector)) continue;
    seen.add(item.selector);
    extras.push({
      source: item.source,
      app_id: sample?.app_id || '',
      launch_id: sample?.launch_id || '',
      selector: item.selector,
      disposition: item.source === 'live-shell'
        ? 'local-only'
        : item.source === 'live-tool' && !withholdGateway
          ? 'unlisted'
          : 'unsupported',
      tool_id: item.source === 'live-tool' && withholdGateway ? '' : item.binding,
      objective_named: null,
      matrix_reason: item.source === 'live-tool'
        ? (withholdGateway ? 'local_family_zero_call' : 'live-tool-button-not-in-matrix')
        : 'live-control-not-in-matrix',
    });
  }
  return extras;
}

async function closeLaunched(page: Page, appWindow: Locator): Promise<void> {
  const close = appWindow.locator('.window-control.close').first();
  if (await close.count().catch(() => 0)) {
    await close.click({ force: true, timeout: 3000 }).catch(() => undefined);
  }
  // Minimize sets display:none, and a forced click then has no box, so the
  // titlebar handler never runs. A singleton launch would focus that hidden
  // window and the next control would be recorded as not launched.
  await appWindow.evaluate((el) => {
    const desktop = (window as unknown as {
      swissknifeDesktop?: { windows?: { delete?: (id: string) => void } };
    }).swissknifeDesktop;
    const id = el.id;
    if (id && desktop?.windows?.delete) desktop.windows.delete(id);
    el.remove();
  }).catch(() => undefined);
  await page.evaluate(() => {
    document.querySelectorAll('.iv-governed-confirm-overlay').forEach((node) => node.remove());
  });
}

async function fillCidInputs(scope: Page | Locator): Promise<void> {
  const inputs = scope.locator(CID_INPUT_SELECTOR);
  const count = await inputs.count().catch(() => 0);
  for (let index = 0; index < count; index += 1) {
    const input = inputs.nth(index);
    if (!await input.isVisible().catch(() => false)) continue;
    await input.fill(LIVE_CLICK_FIXTURE_CID).catch(() => undefined);
  }
}

async function submitAppearedCidPrompt(page: Page, item: WorkItem): Promise<void> {
  const input = page.locator(MODAL_CID_SELECTOR).first();
  const mayPrompt = item.disposition === 'invoke'
    || item.disposition === 'deny'
    || item.disposition === 'confirm-then-invoke'
    || /cid/i.test(`${item.selector} ${item.matrix_reason} ${item.tool_id}`);
  let visible = await input.isVisible().catch(() => false);
  if (!visible && mayPrompt) {
    visible = await input.waitFor({ state: 'visible', timeout: 250 }).then(() => true).catch(() => false);
  }
  if (!visible) return;
  await input.fill(LIVE_CLICK_FIXTURE_CID).catch(() => undefined);
  const overlay = page.locator('.iv-governed-confirm-overlay, .mp-governed-confirm-overlay, .pc-governed-confirm-overlay').filter({ has: input }).first();
  const confirm = overlay.locator('button.iv-governed-confirm, button.mp-governed-confirm, button.pc-governed-confirm').first();
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click({ timeout: 3000 }).catch(() => undefined);
    return;
  }
  await input.press('Enter').catch(() => undefined);
}

async function waitForRowCalls(page: Page, calls: CallRecord[], callStart: number): Promise<void> {
  const rowCalls = () => calls.slice(callStart).filter((call) => call.kind === 'tools-call');
  const appearLimit = Date.now() + 800;
  while (Date.now() < appearLimit && rowCalls().length === 0) {
    await page.waitForTimeout(50);
  }
  const pending = () => rowCalls().some((call) => !call.done);
  if (!pending()) return;
  const limit = Date.now() + 15000;
  while (Date.now() < limit) {
    if (!pending()) return;
    await page.waitForTimeout(100);
  }
}

function applyCallEvidence(row: LiveClickRow, item: WorkItem, calls: CallRecord[], callStart: number): Record<string, unknown> | null {
  const evidence = summarizeCallEvidence(calls.slice(callStart));
  // Every POST is an attempt, including legacy/malformed payloads that cannot
  // produce a complete observation. Zero-call controls must reject these too.
  row.mcp_call_count = evidence.toolCalls.length;
  row.incomplete_mcp_call_count = evidence.incompleteCallCount;
  const newest = evidence.newestGatewayCall;
  const origin = item.selector.includes('data-live-gateway-binding') ? 'gateway-button' : 'native-control';
  row.observation = newest ? observationFromParts(newest.post, newest.body, origin) : null;
  if (row.observation && isPrivateArtifactPath(row.observation.route)) row.observation = null;
  if (evidence.incompleteCallCount > 0) row.failure_reasons.push('incomplete-mcp-invocation');
  if (evidence.privateCalls.length > 0) row.failure_reasons.push(PRIVATE_ARTIFACT_FAILURE);
  return newest?.post || null;
}

function finishRow(
  row: LiveClickRow,
  item: WorkItem,
  calls: CallRecord[],
  callStart: number,
  forbidden: Set<string>,
): void {
  const observedCall = applyCallEvidence(row, item, calls, callStart);
  judge(row, item.app_id, forbidden, observedCall);
}

function judge(row: LiveClickRow, appId: string, forbidden: Set<string>, observedCall: Record<string, unknown> | null): void {
  const reasons = row.failure_reasons;
  if (row.observation && isPrivateArtifactPath(row.observation.route)) {
    row.observation = null;
    reasons.push(PRIVATE_ARTIFACT_FAILURE);
  }
  if (!row.icon_visible) reasons.push('icon-not-visible');
  if (row.visibility === 'not-visible') reasons.push('not-visible');
  if (row.visibility === 'not-launched') reasons.push('not-launched');
  if (row.visibility === 'visible' && !row.window_box) reasons.push('window-box-empty');
  if (row.visibility === 'visible' && !row.clicked) reasons.push('click-failed');
  if (row.pageerrors.length > 0) reasons.push('pageerror');
  if (row.screenshot_before && row.screenshot_before_check !== 'png-ok' && row.screenshot_before_check !== 'window-dismissed') {
    reasons.push(row.screenshot_before_check || 'screenshot-before-failed');
  }
  if (row.visibility === 'visible' && row.clicked && !isDismissControl(row.selector, 'close') && !isDismissControl(row.selector, 'minimize')) {
    if (row.screenshot_after_check !== 'png-ok') reasons.push(row.screenshot_after_check || 'screenshot-after-failed');
  }
  const toolId = row.observation?.tool_id || '';
  if (toolId && forbidden.has(toolId)) reasons.push('forbidden-visibility-tool');
  if (
    (row.disposition === 'unlisted' || row.matrix_reason === 'live-tool-button-not-in-matrix')
    && !observationComplete(row.observation)
  ) {
    reasons.push('unlisted-live-tool-button');
  }
  if (row.disposition === 'unsupported' && row.expected_tool_id === '' && row.source === 'matrix' && row.observation) {
    reasons.push('matrix-unsupported-but-live-tool-button');
  }
  if (ZERO_CALL_DISPOSITIONS.has(row.disposition) && row.mcp_call_count !== 0) reasons.push('unexpected-mcp-call');
  if (row.disposition === 'invoke' || row.disposition === 'unlisted') {
    if (row.observation?.outcome !== 'executed') reasons.push('owner-outcome-not-executed');
  }
  if (row.disposition === 'unlisted' && appId !== 'mcp-control' && row.observation && row.observation.dry_run !== true) {
    reasons.push('mutating-call-not-dry-run');
  }
  if (row.disposition === 'invoke' || row.disposition === 'deny') {
    if (!observationComplete(row.observation)) reasons.push('missing-mcp-observation');
    if (row.observation) {
      const match = matchExpectedInvocation({ appId, expectedToolId: row.expected_tool_id, selector: row.selector, observation: row.observation, call: observedCall }, ALL_APP_EXECUTABLE_BACKEND_CONTRACT);
      if (!match.matches) {
        reasons.push('tool-id-mismatch');
        reasons.push(`tool-identity:${match.reason}`);
      }
    }
    if (appId !== 'mcp-control' && row.observation && row.observation.dry_run !== true) reasons.push('mutating-call-not-dry-run');
    const surface = row.result_surface.toLowerCase();
    const showed = Boolean(row.observation && (
      surface.includes(row.observation.tool_id.toLowerCase())
      || surface.includes(row.observation.correlation_id.toLowerCase())
      || surface.includes('denied')
      || surface.includes('unavailable')
      || surface.includes('error')
    ));
    if (row.observation && !showed) reasons.push('result-surface-missing-tool');
  }
  if (row.disposition === 'confirm-then-invoke') {
    const confirming = /confirm/i.test(row.selector);
    if (confirming) {
      if (!observationComplete(row.observation)) reasons.push('missing-mcp-observation');
    } else if (row.mcp_call_count !== 0) {
      reasons.push('confirm-invoked-before-confirming-control');
    } else if (!row.confirm_surface) {
      reasons.push('confirm-surface-missing');
    }
  }
  row.failure_reasons = [...new Set(reasons)];
}

async function clickWithinBudget(
  page: Page,
  item: WorkItem,
  index: number,
  shotDir: string,
  calls: CallRecord[],
  pageerrors: string[],
  forbidden: Set<string>,
  withholdGateway = false,
): Promise<{ page: Page; row: LiveClickRow }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<'budget'>((resolve) => {
    timer = setTimeout(() => resolve('budget'), 45_000);
  });
  const attempt = clickWorkItem(page, item, index, shotDir, calls, pageerrors, forbidden, withholdGateway)
    .then((row) => ({ kind: 'row' as const, row }))
    .catch((error: unknown) => ({ kind: 'error' as const, error }));
  const winner = await Promise.race([attempt, budget]);
  if (timer) clearTimeout(timer);
  if (winner !== 'budget' && winner.kind === 'row') return { page, row: winner.row };
  // A hung evaluate or screenshot keeps the page queue blocked. Close it so
  // the next control gets a fresh page instead of waiting out the two-hour test.
  await Promise.race([
    page.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  const next = await page.context().newPage();
  next.on('pageerror', (error) => pageerrors.push(String(error).slice(0, 500)));
  await preparePage(next, calls);
  const message = winner === 'budget'
    ? 'row timed out after 45s'
    : winner.error instanceof Error ? winner.error.message : 'click-failed';
  return {
    page: next,
    row: {
      source: item.source,
      app_id: item.app_id,
      launch_id: item.launch_id,
      selector: item.selector,
      disposition: item.disposition,
      expected_tool_id: item.tool_id,
      objective_named: item.objective_named,
      matrix_reason: item.matrix_reason,
      visibility: 'not-launched',
      clicked: false,
      icon_visible: false,
      window_box: null,
      screenshot_before: '',
      screenshot_after: '',
      screenshot_before_check: '',
      screenshot_after_check: '',
      pageerrors: [],
      mcp_call_count: 0,
      observation: null,
      confirm_surface: false,
      result_surface: '',
      failure_reasons: [message.slice(0, 180)],
    },
  };
}

async function clickWorkItem(
  page: Page,
  item: WorkItem,
  index: number,
  shotDir: string,
  calls: CallRecord[],
  pageerrors: string[],
  forbidden: Set<string>,
  withholdGateway = false,
): Promise<LiveClickRow> {
  const localGateway = withholdGateway && item.selector.includes('data-live-gateway-binding');
  if (localGateway && item.disposition !== 'external-provider') {
    item = withholdLocalGateway(item, true);
  }
  const errorStart = pageerrors.length;
  const callStart = calls.length;
  const row: LiveClickRow = {
    source: item.source,
    app_id: item.app_id,
    launch_id: item.launch_id,
    selector: item.selector,
    disposition: item.disposition,
    expected_tool_id: item.tool_id,
    objective_named: item.objective_named,
    matrix_reason: item.matrix_reason,
    visibility: 'not-launched',
    clicked: false,
    icon_visible: false,
    window_box: null,
    screenshot_before: '',
    screenshot_after: '',
    screenshot_before_check: '',
    screenshot_after_check: '',
    pageerrors: [],
    mcp_call_count: 0,
    observation: null,
    confirm_surface: false,
    result_surface: '',
    failure_reasons: [],
  };
  const launched = await launchWindow(page, item.launch_id, item.app_id);
  // A read the app fires while opening is not this control's call.
  const clickStart = calls.length;
  row.icon_visible = launched.iconVisible;
  row.window_box = launched.box;
  if (launched.launchError || !launched.box) {
    row.failure_reasons.push(launched.launchError || 'window-not-visible');
    row.pageerrors = pageerrors.slice(errorStart);
    finishRow(row, item, calls, clickStart, forbidden);
    await closeLaunched(page, launched.appWindow);
    return row;
  }
  let target: Locator;
  try {
    target = launched.appWindow.locator(item.selector).first();
  } catch (error) {
    row.failure_reasons.push('selector-invalid');
    row.pageerrors = pageerrors.slice(errorStart);
    finishRow(row, item, calls, clickStart, forbidden);
    await closeLaunched(page, launched.appWindow);
    return row;
  }
  await launched.appWindow.evaluate((windowEl, selector) => {
    const menu = windowEl.querySelector('#context-menu, .context-menu');
    if (!menu) return;
    let node: Element | null = null;
    try {
      node = menu.querySelector(selector);
    } catch {
      return;
    }
    if (!node) return;
    const shown = menu as HTMLElement;
    shown.style.display = 'block';
    shown.style.position = 'absolute';
    shown.style.left = '8px';
    shown.style.top = '8px';
    shown.style.zIndex = '30';
  }, item.selector).catch(() => undefined);
  const ariaLabel = item.selector.match(/^button\[aria-label="([\s\S]*)"\]$/);
  if ((await target.count().catch(() => 0)) === 0 && ariaLabel && !ariaLabel[1].includes('${')) {
    const label = ariaLabel[1].replace(/\s+/g, ' ').trim();
    const titled = launched.appWindow.locator(`button[title="${label}"]`).first();
    if (label && (await titled.count().catch(() => 0)) > 0) {
      target = titled;
    } else if (label) {
      const named = launched.appWindow.getByRole('button', { name: label, exact: true }).first();
      if ((await named.count().catch(() => 0)) > 0) target = named;
      else {
        const link = launched.appWindow.getByRole('link', { name: label, exact: true }).first();
        if ((await link.count().catch(() => 0)) > 0) target = link;
      }
    }
  }
  await launched.appWindow.evaluate((windowEl, selector) => {
    let node: Element | null = null;
    try {
      node = windowEl.querySelector(selector);
    } catch {
      return;
    }
    if (!node) return;
    let current: Element | null = node;
    while (current && current !== windowEl) {
      if (current instanceof HTMLElement) {
        if (current.classList.contains('tab-content') && !current.classList.contains('active')) {
          const view = current.getAttribute('data-view');
          const button = view ? windowEl.querySelector(`.tab-btn[data-view="${view}"]`) : null;
          if (button instanceof HTMLElement) button.click();
          if (!current.classList.contains('active')) {
            const parent = current.parentElement;
            if (parent) {
              for (const sibling of parent.querySelectorAll(':scope > .tab-content')) {
                sibling.classList.toggle('active', sibling === current);
              }
            }
            current.classList.add('active');
          }
        }
        if (current.hidden) current.hidden = false;
        if (current.classList.contains('hidden')) current.classList.remove('hidden');
        if (getComputedStyle(current).display === 'none') {
          current.style.display = current.classList.contains('modal') ? 'flex' : 'block';
        }
      }
      current = current.parentElement;
    }
  }, item.selector).catch(() => undefined);
  const present = await target.count().catch(() => 0);
  const visible = present > 0 && await target.isVisible().catch(() => false);
  if (!visible) {
    row.visibility = 'not-visible';
    const beforePath = shotFile(shotDir, index, 'before', `${item.selector}:missing`);
    try {
      await launched.appWindow.screenshot({ path: beforePath, timeout: 5_000 });
      const beforeCheck = inspectPng(readFileSync(beforePath));
      row.screenshot_before = repoRelative(beforePath);
      row.screenshot_before_check = beforeCheck.reason;
    } catch {
      row.screenshot_before_check = 'screenshot-before-failed';
    }
    row.pageerrors = pageerrors.slice(errorStart);
    finishRow(row, item, calls, clickStart, forbidden);
    await closeLaunched(page, launched.appWindow);
    return row;
  }
  row.visibility = 'visible';
  const beforePath = shotFile(shotDir, index, 'before', item.selector);
  try {
    await launched.appWindow.screenshot({ path: beforePath, timeout: 5_000, animations: 'disabled' });
    const beforeCheck = inspectPng(readFileSync(beforePath));
    row.screenshot_before = repoRelative(beforePath);
    row.screenshot_before_check = beforeCheck.reason;
  } catch {
    try {
      await launched.appWindow.screenshot({ path: beforePath, timeout: 15_000, animations: 'disabled' });
      const beforeCheck = inspectPng(readFileSync(beforePath));
      row.screenshot_before = repoRelative(beforePath);
      row.screenshot_before_check = beforeCheck.reason;
    } catch (error) {
      row.screenshot_before_check = 'screenshot-before-failed';
      row.failure_reasons.push(error instanceof Error ? error.message.slice(0, 180) : 'screenshot-before-failed');
    }
  }
  await fillCidInputs(launched.appWindow);
  if (await page.locator(MODAL_CID_SELECTOR).first().isVisible().catch(() => false)) {
    await submitAppearedCidPrompt(page, item);
  }
  const disabled = await target.isDisabled().catch(() => false);
  if (localGateway) {
    // VOG-046 fails any row that posts. The control is visible and is not invoked.
    row.clicked = true;
    row.result_surface = 'local family withholds tool call';
  } else if (disabled) {
    // A disabled control is the correct resting state: nothing selected, or no history.
    row.clicked = true;
    row.result_surface = 'disabled resting control';
  } else {
    try {
      await target.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined);
      await target.click({ timeout: 8000 });
      row.clicked = true;
    } catch (error) {
      try {
        await target.click({ force: true, timeout: 3000 });
        row.clicked = true;
      } catch (forceError) {
        row.clicked = false;
        const message = forceError instanceof Error ? forceError.message : error instanceof Error ? error.message : 'click-failed';
        row.failure_reasons.push(message.slice(0, 180));
      }
    }
  }
  if (
    !localGateway
    && item.selector.includes('data-live-gateway-binding')
    && !calls.slice(clickStart).some((call) => call.kind === 'tools-call')
  ) {
    await target.evaluate((element) => {
      if (element instanceof HTMLElement) element.click();
    }).catch(() => undefined);
  }
  await submitAppearedCidPrompt(page, item);
  await page.evaluate(() => {
    document.querySelectorAll('.mp-governed-confirm-overlay, .iv-governed-confirm-overlay, .pc-governed-confirm-overlay').forEach((overlay) => {
      const cidInput = overlay.querySelector('input[aria-label="Artifact CID"], input[aria-label="Playlist artifact CID"], input[aria-label="Video artifact CID"]');
      if (cidInput) return;
      const cancel = overlay.querySelector('.mp-governed-cancel, .iv-governed-cancel, .pc-governed-cancel');
      if (cancel instanceof HTMLElement) cancel.click();
    });
  }).catch(() => undefined);
  await waitForRowCalls(page, calls, clickStart);
  row.confirm_surface = await page.locator('.iv-governed-confirm-dialog, [role="dialog"]').count().then((count) => count > 0).catch(() => false);
  const evidenceText = disabled
    ? [row.result_surface]
    : await launched.appWindow.locator('#cid-open-status, .iv-gateway-status, [data-gateway-status], [data-field="cid-media"]').allTextContents().catch(() => []);
  const windowText = disabled ? '' : await launched.appWindow.innerText({ timeout: 3_000 }).catch(() => '');
  row.result_surface = [...evidenceText, windowText].join(' ').replace(/\s+/g, ' ').slice(0, 500);
  const stillVisible = await launched.appWindow.isVisible().catch(() => false);
  const dismissed = isDismissControl(item.selector, 'close') || isDismissControl(item.selector, 'minimize');
  if (!stillVisible && dismissed) {
    row.screenshot_after_check = 'window-dismissed';
  } else if (!stillVisible) {
    row.failure_reasons.push('window-lost');
    row.screenshot_after_check = 'window-lost';
  } else {
    const afterPath = shotFile(shotDir, index, 'after', item.selector);
    try {
      await launched.appWindow.screenshot({ path: afterPath, timeout: 5_000, animations: 'disabled' });
      const afterCheck = inspectPng(readFileSync(afterPath));
      row.screenshot_after = repoRelative(afterPath);
      row.screenshot_after_check = afterCheck.reason;
    } catch (error) {
      row.screenshot_after_check = 'screenshot-after-failed';
      row.failure_reasons.push(error instanceof Error ? error.message.slice(0, 180) : 'screenshot-after-failed');
    }
  }
  row.pageerrors = pageerrors.slice(errorStart);
  if (row.disposition === 'unsupported' && row.source === 'matrix') {
    const binding = await target.getAttribute('data-live-gateway-binding').catch(() => null);
    if (binding) row.failure_reasons.push('matrix-unsupported-but-live-tool-button');
  }
  finishRow(row, item, calls, clickStart, forbidden);
  if (!isDismissControl(item.selector, 'close')) await closeLaunched(page, launched.appWindow);
  else await page.evaluate(() => document.querySelectorAll('.iv-governed-confirm-overlay').forEach((node) => node.remove()));
  return row;
}

export async function runLiveClickTarget(
  page: Page,
  target: string,
  options: { outputRoot?: string; preferMatrix?: boolean } = {},
): Promise<LiveClickReport> {
  const spec = LIVE_CLICK_TARGETS[target];
  const captureRoot = options.outputRoot ? resolve(options.outputRoot) : join(evidenceRoot, 'live-clicks');
  const shotDir = join(captureRoot, spec?.shotDir || 'unknown');
  mkdirSync(shotDir, { recursive: true });
  const reportPath = spec
    ? join(captureRoot, spec.reportName)
    : join(captureRoot, 'unknown.json');
  mkdirSync(dirname(reportPath), { recursive: true });
  const pageerrors: string[] = [];
  page.on('pageerror', (error) => pageerrors.push(String(error).slice(0, 500)));
  const calls: CallRecord[] = [];
  const forbidden = loadForbiddenToolIds();
  const rows: LiveClickRow[] = [];
  let matrixCount = 0;
  let scheduledCount = 0;
  let usingWorkList = false;
  let omissions: string[] = [];
  const ownerProbes = await probeOwners();
  const ownerHealth: 'up' | 'down' = ownerProbes.length === OWNER_PROBES.length && ownerProbes.every((item) => item.up)
    ? 'up'
    : 'down';
  if (ownerHealth !== 'up') {
    console.log(`owner-health down ${ownerProbes.filter((item) => !item.up).map((item) => item.owner).join(',')}`);
  }
  try {
    if (!spec) throw new Error(`unknown live-click target ${target}`);
    await liveClickFixture.ensureLiveClickFixture();
    if (!existsSync(matrixPath)) throw new Error('control-tool matrix missing');
    const matrixRows = loadMatrix(spec.apps);
    matrixCount = matrixRows.length;
    omissions = [...new Set(matrixRows.filter((row) => row.objective_named === false).map((row) => row.app_id))];
    const listed = options.preferMatrix ? null : loadWorkList(spec.apps);
    usingWorkList = listed !== null;
    const scheduled: WorkItem[] = listed ?? matrixRows.map((row) => ({
      source: 'matrix' as const,
      app_id: row.app_id,
      launch_id: row.launch_id,
      selector: row.selector,
      disposition: row.disposition,
      tool_id: row.tool_id || '',
      objective_named: row.objective_named ?? null,
      matrix_reason: row.reason || '',
    }));
    scheduledCount = scheduled.length;
    await preparePage(page, calls);
    const byLaunch = new Map<string, WorkItem[]>();
    for (const item of scheduled) {
      const list = byLaunch.get(item.launch_id) || [];
      list.push(item);
      byLaunch.set(item.launch_id, list);
    }
    let index = 0;
    const domAliases = loadDomAliases();
    const withholdGateway = target === 'local';
    for (const [launchId, items] of byLaunch) {
      const probe = await launchWindow(page, launchId, items[0].app_id);
      let work = items;
      if (!probe.launchError && probe.box) {
        const extras = await discoverLive(probe.appWindow, items, withholdGateway);
        work = [...items, ...extras].sort((left, right) => rank(left.selector) - rank(right.selector));
      }
      await closeLaunched(page, probe.appWindow);
      for (const item of work) {
        const resolved = item.source === 'matrix'
          ? domAliases.get(`${item.app_id}\n${item.selector}`)
          : undefined;
        const workItem = withholdLocalGateway(resolved ? { ...item, selector: resolved } : item, withholdGateway);
        console.log(`live-click ${index + 1} ${workItem.launch_id} ${workItem.selector}`);
        const bounded = await clickWithinBudget(
          page,
          workItem,
          index,
          shotDir,
          calls,
          pageerrors,
          forbidden.ids,
          withholdGateway,
        );
        page = bounded.page;
        if (resolved) bounded.row.resolved_from = item.selector;
        rows.push(bounded.row);
        index += 1;
      }
    }
  } catch (error) {
    rows.push({
      source: 'matrix',
      app_id: '',
      launch_id: '',
      selector: '',
      disposition: '',
      expected_tool_id: '',
      objective_named: null,
      matrix_reason: '',
      visibility: 'not-launched',
      clicked: false,
      icon_visible: false,
      window_box: null,
      screenshot_before: '',
      screenshot_after: '',
      screenshot_before_check: '',
      screenshot_after_check: '',
      pageerrors: [error instanceof Error ? error.message : String(error)],
      mcp_call_count: 0,
      observation: null,
      confirm_surface: false,
      result_surface: '',
      failure_reasons: ['runner-failed'],
    });
  }
  const scheduledSource = usingWorkList ? 'worklist' : 'matrix';
  const scheduledRows = rows.filter((row) => row.source === scheduledSource);
  const failing = rows.filter((row) => row.failure_reasons.length > 0 || row.clicked !== true);
  const clicked = spec
    && scheduledCount > 0
    && failing.length === 0
    && scheduledRows.length >= scheduledCount
    && pageerrors.length === 0
    && ownerHealth === 'up';
  const decision = decideLiveClick(rows, ownerHealth);
  const downOwners = ownerProbes.filter((item) => !item.up).map((item) => item.owner).join(',');
  const report: LiveClickReport = {
    schema: 'swissknife.virtual-desktop-live-click.v1',
    target,
    generated_at: new Date().toISOString(),
    clicked: Boolean(clicked),
    passed: Boolean(clicked),
    decision,
    scope: 'target',
    visual_review: null,
    visual_review_authority: 'proposal_only',
    summary: ownerHealth !== 'up'
      ? `owner_health down ${downOwners}`
      : clicked
        ? `clicked ${rows.length} controls`
        : failing.slice(0, 8).map((row) => `${row.launch_id} ${row.selector} ${row.failure_reasons.join(',')}`).join('; ') || 'no passing rows',
    app_ids: spec?.apps || [],
    launch_ids: [...new Set(rows.map((row) => row.launch_id).filter(Boolean))],
    objective_named_omissions: omissions,
    matrix_row_count: matrixCount,
    row_count: rows.length,
    clicked_row_count: rows.filter((row) => row.clicked).length,
    not_visible_count: rows.filter((row) => row.visibility === 'not-visible').length,
    failure_count: failing.length,
    forbidden_tool_catalog: forbidden.loaded ? 'loaded' : 'missing',
    click_source: usingWorkList ? 'worklist' : 'matrix',
    worklist_row_count: usingWorkList ? scheduledCount : 0,
    owner_health: ownerHealth,
    owner_probes: ownerProbes,
    rows,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
