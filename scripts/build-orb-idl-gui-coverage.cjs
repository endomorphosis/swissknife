#!/usr/bin/env node
/**
 * Join the live-click target reports into one ORB/IDL GUI coverage file.
 * A missing target report is a hard failure. A present no_go report is written
 * and still exits 0. Closeout, not this script, withholds on no_go.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const evidence = path.join(root, 'swissknife', 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const targets = [
  ['pilot', 'live-clicks/pilot/image-viewer.json'],
  ['storage', 'live-clicks/storage.json'],
  ['datasets', 'live-clicks/datasets.json'],
  ['accelerate', 'live-clicks/accelerate.json'],
  ['network', 'live-clicks/network.json'],
  ['control', 'live-clicks/control.json'],
  ['local', 'live-clicks/local.json'],
];
const reports = [];
for (const [name, relative] of targets) {
  const file = path.join(evidence, relative);
  if (!fs.existsSync(file)) {
    console.error(`missing ${relative}`);
    process.exit(1);
  }
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`unreadable ${relative}: ${error.message}`);
    process.exit(1);
  }
  if (!payload || Array.isArray(payload) || typeof payload !== 'object'
      || payload.target !== name
      || !['GO', 'no_go'].includes(payload.decision)
      || typeof payload.clicked !== 'boolean'
      || typeof payload.passed !== 'boolean'
      || !Array.isArray(payload.rows)
      || !payload.rows.every((row) => row && !Array.isArray(row) && typeof row === 'object')
      || !Number.isInteger(payload.row_count)
      || payload.row_count !== payload.rows.length) {
    console.error(`malformed ${relative}: target, decision, booleans, or row count invalid`);
    process.exit(1);
  }
  if (payload.decision === 'GO') {
    if (!payload.clicked || !payload.passed) {
      console.error(`invalid GO ${relative}: clicked and passed must be true`);
      process.exit(1);
    }
    const kind = name === 'pilot' || name === 'local' ? name : 'family';
    const validation = spawnSync('python3', [
      path.join(__dirname, 'vog_live_click_requires_observation.py'), file, kind,
    ], { cwd: root, encoding: 'utf8', timeout: 30000 });
    if (validation.error || validation.status !== 0) {
      const reason = validation.error?.message || validation.stdout.trim() || validation.stderr.trim();
      console.error(`invalid GO ${relative}: ${reason}`);
      process.exit(1);
    }
  }
  reports.push({
    target: name,
    decision: payload.decision,
    clicked: payload.clicked,
    passed: payload.passed,
    row_count: payload.row_count,
  });
}
const go = reports.every((item) => item.decision === 'GO' && item.clicked && item.passed);
const coverage = {
  schema: 'swissknife.orb-idl-gui-coverage.v1',
  generated_at: new Date().toISOString(),
  decision: go ? 'GO' : 'no_go',
  passed: go,
  clicked: go,
  targets: reports,
  work_complete: false,
  completion_authority: false,
};
const outDir = path.join(evidence, 'vog');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'orb-idl-gui-coverage.json');
fs.writeFileSync(out, `${JSON.stringify(coverage, null, 2)}\n`);
console.log(JSON.stringify({ decision: coverage.decision, passed: coverage.passed, clicked: coverage.clicked }));
