#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { captureAllToolsLedger } = require('./all-tools-evidence-lib.cjs');

const bootstrap = spawnSync(process.execPath, [path.join(__dirname, 'ensure-ipfs-mcp-compat-adapters.cjs')], {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
  env: process.env,
});

if (bootstrap.error) {
  console.error(bootstrap.error);
  process.exit(1);
}
if (bootstrap.status !== 0) process.exit(bootstrap.status ?? 1);

captureAllToolsLedger()
  .then(ledger => {
    console.log(JSON.stringify(ledger.summary, null, 2));
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
