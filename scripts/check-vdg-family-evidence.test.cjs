'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-strict-readonly-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const report = path.join(root, 'vdg/families/storage.json');
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, '{"diagnostic":"existing canonical family evidence must remain byte-identical"}\n');
  const env = { ...process.env, VDG_EVIDENCE_ROOT: root };
  const snapshot = () => {
    const result = [];
    const visit = directory => { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name), stat = fs.statSync(filename, { bigint: true });
      result.push([path.relative(root, filename), String(stat.mtimeNs), entry.isFile() ? crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex') : 'directory']);
      if (entry.isDirectory()) visit(filename);
    } };
    visit(root); return result;
  };
  return { root, report, env, snapshot };
}
function child(f, args) {
  return spawnSync(process.execPath, [path.join(__dirname, 'check-vdg-family-evidence.cjs'), ...args], {
    cwd: path.resolve(__dirname, '..'), env: f.env, encoding: 'utf8', timeout: 30_000,
  });
}

test('actual strict --check child preserves all canonical bytes and mtimes while retaining real NO_GO', t => {
  const f = fixture(t), before = f.snapshot();
  const result = child(f, ['vdg-storage', '--check']);
  assert.equal(result.status, 75, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.decision, 'no_go'); assert.equal(report.passed, false); assert.ok(report.gap_count > 0);
  assert.deepEqual(f.snapshot(), before);
});
test('normal strict producer still writes the complete current NO_GO family report', t => {
  const f = fixture(t), before = fs.readFileSync(f.report, 'utf8');
  const result = child(f, ['vdg-storage']);
  assert.equal(result.status, 75, result.stderr);
  assert.notEqual(fs.readFileSync(f.report, 'utf8'), before);
  const report = JSON.parse(fs.readFileSync(f.report, 'utf8'));
  assert.equal(report.family, 'vdg-storage'); assert.equal(report.decision, 'no_go');
  assert.equal(report.passed, false); assert.ok(report.gap_count > 0);
});
test('verify --check invokes the actual readonly strict child without a capture or report mutation', async t => {
  const f = fixture(t), before = f.snapshot();
  const { verifyFamily } = await import(pathToFileURL(path.join(__dirname, 'verify-vdg-family.mjs')).href);
  const calls = [];
  const result = await verifyFamily({ family: 'vdg-storage', check: true }, {
    env: f.env,
    runChild: async (executable, args) => {
      calls.push(args);
      const outcome = spawnSync(executable, args, { cwd: path.resolve(__dirname, '..'), env: f.env, encoding: 'utf8', timeout: 30_000 });
      return { status: outcome.status };
    },
  });
  assert.equal(result.exit_code, 75); assert.equal(result.strict_exit_code, 75);
  assert.equal(calls.length, 1); assert.ok(calls[0][0].endsWith('check-vdg-family-evidence.cjs'));
  assert.deepEqual(calls[0].slice(1), ['vdg-storage', '--check']);
  assert.deepEqual(f.snapshot(), before);
});
test('invalid strict child arguments fail before modifying canonical evidence', t => {
  const f = fixture(t), before = f.snapshot();
  for (const args of [['vdg-storage', '--typo'], ['vdg-storage', '--check', '--check'], ['not-a-family', '--check']]) {
    assert.equal(child(f, args).status, 2);
    assert.deepEqual(f.snapshot(), before);
  }
});
