#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const manifestPath = 'src/module-ownership.json';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const DATA_EXTENSIONS = new Set(['.json']);
const AUDITED_EXTENSIONS = new Set([...SOURCE_EXTENSIONS, ...DATA_EXTENSIONS]);
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.turbo',
  '.vite',
  'coverage',
  'dist',
  'node_modules',
  'test-dist',
]);

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
    failOnForbidden: false,
    failOnLegacy: false,
    failOnRootDebt: false,
    failOnUnknown: false,
    help: false,
    json: null,
    modules: new Set(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--fail-on-forbidden') {
      args.failOnForbidden = true;
    } else if (arg === '--fail-on-legacy') {
      args.failOnLegacy = true;
    } else if (arg === '--fail-on-root-debt') {
      args.failOnRootDebt = true;
    } else if (arg === '--fail-on-unknown') {
      args.failOnUnknown = true;
    } else if (arg === '--json') {
      args.json = argv[++i];
      if (!args.json) throw new Error('--json requires an output path');
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

function usage() {
  return [
    'Usage: node scripts/audit-source-modules.mjs [options]',
    '',
    'Options:',
    '  --fail-on-unknown      Exit non-zero when source files are not covered by the ownership manifest.',
    '  --fail-on-forbidden    Exit non-zero when imports violate manifest dependency rules.',
    '  --fail-on-root-debt    Exit non-zero when direct root source files are present.',
    '  --fail-on-legacy       Exit non-zero when legacy compatibility shims/import specifiers are present.',
    '  --module <name>        Limit file and import checks to one source module. Can be repeated.',
    '  --json <path>          Write the deterministic audit payload as JSON.',
    '  --help, -h             Show this help text.',
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

function listFiles(relativeDir, predicate, acc = []) {
  const absoluteDir = abs(relativeDir);
  if (!fs.existsSync(absoluteDir)) return acc;

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

function compareStrings(a, b) {
  return a.localeCompare(b);
}

function compareByPath(a, b) {
  return a.path.localeCompare(b.path);
}

function compareFindings(a, b) {
  return (
    a.module.localeCompare(b.module)
    || a.file.localeCompare(b.file)
    || (a.line ?? 0) - (b.line ?? 0)
    || (a.targetModule ?? '').localeCompare(b.targetModule ?? '')
    || (a.specifier ?? '').localeCompare(b.specifier ?? '')
  );
}

function lineNumberForOffset(text, offset) {
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
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
    || specifier.startsWith('@web/')
    || specifier.startsWith('@ipfs/');
}

function isAuditedFile(filePath) {
  return AUDITED_EXTENSIONS.has(path.extname(filePath));
}

function isSourceFile(filePath) {
  return SOURCE_EXTENSIONS.has(path.extname(filePath));
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
    for (const extension of ['', ...SOURCE_EXTENSIONS, ...DATA_EXTENSIONS]) {
      candidates.push(`${base}${extension}`);
    }
  }

  for (const extension of [...SOURCE_EXTENSIONS, ...DATA_EXTENSIONS]) {
    candidates.push(path.join(base, `index${extension}`));
  }

  return [...new Set(candidates)];
}

function resolveLocalSpecifier(specifier, importer) {
  const normalized = normalizeSpecifier(specifier);
  let base;

  if (normalized.startsWith('@/')) {
    base = abs(path.join('src', normalized.slice(2)));
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

function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '[^/]*')}$`);
}

function buildManifestIndex(manifest) {
  const modules = manifest.modules ?? {};
  const rootFileOwners = new Map(Object.entries(manifest.audit?.rootFileOwners ?? {}));
  const ignoredRootFiles = new Set(manifest.audit?.ignoredRootFiles ?? []);
  const legacyShims = (manifest.audit?.legacyCompatibilityShims ?? [])
    .map((item) => ({
      path: item.path,
      module: item.module ?? moduleForTopLevelPath(item.path, modules),
      replacement: item.replacement ?? null,
      reason: item.reason ?? 'legacy compatibility shim',
    }))
    .sort(compareByPath);
  const legacyShimPaths = new Set(legacyShims.map((item) => item.path));
  const importExceptions = (manifest.audit?.allowedImportExceptions ?? [])
    .map((item) => ({
      from: item.from,
      to: item.to,
      importer: item.importer ?? null,
      target: item.target ?? null,
      reason: item.reason ?? 'manifest exception',
    }))
    .sort((a, b) => `${a.from}:${a.to}:${a.importer ?? ''}:${a.target ?? ''}`.localeCompare(
      `${b.from}:${b.to}:${b.importer ?? ''}:${b.target ?? ''}`,
    ));

  const entrypointOwners = [];
  const pathOwners = [];
  for (const [moduleName, definition] of Object.entries(modules)) {
    if (definition.path?.startsWith('src/')) {
      pathOwners.push({
        module: moduleName,
        path: definition.path.replace(/\/+$/, ''),
      });
    }

    for (const pattern of [
      ...(definition.publicEntrypoints ?? []),
      ...(definition.privateEntrypoints ?? []),
    ]) {
      if (!pattern.startsWith('src/')) continue;
      entrypointOwners.push({
        module: moduleName,
        pattern,
        re: globToRegExp(pattern),
      });
    }
  }

  pathOwners.sort((a, b) => b.path.length - a.path.length || a.module.localeCompare(b.module));

  return {
    entrypointOwners,
    ignoredRootFiles,
    importExceptions,
    legacyShims,
    legacyShimPaths,
    modules,
    pathOwners,
    rootFileOwners,
  };
}

function moduleForTopLevelPath(filePath, modules) {
  if (!filePath.startsWith('src/')) return null;
  const rest = filePath.slice('src/'.length);
  const [first] = rest.split('/');
  return modules[first] ? first : null;
}

function moduleForPath(filePath, index) {
  if (!filePath.startsWith('src/')) return null;
  const rest = filePath.slice('src/'.length);
  if (!rest) return null;

  if (!rest.includes('/')) {
    if (index.rootFileOwners.has(filePath)) return index.rootFileOwners.get(filePath);
    const entrypointOwner = index.entrypointOwners.find((item) => item.re.test(filePath));
    return entrypointOwner?.module ?? null;
  }

  const owner = index.pathOwners.find((item) => filePath === item.path || filePath.startsWith(`${item.path}/`));
  if (owner) return owner.module;

  const topLevel = rest.split('/')[0];
  return index.modules[topLevel] ? topLevel : null;
}

function boundaryModuleForPath(filePath, index) {
  if (!isDirectRootFile(filePath)) return moduleForPath(filePath, index);
  return index.rootFileOwners.get(filePath) ?? null;
}

function isDirectRootFile(filePath) {
  if (!filePath.startsWith('src/')) return false;
  return !filePath.slice('src/'.length).includes('/');
}

function extractImports(filePath) {
  if (!isSourceFile(filePath)) return [];
  const text = fs.readFileSync(abs(filePath), 'utf8');
  const imports = [];

  for (const { kind, re } of IMPORT_REGEXES) {
    for (const match of text.matchAll(re)) {
      const specifier = normalizeSpecifier(match[1]);
      if (!specifier || specifier.startsWith('http://') || specifier.startsWith('https://')) continue;
      imports.push({
        file: filePath,
        kind,
        line: lineNumberForOffset(text, match.index ?? 0),
        specifier,
      });
    }
  }

  return imports.sort((a, b) => (
    a.line - b.line
    || a.kind.localeCompare(b.kind)
    || a.specifier.localeCompare(b.specifier)
  ));
}

function isExceptionAllowed(exception, finding) {
  return exception.from === finding.module
    && exception.to === finding.targetModule
    && (!exception.importer || exception.importer === finding.file)
    && (!exception.target || exception.target === finding.target);
}

function shouldIncludeModule(moduleName, args) {
  return args.modules.size === 0 || args.modules.has(moduleName);
}

function audit(manifest, args) {
  const index = buildManifestIndex(manifest);
  const allFiles = listFiles('src', (relative) => isAuditedFile(relative));
  const moduleNames = Object.keys(index.modules).sort(compareStrings);
  const knownModuleFiles = new Map(moduleNames.map((moduleName) => [moduleName, []]));
  const rootDebt = [];
  const unknownFiles = [];
  const forbiddenImports = [];
  const legacyRootImportSpecifiers = [];

  for (const filePath of allFiles) {
    const owner = moduleForPath(filePath, index);
    const directRoot = isDirectRootFile(filePath);

    if (directRoot && isSourceFile(filePath) && !index.ignoredRootFiles.has(filePath)) {
      rootDebt.push({
        file: filePath,
        module: owner ?? 'unowned-root',
        reason: index.rootFileOwners.has(filePath)
          ? 'root source compatibility file with an explicit owner'
          : 'root source file outside a top-level module',
      });
    }

    if (!owner) {
      if (!directRoot && isAuditedFile(filePath)) {
        unknownFiles.push({
          file: filePath,
          module: 'unknown',
          reason: 'top-level path is not listed in src/module-ownership.json',
        });
      }
      continue;
    }

    knownModuleFiles.get(owner)?.push(filePath);
  }

  for (const filePath of allFiles) {
    const importerModule = boundaryModuleForPath(filePath, index);
    if (!importerModule || !shouldIncludeModule(importerModule, args)) continue;
    const importerDefinition = index.modules[importerModule] ?? {};
    const forbiddenImportNames = new Set(importerDefinition.forbiddenImports ?? []);

    for (const item of extractImports(filePath)) {
      const bare = stripNodePrefix(item.specifier);
      if (!isLocalSpecifier(item.specifier) || bare !== item.specifier) continue;
      const target = resolveLocalSpecifier(item.specifier, filePath);
      if (!target || !target.startsWith('src/')) continue;
      const targetModule = boundaryModuleForPath(target, index);
      if (!targetModule) continue;

      const finding = {
        file: filePath,
        kind: item.kind,
        line: item.line,
        module: importerModule,
        specifier: item.specifier,
        target,
        targetModule,
      };

      if (index.legacyShimPaths.has(target)) {
        legacyRootImportSpecifiers.push({
          ...finding,
          reason: 'import resolves to a legacy compatibility shim',
        });
      }

      if (targetModule === importerModule) continue;
      const explicitlyForbidden = forbiddenImportNames.has(targetModule);
      if (!explicitlyForbidden) continue;
      if (index.importExceptions.some((exception) => isExceptionAllowed(exception, finding))) continue;

      forbiddenImports.push({
        ...finding,
        reason: `${importerModule} forbids imports from ${targetModule}`,
      });
    }
  }

  for (const files of knownModuleFiles.values()) {
    files.sort(compareStrings);
  }

  const scopedRootDebt = rootDebt
    .filter((item) => shouldIncludeModule(item.module, args))
    .sort((a, b) => a.file.localeCompare(b.file));
  const scopedUnknownFiles = unknownFiles
    .filter((item) => args.modules.size === 0 || args.modules.has(item.file.slice('src/'.length).split('/')[0]))
    .sort((a, b) => a.file.localeCompare(b.file));
  const scopedLegacyShims = index.legacyShims
    .filter((item) => shouldIncludeModule(item.module ?? 'unknown', args))
    .sort(compareByPath);
  const scopedLegacyRootImportSpecifiers = legacyRootImportSpecifiers
    .filter((item) => shouldIncludeModule(item.module, args))
    .sort(compareFindings);

  return {
    manifest: {
      path: manifestPath,
      schemaVersion: manifest.schemaVersion,
      manifestVersion: manifest.manifestVersion,
    },
    modules: moduleNames
      .filter((moduleName) => shouldIncludeModule(moduleName, args))
      .map((moduleName) => {
        const definition = index.modules[moduleName];
        return {
          module: moduleName,
          owner: definition.owner,
          runtimeClassification: definition.runtimeClassification,
          fileCount: knownModuleFiles.get(moduleName)?.length ?? 0,
        };
      }),
    summary: {
      modules: moduleNames.filter((moduleName) => shouldIncludeModule(moduleName, args)).length,
      rootFiles: scopedRootDebt.length,
      unknownFiles: scopedUnknownFiles.length,
      forbiddenImports: forbiddenImports.length,
      legacyCompatibilityShims: scopedLegacyShims.length,
      legacyRootImportSpecifiers: scopedLegacyRootImportSpecifiers.length,
    },
    rootDebt: scopedRootDebt,
    unknownFiles: scopedUnknownFiles,
    forbiddenImports: forbiddenImports.sort(compareFindings),
    legacyCompatibilityShims: scopedLegacyShims,
    legacyRootImportSpecifiers: scopedLegacyRootImportSpecifiers,
  };
}

function formatFindingLine(item) {
  const location = item.line ? `${item.file}:${item.line}` : item.file;
  const target = item.target ? ` -> ${item.target}` : '';
  const specifier = item.specifier ? ` (${item.kind} "${item.specifier}")` : '';
  return `  - ${location} [${item.module}]${target}${specifier}: ${item.reason}`;
}

function formatPathLine(item) {
  const replacement = item.replacement ? ` -> ${item.replacement}` : '';
  return `  - ${item.path} [${item.module ?? 'unknown'}]${replacement}: ${item.reason}`;
}

function printSection(title, items, formatter) {
  console.log(`${title}: ${items.length}`);
  if (items.length === 0) {
    console.log('  - none');
    return;
  }
  for (const item of items) {
    console.log(formatter(item));
  }
}

function printReport(result) {
  console.log('source modules:audit');
  console.log(`manifest: ${result.manifest.path} (schema ${result.manifest.schemaVersion}, version ${result.manifest.manifestVersion})`);
  console.log(`modules: ${result.summary.modules}`);
  console.log(`root files: ${result.summary.rootFiles}`);
  console.log(`unknown files: ${result.summary.unknownFiles}`);
  console.log(`forbidden imports: ${result.summary.forbiddenImports}`);
  console.log(`legacy compatibility shims: ${result.summary.legacyCompatibilityShims}`);
  console.log(`legacy root import specifiers: ${result.summary.legacyRootImportSpecifiers}`);
  console.log('');
  printSection('root files', result.rootDebt, formatFindingLine);
  console.log('');
  printSection('unknown files', result.unknownFiles, formatFindingLine);
  console.log('');
  printSection('forbidden imports', result.forbiddenImports, formatFindingLine);
  console.log('');
  printSection('legacy compatibility shims', result.legacyCompatibilityShims, formatPathLine);
  console.log('');
  printSection('legacy root import specifiers', result.legacyRootImportSpecifiers, formatFindingLine);
}

function writeJson(relativeOrAbsolutePath, result) {
  const outputPath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : abs(relativeOrAbsolutePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const manifest = readJson(manifestPath);
  const result = audit(manifest, args);
  printReport(result);
  if (args.json) writeJson(args.json, result);

  const failures = [];
  if (args.failOnUnknown && result.summary.unknownFiles > 0) failures.push('unknown files');
  if (args.failOnForbidden && result.summary.forbiddenImports > 0) failures.push('forbidden imports');
  if (args.failOnRootDebt && result.summary.rootFiles > 0) failures.push('root files');
  if (
    args.failOnLegacy
    && (result.summary.legacyCompatibilityShims > 0 || result.summary.legacyRootImportSpecifiers > 0)
  ) {
    failures.push('legacy compatibility shims/imports');
  }

  if (failures.length > 0) {
    console.error(`source modules:audit failed on ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
