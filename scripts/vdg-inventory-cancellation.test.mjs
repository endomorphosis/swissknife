/** Real owned Vite/Chrome startup and cancellation; never writes canonical proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
function processIdentity(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return { pid, state: fields[0], started: fields[19] };
  } catch { return null; }
}
function descendants(pid) {
  let children;
  try { children = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean).map(Number); }
  catch { return []; }
  return children.flatMap(child => [processIdentity(child), ...descendants(child)]).filter(Boolean);
}
test('real census TERM cleans owned Chrome and detached desktop before exit and preserves previous output', { timeout: 90000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-census-cancel-')), output = path.join(dir, 'census.json');
  fs.writeFileSync(output, 'previous inventory proof\n');
  const child = spawn(process.execPath, [path.join(root, 'scripts/run-rendered-census.mjs')], {
    cwd: root, env: { ...process.env, RENDERED_CENSUS_OUT: output, SWISSKNIFE_RENDERED_CENSUS_PORT: '3063' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let outputLog = '', errorLog = '', owned = [];
  const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
  child.stdout.on('data', data => { outputLog += data; }); child.stderr.on('data', data => { errorLog += data; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      owned = [...owned, ...descendants(child.pid)]; child.kill('SIGTERM');
      await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 25000))]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    for (const identity of owned) {
      const current = processIdentity(identity.pid);
      if (current?.started === identity.started && current.state !== 'Z') try { process.kill(identity.pid, 'SIGKILL'); } catch {}
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const deadline = Date.now() + 60000;
  while (!outputLog.includes('census runner live-dom launches=')) {
    if (child.exitCode !== null || child.signalCode !== null || Date.now() > deadline) throw new Error(`census did not reach real browser: ${outputLog}\n${errorLog}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  owned = descendants(child.pid);
  assert.ok(owned.length >= 2, 'expected the owned real desktop and browser descendants');
  child.kill('SIGTERM');
  const result = await closed; assert.equal(result.code, 143, errorLog);
  assert.equal(fs.readFileSync(output, 'utf8'), 'previous inventory proof\n');
  const live = owned.filter(identity => { const current = processIdentity(identity.pid); return current?.started === identity.started && current.state !== 'Z'; });
  assert.deepEqual(live, [], 'census exited before its owned desktop/browser descendants');
});
