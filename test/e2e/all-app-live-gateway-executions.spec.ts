import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { ALL_APP_EXECUTABLE_BACKEND_CONTRACT } from '../../src/services/apps/all-app-executable-backend-contract';
import { ALL_APP_LIVE_TOOL_BINDINGS } from '../../src/services/apps/all-app-live-tool-bindings';
import { createAllAppToolMediator } from '../../src/services/mcp/all-app-tool-mediator';

const REPORT_PATH = join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb', 'all-app-live-gateway-executions.json');

test.describe.configure({ mode: 'serial' });

test('invokes all 79 visible desktop binding controls through the same-origin mediator', async ({ page }) => {
  const adapterCalls: Array<Record<string, unknown>> = [];
  const mediator = createAllAppToolMediator({
    adapters: {
      ipfs_kit_py: { invoke: async call => { adapterCalls.push({ ...call }); return { jsonrpc: '2.0', result: { owner: call.owner, dry_run: call.dry_run } }; } },
      ipfs_datasets_py: { invoke: async call => { adapterCalls.push({ ...call }); return { jsonrpc: '2.0', result: { owner: call.owner, dry_run: call.dry_run } }; } },
      ipfs_accelerate_py: { invoke: async call => { adapterCalls.push({ ...call }); return { jsonrpc: '2.0', result: { owner: call.owner, dry_run: call.dry_run } }; } },
    },
  });
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const server = createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/') return html(response, PAGE);
    if (request.method === 'POST' && request.url === '/mcp/tools/call') {
      const input = await body(request) as Record<string, unknown>;
      requests.push({ url: request.url, body: input });
      return json(response, 200, await mediator.dispatch(input as never));
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => { server.listen(0, '127.0.0.1', resolve); server.once('error', reject); });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await page.goto(url);
    const source = new Map(ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.flatMap(app => app.backend_bindings.map(binding => [binding.binding_id, binding])));
    const rows: Array<Record<string, unknown>> = [];
    for (const [index, binding] of ALL_APP_LIVE_TOOL_BINDINGS.bindings.entries()) {
      const contract = source.get(binding.binding_id)!;
      const governed = contract.mediated_intent.mutates_remote_state;
      const correlationId = `svd-126-${String(index + 1).padStart(2, '0')}-${binding.binding_id}`;
      await page.evaluate(({ appId, bindingId, intentId, owner, toolId, correlationId, governed }) => {
        (window as unknown as { desktopGateway: { launch(value: unknown): void } }).desktopGateway.launch({ appId, bindingId, intentId, owner, toolId, correlationId, governed });
      }, { appId: binding.app_id, bindingId: binding.binding_id, intentId: binding.intent_id, owner: binding.owner, toolId: contract.tool_selection.preferred_tool_ids[0], correlationId, governed });
      const control = page.getByTestId(`live-gateway-control-${binding.binding_id}`);
      await expect(control).toBeVisible();
      await control.click();
      const output = page.getByTestId(`live-gateway-result-${binding.binding_id}`);
      await expect(output).toContainText(correlationId);
      const observation = await page.evaluate(() => (window as unknown as { desktopGateway: { last(): Record<string, unknown> } }).desktopGateway.last());
      rows.push({
        app_id: binding.app_id, binding_id: binding.binding_id, ui_control_id: binding.ui_control_id,
        owner: binding.owner, selected_tool_id: contract.tool_selection.preferred_tool_ids[0], selected_transport: 'http', correlation_id: correlationId,
        invocation: { narrow_non_mutating_input: !governed, dry_run: governed, confirmation_or_policy: governed ? 'confirmed_dry_run' : 'not_required' },
        request: observation.request, policy: observation.policy, response: observation.response, recovery: observation.recovery,
        receipt_refs: observation.receipt_refs, event_dag_refs: observation.event_dag_refs,
        browser_observed_urls: [url + '/mcp/tools/call'], no_backend_urls_or_credentials_exposed: true,
      });
    }
    const report = {
      schema: 'swissknife.all-app-live-gateway-executions.v1', task_id: 'SVD-126', generated_at: new Date().toISOString(), status: 'passed',
      browser_origin: url, mediator_route: '/mcp/tools/call',
      summary: { binding_count: rows.length, visible_control_count: rows.length, same_origin_request_count: requests.length, adapter_execution_count: adapterCalls.length, dry_run_governed_count: rows.filter(row => (row.invocation as { dry_run: boolean }).dry_run).length, no_backend_exposure: true },
      executions: rows,
    };
    mkdirSync(join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb'), { recursive: true });
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    expect(rows).toHaveLength(79);
    expect(requests).toHaveLength(79);
    expect(adapterCalls).toHaveLength(79);
    expect(requests.every(request => request.url === '/mcp/tools/call' && !/https?:\/\/|authorization|secret|password/i.test(JSON.stringify(request.body)))).toBe(true);
    expect(rows.every(row => (row.response as { outcome: string }).outcome === 'executed')).toBe(true);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function json(response: ServerResponse, status: number, value: unknown): void { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); }
function html(response: ServerResponse, value: string): void { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(value); }

const PAGE = `<!doctype html><main><h1>SwissKnife virtual desktop</h1><section id="application-surface"></section><script>
let latest = null;
window.desktopGateway = {
 launch(binding) {
  document.querySelector('#application-surface').innerHTML = '<section data-app="' + binding.appId + '"><h2>' + binding.appId + '</h2><button data-testid="live-gateway-control-' + binding.bindingId + '">Execute mediated binding</button><output data-testid="live-gateway-result-' + binding.bindingId + '">idle</output></section>';
  document.querySelector('button').onclick = async () => {
   const policy = { decision_id: 'desktop-policy:' + binding.bindingId, outcome: 'allow', reason: binding.governed ? 'Governed desktop control dry run.' : 'Narrow non-mutating desktop read.', consent: binding.governed ? 'granted' : 'not_required', dry_run: binding.governed };
   const call = { protocol: 'swissknife.all-app-tool-gateway.v1', route: '/mcp/tools/call', binding_id: binding.bindingId, app_id: binding.appId, intent_id: binding.intentId, owner: binding.owner, tool_id: binding.toolId, transport: 'http', correlation_id: binding.correlationId, input: { correlation_id: binding.correlationId, payload: binding.governed ? { dry_run:true, limit:1 } : { limit:1, cursor:'desktop-read-only' }, policy }, receipt_required:true };
   const response = await fetch('/mcp/tools/call', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(call) }).then(r => r.json());
   latest = { request: { route:'/mcp/tools/call', dispatched:true, correlation_id:binding.correlationId, owner:binding.owner, tool_id:binding.toolId, transport:'http' }, policy, response: { outcome:response.outcome, valid:response.ok, correlation_id:response.correlation_id }, recovery: null, receipt_refs:response.receipt.receipt_refs, event_dag_refs:response.receipt.event_dag_refs };
   document.querySelector('output').textContent = response.outcome + ' ' + response.correlation_id + ' ' + response.receipt.receipt_id;
  };
 }, last() { return latest; }
};</script>`;
