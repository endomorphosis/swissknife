import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';
import { Window } from 'happy-dom';
import {
  PROJECT_ROOT, PHASES, SCENARIO_SCHEMA, WORKFLOW_SCHEMA, WorkflowError,
  validateScenario, evaluateObservation, requiredSemantics, readJSONPointer,
  readElementObservation, assertUsableMedia, rejectSyntheticWorkflow, loadScenario,
  foundationCheck, parseArguments, openRealDesktopSession, executeScenarioPhase, observeOwnedDesktopGroup, stopOwnedDesktopGroup,
  canonicalJSON, admitBackendCall, verifyBackendProof, collectBackendProof, readPersistedGatewayArtifact, observeDOMProbe,
  workflowSourceSnapshot, assertWorkflowSources, collectWorkflowLayout, buildWorkflowEvidence, assembleWorkflowReport,
  boundedFailureValue, writeWorkflowFailure, withWorkflowFailureDiagnostics,
} from '../../scripts/run-visual-functional-workflow.mjs';
const { cidForBytes } = createRequire(import.meta.url)('../../scripts/mcpplusplus-profile-a.cjs');

const contracts = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'config/visual-functional-app-contracts.json'), 'utf8'));
const calculator = contracts.apps.find(app => app.app_id === 'calculator');
const filename = fileURLToPath(new URL('../../scripts/run-visual-functional-workflow.mjs', import.meta.url));
const clone = value => structuredClone(value);

function failureOutput(t) {
  const directory = fs.mkdtempSync(path.join(path.dirname(PROJECT_ROOT), 'data/svf-failure-unit-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
const failureSources = { source_sha256: { 'swissknife/unit-source.js': 'a'.repeat(64) }, scenario_sha256: 'b'.repeat(64) };

test('failed DOM postcondition retains actual, expected, probe, phase and source bindings without acceptance', async t => {
  const outputDir = failureOutput(t), fixture = unitDesktop(t, { wrongResult: true });
  await assert.rejects(withWorkflowFailureDiagnostics({ app: calculator, sources: failureSources, outputDir,
    openSession: () => fixture.open({ outputDir }),
    runSession: session => executeScenarioPhase(session, 'primary_result', scenarioFor().phases.primary_result),
  }), isCode('POSTCONDITION_FAILED'));
  const report = JSON.parse(fs.readFileSync(path.join(outputDir, 'failure.json')));
  assert.equal(report.schema, 'swissknife.visual-functional-workflow-failure.v1');
  assert.equal(report.error.details.actual, '49'); assert.equal(report.error.details.expected, '50');
  assert.equal(report.error.details.operator, 'equals'); assert.equal(report.error.details.probe.selector, '#result');
  assert.equal(report.phase, 'primary_result'); assert.equal(report.step, 2);
  assert.deepEqual(report.source_sha256, failureSources.source_sha256);
  assert.equal(report.scenario_sha256, failureSources.scenario_sha256);
  assert.equal(report.actual_desktop, false); assert.equal(report.completion_authority, false);
  assert.equal(report.work_complete, false); assert.equal(report.functional_acceptance, 'not_evaluated');
  assert.equal(fs.existsSync(path.join(outputDir, 'workflow.json')), false);
  assert.equal(fixture.calls.browserCloses, 1); assert.equal(fixture.calls.releases, 1);
});

test('missing backend pointer retains actual native response shape and hashed diagnostic artifacts', async t => {
  const outputDir = failureOutput(t);
  const response = { outcome: 'executed', result: { result: { content: [{ type: 'json', json: { generated_text: 'actual unit answer' } }] } } };
  let error; try { readJSONPointer(response, '/result/result/generated_text'); } catch (caught) { error = caught; }
  const report = await writeWorkflowFailure({ app: calculator, sources: failureSources, outputDir, error,
    session: { actual_desktop: false, failure_context: { phase: 'backend_proof', probe: { kind: 'backend_result', pointer: '/result/result/generated_text' } },
      backend_records: [{ call: { binding_id: 'unit.binding', tool_id: 'unit_tool', correlation_id: 'unit-only' }, response, finished: true }] } });
  assert.equal(report.error.code, 'MISSING_OBSERVATION');
  assert.equal(report.error.details.pointer, '/result/result/generated_text');
  assert.deepEqual(report.error.details.available_keys, ['content']);
  const artifact = report.artifacts.find(item => item.path.endsWith('/failure-owner-responses.json'));
  const file = path.join(path.dirname(PROJECT_ROOT), artifact.path), bytes = fs.readFileSync(file);
  assert.equal(artifact.sha256, createHash('sha256').update(bytes).digest('hex')); assert.equal(artifact.bytes, bytes.length);
  const diagnostic = JSON.parse(bytes); assert.equal(diagnostic.diagnostic_only, true); assert.equal(diagnostic.actual_desktop, false);
  assert.equal(diagnostic.records[0].response.result.result.content[0].json.generated_text, 'actual unit answer');
});

test('failure diagnostics redact secrets and bound response bodies before retaining them', async t => {
  const outputDir = failureOutput(t);
  const report = await writeWorkflowFailure({ app: calculator, sources: failureSources, outputDir,
    error: new WorkflowError('POSTCONDITION_FAILED', 'Authorization: Bearer HIDDEN_BEARER', { actual: 'PRIVATE_PROBE_VALUE', expected: 'PRIVATE_EXPECTED_VALUE' }),
    session: { failure_context: { phase: 'primary_result', step: 0, probe: { kind: 'value', selector: '#api-key' } },
      backend_records: [{ call: { tool_id: 'unit' }, response: { api_key: 'HIDDEN_API_KEY', password: 'HIDDEN_PASSWORD',
        access_token: 'HIDDEN_TOKEN', body: 'x'.repeat(1000000) } }] } });
  for (const file of fs.readdirSync(outputDir)) {
    const bytes = fs.readFileSync(path.join(outputDir, file)); assert.ok(bytes.length <= 49152);
    assert.doesNotMatch(bytes.toString(), /HIDDEN_BEARER|HIDDEN_API_KEY|HIDDEN_PASSWORD|HIDDEN_TOKEN|PRIVATE_PROBE_VALUE|PRIVATE_EXPECTED_VALUE/);
  }
  assert.equal(report.error.details.actual, '[redacted private probe]');
  assert.ok(Buffer.byteLength(JSON.stringify(boundedFailureValue({ huge: Array.from({ length: 100 }, () => 'z'.repeat(10000)) }))) <= 24000);
});

test('failure diagnostics precede cleanup and cleanup errors never replace the original failure', async t => {
  const outputDir = failureOutput(t), original = new WorkflowError('POSTCONDITION_FAILED', 'original unit failure');
  let closes = 0;
  await assert.rejects(withWorkflowFailureDiagnostics({ app: calculator, sources: failureSources, outputDir,
    openSession: async () => ({ close: async () => { closes += 1; assert.ok(fs.existsSync(path.join(outputDir, 'failure.json'))); throw new Error('cleanup unit error'); } }),
    runSession: async () => { throw original; },
  }), error => error === original);
  assert.equal(closes, 1); assert.equal(fs.existsSync(path.join(outputDir, 'workflow.json')), false);
});

test('browser contention retains body-free owner identities without launching or signaling anything', async t => {
  const outputDir = failureOutput(t), owners = [{ pid: 999999, kind: 'browser', executable: 'chrome' }];
  await assert.rejects(withWorkflowFailureDiagnostics({ app: calculator, sources: failureSources, outputDir,
    openSession: async () => { throw new WorkflowError('BROWSER_CONTENTION', 'unit owner active', { browser_owners: owners }); },
    runSession: async () => { assert.fail('contention must not run the scenario'); },
  }), isCode('BROWSER_CONTENTION'));
  const report = JSON.parse(fs.readFileSync(path.join(outputDir, 'failure.json')));
  assert.deepEqual(report.error.details.browser_owners, owners); assert.equal(report.actual_desktop, false);
});

test('diagnostics cannot overwrite existing artifacts or follow output symlinks', async t => {
  const outputDir = failureOutput(t), app = calculator, error = new WorkflowError('UNIT_FAILURE', 'unit');
  fs.writeFileSync(path.join(outputDir, 'failure.json'), 'foreign preserved');
  assert.equal(await writeWorkflowFailure({ app, error, outputDir }), null);
  assert.equal(fs.readFileSync(path.join(outputDir, 'failure.json'), 'utf8'), 'foreign preserved');
  const directory = failureOutput(t), link = path.join(directory, 'link'); fs.symlinkSync(outputDir, link);
  assert.equal(await writeWorkflowFailure({ app, error, outputDir: link }), null);
});
const isCode = code => error => error instanceof WorkflowError && error.code === code;

function scenarioFor(app = calculator) {
  const assertion = (id, expected = '50') => ({ op: 'assert', requirement_id: id, probe: { kind: 'text', selector: '#result' }, operator: 'equals', expected });
  const declared = app.backend_roles.flatMap(role => role.bindings)[0];
  return { schema: SCENARIO_SCHEMA, app_id: app.app_id, fixture_scope: 'svf-unit-controlled-fixture',
    backend_bindings: declared ? [{ binding_id: declared.binding_id,
      mode: declared.mutates_remote_state ? 'isolated_mutation' : 'read',
      consent: declared.mutates_remote_state ? 'ui_required' : 'not_required', max_duration_seconds: 30, max_output_bytes: 4096 }] : [],
    phases: {
      primary_result: [{ op: 'fill', selector: '#input', value: '12.5*4' }, { op: 'click', selector: '#equals' },
        ...app.primary_workflow.expected_results.map((_text, index) => assertion(`result_${index + 1}`))],
      persist_reopen: [{ op: 'reopen_app' }, assertion('persist_reopen')],
      failure_recovery: [{ op: 'fill', selector: '#input', value: '1/0' }, { op: 'click', selector: '#equals' },
        { op: 'assert', checkpoint_id: 'error_observed', probe: { kind: 'text', selector: '#error' }, operator: 'contains', expected: 'zero' },
        { op: 'click', selector: '#clear' }, assertion('failure_recovery')],
    } };
}

test('stage1 admits structurally complete scenarios for all45 canonical app contracts without executing them', () => {
  assert.equal(contracts.apps.length, 45);
  for (const app of contracts.apps) {
    const scenario = scenarioFor(app);
    assert.equal(validateScenario(scenario, app), scenario);
    assert.deepEqual(Object.keys(scenario.phases), PHASES);
    assert.equal(requiredSemantics(app).persist_reopen, app.primary_workflow.persist_reopen);
    assert.equal(requiredSemantics(app).failure_recovery, `${app.primary_workflow.error} Recovery: ${app.primary_workflow.recovery}`);
  }
});

for (const [description, change, code] of [
  ['generic click-only evidence', s => { s.phases.primary_result = [{ op: 'click', selector: '#equals' }]; }, 'MISSING_POSTCONDITION'],
  ['model-supplied actual values', s => { s.phases.primary_result.at(-1).actual = '50'; }, 'INVALID_SCENARIO'],
  ['model-supplied probe result', s => { s.phases.primary_result.at(-1).probe.actual = '50'; }, 'INVALID_SCENARIO'],
  ['direct scripts', s => { s.phases.primary_result[0] = { op: 'evaluate', script: 'return true' }; }, 'INVALID_SCENARIO'],
  ['raw backend requests', s => { s.phases.primary_result[0] = { op: 'request', url: '/mcp/tools/call' }; }, 'INVALID_SCENARIO'],
  ['reopen-free persistence', s => { s.phases.persist_reopen.shift(); }, 'MISSING_POSTCONDITION'],
  ['unobserved error', s => { s.phases.failure_recovery.splice(2, 1); }, 'MISSING_POSTCONDITION'],
  ['recovery without a recovery action', s => { s.phases.failure_recovery.splice(3, 1); }, 'MISSING_POSTCONDITION'],
  ['duplicate semantic IDs', s => { s.phases.primary_result.push(clone(s.phases.primary_result.at(-1))); }, 'INVALID_SCENARIO'],
  ['historical proof markers', s => { s.phases.primary_result.at(-1).probe.selector = '[data-svd-vda-marker="ready"]'; }, 'SYNTHETIC_PROOF'],
  ['unbounded sleeps', s => { s.phases.primary_result.unshift({ op: 'wait_ms', milliseconds: 300000 }); }, 'INVALID_SCENARIO'],
  ['wrong app identity', s => { s.app_id = 'other-app'; }, 'INVALID_SCENARIO'],
  ['user-data fixture scope', s => { s.fixture_scope = 'user-project'; }, 'POLICY_BOUNDARY'],
  ['local app backend dispatch', s => { s.backend_bindings = [{ binding_id: 'calculator.fabricated', mode: 'read', consent: 'not_required', max_duration_seconds: 30, max_output_bytes: 100 }]; }, 'POLICY_BOUNDARY'],
]) test(`stage1 rejects ${description}`, () => {
  const scenario = scenarioFor();
  change(scenario);
  assert.throws(() => validateScenario(scenario, calculator), isCode(code));
});

test('stage1 preserves actual declared mutation/consent and external/credential boundaries', () => {
  const toolApp = contracts.apps.find(app => app.backend_roles.some(role => role.bindings.some(binding => binding.mutates_remote_state)));
  const scenario = scenarioFor(toolApp);
  assert.equal(scenario.backend_bindings[0].mode, 'isolated_mutation');
  scenario.backend_bindings[0].mode = 'read';
  assert.throws(() => validateScenario(scenario, toolApp), isCode('POLICY_BOUNDARY'));
  for (const app of contracts.apps.filter(app => ['external_provider', 'policy_blocked'].includes(app.disposition))) {
    const local = scenarioFor(app);
    assert.equal(local.backend_bindings.length, 0);
    validateScenario(local, app);
  }
});

test('scenario admission refuses impossible read confirmation actions before a browser is opened', () => {
  const app = contracts.apps.find(item => item.app_id === 'mcp-control');
  const binding = app.backend_roles[0].bindings[0];
  assert.equal(binding.mutates_remote_state, false);
  for (const op of ['wait_for', 'click']) {
    const scenario = scenarioFor(app);
    scenario.phases.primary_result.unshift({ op, selector: `[data-gateway-confirm="${binding.binding_id}"]`,
      ...(op === 'wait_for' ? { state: 'visible', timeout_ms: 15000 } : {}) });
    assert.throws(() => validateScenario(scenario, app), error => isCode('INVALID_SCENARIO')(error)
      && error.details.binding_id === binding.binding_id && error.details.consent === 'not_required'
      && error.message.includes('does not create a confirmation dialog'));
  }
  const absence = scenarioFor(app);
  absence.phases.primary_result.unshift({ op: 'wait_for', selector: `[data-gateway-confirm="${binding.binding_id}"]`, state: 'hidden', timeout_ms: 1000 });
  assert.equal(validateScenario(absence, app), absence);
});

test('scenario confirmation admission uses binding policy even for a tool named ipfs_cat', () => {
  const app = contracts.apps.find(item => item.app_id === 'file-manager');
  const binding = app.backend_roles[0].bindings[0];
  assert.ok(binding.exact_tool_candidates.includes('ipfs_cat'));
  assert.equal(binding.mutates_remote_state, true);
  const scenario = scenarioFor(app);
  scenario.phases.primary_result.unshift({ op: 'wait_for', selector: `[data-gateway-confirm='${binding.binding_id}']`, state: 'visible', timeout_ms: 15000 });
  assert.equal(validateScenario(scenario, app), scenario);
  scenario.phases.primary_result[0].selector = '[data-gateway-confirm="other-app.unregistered"]';
  assert.throws(() => validateScenario(scenario, app), isCode('POLICY_BOUNDARY'));
});

test('stage1 evaluates typed observed values without truthiness or string coercion', () => {
  const evidence = evaluateObservation({ operator: 'equals', actual: { result: 50, saved: true }, expected: { saved: true, result: 50 } });
  assert.equal(evidence.actual.result, 50);
  evaluateObservation({ operator: 'contains', actual: ['one', { row: 2 }], expected: { row: 2 } });
  evaluateObservation({ operator: 'at_least', actual: 12, expected: 10 });
  for (const pair of [[true, 1], ['50', 50], [null, false], [{ a: true }, { a: 1 }]]) {
    assert.throws(() => evaluateObservation({ operator: 'equals', actual: pair[0], expected: pair[1] }), isCode('POSTCONDITION_FAILED'));
  }
  for (const expected of [0, -1, true, '1']) assert.throws(() => evaluateObservation({ operator: 'at_least', actual: 10, expected }));
  for (const actual of [NaN, Infinity, undefined]) assert.throws(() => evaluateObservation({ operator: 'equals', actual, expected: actual }), isCode('INVALID_OBSERVATION'));
  assert.throws(() => evaluateObservation({ operator: 'contains', actual: 'anything', expected: '' }), isCode('POSTCONDITION_FAILED'));
});

test('stage1 reads actual DOM values independently of expected postconditions', () => {
  const window = new Window();
  const input = window.document.createElement('input');
  input.value = 'retained actual note';
  const observed = readElementObservation(input, { kind: 'value' });
  evaluateObservation({ operator: 'equals', actual: observed, expected: 'retained actual note' });
  assert.throws(() => evaluateObservation({ operator: 'equals', actual: observed, expected: 'invented note' }), isCode('POSTCONDITION_FAILED'));
  input.type = 'password';
  assert.throws(() => readElementObservation(input, { kind: 'value' }), /SECRET_OBSERVATION_BLOCKED/);
});

test('stage1 real DOM blank-image detector fails even when a generic click event succeeded', () => {
  const window = new Window();
  const image = window.document.createElement('img');
  const button = window.document.createElement('button');
  let clicked = false;
  button.addEventListener('click', () => { clicked = true; });
  button.click();
  const observed = readElementObservation(image, { kind: 'image_state' });
  assert.equal(clicked, true);
  assert.equal(observed.decoded, false);
  assert.throws(() => assertUsableMedia(observed), isCode('BLANK_MEDIA'));
});

test('stage1 detects the decoded-but-clipped image and nonplaying-media failures', () => {
  assert.throws(() => assertUsableMedia({ decoded: true, natural_width: 1600, natural_height: 1000, visible_area: 0 }), isCode('CLIPPED_MEDIA'));
  assert.throws(() => assertUsableMedia({ decoded: true, visible_area: 100, current_time: 0 }, { requirePlayback: true }), isCode('MEDIA_NOT_PLAYING'));
  assertUsableMedia({ decoded: true, visible_area: 100, current_time: 0.5, error_code: null }, { requirePlayback: true });
});

test('stage1 JSON-pointer reads cannot silently substitute a missing result or wrong array item', () => {
  const raw = { result: { 'a/b': [{ '~value': 50 }] } };
  assert.equal(readJSONPointer(raw, '/result/a~1b/0/~0value'), 50);
  for (const pointer of ['/result/missing', '/result/a~1b/01', '/result/a~1b/9', '/result/~9bad', 'result']) {
    assert.throws(() => readJSONPointer(raw, pointer));
  }
});

test('stage1 synthetic/baseline/passed-only reports cannot substitute semantic evidence', () => {
  for (const report of [
    { schema: WORKFLOW_SCHEMA, passed: true },
    { schema: WORKFLOW_SCHEMA, actual_desktop: false, source_template: true },
    { schema: WORKFLOW_SCHEMA, actual_desktop: true, source_template: false, baseline_only: true },
    { schema: WORKFLOW_SCHEMA, actual_desktop: true, source_template: false, semantic_assertions: [] },
    { schema: WORKFLOW_SCHEMA, actual_desktop: true, source_template: false,
      semantic_assertions: [{ passed: true, observed: { operator: 'equals', actual: 'wrong', expected: 'right' } }] },
  ]) assert.throws(() => rejectSyntheticWorkflow(report));
});

test('stage1 missing per-app scenario fails before resource acquisition or report creation', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'svf-scenario-admission-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  assert.throws(() => loadScenario(calculator, { projectRoot: directory }), isCode('SCENARIO_MISSING'));
  assert.equal(fs.readdirSync(directory).length, 0);
  const scenarioDirectory = path.join(directory, 'test/e2e/functional-workflows');
  fs.mkdirSync(scenarioDirectory, { recursive: true });
  fs.writeFileSync(path.join(scenarioDirectory, 'calculator.json'), JSON.stringify(scenarioFor()));
  assert.equal(loadScenario(calculator, { projectRoot: directory }).app_id, 'calculator');
});

test('stage1 CLI foundation check executes rejection detectors while preserving observation-only authority', async () => {
  const check = await foundationCheck('stage1');
  assert.equal(check.passed, true);
  assert.ok(check.checks.includes('detect-blank-media'));
  assert.ok(check.checks.includes('reject-generic-click-only-scenario'));
  assert.equal(check.actual_desktop, false);
  assert.equal(check.functional_acceptance, 'not_evaluated');
  assert.equal(check.completion_authority, false);
  const result = spawnSync(process.execPath, [filename, '--foundation-check', 'stage1'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).stage, 'stage1');
});

test('stage1 unknown foundation stages fail before any resource acquisition', () => {
  // Implemented stages have substantive unit checks below. The real pilot is
  // exercised separately under a checkout lease, never by this unit suite.
  const result = spawnSync(process.execPath, [filename, '--foundation-check', 'unimplemented-stage'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).error, 'INVALID_ARGUMENT');
  assert.equal(result.stdout, '');
});

test('stage1 normal CLI validates explicit app/contracts/output scope', () => {
  const options = parseArguments(['--app', 'calculator', '--contracts', 'config/visual-functional-app-contracts.json', '--output-dir', '/tmp/svf-output']);
  assert.equal(options.appId, 'calculator');
  assert.equal(options.outputDir, '/tmp/svf-output');
  const pilot = parseArguments(['--foundation-check', 'pilot', '--output-dir', '/tmp/svf-driver-pilot']);
  assert.equal(pilot.foundationStage, 'pilot');
  assert.equal(pilot.outputDir, '/tmp/svf-driver-pilot');
  for (const args of [[], ['--app', '../escape'], ['--app', 'calculator', '--app', 'notes'],
    ['--app', 'calculator', '--contracts', 'config.json', '--output-dir', '/tmp/x', '--desktop-url', 'http://user:secret@localhost/']]) {
    assert.throws(() => parseArguments(args));
  }
});

/** Explicit unit DOM. This is not the SwissKnife desktop and never establishes
 * application acceptance; it exercises the production lifecycle/action API. */
function unitDesktop(t, options = {}) {
  const app = options.app || calculator;
  const view = new Window({ url: 'http://127.0.0.1:3017/' });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'svf-stage2-unit-'));
  t.after(() => { fs.rmSync(directory, { recursive: true, force: true }); view.happyDOM.abort(); });
  const calls = { locks: 0, releases: 0, servers: 0, serverStops: 0, browsers: 0, browserCloses: 0, contexts: 0, contextCloses: 0, launches: 0, closes: 0, fills: 0, routes: [], websocketRoutes: [], events: {} };
  const desktop = { apps: new view.Map([[app.app_id, {}]]), windows: new view.Map() };
  view.__swissknifeDesktop = desktop;
  const document = view.document;
  document.body.innerHTML = `<div class="desktop-icons"><button class="icon" data-app="${app.app_id}">Unit app</button></div><input id="outside" value="outside-secret">`;
  const rect = { left: 0, top: 0, right: 300, bottom: 240, width: 300, height: 240, x: 0, y: 0 };
  const render = () => {
    calls.launches += 1;
    const element = document.createElement('section');
    element.className = 'window'; element.dataset.appId = app.app_id;
    element.getBoundingClientRect = () => rect;
    element.innerHTML = '<button class="window-control close" title="Close">Close</button><div class="window-app-content"><input id="input"><button id="equals">=</button><button id="clear">Clear</button><select id="mode"><option value="basic">Basic</option><option value="scientific">Scientific</option></select><input id="toggle" type="checkbox"><input id="password" type="password"><output id="result"></output><div id="error"></div><div id="items"><span class="item">A</span><span class="item">B</span></div><div id="json" data-state="{&quot;count&quot;:2}"></div><img id="image"></div>';
    const result = element.querySelector('#result');
    result.textContent = !options.losePersistence && view.localStorage.getItem('svf-unit-result') || '0';
    const calculate = () => {
      const value = element.querySelector('#input').value;
      if (value === '1/0') { element.querySelector('#error').textContent = options.noError ? '' : 'Cannot divide by zero'; result.textContent = 'Error'; return; }
      result.textContent = options.wrongResult ? '49' : '50';
      view.localStorage.setItem('svf-unit-result', result.textContent);
      element.querySelector('#error').textContent = '';
    };
    element.querySelector('#equals').onclick = calculate;
    element.querySelector('#input').onkeydown = event => { if (event.key === 'Enter') calculate(); };
    element.querySelector('#clear').onclick = () => {
      element.querySelector('#error').textContent = '';
      result.textContent = options.brokenRecovery ? 'Error' : view.localStorage.getItem('svf-unit-result') || '0';
    };
    const id = `unit-window-${calls.launches}`;
    element.querySelector('.close').onclick = () => { calls.closes += 1; element.remove(); desktop.windows.delete(id); };
    const image = element.querySelector('#image');
    image.getBoundingClientRect = () => options.clippedImage ? { ...rect, left: 350, right: 400, width: 50 } : { ...rect, right: 100, bottom: 100, width: 100, height: 100 };
    Object.defineProperties(image, { complete: { value: !options.blankImage }, naturalWidth: { value: options.blankImage ? 0 : 100 }, naturalHeight: { value: options.blankImage ? 0 : 100 } });
    if (options.delayedLoader) {
      const primary = element.querySelector('.window-app-content');
      const content = Array.from(primary.childNodes);
      for (const node of content) node.remove();
      const loading = document.createElement('div'); loading.className = 'window-loading'; loading.textContent = 'Loading'; primary.append(loading);
      setTimeout(() => { loading.remove(); primary.append(...content); }, 10);
    }
    desktop.windows.set(id, { appId: options.wrongIdentity ? 'notes' : app.app_id, element });
    document.body.append(element);
  };
  document.querySelector('.icon').onclick = render;
  const inDOM = (fn, argument) => view.eval(`(${fn.toString()})`)(argument);
  class Locator {
    constructor(resolve) { this.resolve = resolve; }
    one() { const elements = this.resolve(); assert.equal(elements.length, 1, 'unit locator must be unique'); return elements[0]; }
    locator(css) { return new Locator(() => this.resolve().flatMap(element => Array.from(element.querySelectorAll(css)))); }
    async count() { return this.resolve().length; }
    async scrollIntoViewIfNeeded() {}
    async focus() { if (!options.noFocus) this.one().focus(); }
    async click() { this.one().click(); }
    async fill(value) { calls.fills += 1; this.one().value = value; this.one().dispatchEvent(new view.Event('input', { bubbles: true })); }
    async press(key) { this.one().dispatchEvent(new view.KeyboardEvent('keydown', { key, bubbles: true })); }
    async selectOption(value) { this.one().value = value; this.one().dispatchEvent(new view.Event('change', { bubbles: true })); }
    async check() { this.one().checked = true; this.one().dispatchEvent(new view.Event('change', { bubbles: true })); }
    async uncheck() { this.one().checked = false; this.one().dispatchEvent(new view.Event('change', { bubbles: true })); }
    async evaluate(fn, argument) { return fn(this.one(), argument); }
    async waitFor({ state, timeout = 1000 }) {
      const ready = () => { const visible = this.resolve().some(element => element.isConnected && view.getComputedStyle(element).display !== 'none'); return ['hidden', 'detached'].includes(state) ? !visible : visible; };
      const deadline = Date.now() + Math.min(timeout, 1000);
      while (!ready() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
      assert.ok(ready(), `unit wait ${state}`);
    }
    async elementHandle() {
      const element = this.one();
      return { evaluate: async (fn, argument) => fn(element, argument), waitForElementState: async state => assert.ok(state === 'hidden' && !element.isConnected), dispose: async () => {} };
    }
    async screenshot() { throw new Error('unit driver cannot produce desktop evidence'); }
  }
  const page = {
    locator: css => new Locator(() => Array.from(document.querySelectorAll(css))),
    setDefaultTimeout() {}, on(event, callback) { (calls.events[event] ||= []).push(callback); },
    goto: async () => { if (options.navigationFails) throw new Error('unit navigation failure'); },
    waitForFunction: async (fn, argument) => assert.ok(inDOM(fn, argument), 'unit runtime readiness'),
    waitForTimeout: async milliseconds => { assert.ok(milliseconds >= 0 && milliseconds <= 5000); options.onWait?.(milliseconds); },
  };
  const context = { route: async (_pattern, handler) => calls.routes.push(handler), routeWebSocket: async (_pattern, handler) => calls.websocketRoutes.push(handler),
    newPage: async () => page, close: async () => { calls.contextCloses += 1; if (options.contextCloseFails) throw new Error('unit context close failure'); } };
  const driver = { kind: 'explicit-dom-unit-driver',
    acquireLock: async () => { calls.locks += 1; if (options.lockFails) throw new WorkflowError('BROWSER_CONTENTION', 'unit lock busy'); return { release: async () => { calls.releases += 1; } }; },
    findOwners: () => options.foreignBrowser ? [{ pid: 999999, kind: 'foreign-unit-browser' }] : [],
    startDesktop: async () => { calls.servers += 1; if (options.serverFails) throw new Error('unit server failure'); return { url: 'http://127.0.0.1:3017/', ownership: 'unit-owned-server', stop: async () => { calls.serverStops += 1; } }; },
    launchBrowser: async () => { calls.browsers += 1; if (options.browserFails) throw new Error('unit browser failure'); return { newContext: async () => { calls.contexts += 1; return context; }, close: async () => { calls.browserCloses += 1; } }; },
  };
  const settings = { app, scenario: options.scenario || scenarioFor(app), outputDir: path.join(directory, 'output') };
  const open = async extra => {
    const session = await openRealDesktopSession({ ...settings, ...extra }, driver);
    t.after(async () => { try { await session.close(); } catch { /* cleanup rejection is tested explicitly */ } });
    return session;
  };
  return { calls, view, document, driver, settings, open };
}

test('stage2 engine canonical launch and real close/reopen retain the same context and browser storage', async t => {
  const fixture = unitDesktop(t);
  const session = await fixture.open();
  const initialPage = session.page;
  const old = fixture.document.querySelector('.window');
  for (const phase of PHASES) await executeScenarioPhase(session, phase, scenarioFor().phases[phase]);
  assert.equal(session.page, initialPage);
  assert.equal(old.isConnected, false);
  assert.equal(fixture.calls.launches, 2);
  assert.equal(fixture.calls.closes, 1);
  assert.equal(fixture.calls.contexts, 1);
  assert.equal(session.generation, 2);
  assert.equal(session.actual_desktop, false);
  assert.equal(session.semantic_assertions.length, 3);
  assert.equal(session.checkpoints[0].observed.actual, 'Cannot divide by zero');
  assert.equal(session.semantic_assertions.at(-1).observed.actual, '50');
});

test('stage2 engine rejects wrong computed result despite successful click', async t => {
  const fixture = unitDesktop(t, { wrongResult: true });
  await assert.rejects(executeScenarioPhase(await fixture.open(), 'primary_result', scenarioFor().phases.primary_result), isCode('POSTCONDITION_FAILED'));
});

test('stage2 engine detects persistence loss after actual app window replacement', async t => {
  const fixture = unitDesktop(t, { losePersistence: true });
  const session = await fixture.open();
  await executeScenarioPhase(session, 'primary_result', scenarioFor().phases.primary_result);
  await assert.rejects(executeScenarioPhase(session, 'persist_reopen', scenarioFor().phases.persist_reopen), isCode('POSTCONDITION_FAILED'));
  assert.equal(fixture.calls.closes, 1);
});

test('stage2 engine observes error before recovery instead of accepting clear-button events', async t => {
  for (const options of [{ noError: true }, { brokenRecovery: true }]) {
    const fixture = unitDesktop(t, options);
    const session = await fixture.open();
    await executeScenarioPhase(session, 'primary_result', scenarioFor().phases.primary_result);
    await assert.rejects(executeScenarioPhase(session, 'failure_recovery', scenarioFor().phases.failure_recovery), isCode('POSTCONDITION_FAILED'));
  }
});

test('stage2 engine rejects missing error checkpoint and absent reopen before reading persistence', async t => {
  const fixture = unitDesktop(t);
  const session = await fixture.open();
  const scenario = scenarioFor();
  await assert.rejects(executeScenarioPhase(session, 'persist_reopen', scenario.phases.persist_reopen.slice(1)), isCode('MISSING_POSTCONDITION'));
  await assert.rejects(executeScenarioPhase(session, 'failure_recovery', scenario.phases.failure_recovery.slice(-1)), isCode('MISSING_POSTCONDITION'));
});

test('stage2 engine sends actual focused keyboard actions and detects lost focus', async t => {
  const fixture = unitDesktop(t);
  const session = await fixture.open();
  const steps = scenarioFor().phases.primary_result;
  steps[1] = { op: 'press', selector: '#input', key: 'Enter' };
  const result = await executeScenarioPhase(session, 'primary_result', steps);
  assert.equal(result.assertions[0].observed.actual, '50');
  assert.equal(fixture.document.activeElement.id, 'input');
  assert.equal(result.functional_acceptance, 'not_evaluated');
  const lost = unitDesktop(t, { noFocus: true });
  await assert.rejects(executeScenarioPhase(await lost.open(), 'primary_result', steps), isCode('FOCUS_NOT_REACHED'));
});

test('stage2 engine scopes every control to the canonical window and rejects ambiguous targets', async t => {
  const fixture = unitDesktop(t);
  const session = await fixture.open();
  const steps = scenarioFor().phases.primary_result;
  steps[0] = { op: 'fill', selector: '#outside', value: 'overwrite' };
  await assert.rejects(executeScenarioPhase(session, 'primary_result', steps), isCode('AMBIGUOUS_TARGET'));
  assert.equal(fixture.document.querySelector('#outside').value, 'outside-secret');
  const duplicate = fixture.document.createElement('input'); duplicate.id = 'input'; fixture.document.querySelector('.window-app-content').append(duplicate);
  await assert.rejects(executeScenarioPhase(session, 'primary_result', scenarioFor().phases.primary_result), isCode('AMBIGUOUS_TARGET'));
});

test('stage2 engine actual select/check/uncheck/count/JSON observations preserve value types', async t => {
  const fixture = unitDesktop(t);
  const session = await fixture.open();
  const steps = [
    { op: 'select', selector: '#mode', value: 'scientific' },
    { op: 'check', selector: '#toggle' }, { op: 'uncheck', selector: '#toggle' },
    { op: 'wait_for', selector: '#result', state: 'visible', timeout_ms: 10 }, { op: 'wait_ms', milliseconds: 0 },
    ...scenarioFor().phases.primary_result,
  ];
  await executeScenarioPhase(session, 'primary_result', steps);
  assert.equal(fixture.document.querySelector('#mode').value, 'scientific');
  assert.equal(fixture.document.querySelector('#toggle').checked, false);
  for (const [probe, expected] of [[{ kind: 'count', selector: '.item', within: '#items' }, 2],
    [{ kind: 'json_attribute', selector: '#json', attribute: 'data-state' }, { count: 2 }],
    [{ kind: 'checked', selector: '#toggle' }, false], [{ kind: 'value', selector: '#mode' }, 'scientific']]) {
    const result = await executeScenarioPhase(session, 'primary_result', [{ op: 'assert', requirement_id: 'result_1', probe, operator: 'equals', expected }]);
    assert.deepEqual(result.assertions[0].observed.actual, expected);
  }
});

test('stage2 engine rejects blank and clipped actual images even when expectation could match', async t => {
  for (const [option, code] of [['blankImage', 'BLANK_MEDIA'], ['clippedImage', 'CLIPPED_MEDIA']]) {
    const fixture = unitDesktop(t, { [option]: true });
    const session = await fixture.open();
    const image = fixture.document.querySelector('#image');
    const probe = { kind: 'image_state', selector: '#image' };
    const expected = readElementObservation(image, probe);
    await assert.rejects(executeScenarioPhase(session, 'primary_result', [{ op: 'assert', requirement_id: 'result_1', probe, operator: 'equals', expected }]), isCode(code));
  }
});

test('stage2 engine rejects canonical window identity mismatch and cleans all acquired resources', async t => {
  const fixture = unitDesktop(t, { wrongIdentity: true });
  await assert.rejects(fixture.open(), isCode('APP_IDENTITY_MISMATCH'));
  assert.equal(fixture.calls.contextCloses, 1);
  assert.equal(fixture.calls.browserCloses, 1);
  assert.equal(fixture.calls.serverStops, 1);
  assert.equal(fixture.calls.releases, 1);
});

test('stage2 engine startup failures and foreign ownership release only resources this session acquired', async t => {
  for (const option of ['lockFails', 'foreignBrowser', 'serverFails', 'browserFails', 'navigationFails']) {
    const fixture = unitDesktop(t, { [option]: true });
    await assert.rejects(fixture.open());
    assert.equal(fixture.calls.releases, option === 'lockFails' ? 0 : 1, option);
    assert.equal(fixture.calls.serverStops, ['browserFails', 'navigationFails'].includes(option) ? 1 : 0, option);
    assert.equal(fixture.calls.browserCloses, option === 'navigationFails' ? 1 : 0, option);
    if (['lockFails', 'foreignBrowser'].includes(option)) assert.equal(fixture.calls.servers, 0);
  }
});

test('stage2 engine idempotent cleanup releases lock after context failure and never stops explicit existing desktop', async t => {
  const fixture = unitDesktop(t, { contextCloseFails: true });
  const session = await fixture.open({ desktopUrl: 'http://127.0.0.1:3017/' });
  await assert.rejects(session.close(), AggregateError);
  await assert.rejects(session.close(), AggregateError);
  assert.equal(fixture.calls.contextCloses, 1);
  assert.equal(fixture.calls.browserCloses, 1);
  assert.equal(fixture.calls.servers, 0);
  assert.equal(fixture.calls.serverStops, 0);
  assert.equal(fixture.calls.releases, 1);
  await assert.rejects(executeScenarioPhase(session, 'primary_result', scenarioFor().phases.primary_result), isCode('SESSION_INTERRUPTED'));
});

test('stage2 engine private values and actual backend response probes fail closed', async t => {
  const fixture = unitDesktop(t);
  const session = await fixture.open();
  const steps = scenarioFor().phases.primary_result;
  steps[0] = { op: 'fill', selector: '#password', value: 'not-a-real-secret' };
  await assert.rejects(executeScenarioPhase(session, 'primary_result', steps), /SECRET_OBSERVATION_BLOCKED/);
  assert.equal(fixture.calls.fills, 0);
  const toolApp = contracts.apps.find(app => app.backend_roles.length && app.backend_roles.some(role => role.bindings.length));
  const binding = toolApp.backend_roles.flatMap(role => role.bindings)[0];
  session.app = toolApp;
  await assert.rejects(executeScenarioPhase(session, 'primary_result', [{ op: 'assert', requirement_id: 'result_1', probe: { kind: 'backend_result', binding_id: binding.binding_id, pointer: '/result' }, operator: 'equals', expected: 'fake' }]), isCode('FOUNDATION_STAGE_UNIMPLEMENTED'));
});

test('stage2 engine network boundary blocks raw writes, tool calls, external fetches and websockets', async t => {
  const fixture = unitDesktop(t);
  await fixture.open();
  for (const [url, method, expected] of [['http://127.0.0.1:3017/js/main-simple.js', 'GET', 'continue'],
    ['http://127.0.0.1:3017/mcp/tools/call', 'POST', 'abort'], ['https://external.example/api', 'GET', 'abort'],
    ['http://127.0.0.1:3017/private', 'PUT', 'abort']]) {
    let action;
    await fixture.calls.routes[0]({ request: () => ({ url: () => url, method: () => method, resourceType: () => 'fetch' }),
      continue: async () => { action = 'continue'; }, abort: async () => { action = 'abort'; } });
    assert.equal(action, expected);
  }
  let closed = false;
  fixture.calls.websocketRoutes[0]({ close: () => { closed = true; } });
  assert.equal(closed, true);
});

test('stage2 engine rejects selector engines that can escape app containment before any UI action', async t => {
  const fixture = unitDesktop(t);
  const session = await fixture.open();
  for (const selector of ['xpath=//input', '//input', '../input', '#input >> xpath=../..', 'text=outside-secret']) {
    const steps = scenarioFor().phases.primary_result;
    steps[0] = { op: 'fill', selector, value: 'bad' };
    await assert.rejects(executeScenarioPhase(session, 'primary_result', steps), isCode('POLICY_BOUNDARY'));
  }
  assert.equal(fixture.calls.fills, 0);
});

test('stage2 engine derives advancing playback and rejects stationary positive-time or paused media', async t => {
  const options = {};
  const fixture = unitDesktop(t, options);
  const session = await fixture.open();
  const video = fixture.document.createElement('video'); video.id = 'video';
  video.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 });
  let time = 0, paused = false;
  Object.defineProperties(video, { readyState: { value: 3 }, currentTime: { get: () => time }, duration: { value: 10 }, paused: { get: () => paused } });
  fixture.document.querySelector('.window-app-content').append(video);
  const probe = { kind: 'media_state', selector: '#video' };
  let step = { op: 'assert', requirement_id: 'result_1', probe, operator: 'equals', expected: readElementObservation(video, probe) };
  await assert.rejects(executeScenarioPhase(session, 'primary_result', [step]), isCode('MEDIA_NOT_PLAYING'));
  time = 2; paused = true;
  step = { ...step, expected: readElementObservation(video, probe) };
  await assert.rejects(executeScenarioPhase(session, 'primary_result', [step]), isCode('MEDIA_NOT_PLAYING'));
  paused = false;
  step = { ...step, expected: readElementObservation(video, probe) };
  await assert.rejects(executeScenarioPhase(session, 'primary_result', [step]), isCode('MEDIA_NOT_PLAYING'));
  options.onWait = () => { time = 2.25; };
  step = { ...step, expected: { ...readElementObservation(video, probe), current_time: 2.25 } };
  const observed = await executeScenarioPhase(session, 'primary_result', [step]);
  assert.equal(observed.assertions[0].observed.actual.current_time, 2.25);
});

test('stage2 engine refuses a parent text probe containing a private subtree', async t => {
  const fixture = unitDesktop(t);
  const session = await fixture.open();
  const privateNode = fixture.document.createElement('div'); privateNode.setAttribute('data-secret', ''); privateNode.textContent = 'private-unit-value';
  fixture.document.querySelector('#items').append(privateNode);
  await assert.rejects(executeScenarioPhase(session, 'primary_result', [{ op: 'assert', requirement_id: 'result_1', probe: { kind: 'text', selector: '#items' }, operator: 'contains', expected: 'A' }]), isCode('POLICY_BOUNDARY'));
});

test('stage2 engine excludes shared window gateway controls from app semantic assertions', async t => {
  const fixture = unitDesktop(t);
  const session = await fixture.open();
  const gateway = fixture.document.createElement('div'); gateway.className = 'live-tool-gateway-host';
  gateway.innerHTML = '<input id="gateway-input"><output id="gateway-result">50</output>';
  fixture.document.querySelector('.window').append(gateway);
  const steps = scenarioFor().phases.primary_result;
  steps[0] = { op: 'fill', selector: '#gateway-input', value: '50' };
  await assert.rejects(executeScenarioPhase(session, 'primary_result', steps), isCode('AMBIGUOUS_TARGET'));
  await assert.rejects(executeScenarioPhase(session, 'primary_result', [{ op: 'assert', requirement_id: 'result_1', probe: { kind: 'text', selector: '#gateway-result' }, operator: 'equals', expected: '50' }]), isCode('AMBIGUOUS_TARGET'));
  const count = await executeScenarioPhase(session, 'primary_result', [{ op: 'assert', requirement_id: 'result_1', probe: { kind: 'count', selector: '#gateway-result' }, operator: 'equals', expected: 0 }]);
  assert.equal(count.assertions[0].observed.actual, 0);
  assert.equal(fixture.calls.fills, 0);
});

function groupFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'svf-owned-group-unit-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const write = (pid, { birth, pgid = 8100, sid = 8100, state = 'S' }) => {
    const fields = [state, '1', String(pgid), String(sid), ...Array(15).fill('0'), String(birth), '0'];
    fs.mkdirSync(path.join(directory, String(pid)), { recursive: true });
    fs.writeFileSync(path.join(directory, String(pid), 'stat'), `${pid} (owned unit process) ${fields.join(' ')}\n`);
  };
  const remove = pid => fs.rmSync(path.join(directory, String(pid)), { recursive: true, force: true });
  return { directory, write, remove, identity: { pid: 8100, birth: '100' }, births: new Map() };
}

test('stage2 engine cleans recorded owned descendants after the original npm leader exits', async t => {
  const fixture = groupFixture(t);
  fixture.write(8100, { birth: '100' }); fixture.write(8101, { birth: '110' });
  assert.equal(observeOwnedDesktopGroup(fixture.identity, fixture.births, fixture.directory).length, 2);
  fixture.remove(8100);
  const signals = [];
  await stopOwnedDesktopGroup(fixture.identity, fixture.births, { procRoot: fixture.directory,
    signal: (pid, name) => { signals.push([pid, name]); fixture.remove(8101); } });
  assert.deepEqual(signals, [[-8100, 'SIGTERM']]);
});

test('stage2 engine never signals a foreign replacement birth or unobserved group member after leader exit', async t => {
  for (const mode of ['replacement', 'unobserved', 'foreign-session', 'leader-replacement']) {
    const fixture = groupFixture(t);
    fixture.write(8100, { birth: '100' }); fixture.write(8101, { birth: '110' });
    observeOwnedDesktopGroup(fixture.identity, fixture.births, fixture.directory);
    fixture.remove(8100);
    if (mode === 'replacement') fixture.write(8101, { birth: '200' });
    if (mode === 'unobserved') fixture.write(8102, { birth: '120' });
    if (mode === 'foreign-session') fixture.write(8101, { birth: '110', sid: 9999 });
    if (mode === 'leader-replacement') fixture.write(8100, { birth: '200' });
    const signals = [];
    await assert.rejects(stopOwnedDesktopGroup(fixture.identity, fixture.births, { procRoot: fixture.directory, signal: (...args) => signals.push(args) }), isCode('PROCESS_OWNERSHIP_LOST'));
    assert.deepEqual(signals, [], mode);
  }
});

test('stage2 engine escalates only its exact observed process group after a finite TERM grace', async t => {
  const fixture = groupFixture(t);
  fixture.write(8100, { birth: '100' }); fixture.write(8101, { birth: '110' });
  const signals = []; let clock = 0;
  await stopOwnedDesktopGroup(fixture.identity, fixture.births, { procRoot: fixture.directory, graceMs: 200,
    now: () => clock, pause: async milliseconds => { clock += milliseconds; },
    signal: (pid, name) => { signals.push([pid, name]); if (name === 'SIGKILL') { fixture.remove(8100); fixture.remove(8101); } } });
  assert.deepEqual(signals, [[-8100, 'SIGTERM'], [-8100, 'SIGKILL']]);
  assert.equal(clock, 200);
});

test('stage2 engine waits for asynchronous app loading on both canonical launch and reopen', async t => {
  const fixture = unitDesktop(t, { delayedLoader: true });
  const session = await fixture.open();
  await executeScenarioPhase(session, 'primary_result', scenarioFor().phases.primary_result);
  await executeScenarioPhase(session, 'persist_reopen', scenarioFor().phases.persist_reopen);
  assert.equal(fixture.calls.launches, 2);
  assert.equal(fixture.calls.closes, 1);
  assert.equal(fixture.document.querySelector('.window-loading'), null);
  assert.equal(session.semantic_assertions.at(-1).observed.actual, '50');
});

test('stage2 foundation CLI executes substantive unit detectors without claiming application acceptance', async () => {
  const result = spawnSync(process.execPath, [filename, '--foundation-check', 'stage2'], { encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const check = JSON.parse(result.stdout);
  assert.equal(check.stage, 'stage2');
  assert.ok(check.executable_tests_passed >= 12);
  assert.equal(check.actual_desktop, false);
  assert.equal(check.functional_acceptance, 'not_evaluated');
  assert.equal(check.work_complete, false);
  assert.equal(check.completion_authority, false);
});

/** Authored protocol vectors exercise failure detectors. They are not owner
 * executions, persisted production receipts, browser captures or app GO. */
function backendVector() {
  const app = clone(contracts.apps.find(item => item.app_id === 'ai-chat'));
  const role = app.backend_roles.find(item => item.bindings.some(binding => !binding.mutates_remote_state));
  const binding = role.bindings.find(item => !item.mutates_remote_state);
  const scenario = scenarioFor(app);
  scenario.backend_bindings = [{ binding_id: binding.binding_id, mode: 'read', consent: 'not_required', max_duration_seconds: 1, max_output_bytes: 65536 }];
  const call = { protocol: 'swissknife.all-app-tool-gateway.v1', route: '/mcp/tools/call', app_id: app.app_id,
    binding_id: binding.binding_id, intent_id: binding.operation, owner: role.owner, tool_id: binding.exact_tool_candidates[0],
    transport: binding.transports[0], correlation_id: 'svf-unit-protocol-vector-1', receipt_required: true,
    input: { correlation_id: 'svf-unit-protocol-vector-1', payload: { fixture_scope: scenario.fixture_scope, limit: 1 },
      policy: { decision_id: 'svf-unit-read', outcome: 'allow', reason: 'Authored unit vector', consent: 'not_required', dry_run: false } } };
  const result = { result: { receipt: { tool: call.tool_id, status: 'executed', dry_run: false }, content: [{ json: { answer: 50, saved: false } }] },
    application_transport_observation: { transport: call.transport, correlation_id: call.correlation_id, ucan_did_verified: true,
      remote_did: 'did:key:authored-unit-vector', descriptor_cid: cidForBytes(Buffer.from('unit descriptor')),
      identity_proof_cid: cidForBytes(Buffer.from('unit identity')) } };
  const response = { ok: true, owner: call.owner, tool_id: call.tool_id, transport: call.transport, correlation_id: call.correlation_id,
    outcome: 'executed', result, receipt: { owner: call.owner, tool_id: call.tool_id, transport: call.transport, correlation_id: call.correlation_id,
      policy_outcome: 'allow', outcome: 'executed', receipt_id: '', event_dag_refs: [], persistence: {} } };
  const record = { call, response, http_status: 200, finished: true, actual_desktop: false };
  const vector = { app, binding, scenario, record, assertion: { pointer: '/result/result/content/0/json/answer', operator: 'equals', expected: 50 } };
  vector.rebuild = () => {
    vector.receiptBytes = Buffer.from(canonicalJSON({ kind: 'receipt', call, result: response.result }));
    vector.eventBytes = Buffer.from(canonicalJSON({ kind: 'event', call, result: response.result }));
    response.receipt.receipt_id = cidForBytes(vector.receiptBytes);
    response.receipt.event_dag_refs = [cidForBytes(vector.eventBytes)];
    response.receipt.persistence = { status: 'persisted', receipt_cid: response.receipt.receipt_id, event_cid: response.receipt.event_dag_refs[0] };
  };
  vector.rebuild();
  return vector;
}

test('stage3 verifies exact browser/owner/raw receipt joins and derives a typed scalar from retained content', () => {
  const vector = backendVector();
  const proof = verifyBackendProof(vector);
  assert.equal(proof.result_assertion.actual, 50);
  assert.equal(proof.actual_desktop, false);
  assert.equal(proof.receipt_verified, true);
  assert.equal(proof.semantic_result_verified, true);
  assert.equal(proof.receipt_id, cidForBytes(vector.receiptBytes));
});

test('stage3 rejects absent, tampered or fabricated receipt/event bytes despite positive flags', () => {
  for (const kind of ['receiptBytes', 'eventBytes']) {
    const vector = backendVector();
    vector.record.response.receipt_verified = true;
    vector[kind] = Buffer.from('fabricated bytes');
    assert.throws(() => verifyBackendProof(vector), isCode('ARTIFACT_CID_MISMATCH'));
    vector[kind] = undefined;
    assert.throws(() => verifyBackendProof(vector), isCode('ARTIFACT_CID_MISMATCH'));
  }
});

test('stage3 rejects response and receipt owner/tool/transport/app/correlation mismatches', () => {
  for (const [target, key, value] of [['response', 'owner', 'ipfs_kit_py'], ['response', 'correlation_id', 'wrong'],
    ['receipt', 'tool_id', 'wrong'], ['receipt', 'transport', 'libp2p'], ['call', 'app_id', 'notes'], ['input', 'correlation_id', 'wrong']]) {
    const vector = backendVector();
    const object = target === 'input' ? vector.record.call.input : target === 'call' ? vector.record.call : target === 'receipt' ? vector.record.response.receipt : vector.record.response;
    object[key] = value;
    assert.throws(() => verifyBackendProof(vector), error => error instanceof WorkflowError);
  }
});

test('stage3 rejects independently CID-valid raw artifacts joined to a different browser call/result', () => {
  for (const changed of ['call', 'result', 'kind']) {
    const vector = backendVector();
    const payload = JSON.parse(vector.eventBytes);
    if (changed === 'call') payload.call.correlation_id = 'another observed operation';
    if (changed === 'result') payload.result.result.content[0].json.answer = 49;
    if (changed === 'kind') payload.kind = 'receipt';
    vector.eventBytes = Buffer.from(canonicalJSON(payload));
    vector.record.response.receipt.event_dag_refs[0] = cidForBytes(vector.eventBytes);
    vector.record.response.receipt.persistence.event_cid = cidForBytes(vector.eventBytes);
    assert.throws(() => verifyBackendProof(vector), error => error instanceof WorkflowError);
  }
});

test('stage3 rejects native errors, unacknowledged owner results and missing authenticated transport evidence', () => {
  for (const change of [v => { v.record.response.result.result.isError = true; },
    v => { v.record.response.result.result.receipt.status = 'failed'; },
    v => { delete v.record.response.result.result.receipt; },
    v => { v.record.response.result.application_transport_observation.ucan_did_verified = false; },
    v => { v.record.response.result.application_transport_observation.correlation_id = 'wrong'; }]) {
    const vector = backendVector(); change(vector); vector.rebuild();
    assert.throws(() => verifyBackendProof(vector), isCode('OWNER_RESULT_UNVERIFIED'));
  }
});

test('stage3 rejects dry run, unallowlisted tools, absent consent, unsafe payloads and out-of-budget calls', () => {
  for (const change of [v => { v.record.call.input.policy.dry_run = true; }, v => { v.record.call.tool_id = 'undeclared_shell'; },
    v => { v.record.call.input.policy.consent = 'granted'; }, v => { v.record.call.input.payload.nested = { api_key: 'never-dispatch' }; },
    v => { v.record.call.input.payload.url = 'http://owner/private'; }]) {
    const vector = backendVector(); change(vector);
    assert.throws(() => admitBackendCall(vector.record.call, vector.app, vector.scenario), isCode('POLICY_BOUNDARY'));
  }
  const vector = backendVector(); vector.scenario.backend_bindings[0].max_output_bytes = 32;
  assert.throws(() => verifyBackendProof(vector), isCode('BACKEND_OUTPUT_BOUND'));
});

test('stage3 mutation admission requires actual confirmation and explicit isolated fixture scope', () => {
  const vector = backendVector();
  const role = vector.app.backend_roles.find(item => item.bindings.some(binding => binding.mutates_remote_state));
  const binding = role.bindings.find(item => item.mutates_remote_state);
  const call = vector.record.call;
  Object.assign(call, { binding_id: binding.binding_id, owner: role.owner, tool_id: binding.exact_tool_candidates[0], transport: binding.transports[0] });
  vector.scenario.backend_bindings = [{ binding_id: binding.binding_id, mode: 'isolated_mutation', consent: 'ui_required', max_duration_seconds: 1, max_output_bytes: 4096 }];
  Object.assign(call.input.policy, { outcome: 'require_confirmation', consent: 'granted', dry_run: false });
  assert.equal(admitBackendCall(call, vector.app, vector.scenario).binding.binding_id, binding.binding_id);
  delete call.input.payload.fixture_scope;
  assert.throws(() => admitBackendCall(call, vector.app, vector.scenario), isCode('POLICY_BOUNDARY'));
  call.input.payload.fixture_scope = vector.scenario.fixture_scope;
  call.input.policy.consent = 'not_required';
  assert.throws(() => admitBackendCall(call, vector.app, vector.scenario), isCode('POLICY_BOUNDARY'));
});

test('stage3 result pointer reads retained receipt values and refuses type-coerced or supplied actuals', () => {
  const vector = backendVector();
  vector.assertion = { pointer: '/result/result/content/0/json/saved', operator: 'equals', expected: false };
  assert.equal(verifyBackendProof(vector).result_assertion.actual, false);
  vector.assertion.expected = 0;
  assert.throws(() => verifyBackendProof(vector), isCode('POSTCONDITION_FAILED'));
  vector.assertion.actual = false;
  assert.throws(() => verifyBackendProof(vector), isCode('INVALID_SCENARIO'));
});

test('stage3 gateway labels and receipt identity flags cannot substitute for semantic owner output', () => {
  for (const pointer of ['/kind', '/call/tool_id', '/result/application_transport_observation/ucan_did_verified', '/result/result/receipt/tool']) {
    const vector = backendVector();
    vector.assertion.pointer = pointer;
    vector.assertion.expected = readJSONPointer(JSON.parse(vector.receiptBytes), pointer);
    assert.throws(() => verifyBackendProof(vector), isCode('INVALID_OBSERVATION'));
  }
});

test('stage3 reads existing raw CID blocks without network and refuses hash tampering', async t => {
  const vector = backendVector();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'svf-proof-block-unit-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'blocks'));
  const cid = cidForBytes(vector.receiptBytes), block = path.join(directory, 'blocks', cid);
  fs.writeFileSync(block, vector.receiptBytes);
  assert.deepEqual(await readPersistedGatewayArtifact(cid, { artifactRoot: directory }), vector.receiptBytes);
  fs.writeFileSync(block, 'tampered');
  await assert.rejects(readPersistedGatewayArtifact(cid, { artifactRoot: directory }), isCode('ARTIFACT_CID_MISMATCH'));
  await assert.rejects(readPersistedGatewayArtifact('../escape', { artifactRoot: directory }), isCode('ARTIFACT_INVALID'));
});

test('stage3 collector retains exact raw bytes and hashed artifact paths without granting app acceptance', async t => {
  const vector = backendVector();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'svf-proof-collector-unit-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const session = { app: vector.app, scenario: vector.scenario, backend_enabled: true, backend_records: [vector.record],
    outputDir: directory, backend_artifacts: new Map(), backend_observations: [], assertActive: async () => {} };
  const proof = await collectBackendProof({ session, probe: { kind: 'backend_result', binding_id: vector.binding.binding_id, pointer: vector.assertion.pointer },
    operator: 'equals', expected: 50, evidenceRoot: directory,
    artifactReader: async cid => cid === cidForBytes(vector.receiptBytes) ? vector.receiptBytes : vector.eventBytes });
  assert.equal(proof.actual_desktop, false);
  assert.equal(session.backend_artifacts.size, 2);
  assert.deepEqual(fs.readFileSync(path.join(directory, proof.receipt_artifact)), vector.receiptBytes);
  assert.deepEqual(fs.readFileSync(path.join(directory, proof.event_artifact)), vector.eventBytes);
});

test('stage3 collector refuses an unfinished/failed observation or forged flags without bytes', async t => {
  const vector = backendVector();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'svf-missing-proof-unit-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  vector.record.error = 'BACKEND_REQUEST_FAILED';
  const session = { app: vector.app, scenario: vector.scenario, backend_enabled: true, backend_records: [vector.record],
    outputDir: directory, backend_artifacts: new Map(), backend_observations: [], assertActive: async () => {} };
  await assert.rejects(collectBackendProof({ session, probe: { kind: 'backend_result', binding_id: vector.binding.binding_id, pointer: vector.assertion.pointer },
    operator: 'equals', expected: 50, artifactReader: async () => { throw new Error('must not read artifacts'); } }), isCode('BACKEND_EVIDENCE_MISSING'));
  assert.equal(fs.readdirSync(directory).length, 0);
});

test('stage3 scalar property and JSON-pointer probes preserve numeric/boolean types from actual DOM', async t => {
  const fixture = unitDesktop(t), session = await fixture.open();
  assert.equal(await observeDOMProbe(session, { kind: 'json_attribute', selector: '#json', attribute: 'data-state', pointer: '/count' }), 2);
  assert.equal(await observeDOMProbe(session, { kind: 'dom_property', selector: '#toggle', property: 'disabled' }), false);
  await fixture.document.querySelector('#input').focus();
  assert.equal(await observeDOMProbe(session, { kind: 'dom_property', selector: '#input', property: 'focused' }), true);
  assert.throws(() => validateScenario({ ...scenarioFor(), phases: { ...scenarioFor().phases,
    primary_result: [{ op: 'assert', requirement_id: 'result_1', probe: { kind: 'dom_property', selector: '#input', property: 'outerHTML' }, operator: 'equals', expected: 'invented' }] } }, calculator), isCode('POLICY_BOUNDARY'));
});

test('stage3 browser observer admits only selected calls and joins actual response event bytes', async t => {
  const vector = backendVector(), fixture = unitDesktop(t, { app: vector.app, scenario: vector.scenario });
  const session = await fixture.open({ backendProof: true });
  const request = { url: () => 'http://127.0.0.1:3017/mcp/tools/call', method: () => 'POST', resourceType: () => 'fetch', postData: () => JSON.stringify(vector.record.call) };
  let action;
  await fixture.calls.routes[0]({ request: () => request, continue: async () => { action = 'continue'; }, abort: async () => { action = 'abort'; } });
  assert.equal(action, 'continue');
  assert.equal(session.backend_records.length, 1);
  assert.equal(session.backend_records[0].finished, false);
  await fixture.calls.events.response[0]({ request: () => request, status: () => 200, headers: () => ({}), body: async () => Buffer.from(JSON.stringify(vector.record.response)) });
  assert.equal(session.backend_records[0].finished, true);
  assert.deepEqual(session.backend_records[0].response, vector.record.response);
  assert.equal(session.backend_records[0].actual_desktop, false);
  const bad = { ...request, postData: () => JSON.stringify({ ...vector.record.call, tool_id: 'unlisted' }) };
  await fixture.calls.routes[0]({ request: () => bad, continue: async () => { action = 'continue'; }, abort: async () => { action = 'abort'; } });
  assert.equal(action, 'abort');
  assert.equal(session.unexpected_backend_calls, 1);
  assert.equal(session.backend_records.length, 1);
});

test('stage3 browser observer fails closed for oversized/invalid responses without exporting body text', async t => {
  const vector = backendVector(), fixture = unitDesktop(t, { app: vector.app, scenario: vector.scenario });
  const session = await fixture.open({ backendProof: true });
  const request = { url: () => 'http://127.0.0.1:3017/mcp/tools/call', method: () => 'POST', resourceType: () => 'fetch', postData: () => JSON.stringify(vector.record.call) };
  await fixture.calls.routes[0]({ request: () => request, continue: async () => {}, abort: async () => assert.fail('valid request unexpectedly blocked') });
  await fixture.calls.events.response[0]({ request: () => request, status: () => 200, headers: () => ({ 'content-length': '10000000' }),
    body: async () => { throw new Error('private native body must never be read'); } });
  assert.equal(session.backend_records[0].error, 'BACKEND_OUTPUT_BOUND');
  assert.equal(session.backend_records[0].finished, true);
  assert.equal(session.backend_records[0].response, undefined);
  assert.equal(JSON.stringify(session.backend_records).includes('private native body'), false);
});

test('stage3 JSON field projection cannot bypass private value guards', async t => {
  const fixture = unitDesktop(t), session = await fixture.open();
  fixture.document.querySelector('#json').setAttribute('data-state', '{"count":2,"nested":{"api_key":"private-unit-value"}}');
  await assert.rejects(observeDOMProbe(session, { kind: 'json_attribute', selector: '#json', attribute: 'data-state', pointer: '/count' }), /SECRET_OBSERVATION_BLOCKED/);
  await assert.rejects(observeDOMProbe(session, { kind: 'dom_property', selector: '#password', property: 'focused' }), /SECRET_OBSERVATION_BLOCKED/);
});

test('stage3 temporal probes derive numeric deltas and reject stationary or nonnumeric state', async t => {
  const options = {}, fixture = unitDesktop(t, options), session = await fixture.open();
  const node = fixture.document.querySelector('#json');
  const probe = { kind: 'json_attribute', selector: '#json', attribute: 'data-state', pointer: '/count', temporal_ms: 100 };
  assert.equal(await observeDOMProbe(session, probe), 0);
  options.onWait = () => node.setAttribute('data-state', '{"count":3.5}');
  assert.equal(await observeDOMProbe(session, probe), 1.5);
  node.setAttribute('data-state', '{"count":false}'); options.onWait = () => {};
  await assert.rejects(observeDOMProbe(session, probe), isCode('INVALID_OBSERVATION'));
  assert.throws(() => validateScenario({ ...scenarioFor(), phases: { ...scenarioFor().phases, primary_result: [{ op: 'assert', requirement_id: 'result_1',
    probe: { ...probe, temporal_ms: 5000 }, operator: 'at_least', expected: 1 }] } }, calculator), isCode('INVALID_OBSERVATION'));
});

test('stage3 stale app source, scenario and contract hashes invalidate a workflow snapshot', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'svf-source-snapshot-unit-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'app.js'), contract = path.join(directory, 'contract.json'), scenario = path.join(directory, 'scenario.json');
  for (const target of [source, contract, scenario]) fs.writeFileSync(target, '{}');
  const app = { source_paths: ['app.js'] }, options = { projectRoot: directory, contractsPath: contract, scenarioPath: scenario };
  for (const target of [source, contract, scenario]) {
    const snapshot = workflowSourceSnapshot(app, options);
    assertWorkflowSources(snapshot, app, options);
    fs.writeFileSync(target, '{"changed":true}');
    assert.throws(() => assertWorkflowSources(snapshot, app, options), isCode('STALE_SOURCE'));
    fs.writeFileSync(target, '{}');
  }
});

test('stage3 layout detector rejects empty and off-viewport actual native surfaces', async t => {
  const fixture = unitDesktop(t), session = await fixture.open();
  const primary = fixture.document.querySelector('.window-app-content');
  primary.getBoundingClientRect = () => ({ left: 0, top: 20, width: 300, height: 200, right: 300, bottom: 220 });
  assert.deepEqual(collectWorkflowLayout(primary).violations, []);
  fixture.document.querySelector('.window').getBoundingClientRect = () => ({ left: 0, top: 0, right: 2000, bottom: 220 });
  assert.ok(collectWorkflowLayout(primary).violations.includes('app_window_outside_horizontal_viewport'));
  primary.replaceChildren();
  assert.ok(collectWorkflowLayout(primary).violations.includes('primary_content_empty'));
  assert.equal(session.actual_desktop, false);
});

test('stage3 unit DOM and forged actual-desktop flags cannot grant complete workflow acceptance', async t => {
  const fixture = unitDesktop(t), session = await fixture.open();
  await assert.rejects(Promise.resolve().then(() => assembleWorkflowReport({ session, actualSession: true })), isCode('SYNTHETIC_PROOF'));
  session.actual_desktop = true;
  assert.throws(() => assembleWorkflowReport({ session, actualSession: true }), isCode('SYNTHETIC_PROOF'));
});

test('stage3 typed report assembly retains all phases/checks but gives unit evidence no acceptance', async t => {
  const fixture = unitDesktop(t), session = await fixture.open(), scenario = scenarioFor();
  scenario.phases.primary_result[1] = { op: 'press', selector: '#input', key: 'Enter' };
  for (const phase of PHASES) await executeScenarioPhase(session, phase, scenario.phases[phase]);
  const settings = { app: calculator, scenario, sources: { contract_sha256: 'unit', source_sha256: {} }, session,
    viewports: ['desktop', 'mobile'].map(name => ({ name, layout: { violations: [] } })),
    artifacts: ['desktop.png', 'mobile.png', 'trace.zip'].map(name => ({ path: `unit/${name}`, sha256: 'unit-vector', bytes: 1 })) };
  const report = buildWorkflowEvidence(settings);
  assert.equal(report.passed, false);
  assert.equal(report.actual_desktop, false);
  assert.equal(report.completion_authority, false);
  assert.equal(report.semantic_assertions.length, 3);
  assert.deepEqual(report.checks.map(item => item.kind), ['primary_result', 'keyboard', 'desktop_layout', 'mobile_layout', 'error_recovery']);
  session.unexpected_backend_calls = 1;
  assert.throws(() => buildWorkflowEvidence(settings), isCode('POLICY_BOUNDARY'));
  session.unexpected_backend_calls = 0;
  settings.artifacts.pop();
  assert.throws(() => buildWorkflowEvidence(settings), isCode('ARTIFACT_MISSING'));
});

test('stage3 report rejects generic keyboard events without their own semantic result', async t => {
  const fixture = unitDesktop(t), session = await fixture.open(), scenario = scenarioFor();
  for (const phase of PHASES) await executeScenarioPhase(session, phase, scenario.phases[phase]);
  session.keyboard_focus_observations.push({ phase: 'primary_result', step_index: 0, key: 'Tab', focused: true, inside_app: true });
  assert.throws(() => buildWorkflowEvidence({ app: calculator, scenario, sources: {}, session, viewports: [], artifacts: [] }), isCode('MISSING_POSTCONDITION'));
});

test('stage3 foundation CLI runs concrete proof and report detectors without browser/app acceptance', () => {
  // Exclude this CLI test from its own spawned detector set to avoid recursion.
  const result = spawnSync(process.execPath, [filename, '--foundation-check', 'stage3'], { encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const check = JSON.parse(result.stdout);
  assert.equal(check.stage, 'stage3');
  assert.ok(check.executable_tests_passed >= 12);
  assert.equal(check.actual_desktop, false);
  assert.equal(check.functional_acceptance, 'not_evaluated');
  assert.equal(check.completion_authority, false);
});


test('stage3 request phase is captured before async response and cannot drift with later steps', async t => {
  const vector = backendVector(), fixture = unitDesktop(t, { app: vector.app, scenario: vector.scenario });
  const session = await fixture.open({ backendProof: true });
  session.failure_context = { phase: 'primary_result', step: 0 };
  const generation = session.generation;
  const request = { url: () => 'http://127.0.0.1:3017/mcp/tools/call', method: () => 'POST', resourceType: () => 'fetch', postData: () => JSON.stringify(vector.record.call) };
  await fixture.calls.routes[0]({ request: () => request, continue: async () => {}, abort: async () => assert.fail('valid native call rejected') });
  session.failure_context = { phase: 'failure_recovery', step: 1 };
  await fixture.calls.events.response[0]({ request: () => request, status: () => 200, headers: () => ({}), body: async () => Buffer.from(JSON.stringify(vector.record.response)) });
  const observed = session.backend_records[0].request_phase;
  assert.equal(observed.phase, 'primary_result'); assert.equal(observed.step_index, 0);
  assert.equal(observed.request_index, 0); assert.equal(observed.generation, generation);
  assert.equal(observed.correlation_id, vector.record.call.correlation_id);
  assert.equal(Object.isFrozen(observed), true);
  assert.equal(session.backend_records[0].actual_desktop, false);
});
