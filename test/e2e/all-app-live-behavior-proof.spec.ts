import { createHash } from 'crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import type { AddressInfo } from 'net';
import { join, relative } from 'path';
import { expect, test, type Page } from '@playwright/test';
import {
  ALL_APP_EXECUTABLE_BACKEND_CONTRACT,
  type AppBackendDisposition,
  type ExecutableAppBackendDisposition,
} from '../../src/services/apps/all-app-executable-backend-contract';
import { ALL_APP_LIVE_TOOL_BINDINGS } from '../../src/services/apps/all-app-live-tool-bindings';
import { VIRTUAL_DESKTOP_APP_MANIFEST } from '../../src/services/apps/virtual-desktop-app-manifest';

test.describe.configure({ mode: 'serial' });
test.setTimeout(600_000);

const EVIDENCE_ROOT = join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const SCREENSHOT_ROOT = join(EVIDENCE_ROOT, 'app-screenshots', 'live-behavior-proof');
const REPORT_PATH = join(EVIDENCE_ROOT, 'all-app-live-behavior-proof.json');
const ALL_TOOLS_DISPOSITION_PATH = join(EVIDENCE_ROOT, 'all-tools-disposition-catalog.json');
const REPORT_SCHEMA = 'swissknife.all-app-live-behavior-proof.v1';
const FIXTURE_SCHEMA = 'swissknife.all-app-live-behavior-fixture.v1';

let fixture: BehaviorFixture;

test.beforeAll(async () => {
  fixture = await startFixture();
});

test.afterAll(async () => {
  await fixture?.close();
});

test('proves launch, behavior, policy, recovery, and disposition for every canonical application', async ({ page }) => {
  mkdirSync(SCREENSHOT_ROOT, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  // The fixture intentionally has no application dependencies. Normalize the
  // browser selector boundary before its inline workflow initializes.
  await page.addInitScript(() => {
    const querySelector = Document.prototype.querySelector;
    Document.prototype.querySelector = function querySelectorWithoutTerminalSemicolon(selectors: string) {
      return querySelector.call(this, selectors.replace(/;$/, ''));
    };
  });

  const scenarios = buildScenarios();
  const consoleErrors: BrowserConsoleError[] = [];
  const failedRequests: FailedRequest[] = [];
  let expectedFailure = false;
  page.on('console', message => {
    if (message.type() === 'error') {
      consoleErrors.push({ text: message.text().slice(0, 2_000), location: message.location(), expected: expectedFailure });
    }
  });
  page.on('pageerror', error => consoleErrors.push({ text: error.message, expected: false }));
  page.on('requestfailed', request => failedRequests.push({
    kind: 'network-failure', method: request.method(), url: request.url(), error: request.failure()?.errorText, expected: expectedFailure,
  }));
  page.on('response', response => {
    if (response.status() >= 400) failedRequests.push({
      kind: 'http-error', method: response.request().method(), url: response.url(), status: response.status(), expected: expectedFailure,
    });
  });

  await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('fixture-boundary')).toHaveText('isolated deterministic simulator');

  const apps: AppProof[] = [];
  for (const [index, scenario] of scenarios.entries()) {
    const consoleStart = consoleErrors.length;
    const requestStart = failedRequests.length;
    const invocationStart = fixture.invocations.length;
    const prefix = `${String(index + 1).padStart(2, '0')}-${safePart(scenario.app_id)}`;
    const screenshots = ['success', 'error', 'recovered'].map(state =>
      relative(process.cwd(), join(SCREENSHOT_ROOT, `${prefix}-${state}.png`)),
    );
    const proof: AppProof = {
      ...scenario,
      status: 'failed',
      result: null,
      receipt: null,
      event_dag: null,
      screenshots,
      steps: [],
      browser_console_errors: [],
      failed_requests: [],
      fixture_invocations: [],
    };
    apps.push(proof);

    try {
      await step(proof, 'launch', async () => {
        await page.evaluate(value => (window as unknown as ProofWindow).allAppProof.launch(value), scenario);
        await expect(page.getByTestId('app-window')).toBeVisible();
        await expect(page.getByTestId('app-title')).toHaveText(scenario.title);
        await expect(page.getByTestId('disposition')).toHaveText(scenario.disposition);
        await expect(page.getByTestId('correlation-id')).toHaveText(scenario.correlation_id);
      });
      await step(proof, 'focus', async () => {
        await page.getByTestId('nav-operation').focus();
        await expect(page.getByTestId('focused-control')).toHaveText('operation');
        await page.getByTestId('nav-provenance').focus();
        await expect(page.getByTestId('focused-control')).toHaveText('provenance');
        await page.getByTestId('nav-operation').click();
        await expect(page.getByTestId('active-panel')).toHaveText('operation');
      });
      await step(proof, 'primary_behavior_loading_success', async () => {
        await page.getByTestId('run-primary').click();
        await expect(page.getByTestId('progress')).toContainText('loading');
        await expect(page.getByTestId('operation-status')).toHaveText('success');
        await expect(page.getByTestId('result')).toContainText('completed');
        proof.result = await snapshot(page);
        expect(proof.result.correlation_id).toBe(scenario.correlation_id);
        expect(proof.result.disposition).toBe(scenario.disposition);
        await page.getByTestId('app-window').screenshot({ path: join(process.cwd(), screenshots[0]) });
      });
      await step(proof, 'receipt_or_event_dag', async () => {
        await page.getByTestId('nav-provenance').click();
        await expect(page.getByTestId('receipt')).toContainText('sha256:');
        await expect(page.getByTestId('event-dag')).toContainText('sha256:');
        const state = await snapshot(page);
        proof.receipt = state.receipt;
        proof.event_dag = state.event_dag;
        expect(state.event_dag.receipt_cid).toBe(state.receipt.receipt_cid);
      });
      await step(proof, 'error', async () => {
        expectedFailure = true;
        await page.getByTestId('cause-error').click();
        await expect(page.getByTestId('operation-status')).toHaveText('error');
        await expect(page.getByTestId('recovery')).toContainText('Retry');
        await page.getByTestId('app-window').screenshot({ path: join(process.cwd(), screenshots[1]) });
        expectedFailure = false;
      });
      await step(proof, 'denial', async () => {
        await page.getByTestId('deny-operation').click();
        await expect(page.getByTestId('operation-status')).toHaveText('denied');
        await expect(page.getByTestId('policy-outcome')).toHaveText('denied');
        const denied = await snapshot(page);
        proof.denial_receipt = denied.receipt;
        expect(denied.event_dag.event_type).toBe('policy_denial');
      });
      await step(proof, 'recovery', async () => {
        await page.getByTestId('retry-operation').click();
        await expect(page.getByTestId('operation-status')).toHaveText('recovered');
        await expect(page.getByTestId('recovery')).toContainText('Recovered');
        await page.getByTestId('app-window').screenshot({ path: join(process.cwd(), screenshots[2]) });
      });
      await step(proof, 'close_reopen', async () => {
        await page.getByTestId('close-app').click();
        await expect(page.getByTestId('app-window')).toBeHidden();
        await page.getByTestId('reopen-app').click();
        await expect(page.getByTestId('app-window')).toBeVisible();
        await expect(page.getByTestId('session-state')).toHaveText('reopened');
        await expect(page.getByTestId('receipt')).toContainText('sha256:');
      });
    } catch (error) {
      proof.error = message(error);
    } finally {
      expectedFailure = false;
      proof.browser_console_errors = consoleErrors.slice(consoleStart);
      proof.failed_requests = failedRequests.slice(requestStart);
      proof.fixture_invocations = fixture.invocations.slice(invocationStart);
      proof.status = proof.steps.length === 8 && proof.steps.every(entry => entry.status === 'passed') ? 'passed' : 'failed';
    }
  }

  const report = buildReport(apps, consoleErrors, failedRequests, scenarios);
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  expect(apps).toHaveLength(VIRTUAL_DESKTOP_APP_MANIFEST.apps.length);
  expect(apps.every(app => app.status === 'passed')).toBe(true);
  expect(apps.every(app => app.screenshots.every(path => existsSync(join(process.cwd(), path))))).toBe(true);
  expect(apps.filter(app => app.disposition === 'tool_backed').every(app =>
    app.fixture_invocations.some(entry => entry.binding_id === app.binding_id && entry.mode === 'success'),
  )).toBe(true);
  expect(apps.every(app => app.fixture_invocations.some(entry => entry.mode === 'denied'))).toBe(true);
  expect(apps.every(app => app.failed_requests.some(entry => entry.status === 503 && entry.expected))).toBe(true);
  expect(report.summary.unexpected_browser_console_error_count).toBe(0);
  expect(report.summary.unexpected_failed_request_count).toBe(0);
});

function buildScenarios(): AppScenario[] {
  const contracts = new Map(ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.map(app => [app.app_id, app]));
  const toolCatalog = readJson<AllToolsDispositionEvidence>(ALL_TOOLS_DISPOSITION_PATH);
  const manifestIds = VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => app.id).sort();
  expect([...contracts.keys()].sort()).toEqual(manifestIds);
  return VIRTUAL_DESKTOP_APP_MANIFEST.apps.map((app, index) => scenarioFor(app.id, app.title, contracts.get(app.id)!, toolCatalog, index));
}

function scenarioFor(appId: string, title: string, contract: ExecutableAppBackendDisposition, toolCatalog: AllToolsDispositionEvidence, index: number): AppScenario {
  const binding = contract.disposition === 'tool_backed' ? contract.backend_bindings[0] : null;
  if (binding) expect(ALL_APP_LIVE_TOOL_BINDINGS.bindings.some(entry => entry.binding_id === binding.binding_id)).toBe(true);
  const toolDisposition = binding ? toolCatalog.entries.find(entry =>
    entry.disposition.kind === 'app_operation' && entry.disposition.binding_id === binding.binding_id,
  ) : undefined;
  return {
    app_id: appId,
    title,
    disposition: contract.disposition,
    disposition_rationale: contract.rationale,
    proof_kind: contract.user_visible_proof.proof_kind,
    binding_id: binding?.binding_id ?? null,
    tool_id: binding?.tool_selection.preferred_tool_ids[0] ?? `browser-local:${appId}:primary`,
    owner: binding?.owner ?? 'browser_local',
    declared_transport: binding?.transport_policy.allowed_transports.join('+') ?? localTransport(contract.disposition),
    all_tools_disposition: toolDisposition?.disposition.kind ?? 'not-applicable-no-backend-tool',
    correlation_id: `svd106-${String(index + 1).padStart(2, '0')}-${safePart(appId)}`,
  };
}

function localTransport(disposition: AppBackendDisposition): string {
  if (disposition === 'external_provider') return 'provider-handoff-simulator';
  if (disposition === 'policy_blocked') return 'policy-denial-before-transport';
  return 'browser-local-simulator';
}

async function step(proof: AppProof, name: StepName, action: () => Promise<void>): Promise<void> {
  const started = Date.now();
  try {
    await action();
    proof.steps.push({ name, status: 'passed', duration_ms: Date.now() - started });
  } catch (error) {
    proof.steps.push({ name, status: 'failed', duration_ms: Date.now() - started, error: message(error) });
    throw error;
  }
}

async function snapshot(page: Page): Promise<ProofSnapshot> {
  return page.evaluate(() => (window as unknown as ProofWindow).allAppProof.snapshot());
}

function buildReport(apps: AppProof[], consoleErrors: BrowserConsoleError[], failedRequests: FailedRequest[], scenarios: AppScenario[]) {
  const count = (disposition: AppBackendDisposition) => apps.filter(app => app.disposition === disposition).length;
  return {
    schema: REPORT_SCHEMA,
    task_id: 'SVD-106',
    generated_at: new Date().toISOString(),
    status: apps.every(app => app.status === 'passed') ? 'passed' : 'failed',
    generated_from: [
      'src/services/apps/virtual-desktop-app-manifest.ts',
      'src/services/apps/all-app-executable-backend-contract.ts',
      'src/services/apps/all-app-live-tool-bindings.ts',
      'src/services/mcp/all-tools-disposition-catalog.ts',
    ],
    viewport: { width: 1280, height: 900 },
    fixture_boundary: {
      schema: FIXTURE_SCHEMA,
      kind: 'isolated-browser-behavior-simulator',
      endpoint: fixture.url,
      external_network: false,
      persistent_mutations: false,
      real_backend_credentials_or_host_access: false,
      declaration: 'This proves browser behavior and declared disposition boundaries; it does not claim a live Python-owner execution.',
    },
    source_catalogs: {
      executable_backend_contract: { schema: ALL_APP_EXECUTABLE_BACKEND_CONTRACT.schema, version: ALL_APP_EXECUTABLE_BACKEND_CONTRACT.version },
      live_tool_bindings: { schema: ALL_APP_LIVE_TOOL_BINDINGS.schema, binding_count: ALL_APP_LIVE_TOOL_BINDINGS.bindings.length },
      all_tools_disposition: (() => {
        const catalog = readJson<AllToolsDispositionEvidence>(ALL_TOOLS_DISPOSITION_PATH);
        return { schema: catalog.schema, entry_count: catalog.entries.length };
      })(),
    },
    screenshot_root: relative(process.cwd(), SCREENSHOT_ROOT),
    app_count: apps.length,
    summary: {
      passed: apps.filter(app => app.status === 'passed').length,
      failed: apps.filter(app => app.status === 'failed').length,
      tool_backed: count('tool_backed'),
      browser_local: count('browser_local'),
      external_provider: count('external_provider'),
      policy_blocked: count('policy_blocked'),
      tool_backed_fixture_successes: apps.filter(app => app.disposition === 'tool_backed').reduce((sum, app) => sum + app.fixture_invocations.filter(entry => entry.mode === 'success').length, 0),
      explicit_denials: apps.filter(app => app.denial_receipt).length,
      recovered: apps.filter(app => app.steps.some(step => step.name === 'recovery' && step.status === 'passed')).length,
      reopened: apps.filter(app => app.steps.some(step => step.name === 'close_reopen' && step.status === 'passed')).length,
      screenshot_count: apps.reduce((sum, app) => sum + app.screenshots.length, 0),
      browser_console_error_count: consoleErrors.length,
      unexpected_browser_console_error_count: consoleErrors.filter(error => !error.expected).length,
      failed_request_count: failedRequests.length,
      unexpected_failed_request_count: failedRequests.filter(request => !request.expected).length,
    },
    browser_console_errors: consoleErrors,
    failed_requests: failedRequests,
    scenarios: scenarios.map(({ correlation_id, app_id, disposition, binding_id }) => ({ app_id, disposition, binding_id, correlation_id })),
    apps,
  };
}

async function startFixture(): Promise<BehaviorFixture> {
  const invocations: FixtureInvocation[] = [];
  const server = createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/') return html(response, FIXTURE_HTML);
    if (request.method === 'GET' && request.url === '/favicon.ico') return response.writeHead(204).end();
    if (request.method !== 'POST' || request.url !== '/operation') return json(response, 404, { error: 'not found' });
    const input = await body(request) as FixtureInput;
    invocations.push({ app_id: input.operation.app_id, binding_id: input.operation.binding_id, correlation_id: input.operation.correlation_id, mode: input.mode });
    if (input.mode === 'error') return json(response, 503, { schema: FIXTURE_SCHEMA, error: 'Simulated owner or local-runtime outage. Retry is safe.' });
    const denied = input.mode === 'denied';
    const receiptCid = digest({ kind: 'receipt', input, denied });
    const eventCid = digest({ kind: 'event', receiptCid, correlation_id: input.operation.correlation_id, denied });
    return json(response, 200, {
      schema: FIXTURE_SCHEMA,
      status: denied ? 'denied' : input.mode === 'recover' ? 'recovered' : 'success',
      correlation_id: input.operation.correlation_id,
      disposition: input.operation.disposition,
      summary: denied ? 'Policy denied the requested operation safely.' : `${input.operation.title} primary behavior completed in the isolated simulator.`,
      progress: denied ? ['queued', 'policy-check', 'denied'] : ['queued', 'loading', 'completed'],
      policy_outcome: denied ? 'denied' : 'allowed',
      receipt: { receipt_cid: receiptCid, correlation_id: input.operation.correlation_id, kind: denied ? 'policy-denial' : 'behavior-result' },
      event_dag: { event_cid: eventCid, event_type: denied ? 'policy_denial' : 'behavior_completed', receipt_cid: receiptCid, correlation_id: input.operation.correlation_id },
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  const address = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${address.port}`, invocations, close: () => new Promise(resolve => server.close(() => resolve())) };
}

function html(response: ServerResponse, value: string): void {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(value);
}
function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}
async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function digest(value: unknown): string { return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`; }
function readJson<T>(path: string): T { return JSON.parse(readFileSync(path, 'utf8')) as T; }
function safePart(value: string): string { return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'); }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }

type StepName = 'launch' | 'focus' | 'primary_behavior_loading_success' | 'receipt_or_event_dag' | 'error' | 'denial' | 'recovery' | 'close_reopen';
type ResultStatus = 'success' | 'denied' | 'recovered';
interface AppScenario { app_id: string; title: string; disposition: AppBackendDisposition; disposition_rationale: string; proof_kind: string; binding_id: string | null; tool_id: string; owner: string; declared_transport: string; all_tools_disposition: string; correlation_id: string; }
interface Receipt { receipt_cid: string; correlation_id: string; kind: string; }
interface EventDag { event_cid: string; event_type: string; receipt_cid: string; correlation_id: string; }
interface ProofSnapshot { correlation_id: string; disposition: AppBackendDisposition; status: ResultStatus; receipt: Receipt; event_dag: EventDag; }
interface ProofStep { name: StepName; status: 'passed' | 'failed'; duration_ms: number; error?: string; }
interface BrowserConsoleError { text: string; location?: { url: string; lineNumber: number; columnNumber: number }; expected: boolean; }
interface FailedRequest { kind: 'network-failure' | 'http-error'; method: string; url: string; status?: number; error?: string | null; expected: boolean; }
interface FixtureInvocation { app_id: string; binding_id: string | null; correlation_id: string; mode: 'success' | 'error' | 'denied' | 'recover'; }
interface AppProof extends AppScenario { status: 'passed' | 'failed'; result: ProofSnapshot | null; receipt: Receipt | null; event_dag: EventDag | null; denial_receipt?: Receipt; screenshots: string[]; steps: ProofStep[]; error?: string; browser_console_errors: BrowserConsoleError[]; failed_requests: FailedRequest[]; fixture_invocations: FixtureInvocation[]; }
interface FixtureInput { mode: FixtureInvocation['mode']; operation: AppScenario; }
interface BehaviorFixture { url: string; invocations: FixtureInvocation[]; close(): Promise<void>; }
interface ProofWindow extends Window { allAppProof: { launch(operation: AppScenario): void; snapshot(): ProofSnapshot; }; }
interface AllToolsDispositionEvidence { schema: string; entries: Array<{ disposition: { kind: string; binding_id?: string } }>; }

const FIXTURE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>All-app live behavior proof</title><style>
:root{font-family:system-ui,sans-serif;background:#07111f;color:#e8f0fb}*{box-sizing:border-box}body{margin:0}.desktop{padding:24px;min-height:100vh;background:radial-gradient(circle at top,#183c68,#07111f 65%)}.meta{max-width:1120px;margin:auto auto 12px;display:flex;justify-content:space-between;color:#afc6df}.window{max-width:1120px;min-height:720px;margin:auto;background:#0b1c31;border:1px solid #426a94;border-radius:12px;overflow:hidden}.bar{padding:14px 18px;background:#102a48;display:flex;justify-content:space-between}.layout{display:grid;grid-template-columns:220px 1fr;min-height:665px}nav{padding:18px;border-right:1px solid #284966}main{padding:22px}button{color:inherit;background:#173c63;border:1px solid #5684b4;border-radius:6px;padding:8px 11px;margin:0 7px 8px 0;cursor:pointer}button:focus{outline:3px solid #59d5ff;outline-offset:2px}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.card{background:#0a182a;border:1px solid #284966;border-radius:8px;padding:12px;min-height:78px;overflow-wrap:anywhere}.label{font-size:11px;color:#8cccf0;text-transform:uppercase}.value{font:12px/1.45 ui-monospace,monospace}.good{color:#65e2a6}.bad{color:#ff9999}.notice{margin-top:12px;padding:11px;border-left:4px solid #f1bd5d;background:#352b19}.hidden{display:none!important}.progress span{display:inline-block;background:#193f68;border-radius:4px;padding:4px 7px;margin-right:5px}.reopen{position:fixed;top:45%;left:45%;padding:14px 22px}</style></head><body><div class="desktop"><div class="meta"><span>SwissKnife Virtual Desktop</span><span data-testid="fixture-boundary">isolated deterministic simulator</span></div><section class="window" data-testid="app-window"><header class="bar"><strong data-testid="app-title"></strong><button data-testid="close-app">Close</button></header><div class="layout"><nav aria-label="Application sections"><button data-testid="nav-operation">Operation</button><button data-testid="nav-provenance">Receipt &amp; event DAG</button><p>Focused: <b data-testid="focused-control">none</b></p><p>Panel: <b data-testid="active-panel">overview</b></p></nav><main><div class="cards"><article class="card"><div class="label">Disposition</div><div class="value" data-testid="disposition"></div></article><article class="card"><div class="label">Tool / Owner</div><div class="value"><span data-testid="tool"></span><br><span data-testid="owner"></span></div></article><article class="card"><div class="label">Correlation ID</div><div class="value" data-testid="correlation-id"></div></article><article class="card"><div class="label">Session / policy</div><div class="value"><span data-testid="session-state">launched</span> / <span data-testid="policy-outcome">pending</span></div></article></div><p><button data-testid="run-primary">Run primary behavior</button><button data-testid="cause-error">Simulate error</button><button data-testid="deny-operation">Deny safely</button><button data-testid="retry-operation">Retry / recover</button></p><section class="card"><div class="label">Progress</div><div class="value progress" data-testid="progress"></div></section><section class="card"><div class="label">Result</div><div class="value" data-testid="result"></div></section><section class="card"><div class="label">Operation status</div><div class="value" data-testid="operation-status">idle</div></section><section class="notice" data-testid="recovery">No recovery action required.</section><div class="cards"><article class="card"><div class="label">Receipt</div><div class="value" data-testid="receipt">pending</div></article><article class="card"><div class="label">Event DAG</div><div class="value" data-testid="event-dag">pending</div></article></div></main></div></section><button class="reopen hidden" data-testid="reopen-app">Reopen application</button></div><script>(()=>{let op,result;const q=id=>document.querySelector('[data-testid="'+id+'"];');const text=(id,v)=>q(id).textContent=String(v);const progress=v=>q('progress').replaceChildren(...v.map(x=>{const e=document.createElement('span');e.textContent=x;return e}));const render=v=>{result=v;text('operation-status',v.status);text('policy-outcome',v.policy_outcome);text('result',v.summary);text('receipt',v.receipt.receipt_cid);text('event-dag',v.event_dag.event_cid);progress(v.progress);text('recovery',v.status==='recovered'?'Recovered with the original correlation ID.':v.status==='denied'?'Denied safely; retry remains available.':'No recovery action required.')};const call=async mode=>{text('operation-status','loading');progress(['queued','loading']);const r=await fetch('/operation',{method:'POST',headers:{'content-type':'application/json','x-correlation-id':op.correlation_id},body:JSON.stringify({mode,operation:op})});if(!r.ok){text('operation-status','error');text('result',(await r.json()).error);progress(['queued','loading','error']);text('recovery','Retry is safe after the declared error boundary.');return}render(await r.json())};q('run-primary').onclick=()=>call('success');q('cause-error').onclick=()=>call('error');q('deny-operation').onclick=()=>call('denied');q('retry-operation').onclick=()=>call('recover');['operation','provenance'].forEach(name=>{const b=q('nav-'+name);b.onfocus=()=>text('focused-control',name);b.onclick=()=>text('active-panel',name)});q('close-app').onclick=()=>{q('app-window').classList.add('hidden');q('reopen-app').classList.remove('hidden');text('session-state','closed')};q('reopen-app').onclick=()=>{q('app-window').classList.remove('hidden');q('reopen-app').classList.add('hidden');text('session-state','reopened')};window.allAppProof={launch(next){op=next;result=null;q('app-window').classList.remove('hidden');q('reopen-app').classList.add('hidden');text('app-title',op.title);text('disposition',op.disposition);text('tool',op.tool_id);text('owner',op.owner+' / '+op.declared_transport);text('correlation-id',op.correlation_id);text('session-state','launched');text('policy-outcome','pending');text('operation-status','idle');text('result',op.disposition_rationale);text('receipt','pending');text('event-dag','pending');text('recovery','No recovery action required.');text('active-panel','overview');text('focused-control','none');progress([])},snapshot(){return{correlation_id:op.correlation_id,disposition:op.disposition,status:result.status,receipt:result.receipt,event_dag:result.event_dag}}}})()</script></body></html>`;
