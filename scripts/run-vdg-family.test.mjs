import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArguments, runFamily, captureInputFingerprint } from './run-vdg-family.mjs';

test('rejects unknown families, transports and extra options before launching', () => {
  for (const args of [[], ['vdg-storage'], ['vdg-storage', 'tcp'], ['storage', 'http'], ['vdg-storage;echo', 'http'], ['vdg-storage', 'http', '--headed'], ['vdg-storage', 'http', '--list', '--list']]) {
    assert.throws(() => parseArguments(args), /usage:/);
  }
});
test('default is real isolated capture on a leased port followed by coverage refresh', () => {
  const calls = [];
  const status = runFamily(parseArguments(['vdg-storage', 'http']), { env: { VDG_EVIDENCE_REPLAY: '1' }, spawnSync: (command, args, options) => { calls.push({ command, args, options }); return { status: 0 }; } });
  assert.equal(status, 0);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].args[0].endsWith('run-with-owned-port.mjs'));
  assert.ok(calls[0].args.includes('SWISSKNIFE_VDG_E2E_PORT'));
  assert.ok(calls[0].args.includes('3021'));
  assert.equal(calls[0].args.includes('--list'), false);
  assert.ok(calls[0].args.includes('test/e2e/families/storage-media-mcp-invoke.spec.ts'));
  assert.ok(calls[0].args.includes('\\bvdg-storage\\b'));
  assert.equal(calls[0].options.env.VDG_CAPTURE_TRANSPORT, 'http');
  assert.equal(calls[0].options.env.VDG_EVIDENCE_REPLAY, '0');
  assert.equal(calls[0].options.shell, false);
  assert.ok(calls[1].args[0].endsWith('build-gui-mcp-coverage.cjs'));
});
test('list mode only enumerates and does not change coverage', () => {
  const calls = [];
  const status = runFamily(parseArguments(['vdg-control', 'libp2p', '--list']), { spawnSync: (command, args, options) => { calls.push({ args, options }); return { status: 0 }; } });
  assert.equal(status, 0);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].args.includes('--list'));
  assert.equal(calls[0].options.env.VDG_CAPTURE_TRANSPORT, 'libp2p');
});
test('concurrent families use distinct preferred port blocks', () => {
  const ports = new Set();
  for (const family of ['vdg-storage', 'vdg-datasets', 'vdg-accelerate', 'vdg-network', 'vdg-control', 'vdg-local']) {
    runFamily(parseArguments([family, 'http', '--list']), { spawnSync: (_command, args) => {
      ports.add(args[args.indexOf('--preferred') + 1]); return { status: 0 };
    } });
  }
  assert.equal(ports.size, 6);
  assert.deepEqual([...ports], ['3021', '3121', '3221', '3321', '3421', '3521']);
});
test('failed assertions still refresh coverage and retain their original exit', () => {
  const calls = [];
  const status = runFamily(parseArguments(['vdg-local', 'http']), { spawnSync: (command, args) => { calls.push(args); return { status: calls.length === 1 ? 37 : 0 }; } });
  assert.equal(calls.length, 2);
  assert.equal(status, 37);
});
test('a failed coverage refresh cannot turn a successful capture into success', () => {
  let count = 0;
  const status = runFamily(parseArguments(['vdg-network', 'http']), { spawnSync: () => ({ status: ++count === 1 ? 0 : 9 }) });
  assert.equal(status, 9);
});

test('new complete family capture with strict evidence gaps returns 75 after refreshing', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const root = mkdtempSync(path.join(tmpdir(), 'vdg-runner-'));
  try {
    for (const directory of ['vdg/connectors', 'vdg/runs', 'vdg/families']) mkdirSync(path.join(root, directory), { recursive: true });
    let calls = 0;
    const runId = 'storage-http-new';
    const status = runFamily(parseArguments(['vdg-storage', 'http']), { evidenceRoot: root, spawnSync: () => {
      if (++calls === 1) {
        const stamp = new Date().toISOString();
        writeFileSync(path.join(root, 'vdg/connectors/storage.json'), JSON.stringify({ schema: 'swissknife.virtual-desktop-gui-mcp-connectors.v1', target: 'storage', runs: [{ run_id: runId, report_path: `vdg/runs/${runId}.json`, capture_complete: true, completed_at: stamp }] }));
        writeFileSync(path.join(root, `vdg/runs/${runId}.json`), JSON.stringify({ schema: 'swissknife.virtual-desktop-live-click.v1', target: 'storage', generated_at: stamp, row_count: 1, rows: [{ failure_reasons: [] }] }));
        return { status: 1 };
      }
      writeFileSync(path.join(root, 'vdg/families/storage.json'), JSON.stringify({ family: 'vdg-storage', generated_at: new Date().toISOString(), decision: 'no_go', passed: false, gap_count: 4 }));
      return { status: 0 };
    } });
    assert.equal(calls, 2);
    assert.equal(status, 75);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('stale, unrelated or fatal reports cannot mask infrastructure failure', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  for (const variant of ['stale', 'unrelated', 'fatal', 'unregistered']) {
    const root = mkdtempSync(path.join(tmpdir(), 'vdg-runner-reject-'));
    try {
      for (const directory of ['vdg/connectors', 'vdg/runs', 'vdg/families']) mkdirSync(path.join(root, directory), { recursive: true });
      const runId = 'storage-http-sample';
      const write = () => {
        const stamp = variant === 'stale' ? '2000-01-01T00:00:00.000Z' : new Date().toISOString();
        writeFileSync(path.join(root, 'vdg/connectors/storage.json'), JSON.stringify({ schema: 'swissknife.virtual-desktop-gui-mcp-connectors.v1', target: variant === 'unrelated' ? 'network' : 'storage', runs: variant === 'unregistered' ? [] : [{ run_id: runId, report_path: `vdg/runs/${runId}.json`, capture_complete: true, completed_at: stamp }] }));
        writeFileSync(path.join(root, `vdg/runs/${runId}.json`), JSON.stringify({ schema: 'swissknife.virtual-desktop-live-click.v1', target: 'storage', generated_at: stamp, row_count: 1, rows: [{ failure_reasons: variant === 'fatal' ? ['runner-failed'] : [] }] }));
        writeFileSync(path.join(root, 'vdg/families/storage.json'), JSON.stringify({ family: 'vdg-storage', generated_at: stamp, decision: 'no_go', passed: false, gap_count: 4 }));
      };
      if (variant === 'stale') write();
      let calls = 0;
      const status = runFamily(parseArguments(['vdg-storage', 'http']), { evidenceRoot: root, spawnSync: () => { if (++calls === 1) write(); return { status: calls === 1 ? 13 : 0 }; } });
      assert.equal(status, 13, variant);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('failed-capture cache makes unchanged probes cheap; source changes and --fresh recapture', async () => {
  const fs = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(tmpdir(), 'vdg-capture-cache-'));
  try {
    for (const directory of ['vdg/connectors', 'vdg/runs', 'vdg/families', 'web/js/apps']) fs.mkdirSync(path.join(root, directory), { recursive: true });
    fs.writeFileSync(path.join(root, 'control-tool-matrix.json'), '{"version":1}');
    let captures = 0;
    let refreshes = 0;
    const runs = [];
    const spawn = (command, args) => {
      const stamp = new Date().toISOString();
      if (args[0].endsWith('run-with-owned-port.mjs')) {
        const runId = `storage-http-${++captures}`;
        runs.push({ run_id: runId, report_path: `vdg/runs/${runId}.json`, capture_complete: true, completed_at: stamp });
        fs.writeFileSync(path.join(root, 'vdg/connectors/storage.json'), JSON.stringify({ schema: 'swissknife.virtual-desktop-gui-mcp-connectors.v1', target: 'storage', runs }));
        fs.writeFileSync(path.join(root, `vdg/runs/${runId}.json`), JSON.stringify({ schema: 'swissknife.virtual-desktop-live-click.v1', target: 'storage', generated_at: stamp, row_count: 1, rows: [{ failure_reasons: [] }] }));
        return { status: 1 };
      }
      refreshes++;
      fs.writeFileSync(path.join(root, 'vdg/families/storage.json'), JSON.stringify({ family: 'vdg-storage', generated_at: stamp, decision: 'no_go', passed: false, gap_count: 2 }));
      return { status: 0 };
    };
    const options = parseArguments(['vdg-storage', 'http']);
    const dependencies = { evidenceRoot: root, sourceRoot: root, spawnSync: spawn };
    assert.equal(runFamily(options, dependencies), 75);
    assert.equal(captures, 1);
    assert.equal(runFamily(options, dependencies), 75);
    assert.equal(captures, 1, 'unchanged gate probes must not repeat the browser');
    assert.equal(refreshes, 2);
    fs.writeFileSync(path.join(root, 'web/js/apps/file-manager.js'), 'actual source changed');
    assert.equal(runFamily(options, dependencies), 75);
    assert.equal(captures, 2, 'changed family source invalidates stale cache');
    assert.equal(runFamily(parseArguments(['vdg-storage', 'http', '--fresh']), dependencies), 75);
    assert.equal(captures, 3, '--fresh bypasses a valid failed cache after backend-only changes');
    const runFile = path.join(root, runs.at(-1).report_path);
    fs.writeFileSync(runFile, '{"changed":true}');
    assert.equal(runFamily(options, dependencies), 75);
    assert.equal(captures, 4, 'changed capture bytes cannot reuse an old diagnostic');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('capture-only reuses verified acquisition, preserves NO_GO and rejects a failed fresh attempt', async t => {
  const fs = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { createHash } = await import('node:crypto');
  const root = fs.mkdtempSync(path.join(tmpdir(), 'vdg-acquire-runner-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const directory of ['vdg/connectors', 'vdg/runs']) fs.mkdirSync(path.join(root, directory), { recursive: true });
  const row = { family: 'vdg-storage', app_id: 'file-manager', launch_id: 'file-manager', selector: '#native', failure_reasons: ['owner-did-not-execute'] };
  fs.writeFileSync(path.join(root, 'control-tool-matrix.json'), JSON.stringify({ rows: [row] }));
  const runs = [];
  let captures = 0;
  const spawn = (_command, args) => {
    if (!args[0].endsWith('run-with-owned-port.mjs')) return { status: 0 };
    const stamp = new Date().toISOString();
    const runId = `storage-http-${++captures}`;
    const bytes = JSON.stringify({ schema: 'swissknife.virtual-desktop-live-click.v1', target: 'storage', generated_at: stamp, row_count: 1, rows: [row], decision: 'no_go', passed: false });
    fs.writeFileSync(path.join(root, `vdg/runs/${runId}.json`), bytes);
    runs.push({ run_id: runId, transport: 'http', report_path: `vdg/runs/${runId}.json`, capture_complete: true, completed_at: stamp,
      report_sha256: createHash('sha256').update(bytes).digest('hex'), input_fingerprint: captureInputFingerprint('vdg-storage', 'http', { sourceRoot: root, evidenceRoot: root }) });
    fs.writeFileSync(path.join(root, 'vdg/connectors/storage.json'), JSON.stringify({ schema: 'swissknife.virtual-desktop-gui-mcp-connectors.v1', target: 'storage', runs }));
    return { status: 1 }; // Full family acceptance is still withheld.
  };
  const dependencies = { sourceRoot: root, evidenceRoot: root, spawnSync: spawn };
  const options = parseArguments(['vdg-storage', 'http', '--capture-only']);
  assert.equal(runFamily(options, dependencies), 0);
  assert.equal(runFamily(options, dependencies), 0);
  assert.equal(captures, 1);
  const fresh = parseArguments(['vdg-storage', 'http', '--capture-only', '--fresh']);
  assert.equal(runFamily(fresh, { ...dependencies, spawnSync: () => ({ status: 7 }) }), 7);
  assert.equal(captures, 1, 'a previous current capture cannot satisfy an explicitly fresh attempt');
  assert.equal(runFamily(fresh, dependencies), 0);
  assert.equal(captures, 2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, runs.at(-1).report_path))).decision, 'no_go');
});
