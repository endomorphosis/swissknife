import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Exercise tampering, omitted controls/transports, forbidden calls, actual
// connector matching, and a complete positive fixture independently of the
// current production report's decision.
import '../../scripts/vdg-evidence.test.cjs';

test('published VDG coverage names evidence gaps and never grants completion authority', () => {
  const report = JSON.parse(fs.readFileSync(path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../test-results/virtual-desktop-ipfs-mcp-orb/gui-mcp-coverage.json',
  ), 'utf8'));
  assert.equal(report.schema, 'swissknife.virtual-desktop-gui-mcp-coverage.v1');
  assert.equal(report.families.length, 6);
  assert.equal(report.passed, report.decision === 'GO');
  assert.equal(report.work_complete, false);
  assert.equal(report.completion_authority, false);
  if (report.passed) {
    assert.equal(report.gaps.length, 0);
    assert.equal(report.families.every((family: { passed: boolean; clicked: boolean }) => family.passed && family.clicked), true);
  } else {
    assert.ok(report.gaps.length > 0);
    assert.ok(report.repair_tasks.length > 0);
  }
});
