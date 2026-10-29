// Authored lifecycle and file vectors only. These tests never qualify a browser/backend.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  VIEWPORTS, PHASES, INDEPENDENT_STATIC_INPUTS, INDEPENDENT_OPTIONAL_INPUTS, INDEPENDENT_WORKFLOW_SCHEMA, VIEWPORT_WORKFLOW_SCHEMA,
  parseArguments, independentWorkflowInputPaths, independentWorkflowSourceSnapshot, assertIndependentWorkflowSources,
  buildViewportWorkflowEvidence, validateViewportWorkflowReport, buildIndependentWorkflowEvidence,
  assembleIndependentWorkflowReport, runIndependentViewportSessions,
} from '../../scripts/run-visual-functional-workflow.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => structuredClone(value);
const { cidForBytes } = createRequire(import.meta.url)('../../scripts/mcpplusplus-profile-a.cjs');
const app = { app_id: 'calculator', disposition: 'browser_local', source_paths: ['web/js/calculator.js'], backend_roles: [],
  primary_workflow: { expected_results: ['Observed arithmetic result'], persist_reopen: 'Restored result', error: 'Observed invalid input', recovery: 'Clear and calculate again' } };
const assertion = (id, expected) => ({ op: 'assert', requirement_id: id, probe: { kind: 'text', selector: '#result' }, operator: 'equals', expected });
const scenario = { schema: 'swissknife.visual-functional-scenario.v1', app_id: app.app_id, fixture_scope: 'svf-authored-dual-fixture', backend_bindings: [], phases: {
  primary_result: [{ op: 'press', selector: '#equals', key: 'Enter' }, assertion('result_1', '50')],
  persist_reopen: [{ op: 'reopen_app' }, assertion('persist_reopen', '50')],
  failure_recovery: [{ op: 'fill', selector: '#expression', value: 'invalid' },
    { op: 'assert', checkpoint_id: 'error_observed', probe: { kind: 'text', selector: '#result' }, operator: 'equals', expected: 'Invalid input' },
    { op: 'click', selector: '#clear' }, assertion('failure_recovery', '50')],
} };

function fixture(t, fixtureApp = app, fixtureScenario = scenario) {
  const app = fixtureApp, scenario = fixtureScenario;
  const root = fs.mkdtempSync(path.join('/dev/shm', 'svf-dual-unit-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, data) => { const target = path.join(root, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, data); return target; };
  for (const name of [...INDEPENDENT_STATIC_INPUTS, 'swissknife/web/js/calculator.js']) write(name, '// authored source not executed\n' + name);
  write('swissknife/web/index.html', '<LINK href="/css/one.css" rel="stylesheet"><link rel=stylesheet href=\'/css/two.css\'>');
  write('swissknife/web/css/one.css', 'body { color: black; }'); write('swissknife/web/css/two.css', 'button { color: blue; }');
  const contractsPath = write('swissknife/config/contract.json', JSON.stringify({ authored: true, app }));
  const scenarioPath = write('swissknife/test/e2e/functional-workflows/calculator.json', JSON.stringify(scenario));
  const options = { projectRoot: path.join(root, 'swissknife'), contractsPath, scenarioPath };
  const sources = independentWorkflowSourceSnapshot(app, options);
  const outputDir = path.join(root, 'runtime/attempt-authored');
  const record = name => { const bytes = fs.readFileSync(path.join(root, name)); return { path: name, sha256: sha(bytes), bytes: bytes.length }; };
  function child(viewport) {
    const prefix = 'runtime/attempt-authored/' + viewport.name;
    const png = Buffer.alloc(129); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png); Buffer.from('IHDR').copy(png, 12); png.writeUInt32BE(viewport.width, 16); png.writeUInt32BE(viewport.height, 20);
    write(prefix + '/' + viewport.name + '.png', png); write(prefix + '/trace.zip', 'AUTHORED_NOT_A_BROWSER_TRACE');
    const layout = { viewport: { width: viewport.width, height: viewport.height }, window: { left: 0, top: 0, right: viewport.width, bottom: viewport.height },
      primary: { left: 1, top: 33, width: 200, height: 100 }, violations: [] };
    write(prefix + '/' + viewport.name + '-layout.json', JSON.stringify(layout));
    const semantics = { result_1: app.primary_workflow.expected_results[0], persist_reopen: app.primary_workflow.persist_reopen,
      failure_recovery: app.primary_workflow.error + ' Recovery: ' + app.primary_workflow.recovery };
    const rows = [];
    let checkpoint;
    for (const phase of PHASES) scenario.phases[phase].forEach((step, index) => {
      if (step.op !== 'assert') return;
      const row = { phase, step_index: index, probe: step.probe, observed: { operator: step.operator, actual: step.expected, expected: step.expected } };
      if (step.requirement_id) rows.push({ ...row, requirement_id: step.requirement_id, requirement_text: semantics[step.requirement_id] });
      else checkpoint = { ...row, checkpoint_id: step.checkpoint_id };
    });
    const session = { viewport, initial_viewport: viewport, session_id: randomUUID(), semantic_assertions: rows,
      checkpoints: [checkpoint], keyboard_focus_observations: [{ phase: 'primary_result', step_index: 0, key: 'Enter', focused: true, inside_app: true, semantic_requirement_id: 'result_1' }],
      backend_records: app.disposition === 'tool_backed' ? [{}] : [],
      backend_observations: scenario.backend_bindings.map(intent => ({ binding_id: intent.binding_id, actual_desktop: true,
        correlation_id: viewport.name + ':authored-call', receipt_id: viewport.name + ':authored-receipt', event_dag_cid: viewport.name + ':authored-event' })),
      unexpected_backend_calls: 0, backend_policy_errors: [], actual_desktop: true };
    const backendArtifacts = [];
    for (const row of session.backend_observations) for (const kind of ['receipt', 'event']) {
      const bytes = Buffer.from(JSON.stringify({ kind, call: { app_id: app.app_id, binding_id: row.binding_id, correlation_id: row.correlation_id }, result: { authored: true } }));
      const cid = cidForBytes(bytes), name = prefix + '/backend/' + kind + '-' + cid + '.json';
      write(name, bytes); row[kind === 'receipt' ? 'receipt_id' : 'event_dag_cid'] = cid;
      row[kind + '_artifact'] = name; backendArtifacts.push(record(name));
    }
    const evidence = buildViewportWorkflowEvidence({ app, scenario, sources, session, viewports: [{ name: viewport.name, layout }],
      artifacts: [record(prefix + '/' + viewport.name + '.png'), record(prefix + '/' + viewport.name + '-layout.json'), record(prefix + '/trace.zip'), ...backendArtifacts] });
    assert.equal(evidence.passed, false); assert.equal(evidence.actual_desktop, false);
    // Deliberately authored positive headers exercise the independent consumer;
    // private actual-browser promotion MUST still reject these fixtures.
    const report = { ...evidence, passed: true, actual_desktop: true };
    return persist({ viewport, report });
  }
  function persist(value) {
    const name = 'runtime/attempt-authored/' + value.viewport.name + '/workflow.json';
    write(name, JSON.stringify(value.report, null, 2) + '\n'); value.reference = record(name); return value;
  }
  return { root, write, record, options, sources, outputDir, child, persist,
    settings(children) { return { app, scenario, sources, children, outputDir, workspaceRoot: root }; } };
}

test('opt-in CLI is explicit; legacy flags stay unchanged and duplicates/foundation opt-in refuse', () => {
  const args = ['--app', 'calculator', '--contracts', 'contract.json', '--output-dir', '/tmp/unit'];
  assert.equal(parseArguments(args).independentViewports, undefined);
  assert.equal(parseArguments([...args, '--independent-viewports']).independentViewports, true);
  assert.throws(() => parseArguments([...args, '--independent-viewports', '--independent-viewports']));
  assert.throws(() => parseArguments(['--foundation-check', 'stage1', '--independent-viewports']));
});

test('complete closure binds controller, exact contract/scenario/app and every parsed local stylesheet', t => {
  const f = fixture(t);
  for (const name of [...INDEPENDENT_STATIC_INPUTS, 'swissknife/web/js/calculator.js', 'swissknife/web/css/one.css', 'swissknife/web/css/two.css']) assert.ok(f.sources.source_sha256[name], name);
  for (const name of ['swissknife/web/js/calculator.js', 'scripts/swissknife_visual_functional_final_coverage.py', 'swissknife/web/css/two.css', 'swissknife/test/e2e/functional-workflows/calculator.json']) {
    const p = path.join(f.root, name), old = fs.readFileSync(p); fs.appendFileSync(p, '\n// changed bytes');
    assert.throws(() => assertIndependentWorkflowSources(f.sources, app, f.options), /closure changed/); fs.writeFileSync(p, old);
  }
  assertIndependentWorkflowSources(f.sources, app, f.options);
});

test('source closure rejects symlink ancestry, duplicate link attributes and nonlocal stylesheet', t => {
  const f = fixture(t), p = path.join(f.root, 'swissknife/web/css/two.css'); fs.renameSync(p, p + '.real'); fs.symlinkSync(p + '.real', p);
  assert.throws(() => independentWorkflowSourceSnapshot(app, f.options)); fs.unlinkSync(p); fs.renameSync(p + '.real', p);
  for (const html of ['<link rel=stylesheet href="/css/one.css" href="/css/two.css">', '<link rel=stylesheet href="https://outside.invalid/a.css">']) {
    f.write('swissknife/web/index.html', html); assert.throws(() => independentWorkflowSourceSnapshot(app, f.options));
  }
});

test('AST collector follows selected imports, reexports, literal dynamics and worklet URLs without walking other app factories', t => {
  const f = fixture(t);
  f.write('swissknife/web/js/calculator.js', "import './static.js'; export { value } from './typed.js'; const moduleName='./dynamic.js'; import(moduleName); new URL('./worklet.js',import.meta.url); // import('./missing-comment.js')\n");
  for (const name of ['static.js', 'dynamic.js', 'worklet.js']) f.write('swissknife/web/js/' + name, 'export const value=1;');
  f.write('swissknife/web/js/typed.ts', 'export const value: number=1;');
  f.write('swissknife/web/js/main-simple.js', "import './shared.js'; import('./apps/not-selected.js'); import('./core/needed.js');");
  f.write('swissknife/web/js/shared.js', 'export const value=1;'); f.write('swissknife/web/js/core/needed.js', 'export const value=1;');
  const paths = independentWorkflowInputPaths(app, f.options);
  for (const name of ['static.js', 'dynamic.js', 'worklet.js', 'typed.ts', 'shared.js', 'core/needed.js']) assert.ok(paths.includes('swissknife/web/js/' + name), name);
  assert.ok(!paths.includes('swissknife/web/js/apps/not-selected.js'));
  assert.ok(!paths.includes('swissknife/web/js/missing-comment.js'));
  const snapshot = independentWorkflowSourceSnapshot(app, f.options);
  f.write('swissknife/web/js/dynamic.js', 'export const value=2;');
  assert.throws(() => assertIndependentWorkflowSources(snapshot, app, f.options));
});

test('only the exact approved optional const import binds absent→present without a stub', t => {
  const f = fixture(t), optional = INDEPENDENT_OPTIONAL_INPUTS[0];
  // The fixture app file is one directory shallower than real apps/ imports.
  f.write('swissknife/web/js/calculator.js', "const optional='../../ipfs_accelerate_js/src/p2p/collaborative-file-system.js'; import(optional);");
  const snapshot = independentWorkflowSourceSnapshot(app, f.options);
  assert.equal(snapshot.source_sha256[optional], null); assert.ok(independentWorkflowInputPaths(app, f.options).includes(optional));
  f.write(optional, 'export const available=true;');
  assert.throws(() => assertIndependentWorkflowSources(snapshot, app, f.options));
  assert.match(independentWorkflowSourceSnapshot(app, f.options).source_sha256[optional], /^[0-9a-f]{64}$/);
});

for (const location of ['final', 'ancestor']) test(`approved absence rejects ${location} dangling symlinks`, t => {
  const f = fixture(t), optional = INDEPENDENT_OPTIONAL_INPUTS[0];
  f.write('swissknife/web/js/calculator.js', "import('../../ipfs_accelerate_js/src/p2p/collaborative-file-system.js');");
  const link = location === 'final' ? path.join(f.root, optional) : path.join(f.root, 'swissknife/ipfs_accelerate_js');
  fs.mkdirSync(path.dirname(link), { recursive: true }); fs.symlinkSync('/missing/authored-target', link);
  assert.throws(() => independentWorkflowSourceSnapshot(app, f.options), /physical/);
});

test('future non-JS consumer may be absent during input-path planning but not actual source admission', t => {
  const f = fixture(t), name = 'scripts/swissknife_visual_functional_final_coverage.py'; fs.unlinkSync(path.join(f.root, name));
  assert.ok(independentWorkflowInputPaths(app, f.options).includes(name));
  assert.throws(() => independentWorkflowSourceSnapshot(app, f.options));
});

test('projectRoot override controls default contract/scenario and cannot return escaped planning inputs', t => {
  const f=fixture(t);
  f.write('swissknife/config/visual-functional-app-contracts.json',JSON.stringify({apps:[app]}));
  const options={projectRoot:path.join(f.root,'swissknife')};
  const paths=independentWorkflowInputPaths(app,options);
  assert.ok(paths.includes('swissknife/test/e2e/functional-workflows/calculator.json'));
  assert.ok(paths.includes('swissknife/config/visual-functional-app-contracts.json'));
  assert.ok(paths.every(name=>!name.split('/').includes('..')&&!path.isAbsolute(name)));
  assertIndependentWorkflowSources(independentWorkflowSourceSnapshot(app,options),app,options);
  assert.throws(()=>independentWorkflowInputPaths(app,{...options,scenarioPath:'/outside/workspace/scenario.json'}),/supplied physical workspace/);
});

for (const body of ["import(window.nextModule);", "require(window.nextModule);", "import('./missing-required.js');"]) test(`unknown or missing module refuses: ${body}`, t => {
  const f = fixture(t); f.write('swissknife/web/js/calculator.js', body);
  assert.throws(() => independentWorkflowInputPaths(app, f.options));
});

test('actual Vite first-party aliases resolve physical TypeScript sources and changed alias policy refuses', t => {
  const f = fixture(t);
  f.write('swissknife/build-tools/configs/vite.web.config.ts', "const repoRoot=resolve(configDir,'../..');export default {resolve:{alias:{'@':resolve(repoRoot,'src')}}};");
  f.write('swissknife/web/js/calculator.js', "import '@/local-helper';"); f.write('swissknife/src/local-helper.ts', 'export const value:number=1;');
  assert.ok(independentWorkflowInputPaths(app, f.options).includes('swissknife/src/local-helper.ts'));
  f.write('swissknife/build-tools/configs/vite.web.config.ts', "const repoRoot=resolve(configDir,'../..');export default {resolve:{alias:{'@':resolve(repoRoot,'different')}}};");
  assert.throws(() => independentWorkflowInputPaths(app, f.options), /alias changed/);
});

test('dependency count bound refuses before any browser/provider admission', t => {
  const f = fixture(t); const imports=[];
  for (let index=0; index<512; index++) { const name='leaf-'+index+'.js'; imports.push("import './"+name+"';"); f.write('swissknife/web/js/'+name,'export const value=1;'); }
  f.write('swissknife/web/js/calculator.js',imports.join('\n'));
  assert.throws(() => independentWorkflowInputPaths(app,f.options), /file bound/);
});

test('two independent full child shapes join without copying assertions or gaining actual authority', t => {
  const f = fixture(t), children = VIEWPORTS.map(v => f.child(v));
  const result = buildIndependentWorkflowEvidence(f.settings(children));
  assert.equal(result.schema, INDEPENDENT_WORKFLOW_SCHEMA); assert.equal(result.passed, false); assert.equal(result.actual_desktop, false);
  assert.equal(result.semantic_assertions, undefined); assert.equal(result.viewport_reports.length, 2);
  assert.equal(result.artifacts.length, 8); assert.notEqual(children[0].report.session_id, children[1].report.session_id);
  assert.throws(() => assembleIndependentWorkflowReport(f.settings(children)), /actual browser sessions/);
});

test('tool-backed children retain separate raw owner call/receipt namespaces; copied desktop receipt refuses', t => {
  const toolApp = { ...clone(app), disposition: 'tool_backed', backend_roles: [{ bindings: [{ binding_id: 'calculator.retrieve', mutates_remote_state: false }] }] };
  const toolScenario = { ...clone(scenario), backend_bindings: [{ binding_id: 'calculator.retrieve', mode: 'read', consent: 'not_required', max_duration_seconds: 5, max_output_bytes: 4096 }] };
  const f = fixture(t, toolApp, toolScenario), children = VIEWPORTS.map(v => f.child(v));
  const result = buildIndependentWorkflowEvidence(f.settings(children)); assert.equal(result.passed, false);
  const first = children[0].report.backend_observations[0], second = children[1].report.backend_observations[0];
  second.correlation_id = first.correlation_id;
  f.persist(children[1]); assert.throws(() => buildIndependentWorkflowEvidence(f.settings(children)), /another child call/);
});

test('matching copied backend bytes cannot reuse the same desktop operation for mobile', t => {
  const toolApp = { ...clone(app), disposition: 'tool_backed', backend_roles: [{ bindings: [{ binding_id: 'calculator.retrieve', mutates_remote_state: false }] }] };
  const toolScenario = { ...clone(scenario), backend_bindings: [{ binding_id: 'calculator.retrieve', mode: 'read', consent: 'not_required', max_duration_seconds: 5, max_output_bytes: 4096 }] };
  const f = fixture(t, toolApp, toolScenario), children = VIEWPORTS.map(v => f.child(v));
  const first = children[0].report.backend_observations[0], copy = clone(first);
  for (const kind of ['receipt', 'event']) {
    const oldName = first[kind + '_artifact'], name = oldName.replace('/desktop/', '/mobile/');
    f.write(name, fs.readFileSync(path.join(f.root, oldName))); copy[kind + '_artifact'] = name;
    children[1].report.artifacts.push(f.record(name));
  }
  children[1].report.backend_observations = [copy]; f.persist(children[1]);
  assert.throws(() => buildIndependentWorkflowEvidence(f.settings(children)), /reuse another viewport/);
});

for (const failure of ['missing-mobile', 'duplicate-desktop', 'same-session', 'mobile-mislabeled', 'copied-desktop-source', 'missing-mobile-assertion', 'wrong-scenario-step', 'fake-keyboard', 'missing-error']) {
  test(`V2 refuses ${failure}`, t => {
    const f = fixture(t), children = VIEWPORTS.map(v => f.child(v));
    if (failure === 'missing-mobile') children.pop();
    if (failure === 'duplicate-desktop') children[1] = children[0];
    if (failure === 'same-session') children[1].report.session_id = children[0].report.session_id;
    if (failure === 'mobile-mislabeled') children[1].report.viewport = clone(VIEWPORTS[0]);
    if (failure === 'copied-desktop-source') children[1].report.source_sha256['swissknife/web/js/calculator.js'] = '0'.repeat(64);
    if (failure === 'missing-mobile-assertion') children[1].report.semantic_assertions.pop();
    if (failure === 'wrong-scenario-step') children[1].report.semantic_assertions[0].step_index = 0;
    if (failure === 'fake-keyboard') children[1].report.keyboard_observations[0].step_index = 1;
    if (failure === 'missing-error') children[1].report.error_observations = [];
    if (children.length === 2 && children[1] !== children[0]) f.persist(children[1]);
    assert.throws(() => buildIndependentWorkflowEvidence(f.settings(children)));
  });
}

for (const failure of ['changed-artifact', 'wrong-png-size', 'wrong-png-header', 'screenshot-from-desktop', 'layout-detached', 'outside-child', 'symlink-artifact', 'report-body-mismatch']) {
  test(`V2 strict artifact join refuses ${failure}`, t => {
    const f = fixture(t), children = VIEWPORTS.map(v => f.child(v)), child = children[1];
    if (failure === 'changed-artifact') fs.appendFileSync(path.join(f.root, child.report.result_screenshot.path), 'changed');
    if (failure === 'wrong-png-size') {
      const p = child.report.result_screenshot.path, png = fs.readFileSync(path.join(f.root, p)); png.writeUInt32BE(1440, 16); f.write(p, png);
      const ref = f.record(p); child.report.artifacts[0] = ref; child.report.result_screenshot = ref;
    }
    if (failure === 'wrong-png-header') {
      const p=child.report.result_screenshot.path, png=fs.readFileSync(path.join(f.root,p));Buffer.from('FAKE').copy(png,12);f.write(p,png);
      const ref=f.record(p);child.report.artifacts[0]=ref;child.report.result_screenshot=ref;
    }
    if (failure === 'screenshot-from-desktop') child.report.result_screenshot = children[0].report.result_screenshot;
    if (failure === 'layout-detached') child.report.viewports[0].primary.width = 999;
    if (failure === 'outside-child') child.report.artifacts.push(children[0].report.artifacts[0]);
    if (failure === 'symlink-artifact') { const p = path.join(f.root, child.report.artifacts[0].path); fs.renameSync(p, p + '.real'); fs.symlinkSync(p + '.real', p); }
    if (failure === 'report-body-mismatch') child.report.session_id = randomUUID();
    else f.persist(child);
    assert.throws(() => buildIndependentWorkflowEvidence(f.settings(children)));
  });
}

test('geometry exactly preserves collector ±1px and intentional internal vertical scrolling', t => {
  const f=fixture(t), children=VIEWPORTS.map(v=>f.child(v)), mobile=children[1];
  const layout=mobile.report.viewports[0]; layout.window.left=-1;layout.window.right=391;layout.primary.left=-1;layout.primary.width=392;layout.primary.height=2000;
  const update=()=>{const {name,...body}=layout;const p=mobile.report.artifacts.find(r=>r.path.endsWith('/mobile-layout.json')).path;f.write(p,JSON.stringify(body));mobile.report.artifacts[1]=f.record(p);f.persist(mobile);};
  update();assert.equal(buildIndependentWorkflowEvidence(f.settings(children)).passed,false);
  layout.primary.top=layout.window.bottom;update();assert.throws(()=>buildIndependentWorkflowEvidence(f.settings(children)),/geometry/);
});

test('observed call-phase counts preserve unknown and refuse inconsistent totals', t => {
  const f=fixture(t), children=VIEWPORTS.map(v=>f.child(v));
  assert.deepEqual(children[0].report.backend_call_phases,{primary_result:0,persist_reopen:0,failure_recovery:0,backend_proof:0,unknown:0});
  children[1].report.backend_call_phases.primary_result=1;f.persist(children[1]);
  assert.throws(()=>buildIndependentWorkflowEvidence(f.settings(children)),/dispatch-phase counts/);
});

function lifecycle(overrides = {}) {
  const trace = [], scenarioRows = clone(scenario), sessionIds = [];
  const settings = { app, scenario: scenarioRows, assertSources() { trace.push('source'); },
    async openSession(viewport) {
      const id = randomUUID(); sessionIds.push(id); trace.push('open:' + viewport.name);
      return { session_id: id, viewport: clone(viewport), initial_viewport: clone(viewport), async close() { trace.push('close:' + viewport.name); } };
    }, async executePhase(session, phase, steps) { assert.equal(steps, scenarioRows.phases[phase]); trace.push('phase:' + session.viewport.name + ':' + phase); },
    async captureSession(session, viewport) { trace.push('capture:' + viewport.name); return { authored: true, session_id: session.session_id }; },
    async saveSession(prepared, session, viewport) { trace.push('save:' + viewport.name); return { ...prepared, viewport }; },
    async onFailure(error, session, viewport) { trace.push('failure:' + viewport.name); }, ...overrides };
  return { trace, sessionIds, settings };
}

test('same actual orchestration starts two distinct canonical sessions and runs every unchanged phase before own capture/cleanup/save', async () => {
  const f = lifecycle(); const result = await runIndependentViewportSessions(f.settings);
  const events = f.trace.filter(item => item !== 'source');
  assert.deepEqual(events, VIEWPORTS.flatMap(v => ['open:' + v.name, ...PHASES.map(p => 'phase:' + v.name + ':' + p), 'capture:' + v.name, 'close:' + v.name, 'save:' + v.name]));
  assert.equal(result.length, 2); assert.notEqual(f.sessionIds[0], f.sessionIds[1]);
});

test('mobile semantic failure cleans its own session and cannot save mobile or parent acceptance', async () => {
  const f = lifecycle(); f.settings.executePhase = async (session, phase) => { f.trace.push('phase:' + session.viewport.name + ':' + phase); if (session.viewport.name === 'mobile' && phase === 'primary_result') throw new Error('actual-shaped mobile result failed'); };
  await assert.rejects(runIndependentViewportSessions(f.settings), /mobile result failed/);
  assert.ok(f.trace.includes('close:desktop')); assert.ok(f.trace.includes('close:mobile'));
  assert.ok(f.trace.includes('failure:mobile')); assert.ok(!f.trace.includes('capture:mobile')); assert.ok(!f.trace.includes('save:mobile'));
});

test('source drift after owned cleanup refuses child save and second session admission', async () => {
  const f = lifecycle(); let drift = false;
  const originalOpen = f.settings.openSession;
  f.settings.openSession = async viewport => { const session = await originalOpen(viewport); session.close = async () => { f.trace.push('close:' + viewport.name); drift = true; }; return session; };
  f.settings.assertSources = () => { if (drift) throw new Error('source drift'); };
  await assert.rejects(runIndependentViewportSessions(f.settings), /source drift/);
  assert.ok(f.trace.includes('close:desktop')); assert.ok(!f.trace.includes('save:desktop')); assert.ok(!f.trace.includes('open:mobile'));
});

test('cleanup failure cannot save a successful child and original semantic failure stays authoritative', async () => {
  for (const failPhase of [false, true]) {
    const f = lifecycle(); const originalOpen = f.settings.openSession;
    f.settings.openSession = async v => { const session = await originalOpen(v); session.close = async () => { throw new Error('owned cleanup failed'); }; return session; };
    if (failPhase) f.settings.executePhase = async () => { throw new Error('original semantic failure'); };
    await assert.rejects(runIndependentViewportSessions(f.settings), failPhase ? /original semantic failure/ : /owned cleanup failed/);
    assert.ok(!f.trace.includes('save:desktop'));
  }
});

test('a repeated session or wrong initial viewport refuses instead of treating resized layout as independent behavior', async () => {
  for (const reuse of [false, true]) {
    const f = lifecycle(); const originalOpen = f.settings.openSession; let first;
    f.settings.openSession = async viewport => {
      if (reuse && first) return first;
      const session = await originalOpen(viewport); first = session;
      if (!reuse) session.initial_viewport = { ...VIEWPORTS[1] };
      return session;
    };
    await assert.rejects(runIndependentViewportSessions(f.settings));
    assert.ok(!f.trace.includes('save:mobile'));
  }
});
