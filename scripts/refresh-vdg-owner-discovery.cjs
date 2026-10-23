#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { OWNERS } = require('./vdg-current-binding-ledger.cjs');
const { writeAtomicJson } = require('./vdg-atomic-json.cjs');
const root = path.resolve(__dirname, '../test-results/virtual-desktop-ipfs-mcp-orb');
const defaults = { ipfs_kit_py: 18014, ipfs_datasets_py: 13002, ipfs_accelerate_py: 13003 };

async function discoverOwner(owner, endpoint, fetchImpl = fetch) {
  const tools = new Map();
  const cursors = new Set();
  let cursor;
  for (let page = 0; page < 100; page += 1) {
    const response = await fetchImpl(endpoint, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: `vdg-inventory-${owner}-${page}`, method: 'tools/list', params: cursor ? { cursor } : {} }),
      signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`${owner} tools/list HTTP ${response.status}`);
    const body = await response.json();
    const result = body.result || body;
    if (body.error || !Array.isArray(result.tools) || result.tools.some(tool => typeof tool.name !== 'string' || !tool.name.trim())) throw new Error(`${owner} tools/list returned an invalid page`);
    for (const tool of result.tools) {
      if (tools.has(tool.name)) throw new Error(`${owner} tools/list repeated exact name ${tool.name}`);
      tools.set(tool.name, tool);
    }
    cursor = result.nextCursor;
    if (cursor == null || cursor === '') {
      if (!tools.size) throw new Error(`${owner} tools/list returned no tools`);
      return { owner, endpoint, state: 'live-discovered', method: 'POST tools/list', page_count: page + 1,
        tools: [...tools.values()].sort((a, b) => a.name.localeCompare(b.name)) };
    }
    if (typeof cursor !== 'string' || cursors.has(cursor)) throw new Error(`${owner} tools/list cursor is invalid or repeated`);
    cursors.add(cursor);
  }
  throw new Error(`${owner} tools/list pagination exceeded its bound`);
}

async function main() {
  const evidenceRoot = path.resolve(process.env.VDG_EVIDENCE_ROOT || root);
  const historical = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'all-app-live-binding-gap-ledger.json'), 'utf8'));
  let historicalPath = historical.provenance?.adapter === 'vdg-current-exact-binding-ledger@1' ? historical.provenance.historical_path : null;
  let historicalBytes;
  if (historicalPath) {
    if (!/^vdg\/inventory\/history\/[a-f0-9]{64}\.json$/.test(historicalPath)) throw new Error('historical ledger archive path invalid');
    historicalBytes = fs.readFileSync(path.join(evidenceRoot, historicalPath));
  } else {
    historicalBytes = Buffer.from(`${JSON.stringify(historical, null, 2)}\n`);
    historicalPath = `vdg/inventory/history/${crypto.createHash('sha256').update(historicalBytes).digest('hex')}.json`;
  }
  const owners = await Promise.all(OWNERS.map(owner => {
    const variable = `SWISSKNIFE_${owner.toUpperCase().replace(/_PY$/, '')}_MCP_URL`;
    const endpoint = (process.env[variable] || `http://127.0.0.1:${defaults[owner]}/mcp`).replace(/\/api\/mcp\/status\/?$/, '/mcp').replace(/\/$/, '');
    return discoverOwner(owner, endpoint);
  }));
  fs.mkdirSync(path.dirname(path.join(evidenceRoot, historicalPath)), { recursive: true });
  if (!fs.existsSync(path.join(evidenceRoot, historicalPath))) fs.writeFileSync(path.join(evidenceRoot, historicalPath), historicalBytes, { flag: 'wx' });
  writeAtomicJson(path.join(evidenceRoot, 'vdg/inventory/owner-tools.json'), { schema: 'swissknife.vdg-owner-tools.v1',
    collected_at: new Date().toISOString(), historical_path: historicalPath, owners, execution_claim: false });
  console.log(JSON.stringify({ owners: owners.map(owner => ({ owner: owner.owner, tools: owner.tools.length })), historical_path: historicalPath, execution_claim: false }));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { discoverOwner, main };
