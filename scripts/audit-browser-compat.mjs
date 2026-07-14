#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const SOURCE_EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
];

const ASSET_EXTENSIONS = new Set([
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.wasm',
  '.mid',
  '.musicxml',
  '.map',
]);

const HOST_ONLY_NODE_MODULES = new Set([
  'child_process',
  'cluster',
  'dgram',
  'dns',
  'fs',
  'fs/promises',
  'module',
  'net',
  'perf_hooks',
  'readline',
  'repl',
  'tls',
  'tty',
  'v8',
  'vm',
  'worker_threads',
]);

const POLYFILLED_NODE_MODULES = new Set([
  'assert',
  'buffer',
  'constants',
  'crypto',
  'events',
  'http',
  'https',
  'os',
  'path',
  'process',
  'querystring',
  'stream',
  'url',
  'util',
  'zlib',
]);

// SWR-042: files whose dynamic `import(<expression>)` calls are known,
// policy-gated, browser-safe capability loaders (allowlisted CDN/NPM
// specifiers, optional package probing with explicit capability gaps, or a
// hardcoded local constant guarded by validation). Each entry documents the
// import-chain evidence and why the non-literal import cannot leak a
// host-only module into the browser bundle graph. See
// `docs/browser-compatibility-inventory.md` and
// `implementation_plan/docs/39-swissknife-browser-compatibility-followups-2026-07-08.todo.md`
// for the residual-item remediation record.
const DYNAMIC_IMPORT_VARIABLE_ALLOWLIST = new Map([
  [
    'src/services/mcp/libp2p-browser-runtime.ts',
    'browser libp2p optional package loader with explicit capability gaps',
  ],
  [
    'web/js/core/strudel-cdn-loader.js',
    'browser CDN/NPM loader restricted to explicit allowlisted specifiers validated at runtime (see isAllowedStrudelSpecifier)',
  ],
  [
    'web/js/apps/file-manager.js',
    'optional collaborative filesystem loader restricted to a single hardcoded, runtime-validated module specifier with a local browser-safe fallback',
  ],
]);

const EXTERNAL_BROWSER_PACKAGES = new Set([
  '@anthropic-ai/sdk',
  '@modelcontextprotocol/sdk',
  '@multiformats/multiaddr',
  '@statsig/js-client',
  'debug',
  'lodash-es',
  'nanoid',
  'openai',
  'react',
  'react-dom',
  'snarkjs',
  'z3-solver',
  'zod',
]);

// This map is deliberately contract-level evidence rather than another broad
// path inventory. Each target is the browser-safe public entrypoint owned by
// its service family in src/module-ownership.json. Compatibility aliases may
// share a target, but may not introduce a second implementation.
const CANONICAL_BROWSER_PACKAGE_EXPORTS = Object.freeze({
  '.': 'src/browser.ts',
  './browser': 'src/browser.ts',
  './mcp': 'src/services/mcp/browser-mcp.ts',
  './mcp/libp2p': 'src/services/mcp/libp2p-browser-runtime.ts',
  './libp2p': 'src/services/mcp/libp2p-browser-runtime.ts',
  './ipfs': 'src/services/ipfs/ipfs-browser.ts',
  './storage': 'src/storage/browser.ts',
  './workers': 'src/workers/browser.ts',
  './logic-language': 'src/services/logic/api/reasoning-normalization-pipeline.ts',
  './deontic-nlp': 'src/services/logic/deontic/browser-nlp.ts',
  './zkp': 'src/services/zkp/browser-zkp.ts',
  './proof-engine': 'src/services/proof-engine/proof-engine-browser.ts',
  './provers': 'src/services/provers/provers-browser.ts',
});

const BROWSER_PACKAGE_COMPATIBILITY_ALIASES = Object.freeze([
  ['./libp2p', './mcp/libp2p'],
]);

const ROOT_PATTERNS = [
  { path: 'web/index.html', kind: 'vite-html-entry', reason: 'Vite web build input from vite.web.config.ts' },
  { path: 'web/index.vite.html', kind: 'alternate-web-app', reason: 'Alternate Vite desktop shell kept in web root' },
  { path: 'web/index-simple.html', kind: 'alternate-web-app', reason: 'Legacy simple browser shell in web root' },
  { path: 'web/index-enhanced.html', kind: 'alternate-web-app', reason: 'Legacy enhanced browser shell in web root' },
  { path: 'web/src/browser-main-working.ts', kind: 'webpack-browser-entry', reason: 'Entry in web/webpack.browser.config.js' },
  { path: 'web/src/browser-main.ts', kind: 'browser-entry', reason: 'Browser TypeScript entrypoint' },
  { path: 'web/src/browser-main-simple.ts', kind: 'browser-entry', reason: 'Browser TypeScript entrypoint' },
  { path: 'web/src/browser-main-enhanced.ts', kind: 'browser-entry', reason: 'Browser TypeScript entrypoint' },
  { path: 'web/src/swissknife-browser-bridge.ts', kind: 'browser-entry', reason: 'Browser bridge entrypoint' },
  { path: 'web/main.ts', kind: 'vite-ts-entry', reason: 'Vite TypeScript desktop entry candidate' },
  { path: 'web/desktop.ts', kind: 'vite-ts-entry', reason: 'Alternate index.vite.html TypeScript entry' },
];

const HOST_ONLY_SOURCE_PATTERNS = [
  { re: /^src\/(?:cli|cli-phase1|cli-simple)\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'cli', message: 'imports host CLI entry module' },
  { re: /^src\/cli\//, category: 'cli', message: 'imports legacy host CLI module' },
  { re: /^src\/commands(?:\.ts|\/)/, category: 'commands', message: 'imports host command module' },
  { re: /^src\/command-registry\.ts$/, category: 'commands', message: 'imports host command registry' },
  { re: /^src\/entrypoints\//, category: 'entrypoints', message: 'imports host process entrypoint' },
  { re: /^src\/platform\/host\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'platform-host', message: 'imports host platform adapter' },
  { re: /^src\/components\//, category: 'terminal-ui', message: 'imports host terminal UI component' },
  { re: /^src\/screens\//, category: 'terminal-ui', message: 'imports host terminal screen' },
  { re: /^src\/hooks\//, category: 'terminal-ui', message: 'imports host terminal hook' },
  { re: /^src\/tools(?:\.ts|\/)/, category: 'command-execution', message: 'imports host command/tool execution module' },
  { re: /^src\/utils\/(?:PersistentShell|execFileNoThrow|file|git|native-loader)\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'command-execution', message: 'imports host execution/filesystem utility' },
  { re: /^src\/storage\/(?:backends\/filesystem|local\/file-storage)\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'filesystem', message: 'imports host filesystem storage backend' },
  { re: /^src\/workers\/(?:pool|worker-pool|worker-thread|thread|worker)\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'worker', message: 'imports Node worker runtime' },
];

const FINDING_RULES = [
  {
    category: 'subprocess',
    severity: 'host-only',
    re: /(^|[^\w.])(?:spawn|spawnSync|exec|execFile|execFileSync|execSync)\s*\(/g,
    message: 'subprocess API call',
  },
  {
    category: 'filesystem',
    severity: 'host-only',
    re: /\b(?:readFileSync|writeFileSync|existsSync|mkdirSync|statSync|createReadStream|createWriteStream|fs\.(?:read|write|mkdir|readdir|stat|unlink|exists|create))/g,
    message: 'filesystem API usage',
  },
  {
    category: 'native-binary',
    severity: 'host-only',
    re: /(?:["'`][^"'`]+\.node["'`]|\bnative-loader\b|\bloadNativeModule\b|\bnative module\b|\bnative-modules\b|\bbridge\.node\b)/gi,
    message: 'native binary/module dependency',
  },
  {
    category: 'pyodide',
    severity: 'browser-safe',
    re: /\b(?:loadPyodide|pyodide|runPythonAsync|runPython)\b/g,
    message: 'Pyodide or in-browser Python runtime',
  },
  {
    category: 'python',
    severity: 'unknown',
    re: /\b(?:swissknife\.python|python\.execute|Python runtime|python subprocess)\b/gi,
    message: 'Python execution wrapper',
  },
  {
    category: 'remote-wrapper',
    severity: 'browser-safe',
    re: /\b(?:fetch\s*\(|XMLHttpRequest|WebSocket\s*\(|EventSource\s*\(|mcpClient\.request|desktop\.swissknife|window\.mcpClient|cloudflareIntegration\.deployWorker|deployWorker\s*\()/g,
    message: 'remote API or wrapper call',
  },
  {
    category: 'worker',
    severity: 'browser-safe',
    re: /\b(?:new\s+Worker|SharedWorker|serviceWorker|audioWorklet\.addModule|AudioWorkletNode)\b/g,
    message: 'browser worker/worklet dependency',
  },
];

function parseArgs(argv) {
  const args = {
    report: null,
    json: null,
    check: false,
    failOnHostImports: false,
    help: false,
    modules: new Set(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--report') {
      args.report = argv[++i];
    } else if (arg === '--json') {
      args.json = argv[++i];
    } else if (arg === '--check') {
      args.check = true;
    } else if (arg === '--fail-on-host-imports') {
      args.failOnHostImports = true;
    } else if (arg === '--module') {
      const moduleName = argv[++i];
      if (!moduleName) throw new Error('--module requires a module name');
      args.modules.add(moduleName);
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
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

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function lineNumberForOffset(text, offset) {
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function listFiles(dir, predicate, acc = []) {
  const absoluteDir = abs(dir);
  if (!exists(absoluteDir)) return acc;

  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const absolute = path.join(absoluteDir, entry.name);
    const relative = rel(absolute);
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules'
        || entry.name === 'dist'
        || entry.name === 'test-dist'
        || entry.name === '.vite'
        || entry.name === 'coverage'
      ) {
        continue;
      }
      listFiles(relative, predicate, acc);
    } else if (predicate(relative, absolute)) {
      acc.push(relative);
    }
  }

  return acc.sort();
}

function normalizeSpecifier(specifier) {
  return specifier.replace(/[?#].*$/, '');
}

function stripNodePrefix(specifier) {
  return specifier.startsWith('node:') ? specifier.slice(5) : specifier;
}

function isRelativeOrAbsoluteSpecifier(specifier) {
  return specifier.startsWith('.')
    || specifier.startsWith('/')
    || specifier.startsWith('@web/')
    || specifier.startsWith('@/') 
    || specifier.startsWith('@swissknife/')
    || specifier.startsWith('@ipfs/');
}

function isAssetSpecifier(specifier) {
  const clean = normalizeSpecifier(specifier);
  return ASSET_EXTENSIONS.has(path.extname(clean));
}

function candidatePaths(base) {
  const candidates = [];
  const ext = path.extname(base);

  if (ext) {
    candidates.push(base);
    if (ext === '.js' || ext === '.jsx' || ext === '.mjs') {
      const withoutExt = base.slice(0, -ext.length);
      candidates.push(`${withoutExt}.ts`, `${withoutExt}.tsx`, `${withoutExt}.jsx`);
    }
    if (base.endsWith('.js')) {
      const stripped = base.replace(/(?:\.js)+$/, '');
      candidates.push(`${stripped}.ts`, `${stripped}.tsx`, `${stripped}.js`);
    }
  } else {
    for (const sourceExtension of SOURCE_EXTENSIONS) {
      candidates.push(`${base}${sourceExtension}`);
    }
  }

  for (const sourceExtension of SOURCE_EXTENSIONS.filter(Boolean)) {
    candidates.push(path.join(base, `index${sourceExtension}`));
  }

  return [...new Set(candidates)];
}

function resolveLocalSpecifier(specifier, importer) {
  const normalized = normalizeSpecifier(specifier);
  if (isAssetSpecifier(normalized)) return { ignoredAsset: true };

  let base;
  if (normalized.startsWith('@web/')) {
    base = abs(path.join('web/src', normalized.slice('@web/'.length)));
  } else if (normalized.startsWith('@/')) {
    base = abs(path.join('src', normalized.slice('@/'.length)));
  } else if (normalized.startsWith('@swissknife/')) {
    base = abs(path.join('src', normalized.slice('@swissknife/'.length)));
  } else if (normalized.startsWith('@ipfs/')) {
    base = abs(path.join('ipfs_accelerate_js/src', normalized.slice('@ipfs/'.length)));
  } else if (normalized.startsWith('/')) {
    base = abs(path.join('web', normalized.slice(1)));
  } else if (normalized.startsWith('.')) {
    base = path.resolve(path.dirname(abs(importer)), normalized);
  } else {
    return null;
  }

  for (const candidate of candidatePaths(base)) {
    if (exists(candidate) && fs.statSync(candidate).isFile()) {
      return { path: rel(candidate) };
    }
  }

  return { unresolved: true, path: rel(base) };
}

function recordImport(imports, kind, specifier, line) {
  if (!specifier || specifier.startsWith('http://') || specifier.startsWith('https://')) return;
  imports.push({ kind, specifier: normalizeSpecifier(specifier), line });
}

/**
 * Locates non-literal `import(<expression>)` calls (i.e. dynamic imports
 * whose specifier is not a plain string literal). This is a small manual
 * scanner rather than a single regex because a naive
 * `import\s*\(\s*([^"'\`\s][^)]+)\)` pattern has two classes of false
 * positives fixed by SWR-042:
 *
 *  - It greedily searches for the *next* `)` anywhere later in the file
 *    (including across unrelated lines), so prose like `` `import()` calls
 *    ... (see docs)`` inside a comment can span into unrelated code and
 *    falsely report a finding several lines away.
 *  - It does not distinguish the `import()` expression keyword from a
 *    property/method access named `import` (e.g. `this.models.import(...)`),
 *    which is valid, unrelated JavaScript.
 *
 * This scanner fixes both: it requires `import(` to not be preceded by `.`
 * (excludes method calls), it skips a single leading `/* ... *\/` comment
 * before inspecting the first real character of the argument, and it never
 * looks past the current line or an empty argument list.
 */
function findNonLiteralDynamicImportLines(text) {
  const lines = [];
  const callRe = /(?<!\.)\bimport\s*\(/g;
  let match;
  while ((match = callRe.exec(text))) {
    let i = match.index + match[0].length;
    const skipWhitespace = () => {
      while (i < text.length && /\s/.test(text[i])) i += 1;
    };

    skipWhitespace();
    if (text[i] === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end !== -1) {
        i = end + 2;
        skipWhitespace();
      }
    }

    const nextChar = text[i];
    if (nextChar === undefined || nextChar === ')' || nextChar === '"' || nextChar === "'" || nextChar === '`') {
      // Empty argument list, or a literal string/template specifier: not a
      // non-literal dynamic import. Literal specifiers are captured by the
      // `dynamic-import` regex in `extractImports` instead.
      continue;
    }

    lines.push(lineNumberForOffset(text, match.index));
  }
  return lines;
}

function extractImports(filePath, text) {
  const imports = [];
  const ext = path.extname(filePath);

  if (ext === '.html') {
    const scriptRe = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
    for (const match of text.matchAll(scriptRe)) {
      recordImport(imports, 'html-script', match[1], lineNumberForOffset(text, match.index ?? 0));
    }
    return imports;
  }

  const regexes = [
    { kind: 'static-import', re: /\bimport\s+(?:type\s+)?(?:[^'"()]*?\s+from\s*)?["']([^"'\n]+)["']/g },
    // Negative lookbehind excludes matches where "import" is the tail of a
    // hyphenated string token such as `'dynamic-import'` or
    // `'side-effect-import'` (common in this codebase's own manifest/audit
    // vocabulary); without it, the closing quote of that token is
    // mistaken for the opening quote of a side-effect import specifier and
    // the match runs on until the next unrelated quote in the file
    // (SWR-042 / SWR-036-FU-001 false positive).
    { kind: 'side-effect-import', re: /(?<!-)\bimport\s*["']([^"'\n]+)["']/g },
    { kind: 'export-from', re: /\bexport\s+(?:type\s+)?(?:[^'"()]*?\s+from\s*)?["']([^"'\n]+)["']/g },
    // Negative lookbehind excludes `object.import(...)` method calls (e.g.
    // `this.models.import(...)`), which are unrelated JavaScript, not the
    // `import()` expression (SWR-042 / SWR-036-FU-004).
    { kind: 'dynamic-import', re: /(?<!\.)\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)?["']([^"'\n]+)["']\s*\)/g },
    { kind: 'require', re: /\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g },
    { kind: 'url-dependency', re: /\bnew\s+URL\s*\(\s*["']([^"'\n]+)["']\s*,\s*import\.meta\.url\s*\)/g },
    { kind: 'worker-script', re: /\b(?:new\s+)?(?:Worker|SharedWorker)\s*\(\s*["']([^"'\n]+)["']/g },
    { kind: 'worklet-script', re: /\baudioWorklet\.addModule\s*\(\s*["']([^"'\n]+)["']/g },
  ];

  for (const { kind, re } of regexes) {
    for (const match of text.matchAll(re)) {
      recordImport(imports, kind, match[1], lineNumberForOffset(text, match.index ?? 0));
    }
  }

  for (const line of findNonLiteralDynamicImportLines(text)) {
    imports.push({ kind: 'dynamic-import-variable', specifier: '<non-literal>', line });
  }

  return dedupeBy(imports, (item) => `${item.kind}:${item.specifier}:${item.line}`);
}

function analyzeFile(filePath) {
  const absolute = abs(filePath);
  if (!exists(absolute)) {
    return {
      path: filePath,
      imports: [],
      findings: [{
        category: 'missing-file',
        severity: 'unknown',
        file: filePath,
        line: 1,
        message: 'inventory root is missing',
      }],
    };
  }

  const text = readText(absolute);
  const imports = extractImports(filePath, text);
  const findings = [];

  for (const item of imports) {
    const bare = stripNodePrefix(item.specifier);
    if (HOST_ONLY_NODE_MODULES.has(bare)) {
      findings.push({
        category: 'node',
        severity: 'host-only',
        file: filePath,
        line: item.line,
        message: `imports Node host module "${item.specifier}"`,
      });
    } else if (POLYFILLED_NODE_MODULES.has(bare)) {
      findings.push({
        category: 'node',
        severity: 'browser-safe',
        file: filePath,
        line: item.line,
        message: `imports Node-compatible module "${item.specifier}" through browser polyfill/config`,
      });
    } else if (item.kind === 'dynamic-import-variable' && DYNAMIC_IMPORT_VARIABLE_ALLOWLIST.has(filePath)) {
      findings.push({
        category: 'dynamic-import',
        severity: 'browser-safe',
        file: filePath,
        line: item.line,
        message: DYNAMIC_IMPORT_VARIABLE_ALLOWLIST.get(filePath),
      });
    } else if (item.kind === 'dynamic-import-variable') {
      findings.push({
        category: 'dynamic-import',
        severity: 'unknown',
        file: filePath,
        line: item.line,
        message: 'contains non-literal dynamic import',
      });
    }
  }

  for (const rule of FINDING_RULES) {
    for (const match of text.matchAll(rule.re)) {
      findings.push({
        category: rule.category,
        severity: rule.severity,
        file: filePath,
        line: lineNumberForOffset(text, match.index ?? 0),
        message: rule.message,
      });
    }
  }

  return {
    path: filePath,
    imports,
    findings: dedupeBy(findings, (finding) => `${finding.category}:${finding.severity}:${finding.file}:${finding.line}:${finding.message}`),
  };
}

function buildGraph() {
  const allFiles = new Set([
    ...listFiles('web', (relative) => /\.(?:html|js|mjs|cjs|ts|tsx|jsx|json)$/.test(relative)),
    ...listFiles('src', (relative) => /\.(?:js|mjs|cjs|ts|tsx|jsx|json)$/.test(relative)),
    ...listFiles('ipfs_accelerate_js/src', (relative) => /\.(?:js|mjs|cjs|ts|tsx|jsx|json)$/.test(relative)),
  ]);

  const analyses = new Map();
  for (const filePath of allFiles) {
    analyses.set(filePath, analyzeFile(filePath));
  }

  const graph = new Map();
  const unresolved = new Map();
  const external = new Map();

  for (const [filePath, analysis] of analyses) {
    const edges = [];
    for (const item of analysis.imports) {
      if (item.kind === 'dynamic-import-variable') continue;
      if (!isRelativeOrAbsoluteSpecifier(item.specifier)) {
        const bare = stripNodePrefix(item.specifier);
        const record = {
          importer: filePath,
          line: item.line,
          specifier: item.specifier,
          kind: item.kind,
        };
        const bucket = external.get(bare) ?? [];
        bucket.push(record);
        external.set(bare, bucket);
        continue;
      }

      const resolved = resolveLocalSpecifier(item.specifier, filePath);
      if (!resolved || resolved.ignoredAsset) continue;
      if (resolved.path && analyses.has(resolved.path)) {
        edges.push({
          from: filePath,
          to: resolved.path,
          line: item.line,
          kind: item.kind,
          specifier: item.specifier,
        });
      } else if (resolved.unresolved) {
        const bucket = unresolved.get(filePath) ?? [];
        bucket.push({
          importer: filePath,
          line: item.line,
          specifier: item.specifier,
          attempted: resolved.path,
          kind: item.kind,
        });
        unresolved.set(filePath, bucket);
      }
    }
    graph.set(filePath, dedupeBy(edges, (edge) => `${edge.to}:${edge.line}:${edge.kind}:${edge.specifier}`));
  }

  return { analyses, graph, unresolved, external };
}

function discoverRoots(graphData) {
  const roots = new Map();
  const addRoot = (rootPath, kind, reason) => {
    if (!exists(abs(rootPath))) return;
    const existing = roots.get(rootPath);
    if (existing) {
      existing.kinds.add(kind);
      existing.reasons.add(reason);
      return;
    }
    roots.set(rootPath, {
      path: rootPath,
      kinds: new Set([kind]),
      reasons: new Set([reason]),
    });
  };

  for (const root of ROOT_PATTERNS) {
    addRoot(root.path, root.kind, root.reason);
  }

  for (const html of listFiles('web', (relative) => path.dirname(relative) === 'web' && relative.endsWith('.html'))) {
    const lower = path.basename(html).toLowerCase();
    const kind = /test|debug|demo|aero/.test(lower) ? 'simulated-test-html' : 'web-html';
    addRoot(html, kind, 'Top-level browser HTML document under web/');
  }

  for (const app of listFiles('web/js/apps', (relative) => relative.endsWith('.js') && !/-broken\.js$/.test(relative) && !/-old\.js$/.test(relative))) {
    addRoot(app, 'lazy-app-bundle', 'Browser desktop app bundle under web/js/apps/');
  }

  for (const worker of listFiles('web/js', (relative) => /(?:worker|worklet|processor)\.js$/.test(relative))) {
    addRoot(worker, 'browser-worker', 'Browser worker/worklet script under web/js/');
  }

  for (const support of [
    ...listFiles('web/js/core', (relative) => relative.endsWith('.js')),
    ...listFiles('web/js/adapters', (relative) => relative.endsWith('.js')),
    ...listFiles('web/src/adapters', (relative) => /\.(?:ts|tsx|js|jsx)$/.test(relative)),
    ...listFiles('web/src/utils', (relative) => /\.(?:ts|tsx|js|jsx)$/.test(relative)),
    ...listFiles('web/src/components', (relative) => /\.(?:ts|tsx|js|jsx)$/.test(relative)),
  ]) {
    addRoot(support, 'browser-support-module', 'Browser support utility reachable from web build roots or app bundles');
  }

  const reachableFromBuild = computeReachableFrom(
    ['web/index.html', 'web/src/browser-main-working.ts'].filter((item) => graphData.analyses.has(item)),
    graphData.graph,
  );

  for (const filePath of reachableFromBuild) {
    if (/^src\/shared\//.test(filePath) || /^src\/services\//.test(filePath) || /^src\/utils\//.test(filePath)) {
      addRoot(filePath, 'shared-reachable-module', 'Shared source module transitively reachable from active browser build roots');
    }
  }

  for (const service of listFiles('src/services', (relative) => {
    if (!/\.(?:ts|tsx|js|jsx)$/.test(relative)) return false;
    return /(?:registry|interface|public-api|mcp|bridge|browser|webapp|control-plane)/.test(path.basename(relative));
  })) {
    if (reachableFromBuild.has(service)) {
      addRoot(service, 'service-barrel', 'Service barrel/interface module transitively reachable from active browser build roots');
    }
  }

  return [...roots.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function moduleRootPaths(moduleName) {
  const manifestPath = abs('src/module-ownership.json');
  const roots = new Set();

  if (exists(manifestPath)) {
    try {
      const manifest = JSON.parse(readText(manifestPath));
      const moduleConfig = manifest.modules?.[moduleName];
      if (typeof moduleConfig?.path === 'string') {
        roots.add(moduleConfig.path);
      }
    } catch {
      // Module mode remains useful even if the ownership manifest is malformed.
    }
  }

  if (moduleName === 'ipfs') {
    roots.add('src/ipfs');
    roots.add('src/services/ipfs');
    roots.add('src/storage/ipfs');
    roots.add('src/storage/backends/ipfs-backend.ts');
  } else {
    roots.add(`src/${moduleName}`);
    roots.add(`src/services/${moduleName}`);
  }

  return [...roots].filter((root) => exists(abs(root)));
}

function sourceFilesUnder(rootPath) {
  const absolute = abs(rootPath);
  if (!exists(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    return /\.(?:ts|tsx|js|jsx|mjs|cjs|json)$/.test(rootPath) ? [rootPath] : [];
  }
  return listFiles(rootPath, (relative) => /\.(?:ts|tsx|js|jsx|mjs|cjs|json)$/.test(relative));
}

function isBrowserModuleEntrypoint(filePath) {
  const base = path.basename(filePath).toLowerCase();
  return /\bbrowser\b|\bweb\b/.test(base);
}

function discoverModuleRoots(moduleNames, graphData) {
  const roots = new Map();
  const addRoot = (rootPath, moduleName) => {
    if (!graphData.analyses.has(rootPath)) return;
    roots.set(rootPath, {
      path: rootPath,
      kinds: new Set([
        isBrowserModuleEntrypoint(rootPath)
          ? `module:${moduleName}:browser-entrypoint`
          : `module:${moduleName}:source`,
      ]),
      reasons: new Set([`Source module audit requested by --module ${moduleName}`]),
    });
  };

  for (const moduleName of moduleNames) {
    for (const rootPath of moduleRootPaths(moduleName)) {
      for (const filePath of sourceFilesUnder(rootPath)) {
        addRoot(filePath, moduleName);
      }
    }
  }

  return [...roots.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function computeReachableFrom(startFiles, graph) {
  const reachable = new Set();
  const queue = [...startFiles];
  while (queue.length > 0) {
    const filePath = queue.shift();
    if (reachable.has(filePath)) continue;
    reachable.add(filePath);
    for (const edge of graph.get(filePath) ?? []) {
      if (!reachable.has(edge.to)) queue.push(edge.to);
    }
  }
  return reachable;
}

function analyzeRoot(root, graphData) {
  const { analyses, graph, unresolved } = graphData;
  const reachable = [];
  const parent = new Map();
  const queue = [root.path];
  const seen = new Set();

  while (queue.length > 0) {
    const filePath = queue.shift();
    if (seen.has(filePath)) continue;
    seen.add(filePath);
    reachable.push(filePath);

    for (const edge of graph.get(filePath) ?? []) {
      if (!seen.has(edge.to) && !parent.has(edge.to)) {
        parent.set(edge.to, edge);
        queue.push(edge.to);
      }
    }
  }

  const findings = [];
  for (const filePath of reachable) {
    for (const rule of HOST_ONLY_SOURCE_PATTERNS) {
      if (rule.re.test(filePath)) {
        findings.push({
          category: rule.category,
          severity: 'host-only',
          file: filePath,
          line: 1,
          message: rule.message,
          chain: chainFor(root.path, filePath, parent),
        });
      }
    }

    const analysis = analyses.get(filePath);
    for (const finding of analysis?.findings ?? []) {
      findings.push({
        ...finding,
        chain: chainFor(root.path, finding.file, parent),
      });
    }
    for (const unresolvedImport of unresolved.get(filePath) ?? []) {
      findings.push({
        category: 'unresolved-import',
        severity: 'unknown',
        file: filePath,
        line: unresolvedImport.line,
        message: `unresolved ${unresolvedImport.kind} "${unresolvedImport.specifier}" (tried ${unresolvedImport.attempted})`,
        chain: chainFor(root.path, filePath, parent),
      });
    }
  }

  const uniqueFindings = dedupeBy(findings, (finding) => (
    `${finding.category}:${finding.severity}:${finding.file}:${finding.line}:${finding.message}`
  )).sort(compareFindings);

  return {
    ...root,
    kind: [...root.kinds].sort().join(', '),
    reason: [...root.reasons].sort().join('; '),
    reachable,
    findings: uniqueFindings,
    classification: classifyRoot(root, reachable, uniqueFindings),
  };
}

function chainFor(rootPath, targetPath, parent) {
  if (rootPath === targetPath) return [rootPath];
  const chain = [targetPath];
  let current = targetPath;
  const guard = new Set([current]);
  while (parent.has(current)) {
    const edge = parent.get(current);
    current = edge.from;
    if (guard.has(current)) break;
    guard.add(current);
    chain.push(current);
    if (current === rootPath) break;
  }
  return chain.reverse();
}

function classifyRoot(root, reachable, findings) {
  const kinds = [...root.kinds].join(' ');
  const rootPath = root.path.toLowerCase();
  const hasHostOnly = findings.some((finding) => finding.severity === 'host-only');
  const hasUnknown = findings.some((finding) => finding.severity === 'unknown');
  const simulated = /test|debug|demo|aero|mock|simulated|placeholder/.test(`${kinds} ${rootPath}`);

  if (hasHostOnly) return 'host-only';
  if (simulated) return 'simulated/test-only';
  if (hasUnknown) return 'unknown';
  return 'browser-safe';
}

function compareFindings(a, b) {
  const severityRank = { 'host-only': 0, unknown: 1, 'browser-safe': 2 };
  return (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9)
    || a.category.localeCompare(b.category)
    || a.file.localeCompare(b.file)
    || a.line - b.line
    || a.message.localeCompare(b.message);
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function summarizeFindings(findings) {
  const categories = new Map();
  for (const finding of findings) {
    const current = categories.get(finding.category) ?? 0;
    categories.set(finding.category, current + 1);
  }
  if (categories.size === 0) return 'none';
  return [...categories.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, count]) => `${category}:${count}`)
    .join(', ');
}

function escapeTable(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function formatChain(chain) {
  return chain.join(' -> ');
}

function formatFinding(finding) {
  return `- ${finding.severity} / ${finding.category}: ${formatChain(finding.chain)} -> ${finding.file}:${finding.line} - ${finding.message}`;
}

function resolveConditionalTarget(value, condition) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.hasOwn(value, condition)) {
    return resolveConditionalTarget(value[condition], 'default');
  }
  if (Object.hasOwn(value, 'default')) {
    return resolveConditionalTarget(value.default, 'default');
  }
  return null;
}

function sourceContractCheck(id, file, description, predicate) {
  const source = exists(abs(file)) ? readText(abs(file)) : '';
  return {
    id,
    file,
    description,
    passed: Boolean(source) && predicate(source),
  };
}

function buildCanonicalBrowserPublicApiAudit(graphData) {
  const pkg = JSON.parse(readText(abs('package.json')));
  const rows = [];
  const violations = [];

  for (const [subpath, expectedTarget] of Object.entries(CANONICAL_BROWSER_PACKAGE_EXPORTS)) {
    const declared = resolveConditionalTarget(pkg.exports?.[subpath], 'browser');
    const normalized = typeof declared === 'string' ? declared.replace(/^\.\//, '') : null;
    if (normalized !== expectedTarget) {
      violations.push(`${subpath} browser condition resolves to ${String(declared)}; expected ./${expectedTarget}`);
    }

    let graph = null;
    if (normalized && graphData.analyses.has(normalized)) {
      graph = analyzeRoot({
        path: normalized,
        kinds: new Set(['package-browser-public-entrypoint']),
        reasons: new Set([`package.json exports[${JSON.stringify(subpath)}].browser`]),
      }, graphData);
      if (graph.classification !== 'browser-safe') {
        const first = graph.findings.find(finding => finding.severity !== 'browser-safe');
        violations.push(`${subpath} reaches ${graph.classification} code${first ? ` at ${first.file}:${first.line}` : ''}`);
      }
    } else if (normalized) {
      violations.push(`${subpath} browser target is missing from the source graph: ${normalized}`);
    }

    rows.push({
      subpath,
      expectedTarget,
      declaredTarget: normalized,
      classification: graph?.classification ?? 'missing',
      reachableFiles: graph?.reachable.length ?? 0,
      hostFindings: graph?.findings.filter(finding => finding.severity === 'host-only').length ?? 0,
    });
  }

  for (const [alias, canonical] of BROWSER_PACKAGE_COMPATIBILITY_ALIASES) {
    const aliasTarget = resolveConditionalTarget(pkg.exports?.[alias], 'browser');
    const canonicalTarget = resolveConditionalTarget(pkg.exports?.[canonical], 'browser');
    if (!aliasTarget || aliasTarget !== canonicalTarget) {
      violations.push(`${alias} must remain an export-only compatibility alias of ${canonical}`);
    }
  }

  const semanticChecks = [
    sourceContractCheck(
      'libp2p-default-enabled',
      'src/services/mcp/libp2p-browser-runtime.ts',
      'libp2p is enabled unless explicitly disabled and its status receipt records defaultEnabled: true',
      source => /return value !== false/.test(source)
        && /enabled:\s*true/.test(source)
        && /defaultEnabled:\s*true/.test(source),
    ),
    sourceContractCheck(
      'libp2p-real-browser-transports',
      'src/services/mcp/libp2p-browser-runtime.ts',
      'literal browser imports configure WebRTC, WebSockets, circuit relay, Noise, and Yamux without synthetic transports',
      source => [
        "import('@libp2p/webrtc')",
        "import('@libp2p/websockets')",
        "import('@libp2p/circuit-relay-v2')",
        "import('@chainsafe/libp2p-noise')",
        "import('@chainsafe/libp2p-yamux')",
        'simulatedTransports: false',
      ].every(token => source.includes(token)),
    ),
    sourceContractCheck(
      'typed-remote-mcp-boundary',
      'src/services/mcp/agent-supervisor-console-gateway.ts',
      'remote Python-owned capabilities cross a typed MCP/MCP++/libp2p transport and default to a typed unavailable result',
      source => source.includes('AgentSupervisorGatewayTransport')
        && source.includes("const READ_TRANSPORTS = ['mcp', 'mcp++', 'libp2p']")
        && source.includes('createUnavailableAgentSupervisorTransport()')
        && source.includes("'transport_unavailable'"),
    ),
    sourceContractCheck(
      'typescript-theorem-default',
      'src/services/provers/provers-browser.ts',
      'the browser theorem default is real TypeScript execution and unsupported/native backends return typed unavailability',
      source => source.includes("DEFAULT_BROWSER_PROVER_BACKEND = 'typescript-truth-table'")
        && source.includes("execution: 'typescript'")
        && source.includes("code: 'BROWSER_PROVER_BACKEND_UNAVAILABLE'"),
    ),
    sourceContractCheck(
      'wasm-zkp-default',
      'src/services/zkp/browser-zkp.ts',
      'the browser ZKP default is the audited Schnorr WebAssembly backend and production selection rejects simulated identifiers',
      source => source.includes('DEFAULT_BROWSER_ZKP_BACKEND_ID = BROWSER_SCHNORR_BACKEND_ID')
        && source.includes('assertProductionBrowserZkpBackendId'),
    ),
    sourceContractCheck(
      'wasm-zkp-instantiation',
      'src/services/zkp/zkp-browser-schnorr.ts',
      'the default ZKP backend instantiates checked-in WebAssembly bytes',
      source => source.includes('WebAssembly.instantiate(BROWSER_SCHNORR_WASM_BYTES)')
        && source.includes('Schnorr WASM arithmetic helper failed its self-test'),
    ),
  ];

  for (const check of semanticChecks) {
    if (!check.passed) violations.push(`${check.id} failed in ${check.file}`);
  }

  return { rows, semanticChecks, violations };
}

function renderReport(results, graphData, publicApiAudit) {
  const counts = new Map();
  for (const result of results) {
    counts.set(result.classification, (counts.get(result.classification) ?? 0) + 1);
  }

  const activeBuildRoots = results.filter((result) => (
    result.path === 'web/index.html' || result.path === 'web/src/browser-main-working.ts'
  ));
  const distArtifacts = listFiles('web/dist', (relative) => /\.(?:html|js|css|ico|png|svg|wasm)$/.test(relative));

  const lines = [];
  lines.push('# Browser Compatibility Inventory');
  lines.push('');
  lines.push('Generated by `node scripts/audit-browser-compat.mjs --report docs/browser-compatibility-inventory.md`.');
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('- Active browser build inputs: `web/index.html` from `vite.web.config.ts` and `web/src/browser-main-working.ts` from `web/webpack.browser.config.js`.');
  lines.push('- Additional inventory roots: top-level web HTML documents, lazy app bundles in `web/js/apps`, browser workers/worklets, browser adapters/utilities, and shared/service modules reachable from active build roots.');
  lines.push('- Classification values: `browser-safe`, `host-only`, `simulated/test-only`, and `unknown`.');
  lines.push('- Evidence includes concrete import chains for Node host modules, filesystem/subprocess/native binary usage, Python/Pyodide references, worker/worklet usage, unresolved dynamic edges, and remote-wrapper/API calls.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Inventory items: ${results.length}`);
  lines.push(`- Browser-safe: ${counts.get('browser-safe') ?? 0}`);
  lines.push(`- Host-only: ${counts.get('host-only') ?? 0}`);
  lines.push(`- Simulated/test-only: ${counts.get('simulated/test-only') ?? 0}`);
  lines.push(`- Unknown: ${counts.get('unknown') ?? 0}`);
  lines.push(`- Source files indexed: ${graphData.analyses.size}`);
  lines.push(`- Current web/dist artifacts observed: ${distArtifacts.length}`);
  lines.push(`- Canonical package browser exports checked: ${publicApiAudit.rows.length}`);
  lines.push(`- Canonical package browser export violations: ${publicApiAudit.violations.length}`);
  lines.push('');

  if (distArtifacts.length > 0) {
    lines.push('## Observed web/dist Artifacts');
    lines.push('');
    for (const artifact of distArtifacts.slice(0, 80)) {
      lines.push(`- \`${artifact}\``);
    }
    if (distArtifacts.length > 80) {
      lines.push(`- ... ${distArtifacts.length - 80} additional artifacts omitted from this summary`);
    }
    lines.push('');
  }

  lines.push('## Canonical Browser Public API Closure');
  lines.push('');
  lines.push('This is a live source-and-graph check, not a historical evidence claim or a path-only inventory. The generator resolves each `package.json` `browser` condition, walks its current transitive local import graph, and evaluates the runtime contracts below from current source. Node `import`/`default` conditions remain host APIs and are outside this browser-condition matrix.');
  lines.push('');
  lines.push('| Package export | Canonical owned target | Browser target | Graph classification | Reachable files | Host findings |');
  lines.push('| --- | --- | --- | --- | ---: | ---: |');
  for (const row of publicApiAudit.rows) {
    lines.push(`| \`${escapeTable(row.subpath)}\` | \`${escapeTable(row.expectedTarget)}\` | \`${escapeTable(row.declaredTarget ?? 'missing')}\` | ${row.classification} | ${row.reachableFiles} | ${row.hostFindings} |`);
  }
  lines.push('');
  lines.push('- `./libp2p` is a documented compatibility alias of canonical `./mcp/libp2p`; both resolve to the same owned implementation and do not create an equivalent second module.');
  lines.push('- Browser consumers use package subpaths above. Source paths are implementation evidence, not supported deep-import specifiers.');
  lines.push('');
  lines.push('### Runtime Contract Checks');
  lines.push('');
  lines.push('| Contract | Current source | Result | Live assertion |');
  lines.push('| --- | --- | --- | --- |');
  for (const check of publicApiAudit.semanticChecks) {
    lines.push(`| \`${escapeTable(check.id)}\` | \`${escapeTable(check.file)}\` | ${check.passed ? 'pass' : 'fail'} | ${escapeTable(check.description)} |`);
  }
  lines.push('');
  lines.push('The remote MCP check distinguishes provider labels such as `ipfs_accelerate_py` from browser-local Python execution: the browser invokes a typed capability contract, and an absent transport returns `transport_unavailable`. The proof checks permit the TypeScript truth-table runtime and audited WebAssembly backends only; native, Python, neural, mock, or simulated selection cannot become a browser default.');
  lines.push('');
  if (publicApiAudit.violations.length > 0) {
    lines.push('### Public API Violations');
    lines.push('');
    for (const violation of publicApiAudit.violations) lines.push(`- ${violation}`);
    lines.push('');
  }

  lines.push('## Inventory');
  lines.push('');
  lines.push('| Item | Kind | Classification | Reachable files | Evidence summary |');
  lines.push('| --- | --- | --- | ---: | --- |');
  for (const result of results) {
    lines.push(`| \`${escapeTable(result.path)}\` | ${escapeTable(result.kind)} | ${result.classification} | ${result.reachable.length} | ${escapeTable(summarizeFindings(result.findings))} |`);
  }
  lines.push('');

  lines.push('## Active Build Root Chains');
  lines.push('');
  for (const result of activeBuildRoots) {
    lines.push(`### ${result.path}`);
    lines.push('');
    lines.push(`- Classification: \`${result.classification}\``);
    lines.push(`- Reachable local files: ${result.reachable.length}`);
    lines.push(`- Reason: ${result.reason}`);
    lines.push('');
    const materialFindings = result.findings.filter((finding) => (
      finding.severity === 'host-only'
      || finding.severity === 'unknown'
      || ['node', 'pyodide', 'python', 'subprocess', 'filesystem', 'native-binary', 'remote-wrapper', 'worker'].includes(finding.category)
    ));
    if (materialFindings.length === 0) {
      lines.push('- No Node, Python, Pyodide, subprocess, filesystem, native binary, worker, or remote-wrapper evidence found.');
    } else {
      for (const finding of materialFindings) {
        lines.push(formatFinding(finding));
      }
    }
    lines.push('');
  }

  lines.push('## Evidence By Inventory Item');
  lines.push('');
  for (const result of results) {
    const materialFindings = result.findings.filter((finding) => (
      finding.severity === 'host-only'
      || finding.severity === 'unknown'
      || ['node', 'pyodide', 'python', 'subprocess', 'filesystem', 'native-binary', 'remote-wrapper', 'worker'].includes(finding.category)
    ));
    if (materialFindings.length === 0) continue;

    lines.push(`### ${result.path}`);
    lines.push('');
    lines.push(`- Kind: ${result.kind}`);
    lines.push(`- Classification: \`${result.classification}\``);
    lines.push(`- Reachable local files: ${result.reachable.length}`);
    lines.push('');
    for (const finding of materialFindings) {
      lines.push(formatFinding(finding));
    }
    lines.push('');
  }

  lines.push('## External Package Notes');
  lines.push('');
  const externalRows = [];
  for (const [specifier, references] of graphData.external.entries()) {
    const bare = stripNodePrefix(specifier);
    const type = HOST_ONLY_NODE_MODULES.has(bare)
      ? 'node-host'
      : POLYFILLED_NODE_MODULES.has(bare)
        ? 'node-polyfill'
        : EXTERNAL_BROWSER_PACKAGES.has(bare) || [...EXTERNAL_BROWSER_PACKAGES].some((pkg) => bare.startsWith(`${pkg}/`))
          ? 'browser-package'
          : 'external-package';
    externalRows.push({ specifier, type, references });
  }
  externalRows.sort((a, b) => a.type.localeCompare(b.type) || a.specifier.localeCompare(b.specifier));

  lines.push('| Specifier | Type | Reference count | Example reference |');
  lines.push('| --- | --- | ---: | --- |');
  for (const row of externalRows) {
    const example = row.references[0];
    lines.push(`| \`${escapeTable(row.specifier)}\` | ${row.type} | ${row.references.length} | \`${escapeTable(example.importer)}:${example.line}\` |`);
  }
  lines.push('');

  lines.push('## Reproduction');
  lines.push('');
  lines.push('```bash');
  lines.push('cd swissknife');
  lines.push('node scripts/audit-browser-compat.mjs --report docs/browser-compatibility-inventory.md');
  lines.push('```');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function buildInventory() {
  const graphData = buildGraph();
  const roots = discoverRoots(graphData);
  const results = roots.map((root) => analyzeRoot(root, graphData));
  return { graphData, results };
}

function buildModuleInventory(moduleNames) {
  const graphData = buildGraph();
  const roots = discoverModuleRoots(moduleNames, graphData);
  const results = roots.map((root) => analyzeRoot(root, graphData));
  return { graphData, results };
}

function writeOrCheckReport(reportPath, contents, check) {
  const absoluteReportPath = abs(reportPath);
  if (check) {
    const existing = exists(absoluteReportPath) ? readText(absoluteReportPath) : '';
    if (existing !== contents) {
      throw new Error(`Report is stale: ${reportPath}`);
    }
    return;
  }

  fs.mkdirSync(path.dirname(absoluteReportPath), { recursive: true });
  fs.writeFileSync(absoluteReportPath, contents, 'utf8');
}

function printHelp() {
  console.log(`Usage: node scripts/audit-browser-compat.mjs [options]

Options:
  --report <path>  Write the Markdown inventory report.
  --json <path>    Write machine-readable inventory data.
  --module <name>  Audit source files for one module. Can be repeated.
  --check          Verify --report output is already up to date.
  --fail-on-host-imports
                  Exit non-zero when a browser inventory root can reach host-only code.
  -h, --help       Show this help.
`);
}

function browserHostImportFailures(results) {
  return results
    .filter((result) => result.classification === 'host-only')
    .filter((result) => !/simulated-test-html/.test(result.kind));
}

function moduleBrowserHostFailures(results) {
  return results
    .filter((result) => /browser-entrypoint/.test(result.kind))
    .filter((result) => result.classification === 'host-only');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const moduleMode = args.modules.size > 0;
  const { graphData, results } = moduleMode
    ? buildModuleInventory([...args.modules])
    : buildInventory();
  const publicApiAudit = buildCanonicalBrowserPublicApiAudit(graphData);
  const report = renderReport(results, graphData, publicApiAudit);

  if (args.report) {
    writeOrCheckReport(args.report, report, args.check);
  } else {
    process.stdout.write(report);
  }

  if (args.json) {
    const jsonPath = abs(args.json);
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify({
      canonicalBrowserPublicApi: publicApiAudit,
      results: results.map((result) => ({
        path: result.path,
        kind: result.kind,
        reason: result.reason,
        classification: result.classification,
        reachable: result.reachable,
        findings: result.findings,
      })),
    }, null, 2), 'utf8');
  }

  const counts = results.reduce((acc, result) => {
    acc[result.classification] = (acc[result.classification] ?? 0) + 1;
    return acc;
  }, {});
  const summaryPrefix = moduleMode
    ? `Browser compatibility module inventory (${[...args.modules].join(', ')})`
    : 'Browser compatibility inventory';
  console.log(`${summaryPrefix}: ${results.length} items (${Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(', ')})`);

  const failures = moduleMode
    ? moduleBrowserHostFailures(results)
    : args.failOnHostImports
      ? browserHostImportFailures(results)
      : [];
  if (args.failOnHostImports && publicApiAudit.violations.length > 0) {
    console.error('');
    console.error(`Canonical browser public API audit found ${publicApiAudit.violations.length} violation(s):`);
    for (const violation of publicApiAudit.violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  }
  if (failures.length > 0) {
    console.error('');
    console.error(`Host-only imports are reachable from ${failures.length} browser inventory item(s):`);
    for (const result of failures) {
      const first = result.findings.find((finding) => finding.severity === 'host-only');
      console.error(`- ${result.path}: ${first ? formatFinding(first).replace(/^- /, '') : 'host-only classification'}`);
    }
    process.exitCode = 1;
  }
}

// SWR-042: guard the CLI entry point so this module can be imported (e.g.
// from `test/browser-compat/audit-browser-compat-scanner.test.js`) to unit
// test the pure scanner helpers below without triggering a full repository
// scan or writing report files as a side effect of `import()`.
const isDirectCliInvocation = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (isDirectCliInvocation) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

export { findNonLiteralDynamicImportLines, extractImports, analyzeFile };
