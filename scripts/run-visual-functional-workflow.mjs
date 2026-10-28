#!/usr/bin/env node
/** SVF workflow foundation. Scenario data describes actions and expectations;
 * actual values come only from DOM/owner observations. Each implementation
 * stage has an explicit interface and fails closed until it exists. A passing
 * foundation check never establishes an application workflow's acceptance.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  PROJECT_ROOT, CONTRACT_PATH, VIEWPORTS, loadCanonicalContracts, validateContracts,
  baselineRequestDecision, requestMetadata, redactText, findBrowserOwners, retainsCaptureLock, collectPrimaryDom,
} from './capture-visual-functional-baseline.mjs';

export { PROJECT_ROOT, VIEWPORTS };
export const SCENARIO_SCHEMA = 'swissknife.visual-functional-scenario.v1';
export const WORKFLOW_SCHEMA = 'swissknife.visual-functional-workflow.v1';
export const INDEPENDENT_WORKFLOW_SCHEMA = 'swissknife.visual-functional-workflow.v2';
export const VIEWPORT_WORKFLOW_SCHEMA = 'swissknife.visual-functional-viewport.v1';
export const PHASE_EVIDENCE_SCHEMA = 'swissknife.visual-functional-phase-evidence.v1';
export const PILOT_SCHEMA = 'swissknife.visual-functional-driver-pilot.v1';
export const PILOT_OBSERVATIONS = Object.freeze(['arithmetic_result', 'keyboard_result', 'clear_recovery']);
export const PHASES = Object.freeze(['primary_result', 'persist_reopen', 'failure_recovery']);
export const BACKEND_OBSERVATION_PHASES = Object.freeze([...PHASES, 'backend_proof', 'unknown']);
export const BACKEND_REQUEST_PHASE_SCHEMA = 'swissknife.visual-functional-backend-request-phases.v1';
export const FOUNDATION_STAGES = Object.freeze(['stage1', 'stage2', 'stage3', 'pilot']);
export const OBSERVATION_KINDS = Object.freeze(['text', 'value', 'checked', 'count', 'image_state', 'media_state', 'json_attribute', 'dom_property', 'backend_result']);
const DOM_PROPERTIES = ['currentTime', 'duration', 'paused', 'volume', 'muted', 'playbackRate', 'readyState', 'naturalWidth', 'naturalHeight',
  'disabled', 'selectedIndex', 'scrollTop', 'scrollLeft', 'scrollWidth', 'clientWidth', 'scrollHeight', 'clientHeight', 'focused', 'visible'];
const realSessions = new WeakSet();
const realViewportReports = new WeakMap();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const WORKSPACE_ROOT = path.dirname(PROJECT_ROOT);
const filename = fileURLToPath(import.meta.url);
const usage = 'run-visual-functional-workflow.mjs --app <id> --contracts <path> --output-dir <path> [--desktop-url URL] [--independent-viewports] | --foundation-check stage1|stage2|stage3|pilot';
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const text = value => typeof value === 'string' && value.trim().length > 0;

export class WorkflowError extends Error {
  constructor(code, message, details) { super(message); this.name = 'WorkflowError'; this.code = code; if (details !== undefined) this.details = details; }
}
function demand(condition, code, message, details) { if (!condition) throw new WorkflowError(code, message, details); }
function keys(value, required, optional = []) {
  demand(plain(value) && required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => [...required, ...optional].includes(key)), 'INVALID_SCENARIO', `expected fields: ${required.join(', ')}`);
}

/** JSON values retain boolean/number/string distinctions, reject NaN/undefined,
 * and compare objects independently of property insertion order. */
export function canonicalJSON(value) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    demand(Number.isFinite(value), 'INVALID_OBSERVATION', 'non-finite observed numbers are forbidden');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  demand(plain(value), 'INVALID_OBSERVATION', 'observations must be finite JSON values');
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`).join(',')}}`;
}

export function evaluateObservation(value) {
  demand(plain(value) && Object.keys(value).length === 3 && ['operator', 'actual', 'expected'].every(key => Object.hasOwn(value, key)),
    'INVALID_OBSERVATION', 'observed evidence requires exactly operator, actual and expected');
  const { operator, actual, expected } = value;
  const actualJSON = canonicalJSON(actual);
  const expectedJSON = canonicalJSON(expected);
  let passed = false;
  if (operator === 'equals') passed = actualJSON === expectedJSON;
  else if (operator === 'not_equals') passed = actualJSON !== expectedJSON;
  else if (operator === 'contains') passed = typeof actual === 'string' && typeof expected === 'string' && expected.length > 0
    ? actual.includes(expected) : Array.isArray(actual) && expected !== null && actual.some(item => canonicalJSON(item) === expectedJSON);
  else if (operator === 'at_least') passed = typeof actual === 'number' && typeof expected === 'number' && expected > 0 && actual >= expected;
  else throw new WorkflowError('INVALID_OBSERVATION', `unsupported observation operator: ${operator}`);
  demand(passed, 'POSTCONDITION_FAILED', 'observed values contradict the expected postcondition', { operator, actual, expected });
  return { operator, actual, expected };
}

export function requiredSemantics(app) {
  const primary = app.primary_workflow;
  demand(primary?.expected_results?.length > 0 && text(primary.persist_reopen) && text(primary.error) && text(primary.recovery), 'INVALID_CONTRACT', 'app has no complete semantic requirements');
  return Object.fromEntries([
    ...primary.expected_results.map((result, index) => [`result_${index + 1}`, result]),
    ['persist_reopen', primary.persist_reopen],
    ['failure_recovery', `${primary.error} Recovery: ${primary.recovery}`],
  ]);
}

function selector(value) {
  demand(text(value) && value.length <= 512 && !/[\r\n\x00]/.test(value), 'INVALID_SCENARIO', 'a bounded CSS selector is required');
  demand(!/data-svd-(?:vda-marker|workflow)|data-(?:fake-)?proof|data-acceptance-passed/.test(value),
    'SYNTHETIC_PROOF', 'legacy proof labels cannot establish a workflow postcondition');
}

export function validateProbe(probe, app) {
  demand(plain(probe) && OBSERVATION_KINDS.includes(probe.kind), 'INVALID_SCENARIO', 'unknown observation kind');
  if (probe.kind === 'backend_result') {
    keys(probe, ['kind', 'binding_id', 'pointer']);
    demand(app.backend_roles.some(role => role.bindings.some(binding => binding.binding_id === probe.binding_id)), 'POLICY_BOUNDARY', 'backend observation names an undeclared binding');
    validateJSONPointer(probe.pointer);
    return;
  }
  const structured = ['image_state', 'media_state', 'json_attribute'].includes(probe.kind);
  keys(probe, ['kind', 'selector', ...(probe.kind === 'dom_property' ? ['property'] : probe.kind === 'json_attribute' ? ['attribute'] : [])],
    [...(probe.kind === 'count' ? ['within'] : []), ...(structured ? ['pointer', 'temporal_ms'] : probe.kind === 'dom_property' ? ['temporal_ms'] : [])]);
  selector(probe.selector);
  if (probe.within !== undefined) selector(probe.within);
  if (probe.kind === 'json_attribute') demand(/^data-[a-z0-9-]+$/.test(probe.attribute || '') && !/secret|password|token|credential/.test(probe.attribute),
    'POLICY_BOUNDARY', 'only nonsensitive data attributes may be read');
  if (probe.kind === 'dom_property') demand(DOM_PROPERTIES.includes(probe.property), 'POLICY_BOUNDARY', 'only declared readonly DOM properties may be observed');
  if (probe.pointer !== undefined) validateJSONPointer(probe.pointer);
  if (probe.temporal_ms !== undefined) demand(Number.isInteger(probe.temporal_ms) && probe.temporal_ms >= 50 && probe.temporal_ms <= 1000
    && (probe.kind === 'dom_property' || probe.pointer !== undefined), 'INVALID_OBSERVATION', 'temporal probes need a bounded sample interval and a scalar field');
}

function validateStep(step, app) {
  demand(plain(step) && text(step.op), 'INVALID_SCENARIO', 'each scenario step requires an operation');
  const shape = {
    click: [['op', 'selector'], []], fill: [['op', 'selector', 'value'], []],
    press: [['op', 'selector', 'key'], []], select: [['op', 'selector', 'value'], []],
    check: [['op', 'selector'], []], uncheck: [['op', 'selector'], []],
    wait_for: [['op', 'selector', 'state'], ['timeout_ms']], wait_ms: [['op', 'milliseconds'], []],
    reopen_app: [['op'], []], capture: [['op', 'label'], []],
    assert: [['op', 'probe', 'operator', 'expected'], ['requirement_id', 'checkpoint_id']],
  }[step.op];
  demand(shape, 'INVALID_SCENARIO', `unsupported action: ${step.op}; arbitrary scripts, requests and injected state are forbidden`);
  keys(step, ...shape);
  if (Object.hasOwn(step, 'selector')) selector(step.selector);
  if (['fill', 'select'].includes(step.op)) demand(typeof step.value === 'string' && step.value.length <= 8192, 'INVALID_SCENARIO', 'input must be bounded text');
  if (step.op === 'press') demand(text(step.key) && step.key.length <= 80 && !/[\r\n]/.test(step.key), 'INVALID_SCENARIO', 'keyboard action requires a bounded key');
  if (step.op === 'wait_for') {
    demand(['visible', 'hidden', 'attached', 'detached'].includes(step.state), 'INVALID_SCENARIO', 'invalid wait state');
    if (step.timeout_ms !== undefined) demand(Number.isInteger(step.timeout_ms) && step.timeout_ms > 0 && step.timeout_ms <= 15000, 'INVALID_SCENARIO', 'wait timeout exceeds its bound');
  }
  if (step.op === 'wait_ms') demand(Number.isInteger(step.milliseconds) && step.milliseconds >= 0 && step.milliseconds <= 5000, 'INVALID_SCENARIO', 'unbounded wait is forbidden');
  if (step.op === 'capture') demand(/^[a-z][a-z0-9-]{0,63}$/.test(step.label || ''), 'INVALID_SCENARIO', 'capture label must be a safe name');
  if (step.op === 'assert') {
    demand(Boolean(text(step.requirement_id)) !== Boolean(text(step.checkpoint_id)), 'INVALID_SCENARIO', 'assertion needs one requirement or checkpoint identity');
    demand(['equals', 'not_equals', 'contains', 'at_least'].includes(step.operator), 'INVALID_SCENARIO', 'unsupported assertion operator');
    canonicalJSON(step.expected);
    validateProbe(step.probe, app);
  }
}

/** Pure admission: never execute a browser, mutate a page, or accept model-
 * supplied actual/passed fields. All three semantic phases are mandatory. */
export function validateScenario(scenario, app) {
  keys(scenario, ['schema', 'app_id', 'fixture_scope', 'phases', 'backend_bindings'], ['description', 'variables']);
  demand(scenario.schema === SCENARIO_SCHEMA && scenario.app_id === app.app_id, 'INVALID_SCENARIO', 'scenario identity/schema mismatch');
  demand(/^svf-[a-z0-9][a-z0-9-]{2,100}$/.test(scenario.fixture_scope), 'POLICY_BOUNDARY', 'fixtures need an isolated svf namespace');
  if (scenario.variables !== undefined) {
    demand(plain(scenario.variables), 'INVALID_SCENARIO', 'variables must be plain JSON data');
    demand(Buffer.byteLength(canonicalJSON(scenario.variables)) <= 16384, 'INVALID_SCENARIO', 'scenario variables exceed their byte bound');
  }
  keys(scenario.phases, PHASES);
  demand(Array.isArray(scenario.backend_bindings), 'POLICY_BOUNDARY', 'backend bindings must be explicit');
  const seenBindings = new Set();
  for (const intent of scenario.backend_bindings) {
    keys(intent, ['binding_id', 'mode', 'consent', 'max_duration_seconds', 'max_output_bytes'], ['result_assertion']);
    const declared = app.backend_roles.flatMap(role => role.bindings).find(binding => binding.binding_id === intent.binding_id);
    demand(declared && !seenBindings.has(intent.binding_id), 'POLICY_BOUNDARY', 'unknown or duplicate backend binding');
    seenBindings.add(intent.binding_id);
    demand(intent.mode === (declared.mutates_remote_state ? 'isolated_mutation' : 'read')
      && intent.consent === (declared.mutates_remote_state ? 'ui_required' : 'not_required'), 'POLICY_BOUNDARY', 'mutation and consent must match the declared capability');
    demand(Number.isInteger(intent.max_duration_seconds) && intent.max_duration_seconds > 0 && intent.max_duration_seconds <= 120
      && Number.isInteger(intent.max_output_bytes) && intent.max_output_bytes > 0 && intent.max_output_bytes <= 1048576,
    'POLICY_BOUNDARY', 'backend operation exceeds the controlled fixture budget');
    if (intent.result_assertion !== undefined) {
      keys(intent.result_assertion, ['pointer', 'operator', 'expected']);
      validateJSONPointer(intent.result_assertion.pointer);
      demand(['equals', 'not_equals', 'contains', 'at_least'].includes(intent.result_assertion.operator), 'INVALID_OBSERVATION', 'unsupported backend assertion operator');
      canonicalJSON(intent.result_assertion.expected);
    }
  }
  demand(app.disposition === 'tool_backed' ? seenBindings.size > 0 : seenBindings.size === 0, 'POLICY_BOUNDARY', 'scenario changed the local/external/credential dispatch boundary');
  const requirements = requiredSemantics(app);
  const observed = new Set();
  for (const phase of PHASES) {
    const steps = scenario.phases[phase];
    demand(Array.isArray(steps) && steps.length > 0 && steps.length <= 64, 'INVALID_SCENARIO', `phase ${phase} needs bounded steps`);
    for (const [index, step] of steps.entries()) {
      validateStep(step, app);
      // Confirmation belongs to a declared governed binding, never to a
      // guessed tool name. Reject impossible waits before spending browser
      // time or asking a repair model to explain a nonexistent dialog.
      const requiresPresence = !(step.op === 'wait_for' && ['hidden', 'detached'].includes(step.state));
      const confirmations = (requiresPresence ? step.selector || '' : '').matchAll(/\[data-gateway-confirm\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\]\s]+))\s*\]/g);
      for (const match of confirmations) {
        const identity = match[1] || match[2] || match[3];
        const binding = app.backend_roles.flatMap(role => role.bindings).find(item => item.binding_id === identity);
        demand(binding && seenBindings.has(identity), 'POLICY_BOUNDARY',
          `confirmation action names an undeclared scenario binding: ${identity}`);
        demand(binding.mutates_remote_state === true, 'INVALID_SCENARIO',
          `binding ${identity} is ungoverned (consent not_required); its gateway does not create a confirmation dialog`,
          { binding_id: identity, phase, step: index, consent: 'not_required', mutates_remote_state: false });
      }
      if (step.op === 'assert' && step.probe.kind === 'backend_result') demand(seenBindings.has(step.probe.binding_id),
        'POLICY_BOUNDARY', 'backend observation is outside the scenario operation scope');
      if (step.op !== 'assert' || !step.requirement_id) continue;
      const expectedPhase = step.requirement_id.startsWith('result_') ? 'primary_result' : step.requirement_id;
      demand(Object.hasOwn(requirements, step.requirement_id) && expectedPhase === phase && !observed.has(step.requirement_id),
        'INVALID_SCENARIO', 'semantic requirement is unknown, duplicate or in the wrong phase');
      observed.add(step.requirement_id);
      if (phase === 'persist_reopen') demand(steps.slice(0, index).some(item => item.op === 'reopen_app'),
        'MISSING_POSTCONDITION', 'persistence must be observed after the actual app reopens');
      if (phase === 'failure_recovery') {
        const failureIndex = steps.findIndex(item => item.op === 'assert' && item.checkpoint_id === 'error_observed');
        demand(failureIndex >= 0 && failureIndex < index && steps.slice(failureIndex + 1, index).some(item => !['assert', 'capture', 'wait_for', 'wait_ms'].includes(item.op)),
          'MISSING_POSTCONDITION', 'recovery requires an observed error followed by a recovery action');
      }
    }
  }
  demand(observed.size === Object.keys(requirements).length, 'MISSING_POSTCONDITION', 'scenario omitted semantic results, persistence or failure recovery');
  return scenario;
}

export function validateJSONPointer(pointer) {
  demand(typeof pointer === 'string' && pointer.startsWith('/') && pointer.length <= 2048 && !/~(?![01])/.test(pointer),
    'INVALID_OBSERVATION', 'a bounded RFC6901 pointer is required');
}
export function readJSONPointer(value, pointer) {
  validateJSONPointer(pointer);
  for (const raw of pointer.slice(1).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(value)) {
      demand(/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < value.length, 'MISSING_OBSERVATION', 'JSON pointer index is absent',
        { pointer, missing_segment: key, observed_parent: value });
      value = value[Number(key)];
    } else {
      demand(plain(value) && Object.hasOwn(value, key), 'MISSING_OBSERVATION', 'JSON pointer field is absent',
        { pointer, missing_segment: key, available_keys: plain(value) ? Object.keys(value) : [], observed_parent: value });
      value = value[key];
    }
  }
  canonicalJSON(value);
  return value;
}

/** Self-contained so stage2 can pass this directly to Locator.evaluate().
 * The scenario supplies a read operation, never an actual value or script. */
export function readElementObservation(element, probe) {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  const sensitive = element.matches('input[type="password"], [data-secret], [data-credential-value]')
    || Boolean(element.closest('[data-secret], [data-credential-value]'));
  if (sensitive || (probe.kind === 'value' && /password|secret|api.?key|access.?token|refresh.?token/i.test(`${element.id} ${element.getAttribute('name') || ''}`))) {
    throw new Error('SECRET_OBSERVATION_BLOCKED');
  }
  if (probe.kind === 'text') return element.textContent.trim();
  if (probe.kind === 'value') return element.value;
  if (probe.kind === 'checked') {
    if (typeof element.checked !== 'boolean') throw new Error('MISSING_OBSERVATION');
    return element.checked;
  }
  if (probe.kind === 'count') return element.querySelectorAll(probe.selector).length;
  if (probe.kind === 'dom_property') {
    if (probe.property === 'focused') return doc.activeElement === element || element.contains(doc.activeElement);
    if (probe.property === 'visible') {
      const bounds = element.getBoundingClientRect(), style = view.getComputedStyle(element);
      return element.isConnected && bounds.width > 0 && bounds.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }
    const allowed = ['currentTime', 'duration', 'paused', 'volume', 'muted', 'playbackRate', 'readyState', 'naturalWidth', 'naturalHeight',
      'disabled', 'selectedIndex', 'scrollTop', 'scrollLeft', 'scrollWidth', 'clientWidth', 'scrollHeight', 'clientHeight'];
    if (!allowed.includes(probe.property)) throw new Error('UNSUPPORTED_DOM_PROPERTY');
    const value = element[probe.property];
    if (!(typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))) throw new Error('MISSING_OBSERVATION');
    return value;
  }
  if (probe.kind === 'json_attribute') {
    const attribute = element.getAttribute(probe.attribute);
    if (attribute === null) throw new Error('MISSING_OBSERVATION');
    if (attribute.length > 1048576) throw new Error('OBSERVATION_BOUND_EXCEEDED');
    const parsed = JSON.parse(attribute), pending = [parsed];
    let objects = 0;
    while (pending.length) {
      const value = pending.pop();
      if (!value || typeof value !== 'object') continue;
      if (++objects > 4096) throw new Error('OBSERVATION_BOUND_EXCEEDED');
      for (const [key, child] of Object.entries(value)) {
        if (/^(password|api_key|access_token|refresh_token|secret|authorization|bearer_token|backend_credentials)$/i.test(key)) throw new Error('SECRET_OBSERVATION_BLOCKED');
        if (child && typeof child === 'object') pending.push(child);
      }
    }
    return parsed;
  }
  const rect = element.getBoundingClientRect();
  let left = Math.max(0, rect.left);
  let top = Math.max(0, rect.top);
  let right = Math.min(view.innerWidth, rect.right);
  let bottom = Math.min(view.innerHeight, rect.bottom);
  let cssVisible = true;
  for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
    const style = view.getComputedStyle(ancestor);
    if (style.display === 'none' || style.visibility === 'hidden' || (style.opacity !== '' && Number(style.opacity) === 0)) cssVisible = false;
    if (ancestor !== element && (/hidden|clip|auto|scroll/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`) || ancestor.classList.contains('window'))) {
      const bound = ancestor.getBoundingClientRect();
      left = Math.max(left, bound.left); top = Math.max(top, bound.top);
      right = Math.min(right, bound.right); bottom = Math.min(bottom, bound.bottom);
    }
  }
  const visibleArea = cssVisible ? Math.max(0, right - left) * Math.max(0, bottom - top) : 0;
  if (probe.kind === 'image_state') {
    const get = name => probe.read_native_source && element.tagName === 'IMG'
      ? Object.getOwnPropertyDescriptor(view.HTMLImageElement.prototype, name).get.call(element) : element[name];
    const width = get('naturalWidth') || 0, height = get('naturalHeight') || 0;
    return { decoded: element.tagName === 'IMG' && get('complete') && width > 0 && height > 0,
      natural_width: width, natural_height: height, visible_area: visibleArea,
      ...(probe.read_native_source ? { native_source: get('currentSrc') || get('src') || '' } : {}) };
  }
  if (probe.kind === 'media_state') return { decoded: ['VIDEO', 'AUDIO'].includes(element.tagName) && element.readyState >= 2,
    current_time: element.currentTime || 0, duration: Number.isFinite(element.duration) ? element.duration : null,
    paused: element.paused, error_code: element.error?.code || null, visible_area: visibleArea };
  throw new Error('UNSUPPORTED_DOM_OBSERVATION');
}

export function assertUsableMedia(state, { requirePixels = true, requirePlayback = false } = {}) {
  demand(plain(state) && state.decoded === true, 'BLANK_MEDIA', 'image/media must actually decode');
  if (requirePixels) demand(typeof state.visible_area === 'number' && Number.isFinite(state.visible_area) && state.visible_area >= 64,
    'CLIPPED_MEDIA', 'decoded content has no usable visible area in its actual window');
  if (requirePlayback) demand(typeof state.current_time === 'number' && state.current_time > 0 && !state.error_code,
    'MEDIA_NOT_PLAYING', 'media playback did not advance or reported an error');
  return state;
}

/** Early screening only; the independent campaign worker still verifies the
 * complete source/artifact/semantic/backend report before task completion. */
export function rejectSyntheticWorkflow(report) {
  demand(plain(report) && report.schema === WORKFLOW_SCHEMA && report.actual_desktop === true && report.source_template === false && report.baseline_only !== true,
    'SYNTHETIC_PROOF', 'baseline/simulator/event-only reports cannot establish actual desktop workflow acceptance');
  demand(Array.isArray(report.semantic_assertions) && report.semantic_assertions.length > 0, 'MISSING_POSTCONDITION', 'workflow has no actual semantic postconditions');
  for (const assertion of report.semantic_assertions) evaluateObservation(assertion.observed);
  return report;
}

export function loadScenario(app, { projectRoot = PROJECT_ROOT } = {}) {
  const root = path.resolve(projectRoot);
  const scenarioPath = path.join(root, 'test/e2e/functional-workflows', `${app.app_id}.json`);
  demand(/^[a-z][a-z0-9-]*$/.test(app.app_id), 'INVALID_SCENARIO', 'scenario needs a canonical app identity');
  demand(fs.existsSync(scenarioPath), 'SCENARIO_MISSING', `missing declared app scenario: test/e2e/functional-workflows/${app.app_id}.json`);
  const info = fs.lstatSync(scenarioPath);
  demand(info.isFile() && info.size <= 1048576 && fs.realpathSync(scenarioPath).startsWith(root + path.sep), 'INVALID_SCENARIO', 'scenario must be a bounded in-repository regular file');
  return validateScenario(JSON.parse(fs.readFileSync(scenarioPath, 'utf8')), app);
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const testFile = path.resolve(path.dirname(filename), '../test/scripts/visual-functional-workflow.test.mjs');
const require = createRequire(import.meta.url);

/** Hold the same kernel lock as the baseline producer for the entire session.
 * The lock owner is our child, whose stdin lifetime we control; no foreign
 * process or listener is signalled. flock --no-fork preserves its recorded PID. */
async function acquireBrowserLock() {
  const lockPath = path.join(PROJECT_ROOT, 'test-results/visual-functional/.capture.lock');
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const child = spawn('/usr/bin/flock', ['--exclusive', '--nonblock', '--conflict-exit-code', '75', '--no-fork', lockPath,
    process.execPath, '-e', "process.stdout.write('locked\\n');process.stdin.resume();process.stdin.on('end',()=>process.exit(0));"],
  { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
  child.stdin.on('error', () => {});
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    child.stdin.end();
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise(resolve => { child.once('exit', resolve); setTimeout(resolve, 2000).unref(); });
  };
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new WorkflowError('BROWSER_CONTENTION', 'browser lock acquisition timed out')), 5000);
      const finish = callback => value => { clearTimeout(timer); callback(value); };
      child.once('error', finish(reject));
      child.once('exit', finish(code => reject(new WorkflowError('BROWSER_CONTENTION', `browser lock unavailable (${code})`))));
      child.stdout.once('data', finish(data => data.toString() === 'locked\n' ? resolve() : reject(new WorkflowError('BROWSER_CONTENTION', 'invalid lock handshake'))));
    });
    demand(retainsCaptureLock(lockPath, fs.readFileSync('/proc/locks', 'utf8'), child.pid), 'BROWSER_CONTENTION', 'retained browser lock identity was not observed');
    return { release };
  } catch (error) { await release(); throw error; }
}

function processStat(record) {
  const boundary = record.lastIndexOf(') ');
  const fields = record.slice(boundary + 2).trim().split(/\s+/);
  demand(boundary > 0 && fields.length >= 20 && /^\d+$/.test(fields[19]), 'PROCESS_OWNERSHIP_LOST', 'invalid process identity record');
  return { pid: Number(record.slice(0, record.indexOf(' '))), state: fields[0], pgid: Number(fields[2]), sid: Number(fields[3]), birth: fields[19] };
}

/** Capture group members while the original detached leader is still alive.
 * After its exit, only the already observed immutable member births qualify;
 * PGID alone never authorizes a signal to a reused or foreign process. */
export function observeOwnedDesktopGroup(identity, births, procRoot = '/proc') {
  const records = [];
  for (const entry of fs.readdirSync(procRoot)) {
    if (!/^\d+$/.test(entry)) continue;
    try { records.push(processStat(fs.readFileSync(path.join(procRoot, entry, 'stat'), 'utf8'))); }
    catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error; }
  }
  const members = records.filter(item => item.pgid === identity.pid && item.state !== 'Z');
  const leader = records.find(item => item.pid === identity.pid && item.state !== 'Z');
  if (!members.length) return [];
  demand(!leader || leader.birth === identity.birth, 'PROCESS_OWNERSHIP_LOST', 'desktop leader PID birth changed');
  for (const member of members) {
    demand(member.sid === identity.pid && BigInt(member.birth) >= BigInt(identity.birth), 'PROCESS_OWNERSHIP_LOST', 'desktop process group/session identity changed');
    if (leader) births.set(member.pid, member.birth);
    else demand(births.get(member.pid) === member.birth, 'PROCESS_OWNERSHIP_LOST', 'leader exited and descendant birth was never observed or changed');
  }
  return members;
}

export async function stopOwnedDesktopGroup(identity, births, options = {}) {
  const observe = () => observeOwnedDesktopGroup(identity, births, options.procRoot || '/proc');
  const pause = options.pause || sleep;
  const now = options.now || Date.now;
  const signal = options.signal || ((pid, name) => process.kill(pid, name));
  const send = name => {
    if (!observe().length) return;
    try { signal(-identity.pid, name); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  send('SIGTERM');
  let deadline = now() + (options.graceMs ?? 5000);
  while (observe().length && now() < deadline) await pause(100);
  if (observe().length) send('SIGKILL');
  deadline = now() + (options.killGraceMs ?? 2000);
  while (observe().length && now() < deadline) await pause(50);
  demand(observe().length === 0, 'DESKTOP_CLEANUP_FAILED', 'owned desktop descendants did not drain after bounded cleanup');
}

async function startWorkflowDesktop(outputDir, signal) {
  const { findOwnedPort } = await import(pathToFileURL(path.join(PROJECT_ROOT, 'scripts/lib/pick-free-port.mjs')).href);
  const endpoint = await findOwnedPort({ preferredPort: 3017 });
  const url = `http://127.0.0.1:${endpoint.port}/`;
  const descriptor = fs.openSync(path.join(outputDir, 'desktop-server.log'), 'wx');
  let child;
  try {
    child = spawn('npm', ['run', 'desktop', '--', '--host', '127.0.0.1', '--port', String(endpoint.port), '--strictPort'],
      { cwd: PROJECT_ROOT, stdio: ['ignore', descriptor, descriptor], detached: true, shell: false });
  } finally { fs.closeSync(descriptor); }
  let launchError;
  child.on('error', error => { launchError = error; });
  let birth;
  try { if (child.pid) birth = processStat(fs.readFileSync(`/proc/${child.pid}/stat`, 'utf8')).birth; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const identity = { pid: child.pid, birth };
  const births = new Map(birth ? [[child.pid, birth]] : []);
  let ownershipError, stopped = false;
  const capture = () => {
    if (!birth || ownershipError) return;
    try { observeOwnedDesktopGroup(identity, births); } catch (error) { ownershipError = error; }
  };
  capture();
  const tracking = setInterval(capture, 100);
  tracking.unref();
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    clearInterval(tracking);
    if (ownershipError) throw ownershipError;
    if (birth) await stopOwnedDesktopGroup(identity, births);
  };
  try {
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      demand(!signal.aborted, 'SESSION_INTERRUPTED', 'owned desktop startup interrupted');
      if (launchError) throw launchError;
      demand(child.exitCode === null && child.signalCode === null, 'DESKTOP_START_FAILED', 'owned desktop server exited before readiness');
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1500), redirect: 'manual' });
        await response.body?.cancel();
        if (response.ok) return { url, pid: child.pid, ownership: 'spawned-private-server', stop };
      } catch { /* The private server may still be binding. */ }
      await sleep(250);
    }
    throw new WorkflowError('DESKTOP_START_FAILED', 'owned desktop readiness timed out');
  } catch (error) { await stop(); throw error; }
}

function runtimeOwnsWindow(element, appId) {
  const view = element.ownerDocument.defaultView;
  const desktop = view.__swissknifeDesktop || view.swissknifeDesktop;
  return element.isConnected && element.dataset.appId === appId && desktop?.windows instanceof view.Map
    && Array.from(desktop.windows.values()).some(item => item.appId === appId && item.element === element);
}

/** Fresh browser storage is retained across canonical window close/reopen.
 * The optional second argument is an explicit DOM unit driver only; sessions
 * using it are always labelled actual_desktop:false and cannot prove app GO. */
export async function openRealDesktopSession(settings, testDriver = null) {
  const { app, scenario } = settings;
  demand(app && /^[a-z][a-z0-9-]*$/.test(app.app_id || '')
    && app.launch?.runtime_app_id === app.app_id
    && app.launch.canonical_launcher === `.desktop-icons .icon[data-app="${app.app_id}"]`
    && app.launch.window_selector === `.window[data-app-id="${app.app_id}"]`
    && app.launch.primary_content_selector === '.window-app-content', 'INVALID_CONTRACT', 'canonical launch identity is required');
  validateScenario(scenario, app);
  demand(!testDriver || testDriver.kind === 'explicit-dom-unit-driver', 'POLICY_BOUNDARY', 'only explicit DOM unit drivers may replace resource acquisition');
  demand(text(settings.outputDir), 'INVALID_ARGUMENT', 'owned output directory is required');
  const outputDir = path.resolve(settings.outputDir);
  demand(!fs.existsSync(outputDir) || (fs.lstatSync(outputDir).isDirectory() && !fs.lstatSync(outputDir).isSymbolicLink()
    && fs.readdirSync(outputDir).length === 0), 'ARTIFACT_COLLISION', 'output directory must be an empty regular directory');
  const viewport = settings.viewport || VIEWPORTS[0];
  demand(VIEWPORTS.some(item => item.name === viewport.name && item.width === viewport.width && item.height === viewport.height), 'INVALID_ARGUMENT', 'viewport must be canonical desktop or mobile');
  if (settings.desktopUrl) {
    const url = new URL(settings.desktopUrl);
    demand(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash,
      'INVALID_ARGUMENT', 'desktop URL must omit credentials/query/fragment');
  }
  const controller = new AbortController();
  const session = { app, scenario, outputDir, viewport, initial_viewport: Object.freeze({ ...viewport }), session_id: randomUUID(),
    generation: 0, closed: false, actual_desktop: !testDriver,
    semantic_assertions: [], checkpoints: [], console_events: [], network_events: [], captures: [], keyboard_focus_observations: [],
    backend_enabled: settings.backendProof === true, backend_records: [], backend_observations: [], backend_artifacts: new Map(),
    unexpected_backend_calls: 0, backend_policy_errors: [], backend_policy_diagnostics: [], consent_observations: [] };
  const requests = new Map();
  let lock, server, browser, context, closing;
  let acquiring = true;
  const interrupted = () => {
    controller.abort();
    if (!acquiring) void session.close().catch(() => undefined);
  };
  session.close = () => {
    if (closing) return closing;
    session.closed = true;
    controller.abort();
    closing = (async () => {
      // Release later resources even when an earlier close fails.
      const errors = [];
      for (const cleanup of [() => session.stopTrace?.(), () => context?.close(), () => browser?.close(), () => server?.stop(), () => lock?.release()]) {
        try { await cleanup(); } catch (error) { errors.push(error); }
      }
      process.removeListener('SIGTERM', interrupted);
      process.removeListener('SIGINT', interrupted);
      if (errors.length) throw new AggregateError(errors, 'owned workflow cleanup failed');
    })();
    return closing;
  };
  const active = () => demand(!session.closed && !controller.signal.aborted, 'SESSION_INTERRUPTED', 'workflow session is closed or interrupted');
  session.assertActive = async () => {
    active();
    demand(await session.window.count() === 1 && await session.window.evaluate(runtimeOwnsWindow, app.app_id), 'APP_IDENTITY_MISMATCH', 'active window is not owned by the canonical runtime app');
  };
  async function launchApp() {
    active();
    const launcher = session.page.locator(app.launch.canonical_launcher);
    demand(await launcher.count() === 1, 'APP_IDENTITY_MISMATCH', 'canonical app launcher must be unique');
    await launcher.scrollIntoViewIfNeeded();
    await launcher.focus();
    await launcher.click();
    session.window = session.page.locator(app.launch.window_selector);
    await session.window.waitFor({ state: 'visible', timeout: 20000 });
    await session.assertActive();
    await session.window.locator('.window-loading').waitFor({ state: 'hidden', timeout: 15000 });
    session.primary = session.window.locator(app.launch.primary_content_selector);
    demand(await session.primary.count() === 1, 'APP_IDENTITY_MISMATCH', 'canonical primary app content must be unique');
    await session.primary.waitFor({ state: 'visible', timeout: 15000 });
    session.generation += 1;
  }
  session.reopen = async () => {
    await session.assertActive();
    const previous = await session.window.elementHandle();
    const close = session.window.locator('.window-control.close');
    demand(await close.count() === 1, 'APP_IDENTITY_MISMATCH', 'canonical close control must be unique');
    await close.click();
    await previous.waitForElementState('hidden', { timeout: 15000 });
    demand(await session.page.locator(app.launch.window_selector).count() === 0, 'APP_REOPEN_FAILED', 'previous app window did not close');
    await session.page.waitForFunction(id => {
      const desktop = window.__swissknifeDesktop || window.swissknifeDesktop;
      return desktop?.windows instanceof Map && !Array.from(desktop.windows.values()).some(item => item.appId === id);
    }, app.app_id, { timeout: 15000 });
    await launchApp();
    demand(!(await previous.evaluate(element => element.isConnected)), 'APP_REOPEN_FAILED', 'reopen reused the old window element');
    await previous.dispose();
    return session.generation;
  };
  session.capture = async label => {
    await session.assertActive();
    const relative = `${String(session.captures.length + 1).padStart(3, '0')}-${label}.png`;
    const destination = path.join(outputDir, relative);
    demand(!fs.existsSync(destination), 'ARTIFACT_COLLISION', 'capture artifact already exists');
    await session.window.screenshot({ path: destination, mask: [session.window.locator('input[type="password"], [data-secret], [data-credential-value]')], animations: 'disabled', timeout: 15000 });
    session.captures.push(relative);
    return relative;
  };
  try {
    lock = await (testDriver?.acquireLock || acquireBrowserLock)();
    const owners = (testDriver?.findOwners || findBrowserOwners)();
    demand(owners.length === 0, 'BROWSER_CONTENTION', 'another browser/evidence producer is active; leave its resources untouched',
      { browser_owners: owners.map(({ pid, kind, executable }) => ({ pid, kind, executable })) });
    fs.mkdirSync(outputDir, { recursive: true });
    process.once('SIGTERM', interrupted);
    process.once('SIGINT', interrupted);
    server = settings.desktopUrl ? { url: settings.desktopUrl, ownership: 'explicit-existing-desktop', stop: async () => {} }
      : await (testDriver?.startDesktop || startWorkflowDesktop)(outputDir, controller.signal);
    active();
    browser = await (testDriver?.launchBrowser || (async () => require('playwright').chromium.launch({ channel: 'chrome', headless: true })))();
    active();
    context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, serviceWorkers: 'block', acceptDownloads: false, permissions: [] });
    session.context = context;
    active();
    const origin = new URL(server.url).origin;
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === origin && url.pathname === '/mcp/tools/call') {
        try {
          demand(session.backend_enabled && request.method() === 'POST' && !url.search, 'POLICY_BOUNDARY', 'this session does not authorize a tool dispatch');
          const raw = request.postData();
          demand(typeof raw === 'string' && Buffer.byteLength(raw) <= 131072, 'POLICY_BOUNDARY', 'tool request must contain bounded JSON');
          const call = JSON.parse(raw);
          const { binding } = admitBackendCall(call, app, scenario);
          demand(session.backend_records.length < 64 && !session.backend_records.some(item => item.call.correlation_id === call.correlation_id),
            'POLICY_BOUNDARY', 'tool request count/correlation bound violated');
          if (!testDriver) demand(request.frame()?.page() === session.page, 'POLICY_BOUNDARY', 'tool request did not originate in this actual app page');
          const consent = !binding.mutates_remote_state || session.consent_observations.some(item => item.binding_id === call.binding_id
            && item.correlation_id === call.correlation_id && item.tool_id === call.tool_id && Date.now() - item.at_ms <= 10000);
          if (!testDriver) demand(consent, 'POLICY_BOUNDARY', 'mutation lacks its observed trusted native confirmation');
          const observedPhase = session.failure_context?.phase;
          const phase = BACKEND_OBSERVATION_PHASES.includes(observedPhase) ? observedPhase : 'unknown';
          const record = { call, started_at_ms: Date.now(), finished: false, actual_desktop: session.actual_desktop, ui_consent_verified: consent,
            dispatch_observation_phase: phase,
            request_phase: Object.freeze({ request_index: session.backend_records.length, phase,
              step_index: PHASES.includes(phase) ? session.failure_context.step : null,
              generation: session.generation, binding_id: call.binding_id,
              correlation_id: call.correlation_id, call_sha256: digest(canonicalJSON(call)) }) };
          session.backend_records.push(record); requests.set(request, record);
          await route.continue();
          return;
        } catch (error) {
          session.unexpected_backend_calls += 1;
          if (session.backend_policy_errors.length < 128) session.backend_policy_errors.push(error.code || 'INVALID_BACKEND_CALL');
          if (session.backend_policy_diagnostics.length < 32) session.backend_policy_diagnostics.push({
            code: error.code || 'INVALID_BACKEND_CALL',
            message: error instanceof WorkflowError ? error.message : 'Invalid browser gateway request.',
            details: error instanceof WorkflowError ? boundedFailureValue(error.details || {}, 2048) : {},
          });
          if (session.network_events.length < 1500) session.network_events.push({ ...requestMetadata(request.url(), request.method(), request.resourceType(), origin), blocked: true, reason: error.code || 'INVALID_BACKEND_CALL' });
          await route.abort('blockedbyclient');
          return;
        }
      }
      const decision = baselineRequestDecision(request.url(), request.method(), origin);
      if (!decision.allow) {
        if (session.network_events.length < 1500) session.network_events.push({ ...requestMetadata(request.url(), request.method(), request.resourceType(), origin), blocked: true, reason: decision.reason });
        await route.abort('blockedbyclient');
      } else await route.continue();
    });
    // Both HTTP and libp2p owner transports use the same governed browser
    // HTTP gateway. Direct browser WebSockets remain forbidden.
    demand(typeof context.routeWebSocket === 'function', 'POLICY_BOUNDARY', 'browser must support fail-closed WebSocket routing');
    await context.routeWebSocket('**/*', route => route.close());
    session.page = await context.newPage();
    if (session.backend_enabled && !testDriver) {
      await session.page.exposeBinding('__swissknifeSVFConsent', ({ frame }, observation) => {
        if (frame !== session.page.mainFrame() || !plain(observation) || observation.app_id !== app.app_id
          || ![observation.binding_id, observation.correlation_id, observation.tool_id].every(value => typeof value === 'string' && value.length > 0 && value.length <= 512)) return;
        if (session.consent_observations.length < 128) session.consent_observations.push({ app_id: observation.app_id,
          binding_id: observation.binding_id, correlation_id: observation.correlation_id, tool_id: observation.tool_id, at_ms: Date.now() });
      });
      await session.page.addInitScript(() => {
        // Observe native events without changing app state or installing proof
        // labels. A confirmed custom event must follow its trusted UI click.
        const clicks = new Map();
        document.addEventListener('click', event => {
          const button = event.target?.closest?.('[data-gateway-confirm]');
          if (event.isTrusted && button) clicks.set(button.dataset.gatewayConfirm, Date.now());
        }, true);
        document.addEventListener('swissknife:gateway-confirmation', event => {
          const detail = event.detail, app = event.target?.closest?.('.window')?.dataset.appId;
          if (detail?.phase === 'confirmed' && detail.trusted === true && app && Date.now() - (clicks.get(detail.binding_id) || 0) < 1000) {
            clicks.delete(detail.binding_id);
            globalThis.__swissknifeSVFConsent({ app_id: app, binding_id: detail.binding_id, correlation_id: detail.correlation_id, tool_id: detail.tool_id }).catch(() => {});
          }
        });
      });
    }
    session.page.on('response', async response => {
      const record = requests.get(response.request());
      if (!record) return;
      try {
        const { intent } = admitBackendCall(record.call, app, scenario);
        const size = Number(response.headers()['content-length'] || 0);
        demand(!size || size <= intent.max_output_bytes, 'BACKEND_OUTPUT_BOUND', 'gateway response exceeds its declared bound');
        const bytes = await response.body();
        demand(bytes.length <= intent.max_output_bytes, 'BACKEND_OUTPUT_BOUND', 'gateway response exceeds its declared bound');
        record.http_status = response.status();
        record.response = JSON.parse(bytes.toString('utf8'));
        demand(Date.now() - record.started_at_ms <= intent.max_duration_seconds * 1000, 'BACKEND_TIMEOUT', 'gateway response exceeded the controlled fixture timeout');
      } catch (error) { record.error = error.code || 'BACKEND_RESPONSE_INVALID'; }
      finally { record.finished = true; }
    });
    session.page.on('requestfailed', request => {
      const record = requests.get(request);
      if (record) { record.error = 'BACKEND_REQUEST_FAILED'; record.finished = true; }
    });
    if (settings.trace === true) {
      demand(!testDriver && context.tracing, 'SYNTHETIC_PROOF', 'workflow traces require the actual browser context');
      await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
      let stopped = false;
      session.stopTrace = async () => {
        if (stopped) return;
        stopped = true;
        await context.tracing.stop({ path: path.join(outputDir, 'trace.zip') });
      };
    }
    active();
    session.page.setDefaultTimeout(15000);
    session.page.on('dialog', dialog => dialog.dismiss().catch(() => undefined));
    session.page.on('popup', popup => popup.close().catch(() => undefined));
    for (const event of ['console', 'pageerror']) session.page.on(event, item => {
      if (session.console_events.length < 500) session.console_events.push({ type: event === 'console' ? item.type() : event, text: redactText(event === 'console' ? item.text() : item.message) });
    });
    await session.page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await session.page.waitForFunction(id => {
      const desktop = window.__swissknifeDesktop || window.swissknifeDesktop;
      const loading = document.getElementById('loading-screen');
      return desktop?.apps instanceof Map && desktop.apps.has(id) && (!loading || getComputedStyle(loading).display === 'none');
    }, app.app_id, { timeout: 45000 });
    await launchApp();
    acquiring = false;
    active();
    if (!testDriver) realSessions.add(session);
    return session;
  } catch (error) {
    try { await session.close(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'workflow startup and cleanup failed'); }
    throw error;
  }
}

/** Execute only admitted bounded UI operations. Every locator is rooted at
 * the actual canonical app window, and every actual value is read from DOM. */
export async function observeDOMProbe(session, probe, { positiveMedia = false } = {}) {
  validateProbe(probe, session.app);
  const target = probe.kind === 'count' && !probe.within ? session.primary : session.primary.locator(probe.kind === 'count' ? probe.within : probe.selector);
  const targetCount = await target.count();
  demand(targetCount === 1, 'AMBIGUOUS_TARGET', 'observation must resolve to exactly one native app element',
    { actual_count: targetCount, expected_count: 1, probe });
  if (probe.kind === 'text') demand(!(await target.evaluate(element => Boolean(element.querySelector('input[type="password"], [data-secret], [data-credential-value]')))),
    'POLICY_BOUNDARY', 'text observations cannot include a private subtree');
  const element = await target.elementHandle();
  try {
    const first = await element.evaluate(readElementObservation,
      probe.kind === 'image_state' && session.phase_evidence && probe.temporal_ms === undefined ? { ...probe, read_native_source: true } : probe);
    const media = probe.kind === 'media_state', image = probe.kind === 'image_state';
    const audio = media && await element.evaluate(node => node.tagName === 'AUDIO');
    if (media || image) assertUsableMedia(first, { requirePixels: !audio });
    if (image && session.phase_evidence && probe.temporal_ms === undefined) {
      const encoded = encodedPNGObservation(first);
      const observation = { phase: session.failure_context.phase, step_index: session.failure_context.step,
        selector: probe.selector, ...encoded.state, image_artifact: null };
      if (encoded.bytes && realSessions.has(session) && session.actual_desktop === true) {
        const directory = path.join(session.outputDir, 'decoded-images'); fs.mkdirSync(directory, { recursive: true });
        const file = path.join(directory, encoded.state.content_sha256 + '.png');
        if (fs.existsSync(file)) demand(boundedFile(file, 1048576).equals(encoded.bytes), 'ARTIFACT_COLLISION', 'decoded image artifact changed');
        else fs.writeFileSync(file, encoded.bytes, { flag: 'wx', mode: 0o600 });
        const reference = artifactRecord(file); observation.image_artifact = reference;
        session.backend_artifacts.set(file, reference);
      }
      (session.image_observations ||= []).push(observation);
      // Source bytes stay in immutable artifacts, never a large inline value.
      delete first.native_source;
    }
    const project = raw => probe.pointer === undefined ? raw : readJSONPointer(raw, probe.pointer);
    let actual = project(first);
    if (probe.temporal_ms !== undefined || (media && positiveMedia)) {
      const interval = probe.temporal_ms ?? 250;
      const source = media ? await element.evaluate(node => node.currentSrc || node.src || '') : null;
      if (media && positiveMedia) demand(first.paused === false, 'MEDIA_NOT_PLAYING', 'positive media result requires an actively playing element');
      await session.page.waitForTimeout(interval);
      await session.assertActive();
      demand(await element.evaluate(node => node.isConnected), 'MISSING_OBSERVATION', 'sampled element disappeared during observation');
      const second = await element.evaluate(readElementObservation, probe);
      if (media) {
        assertUsableMedia(second, { requirePixels: !audio, requirePlayback: positiveMedia });
        if (positiveMedia) demand(second.paused === false && second.current_time > first.current_time && second.duration === first.duration
          && await element.evaluate(node => node.currentSrc || node.src || '') === source,
        'MEDIA_NOT_PLAYING', 'same media source did not advance during the bounded observation interval');
      }
      const projected = project(second);
      if (probe.temporal_ms !== undefined) {
        demand(typeof actual === 'number' && Number.isFinite(actual) && typeof projected === 'number' && Number.isFinite(projected),
          'INVALID_OBSERVATION', 'temporal delta requires two observed finite numeric values');
        (session.temporal_observations ||= []).push({ before: actual, after: projected, sample_ms: interval });
        actual = projected - actual;
      } else actual = projected;
    }
    canonicalJSON(actual);
    return actual;
  } finally { await element.dispose(); }
}

export function encodedPNGObservation(snapshot) {
  const { native_source: source, ...state } = snapshot;
  assertUsableMedia(state);
  demand(typeof source === 'string' && source.length <= 1572864, 'INVALID_OBSERVATION', 'native image source is unbounded');
  const result = { ...state, source_sha256: digest(source), content_sha256: null };
  if (!source.startsWith('data:image/png;base64,')) return { state: result, bytes: null };
  const encoded = source.slice('data:image/png;base64,'.length);
  demand(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded),
    'INVALID_OBSERVATION', 'native image PNG source is not canonical base64');
  const bytes = Buffer.from(encoded, 'base64');
  demand(bytes.length >= 24 && bytes.length <= 1048576 && bytes.toString('base64') === encoded
    && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.subarray(12,16).toString() === 'IHDR'
    && bytes.readUInt32BE(16) === state.natural_width && bytes.readUInt32BE(20) === state.natural_height,
    'INVALID_OBSERVATION', 'decoded native image dimensions disagree with its exact PNG bytes');
  result.content_sha256 = digest(bytes);
  return { state: result, bytes };
}

/** Supplemental V2 observations retain measured facts, never acceptance labels.
 * Selectors come exclusively from the exact scenario already admitted above. */
export function phaseEvidenceSelectors(scenario) {
  const media = new Set(), controls = new Set();
  for (const phase of PHASES) for (const step of scenario.phases[phase]) {
    if (step.probe?.kind === 'media_state') media.add(step.probe.selector);
    if (['click', 'fill', 'press', 'select', 'check', 'uncheck'].includes(step.op)) controls.add(step.selector);
  }
  demand(media.size <= 4 && controls.size <= 32, 'INVALID_OBSERVATION', 'phase selectors exceed their declared bounds');
  return { media: [...media], controls: [...controls] };
}

/** Runs in the actual DOM. Native getters avoid an application shadow property
 * masquerading as playback. The raw source leaves this helper only to be hashed. */
export function readPhaseElement(element, media) {
  const view = element.ownerDocument.defaultView;
  if (element.closest('input[type="password"], [data-secret], [data-credential-value]')) throw new Error('SECRET_OBSERVATION_BLOCKED');
  const rect = element.getBoundingClientRect();
  let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
  let right = Math.min(view.innerWidth, rect.right), bottom = Math.min(view.innerHeight, rect.bottom);
  let visible = element.isConnected && rect.width > 0 && rect.height > 0;
  for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
    const style = view.getComputedStyle(node);
    if (node.hidden || style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || (style.opacity !== '' && Number(style.opacity) === 0)) visible = false;
    if (node !== element && (/hidden|clip|auto|scroll/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`) || node.classList.contains('window'))) {
      const bounds = node.getBoundingClientRect();
      left = Math.max(left, bounds.left); top = Math.max(top, bounds.top);
      right = Math.min(right, bounds.right); bottom = Math.min(bottom, bounds.bottom);
    }
  }
  visible = visible && right > left && bottom > top;
  if (media) {
    if (!(element instanceof view.HTMLMediaElement)) throw new Error('DECLARED_MEDIA_NOT_NATIVE');
    const native = key => Object.getOwnPropertyDescriptor(view.HTMLMediaElement.prototype, key).get.call(element);
    const duration = native('duration');
    const video = element instanceof view.HTMLVideoElement;
    const pixels = key => video ? Object.getOwnPropertyDescriptor(view.HTMLVideoElement.prototype, key).get.call(element) : 0;
    return { present: true, tag: element.tagName, visible, decoded_cid: element.dataset.decodedCid || null,
      src: native('currentSrc') || native('src') || '', current_time: native('currentTime'),
      duration: Number.isFinite(duration) ? duration : null, ready_state: native('readyState'),
      paused: native('paused'), ended: native('ended'), seeking: native('seeking'),
      video_width: pixels('videoWidth'), video_height: pixels('videoHeight') };
  }
  const input = element instanceof view.HTMLInputElement;
  const valueControl = input || element instanceof view.HTMLSelectElement || element instanceof view.HTMLTextAreaElement;
  if (valueControl && /password|secret|api.?key|access.?token|refresh.?token/i.test(`${element.id} ${element.getAttribute('name') || ''}`)) throw new Error('SECRET_OBSERVATION_BLOCKED');
  const privateValue = input && ['password', 'file', 'hidden'].includes(element.type);
  const number = key => input && element.type === 'range' && element[key] !== '' && Number.isFinite(Number(element[key])) ? Number(element[key]) : null;
  return { present: true, tag: element.tagName, type: input ? element.type : null, visible,
    enabled: !element.matches(':disabled') && !element.closest('[inert], [aria-disabled="true"]'),
    value: valueControl && !privateValue ? element.value : null, value_as_number: input && !privateValue && Number.isFinite(element.valueAsNumber) ? element.valueAsNumber : null,
    min: number('min'), max: number('max'), step: number('step') };
}

const missingPhaseElement = media => media
  ? { present: false, tag: null, visible: false, decoded_cid: null, src_sha256: null, current_time: null,
    duration: null, ready_state: null, paused: null, ended: null, seeking: null, video_width: null, video_height: null }
  : { present: false, tag: null, type: null, visible: false, enabled: false, value: null, value_as_number: null, min: null, max: null, step: null };

async function phaseElement(session, selector, media) {
  const target = session.primary.locator(selector), count = await target.count();
  demand(count <= 1, 'AMBIGUOUS_TARGET', 'supplemental observation must not select multiple app elements');
  if (!count) return { snapshot: missingPhaseElement(media), handle: null };
  const handle = await target.elementHandle();
  try {
    const snapshot = await handle.evaluate(readPhaseElement, media);
    if (media) {
      demand(typeof snapshot.src === 'string' && Buffer.byteLength(snapshot.src) <= 65536
        && (snapshot.decoded_cid === null || typeof snapshot.decoded_cid === 'string' && snapshot.decoded_cid.length <= 256),
      'INVALID_OBSERVATION', 'native media identity exceeds its observation bound');
      snapshot.src_sha256 = snapshot.src ? digest(snapshot.src) : null; delete snapshot.src;
    } else demand(snapshot.value === null || typeof snapshot.value === 'string' && Buffer.byteLength(snapshot.value) <= 8192,
      'INVALID_OBSERVATION', 'declared control value exceeds its observation bound');
    return { snapshot, handle };
  } catch (error) { await handle.dispose(); throw error; }
}

/** Handles and event closures stay private to this one step; no DOM proof marker
 * or application-supplied event log is trusted. Tests can exercise it as a DOM
 * observer, but only realSessions can promote the containing workflow. */
export async function beginPhaseStepEvidence(session, phase, step, stepIndex) {
  const selectors = phaseEvidenceSelectors(session.scenario);
  const interactive = ['click', 'fill', 'press', 'select', 'check', 'uncheck'].includes(step.op);
  const mediaNames = selectors.media.length && (interactive || step.op === 'reopen_app' || step.op === 'assert') ? selectors.media : [];
  const controlNames = step.checkpoint_id === 'error_observed' ? selectors.controls
    : interactive ? [...new Set([step.selector, ...(selectors.media.length ? selectors.controls.filter(name =>
      PHASES.some(namePhase => session.scenario.phases[namePhase].some(item => item.op === 'fill' && item.selector === name))) : [])])] : [];
  const record = { step_index: stepIndex, step: structuredClone(step), generation_before: session.generation,
    generation_after: session.generation, started_ms: performance.now() - session.phase_evidence_started,
    finished_ms: 0, observed: null, temporal_samples: [], media: [], controls: [], reopen: null };
  const handles = [], listeners = [], mediaBefore = [], controlsBefore = [];
  let oldWindow;
  const cleanup = async () => {
    for (const listener of listeners) { try { await listener.evaluate(state => { state.stop(); }); } finally { await listener.dispose(); } }
    for (const handle of handles) await handle.dispose();
  };
  try {
    for (const name of controlNames) { const value = await phaseElement(session, name, false); controlsBefore.push({ name, ...value }); if (value.handle) handles.push(value.handle); }
    const targetControl = controlsBefore.find(value => value.name === step.selector)?.snapshot;
    const range = ['press', 'fill', 'select'].includes(step.op) && targetControl?.tag === 'INPUT' && targetControl.type === 'range';
    for (const name of mediaNames) {
      const value = await phaseElement(session, name, true); mediaBefore.push({ name, ...value }); if (value.handle) handles.push(value.handle);
      if (range && value.handle) {
        const listener = await value.handle.evaluateHandle(node => {
          const events = [], view = node.ownerDocument.defaultView;
          const observe = event => {
            const time = Object.getOwnPropertyDescriptor(view.HTMLMediaElement.prototype, 'currentTime').get.call(node);
            if (events.length < 8 && Number.isFinite(time) && time >= 0) events.push({ current_time: time, is_trusted: event.isTrusted === true });
          };
          node.addEventListener('seeked', observe);
          return { events, stop: () => node.removeEventListener('seeked', observe) };
        }); listeners.push(listener); value.listener = listener; mediaBefore[mediaBefore.length - 1].listener = listener;
      }
    }
    if (step.op === 'reopen_app') { oldWindow = await session.window.elementHandle(); handles.push(oldWindow); }
    let cleaned = false;
    return { record, async finish(observed = null, samples = []) {
      try {
        if (range && listeners.length && !(await Promise.all(listeners.map(listener => listener.evaluate(state => state.events.length)))).some(Boolean))
          await session.page.waitForTimeout(500);
        // The canonical reopen already waits for app readiness. A declared media
        // element additionally gets a bounded native readiness wait, without a
        // backend call or an assertion that local restoration fetched anything.
        if (step.op === 'reopen_app') for (const name of mediaNames) {
          const target = session.primary.locator(name);
          if (await target.count() === 1) {
            const deadline = performance.now() + 1500;
            while (performance.now() < deadline && !(await target.evaluate(node => {
              const type = node.ownerDocument.defaultView.HTMLMediaElement;
              return node instanceof type && Object.getOwnPropertyDescriptor(type.prototype, 'readyState').get.call(node) >= 2;
            }))) await session.page.waitForTimeout(50);
          }
        }
        for (const before of mediaBefore) {
          const after = await phaseElement(session, before.name, true); if (after.handle) handles.push(after.handle);
          record.media.push({ selector: before.name, before: before.snapshot, after: after.snapshot,
            same_element: before.handle && after.handle ? await before.handle.evaluate((old, current) => old === current, after.handle) : null,
            seeked_events: before.listener ? await before.listener.evaluate(state => state.events) : [] });
        }
        for (const before of controlsBefore) {
          const after = await phaseElement(session, before.name, false); if (after.handle) handles.push(after.handle);
          record.controls.push({ selector: before.name, before: before.snapshot, after: after.snapshot });
        }
        if (oldWindow) record.reopen = { old_window_disconnected: !(await oldWindow.evaluate(node => node.isConnected)) };
        record.observed = observed; record.temporal_samples = structuredClone(samples);
        record.generation_after = session.generation;
        record.finished_ms = performance.now() - session.phase_evidence_started;
        return record;
      } finally { cleaned = true; await cleanup(); }
    }, async abort() { if (!cleaned) { cleaned = true; await cleanup(); } } };
  } catch (error) { await cleanup(); throw error; }
}

/** Optional historical extension: when present every fact must join the exact
 * retained action/probe chain. Its shape alone grants no browser provenance. */
export function validatePhaseEvidence(child, scenario) {
  if (!Object.hasOwn(child, 'phase_evidence')) return undefined;
  const evidence = child.phase_evidence;
  keys(evidence, ['schema', 'phases']);
  demand(evidence.schema === PHASE_EVIDENCE_SCHEMA && Buffer.byteLength(canonicalJSON(evidence)) <= 131072
    && Array.isArray(evidence.phases) && evidence.phases.length === 3, 'INVALID_OBSERVATION', 'phase evidence version/count/bound differs');
  const declared = phaseEvidenceSelectors(scenario);
  const mediaKeys = ['present', 'tag', 'visible', 'decoded_cid', 'src_sha256', 'current_time', 'duration', 'ready_state', 'paused', 'ended', 'seeking', 'video_width', 'video_height'];
  const controlKeys = ['present', 'tag', 'type', 'visible', 'enabled', 'value', 'value_as_number', 'min', 'max', 'step'];
  const number = (value, low = -Infinity) => typeof value === 'number' && Number.isFinite(value) && value >= low;
  const snapshot = (value, media) => {
    if (value === null) return;
    const fields = media ? mediaKeys : controlKeys, flags = media ? ['visible'] : ['visible', 'enabled'];
    keys(value, fields);
    demand(typeof value.present === 'boolean' && flags.every(key => typeof value[key] === 'boolean'), 'INVALID_OBSERVATION', 'phase snapshot flags differ');
    if (!value.present) {
      demand(fields.every(key => key === 'present' || flags.includes(key) ? value[key] === false : value[key] === null),
        'INVALID_OBSERVATION', 'missing phase element cannot invent values'); return;
    }
    if (media) demand(['VIDEO', 'AUDIO'].includes(value.tag) && ['paused', 'ended', 'seeking'].every(key => typeof value[key] === 'boolean')
      && (value.decoded_cid === null || typeof value.decoded_cid === 'string' && value.decoded_cid.length > 0 && value.decoded_cid.length <= 256)
      && (value.src_sha256 === null || typeof value.src_sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.src_sha256))
      && ['current_time', 'video_width', 'video_height'].every(key => number(value[key], 0))
      && (value.duration === null || number(value.duration, 0)) && Number.isSafeInteger(value.ready_state) && value.ready_state >= 0 && value.ready_state <= 4,
    'INVALID_OBSERVATION', 'native phase media snapshot differs');
    else demand(typeof value.tag === 'string' && /^[A-Z][A-Z0-9-]{0,63}$/.test(value.tag)
      && (value.type === null || typeof value.type === 'string' && value.type.length <= 64)
      && (value.value === null || typeof value.value === 'string' && Buffer.byteLength(value.value) <= 8192)
      && (!['password', 'file', 'hidden'].includes(value.type) || value.value === null && value.value_as_number === null)
      && ['value_as_number', 'min', 'max', 'step'].every(key => value[key] === null || number(value[key])),
    'INVALID_OBSERVATION', 'actual phase control snapshot differs');
  };
  const observations = [...child.semantic_assertions, ...child.error_observations];
  const temporal = []; let generation = null, finished = 0;
  for (const [phaseIndex, phase] of evidence.phases.entries()) {
    keys(phase, ['phase', 'generation_before', 'generation_after', 'steps']);
    demand(phase.phase === PHASES[phaseIndex] && Number.isSafeInteger(phase.generation_before) && phase.generation_before >= 0,
      'INVALID_OBSERVATION', 'phase generation/order differs');
    if (generation === null) generation = phase.generation_before;
    const steps = scenario.phases[phase.phase];
    demand(phase.generation_before === generation && Array.isArray(phase.steps) && phase.steps.length === steps.length
      && steps.length > 0 && steps.length <= 64, 'INVALID_OBSERVATION', 'phase omitted an original step');
    for (const [index, record] of phase.steps.entries()) {
      keys(record, ['step_index', 'step', 'generation_before', 'generation_after', 'started_ms', 'finished_ms', 'observed', 'temporal_samples', 'media', 'controls', 'reopen']);
      const step = steps[index], next = generation + (step.op === 'reopen_app' ? 1 : 0);
      demand(record.step_index === index && canonicalJSON(record.step) === canonicalJSON(step)
        && record.generation_before === generation && record.generation_after === next
        && Number.isSafeInteger(record.generation_before) && Number.isSafeInteger(record.generation_after)
        && number(record.started_ms, finished) && number(record.finished_ms, record.started_ms) && record.finished_ms <= 3600000,
      'INVALID_OBSERVATION', 'phase action/order/generation/time differs');
      generation = next; finished = record.finished_ms;
      const observed = step.op === 'assert' ? observations.find(row => row.phase === phase.phase && row.step_index === index)?.observed : null;
      demand(observed !== undefined && canonicalJSON(record.observed) === canonicalJSON(observed), 'INVALID_OBSERVATION', 'phase probe detached from retained actual observation');
      demand(Array.isArray(record.temporal_samples), 'INVALID_OBSERVATION', 'phase temporal samples differ');
      if (step.op === 'assert' && step.probe.temporal_ms !== undefined) {
        const samples = record.temporal_samples;
        demand(samples.length === 1 && plain(samples[0]) && canonicalJSON(Object.keys(samples[0]).sort()) === canonicalJSON(['after', 'before', 'sample_ms'])
          && number(samples[0].before) && number(samples[0].after) && samples[0].sample_ms === step.probe.temporal_ms
          && samples[0].after - samples[0].before === observed.actual, 'INVALID_OBSERVATION', 'phase temporal sample detached from actual delta');
      } else demand(record.temporal_samples.length === 0, 'INVALID_OBSERVATION', 'phase invented a temporal sample');
      temporal.push(...record.temporal_samples);
      demand(Array.isArray(record.media) && record.media.length <= 4 && new Set(record.media.map(item => item?.selector)).size === record.media.length
        && Array.isArray(record.controls) && record.controls.length <= 32 && new Set(record.controls.map(item => item?.selector)).size === record.controls.length,
      'INVALID_OBSERVATION', 'phase selectors duplicated/unbounded');
      for (const row of record.controls) {
        keys(row, ['selector', 'before', 'after']);
        demand(declared.controls.includes(row.selector), 'INVALID_OBSERVATION', 'phase control escaped original action selectors');
        snapshot(row.before, false); snapshot(row.after, false);
      }
      for (const row of record.media) {
        keys(row, ['selector', 'before', 'after', 'same_element', 'seeked_events']);
        demand(declared.media.includes(row.selector), 'INVALID_OBSERVATION', 'phase media escaped original declared probes');
        snapshot(row.before, true); snapshot(row.after, true);
        demand(row.before?.present && row.after?.present ? typeof row.same_element === 'boolean' : row.same_element === null,
          'INVALID_OBSERVATION', 'phase media identity detached from sampled handles');
        demand(Array.isArray(row.seeked_events) && row.seeked_events.length <= 8, 'INVALID_OBSERVATION', 'native seek events unbounded');
        for (const event of row.seeked_events) {
          keys(event, ['current_time', 'is_trusted']);
          demand(number(event.current_time, 0) && typeof event.is_trusted === 'boolean', 'INVALID_OBSERVATION', 'native seek event shape differs');
        }
        if (row.seeked_events.length) {
          const target = record.controls.find(item => item.selector === step.selector);
          demand(['press', 'fill', 'select'].includes(step.op) && target
            && [target.before, target.after].some(item => item?.present && item.tag === 'INPUT' && item.type === 'range'),
          'INVALID_OBSERVATION', 'seek events detached from declared actual range');
        }
      }
      if (step.op === 'reopen_app') demand(canonicalJSON(record.reopen) === canonicalJSON({ old_window_disconnected: true })
        && canonicalJSON(record.media.map(item => item.selector).sort()) === canonicalJSON([...declared.media].sort())
        && record.media.every(item => item.before !== null && item.after !== null), 'INVALID_OBSERVATION', 'reopen omitted actual window/media transition');
      else demand(record.reopen === null, 'INVALID_OBSERVATION', 'non-reopen invented a window transition');
      if (step.checkpoint_id === 'error_observed') demand(canonicalJSON(record.controls.map(item => item.selector).sort()) === canonicalJSON([...declared.controls].sort())
        && record.controls.every(item => item.after !== null), 'INVALID_OBSERVATION', 'error checkpoint omitted declared controls');
    }
    demand(Number.isSafeInteger(phase.generation_after) && phase.generation_after === generation, 'INVALID_OBSERVATION', 'phase final generation differs');
  }
  demand(canonicalJSON(temporal) === canonicalJSON(child.temporal_observations), 'INVALID_OBSERVATION', 'phase temporal samples differ from retained probe order');
  return evidence;
}

export async function executeScenarioPhase(session, phase, steps, context = {}) {
  demand(PHASES.includes(phase) && Array.isArray(steps) && steps.length > 0 && steps.length <= 64, 'INVALID_SCENARIO', 'a bounded known phase is required');
  for (const step of steps) validateStep(step, session.app);
  for (const step of steps) {
    for (const value of [step.selector, step.probe?.selector, step.probe?.within].filter(value => value !== undefined)) {
      demand(!/^(?:[a-z][a-z0-9_-]*=|\/|\.\.)|>>/i.test(value.trim()), 'POLICY_BOUNDARY', 'only CSS selectors scoped inside the app window are permitted');
    }
  }
  const semantics = requiredSemantics(session.app);
  const assertions = [], checkpoints = [], actions = [];
  const entryGeneration = session.generation;
  const phaseEvidence = session.phase_evidence ? { phase, generation_before: entryGeneration, generation_after: entryGeneration, steps: [] } : null;
  let reopened = false, errorObserved = false, recoveryAction = false;
  const unique = async selectorValue => {
    const locator = session.primary.locator(selectorValue);
    const targetCount = await locator.count();
    demand(targetCount === 1, 'AMBIGUOUS_TARGET', 'action/observation must resolve to exactly one element inside the app',
      { actual_count: targetCount, expected_count: 1, selector: selectorValue });
    return locator;
  };
  for (let index = 0; index < steps.length; index += 1) {
    session.failure_context = { phase, step: index, operation: steps[index].op,
      ...(steps[index].probe ? { probe: steps[index].probe } : {}),
      ...(steps[index].selector ? { selector: steps[index].selector } : {}) };
    await session.assertActive();
    const step = steps[index];
    const supplemental = phaseEvidence ? await beginPhaseStepEvidence(session, phase, step, index) : null;
    const temporalStart = session.temporal_observations?.length || 0;
    try {
    if (step.op === 'assert') {
      if (step.requirement_id) {
        demand(Object.hasOwn(semantics, step.requirement_id), 'MISSING_POSTCONDITION', 'unknown semantic requirement');
        demand(phase === 'primary_result' ? /^result_[1-9][0-9]*$/.test(step.requirement_id) : step.requirement_id === phase, 'MISSING_POSTCONDITION', 'semantic requirement belongs to a different phase');
        demand(!assertions.some(item => item.requirement_id === step.requirement_id), 'MISSING_POSTCONDITION', 'duplicate semantic result');
        if (phase === 'persist_reopen') demand(reopened && session.generation > entryGeneration, 'MISSING_POSTCONDITION', 'persistence requires a completed real close/reopen');
        if (phase === 'failure_recovery') demand(errorObserved && recoveryAction, 'MISSING_POSTCONDITION', 'recovery needs an observed error and subsequent UI recovery action');
      } else demand(phase === 'failure_recovery' && step.checkpoint_id === 'error_observed' && !errorObserved, 'MISSING_POSTCONDITION', 'only an actual failure checkpoint is permitted');
      const backend = step.probe.kind === 'backend_result' ? await collectBackendProof({ session, probe: step.probe, operator: step.operator, expected: step.expected }) : null;
      const actual = backend ? backend.result_assertion.actual : await observeDOMProbe(session, step.probe,
        { positiveMedia: phase === 'primary_result' && Boolean(step.requirement_id) });
      const observed = evaluateObservation({ operator: step.operator, actual, expected: step.expected });
      const record = { phase, step_index: index, probe: { ...step.probe }, observed };
      if (step.requirement_id) {
        assertions.push({ ...record, requirement_id: step.requirement_id, requirement_text: semantics[step.requirement_id] });
        const key = session.keyboard_focus_observations.filter(item => item.phase === phase && item.step_index < index).at(-1);
        if (key && !steps.slice(key.step_index + 1, index).some(item => !['assert', 'capture', 'wait_ms', 'wait_for'].includes(item.op))) key.semantic_requirement_id = step.requirement_id;
      } else { errorObserved = true; checkpoints.push({ ...record, checkpoint_id: step.checkpoint_id }); }
      if (supplemental) phaseEvidence.steps.push(await supplemental.finish(observed, (session.temporal_observations || []).slice(temporalStart)));
      continue;
    }
    if (step.op === 'reopen_app') { await session.reopen(); reopened = session.generation > entryGeneration; }
    else if (step.op === 'capture') await session.capture(`${phase}-${step.label}`);
    else if (step.op === 'wait_ms') await session.page.waitForTimeout(step.milliseconds);
    else if (step.op === 'wait_for') await session.primary.locator(step.selector).waitFor({ state: step.state, timeout: step.timeout_ms || 15000 });
    else {
      const target = await unique(step.selector);
      // Never fill password/credential controls or let a scenario read them.
      if (step.op === 'fill') await target.evaluate(readElementObservation, { kind: 'value' });
      await target.scrollIntoViewIfNeeded();
      if (step.op !== 'click') {
        await target.focus();
        const focused = await target.evaluate(element => element.ownerDocument.activeElement === element || element.contains(element.ownerDocument.activeElement));
        demand(focused, 'FOCUS_NOT_REACHED', 'requested control did not receive keyboard focus');
        if (step.op === 'press') session.keyboard_focus_observations.push({ phase, step_index: index, key: step.key, focused: true, inside_app: true });
      }
      if (step.op === 'click') await target.click({ timeout: 15000 });
      else if (step.op === 'fill') await target.fill(step.value, { timeout: 15000 });
      else if (step.op === 'press') await target.press(step.key, { timeout: 15000 });
      else if (step.op === 'select') await target.selectOption(step.value, { timeout: 15000 });
      else if (step.op === 'check') await target.check({ timeout: 15000 });
      else if (step.op === 'uncheck') await target.uncheck({ timeout: 15000 });
    }
    if (errorObserved && !['wait_ms', 'wait_for', 'capture'].includes(step.op)) recoveryAction = true;
    actions.push({ op: step.op, step_index: index });
    if (supplemental) phaseEvidence.steps.push(await supplemental.finish());
    } finally { await supplemental?.abort(); }
  }
  const expectedIds = phase === 'primary_result' ? Object.keys(semantics).filter(id => id.startsWith('result_')) : [phase];
  demand(expectedIds.every(id => assertions.some(item => item.requirement_id === id)), 'MISSING_POSTCONDITION', 'phase did not establish every required semantic postcondition');
  session.semantic_assertions.push(...assertions);
  session.checkpoints.push(...checkpoints);
  if (Array.isArray(context.semantic_assertions)) context.semantic_assertions.push(...assertions);
  if (phaseEvidence) {
    phaseEvidence.generation_after = session.generation;
    session.phase_evidence.phases.push(phaseEvidence);
    demand(Buffer.byteLength(canonicalJSON(session.phase_evidence)) <= 131072, 'INVALID_OBSERVATION', 'phase evidence exceeds its retained byte bound');
  }
  return { phase, assertions, checkpoints, actions, generation: session.generation, actual_desktop: session.actual_desktop,
    functional_acceptance: 'not_evaluated', work_complete: false, completion_authority: false };
}

export async function checkLifecycleFoundation() {
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-name-pattern=^stage2 engine ', testFile],
    { encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024, env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT')) });
  const passed = Number(run.stdout?.match(/^# pass (\d+)$/m)?.[1] || 0);
  demand(run.status === 0 && !run.error && passed >= 12 && /^# fail 0$/m.test(run.stdout || ''), 'FOUNDATION_CHECK_FAILED', 'stage2 executable lifecycle/action failure detectors did not pass');
  return { schema: 'swissknife.visual-functional-foundation-check.v1', stage: 'stage2', passed: true,
    checks: ['canonical-window-lifecycle', 'owned-resource-cleanup', 'actual-dom-postconditions', 'persistence-loss-detection',
      'observed-error-and-recovery', 'keyboard-focus', 'blank-and-clipped-media', 'backend-fails-closed'], executable_tests_passed: passed,
    actual_desktop: false, functional_acceptance: 'not_evaluated', work_complete: false, completion_authority: false };
}

export function admitBackendCall(call, app, scenario) {
  keys(call, ['protocol', 'route', 'binding_id', 'app_id', 'intent_id', 'owner', 'tool_id', 'transport', 'correlation_id', 'input', 'receipt_required']);
  demand(app.disposition === 'tool_backed' && call.protocol === 'swissknife.all-app-tool-gateway.v1'
    && call.route === '/mcp/tools/call' && call.app_id === app.app_id && call.receipt_required === true,
  'POLICY_BOUNDARY', 'call must belong to the actual tool-backed app and governed gateway');
  const role = app.backend_roles.find(item => item.owner === call.owner && item.bindings.some(binding => binding.binding_id === call.binding_id));
  const binding = role?.bindings.find(item => item.binding_id === call.binding_id);
  const intent = scenario.backend_bindings.find(item => item.binding_id === call.binding_id);
  demand(binding && intent && binding.exact_tool_candidates.includes(call.tool_id) && binding.transports.includes(call.transport)
    && ['http', 'libp2p'].includes(call.transport) && text(call.intent_id) && text(call.correlation_id) && call.correlation_id.length <= 512,
  'POLICY_BOUNDARY', 'call exceeds the scenario binding, exact tool or transport allowlist');
  keys(call.input, ['correlation_id', 'payload', 'policy']);
  demand(call.input.correlation_id === call.correlation_id && plain(call.input.payload) && plain(call.input.policy), 'BACKEND_JOIN_MISMATCH', 'call input/correlation mismatch');
  const policy = call.input.policy;
  demand(policy.dry_run === false && policy.outcome === (binding.mutates_remote_state ? 'require_confirmation' : 'allow')
    && policy.consent === (binding.mutates_remote_state ? 'granted' : 'not_required'),
  'POLICY_BOUNDARY', 'a preview/dry run or unconfirmed operation cannot establish workflow acceptance');
  if (binding.mutates_remote_state) demand(call.input.payload.fixture_scope === scenario.fixture_scope,
    'POLICY_BOUNDARY', 'mutation must explicitly name the isolated scenario fixture scope');
  const pending = [call.input.payload];
  let objects = 0;
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object') continue;
    demand(++objects <= 4096, 'POLICY_BOUNDARY', 'payload exceeds structural bounds');
    for (const [key, child] of Object.entries(value)) {
      demand(!/^(authorization|backend_credentials|bearer_token|api_key|password|secret|host_path|file_path|filesystem_path|python_process|process_command|stdio|url|endpoint|base_url|backend_url)$/i.test(key),
        'POLICY_BOUNDARY', 'credentials, owner endpoints and host paths are forbidden in browser calls');
      if (child && typeof child === 'object') pending.push(child);
    }
  }
  demand(Buffer.byteLength(canonicalJSON(call)) <= 131072, 'POLICY_BOUNDARY', 'browser call exceeds its byte bound');
  return { binding, intent };
}

function boundedFile(file, limit) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    demand(stat.isFile() && stat.size <= limit, 'ARTIFACT_INVALID', 'artifact is not a bounded regular file');
    const bytes = fs.readFileSync(fd);
    demand(bytes.length <= limit, 'ARTIFACT_INVALID', 'artifact grew beyond its byte bound');
    return bytes;
  } finally { fs.closeSync(fd); }
}

export async function readPersistedGatewayArtifact(cid, { artifactRoot } = {}) {
  const { cidForBytes } = require('./mcpplusplus-profile-a.cjs');
  const { DEFAULT_CACHE_ROOT } = require('./mcpplusplus-artifact-store.cjs');
  demand(/^b[a-z2-7]{58}$/.test(cid || ''), 'ARTIFACT_INVALID', 'expected a CIDv1 raw SHA-256 artifact');
  const root = path.resolve(artifactRoot || process.env.MCPPLUSPLUS_ARTIFACT_STORE_DIR || DEFAULT_CACHE_ROOT);
  const block = path.join(root, 'blocks', cid);
  if (fs.existsSync(block)) {
    const bytes = boundedFile(block, 1048576);
    demand(cidForBytes(bytes) === cid, 'ARTIFACT_CID_MISMATCH', 'persisted artifact bytes do not match the requested CID');
    return bytes;
  }
  // The gateway persists with IPFS Kit. Read that same approved loopback
  // artifact API when Helia, rather than the disk fallback, owns the block.
  // No tool call, artifact write, Helia start or arbitrary URL is permitted.
  let endpoint = process.env.SWISSKNIFE_IPFS_KIT_MCP_URL || 'http://127.0.0.1:8014';
  if (!process.env.SWISSKNIFE_IPFS_KIT_MCP_URL) {
    const lease = path.join(PROJECT_ROOT, 'test-results/virtual-desktop-ipfs-mcp-orb/ipfs-kit-compat-endpoint.json');
    if (fs.existsSync(lease)) {
      const value = JSON.parse(boundedFile(lease, 16384));
      demand(value.schema === 'swissknife.mcp-compat-endpoint.v1' && value.service === 'ipfs_kit_py', 'POLICY_BOUNDARY', 'artifact endpoint lease identity mismatch');
      endpoint = value.endpoint;
    }
  }
  const url = new URL(endpoint);
  demand(url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) && !url.username && !url.password && !url.search && !url.hash
    && ['/', '/mcp', '/mcp/'].includes(url.pathname), 'POLICY_BOUNDARY', 'artifact reads require the approved local IPFS Kit endpoint');
  url.pathname = `/mcp/artifacts/${cid}`;
  const response = await fetch(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000) });
  demand(response.ok && response.body, 'ARTIFACT_MISSING', 'persisted gateway artifact could not be retrieved');
  const chunks = []; let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > 1572864) { await response.body.cancel().catch(() => {}); throw new WorkflowError('ARTIFACT_INVALID', 'artifact response exceeds its bound'); }
    chunks.push(Buffer.from(chunk));
  }
  const value = JSON.parse(Buffer.concat(chunks));
  demand(value.found === true && value.verified === true && value.cid === cid && typeof value.bytes_base64 === 'string'
    && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.bytes_base64), 'ARTIFACT_INVALID', 'artifact endpoint did not return verified canonical bytes');
  const bytes = Buffer.from(value.bytes_base64, 'base64');
  demand(bytes.length <= 1048576 && cidForBytes(bytes) === cid, 'ARTIFACT_CID_MISMATCH', 'retrieved artifact bytes do not match the CID');
  return bytes;
}

export function verifyBackendProof({ app, scenario, record, receiptBytes, eventBytes, assertion }) {
  const { cidForBytes } = require('./mcpplusplus-profile-a.cjs');
  const { assessOwnerResult } = require('./vdg-connector-artifacts.cjs');
  const { call, response, http_status: status } = record;
  const { binding, intent } = admitBackendCall(call, app, scenario);
  if (binding.mutates_remote_state && record.actual_desktop === true) demand(record.ui_consent_verified === true, 'POLICY_BOUNDARY', 'actual mutation has no observed trusted native UI consent');
  demand(Number.isInteger(status) && status >= 200 && status < 300 && plain(response) && response.ok === true && response.outcome === 'executed',
    'BACKEND_EXECUTION_FAILED', 'actual browser response did not execute successfully');
  for (const key of ['owner', 'tool_id', 'transport', 'correlation_id']) demand(response[key] === call[key], 'BACKEND_JOIN_MISMATCH', 'gateway response identity differs from observed browser request');
  demand(Buffer.byteLength(canonicalJSON(response)) <= intent.max_output_bytes, 'BACKEND_OUTPUT_BOUND', 'owner output exceeds the scenario budget');
  const header = response.receipt;
  demand(plain(header) && header.outcome === 'executed' && header.policy_outcome === call.input.policy.outcome,
    'BACKEND_JOIN_MISMATCH', 'gateway receipt policy/outcome mismatch');
  for (const key of ['owner', 'tool_id', 'transport', 'correlation_id']) demand(header[key] === call[key], 'BACKEND_JOIN_MISMATCH', 'gateway receipt identity mismatch');
  const eventCid = header.event_dag_refs?.[0];
  demand(/^b[a-z2-7]{58}$/.test(header.receipt_id || '') && /^b[a-z2-7]{58}$/.test(eventCid || '')
    && header.persistence?.status === 'persisted' && header.persistence.receipt_cid === header.receipt_id && header.persistence.event_cid === eventCid,
  'ARTIFACT_MISSING', 'actual gateway receipt/event persistence evidence is absent');
  const records = {};
  for (const [kind, bytes, cid] of [['receipt', receiptBytes, header.receipt_id], ['event', eventBytes, eventCid]]) {
    demand(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= intent.max_output_bytes && cidForBytes(bytes) === cid,
      'ARTIFACT_CID_MISMATCH', `${kind} CID does not match retained raw bytes`);
    let value;
    try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new WorkflowError('ARTIFACT_INVALID', `${kind} is not JSON`); }
    demand(plain(value) && value.kind === kind && bytes.toString('utf8') === canonicalJSON(value), 'ARTIFACT_INVALID', 'gateway artifact is not canonical JSON of its declared kind');
    demand(canonicalJSON(value.call) === canonicalJSON(call) && canonicalJSON(value.result) === canonicalJSON(response.result),
      'BACKEND_JOIN_MISMATCH', 'raw receipt/event call and native result differ from browser evidence');
    records[kind] = value;
  }
  const assessment = assessOwnerResult(records.receipt.result, { ...call, outcome: response.outcome, policy_outcome: call.input.policy.outcome, dry_run: false });
  demand(assessment.verified === true, 'OWNER_RESULT_UNVERIFIED', assessment.reason);
  demand(records.receipt.result?.result?.receipt?.tool === call.tool_id, 'OWNER_RESULT_UNVERIFIED', 'native owner receipt does not identify the executed tool');
  keys(assertion, ['pointer', 'operator', 'expected']);
  demand(typeof assertion.pointer === 'string' && assertion.pointer.startsWith('/result/result/')
    && !assertion.pointer.startsWith('/result/result/receipt'), 'INVALID_OBSERVATION', 'semantic proof must inspect native owner output, not gateway or receipt identity flags');
  const actual = readJSONPointer(records.receipt, assertion.pointer);
  const observed = evaluateObservation({ operator: assertion.operator, actual, expected: assertion.expected });
  return { owner: call.owner, tool_id: call.tool_id, binding_id: call.binding_id, app_id: call.app_id, route: call.route,
    transport: call.transport, correlation_id: call.correlation_id, outcome: 'executed', receipt_id: header.receipt_id, event_dag_cid: eventCid,
    receipt_verified: true, semantic_result_verified: true, verification_method: 'browser-response-and-content-addressed-gateway-artifacts',
    result_assertion: { pointer: assertion.pointer, ...observed }, actual_desktop: record.actual_desktop === true };
}

function artifactRecord(file, root = WORKSPACE_ROOT) {
  const relative = path.relative(root, file);
  demand(relative && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'ARTIFACT_INVALID', 'workflow artifact escaped the workspace');
  const bytes = boundedFile(file, 67108864);
  return { path: relative.split(path.sep).join('/'), sha256: digest(bytes), bytes: bytes.length };
}

export async function collectBackendProof({ session, probe, operator, expected, recordIndex,
  artifactReader = readPersistedGatewayArtifact, evidenceRoot = WORKSPACE_ROOT }) {
  demand(session.backend_enabled === true && probe.kind === 'backend_result', 'FOUNDATION_STAGE_UNIMPLEMENTED', 'backend proof requires an enabled real browser observer');
  const intent = session.scenario.backend_bindings.find(item => item.binding_id === probe.binding_id);
  demand(intent, 'POLICY_BOUNDARY', 'backend probe is not declared by this scenario');
  const deadline = Date.now() + intent.max_duration_seconds * 1000;
  let record;
  while (Date.now() < deadline) {
    await session.assertActive();
    record = recordIndex === undefined ? session.backend_records.filter(item => item.call.binding_id === probe.binding_id).at(-1)
      : session.backend_records[recordIndex];
    demand(recordIndex === undefined || (Number.isSafeInteger(recordIndex) && recordIndex >= 0
      && record?.call.binding_id === probe.binding_id), 'BACKEND_JOIN_MISMATCH', 'backend proof names a different request');
    if (record?.finished) break;
    await sleep(25);
  }
  demand(record?.finished && !record.error && record.response, 'BACKEND_EVIDENCE_MISSING', 'no completed observed browser call/result belongs to this binding');
  if (session.phase_evidence && recordIndex === undefined && PHASES.includes(session.failure_context?.phase)) demand(
    record.request_phase?.phase === session.failure_context.phase, 'BACKEND_JOIN_MISMATCH',
    'a semantic backend probe cannot reuse a request from a different scenario phase');
  const receiptCid = record.response.receipt?.receipt_id, eventCid = record.response.receipt?.event_dag_refs?.[0];
  const receiptBytes = await artifactReader(receiptCid), eventBytes = await artifactReader(eventCid);
  const observation = verifyBackendProof({ app: session.app, scenario: session.scenario, record, receiptBytes, eventBytes,
    assertion: { pointer: probe.pointer, operator, expected } });
  if (session.phase_evidence) {
    demand(record.request_phase && record.request_phase.request_index === session.backend_records.indexOf(record),
      'BACKEND_JOIN_MISMATCH', 'V2 backend proof lacks its actual request-time witness');
    observation.request_phase_index = record.request_phase.request_index;
  }
  const directory = path.join(session.outputDir, 'backend');
  fs.mkdirSync(directory, { recursive: true });
  for (const [kind, bytes, cid] of [['receipt', receiptBytes, receiptCid], ['event', eventBytes, eventCid]]) {
    const destination = path.join(directory, `${kind}-${cid}.json`);
    if (fs.existsSync(destination)) demand(boundedFile(destination, 1048576).equals(bytes), 'ARTIFACT_COLLISION', 'raw backend artifact path has foreign bytes');
    else fs.writeFileSync(destination, bytes, { flag: 'wx' });
    observation[`${kind}_artifact`] = artifactRecord(destination, evidenceRoot).path;
    session.backend_artifacts.set(destination, artifactRecord(destination, evidenceRoot));
  }
  session.backend_observations.push(observation);
  return observation;
}

/** Retain the last successful call in every actually observed binding/phase.
 * The original final-binding check still runs first; these are additional
 * independently verified receipts, never a substitute for a failed last call. */
export async function collectPhaseBackendProofs({ session, artifactReader = readPersistedGatewayArtifact, evidenceRoot = WORKSPACE_ROOT }) {
  demand(session.phase_evidence, 'INVALID_OBSERVATION', 'request-phase proofs require a V2 session');
  for (const intent of session.scenario.backend_bindings) {
    if (!intent.result_assertion) continue;
    const selected = new Map();
    session.backend_records.forEach((record, index) => {
      if (record.call.binding_id === intent.binding_id && record.finished && !record.error
          && record.response?.ok === true && record.response?.outcome === 'executed') {
        demand(record.request_phase?.request_index === index, 'BACKEND_JOIN_MISMATCH', 'request witness changed');
        selected.set(record.request_phase.phase, index);
      }
    });
    for (const index of selected.values()) {
      if (session.backend_observations.some(row => row.request_phase_index === index
          && canonicalJSON(row.result_assertion) === canonicalJSON({ ...intent.result_assertion,
            actual: row.result_assertion.actual }))) continue;
      await collectBackendProof({ session, recordIndex: index,
        probe: { kind: 'backend_result', binding_id: intent.binding_id, pointer: intent.result_assertion.pointer },
        operator: intent.result_assertion.operator, expected: intent.result_assertion.expected, artifactReader, evidenceRoot });
    }
  }
}

export function validateBackendRequestPhases(report, scenario, calls = new Map()) {
  const witness = report.backend_request_phases;
  if (witness === undefined) {
    demand(report.backend_observations.every(row => row.request_phase_index === undefined),
      'BACKEND_JOIN_MISMATCH', 'a phased proof has no request witness');
    return null; // Historical unphased reports make no request-phase claim.
  }
  keys(witness, ['schema', 'requests']);
  demand(witness.schema === BACKEND_REQUEST_PHASE_SCHEMA && Array.isArray(witness.requests)
    && witness.requests.length === report.backend_call_count && witness.requests.length <= 64,
    'BACKEND_JOIN_MISMATCH', 'request-phase witness count/schema mismatch');
  const seen = new Set();
  witness.requests.forEach((row, index) => {
    keys(row, ['request_index', 'phase', 'step_index', 'generation', 'binding_id', 'correlation_id', 'call_sha256']);
    demand(row.request_index === index && Number.isSafeInteger(row.request_index)
      && BACKEND_OBSERVATION_PHASES.includes(row.phase) && Number.isSafeInteger(row.generation) && row.generation >= 0
      && scenario.backend_bindings.some(intent => intent.binding_id === row.binding_id)
      && text(row.correlation_id) && !seen.has(row.correlation_id) && /^[0-9a-f]{64}$/.test(row.call_sha256),
      'BACKEND_JOIN_MISMATCH', 'request-phase identity/ordinal is invalid');
    seen.add(row.correlation_id);
    if (PHASES.includes(row.phase)) {
      demand(Number.isSafeInteger(row.step_index) && row.step_index >= 0 && row.step_index < scenario.phases[row.phase].length,
        'BACKEND_JOIN_MISMATCH', 'request did not occur at a declared scenario step');
      const phase = report.phase_evidence?.phases.find(item => item.phase === row.phase);
      if (phase) demand(row.generation >= phase.generation_before && row.generation <= phase.generation_after,
        'BACKEND_JOIN_MISMATCH', 'request generation escaped its actual phase');
    } else demand(row.step_index === null, 'BACKEND_JOIN_MISMATCH', 'unphased request acquired a fictitious step');
  });
  for (const phase of BACKEND_OBSERVATION_PHASES) demand(
    witness.requests.filter(row => row.phase === phase).length === report.backend_call_phases[phase],
    'BACKEND_JOIN_MISMATCH', 'request witnesses disagree with observed dispatch-phase counts');
  for (const row of report.backend_observations) {
    const index = row.request_phase_index;
    demand(Number.isSafeInteger(index) && index >= 0 && index < witness.requests.length,
      'BACKEND_JOIN_MISMATCH', 'backend result has no exact request ordinal');
    const request = witness.requests[index], call = calls.get(row.correlation_id);
    demand(request.binding_id === row.binding_id && request.correlation_id === row.correlation_id
      && call && digest(canonicalJSON(call)) === request.call_sha256,
      'BACKEND_JOIN_MISMATCH', 'request phase is detached from its native receipt call');
  }
  return witness;
}

export function validateDecodedImageObservations(report, scenario, readArtifact) {
  if (report.image_observations === undefined) return;
  demand(Array.isArray(report.image_observations) && report.image_observations.length <= 64,
    'INVALID_OBSERVATION', 'native image observation count is unbounded');
  for (const row of report.image_observations) {
    keys(row, ['phase','step_index','selector','decoded','natural_width','natural_height','visible_area','source_sha256','content_sha256','image_artifact']);
    const step = scenario.phases[row.phase]?.[row.step_index];
    demand(PHASES.includes(row.phase) && Number.isSafeInteger(row.step_index) && row.step_index >= 0
      && step?.op === 'assert' && step.probe?.kind === 'image_state' && step.probe.selector === row.selector
      && row.decoded === true && Number.isSafeInteger(row.natural_width) && row.natural_width > 0
      && Number.isSafeInteger(row.natural_height) && row.natural_height > 0
      && Number.isFinite(row.visible_area) && row.visible_area >= 64 && /^[0-9a-f]{64}$/.test(row.source_sha256),
      'INVALID_OBSERVATION', 'native decoded image is detached from its original scenario/decoder');
    const assertion = [...report.semantic_assertions, ...report.error_observations].find(
      item => item.phase === row.phase && item.step_index === row.step_index);
    const state = Object.fromEntries(['decoded','natural_width','natural_height','visible_area'].map(key => [key,row[key]]));
    demand(assertion && step.probe.temporal_ms === undefined
      && canonicalJSON(step.probe.pointer === undefined ? state : readJSONPointer(state, step.probe.pointer)) === canonicalJSON(assertion.observed.actual),
      'INVALID_OBSERVATION', 'image assertion is detached from its actual native decoder snapshot');
    if (row.content_sha256 === null) {
      demand(row.image_artifact === null, 'ARTIFACT_INVALID', 'image artifact has no actual encoded bytes');
      continue;
    }
    demand(/^[0-9a-f]{64}$/.test(row.content_sha256) && row.image_artifact
      && report.artifacts.some(ref => canonicalJSON(ref) === canonicalJSON(row.image_artifact)),
      'ARTIFACT_INVALID', 'decoded image bytes escaped their child artifact closure');
    const bytes = readArtifact(row.image_artifact);
    demand(digest(bytes) === row.content_sha256 && digest('data:image/png;base64,'+bytes.toString('base64')) === row.source_sha256,
      'ARTIFACT_INVALID', 'native image source differs from its retained PNG bytes');
    encodedPNGObservation({...row,native_source:'data:image/png;base64,'+bytes.toString('base64')});
  }
}

export async function checkBackendProofFoundation() {
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-name-pattern=^stage3 (?!foundation CLI)', testFile],
    { encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024, env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT')) });
  const passed = Number(run.stdout?.match(/^# pass (\d+)$/m)?.[1] || 0);
  demand(run.status === 0 && !run.error && passed >= 12 && /^# fail 0$/m.test(run.stdout || ''), 'FOUNDATION_CHECK_FAILED', 'stage3 proof/report rejection checks did not pass');
  return { schema: 'swissknife.visual-functional-foundation-check.v1', stage: 'stage3', passed: true,
    checks: ['observed-browser-call-joins', 'raw-receipt-event-cids', 'owner-transport-and-ucan-assessment', 'typed-scalar-and-temporal-probes', 'stale-source-rejection', 'no-fixture-app-acceptance'],
    executable_tests_passed: passed, actual_desktop: false, functional_acceptance: 'not_evaluated', work_complete: false, completion_authority: false };
}
/** Stage4 output contract: settings.outputDir/pilot.json, PILOT_SCHEMA,
 * app_id calculator, actual_desktop true, foundation_integration_only true,
 * functional_acceptance false. Retain root-relative path/sha256/bytes artifacts
 * desktop.png and mobile.png, current task.pilot_sources source_sha256, and
 * exactly PILOT_OBSERVATIONS entries {kind,observation:{operator,actual,expected}}.
 * This is a bounded driver integration, not full Calculator acceptance. */
export async function runCalculatorPilot(settings) {
  return (await import('./svf-calculator-pilot.mjs')).runCalculatorPilot(settings, { openRealDesktopSession });
}

export function workflowSourceSnapshot(app, { contractsPath = CONTRACT_PATH, scenarioPath = path.join(PROJECT_ROOT, 'test/e2e/functional-workflows', `${app.app_id}.json`), projectRoot = PROJECT_ROOT } = {}) {
  const sources = {};
  for (const relative of app.source_paths) {
    demand(typeof relative === 'string' && !path.isAbsolute(relative) && !relative.split('/').includes('..'), 'INVALID_CONTRACT', 'source must be a declared repository-relative file');
    const file = path.join(projectRoot, relative);
    demand(fs.realpathSync(file).startsWith(fs.realpathSync(projectRoot) + path.sep), 'INVALID_CONTRACT', 'source escaped the actual app checkout');
    sources[`swissknife/${relative}`] = digest(boundedFile(file, 16777216));
  }
  return { contract_sha256: digest(boundedFile(contractsPath, 1048576)), scenario_sha256: digest(boundedFile(scenarioPath, 1048576)), source_sha256: sources };
}

export function assertWorkflowSources(snapshot, app, options = {}) {
  demand(canonicalJSON(snapshot) === canonicalJSON(workflowSourceSnapshot(app, options)), 'STALE_SOURCE', 'app sources, contract or scenario changed during the workflow');
}

// V2 also binds the shared code that produces/interprets observations. These
// paths and the index's local stylesheets are independently checked by Python.
export const INDEPENDENT_STATIC_INPUTS = Object.freeze([
  'swissknife/scripts/run-visual-functional-workflow.mjs',
  'swissknife/scripts/capture-visual-functional-baseline.mjs',
  'swissknife/scripts/lib/pick-free-port.mjs',
  'scripts/swissknife_visual_functional_worker.py',
  'scripts/swissknife_visual_functional_llm.py',
  'scripts/swissknife_visual_functional_phase_budget.py',
  'scripts/swissknife_visual_functional_review_recheck.py',
  'scripts/swissknife_visual_functional_final_coverage.py',
  'scripts/swissknife_visual_functional_blocked.py',
  'scripts/swissknife_visual_functional_native_context.py',
  'scripts/swissknife_visual_functional_recovery.py',
  'config/swissknife_visual_functional_supervisor.json',
  'config/swissknife_visual_functional_payload_fixtures.json',
  'swissknife/build-tools/configs/vite.web.config.ts',
  'external/ipfs_accelerate/ipfs_accelerate_py/llm_router.py',
  'external/ipfs_accelerate/ipfs_accelerate_py/cli_runtime/grok_stream_capture.py',
  'swissknife/scripts/mcpplusplus-profile-a.cjs',
  'swissknife/scripts/mcpplusplus-artifact-store.cjs',
  'swissknife/scripts/vdg-connector-artifacts.cjs',
  'swissknife/config/mcpplusplus-helia-bootstrap-peers.json',
  'swissknife/scripts/live-click-fixture.cjs',
  'swissknife/web/js/apps/network-native-tools.js',
  'swissknife/web/index.html', 'swissknife/web/js/main-simple.js',
  'swissknife/web/js/live-tool-gateway.js',
  'swissknife/web/js/core/mcp-plus-plus-desktop-client.js',
  'swissknife/web/js/all-app-backend-status.js',
  'swissknife/src/services/apps/virtual-desktop-app-manifest.ts',
  'swissknife/src/services/apps/all-app-executable-backend-contract.ts',
  'swissknife/src/services/apps/all-app-live-tool-bindings.ts',
  'swissknife/src/services/mcp/all-app-tool-mediator.ts',
  'swissknife/src/services/mcp/all-app-tool-gateway.ts',
  'swissknife/src/services/mcp/mcp-plus-plus-connector.ts',
  'swissknife/src/services/mcp/mcp-plus-plus-profile-c.ts',
]);
export const INDEPENDENT_OPTIONAL_INPUTS = Object.freeze([
  'swissknife/ipfs_accelerate_js/src/p2p/collaborative-file-system.js',
]);
export const INDEPENDENT_SOURCE_LIMITS = Object.freeze({ files: 512, bytes: 16777216 });
const moduleSpecifierCache = new Map();

function optionalInputAbsent(root, relative) {
  demand(INDEPENDENT_OPTIONAL_INPUTS.includes(relative), 'ARTIFACT_INVALID', 'only the approved optional module can be absent');
  let target = path.resolve(root), missing = false;
  for (const part of relative.split('/')) {
    target = path.join(target, part);
    if (missing) continue;
    let info;
    try { info = fs.lstatSync(target); } catch (error) { if (error.code === 'ENOENT') { missing = true; continue; } throw error; }
    demand(!info.isSymbolicLink(), 'ARTIFACT_INVALID', 'optional module ancestry must be physical');
  }
  return missing;
}

function firstPartySpecifiers(name, bytes) {
  const key = name + ':' + digest(bytes);
  if (moduleSpecifierCache.has(key)) return moduleSpecifierCache.get(key);
  const ts = require('typescript');
  const source = ts.createSourceFile(name, bytes.toString('utf8'), ts.ScriptTarget.Latest, true);
  demand(source.parseDiagnostics.length === 0, 'INVALID_CONTRACT', 'first-party source must parse before dependency admission: ' + name);
  const constants = new Map(), result = [];
  const literal = node => {
    if (!node) return null;
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isIdentifier(node)) return constants.get(node.text) ?? null;
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return literal(node.expression);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = literal(node.left), right = literal(node.right); return left !== null && right !== null ? left + right : null;
    }
    if (name === 'swissknife/scripts/run-visual-functional-workflow.mjs' && ts.isPropertyAccessExpression(node) && node.name.text === 'href'
      && ts.isCallExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'pathToFileURL') {
      const joined = node.expression.arguments[0];
      if (joined && ts.isCallExpression(joined) && joined.expression.getText(source) === 'path.join'
        && ts.isIdentifier(joined.arguments[0]) && joined.arguments[0].text === 'PROJECT_ROOT') {
        const parts = joined.arguments.slice(1).map(literal);
        if (parts.length && parts.every(value => value !== null)) {
          const target = path.posix.join('swissknife', ...parts), relative = path.posix.relative(path.posix.dirname(name), target);
          return relative.startsWith('.') ? relative : './' + relative;
        }
      }
    }
    return null;
  };
  for (const statement of source.statements) if (ts.isVariableStatement(statement) && statement.declarationList.flags & ts.NodeFlags.Const) {
    for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) {
      const value = literal(declaration.initializer); if (value !== null) constants.set(declaration.name.text, value);
    }
  }
  const add = (node, dynamic = false) => {
    const value = literal(node);
    if (value !== null) { result.push({ specifier: value, dynamic }); return; }
    // The Vite config deliberately invokes a require factory on this exact
    // repoRoot-relative expression instead of a normal string require().
    if (name === 'swissknife/build-tools/configs/vite.web.config.ts' && node && ts.isCallExpression(node)
      && ts.isIdentifier(node.expression) && node.expression.text === 'resolve' && node.arguments.length === 2
      && ts.isIdentifier(node.arguments[0]) && node.arguments[0].text === 'repoRoot' && literal(node.arguments[1]) !== null
      && /const\s+repoRoot\s*=\s*resolve\(configDir,\s*['"]\.\.\/\.\.['"]\)/.test(bytes.toString('utf8'))) {
      result.push({ specifier: '../../' + literal(node.arguments[1]), dynamic }); return;
    }
    const line = node ? source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 : 0;
    throw new WorkflowError('INVALID_CONTRACT', 'unresolved computed module dependency: ' + name + ':' + line);
  };
  const visit = node => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) { if (node.moduleSpecifier) add(node.moduleSpecifier); }
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) add(node.moduleReference.expression);
    else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0], true);
      else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') add(node.arguments[0]);
      else if (ts.isCallExpression(node.expression) && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === 'createRequire') add(node.arguments[0]);
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL'
      && node.arguments?.[1]?.getText(source) === 'import.meta.url') add(node.arguments[0], true);
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (moduleSpecifierCache.size >= 512) moduleSpecifierCache.delete(moduleSpecifierCache.keys().next().value);
  moduleSpecifierCache.set(key, result); return result;
}

function resolveFirstPartySpecifier(root, importer, specifier, viteBytes) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(specifier)) return [];
  let target;
  const aliases = { '@web': 'web/src', '@ipfs': 'ipfs_accelerate_js/src', '@': 'src' };
  const alias = Object.keys(aliases).find(key => specifier === key || specifier.startsWith(key + '/'));
  if (alias) {
    // These are the exact first-party aliases in the protected Vite config;
    // refuse a changed alias expression rather than silently guessing a root.
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp('["\\\']' + escaped + '["\\\']\\s*:\\s*resolve\\(repoRoot,\\s*["\\\']' + aliases[alias] + '["\\\']\\s*\\)');
    demand(pattern.test(viteBytes.toString('utf8')) && /const\s+repoRoot\s*=\s*resolve\(configDir,\s*['"]\.\.\/\.\.['"]\)/.test(viteBytes.toString('utf8')),
      'INVALID_CONTRACT', 'first-party Vite alias changed from its explicit resolution policy');
    target = path.join(root, 'swissknife', aliases[alias], specifier.slice(alias.length));
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) target = path.resolve(root, path.dirname(importer), specifier);
  else if (specifier.startsWith('/js/') || specifier.startsWith('/css/')) target = path.join(root, 'swissknife/web', specifier);
  else return []; // Bare third-party modules and node builtins are not first-party files.
  const name = path.relative(root, target).split(path.sep).join('/');
  demand(name && !name.startsWith('../') && !path.isAbsolute(name), 'INVALID_CONTRACT', 'first-party dependency escaped its physical workspace');
  const candidates = path.extname(target) ? [target, ...(/\.[cm]?js$/.test(target) ? [target.replace(/\.[cm]?js$/, '.ts'), target.replace(/\.[cm]?js$/, '.tsx')] : [])]
    : [target, ...['.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '.json'].map(ext => target + ext),
      ...['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'].map(ext => path.join(target, 'index' + ext))];
  const found = candidates.filter(candidate => {
    if (!fs.existsSync(candidate)) return false;
    const relative = path.relative(root, candidate).split(path.sep).join('/');
    independentPath(root, relative); return fs.lstatSync(candidate).isFile();
  }).map(candidate => path.relative(root, candidate).split(path.sep).join('/'));
  if (found.length) return found;
  demand(INDEPENDENT_OPTIONAL_INPUTS.includes(name) && optionalInputAbsent(root, name), 'INVALID_CONTRACT', 'missing first-party dependency: ' + name);
  return [name];
}

function independentPath(root, relative) {
  const base = path.resolve(root);
  demand(text(relative) && !path.isAbsolute(relative) && !relative.split('/').some(part => !part || part === '.' || part === '..'),
    'ARTIFACT_INVALID', 'V2 paths must be exact workspace-relative physical files');
  let target = base;
  demand(fs.realpathSync(base) === base, 'ARTIFACT_INVALID', 'V2 workspace must be physical');
  for (const part of relative.split('/')) {
    target = path.join(target, part);
    demand(!fs.lstatSync(target).isSymbolicLink(), 'ARTIFACT_INVALID', 'V2 source/artifact symlinks are forbidden');
  }
  return target;
}

function independentBytes(root, relative, limit) {
  const file = independentPath(root, relative);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    demand(before.isFile() && before.size > 0n && before.size <= BigInt(limit), 'ARTIFACT_INVALID', 'V2 file is not bounded nonempty regular bytes');
    const bytes = fs.readFileSync(fd), after = fs.fstatSync(fd, { bigint: true }), current = fs.lstatSync(file, { bigint: true });
    demand(bytes.length === Number(before.size) && ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(key => before[key] === after[key] && before[key] === current[key]),
      'ARTIFACT_INVALID', 'V2 file changed during its read');
    return bytes;
  } finally { fs.closeSync(fd); }
}

function independentWorkflowInputs(app, { projectRoot = PROJECT_ROOT,
  contractsPath = path.join(projectRoot, 'config/visual-functional-app-contracts.json'),
  scenarioPath = path.join(projectRoot, 'test/e2e/functional-workflows', `${app.app_id}.json`) } = {}) {
  const root = path.dirname(path.resolve(projectRoot));
  const relative = file => path.relative(root, file).split(path.sep).join('/');
  const contract = relative(path.resolve(contractsPath)), scenario = relative(path.resolve(scenarioPath));
  const names = [...INDEPENDENT_STATIC_INPUTS, contract, scenario,
    ...app.source_paths.map(name => 'swissknife/' + name)];
  const index = independentBytes(root, 'swissknife/web/index.html', 1048576).toString('utf8');
  let stylesheetCount = 0;
  for (const tag of index.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = {};
    for (const match of tag[0].matchAll(/\b(rel|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      const key = match[1].toLowerCase();
      demand(!Object.hasOwn(attributes, key), 'INVALID_CONTRACT', 'duplicate V2 stylesheet link attribute');
      attributes[key] = match[2] ?? match[3] ?? match[4];
    }
    if (!attributes.rel?.toLowerCase().split(/\s+/).includes('stylesheet')) continue;
    demand(/^\/css\/[a-zA-Z0-9_.-]+\.css$/.test(attributes.href || ''), 'INVALID_CONTRACT', 'V2 shared stylesheet must be an exact local CSS path');
    names.push('swissknife/web' + attributes.href); stylesheetCount++;
  }
  demand(stylesheetCount > 0, 'INVALID_CONTRACT', 'V2 shared stylesheet closure is absent');
  for (const name of names) demand(text(name) && !path.isAbsolute(name) && !name.split('/').some(part => !part || part === '.' || part === '..'),
    'INVALID_CONTRACT', 'V2 input paths must all belong to the supplied physical workspace');
  const inputs = new Set(names), pending = [...inputs], parsed = new Map();
  const viteBytes = independentBytes(root, 'swissknife/build-tools/configs/vite.web.config.ts', 16777216);
  let parsedBytes = 0;
  while (pending.length) {
    const name = pending.pop();
    demand(inputs.size <= INDEPENDENT_SOURCE_LIMITS.files, 'INVALID_CONTRACT', 'V2 dependency graph exceeds its file bound');
    if (!/\.(?:[cm]?js|jsx|ts|tsx)$/.test(name) || parsed.has(name)) continue;
    if (INDEPENDENT_OPTIONAL_INPUTS.includes(name) && optionalInputAbsent(root, name)) continue;
    const bytes = independentBytes(root, name, INDEPENDENT_SOURCE_LIMITS.bytes);
    parsedBytes += bytes.length;
    demand(parsedBytes <= INDEPENDENT_SOURCE_LIMITS.bytes, 'INVALID_CONTRACT', 'V2 dependency graph exceeds its byte bound');
    parsed.set(name, bytes);
    for (const dependency of firstPartySpecifiers(name, bytes)) {
      if (dependency.dynamic && ['swissknife/web/js/main-simple.js', 'swissknife/web/js/main.js'].includes(name)
        && /^\.\/apps\//.test(dependency.specifier)) continue; // Selected app roots are explicit; unrelated factory apps are excluded.
      for (const target of resolveFirstPartySpecifier(root, name, dependency.specifier, viteBytes)) {
        if (!inputs.has(target)) { inputs.add(target); pending.push(target); }
      }
    }
  }
  for (const [name, bytes] of parsed) demand(bytes.equals(independentBytes(root, name, INDEPENDENT_SOURCE_LIMITS.bytes)),
    'STALE_SOURCE', 'first-party module changed while its dependency graph was collected');
  demand(index === independentBytes(root, 'swissknife/web/index.html', 1048576).toString('utf8'), 'STALE_SOURCE', 'stylesheet index changed during source collection');
  return { root, contract, scenario, names: [...inputs].sort() };
}

/** Metadata may collect paths before the future non-JS consumer file exists. */
export function independentWorkflowInputPaths(app, options = {}) {
  return independentWorkflowInputs(app, options).names;
}

export function independentWorkflowSourceSnapshot(app, options = {}) {
  const { root, contract, scenario, names } = independentWorkflowInputs(app, options);
  let totalBytes = 0;
  const sources = Object.fromEntries(names.map(name => {
    if (INDEPENDENT_OPTIONAL_INPUTS.includes(name) && optionalInputAbsent(root, name)) return [name, null];
    const bytes = independentBytes(root, name, INDEPENDENT_SOURCE_LIMITS.bytes);
    totalBytes += bytes.length;
    demand(totalBytes <= INDEPENDENT_SOURCE_LIMITS.bytes, 'INVALID_CONTRACT', 'V2 complete static source bytes exceed their bound');
    return [name, digest(bytes)];
  }));
  return { contract_sha256: sources[contract], scenario_sha256: sources[scenario], source_sha256: sources };
}

export function assertIndependentWorkflowSources(snapshot, app, options = {}) {
  demand(canonicalJSON(snapshot) === canonicalJSON(independentWorkflowSourceSnapshot(app, options)), 'STALE_SOURCE',
    'V2 complete app/scenario/contract/controller/shared source closure changed');
}

function canonicalViewport(viewport) {
  const found = VIEWPORTS.find(item => canonicalJSON(item) === canonicalJSON(viewport));
  demand(found, 'INVALID_OBSERVATION', 'V2 needs an exact canonical viewport descriptor');
  return found;
}

/** Read geometry from the mounted app; a DOM unit fixture is never a browser
 * image or application acceptance. Intentional internal scrolling is allowed. */
export function collectWorkflowLayout(element) {
  const view = element.ownerDocument.defaultView, windowElement = element.closest('.window');
  const rect = element.getBoundingClientRect(), bounds = windowElement?.getBoundingClientRect();
  const violations = [];
  if (!element.isConnected || !bounds || rect.width < 1 || rect.height < 1) violations.push('primary_content_not_visible');
  if (bounds && (bounds.left < -1 || bounds.right > view.innerWidth + 1)) violations.push('app_window_outside_horizontal_viewport');
  if (bounds && (bounds.top < -1 || bounds.bottom > view.innerHeight + 1)) violations.push('app_window_outside_vertical_viewport');
  if (bounds && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.top >= bounds.bottom)) violations.push('primary_content_outside_app_window');
  const privateSelector = 'input[type="password"], [data-secret], [data-credential-value]';
  const walker = element.ownerDocument.createTreeWalker(element, view.NodeFilter.SHOW_TEXT);
  let textLength = 0, node;
  while ((node = walker.nextNode())) if (!node.parentElement?.closest(privateSelector)) textLength += node.textContent.trim().length;
  const controls = element.querySelectorAll('button,input,select,textarea,[contenteditable="true"],a[href]').length;
  const media = element.querySelectorAll('img,video,audio,canvas,svg').length;
  if (textLength === 0 && controls === 0 && media === 0) violations.push('primary_content_empty');
  return { viewport: { width: view.innerWidth, height: view.innerHeight },
    primary: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    window: bounds ? { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom } : null,
    text_length: textLength, control_count: controls, media_count: media, violations };
}

export async function captureWorkflowViewport(session, viewport) {
  demand(realSessions.has(session) && session.actual_desktop === true && VIEWPORTS.includes(viewport), 'SYNTHETIC_PROOF', 'workflow images require an owned actual desktop session and canonical viewport');
  if (session.viewport.name !== viewport.name) {
    await session.page.setViewportSize({ width: viewport.width, height: viewport.height });
    session.viewport = viewport;
    await session.reopen(); // Native window creation clamps to the new viewport.
  }
  await session.assertActive();
  await session.page.evaluate(() => document.fonts.ready);
  const layout = await session.primary.evaluate(collectWorkflowLayout);
  demand(layout.viewport.width === viewport.width && layout.viewport.height === viewport.height, 'INVALID_OBSERVATION', 'observed browser viewport differs from requested viewport');
  evaluateObservation({ operator: 'equals', actual: layout.violations, expected: [] });
  const image = path.join(session.outputDir, `${viewport.name}.png`);
  demand(!fs.existsSync(image), 'ARTIFACT_COLLISION', 'viewport screenshot already exists');
  await session.page.screenshot({ path: image, fullPage: false, animations: 'disabled',
    mask: [session.page.locator('input[type="password"], [data-secret], [data-credential-value]')], timeout: 15000 });
  const png = boundedFile(image, 16777216);
  demand(png.length > 128 && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && png.readUInt32BE(16) === viewport.width && png.readUInt32BE(20) === viewport.height, 'ARTIFACT_INVALID', 'actual screenshot dimensions/PNG bytes are invalid');
  const metadata = path.join(session.outputDir, `${viewport.name}-layout.json`);
  fs.writeFileSync(metadata, JSON.stringify(layout, null, 2) + '\n', { flag: 'wx' });
  return { name: viewport.name, layout, files: [image, metadata] };
}

/** Validate and assemble unit-testable evidence without granting acceptance.
 * Only the private real-browser wrapper below can promote this report. */
function semanticWorkflowEvidence({ app, scenario, sources, session, viewports, artifacts }, requiredViews, requiredFiles, schema) {
  validateScenario(scenario, app);
  demand(session.unexpected_backend_calls === 0 && session.backend_policy_errors.length === 0, 'POLICY_BOUNDARY', 'unexpected backend dispatch was observed or blocked');
  const required = requiredSemantics(app);
  const assertions = session.semantic_assertions;
  demand(assertions.length === Object.keys(required).length && new Set(assertions.map(item => item.requirement_id)).size === assertions.length,
    'MISSING_POSTCONDITION', 'workflow needs exactly one actual assertion for each app requirement');
  for (const item of assertions) {
    demand(item.requirement_text === required[item.requirement_id], 'MISSING_POSTCONDITION', 'semantic requirement text is detached from the app contract');
    evaluateObservation(item.observed);
  }
  const primaryIds = Object.keys(required).filter(id => id.startsWith('result_'));
  demand(assertions.some(item => item.phase === 'primary_result' && item.probe.kind !== 'backend_result'), 'MISSING_POSTCONDITION', 'a native app result must be observed in addition to owner proof');
  const semanticKeyboard = session.keyboard_focus_observations.filter(item => item.focused === true && item.inside_app === true && item.semantic_requirement_id);
  demand(semanticKeyboard.length > 0, 'MISSING_POSTCONDITION', 'keyboard actions need their own subsequent observed semantic result');
  demand(session.checkpoints.some(item => item.checkpoint_id === 'error_observed') && assertions.some(item => item.requirement_id === 'failure_recovery'),
    'MISSING_POSTCONDITION', 'error recovery was not observed');
  demand(viewports.length === requiredViews.length && requiredViews.every(viewport => viewports.filter(item => item.name === viewport.name).length === 1),
    'MISSING_POSTCONDITION', 'all required actual canonical viewports are required');
  if (app.disposition === 'tool_backed') demand(session.backend_observations.length > 0 && scenario.backend_bindings.every(intent =>
    session.backend_observations.some(item => item.binding_id === intent.binding_id && item.actual_desktop === session.actual_desktop)), 'BACKEND_EVIDENCE_MISSING', 'selected owner bindings lack actual semantic proof');
  else demand(session.backend_records.length === 0 && session.backend_observations.length === 0, 'POLICY_BOUNDARY', 'local/external/policy app dispatched a Python-owner call');
  const check = (kind, actual, expected) => ({ kind, passed: true, observation: evaluateObservation({ operator: 'equals', actual, expected }) });
  const checks = [check('primary_result', assertions.filter(item => item.phase === 'primary_result').map(item => item.requirement_id).sort(), [...primaryIds].sort()),
    check('keyboard', semanticKeyboard.every(item => Boolean(item.semantic_requirement_id)), true),
    ...viewports.map(item => check(`${item.name}_layout`, item.layout.violations, [])), check('error_recovery', assertions.filter(item => item.requirement_id === 'failure_recovery').map(item => item.requirement_id), ['failure_recovery'])];
  for (const name of requiredFiles) demand(artifacts.some(item => item.path.endsWith('/' + name) && item.bytes > 0), 'ARTIFACT_MISSING', 'workflow lacks actual viewport/trace artifacts');
  return { schema, app_id: app.app_id, passed: false, source_template: false, actual_desktop: false, ...sources,
    artifacts, checks, semantic_assertions: assertions.map(item => ({ ...item, passed: true })),
    unexpected_backend_calls: 0, backend_observations: session.backend_observations,
    viewports: viewports.map(({ name, layout }) => ({ name, ...layout })), keyboard_observations: semanticKeyboard,
    temporal_observations: session.temporal_observations || [], work_complete: false, completion_authority: false };
}

export function buildWorkflowEvidence(settings) {
  return semanticWorkflowEvidence(settings, VIEWPORTS, ['desktop.png', 'mobile.png', 'trace.zip'], WORKFLOW_SCHEMA);
}

export function assembleWorkflowReport(settings) {
  demand(settings.actualSession === true && realSessions.has(settings.session) && settings.session.actual_desktop === true,
    'SYNTHETIC_PROOF', 'DOM fixtures and authored records cannot grant workflow acceptance');
  return { ...buildWorkflowEvidence(settings), passed: true, actual_desktop: true };
}

export function buildViewportWorkflowEvidence(settings) {
  const { session, viewports, artifacts } = settings;
  const viewport = canonicalViewport(session.initial_viewport);
  demand(canonicalJSON(session.viewport) === canonicalJSON(viewport), 'INVALID_OBSERVATION', 'a V2 session cannot change canonical viewport');
  demand(typeof session.session_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(session.session_id),
    'INVALID_OBSERVATION', 'V2 session identity must be a fresh UUID');
  const result = semanticWorkflowEvidence(settings, [viewport], [viewport.name + '.png', 'trace.zip'], VIEWPORT_WORKFLOW_SCHEMA);
  const screenshots = artifacts.filter(item => item.path.endsWith('/' + viewport.name + '.png'));
  demand(screenshots.length === 1 && viewports[0].layout.viewport.width === viewport.width && viewports[0].layout.viewport.height === viewport.height,
    'INVALID_OBSERVATION', 'V2 result screenshot and observed geometry must belong to its canonical session');
  return { ...result, viewport: { ...viewport }, initial_viewport: { ...viewport }, session_id: session.session_id,
    result_screenshot: { ...screenshots[0] }, error_observations: session.checkpoints.map(item => ({ ...item })),
    ...(session.phase_evidence ? { phase_evidence: validatePhaseEvidence({ ...result, error_observations: session.checkpoints,
      phase_evidence: session.phase_evidence }, settings.scenario) } : {}),
    ...(session.image_observations?.length ? { image_observations: session.image_observations } : {}),
    backend_call_count: session.backend_records.length,
    ...(session.phase_evidence ? { backend_request_phases: { schema: BACKEND_REQUEST_PHASE_SCHEMA,
      requests: session.backend_records.map(row => row.request_phase) } } : {}),
    backend_call_phases: Object.fromEntries(BACKEND_OBSERVATION_PHASES.map(phase => [phase,
      session.backend_records.filter(row => (BACKEND_OBSERVATION_PHASES.includes(row?.dispatch_observation_phase) ? row.dispatch_observation_phase : 'unknown') === phase).length])) };
}

function assembleViewportWorkflowReport(settings) {
  demand(realSessions.has(settings.session) && settings.session.actual_desktop === true, 'SYNTHETIC_PROOF', 'V2 viewport proof requires its own actual session');
  return { ...buildViewportWorkflowEvidence(settings), passed: true, actual_desktop: true };
}

function exactArtifact(root, reference, prefix, limit = 67108864) {
  demand(plain(reference) && Object.keys(reference).length === 3 && ['path', 'sha256', 'bytes'].every(key => Object.hasOwn(reference, key))
    && typeof reference.sha256 === 'string' && /^[0-9a-f]{64}$/.test(reference.sha256)
    && Number.isSafeInteger(reference.bytes) && reference.bytes > 0 && reference.bytes <= limit
    && reference.path.startsWith(prefix + '/'), 'ARTIFACT_INVALID', 'V2 artifact reference escaped its owned child');
  const data = independentBytes(root, reference.path, limit);
  demand(data.length === reference.bytes && digest(data) === reference.sha256, 'ARTIFACT_INVALID', 'V2 artifact hash/length changed');
  return data;
}

export function validateViewportWorkflowReport(report, { app, scenario, sources, viewport, reference, outputDir, workspaceRoot = WORKSPACE_ROOT }) {
  canonicalViewport(viewport);
  const prefix = path.relative(workspaceRoot, path.join(outputDir, viewport.name)).split(path.sep).join('/');
  demand(plain(report) && report.schema === VIEWPORT_WORKFLOW_SCHEMA && report.app_id === app.app_id && report.passed === true
    && report.actual_desktop === true && report.source_template === false && report.work_complete === false && report.completion_authority === false
    && canonicalJSON(report.viewport) === canonicalJSON(viewport) && canonicalJSON(report.initial_viewport) === canonicalJSON(viewport)
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(report.session_id || ''),
    'SYNTHETIC_PROOF', 'V2 child needs an actual independent canonical viewport workflow');
  demand(canonicalJSON({ contract_sha256: report.contract_sha256, scenario_sha256: report.scenario_sha256, source_sha256: report.source_sha256 }) === canonicalJSON(sources),
    'STALE_SOURCE', 'V2 child complete source closure differs');
  demand(reference.path === prefix + '/workflow.json', 'ARTIFACT_INVALID', 'V2 child report must use its exact owned path');
  const bytes = exactArtifact(workspaceRoot, reference, prefix, 8388608);
  demand(bytes.equals(Buffer.from(JSON.stringify(report, null, 2) + '\n')), 'ARTIFACT_INVALID', 'V2 child report bytes differ from its exact structured body');
  demand(Array.isArray(report.artifacts) && report.artifacts.length > 0 && report.artifacts.length <= 256
    && new Set(report.artifacts.map(item => item.path)).size === report.artifacts.length, 'ARTIFACT_INVALID', 'V2 child artifact set is malformed or duplicated');
  for (const item of report.artifacts) {
    demand(item.path !== reference.path, 'ARTIFACT_INVALID', 'V2 child cannot include its own report recursively');
    exactArtifact(workspaceRoot, item, prefix);
  }
  const screenshot = report.result_screenshot;
  demand(screenshot?.path === prefix + '/' + viewport.name + '.png'
    && report.artifacts.some(item => canonicalJSON(item) === canonicalJSON(screenshot)), 'ARTIFACT_MISSING', 'V2 child lacks its exact result screenshot artifact');
  const png = exactArtifact(workspaceRoot, screenshot, prefix, 16777216);
  demand(png.length > 128 && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && png.subarray(12, 16).equals(Buffer.from('IHDR'))
    && png.readUInt32BE(16) === viewport.width && png.readUInt32BE(20) === viewport.height, 'ARTIFACT_INVALID', 'V2 result PNG differs from canonical viewport');
  demand(Array.isArray(report.viewports) && report.viewports.length === 1 && report.viewports[0].name === viewport.name,
    'INVALID_OBSERVATION', 'V2 child must retain its own observed layout');
  const { name, ...layout } = report.viewports[0];
  demand(layout.viewport?.width === viewport.width && layout.viewport?.height === viewport.height && Array.isArray(layout.violations),
    'INVALID_OBSERVATION', 'V2 layout geometry differs from child viewport');
  const bounds = layout.window, primary = layout.primary;
  demand(bounds && primary && ['left', 'top', 'right', 'bottom'].every(key => Number.isFinite(bounds[key]))
    && ['left', 'top', 'width', 'height'].every(key => Number.isFinite(primary[key]))
    && bounds.left >= -1 && bounds.top >= -1 && bounds.right <= viewport.width + 1 && bounds.bottom <= viewport.height + 1
    && bounds.right > bounds.left && bounds.bottom > bounds.top && primary.width >= 1 && primary.height >= 1
    && primary.left >= bounds.left - 1 && primary.top >= bounds.top - 1 && primary.left + primary.width <= bounds.right + 1
    && primary.top < bounds.bottom, 'INVALID_OBSERVATION', 'V2 geometry must match the original layout policy, including internal vertical scrolling');
  const layoutRef = report.artifacts.find(item => item.path === prefix + '/' + viewport.name + '-layout.json');
  demand(layoutRef && canonicalJSON(JSON.parse(exactArtifact(workspaceRoot, layoutRef, prefix, 1048576))) === canonicalJSON(layout),
    'ARTIFACT_INVALID', 'V2 observed layout is detached from its artifact');
  demand(Number.isSafeInteger(report.backend_call_count) && report.backend_call_count >= 0 && report.backend_call_count <= 64
    && report.unexpected_backend_calls === 0 && Array.isArray(report.error_observations) && report.error_observations.length === 1,
    'POLICY_BOUNDARY', 'V2 child lacks bounded actual call/failure observations');
  demand(plain(report.backend_call_phases) && canonicalJSON(Object.keys(report.backend_call_phases).sort()) === canonicalJSON([...BACKEND_OBSERVATION_PHASES].sort())
    && Object.values(report.backend_call_phases).every(value => Number.isSafeInteger(value) && value >= 0)
    && Object.values(report.backend_call_phases).reduce((sum, value) => sum + value, 0) === report.backend_call_count,
    'INVALID_OBSERVATION', 'V2 observed dispatch-phase counts must sum to its actual browser call count');
  const phaseCalls = new Map();
  if (app.disposition === 'tool_backed') {
    demand(report.backend_call_count > 0 && Array.isArray(report.backend_observations) && report.backend_observations.length > 0,
      'BACKEND_EVIDENCE_MISSING', 'V2 owner proof requires actual browser calls in this child');
    const { cidForBytes } = require('./mcpplusplus-profile-a.cjs');
    for (const row of report.backend_observations) for (const [kind, identity] of [['receipt', row.receipt_id], ['event', row.event_dag_cid]]) {
      const artifact = report.artifacts.find(item => item.path === row[kind + '_artifact']);
      demand(artifact, 'ARTIFACT_MISSING', 'V2 owner proof is detached from its retained raw artifact');
      const raw = exactArtifact(workspaceRoot, artifact, prefix, 1048576), payload = JSON.parse(raw);
      demand(cidForBytes(raw) === identity && payload.kind === kind && payload.call?.app_id === app.app_id
        && payload.call.binding_id === row.binding_id && payload.call.correlation_id === row.correlation_id,
        'BACKEND_EVIDENCE_MISSING', 'V2 raw owner receipt/event belongs to another child call');
      phaseCalls.set(row.correlation_id, payload.call);
    }
  }
  validateBackendRequestPhases(report, scenario, phaseCalls);
  validateDecodedImageObservations(report, scenario,
    ref => exactArtifact(workspaceRoot, ref, prefix, 1048576));
  const checkpoint = report.error_observations[0];
  demand(checkpoint.checkpoint_id === 'error_observed' && checkpoint.phase === 'failure_recovery', 'MISSING_POSTCONDITION', 'V2 child lacks its actual failure checkpoint');
  demand(Array.isArray(report.semantic_assertions) && report.semantic_assertions.every(row => row.passed === true),
    'MISSING_POSTCONDITION', 'V2 original semantic observations must all pass');
  for (const row of [...report.semantic_assertions, checkpoint]) {
    demand(Number.isSafeInteger(row.step_index) && row.step_index >= 0 && PHASES.includes(row.phase), 'INVALID_OBSERVATION', 'V2 semantic observation has no actual scenario step');
    const step = scenario.phases[row.phase][row.step_index];
    demand(step?.op === 'assert' && step.requirement_id === row.requirement_id && step.checkpoint_id === row.checkpoint_id
      && canonicalJSON(step.probe) === canonicalJSON(row.probe) && step.operator === row.observed?.operator
      && canonicalJSON(step.expected) === canonicalJSON(row.observed.expected), 'INVALID_OBSERVATION', 'V2 assertion was not the declared original scenario observation');
    evaluateObservation(row.observed);
  }
  demand(Array.isArray(report.keyboard_observations) && report.keyboard_observations.length > 0, 'MISSING_POSTCONDITION', 'V2 child lacks keyboard observations');
  for (const row of report.keyboard_observations) {
    const step = scenario.phases[row.phase]?.[row.step_index];
    const result = report.semantic_assertions.find(item => item.phase === row.phase && item.requirement_id === row.semantic_requirement_id && item.step_index > row.step_index);
    demand(row.focused === true && row.inside_app === true && Number.isSafeInteger(row.step_index) && step?.op === 'press' && step.key === row.key && result
      && !scenario.phases[row.phase].slice(row.step_index + 1, result.step_index).some(item => !['assert', 'capture', 'wait_ms', 'wait_for'].includes(item.op)),
      'INVALID_OBSERVATION', 'V2 keyboard proof is detached from its original semantic result');
  }
  const temporalRows = [...report.semantic_assertions, checkpoint].filter(row => row.probe.temporal_ms !== undefined)
    .sort((a, b) => PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase) || a.step_index - b.step_index);
  demand(Array.isArray(report.temporal_observations) && report.temporal_observations.length === temporalRows.length,
    'INVALID_OBSERVATION', 'V2 temporal samples must join the original observations');
  temporalRows.forEach((row, index) => {
    const sample = report.temporal_observations[index];
    demand(sample && Number.isFinite(sample.before) && Number.isFinite(sample.after) && sample.sample_ms === row.probe.temporal_ms
      && canonicalJSON(sample.after - sample.before) === canonicalJSON(row.observed.actual), 'INVALID_OBSERVATION', 'V2 temporal delta is detached from its actual sample');
  });
  validatePhaseEvidence(report, scenario);
  const rebuilt = buildViewportWorkflowEvidence({ app, scenario, sources,
    session: { viewport, initial_viewport: viewport, session_id: report.session_id, semantic_assertions: report.semantic_assertions,
      checkpoints: report.error_observations, keyboard_focus_observations: report.keyboard_observations,
      backend_records: Array.from({ length: report.backend_call_count }), backend_observations: report.backend_observations,
      unexpected_backend_calls: 0, backend_policy_errors: [], actual_desktop: report.actual_desktop }, viewports: [{ name, layout }], artifacts: report.artifacts });
  demand(canonicalJSON(rebuilt.checks) === canonicalJSON(report.checks), 'INVALID_OBSERVATION', 'V2 checks differ from actual typed observations');
  return report;
}

export function buildIndependentWorkflowEvidence({ app, scenario, sources, children, outputDir, workspaceRoot = WORKSPACE_ROOT }) {
  demand(Array.isArray(children) && children.length === VIEWPORTS.length, 'MISSING_POSTCONDITION', 'V2 requires both independent canonical sessions');
  const artifacts = [], identities = new Set(), backendIdentities = new Set();
  for (const [index, viewport] of VIEWPORTS.entries()) {
    const child = children[index];
    demand(child?.viewport && canonicalJSON(child.viewport) === canonicalJSON(viewport), 'INVALID_OBSERVATION', 'V2 children must be in exact desktop/mobile order');
    validateViewportWorkflowReport(child.report, { app, scenario, sources, viewport, reference: child.reference, outputDir, workspaceRoot });
    demand(!identities.has(child.report.session_id), 'SYNTHETIC_PROOF', 'V2 cannot reuse one session for desktop and mobile'); identities.add(child.report.session_id);
    const observedIds = new Set(child.report.backend_observations.flatMap(row => [row.correlation_id, row.receipt_id, row.event_dag_cid]));
    for (const identity of observedIds) {
      demand(text(identity) && !backendIdentities.has(identity), 'BACKEND_EVIDENCE_MISSING', 'V2 child sessions cannot reuse another viewport owner call/receipt');
      backendIdentities.add(identity);
    }
    artifacts.push(child.reference, ...child.report.artifacts);
  }
  demand(new Set(artifacts.map(item => item.path)).size === artifacts.length, 'ARTIFACT_INVALID', 'V2 child artifact namespaces overlap');
  return { schema: INDEPENDENT_WORKFLOW_SCHEMA, app_id: app.app_id, passed: false, source_template: false, actual_desktop: false,
    ...sources, coverage: 'independent_canonical_sessions', viewport_reports: children.map(child => ({ name: child.viewport.name,
      viewport: { width: child.viewport.width, height: child.viewport.height }, report: { ...child.reference } })),
    artifacts, unexpected_backend_calls: 0, work_complete: false, completion_authority: false };
}

export function assembleIndependentWorkflowReport(settings) {
  const result = buildIndependentWorkflowEvidence(settings);
  demand(settings.children.every(child => realViewportReports.get(child.report) === child.reference.sha256), 'SYNTHETIC_PROOF', 'V2 child reports must originate in independent actual browser sessions');
  return { ...result, passed: true, actual_desktop: true };
}

/** Injectable lifecycle orchestration yields no acceptance authority itself. */
export async function runIndependentViewportSessions({ app, scenario, assertSources, openSession, executePhase,
  captureSession, saveSession, onFailure }) {
  const children = [], sessions = new WeakSet();
  for (const viewport of VIEWPORTS) {
    let session, prepared, original, admitted = false;
    assertSources();
    try {
      session = await openSession(viewport);
      demand(session && !sessions.has(session), 'SYNTHETIC_PROOF', 'V2 needs a fresh session for each viewport');
      sessions.add(session); admitted = true;
      demand(canonicalJSON(session.initial_viewport) === canonicalJSON(viewport) && canonicalJSON(session.viewport) === canonicalJSON(viewport),
        'INVALID_OBSERVATION', 'V2 session did not start at its canonical viewport');
      session.phase_evidence_started = performance.now();
      session.phase_evidence = { schema: PHASE_EVIDENCE_SCHEMA, phases: [] };
      for (const phase of PHASES) {
        assertSources();
        await executePhase(session, phase, scenario.phases[phase]);
        demand(canonicalJSON(session.viewport) === canonicalJSON(viewport), 'INVALID_OBSERVATION', 'V2 semantic phases cannot change viewport');
      }
      assertSources(); prepared = await captureSession(session, viewport);
    } catch (error) {
      original = error;
      try { await onFailure?.(error, session, viewport); } catch { /* Original observed failure remains authoritative. */ }
      throw error;
    } finally {
      if (admitted) try { await session.close(); } catch (error) { if (!original) throw error; }
    }
    assertSources(); children.push(await saveSession(prepared, session, viewport));
  }
  assertSources(); return children;
}

/** Diagnostics never act as workflow proof. Preserve JSON types while bounding
 * depth, fields, strings and total bytes, and remove credential-bearing data. */
export function boundedFailureValue(value, maxBytes = 24000) {
  let remaining = maxBytes;
  const seen = new Set();
  const privateKey = /authorization|password|passwd|secret|credential|api[_-]?key|access[_-]?token|refresh[_-]?token|cookie|private[_-]?key/i;
  const visit = (item, depth = 0) => {
    if (remaining < 128) return '[diagnostic limit]';
    remaining -= 128;
    if (item === null || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item === 'string') {
      const safe = redactText(item, 4096).replace(/-----BEGIN [\s\S]*?-----END [^-]+-----/g, '[redacted private material]')
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted token]')
        .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@');
      remaining -= Buffer.byteLength(safe); return safe;
    }
    if (depth >= 16 || !item || typeof item !== 'object' || seen.has(item)) return '[unavailable or truncated]';
    seen.add(item);
    const result = Array.isArray(item) ? item.slice(0, 24).map(child => visit(child, depth + 1))
      : Object.fromEntries(Object.entries(item).slice(0, 48).map(([key, child]) => [key.slice(0, 160), privateKey.test(key) ? '[redacted]' : visit(child, depth + 1)]));
    seen.delete(item);
    return result;
  };
  const result = visit(value);
  return Buffer.byteLength(JSON.stringify(result)) <= maxBytes ? result : { truncated: true, reason: 'diagnostic_byte_limit' };
}

export async function writeWorkflowFailure({ app, sources, outputDir, error, session }) {
  const directory = path.resolve(outputDir);
  const relative = path.relative(WORKSPACE_ROOT, directory);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return null;
  let ancestor = WORKSPACE_ROOT;
  for (const component of relative.split(path.sep)) {
    ancestor = path.join(ancestor, component);
    if (fs.existsSync(ancestor) && (fs.lstatSync(ancestor).isSymbolicLink() || !fs.lstatSync(ancestor).isDirectory())) return null;
  }
  // A failed admission cannot append artifacts to a foreign/nonempty output.
  if (!session && fs.existsSync(directory) && fs.readdirSync(directory).length) return null;
  fs.mkdirSync(directory, { recursive: true });
  const artifacts = [];
  const save = (name, value) => {
    const file = path.join(directory, name);
    fs.writeFileSync(file, JSON.stringify(boundedFailureValue(value)) + '\n', { flag: 'wx', mode: 0o600 });
    artifacts.push(artifactRecord(file));
  };
  if (session?.backend_records?.length) save('failure-owner-responses.json', {
    diagnostic_only: true, redacted: true, actual_desktop: realSessions.has(session) && session.actual_desktop === true,
    records: session.backend_records.slice(-8).map(record => ({ binding_id: record.call?.binding_id,
      tool_id: record.call?.tool_id, correlation_id: record.call?.correlation_id,
      finished: record.finished, error: record.error || null, response: record.response || null })),
  });
  if (session?.primary && !session.closed) {
    let timer;
    try {
      const primaryContent = await Promise.race([
        (async () => await session.primary.count() === 1 ? session.primary.evaluate(collectPrimaryDom) : null)(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('failure DOM capture timed out')), 1500); }),
      ]);
      if (primaryContent) save('failure-dom.json', {
        diagnostic_only: true, redacted: true, actual_desktop: realSessions.has(session) && session.actual_desktop === true,
        primary_content: primaryContent,
      });
    } catch { /* A detached page must not hide the original workflow failure. */ }
    finally { clearTimeout(timer); }
  }
  const details = { ...(plain(error.details) ? error.details : {}),
    ...(session?.failure_context ? { context: session.failure_context } : {}),
    ...(session?.failure_context?.probe ? { probe: session.failure_context.probe } : {}),
    ...(session?.backend_policy_diagnostics?.length ? { backend_policy_diagnostics: session.backend_policy_diagnostics } : {}),
    ...(session?.backend_policy_errors?.length ? { backend_policy_errors: session.backend_policy_errors } : {}) };
  if (/password|secret|credential|api[_-]?key|access[_-]?token|refresh[_-]?token/i.test(session?.failure_context?.probe?.selector || '')) {
    if (Object.hasOwn(details, 'actual')) details.actual = '[redacted private probe]';
    if (Object.hasOwn(details, 'expected')) details.expected = '[redacted private probe]';
    if (Object.hasOwn(details, 'observed_parent')) details.observed_parent = '[redacted private probe]';
  }
  const report = { schema: 'swissknife.visual-functional-workflow-failure.v1', app_id: app.app_id,
    error: { code: error.code || 'WORKFLOW_ERROR', message: redactText(error.message || String(error)),
      details: boundedFailureValue(details, 16000) },
    phase: session?.failure_context?.phase || null, step: session?.failure_context?.step ?? null,
    source_sha256: sources?.source_sha256 || {}, scenario_sha256: sources?.scenario_sha256 || null,
    artifacts, actual_desktop: realSessions.has(session) && session?.actual_desktop === true,
    functional_acceptance: 'not_evaluated', work_complete: false, completion_authority: false };
  fs.writeFileSync(path.join(directory, 'failure.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return report;
}

export async function withWorkflowFailureDiagnostics({ app, sources, outputDir, openSession, runSession }) {
  let session, original;
  try { session = await openSession(); return await runSession(session); }
  catch (error) {
    original = error;
    try { await writeWorkflowFailure({ app, sources, outputDir, error, session }); } catch { /* Preserve the original error even if capture cannot finish. */ }
    throw error;
  } finally {
    try { await session?.close(); } catch (cleanup) { if (!original) throw cleanup; }
  }
}

export async function runIndependentWorkflow(settings) {
  demand(!settings.desktopUrl, 'INVALID_ARGUMENT', 'V2 source-bound workflows must own their actual checkout desktop server');
  const canonical = loadCanonicalContracts();
  const contractsPath = path.resolve(settings.contractsPath || CONTRACT_PATH);
  demand(contractsPath.startsWith(PROJECT_ROOT + path.sep), 'INVALID_CONTRACT', 'V2 contract must belong to the actual checkout');
  const config = validateContracts(JSON.parse(fs.readFileSync(contractsPath, 'utf8')), canonical.manifest, canonical.backend);
  const app = config.apps.find(item => item.app_id === settings.appId);
  demand(app, 'INVALID_CONTRACT', 'unknown canonical app ID');
  const scenario = loadScenario(app);
  const sourceOptions = { contractsPath };
  const sources = independentWorkflowSourceSnapshot(app, sourceOptions);
  const outputDir = path.resolve(settings.outputDir || '');
  const relative = path.relative(WORKSPACE_ROOT, outputDir);
  demand(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative),
    'ARTIFACT_INVALID', 'V2 output must belong to the actual workspace');
  let ancestor = WORKSPACE_ROOT;
  for (const part of relative.split(path.sep)) {
    ancestor = path.join(ancestor, part);
    if (fs.existsSync(ancestor)) demand(fs.lstatSync(ancestor).isDirectory() && !fs.lstatSync(ancestor).isSymbolicLink(), 'ARTIFACT_INVALID', 'V2 output namespace must be physical');
  }
  demand(!fs.existsSync(outputDir) || fs.readdirSync(outputDir).length === 0, 'ARTIFACT_COLLISION', 'V2 output must be a new empty attempt');
  const assertSources = () => assertIndependentWorkflowSources(sources, app, sourceOptions);
  const children = await runIndependentViewportSessions({ app, scenario, assertSources,
    openSession: viewport => openRealDesktopSession({ ...settings, app, scenario, viewport,
      outputDir: path.join(outputDir, viewport.name), backendProof: true, trace: true }),
    executePhase: executeScenarioPhase,
    captureSession: async (session, viewport) => {
      for (const intent of scenario.backend_bindings) {
        assertSources();
        if (session.backend_observations.some(item => item.binding_id === intent.binding_id)) continue;
        demand(intent.result_assertion, 'BACKEND_EVIDENCE_MISSING', 'each owner binding needs its original semantic assertion');
        session.failure_context = { phase: 'backend_proof', step: null,
          probe: { kind: 'backend_result', binding_id: intent.binding_id, pointer: intent.result_assertion.pointer } };
        await collectBackendProof({ session, probe: session.failure_context.probe,
          operator: intent.result_assertion.operator, expected: intent.result_assertion.expected });
      }
      await collectPhaseBackendProofs({ session });
      // This capture never changes viewport or recreates the current result.
      const captured = await captureWorkflowViewport(session, viewport);
      await session.stopTrace(); assertSources();
      demand(session.backend_records.every(item => item.finished && !item.error), 'BACKEND_EVIDENCE_MISSING', 'an original owner request did not finish');
      const metadata = path.join(session.outputDir, 'observations.json');
      fs.writeFileSync(metadata, JSON.stringify({ console: session.console_events, network: session.network_events,
        backend_calls: session.backend_records.map(item => ({ binding_id: item.call.binding_id,
          correlation_id: item.call.correlation_id, outcome: item.response?.outcome || item.error || 'pending', finished: item.finished })) }, null, 2) + '\n', { flag: 'wx' });
      const files = [...captured.files, path.join(session.outputDir, 'trace.zip'), metadata,
        ...session.backend_artifacts.keys(), ...session.captures.map(item => path.join(session.outputDir, item))];
      return assembleViewportWorkflowReport({ app, scenario, sources, session, viewports: [captured],
        artifacts: [...new Set(files)].map(file => artifactRecord(file)) });
    },
    saveSession: async (report, session, viewport) => {
      assertSources();
      demand(session.closed === true && session.unexpected_backend_calls === 0 && session.backend_policy_errors.length === 0
        && session.backend_records.length === report.backend_call_count && session.backend_records.every(item => item.finished && !item.error),
        'BACKEND_EVIDENCE_MISSING', 'V2 owner observations changed or remained unfinished during owned cleanup');
      const target = path.join(session.outputDir, 'workflow.json');
      const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n');
      fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
      const reference = artifactRecord(target);
      demand(reference.sha256 === digest(bytes), 'ARTIFACT_INVALID', 'V2 child changed during persistence');
      realViewportReports.set(report, reference.sha256);
      return { viewport, report, reference };
    },
    onFailure: (error, session, viewport) => writeWorkflowFailure({ app, sources,
      outputDir: path.join(outputDir, viewport.name), error, session }),
  });
  assertSources();
  const result = assembleIndependentWorkflowReport({ app, scenario, sources, children, outputDir });
  assertSources();
  fs.writeFileSync(path.join(outputDir, 'workflow.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return result;
}

export async function runWorkflow(settings) {
  if (settings.independentViewports === true) return runIndependentWorkflow(settings);
  const canonical = loadCanonicalContracts();
  const contractsPath = path.resolve(settings.contractsPath || CONTRACT_PATH);
  demand(contractsPath.startsWith(PROJECT_ROOT + path.sep), 'INVALID_CONTRACT', 'contracts must belong to the actual SwissKnife checkout');
  const config = validateContracts(JSON.parse(fs.readFileSync(contractsPath, 'utf8')), canonical.manifest, canonical.backend);
  const app = config.apps.find(item => item.app_id === settings.appId);
  demand(app, 'INVALID_CONTRACT', 'unknown canonical app ID');
  const scenario = loadScenario(app);
  const sources = workflowSourceSnapshot(app, { contractsPath });
  // No directory/report is created before the implemented lifecycle acquires
  // its own resources. Foundation-only code cannot leave a successful report.
  return withWorkflowFailureDiagnostics({ app, sources, outputDir: settings.outputDir,
    openSession: () => openRealDesktopSession({ ...settings, app, scenario, backendProof: true, trace: true }),
    runSession: async session => {
    for (const phase of PHASES) await executeScenarioPhase(session, phase, scenario.phases[phase]);
    for (const intent of scenario.backend_bindings) {
      if (session.backend_observations.some(item => item.binding_id === intent.binding_id)) continue;
      demand(intent.result_assertion, 'BACKEND_EVIDENCE_MISSING', 'each owner binding needs a declared raw-result semantic assertion');
      session.failure_context = { phase: 'backend_proof', step: null,
        probe: { kind: 'backend_result', binding_id: intent.binding_id, pointer: intent.result_assertion.pointer } };
      await collectBackendProof({ session, probe: { kind: 'backend_result', binding_id: intent.binding_id, pointer: intent.result_assertion.pointer },
        operator: intent.result_assertion.operator, expected: intent.result_assertion.expected });
    }
    const viewports = [];
    for (const viewport of VIEWPORTS) viewports.push(await captureWorkflowViewport(session, viewport));
    await session.stopTrace();
    assertWorkflowSources(sources, app, { contractsPath });
    const metadata = path.join(session.outputDir, 'observations.json');
    fs.writeFileSync(metadata, JSON.stringify({ console: session.console_events, network: session.network_events,
      backend_calls: session.backend_records.map(item => ({ binding_id: item.call.binding_id, correlation_id: item.call.correlation_id,
        outcome: item.response?.outcome || item.error || 'pending', finished: item.finished })) }, null, 2) + '\n', { flag: 'wx' });
    demand(session.backend_records.every(item => item.finished && !item.error), 'BACKEND_EVIDENCE_MISSING', 'a browser owner request did not complete within the controlled budget');
    const files = [...viewports.flatMap(item => item.files), path.join(session.outputDir, 'trace.zip'), metadata,
      ...session.backend_artifacts.keys(), ...session.captures.map(item => path.join(session.outputDir, item))];
    const report = assembleWorkflowReport({ app, scenario, sources, session, viewports, artifacts: [...new Set(files)].map(file => artifactRecord(file)), actualSession: true });
    // Cleanup is part of success. No workflow.json can survive failed cleanup.
    await session.close();
    assertWorkflowSources(sources, app, { contractsPath });
    fs.writeFileSync(path.join(session.outputDir, 'workflow.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    return report;
  } });
}

function checkScenario(app) {
  const result = { op: 'assert', requirement_id: 'result_1', probe: { kind: 'text', selector: '#result' }, operator: 'equals', expected: '50' };
  return { schema: SCENARIO_SCHEMA, app_id: app.app_id, fixture_scope: 'svf-foundation-check', backend_bindings: [], phases: {
    primary_result: [{ op: 'click', selector: '#equals' }, result],
    persist_reopen: [{ op: 'reopen_app' }, { ...result, requirement_id: 'persist_reopen' }],
    failure_recovery: [{ ...result, requirement_id: undefined, checkpoint_id: 'error_observed', expected: 'Invalid input' },
      { op: 'click', selector: '#clear' }, { ...result, requirement_id: 'failure_recovery' }],
  } };
}

export async function foundationCheck(stage, settings = {}) {
  demand(FOUNDATION_STAGES.includes(stage), 'INVALID_ARGUMENT', 'unknown foundation stage');
  if (stage === 'stage2') return checkLifecycleFoundation();
  if (stage === 'stage3') return checkBackendProofFoundation();
  if (stage === 'pilot') return runCalculatorPilot({
    outputDir: settings.outputDir || path.resolve(PROJECT_ROOT, '../data/agent_supervisor/swissknife_visual_functional/tasks/SVF-034/pilot'),
    desktopUrl: settings.desktopUrl,
  });
  const canonical = loadCanonicalContracts();
  const config = validateContracts(JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8')), canonical.manifest, canonical.backend);
  const app = config.apps.find(item => item.app_id === 'calculator');
  const scenario = checkScenario(app);
  delete scenario.phases.failure_recovery[0].requirement_id;
  validateScenario(scenario, app);
  const checks = ['canonical-45-app-contracts', 'complete-semantic-phase-admission'];
  evaluateObservation({ operator: 'equals', actual: { answer: 50, saved: true }, expected: { saved: true, answer: 50 } });
  checks.push('typed-observation-evaluation');
  for (const [name, action] of [
    ['reject-type-coercion', () => evaluateObservation({ operator: 'equals', actual: '50', expected: 50 })],
    ['detect-blank-media', () => assertUsableMedia({ decoded: false, visible_area: 100 })],
    ['detect-decoded-but-clipped-media', () => assertUsableMedia({ decoded: true, visible_area: 0 })],
    ['reject-baseline-as-workflow', () => rejectSyntheticWorkflow({ schema: WORKFLOW_SCHEMA, baseline_only: true, actual_desktop: true, source_template: false })],
    ['reject-generic-click-only-scenario', () => validateScenario({ ...scenario, phases: { ...scenario.phases, primary_result: [{ op: 'click', selector: '#equals' }] } }, app)],
  ]) {
    let rejected = false;
    try { action(); } catch (error) { if (error instanceof WorkflowError) rejected = true; else throw error; }
    demand(rejected, 'FOUNDATION_CHECK_FAILED', `${name} did not reject false evidence`);
    checks.push(name);
  }
  return { schema: 'swissknife.visual-functional-foundation-check.v1', stage, passed: true, checks,
    actual_desktop: false, functional_acceptance: 'not_evaluated', work_complete: false, completion_authority: false };
}

export function parseArguments(argv) {
  const foundation = argv[0] === '--foundation-check';
  const settings = foundation ? { foundationStage: argv[1] } : {};
  if (foundation) demand(FOUNDATION_STAGES.includes(settings.foundationStage), 'INVALID_ARGUMENT', 'unknown foundation stage');
  for (let index = foundation ? 2 : 0; index < argv.length; index += 1) {
    if (!foundation && argv[index] === '--independent-viewports') {
      demand(settings.independentViewports === undefined, 'INVALID_ARGUMENT', usage);
      settings.independentViewports = true;
      continue;
    }
    const key = (foundation ? { '--output-dir': 'outputDir', '--desktop-url': 'desktopUrl' }
      : { '--app': 'appId', '--contracts': 'contractsPath', '--output-dir': 'outputDir', '--desktop-url': 'desktopUrl' })[argv[index]];
    demand(key && !Object.hasOwn(settings, key) && text(argv[index + 1]) && !argv[index + 1].startsWith('--'), 'INVALID_ARGUMENT', usage);
    settings[key] = argv[++index];
  }
  if (foundation) demand(settings.foundationStage === 'pilot' || (!settings.outputDir && !settings.desktopUrl), 'INVALID_ARGUMENT', 'only the pilot foundation check accepts desktop/output options');
  else demand(/^[a-z][a-z0-9-]*$/.test(settings.appId || '') && text(settings.contractsPath) && text(settings.outputDir), 'INVALID_ARGUMENT', usage);
  if (settings.desktopUrl) {
    const url = new URL(settings.desktopUrl);
    demand(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash, 'INVALID_ARGUMENT', 'desktop URL must omit credentials/query/fragment');
  }
  if (settings.outputDir) settings.outputDir = path.resolve(settings.outputDir);
  return settings;
}
export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) { console.log(usage); return 0; }
  const settings = parseArguments(argv);
  const result = settings.foundationStage ? await foundationCheck(settings.foundationStage, settings) : await runWorkflow(settings);
  console.log(JSON.stringify(result));
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === filename) {
  try { process.exitCode = await main(); }
  catch (error) { console.error(JSON.stringify({ error: error.code || 'WORKFLOW_ERROR', message: error.message, functional_acceptance: 'not_evaluated' })); process.exitCode = 1; }
}
