import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const matrixPath = fileURLToPath(new URL(
  '../../test-results/virtual-desktop-ipfs-mcp-orb/control-tool-matrix.json',
  import.meta.url,
));

const DISPOSITIONS = new Set([
  'invoke',
  'confirm-then-invoke',
  'deny',
  'local-only',
  'external-provider',
  'unsupported',
]);

test('control tool matrix gives every control one disposition', () => {
  const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
  assert.equal(matrix.schema, 'swissknife.virtual-desktop-control-tool-matrix.v1');
  assert.equal(matrix.clicked, false);
  assert.ok(matrix.rows.length > 0);
  const seen = new Set();
  for (const row of matrix.rows) {
    assert.equal(DISPOSITIONS.has(row.disposition), true);
    assert.equal(typeof row.family, 'string');
    assert.ok(row.family.length > 0);
    assert.equal(row.clicked, false);
    const key = row.launch_id + '\t' + row.selector;
    assert.equal(seen.has(key), false);
    seen.add(key);
  }
  for (const appId of matrix.app_ids) {
    assert.equal(matrix.rows.some(row => row.app_id === appId), true);
  }
  for (const gap of matrix.uncovered_app_visible_tools) {
    assert.equal(gap.kind, 'uncovered-app-visible-tool');
  }
});
