import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, access, rm } from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createNativeKitForwarder, nativeKitCatalog } = require('../../scripts/ipfs-kit-native-forwarder.cjs');
const { cidForBytes, buildProfileAInterface } = require('../../scripts/mcpplusplus-profile-a.cjs');
const { GOVERNED_TOOL_DEFINITIONS } = require('../../scripts/ipfs-kit-governed-tools.cjs');
// Exact existing live-click SVG content; this authored upstream is a unit
// fixture, never native execution evidence or actual-app acceptance.
const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="96" viewBox="0 0 128 96"><rect width="128" height="96" fill="#15364d"/><circle cx="64" cy="48" r="28" fill="#e9bd58"/></svg>');
const cid = cidForBytes(bytes);
function success(tool = 'ipfs_cat') {
  const provenance = { schema: 'swissknife.native-kit-execution.v1', owner: 'ipfs_kit_py',
    sdk_class: 'ipfs_kit_py.assurance.pinned_ipfs.LivePinnedIpfsAdapter', sdk_method: tool === 'ipfs_add' ? 'add' : 'cat',
    sdk_source_sha256: '1'.repeat(64), sdk_request_id: 'unit-request', sdk_operation_id: 'unit-operation', simulated: false, cache_fallback: false };
  return { isError: false, content: [{ type: 'json', json: { success: true, cid, bytes_base64: bytes.toString('base64'),
    size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    backend: 'ipfs_kit_py.assurance.pinned_ipfs:live-kubo-http', native_provenance: provenance } }],
  receipt: { owner: 'ipfs_kit_py', tool, status: 'ok', native_provenance: provenance } };
}

async function fixture(t, respond = request => ({ jsonrpc: '2.0', id: request.id, result: success(request.params.name) }), settings = {}) {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    if (request.url === '/mcp/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', backend: 'native_python', simulated: false, cache_fallback: false })); return;
    }
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const rpc = JSON.parse(Buffer.concat(chunks).toString()); requests.push(rpc);
    const value = respond(rpc, response);
    if (value === undefined) return;
    if (response.headersSent) return;
    response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(value));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const endpoint = `http://127.0.0.1:${server.address().port}/mcp`;
  return { executor: createNativeKitForwarder({ endpoint, ...settings }), endpoint, requests };
}

test('known cached SVG CID still reaches the native upstream with exact policy arguments and bytes', async t => {
  const { executor, requests } = await fixture(t);
  const args = { cid, dry_run: false, correlation_id: 'unit-correlation', fixture_scope: 'unit-isolated' };
  const result = await executor.execute('ipfs_cat', args);
  assert.equal(result.ok, true); assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'tools/call');
  assert.deepEqual(requests[0].params, { name: 'ipfs_cat', arguments: args });
  assert.deepEqual(Buffer.from(result.result.bytes_base64, 'base64'), bytes);
  assert.equal(result.result.backend, 'ipfs_kit_py.assurance.pinned_ipfs:live-kubo-http');
  assert.equal(result.native_receipt.native_provenance.cache_fallback, false);
});

for (const [name, respond] of [
  ['HTTP failure', (rpc, res) => { res.writeHead(503); res.end('unavailable'); }],
  ['JSON-RPC error', rpc => ({ jsonrpc: '2.0', id: rpc.id, error: { code: -32601, message: 'not supported' } })],
  ['mismatched RPC identity', rpc => ({ jsonrpc: '2.0', id: 'another-request', result: success() })],
  ['native tool error', rpc => ({ jsonrpc: '2.0', id: rpc.id, result: { isError: true, content: [{ type: 'text', text: 'SDK failed' }] } })],
  ['disk output without native provenance', rpc => { const result = success(); result.content[0].json.backend = 'disk'; return { jsonrpc: '2.0', id: rpc.id, result }; }],
  ['simulated native provenance', rpc => { const result = success(); result.content[0].json.native_provenance.simulated = true; return { jsonrpc: '2.0', id: rpc.id, result }; }],
  ['wrong SDK method', rpc => { const result = success(); result.content[0].json.native_provenance.sdk_method = 'add'; return { jsonrpc: '2.0', id: rpc.id, result }; }],
  ['wrong owner receipt tool', rpc => { const result = success(); result.receipt.tool = 'ipfs_add'; return { jsonrpc: '2.0', id: rpc.id, result }; }],
  ['ambiguous semantic content', rpc => { const result = success(); result.content.push(result.content[0]); return { jsonrpc: '2.0', id: rpc.id, result }; }],
  ['corrupted base64 bytes', rpc => { const result = success(); result.content[0].json.bytes_base64 += 'junk'; return { jsonrpc: '2.0', id: rpc.id, result }; }],
]) test(`${name} stays an error with no successful cache fallback`, async t => {
  const { executor, requests } = await fixture(t, respond);
  const result = await executor.execute('ipfs_cat', { cid, dry_run: false });
  assert.equal(result.ok, false); assert.equal(typeof result.error, 'string');
  assert.equal(result.result, undefined); assert.equal(requests.length, 1);
});

test('unsupported native tool stays unsupported rather than using the legacy registry', async t => {
  const { executor, requests } = await fixture(t, rpc => ({ jsonrpc: '2.0', id: rpc.id, error: { code: -32601, message: 'unsupported' } }));
  assert.equal((await executor.execute('ipfs_ls', { cid })).ok, false);
  assert.equal(requests.length, 0, 'unsupported tools are refused before native dispatch');
});

test('add forwards exact byte payload and retains native add provenance', async t => {
  const { executor } = await fixture(t);
  const result = await executor.execute('ipfs_add', { bytes_base64: bytes.toString('base64'), dry_run: false });
  assert.equal(result.ok, true); assert.equal(result.native_receipt.native_provenance.sdk_method, 'add');
});

test('typed native tool errors retain only bounded sanitized cause and never successful output', async t => {
  const { executor } = await fixture(t, rpc => ({ jsonrpc: '2.0', id: rpc.id, result: { isError: true,
    content: [{ type: 'json', json: { success: false, code: 'INVALID_NATIVE_ARGUMENT', error_type: 'ValueError',
      error: 'unsupported native add args: unknown; Bearer PRIVATE_BEARER; "api_key": "PRIVATE KEY WITH SPACES"; https://user:PRIVATE_PASS@host/path /home/alice/private\nTraceback (most recent call last):\nPRIVATE_TRACE',
      traceback: 'PRIVATE_TRACE', payload: { private: 'RAW_PAYLOAD' }, authorization: 'PRIVATE_AUTH' } }] } }));
  const value = await executor.execute('ipfs_add', { unknown: true });
  assert.equal(value.ok, false);assert.equal(value.result, undefined);
  assert.equal(value.native_error.code, 'INVALID_NATIVE_ARGUMENT');assert.equal(value.native_error.type, 'ValueError');
  assert.match(value.native_error.message, /unsupported native add args/);
  assert.deepEqual(Object.keys(value.native_error).sort(), ['code','message','type']);
  assert.doesNotMatch(JSON.stringify(value), /PRIVATE_|PRIVATE KEY|RAW_PAYLOAD|Traceback|\/home\/alice/);
});

test('JSON-RPC and text-encoded native errors keep typed diagnostics without content dumps', async t => {
  for (const native of [
    { isError: true, content: [{type:'text',text:JSON.stringify({error:{code:-32602,type:'TypeError',message:'invalid native argument'},payload:'RAW_PAYLOAD'})}] },
    { isError: true, content: [{type:'text',text:'{"payload":"RAW_PAYLOAD'+ 'x'.repeat(9000)}] },
  ]) {
    const { executor } = await fixture(t, rpc => ({jsonrpc:'2.0',id:rpc.id,result:native}));
    const value=await executor.execute('ipfs_add',{});assert.equal(value.ok,false);
    assert.doesNotMatch(JSON.stringify(value), /RAW_PAYLOAD/);assert.ok(value.error.length<=2048);
    if (native.content[0].text.length<8192) assert.deepEqual(value.native_error,{message:'invalid native argument',code:-32602,type:'TypeError'});
  }
  const {executor}=await fixture(t,rpc=>({jsonrpc:'2.0',id:rpc.id,error:{code:-32602,message:'unsupported native add args'}}));
  assert.deepEqual((await executor.execute('ipfs_add',{})).native_error,{message:'unsupported native add args',code:-32602});
});

test('streamed oversized replies fail at the byte bound', async t => {
  const { executor } = await fixture(t, rpc => ({ jsonrpc: '2.0', id: rpc.id, result: success(), padding: 'x'.repeat(5000) }), { maxBytes: 2048 });
  const result = await executor.execute('ipfs_cat', { cid });
  assert.equal(result.ok, false); assert.match(result.error, /response_limit/);
});

test('hanging upstream is bounded and cannot fall back', async t => {
  const { executor } = await fixture(t, () => undefined, { timeoutMs: 40 });
  const result = await executor.execute('ipfs_cat', { cid });
  assert.equal(result.ok, false); assert.equal(result.result, undefined);
});

test('health reports the actual configured native target and its response', async t => {
  const { executor, endpoint } = await fixture(t);
  assert.equal(executor.endpoint, endpoint);
  assert.equal((await executor.health()).backend, 'native_python');
});

test('native upstream cannot use remote hosts, credentials, query strings, or redirects', () => {
  for (const endpoint of ['https://127.0.0.1:18314/mcp', 'http://example.com:18314/mcp', 'http://user:pass@127.0.0.1:18314/mcp', 'http://127.0.0.1:18314/mcp?fallback=cache']) {
    assert.throws(() => createNativeKitForwarder({ endpoint }), /loopback/);
  }
});

const nativeTools = [
  { name: 'ipfs_cat', description: 'Actual native byte read', inputSchema: { type: 'object', properties: { cid: { type: 'string' } }, required: ['cid'] } },
  { name: 'ipfs_add', description: 'Actual native byte write', inputSchema: { type: 'object', properties: { bytes_base64: { type: 'string' } } } },
];
const legacyTools = [
  ...['tools_list_categories', 'tools_list_tools', 'tools_get_schema', 'tools_dispatch'].map(name => ({ name, inputSchema: { type: 'object' } })),
  ...GOVERNED_TOOL_DEFINITIONS,
  ...['ipfs_cat', 'ipfs_add', 'ipfs_ls', 'pin_add', 'files_write', 'node_id'].map(name => ({ name, description: 'legacy-only capability', inputSchema: { type: 'object' } })),
];

test('strict discovery exposes actual native schemas and genuine Node controls, with matching Profile A methods/CID', async t => {
  const { executor, requests } = await fixture(t, rpc => ({ jsonrpc: '2.0', id: rpc.id, result: { tools: nativeTools } }));
  const discovered = await executor.listTools();
  assert.equal(requests[0].method, 'tools/list');
  const catalog = nativeKitCatalog(discovered, legacyTools);
  assert.deepEqual(catalog.filter(tool => tool.name.startsWith('ipfs_')).map(tool => tool.name), ['ipfs_cat', 'ipfs_add']);
  assert.deepEqual(catalog.find(tool => tool.name === 'ipfs_cat'), nativeTools[0]);
  assert.deepEqual(catalog.map(tool => tool.name).sort(), ['artifacts_get', 'artifacts_put', 'dag_append', 'dag_history',
    'ipfs_add', 'ipfs_cat', 'tools_dispatch', 'tools_get_schema', 'tools_list_categories', 'tools_list_tools']);
  const profileA = buildProfileAInterface('ipfs_kit_py', catalog);
  assert.deepEqual(profileA.descriptor.methods.map(method => method.name).sort(), catalog.map(tool => tool.name).sort());
  assert.equal(cidForBytes(Buffer.from(profileA.canonical_bytes_base64, 'base64')), profileA.interface_cid);
  assert.notEqual(profileA.interface_cid, buildProfileAInterface('ipfs_kit_py', legacyTools).interface_cid);
});

test('failed native discovery permits only Node controls and never restores legacy native capabilities', async t => {
  const { executor } = await fixture(t, (rpc, res) => { res.writeHead(503); res.end('unavailable'); });
  await assert.rejects(executor.listTools(), /native_kit_http_503/);
  const controls = nativeKitCatalog([], legacyTools);
  assert.equal(controls.length, 8);
  assert.equal(controls.some(tool => ['ipfs_cat', 'ipfs_add', 'ipfs_ls', 'pin_add', 'ipfs_pubsub_publish'].includes(tool.name)), false);
  assert.equal((await executor.execute('ipfs_cat', { cid })).ok, false);
});

test('strict native descriptors reject duplicate, malformed and unimplemented capabilities', async t => {
  for (const tools of [[nativeTools[0], nativeTools[0]], [{ name: 'ipfs_cat' }],
    [{ name: 'ipfs_ls', inputSchema: { type: 'object' } }], []]) {
    const { executor } = await fixture(t, rpc => ({ jsonrpc: '2.0', id: rpc.id, result: { tools } }));
    await assert.rejects(executor.listTools(), /native_kit_/);
  }
});

test('required native discovery failure exits the owned facade before listening or launching Python helpers', async t => {
  const { endpoint, requests } = await fixture(t, (rpc, response) => { response.writeHead(503); response.end('unit upstream unavailable'); });
  const reservation = http.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const root = await mkdtemp(path.join(tmpdir(), 'native-kit-required-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const python = path.join(root, 'python');
  const sentinel = path.join(root, 'python-called');
  await writeFile(python, '#!/bin/sh\nprintf called > "$SVF_UNIT_PYTHON_SENTINEL"\nprintf "[]\\n"\n', { mode: 0o700 });
  const child = spawn(process.execPath, [path.resolve('scripts/start-ipfs-kit-mcp-compat.cjs'), '--host', '127.0.0.1', '--port', String(port)], {
    env: { ...process.env, PYTHON: python, SVF_UNIT_PYTHON_SENTINEL: sentinel,
      SWISSKNIFE_KIT_NATIVE_MCP_URL: endpoint, SWISSKNIFE_KIT_REQUIRE_NATIVE_READY: '1',
      MCPPLUSPLUS_ARTIFACT_STORE_DIR: path.join(root, 'artifacts') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  let timeout;
  const result = await Promise.race([
    new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); }),
    new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('owned facade did not exit after native discovery failed')), 10000); }),
  ]).finally(() => clearTimeout(timeout));
  assert.equal(result.code, 1); assert.equal(result.signal, null);
  assert.match(output, /native_kit_required_catalog_unavailable: native_kit_http_503/);
  assert.doesNotMatch(output, /listening on|registered tool descriptors/);
  assert.equal(requests.length, 1); assert.equal(requests[0].method, 'tools/list');
  await assert.rejects(access(sentinel), { code: 'ENOENT' });
  await assert.rejects(fetch(`http://127.0.0.1:${port}/mcp/health`, { signal: AbortSignal.timeout(1000) }));
});

test('owned ephemeral facade preserves typed upstream isError for direct and dispatched calls', async t => {
  const { endpoint } = await fixture(t, rpc => ({jsonrpc:'2.0',id:rpc.id,result:rpc.method==='tools/list'
    ? {tools:nativeTools} : {isError:true,content:[{type:'json',json:{success:false,error:'unsupported native add args: invalid',
      error_type:'ValueError',code:'INVALID_NATIVE_ARGUMENT',traceback:'PRIVATE_TRACE',payload:'RAW_PAYLOAD'}}]}}));
  const reservation=http.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const directory=await mkdtemp(path.join(tmpdir(),'kit-typed-error-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const child=spawn(process.execPath,[path.resolve('scripts/start-ipfs-kit-mcp-compat.cjs'),'--host','127.0.0.1','--port',String(port)],{
    env:{...process.env,SWISSKNIFE_KIT_NATIVE_MCP_URL:endpoint,SWISSKNIFE_KIT_REQUIRE_NATIVE_READY:'1',
      MCPPLUSPLUS_ARTIFACT_STORE_DIR:path.join(directory,'artifacts')},stdio:['ignore','ignore','pipe']});
  let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});
  t.after(async()=>{if(child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}});
  const target=`http://127.0.0.1:${port}`;let ready=false;
  for(let i=0;i<100;i++){
    if(child.exitCode!==null)throw new Error('owned fixture facade exited: '+stderr.slice(-500));
    try{const response=await fetch(target+'/mcp/health',{signal:AbortSignal.timeout(250)});if(response.ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(ready,true);
  for(const params of [{name:'ipfs_add',arguments:{invalid:true}},
    {name:'tools_dispatch',arguments:{tool:'ipfs_add',params:{invalid:true}}}]){
    const response=await fetch(target+'/mcp',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:'typed-error-test',method:'tools/call',params}),signal:AbortSignal.timeout(2000)});
    const rpc=await response.json();assert.equal(rpc.result.isError,true);
    const error=rpc.result.content[0].json;assert.equal(error.success,false);
    assert.deepEqual(error.owner_error,{message:'unsupported native add args: invalid',code:'INVALID_NATIVE_ARGUMENT',type:'ValueError'});
    assert.equal(error.error_type,'ValueError');assert.equal(error.code,'INVALID_NATIVE_ARGUMENT');
    assert.doesNotMatch(JSON.stringify(rpc),/PRIVATE_TRACE|RAW_PAYLOAD/);
  }
});


function observedRead(name, peers = []) {
  const rows = peers === null ? [] : peers;
  const rawObservation = { Peers: peers };
  const { stableStringify: canonical } = require('../../scripts/mcpplusplus-profile-a.cjs');
  const observation = name === 'node_id'
    ? { ID: '12D3KooWAuthoredUnitIdentity1234567890', Addresses: ['/ip4/127.0.0.1/tcp/4001'], addresses_reported_null: false }
    : { Peers: rows, peer_count: rows.length, peers_reported_null: peers === null, raw_observation: rawObservation,
      raw_observation_canonical_sha256: createHash('sha256').update(Buffer.from(canonical(rawObservation))).digest('hex') };
  // Use the actual controller's canonical JSON function, including nested rows.
  const { stableStringify } = require('../../scripts/mcpplusplus-profile-a.cjs');
  const raw = Buffer.from(stableStringify(observation));
  const provenance = { schema: 'swissknife.native-kit-execution.v1', owner: 'ipfs_kit_py',
    sdk_class: 'ipfs_kit_py.assurance.pinned_ipfs.LivePinnedIpfsAdapter', sdk_method: name,
    sdk_source_sha256: '1'.repeat(64), sdk_request_id: 'unit-read-request', sdk_operation_id: 'unit-read-operation',
    simulated: false, cache_fallback: false, correlation_id: 'unit-observation', observed_at: new Date().toISOString(),
    payload_bytes: raw.length, payload_sha256: createHash('sha256').update(raw).digest('hex') };
  return { isError: false, content: [{ type: 'json', json: { ...observation, observation, success: true, tool: name,
    backend: 'ipfs_kit_py.assurance.pinned_ipfs:live-kubo-http', native_provenance: provenance } }],
    receipt: { owner: 'ipfs_kit_py', tool: name, status: 'ok', native_provenance: provenance } };
}
function readFixture(response) {
  const requests = [];
  const executor = createNativeKitForwarder({ endpoint: 'http://127.0.0.1:18314/mcp', fetchImpl: async (_url, options) => {
    const rpc = JSON.parse(options.body); requests.push(rpc);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: response(rpc) }), { headers: { 'content-type': 'application/json' } });
  } });
  return { executor, requests };
}
test('strict discovery advertises four actual native methods and no pubsub substitute', () => {
  const tools = ['node_id', 'swarm_peers', 'ipfs_cat', 'ipfs_add'].map(name => ({ name, inputSchema: { type: 'object' } }));
  const catalog = nativeKitCatalog(tools, GOVERNED_TOOL_DEFINITIONS);
  assert.ok(catalog.some(tool => tool.name === 'node_id'));assert.ok(catalog.some(tool => tool.name === 'swarm_peers'));
  assert.ok(!catalog.some(tool => tool.name === 'ipfs_pubsub_publish'));
  assert.throws(() => nativeKitCatalog([...tools, { name: 'ipfs_pubsub_publish', inputSchema: { type: 'object' } }], []));
});
for (const name of ['node_id', 'swarm_peers']) test(`${name} accepts only hash-bound actual native read observation and matching method receipt`, async () => {
  const { executor, requests } = readFixture(() => observedRead(name));
  const result = await executor.execute(name, { correlation_id: 'unit-observation', dry_run: false, cursor: 'desktop-read-only' });
  assert.equal(result.ok, true);assert.equal(requests.length, 1);assert.equal(result.native_receipt.tool, name);
  if (name === 'swarm_peers') { assert.deepEqual(result.result.Peers, []);assert.equal(result.result.peer_count, 0); }
  else assert.equal(result.result.ID, '12D3KooWAuthoredUnitIdentity1234567890');
});
test('observed peers remain exact actual records instead of seeded fixture peers', async () => {
  const peers = [{ Peer: '12D3KooWAuthoredUnitPeer12345678900000', Addr: '/ip4/127.0.0.1/tcp/4002' }];
  const { executor } = readFixture(() => observedRead('swarm_peers', peers));
  assert.deepEqual((await executor.execute('swarm_peers', { correlation_id: 'unit-observation' })).result.Peers, peers);
});
for (const [label, mutate] of [
  ['wrong method', value => { value.content[0].json.native_provenance.sdk_method = 'health'; }],
  ['changed native observation bytes', value => { value.content[0].json.observation.ID = '12D3KooWChangedAuthoredIdentity123456'; }],
  ['changed public identity only', value => { value.content[0].json.ID = '12D3KooWChangedAuthoredIdentity123456'; }],
  ['missing actual observation', value => { delete value.content[0].json.observation; }],
  ['stale observation timestamp', value => { value.content[0].json.native_provenance.observed_at = '2001-01-01T00:00:00Z'; }],
  ['mismatched correlation', value => { value.content[0].json.native_provenance.correlation_id = 'another-call'; }],
]) test(`identity ${label} cannot be promoted to a successful native read`, async () => {
  const { executor } = readFixture(() => { const result = observedRead('node_id');mutate(result);return result; });
  const result = await executor.execute('node_id', { correlation_id: 'unit-observation' });
  assert.equal(result.ok, false);assert.equal(result.result, undefined);
});
test('a peer count without an actual peer observation cannot become a healthy empty swarm', async () => {
  const { executor } = readFixture(() => { const value = observedRead('swarm_peers');value.content[0].json.peer_count = 9;return value; });
  assert.equal((await executor.execute('swarm_peers', {})).ok, false);
});
test('unsupported pubsub is rejected before any native call or fabricated delivery', async () => {
  const { executor, requests } = readFixture(() => observedRead('node_id'));
  const result = await executor.execute('ipfs_pubsub_publish', { content: 'not sent' });
  assert.equal(result.ok, false);assert.equal(requests.length, 0);assert.equal(result.result, undefined);
});

test('explicit native Kubo null remains a hash-bound genuine empty swarm through the strict facade', async () => {
  const { executor } = readFixture(() => observedRead('swarm_peers', null));
  const value = await executor.execute('swarm_peers', { correlation_id: 'unit-observation' });
  assert.equal(value.ok,true);assert.deepEqual(value.result.Peers,[]);assert.equal(value.result.peer_count,0);
  assert.equal(value.result.peers_reported_null,true);assert.deepEqual(value.result.raw_observation,{Peers:null});
  assert.equal(value.result.raw_observation_canonical_sha256,createHash('sha256').update('{"Peers":null}').digest('hex'));
});
for (const [name,change] of [
  ['missing raw Peers key',value=>{value.raw_observation={};}],
  ['false raw owner error',value=>{value.raw_observation={Peers:null,error:'actual owner failure'};}],
  ['inconsistent null marker',value=>{value.peers_reported_null=false;}],
  ['forged canonical raw hash',value=>{value.raw_observation_canonical_sha256='f'.repeat(64);}],
]) test(`strict facade rejects ${name} even with a valid outer observation hash`,async()=>{
  const {executor}=readFixture(()=>{
    const response=observedRead('swarm_peers',null),value=response.content[0].json;
    change(value);Object.assign(value.observation,{raw_observation:value.raw_observation,peers_reported_null:value.peers_reported_null,
      raw_observation_canonical_sha256:value.raw_observation_canonical_sha256});
    const {stableStringify}=require('../../scripts/mcpplusplus-profile-a.cjs');
    const bytes=Buffer.from(stableStringify(value.observation));value.native_provenance.payload_bytes=bytes.length;
    value.native_provenance.payload_sha256=createHash('sha256').update(bytes).digest('hex');return response;
  });
  assert.equal((await executor.execute('swarm_peers',{})).ok,false);
});
