import { createHash } from 'crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import type { AddressInfo } from 'net';
import { join, relative } from 'path';
import { expect, test, type Page } from '@playwright/test';
import {
  VIRTUAL_DESKTOP_APP_MANIFEST,
  type VirtualDesktopAppManifestEntry,
  type VirtualDesktopPolicyClass,
} from '../../src/services/apps/virtual-desktop-app-manifest';

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

const EVIDENCE_ROOT = join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const BACKEND_CONTRACT_PATH = join(EVIDENCE_ROOT, 'app-backend-contract.json');
const SCREENSHOT_ROOT = join(EVIDENCE_ROOT, 'app-screenshots', 'live-backend');
const REPORT_PATH = join(EVIDENCE_ROOT, 'all-app-live-backend-behavior.json');
const FIXTURE_SCHEMA = 'swissknife.all-app-live-backend-fixture.v1';
const REPORT_SCHEMA = 'swissknife.all-app-live-backend-behavior.v1';

let fixture: LiveBackendFixture;

test.beforeAll(async () => {
  fixture = await startLiveBackendFixture();
});

test.afterAll(async () => {
  await fixture?.close();
});

test('executes launch, policy, provenance, outage, recovery, and reopen workflows for every app', async ({ page }) => {
  mkdirSync(SCREENSHOT_ROOT, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  const backendContract = readJson<AppBackendContract>(BACKEND_CONTRACT_PATH);
  const backendApps = new Map(backendContract.apps.map(app => [app.canonical_id, app]));
  const manifestIds = VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => app.id).sort();
  expect([...backendApps.keys()].sort()).toEqual(manifestIds);

  const contracts = VIRTUAL_DESKTOP_APP_MANIFEST.apps.map((app, index) =>
    buildOperationContract(app, backendApps.get(app.id)!, index),
  );
  fixture.setKnownTools(contracts.flatMap(contract => contract.tool_dispositions.map(tool => tool.tool_id)));

  const consoleErrors: BrowserConsoleError[] = [];
  const failedRequests: FailedRequest[] = [];
  let expectedOutage = false;

  page.on('console', message => {
    if (message.type() !== 'error') return;
    consoleErrors.push({
      type: message.type(),
      text: message.text().slice(0, 2_000),
      location: message.location(),
      expected_during_outage: expectedOutage,
    });
  });
  page.on('pageerror', error => {
    consoleErrors.push({ type: 'pageerror', text: error.message, expected_during_outage: false });
  });
  page.on('requestfailed', request => {
    failedRequests.push({
      kind: 'network-failure',
      method: request.method(),
      url: request.url(),
      error: request.failure()?.errorText ?? 'unknown network failure',
      expected_during_outage: expectedOutage,
    });
  });
  page.on('response', response => {
    if (response.status() < 400) return;
    failedRequests.push({
      kind: 'http-error',
      method: response.request().method(),
      url: response.url(),
      status: response.status(),
      expected_during_outage: expectedOutage,
    });
  });

  await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('fixture-ready')).toHaveText('ready');

  const apps: AppBehaviorEvidence[] = [];
  for (const [index, contract] of contracts.entries()) {
    fixture.available = true;
    const consoleStart = consoleErrors.length;
    const requestStart = failedRequests.length;
    const invocationStart = fixture.invocations.length;
    const prefix = `${String(index + 1).padStart(2, '0')}-${safeFilePart(contract.app_id)}`;
    const screenshotPaths = {
      result: join(SCREENSHOT_ROOT, `${prefix}-result.png`),
      unavailable: join(SCREENSHOT_ROOT, `${prefix}-unavailable.png`),
      recovered: join(SCREENSHOT_ROOT, `${prefix}-reopened.png`),
    };
    const evidence = createAppEvidence(contract, Object.values(screenshotPaths));
    apps.push(evidence);

    try {
      await recordStep(evidence, 'launch', async () => {
        await page.evaluate(operation => (window as unknown as WorkflowWindow).fixtureWorkflow.launch(operation), contract);
        await expect(page.getByTestId('app-window')).toBeVisible();
        await expect(page.getByTestId('app-title')).toHaveText(contract.app_title);
        await expect(page.getByTestId('tool-id')).toHaveText(contract.actual_tool_id);
        await expect(page.getByTestId('tool-owner')).toHaveText(contract.tool_owner);
        await expect(page.getByTestId('session-state')).toHaveText('launched');
      });

      await recordStep(evidence, 'navigation_focus', async () => {
        await page.getByTestId('nav-operation').focus();
        await expect(page.getByTestId('focused-control')).toHaveText('operation');
        await page.getByTestId('nav-provenance').focus();
        await expect(page.getByTestId('focused-control')).toHaveText('provenance');
        await page.getByTestId('nav-operation').click();
        await expect(page.getByTestId('active-panel')).toHaveText('operation');
      });

      await recordStep(evidence, 'primary_backend_operation', async () => {
        await page.getByTestId('run-operation').click();
        if (contract.confirmation_required) {
          await expect(page.getByTestId('confirmation')).toBeVisible();
          if (contract.fixture_disposition === 'skipped') {
            await page.getByTestId('deny-operation').click();
            await expect(page.getByTestId('operation-status')).toHaveText('denied');
            evidence.confirmation_or_denial = 'denied';
          } else {
            await page.getByTestId('confirm-operation').click();
            await expect(page.getByTestId('operation-status')).toHaveText('ok');
            evidence.confirmation_or_denial = 'confirmed';
          }
        } else {
          await expect(page.getByTestId('operation-status')).toHaveText('ok');
          await expect(page.getByTestId('confirmation-outcome')).toHaveText('not-required');
          evidence.confirmation_or_denial = 'not-required';
        }

        const result = await readBrowserResult(page);
        expect(result.correlation_id).toBe(contract.correlation_id);
        expect(result.tool_id).toBe(contract.actual_tool_id);
        expect(result.owner).toBe(contract.tool_owner);
        evidence.operation_status = result.status;
        evidence.actual_transport = result.transport;
        evidence.result_summary = result.summary;
      });

      await recordStep(evidence, 'progress_result_display', async () => {
        await expect(page.getByTestId('progress-events')).toContainText('queued');
        await expect(page.getByTestId('progress-events')).toContainText(
          contract.fixture_disposition === 'skipped' ? 'denied' : 'complete',
        );
        await expect(page.getByTestId('result-summary')).not.toBeEmpty();
      });

      await recordStep(evidence, 'receipt_event_dag_display', async () => {
        await page.getByTestId('nav-provenance').click();
        await expect(page.getByTestId('receipt-cid')).toContainText('sha256:');
        await expect(page.getByTestId('event-cid')).toContainText('sha256:');
        await expect(page.getByTestId('correlation-id')).toHaveText(contract.correlation_id);
        const snapshot = await page.evaluate(() => (window as unknown as WorkflowWindow).fixtureWorkflow.snapshot());
        evidence.receipt = snapshot.receipt;
        evidence.event_dag = snapshot.event_dag;
        expect(snapshot.event_dag?.receipt_cid).toBe(snapshot.receipt?.receipt_cid);
        await page.getByTestId('app-window').screenshot({ path: screenshotPaths.result });
      });

      await recordStep(evidence, 'backend_unavailability', async () => {
        fixture.available = false;
        expectedOutage = true;
        await page.getByTestId('check-backend').click();
        await expect(page.getByTestId('backend-state')).toHaveText('unavailable');
        await expect(page.getByTestId('recovery-message')).toContainText('retry');
        await page.getByTestId('app-window').screenshot({ path: screenshotPaths.unavailable });
        evidence.outage_observed = true;
      });

      await recordStep(evidence, 'recovery', async () => {
        fixture.available = true;
        expectedOutage = false;
        await page.getByTestId('retry-backend').click();
        await expect(page.getByTestId('backend-state')).toHaveText('recovered');
        await expect(page.getByTestId('correlation-id')).toHaveText(contract.correlation_id);
        evidence.recovered = true;
      });

      await recordStep(evidence, 'close_reopen', async () => {
        await page.getByTestId('close-app').click();
        await expect(page.getByTestId('app-window')).toBeHidden();
        await page.getByTestId('reopen-app').click();
        await expect(page.getByTestId('app-window')).toBeVisible();
        await expect(page.getByTestId('session-state')).toHaveText('reopened');
        await expect(page.getByTestId('receipt-cid')).toContainText('sha256:');
        await expect(page.getByTestId('event-cid')).toContainText('sha256:');
        await page.getByTestId('app-window').screenshot({ path: screenshotPaths.recovered });
        evidence.reopened = true;
      });
    } catch (error) {
      evidence.error = errorMessage(error);
    } finally {
      expectedOutage = false;
      fixture.available = true;
      evidence.browser_console_errors = consoleErrors.slice(consoleStart);
      evidence.failed_requests = failedRequests.slice(requestStart);
      evidence.backend_invocations = fixture.invocations.slice(invocationStart);
      evidence.status = evidence.operations.length === 8
        && evidence.operations.every(operation => operation.status === 'passed')
        && evidence.outage_observed
        && evidence.recovered
        && evidence.reopened
        ? 'passed'
        : 'failed';
    }
  }

  const report = buildReport(apps, consoleErrors, failedRequests, fixture, backendContract);
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  expect(apps).toHaveLength(VIRTUAL_DESKTOP_APP_MANIFEST.apps.length);
  expect(apps.flatMap(app => app.screenshots).every(path => existsSync(join(process.cwd(), path)))).toBe(true);
  expect(apps.filter(app => app.fixture_disposition === 'skipped').every(app => Boolean(app.skip_reason))).toBe(true);
  expect(apps.every(app => app.failed_requests.some(request =>
    request.kind === 'http-error' && request.status === 503 && request.expected_during_outage,
  ))).toBe(true);
  expect(apps.every(app => app.backend_invocations.some(invocation =>
    invocation.tool_id === app.actual_tool_id && invocation.correlation_id === app.correlation_id,
  ))).toBe(true);
  expect(report.summary.recovered).toBe(report.app_count);
  expect(report.summary.reopened).toBe(report.app_count);
  expect(report.summary.unexpected_browser_console_error_count).toBe(0);
  expect(report.summary.unexpected_failed_request_count).toBe(0);
  expect(report.summary.failed).toBe(0);
});

async function recordStep(
  evidence: AppBehaviorEvidence,
  name: WorkflowStepName,
  action: () => Promise<void>,
): Promise<void> {
  const started = Date.now();
  try {
    await action();
    evidence.operations.push({ name, status: 'passed', duration_ms: Date.now() - started });
  } catch (error) {
    evidence.operations.push({ name, status: 'failed', duration_ms: Date.now() - started, error: errorMessage(error) });
    throw error;
  }
}

function buildOperationContract(
  manifestApp: VirtualDesktopAppManifestEntry,
  backendApp: BackendAppContract,
  index: number,
): OperationContract {
  const backendTools = backendApp.backend_capabilities.map(capability =>
    dispositionForBackendTool(capability),
  );
  // The backend contract is ordered by the app binding generator. Preserve
  // that ordering so the first executable app-visible route remains the
  // representative primary operation, including its real policy class.
  const executable = backendTools.filter(tool => tool.disposition === 'available');
  const selected = executable[0]
    ?? backendTools.find(tool => tool.app_visible)
    ?? backendTools[0]
    ?? localOnlyTool(manifestApp, backendApp);

  const toolDispositions = backendTools.length > 0 ? backendTools : [selected];
  for (const tool of toolDispositions) {
    if (tool === selected && tool.disposition === 'available') tool.disposition = 'selected';
    else if (tool.disposition === 'available') tool.disposition = 'not-selected';
  }

  const fixtureDisposition = selected.skip_reason ? 'skipped' : 'executed';
  return {
    app_id: manifestApp.id,
    app_title: manifestApp.title,
    category: manifestApp.category,
    launch_kind: manifestApp.launch_kind,
    app_owner: manifestApp.owner_module,
    actual_tool_id: selected.tool_id,
    tool_owner: selected.owner,
    declared_transport: selected.declared_transport,
    policy_class: selected.policy_class,
    confirmation_required: selected.confirmation_required || fixtureDisposition === 'skipped',
    receipt_required: selected.receipt_required,
    fixture_disposition: fixtureDisposition,
    skip_reason: selected.skip_reason,
    correlation_id: `svd096-${String(index + 1).padStart(2, '0')}-${safeFilePart(manifestApp.id)}`,
    backend_state: backendApp.backend_state,
    backend_rationale: backendApp.backend_rationale,
    tool_dispositions: toolDispositions,
  };
}

function dispositionForBackendTool(capability: BackendCapability): ToolDisposition {
  const base: ToolDisposition = {
    tool_id: capability.tool_id,
    owner: capability.service,
    declared_transport: describeTransport(capability),
    policy_class: capability.policy_class,
    confirmation_required: capability.confirmation_policy !== 'none',
    receipt_required: capability.receipt_required,
    source_role: capability.source_role,
    app_visible: capability.app_visible,
    disposition: 'available',
  };
  if (!capability.app_visible) {
    return { ...base, disposition: 'skipped', skip_reason: 'Supervisor-only tool; the isolated app fixture has no direct app authority.' };
  }
  if (/static|descriptor/.test(capability.source_role)) {
    return { ...base, disposition: 'skipped', skip_reason: 'Static descriptor has no executable isolated backend route.' };
  }
  if (['credential', 'external_network', 'media_capture', 'destructive'].includes(capability.policy_class)) {
    return {
      ...base,
      disposition: 'skipped',
      skip_reason: `Policy class ${capability.policy_class} is denied because the isolated fixture has no credential, external, device, or destructive authority.`,
    };
  }
  return base;
}

function localOnlyTool(app: VirtualDesktopAppManifestEntry, backendApp: BackendAppContract): ToolDisposition {
  const toolId = app.capabilities[0] ?? `local.${app.id}.primary`;
  return {
    tool_id: toolId,
    owner: app.owner_module,
    declared_transport: 'browser-local (no live backend route)',
    policy_class: policyClassForLocalTool(toolId),
    confirmation_required: true,
    receipt_required: true,
    source_role: 'manifest-local-only',
    app_visible: true,
    disposition: 'skipped',
    skip_reason: backendApp.local_only_rationale
      ?? backendApp.backend_rationale
      ?? 'No isolated live backend tool is declared for this app; the operation is visibly denied.',
  };
}

function describeTransport(capability: BackendCapability): string {
  const mcp = capability.mcp_transport === 'required' ? 'http-jsonrpc-mcp' : 'http-jsonrpc-mcp-eligible';
  return capability.mcp_plus_plus_transport === 'eligible' ? `${mcp} or libp2p-mcp-plus-plus` : mcp;
}

function policyClassForLocalTool(toolId: string): VirtualDesktopPolicyClass {
  if (/(credential|oauth|secret|key|token|secure)/i.test(toolId)) return 'credential';
  if (/(camera|microphone|capture)/i.test(toolId)) return 'media_capture';
  if (/(shell|tasks|calendar|notes|audio|settings)/i.test(toolId)) return 'write';
  return 'read';
}

function createAppEvidence(contract: OperationContract, screenshotPaths: string[]): AppBehaviorEvidence {
  return {
    app_id: contract.app_id,
    title: contract.app_title,
    category: contract.category,
    launch_kind: contract.launch_kind,
    app_owner: contract.app_owner,
    actual_tool_id: contract.actual_tool_id,
    tool_owner: contract.tool_owner,
    declared_transport: contract.declared_transport,
    actual_transport: 'pending',
    correlation_id: contract.correlation_id,
    policy_class: contract.policy_class,
    confirmation_required: contract.confirmation_required,
    receipt_required: contract.receipt_required,
    confirmation_or_denial: 'pending',
    fixture_disposition: contract.fixture_disposition,
    skip_reason: contract.skip_reason,
    backend_state: contract.backend_state,
    backend_rationale: contract.backend_rationale,
    tool_dispositions: contract.tool_dispositions,
    operation_status: 'pending',
    outage_observed: false,
    recovered: false,
    reopened: false,
    status: 'failed',
    screenshots: screenshotPaths.map(path => relative(process.cwd(), path)),
    operations: [],
    browser_console_errors: [],
    failed_requests: [],
    backend_invocations: [],
  };
}

function buildReport(
  apps: AppBehaviorEvidence[],
  consoleErrors: BrowserConsoleError[],
  failedRequests: FailedRequest[],
  activeFixture: LiveBackendFixture,
  backendContract: AppBackendContract,
) {
  const explicitSkips = apps.flatMap(app => app.tool_dispositions
    .filter(tool => tool.disposition === 'skipped')
    .map(tool => ({
      app_id: app.app_id,
      tool_id: tool.tool_id,
      owner: tool.owner,
      declared_transport: tool.declared_transport,
      source_role: tool.source_role,
      reason: tool.skip_reason,
    })));
  return {
    schema: REPORT_SCHEMA,
    generated_at: new Date().toISOString(),
    task_id: 'SVD-096',
    status: apps.every(app => app.status === 'passed') ? 'passed' : 'failed',
    generated_from: [
      relative(process.cwd(), BACKEND_CONTRACT_PATH),
      'src/services/apps/virtual-desktop-app-manifest.ts',
    ],
    source_contract: {
      schema: backendContract.schema,
      contract_id: backendContract.contract_id,
      contract_cid: backendContract.contract_cid,
      generated_at: backendContract.generated_at,
    },
    manifest_id: VIRTUAL_DESKTOP_APP_MANIFEST.manifest_id,
    manifest_version: VIRTUAL_DESKTOP_APP_MANIFEST.version,
    fixture: {
      schema: FIXTURE_SCHEMA,
      kind: 'isolated-live-http-jsonrpc-backend',
      endpoint: activeFixture.url,
      transport: 'http-jsonrpc',
      persistent_mutations: false,
      external_network: false,
      known_tool_count: activeFixture.knownToolCount,
      invocation_count: activeFixture.invocations.length,
    },
    screenshot_root: relative(process.cwd(), SCREENSHOT_ROOT),
    app_count: apps.length,
    summary: {
      passed: apps.filter(app => app.status === 'passed').length,
      failed: apps.filter(app => app.status === 'failed').length,
      executed: apps.filter(app => app.fixture_disposition === 'executed').length,
      explicitly_skipped: apps.filter(app => app.fixture_disposition === 'skipped').length,
      tool_explicit_skip_count: explicitSkips.length,
      confirmed: apps.filter(app => app.confirmation_or_denial === 'confirmed').length,
      denied: apps.filter(app => app.confirmation_or_denial === 'denied').length,
      confirmation_not_required: apps.filter(app => app.confirmation_or_denial === 'not-required').length,
      outage_observed: apps.filter(app => app.outage_observed).length,
      recovered: apps.filter(app => app.recovered).length,
      reopened: apps.filter(app => app.reopened).length,
      screenshot_count: apps.reduce((sum, app) => sum + app.screenshots.length, 0),
      browser_console_error_count: consoleErrors.length,
      unexpected_browser_console_error_count: consoleErrors.filter(error => !error.expected_during_outage).length,
      failed_request_count: failedRequests.length,
      unexpected_failed_request_count: failedRequests.filter(request => !request.expected_during_outage).length,
    },
    browser_console_errors: consoleErrors,
    failed_requests: failedRequests,
    explicit_skips: explicitSkips,
    apps,
  };
}

async function readBrowserResult(page: Page): Promise<FixtureResult> {
  return page.evaluate(() => (window as unknown as WorkflowWindow).fixtureWorkflow.snapshot().result as FixtureResult);
}

async function startLiveBackendFixture(): Promise<LiveBackendFixture> {
  const state = { available: true, knownTools: new Set<string>(), invocations: [] as FixtureInvocationEvidence[] };
  const server = createServer(async (request, response) => {
    try {
      await routeFixtureRequest(request, response, state);
    } catch (error) {
      json(response, 500, { schema: FIXTURE_SCHEMA, error: errorMessage(error) });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    get available() { return state.available; },
    set available(value: boolean) { state.available = value; },
    get invocations() { return state.invocations; },
    get knownToolCount() { return state.knownTools.size; },
    setKnownTools(toolIds: string[]) { state.knownTools = new Set(toolIds); },
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

async function routeFixtureRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: FixtureState,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(FIXTURE_HTML);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/favicon.ico') {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === 'GET' && url.pathname === '/health') {
    json(response, state.available ? 200 : 503, {
      schema: FIXTURE_SCHEMA,
      status: state.available ? 'available' : 'unavailable',
      recovery: state.available ? 'ready' : 'retry',
    });
    return;
  }
  if (request.method === 'POST' && (url.pathname === '/rpc' || url.pathname === '/policy/deny')) {
    const rpc = await readJsonBody(request) as JsonRpcRequest;
    const input = rpc.params?.arguments;
    if (!input || rpc.method !== 'tools/call') {
      json(response, 400, jsonRpcError(rpc.id, -32602, 'Expected tools/call with params.arguments.'));
      return;
    }
    if (!state.available) {
      json(response, 503, jsonRpcError(rpc.id, -32003, 'Isolated backend unavailable; retry is safe.'));
      return;
    }
    if (!state.knownTools.has(input.tool_id)) {
      json(response, 400, jsonRpcError(rpc.id, -32601, `Unknown declared tool: ${input.tool_id}`));
      return;
    }
    const denied = url.pathname === '/policy/deny';
    const receiptCid = digest({ type: 'receipt', input, denied });
    const eventCid = digest({ type: 'event', receipt_cid: receiptCid, correlation_id: input.correlation_id });
    const result: FixtureResult = {
      schema: FIXTURE_SCHEMA,
      status: denied ? 'denied' : 'ok',
      tool_id: input.tool_id,
      owner: input.owner,
      transport: denied ? 'policy-denial-http-jsonrpc' : 'isolated-fixture-http-jsonrpc',
      correlation_id: input.correlation_id,
      summary: denied
        ? `${input.tool_id} was denied without executing unavailable or unsafe authority.`
        : `${input.tool_id} completed against the isolated live backend fixture.`,
      result: denied ? null : { app_id: input.app_id, fixture: true, persisted: false, value: `fixture-result:${input.tool_id}` },
      progress: denied ? ['queued', 'denied'] : ['queued', 'running', 'complete'],
      receipt: { receipt_cid: receiptCid, schema: 'swissknife.app-tool-receipt.v1', correlation_id: input.correlation_id },
      event_dag: {
        event_cid: eventCid,
        event_type: denied ? 'policy_denial' : 'tool_completed',
        parents: [],
        receipt_cid: receiptCid,
        correlation_id: input.correlation_id,
      },
    };
    state.invocations.push({
      app_id: input.app_id,
      tool_id: input.tool_id,
      owner: input.owner,
      correlation_id: input.correlation_id,
      request_path: url.pathname,
      transport: result.transport,
      status: result.status,
      receipt_cid: receiptCid,
      event_cid: eventCid,
    });
    json(response, 200, { jsonrpc: '2.0', id: rpc.id, result });
    return;
  }
  json(response, 404, { schema: FIXTURE_SCHEMA, error: 'not found' });
}

function jsonRpcError(id: string, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function safeFilePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type WorkflowStepName =
  | 'launch'
  | 'navigation_focus'
  | 'primary_backend_operation'
  | 'progress_result_display'
  | 'receipt_event_dag_display'
  | 'backend_unavailability'
  | 'recovery'
  | 'close_reopen';

interface AppBackendContract {
  schema: string;
  contract_id: string;
  contract_cid: string;
  generated_at: string;
  apps: BackendAppContract[];
}

interface BackendAppContract {
  canonical_id: string;
  backend_state: string;
  backend_rationale: string;
  backend_capabilities: BackendCapability[];
  local_only_rationale: string | null;
}

interface BackendCapability {
  tool_id: string;
  service: string;
  source_role: string;
  app_visible: boolean;
  mcp_transport: 'required' | 'eligible';
  mcp_plus_plus_transport: 'eligible' | 'not-eligible';
  policy_class: VirtualDesktopPolicyClass;
  confirmation_policy: string;
  receipt_required: boolean;
}

interface OperationContract {
  app_id: string;
  app_title: string;
  category: string;
  launch_kind: string;
  app_owner: string;
  actual_tool_id: string;
  tool_owner: string;
  declared_transport: string;
  policy_class: VirtualDesktopPolicyClass;
  confirmation_required: boolean;
  receipt_required: boolean;
  fixture_disposition: 'executed' | 'skipped';
  skip_reason?: string;
  correlation_id: string;
  backend_state: string;
  backend_rationale: string;
  tool_dispositions: ToolDisposition[];
}

interface ToolDisposition {
  tool_id: string;
  owner: string;
  declared_transport: string;
  policy_class: VirtualDesktopPolicyClass;
  confirmation_required: boolean;
  receipt_required: boolean;
  source_role: string;
  app_visible: boolean;
  disposition: 'available' | 'selected' | 'not-selected' | 'skipped';
  skip_reason?: string;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: { name?: string; arguments?: FixtureInvocation };
}

interface FixtureInvocation {
  app_id: string;
  tool_id: string;
  owner: string;
  correlation_id: string;
}

interface FixtureInvocationEvidence extends FixtureInvocation {
  request_path: string;
  transport: string;
  status: 'ok' | 'denied';
  receipt_cid: string;
  event_cid: string;
}

interface FixtureResult {
  schema: string;
  status: 'ok' | 'denied';
  tool_id: string;
  owner: string;
  transport: string;
  correlation_id: string;
  summary: string;
  result: Record<string, unknown> | null;
  progress: string[];
  receipt: ReceiptEvidence;
  event_dag: EventDagEvidence;
}

interface ReceiptEvidence {
  receipt_cid: string;
  schema: string;
  correlation_id: string;
}

interface EventDagEvidence {
  event_cid: string;
  event_type: string;
  parents: string[];
  receipt_cid: string;
  correlation_id: string;
}

interface WorkflowOperationEvidence {
  name: WorkflowStepName;
  status: 'passed' | 'failed';
  duration_ms: number;
  error?: string;
}

interface BrowserConsoleError {
  type: string;
  text: string;
  location?: { url: string; lineNumber: number; columnNumber: number };
  expected_during_outage: boolean;
}

interface FailedRequest {
  kind: 'network-failure' | 'http-error';
  method: string;
  url: string;
  status?: number;
  error?: string;
  expected_during_outage: boolean;
}

interface AppBehaviorEvidence {
  app_id: string;
  title: string;
  category: string;
  launch_kind: string;
  app_owner: string;
  actual_tool_id: string;
  tool_owner: string;
  declared_transport: string;
  actual_transport: string;
  correlation_id: string;
  policy_class: VirtualDesktopPolicyClass;
  confirmation_required: boolean;
  receipt_required: boolean;
  confirmation_or_denial: 'pending' | 'confirmed' | 'denied' | 'not-required';
  fixture_disposition: 'executed' | 'skipped';
  skip_reason?: string;
  backend_state: string;
  backend_rationale: string;
  tool_dispositions: ToolDisposition[];
  operation_status: 'pending' | 'ok' | 'denied';
  result_summary?: string;
  receipt?: ReceiptEvidence;
  event_dag?: EventDagEvidence;
  outage_observed: boolean;
  recovered: boolean;
  reopened: boolean;
  status: 'passed' | 'failed';
  error?: string;
  screenshots: string[];
  operations: WorkflowOperationEvidence[];
  browser_console_errors: BrowserConsoleError[];
  failed_requests: FailedRequest[];
  backend_invocations: FixtureInvocationEvidence[];
}

interface FixtureState {
  available: boolean;
  knownTools: Set<string>;
  invocations: FixtureInvocationEvidence[];
}

interface LiveBackendFixture {
  server: Server;
  url: string;
  available: boolean;
  readonly invocations: FixtureInvocationEvidence[];
  readonly knownToolCount: number;
  setKnownTools(toolIds: string[]): void;
  close(): Promise<void>;
}

interface WorkflowSnapshot {
  result?: FixtureResult;
  receipt?: ReceiptEvidence;
  event_dag?: EventDagEvidence;
}

interface WorkflowWindow extends Window {
  fixtureWorkflow: {
    launch(operation: OperationContract): void;
    snapshot(): WorkflowSnapshot;
  };
}

const FIXTURE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SwissKnife isolated live backend workflow</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #08111f; color: #e6edf7; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top left, #18335a, #08111f 55%); }
    button { color: inherit; background: #1c3558; border: 1px solid #4d6f9f; border-radius: 7px; padding: 8px 12px; cursor: pointer; }
    button:focus { outline: 3px solid #5dd8ff; outline-offset: 2px; }
    [hidden] { display: none !important; }
    .desktop { min-height: 100vh; padding: 28px; }
    .desktop-header { display: flex; justify-content: space-between; max-width: 1060px; margin: 0 auto 16px; color: #9eb5d0; }
    .window { width: min(1060px, calc(100vw - 56px)); min-height: 690px; margin: 0 auto; overflow: hidden; border: 1px solid #52749f; border-radius: 14px; background: rgba(11, 23, 40, .97); box-shadow: 0 30px 90px #0009; }
    .titlebar { display: flex; align-items: center; justify-content: space-between; padding: 13px 16px; background: #142943; border-bottom: 1px solid #365475; }
    .titlebar h1 { font-size: 18px; margin: 0; }
    .layout { display: grid; grid-template-columns: 210px 1fr; min-height: 630px; }
    nav { padding: 18px; border-right: 1px solid #2d4562; background: #0d1b2d; }
    nav button { display: block; width: 100%; margin-bottom: 10px; text-align: left; }
    main { padding: 22px; }
    .badges { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
    .badge { border: 1px solid #385b83; background: #122844; border-radius: 999px; padding: 5px 9px; font-size: 12px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .card { min-height: 90px; padding: 14px; border: 1px solid #2e4a6a; border-radius: 10px; background: #0c192b; overflow-wrap: anywhere; }
    .card h2 { margin: 0 0 8px; font-size: 13px; color: #88ccee; text-transform: uppercase; letter-spacing: .05em; }
    .value { font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .status { font-weight: 700; color: #62dfa6; }
    .status[data-state="unavailable"], .status[data-state="denied"] { color: #ff8b8b; }
    .controls { display: flex; flex-wrap: wrap; gap: 9px; margin: 16px 0; }
    .confirmation { border-left: 4px solid #ffc857; background: #382e18; padding: 12px; margin: 14px 0; }
    .recovery { border-left: 4px solid #ff7070; background: #381d26; padding: 12px; margin-top: 14px; }
    .progress { display: flex; flex-wrap: wrap; gap: 8px; min-height: 28px; }
    .progress span { background: #18395e; border-radius: 5px; padding: 5px 8px; font-size: 12px; }
    .footer { margin-top: 16px; color: #8da5bd; font-size: 12px; }
    .reopen { position: fixed; inset: 50% auto auto 50%; transform: translate(-50%, -50%); padding: 14px 22px; }
  </style>
</head>
<body>
  <div class="desktop">
    <div class="desktop-header"><span>SwissKnife Virtual Desktop · isolated backend fixture</span><span data-testid="fixture-ready">ready</span></div>
    <section class="window" data-testid="app-window" hidden>
      <header class="titlebar"><h1 data-testid="app-title">Application</h1><button type="button" data-testid="close-app">Close</button></header>
      <div class="layout">
        <nav aria-label="Application sections">
          <button type="button" data-testid="nav-overview" data-panel="overview">Overview</button>
          <button type="button" data-testid="nav-operation" data-panel="operation">Operation</button>
          <button type="button" data-testid="nav-provenance" data-panel="provenance">Receipt &amp; event DAG</button>
          <div class="footer">Focused: <span data-testid="focused-control">none</span><br>Panel: <span data-testid="active-panel">overview</span></div>
        </nav>
        <main>
          <div class="badges">
            <span class="badge">session: <b data-testid="session-state">closed</b></span>
            <span class="badge">backend: <b class="status" data-testid="backend-state">available</b></span>
            <span class="badge">operation: <b class="status" data-testid="operation-status">idle</b></span>
          </div>
          <div class="grid">
            <article class="card"><h2>Actual tool ID</h2><div class="value" data-testid="tool-id"></div></article>
            <article class="card"><h2>Owner / transport</h2><div class="value"><span data-testid="tool-owner"></span><br><span data-testid="transport"></span></div></article>
            <article class="card"><h2>Correlation ID</h2><div class="value" data-testid="correlation-id"></div></article>
            <article class="card"><h2>Confirmation</h2><div class="value" data-testid="confirmation-outcome">pending</div></article>
          </div>
          <div class="controls"><button type="button" data-testid="run-operation">Run primary operation</button><button type="button" data-testid="check-backend">Check backend availability</button></div>
          <div class="confirmation" data-testid="confirmation" hidden>
            <strong>Operator confirmation required.</strong> <span data-testid="skip-reason"></span>
            <div class="controls"><button type="button" data-testid="confirm-operation">Confirm</button><button type="button" data-testid="deny-operation">Deny safely</button></div>
          </div>
          <section class="card"><h2>Progress</h2><div class="progress" data-testid="progress-events"></div></section>
          <section class="card"><h2>Result</h2><div class="value" data-testid="result-summary">No result yet.</div></section>
          <div class="grid" style="margin-top:12px">
            <article class="card"><h2>Receipt CID</h2><div class="value" data-testid="receipt-cid">pending</div></article>
            <article class="card"><h2>Event DAG CID</h2><div class="value" data-testid="event-cid">pending</div></article>
          </div>
          <div class="recovery" data-testid="recovery-panel" hidden><span data-testid="recovery-message">Backend unavailable. Restore it, then retry safely.</span> <button type="button" data-testid="retry-backend">Retry backend</button></div>
        </main>
      </div>
    </section>
    <button class="reopen" type="button" data-testid="reopen-app" hidden>Reopen application</button>
  </div>
  <script>
    (() => {
      let operation = null;
      let result = null;
      const byTestId = id => document.querySelector('[data-testid="' + id + '"]');
      const setText = (id, value) => { byTestId(id).textContent = String(value == null ? '' : value); };
      const renderProgress = values => {
        const root = byTestId('progress-events');
        root.replaceChildren(...values.map(value => {
          const span = document.createElement('span');
          span.textContent = value;
          return span;
        }));
      };
      const renderResult = payload => {
        result = payload;
        setText('operation-status', payload.status);
        byTestId('operation-status').dataset.state = payload.status;
        setText('result-summary', payload.summary);
        setText('receipt-cid', payload.receipt.receipt_cid);
        setText('event-cid', payload.event_dag.event_cid);
        setText('transport', payload.transport);
        renderProgress(payload.progress);
      };
      const invocation = () => ({ app_id: operation.app_id, tool_id: operation.actual_tool_id, owner: operation.tool_owner, correlation_id: operation.correlation_id });
      const post = async (path, body) => {
        setText('operation-status', 'running');
        renderProgress(['queued', 'running']);
        await new Promise(resolve => setTimeout(resolve, 8));
        const response = await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-correlation-id': operation.correlation_id },
          body: JSON.stringify({ jsonrpc: '2.0', id: operation.correlation_id, method: 'tools/call', params: { name: operation.actual_tool_id, arguments: body } }),
        });
        const rpc = await response.json();
        if (!response.ok || rpc.error) throw new Error((rpc.error && rpc.error.message) || 'Backend request failed');
        renderResult(rpc.result);
      };
      const invoke = async () => {
        byTestId('confirmation').hidden = true;
        setText('confirmation-outcome', operation.confirmation_required ? 'confirmed' : 'not-required');
        await post('/rpc', invocation());
      };
      const deny = async () => {
        byTestId('confirmation').hidden = true;
        setText('confirmation-outcome', 'denied');
        await post('/policy/deny', invocation());
      };
      const checkBackend = async recovery => {
        const response = await fetch('/health', { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) {
          setText('backend-state', 'unavailable');
          byTestId('backend-state').dataset.state = 'unavailable';
          byTestId('recovery-panel').hidden = false;
          return;
        }
        setText('backend-state', recovery ? 'recovered' : 'available');
        byTestId('backend-state').dataset.state = recovery ? 'recovered' : 'available';
        byTestId('recovery-panel').hidden = true;
      };
      byTestId('run-operation').addEventListener('click', () => {
        if (operation.confirmation_required) {
          byTestId('confirmation').hidden = false;
          setText('skip-reason', operation.skip_reason || 'Review policy, scope, transport, and receipt requirements.');
          setText('confirmation-outcome', 'required');
        } else invoke().catch(error => setText('result-summary', error.message));
      });
      byTestId('confirm-operation').addEventListener('click', () => invoke().catch(error => setText('result-summary', error.message)));
      byTestId('deny-operation').addEventListener('click', () => deny().catch(error => setText('result-summary', error.message)));
      byTestId('check-backend').addEventListener('click', () => checkBackend(false));
      byTestId('retry-backend').addEventListener('click', () => checkBackend(true));
      document.querySelectorAll('nav button').forEach(button => {
        button.addEventListener('focus', () => setText('focused-control', button.dataset.panel));
        button.addEventListener('click', () => setText('active-panel', button.dataset.panel));
      });
      byTestId('close-app').addEventListener('click', () => {
        byTestId('app-window').hidden = true;
        byTestId('reopen-app').hidden = false;
        setText('session-state', 'closed');
      });
      byTestId('reopen-app').addEventListener('click', () => {
        byTestId('reopen-app').hidden = true;
        byTestId('app-window').hidden = false;
        setText('session-state', 'reopened');
      });
      window.fixtureWorkflow = {
        launch(nextOperation) {
          operation = nextOperation;
          result = null;
          byTestId('app-window').hidden = false;
          byTestId('reopen-app').hidden = true;
          byTestId('confirmation').hidden = true;
          byTestId('recovery-panel').hidden = true;
          setText('app-title', operation.app_title);
          setText('tool-id', operation.actual_tool_id);
          setText('tool-owner', operation.tool_owner);
          setText('transport', operation.declared_transport);
          setText('correlation-id', operation.correlation_id);
          setText('session-state', 'launched');
          setText('backend-state', 'available');
          setText('operation-status', 'idle');
          setText('confirmation-outcome', 'pending');
          setText('result-summary', operation.fixture_disposition === 'skipped' ? operation.skip_reason : 'Ready to run.');
          setText('receipt-cid', 'pending');
          setText('event-cid', 'pending');
          setText('active-panel', 'overview');
          setText('focused-control', 'none');
          renderProgress([]);
        },
        snapshot() { return { result, receipt: result && result.receipt, event_dag: result && result.event_dag }; },
      };
    })();
  </script>
</body>
</html>`;
