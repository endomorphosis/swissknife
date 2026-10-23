const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { checkCapture } = require('./check-vdg-capture.cjs');
const { captureInputFingerprint } = require('./vdg-capture-fingerprint.cjs');
const { FAMILIES } = require('./vdg-evidence.cjs');
const { canonicalSelector } = require('./vdg-capture-observations.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-acquisition-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const directory of ['vdg/connectors', 'vdg/runs']) fs.mkdirSync(path.join(root, directory), { recursive: true });
  const row = { app_id: 'notes', launch_id: 'notes', selector: '[data-action="open"]', family: 'vdg-datasets', clicked: true, failure_reasons: [] };
  fs.writeFileSync(path.join(root, 'control-tool-matrix.json'), JSON.stringify({ rows: [row] }));
  const report = { schema: 'swissknife.virtual-desktop-live-click.v1', target: 'datasets', generated_at: '2026-10-21T01:00:00Z', row_count: 1, rows: [row], decision: 'no_go', passed: false };
  const bytes = JSON.stringify(report);
  fs.writeFileSync(path.join(root, 'vdg/runs/datasets-http-test.json'), bytes);
  const run = { run_id: 'datasets-http-test', transport: 'http', report_path: 'vdg/runs/datasets-http-test.json', capture_complete: true,
    completed_at: '2026-10-21T01:00:01Z', input_fingerprint: captureInputFingerprint('vdg-datasets', 'http', { evidenceRoot: root, definition: FAMILIES['vdg-datasets'] }),
    report_sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  const manifest = { schema: 'swissknife.virtual-desktop-gui-mcp-connectors.v1', target: 'datasets', runs: [run] };
  const save = () => fs.writeFileSync(path.join(root, 'vdg/connectors/datasets.json'), JSON.stringify(manifest));
  save();
  return { root, row, report, run, manifest, save, check: () => checkCapture('vdg-datasets', 'http', { evidenceRoot: root }) };
}
test('positive acquisition preserves a real NO_GO acceptance result', t => {
  const f = fixture(t);
  assert.equal(f.check().capture_complete, true);
  assert.equal(f.check().acceptance_decision, 'no_go');
  assert.equal(f.check().completion_authority, false);
  assert.throws(() => checkCapture('vdg-datasets', 'http', { evidenceRoot: f.root, startedAfter: Date.parse('2026-10-21T01:00:02Z') }), /predates/);
});
test('rejects stale source binding, missing transport, fatal/incomplete report and hash tampering', t => {
  const f = fixture(t);
  for (const [key, value] of [['input_fingerprint', 'old'], ['transport', 'libp2p'], ['capture_complete', false], ['report_sha256', 'changed']]) {
    const saved = f.run[key]; f.run[key] = value; f.save(); assert.throws(f.check); f.run[key] = saved; f.save();
  }
  fs.appendFileSync(path.join(f.root, f.run.report_path), ' ');
  assert.throws(f.check, /hash/);
});
test('every declared control must be visited and quote differences retain identity', t => {
  const f = fixture(t);
  const filename = path.join(f.root, f.run.report_path);
  f.report.rows[0] = { ...f.row, selector: "[data-action='open']" };
  let bytes = JSON.stringify(f.report); fs.writeFileSync(filename, bytes); f.run.report_sha256 = crypto.createHash('sha256').update(bytes).digest('hex'); f.save();
  assert.equal(f.check().capture_complete, true);
  f.report.rows[0].selector = '#other';
  bytes = JSON.stringify(f.report); fs.writeFileSync(filename, bytes); f.run.report_sha256 = crypto.createHash('sha256').update(bytes).digest('hex'); f.save();
  assert.throws(f.check, /every declared control/);
});
test('canonical selector does not merge different names or different attributes', () => {
  assert.equal(canonicalSelector("button[data-action='open']"), 'button[data-action="open"]');
  assert.equal(canonicalSelector("[title='Bob\\\'s image']"), '[title="Bob\'s image"]');
  assert.notEqual(canonicalSelector('[data-action="open"]'), canonicalSelector('[aria-label="open"]'));
});
