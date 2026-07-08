#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const RESOLVABLE_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.wasm'];
const BROWSER_PUBLIC_EXTENSIONS = new Set(['.ts', '.tsx', '.wasm']);
const IGNORED_DIRECTORIES = new Set(['.git', '.turbo', '.vite', 'coverage', 'dist', 'node_modules', 'test-dist']);

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

const HOST_NODE_BUILTINS = new Set([
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

const FORBIDDEN_BROWSER_PACKAGES = new Map([
  ['@anthropic-ai/bedrock-sdk', 'Bedrock SDK credential resolution is host-only.'],
  ['@anthropic-ai/claude-code', 'Claude Code is a host CLI/runtime package.'],
  ['@anthropic-ai/vertex-sdk', 'Vertex SDK credential resolution is host-only.'],
  ['@img/sharp-darwin-arm64', 'Sharp native binary package.'],
  ['@img/sharp-darwin-x64', 'Sharp native binary package.'],
  ['@img/sharp-linux-arm', 'Sharp native binary package.'],
  ['@img/sharp-linux-arm64', 'Sharp native binary package.'],
  ['@img/sharp-linux-x64', 'Sharp native binary package.'],
  ['@img/sharp-win32-x64', 'Sharp native binary package.'],
  ['@inkjs/ui', 'Terminal UI package.'],
  ['ansi-escapes', 'Terminal control package.'],
  ['chalk', 'Terminal color package.'],
  ['cli-highlight', 'Terminal highlighting package.'],
  ['cli-table3', 'Terminal table package.'],
  ['figures', 'Terminal symbol package.'],
  ['glob', 'Filesystem traversal package.'],
  ['ink', 'Terminal UI package.'],
  ['ink-link', 'Terminal UI package.'],
  ['ora', 'Terminal spinner package.'],
  ['pyodide', 'Python runtime package must stay out of public browser exports.'],
  ['sharp', 'Native image binary package.'],
  ['spawn-rx', 'Subprocess wrapper package.'],
]);

const HOST_SOURCE_RULES = [
  { re: /^cli\.mjs$/, category: 'cli', message: 'host CLI binary entrypoint' },
  { re: /^src\/(?:cli|cli-phase1|cli-simple)\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'cli', message: 'host CLI entry module' },
  { re: /^src\/cli\//, category: 'cli', message: 'host CLI implementation' },
  { re: /^src\/commands(?:\.ts|\/)/, category: 'commands', message: 'host command implementation' },
  { re: /^src\/command-registry\.ts$/, category: 'commands', message: 'host command registry' },
  { re: /^src\/entrypoints\//, category: 'entrypoints', message: 'host process entrypoint' },
  { re: /^src\/platform\/host\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'platform-host', message: 'host platform adapter' },
  { re: /^src\/ai\/host\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'ai-host', message: 'host AI adapter' },
  { re: /^src\/models\/host\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'models-host', message: 'host model adapter' },
  { re: /^src\/storage\/host\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'storage-host', message: 'host storage adapter' },
  { re: /^src\/workers\/host\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'workers-host', message: 'host worker adapter' },
  { re: /^src\/storage\/(?:backends\/filesystem|local\/file-storage)\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'filesystem', message: 'host filesystem storage backend' },
  { re: /^src\/utils\/(?:PersistentShell|execFileNoThrow|file|git|native-loader)\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'host-utils', message: 'host filesystem/subprocess utility' },
  { re: /^src\/tools(?:\.ts|\/)/, category: 'tools', message: 'host command/tool execution module' },
  { re: /^src\/components\/(?!browser\/)/, category: 'terminal-ui', message: 'host terminal UI component' },
  { re: /^src\/hooks\/(?!browser\/)/, category: 'terminal-ui', message: 'host terminal hook' },
  { re: /^src\/screens\/(?!browser\/)/, category: 'terminal-ui', message: 'host terminal screen' },
  { re: /^src\/workers\/(?:pool|worker-pool|worker-thread|thread|worker)\.(?:ts|tsx|js|jsx|mjs|cjs)$/, category: 'workers-host', message: 'Node worker runtime' },
];

const FORBIDDEN_CODE_PATTERNS = [
  {
    category: 'subprocess',
    re: /(^|[^\w.])(?:spawn|spawnSync|exec|execFile|execFileSync|execSync)\s*\(/g,
    message: 'subprocess API call',
  },
  {
    category: 'filesystem',
    re: /\b(?:readFileSync|writeFileSync|existsSync|mkdirSync|statSync|createReadStream|createWriteStream|fs\.(?:read|write|mkdir|readdir|stat|unlink|exists|create))/g,
    message: 'filesystem API usage',
  },
  {
    category: 'native-binary',
    re: /(?:["'`][^"'`]+\.node["'`]|\bnative-loader\b|\bloadNativeModule\b|\bbridge\.node\b)/gi,
    message: 'native binary/module dependency',
  },
];

function parseArgs(argv) {
  const args = {
    failOnHostLeakage: false,
    help: false,
    json: null,
    report: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--fail-on-host-leakage') {
      args.failOnHostLeakage = true;
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
    'Usage: node scripts/audit-package-browser-exports.mjs [options]',
    '',
    'Options:',
    '  --fail-on-host-leakage  Exit non-zero when browser/import/default package exports expose host-only code.',
    '  --report <path>         Write a Markdown browser public API report.',
    '  --json <path>           Write the deterministic audit payload as JSON.',
    '  --help, -h              Show this help text.',
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

function readText(relativePath) {
  return fs.readFileSync(abs(relativePath), 'utf8');
}

function writeText(relativePath, text) {
  const output = abs(relativePath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, text, 'utf8');
}

function compareStrings(a, b) {
  return a.localeCompare(b);
}

function normalizeSpecifier(specifier) {
  return specifier.replace(/[?#].*$/, '');
}

function stripNodePrefix(specifier) {
  return specifier.startsWith('node:') ? specifier.slice(5) : specifier;
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

function isUrlLikeSpecifier(specifier) {
  return /^(?:data|blob|https?|wss?):/i.test(specifier);
}

function packageNameForSpecifier(specifier) {
  const normalized = stripNodePrefix(normalizeSpecifier(specifier));
  if (normalized.startsWith('@')) {
    const [scope, name] = normalized.split('/');
    return scope && name ? `${scope}/${name}` : normalized;
  }
  return normalized.split('/')[0];
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
      candidates.push(`${withoutExt}.ts`, `${withoutExt}.tsx`, `${withoutExt}.jsx`);
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
      return rel(candidate);
    }
  }

  return null;
}

function flattenExportLeaves(exportName, value, conditions = []) {
  if (typeof value === 'string' || value === null) {
    return [{
      exportName,
      conditions,
      condition: conditions.length ? conditions.join('.') : 'default',
      target: value,
    }];
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

function hasCondition(leaf, condition) {
  return leaf.conditions.includes(condition);
}

function hasAnyCondition(leaf, conditions) {
  return conditions.some(condition => hasCondition(leaf, condition));
}

function isTypesOnlyLeaf(leaf) {
  return hasCondition(leaf, 'types');
}

function isHostRuntimeLeaf(leaf) {
  return hasAnyCondition(leaf, ['node', 'node-addons', 'host']);
}

function isBrowserRelevantLeaf(leaf) {
  if (leaf.target === null || isTypesOnlyLeaf(leaf) || isHostRuntimeLeaf(leaf)) return false;
  if (leaf.exportName === './package.json') return false;
  return leaf.conditions.length === 0
    || hasAnyCondition(leaf, ['browser', 'import', 'default', 'module']);
}

function targetPath(target) {
  if (typeof target !== 'string') return null;
  if (!target.startsWith('./')) return null;
  return target.slice(2);
}

function classifyExport(exportName, leaves) {
  if (exportName === './package.json') return 'metadata';
  const browserLeaves = leaves.filter(isBrowserRelevantLeaf);
  const hostLeaves = leaves.filter(leaf => leaf.target !== null && isHostRuntimeLeaf(leaf));
  if (browserLeaves.length > 0) return 'browser-public';
  if (hostLeaves.length > 0) return 'host-only';
  return 'blocked';
}

function extractImports(filePath, text) {
  const imports = [];
  for (const { kind, re } of IMPORT_REGEXES) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      imports.push({
        file: filePath,
        kind,
        line: lineNumberForOffset(text, match.index),
        specifier: match[1],
      });
    }
  }
  return imports.sort((a, b) => a.line - b.line || a.specifier.localeCompare(b.specifier));
}

function hostSourceRuleFor(filePath) {
  return HOST_SOURCE_RULES.find(rule => rule.re.test(filePath)) ?? null;
}

function scanForbiddenCode(filePath, text) {
  const findings = [];
  for (const rule of FORBIDDEN_CODE_PATTERNS) {
    rule.re.lastIndex = 0;
    let match;
    while ((match = rule.re.exec(text)) !== null) {
      findings.push({
        category: rule.category,
        file: filePath,
        kind: 'forbidden-code',
        line: lineNumberForOffset(text, match.index),
        message: rule.message,
        severity: 'host-leakage',
      });
    }
  }
  return findings;
}

function shouldTraverse(filePath) {
  const extension = path.extname(filePath);
  if (!SOURCE_EXTENSIONS.has(extension)) return false;
  return !filePath.split('/').some(segment => IGNORED_DIRECTORIES.has(segment));
}

function auditBrowserTarget(exportName, condition, rootFile) {
  const queue = [rootFile];
  const visited = new Set();
  const imports = [];
  const externalPackages = new Set();
  const findings = [];
  const unresolved = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    const hostRule = hostSourceRuleFor(current);
    if (hostRule) {
      findings.push({
        category: hostRule.category,
        file: current,
        kind: 'host-source',
        line: 1,
        message: hostRule.message,
        severity: 'host-leakage',
      });
    }

    if (!shouldTraverse(current)) continue;

    const text = readText(current);
    findings.push(...scanForbiddenCode(current, text));

    for (const dependency of extractImports(current, text)) {
      imports.push(dependency);
      const normalized = normalizeSpecifier(dependency.specifier);
      const bareBuiltin = stripNodePrefix(normalized);

      if (HOST_NODE_BUILTINS.has(bareBuiltin) || HOST_NODE_BUILTINS.has(normalized)) {
        findings.push({
          category: 'node-builtin',
          file: current,
          kind: dependency.kind,
          line: dependency.line,
          message: `imports host-only Node builtin "${dependency.specifier}"`,
          severity: 'host-leakage',
          specifier: dependency.specifier,
        });
        continue;
      }

      if (BUILTIN_NAMES.has(bareBuiltin) || BUILTIN_NAMES.has(normalized)) {
        externalPackages.add(`node:${bareBuiltin}`);
        continue;
      }

      if (isLocalSpecifier(normalized)) {
        const resolved = resolveLocalSpecifier(normalized, current);
        if (resolved) {
          queue.push(resolved);
        } else {
          unresolved.push(dependency);
        }
        continue;
      }

      if (isUrlLikeSpecifier(normalized)) {
        continue;
      }

      const packageName = packageNameForSpecifier(normalized);
      externalPackages.add(packageName);
      const forbiddenReason = FORBIDDEN_BROWSER_PACKAGES.get(packageName);
      if (forbiddenReason) {
        findings.push({
          category: 'forbidden-package',
          file: current,
          kind: dependency.kind,
          line: dependency.line,
          message: `imports forbidden browser package "${packageName}": ${forbiddenReason}`,
          severity: 'host-leakage',
          specifier: dependency.specifier,
        });
      }
    }
  }

  return {
    exportName,
    condition,
    rootFile,
    reachableFiles: Array.from(visited).sort(compareStrings),
    imports,
    externalPackages: Array.from(externalPackages).sort(compareStrings),
    unresolved,
    findings: findings.sort(compareFindings),
  };
}

function compareFindings(a, b) {
  return (
    a.file.localeCompare(b.file)
    || (a.line ?? 0) - (b.line ?? 0)
    || a.category.localeCompare(b.category)
    || (a.specifier ?? '').localeCompare(b.specifier ?? '')
  );
}

function validateBrowserTarget(leaf) {
  const findings = [];
  const relative = targetPath(leaf.target);

  if (!relative) {
    findings.push({
      category: 'invalid-target',
      file: leaf.target ?? '<null>',
      kind: 'package-export',
      line: 1,
      message: `browser-relevant export "${leaf.exportName}" condition "${leaf.condition}" must target a local file`,
      severity: 'host-leakage',
    });
    return { relative: null, findings };
  }

  const extension = path.extname(relative);
  if (!BROWSER_PUBLIC_EXTENSIONS.has(extension)) {
    findings.push({
      category: 'invalid-extension',
      file: relative,
      kind: 'package-export',
      line: 1,
      message: `browser-relevant export "${leaf.exportName}" condition "${leaf.condition}" must resolve to a TS/TSX/WASM module`,
      severity: 'host-leakage',
    });
  }

  if (!fs.existsSync(abs(relative))) {
    findings.push({
      category: 'missing-target',
      file: relative,
      kind: 'package-export',
      line: 1,
      message: `browser-relevant export "${leaf.exportName}" condition "${leaf.condition}" points at a missing file`,
      severity: 'host-leakage',
    });
  }

  return { relative, findings };
}

function auditPackage(pkg) {
  const exportLeaves = flattenPackageExports(pkg);
  const leavesByExport = new Map();
  for (const leaf of exportLeaves) {
    const leaves = leavesByExport.get(leaf.exportName) ?? [];
    leaves.push(leaf);
    leavesByExport.set(leaf.exportName, leaves);
  }

  const exports = Array.from(leavesByExport.entries())
    .map(([exportName, leaves]) => ({
      exportName,
      classification: classifyExport(exportName, leaves),
      leaves: leaves.sort((a, b) => a.condition.localeCompare(b.condition)),
    }))
    .sort((a, b) => a.exportName.localeCompare(b.exportName));

  const browserLeaves = exportLeaves
    .filter(isBrowserRelevantLeaf)
    .sort((a, b) => a.exportName.localeCompare(b.exportName) || a.condition.localeCompare(b.condition));

  const browserAudits = [];
  const packageFindings = [];
  const auditedTargets = new Set();

  for (const leaf of browserLeaves) {
    const validation = validateBrowserTarget(leaf);
    packageFindings.push(...validation.findings);
    if (!validation.relative || !fs.existsSync(abs(validation.relative))) continue;
    const key = `${leaf.exportName}\0${leaf.condition}\0${validation.relative}`;
    if (auditedTargets.has(key)) continue;
    auditedTargets.add(key);
    if (path.extname(validation.relative) === '.wasm') {
      browserAudits.push({
        exportName: leaf.exportName,
        condition: leaf.condition,
        rootFile: validation.relative,
        reachableFiles: [validation.relative],
        imports: [],
        externalPackages: [],
        unresolved: [],
        findings: [],
      });
    } else {
      browserAudits.push(auditBrowserTarget(leaf.exportName, leaf.condition, validation.relative));
    }
  }

  const browserField = typeof pkg.browser === 'string'
    ? {
      target: pkg.browser,
      targetPath: targetPath(pkg.browser),
    }
    : pkg.browser && typeof pkg.browser === 'object'
      ? { target: '<object-map>', entries: Object.entries(pkg.browser).length }
      : null;

  if (browserField?.targetPath) {
    const syntheticLeaf = {
      exportName: '<browser-field>',
      condition: 'browser',
      conditions: ['browser'],
      target: browserField.target,
    };
    const validation = validateBrowserTarget(syntheticLeaf);
    packageFindings.push(...validation.findings);
    if (validation.relative && fs.existsSync(abs(validation.relative))) {
      browserAudits.push(auditBrowserTarget('<browser-field>', 'browser', validation.relative));
    }
  }

  const allFindings = [
    ...packageFindings,
    ...browserAudits.flatMap(audit => audit.findings),
  ].sort(compareFindings);

  return {
    packageName: pkg.name,
    packageVersion: pkg.version,
    browserField,
    exports,
    browserAudits: browserAudits.sort((a, b) => a.exportName.localeCompare(b.exportName) || a.condition.localeCompare(b.condition)),
    findings: allFindings,
    summary: {
      exports: exports.length,
      browserPublicExports: exports.filter(item => item.classification === 'browser-public').length,
      hostOnlyExports: exports.filter(item => item.classification === 'host-only').length,
      metadataExports: exports.filter(item => item.classification === 'metadata').length,
      browserRuntimeConditions: browserLeaves.length + (browserField ? 1 : 0),
      browserReachableFiles: new Set(browserAudits.flatMap(audit => audit.reachableFiles)).size,
      hostLeakageFindings: allFindings.filter(finding => finding.severity === 'host-leakage').length,
    },
  };
}

function formatTarget(target) {
  if (target === null) return '`null`';
  return `\`${target}\``;
}

function formatConditions(leaves) {
  return leaves
    .map(leaf => `${leaf.condition} -> ${formatTarget(leaf.target)}`)
    .join('<br>');
}

function renderReport(result) {
  const lines = [];
  lines.push('# Browser Public API');
  lines.push('');
  lines.push('Generated by `node scripts/audit-package-browser-exports.mjs --fail-on-host-leakage --report docs/browser-public-api.md`.');
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('- Audits `package.json` `exports` plus the legacy top-level `browser` field.');
  lines.push('- Browser-relevant runtime conditions are `browser`, `import`, `module`, and `default` unless nested under `node`/`host`.');
  lines.push('- Browser public targets must resolve to local `.ts`, `.tsx`, or `.wasm` files and their local static dependency graphs must avoid host filesystem, subprocess, Python, native binary, and terminal modules.');
  lines.push('- Host-only public exports must be reachable only through `node`/host-specific conditions and must not provide a browser/default runtime fallback.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Package: \`${result.packageName}@${result.packageVersion}\``);
  lines.push(`- Public export entries: ${result.summary.exports}`);
  lines.push(`- Browser public exports: ${result.summary.browserPublicExports}`);
  lines.push(`- Host-only exports: ${result.summary.hostOnlyExports}`);
  lines.push(`- Browser runtime conditions audited: ${result.summary.browserRuntimeConditions}`);
  lines.push(`- Browser-reachable local files: ${result.summary.browserReachableFiles}`);
  lines.push(`- Host leakage findings: ${result.summary.hostLeakageFindings}`);
  lines.push('');
  lines.push('## Public Export Matrix');
  lines.push('');
  lines.push('| Export | Classification | Conditions |');
  lines.push('| --- | --- | --- |');
  for (const entry of result.exports) {
    lines.push(`| \`${entry.exportName}\` | \`${entry.classification}\` | ${formatConditions(entry.leaves)} |`);
  }
  lines.push('');
  lines.push('## Browser Runtime Targets');
  lines.push('');
  lines.push('| Export | Condition | Target | Reachable files | External packages | Findings |');
  lines.push('| --- | --- | --- | ---: | --- | ---: |');
  for (const audit of result.browserAudits) {
    const packages = audit.externalPackages.length ? audit.externalPackages.map(name => `\`${name}\``).join(', ') : 'none';
    lines.push(`| \`${audit.exportName}\` | \`${audit.condition}\` | \`${audit.rootFile}\` | ${audit.reachableFiles.length} | ${packages} | ${audit.findings.length} |`);
  }
  lines.push('');
  lines.push('## Host-Only Runtime Targets');
  lines.push('');
  const hostOnly = result.exports.filter(entry => entry.classification === 'host-only');
  if (hostOnly.length === 0) {
    lines.push('No host-only exports are declared.');
  } else {
    lines.push('| Export | Host/runtime-specific conditions | Browser/default fallback |');
    lines.push('| --- | --- | --- |');
    for (const entry of hostOnly) {
      const hostLeaves = entry.leaves.filter(isHostRuntimeLeaf);
      const defaultLeaves = entry.leaves.filter(leaf => hasCondition(leaf, 'default'));
      const hostConditions = hostLeaves.map(leaf => `${leaf.condition} -> ${formatTarget(leaf.target)}`).join('<br>');
      const fallback = defaultLeaves.length
        ? defaultLeaves.map(leaf => `${leaf.condition} -> ${formatTarget(leaf.target)}`).join('<br>')
        : '`none`';
      lines.push(`| \`${entry.exportName}\` | ${hostConditions || '`none`'} | ${fallback} |`);
    }
  }
  lines.push('');
  lines.push('## Browser Field');
  lines.push('');
  if (result.browserField) {
    if (result.browserField.target) {
      lines.push(`- Top-level \`browser\` field target: \`${result.browserField.target}\`.`);
    } else {
      lines.push(`- Top-level \`browser\` field object entries: ${result.browserField.entries}.`);
    }
  } else {
    lines.push('- No top-level `browser` field is declared.');
  }
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  if (result.findings.length === 0) {
    lines.push('No package browser export host leakage findings.');
  } else {
    lines.push('| Severity | Category | File | Line | Detail |');
    lines.push('| --- | --- | --- | ---: | --- |');
    for (const finding of result.findings) {
      const detail = finding.specifier
        ? `${finding.message} (${finding.specifier})`
        : finding.message;
      lines.push(`| \`${finding.severity}\` | \`${finding.category}\` | \`${finding.file}\` | ${finding.line ?? 1} | ${detail.replace(/\|/g, '\\|')} |`);
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const pkg = readJson('package.json');
  const result = auditPackage(pkg);

  if (args.report) {
    writeText(args.report, renderReport(result));
  }

  if (args.json) {
    writeText(args.json, `${JSON.stringify(result, null, 2)}\n`);
  }

  const findingCount = result.summary.hostLeakageFindings;
  console.log(`Package browser export audit: ${result.summary.browserRuntimeConditions} browser runtime conditions, ${findingCount} host leakage finding(s).`);

  if (args.failOnHostLeakage && findingCount > 0) {
    for (const finding of result.findings.slice(0, 20)) {
      console.error(`${finding.file}:${finding.line ?? 1} ${finding.category}: ${finding.message}`);
    }
    throw new Error(`Package browser export audit failed with ${findingCount} host leakage finding(s).`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
