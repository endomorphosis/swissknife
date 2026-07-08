#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const SOURCE_EXTENSIONS = new Set(['.html', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const RESOLVABLE_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.wasm'];
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
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.map',
]);
const IGNORED_DIRECTORIES = new Set(['.git', '.turbo', '.vite', 'coverage', 'dist', 'node_modules', 'test-dist']);
const DEFAULT_DIST_METADATA = 'dist/.vite/swissknife-bundle-metadata.json';

const IMPORT_REGEXES = [
  { kind: 'static-import', re: /\bimport\s+(?:type\s+)?(?:[^'"()]*?\s+from\s*)?["']([^"']+)["']/g },
  { kind: 'side-effect-import', re: /\bimport\s+["']([^"']+)["']/g },
  { kind: 'export-from', re: /\bexport\s+(?:type\s+)?(?:[^'"()]*?\s+from\s*)?["']([^"']+)["']/g },
  { kind: 'dynamic-import', re: /(?<![\w$.])import\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)?["']([^"']+)["']\s*\)/g },
  { kind: 'require', re: /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g },
  { kind: 'url-dependency', re: /\bnew\s+URL\s*\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g },
  { kind: 'worker-script', re: /\b(?:new\s+)?(?:Worker|SharedWorker)\s*\(\s*["']([^"']+)["']/g },
  { kind: 'worklet-script', re: /\baudioWorklet\.addModule\s*\(\s*["']([^"']+)["']/g },
];

const HTML_SCRIPT_RE = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
const HTML_LINK_MODULE_RE = /<link\b[^>]*\brel=["']modulepreload["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
const VARIABLE_IMPORT_RE = /(?<![\w$.])import\s*\(\s*([^"'`\s][^)]+)\)/g;

const HOST_ONLY_NODE_BUILTINS = new Set([
  'child_process',
  'cluster',
  'dgram',
  'dns',
  'fs',
  'fs/promises',
  'module',
  'net',
  'node:test',
  'perf_hooks',
  'readline',
  'readline/promises',
  'repl',
  'tls',
  'tty',
  'v8',
  'vm',
  'worker_threads',
]);

const BUILTIN_NAMES = new Set([
  ...builtinModules,
  ...builtinModules.map(moduleName => moduleName.replace(/^node:/, '')),
]);

const KNOWN_BROWSER_POLYFILL_PACKAGES = new Set([
  'assert',
  'buffer',
  'browserify-zlib',
  'constants-browserify',
  'crypto-browserify',
  'events',
  'https-browserify',
  'os-browserify',
  'path-browserify',
  'process',
  'querystring-es3',
  'stream-browserify',
  'stream-http',
  'url',
  'util',
]);

const REQUIRED_OWNERSHIP_IDS = new Set(['libp2p', 'snarkjs-wasm', 'ipfs', 'storage', 'ui']);

function parseArgs(argv) {
  const args = {
    failOnNodeBuiltins: false,
    failOnUnapprovedPolyfills: false,
    report: null,
    json: null,
    distMetadata: DEFAULT_DIST_METADATA,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--fail-on-node-builtins') {
      args.failOnNodeBuiltins = true;
    } else if (arg === '--fail-on-unapproved-polyfills') {
      args.failOnUnapprovedPolyfills = true;
    } else if (arg === '--report') {
      args.report = argv[++i];
      if (!args.report) throw new Error('--report requires an output path');
    } else if (arg === '--json') {
      args.json = argv[++i];
      if (!args.json) throw new Error('--json requires an output path');
    } else if (arg === '--dist-metadata') {
      args.distMetadata = argv[++i];
      if (!args.distMetadata) throw new Error('--dist-metadata requires a path');
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
    'Usage: node scripts/audit-browser-dependencies.mjs [options]',
    '',
    'Options:',
    '  --fail-on-node-builtins           Exit non-zero when browser graphs import denied Node builtins.',
    '  --fail-on-unapproved-polyfills    Exit non-zero when browser polyfills are not in the policy.',
    '  --report <path>                   Write a Markdown dependency policy report.',
    '  --json <path>                     Write deterministic audit payload as JSON.',
    '  --dist-metadata <path>            Vite bundle metadata path. Default: dist/.vite/swissknife-bundle-metadata.json.',
    '  --help, -h                        Show this help text.',
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

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(abs(relativePath), 'utf8'));
}

function readJsonIfExists(relativePath) {
  const absolute = abs(relativePath);
  if (!fs.existsSync(absolute)) return null;
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(abs(relativePath), 'utf8');
}

function writeText(relativePath, text) {
  const output = abs(relativePath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, text, 'utf8');
}

function writeJson(relativePath, payload) {
  writeText(relativePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function compareStrings(a, b) {
  return a.localeCompare(b);
}

function markdownEscape(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function normalizeSpecifier(specifier) {
  return specifier.replace(/[?#].*$/, '');
}

function stripNodePrefix(specifier) {
  return specifier.startsWith('node:') ? specifier.slice(5) : specifier;
}

function stripSyntheticJsSuffix(specifier) {
  return specifier.replace(/(?:\.js)+$/g, '');
}

function builtinNameForSpecifier(specifier) {
  const normalized = stripSyntheticJsSuffix(stripNodePrefix(normalizeSpecifier(specifier)));
  return BUILTIN_NAMES.has(normalized) ? normalized : null;
}

function packageNameForSpecifier(specifier) {
  const normalized = stripSyntheticJsSuffix(stripNodePrefix(normalizeSpecifier(specifier)));
  if (normalized.startsWith('@')) {
    const [scope, name] = normalized.split('/');
    return scope && name ? `${scope}/${name}` : normalized;
  }
  return normalized.split('/')[0];
}

function isUrlLikeSpecifier(specifier) {
  return /^(?:data|blob|https?|wss?):/i.test(specifier);
}

function isLocalSpecifier(specifier) {
  return specifier.startsWith('.')
    || specifier.startsWith('/')
    || specifier.startsWith('@/')
    || specifier.startsWith('@src/')
    || specifier.startsWith('@shared/')
    || specifier.startsWith('@web/')
    || specifier.startsWith('@ipfs/');
}

function isAssetSpecifier(specifier) {
  const clean = normalizeSpecifier(specifier);
  return ASSET_EXTENSIONS.has(path.extname(clean));
}

function lineNumberForOffset(text, offset) {
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function candidatePaths(base) {
  const candidates = [];
  const ext = path.extname(base);

  if (ext) {
    candidates.push(base);
    if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') {
      const withoutExt = base.slice(0, -ext.length);
      candidates.push(`${withoutExt}.ts`, `${withoutExt}.tsx`, `${withoutExt}.jsx`, `${withoutExt}.mjs`);
    }
    if (base.endsWith('.js')) {
      const stripped = base.replace(/(?:\.js)+$/, '');
      candidates.push(`${stripped}.ts`, `${stripped}.tsx`, `${stripped}.js`);
    }
  } else {
    for (const extension of RESOLVABLE_EXTENSIONS) {
      candidates.push(`${base}${extension}`);
    }
  }

  for (const extension of RESOLVABLE_EXTENSIONS) {
    if (extension) candidates.push(path.join(base, `index${extension}`));
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
  } else if (normalized.startsWith('/')) {
    base = abs(path.join('web', normalized.slice(1)));
  } else if (normalized.startsWith('.')) {
    base = path.resolve(path.dirname(abs(importer)), normalized);
  } else {
    return null;
  }

  for (const candidate of candidatePaths(base)) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return { path: rel(candidate) };
    }
  }

  return { unresolved: true, path: rel(base) };
}

function recordImport(imports, kind, specifier, line) {
  if (!specifier || isUrlLikeSpecifier(specifier)) return;
  imports.push({ kind, specifier: normalizeSpecifier(specifier), line });
}

function extractImports(filePath, text) {
  const imports = [];
  const extension = path.extname(filePath);

  if (extension === '.html') {
    for (const match of text.matchAll(HTML_SCRIPT_RE)) {
      recordImport(imports, 'html-script', match[1], lineNumberForOffset(text, match.index ?? 0));
    }
    for (const match of text.matchAll(HTML_LINK_MODULE_RE)) {
      recordImport(imports, 'html-modulepreload', match[1], lineNumberForOffset(text, match.index ?? 0));
    }
    return dedupeBy(imports, item => `${item.kind}:${item.specifier}:${item.line}`);
  }

  const codeMask = buildCodeMask(text);

  for (const { kind, re } of IMPORT_REGEXES) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (!codeMask[match.index]) continue;
      recordImport(imports, kind, match[1], lineNumberForOffset(text, match.index));
    }
  }

  VARIABLE_IMPORT_RE.lastIndex = 0;
  let variableMatch;
  while ((variableMatch = VARIABLE_IMPORT_RE.exec(text)) !== null) {
    if (!codeMask[variableMatch.index]) continue;
    const expression = variableMatch[1].trim().replace(/^\/\*[\s\S]*?\*\/\s*/, '');
    if (expression.startsWith("'") || expression.startsWith('"') || expression.startsWith('`')) continue;
    imports.push({
      kind: 'dynamic-import-variable',
      specifier: '<non-literal>',
      line: lineNumberForOffset(text, variableMatch.index),
    });
  }

  return dedupeBy(imports, item => `${item.kind}:${item.specifier}:${item.line}`);
}

function buildCodeMask(text) {
  const mask = new Array(text.length).fill(true);
  let state = 'code';
  let templateDepth = 0;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    const prev = text[i - 1];

    if (state === 'code') {
      if (char === '/' && next === '/') {
        mask[i] = false;
        mask[i + 1] = false;
        i += 1;
        state = 'line-comment';
      } else if (char === '/' && next === '*') {
        mask[i] = false;
        mask[i + 1] = false;
        i += 1;
        state = 'block-comment';
      } else if (char === "'") {
        mask[i] = false;
        state = 'single';
      } else if (char === '"') {
        mask[i] = false;
        state = 'double';
      } else if (char === '`') {
        mask[i] = false;
        templateDepth = 0;
        state = 'template';
      }
      continue;
    }

    mask[i] = false;

    if (state === 'line-comment') {
      if (char === '\n') {
        mask[i] = true;
        state = 'code';
      }
    } else if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        mask[i + 1] = false;
        i += 1;
        state = 'code';
      }
    } else if (state === 'single') {
      if (char === "'" && prev !== '\\') state = 'code';
    } else if (state === 'double') {
      if (char === '"' && prev !== '\\') state = 'code';
    } else if (state === 'template') {
      if (char === '`' && prev !== '\\' && templateDepth === 0) {
        state = 'code';
      } else if (char === '$' && next === '{' && prev !== '\\') {
        templateDepth += 1;
        mask[i + 1] = false;
        i += 1;
      } else if (char === '}' && templateDepth > 0) {
        templateDepth -= 1;
      }
    }
  }

  return mask;
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function flattenExportLeaves(exportName, value, conditions = []) {
  if (typeof value === 'string' || value === null) {
    return [{ exportName, conditions, condition: conditions.length ? conditions.join('.') : 'default', target: value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenExportLeaves(exportName, item, [...conditions, `fallback-${index}`]));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([condition, nested]) => flattenExportLeaves(exportName, nested, [...conditions, condition]));
  }
  return [];
}

function flattenPackageExports(pkg) {
  if (!pkg.exports) return [];
  if (typeof pkg.exports === 'string' || Array.isArray(pkg.exports)) {
    return flattenExportLeaves('.', pkg.exports);
  }
  return Object.entries(pkg.exports).flatMap(([exportName, value]) => flattenExportLeaves(exportName, value));
}

function hasAnyCondition(leaf, conditions) {
  return conditions.some(condition => leaf.conditions.includes(condition));
}

function isBrowserRelevantLeaf(leaf) {
  if (leaf.target === null || leaf.conditions.includes('types') || hasAnyCondition(leaf, ['node', 'node-addons', 'host'])) {
    return false;
  }
  if (leaf.exportName === './package.json') return false;
  return leaf.conditions.length === 0 || hasAnyCondition(leaf, ['browser', 'import', 'default', 'module']);
}

function targetPath(target) {
  if (typeof target !== 'string' || !target.startsWith('./')) return null;
  return target.slice(2);
}

function policyFromPackage(pkg) {
  const policy = pkg.swissknife?.browserDependencyPolicy;
  if (!policy || typeof policy !== 'object') {
    throw new Error('package.json must define swissknife.browserDependencyPolicy');
  }
  return policy;
}

function validatePolicy(policy) {
  const findings = [];
  if (policy.schemaVersion !== 1) {
    findings.push({
      category: 'policy',
      severity: 'dependency-policy',
      message: 'swissknife.browserDependencyPolicy.schemaVersion must be 1',
    });
  }

  const groups = Array.isArray(policy.allowlist) ? policy.allowlist : [];
  const groupIds = new Set();
  for (const group of groups) {
    if (group?.id) groupIds.add(group.id);
    if (!group?.id || !group?.owner || !group?.purpose || !Array.isArray(group?.packages)) {
      findings.push({
        category: 'policy',
        severity: 'dependency-policy',
        message: `allowlist entry ${group?.id ?? '<missing-id>'} must include id, owner, purpose, and packages`,
      });
    }
  }

  for (const requiredId of REQUIRED_OWNERSHIP_IDS) {
    if (!groupIds.has(requiredId)) {
      findings.push({
        category: 'policy',
        severity: 'dependency-policy',
        message: `allowlist must include ownership group "${requiredId}"`,
      });
    }
  }

  const approvedPolyfills = Array.isArray(policy.approvedPolyfills) ? policy.approvedPolyfills : [];
  for (const polyfill of approvedPolyfills) {
    if (!polyfill?.specifier || !polyfill?.package || !polyfill?.owner || !polyfill?.reason) {
      findings.push({
        category: 'policy',
        severity: 'dependency-policy',
        message: `approved polyfill ${polyfill?.specifier ?? '<missing-specifier>'} must include specifier, package, owner, and reason`,
      });
    }
  }

  return findings;
}

function buildPolicyIndexes(policy) {
  const packageAllowlist = new Map();
  const groups = Array.isArray(policy.allowlist) ? policy.allowlist : [];
  for (const group of groups) {
    for (const packageName of group.packages ?? []) {
      const records = packageAllowlist.get(packageName) ?? [];
      records.push({
        id: group.id,
        owner: group.owner,
        purpose: group.purpose,
        loading: group.loading ?? 'runtime',
      });
      packageAllowlist.set(packageName, records);
    }
  }

  const approvedPolyfillsBySpecifier = new Map();
  const approvedPolyfillsByPackage = new Map();
  for (const polyfill of policy.approvedPolyfills ?? []) {
    approvedPolyfillsBySpecifier.set(polyfill.specifier, polyfill);
    approvedPolyfillsByPackage.set(polyfill.package, polyfill);
  }

  return {
    packageAllowlist,
    approvedPolyfillsBySpecifier,
    approvedPolyfillsByPackage,
    nodeBuiltinDenylist: new Set(policy.nodeBuiltinDenylist ?? HOST_ONLY_NODE_BUILTINS),
    forbiddenPackages: new Map((policy.forbiddenPackages ?? []).map(item => [item.package, item.reason])),
    approvedDynamicImporters: new Set(policy.approvedDynamicImporters ?? []),
  };
}

function browserRootsFromPackage(pkg, policy) {
  const roots = [];
  for (const entrypoint of policy.browserEntrypoints ?? []) {
    roots.push({
      path: entrypoint.path,
      source: 'policy',
      kind: entrypoint.kind ?? 'browser-entrypoint',
      owner: entrypoint.owner ?? 'unknown',
    });
  }

  for (const leaf of flattenPackageExports(pkg).filter(isBrowserRelevantLeaf)) {
    const relative = targetPath(leaf.target);
    if (!relative) continue;
    roots.push({
      path: relative,
      source: 'package-export',
      kind: `${leaf.exportName}:${leaf.condition}`,
      owner: 'package exports',
    });
  }

  if (typeof pkg.browser === 'string') {
    const relative = targetPath(pkg.browser);
    if (relative) {
      roots.push({
        path: relative,
        source: 'browser-field',
        kind: 'browser',
        owner: 'package browser field',
      });
    }
  }

  return dedupeBy(roots, item => `${item.path}:${item.source}:${item.kind}`).sort((a, b) =>
    a.path.localeCompare(b.path) || a.source.localeCompare(b.source) || a.kind.localeCompare(b.kind)
  );
}

function shouldTraverse(filePath) {
  if (!SOURCE_EXTENSIONS.has(path.extname(filePath))) return false;
  return !filePath.split('/').some(segment => IGNORED_DIRECTORIES.has(segment));
}

function scanGraph(roots, indexes) {
  const queue = roots.map(root => root.path);
  const rootStatus = roots.map(root => ({
    ...root,
    exists: fs.existsSync(abs(root.path)),
  }));
  const visited = new Set();
  const imports = [];
  const externalRecords = [];
  const nodeBuiltinRecords = [];
  const polyfillRecords = [];
  const dynamicImportRecords = [];
  const unresolved = [];
  const findings = [];

  for (const root of rootStatus) {
    if (!root.exists) {
      findings.push({
        category: 'missing-entrypoint',
        severity: 'dependency-policy',
        file: root.path,
        line: 1,
        message: `browser dependency audit root is missing (${root.source}:${root.kind})`,
      });
    }
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    if (!fs.existsSync(abs(current)) || !shouldTraverse(current)) continue;
    const text = readText(current);
    const currentImports = extractImports(current, text);
    imports.push(...currentImports.map(item => ({ ...item, file: current })));

    for (const dependency of currentImports) {
      if (dependency.kind === 'dynamic-import-variable') {
        const approved = indexes.approvedDynamicImporters.has(current);
        dynamicImportRecords.push({
          file: current,
          line: dependency.line,
          approved,
          reason: approved ? 'approved optional package capability loader' : 'non-literal dynamic import',
        });
        if (!approved) {
          findings.push({
            category: 'dynamic-import',
            severity: 'dependency-policy',
            file: current,
            line: dependency.line,
            message: 'non-literal dynamic import must be owned in browserDependencyPolicy.approvedDynamicImporters',
          });
        }
        continue;
      }

      const normalized = normalizeSpecifier(dependency.specifier);
      if (isLocalSpecifier(normalized)) {
        const resolved = resolveLocalSpecifier(normalized, current);
        if (!resolved || resolved.ignoredAsset) continue;
        if (resolved.path && fs.existsSync(abs(resolved.path))) {
          queue.push(resolved.path);
        } else if (resolved.unresolved) {
          unresolved.push({
            file: current,
            line: dependency.line,
            specifier: dependency.specifier,
            attempted: resolved.path,
            kind: dependency.kind,
          });
        }
        continue;
      }

      const builtinName = builtinNameForSpecifier(normalized);
      if (builtinName) {
        const polyfill = indexes.approvedPolyfillsBySpecifier.get(builtinName);
        const record = {
          file: current,
          line: dependency.line,
          kind: dependency.kind,
          specifier: dependency.specifier,
          builtin: builtinName,
          approvedPolyfill: polyfill?.package ?? null,
          denied: indexes.nodeBuiltinDenylist.has(builtinName),
        };
        nodeBuiltinRecords.push(record);
        if (record.denied) {
          findings.push({
            category: 'node-builtin',
            severity: 'node-builtin',
            file: current,
            line: dependency.line,
            message: `imports denied Node builtin "${dependency.specifier}"`,
            specifier: dependency.specifier,
          });
        } else if (!polyfill) {
          findings.push({
            category: 'node-polyfill',
            severity: 'unapproved-polyfill',
            file: current,
            line: dependency.line,
            message: `imports Node builtin "${dependency.specifier}" without an approved browser polyfill`,
            specifier: dependency.specifier,
          });
        } else {
          polyfillRecords.push({
            file: current,
            line: dependency.line,
            specifier: builtinName,
            package: polyfill.package,
            owner: polyfill.owner,
            source: 'source-import',
          });
        }
        continue;
      }

      const packageName = packageNameForSpecifier(normalized);
      const forbiddenReason = indexes.forbiddenPackages.get(packageName);
      const allowlist = indexes.packageAllowlist.get(packageName) ?? [];
      const approvedPolyfill = indexes.approvedPolyfillsByPackage.get(packageName);
      const record = {
        file: current,
        line: dependency.line,
        kind: dependency.kind,
        specifier: dependency.specifier,
        package: packageName,
        owners: allowlist.map(item => item.owner),
        approved: allowlist.length > 0 || Boolean(approvedPolyfill),
        polyfill: approvedPolyfill?.specifier ?? null,
      };
      externalRecords.push(record);

      if (forbiddenReason) {
        findings.push({
          category: 'forbidden-package',
          severity: 'dependency-policy',
          file: current,
          line: dependency.line,
          message: `imports forbidden browser package "${packageName}": ${forbiddenReason}`,
          specifier: dependency.specifier,
        });
      } else if (!record.approved) {
        findings.push({
          category: 'unapproved-package',
          severity: 'dependency-policy',
          file: current,
          line: dependency.line,
          message: `imports package "${packageName}" outside swissknife.browserDependencyPolicy allowlist`,
          specifier: dependency.specifier,
        });
      }
    }
  }

  return {
    roots: rootStatus,
    reachableFiles: Array.from(visited).sort(compareStrings),
    imports: imports.sort(compareImportRecords),
    externalRecords: dedupeBy(externalRecords, item => `${item.file}:${item.line}:${item.specifier}`).sort(compareImportRecords),
    nodeBuiltinRecords: dedupeBy(nodeBuiltinRecords, item => `${item.file}:${item.line}:${item.specifier}`).sort(compareImportRecords),
    polyfillRecords: dedupeBy(polyfillRecords, item => `${item.file}:${item.line}:${item.specifier}:${item.package}`).sort(compareImportRecords),
    dynamicImportRecords: dedupeBy(dynamicImportRecords, item => `${item.file}:${item.line}:${item.reason}`).sort(compareImportRecords),
    unresolved: dedupeBy(unresolved, item => `${item.file}:${item.line}:${item.specifier}`).sort(compareImportRecords),
    findings: findings.sort(compareFindings),
  };
}

function compareImportRecords(a, b) {
  return (
    (a.file ?? '').localeCompare(b.file ?? '')
    || (a.line ?? 0) - (b.line ?? 0)
    || (a.specifier ?? '').localeCompare(b.specifier ?? '')
  );
}

function compareFindings(a, b) {
  return (
    (a.severity ?? '').localeCompare(b.severity ?? '')
    || (a.file ?? '').localeCompare(b.file ?? '')
    || (a.line ?? 0) - (b.line ?? 0)
    || (a.category ?? '').localeCompare(b.category ?? '')
    || (a.message ?? '').localeCompare(b.message ?? '')
  );
}

function scanConfiguredPolyfills(pkg, policy, indexes) {
  const findings = [];
  const configured = [];
  const allRuntimeDeps = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.optionalDependencies ?? {}),
  };

  for (const packageName of Object.keys(allRuntimeDeps).sort(compareStrings)) {
    if (!KNOWN_BROWSER_POLYFILL_PACKAGES.has(packageName)) continue;
    const approved = indexes.approvedPolyfillsByPackage.get(packageName);
    configured.push({
      source: 'package.json',
      specifier: approved?.specifier ?? '<package-only>',
      package: packageName,
      owner: approved?.owner ?? null,
      approved: Boolean(approved),
    });
    if (!approved) {
      findings.push({
        category: 'node-polyfill',
        severity: 'unapproved-polyfill',
        file: 'package.json',
        line: 1,
        message: `browser polyfill package "${packageName}" is present in runtime dependencies but is not approved`,
      });
    }
  }

  const viteConfigPath = policy.viteConfig ?? 'vite.web.config.ts';
  if (fs.existsSync(abs(viteConfigPath))) {
    const text = readText(viteConfigPath);
    for (const polyfill of policy.approvedPolyfills ?? []) {
      if (text.includes(`'${polyfill.package}'`) || text.includes(`"${polyfill.package}"`)) {
        configured.push({
          source: viteConfigPath,
          specifier: polyfill.specifier,
          package: polyfill.package,
          owner: polyfill.owner,
          approved: true,
        });
      }
    }

    for (const packageName of KNOWN_BROWSER_POLYFILL_PACKAGES) {
      if (!text.includes(`'${packageName}'`) && !text.includes(`"${packageName}"`)) continue;
      if (indexes.approvedPolyfillsByPackage.has(packageName)) continue;
      configured.push({
        source: viteConfigPath,
        specifier: '<vite-config>',
        package: packageName,
        owner: null,
        approved: false,
      });
      findings.push({
        category: 'node-polyfill',
        severity: 'unapproved-polyfill',
        file: viteConfigPath,
        line: 1,
        message: `browser polyfill package "${packageName}" is referenced by Vite config but is not approved`,
      });
    }
  }

  return {
    configured: dedupeBy(configured, item => `${item.source}:${item.specifier}:${item.package}`).sort((a, b) =>
      a.source.localeCompare(b.source) || a.package.localeCompare(b.package)
    ),
    findings,
  };
}

function scanBundleMetadata(metadataPath, indexes) {
  const metadata = readJsonIfExists(metadataPath);
  if (!metadata) {
    return {
      path: metadataPath,
      present: false,
      packages: [],
      findings: [],
    };
  }

  const packageRecords = [];
  for (const chunk of metadata.chunks ?? []) {
    for (const moduleInfo of chunk.modules ?? []) {
      const packageName = moduleInfo.packageName;
      if (!packageName) continue;
      const allowlist = indexes.packageAllowlist.get(packageName) ?? [];
      const approvedPolyfill = indexes.approvedPolyfillsByPackage.get(packageName);
      packageRecords.push({
        chunk: chunk.fileName,
        module: moduleInfo.id,
        package: packageName,
        renderedLength: moduleInfo.renderedLength ?? 0,
        approved: allowlist.length > 0 || Boolean(approvedPolyfill),
        owners: allowlist.map(item => item.owner),
        polyfill: approvedPolyfill?.specifier ?? null,
      });
    }
  }

  const packages = Array.from(groupPackageSizes(packageRecords).values()).sort((a, b) => a.package.localeCompare(b.package));
  const findings = [];
  for (const record of packages) {
    if (!record.approved) {
      findings.push({
        category: 'unapproved-package',
        severity: 'dependency-policy',
        file: metadataPath,
        line: 1,
        message: `built browser bundle includes package "${record.package}" outside allowlist`,
      });
    }
  }

  return {
    path: metadataPath,
    present: true,
    packages,
    findings,
  };
}

function groupPackageSizes(records) {
  const grouped = new Map();
  for (const record of records) {
    const current = grouped.get(record.package) ?? {
      package: record.package,
      renderedLength: 0,
      chunks: new Set(),
      approved: record.approved,
      owners: new Set(record.owners),
      polyfill: record.polyfill,
    };
    current.renderedLength += record.renderedLength;
    current.chunks.add(record.chunk);
    for (const owner of record.owners) current.owners.add(owner);
    current.approved = current.approved || record.approved;
    current.polyfill = current.polyfill ?? record.polyfill;
    grouped.set(record.package, current);
  }

  for (const item of grouped.values()) {
    item.chunks = Array.from(item.chunks).sort(compareStrings);
    item.owners = Array.from(item.owners).sort(compareStrings);
  }
  return grouped;
}

function aggregateExternalPackages(records) {
  const packages = new Map();
  for (const record of records) {
    const current = packages.get(record.package) ?? {
      package: record.package,
      importCount: 0,
      importers: new Set(),
      owners: new Set(),
      approved: record.approved,
      polyfill: record.polyfill,
    };
    current.importCount += 1;
    current.importers.add(record.file);
    for (const owner of record.owners) current.owners.add(owner);
    current.approved = current.approved || record.approved;
    current.polyfill = current.polyfill ?? record.polyfill;
    packages.set(record.package, current);
  }

  return Array.from(packages.values())
    .map(item => ({
      ...item,
      importers: Array.from(item.importers).sort(compareStrings),
      owners: Array.from(item.owners).sort(compareStrings),
    }))
    .sort((a, b) => a.package.localeCompare(b.package));
}

function auditPackage() {
  const pkg = readJson('package.json');
  const policy = policyFromPackage(pkg);
  const indexes = buildPolicyIndexes(policy);
  const policyFindings = validatePolicy(policy);
  const roots = browserRootsFromPackage(pkg, policy);
  const graph = scanGraph(roots, indexes);
  const configuredPolyfills = scanConfiguredPolyfills(pkg, policy, indexes);
  const bundle = scanBundleMetadata(policy.bundleMetadata ?? DEFAULT_DIST_METADATA, indexes);
  const findings = [
    ...policyFindings,
    ...graph.findings,
    ...configuredPolyfills.findings,
    ...bundle.findings,
  ].sort(compareFindings);

  return {
    schemaVersion: 1,
    package: {
      name: pkg.name,
      version: pkg.version,
    },
    policy,
    summary: {
      browserRoots: graph.roots.length,
      reachableFiles: graph.reachableFiles.length,
      externalPackages: aggregateExternalPackages(graph.externalRecords).length,
      nodeBuiltinImports: graph.nodeBuiltinRecords.length,
      approvedPolyfillReferences: configuredPolyfills.configured.filter(item => item.approved).length + graph.polyfillRecords.length,
      findings: findings.length,
      bundleMetadataPresent: bundle.present,
    },
    graph: {
      ...graph,
      externalPackages: aggregateExternalPackages(graph.externalRecords),
    },
    configuredPolyfills,
    bundle,
    findings,
  };
}

function renderReport(audit) {
  const lines = [];
  lines.push('# Browser Dependency Policy');
  lines.push('');
  lines.push('Generated by `node scripts/audit-browser-dependencies.mjs --fail-on-node-builtins --fail-on-unapproved-polyfills --report docs/browser-dependency-policy.md`.');
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('- Audits browser package exports, the top-level `browser` field, and policy-owned web entrypoints.');
  lines.push('- Enforces `swissknife.browserDependencyPolicy` as the browser dependency allowlist.');
  lines.push('- Denies host-only Node builtin imports in browser graphs.');
  lines.push('- Allows browser polyfills only when the builtin, package, owner, and reason are declared in `package.json`.');
  lines.push('- Verifies Vite bundle metadata when `dist/.vite/swissknife-bundle-metadata.json` exists.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Package: \`${audit.package.name}@${audit.package.version}\``);
  lines.push(`- Browser roots audited: ${audit.summary.browserRoots}`);
  lines.push(`- Browser-reachable source files: ${audit.summary.reachableFiles}`);
  lines.push(`- Browser-reachable external packages: ${audit.summary.externalPackages}`);
  lines.push(`- Node builtin imports: ${audit.summary.nodeBuiltinImports}`);
  lines.push(`- Approved polyfill references: ${audit.summary.approvedPolyfillReferences}`);
  lines.push(`- Bundle metadata present: ${audit.summary.bundleMetadataPresent ? 'yes' : 'no'}`);
  lines.push(`- Findings: ${audit.summary.findings}`);
  lines.push('');

  lines.push('## Dependency Allowlist');
  lines.push('');
  lines.push('| ID | Owner | Loading | Packages | Purpose |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const group of audit.policy.allowlist ?? []) {
    lines.push(`| \`${markdownEscape(group.id)}\` | \`${markdownEscape(group.owner)}\` | \`${markdownEscape(group.loading ?? 'runtime')}\` | ${markdownEscape((group.packages ?? []).map(item => `\`${item}\``).join('<br>') || 'none')} | ${markdownEscape(group.purpose)} |`);
  }
  lines.push('');

  lines.push('## Required Ownership');
  lines.push('');
  for (const requiredId of REQUIRED_OWNERSHIP_IDS) {
    const group = (audit.policy.allowlist ?? []).find(item => item.id === requiredId);
    if (group) {
      lines.push(`- \`${requiredId}\`: owned by \`${group.owner}\`; ${group.purpose}`);
    } else {
      lines.push(`- \`${requiredId}\`: missing ownership entry.`);
    }
  }
  lines.push('');

  lines.push('## Node Builtin Denylist');
  lines.push('');
  lines.push((audit.policy.nodeBuiltinDenylist ?? []).map(item => `\`${item}\``).join(', '));
  lines.push('');
  lines.push('');

  lines.push('## Approved Browser Polyfills');
  lines.push('');
  lines.push('| Builtin specifier | Package | Owner | Reason |');
  lines.push('| --- | --- | --- | --- |');
  for (const polyfill of audit.policy.approvedPolyfills ?? []) {
    lines.push(`| \`${markdownEscape(polyfill.specifier)}\` | \`${markdownEscape(polyfill.package)}\` | \`${markdownEscape(polyfill.owner)}\` | ${markdownEscape(polyfill.reason)} |`);
  }
  lines.push('');

  lines.push('## Browser Roots');
  lines.push('');
  lines.push('| Path | Source | Kind | Owner | Exists |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const root of audit.graph.roots) {
    lines.push(`| \`${markdownEscape(root.path)}\` | \`${markdownEscape(root.source)}\` | \`${markdownEscape(root.kind)}\` | \`${markdownEscape(root.owner)}\` | ${root.exists ? 'yes' : 'no'} |`);
  }
  lines.push('');

  lines.push('## Browser-Reachable External Packages');
  lines.push('');
  if (audit.graph.externalPackages.length === 0) {
    lines.push('No external packages are statically reachable from audited browser source roots.');
  } else {
    lines.push('| Package | Approved | Owners | Import count | Importers |');
    lines.push('| --- | --- | --- | ---: | --- |');
    for (const item of audit.graph.externalPackages) {
      lines.push(`| \`${markdownEscape(item.package)}\` | ${item.approved ? 'yes' : 'no'} | ${markdownEscape(item.owners.map(owner => `\`${owner}\``).join('<br>') || (item.polyfill ? '`browser-polyfill`' : 'none'))} | ${item.importCount} | ${markdownEscape(item.importers.map(file => `\`${file}\``).join('<br>'))} |`);
    }
  }
  lines.push('');

  lines.push('## Configured Polyfills');
  lines.push('');
  if (audit.configuredPolyfills.configured.length === 0) {
    lines.push('No configured browser polyfills were found.');
  } else {
    lines.push('| Source | Builtin | Package | Approved | Owner |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const item of audit.configuredPolyfills.configured) {
      lines.push(`| \`${markdownEscape(item.source)}\` | \`${markdownEscape(item.specifier)}\` | \`${markdownEscape(item.package)}\` | ${item.approved ? 'yes' : 'no'} | ${item.owner ? `\`${markdownEscape(item.owner)}\`` : 'none'} |`);
    }
  }
  lines.push('');

  lines.push('## Dynamic Imports');
  lines.push('');
  if (audit.graph.dynamicImportRecords.length === 0) {
    lines.push('No non-literal dynamic imports were found in audited browser source roots.');
  } else {
    lines.push('| File | Line | Approved | Reason |');
    lines.push('| --- | ---: | --- | --- |');
    for (const item of audit.graph.dynamicImportRecords) {
      lines.push(`| \`${markdownEscape(item.file)}\` | ${item.line} | ${item.approved ? 'yes' : 'no'} | ${markdownEscape(item.reason)} |`);
    }
  }
  lines.push('');

  lines.push('## Bundle Metadata');
  lines.push('');
  if (!audit.bundle.present) {
    lines.push(`Bundle metadata was not present at \`${audit.bundle.path}\`. Source policy checks still ran; ` +
      '`npm run build:web` writes this metadata and then runs the bundle audit.');
  } else if (audit.bundle.packages.length === 0) {
    lines.push(`Bundle metadata at \`${audit.bundle.path}\` did not list external packages.`);
  } else {
    lines.push('| Package | Approved | Owners | Rendered length | Chunks |');
    lines.push('| --- | --- | --- | ---: | --- |');
    for (const item of audit.bundle.packages) {
      lines.push(`| \`${markdownEscape(item.package)}\` | ${item.approved ? 'yes' : 'no'} | ${markdownEscape(item.owners.map(owner => `\`${owner}\``).join('<br>') || (item.polyfill ? '`browser-polyfill`' : 'none'))} | ${item.renderedLength} | ${markdownEscape(item.chunks.map(chunk => `\`${chunk}\``).join('<br>'))} |`);
    }
  }
  lines.push('');

  lines.push('## Findings');
  lines.push('');
  if (audit.findings.length === 0) {
    lines.push('No browser dependency policy findings.');
  } else {
    lines.push('| Severity | Category | Location | Message |');
    lines.push('| --- | --- | --- | --- |');
    for (const finding of audit.findings) {
      const location = finding.file ? `${finding.file}:${finding.line ?? 1}` : 'package policy';
      lines.push(`| \`${markdownEscape(finding.severity)}\` | \`${markdownEscape(finding.category)}\` | \`${markdownEscape(location)}\` | ${markdownEscape(finding.message)} |`);
    }
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function shouldFail(audit, args) {
  return audit.findings.some(finding => {
    if (finding.severity === 'node-builtin') return args.failOnNodeBuiltins;
    if (finding.severity === 'unapproved-polyfill') return args.failOnUnapprovedPolyfills;
    return finding.severity === 'dependency-policy';
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const audit = auditPackage();

  if (args.report) {
    writeText(args.report, renderReport(audit));
  }
  if (args.json) {
    writeJson(args.json, audit);
  }

  if (shouldFail(audit, args)) {
    console.error(`Browser dependency audit failed with ${audit.findings.length} finding(s).`);
    for (const finding of audit.findings.slice(0, 20)) {
      const location = finding.file ? `${finding.file}:${finding.line ?? 1}` : 'package policy';
      console.error(`- [${finding.severity}] ${location}: ${finding.message}`);
    }
    if (audit.findings.length > 20) {
      console.error(`...and ${audit.findings.length - 20} more finding(s).`);
    }
    process.exitCode = 1;
    return;
  }

  console.log([
    `Browser dependency audit passed: ${audit.summary.browserRoots} roots`,
    `${audit.summary.reachableFiles} files`,
    `${audit.summary.externalPackages} external packages`,
    `${audit.summary.findings} findings`,
  ].join(', '));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
