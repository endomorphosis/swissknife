#!/usr/bin/env node
/**
 * SWR-044: phase-11 browser hardening release readiness gate.
 *
 * This gate is intentionally explicit about the release blockers added by the
 * browser-hardening phase: browser package export leakage, dependency
 * allowlist drift, WASM integrity metadata, deployment policy evidence, stale
 * browser smoke evidence, built bundle host leakage, default Pyodide exposure,
 * and stale libp2p evidence.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_REPORT_JSON = 'docs/release-readiness-report.json';
const DEFAULT_REPORT_MD = 'docs/release-readiness-report.md';
const DEFAULT_SMOKE_MAX_AGE_DAYS = 14;

const HOST_LEAKAGE_PATTERNS = [
  /\bfrom\s*["'](?:node:)?(?:fs|fs\/promises|child_process|worker_threads|net|tls|dgram|dns|readline|repl|tty|vm)["']/i,
  /\bimport\s*\(\s*["'](?:node:)?(?:fs|fs\/promises|child_process|worker_threads|net|tls|dgram|dns|readline|repl|tty|vm)["']\s*\)/i,
  /\brequire\s*\(\s*["'](?:node:)?(?:fs|fs\/promises|child_process|worker_threads|net|tls|dgram|dns|readline|repl|tty|vm)["']\s*\)/i,
  /\b(?:spawn|spawnSync|exec|execFile|execSync|execFileSync)\s*\(/,
  /\b(?:readFileSync|writeFileSync|createReadStream|createWriteStream|mkdirSync|readdirSync)\s*\(/,
  /\bprocess\.binding\s*\(/,
  /["'][^"']+\.node["']/i,
  /\bmcp-remote-deontic-engine\b/i,
];

const FORBIDDEN_EXPORT_SEGMENTS = [
  '/host',
  '/cli',
  '/terminal',
  '/workers/host',
  '/storage/host',
  '/node/',
  '/scripts/',
  '/test/',
  '/tests/',
  '/archived/',
];

const REQUIRED_BROWSER_ALLOWLIST_PACKAGES = [
  '@anthropic-ai/sdk',
  '@chainsafe/libp2p-gossipsub',
  '@chainsafe/libp2p-noise',
  '@chainsafe/libp2p-yamux',
  '@libp2p/circuit-relay-v2',
  '@libp2p/identify',
  '@libp2p/webrtc',
  '@libp2p/websockets',
  '@modelcontextprotocol/sdk',
  '@multiformats/multiaddr',
  'assert',
  'buffer',
  'constants-browserify',
  'crypto-browserify',
  'ffjavascript',
  'libp2p',
  'openai',
  'os-browserify',
  'path-browserify',
  'process',
  'pyodide',
  'querystring-es3',
  'react',
  'react-dom',
  'snarkjs',
  'stream-browserify',
  'url',
  'util',
  'z3-solver',
];

const NODE_BUILTIN_DENYLIST_PACKAGES = [
  'child_process',
  'fs',
  'fs/promises',
  'worker_threads',
  'net',
  'tls',
  'dgram',
  'dns',
  'readline',
  'repl',
  'tty',
  'vm',
];

const REQUIRED_SMOKE_RECEIPTS = [
  {
    file: 'test-results/browser-smoke-matrix/browser-smoke-desktop-chromium-startup.json',
    project: 'browser-smoke-desktop-chromium',
    evidence: 'desktop_or_mobile_startup_storage_worker',
  },
  {
    file: 'test-results/browser-smoke-matrix/browser-smoke-mobile-pixel-5-startup.json',
    project: 'browser-smoke-mobile-pixel-5',
    evidence: 'desktop_or_mobile_startup_storage_worker',
  },
  {
    file: 'test-results/browser-smoke-matrix/browser-smoke-desktop-chromium-mcp-dashboard.json',
    project: 'browser-smoke-desktop-chromium',
    evidence: 'mcp_dashboard_lazy_loading_browser_safe',
  },
  {
    file: 'test-results/browser-smoke-matrix/browser-smoke-mobile-pixel-5-mcp-dashboard.json',
    project: 'browser-smoke-mobile-pixel-5',
    evidence: 'mcp_dashboard_lazy_loading_browser_safe',
  },
  {
    file: 'test-results/browser-smoke-matrix/browser-smoke-desktop-chromium-libp2p-capable.json',
    project: 'browser-smoke-desktop-chromium',
    evidence: 'libp2p_capable_capability_state',
  },
  {
    file: 'test-results/browser-smoke-matrix/browser-smoke-mobile-pixel-5-libp2p-capable.json',
    project: 'browser-smoke-mobile-pixel-5',
    evidence: 'libp2p_capable_capability_state',
  },
  {
    file: 'test-results/browser-smoke-matrix/browser-smoke-constrained-chromium-startup.json',
    project: 'browser-smoke-constrained-chromium',
    evidence: 'desktop_or_mobile_startup_storage_worker',
  },
  {
    file: 'test-results/browser-smoke-matrix/browser-smoke-constrained-chromium-mcp-dashboard.json',
    project: 'browser-smoke-constrained-chromium',
    evidence: 'mcp_dashboard_lazy_loading_browser_safe',
  },
  {
    file: 'test-results/browser-smoke-matrix/browser-smoke-constrained-chromium-libp2p-constrained.json',
    project: 'browser-smoke-constrained-chromium',
    evidence: 'libp2p_constrained_capability_state',
  },
];

function abs(relativePath) {
  return path.resolve(repoRoot, relativePath);
}

function rel(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function parseArgs(argv) {
  const args = {
    json: DEFAULT_REPORT_JSON,
    report: DEFAULT_REPORT_MD,
    smokeMaxAgeDays: Number(process.env.SWISSKNIFE_BROWSER_SMOKE_MAX_AGE_DAYS || DEFAULT_SMOKE_MAX_AGE_DAYS),
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      args.json = argv[++i];
      if (!args.json) throw new Error('--json requires an output path');
    } else if (arg === '--report') {
      args.report = argv[++i];
      if (!args.report) throw new Error('--report requires an output path');
    } else if (arg === '--smoke-max-age-days') {
      args.smokeMaxAgeDays = Number(argv[++i]);
      if (!Number.isFinite(args.smokeMaxAgeDays) || args.smokeMaxAgeDays <= 0) {
        throw new Error('--smoke-max-age-days requires a positive number');
      }
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
    '  --json <path>                 Write machine-readable readiness report.',
    '  --report <path>               Write Markdown readiness report.',
    '  --smoke-max-age-days <days>   Maximum age for SWR-043 browser smoke receipts.',
    '  --help, -h                    Show this help text.',
  ].join('\n');
}

function readText(relativePath) {
  return fs.readFileSync(abs(relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function exists(relativePath) {
  return fs.existsSync(abs(relativePath));
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function toPosixPath(value) {
  return String(value).replace(/\\/g, '/');
}

function flattenPackageExportTargets(value, trail = []) {
  const targets = [];
  if (typeof value === 'string') {
    targets.push({ conditions: trail, target: value });
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      targets.push(...flattenPackageExportTargets(entry, [...trail, `[${index}]`]));
    });
  } else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      targets.push(...flattenPackageExportTargets(nested, [...trail, key]));
    }
  }
  return targets;
}

function isBrowserRelevantExportTarget(target) {
  const normalized = toPosixPath(target.target);
  const conditions = target.conditions.map(String);
  if (conditions.some((condition) => ['browser', 'import', 'default'].includes(condition))) return true;
  if (normalized.includes('/browser') || normalized.includes('browser.')) return true;
  if (conditions.length === 0 && normalized.startsWith('./')) return true;
  return false;
}

function exportedSourceFile(target) {
  const withoutPrefix = target.replace(/^\.\//, '');
  if (!withoutPrefix || withoutPrefix.includes('*')) return null;
  const candidate = abs(withoutPrefix);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return withoutPrefix;
  return null;
}

function stripCodeComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function scanTextForHostLeakage(relativePath) {
  const text = stripCodeComments(readText(relativePath));
  const findings = [];
  for (const pattern of HOST_LEAKAGE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      findings.push(`${relativePath}: matched ${pattern} (${match[0]})`);
    }
  }
  return findings;
}

function gatePackageBrowserExports() {
  const pkg = readJson('package.json');
  const targets = [];
  if (pkg.exports !== undefined) {
    for (const [specifier, value] of Object.entries(typeof pkg.exports === 'object' ? pkg.exports : { '.': pkg.exports })) {
      for (const target of flattenPackageExportTargets(value, [specifier])) {
        targets.push(target);
      }
    }
  }
  if (typeof pkg.browser === 'string') {
    targets.push({ conditions: ['browser'], target: pkg.browser });
  } else if (pkg.browser && typeof pkg.browser === 'object') {
    for (const [source, replacement] of Object.entries(pkg.browser)) {
      if (replacement && typeof replacement === 'string') {
        targets.push({ conditions: ['browser', source], target: replacement });
      }
    }
  }

  const browserTargets = targets.filter(isBrowserRelevantExportTarget);
  const failures = [];
  const checkedFiles = new Set();

  for (const entry of browserTargets) {
    const normalized = toPosixPath(entry.target);
    const lower = normalized.toLowerCase();
    if (FORBIDDEN_EXPORT_SEGMENTS.some((segment) => lower.includes(segment))) {
      failures.push(`browser export target ${normalized} uses a host-only path segment`);
    }
    if (/\.(node|cjs)$/i.test(normalized)) {
      failures.push(`browser export target ${normalized} points at a native/CommonJS host artifact`);
    }
    const sourceFile = exportedSourceFile(normalized);
    if (sourceFile && !checkedFiles.has(sourceFile)) {
      checkedFiles.add(sourceFile);
      failures.push(...scanTextForHostLeakage(sourceFile));
    }
  }

  return {
    detail: [
      `browser-relevant package targets: ${browserTargets.length}`,
      checkedFiles.size ? `scanned files: ${Array.from(checkedFiles).join(', ')}` : 'scanned files: none',
      pkg.exports === undefined ? 'package exports: not declared (bin-only package surface)' : 'package exports: declared',
    ],
    failures,
  };
}

function dependencyDeclarations(pkg) {
  return {
    ...(pkg.dependencies ?? {}),
    ...(pkg.optionalDependencies ?? {}),
    ...(pkg.peerDependencies ?? {}),
  };
}

function dependencyAllowlist(pkg) {
  const groups = pkg.swissknife?.dependencyOwnership ?? {};
  const allowed = new Map();
  for (const [groupId, group] of Object.entries(groups)) {
    for (const packageName of group?.packages ?? []) {
      allowed.set(packageName, {
        groupId,
        owner: group.owner ?? groupId,
        policy: group.policy ?? '',
      });
    }
  }
  return allowed;
}

function gateBrowserDependencyAllowlist() {
  const pkg = readJson('package.json');
  const declared = dependencyDeclarations(pkg);
  const allowed = dependencyAllowlist(pkg);
  const failures = [];

  for (const packageName of REQUIRED_BROWSER_ALLOWLIST_PACKAGES) {
    if (declared[packageName] && !allowed.has(packageName)) {
      failures.push(`browser dependency ${packageName} is declared but missing from package.json swissknife.dependencyOwnership`);
    }
  }

  for (const packageName of NODE_BUILTIN_DENYLIST_PACKAGES) {
    if (declared[packageName]) {
      failures.push(`Node builtin package name ${packageName} must not be declared for browser builds`);
    }
  }

  for (const packageName of allowed.keys()) {
    if (NODE_BUILTIN_DENYLIST_PACKAGES.includes(packageName)) {
      failures.push(`dependency allowlist includes forbidden Node builtin ${packageName}`);
    }
  }

  return {
    detail: [
      `allowlisted browser packages: ${allowed.size}`,
      `declared browser-critical packages checked: ${REQUIRED_BROWSER_ALLOWLIST_PACKAGES.filter((name) => declared[name]).length}`,
    ],
    failures,
  };
}

function gateWasmIntegrityMetadata() {
  const failures = [];
  const checkedArtifacts = [];
  const manifestDir = 'src/services/zkp/artifacts/groth16/deontic_discharge_v1';
  const manifestPath = `${manifestDir}/manifest.json`;

  if (!exists(manifestPath)) {
    failures.push(`missing ${manifestPath}`);
  } else {
    const manifest = readJson(manifestPath);
    for (const [fileName, metadata] of Object.entries(manifest.artifacts ?? {})) {
      const artifactPath = `${manifestDir}/${fileName}`;
      checkedArtifacts.push(artifactPath);
      if (!exists(artifactPath)) {
        failures.push(`manifest references missing artifact ${artifactPath}`);
        continue;
      }
      const buffer = fs.readFileSync(abs(artifactPath));
      if (!Number.isInteger(metadata.bytes) || metadata.bytes !== buffer.byteLength) {
        failures.push(`${artifactPath} byte count mismatch: manifest=${metadata.bytes}, actual=${buffer.byteLength}`);
      }
      if (typeof metadata.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(metadata.sha256)) {
        failures.push(`${artifactPath} is missing a sha256 integrity digest`);
      } else {
        const actual = sha256(buffer);
        if (actual !== metadata.sha256) {
          failures.push(`${artifactPath} sha256 mismatch: manifest=${metadata.sha256}, actual=${actual}`);
        }
      }
    }
  }

  const schnorrPath = 'src/services/zkp/artifacts/schnorr-field.wasm.b64';
  const schnorrSource = 'src/services/zkp-browser-schnorr.ts';
  if (!exists(schnorrPath)) {
    failures.push(`missing ${schnorrPath}`);
  } else {
    checkedArtifacts.push(schnorrPath);
    const raw = readText(schnorrPath).trim();
    if (!raw) {
      failures.push(`${schnorrPath} is empty`);
    } else {
      const decoded = Buffer.from(raw, 'base64');
      if (decoded.byteLength === 0 || decoded.slice(0, 4).toString('hex') !== '0061736d') {
        failures.push(`${schnorrPath} does not decode to a WebAssembly module`);
      }
    }
  }
  if (!exists(schnorrSource)) {
    failures.push(`missing ${schnorrSource}`);
  } else {
    const source = readText(schnorrSource);
    if (!source.includes('wasmArtifactSha256') || !source.includes('sha256Hex(BROWSER_SCHNORR_WASM_BYTES)')) {
      failures.push(`${schnorrSource} does not publish Schnorr WASM sha256 metadata in proof payloads`);
    }
  }

  const policyDocs = ['docs/browser-zkp-artifacts.md', 'docs/browser-wasm-asset-policy.md'].filter(exists);
  if (policyDocs.length === 0) {
    failures.push('missing browser WASM policy evidence document');
  } else {
    const policyText = policyDocs.map(readText).join('\n');
    for (const requiredTerm of ['SHA-256', 'integrity', 'COOP', 'COEP', 'CSP']) {
      if (!policyText.toLowerCase().includes(requiredTerm.toLowerCase())) {
        failures.push(`browser WASM policy evidence is missing required term: ${requiredTerm}`);
      }
    }
  }

  return {
    detail: [`checked artifacts: ${checkedArtifacts.length}`, `policy docs: ${policyDocs.join(', ') || 'none'}`],
    failures,
  };
}

function gateDeploymentPolicyEvidence() {
  const failures = [];
  const requiredFiles = ['docs/browser-deployment-policy.md', 'vite.web.config.ts', 'web/index.html', 'dist/_headers'];
  for (const file of requiredFiles) {
    if (!exists(file)) failures.push(`missing deployment policy evidence file: ${file}`);
  }
  if (exists('docs/browser-deployment-policy.md')) {
    const doc = readText('docs/browser-deployment-policy.md').toLowerCase();
    for (const term of ['content-security-policy', 'worker-src', 'storage', 'offline', 'opfs', 'indexeddb', 'cache storage', 'coop', 'coep']) {
      if (!doc.includes(term)) failures.push(`docs/browser-deployment-policy.md is missing deployment requirement: ${term}`);
    }
  }
  if (exists('dist/_headers')) {
    const headers = readText('dist/_headers');
    for (const term of ['Content-Security-Policy', 'worker-src', "object-src 'none'", "frame-ancestors 'none'"]) {
      if (!headers.includes(term)) failures.push(`dist/_headers is missing ${term}`);
    }
  }
  if (exists('vite.web.config.ts')) {
    const vite = readText('vite.web.config.ts');
    for (const term of ['swissknifeBrowserImportGuardPlugin', 'node:fs', 'node:child_process', 'worker-src']) {
      if (!vite.includes(term) && term !== 'worker-src') failures.push(`vite.web.config.ts is missing ${term}`);
    }
  }

  return {
    detail: [`required evidence files: ${requiredFiles.length}`, exists('dist/service-worker.js') ? 'service worker: present' : 'service worker: absent'],
    failures,
  };
}

function gateBrowserSmokeEvidence(args) {
  const failures = [];
  const now = Date.now();
  const maxAgeMs = args.smokeMaxAgeDays * 24 * 60 * 60 * 1000;
  const captured = [];

  for (const expected of REQUIRED_SMOKE_RECEIPTS) {
    if (!exists(expected.file)) {
      failures.push(`missing browser smoke receipt: ${expected.file}`);
      continue;
    }
    const receipt = readJson(expected.file);
    captured.push(receipt.capturedAt);
    if (receipt.schema !== 'swr_043_browser_smoke_matrix_receipt_v1') {
      failures.push(`${expected.file} has unexpected schema ${receipt.schema}`);
    }
    if (receipt.task_id !== 'SWR-043') {
      failures.push(`${expected.file} has unexpected task_id ${receipt.task_id}`);
    }
    if (receipt.project !== expected.project) {
      failures.push(`${expected.file} project mismatch: expected ${expected.project}, got ${receipt.project}`);
    }
    if (receipt.evidence !== expected.evidence) {
      failures.push(`${expected.file} evidence mismatch: expected ${expected.evidence}, got ${receipt.evidence}`);
    }
    const capturedAt = Date.parse(receipt.capturedAt ?? '');
    if (!Number.isFinite(capturedAt)) {
      failures.push(`${expected.file} has invalid capturedAt`);
    } else if (now - capturedAt > maxAgeMs) {
      failures.push(`${expected.file} is stale: capturedAt=${receipt.capturedAt}, maxAgeDays=${args.smokeMaxAgeDays}`);
    }
    if (Array.isArray(receipt.hostLeakageEvents) && receipt.hostLeakageEvents.length > 0) {
      failures.push(`${expected.file} recorded host leakage events: ${receipt.hostLeakageEvents.join('; ')}`);
    }
    const serialized = JSON.stringify(receipt);
    if (HOST_LEAKAGE_PATTERNS.some((pattern) => pattern.test(serialized))) {
      failures.push(`${expected.file} contains host leakage tokens`);
    }
    if (expected.evidence === 'desktop_or_mobile_startup_storage_worker') {
      if (!receipt.browserCapabilities?.indexedDB || !receipt.browserCapabilities?.cacheStorage || !receipt.browserCapabilities?.worker) {
        failures.push(`${expected.file} does not prove IndexedDB, Cache Storage, and Worker availability`);
      }
    }
    if (expected.evidence === 'libp2p_capable_capability_state') {
      if (receipt.initStatus !== 'started' || !Array.isArray(receipt.gaps) || receipt.gaps.length !== 0) {
        failures.push(`${expected.file} does not prove libp2p-capable startup with zero gaps`);
      }
    }
    if (expected.evidence === 'libp2p_constrained_capability_state') {
      if (!Array.isArray(receipt.gaps) || receipt.gaps.length === 0) {
        failures.push(`${expected.file} does not prove constrained libp2p capability gaps`);
      }
    }
  }

  if (!exists('test-results/browser-smoke-matrix/results.json')) {
    failures.push('missing Playwright browser smoke matrix results.json');
  } else {
    const results = readJson('test-results/browser-smoke-matrix/results.json');
    if (results?.stats?.unexpected > 0) {
      failures.push(`browser smoke matrix had ${results.stats.unexpected} unexpected test failures`);
    }
  }

  return {
    detail: [
      `required receipts: ${REQUIRED_SMOKE_RECEIPTS.length}`,
      `max age days: ${args.smokeMaxAgeDays}`,
      `capturedAt range: ${captured.filter(Boolean).sort().at(0) ?? 'none'} .. ${captured.filter(Boolean).sort().at(-1) ?? 'none'}`,
    ],
    failures,
  };
}

function runCommand(command, commandArgs) {
  const startedAt = Date.now();
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return {
    ok: result.status === 0,
    status: result.status,
    durationMs: Date.now() - startedAt,
    tail: output ? output.split('\n').filter(Boolean).slice(-60) : [],
  };
}

function gateBundleHostLeakageAndPyodide() {
  if (!exists('dist')) {
    return {
      detail: ['dist: missing'],
      failures: ['missing built web dist; run npm run build:web before release readiness'],
    };
  }
  const outcome = runCommand('node', [
    'scripts/audit-web-bundle.mjs',
    '--dist',
    'dist',
    '--fail-on-host-leakage',
    '--fail-on-default-pyodide',
    '--no-fail-on-budget',
  ]);
  return {
    detail: outcome.tail,
    failures: outcome.ok ? [] : [`audit-web-bundle failed with exit ${outcome.status}`, ...outcome.tail],
    durationMs: outcome.durationMs,
  };
}

function gateLibp2pEvidenceFreshness() {
  const outcome = runCommand('node', [
    'scripts/audit-release-evidence-freshness.mjs',
    '--fail-on-stale',
    '--json',
    'docs/release-evidence-freshness.json',
    '--report',
    'docs/release-evidence-freshness.md',
  ]);
  return {
    detail: outcome.tail,
    failures: outcome.ok ? [] : [`audit-release-evidence-freshness failed with exit ${outcome.status}`, ...outcome.tail],
    durationMs: outcome.durationMs,
  };
}

function gitCommitSha() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function formatDuration(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function runGate(id, label, fn) {
  const startedAt = Date.now();
  process.stdout.write(`\n> ${label}\n`);
  try {
    const outcome = fn();
    const durationMs = outcome.durationMs ?? (Date.now() - startedAt);
    const status = outcome.failures.length === 0 ? 'passed' : 'failed';
    process.stdout.write(`  ${status === 'passed' ? 'PASS' : 'FAIL'} in ${formatDuration(durationMs)}\n`);
    if (outcome.failures.length > 0) {
      process.stdout.write(`${outcome.failures.join('\n')}\n`);
    }
    return {
      id,
      label,
      status,
      durationMs,
      detail: outcome.detail ?? [],
      failures: outcome.failures,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stdout.write(`  FAIL in ${formatDuration(durationMs)}\n${message}\n`);
    return {
      id,
      label,
      status: 'failed',
      durationMs,
      detail: [],
      failures: [message],
    };
  }
}

function writeReports(args, report) {
  const jsonPath = abs(args.json);
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const mdLines = [
    '# Release Readiness Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Commit: ${report.commitSha ?? 'unknown'}`,
    `Overall status: ${report.overallStatus.toUpperCase()}`,
    `Duration: ${formatDuration(report.durationMs)}`,
    '',
    '| Gate | Status | Duration |',
    '| --- | --- | --- |',
    ...report.gates.map((gate) => `| ${gate.label} | ${gate.status.toUpperCase()} | ${formatDuration(gate.durationMs)} |`),
    '',
  ];

  for (const gate of report.gates) {
    mdLines.push(`## ${gate.label}`, '');
    if (gate.detail.length > 0) {
      mdLines.push('Detail:', '');
      for (const line of gate.detail) mdLines.push(`- ${String(line).replace(/\n/g, '<br>')}`);
      mdLines.push('');
    }
    if (gate.failures.length > 0) {
      mdLines.push('Failures:', '');
      for (const failure of gate.failures) mdLines.push(`- ${String(failure).replace(/\n/g, '<br>')}`);
      mdLines.push('');
    }
  }

  const mdPath = abs(args.report);
  fs.mkdirSync(path.dirname(mdPath), { recursive: true });
  fs.writeFileSync(mdPath, `${mdLines.join('\n')}\n`, 'utf8');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }

  const startedAt = new Date();
  const gates = [
    runGate('package-browser-exports', 'Package export browser leakage', gatePackageBrowserExports),
    runGate('browser-dependency-allowlist', 'Browser dependency allowlist drift', gateBrowserDependencyAllowlist),
    runGate('browser-wasm-integrity', 'Browser WASM integrity metadata', gateWasmIntegrityMetadata),
    runGate('browser-deployment-policy', 'Browser deployment policy evidence', gateDeploymentPolicyEvidence),
    runGate('browser-smoke-evidence', 'Browser smoke evidence freshness', () => gateBrowserSmokeEvidence(args)),
    runGate('bundle-host-pyodide', 'Built bundle host leakage and default Pyodide', gateBundleHostLeakageAndPyodide),
    runGate('libp2p-evidence-freshness', 'Browser libp2p evidence freshness', gateLibp2pEvidenceFreshness),
  ];

  const finishedAt = new Date();
  const failed = gates.filter((gate) => gate.status === 'failed');
  const report = {
    schemaVersion: 2,
    taskId: 'SWR-044',
    generatedAt: finishedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    commitSha: gitCommitSha(),
    overallStatus: failed.length === 0 ? 'passed' : 'failed',
    summary: {
      total: gates.length,
      passed: gates.length - failed.length,
      failed: failed.length,
    },
    gates,
  };

  writeReports(args, report);

  process.stdout.write('\n' + '='.repeat(72) + '\n');
  process.stdout.write(`Release readiness: ${report.overallStatus.toUpperCase()} (${report.summary.passed} passed, ${report.summary.failed} failed)\n`);
  process.stdout.write(`Report: ${rel(abs(args.json))}, ${rel(abs(args.report))}\n`);
  process.stdout.write('='.repeat(72) + '\n');

  process.exit(report.overallStatus === 'passed' ? 0 : 1);
}

main();
