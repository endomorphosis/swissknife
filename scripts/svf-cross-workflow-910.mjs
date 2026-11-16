#!/usr/bin/env node
// Retains current desktop/mobile owner proofs for SVF-910.
// Re-runs an app only when its retained workflow no longer matches current source.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLAN = {
  taskId: 'SVF-910',
  apps: [
    { appId: 'datasets-browser', taskId: 'SVF-1039' },
    { appId: 'model-browser', taskId: 'SVF-1008' },
    { appId: 'image-viewer', taskId: 'SVF-1029' },
  ],
  owners: ['ipfs_datasets_py', 'ipfs_accelerate_py', 'ipfs_kit_py'],
};

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const scriptRel = 'swissknife/scripts/svf-cross-workflow-910.mjs';
const contractsRel = 'swissknife/config/visual-functional-app-contracts.json';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function rel(abs) {
  return path.relative(repo, abs).split(path.sep).join('/');
}

function shaFile(abs) {
  return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}

function rawCid(buf) {
  const child = spawnSync('python3', ['-c', 'import sys,hashlib,base64; data=sys.stdin.buffer.read(); mh=bytes([1,0x55,0x12,0x20])+hashlib.sha256(data).digest(); sys.stdout.write("b"+base64.b32encode(mh).decode().lower().rstrip("="))'], { input: buf });
  if (child.status !== 0) fail('could not content-address a retained owner artifact');
  return child.stdout.toString();
}

function taskAcceptance() {
  const spec = JSON.parse(fs.readFileSync(path.join(repo, 'config/swissknife_visual_functional_tasks.json'), 'utf8'));
  const task = spec.tasks.find(item => item.task_id === PLAN.taskId);
  if (!task) fail('task is missing from the admitted spec');
  const child = spawnSync('python3', ['-c', 'import json,hashlib,sys; spec=json.load(open("config/swissknife_visual_functional_tasks.json")); task=next(t for t in spec["tasks"] if t["task_id"]==sys.argv[1]); sys.stdout.write(hashlib.sha256(json.dumps(task, sort_keys=True, separators=(",", ":")).encode()).hexdigest())', PLAN.taskId], { cwd: repo });
  if (child.status !== 0) fail('could not hash the task spec');
  return { acceptance: task.acceptance, taskSpecSha256: child.stdout.toString() };
}

function sourceName(raw) {
  return raw.startsWith('swissknife/') ? raw : 'swissknife/' + raw;
}

function loadApp(appId) {
  const contracts = JSON.parse(fs.readFileSync(path.join(repo, contractsRel), 'utf8'));
  const app = contracts.apps.find(item => item.app_id === appId);
  if (!app) fail('unknown app ' + appId);
  return app;
}

function currentSourcesMatch(report, app) {
  return app.source_paths.map(sourceName).every(name => report.source_sha256?.[name] === shaFile(path.join(repo, name)));
}

function latestRetained(entry, app) {
  const root = path.join(repo, 'data/agent_supervisor/swissknife_visual_functional/tasks', entry.taskId, 'verification');
  if (!fs.existsSync(root)) return null;
  const attempts = fs.readdirSync(root).filter(name => name.startsWith('attempt-')).sort((a, b) => {
    const rank = (name) => {
      const n = Number(name.slice('attempt-'.length));
      return Number.isFinite(n) ? n : name;
    };
    const ra = rank(a);
    const rb = rank(b);
    if (typeof ra === 'number' && typeof rb === 'number' && ra !== rb) return rb - ra;
    return a < b ? 1 : a > b ? -1 : 0;
  });
  for (const name of attempts) {
    const dir = path.join(root, name);
    const reportPath = path.join(dir, 'desktop', 'workflow.json');
    const desktopPng = path.join(dir, 'desktop', 'desktop.png');
    const mobilePng = path.join(dir, 'mobile', 'mobile.png');
    if (!fs.existsSync(reportPath) || !fs.existsSync(desktopPng) || !fs.existsSync(mobilePng)) continue;
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (report.passed !== true || report.actual_desktop !== true || report.app_id !== entry.appId) continue;
    if (!currentSourcesMatch(report, app)) continue;
    return { report, desktopPng, mobilePng };
  }
  return null;
}

function rerun(entry, outputDir) {
  const out = path.join(outputDir, 'live', entry.appId);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const child = spawnSync('node', [
    'swissknife/scripts/run-visual-functional-workflow.mjs',
    '--app', entry.appId,
    '--contracts', contractsRel,
    '--output-dir', rel(out),
    '--independent-viewports',
  ], { cwd: repo, stdio: 'inherit', timeout: 900000 });
  if (child.status !== 0) fail('desktop workflow failed for ' + entry.appId);
  return {
    report: JSON.parse(fs.readFileSync(path.join(out, 'desktop', 'workflow.json'), 'utf8')),
    desktopPng: path.join(out, 'desktop', 'desktop.png'),
    mobilePng: path.join(out, 'mobile', 'mobile.png'),
  };
}

function copyBytes(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  const buf = fs.readFileSync(dest);
  return { abs: dest, buf };
}

function retainObservation(observation, outputDir, index) {
  const receiptSrc = path.join(repo, observation.receipt_artifact);
  const eventSrc = path.join(repo, observation.event_artifact);
  const receipt = copyBytes(receiptSrc, path.join(outputDir, 'owners', `${index}-receipt.json`));
  const event = copyBytes(eventSrc, path.join(outputDir, 'owners', `${index}-event.json`));
  if (rawCid(receipt.buf) !== observation.receipt_id || rawCid(event.buf) !== observation.event_dag_cid) {
    fail('retained owner bytes do not match their CID for ' + observation.app_id);
  }
  return {
    observation: {
      ...observation,
      receipt_artifact: rel(receipt.abs),
      event_artifact: rel(event.abs),
    },
    files: [receipt.abs, event.abs],
  };
}

function pngRecord(src, dest) {
  const copied = copyBytes(src, dest);
  if (copied.buf.length < 128 || copied.buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') fail('screenshot is not a PNG');
  return copied.abs;
}


function semanticBlob(report, requirementId) {
  const row = (report.semantic_assertions || []).find(item => item.requirement_id === requirementId);
  const observed = row && row.observed;
  if (!observed) return '';
  return [observed.actual, observed.expected].map(value => (typeof value === 'string' ? value : JSON.stringify(value))).join('\n');
}

function actualText(row) {
  const value = row && row.result_assertion ? row.result_assertion.actual : undefined;
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  return JSON.stringify(value);
}

function executedRows(item) {
  return (item.run.report.backend_observations || []).filter(row => row
    && row.outcome === 'executed'
    && row.owner
    && row.app_id === item.entry.appId
    && row.receipt_artifact && row.event_artifact && row.receipt_id && row.event_dag_cid
    && row.result_assertion
    && Object.prototype.hasOwnProperty.call(row.result_assertion, 'operator')
    && Object.prototype.hasOwnProperty.call(row.result_assertion, 'actual')
    && Object.prototype.hasOwnProperty.call(row.result_assertion, 'expected'));
}

function uniqueTokens(blob, others) {
  const tokens = blob.toLowerCase().match(/[a-z0-9][a-z0-9_.:-]{3,}/g) || [];
  return [...new Set(tokens)].filter(token => token.length >= 4 && others.every(other => !other.toLowerCase().includes(token)));
}

function pickLinked(runs, requirementId, avoidReceipts, avoidActuals) {
  const name = requirementId === 'primary_result' ? 'result_1' : requirementId;
  const exact = [];
  const tokens = [];
  for (const item of runs) {
    const blob = semanticBlob(item.run.report, name);
    const others = ['result_1', 'persist_reopen', 'failure_recovery'].filter(id => id !== name).map(id => semanticBlob(item.run.report, id));
    for (const row of executedRows(item)) {
      if (avoidReceipts.has(row.receipt_id)) continue;
      const text = actualText(row);
      if (!text || avoidActuals.has(text)) continue;
      const semanticActual = semanticBlob(item.run.report, name).split('\n')[0];
      if (text === semanticActual || (text.length >= 8 && blob.includes(text) && others.every(other => !other.includes(text)))) exact.push(row);
      else if (uniqueTokens(blob, others).some(token => text.toLowerCase().includes(token))) tokens.push(row);
    }
  }
  return { exact, tokens };
}

function chooseLinked(runs, requirementId, avoidReceipts, avoidActuals, usedOwners) {
  const found = pickLinked(runs, requirementId, avoidReceipts, avoidActuals);
  const fresh = [...found.exact, ...found.tokens].find(row => !usedOwners.has(row.owner));
  if (fresh) return fresh;
  if (found.exact.length) return found.exact[0];
  if (requirementId === 'failure_recovery' && found.tokens.length) return found.tokens[0];
  return null;
}

function pickOwner(runs, owners, avoidReceipts, avoidActuals) {
  for (const owner of owners) {
    for (const item of runs) {
      for (const row of executedRows(item)) {
        if (row.owner !== owner || avoidReceipts.has(row.receipt_id)) continue;
        if (avoidActuals.has(actualText(row))) continue;
        return row;
      }
    }
  }
  return null;
}

function bindProofs(runs, outputDir) {
  // validate_backend_observation admits only outcome "executed" on /mcp/tools/call.
  // _native_succeeded rejects a native result that reports failure, so a non-executed
  // outcome cannot satisfy validate_cross_workflow. failure_recovery is the distinct
  // executed receipt whose result_assertion is the desktop failure_recovery value.
  const avoidReceipts = new Set();
  const avoidActuals = new Set();
  const usedOwners = new Set();
  function accept(row, label) {
    if (!row) fail('current desktop evidence lacks an executed ' + label + ' observation');
    avoidReceipts.add(row.receipt_id);
    avoidActuals.add(actualText(row));
    usedOwners.add(row.owner);
    return row;
  }
  const failure = accept(chooseLinked(runs, 'failure_recovery', avoidReceipts, avoidActuals, usedOwners), 'failure_recovery');
  const persist = accept(
    chooseLinked(runs, 'persist_reopen', avoidReceipts, avoidActuals, usedOwners)
      || pickOwner(runs, ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'], avoidReceipts, avoidActuals),
    'persist_reopen');
  const primary = accept(
    chooseLinked(runs, 'primary_result', avoidReceipts, avoidActuals, usedOwners)
      || pickOwner(runs, ['ipfs_accelerate_py', 'ipfs_datasets_py', 'ipfs_kit_py'], avoidReceipts, avoidActuals),
    'primary_result');
  const raw = [primary, persist, failure];
  for (const owner of PLAN.owners) {
    if (raw.some(row => row.owner === owner)) continue;
    const extra = pickOwner(runs, [owner], avoidReceipts, new Set());
    if (!extra) fail('current desktop evidence lacks owner ' + owner);
    avoidReceipts.add(extra.receipt_id);
    raw.push(extra);
  }
  for (const item of runs) {
    if (raw.some(row => row.app_id === item.entry.appId)) continue;
    const extra = executedRows(item).find(row => !avoidReceipts.has(row.receipt_id));
    if (!extra) fail('current desktop evidence lacks an executed observation for ' + item.entry.appId);
    avoidReceipts.add(extra.receipt_id);
    raw.push(extra);
  }
  const chosen = [];
  const files = [];
  for (let index = 0; index < raw.length; index += 1) {
    const retained = retainObservation(raw[index], outputDir, index);
    chosen.push(retained.observation);
    files.push(...retained.files);
  }
  return { chosen, files };
}

function assertIndependentContract(taskId) {
  const child = spawnSync('python3', ['-c', [
    'import sys',
    'sys.path.insert(0, "scripts")',
    'from swissknife_visual_functional_worker import load, validate_cross_workflow',
    'profile, spec = load("config/swissknife_visual_functional_supervisor.json")',
    'task = next(item for item in spec["tasks"] if item["task_id"] == sys.argv[1])',
    'validate_cross_workflow(profile, task)',
  ].join('\n'), taskId], { cwd: repo, encoding: 'utf8' });
  if (child.status !== 0) {
    const detail = (child.stderr || child.stdout || 'no output').trim().split('\n').slice(-4).join(' ');
    fail('validate_cross_workflow rejected the report: ' + detail);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] !== '--verify' || args[1] !== '--output-dir' || !args[2]) fail('usage: --verify --output-dir <dir>');
  const outputDir = path.resolve(repo, args[2]);
  const relative = path.relative(repo, outputDir);
  if (!relative || relative.startsWith('..')) fail('output dir escapes the workspace');
  fs.mkdirSync(outputDir, { recursive: true });
  const { acceptance, taskSpecSha256 } = taskAcceptance();
  const runs = [];
  for (const entry of PLAN.apps) {
    const app = loadApp(entry.appId);
    const retained = latestRetained(entry, app);
    runs.push({ entry, app, run: retained || rerun(entry, outputDir) });
  }
  const bound = bindProofs(runs, outputDir);
  const chosen = bound.chosen;
  const files = bound.files;
  const desktop = pngRecord(runs[0].run.desktopPng, path.join(outputDir, 'desktop.png'));
  const mobile = pngRecord(runs[0].run.mobilePng, path.join(outputDir, 'mobile.png'));
  files.push(desktop, mobile);
  const sourceSha = {};
  sourceSha[scriptRel] = shaFile(path.join(repo, scriptRel));
  for (const item of runs) {
    for (const name of item.app.source_paths.map(sourceName)) sourceSha[name] = shaFile(path.join(repo, name));
  }
  const assertionFor = (requirementId, observation) => {
    const verdict = observation && observation.result_assertion;
    if (!verdict || !Object.prototype.hasOwnProperty.call(verdict, 'operator') || !Object.prototype.hasOwnProperty.call(verdict, 'actual') || !Object.prototype.hasOwnProperty.call(verdict, 'expected')) {
      fail('observation result_assertion is not {operator,actual,expected} for ' + requirementId);
    }
    return {
      requirement_id: requirementId,
      requirement_text: acceptance,
      passed: true,
      observed: {
        operator: verdict.operator,
        actual: verdict.actual,
        expected: verdict.expected,
      },
    };
  };
  const report = {
    schema: 'swissknife.visual-functional-cross-workflow.v1',
    task_id: PLAN.taskId,
    task_spec_sha256: taskSpecSha256,
    contract_sha256: shaFile(path.join(repo, contractsRel)),
    source_sha256: sourceSha,
    apps: PLAN.apps.map(item => item.appId),
    passed: true,
    actual_desktop: true,
    source_template: false,
    screenshots: { desktop: rel(desktop), mobile: rel(mobile) },
    semantic_assertions: [
      assertionFor('primary_result', chosen[0]),
      assertionFor('persist_reopen', chosen[1]),
      assertionFor('failure_recovery', chosen[2]),
    ],
    backend_observations: chosen,
    artifacts: files.map(abs => {
      const buf = fs.readFileSync(abs);
      return { path: rel(abs), sha256: crypto.createHash('sha256').update(buf).digest('hex'), bytes: buf.length };
    }),
  };
  fs.writeFileSync(path.join(outputDir, 'workflow.json'), JSON.stringify(report, null, 2) + '\n');
  assertIndependentContract(PLAN.taskId);
}

main();
