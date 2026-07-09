#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.resolve(repoRoot, 'test/browser/package-consumer-fixture');
const fixtureTmpRoot = path.resolve(fixtureRoot, '.tmp');

const REQUIRED_TARBALL_FILES = [
  'package.json',
  'web/src/swissknife-browser-core.ts',
  'web/src/adapters/browser-globals.ts',
  'src/platform/browser.ts',
  'src/ai/browser.ts',
  'src/models/browser.ts',
  'src/storage/browser.ts',
  'src/workers/browser.ts',
  'src/services/ipfs/browser.ts',
  'src/services/mcp/libp2p-browser-runtime.ts',
  'src/services/mcp/mcp-dashboard-browser-policy.ts',
  'src/components/browser/index.ts',
  'src/components/browser/BrowserRuntimeSummary.tsx',
  'src/hooks/browser/index.ts',
  'src/hooks/browser/useBrowserPlatformSnapshot.ts',
  'src/screens/browser/index.ts',
  'src/screens/browser/BrowserHomeScreen.tsx',
  'src/shared/constants/index.ts',
  'docs/browser-public-api.md',
  'scripts/audit-package-browser-exports.mjs',
];

const FORBIDDEN_FIXTURE_DEPENDENCIES = new Set([
  '@anthropic-ai/bedrock-sdk',
  '@anthropic-ai/claude-code',
  '@anthropic-ai/sdk',
  '@anthropic-ai/vertex-sdk',
  '@inkjs/ui',
  '@modelcontextprotocol/sdk',
  '@sentry/node',
  'child_process',
  'fs',
  'glob',
  'ink',
  'openai',
  'ora',
  'pyodide',
  'sharp',
  'spawn-rx',
]);

function rel(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return {
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    output,
  };
}

function assertCommand(label, command, args, options = {}) {
  process.stdout.write(`\n▶ ${label}\n`);
  const result = run(command, args, options);
  if (!result.ok) {
    process.stdout.write(result.output);
    throw new Error(`${label} failed with exit ${result.status ?? result.signal}`);
  }
  if (options.echo !== false && result.output.trim()) {
    process.stdout.write(result.output);
  }
  process.stdout.write(`✓ ${label}\n`);
  return result;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function copyFixtureFileTree(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(fixtureRoot, { withFileTypes: true })) {
    if (entry.name === '.tmp') continue;
    const source = path.join(fixtureRoot, entry.name);
    const target = path.join(targetDir, entry.name);
    fs.cpSync(source, target, { recursive: true });
  }
}

function validateFixtureManifest() {
  const manifestPath = path.join(fixtureRoot, 'package.json');
  const manifest = readJson(manifestPath);
  const dependencySections = [
    ['dependencies', manifest.dependencies ?? {}],
    ['devDependencies', manifest.devDependencies ?? {}],
    ['optionalDependencies', manifest.optionalDependencies ?? {}],
    ['peerDependencies', manifest.peerDependencies ?? {}],
  ];

  const findings = [];
  for (const [section, dependencies] of dependencySections) {
    for (const dependencyName of Object.keys(dependencies)) {
      if (FORBIDDEN_FIXTURE_DEPENDENCIES.has(dependencyName)) {
        findings.push(`${section}.${dependencyName}`);
      }
    }
  }

  if (findings.length > 0) {
    throw new Error(
      [
        'Browser package-consumer fixture declares host-only dependencies:',
        ...findings.map(item => `- ${item}`),
      ].join('\n'),
    );
  }
}

function parseNpmPackJson(stdout) {
  const text = stdout.trim();
  if (!text) throw new Error('npm pack produced no JSON output');
  const payload = JSON.parse(text);
  if (!Array.isArray(payload) || payload.length !== 1) {
    throw new Error(`Unexpected npm pack JSON payload: ${text}`);
  }
  return payload[0];
}

function validateTarballFiles(packInfo) {
  const files = new Set((packInfo.files ?? []).map(file => file.path));
  const missing = REQUIRED_TARBALL_FILES.filter(file => !files.has(file));
  if (missing.length > 0) {
    throw new Error(
      [
        'Packed swissknife tarball is missing browser package-consumer files:',
        ...missing.map(file => `- ${file}`),
        '',
        `Tarball: ${packInfo.filename}`,
      ].join('\n'),
    );
  }
}

function unpackTarball(tarballPath, packageDir) {
  fs.mkdirSync(packageDir, { recursive: true });
  assertCommand(
    'unpack packed swissknife package',
    'tar',
    ['-xzf', tarballPath, '-C', packageDir, '--strip-components=1'],
    { echo: false },
  );
}

function viteBin() {
  const candidate = path.resolve(repoRoot, 'node_modules/vite/bin/vite.js');
  if (!fs.existsSync(candidate)) {
    throw new Error(`Vite binary not found at ${rel(candidate)}. Run npm install in swissknife before this gate.`);
  }
  return candidate;
}

function validateBuiltConsumer(consumerDir) {
  const manifestPath = path.join(consumerDir, 'dist/.vite/manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Browser package consumer build did not produce ${rel(manifestPath)}`);
  }

  const distFiles = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile()) {
        distFiles.push(absolute);
      }
    }
  };
  walk(path.join(consumerDir, 'dist'));

  const forbiddenBuiltPatterns = [
    ['node filesystem builtin', /\bnode:fs\b|\bfrom\s*["']fs["']|\brequire\s*\(\s*["']fs["']\s*\)/],
    ['node child_process builtin', /\bnode:child_process\b|\bfrom\s*["']child_process["']|\brequire\s*\(\s*["']child_process["']\s*\)/],
    ['subprocess API', /(^|[^\w.])(?:spawn|spawnSync|exec|execFile|execFileSync|execSync)\s*\(/],
    ['native module loader', /(?:["'`][^"'`]+\.node["'`]|\bprocess\.binding\s*\(|\bnative-loader\b|\bloadNativeModule\b)/],
    ['Node process global shim', /\bprocess\s*:\s*\{|\bglobalThis\.process\b|\bprocess\.env\b/],
    ['Node Buffer global shim', /\bBuffer\s*:\s*\{|\bglobalThis\.Buffer\b|\bBuffer\.from\b/],
    ['Pyodide/Python runtime', /\b(?:pyodide|loadPyodide|runPython|runPythonAsync|micropip)\b/i],
    ['terminal UI package marker', /\b(?:@inkjs\/ui|from\s*["']ink["']|ink-testing-library|cli-table3|ora)\b/],
    ['host SDK package marker', /\b(?:@anthropic-ai\/bedrock-sdk|@anthropic-ai\/vertex-sdk|@anthropic-ai\/claude-code|@sentry\/node)\b/],
  ];

  const findings = [];
  for (const file of distFiles) {
    if (!/\.(?:js|mjs|html|css|json)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const [label, pattern] of forbiddenBuiltPatterns) {
      const match = pattern.exec(text);
      if (match) {
        findings.push({
          file: rel(file),
          label,
          token: match[0],
        });
      }
    }
  }

  if (findings.length > 0) {
    throw new Error(
      [
        'Browser package consumer built assets contain forbidden host/runtime leakage:',
        ...findings.map(finding => `- ${finding.file}: ${finding.label} (${JSON.stringify(finding.token)})`),
        '',
        'The Vite guard should normally include the import chain above; inspect the listed chunk if the token came from generated code.',
      ].join('\n'),
    );
  }
}

function main() {
  validateFixtureManifest();

  assertCommand(
    'audit package browser exports',
    process.execPath,
    ['scripts/audit-package-browser-exports.mjs', '--fail-on-host-leakage', '--report', 'docs/browser-public-api.md'],
  );

  fs.rmSync(fixtureTmpRoot, { recursive: true, force: true });
  fs.mkdirSync(fixtureTmpRoot, { recursive: true });
  const runRoot = fs.mkdtempSync(path.join(fixtureTmpRoot, 'run-'));
  const packDir = path.join(runRoot, 'pack');
  const consumerDir = path.join(runRoot, 'consumer');
  const packageDir = path.join(consumerDir, 'node_modules/swissknife');
  let keepRunRoot = false;

  try {
    fs.mkdirSync(packDir, { recursive: true });
    const pack = assertCommand(
      'npm pack swissknife browser package surface',
      'npm',
      ['pack', '--json', '--pack-destination', packDir],
      { echo: false },
    );
    const packInfo = parseNpmPackJson(pack.stdout);
    validateTarballFiles(packInfo);

    copyFixtureFileTree(consumerDir);
    unpackTarball(path.join(packDir, packInfo.filename), packageDir);

    assertCommand(
      'build browser-only package consumer fixture',
      process.execPath,
      [viteBin(), 'build', '--config', 'vite.config.mjs'],
      {
        cwd: consumerDir,
        env: {
          npm_config_audit: 'false',
          npm_config_fund: 'false',
          SWISSKNIFE_REPO_ROOT: repoRoot,
        },
      },
    );

    validateBuiltConsumer(consumerDir);
    process.stdout.write('\nBrowser package-consumer fixture passed.\n');
  } catch (error) {
    keepRunRoot = true;
    const detail = error instanceof Error ? error.message : String(error);
    process.stderr.write(`\nBrowser package-consumer fixture failed.\n${detail}\n`);
    process.stderr.write(`Failure artifacts kept at ${runRoot}\n`);
    process.exitCode = 1;
  } finally {
    if (!keepRunRoot) {
      fs.rmSync(runRoot, { recursive: true, force: true });
      try {
        if (fs.readdirSync(fixtureTmpRoot).length === 0) {
          fs.rmdirSync(fixtureTmpRoot);
        }
      } catch {
        // Leave diagnostics if cleanup races with another local run.
      }
    }
  }
}

main();
