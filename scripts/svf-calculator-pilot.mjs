/** Actual desktop driver integration. This never grants Calculator acceptance. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PROJECT_ROOT, VIEWPORTS } from './capture-visual-functional-baseline.mjs';

const SCENARIO_SCHEMA = 'swissknife.visual-functional-scenario.v1';

const WORKSPACE = path.resolve(PROJECT_ROOT, '..');
const CONTRACTS = path.join(PROJECT_ROOT, 'config/visual-functional-app-contracts.json');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const demand = (condition, message) => { if (!condition) throw new Error(message); };
const click = selector => ({ op: 'click', selector });
const button = value => `[data-value="${value}"]`;
const action = value => `[data-action="${value}"]`;

export function pilotAdmissionScenario() {
  const assertion = (requirement_id, selector, expected) => ({ op: 'assert', requirement_id,
    probe: { kind: 'text', selector }, operator: 'equals', expected });
  return { schema: SCENARIO_SCHEMA, app_id: 'calculator', fixture_scope: 'svf-calculator-foundation-pilot', backend_bindings: [],
    description: 'Foundation subset only. Reopen/history requirements are admitted but not certified by the pilot report.',
    phases: {
      primary_result: [click(action('clear')), click(button('1')), click(button('2')), click(action('decimal')),
        click(button('5')), click(action('multiply')), click(button('4')), click(action('equals')),
        assertion('result_1', '#display-primary', '50')],
      persist_reopen: [{ op: 'reopen_app' }, click('#history-btn'),
        { op: 'assert', requirement_id: 'persist_reopen', probe: { kind: 'text', selector: '#history-list' }, operator: 'contains', expected: '12.5' }],
      failure_recovery: [click(action('clear')), click(button('1')), click(action('divide')), click(button('0')), click(action('equals')),
        { op: 'assert', checkpoint_id: 'error_observed', probe: { kind: 'text', selector: '#display-error' }, operator: 'contains', expected: 'zero' },
        click(action('clear')), click(button('5')), click(action('multiply')), click(button('1')), click(button('0')), click(action('equals')),
        assertion('failure_recovery', '#display-primary', '50')],
    } };
}

export function pilotObservations(viewports) {
  demand(Array.isArray(viewports) && viewports.length === VIEWPORTS.length
    && VIEWPORTS.every((v, i) => viewports[i].viewport.name === v.name && viewports[i].actual_desktop === true
      && viewports[i].division_error_observed === true), 'pilot requires both actual desktop viewports and observed division errors');
  return [['arithmetic_result', 'arithmetic', '50'], ['keyboard_result', 'keyboard', '42'], ['clear_recovery', 'recovered', '50']]
    .map(([kind, key, expected]) => {
      const actual = viewports.map(row => row[key]);
      demand(actual.every(value => value === expected), `actual ${kind} does not equal the independently specified arithmetic result`);
      return { kind, observation: { operator: 'equals', actual, expected: VIEWPORTS.map(() => expected) } };
    });
}

function artifact(file) {
  const info = fs.lstatSync(file);
  demand(info.isFile() && !info.isSymbolicLink(), 'pilot artifact must be a regular file');
  return { path: path.relative(WORKSPACE, file), sha256: digest(fs.readFileSync(file)), bytes: info.size };
}

export async function runCalculatorPilot(settings = {}, driver = null) {
  const outputDir = path.resolve(settings.outputDir || path.join(WORKSPACE, 'data/agent_supervisor/swissknife_visual_functional/tasks/SVF-034/pilot'));
  const namespace = path.join(WORKSPACE, 'data/agent_supervisor/swissknife_visual_functional');
  demand(outputDir.startsWith(namespace + path.sep), 'pilot output must remain in its campaign namespace');
  for (let current = outputDir; current !== WORKSPACE; current = path.dirname(current)) {
    demand(!fs.existsSync(current) || !fs.lstatSync(current).isSymbolicLink(), 'pilot output cannot traverse a symlink');
  }
  demand(!fs.existsSync(outputDir) || fs.lstatSync(outputDir).isDirectory(), 'pilot output must be a directory');
  fs.mkdirSync(outputDir, { recursive: true });
  const destination = path.join(outputDir, 'pilot.json');
  demand(!fs.existsSync(destination) || fs.lstatSync(destination).isFile() && !fs.lstatSync(destination).isSymbolicLink(), 'existing pilot report is not a regular file');
  const previous = fs.existsSync(destination) ? fs.readFileSync(destination) : null;
  const attemptDir = fs.mkdtempSync(path.join(outputDir, 'attempt-'));
  const app = JSON.parse(fs.readFileSync(CONTRACTS, 'utf8')).apps.find(item => item.app_id === 'calculator');
  demand(app?.disposition === 'browser_local', 'pilot must use the actual browser-local Calculator contract');
  const sources = [...new Set(['swissknife/scripts/run-visual-functional-workflow.mjs', 'swissknife/scripts/svf-calculator-pilot.mjs',
    ...app.source_paths.map(source => source.startsWith('swissknife/') ? source : `swissknife/${source}`)])];
  const sourceHashes = Object.fromEntries(sources.map(source => [source, digest(fs.readFileSync(path.join(WORKSPACE, source)))]));
  const contractHash = digest(fs.readFileSync(CONTRACTS));
  // The CLI entrypoint is itself awaiting this module. Importing that
  // entrypoint here would deadlock its top-level await; it passes its API in.
  const openSession = driver?.openRealDesktopSession
    || (await import('./run-visual-functional-workflow.mjs')).openRealDesktopSession;
  const viewports = [], artifacts = [];
  for (const viewport of VIEWPORTS) {
    const session = await openSession({ app, scenario: pilotAdmissionScenario(), viewport,
      outputDir: path.join(attemptDir, viewport.name), ...(settings.desktopUrl ? { desktopUrl: settings.desktopUrl } : {}) });
    try {
      demand(session.actual_desktop === true, 'unit drivers cannot establish a real integration pilot');
      const unique = async selector => {
        await session.assertActive();
        const target = session.primary.locator(selector);
        demand(await target.count() === 1, `ambiguous Calculator control: ${selector}`);
        return target;
      };
      const clickControl = async selector => { const target = await unique(selector); await target.scrollIntoViewIfNeeded(); await target.click({ timeout: 15000 }); };
      const readDisplay = async expected => {
        const target = await unique('#display-primary');
        await session.page.waitForFunction(({ selector, value }) => {
          const element = document.querySelector(selector);
          return element?.textContent.trim() === value;
        }, { selector: `${app.launch.window_selector} ${app.launch.primary_content_selector} #display-primary`, value: expected }, { timeout: 10000 });
        const actual = (await target.textContent()).trim();
        demand(actual === expected, 'rendered Calculator result is wrong');
        return actual;
      };
      for (const selector of [action('clear'), button('1'), button('2'), action('decimal'), button('5'), action('multiply'), button('4'), action('equals')]) await clickControl(selector);
      const arithmetic = await readDisplay('50');
      await clickControl(action('clear'));
      const focused = await unique(button('6')); await focused.focus();
      demand(await focused.evaluate(element => element.ownerDocument.activeElement === element), 'Calculator keyboard focus was not reached');
      await session.page.keyboard.type('6*7'); await session.page.keyboard.press('Enter');
      const keyboard = await readDisplay('42');
      for (const selector of [action('clear'), button('1'), action('divide'), button('0'), action('equals')]) await clickControl(selector);
      const error = await unique('#display-error'); await error.waitFor({ state: 'visible', timeout: 10000 });
      const errorText = (await error.textContent()).trim();
      demand(/zero/i.test(errorText), 'division by zero was not actually observed');
      for (const selector of [action('clear'), button('5'), action('multiply'), button('1'), button('0'), action('equals')]) await clickControl(selector);
      const recovered = await readDisplay('50');
      await error.waitFor({ state: 'hidden', timeout: 10000 });
      await (await unique('#display-primary')).scrollIntoViewIfNeeded();
      const filename = await session.capture('pilot-result');
      const image = path.join(attemptDir, `${viewport.name}.png`);
      fs.copyFileSync(path.join(session.outputDir, filename), image, fs.constants.COPYFILE_EXCL);
      artifacts.push(artifact(image));
      demand(session.network_events.every(event => !String(event.path || event.url || '').includes('/mcp/tools/call')), 'browser-local pilot attempted owner dispatch');
      viewports.push({ viewport, actual_desktop: session.actual_desktop, arithmetic, keyboard, recovered,
        division_error_observed: true, error_text: errorText, screenshot: path.relative(WORKSPACE, image) });
    } finally { await session.close(); }
  }
  demand(sources.every(source => digest(fs.readFileSync(path.join(WORKSPACE, source))) === sourceHashes[source])
    && digest(fs.readFileSync(CONTRACTS)) === contractHash, 'pilot source or contract changed while browser evidence was collected');
  const report = { schema: 'swissknife.visual-functional-driver-pilot.v1', app_id: 'calculator', actual_desktop: true,
    foundation_integration_only: true, functional_acceptance: false, viewports, observations: pilotObservations(viewports), artifacts,
    source_sha256: sourceHashes, contract_sha256: contractHash, work_complete: false, completion_authority: false };
  const current = fs.existsSync(destination) ? fs.readFileSync(destination) : null;
  demand(current === null ? previous === null : previous !== null && digest(current) === digest(previous), 'pilot publication changed concurrently');
  if (previous) {
    const archived = path.join(outputDir, `previous-${digest(previous)}.json`);
    if (!fs.existsSync(archived)) fs.writeFileSync(archived, previous, { flag: 'wx' });
    else demand(digest(fs.readFileSync(archived)) === digest(previous), 'previous pilot archive was changed');
  }
  fs.writeFileSync(path.join(attemptDir, 'pilot.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  const temporary = path.join(outputDir, `.pilot-${path.basename(attemptDir)}.json`);
  fs.writeFileSync(temporary, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(temporary, destination);
  return report;
}
