import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  BASELINE_SCHEMA, CONTRACT_PATH, PROJECT_ROOT, VIEWPORTS,
  baselineRequestDecision, findBrowserOwners, loadCanonicalContracts, parseArguments,
  redactText, requestMetadata, validateBaselineEvidence, validateContracts,
} from '../../scripts/capture-visual-functional-baseline.mjs';

const canonical = loadCanonicalContracts();
const contracts = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
const clone = value => structuredClone(value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const validate = config => validateContracts(config, canonical.manifest, canonical.backend);

// Path-admission fixtures exercise filesystem identity only; they do not
// execute app source, launch a browser, or manufacture workflow evidence.
function regularContractSources(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svf-contract-source-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  for (const source of new Set(contracts.apps.flatMap(app => app.source_paths))) {
    const file = path.join(root, source);
    fs.mkdirSync(path.dirname(file), {recursive:true});
    fs.writeFileSync(file, 'Unit-only regular declared source fixture.\n');
  }
  validateContracts(contracts, canonical.manifest, canonical.backend, root);
  return root;
}

test('contract source admission rejects an in-tree launch symlink before capture', t => {
  const root = regularContractSources(t);
  const source = path.join(root, contracts.apps[0].source_paths[0]);
  const implementation = source + '.implementation';
  fs.renameSync(source, implementation);
  fs.symlinkSync(path.basename(implementation), source);
  assert.throws(() => validateContracts(contracts, canonical.manifest, canonical.backend, root),
    /symbolic source path/);
});

test('contract source admission rejects an alias to a file outside the declared root', t => {
  const root = regularContractSources(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'svf-outside-source-'));
  t.after(() => fs.rmSync(outside, {recursive:true, force:true}));
  const target = path.join(outside, 'external.js');
  fs.writeFileSync(target, 'External source must not be followed.\n');
  const source = path.join(root, contracts.apps[0].source_paths[0]);
  fs.unlinkSync(source); fs.symlinkSync(target, source);
  assert.throws(() => validateContracts(contracts, canonical.manifest, canonical.backend, root),
    /symbolic source path/);
});

test('contract source admission rejects a symlinked parent directory even for a regular leaf', t => {
  const root = regularContractSources(t);
  const parent = path.dirname(path.join(root, contracts.apps[0].source_paths[0]));
  const implementation = parent + '-implementation';
  fs.renameSync(parent, implementation);
  fs.symlinkSync(path.basename(implementation), parent, 'dir');
  assert.equal(fs.lstatSync(path.join(root, contracts.apps[0].source_paths[0])).isFile(), true,
    'a leaf-only check would silently follow this parent alias');
  assert.throws(() => validateContracts(contracts, canonical.manifest, canonical.backend, root),
    /symbolic source path/);
});

test('curated contracts exactly cover the current canonical apps and preserve local/external/credential boundaries', () => {
  validate(contracts);
  assert.deepEqual(contracts.apps.map(app => app.app_id), canonical.manifest.apps.map(app => app.id));
  const dispositions = contracts.apps.reduce((all, app) => {
    all[app.disposition] = (all[app.disposition] || 0) + 1;
    return all;
  }, {});
  assert.deepEqual(dispositions, { browser_local: 14, tool_backed: 28, external_provider: 2, policy_blocked: 1 });
  assert.equal(contracts.apps.filter(app => app.disposition !== 'tool_backed').every(app => app.backend_roles.length === 0), true);
  assert.equal(contracts.program.execution_plan, 'implementation_plan/docs/53-swissknife-visual-functional-mcplusplus.md');
});

for (const [label, mutate, expected] of [
  ['missing app', config => config.apps.pop(), /coverage/],
  ['duplicate alias pretending to be canonical', config => { config.apps[0] = clone(config.apps[1]); }, /duplicate/],
  ['local app promoted to remote', config => { config.apps.find(app => app.app_id === 'calculator').disposition = 'tool_backed'; }, /identity\/disposition/],
  ['missing semantic result', config => { config.apps[0].primary_workflow.expected_results = []; }, /semantic workflow/],
  ['receipt-only invented tool substitution', config => { config.apps.find(app => app.backend_roles.length).backend_roles[0].bindings[0].exact_tool_candidates = ['fabricated_success']; }, /undeclared backend/],
  ['mutation policy weakened to read', config => {
    const binding = config.apps.flatMap(app => app.backend_roles.flatMap(role => role.bindings)).find(item => item.mutates_remote_state);
    binding.policy_class = 'read'; binding.mutates_remote_state = false;
  }, /undeclared backend/],
  ['missing source path', config => { config.apps[0].source_paths[0] = 'web/js/apps/does-not-exist.js'; }, /ENOENT/],
  ['escaping artifact path', config => { config.apps[0].outputs.baseline = '../outside.json'; }, /output path/],
]) test(`contract validator rejects ${label}`, () => {
  const config = clone(contracts);
  mutate(config);
  assert.throws(() => validate(config), expected);
});

test('baseline request boundary allows same-origin discovery while rejecting writes, tools, private routes and external traffic', () => {
  const origin = 'http://127.0.0.1:3017';
  for (const url of [`${origin}/`, `${origin}/web/js/main-simple.js`, `${origin}/mcp/health`, `${origin}/mcp/manifest`]) {
    assert.equal(baselineRequestDecision(url, 'GET', origin).allow, true);
  }
  for (const [url, method] of [
    [`${origin}/mcp/tools/call`, 'POST'], [`${origin}/mcp/tools/call?name=delete`, 'GET'],
    [`${origin}/mcp/artifacts/example`, 'GET'], [`${origin}/mcp/dag/example`, 'GET'],
    [`${origin}/api/save`, 'PUT'], [`${origin}/api/save`, 'PATCH'], [`${origin}/api/save`, 'DELETE'],
    ['http://127.0.0.1:8014/mcp', 'GET'], ['https://provider.example/chat', 'POST'],
  ]) assert.equal(baselineRequestDecision(url, method, origin).allow, false, `${method} ${url}`);
  assert.equal(baselineRequestDecision('data:image/svg+xml,local', 'GET', origin).allow, true);
});

test('request evidence omits URL credentials/query and log redaction removes token values', () => {
  const metadata = requestMetadata('https://name:pass@example.test/mcp/health?api_key=private-token', 'GET', 'fetch', 'http://127.0.0.1:3017');
  assert.deepEqual(metadata, { method: 'GET', resource_type: 'fetch', origin: 'external', path: '/mcp/health' });
  const logged = redactText('Authorization=abc123 token status; Bearer xyz789; api_key=secret-value');
  for (const secret of ['abc123', 'xyz789', 'secret-value']) assert.equal(logged.includes(secret), false);
});

test('CLI scope and existing desktop URL are explicit; invalid/duplicate arguments fail before resource acquisition', () => {
  const settings = parseArguments(['--app', 'notes', '--output-dir', '/tmp/notes-baseline', '--desktop-url', 'http://127.0.0.1:3017/']);
  assert.equal(settings.appId, 'notes');
  assert.equal(settings.desktopUrl, 'http://127.0.0.1:3017/');
  for (const args of [[], ['--app', '../alias', '--output-dir', '/tmp/x'],
    ['--app', 'notes', '--app', 'clock', '--output-dir', '/tmp/x'],
    ['--app', 'notes', '--output-dir', '/tmp/x', '--desktop-url', 'http://user:secret@localhost/'],
    ['--app', 'notes', '--output-dir', '/tmp/x', '--desktop-url', 'http://localhost/?token=secret']]) {
    assert.throws(() => parseArguments(args));
  }
});

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'svf-baseline-proof-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const app = contracts.apps.find(item => item.app_id === 'calculator');
  const sourcePaths = [...new Set([...app.source_paths, 'web/js/main-simple.js', 'web/index.html', 'scripts/capture-visual-functional-baseline.mjs'])];
  // An existing tracked real screenshot supplies valid PNG bytes; no browser or
  // renderer is started by these adversarial evidence-integrity tests.
  const screenshot = fs.readFileSync(path.join(PROJECT_ROOT, 'docs/validation/screenshots/cinema.png'));
  const report = { schema: BASELINE_SCHEMA, app_id: app.app_id, title: app.title,
    baseline_only: true, capture_complete: true, acceptance_decision: 'not_evaluated', work_complete: false, completion_authority: false,
    contract_sha256: hash(fs.readFileSync(CONTRACT_PATH)),
    source_sha256: Object.fromEntries(sourcePaths.map(relative => [relative, hash(fs.readFileSync(path.join(PROJECT_ROOT, relative)))])),
    boundary: { tool_invocations: 'blocked', non_read_requests: 'blocked' }, viewports: [] };
  for (const viewport of VIEWPORTS) {
    const image = `${viewport.name}.png`;
    const primary = `${viewport.name}-primary.png`;
    const domFile = `${viewport.name}.dom.json`;
    fs.writeFileSync(path.join(directory, image), screenshot);
    fs.writeFileSync(path.join(directory, primary), screenshot);
    fs.writeFileSync(path.join(directory, domFile), JSON.stringify({ root_tag: 'div', functional_acceptance: 'not_evaluated', layout: { viewport: { width: viewport.width, height: viewport.height } } }));
    report.viewports.push({ viewport, app_id: app.app_id,
      launch: { from_canonical_icon: true, runtime_window_verified: true, launcher_selector: app.launch.canonical_launcher, window_selector: app.launch.window_selector },
      screenshot: image, primary_screenshot: primary, dom_file: domFile,
      screenshot_sha256: hash(screenshot), primary_screenshot_sha256: hash(screenshot), dom_sha256: hash(fs.readFileSync(path.join(directory, domFile))),
      functional_acceptance: 'not_evaluated', network_events: [] });
  }
  return { directory, report };
}

test('complete artifact-bound baseline remains observation only and validates without GUI execution', t => {
  const { directory, report } = fixture(t);
  assert.equal(validateBaselineEvidence(report, directory), true);
  assert.equal(report.acceptance_decision, 'not_evaluated');
});

for (const [label, mutate, expected] of [
  ['GO header', report => { report.decision = 'GO'; }, /publish GO/],
  ['completion authority', report => { report.completion_authority = true; }, /claim acceptance/],
  ['missing mobile capture', report => report.viewports.pop(), /both viewports/],
  ['noncanonical launcher', report => { report.viewports[0].launch.launcher_selector = '[data-app="alias"]'; }, /canonical viewport/],
  ['missing source proof', report => { delete report.source_sha256['web/js/main-simple.js']; }, /source coverage/],
  ['changed source proof', report => { report.source_sha256['web/js/main-simple.js'] = '0'.repeat(64); }, /source changed/],
  ['changed contract proof', report => { report.contract_sha256 = '0'.repeat(64); }, /contracts changed/],
  ['unblocked owner call', report => { report.viewports[0].network_events.push({ origin: 'desktop', method: 'POST', path: '/mcp/tools/call', status: 200 }); }, /unblocked tool/],
  ['unblocked external read', report => { report.viewports[0].network_events.push({ origin: 'external', method: 'GET', path: '/data', status: 200 }); }, /unblocked tool/],
  ['artifact traversal', report => { report.viewports[0].screenshot = '../outside.png'; }, /escapes/],
]) test(`baseline integrity rejects ${label}`, t => {
  const { directory, report } = fixture(t);
  mutate(report);
  assert.throws(() => validateBaselineEvidence(report, directory), expected);
});

test('changed screenshot bytes cannot reuse a successful baseline header', t => {
  const { directory, report } = fixture(t);
  fs.appendFileSync(path.join(directory, report.viewports[0].screenshot), 'changed after collection');
  assert.throws(() => validateBaselineEvidence(report, directory), /artifact changed/);
});

test('a symlink cannot substitute an externally owned screenshot', t => {
  const { directory, report } = fixture(t);
  const destination = path.join(directory, report.viewports[0].screenshot);
  fs.unlinkSync(destination);
  fs.symlinkSync(path.join(PROJECT_ROOT, 'docs/validation/screenshots/cinema.png'), destination);
  assert.throws(() => validateBaselineEvidence(report, directory), /owned regular file/);
});

test('browser admission detects real acquisition command shapes and ignores passive repair evidence arguments', t => {
  const proc = fs.mkdtempSync(path.join(os.tmpdir(), 'svf-process-census-'));
  t.after(() => fs.rmSync(proc, { recursive: true, force: true }));
  const commands = {
    100: ['/usr/bin/node', '/workspace/scripts/run-vdg-family.mjs', 'vdg-storage', 'http'],
    101: ['/opt/google/chrome/chrome', '--headless'],
    102: ['/usr/bin/python', '-m', 'repair_dispatcher', '--evidence-path', '/workspace/scripts/run-vdg-family.mjs'],
  };
  for (const [pid, args] of Object.entries(commands)) {
    fs.mkdirSync(path.join(proc, pid));
    fs.writeFileSync(path.join(proc, pid, 'cmdline'), args.join('\0'));
  }
  assert.deepEqual(findBrowserOwners(proc, 999).map(owner => owner.pid), [100, 101]);
});

test('real kernel capture lock is retained by its Node owner and excludes a competing capture', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'svf-kernel-lock-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const lock = path.join(directory, 'browser.lock');
  const module = pathToFileURL(path.join(PROJECT_ROOT, 'scripts/capture-visual-functional-baseline.mjs')).href;
  const code = `import {retainsCaptureLock} from ${JSON.stringify(module)}; if(!retainsCaptureLock(${JSON.stringify(lock)}))process.exit(2);console.log('locked');process.stdin.resume();`;
  const owner = spawn('/usr/bin/flock', ['--exclusive', '--nonblock', '--no-fork', lock, process.execPath, '--input-type=module', '--eval', code], { stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => owner.kill('SIGKILL'));
  const ready = await Promise.race([
    once(owner.stdout, 'data').then(([bytes]) => bytes.toString()),
    once(owner, 'exit').then(([status]) => { throw new Error(`lock owner exited ${status}`); }),
  ]);
  assert.match(ready, /locked/);
  const contender = spawnSync('/usr/bin/flock', ['--exclusive', '--nonblock', '--conflict-exit-code', '75', '--no-fork', lock, process.execPath, '--eval', 'process.exit(0)']);
  assert.equal(contender.status, 75);
  const closed = once(owner, 'close');
  owner.stdin.end();
  assert.equal((await closed)[0], 0);
  const next = spawnSync('/usr/bin/flock', ['--exclusive', '--nonblock', '--conflict-exit-code', '75', '--no-fork', lock, process.execPath, '--eval', 'process.exit(0)']);
  assert.equal(next.status, 0);
});
