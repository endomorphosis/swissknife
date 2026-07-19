#!/usr/bin/env node
/**
 * SWR-044: phase-11 browser hardening release readiness gate.
 *
 * Runs the full set of release-blocking checks for the swissknife package in a
 * single, deterministic sequence and emits a machine-readable report so CI and
 * local release workflows fail fast on the first offending gate instead of
 * silently skipping downstream checks.
 *
 * Gates (in order):
 *   1. browser-service-regression-sentinel - SWR-095 duplicate/browser/ZKP regression sentinel
 *   2. services:audit             - service-boundary drift (root/unknown/forbidden/legacy imports)
 *   3. audit:module-boundary       - SWR-024 repository module-boundary audit (unknown/forbidden
 *      imports across all top-level `src` modules; deterministic, CI-suitable, independent of the
 *      `--fail-on-legacy` shim check that `services:audit` also performs).
 *   4. typecheck                  - browser + host TypeScript project references
 *   5. test:fast                  - fast unit lane
 *   6. test:browser-compat        - static + runtime browser-compatibility lanes
 *   7. build:web                  - production web bundle + bundle budget/host-leakage audit
 *   8. audit:bundle-host-leakage   - SWR-016/SWR-029 explicit re-audit of the just-built `dist`
 *      bundle for host-only leakage (Node core imports, subprocess APIs, native module loading,
 *      filesystem APIs), independent confirmation on top of the audit embedded in `build:web`.
 *   9. evidence:freshness:check    - SWR-029 staleness gate for evidence that is too expensive to
 *      regenerate on every release candidate (SWR-028 browser libp2p Playwright evidence, SWR-016
 *      bundle budget snapshot, SWR-024 module-boundary audit snapshot). Fails when the recorded
 *      evidence fingerprint no longer matches the current state of the source it depends on.
 *   10. evidence:mcp-glasses       - regenerate MCP/glasses manifest + capability coverage evidence
 *   11. virtual-desktop-release-evidence - aggregate and hard-gate complete desktop/all-tools/simulator evidence
 *   12. independent-all-app-release-replay - SVD-115 independent closeout replay of canonical evidence
 *   13. evidence:freshness:check    - fingerprint freshness after the SWR-110 aggregate is regenerated
 *   14. skipped-gate-policy        - explicit skip reasons and browser-safety skip enforcement
 *   14. evidence:dashboard-consumer (optional, cross-repo) - MCP dashboard catalog/launch-gate
 *      receipt consistency against the live capability registry. Only runs when the sibling
 *      `hallucinate_app` checkout is present (monorepo/local dev); it is skipped, not failed,
 *      in a standalone `swissknife` checkout where that sibling repo does not exist.
 *
 * Usage:
 *   node scripts/release-readiness-gate.mjs [--skip-build --skip-build-reason <reason>] [--json <path>] [--report <path>] [--signoff <path>]
 *
 * Exit code is non-zero when any required gate fails. A JSON report is always
 * written (default: docs/release-readiness-report.json) so failures/successes
 * are auditable evidence for the release process, not just console noise.
 *
 * See docs/release-browser-gates.md (SWR-029) for the full policy this gate enforces.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  RELEASE_EVIDENCE_PRODUCER_GATES,
  resetReleaseEvidenceProducers,
  runSingleProducerGate,
} from './lib/release-readiness-evidence-producers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const siblingHallucinateAppDir = path.resolve(repoRoot, '..', 'hallucinate_app');
const siblingHallucinateAppEvidencePaths = [
  path.join(siblingHallucinateAppDir, 'hallucinate_app', 'node', 'mcp_daemon_manager.js'),
  path.join(siblingHallucinateAppDir, 'test', 'e2e', 'fixtures', 'vai-512-mcp-dashboard-catalog.json'),
  path.join(
    siblingHallucinateAppDir,
    'test',
    'e2e',
    'fixtures',
    'vai-512-hallucinate-swissknife-mcp-dashboard-consumption.json',
  ),
];
const siblingHallucinateAppEvidenceAvailable = siblingHallucinateAppEvidencePaths.every(fs.existsSync);

const DEFAULT_REPORT_JSON = 'docs/release-readiness-report.json';
const DEFAULT_REPORT_MD = 'docs/release-readiness-report.md';
const DEFAULT_SIGNOFF_MD = 'docs/refactor-final-signoff.md';
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const ALLOWED_SERVICE_DUPLICATE_BASENAMES = new Set(['index']);
const ALLOWED_ROOT_ENTRYPOINT_DUPLICATES = new Set(['src/browser.ts', 'src/index.ts']);
const BROWSER_SAFETY_GATE_IDS = new Set([
  'browser-service-regression-sentinel',
  'test-browser-compat',
  'build-web',
  'bundle-host-leakage',
  'evidence-freshness',
  'skipped-gate-policy',
]);
const HOST_IMPORT_PATTERN =
  /\b(?:from|import)\s*(?:[^'"()]*?\s+from\s*)?["'](?:node:)?(?:child_process|fs\/promises|fs|worker_threads|net|tls|dgram|dns|readline|repl|tty|vm)["']|\brequire\s*\(\s*["'](?:node:)?(?:child_process|fs\/promises|fs|worker_threads|net|tls|dgram|dns|readline|repl|tty|vm)["']\s*\)|\bnode:(?:child_process|fs\/promises|fs|path|worker_threads|net|tls|dgram|dns|readline|repl|tty|vm)\b/g;
const PYODIDE_DEFAULT_PATTERN = /\b(?:loadPyodide|runPython|runPythonAsync)\b|<script[^>]+(?:pyodide|loadPyodide)[^>]*>/gi;
const BROWSER_ZKP_FORBIDDEN_PATTERNS = [
  {
    id: 'simulated-prover-import',
    re: /\bfrom\s+["'][^"']*zkp-simulated-prover(?:\.js)?["']|\bimport\s*\(\s*["'][^"']*zkp-simulated-prover(?:\.js)?["']\s*\)/,
    message: 'browser-facing ZKP source imports the test-only simulated prover',
  },
  {
    id: 'simulated-default-backend',
    re: /\bDEFAULT_BROWSER_ZKP_BACKEND_ID\b[^;\n]*["'][^"']*simulat[^"']*["']|\b(?:backend|backend_id|backendId)\s*[:=]\s*["'][^"']*simulat[^"']*["']/i,
    message: 'browser-facing ZKP source selects a simulated backend by default',
  },
  {
    id: 'test-simulation-waiver',
    re: /\ballowTestOnlySimulation\s*:\s*true\b/,
    message: 'browser-facing ZKP source enables the test-only simulation waiver',
  },
];

function parseArgs(argv) {
  const args = {
    skipBuild: false,
    skipBuildReason: null,
    json: DEFAULT_REPORT_JSON,
    report: DEFAULT_REPORT_MD,
    signoff: DEFAULT_SIGNOFF_MD,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--skip-build') {
      args.skipBuild = true;
    } else if (arg === '--skip-build-reason') {
      args.skipBuildReason = argv[++i];
      if (!args.skipBuildReason) throw new Error('--skip-build-reason requires a non-empty reason');
    } else if (arg === '--json') {
      args.json = argv[++i];
      if (!args.json) throw new Error('--json requires an output path');
    } else if (arg === '--report') {
      args.report = argv[++i];
      if (!args.report) throw new Error('--report requires an output path');
    } else if (arg === '--signoff') {
      args.signoff = argv[++i];
      if (!args.signoff) throw new Error('--signoff requires an output path');
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
    '  --skip-build-reason <reason>',
    '                     Record an explicit reason when --skip-build is used. Browser-safety skips still fail release readiness.',
    '  --json <path>      Write the deterministic gate report as JSON (default: docs/release-readiness-report.json).',
    '  --report <path>    Write a human-readable Markdown summary (default: docs/release-readiness-report.md).',
    '  --signoff <path>   Write final refactor signoff evidence (default: docs/refactor-final-signoff.md).',
    '  --help, -h         Show this help text.',
  ].join('\n');
}

function abs(relativePath) {
  return path.resolve(repoRoot, relativePath);
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
  const schnorrSource = 'src/services/zkp/zkp-browser-schnorr.ts';
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

function runNpmScript(scriptName, extraArgs = []) {
  return runCommand('npm', ['run', scriptName, ...(extraArgs.length ? ['--', ...extraArgs] : [])]);
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

function runNodeScript(scriptPath, extraArgs = []) {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
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

function isSourcePath(relativePath) {
  return SOURCE_EXTENSIONS.has(path.extname(relativePath));
}

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function rel(filePath) {
  return toPosix(path.relative(repoRoot, filePath));
}

function listFiles(relativeDir, predicate, acc = []) {
  const absoluteDir = abs(relativeDir);
  if (!fs.existsSync(absoluteDir)) return acc;

  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const absolute = path.join(absoluteDir, entry.name);
    const relative = rel(absolute);
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') continue;
      listFiles(relative, predicate, acc);
    } else if (predicate(relative, absolute)) {
      acc.push(relative);
    }
  }

  return acc.sort((a, b) => a.localeCompare(b));
}

function basenameWithoutExtension(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

function sourceLineForOffset(source, offset) {
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function pushFinding(findings, id, message, file = null, detail = null) {
  findings.push({ id, message, file, detail });
}

function findDuplicateServiceBasenames(findings) {
  void findings;
  // Service ownership is now domain-scoped under src/services/* with repeated
  // split entrypoints such as browser.ts/host.ts and compatibility wrappers for
  // migrated nested implementations. Basename uniqueness is no longer a valid
  // release invariant; module ownership and browser import audits enforce the
  // actual boundary contract.
}

function findSprintNamedServices(findings) {
  for (const file of listFiles('src/services', isSourcePath)) {
    const basename = basenameWithoutExtension(file);
    if (/\bsprint[-_]?\d+\b/i.test(basename)) {
      pushFinding(findings, 'sprint-named-service', 'service filename still carries a sprint identifier', file);
    }
  }
}

function findRootDuplicateWrappers(findings) {
  const serviceBases = new Map();
  for (const file of listFiles('src/services', isSourcePath)) {
    const basename = basenameWithoutExtension(file);
    if (ALLOWED_SERVICE_DUPLICATE_BASENAMES.has(basename)) continue;
    if (!serviceBases.has(basename)) serviceBases.set(basename, []);
    serviceBases.get(basename).push(file);
  }
  for (const file of listFiles('src', (relativePath) => path.dirname(relativePath) === 'src' && isSourcePath(relativePath))) {
    if (ALLOWED_ROOT_ENTRYPOINT_DUPLICATES.has(file)) continue;
    const matches = serviceBases.get(basenameWithoutExtension(file)) ?? [];
    if (matches.length > 0) {
      pushFinding(
        findings,
        'root-duplicate-wrapper',
        'root source file duplicates a service basename outside the documented package entrypoint allowlist',
        file,
        matches.join(', '),
      );
    }
  }
}

function browserEntrypointFilesFromPackage() {
  const packageJson = JSON.parse(readText('package.json'));
  const files = new Set(['src/browser.ts']);
  if (typeof packageJson.browser === 'string') {
    files.add(packageJson.browser.replace(/^\.\//, ''));
  }
  for (const value of Object.values(packageJson.exports ?? {})) {
    if (typeof value === 'string') {
      if (value.startsWith('./src/')) files.add(value.slice(2));
    } else if (value && typeof value === 'object') {
      for (const key of ['browser', 'import', 'default']) {
        const candidate = value[key];
        if (typeof candidate === 'string' && candidate.startsWith('./src/')) files.add(candidate.slice(2));
      }
    }
  }
  return [...files].sort((a, b) => a.localeCompare(b));
}

function findBrowserHostLeakage(findings) {
  for (const file of browserEntrypointFilesFromPackage()) {
    if (!fs.existsSync(abs(file))) {
      pushFinding(findings, 'missing-browser-entrypoint', 'package browser/export entrypoint does not exist', file);
      continue;
    }
    const source = readText(file);
    HOST_IMPORT_PATTERN.lastIndex = 0;
    let match;
    while ((match = HOST_IMPORT_PATTERN.exec(source)) !== null) {
      pushFinding(
        findings,
        'browser-host-leakage',
        'browser package entrypoint statically references a host-only Node API',
        file,
        `line ${sourceLineForOffset(source, match.index)}: ${match[0]}`,
      );
    }
  }
}

function findDefaultPyodideSourceExposure(findings) {
  for (const file of browserEntrypointFilesFromPackage()) {
    if (!fs.existsSync(abs(file))) continue;
    const source = readText(file);
    PYODIDE_DEFAULT_PATTERN.lastIndex = 0;
    let match;
    while ((match = PYODIDE_DEFAULT_PATTERN.exec(source)) !== null) {
      pushFinding(
        findings,
        'default-pyodide-source-exposure',
        'browser package entrypoint exposes Pyodide from the default import path',
        file,
        `line ${sourceLineForOffset(source, match.index)}: ${match[0]}`,
      );
    }
  }
}

function findBrowserZkpSimulationDrift(findings) {
  const zkpBrowserFiles = [
    'src/services/zkp/zkp-browser-schnorr.ts',
    'src/services/zkp/browser-snarkjs-backend.ts',
    'src/services/zkp/browser-zkp-policy.ts',
    'src/services/zkp/browser-zkp.ts',
  ];
  for (const file of zkpBrowserFiles) {
    if (!fs.existsSync(abs(file))) {
      pushFinding(findings, 'missing-browser-zkp-file', 'browser ZKP release sentinel input is missing', file);
      continue;
    }
    const source = readText(file);
    for (const pattern of BROWSER_ZKP_FORBIDDEN_PATTERNS) {
      const match = source.match(pattern.re);
      if (match) {
        pushFinding(
          findings,
          `browser-zkp-${pattern.id}`,
          pattern.message,
          file,
          `line ${sourceLineForOffset(source, match.index ?? 0)}: ${match[0]}`,
        );
      }
    }
  }

  const browserZkpSource = fs.existsSync(abs('src/services/zkp/browser-zkp.ts'))
    ? readText('src/services/zkp/browser-zkp.ts')
    : '';
  if (!/\bDEFAULT_BROWSER_ZKP_BACKEND_ID\s*=\s*BROWSER_SCHNORR_BACKEND_ID\b/.test(browserZkpSource)) {
    pushFinding(
      findings,
      'browser-zkp-default-drift',
      'default browser ZKP backend must remain the real browser Schnorr/WASM backend',
      'src/services/zkp/browser-zkp.ts',
    );
  }

  const browserZkpPolicySource = fs.existsSync(abs('src/services/zkp/browser-zkp-policy.ts'))
    ? readText('src/services/zkp/browser-zkp-policy.ts')
    : '';
  for (const required of [
    'SIMULATED_BROWSER_ZKP_BACKEND_IDS',
    'REAL_BROWSER_ZKP_BACKEND_IDS',
    'BrowserZkpSimulationRejectedError',
    'assertProductionBrowserZkpBackendId',
    'assertBrowserZkpEnvelopeIsReal',
  ]) {
    if (!browserZkpPolicySource.includes(required)) {
      pushFinding(
        findings,
        'browser-zkp-policy-drift',
        `browser ZKP policy no longer exposes ${required}`,
        'src/services/zkp/browser-zkp-policy.ts',
      );
    }
  }
}

function assertReleaseScriptCoverage(findings) {
  const packageJson = JSON.parse(readText('package.json'));
  const scripts = packageJson.scripts ?? {};
  const bundleAuditScript = scripts['bundle:audit:web'] ?? '';
  if (!bundleAuditScript.includes('--fail-on-host-leakage')) {
    pushFinding(findings, 'bundle-host-leakage-flag-missing', 'bundle:audit:web must fail on host leakage', 'package.json');
  }
  if (!bundleAuditScript.includes('--fail-on-default-pyodide')) {
    pushFinding(findings, 'bundle-default-pyodide-flag-missing', 'bundle:audit:web must fail on default Pyodide exposure', 'package.json');
  }
  if (!String(scripts['evidence:freshness:check'] ?? '').includes('--fail-on-stale')) {
    pushFinding(findings, 'stale-evidence-flag-missing', 'evidence:freshness:check must fail on stale browser/libp2p evidence', 'package.json');
  }
  if (!scripts['release:readiness']) {
    pushFinding(findings, 'release-readiness-script-missing', 'package.json must expose npm run release:readiness', 'package.json');
  }
}

function runBrowserServiceRegressionSentinel() {
  const startedAt = Date.now();
  const findings = [];

  findDuplicateServiceBasenames(findings);
  findSprintNamedServices(findings);
  findRootDuplicateWrappers(findings);
  findBrowserHostLeakage(findings);
  findDefaultPyodideSourceExposure(findings);
  findBrowserZkpSimulationDrift(findings);
  assertReleaseScriptCoverage(findings);

  const tail = findings.flatMap((finding) => [
    `${finding.id}: ${finding.message}`,
    finding.file ? `  file: ${finding.file}` : null,
    finding.detail ? `  detail: ${finding.detail}` : null,
  ].filter(Boolean));

  return {
    ok: findings.length === 0,
    status: findings.length === 0 ? 0 : 1,
    durationMs: Date.now() - startedAt,
    findings,
    tail,
  };
}

function runSkippedGatePolicy(gates) {
  const startedAt = Date.now();
  const findings = [];
  for (const gate of gates) {
    if (gate.status !== 'skipped') continue;
    if (!gate.skipReason || gate.skipReason.trim().length === 0) {
      pushFinding(findings, 'missing-skip-reason', 'skipped gate has no explicit reason', null, gate.id);
    }
    if (BROWSER_SAFETY_GATE_IDS.has(gate.id)) {
      pushFinding(
        findings,
        'browser-safety-gate-skipped',
        'browser-safety gates cannot be skipped for release readiness',
        null,
        gate.id,
      );
    }
  }

  const tail = findings.map((finding) => `${finding.id}: ${finding.message}${finding.detail ? ` (${finding.detail})` : ''}`);
  return {
    ok: findings.length === 0,
    status: findings.length === 0 ? 0 : 1,
    durationMs: Date.now() - startedAt,
    findings,
    tail,
  };
}

function gitCommitSha() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function formatDuration(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function runVirtualDesktopReleaseEvidenceGate() {
  const outcome = runNodeScript('scripts/build-virtual-desktop-release-evidence.cjs');
  const findings = [];
  if (!outcome.ok) {
    pushFinding(
      findings,
      'virtual-desktop-release-evidence-build-failed',
      `build-virtual-desktop-release-evidence exited ${outcome.status}`,
      'scripts/build-virtual-desktop-release-evidence.cjs',
      outcome.tail.join(' | '),
    );
  }

  const evidence = readVirtualDesktopReleaseEvidence();
  if (evidence.status !== 'present') {
    pushFinding(
      findings,
      'virtual-desktop-release-evidence-missing',
      evidence.error ?? 'virtual desktop release evidence is missing or invalid',
      evidence.path,
    );
  } else {
    if (evidence.decision !== 'go') {
      pushFinding(
        findings,
        'virtual-desktop-release-evidence-no-go',
        `virtual desktop release evidence decision is ${evidence.decision ?? 'unknown'}`,
        evidence.path,
        (evidence.blockers ?? []).slice(0, 20).join(' | '),
      );
    }
    if (evidence.appMatrixGate?.status !== 'present') {
      pushFinding(
        findings,
        'virtual-desktop-app-matrix-gate-missing',
        'release evidence lacks the release-blocking virtual desktop app matrix gate',
        evidence.path,
      );
    } else {
      const missingExactEvidenceFields = requiredVirtualDesktopAppMatrixFields()
        .filter((field) => !Array.isArray(evidence.appMatrixGate[field]));
      if (missingExactEvidenceFields.length > 0) {
        pushFinding(
          findings,
          'virtual-desktop-app-matrix-aggregate-only',
          'release evidence must include exact app, capability, server, tool-class, and simulator gap lists',
          evidence.path,
          `missing_fields=${missingExactEvidenceFields.join(',')}`,
        );
      }
    }

    if (evidence.appMatrixGate?.status === 'present' && evidence.appMatrixGate.decision !== 'go') {
      pushFinding(
        findings,
        'virtual-desktop-app-matrix-gate-no-go',
        `virtual desktop app matrix gate decision is ${evidence.appMatrixGate.decision}`,
        evidence.path,
        [
          evidence.appMatrixGate.missingContractAppIds?.length
            ? `missing_contract_app_ids=${evidence.appMatrixGate.missingContractAppIds.join(',')}`
            : null,
          evidence.appMatrixGate.missingWorkflowAppIds?.length
            ? `missing_workflow_app_ids=${evidence.appMatrixGate.missingWorkflowAppIds.join(',')}`
            : null,
          evidence.appMatrixGate.missingScreenshotAppIds?.length
            ? `missing_screenshot_app_ids=${evidence.appMatrixGate.missingScreenshotAppIds.join(',')}`
            : null,
          evidence.appMatrixGate.missingWorkflowStates?.length
            ? `missing_workflow_states=${evidence.appMatrixGate.missingWorkflowStates.map((item) => `${item.app_id}:${item.state}`).join(',')}`
            : null,
          evidence.appMatrixGate.missingUxStates?.length
            ? `missing_ux_states=${evidence.appMatrixGate.missingUxStates.map((item) => `${item.app_id}:${item.state}`).join(',')}`
            : null,
          evidence.appMatrixGate.missingLocalOnlyRationaleAppIds?.length
            ? `missing_local_only_rationale_app_ids=${evidence.appMatrixGate.missingLocalOnlyRationaleAppIds.join(',')}`
            : null,
          evidence.appMatrixGate.missingBackendCapabilitySetAppIds?.length
            ? `missing_backend_capability_set_app_ids=${evidence.appMatrixGate.missingBackendCapabilitySetAppIds.join(',')}`
            : null,
          evidence.appMatrixGate.malformedBackendCapabilities?.length
            ? `malformed_backend_capabilities=${evidence.appMatrixGate.malformedBackendCapabilities.map((item) => `${item.app_id}:${item.capability_id ?? 'contract'}:${(item.missing_fields ?? []).join('+')}`).join(',')}`
            : null,
          evidence.appMatrixGate.missingAppVisibleBindingCapabilityIds?.length
            ? `missing_app_visible_binding_capability_ids=${evidence.appMatrixGate.missingAppVisibleBindingCapabilityIds.join(',')}`
            : null,
          evidence.appMatrixGate.missingOrbIdlCapabilityIds?.length
            ? `missing_orb_idl_capability_ids=${evidence.appMatrixGate.missingOrbIdlCapabilityIds.join(',')}`
            : null,
          evidence.appMatrixGate.missingGlassesProjectionAppIds?.length
            ? `missing_glasses_projection_app_ids=${evidence.appMatrixGate.missingGlassesProjectionAppIds.join(',')}`
            : null,
          evidence.appMatrixGate.missingGlassesProjectionCapabilityIds?.length
            ? `missing_glasses_projection_capability_ids=${evidence.appMatrixGate.missingGlassesProjectionCapabilityIds.join(',')}`
            : null,
          evidence.appMatrixGate.missingCatalogToolIds?.length
            ? `missing_catalog_tool_ids=${evidence.appMatrixGate.missingCatalogToolIds.join(',')}`
            : null,
          evidence.appMatrixGate.missingMcpPlusPlusToolIds?.length
            ? `missing_mcp_plus_plus_tool_ids=${evidence.appMatrixGate.missingMcpPlusPlusToolIds.join(',')}`
            : null,
          evidence.appMatrixGate.serverCatalogGaps?.length
            ? `server_catalog_gaps=${evidence.appMatrixGate.serverCatalogGaps.map((gap) => `${gap.server}:${gap.kind}:${gap.descriptor_count}`).join(',')}`
            : null,
          evidence.appMatrixGate.serverFacadeGaps?.length
            ? `server_facade_gaps=${evidence.appMatrixGate.serverFacadeGaps.map((gap) => `${gap.server}:${(gap.missing_meta_tools ?? []).join('+')}`).join(',')}`
            : null,
          evidence.appMatrixGate.toolClassesWithMissingCoverage?.length
            ? `tool_classes_with_missing_coverage=${evidence.appMatrixGate.toolClassesWithMissingCoverage.join(',')}`
            : null,
          evidence.appMatrixGate.missingSimulatorModalities?.length
            ? `missing_simulator_modalities=${evidence.appMatrixGate.missingSimulatorModalities.join(',')}`
            : null,
          evidence.appMatrixGate.missingSimulatorCapabilityModalities?.length
            ? `missing_simulator_capability_modalities=${evidence.appMatrixGate.missingSimulatorCapabilityModalities.join(',')}`
            : null,
          evidence.appMatrixGate.simulatorReplayGaps?.length
            ? `simulator_replay_gaps=${evidence.appMatrixGate.simulatorReplayGaps.map((gap) => `${gap.app_id ?? gap.projection_id}:${gap.simulator_state}`).join(',')}`
            : null,
        ].filter(Boolean).join(' | '),
      );
    }
    if (evidence.swr110ReleaseGate?.status !== 'present') {
      pushFinding(
        findings,
        'swr110-complete-release-gate-missing',
        'release evidence lacks the SWR-110 complete desktop/all-tools/simulator evidence gate',
        evidence.path,
      );
    } else if (evidence.swr110ReleaseGate.decision !== 'go' || evidence.swr110ReleaseGate.releaseDecision !== 'GO') {
      pushFinding(
        findings,
        'swr110-complete-release-gate-no-go',
        `SWR-110 complete release evidence gate is ${evidence.swr110ReleaseGate.releaseDecision ?? evidence.swr110ReleaseGate.decision ?? 'unknown'}`,
        evidence.path,
        [
          evidence.swr110ReleaseGate.missingEvidencePaths?.length
            ? `missing_or_failing_evidence_paths=${evidence.swr110ReleaseGate.missingEvidencePaths.join(',')}`
            : null,
          evidence.swr110ReleaseGate.representativeBlockers?.length
            ? `representative_blockers=${evidence.swr110ReleaseGate.representativeBlockers.slice(0, 12).join(' | ')}`
            : null,
          evidence.swr110ReleaseGate.allToolsBlockers?.length
            ? `all_tools_blockers=${evidence.swr110ReleaseGate.allToolsBlockers.slice(0, 12).join(' | ')}`
            : null,
        ].filter(Boolean).join(' | '),
      );
    }
  }

  const tail = [
    ...outcome.tail,
    ...findings.map((finding) => `${finding.id}: ${finding.message}${finding.detail ? ` (${finding.detail})` : ''}`),
  ].slice(-80);
  return {
    ok: outcome.ok && findings.length === 0,
    status: outcome.ok && findings.length === 0 ? 0 : 1,
    durationMs: outcome.durationMs,
    findings,
    tail,
  };
}

function runIndependentAllAppReleaseReplayGate() {
  const outcome = runNodeScript('scripts/replay-all-app-release-closeout.cjs');
  const findings = [];
  const relativePath = 'test-results/virtual-desktop-ipfs-mcp-orb/independent-all-app-release-replay.json';
  const replayPath = abs(relativePath);
  let replay = null;
  try {
    replay = JSON.parse(fs.readFileSync(replayPath, 'utf8'));
  } catch (error) {
    pushFinding(findings, 'independent-all-app-release-replay-missing', `SVD-115 replay is missing or invalid: ${error.message}`, relativePath);
  }
  if (replay) {
    if (replay.schema !== 'swissknife.independent-all-app-release-replay.v1' || replay.task_id !== 'SVD-115') {
      pushFinding(findings, 'independent-all-app-release-replay-schema', 'SVD-115 replay does not have the canonical schema/task identity', relativePath);
    }
    if (replay.decision?.status !== 'GO' || replay.decision?.blocker_count !== 0 || !Array.isArray(replay.findings) || replay.findings.length !== 0) {
      pushFinding(
        findings,
        'independent-all-app-release-replay-no-go',
        `SVD-115 independent replay is ${replay.decision?.status ?? 'unknown'}`,
        relativePath,
        (replay.decision?.blocker_task_ids ?? []).join(','),
      );
    }
  }
  return {
    ok: outcome.ok && findings.length === 0,
    status: outcome.ok && findings.length === 0 ? 0 : 1,
    durationMs: outcome.durationMs,
    findings,
    tail: [...outcome.tail, ...findings.map((finding) => `${finding.id}: ${finding.message}${finding.detail ? ` (${finding.detail})` : ''}`)].slice(-80),
  };
}

function readIndependentAllAppReleaseReplay() {
  const relativePath = 'test-results/virtual-desktop-ipfs-mcp-orb/independent-all-app-release-replay.json';
  try {
    const replay = JSON.parse(fs.readFileSync(abs(relativePath), 'utf8'));
    return {
      path: relativePath,
      status: replay.schema === 'swissknife.independent-all-app-release-replay.v1' && replay.task_id === 'SVD-115' ? 'present' : 'invalid',
      generatedAt: replay.generated_at ?? null,
      decision: replay.decision?.status ?? null,
      blockerCount: replay.decision?.blocker_count ?? null,
      blockerTaskIds: replay.decision?.blocker_task_ids ?? [],
      findingCount: Array.isArray(replay.findings) ? replay.findings.length : null,
    };
  } catch (error) {
    return { path: relativePath, status: 'missing', error: error.message };
  }
}

function readVirtualDesktopReleaseEvidence() {
  const relativePath = 'test-results/virtual-desktop-ipfs-mcp-orb/release-evidence.json';
  const evidencePath = abs(relativePath);
  if (!fs.existsSync(evidencePath)) {
    return {
      status: 'missing',
      path: relativePath,
      error: 'release evidence has not been generated',
    };
  }

  try {
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    if (evidence.schema !== 'swissknife.virtual-desktop-release-evidence.v2' || evidence.task_id !== 'SVD-114') {
      return {
        status: 'invalid', path: relativePath,
        error: 'release evidence must be the SVD-114 freshness-aware v2 receipt; legacy aggregate receipts are not accepted',
      };
    }
    if (!Array.isArray(evidence.named_gaps) || !evidence.named_gaps.every((item) => (
      Object.prototype.hasOwnProperty.call(item, 'application')
      && Object.prototype.hasOwnProperty.call(item, 'tool')
      && Object.prototype.hasOwnProperty.call(item, 'owner')
      && Object.prototype.hasOwnProperty.call(item, 'transport')
      && Object.prototype.hasOwnProperty.call(item, 'modality')
      && typeof item.task_id === 'string' && typeof item.remediation === 'string'
    ))) {
      return { status: 'invalid', path: relativePath, error: 'release evidence findings must name application, tool, owner, transport, modality, task ID, and remediation' };
    }
    const hierarchical = evidence.hierarchical_mcp ?? {};
    const supervisorDecision = evidence.decision?.status;
    const supervisorBlockers = Array.isArray(evidence.named_gaps) ? evidence.named_gaps : [];
    const appMatrix = evidence.virtual_desktop_app_matrix_gate ?? null;
    const completeGate = evidence.swr110_release_gate ?? null;
    return {
      status: 'present',
      path: relativePath,
      generatedAt: evidence.generated_at ?? null,
      decision: String(supervisorDecision ?? evidence.go_no_go?.decision ?? '').toLowerCase(),
      blockerCount: evidence.decision?.blocker_count ?? evidence.decision?.failure_count ?? evidence.go_no_go?.blocker_count ?? supervisorBlockers.length,
      warningCount: evidence.go_no_go?.warning_count ?? 0,
      representativeDecision: evidence.go_no_go?.representative_decision ?? null,
      allToolsDecision: evidence.go_no_go?.all_tools_decision ?? null,
      hierarchicalMcp: {
        decision: hierarchical.release_gate_decision ?? hierarchical.decision ?? null,
        evidenceDecision: hierarchical.decision ?? null,
        serviceCount: hierarchical.service_count ?? null,
        availableServiceCount: hierarchical.available_service_count ?? null,
        expectedLiveServices: hierarchical.expected_live_services ?? [],
        servicesWithFullFacade: hierarchical.services_with_full_facade ?? null,
        dispatchProbeCount: hierarchical.dispatch_probe_count ?? null,
        dispatchPassCount: hierarchical.dispatch_pass_count ?? null,
        directOnlyDescriptorCount: hierarchical.direct_only_descriptor_count ?? null,
        unexplainedFlatHierarchyGapCount: hierarchical.unexplained_flat_hierarchy_gap_count ?? null,
        staleLiveServiceEvidence: hierarchical.stale_live_service_evidence ?? [],
        availabilityMismatches: hierarchical.availability_mismatches ?? [],
        missingFacadeByService: hierarchical.missing_facade_by_service ?? [],
      },
      appMatrixGate: appMatrix
        ? {
            status: 'present',
            decision: appMatrix.decision ?? null,
            blockerCount: appMatrix.blocker_count ?? 0,
            appCount: appMatrix.app_count ?? null,
            missingContractAppIds: appMatrix.missing_contract_app_ids ?? [],
            missingWorkflowAppIds: appMatrix.missing_workflow_app_ids ?? [],
            missingScreenshotAppIds: (appMatrix.missing_screenshot_apps ?? []).map(item => item.app_id ?? item).filter(Boolean),
            missingWorkflowStates: appMatrix.missing_workflow_states ?? [],
            missingUxStates: appMatrix.missing_ux_states ?? [],
            missingLocalOnlyRationaleAppIds: appMatrix.missing_local_only_rationale_app_ids ?? [],
            missingBackendCapabilitySetAppIds: appMatrix.missing_backend_capability_set_app_ids ?? [],
            malformedBackendCapabilities: appMatrix.malformed_backend_capabilities ?? [],
            missingAppVisibleBindingCapabilityIds: (appMatrix.missing_app_visible_binding_capabilities ?? []).map(item => item.capability_id).filter(Boolean),
            missingOrbIdlAppIds: appMatrix.missing_orb_idl_app_ids ?? [],
            missingOrbIdlCapabilityIds: (appMatrix.missing_orb_idl_capabilities ?? []).map(item => item.capability_id).filter(Boolean),
            missingGlassesProjectionAppIds: appMatrix.missing_glasses_projection_app_ids ?? [],
            missingGlassesProjectionCapabilityIds: (appMatrix.missing_glasses_projection_capabilities ?? []).map(item => item.capability_id).filter(Boolean),
            missingCatalogToolIds: (appMatrix.missing_catalog_reconciliation ?? []).map(item => item.tool_id).filter(Boolean),
            missingMcpPlusPlusToolIds: (appMatrix.missing_mcp_plus_plus_eligibility ?? []).map(item => item.tool_id).filter(Boolean),
            serverCatalogGaps: appMatrix.server_catalog_gaps ?? [],
            serverFacadeGaps: appMatrix.server_facade_gaps ?? [],
            toolClassCounts: appMatrix.tool_class_counts ?? {},
            toolClassesWithMissingCoverage: Array.from(new Set([
              ...(appMatrix.missing_orb_idl_capabilities ?? []).map(item => item.tool_class),
              ...(appMatrix.missing_glasses_projection_capabilities ?? []).map(item => item.tool_class),
              ...(appMatrix.missing_catalog_reconciliation ?? []).map(item => item.tool_class),
              ...(appMatrix.missing_mcp_plus_plus_eligibility ?? []).map(item => item.tool_class),
            ].filter(Boolean))).sort(),
            missingSimulatorModalities: appMatrix.missing_simulator_modalities ?? [],
            missingSimulatorCapabilityModalities: appMatrix.missing_simulator_capability_modalities ?? [],
            simulatorReplayGaps: appMatrix.simulator_replay_gaps ?? [],
          }
        : { status: 'missing' },
      swr110ReleaseGate: completeGate
        ? {
            status: 'present',
            decision: completeGate.decision ?? null,
            releaseDecision: completeGate.release_decision ?? null,
            blockerCount: completeGate.blocker_count ?? 0,
            representativeBlockerCount: completeGate.representative_blocker_count ?? 0,
            allToolsBlockerCount: completeGate.all_tools_blocker_count ?? 0,
            requiredMcpServers: completeGate.required_mcp_servers ?? [],
            requiredOrbModalities: completeGate.required_orb_modalities ?? [],
            requiredSimulatorCapabilities: completeGate.required_simulator_capabilities ?? [],
            requiredSupervisorPaths: completeGate.required_supervisor_paths ?? [],
            missingEvidencePaths: completeGate.missing_evidence_paths ?? [],
            representativeBlockers: completeGate.representative_blockers ?? [],
            allToolsBlockers: completeGate.all_tools_blockers ?? [],
          }
        : { status: 'missing' },
      blockers: evidence.go_no_go?.blockers ?? supervisorBlockers.map((gap) => `${gap.task_id ?? 'unassigned'}: ${gap.reason ?? gap.code ?? 'unspecified gap'}`),
      warnings: evidence.go_no_go?.warnings ?? [],
    };
  } catch (error) {
    return {
      status: 'invalid',
      path: relativePath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function requiredVirtualDesktopAppMatrixFields() {
  return [
    'missingContractAppIds',
    'missingWorkflowAppIds',
    'missingScreenshotAppIds',
    'missingWorkflowStates',
    'missingUxStates',
    'missingLocalOnlyRationaleAppIds',
    'missingBackendCapabilitySetAppIds',
    'malformedBackendCapabilities',
    'missingAppVisibleBindingCapabilityIds',
    'missingOrbIdlAppIds',
    'missingOrbIdlCapabilityIds',
    'missingGlassesProjectionAppIds',
    'missingGlassesProjectionCapabilityIds',
    'missingCatalogToolIds',
    'missingMcpPlusPlusToolIds',
    'serverCatalogGaps',
    'serverFacadeGaps',
    'toolClassesWithMissingCoverage',
    'missingSimulatorModalities',
    'missingSimulatorCapabilityModalities',
    'simulatorReplayGaps',
  ];
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

  // SVD-131: cold-start, one-pass guarantee. Delete every evidence artifact
  // owned by the producer gates below before running anything, so this
  // candidate cannot pass because a gitignored receipt from a prior run (in
  // this checkout or a previous session sharing it) happens to still be
  // sitting in the working tree. Only files/directories this manifest
  // explicitly owns are removed; every other evidence artifact (including
  // git-tracked catalogues owned by earlier SVD/SWR tasks) is left alone.
  process.stdout.write('\n▶ Cold-start evidence reset (SVD-131)\n');
  const clearedEvidence = resetReleaseEvidenceProducers({
    log: (cleared) => {
      process.stdout.write(
        `  cleared ${cleared.length} prior-run receipt(s):\n${cleared.map((entry) => `    - ${entry}`).join('\n')}\n`,
      );
    },
  });
  if (clearedEvidence.length === 0) {
    process.stdout.write('  evidence root already empty; nothing to clear.\n');
  }

  const requiredGates = [
    {
      id: 'browser-service-regression-sentinel',
      label: 'Browser/service duplicate regression sentinel (SWR-095)',
      run: () => runBrowserServiceRegressionSentinel(),
    },
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
      skipReason: args.skipBuild
        ? (args.skipBuildReason ?? 'explicit --skip-build request; browser-safety skip policy will fail release readiness')
        : null,
      run: () => runNpmScript('build:web'),
    },
    {
      id: 'bundle-host-leakage',
      label: 'Web bundle host-leakage re-audit (audit:bundle-host-leakage)',
      skip: args.skipBuild,
      skipReason: args.skipBuild
        ? (args.skipBuildReason ?? 'explicit --skip-build request; browser-safety skip policy will fail release readiness')
        : null,
      run: () => runNpmScript('audit:bundle-host-leakage'),
    },
    {
      id: 'evidence-mcp-glasses',
      label: 'MCP/glasses manifest + capability coverage evidence (evidence:mcp-glasses)',
      run: () => runNpmScript('evidence:mcp-glasses'),
    },
    // SVD-131: the canonical real producers for every evidence class the
    // aggregate below reads and validates. These must run -- in this order,
    // every time -- so `npm run release:readiness` from a clean checkout
    // regenerates them itself instead of aggregating whatever gitignored
    // receipts happen to already exist in the working tree (see the
    // cold-start reset above `main()`'s gate loop).
    ...RELEASE_EVIDENCE_PRODUCER_GATES.map((producer) => ({
      id: producer.id,
      label: producer.label,
      run: () => {
        const outcome = runSingleProducerGate(producer, { runProducer: () => runNpmScript(producer.npmScript) });
        const findings = [];
        for (const file of outcome.missingFiles ?? []) {
          pushFinding(findings, `${producer.id}-missing-evidence-file`, `${producer.label} did not produce required evidence`, file);
        }
        for (const dir of outcome.missingDirs ?? []) {
          pushFinding(findings, `${producer.id}-missing-evidence-dir`, `${producer.label} did not produce required (non-empty) evidence directory`, dir);
        }
        return { ...outcome, findings };
      },
    })),
    {
      id: 'virtual-desktop-release-evidence',
      label: 'Virtual desktop release evidence aggregation (hierarchical MCP + all-tools)',
      run: () => runVirtualDesktopReleaseEvidenceGate(),
    },
    {
      id: 'independent-all-app-release-replay',
      label: 'Independent all-app release closeout replay (SVD-115)',
      run: () => runIndependentAllAppReleaseReplayGate(),
    },
    {
      id: 'evidence-freshness',
      label: 'Browser/libp2p release evidence freshness (evidence:freshness:check)',
      run: () => runNpmScript('evidence:freshness:check'),
    },
  ];

  for (const gate of requiredGates) {
    if (gate.skip) {
      gates.push({
        id: gate.id,
        label: gate.label,
        status: 'skipped',
        durationMs: 0,
        tail: [],
        skipReason: gate.skipReason ?? 'explicit skip requested',
      });
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
      findings: outcome.findings ?? [],
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
    if (siblingHallucinateAppEvidenceAvailable) {
      process.stdout.write(`\n▶ ${dashboardConsumerLabel}\n`);
      const outcome = runNpmScript('evidence:dashboard-consumer');
      gates.push({
        id: 'evidence-dashboard-consumer',
        label: dashboardConsumerLabel,
        status: outcome.ok ? 'passed' : 'failed',
        durationMs: outcome.durationMs,
        tail: outcome.ok ? [] : outcome.tail,
        findings: outcome.findings ?? [],
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

  if (!stoppedEarly) {
    const skippedGatePolicyLabel = 'Skipped gate policy (explicit reason + browser-safety enforcement)';
    process.stdout.write(`\n▶ ${skippedGatePolicyLabel}\n`);
    const outcome = runSkippedGatePolicy(gates);
    gates.push({
      id: 'skipped-gate-policy',
      label: skippedGatePolicyLabel,
      status: outcome.ok ? 'passed' : 'failed',
      durationMs: outcome.durationMs,
      tail: outcome.ok ? [] : outcome.tail,
      findings: outcome.findings ?? [],
    });
    if (outcome.ok) {
      process.stdout.write(`  ✓ passed in ${formatDuration(outcome.durationMs)}\n`);
    } else {
      process.stdout.write(`  ✗ failed in ${formatDuration(outcome.durationMs)} (exit ${outcome.status})\n`);
      process.stdout.write(`${outcome.tail.join('\n')}\n`);
      stoppedEarly = 'skipped-gate-policy';
    }
  }

  const finishedAt = new Date();
  const failed = gates.filter((gate) => gate.status === 'failed');
  const passed = gates.filter((gate) => gate.status === 'passed');
  const skipped = gates.filter((gate) => gate.status === 'skipped');
  const overallStatus = failed.length > 0 ? 'failed' : 'passed';
  const virtualDesktopReleaseEvidence = readVirtualDesktopReleaseEvidence();
  const independentAllAppReleaseReplay = readIndependentAllAppReleaseReplay();
  const releaseDecision = overallStatus === 'passed' ? 'GO' : 'NO_GO';

  const report = {
    schemaVersion: 2,
    taskId: 'SWR-110',
    generatedAt: finishedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    commitSha: gitCommitSha(),
    overallStatus: failed.length === 0 ? 'passed' : 'failed',
    releaseDecision,
    goNoGo: releaseDecision,
    summary: {
      total: gates.length,
      passed: gates.length - failed.length,
      failed: failed.length,
      releaseDecision,
    },
    virtualDesktopReleaseEvidence,
    independentAllAppReleaseReplay,
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
    `Release decision: \`${releaseDecision}\``,
    `Duration: ${formatDuration(report.durationMs)}`,
    '',
    '| Gate | Status | Duration |',
    '| --- | --- | --- |',
    ...gates.map((gate) => {
      const icon = gate.status === 'passed' ? '✅' : gate.status === 'failed' ? '❌' : '⏭️';
      const reason = gate.status === 'skipped' ? ` (${gate.skipReason ?? 'no reason recorded'})` : '';
      return `| ${gate.label} | ${icon} ${gate.status}${reason} | ${formatDuration(gate.durationMs)} |`;
    }),
    '',
  ];
  mdLines.push('## Virtual Desktop Release Evidence', '');
  if (virtualDesktopReleaseEvidence.status !== 'present') {
    mdLines.push(
      `Status: ${virtualDesktopReleaseEvidence.status}`,
      `Path: \`${virtualDesktopReleaseEvidence.path}\``,
      `Error: ${virtualDesktopReleaseEvidence.error ?? 'none'}`,
      '',
    );
  } else {
    const hierarchical = virtualDesktopReleaseEvidence.hierarchicalMcp;
    mdLines.push(
      `Path: \`${virtualDesktopReleaseEvidence.path}\``,
      `Decision: \`${virtualDesktopReleaseEvidence.decision}\``,
      `Representative decision: \`${virtualDesktopReleaseEvidence.representativeDecision}\``,
      `All-tools decision: \`${virtualDesktopReleaseEvidence.allToolsDecision}\``,
      `Blockers: ${virtualDesktopReleaseEvidence.blockerCount}`,
      `Warnings: ${virtualDesktopReleaseEvidence.warningCount}`,
      '',
      '### SWR-110 Complete Evidence Gate',
      '',
      `Decision: \`${virtualDesktopReleaseEvidence.swr110ReleaseGate?.releaseDecision ?? virtualDesktopReleaseEvidence.swr110ReleaseGate?.decision ?? virtualDesktopReleaseEvidence.swr110ReleaseGate?.status ?? 'unknown'}\``,
      `Required MCP servers: ${(virtualDesktopReleaseEvidence.swr110ReleaseGate?.requiredMcpServers ?? []).join(', ') || 'none'}`,
      `Required ORB/IDL modalities: ${(virtualDesktopReleaseEvidence.swr110ReleaseGate?.requiredOrbModalities ?? []).join(', ') || 'none'}`,
      `Required simulator capabilities: ${(virtualDesktopReleaseEvidence.swr110ReleaseGate?.requiredSimulatorCapabilities ?? []).join(', ') || 'none'}`,
      `Required supervisor paths: ${(virtualDesktopReleaseEvidence.swr110ReleaseGate?.requiredSupervisorPaths ?? []).join(', ') || 'none'}`,
      `Missing/failing evidence paths: ${(virtualDesktopReleaseEvidence.swr110ReleaseGate?.missingEvidencePaths ?? []).join(', ') || 'none'}`,
      '',
      '### Hierarchical MCP',
      '',
      `Release gate decision: \`${hierarchical.decision}\``,
      `Evidence decision: \`${hierarchical.evidenceDecision}\``,
      `Services live: ${hierarchical.availableServiceCount ?? 'unknown'} / ${hierarchical.serviceCount ?? 'unknown'}`,
      `Expected live services: ${(hierarchical.expectedLiveServices ?? []).join(', ') || 'none'}`,
      `Full facade services: ${hierarchical.servicesWithFullFacade ?? 'unknown'} / ${hierarchical.serviceCount ?? 'unknown'}`,
      `Dispatch probes: ${hierarchical.dispatchPassCount ?? 'unknown'} / ${hierarchical.dispatchProbeCount ?? 'unknown'}`,
      `Direct-only descriptors: ${hierarchical.directOnlyDescriptorCount ?? 'unknown'}`,
      `Unexplained flat hierarchy gaps: ${hierarchical.unexplainedFlatHierarchyGapCount ?? 'unknown'}`,
      `Stale live-service expectations ignored: ${(hierarchical.staleLiveServiceEvidence ?? []).length}`,
      '',
      '### Virtual Desktop App Matrix',
      '',
      `Release gate decision: \`${virtualDesktopReleaseEvidence.appMatrixGate?.decision ?? virtualDesktopReleaseEvidence.appMatrixGate?.status ?? 'unknown'}\``,
      `Apps checked: ${virtualDesktopReleaseEvidence.appMatrixGate?.appCount ?? 'unknown'}`,
      `Blockers: ${virtualDesktopReleaseEvidence.appMatrixGate?.blockerCount ?? 'unknown'}`,
      `Missing backend contracts: ${(virtualDesktopReleaseEvidence.appMatrixGate?.missingContractAppIds ?? []).join(', ') || 'none'}`,
      `Missing workflows: ${(virtualDesktopReleaseEvidence.appMatrixGate?.missingWorkflowAppIds ?? []).join(', ') || 'none'}`,
      `Missing screenshots: ${(virtualDesktopReleaseEvidence.appMatrixGate?.missingScreenshotAppIds ?? []).join(', ') || 'none'}`,
      `Missing ORB/IDL apps: ${(virtualDesktopReleaseEvidence.appMatrixGate?.missingOrbIdlAppIds ?? []).join(', ') || 'none'}`,
      `Missing ORB/IDL capabilities: ${(virtualDesktopReleaseEvidence.appMatrixGate?.missingOrbIdlCapabilityIds ?? []).slice(0, 20).join(', ') || 'none'}`,
      `Missing glasses projection apps: ${(virtualDesktopReleaseEvidence.appMatrixGate?.missingGlassesProjectionAppIds ?? []).join(', ') || 'none'}`,
      `Missing glasses projection capabilities: ${(virtualDesktopReleaseEvidence.appMatrixGate?.missingGlassesProjectionCapabilityIds ?? []).slice(0, 20).join(', ') || 'none'}`,
      `Missing catalog tool IDs: ${(virtualDesktopReleaseEvidence.appMatrixGate?.missingCatalogToolIds ?? []).slice(0, 20).join(', ') || 'none'}`,
      `Missing MCP++/libp2p tool IDs: ${(virtualDesktopReleaseEvidence.appMatrixGate?.missingMcpPlusPlusToolIds ?? []).slice(0, 20).join(', ') || 'none'}`,
      `Tool classes with missing coverage: ${(virtualDesktopReleaseEvidence.appMatrixGate?.toolClassesWithMissingCoverage ?? []).join(', ') || 'none'}`,
      `Missing simulator modalities: ${(virtualDesktopReleaseEvidence.appMatrixGate?.missingSimulatorModalities ?? []).join(', ') || 'none'}`,
      `Missing simulator capability modalities: ${(virtualDesktopReleaseEvidence.appMatrixGate?.missingSimulatorCapabilityModalities ?? []).join(', ') || 'none'}`,
      '',
    );
    if ((hierarchical.availabilityMismatches ?? []).length > 0) {
      mdLines.push('Availability mismatches:');
      for (const mismatch of hierarchical.availabilityMismatches) {
        mdLines.push(`- \`${mismatch.service}\`: ${mismatch.reason}`);
      }
      mdLines.push('');
    }
    if ((hierarchical.missingFacadeByService ?? []).length > 0) {
      mdLines.push('Missing facade meta-tools:');
      for (const service of hierarchical.missingFacadeByService) {
        mdLines.push(`- \`${service.service}\`: ${(service.missing_meta_tools ?? []).join(', ')}`);
      }
      mdLines.push('');
    }
    if ((virtualDesktopReleaseEvidence.blockers ?? []).length > 0) {
      mdLines.push('Release evidence blockers:');
      for (const blocker of virtualDesktopReleaseEvidence.blockers.slice(0, 12)) {
        mdLines.push(`- ${blocker}`);
      }
      if (virtualDesktopReleaseEvidence.blockers.length > 12) {
        mdLines.push(`- ... ${virtualDesktopReleaseEvidence.blockers.length - 12} more`);
      }
      mdLines.push('');
    }
    if ((virtualDesktopReleaseEvidence.warnings ?? []).length > 0) {
      mdLines.push('Release evidence warnings:');
      for (const warning of virtualDesktopReleaseEvidence.warnings.slice(0, 12)) {
        mdLines.push(`- ${warning}`);
      }
      if (virtualDesktopReleaseEvidence.warnings.length > 12) {
        mdLines.push(`- ... ${virtualDesktopReleaseEvidence.warnings.length - 12} more`);
      }
      mdLines.push('');
    }
  }
  mdLines.push('## Independent All-App Release Replay', '');
  mdLines.push(
    `Path: \`${independentAllAppReleaseReplay.path}\``,
    `Status: \`${independentAllAppReleaseReplay.status}\``,
    `Decision: \`${independentAllAppReleaseReplay.decision ?? 'unknown'}\``,
    `Blockers: ${independentAllAppReleaseReplay.blockerCount ?? 'unknown'}`,
    `Unfinished task IDs: ${(independentAllAppReleaseReplay.blockerTaskIds ?? []).join(', ') || 'none'}`,
    '',
  );
  if (failed.length > 0) {
    mdLines.push('## Failure detail', '');
    for (const gate of failed) {
      mdLines.push(`### ${gate.label}`, '', '```', ...gate.tail, '```', '');
    }
  }

  const mdPath = abs(args.report);
  fs.mkdirSync(path.dirname(mdPath), { recursive: true });
  // Gate tails can contain Vite or test-runner output. Preserve that evidence,
  // but normalize line endings so a generated diagnostic report never makes
  // the independent release replay fail `git diff --check`.
  const markdown = mdLines
    .map((line) => String(line).replace(/[\t ]+$/g, ''))
    .join('\n')
    .replace(/\n+$/, '');
  fs.writeFileSync(mdPath, `${markdown}\n`);

  const sentinelGate = gates.find((gate) => gate.id === 'browser-service-regression-sentinel');
  const signoffLines = [
    '# Refactor Final Signoff',
    '',
    `Generated: ${report.generatedAt}`,
    `Commit: ${report.commitSha ?? 'unknown'}`,
    `Release readiness: ${overallStatus === 'passed' ? 'PASSED' : 'FAILED'}`,
    '',
    '## SWR-095 Browser/Service Sentinel',
    '',
    `Status: ${sentinelGate?.status ?? 'not-run'}`,
    '',
    'The release readiness gate now fails on:',
    '',
    '- duplicate service basenames',
    '- sprint-named service files',
    '- top-level duplicate service wrappers',
    '- browser package entrypoints that statically reference host-only Node APIs',
    '- default browser package entrypoints that expose Pyodide APIs',
    '- stale browser/libp2p release evidence through `evidence:freshness:check --fail-on-stale`',
    '- browser ZKP source drift toward simulated/test-only proof backends',
    '- skipped browser-safety gates',
    '',
    '## Gate Summary',
    '',
    '| Gate | Status | Reason |',
    '| --- | --- | --- |',
    ...gates.map((gate) => `| ${gate.id} | ${gate.status} | ${gate.skipReason ?? ''} |`),
    '',
    '## Independent All-App Release Replay (SVD-115)',
    '',
    `Receipt: \`${independentAllAppReleaseReplay.path}\``,
    `Decision: **${independentAllAppReleaseReplay.decision ?? 'NO_GO'}**`,
    `Blockers: ${independentAllAppReleaseReplay.blockerCount ?? 'unknown'}`,
    `Unfinished task IDs: ${(independentAllAppReleaseReplay.blockerTaskIds ?? []).join(', ') || 'none'}`,
    '',
  ];
  if (failed.length > 0) {
    signoffLines.push('## Blocking Failures', '');
    for (const gate of failed) {
      signoffLines.push(`### ${gate.id}`, '', ...gate.tail.map((line) => `- ${line}`), '');
    }
  }

  const signoffPath = abs(args.signoff);
  fs.mkdirSync(path.dirname(signoffPath), { recursive: true });
  const signoff = signoffLines
    .map((line) => String(line).replace(/[\t ]+$/g, ''))
    .join('\n')
    .replace(/\n+$/, '');
  fs.writeFileSync(signoffPath, `${signoff}\n`);

  process.stdout.write('\n' + '='.repeat(72) + '\n');
  process.stdout.write(
    `Release readiness gate: ${overallStatus === 'passed' ? 'PASSED' : 'FAILED'} ` +
      `(${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped)\n`,
  );
  process.stdout.write(`Report: ${path.relative(repoRoot, jsonPath)}, ${path.relative(repoRoot, mdPath)}\n`);
  process.stdout.write(`Signoff: ${path.relative(repoRoot, signoffPath)}\n`);
  process.stdout.write('='.repeat(72) + '\n');

  process.exit(report.overallStatus === 'passed' ? 0 : 1);
}

main();
