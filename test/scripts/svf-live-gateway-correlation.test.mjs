// Authored DOM/HTTP observations test request wiring, never live delivery or consent.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Window } from 'happy-dom';

const swissknife = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const repository = resolve(process.env.SVF_FOUNDATION_REPOSITORY_ROOT || resolve(swissknife, '..'));
const gatewayPath = process.env.SVF_LIVE_GATEWAY_CANDIDATE || resolve(swissknife, 'web/js/live-tool-gateway.js');
const { invokeNativeTool } = await import(pathToFileURL(gatewayPath).href);
const ownerCorrelation = /^[A-Za-z0-9:_-]{1,128}$/;
const generated = [];
let fixtureOrdinal = 0;

function fixture(t, bindingId, { governed = false } = {}) {
  const names = ['window', 'document', 'CustomEvent', 'fetch', '__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__'];
  const saved = Object.fromEntries(names.map(name => [name, globalThis[name]]));
  const win = new Window({ url: 'http://localhost' });
  Object.assign(globalThis, { window: win, document: win.document, CustomEvent: win.CustomEvent });
  delete globalThis.__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__;
  const container = document.createElement('div'); document.body.append(container);
  const appId = `authored-correlation-${++fixtureOrdinal}`;
  const control = { app_id: appId, binding_id: bindingId, intent_id: bindingId,
    owner: 'ipfs_kit_py', selected_tool_id: 'ipfs_pubsub_publish', preferred_tool_ids: ['ipfs_pubsub_publish'],
    mutates_remote_state: governed, confirmation_required: governed, transport: 'http', transports: ['http'], status: 'available' };
  const calls = [], results = [], confirmations = [];
  container.addEventListener('swissknife:live-gateway-result', event => results.push(event.detail));
  container.addEventListener('swissknife:gateway-confirmation', event => confirmations.push(event.detail));
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith('/mcp/tools/bindings?')) return { ok: true, json: async () => ({ controls: [control] }) };
    if (url === '/mcp/tools/dispositions') return { ok: true, json: async () => ({ entries: [] }) };
    assert.equal(url, '/mcp/tools/call');
    const call = JSON.parse(options.body); calls.push(call); generated.push(call.correlation_id);
    return { ok: true, status: 200, json: async () => ({ ok: true, outcome: 'executed',
      correlation_id: call.correlation_id, result: { scope: 'authored wiring fixture' },
      receipt: { receipt_id: `authored-receipt:${call.correlation_id}`, correlation_id: call.correlation_id,
        event_dag_refs: [`authored-event:${call.correlation_id}`] } }) };
  };
  t.after(async () => {
    await win.happyDOM.abort();
    for (const name of names) saved[name] === undefined ? delete globalThis[name] : globalThis[name] = saved[name];
  });
  return { container, appId, bindingId, calls, results, confirmations,
    invoke: options => invokeNativeTool(container, appId, bindingId, options) };
}

test('dotted binding keeps its full identity and one owner-compatible correlation throughout the request/result', async t => {
  const id = 'p2p-chat-unified.ipfs_kit_py.exchange_peer_messages';
  const f = fixture(t, id);
  const payload = { correlation_id: 'caller-payload-must-not-replace-envelope', message: 'authored bytes' };
  const result = await f.invoke({ payload });
  assert.equal(f.calls.length, 1); const call = f.calls[0];
  assert.match(call.correlation_id, ownerCorrelation); assert.match(call.correlation_id, /^desktop:[0-9a-f-]{36}$/);
  assert.equal(call.binding_id, id); assert.equal(call.intent_id, id); assert.equal(call.app_id, f.appId);
  assert.equal(call.input.correlation_id, call.correlation_id); assert.deepEqual(call.input.payload, payload);
  assert.equal(result.correlation_id, call.correlation_id); assert.equal(result.receipt.correlation_id, call.correlation_id);
  assert.equal(f.results[0].call.correlation_id, call.correlation_id);
  assert.equal(f.results[0].result.receipt.event_dag_refs[0], `authored-event:${call.correlation_id}`);
  assert.match(f.container.querySelector('output').textContent, new RegExp(call.correlation_id));
});

test('long and non-ASCII binding identities remain intact while correlation length stays bounded', async t => {
  const id = `app.${'arbitrary.long.namespace.'.repeat(80)}工具`;
  const f = fixture(t, id); await f.invoke({ payload: { limit: 1 } });
  assert.equal(f.calls[0].binding_id, id); assert.equal(f.calls[0].intent_id, id);
  assert.match(f.calls[0].correlation_id, ownerCorrelation); assert.equal(f.calls[0].correlation_id.length, 44);
});

test('repeated operations on one binding receive distinct IDs without changing receipt joins', async t => {
  const f = fixture(t, 'app.owner.same.binding');
  for (let i = 0; i < 32; i++) await f.invoke({ payload: { i } });
  assert.equal(new Set(f.calls.map(call => call.correlation_id)).size, 32);
  for (const call of f.calls) { assert.match(call.correlation_id, ownerCorrelation); assert.equal(call.input.correlation_id, call.correlation_id); }
});

test('a governed execute request still refuses synthetic confirmation and cancellation dispatches nothing', async t => {
  const f = fixture(t, 'app.owner.governed.binding', { governed: true });
  const pending = f.invoke({ executionMode: 'execute', payload: { value: 'authored' } });
  await new Promise(resolve => setImmediate(resolve));
  const confirm = f.container.querySelector('[data-gateway-confirm]'); assert.ok(confirm);
  assert.equal(f.calls.length, 0); assert.match(f.confirmations[0].correlation_id, ownerCorrelation);
  confirm.click(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 0, 'a synthetic click must never authorize real execution');
  assert.ok(f.container.querySelector('[data-gateway-confirm]'));
  f.container.querySelector('[data-gateway-cancel]').click();
  assert.equal(await pending, null); assert.equal(f.calls.length, 0);
});

test('governed previews keep their original dry-run policy and exact confirmation correlation', async t => {
  const f = fixture(t, 'app.owner.preview.binding', { governed: true });
  const pending = f.invoke({ payload: { value: 'authored preview' } });
  await new Promise(resolve => setImmediate(resolve));
  f.container.querySelector('[data-gateway-confirm]').click(); await pending;
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].input.policy.dry_run, true);
  assert.equal(f.calls[0].correlation_id, f.confirmations[0].correlation_id);
});

test('the existing global preview override continues to win over execute mode', async t => {
  const f = fixture(t, 'app.owner.forced-preview.binding', { governed: true });
  globalThis.__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__ = true;
  const pending = f.invoke({ executionMode: 'execute', payload: { value: 'authored preview' } });
  await new Promise(resolve => setImmediate(resolve));
  f.container.querySelector('[data-gateway-confirm]').click(); await pending;
  assert.equal(f.calls[0].input.policy.dry_run, true); assert.match(f.calls[0].correlation_id, ownerCorrelation);
});

test('the unchanged actual pubsub input validator accepts generated IDs and rejects dotted/oversized/empty IDs', () => {
  assert.ok(generated.length >= 34);
  // Read/import only. This calls the pure argument validator; it never binds
  // or constructs an SDK, opens a DB, starts a child, or contacts an owner.
  const code = String.raw`from pathlib import Path
import json,os,sys
root=Path(sys.argv[1]);values=json.loads(sys.argv[2])
def audit(event,args):
 if event.startswith('socket.') or event in {'subprocess.Popen','os.system','os.fork','os.posix_spawn','os.mkdir','os.remove','os.rmdir','os.rename','os.chmod','os.symlink','os.link'}:raise AssertionError('pure input test refused '+event)
 if event=='open':
  _,mode,flags=args
  assert not (isinstance(mode,str) and any(flag in mode for flag in 'wax+')) and not (isinstance(flags,int) and flags&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC|os.O_APPEND)),'pure input test refused write'
sys.addaudithook(audit);sys.path.insert(0,str(root/'scripts/svf_backends'))
import native_pubsub_backend as backend
base={'fixture_scope':'svf-p2p-chat-g030','topic':'svf.pubsub.'+'a'*32,'message_id':'12345678-1234-4234-8234-123456789012','message':'authored argument bytes','dry_run':False}
for value in values:assert backend._validate({**base,'correlation_id':value},['svf-p2p-chat-g030'])[-1]==value
for value in ['desktop:app.owner.binding:123:abc','x'*129,'','nonascii:工具']:
 try:backend._validate({**base,'correlation_id':value},['svf-p2p-chat-g030'])
 except ValueError as error:assert str(error)=='pubsub_correlation_rejected',str(error)
 else:raise AssertionError('unsafe correlation unexpectedly admitted')
print(json.dumps({'generated_accepted':len(values),'invalid_rejected':4,'sdk_or_network_calls':0}))`;
  const result = spawnSync(resolve(repository, 'external/ipfs_datasets/.venv/bin/python'),
    ['-I', '-B', '-c', code, repository, JSON.stringify(generated)],
    { encoding: 'utf8', timeout: 10000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', IPFS_ACCEL_SKIP_CORE: '1' } });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout); assert.equal(report.generated_accepted, generated.length); assert.equal(report.invalid_rejected, 4);
  assert.match(readFileSync(resolve(repository, 'scripts/svf_backends/native_pubsub_backend.py'), 'utf8'), /pubsub_correlation_rejected/);
});
