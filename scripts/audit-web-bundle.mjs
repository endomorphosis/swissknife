#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_DIST_DIR = 'dist';
const METADATA_PATH = '.vite/swissknife-bundle-metadata.json';
const VITE_MANIFEST_PATH = '.vite/manifest.json';
const OWNERSHIP_MANIFEST_PATH = 'src/module-ownership.json';

const DEFAULT_BUDGETS = Object.freeze({
  totalRawBytes: 2_750_000,
  totalGzipBytes: 650_000,
  totalBrotliBytes: 560_000,
  libp2pRawBytes: 262_144,
  libp2pGzipBytes: 85_000,
  libp2pBrotliBytes: 75_000,
  libp2pChunkCount: 8,
});

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.mjs',
  '.svg',
  '.txt',
  '.wasm.map',
]);

const HOST_LEAKAGE_RULES = [
  {
    id: 'acceptance-forbidden-token',
    severity: 'host-only',
    fail: true,
    re: /\b(?:node:fs|node:path|child_process|Buffer\.from|mcp-remote-deontic-engine)\b/g,
    description: 'Forbidden browser bundle token from SWR-008 acceptance gate',
  },
  {
    id: 'node-core-import',
    severity: 'host-only',
    fail: true,
    re: /\b(?:from\s*["'](?:node:)?(?:child_process|fs\/promises|fs|worker_threads|net|tls|dgram|dns|readline|repl|tty|vm)["']|from\s*["']node:path["']|import\s*\(\s*["'](?:node:)?(?:child_process|fs\/promises|fs|worker_threads|net|tls|dgram|dns|readline|repl|tty|vm)["']\s*\)|import\s*\(\s*["']node:path["']\s*\)|require\s*\(\s*["'](?:node:)?(?:child_process|fs\/promises|fs|worker_threads|net|tls|dgram|dns|readline|repl|tty|vm)["']\s*\)|require\s*\(\s*["']node:path["']\s*\)|\bnode:(?:child_process|fs\/promises|fs|path|worker_threads|net|tls|dgram|dns|readline|repl|tty|vm)\b)/g,
    description: 'Node core host module reference',
  },
  {
    id: 'subprocess-api',
    severity: 'host-only',
    fail: true,
    re: /(^|[^\w$.])(?:spawn|spawnSync|exec|execFile|execFileSync|execSync)\s*\(/g,
    description: 'Subprocess API call',
  },
  {
    id: 'native-module',
    severity: 'host-only',
    fail: true,
    re: /(?:["'`][^"'`]+\.node["'`]|\bprocess\.binding\s*\(|\bloadNativeModule\b|\bnative-loader\b)/g,
    description: 'Native module loading pattern',
  },
  {
    id: 'filesystem-api',
    severity: 'host-only',
    fail: true,
    re: /\b(?:readFileSync|writeFileSync|createReadStream|createWriteStream|mkdirSync|statSync|readdirSync)\s*\(/g,
    description: 'Filesystem API call',
  },
];

const PYTHON_EXPOSURE_RULES = [
  {
    id: 'pyodide-runtime',
    severity: 'browser-python',
    re: /\b(?:pyodide|loadPyodide|runPython|runPythonAsync|micropip)\b/gi,
    description: 'Pyodide or in-browser Python runtime',
  },
  {
    id: 'host-python-bridge',
    severity: 'host-python',
    re: /\b(?:desktop\.swissknife\.python|swissknife\.python|python\.execute|python subprocess)\b/gi,
    description: 'Host Python bridge exposure',
  },
  {
    id: 'python-command-or-text',
    severity: 'python-reference',
    re: /\b(?:python3?|```python|language["']?\s*:\s*["']python["'])\b/gi,
    description: 'Python command, language mode, or documentation text',
  },
];

const LIBP2P_PATTERNS = [
  /\blibp2p\b/i,
  /@libp2p\//i,
  /@chainsafe\/libp2p-/i,
  /\bgossipsub\b/i,
  /\byamux\b/i,
  /\bcircuit[-_ ]?relay\b/i,
];

const LIBP2P_PACKAGES = [
  'libp2p',
  '@libp2p/webrtc',
  '@libp2p/websockets',
  '@libp2p/circuit-relay-v2',
  '@libp2p/identify',
  '@libp2p/gossipsub',
  '@libp2p/mdns',
  '@libp2p/kad-dht',
  '@chainsafe/libp2p-noise',
  '@chainsafe/libp2p-yamux',
  '@chainsafe/libp2p-gossipsub',
  '@multiformats/multiaddr',
];

const DEPENDENCY_OWNERS = [
  { re: /^(?:libp2p|@libp2p\/|@chainsafe\/libp2p-|@multiformats\/multiaddr$)/, owner: 'mcp-protocol-runtime', purpose: 'browser libp2p transport and peer addressing' },
  { re: /^pyodide$/, owner: 'browser-python-runtime', purpose: 'in-browser Python runtime exposure' },
  { re: /^(?:assert|buffer|constants-browserify|crypto-browserify|events|path-browserify|process|stream-browserify|util)$/, owner: 'browser-polyfill-runtime', purpose: 'browser compatibility polyfill' },
  { re: /^(?:@anthropic-ai\/sdk|openai|@modelcontextprotocol\/sdk)$/, owner: 'protocol-client-runtime', purpose: 'remote protocol or model client' },
  { re: /^(?:react|react-dom)$/, owner: 'browser-ui-runtime', purpose: 'browser UI framework' },
];

function parseArgs(argv) {
  const args = {
    dist: DEFAULT_DIST_DIR,
    report: null,
    json: null,
    failOnHostLeakage: false,
    failOnDefaultPyodide: false,
    failOnBudget: true,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dist') {
      args.dist = argv[++i];
      if (!args.dist) throw new Error('--dist requires a path');
    } else if (arg === '--report') {
      args.report = argv[++i];
      if (!args.report) throw new Error('--report requires a path');
    } else if (arg === '--json') {
      args.json = argv[++i];
      if (!args.json) throw new Error('--json requires a path');
    } else if (arg === '--fail-on-host-leakage') {
      args.failOnHostLeakage = true;
    } else if (arg === '--fail-on-default-pyodide') {
      args.failOnDefaultPyodide = true;
    } else if (arg === '--no-fail-on-budget') {
      args.failOnBudget = false;
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
    'Usage: node scripts/audit-web-bundle.mjs [options]',
    '',
    'Options:',
    '  --dist <path>                 Built web dist directory. Default: dist.',
    '  --report <path>               Write markdown budget report.',
    '  --json <path>                 Write machine-readable audit JSON.',
    '  --fail-on-host-leakage        Exit non-zero on host-only bundle leakage.',
    '  --fail-on-default-pyodide     Exit non-zero when Pyodide is reachable from default entry chunks.',
    '  --no-fail-on-budget           Record budget status without failing on budget excess.',
    '  --help, -h                    Show this help text.',
  ].join('\n');
}

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function rel(filePath) {
  return toPosix(path.relative(repoRoot, filePath));
}

function abs(relativePath) {
  return path.resolve(repoRoot, relativePath);
}

function readJsonIfExists(relativePath) {
  const absolute = abs(relativePath);
  if (!fs.existsSync(absolute)) return null;
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function ensureParent(relativePath) {
  fs.mkdirSync(path.dirname(abs(relativePath)), { recursive: true });
}

function compareStrings(a, b) {
  return a.localeCompare(b);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function markdownEscape(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function isTextFile(filePath) {
  if (filePath.endsWith('.wasm.map')) return true;
  return TEXT_EXTENSIONS.has(path.extname(filePath));
}

function walkFiles(relativeDir, acc = []) {
  const absoluteDir = abs(relativeDir);
  if (!fs.existsSync(absoluteDir)) return acc;

  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const absolute = path.join(absoluteDir, entry.name);
    const relative = rel(absolute);
    if (entry.isDirectory()) {
      walkFiles(relative, acc);
    } else if (entry.isFile()) {
      acc.push(relative);
    }
  }

  return acc.sort(compareStrings);
}

function gzipSize(buffer) {
  return zlib.gzipSync(buffer, { level: 9 }).byteLength;
}

function brotliSize(buffer) {
  return zlib.brotliCompressSync(buffer, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  }).byteLength;
}

function fileMetrics(file) {
  const buffer = fs.readFileSync(abs(file));
  return {
    file,
    rawBytes: buffer.byteLength,
    gzipBytes: gzipSize(buffer),
    brotliBytes: brotliSize(buffer),
    text: isTextFile(file) ? buffer.toString('utf8') : '',
  };
}

function parseBudgetFromReport(reportPath) {
  if (!reportPath || !fs.existsSync(abs(reportPath))) return {};
  const text = fs.readFileSync(abs(reportPath), 'utf8');
  const match = text.match(/```json bundle-budget\s*([\s\S]*?)```/);
  if (!match) return {};
  const parsed = JSON.parse(match[1]);
  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => Number.isFinite(value) && value >= 0),
  );
}

function loadBudgets(reportPath) {
  return {
    ...DEFAULT_BUDGETS,
    ...parseBudgetFromReport(reportPath),
  };
}

function snippet(text, index, length = 96) {
  const start = Math.max(0, index - Math.floor(length / 2));
  const end = Math.min(text.length, start + length);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function scanRules(files, rules) {
  const findings = [];
  for (const file of files) {
    if (!file.text) continue;
    for (const rule of rules) {
      const re = new RegExp(rule.re.source, rule.re.flags);
      let match;
      while ((match = re.exec(file.text))) {
        findings.push({
          file: file.file,
          ruleId: rule.id,
          severity: rule.severity,
          fail: Boolean(rule.fail),
          description: rule.description,
          match: match[0],
          snippet: snippet(file.text, match.index),
        });
        if (match[0].length === 0) re.lastIndex += 1;
      }
    }
  }
  return findings.sort((a, b) => (
    a.file.localeCompare(b.file)
    || a.ruleId.localeCompare(b.ruleId)
    || a.match.localeCompare(b.match)
  ));
}

function packageNameFromModuleId(id) {
  const normalized = id.replace(/\\/g, '/');
  const marker = '/node_modules/';
  const index = normalized.lastIndexOf(marker);
  if (index === -1) return null;
  const parts = normalized.slice(index + marker.length).split('/');
  if (!parts[0]) return null;
  if (parts[0].startsWith('@')) return `${parts[0]}/${parts[1] ?? ''}`;
  return parts[0];
}

function normalizeModuleId(id) {
  const normalized = id.replace(/\0/g, '').replace(/\\/g, '/').replace(/[?#].*$/, '');
  const root = `${repoRoot.replace(/\\/g, '/')}/`;
  return normalized.startsWith(root) ? normalized.slice(root.length) : normalized;
}

function dependencyOwner(packageName) {
  const match = DEPENDENCY_OWNERS.find(candidate => candidate.re.test(packageName));
  return match ?? { owner: 'third-party-runtime', purpose: 'bundled third-party dependency' };
}

function dependencyBucket(packageJson, packageName) {
  if (packageJson.dependencies?.[packageName]) return 'dependencies';
  if (packageJson.optionalDependencies?.[packageName]) return 'optionalDependencies';
  if (packageJson.devDependencies?.[packageName]) return 'devDependencies';
  if (packageJson.peerDependencies?.[packageName]) return 'peerDependencies';
  return 'not-declared';
}

function loadOwnershipManifest() {
  const manifest = readJsonIfExists(OWNERSHIP_MANIFEST_PATH);
  if (!manifest?.modules) return [];
  return Object.entries(manifest.modules)
    .map(([name, module]) => ({
      name,
      owner: module.owner ?? name,
      path: module.path,
      classification: module.runtimeClassification ?? 'unknown',
      browserReachability: module.browserReachability ?? 'unknown',
    }))
    .filter(module => typeof module.path === 'string')
    .sort((a, b) => b.path.length - a.path.length);
}

function sourceOwner(moduleId, owners) {
  const normalized = normalizeModuleId(moduleId);
  if (normalized.startsWith('web/')) {
    return {
      module: 'web',
      owner: 'browser-web-app',
      classification: 'browser-safe',
      browserReachability: 'web build entrypoint',
    };
  }
  if (normalized.startsWith('ipfs_accelerate_js/')) {
    return {
      module: 'ipfs-accelerate-js',
      owner: 'ipfs-accelerate-browser-runtime',
      classification: 'split',
      browserReachability: 'browser build dependency',
    };
  }
  if (normalized.startsWith('vite/')) {
    return {
      module: 'vite-runtime',
      owner: 'vite-build-runtime',
      classification: 'browser-safe',
      browserReachability: 'Vite build helper',
    };
  }
  const match = owners.find(candidate => (
    normalized === candidate.path || normalized.startsWith(`${candidate.path}/`)
  ));
  if (match) {
    return {
      module: match.name,
      owner: match.owner,
      classification: match.classification,
      browserReachability: match.browserReachability,
    };
  }
  return {
    module: 'unknown',
    owner: 'unknown',
    classification: 'unknown',
    browserReachability: 'requires review',
  };
}

function loadBuildMetadata(distDir) {
  return readJsonIfExists(path.join(distDir, METADATA_PATH));
}

function loadViteManifest(distDir) {
  return readJsonIfExists(path.join(distDir, VITE_MANIFEST_PATH));
}

function manifestEntryFiles(viteManifest) {
  return new Set(
    Object.values(viteManifest ?? {})
      .filter(entry => entry?.isEntry && typeof entry.file === 'string')
      .map(entry => entry.file),
  );
}

function staticEntryChunkFiles(metadata, viteManifest) {
  const byFile = new Map((metadata?.chunks ?? []).map(chunk => [chunk.fileName, chunk]));
  const stack = [...manifestEntryFiles(viteManifest)];
  const reachable = new Set();

  while (stack.length > 0) {
    const fileName = stack.pop();
    if (!fileName || reachable.has(fileName)) continue;
    reachable.add(fileName);

    const chunk = byFile.get(fileName);
    if (!chunk) continue;
    for (const imported of chunk.imports ?? []) {
      if (!reachable.has(imported)) stack.push(imported);
    }
  }

  return reachable;
}

function buildDefaultPyodideExposure(metadata, viteManifest, metricsByFile, distDir) {
  const staticChunks = staticEntryChunkFiles(metadata, viteManifest);
  const findings = [];

  for (const chunk of metadata?.chunks ?? []) {
    if (!staticChunks.has(chunk.fileName)) continue;
    const file = path.join(distDir, chunk.fileName).replace(/\\/g, '/');
    const pyodideModules = (chunk.modules ?? [])
      .filter(module => (module.packageName ?? packageNameFromModuleId(module.id)) === 'pyodide')
      .map(module => normalizeModuleId(module.id));

    if (pyodideModules.length > 0) {
      findings.push({
        file,
        ruleId: 'default-pyodide-package',
        severity: 'default-browser-python',
        fail: true,
        description: 'Pyodide package module is statically reachable from a default web entry chunk',
        match: 'pyodide',
        snippet: pyodideModules.slice(0, 3).join(', '),
      });
      continue;
    }

    const text = metricsByFile.get(file)?.text ?? '';
    const re = /\b(?:loadPyodide|runPython|runPythonAsync)\b/g;
    let match;
    while ((match = re.exec(text))) {
      findings.push({
        file,
        ruleId: 'default-pyodide-api',
        severity: 'default-browser-python',
        fail: true,
        description: 'Pyodide API call is statically reachable from a default web entry chunk',
        match: match[0],
        snippet: snippet(text, match.index),
      });
      if (match[0].length === 0) re.lastIndex += 1;
    }
  }

  for (const [file, metrics] of metricsByFile) {
    if (!file.endsWith('.html')) continue;
    const re = /<script[^>]+(?:pyodide|loadPyodide)[^>]*>/gi;
    let match;
    while ((match = re.exec(metrics.text))) {
      findings.push({
        file,
        ruleId: 'default-pyodide-html',
        severity: 'default-browser-python',
        fail: true,
        description: 'Default HTML loads a Pyodide script',
        match: match[0],
        snippet: snippet(metrics.text, match.index),
      });
      if (match[0].length === 0) re.lastIndex += 1;
    }
  }

  return findings.sort((a, b) => (
    a.file.localeCompare(b.file)
    || a.ruleId.localeCompare(b.ruleId)
    || a.match.localeCompare(b.match)
  ));
}

function buildOwnershipSummary(metadata, owners) {
  const summary = new Map();
  const packageSummary = new Map();

  for (const chunk of metadata?.chunks ?? []) {
    for (const module of chunk.modules ?? []) {
      const renderedLength = Number(module.renderedLength ?? 0);
      if (module.packageName || packageNameFromModuleId(module.id)) {
        const packageName = module.packageName ?? packageNameFromModuleId(module.id);
        const owner = dependencyOwner(packageName);
        const key = `package:${packageName}`;
        const current = packageSummary.get(key) ?? {
          type: 'package',
          name: packageName,
          owner: owner.owner,
          classification: 'third-party',
          purpose: owner.purpose,
          modules: 0,
          renderedBytes: 0,
          chunks: new Set(),
        };
        current.modules += 1;
        current.renderedBytes += renderedLength;
        current.chunks.add(chunk.fileName);
        packageSummary.set(key, current);
      } else {
        const owner = sourceOwner(module.id, owners);
        const key = `source:${owner.module}`;
        const current = summary.get(key) ?? {
          type: 'source',
          name: owner.module,
          owner: owner.owner,
          classification: owner.classification,
          browserReachability: owner.browserReachability,
          modules: 0,
          renderedBytes: 0,
          chunks: new Set(),
        };
        current.modules += 1;
        current.renderedBytes += renderedLength;
        current.chunks.add(chunk.fileName);
        summary.set(key, current);
      }
    }
  }

  return [...summary.values(), ...packageSummary.values()]
    .map(item => ({ ...item, chunks: item.chunks.size }))
    .sort((a, b) => b.renderedBytes - a.renderedBytes || a.name.localeCompare(b.name));
}

function isLibp2pPackage(packageName) {
  return LIBP2P_PACKAGES.includes(packageName)
    || packageName.startsWith('@libp2p/')
    || packageName.startsWith('@chainsafe/libp2p-');
}

function chunkTextForFile(metricsByFile, fileName, distDir) {
  const relative = path.join(distDir, fileName).replace(/\\/g, '/');
  return metricsByFile.get(relative)?.text ?? '';
}

function buildLibp2pChunks(metadata, metricsByFile, distDir) {
  const chunks = [];
  const seen = new Set();

  for (const chunk of metadata?.chunks ?? []) {
    const text = chunkTextForFile(metricsByFile, chunk.fileName, distDir);
    const moduleReasons = [];
    for (const module of chunk.modules ?? []) {
      const packageName = module.packageName ?? packageNameFromModuleId(module.id);
      const normalized = normalizeModuleId(module.id);
      if (packageName && isLibp2pPackage(packageName)) {
        moduleReasons.push(`package:${packageName}`);
      } else if (LIBP2P_PATTERNS.some(pattern => pattern.test(normalized))) {
        moduleReasons.push(`module:${normalized}`);
      }
    }

    const textMatch = LIBP2P_PATTERNS.some(pattern => pattern.test(text));
    if (moduleReasons.length === 0 && !textMatch && !LIBP2P_PATTERNS.some(pattern => pattern.test(chunk.fileName))) {
      continue;
    }

    const relative = path.join(distDir, chunk.fileName).replace(/\\/g, '/');
    const metrics = metricsByFile.get(relative);
    if (!metrics || seen.has(relative)) continue;
    seen.add(relative);
    chunks.push({
      file: relative,
      rawBytes: metrics.rawBytes,
      gzipBytes: metrics.gzipBytes,
      brotliBytes: metrics.brotliBytes,
      modules: moduleReasons.slice(0, 8),
      reason: moduleReasons.length > 0 ? moduleReasons.slice(0, 3).join(', ') : 'libp2p text reference',
    });
  }

  for (const [file, metrics] of metricsByFile) {
    if (seen.has(file) || !file.endsWith('.js')) continue;
    if (!LIBP2P_PATTERNS.some(pattern => pattern.test(metrics.text))) continue;
    seen.add(file);
    chunks.push({
      file,
      rawBytes: metrics.rawBytes,
      gzipBytes: metrics.gzipBytes,
      brotliBytes: metrics.brotliBytes,
      modules: [],
      reason: 'libp2p text reference',
    });
  }

  return chunks.sort((a, b) => b.rawBytes - a.rawBytes || a.file.localeCompare(b.file));
}

function sourceLibp2pPackages() {
  const sourceFiles = [
    'src/services/mcp/libp2p-browser-runtime.ts',
    'src/services/mcp/mcp-discovery.ts',
  ];
  const packages = new Set();
  const packageSpecifier = /^(?:libp2p|@libp2p\/[a-z0-9._-]+|@chainsafe\/libp2p-[a-z0-9._-]+|@multiformats\/multiaddr)$/i;
  for (const file of sourceFiles) {
    if (!fs.existsSync(abs(file))) continue;
    const text = fs.readFileSync(abs(file), 'utf8');
    for (const match of text.matchAll(/(['"])([^'"\n]{1,160})\1/g)) {
      for (const candidate of match[2].split('|').map(value => value.trim())) {
        if (packageSpecifier.test(candidate)) packages.add(candidate);
      }
    }
  }
  return [...packages].sort(compareStrings);
}

function dependencyInventory(packageJson, ownershipSummary) {
  const bundledPackages = new Map();
  for (const item of ownershipSummary) {
    if (item.type !== 'package') continue;
    bundledPackages.set(item.name, item);
  }

  const names = new Set([
    ...LIBP2P_PACKAGES,
    'pyodide',
    ...sourceLibp2pPackages(),
    ...bundledPackages.keys(),
  ]);

  return [...names].sort(compareStrings).map(packageName => {
    const owner = dependencyOwner(packageName);
    const bundled = bundledPackages.get(packageName);
    const bucket = dependencyBucket(packageJson, packageName);
    const version = packageJson[bucket]?.[packageName] ?? null;
    return {
      packageName,
      bucket,
      version,
      owner: owner.owner,
      purpose: owner.purpose,
      bundledModules: bundled?.modules ?? 0,
      renderedBytes: bundled?.renderedBytes ?? 0,
    };
  });
}

function budgetResults(totals, libp2pTotals, budgets) {
  return [
    { name: 'totalRawBytes', actual: totals.rawBytes, budget: budgets.totalRawBytes, pass: totals.rawBytes <= budgets.totalRawBytes },
    { name: 'totalGzipBytes', actual: totals.gzipBytes, budget: budgets.totalGzipBytes, pass: totals.gzipBytes <= budgets.totalGzipBytes },
    { name: 'totalBrotliBytes', actual: totals.brotliBytes, budget: budgets.totalBrotliBytes, pass: totals.brotliBytes <= budgets.totalBrotliBytes },
    { name: 'libp2pRawBytes', actual: libp2pTotals.rawBytes, budget: budgets.libp2pRawBytes, pass: libp2pTotals.rawBytes <= budgets.libp2pRawBytes },
    { name: 'libp2pGzipBytes', actual: libp2pTotals.gzipBytes, budget: budgets.libp2pGzipBytes, pass: libp2pTotals.gzipBytes <= budgets.libp2pGzipBytes },
    { name: 'libp2pBrotliBytes', actual: libp2pTotals.brotliBytes, budget: budgets.libp2pBrotliBytes, pass: libp2pTotals.brotliBytes <= budgets.libp2pBrotliBytes },
    { name: 'libp2pChunkCount', actual: libp2pTotals.chunkCount, budget: budgets.libp2pChunkCount, pass: libp2pTotals.chunkCount <= budgets.libp2pChunkCount },
  ];
}

function sumMetrics(items) {
  return items.reduce((acc, item) => ({
    rawBytes: acc.rawBytes + item.rawBytes,
    gzipBytes: acc.gzipBytes + item.gzipBytes,
    brotliBytes: acc.brotliBytes + item.brotliBytes,
  }), { rawBytes: 0, gzipBytes: 0, brotliBytes: 0 });
}

function renderTable(headers, rows) {
  if (rows.length === 0) return '_None._\n';
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
  ];
  for (const row of rows) {
    lines.push(`| ${row.map(markdownEscape).join(' |')} |`);
  }
  return `${lines.join('\n')}\n`;
}

function renderReport(audit) {
  const budgetJson = JSON.stringify(audit.budgets, null, 2);
  const budgetRows = audit.budgetResults.map(result => [
    result.name,
    result.name.endsWith('Count') ? result.actual : formatBytes(result.actual),
    result.name.endsWith('Count') ? result.budget : formatBytes(result.budget),
    result.pass ? 'pass' : 'fail',
  ]);

  const libp2pRows = audit.libp2p.chunks.map(chunk => [
    chunk.file,
    formatBytes(chunk.rawBytes),
    formatBytes(chunk.gzipBytes),
    formatBytes(chunk.brotliBytes),
    chunk.reason,
  ]);

  const hostRows = audit.hostLeakage.map(finding => [
    finding.severity,
    finding.ruleId,
    finding.file,
    finding.match,
    finding.snippet,
  ]);

  const pythonRows = audit.pythonExposure.map(finding => [
    finding.severity,
    finding.ruleId,
    finding.file,
    finding.match,
    finding.snippet,
  ]);

  const defaultPyodideRows = audit.defaultPyodideExposure.map(finding => [
    finding.severity,
    finding.ruleId,
    finding.file,
    finding.match,
    finding.snippet,
  ]);

  const ownershipRows = audit.ownershipSummary.slice(0, 30).map(item => [
    item.type,
    item.name,
    item.owner,
    item.classification,
    item.modules,
    item.chunks,
    formatBytes(item.renderedBytes),
  ]);

  const dependencyRows = audit.dependencyInventory.map(item => [
    item.packageName,
    item.bucket,
    item.version ?? '',
    item.owner,
    item.bundledModules,
    formatBytes(item.renderedBytes),
  ]);

  const topFileRows = audit.files.slice(0, 20).map(file => [
    file.file,
    formatBytes(file.rawBytes),
    formatBytes(file.gzipBytes),
    formatBytes(file.brotliBytes),
  ]);

  return [
    '# Browser Bundle Budget',
    '',
    'This report is generated by `npm run bundle:audit:web` after the Vite web build.',
    'The JSON block below is the release budget source of truth; increasing a budget is a deliberate review action.',
    '',
    '```json bundle-budget',
    budgetJson,
    '```',
    '',
    '## Gate Summary',
    '',
    `- Total bundle: ${formatBytes(audit.totals.rawBytes)} raw, ${formatBytes(audit.totals.gzipBytes)} gzip, ${formatBytes(audit.totals.brotliBytes)} brotli across ${audit.fileCount} files.`,
    `- libp2p-related chunks: ${formatBytes(audit.libp2p.totals.rawBytes)} raw, ${formatBytes(audit.libp2p.totals.gzipBytes)} gzip across ${audit.libp2p.totals.chunkCount} chunks.`,
    `- Host-only leakage findings: ${audit.hostLeakage.length}.`,
    `- Python/Pyodide exposure findings: ${audit.pythonExposure.length}.`,
    `- Default Pyodide exposure findings: ${audit.defaultPyodideExposure.length}.`,
    `- Vite manifest: ${audit.viteManifestPresent ? 'present' : 'missing'}. Rollup ownership metadata: ${audit.metadataPresent ? 'present' : 'missing'}.`,
    '',
    renderTable(['Budget', 'Actual', 'Limit', 'Status'], budgetRows),
    '',
    '## libp2p Chunks',
    '',
    renderTable(['File', 'Raw', 'Gzip', 'Brotli', 'Reason'], libp2pRows),
    '',
    '## Host-Only Leakage',
    '',
    renderTable(['Severity', 'Rule', 'File', 'Match', 'Context'], hostRows),
    '',
    '## Python And Pyodide Exposure',
    '',
    renderTable(['Severity', 'Rule', 'File', 'Match', 'Context'], pythonRows),
    '',
    '## Default Pyodide Exposure',
    '',
    renderTable(['Severity', 'Rule', 'File', 'Match', 'Context'], defaultPyodideRows),
    '',
    '## Dependency Ownership',
    '',
    renderTable(['Type', 'Name', 'Owner', 'Classification', 'Modules', 'Chunks', 'Rendered Bytes'], ownershipRows),
    '',
    '## Package Inventory',
    '',
    renderTable(['Package', 'Declaration', 'Version', 'Owner', 'Bundled Modules', 'Rendered Bytes'], dependencyRows),
    '',
    '## Largest Files',
    '',
    renderTable(['File', 'Raw', 'Gzip', 'Brotli'], topFileRows),
  ].join('\n');
}

function run(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }

  const distDir = args.dist.replace(/\\/g, '/').replace(/\/$/, '');
  if (!fs.existsSync(abs(distDir))) {
    throw new Error(`Build output not found: ${distDir}. Run npm run build:web first.`);
  }

  const budgets = loadBudgets(args.report);
  const packageJson = readJsonIfExists('package.json') ?? {};
  const owners = loadOwnershipManifest();
  const metadata = loadBuildMetadata(distDir);
  const viteManifest = loadViteManifest(distDir);

  const files = walkFiles(distDir)
    .filter(file => !file.includes('/.vite/'))
    .map(fileMetrics)
    .sort((a, b) => b.rawBytes - a.rawBytes || a.file.localeCompare(b.file));
  const metricsByFile = new Map(files.map(file => [file.file, file]));
  const totals = sumMetrics(files);
  const libp2pChunks = buildLibp2pChunks(metadata, metricsByFile, distDir);
  const libp2pMetrics = sumMetrics(libp2pChunks);
  const libp2pTotals = {
    ...libp2pMetrics,
    chunkCount: libp2pChunks.length,
  };
  const ownershipSummary = buildOwnershipSummary(metadata, owners);
  const hostLeakage = scanRules(files, HOST_LEAKAGE_RULES);
  const pythonExposure = scanRules(files, PYTHON_EXPOSURE_RULES);
  const defaultPyodideExposure = buildDefaultPyodideExposure(metadata, viteManifest, metricsByFile, distDir);
  const results = budgetResults(totals, libp2pTotals, budgets);

  const audit = {
    schemaVersion: 1,
    distDir,
    budgets,
    fileCount: files.length,
    totals,
    files: files.map(({ text, ...file }) => file),
    libp2p: {
      totals: libp2pTotals,
      chunks: libp2pChunks,
      sourcePackages: sourceLibp2pPackages(),
    },
    hostLeakage,
    pythonExposure,
    defaultPyodideExposure,
    ownershipSummary,
    dependencyInventory: dependencyInventory(packageJson, ownershipSummary),
    budgetResults: results,
    viteManifestPresent: Boolean(viteManifest),
    metadataPresent: Boolean(metadata),
  };

  if (args.json) {
    ensureParent(args.json);
    fs.writeFileSync(abs(args.json), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  }

  if (args.report) {
    ensureParent(args.report);
    fs.writeFileSync(abs(args.report), `${renderReport(audit)}\n`, 'utf8');
  }

  const failedBudgets = results.filter(result => !result.pass);
  const failedHostLeakage = hostLeakage.filter(finding => finding.fail);
  const failedDefaultPyodide = defaultPyodideExposure.filter(finding => finding.fail);
  const failures = [];
  if (args.failOnBudget && failedBudgets.length > 0) {
    failures.push(`bundle budgets exceeded: ${failedBudgets.map(result => result.name).join(', ')}`);
  }
  if (args.failOnHostLeakage && failedHostLeakage.length > 0) {
    failures.push(`host-only leakage detected: ${failedHostLeakage.length} finding(s)`);
  }
  if (args.failOnDefaultPyodide && failedDefaultPyodide.length > 0) {
    failures.push(`default Pyodide runtime detected: ${failedDefaultPyodide.length} finding(s)`);
  }
  if (!metadata) {
    failures.push(`bundle metadata missing: ${path.join(distDir, METADATA_PATH)}`);
  }
  if (!viteManifest) {
    failures.push(`Vite manifest missing: ${path.join(distDir, VITE_MANIFEST_PATH)}`);
  }

  console.log([
    `Audited ${files.length} web bundle files (${formatBytes(totals.rawBytes)} raw, ${formatBytes(totals.gzipBytes)} gzip).`,
    `libp2p: ${libp2pChunks.length} chunk(s), ${formatBytes(libp2pTotals.rawBytes)} raw.`,
    `host leakage: ${hostLeakage.length}; Python/Pyodide exposure: ${pythonExposure.length}; default Pyodide: ${defaultPyodideExposure.length}.`,
  ].join('\n'));

  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL: ${failure}`);
    return 1;
  }

  return 0;
}

try {
  process.exitCode = run(process.argv.slice(2));
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
