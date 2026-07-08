#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const UI_ROOTS = ['src/components', 'src/screens', 'src/hooks'];
const SOURCE_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];
const AUDITED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']);
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
]);

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.turbo',
  '.vite',
  'coverage',
  'dist',
  'node_modules',
  'test-dist',
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

const ALLOWED_BROWSER_UI_EXTERNAL_PACKAGES = new Set([
  '@multiformats/multiaddr',
  'debug',
  'lodash-es',
  'nanoid',
  'react',
  'react-dom',
  'zod',
]);

const FORBIDDEN_EXTERNAL_PACKAGES = new Map([
  ['@anthropic-ai/bedrock-sdk', 'native or host model provider SDK'],
  ['@anthropic-ai/claude-code', 'host CLI/model provider wrapper'],
  ['@anthropic-ai/sdk', 'model provider SDK must stay behind browser service barrels'],
  ['@anthropic-ai/vertex-sdk', 'native or host model provider SDK'],
  ['@commander-js/extra-typings', 'host command parser'],
  ['@inkjs/ui', 'terminal UI package'],
  ['@octokit/rest', 'host integration SDK'],
  ['@sentry/node', 'Node error-reporting SDK'],
  ['chalk', 'terminal formatting package'],
  ['cli-highlight', 'terminal formatting package'],
  ['commander', 'host command parser'],
  ['env-paths', 'host filesystem path helper'],
  ['figures', 'terminal glyph package'],
  ['glob', 'host filesystem glob package'],
  ['highlight.js', 'allowed only behind browser-safe dynamic UI adapters'],
  ['https-proxy-agent', 'Node network proxy package'],
  ['ink', 'terminal UI package'],
  ['ink-link', 'terminal UI package'],
  ['ink-testing-library', 'test fixture package'],
  ['node-fetch', 'Node fetch wrapper'],
  ['openai', 'model provider SDK must stay behind browser service barrels'],
  ['ora', 'terminal spinner package'],
  ['shell-quote', 'shell command parser'],
  ['spawn-rx', 'subprocess wrapper'],
  ['undici', 'Node fetch/runtime package'],
]);

const FORBIDDEN_SOURCE_PATTERNS = [
  { re: /^src\/__mocks__\//, category: 'test-fixture', message: 'imports test fixture runtime' },
  { re: /^src\/(?:cli|cli-phase1|cli-simple)\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'host-entrypoint', message: 'imports host CLI entry module' },
  { re: /^src\/cli\//, category: 'host-entrypoint', message: 'imports legacy host CLI module' },
  { re: /^src\/commands(?:\.ts|\/)/, category: 'host-command', message: 'imports host command module' },
  { re: /^src\/command-registry\.ts$/, category: 'host-command', message: 'imports host command registry' },
  { re: /^src\/entrypoints\//, category: 'host-entrypoint', message: 'imports host process entrypoint' },
  { re: /^src\/platform\/host\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'host-platform', message: 'imports host platform adapter' },
  { re: /^src\/(?:Tool|tools)\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'host-tool', message: 'imports host tool execution module' },
  { re: /^src\/tools\//, category: 'host-tool', message: 'imports host tool execution module' },
  { re: /^src\/permissions\.ts$/, category: 'host-permission', message: 'imports host permission state' },
  { re: /^src\/query\.ts$/, category: 'host-query', message: 'imports host query loop' },
  { re: /^src\/storage\//, category: 'node-storage', message: 'imports storage implementation instead of browser platform storage' },
  { re: /^src\/workers\/(?:pool|worker-pool|worker-thread|thread|worker)\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'node-worker', message: 'imports Node worker runtime' },
  { re: /^src\/models\/(?:providers|execution|init|registry)\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'native-model-provider', message: 'imports model provider runtime directly' },
  { re: /^src\/ai\/models\//, category: 'native-model-provider', message: 'imports native model provider implementation' },
  { re: /^src\/services\/(?:claude|openai|statsig|oauth|notifier)\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'host-service', message: 'imports host service instead of a browser-safe service barrel' },
  { re: /^src\/services\/(?:base-prover-bridge|cvc5-prover-bridge|embedding-prover|ergoai-wrapper|external-provers|flogic-ergoai-wrapper)\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'external-prover-wrapper', message: 'imports external prover wrapper' },
  { re: /^src\/utils\/(?:PersistentShell|autoUpdater|config|execFileNoThrow|file|git|imagePaste|native-loader|readline|ripgrep|state|terminal|unaryLogging)\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'host-utility', message: 'imports host utility' },
  { re: /^src\/utils\/permissions\//, category: 'host-utility', message: 'imports host filesystem permission utility' },
];

const HOST_USAGE_RULES = [
  {
    category: 'subprocess',
    re: /(^|[^\w.])(?:spawn|spawnSync|exec|execFile|execFileSync|execSync)\s*\(/g,
    message: 'uses subprocess API',
  },
  {
    category: 'filesystem',
    re: /\b(?:readFileSync|writeFileSync|existsSync|mkdirSync|statSync|createReadStream|createWriteStream|fs\.(?:read|write|mkdir|readdir|stat|unlink|exists|create))/g,
    message: 'uses filesystem API',
  },
  {
    category: 'native-binary',
    re: /(?:["'`][^"'`]+\.node["'`]|\bnative-loader\b|\bloadNativeModule\b|\bnative module\b|\bnative-modules\b|\bbridge\.node\b)/gi,
    message: 'uses native binary/module dependency',
  },
];

const IMPORT_REGEXES = [
  { kind: 'static-import', re: /\bimport\s+(?:type\s+)?(?:[^'"()]*?\s+from\s*)?["']([^"']+)["']/g },
  { kind: 'side-effect-import', re: /\bimport\s*["']([^"']+)["']/g },
  { kind: 'export-from', re: /\bexport\s+(?:type\s+)?(?:[^'"()]*?\s+from\s*)?["']([^"']+)["']/g },
  { kind: 'dynamic-import', re: /\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)?["']([^"']+)["']\s*\)/g },
  { kind: 'require', re: /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g },
  { kind: 'url-dependency', re: /\bnew\s+URL\s*\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g },
  { kind: 'worker-script', re: /\b(?:new\s+)?(?:Worker|SharedWorker)\s*\(\s*["']([^"']+)["']/g },
  { kind: 'worklet-script', re: /\baudioWorklet\.addModule\s*\(\s*["']([^"']+)["']/g },
];

function parseArgs(argv) {
  const args = {
    help: false,
    includeLegacyTerminalUi: false,
    json: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--include-legacy-terminal-ui') {
      args.includeLegacyTerminalUi = true;
    } else if (arg === '--json') {
      args.json = argv[++i];
      if (!args.json) throw new Error('--json requires an output path');
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function usage() {
  return [
    'Usage: node scripts/audit-ui-imports.mjs [options]',
    '',
    'Audits browser UI surfaces under src/components/browser, src/screens/browser,',
    'src/hooks/browser, and files named *.browser.ts(x). The legacy terminal UI',
    'under src/components, src/screens, and src/hooks is intentionally out of scope',
    'unless --include-legacy-terminal-ui is provided.',
    '',
    'Options:',
    '  --json <path>                    Write the deterministic audit payload as JSON.',
    '  --include-legacy-terminal-ui     Also audit existing terminal UI files as browser roots.',
    '  --help, -h                       Show this help text.',
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

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function readText(filePath) {
  return fs.readFileSync(abs(filePath), 'utf8');
}

function lineNumberForOffset(text, offset) {
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function compareStrings(a, b) {
  return a.localeCompare(b);
}

function compareFindings(a, b) {
  return (
    a.file.localeCompare(b.file)
    || (a.line ?? 0) - (b.line ?? 0)
    || a.category.localeCompare(b.category)
    || a.message.localeCompare(b.message)
  );
}

function listFiles(relativeDir, predicate, acc = []) {
  const absoluteDir = abs(relativeDir);
  if (!exists(absoluteDir)) return acc;

  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const absolute = path.join(absoluteDir, entry.name);
    const relative = rel(absolute);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      listFiles(relative, predicate, acc);
    } else if (predicate(relative, absolute)) {
      acc.push(relative);
    }
  }

  return acc.sort(compareStrings);
}

function normalizeSpecifier(specifier) {
  return specifier.replace(/[?#].*$/, '');
}

function stripNodePrefix(specifier) {
  return specifier.startsWith('node:') ? specifier.slice(5) : specifier;
}

function packageName(specifier) {
  const bare = stripNodePrefix(specifier);
  if (bare.startsWith('@')) {
    const [scope, name] = bare.split('/');
    return name ? `${scope}/${name}` : bare;
  }
  return bare.split('/')[0];
}

function isLocalSpecifier(specifier) {
  return specifier.startsWith('.')
    || specifier.startsWith('/')
    || specifier.startsWith('@/')
    || specifier.startsWith('@src/')
    || specifier.startsWith('@shared/')
    || specifier.startsWith('@web/')
    || specifier.startsWith('@ipfs/')
    || specifier.startsWith('@swissknife/');
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
  if (normalized.startsWith('@/')) {
    base = abs(path.join('src', normalized.slice(2)));
  } else if (normalized.startsWith('@src/')) {
    base = abs(path.join('src', normalized.slice('@src/'.length)));
  } else if (normalized.startsWith('@shared/')) {
    base = abs(path.join('src/shared', normalized.slice('@shared/'.length)));
  } else if (normalized.startsWith('@web/')) {
    base = abs(path.join('web/src', normalized.slice('@web/'.length)));
  } else if (normalized.startsWith('@ipfs/')) {
    base = abs(path.join('ipfs_accelerate_js/src', normalized.slice('@ipfs/'.length)));
  } else if (normalized.startsWith('@swissknife/')) {
    base = abs(path.join('src', normalized.slice('@swissknife/'.length)));
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

function extractImports(filePath, text) {
  const imports = [];

  for (const { kind, re } of IMPORT_REGEXES) {
    for (const match of text.matchAll(re)) {
      recordImport(imports, kind, match[1], lineNumberForOffset(text, match.index ?? 0));
    }
  }

  const variableImportRe = /\bimport\s*\(\s*([^"'`\s][^)]+)\)/g;
  for (const match of text.matchAll(variableImportRe)) {
    imports.push({
      kind: 'dynamic-import-variable',
      specifier: '<non-literal>',
      line: lineNumberForOffset(text, match.index ?? 0),
    });
  }

  return dedupeBy(imports, item => `${item.kind}:${item.specifier}:${item.line}`);
}

function isAuditedFile(filePath) {
  return AUDITED_EXTENSIONS.has(path.extname(filePath));
}

function isBrowserUiFile(filePath) {
  return /^src\/(?:components|screens|hooks)\/browser\//.test(filePath)
    || /^src\/(?:components|screens|hooks)\/.*\.browser\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(filePath);
}

function isLegacyUiFile(filePath) {
  return /^src\/(?:components|screens|hooks)\//.test(filePath) && isAuditedFile(filePath);
}

function isBrowserPlatformEntrypoint(filePath) {
  return /^src\/platform\/browser\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(filePath);
}

function isBrowserServiceEntrypoint(filePath) {
  return /^src\/services\/apps\//.test(filePath)
    || /^src\/services\/mcp\/libp2p-browser-runtime\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)
    || /^src\/services\/(?:browser-acceleration|bridge-types|ipfs-idl-descriptors|ipfs-ui-profiles|mcp-deontic-ui-manifest|mcp-ipfs-ui-descriptors|mcp-ui-profile|meta-glasses-display-profile|meta-glasses-webapp-renderer|meta-glasses-widget-compiler|zkp-browser-schnorr)\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)
    || /^src\/services\/provers\/browser-crypto\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)
    || /^src\/services\/zkp\/(?:browser-snarkjs-backend|zkp-simulated-prover|zkp-types)\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(filePath);
}

function isPureSharedHelper(filePath) {
  return /^src\/shared\/(?:constants|events|types|utils|ai)\/index\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)
    || /^src\/shared\/(?:constants|events|types|utils|ai)\//.test(filePath);
}

function isAllowedBrowserUiTarget(filePath) {
  return isBrowserUiFile(filePath)
    || isBrowserPlatformEntrypoint(filePath)
    || isBrowserServiceEntrypoint(filePath)
    || isPureSharedHelper(filePath);
}

function analyzeFile(filePath) {
  const text = readText(filePath);
  const imports = extractImports(filePath, text);
  const findings = [];

  for (const item of imports) {
    const bare = stripNodePrefix(item.specifier);
    const pkg = packageName(item.specifier);

    if (HOST_ONLY_NODE_MODULES.has(bare)) {
      findings.push({
        category: 'node-host-module',
        file: filePath,
        line: item.line,
        message: `imports Node host module "${item.specifier}"`,
      });
    } else if (FORBIDDEN_EXTERNAL_PACKAGES.has(pkg)) {
      findings.push({
        category: 'forbidden-external-package',
        file: filePath,
        line: item.line,
        message: `imports ${FORBIDDEN_EXTERNAL_PACKAGES.get(pkg)} "${item.specifier}"`,
      });
    } else if (item.kind === 'dynamic-import-variable') {
      findings.push({
        category: 'dynamic-import',
        file: filePath,
        line: item.line,
        message: 'contains non-literal dynamic import',
      });
    }
  }

  for (const rule of HOST_USAGE_RULES) {
    for (const match of text.matchAll(rule.re)) {
      findings.push({
        category: rule.category,
        file: filePath,
        line: lineNumberForOffset(text, match.index ?? 0),
        message: rule.message,
      });
    }
  }

  return {
    path: filePath,
    imports,
    findings: dedupeBy(findings, finding => `${finding.category}:${finding.file}:${finding.line}:${finding.message}`),
  };
}

function buildGraph() {
  const allFiles = new Set([
    ...listFiles('src', relative => isAuditedFile(relative)),
    ...listFiles('web/src', relative => isAuditedFile(relative)),
    ...listFiles('ipfs_accelerate_js/src', relative => isAuditedFile(relative)),
  ]);

  const analyses = new Map();
  for (const filePath of allFiles) {
    analyses.set(filePath, analyzeFile(filePath));
  }

  const graph = new Map();
  const unresolved = [];

  for (const [filePath, analysis] of analyses) {
    const edges = [];
    for (const item of analysis.imports) {
      if (item.kind === 'dynamic-import-variable') continue;
      if (!isLocalSpecifier(item.specifier)) continue;

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
        unresolved.push({
          importer: filePath,
          line: item.line,
          specifier: item.specifier,
          attempted: resolved.path,
          kind: item.kind,
        });
      }
    }
    graph.set(filePath, dedupeBy(edges, edge => `${edge.to}:${edge.line}:${edge.kind}:${edge.specifier}`));
  }

  return { analyses, graph, unresolved };
}

function discoverRoots(includeLegacyTerminalUi) {
  const roots = [];
  for (const uiRoot of UI_ROOTS) {
    roots.push(...listFiles(uiRoot, relative => (
      includeLegacyTerminalUi ? isLegacyUiFile(relative) : isBrowserUiFile(relative)
    )));
  }
  return [...new Set(roots)].sort(compareStrings);
}

function importChain(filePath, rootPath, parent) {
  const chain = [filePath];
  let current = filePath;

  while (current !== rootPath && parent.has(current)) {
    const edge = parent.get(current);
    current = edge.from;
    chain.push(current);
  }

  return chain.reverse();
}

function analyzeRoot(rootPath, graphData) {
  const { analyses, graph } = graphData;
  const findings = [];
  const parent = new Map();
  const reachable = [];
  const queue = [rootPath];
  const seen = new Set();

  while (queue.length > 0) {
    const filePath = queue.shift();
    if (seen.has(filePath)) continue;
    seen.add(filePath);
    reachable.push(filePath);

    const analysis = analyses.get(filePath);
    if (!analysis) continue;

    for (const finding of analysis.findings) {
      findings.push({
        ...finding,
        root: rootPath,
        chain: importChain(filePath, rootPath, parent),
      });
    }

    for (const rule of FORBIDDEN_SOURCE_PATTERNS) {
      if (rule.re.test(filePath)) {
        findings.push({
          category: rule.category,
          file: filePath,
          line: 1,
          message: rule.message,
          root: rootPath,
          chain: importChain(filePath, rootPath, parent),
        });
      }
    }

    for (const edge of graph.get(filePath) ?? []) {
      if (isBrowserUiFile(filePath) && !isAllowedBrowserUiTarget(edge.to)) {
        findings.push({
          category: 'ui-boundary',
          file: filePath,
          line: edge.line,
          message: `browser UI imports non-approved module "${edge.specifier}" -> ${edge.to}`,
          root: rootPath,
          chain: importChain(filePath, rootPath, parent),
        });
      }

      if (!seen.has(edge.to) && !parent.has(edge.to)) {
        parent.set(edge.to, edge);
        queue.push(edge.to);
      }
    }

    for (const item of analysis.imports) {
      if (isLocalSpecifier(item.specifier)) continue;
      const bare = stripNodePrefix(item.specifier);
      const pkg = packageName(item.specifier);
      if (isBrowserUiFile(filePath) && !HOST_ONLY_NODE_MODULES.has(bare) && !ALLOWED_BROWSER_UI_EXTERNAL_PACKAGES.has(pkg)) {
        findings.push({
          category: 'ui-external-boundary',
          file: filePath,
          line: item.line,
          message: `browser UI imports non-approved external package "${item.specifier}"`,
          root: rootPath,
          chain: importChain(filePath, rootPath, parent),
        });
      }
    }
  }

  return {
    root: rootPath,
    reachable: reachable.sort(compareStrings),
    findings: dedupeBy(findings, finding => `${finding.root}:${finding.category}:${finding.file}:${finding.line}:${finding.message}`)
      .sort(compareFindings),
  };
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

function writeJson(outputPath, payload) {
  const absolute = path.isAbsolute(outputPath) ? outputPath : abs(outputPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(payload, null, 2)}\n`);
}

function formatFinding(finding) {
  const chain = finding.chain?.length > 1 ? `\n    chain: ${finding.chain.join(' -> ')}` : '';
  return `  - ${finding.file}:${finding.line} [${finding.category}] ${finding.message}${chain}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const graphData = buildGraph();
  const roots = discoverRoots(args.includeLegacyTerminalUi);
  const rootAnalyses = roots.map(root => analyzeRoot(root, graphData));
  const findings = rootAnalyses.flatMap(root => root.findings).sort(compareFindings);

  if (roots.length === 0) {
    findings.push({
      category: 'missing-browser-ui-root',
      file: 'src/components',
      line: 1,
      message: 'no browser UI roots found under src/components/browser, src/screens/browser, src/hooks/browser, or *.browser.ts(x)',
      root: '<discovery>',
      chain: [],
    });
  }

  const unresolvedUiImports = graphData.unresolved
    .filter(item => roots.some(root => item.importer === root || rootAnalyses.some(analysis => analysis.reachable.includes(item.importer))))
    .sort((a, b) => a.importer.localeCompare(b.importer) || a.line - b.line);

  for (const item of unresolvedUiImports) {
    findings.push({
      category: 'unresolved-import',
      file: item.importer,
      line: item.line,
      message: `cannot resolve "${item.specifier}" (attempted ${item.attempted})`,
      root: roots.find(root => root === item.importer) ?? '<reachable>',
      chain: [item.importer],
    });
  }

  const payload = {
    auditedAt: new Date().toISOString(),
    policy: {
      roots: [
        'src/components/browser/**',
        'src/screens/browser/**',
        'src/hooks/browser/**',
        'src/{components,screens,hooks}/**/*.browser.{ts,tsx,js,jsx,mjs,cjs}',
      ],
      allowedImports: [
        'same browser UI surface',
        'src/platform/browser.ts',
        'browser-safe service barrels and app descriptors',
        'pure shared constants, events, types, utils, and AI contracts',
        ...Array.from(ALLOWED_BROWSER_UI_EXTERNAL_PACKAGES).sort(),
      ],
      forbiddenImports: [
        'host commands and entrypoints',
        'Node storage and worker runtimes',
        'native model providers and provider SDKs',
        'external prover wrappers',
        'test fixtures',
        'terminal UI packages',
      ],
    },
    roots,
    rootAnalyses,
    unresolved: unresolvedUiImports,
    findings,
  };

  if (args.json) writeJson(args.json, payload);

  if (findings.length > 0) {
    console.error(`UI import audit failed with ${findings.length} finding(s).`);
    for (const finding of findings.slice(0, 80)) {
      console.error(formatFinding(finding));
    }
    if (findings.length > 80) {
      console.error(`  ... ${findings.length - 80} additional finding(s) omitted`);
    }
    process.exitCode = 1;
    return;
  }

  const reachableCount = new Set(rootAnalyses.flatMap(root => root.reachable)).size;
  console.log(`UI import audit passed: ${roots.length} browser UI root(s), ${reachableCount} reachable module(s).`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
