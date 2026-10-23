import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { main, parseArguments, refreshUnderLock, runLockedRefresh, runInventoryChild } from './refresh-vdg-inventory.mjs';
const moduleURL = new URL('./refresh-vdg-inventory.mjs', import.meta.url).href;
function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-inventory-lock-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test('refresh parses before touching inventory and read-only mode never locks or produces', async t => {
  const evidenceRoot = path.join(directory(t), 'absent');
  await assert.rejects(() => main(['--check', '--if-stale'], { evidenceRoot, inspectInventory: () => assert.fail('invalid argument read') }), /usage/);
  assert.throws(() => parseArguments(['--waiver']), /usage/);
  assert.equal(await main(['--check'], { evidenceRoot, log() {}, inspectInventory: () => ({ current: false, reason: 'old source' }),
    runLockedRefresh: () => assert.fail('read-only lock') }), 75);
  assert.equal(fs.existsSync(evidenceRoot), false);
  assert.equal(await main(['--if-stale'], { evidenceRoot, inspectInventory: () => ({ current: true }),
    runLockedRefresh: () => assert.fail('current inventory producer') }), 0);
});
test('inner lock owner rechecks before running bounded fixed production stages and verifies their result', async t => {
  const evidenceRoot = directory(t); const calls = []; let inspections = 0;
  assert.equal(await refreshUnderLock({ evidenceRoot, ifStale: true }, {
    inspectInventory: () => ({ current: ++inspections > 1 }), spawnSync: (command, args, options) => {
      assert.equal(command, process.execPath); assert.equal(options.shell, false); assert.ok(options.timeout > 0);
      assert.equal(options.env.VDG_EVIDENCE_ROOT, evidenceRoot); calls.push(path.basename(args[0])); return { status: 0 };
    },
  }), 0);
  assert.deepEqual(calls, ['run-rendered-census.mjs', 'refresh-vdg-owner-discovery.cjs', 'prepare-vdg-rendered-inputs.cjs']);
  assert.equal(inspections, 2);
  assert.equal(await refreshUnderLock({ evidenceRoot, ifStale: true }, { inspectInventory: () => ({ current: true }),
    spawnSync: () => assert.fail('waiting caller reran producer') }), 0);
  assert.equal(await refreshUnderLock({ evidenceRoot }, { inspectInventory: () => ({ current: false }), spawnSync: () => ({ status: 0 }) }), 75);
  let failures = 0;
  assert.equal(await refreshUnderLock({ evidenceRoot }, { spawnSync: () => { failures++; return { status: 37 }; } }), 37);
  assert.equal(failures, 1);
});
test('OS lock command is fixed, bounded, shell-free and retains one inode after release', async t => {
  const evidenceRoot = directory(t);
  assert.equal(await runLockedRefresh({ evidenceRoot, ifStale: true }, { spawnSync: (command, args, options) => {
    assert.equal(command, '/usr/bin/flock'); assert.equal(args.includes('--no-fork'), true); assert.equal(args.includes('--wait'), true);
    assert.equal(args.includes('900'), true); assert.equal(options.shell, false); assert.ok(options.timeout > 0);
    assert.equal(path.basename(args[args.indexOf('--no-fork') + 1]), 'refresh.lock'); return { status: 75 };
  } }), 75);
});
test('three real concurrent flock callers run one producer and all finish after the inside-lock recheck', async t => {
  const evidenceRoot = directory(t);
  const lockedModule = path.join(evidenceRoot, 'locked-fixture.mjs');
  fs.writeFileSync(lockedModule, `import fs from 'node:fs';import path from 'node:path';import {refreshUnderLock as actual} from ${JSON.stringify(moduleURL)};
export function refreshUnderLock(settings){return actual(settings,{
inspectInventory:()=>({current:fs.existsSync(path.join(settings.evidenceRoot,'current'))}),
spawnSync:(_command,args)=>{const stage=path.basename(args[0]);if(stage==='run-rendered-census.mjs'){fs.appendFileSync(path.join(settings.evidenceRoot,'producers'),'one\\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,150);}if(stage==='prepare-vdg-rendered-inputs.cjs')fs.writeFileSync(path.join(settings.evidenceRoot,'current'),'real fixture result');return {status:0};}
});}`);
  const code = `const {runLockedRefresh}=await import(${JSON.stringify(moduleURL)});process.exitCode=await runLockedRefresh({evidenceRoot:process.argv[1],ifStale:true},{lockedModule:process.argv[2]});`;
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', code, evidenceRoot, lockedModule], { stdio: 'pipe', timeout: 5000, killSignal: 'SIGKILL' });
    let stderr = ''; child.stderr.on('data', data => { stderr += data; });
    child.once('error', reject); child.once('close', status => { assert.equal(status, 0, stderr); resolve(); });
  });
  await Promise.all([run(), run(), run()]);
  assert.equal(fs.readFileSync(path.join(evidenceRoot, 'producers'), 'utf8'), 'one\n');
  assert.equal(fs.existsSync(path.join(evidenceRoot, 'vdg/inventory/refresh.lock')), true);
  await run(); assert.equal(fs.readFileSync(path.join(evidenceRoot, 'producers'), 'utf8'), 'one\n');
});
test('actual readonly CLI refuses missing inventory without starting a census or creating directories', t => {
  const evidenceRoot = path.join(directory(t), 'missing');
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./refresh-vdg-inventory.mjs', import.meta.url)), '--check'], {
    env: { ...process.env, VDG_EVIDENCE_ROOT: evidenceRoot }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 75, result.stderr); assert.match(result.stderr, /VDG inventory stale/);
  assert.equal(fs.existsSync(evidenceRoot), false);
});

test('actual flock eval imports the refresh module once without executing its CLI main guard', t => {
  const dir = directory(t), scripts = path.join(dir, 'scripts'), evidenceRoot = path.join(dir, 'evidence');
  fs.mkdirSync(scripts);
  // Use the actual production module bytes with only the inventory inspection
  // dependency replaced, so this exercises its real eval/argv/main interaction
  // without launching a census or touching canonical evidence.
  const copiedModule = path.join(scripts, 'refresh-vdg-inventory.mjs');
  fs.copyFileSync(fileURLToPath(new URL('./refresh-vdg-inventory.mjs', import.meta.url)), copiedModule);
  fs.writeFileSync(path.join(scripts, 'vdg-inventory-contract.cjs'), `const path=require('node:path');exports.roots=options=>({sourceRoot:path.resolve(__dirname,'..'),evidenceRoot:options.evidenceRoot});exports.inspectInventory=()=>({current:true});`);
  const entry = `const {runLockedRefresh}=await import(process.argv[2]);process.exitCode=await runLockedRefresh({evidenceRoot:process.argv[3],ifStale:true});`;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', entry, 'test-lock-parent', copiedModule, evidenceRoot], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '', 'imported refresh module ran its CLI main with eval settings as arguments');
  assert.equal(fs.existsSync(path.join(evidenceRoot, 'vdg/inventory/refresh.lock')), true);
  assert.deepEqual(fs.readdirSync(path.join(evidenceRoot, 'vdg/inventory')), ['refresh.lock']);
});

test('TERM keeps the actual OS lock until the real producer finishes bounded cleanup and prevents follow-up stages', async t => {
  const evidenceRoot = directory(t), producer = path.join(evidenceRoot, 'producer.cjs'), fixture = path.join(evidenceRoot, 'cancel-owner.mjs');
  fs.writeFileSync(producer, `const fs=require('node:fs'),path=require('node:path'),dir=process.argv[2];fs.writeFileSync(path.join(dir,'producer-pid'),String(process.pid));process.on('SIGTERM',()=>{fs.writeFileSync(path.join(dir,'cleaning'),'yes');setTimeout(()=>{fs.writeFileSync(path.join(dir,'cleaned'),'yes');process.exit(0)},300)});setInterval(()=>{},1000);`);
  fs.writeFileSync(fixture, `import fs from 'node:fs';import path from 'node:path';import {refreshUnderLock as actual,runInventoryChild} from ${JSON.stringify(moduleURL)};export async function refreshUnderLock(settings){return actual(settings,{inspectInventory:()=>({current:false}),runChild:(command,args,options)=>{fs.appendFileSync(path.join(settings.evidenceRoot,'stages'),path.basename(args[0])+'\\n');return runInventoryChild(process.execPath,[${JSON.stringify(producer)},settings.evidenceRoot],options)}})}`);
  const code = `const {runLockedRefresh}=await import(${JSON.stringify(moduleURL)});process.exitCode=await runLockedRefresh({evidenceRoot:process.argv[1],ifStale:true},{lockedModule:process.argv[2]});`;
  const child = spawn(process.execPath, ['--input-type=module', '--eval', code, evidenceRoot, fixture], { stdio: 'pipe' });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  const waitFile = async name => { const deadline = Date.now() + 5000; while (!fs.existsSync(path.join(evidenceRoot, name))) { if (Date.now() > deadline) throw new Error(`missing ${name}`); await new Promise(resolve => setTimeout(resolve, 5)); } };
  await waitFile('producer-pid'); child.kill('SIGTERM'); await waitFile('cleaning');
  const lock = path.join(evidenceRoot, 'vdg/inventory/refresh.lock');
  const contender = () => spawnSync('/usr/bin/flock', ['--exclusive', '--nonblock', '--conflict-exit-code', '75', lock, process.execPath, '--eval', 'process.exit(0)']);
  assert.equal(contender().status, 75, 'lock was released before producer cleanup');
  assert.equal(await closed, 143); assert.equal(fs.existsSync(path.join(evidenceRoot, 'cleaned')), true);
  assert.equal(contender().status, 0); assert.equal(fs.readFileSync(path.join(evidenceRoot, 'stages'), 'utf8'), 'run-rendered-census.mjs\n');
  const producerPid = Number(fs.readFileSync(path.join(evidenceRoot, 'producer-pid'), 'utf8'));
  assert.throws(() => process.kill(producerPid, 0), { code: 'ESRCH' });
});

test('inventory stage timeout stays a failure after a real producer cleans up and exits zero', async t => {
  const dir = directory(t), marker = path.join(dir, 'cleaned');
  const result = await runInventoryChild(process.execPath, ['--eval', `const fs=require('node:fs');process.on('SIGTERM',()=>{fs.writeFileSync(process.argv[1],'cleaned');process.exit(0)});setInterval(()=>{},1000);`, marker], {
    timeout: 100, cwd: dir, env: process.env,
  });
  assert.equal(result.status, 124); assert.equal(fs.readFileSync(marker, 'utf8'), 'cleaned');
});
