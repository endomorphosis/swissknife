#!/usr/bin/env node
/**
 * SWR-009: Release readiness gate orchestrator.
 *
 * Runs the full set of release-blocking checks for the swissknife package in a
 * single, deterministic sequence and emits a machine-readable report so CI and
 * local release workflows fail fast on the first offending gate instead of
 * silently skipping downstream checks.
 *
 * Gates (in order):
 *   1. services:audit             - service-boundary drift (root/unknown/forbidden/legacy imports)
 *   2. audit:module-boundary       - SWR-024 repository module-boundary audit (unknown/forbidden
 *      imports across all top-level `src` modules; deterministic, CI-suitable, independent of the
 *      `--fail-on-legacy` shim check that `services:audit` also performs).
 *   3. typecheck                  - browser + host TypeScript project references
 *   4. test:fast                  - fast unit lane
 *   5. test:browser-compat        - static + runtime browser-compatibility lanes
 *   6. build:web                  - production web bundle + bundle budget/host-leakage audit
 *   7. audit:bundle-host-leakage   - SWR-016/SWR-029 explicit re-audit of the just-built `dist`
 *      bundle for host-only leakage (Node core imports, subprocess APIs, native module loading,
 *      filesystem APIs), independent confirmation on top of the audit embedded in `build:web`.
 *   8. evidence:freshness:check    - SWR-029 staleness gate for evidence that is too expensive to
 *      regenerate on every release candidate (SWR-028 browser libp2p Playwright evidence, SWR-016
 *      bundle budget snapshot, SWR-024 module-boundary audit snapshot). Fails when the recorded
 *      evidence fingerprint no longer matches the current state of the source it depends on.
 *   9. evidence:mcp-glasses       - MCP/glasses manifest + capability coverage evidence
 *   10. evidence:dashboard-consumer (optional, cross-repo) - MCP dashboard catalog/launch-gate
 *      receipt consistency against the live capability registry. Only runs when the sibling
 *      `hallucinate_app` checkout is present (monorepo/local dev); it is skipped, not failed,
 *      in a standalone `swissknife` checkout where that sibling repo does not exist.
 *
 * Usage:
 *   node scripts/release-readiness-gate.mjs [--skip-build] [--json <path>] [--report <path>]
 *
 * Exit code is non-zero when any required gate fails. A JSON report is always
 * written (default: docs/release-readiness-report.json) so failures/successes
 * are auditable evidence for the release process, not just console noise.
 *
 * See docs/release-browser-gates.md (SWR-029) for the full policy this gate enforces.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const siblingHallucinateAppDir = path.resolve(repoRoot, '..', 'hallucinate_app');

const DEFAULT_REPORT_JSON = 'docs/release-readiness-report.json';
const DEFAULT_REPORT_MD = 'docs/release-readiness-report.md';

function parseArgs(argv) {
  const args = {
    skipBuild: false,
    json: DEFAULT_REPORT_JSON,
    report: DEFAULT_REPORT_MD,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--skip-build') {
      args.skipBuild = true;
    } else if (arg === '--json') {
      args.json = argv[++i];
      if (!args.json) throw new Error('--json requires an output path');
    } else if (arg === '--report') {
      args.report = argv[++i];
      if (!args.report) throw new Error('--report requires an output path');
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function usage() {
  return [
    'Usage: node scripts/release-readiness-gate.mjs [options]',
    '',
    'Options:',
    '  --skip-build       Skip the build:web gate (useful for fast local iteration).',
    '  --json <path>      Write the deterministic gate report as JSON (default: docs/release-readiness-report.json).',
    '  --report <path>    Write a human-readable Markdown summary (default: docs/release-readiness-report.md).',
    '  --help, -h         Show this help text.',
  ].join('\n');
}

function abs(relativePath) {
  return path.resolve(repoRoot, relativePath);
}

function runNpmScript(scriptName, extraArgs = []) {
  const args = ['run', scriptName, ...(extraArgs.length ? ['--', ...extraArgs] : [])];
  const startedAt = Date.now();
  const result = spawnSync('npm', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
  const durationMs = Date.now() - startedAt;
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const output = `${stdout}${stderr}`;
  const tailLines = output.split('\n').filter((line) => line.trim().length > 0).slice(-40);

  return {
    ok: result.status === 0,
    status: result.status,
    durationMs,
    tail: tailLines,
  };
}

function gitCommitSha() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function formatDuration(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }

  const startedAt = new Date();
  const gates = [];
  let stoppedEarly = null;

  const requiredGates = [
    {
      id: 'services-audit',
      label: 'Service-boundary audit (services:audit)',
      run: () => runNpmScript('services:audit'),
    },
    {
      id: 'module-boundary-audit',
      label: 'Repository module-boundary audit (audit:module-boundary)',
      run: () => runNpmScript('audit:module-boundary'),
    },
    {
      id: 'typecheck',
      label: 'TypeScript project typecheck (typecheck)',
      run: () => runNpmScript('typecheck'),
    },
    {
      id: 'test-fast',
      label: 'Fast unit test lane (test:fast)',
      run: () => runNpmScript('test:fast'),
    },
    {
      id: 'test-browser-compat',
      label: 'Browser compatibility lane (test:browser-compat)',
      run: () => runNpmScript('test:browser-compat'),
    },
    {
      id: 'build-web',
      label: 'Web bundle build + host-leakage/budget audit (build:web)',
      skip: args.skipBuild,
      run: () => runNpmScript('build:web'),
    },
    {
      id: 'bundle-host-leakage',
      label: 'Web bundle host-leakage re-audit (audit:bundle-host-leakage)',
      skip: args.skipBuild,
      run: () => runNpmScript('audit:bundle-host-leakage'),
    },
    {
      id: 'evidence-freshness',
      label: 'Browser/libp2p release evidence freshness (evidence:freshness:check)',
      run: () => runNpmScript('evidence:freshness:check'),
    },
    {
      id: 'evidence-mcp-glasses',
      label: 'MCP/glasses manifest + capability coverage evidence (evidence:mcp-glasses)',
      run: () => runNpmScript('evidence:mcp-glasses'),
    },
  ];

  for (const gate of requiredGates) {
    if (gate.skip) {
      gates.push({ id: gate.id, label: gate.label, status: 'skipped', durationMs: 0, tail: [] });
      continue;
    }

    process.stdout.write(`\n▶ ${gate.label}\n`);
    const outcome = gate.run();
    gates.push({
      id: gate.id,
      label: gate.label,
      status: outcome.ok ? 'passed' : 'failed',
      durationMs: outcome.durationMs,
      tail: outcome.ok ? [] : outcome.tail,
    });

    if (outcome.ok) {
      process.stdout.write(`  ✓ passed in ${formatDuration(outcome.durationMs)}\n`);
    } else {
      process.stdout.write(`  ✗ failed in ${formatDuration(outcome.durationMs)} (exit ${outcome.status})\n`);
      process.stdout.write(`${outcome.tail.join('\n')}\n`);
      stoppedEarly = gate.id;
      break;
    }
  }

  // Optional cross-repo evidence gate: only meaningful (and only possible) when
  // this checkout is embedded in the monorepo alongside `hallucinate_app`. In a
  // standalone `swissknife` checkout (e.g. its own GitHub repo CI), the sibling
  // directory will not exist and this gate is recorded as skipped rather than
  // failed so the release gate stays runnable in both contexts.
  if (!stoppedEarly) {
    const dashboardConsumerLabel =
      'MCP dashboard catalog/launch-gate receipt consistency (evidence:dashboard-consumer)';
    if (fs.existsSync(siblingHallucinateAppDir)) {
      process.stdout.write(`\n▶ ${dashboardConsumerLabel}\n`);
      const outcome = runNpmScript('evidence:dashboard-consumer');
      gates.push({
        id: 'evidence-dashboard-consumer',
        label: dashboardConsumerLabel,
        status: outcome.ok ? 'passed' : 'failed',
        durationMs: outcome.durationMs,
        tail: outcome.ok ? [] : outcome.tail,
      });
      if (outcome.ok) {
        process.stdout.write(`  ✓ passed in ${formatDuration(outcome.durationMs)}\n`);
      } else {
        process.stdout.write(`  ✗ failed in ${formatDuration(outcome.durationMs)} (exit ${outcome.status})\n`);
        process.stdout.write(`${outcome.tail.join('\n')}\n`);
        stoppedEarly = 'evidence-dashboard-consumer';
      }
    } else {
      gates.push({
        id: 'evidence-dashboard-consumer',
        label: dashboardConsumerLabel,
        status: 'skipped',
        durationMs: 0,
        tail: [],
        skipReason: 'sibling hallucinate_app checkout not present (standalone swissknife checkout)',
      });
      process.stdout.write(
        `\n▶ ${dashboardConsumerLabel}\n  ⏭ skipped (sibling hallucinate_app checkout not present)\n`,
      );
    }
  }

  const finishedAt = new Date();
  const failed = gates.filter((gate) => gate.status === 'failed');
  const passed = gates.filter((gate) => gate.status === 'passed');
  const skipped = gates.filter((gate) => gate.status === 'skipped');
  const overallStatus = failed.length > 0 ? 'failed' : 'passed';

  const report = {
    schemaVersion: 1,
    generatedAt: finishedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    commitSha: gitCommitSha(),
    overallStatus,
    stoppedEarly,
    summary: {
      total: gates.length,
      passed: passed.length,
      failed: failed.length,
      skipped: skipped.length,
    },
    gates,
  };

  const jsonPath = abs(args.json);
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

  const mdLines = [
    '# Release Readiness Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Commit: ${report.commitSha ?? 'unknown'}`,
    `Overall status: ${overallStatus === 'passed' ? '✅ PASSED' : '❌ FAILED'}`,
    `Duration: ${formatDuration(report.durationMs)}`,
    '',
    '| Gate | Status | Duration |',
    '| --- | --- | --- |',
    ...gates.map((gate) => {
      const icon = gate.status === 'passed' ? '✅' : gate.status === 'failed' ? '❌' : '⏭️';
      return `| ${gate.label} | ${icon} ${gate.status} | ${formatDuration(gate.durationMs)} |`;
    }),
    '',
  ];
  if (failed.length > 0) {
    mdLines.push('## Failure detail', '');
    for (const gate of failed) {
      mdLines.push(`### ${gate.label}`, '', '```', ...gate.tail, '```', '');
    }
  }

  const mdPath = abs(args.report);
  fs.mkdirSync(path.dirname(mdPath), { recursive: true });
  fs.writeFileSync(mdPath, `${mdLines.join('\n')}\n`);

  process.stdout.write('\n' + '='.repeat(72) + '\n');
  process.stdout.write(
    `Release readiness gate: ${overallStatus === 'passed' ? 'PASSED' : 'FAILED'} ` +
      `(${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped)\n`,
  );
  process.stdout.write(`Report: ${path.relative(repoRoot, jsonPath)}, ${path.relative(repoRoot, mdPath)}\n`);
  process.stdout.write('='.repeat(72) + '\n');

  process.exit(overallStatus === 'passed' ? 0 : 1);
}

main();
