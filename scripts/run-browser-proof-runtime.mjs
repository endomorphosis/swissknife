#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(scriptPath, '..', '..');
const runtimeConfig = 'build-tools/configs/vitest.browser-proof-runtime.config.ts';
const runtimeTest = 'test/browser-proof-runtime/browser-theorem-runtime.test.ts';
const observedResult = 'test-results/browser-proof-runtime/observed-three-engine-runtime.json';
const requiredEngines = ['chromium', 'firefox', 'webkit'];
const outputPath = resolve(projectRoot, observedResult);

rmSync(outputPath, { force: true });

const vitestCli = resolve(projectRoot, 'node_modules/vitest/vitest.mjs');
if (!existsSync(vitestCli)) {
  throw new Error('Vitest is not installed; run npm install before browser proof validation.');
}

const result = spawnSync(process.execPath, [vitestCli, 'run', '--config', runtimeConfig], {
  cwd: projectRoot,
  encoding: 'utf8',
  env: process.env,
});
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const observed = parseSuccessfulRun(output);
mkdirSync(resolve(projectRoot, 'test-results/browser-proof-runtime'), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(observed, null, 2)}\n`);
console.log(`Browser proof runtime receipt written to ${observedResult}`);

function parseSuccessfulRun(output) {
  const cleanOutput = stripAnsi(output);
  const engineRows = new Map();
  for (const match of cleanOutput.matchAll(/[✓✔]\s+\|([^|]+)\|\s+.+?\((\d+)\s+tests?\)/g)) {
    engineRows.set(match[1].trim(), Number(match[2]));
  }

  const summaryMatches = [...cleanOutput.matchAll(/Tests\s+(\d+)\s+passed\s+\((\d+)\)/g)];
  const summary = summaryMatches.at(-1);
  if (!summary) {
    throw new Error('Vitest completed without a passing test-count summary; refusing to certify browser proof evidence.');
  }

  const assertionCount = Number(summary[2]);
  const missingEngines = requiredEngines.filter(engine => !engineRows.has(engine));
  const unexpectedEngines = [...engineRows.keys()].filter(engine => !requiredEngines.includes(engine));
  const assertionsPerEngine = requiredEngines.map(engine => engineRows.get(engine));
  if (missingEngines.length > 0 || unexpectedEngines.length > 0 || assertionsPerEngine.some(count => !Number.isInteger(count))) {
    throw new Error(`Vitest proof run did not report exactly the required engines: ${JSON.stringify({ missingEngines, unexpectedEngines, engineRows: Object.fromEntries(engineRows) })}`);
  }
  if (new Set(assertionsPerEngine).size !== 1 || assertionCount !== assertionsPerEngine.reduce((total, count) => total + count, 0)) {
    throw new Error(`Vitest proof assertion totals are inconsistent: ${JSON.stringify({ assertionCount, assertionsPerEngine })}`);
  }

  return {
    schema: 'swissknife.browser-proof-runtime-observed-result.v1',
    command: 'npm run test:browser-proof-runtime',
    outcome: 'passed',
    generated_at: new Date().toISOString(),
    assertion_count: assertionCount,
    assertions_per_engine: assertionsPerEngine[0],
    engines: requiredEngines.map(name => ({ name, outcome: 'passed', assertion_count: engineRows.get(name) })),
    source_fingerprints: {
      runtime_config_sha256: sha256File(runtimeConfig),
      runtime_test_sha256: sha256File(runtimeTest),
      runner_sha256: sha256File('scripts/run-browser-proof-runtime.mjs'),
      vitest_output_sha256: createHash('sha256').update(stripAnsi(output)).digest('hex'),
    },
  };
}

function sha256File(relativePath) {
  return createHash('sha256').update(readFileSync(resolve(projectRoot, relativePath))).digest('hex');
}

function stripAnsi(value) {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}
