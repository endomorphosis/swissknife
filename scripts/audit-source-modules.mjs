#!/usr/bin/env node

import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const manifestPath = 'src/module-ownership.json';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const SERVICE_EXECUTABLE_SOURCE_EXTENSIONS = new Set([...SOURCE_EXTENSIONS, '.circom']);
const DATA_EXTENSIONS = new Set(['.json']);
const AUDITED_EXTENSIONS = new Set([...SERVICE_EXECUTABLE_SOURCE_EXTENSIONS, ...DATA_EXTENSIONS]);
const DEFAULT_RESTORED_SERVICE_DUPLICATE_POLICY = {
  indexBasenamesIgnored: false,
  broadExemptionsAllowed: false,
  nonIndexBasenameDuplicatesAreFailuresByDefault: true,
  approvedIndexEntrypoints: [],
  approvedMultiEntrypoints: [],
  approvedContentHashes: [],
  classifiedCollisions: [],
};
const DEFAULT_RESTORED_SERVICE_DUPLICATE_INVENTORY_JSON =
  'docs/restored-service-duplicate-inventory.json';
const DEFAULT_RESTORED_SERVICE_DUPLICATE_INVENTORY_MARKDOWN =
  'docs/restored-service-duplicate-inventory.md';
const DEFAULT_SERVICE_MODULE_PUBLIC_API_MARKDOWN =
  'docs/service-module-public-api.md';
const DEFAULT_REVALIDATION_TASK_ID = 'SWR-137';
const DEFAULT_RECOVERY_PROVENANCE_PATH = 'docs/phase-21-recovery-provenance.json';
const DEFAULT_RELEASE_READINESS_SURFACE = {
  manifestPath: 'scripts/lib/release-readiness-evidence-producers.mjs',
  producerExport: 'RELEASE_EVIDENCE_PRODUCER_GATES',
  entrypointOwnershipExport: 'RELEASE_READINESS_ENTRYPOINT_OWNERSHIP',
  owner: 'release-readiness',
  requiredEntrypoints: [
    'scripts/lib/release-readiness-evidence-producers.mjs',
    'scripts/release-readiness-gate.mjs',
    'scripts/lib/release-reproduction-attestation.mjs',
    'scripts/capture-refactor-main-reconciliation.cjs',
    'scripts/lib/pick-free-port.mjs',
    'scripts/run-with-owned-port.mjs',
    'build-tools/configs/playwright.live-behavior-proof.config.ts',
    'build-tools/configs/playwright.live-gateway.config.ts',
    'test/architecture/release-readiness-hermetic.test.ts',
  ],
  ownedPortHelper: 'scripts/lib/pick-free-port.mjs',
  ownedPortWrapper: 'scripts/run-with-owned-port.mjs',
  releaseGate: 'scripts/release-readiness-gate.mjs',
  publicReleaseApiImporters: [
    'scripts/release-readiness-gate.mjs',
    'test/architecture/release-readiness-hermetic.test.ts',
  ],
  ownedPortHelperImporters: [
    'scripts/run-with-owned-port.mjs',
    'test/architecture/release-readiness-hermetic.test.ts',
  ],
  publicExports: [
    'RELEASE_EVIDENCE_PRODUCER_GATES',
    'RELEASE_READINESS_ENTRYPOINT_OWNERSHIP',
    'validateReleaseReadinessManifest',
    'createReleaseEvidenceProducerGateEntries',
    'runReleaseEvidenceProducers',
    'producerEvidenceAbsolutePaths',
    'producerEvidenceDirectories',
    'releaseReadinessEvidenceAbsolutePaths',
  ],
  ownedPortExports: ['findOwnedPort'],
};
const HOST_ONLY_BUILTINS = new Set([
  'assert',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'timers',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'worker_threads',
  'zlib',
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
    restoredServiceDuplicateInventoryJson: null,
    restoredServiceDuplicateInventoryMarkdown: null,
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
    } else if (arg === '--restored-service-duplicate-inventory-json') {
      args.restoredServiceDuplicateInventoryJson = argv[++i];
      if (!args.restoredServiceDuplicateInventoryJson) {
        throw new Error('--restored-service-duplicate-inventory-json requires an output path');
      }
    } else if (arg === '--restored-service-duplicate-inventory-md') {
      args.restoredServiceDuplicateInventoryMarkdown = argv[++i];
      if (!args.restoredServiceDuplicateInventoryMarkdown) {
        throw new Error('--restored-service-duplicate-inventory-md requires an output path');
      }
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
    '  --restored-service-duplicate-inventory-json <path>',
    `                         Write restored service duplicate inventory JSON. Defaults to ${DEFAULT_RESTORED_SERVICE_DUPLICATE_INVENTORY_JSON} with --json.`,
    '  --restored-service-duplicate-inventory-md <path>',
    `                         Write restored service duplicate inventory Markdown. Defaults to ${DEFAULT_RESTORED_SERVICE_DUPLICATE_INVENTORY_MARKDOWN} with --json.`,
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
    } else if (!entry.isSymbolicLink() && predicate(relative, absolute)) {
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

function collectUnresolvedMergeMarkers(filePaths, index) {
  const findings = [];
  const marker = /^(?:<{7,}|>{7,})(?:\s.*)?$/gm;
  for (const filePath of filePaths) {
    if (!isSourceFile(filePath)) continue;
    const source = fs.readFileSync(abs(filePath), 'utf8');
    for (const match of source.matchAll(marker)) {
      findings.push({
        file: filePath,
        line: lineNumberForOffset(source, match.index ?? 0),
        module: moduleForPath(filePath, index) ?? 'unknown',
        reason: 'source file contains an unresolved merge-conflict marker',
      });
    }
  }
  return findings.sort(compareFindings);
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

function isServiceSourceFile(filePath) {
  return filePath.startsWith('src/services/')
    && SERVICE_EXECUTABLE_SOURCE_EXTENSIONS.has(path.extname(filePath));
}

function isServiceIndexFile(filePath) {
  return isServiceSourceFile(filePath) && /^index\.[cm]?[jt]sx?$/.test(path.basename(filePath));
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
  let source = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    const next = glob[i + 1];
    if (char === '*' && next === '*') {
      const following = glob[i + 2];
      if (following === '/') {
        source += '(?:.*/)?';
        i += 2;
      } else {
        source += '.*';
        i += 1;
      }
    } else if (char === '*') {
      source += '[^/]*';
    } else if (/[.+^${}()|[\]\\]/.test(char)) {
      source += `\\${char}`;
    } else {
      source += char;
    }
  }
  source += '$';
  return new RegExp(source);
}

function buildManifestIndex(manifest) {
  const modules = manifest.modules ?? {};
  const restoredServiceDuplicatePolicy = normalizeRestoredServiceDuplicatePolicy(manifest);
  const releaseReadinessSurface = normalizeReleaseReadinessSurface(manifest);
  const rootFileOwners = new Map(Object.entries(manifest.audit?.rootFileOwners ?? {}));
  const serviceRootFileOwners = new Map(Object.entries(manifest.audit?.serviceRootFileOwners ?? {}));
  const ignoredRootFiles = new Set(manifest.audit?.ignoredRootFiles ?? []);
  const browserSafeSourceGlobs = (manifest.audit?.browserSafeSourceGlobs ?? [])
    .map((pattern) => ({ pattern, re: globToRegExp(pattern) }));
  const browserSafeServiceFiles = new Set(manifest.audit?.browserSafeServiceFiles ?? []);
  const browserHostOnlyPackages = new Set(manifest.audit?.browserHostOnlyPackages ?? []);
  const browserPublicEntrypoints = (manifest.audit?.browserPublicEntrypoints ?? [])
    .map((item) => ({
      exportName: item.exportName ?? null,
      path: item.path ?? null,
      owner: item.owner ?? null,
      publicContract: item.publicContract ?? null,
    }))
    .sort((a, b) => (
      (a.exportName ?? '').localeCompare(b.exportName ?? '')
      || (a.path ?? '').localeCompare(b.path ?? '')
    ));
  const documentedServiceDeepImports = (manifest.audit?.documentedServiceDeepImports ?? [])
    .map((item) => ({
      importer: item.importer ?? null,
      target: item.target ?? null,
      owner: item.owner ?? null,
      reason: item.reason ?? null,
    }))
    .sort((a, b) => (
      (a.importer ?? '').localeCompare(b.importer ?? '')
      || (a.target ?? '').localeCompare(b.target ?? '')
    ));
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
        excludedPaths: (definition.excludedPaths ?? []).map((item) => item.replace(/\/+$/, '')),
        rootOnly: definition.rootOnly === true,
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
    browserHostOnlyPackages,
    browserPublicEntrypoints,
    browserSafeServiceFiles,
    browserSafeSourceGlobs,
    ignoredRootFiles,
    importExceptions,
    legacyShims,
    legacyShimPaths,
    modules,
    documentedServiceDeepImports,
    pathOwners,
    releaseReadinessSurface,
    restoredServiceDuplicatePolicy,
    rootFileOwners,
    serviceRootFileOwners,
  };
}

function normalizeReleaseReadinessSurface(manifest) {
  const config = manifest.audit?.releaseReadinessSurface;
  if (!config) return null;
  const merged = {
    ...DEFAULT_RELEASE_READINESS_SURFACE,
    ...config,
  };
  return {
    manifestPath: merged.manifestPath,
    producerExport: merged.producerExport,
    entrypointOwnershipExport: merged.entrypointOwnershipExport,
    owner: merged.owner,
    requiredEntrypoints: [...new Set(merged.requiredEntrypoints ?? [])].sort(compareStrings),
    ownedPortHelper: merged.ownedPortHelper,
    ownedPortWrapper: merged.ownedPortWrapper,
    releaseGate: merged.releaseGate,
    publicReleaseApiImporters: [...new Set(merged.publicReleaseApiImporters ?? [])].sort(compareStrings),
    ownedPortHelperImporters: [...new Set(merged.ownedPortHelperImporters ?? [])].sort(compareStrings),
    publicExports: [...new Set(merged.publicExports ?? [])].sort(compareStrings),
    ownedPortExports: [...new Set(merged.ownedPortExports ?? [])].sort(compareStrings),
  };
}

function normalizeRestoredServiceDuplicatePolicy(manifest) {
  const policy = {
    ...DEFAULT_RESTORED_SERVICE_DUPLICATE_POLICY,
    ...(manifest.audit?.restoredServiceDuplicatePolicy ?? {}),
  };
  return {
    indexBasenamesIgnored: policy.indexBasenamesIgnored === true,
    broadExemptionsAllowed: policy.broadExemptionsAllowed === true,
    nonIndexBasenameDuplicatesAreFailuresByDefault: (
      policy.nonIndexBasenameDuplicatesAreFailuresByDefault !== false
    ),
    approvedIndexEntrypoints: (policy.approvedIndexEntrypoints ?? [])
      .map((item) => ({
        path: item.path ?? null,
        owner: item.owner ?? null,
        publicContract: item.publicContract ?? null,
        regressionTests: Array.isArray(item.regressionTests)
          ? [...item.regressionTests].sort(compareStrings)
          : [],
      }))
      .sort((a, b) => (a.path ?? '').localeCompare(b.path ?? '')),
    approvedMultiEntrypoints: (policy.approvedMultiEntrypoints ?? [])
      .map((item) => ({
        basename: item.basename ?? null,
        paths: Array.isArray(item.paths) ? [...item.paths].sort(compareStrings) : [],
        reason: item.reason ?? null,
        owner: item.owner ?? null,
        publicContracts: normalizePublicContracts(item.publicContracts),
        regressionTests: Array.isArray(item.regressionTests)
          ? [...item.regressionTests].sort(compareStrings)
          : [],
      }))
      .sort((a, b) => (
        (a.basename ?? '').localeCompare(b.basename ?? '')
        || a.paths.join('\0').localeCompare(b.paths.join('\0'))
      )),
    approvedContentHashes: (policy.approvedContentHashes ?? [])
      .map((item) => ({
        sha256: item.sha256 ?? null,
        canonicalPath: item.canonicalPath ?? null,
        paths: Array.isArray(item.paths) ? [...item.paths].sort(compareStrings) : [],
        reason: item.reason ?? null,
        owner: item.owner ?? null,
        disposition: item.disposition ?? 'intentional-multi-entrypoint',
        publicContracts: normalizePublicContracts(item.publicContracts),
        regressionTests: Array.isArray(item.regressionTests)
          ? [...item.regressionTests].sort(compareStrings)
          : [],
      }))
      .sort((a, b) => (
        (a.sha256 ?? '').localeCompare(b.sha256 ?? '')
        || (a.canonicalPath ?? '').localeCompare(b.canonicalPath ?? '')
        || a.paths.join('\0').localeCompare(b.paths.join('\0'))
      )),
    classifiedCollisions: (policy.classifiedCollisions ?? [])
      .map((item) => ({
        kind: item.kind ?? null,
        fingerprint: item.fingerprint ?? null,
        canonicalPath: item.canonicalPath ?? null,
        paths: Array.isArray(item.paths) ? [...item.paths].sort(compareStrings) : [],
        owner: item.owner ?? null,
        disposition: item.disposition ?? null,
        reason: item.reason ?? null,
        publicContracts: normalizePublicContracts(item.publicContracts),
        regressionTests: Array.isArray(item.regressionTests)
          ? [...item.regressionTests].sort(compareStrings)
          : [],
      }))
      .sort((a, b) => (
        (a.kind ?? '').localeCompare(b.kind ?? '')
        || (a.fingerprint ?? '').localeCompare(b.fingerprint ?? '')
        || a.paths.join('\0').localeCompare(b.paths.join('\0'))
      )),
  };
}

function normalizePublicContracts(contracts) {
  return (Array.isArray(contracts) ? contracts : [])
    .map((item) => ({
      path: item?.path ?? null,
      contract: item?.contract ?? null,
    }))
    .sort((a, b) => (
      (a.path ?? '').localeCompare(b.path ?? '')
      || (a.contract ?? '').localeCompare(b.contract ?? '')
    ));
}

function hasGlobSyntax(value) {
  return /[*?[\]{}]/.test(value);
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(value ?? '');
}

function collectRestoredServiceDuplicatePolicyViolations(policy, modules = {}) {
  const findings = [];
  if (policy.indexBasenamesIgnored) {
    findings.push({
      policy: 'audit.restoredServiceDuplicatePolicy.indexBasenamesIgnored',
      module: 'services',
      reason: 'index basename collisions require exact entrypoint evidence and cannot use a blanket exemption',
    });
  }
  if (policy.broadExemptionsAllowed) {
    findings.push({
      policy: 'audit.restoredServiceDuplicatePolicy.broadExemptionsAllowed',
      module: 'services',
      reason: 'broad restored service duplicate exemptions are not allowed',
    });
  }
  if (!policy.nonIndexBasenameDuplicatesAreFailuresByDefault) {
    findings.push({
      policy: 'audit.restoredServiceDuplicatePolicy.nonIndexBasenameDuplicatesAreFailuresByDefault',
      module: 'services',
      reason: 'non-index service basename duplicates must fail by default',
    });
  }

  for (const [index, approval] of policy.approvedIndexEntrypoints.entries()) {
    const location = `audit.restoredServiceDuplicatePolicy.approvedIndexEntrypoints[${index}]`;
    if (
      !approval.path
      || !approval.path.startsWith('src/services/')
      || !/^index\.[cm]?[jt]sx?$/.test(path.basename(approval.path))
      || hasGlobSyntax(approval.path)
    ) {
      findings.push({
        policy: location,
        module: 'services',
        reason: 'approved index entrypoint must name one exact src/services index source path',
      });
    }
    if (!approval.owner || hasGlobSyntax(approval.owner) || !modules[approval.owner]) {
      findings.push({
        policy: location,
        module: 'services',
        reason: 'approved index entrypoint must name its exact existing module owner',
      });
    }
    if (!approval.publicContract || !approval.publicContract.trim()) {
      findings.push({
        policy: location,
        module: 'services',
        reason: 'approved index entrypoint must name a supported public contract',
      });
    }
    collectRegressionTestEvidenceViolations(approval.regressionTests, location, findings);
  }

  for (const [index, approval] of policy.approvedMultiEntrypoints.entries()) {
    const location = `audit.restoredServiceDuplicatePolicy.approvedMultiEntrypoints[${index}]`;
    if (!approval.basename || hasGlobSyntax(approval.basename) || approval.basename.includes('/')) {
      findings.push({
        policy: location,
        module: 'services',
        reason: 'approved multi-entrypoint must name one exact duplicate basename',
      });
    }
    if (approval.paths.length < 2) {
      findings.push({
        policy: location,
        module: 'services',
        reason: 'approved multi-entrypoint must list every exact duplicate path',
      });
    }
    if (!approval.owner || hasGlobSyntax(approval.owner) || !modules[approval.owner]) {
      findings.push({
        policy: location,
        module: 'services',
        reason: 'approved multi-entrypoint must name the exact canonical module owner',
      });
    }
    if (!approval.reason) {
      findings.push({
        policy: location,
        module: 'services',
        reason: 'approved multi-entrypoint must include an explicit rationale',
      });
    }
    for (const approvedPath of approval.paths) {
      if (
        !approvedPath.startsWith('src/services/')
        || hasGlobSyntax(approvedPath)
        || path.basename(approvedPath) !== approval.basename
      ) {
        findings.push({
          policy: location,
          module: 'services',
          path: approvedPath,
          reason: 'approved multi-entrypoint paths must be exact src/services paths matching the basename',
        });
      }
    }
    collectIntentionalEntrypointEvidenceViolations(approval, location, modules, findings);
  }

  for (const [index, approval] of policy.approvedContentHashes.entries()) {
    const location = `audit.restoredServiceDuplicatePolicy.approvedContentHashes[${index}]`;
    if (!isSha256(approval.sha256)) {
      findings.push({
        policy: location,
        module: 'services',
        reason: 'approved content hash must name one exact SHA-256 digest',
      });
    }
    if (
      !approval.canonicalPath
      || !approval.canonicalPath.startsWith('src/services/')
      || hasGlobSyntax(approval.canonicalPath)
    ) {
      findings.push({
        policy: location,
        module: 'services',
        reason: 'approved content hash must name the exact canonical src/services path',
      });
    }
    if (approval.paths.length < 2) {
      findings.push({
        policy: location,
        module: 'services',
        reason: 'approved content hash must list every exact duplicate path',
      });
    }
    if (!approval.owner || hasGlobSyntax(approval.owner) || !modules[approval.owner]) {
      findings.push({
        policy: location,
        module: 'services',
        reason: 'approved content hash must name the exact canonical module owner',
      });
    }
    if (!approval.reason) {
      findings.push({
        policy: location,
        module: 'services',
        reason: 'approved content hash must include an explicit rationale',
      });
    }
    if (!['canonicalize-restored-shadow', 'intentional-multi-entrypoint'].includes(approval.disposition)) {
      findings.push({
        policy: location,
        module: 'services',
        reason: 'approved content hash must have a supported concrete disposition',
      });
    }
    if (approval.canonicalPath && approval.paths.length > 0 && !approval.paths.includes(approval.canonicalPath)) {
      findings.push({
        policy: location,
        module: 'services',
        path: approval.canonicalPath,
        reason: 'approved content hash canonical path must be one of the exact duplicate paths',
      });
    }
    for (const approvedPath of approval.paths) {
      if (
        !approvedPath.startsWith('src/services/')
        || hasGlobSyntax(approvedPath)
      ) {
        findings.push({
          policy: location,
          module: 'services',
          path: approvedPath,
          reason: 'approved content hash paths must be exact src/services paths',
        });
      }
    }
    if (approval.disposition === 'intentional-multi-entrypoint') {
      collectIntentionalEntrypointEvidenceViolations(approval, location, modules, findings);
    }
  }

  for (const [index, classification] of policy.classifiedCollisions.entries()) {
    const location = `audit.restoredServiceDuplicatePolicy.classifiedCollisions[${index}]`;
    if (!['normalized-content', 'behavior'].includes(classification.kind)) {
      findings.push({ policy: location, module: 'services', reason: 'classified collision kind must be normalized-content or behavior' });
    }
    if (!isSha256(classification.fingerprint)) {
      findings.push({ policy: location, module: 'services', reason: 'classified collision must name one exact SHA-256 fingerprint' });
    }
    if (classification.paths.length < 2 || classification.paths.some((item) => (
      !item.startsWith('src/services/') || hasGlobSyntax(item)
    ))) {
      findings.push({ policy: location, module: 'services', reason: 'classified collision must list every exact colliding service path' });
    }
    if (!classification.canonicalPath || !classification.paths.includes(classification.canonicalPath)) {
      findings.push({ policy: location, module: 'services', reason: 'classified collision must name a canonical path from its exact paths' });
    }
    if (!classification.owner || !modules[classification.owner]) {
      findings.push({ policy: location, module: 'services', reason: 'classified collision must name an existing canonical module owner' });
    }
    if (!['canonicalize-restored-shadow', 'intentional-multi-entrypoint'].includes(classification.disposition)) {
      findings.push({ policy: location, module: 'services', reason: 'classified collision must have a supported concrete disposition' });
    }
    if (!classification.reason) {
      findings.push({ policy: location, module: 'services', reason: 'classified collision must include an explicit rationale' });
    }
    if (classification.disposition === 'intentional-multi-entrypoint') {
      collectIntentionalEntrypointEvidenceViolations(classification, location, modules, findings);
    }
  }

  return findings.sort((a, b) => (
    a.policy.localeCompare(b.policy)
    || (a.path ?? '').localeCompare(b.path ?? '')
    || a.reason.localeCompare(b.reason)
  ));
}

function collectIntentionalEntrypointEvidenceViolations(approval, location, modules, findings) {
  const contracts = approval.publicContracts ?? [];
  const contractPaths = contracts.map((item) => item.path);
  const contractNames = contracts.map((item) => item.contract?.trim()).filter(Boolean);
  if (
    contracts.length !== approval.paths.length
    || !exactPathSetMatches(contractPaths, approval.paths)
    || contracts.some((item) => !item.contract?.trim())
    || new Set(contractNames).size !== contractNames.length
  ) {
    findings.push({
      policy: location,
      module: 'services',
      reason: 'intentional multi-entrypoints require one distinct supported public contract for every exact path',
    });
  }

  const modulePatterns = Object.values(modules)
    .flatMap((definition) => definition.publicEntrypoints ?? [])
    .filter((pattern) => pattern.startsWith('src/services/'))
    .map((pattern) => globToRegExp(pattern));
  for (const contract of contracts) {
    if (contract.path && !modulePatterns.some((pattern) => pattern.test(contract.path))) {
      findings.push({
        policy: location,
        module: 'services',
        path: contract.path,
        reason: 'intentional multi-entrypoint contract path must be a declared service public entrypoint',
      });
    }
  }

  collectRegressionTestEvidenceViolations(approval.regressionTests, location, findings);
}

function collectRegressionTestEvidenceViolations(regressionTests, location, findings) {
  if ((regressionTests ?? []).length === 0) {
    findings.push({
      policy: location,
      module: 'services',
      reason: 'intentional multi-entrypoints require at least one executable regression test',
    });
  }
  for (const testPath of regressionTests ?? []) {
    const testExists = fs.existsSync(abs(testPath));
    if (
      !testPath.startsWith('test/')
      || hasGlobSyntax(testPath)
      || !isSourceFile(testPath)
      || !testExists
    ) {
      findings.push({
        policy: location,
        module: 'services',
        path: testPath,
        reason: 'intentional multi-entrypoint regression test must be an existing exact executable path under test/',
      });
      continue;
    }

    const testSource = fs.readFileSync(abs(testPath), 'utf8');
    if (!containsExecutableTestDeclaration(testSource)) {
      findings.push({
        policy: location,
        module: 'services',
        path: testPath,
        reason: 'intentional multi-entrypoint regression test must contain an executable test declaration',
      });
    }
  }
}

function containsExecutableTestDeclaration(source) {
  const tokens = tokenizeSource(source);
  return tokens.some((token, index) => {
    if (token.kind !== 'identifier' || (token.text !== 'it' && token.text !== 'test')) return false;
    if (tokens[index + 1]?.text === '(') return true;
    return tokens[index + 1]?.text === '.'
      && ['concurrent', 'each', 'only', 'skip', 'todo'].includes(tokens[index + 2]?.text)
      && tokens[index + 3]?.text === '(';
  });
}

function exportedConstDeclarations(filePath) {
  if (!fs.existsSync(abs(filePath)) || !isSourceFile(filePath)) return new Set();
  const tokens = tokenizeSource(fs.readFileSync(abs(filePath), 'utf8'));
  const declarations = new Set();
  for (let index = 0; index < tokens.length - 2; index += 1) {
    if (
      tokens[index].text === 'export'
      && tokens[index + 1]?.text === 'const'
      && tokens[index + 2]?.kind === 'identifier'
    ) {
      declarations.add(tokens[index + 2].text);
    }
  }
  return declarations;
}

function sourceDeclaresExportedConst(filePath, exportName) {
  return exportedConstDeclarations(filePath).has(exportName);
}

function indexOfExportedConstArray(source, exportName) {
  const re = new RegExp(`\\bexport\\s+const\\s+${escapeRegExp(exportName)}\\s*=\\s*\\[`, 'm');
  const match = re.exec(source);
  return match ? match.index + match[0].length - 1 : -1;
}

function matchingArrayLiteral(source, openIndex) {
  if (openIndex < 0 || source[openIndex] !== '[') return null;
  let depth = 0;
  let quote = null;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === '\\') {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, index + 1);
    }
  }
  return null;
}

function releaseEntrypointOwnershipRecords(filePath, exportName) {
  if (!fs.existsSync(abs(filePath)) || !isSourceFile(filePath)) return [];
  const source = stripSourceComments(fs.readFileSync(abs(filePath), 'utf8'));
  const literal = matchingArrayLiteral(source, indexOfExportedConstArray(source, exportName));
  if (!literal) return [];
  const records = [];
  const objectRe = /\{([\s\S]*?)\}/g;
  for (const match of literal.matchAll(objectRe)) {
    const body = match[1];
    const record = {};
    for (const key of ['path', 'owner', 'runtime', 'auditDecision']) {
      const valueMatch = new RegExp(`\\b${key}\\s*:\\s*(['"])([\\s\\S]*?)\\1`).exec(body);
      if (valueMatch) record[key] = valueMatch[2];
    }
    if (record.path || record.owner || record.runtime || record.auditDecision) records.push(record);
  }
  return records;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function localImportTargets(filePath) {
  return extractExecutableImports(filePath)
    .filter((item) => isLocalSpecifier(item.specifier))
    .map((item) => ({
      ...item,
      target: resolveLocalSpecifier(item.specifier, filePath),
    }))
    .filter((item) => item.target);
}

function extractExecutableImports(filePath) {
  if (!fs.existsSync(abs(filePath)) || !isSourceFile(filePath)) return [];
  const source = fs.readFileSync(abs(filePath), 'utf8');
  const tokens = tokenizeSource(source);
  const imports = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind !== 'literal') continue;
    const specifier = normalizeSpecifier(literalValue(token.text));
    if (!specifier || specifier.startsWith('http://') || specifier.startsWith('https://')) continue;
    if (!isDependencyLiteralToken(tokens, index)) continue;
    imports.push({
      file: filePath,
      kind: executableImportKind(tokens, index),
      line: null,
      specifier,
    });
  }
  return imports.sort((a, b) => (
    a.kind.localeCompare(b.kind)
    || a.specifier.localeCompare(b.specifier)
  ));
}

function executableImportKind(tokens, index) {
  const previous = tokens[index - 1]?.text;
  const callee = tokens[index - 2]?.text;
  if (previous === 'from') return tokens[index - 3]?.text === 'export' ? 'export-from' : 'static-import';
  if (previous === 'import') return 'side-effect-import';
  if (callee === 'import') return 'dynamic-import';
  if (callee === 'require') return 'require';
  if (callee === 'URL') return 'url-dependency';
  if (['Worker', 'SharedWorker'].includes(callee)) return 'worker-script';
  if (callee === 'addModule') return 'worklet-script';
  return 'dependency';
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

  if (isDirectServiceRootFile(filePath)) {
    return index.serviceRootFileOwners.get(filePath) ?? null;
  }

  if (!rest.includes('/')) {
    if (index.rootFileOwners.has(filePath)) return index.rootFileOwners.get(filePath);
    const entrypointOwner = index.entrypointOwners.find((item) => item.re.test(filePath));
    return entrypointOwner?.module ?? null;
  }

  const owner = matchingPathOwners(filePath, index)[0];
  if (owner) return owner.module;

  if (filePath.startsWith('src/services/')) return null;

  const topLevel = rest.split('/')[0];
  return index.modules[topLevel] ? topLevel : null;
}

function boundaryModuleForPath(filePath, index) {
  if (!isDirectRootFile(filePath)) return moduleForPath(filePath, index);
  return index.rootFileOwners.get(filePath) ?? null;
}

function isDirectServiceRootFile(filePath) {
  if (!filePath.startsWith('src/services/')) return false;
  return !filePath.slice('src/services/'.length).includes('/');
}

function isDirectRootFile(filePath) {
  if (!filePath.startsWith('src/')) return false;
  return !filePath.slice('src/'.length).includes('/');
}

function pathOwnerMatches(filePath, owner) {
  if (filePath !== owner.path && !filePath.startsWith(`${owner.path}/`)) return false;
  if (owner.rootOnly && filePath !== owner.path) {
    const remainder = filePath.slice(`${owner.path}/`.length);
    if (remainder.includes('/')) return false;
  }
  return !owner.excludedPaths.some((excludedPath) => (
    filePath === excludedPath || filePath.startsWith(`${excludedPath}/`)
  ));
}

function matchingPathOwners(filePath, index) {
  return index.pathOwners.filter((owner) => pathOwnerMatches(filePath, owner));
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

function collectServiceDuplicateBasenames(files) {
  const byBasename = new Map();
  for (const filePath of files.filter(isServiceSourceFile)) {
    const basename = path.basename(filePath);
    if (/^index\.[cm]?[jt]sx?$/.test(basename)) continue;
    const paths = byBasename.get(basename) ?? [];
    paths.push(filePath);
    byBasename.set(basename, paths);
  }
  return [...byBasename.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([basename, paths]) => ({
      basename,
      paths: paths.sort(compareStrings),
      reason: 'non-index executable service files share the same basename',
    }))
    .sort((a, b) => a.basename.localeCompare(b.basename));
}

const SOURCE_KEYWORDS = new Set([
  'abstract', 'any', 'as', 'asserts', 'async', 'await', 'bigint', 'boolean', 'break',
  'case', 'catch', 'class', 'const', 'constructor', 'continue', 'debugger', 'declare',
  'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally',
  'for', 'from', 'function', 'get', 'if', 'implements', 'import', 'in', 'infer',
  'instanceof', 'interface', 'is', 'keyof', 'let', 'module', 'namespace', 'never',
  'new', 'null', 'number', 'object', 'of', 'package', 'private', 'protected', 'public',
  'readonly', 'require', 'return', 'satisfies', 'set', 'static', 'string', 'super',
  'switch', 'symbol', 'this', 'throw', 'true', 'try', 'type', 'typeof', 'undefined',
  'unique', 'unknown', 'using', 'var', 'void', 'while', 'with', 'yield',
]);

function tokenizeSource(text) {
  const tokens = [];
  let offset = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (offset < text.length) {
    const char = text[offset];
    const next = text[offset + 1];
    if (/\s/.test(char)) {
      offset += 1;
      continue;
    }
    if (char === '/' && next === '/') {
      offset += 2;
      while (offset < text.length && text[offset] !== '\n' && text[offset] !== '\r') offset += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      offset += 2;
      while (offset < text.length && !(text[offset] === '*' && text[offset + 1] === '/')) offset += 1;
      offset = Math.min(text.length, offset + 2);
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      const start = offset;
      offset += 1;
      while (offset < text.length) {
        if (text[offset] === '\\') {
          offset += 2;
          continue;
        }
        const current = text[offset];
        offset += 1;
        if (current === quote) break;
      }
      tokens.push({ kind: 'literal', text: text.slice(start, offset) });
      continue;
    }
    if (/[A-Za-z_$]/.test(char)) {
      const start = offset;
      offset += 1;
      while (offset < text.length && /[\w$]/.test(text[offset])) offset += 1;
      const value = text.slice(start, offset);
      tokens.push({ kind: SOURCE_KEYWORDS.has(value) ? 'keyword' : 'identifier', text: value });
      continue;
    }
    if (/\d/.test(char)) {
      const start = offset;
      offset += 1;
      while (offset < text.length && /[\w.]/.test(text[offset])) offset += 1;
      tokens.push({ kind: 'literal', text: text.slice(start, offset) });
      continue;
    }
    const punctuation = [
      '>>>=', '===', '!==', '**=', '&&=', '||=', '??=', '>>>', '<<=', '>>=', '...',
      '=>', '==', '!=', '<=', '>=', '++', '--', '&&', '||', '??', '?.', '**', '+=',
      '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '?.',
    ].find((candidate) => text.startsWith(candidate, offset));
    tokens.push({ kind: 'punctuation', text: punctuation ?? char });
    offset += (punctuation ?? char).length;
  }
  return tokens;
}

function serializeTokens(tokens) {
  return tokens.map((token) => `${token.kind.length}:${token.kind}:${token.text.length}:${token.text}`).join('|');
}

function normalizedSourceRecord(filePath) {
  const tokens = tokenizeSource(fs.readFileSync(abs(filePath), 'utf8'));
  const normalized = serializeTokens(tokens);
  return {
    algorithm: 'sha256',
    normalization: 'lexical-v1-comments-and-trivia-elided',
    value: crypto.createHash('sha256').update(normalized).digest('hex'),
    tokenCount: tokens.length,
  };
}

function literalValue(tokenText) {
  if (tokenText.length < 2) return tokenText;
  const quote = tokenText[0];
  return (quote === '"' || quote === "'") && tokenText.at(-1) === quote
    ? tokenText.slice(1, -1)
    : tokenText;
}

function isDependencyLiteralToken(tokens, tokenIndex) {
  const previous = tokens[tokenIndex - 1]?.text;
  const callee = tokens[tokenIndex - 2]?.text;
  if (previous === 'from' || previous === 'import') return true;
  if (previous !== '(') return false;
  if (['import', 'require', 'Worker', 'SharedWorker', 'addModule'].includes(callee)) return true;
  return callee === 'URL' && tokens[tokenIndex - 3]?.text === 'new';
}

function normalizedBareDependencyLiteral(tokenText, value) {
  if (value.startsWith('node:') || value.includes('://') || !/(?:\.js)+$/.test(value)) {
    return tokenText;
  }
  const quote = tokenText[0];
  const normalized = value.replace(/(?:\.js)+$/, '');
  const packageSegments = normalized.split('/');
  const packageRoot = normalized.startsWith('@')
    ? packageSegments.length === 2
    : packageSegments.length === 1;
  if (!packageRoot) return tokenText;
  return (quote === '"' || quote === "'") && tokenText.at(-1) === quote
    ? `${quote}${normalized}${quote}`
    : tokenText;
}

function behaviorSourceRecord(filePath) {
  const source = fs.readFileSync(abs(filePath), 'utf8');
  const tokens = tokenizeSource(source);
  const barrelOnly = isIndexBarrelSource(source);
  const identifiers = new Map();
  const behaviorTokens = tokens.map((token, tokenIndex) => {
    if (token.kind === 'literal') {
      const value = literalValue(token.text);
      if (isDependencyLiteralToken(tokens, tokenIndex) && isLocalSpecifier(value)) {
        const resolved = resolveLocalSpecifier(value, filePath);
        return {
          ...token,
          text: barrelOnly
            ? `module:${resolved ?? `unresolved:${value}`}`
            : 'module:<local-dependency>',
        };
      }
      if (isDependencyLiteralToken(tokens, tokenIndex)) {
        return { ...token, text: normalizedBareDependencyLiteral(token.text, value) };
      }
      return token;
    }
    if (token.kind !== 'identifier') return token;
    const previous = tokens[tokenIndex - 1]?.text;
    const next = tokens[tokenIndex + 1]?.text;
    const propertyName = previous === '.' || previous === '?.' || next === ':';
    if (propertyName) return token;
    if (!identifiers.has(token.text)) identifiers.set(token.text, `id${identifiers.size}`);
    return { ...token, text: identifiers.get(token.text) };
  });
  const normalized = serializeTokens(behaviorTokens);
  return {
    algorithm: 'sha256',
    normalization: 'behavior-structure-v2-identifiers-canonicalized-and-dependency-literals-contextual',
    value: crypto.createHash('sha256').update(normalized).digest('hex'),
    tokenCount: behaviorTokens.length,
  };
}

function stripSourceComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function isIndexBarrelSource(text) {
  const source = stripSourceComments(text);
  let remaining = source.trim();
  if (!remaining) return true;

  const barrelStatement = /^(?:export\s+(?:type\s+)?\*\s+from\s+["'][^"']+["']|export\s+\*\s+as\s+[A-Za-z_$][\w$]*\s+from\s+["'][^"']+["']|export\s+(?:type\s+)?\{[\s\S]*?\}\s+from\s+["'][^"']+["']|import\s+type\s+[\s\S]*?\s+from\s+["'][^"']+["'])\s*;?/;
  while (remaining) {
    const match = remaining.match(barrelStatement);
    if (!match) return false;
    remaining = remaining.slice(match[0].length).trim();
  }
  return true;
}

function serviceSourceContentKind(filePath) {
  if (!isServiceIndexFile(filePath)) return 'service-implementation';
  return isIndexBarrelSource(fs.readFileSync(abs(filePath), 'utf8'))
    ? 'approved-index-barrel'
    : 'index-implementation-entrypoint';
}

function sha256ForFile(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(abs(filePath)))
    .digest('hex');
}

function contentHashRecord(filePath) {
  return {
    algorithm: 'sha256',
    value: sha256ForFile(filePath),
  };
}

function shortHash(value) {
  return value.slice(0, 12);
}

function currentUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function sourceRevision() {
  try {
    return execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch {
    return null;
  }
}

function revalidationProvenance(manifest) {
  const config = manifest.audit?.revalidationProvenance ?? {};
  const recoveryProvenancePath = config.recoveryProvenancePath
    ?? DEFAULT_RECOVERY_PROVENANCE_PATH;
  return {
    taskId: config.taskId ?? DEFAULT_REVALIDATION_TASK_ID,
    sourceRevision: sourceRevision(),
    recoveryProvenance: {
      path: recoveryProvenancePath,
      available: fs.existsSync(abs(recoveryProvenancePath)),
    },
  };
}

function relativeDepth(filePath) {
  return filePath.split('/').length;
}

function ownerRecordForPath(filePath, index) {
  const moduleName = moduleForPath(filePath, index);
  const definition = moduleName ? index.modules[moduleName] : null;
  let browserClassification = 'not-browser-approved';
  if (index.browserSafeServiceFiles.has(filePath)) {
    browserClassification = 'browser-safe-service-file';
  } else if (matchesAnyGlob(filePath, index.browserSafeSourceGlobs)) {
    browserClassification = 'browser-facing-source-glob';
  } else if (definition?.runtimeClassification === 'browser-safe') {
    browserClassification = 'browser-safe-module';
  } else if (definition?.runtimeClassification === 'universal') {
    browserClassification = 'runtime-neutral-module';
  } else if (definition?.runtimeClassification === 'host-only') {
    browserClassification = 'host-only';
  } else if (definition?.runtimeClassification === 'split') {
    browserClassification = 'split-runtime-requires-entrypoint-review';
  } else if (!definition) {
    browserClassification = 'unknown-owner';
  }

  return {
    module: moduleName ?? 'unknown-service',
    owner: definition?.owner ?? null,
    runtimeClassification: definition?.runtimeClassification ?? 'unknown',
    browserReachability: definition?.browserReachability ?? 'requires ownership classification',
    browserClassification,
  };
}

function collectLocalImporters(files) {
  const importersByTarget = new Map();
  const sourceFiles = files.filter((filePath) => isSourceFile(filePath));

  for (const filePath of sourceFiles) {
    for (const item of extractImports(filePath)) {
      if (!isLocalSpecifier(item.specifier)) continue;
      const target = resolveLocalSpecifier(item.specifier, filePath);
      if (!target) continue;
      const importers = importersByTarget.get(target) ?? [];
      importers.push({
        file: filePath,
        line: item.line,
        kind: item.kind,
        specifier: item.specifier,
      });
      importersByTarget.set(target, importers);
    }
  }

  for (const importers of importersByTarget.values()) {
    importers.sort((a, b) => (
      a.file.localeCompare(b.file)
      || a.line - b.line
      || a.kind.localeCompare(b.kind)
      || a.specifier.localeCompare(b.specifier)
    ));
  }

  return importersByTarget;
}

function selectCanonicalDuplicatePath(paths, index) {
  const annotated = paths
    .map((filePath) => ({
      path: filePath,
      owner: ownerRecordForPath(filePath, index),
      directServiceRoot: isDirectServiceRootFile(filePath),
      depth: relativeDepth(filePath),
    }))
    .sort((a, b) => (
      Number(a.directServiceRoot) - Number(b.directServiceRoot)
      || Number(a.owner.module === 'unknown-service') - Number(b.owner.module === 'unknown-service')
      || b.depth - a.depth
      || a.path.localeCompare(b.path)
    ));
  return annotated[0]?.path ?? paths[0];
}

function exactPathSetMatches(left, right) {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort(compareStrings);
  const sortedRight = [...right].sort(compareStrings);
  return sortedLeft.every((item, index) => item === sortedRight[index]);
}

function findEligibleRestoredServicePolicyEntry(index, collection, predicate) {
  const entries = index.restoredServiceDuplicatePolicy[collection] ?? [];
  return entries.find((entry, entryIndex) => (
    !index.invalidRestoredServiceDuplicatePolicyLocations?.has(
      `audit.restoredServiceDuplicatePolicy.${collection}[${entryIndex}]`,
    )
    && predicate(entry)
  )) ?? null;
}

function approvedMultiEntrypointForDuplicate(duplicate, index, canonicalOwner) {
  return findEligibleRestoredServicePolicyEntry(index, 'approvedMultiEntrypoints', (approval) => (
    approval.basename === duplicate.basename
    && approval.owner === canonicalOwner.module
    && exactPathSetMatches(approval.paths, duplicate.paths)
  ));
}

function approvedContentHashForDuplicate(duplicate, index, canonicalOwner) {
  return findEligibleRestoredServicePolicyEntry(index, 'approvedContentHashes', (approval) => (
    approval.sha256 === duplicate.sha256
    && approval.owner === canonicalOwner.module
    && approval.canonicalPath === duplicate.canonicalPath
    && exactPathSetMatches(approval.paths, duplicate.paths.map((item) => item.path))
  ));
}

function classifiedCollisionForGroup(kind, fingerprint, canonicalPath, paths, index, canonicalOwner) {
  return findEligibleRestoredServicePolicyEntry(index, 'classifiedCollisions', (classification) => (
    classification.kind === kind
    && classification.fingerprint === fingerprint
    && classification.canonicalPath === canonicalPath
    && classification.owner === canonicalOwner.module
    && exactPathSetMatches(classification.paths, paths)
  ));
}

function approvedContentHashForCollisionGroup(paths, canonicalPath, recordsByPath, index, canonicalOwner) {
  const contentHashes = new Set(paths.map((filePath) => recordsByPath.get(filePath)?.contentHash.value));
  if (contentHashes.size !== 1 || contentHashes.has(undefined)) return null;
  const [sha256] = contentHashes;
  return findEligibleRestoredServicePolicyEntry(index, 'approvedContentHashes', (approval) => (
    approval.sha256 === sha256
    && approval.canonicalPath === canonicalPath
    && approval.owner === canonicalOwner.module
    && exactPathSetMatches(approval.paths, paths)
  ));
}

function approvedMultiEntrypointForCollisionGroup(paths, index, canonicalOwner) {
  const basenames = new Set(paths.map((filePath) => path.basename(filePath)));
  if (basenames.size !== 1) return null;
  const [basename] = basenames;
  return findEligibleRestoredServicePolicyEntry(index, 'approvedMultiEntrypoints', (approval) => (
    approval.basename === basename
    && approval.owner === canonicalOwner.module
    && exactPathSetMatches(approval.paths, paths)
  ));
}

function flattenPackageExportTargets(value, exportName, conditions = [], records = []) {
  if (typeof value === 'string') {
    records.push({
      kind: 'package-export',
      name: exportName,
      conditions,
      target: value.replace(/^\.\//, ''),
    });
    return records;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return records;
  for (const [condition, nested] of Object.entries(value)) {
    flattenPackageExportTargets(nested, exportName, [...conditions, condition], records);
  }
  return records;
}

function collectPublicEntrypoints(filePath, owner, index, packageExportRecords) {
  const definition = index.modules[owner.module];
  const moduleEntries = (definition?.publicEntrypoints ?? [])
    .filter((pattern) => globToRegExp(pattern).test(filePath))
    .map((pattern) => ({
      kind: 'module-manifest',
      name: pattern,
      conditions: [],
      target: filePath,
    }));
  const packageEntries = packageExportRecords
    .filter((entry) => entry.target === filePath)
    .map((entry) => ({ ...entry }));
  return [...moduleEntries, ...packageEntries].sort((a, b) => (
    a.kind.localeCompare(b.kind)
    || a.name.localeCompare(b.name)
    || a.conditions.join(',').localeCompare(b.conditions.join(','))
  ));
}

function collisionGroupId(kind, fingerprint) {
  return `${kind}:${fingerprint}`;
}

function buildCollisionGroups(serviceFiles, kind, fingerprintSelector, index) {
  const recordsByPath = new Map(serviceFiles.map((record) => [record.path, record]));
  const byFingerprint = new Map();
  for (const record of serviceFiles) {
    const fingerprint = fingerprintSelector(record);
    const paths = byFingerprint.get(fingerprint) ?? [];
    paths.push(record.path);
    byFingerprint.set(fingerprint, paths);
  }
  return [...byFingerprint.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([fingerprint, unsortedPaths]) => {
      const paths = unsortedPaths.sort(compareStrings);
      const canonicalPath = selectCanonicalDuplicatePath(paths, index);
      const canonicalModuleOwner = ownerRecordForPath(canonicalPath, index);
      const classification = classifiedCollisionForGroup(
        kind,
        fingerprint,
        canonicalPath,
        paths,
        index,
        canonicalModuleOwner,
      );
      const exactContentApproval = approvedContentHashForCollisionGroup(
        paths,
        canonicalPath,
        recordsByPath,
        index,
        canonicalModuleOwner,
      );
      const exactMultiEntrypointApproval = approvedMultiEntrypointForCollisionGroup(
        paths,
        index,
        canonicalModuleOwner,
      );
      const disposition = classification?.disposition
        ?? exactContentApproval?.disposition
        ?? (exactMultiEntrypointApproval ? 'intentional-multi-entrypoint' : null)
        ?? 'unclassified-copy';
      return {
        id: collisionGroupId(kind, fingerprint),
        kind,
        fingerprint: {
          algorithm: 'sha256',
          value: fingerprint,
        },
        canonicalPath,
        canonicalModuleOwner,
        paths,
        disposition,
        reason: classification?.reason
          ?? exactContentApproval?.reason
          ?? `${kind} collision has no exact ownership classification`,
        classified: Boolean(classification || exactContentApproval || exactMultiEntrypointApproval),
        classification: classification ? {
          owner: classification.owner,
          disposition: classification.disposition,
          publicContracts: classification.publicContracts,
          regressionTests: classification.regressionTests,
        } : null,
      };
    })
    .sort((a, b) => a.canonicalPath.localeCompare(b.canonicalPath) || a.id.localeCompare(b.id));
}

function collectServiceFileInventory(files, importersByTarget, index) {
  const packageJson = fs.existsSync(abs('package.json')) ? readJson('package.json') : {};
  const packageExportRecords = Object.entries(packageJson.exports ?? {})
    .flatMap(([exportName, value]) => flattenPackageExportTargets(value, exportName));
  const records = files.filter(isServiceSourceFile).sort(compareStrings).map((filePath) => {
    const stats = fs.statSync(abs(filePath));
    const source = fs.readFileSync(abs(filePath), 'utf8');
    const owner = ownerRecordForPath(filePath, index);
    const contentHash = contentHashRecord(filePath);
    const normalizedContentHash = normalizedSourceRecord(filePath);
    const behaviorHash = behaviorSourceRecord(filePath);
    const contentKind = serviceSourceContentKind(filePath);
    return {
      path: filePath,
      basename: path.basename(filePath),
      extension: path.extname(filePath),
      sizeBytes: stats.size,
      lineCount: source === '' ? 0 : source.split(/\r?\n/).length,
      contentKind,
      sha256: contentHash.value,
      contentHash,
      normalizedContentHash,
      behaviorHash,
      importers: importersByTarget.get(filePath) ?? [],
      importerCount: importersByTarget.get(filePath)?.length ?? 0,
      publicEntrypoints: collectPublicEntrypoints(filePath, owner, index, packageExportRecords),
      runtimeClass: owner.runtimeClassification,
      runtimeClassification: owner.runtimeClassification,
      browserClassification: owner.browserClassification,
      declaredOwner: owner,
      canonicalOwner: owner,
      module: owner.module,
      owner: owner.owner,
      disposition: contentKind === 'approved-index-barrel'
        ? 'intentional-barrel-entrypoint'
        : 'canonical-implementation',
      collisionIds: [],
    };
  });

  const normalizedContentCollisions = buildCollisionGroups(
    records,
    'normalized-content',
    (record) => record.normalizedContentHash.value,
    index,
  );
  const behavioralEquivalenceGroups = buildCollisionGroups(
    records,
    'behavior',
    (record) => record.behaviorHash.value,
    index,
  );
  const recordsByPath = new Map(records.map((record) => [record.path, record]));
  const byBasename = new Map();
  for (const record of records) {
    const paths = byBasename.get(record.basename) ?? [];
    paths.push(record.path);
    byBasename.set(record.basename, paths);
  }
  const basenameCollisions = [...byBasename.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([basename, unsortedPaths]) => {
      const paths = unsortedPaths.sort(compareStrings);
      const indexEntrypoints = /^index\.[cm]?[jt]sx?$/.test(basename);
      const canonicalPath = selectCanonicalDuplicatePath(paths, index);
      const canonicalModuleOwner = ownerRecordForPath(canonicalPath, index);
      const approvedMultiEntrypoint = indexEntrypoints ? null : approvedMultiEntrypointForDuplicate(
        { basename, paths },
        index,
        canonicalModuleOwner,
      );
      const pathApprovals = indexEntrypoints
        ? paths.map((filePath) => findEligibleRestoredServicePolicyEntry(
            index,
            'approvedIndexEntrypoints',
            (approval) => approval.path === filePath,
          ))
        : [];
      const exactIndexEntrypoints = indexEntrypoints && paths.every((filePath, pathIndex) => {
        const record = recordsByPath.get(filePath);
        const approval = pathApprovals[pathIndex];
        return Boolean(
          approval
          && approval.owner === record.module
          && approval.publicContract?.trim()
          && approval.regressionTests.length > 0
          && record.publicEntrypoints.length > 0,
        );
      });
      const distinctIndexContracts = exactIndexEntrypoints
        && new Set(pathApprovals.map((approval) => approval.publicContract.trim())).size === paths.length;
      const indexCollisionClassified = exactIndexEntrypoints && distinctIndexContracts;
      const collisionClassified = indexEntrypoints
        ? indexCollisionClassified
        : Boolean(approvedMultiEntrypoint);
      return {
        id: `basename:${basename}`,
        kind: indexEntrypoints ? 'index-entrypoint-basename' : 'non-index-service-basename',
        basename,
        canonicalPath,
        canonicalModuleOwner,
        disposition: indexCollisionClassified
          ? 'module-scoped-index-entrypoints'
          : (approvedMultiEntrypoint ? 'intentional-multi-entrypoint' : 'unclassified-copy'),
        classified: collisionClassified,
        reason: indexEntrypoints
          ? (indexCollisionClassified
              ? 'module-scoped index entrypoints have exact named owners, distinct supported contracts, and executable regression evidence; content and behavior gates still apply independently'
              : 'index basename collision lacks exact ownership, distinct supported contracts, or executable regression evidence')
          : (approvedMultiEntrypoint?.reason ?? 'non-index executable service files share the same basename'),
        regressionTests: indexCollisionClassified
          ? [...new Set(pathApprovals.flatMap((approval) => approval.regressionTests))].sort(compareStrings)
          : (approvedMultiEntrypoint?.regressionTests ?? []),
        paths: paths.map((filePath, pathIndex) => {
          const record = recordsByPath.get(filePath);
          const approval = pathApprovals[pathIndex] ?? null;
          return {
            path: filePath,
            canonicalOwner: record.canonicalOwner,
            publicContract: approval?.publicContract
              ?? approvedMultiEntrypoint?.publicContracts.find((contract) => contract.path === filePath)?.contract
              ?? null,
            publicEntrypoints: record.publicEntrypoints,
            contentKind: record.contentKind,
          };
        }),
      };
    })
    .sort((a, b) => a.basename.localeCompare(b.basename));
  const collisionByPath = new Map();
  for (const group of [...normalizedContentCollisions, ...behavioralEquivalenceGroups]) {
    for (const filePath of group.paths) {
      const collisions = collisionByPath.get(filePath) ?? [];
      collisions.push(group);
      collisionByPath.set(filePath, collisions);
    }
  }
  for (const record of records) {
    const collisions = collisionByPath.get(record.path) ?? [];
    record.collisionIds = collisions.map((group) => group.id).sort(compareStrings);
    const basenameCollision = basenameCollisions.find((group) => (
      group.paths.some((entry) => entry.path === record.path)
    ));
    if (basenameCollision) record.collisionIds.push(basenameCollision.id);
    record.collisionIds.sort(compareStrings);
    const unclassified = collisions.find((group) => !group.classified);
    const remediation = collisions.find((group) => group.disposition === 'canonicalize-restored-shadow');
    if (unclassified) {
      record.canonicalOwner = unclassified.canonicalModuleOwner;
      record.disposition = record.path === unclassified.canonicalPath
        ? 'canonical-collision-candidate'
        : 'unclassified-copy';
    } else if (remediation) {
      record.canonicalOwner = remediation.canonicalModuleOwner;
      record.disposition = record.path === remediation.canonicalPath
        ? 'canonical-implementation'
        : 'canonicalize-restored-shadow';
    }
  }
  return { records, basenameCollisions, normalizedContentCollisions, behavioralEquivalenceGroups };
}

function collectServiceIndexClassifications(files, index) {
  const approvedIndexBarrels = [];
  const indexImplementationEntrypoints = [];
  const indexShadowCopies = [];

  for (const filePath of files.filter(isServiceIndexFile).sort(compareStrings)) {
    const owner = ownerRecordForPath(filePath, index);
    const contentHash = contentHashRecord(filePath);
    const record = {
      path: filePath,
      sha256: contentHash.value,
      contentHash,
      module: owner.module,
      owner: owner.owner,
      runtimeClassification: owner.runtimeClassification,
      browserClassification: owner.browserClassification,
    };
    const contentKind = serviceSourceContentKind(filePath);
    if (contentKind === 'approved-index-barrel') {
      approvedIndexBarrels.push({
        ...record,
        contentKind,
        reason: 'index file contains only type imports and export-from barrel statements',
      });
    } else if (isDirectServiceRootFile(filePath)) {
      indexShadowCopies.push({
        ...record,
        contentKind: 'index-shadow-copy',
        reason: 'root service index contains implementation content instead of an approved barrel',
      });
    } else {
      indexImplementationEntrypoints.push({
        ...record,
        contentKind,
        reason: 'nested index entrypoint contains implementation content and is tracked by content hash',
      });
    }
  }

  return {
    approvedIndexBarrels,
    indexImplementationEntrypoints,
    indexShadowCopies,
  };
}

function collectServiceDuplicateContentHashes(files, index) {
  const byHash = new Map();
  for (const filePath of files.filter(isServiceSourceFile).sort(compareStrings)) {
    const contentKind = serviceSourceContentKind(filePath);
    if (contentKind === 'approved-index-barrel') continue;
    const contentHash = contentHashRecord(filePath);
    const paths = byHash.get(contentHash.value) ?? [];
    paths.push(filePath);
    byHash.set(contentHash.value, paths);
  }

  return [...byHash.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([sha256, paths]) => {
      const sortedPaths = paths.sort(compareStrings);
      const canonicalPath = selectCanonicalDuplicatePath(sortedPaths, index);
      const canonicalOwner = ownerRecordForPath(canonicalPath, index);
      const pathRecords = sortedPaths.map((filePath) => {
        const owner = ownerRecordForPath(filePath, index);
        const contentKind = serviceSourceContentKind(filePath);
        return {
          path: filePath,
          sha256,
          contentHash: {
            algorithm: 'sha256',
            value: sha256,
          },
          contentKind,
          canonical: filePath === canonicalPath,
          restoredRootCopy: isDirectServiceRootFile(filePath),
          module: owner.module,
          owner: owner.owner,
          runtimeClassification: owner.runtimeClassification,
          browserClassification: owner.browserClassification,
        };
      });
      const restoredRootCopies = pathRecords
        .filter((entry) => entry.restoredRootCopy)
        .map((entry) => entry.path);
      const approvalProbe = {
        sha256,
        canonicalPath,
        paths: pathRecords,
      };
      const approvedContentHash = approvedContentHashForDuplicate(
        approvalProbe,
        index,
        canonicalOwner,
      );
      return {
        sha256,
        contentHash: {
          algorithm: 'sha256',
          value: sha256,
        },
        canonicalPath,
        canonicalModuleOwner: canonicalOwner,
        paths: pathRecords,
        restoredRootCopies,
        approvedContentHash: approvedContentHash
          ? {
              owner: approvedContentHash.owner,
              canonicalPath: approvedContentHash.canonicalPath,
              disposition: approvedContentHash.disposition,
              publicContracts: approvedContentHash.publicContracts,
              regressionTests: approvedContentHash.regressionTests,
              reason: approvedContentHash.reason,
            }
          : null,
        unapproved: !approvedContentHash,
        disposition: approvedContentHash
          ? approvedContentHash.disposition
          : (restoredRootCopies.length > 0 ? 'remove-restored-copy' : 'content-shadow-review'),
        reason: approvedContentHash
          ? approvedContentHash.reason
          : (
              restoredRootCopies.length > 0
                ? 'byte-identical restored root service implementation shadows a canonical module-owned file'
                : 'byte-identical service implementations require exact content-hash ownership approval'
            ),
      };
    })
    .sort((a, b) => (
      Number(b.unapproved) - Number(a.unapproved)
      || a.canonicalPath.localeCompare(b.canonicalPath)
      || a.sha256.localeCompare(b.sha256)
    ));
}

function collectRestoredServiceDuplicateInventory({
  duplicateContentHashes,
  importersByTarget,
  index,
  provenance,
  serviceFileInventory,
  serviceIndexClassifications,
  policyViolations,
  serviceDuplicateBasenames,
}) {
  const duplicatePathSet = new Set(serviceDuplicateBasenames.flatMap((item) => item.paths));
  const duplicateEntries = serviceDuplicateBasenames.map((item) => {
    const hasDirectRootCopy = item.paths.some((filePath) => isDirectServiceRootFile(filePath));
    const canonicalPath = selectCanonicalDuplicatePath(item.paths, index);
    const canonicalOwner = ownerRecordForPath(canonicalPath, index);
    const canonicalContentHash = contentHashRecord(canonicalPath);
    const approvedMultiEntrypoint = approvedMultiEntrypointForDuplicate(
      item,
      index,
      canonicalOwner,
    );
    const disposition = approvedMultiEntrypoint
      ? 'explicitly-approved-multi-entrypoint'
      : (hasDirectRootCopy ? 'remove-restored-copy' : 'move-and-retarget');
    const paths = item.paths.map((filePath) => {
      const stats = fs.statSync(abs(filePath));
      const owner = ownerRecordForPath(filePath, index);
      const directServiceRoot = isDirectServiceRootFile(filePath);
      const contentHash = contentHashRecord(filePath);
      const contentKind = serviceSourceContentKind(filePath);
      return {
        path: filePath,
        sha256: contentHash.value,
        contentHash,
        contentKind,
        sizeBytes: stats.size,
        importers: importersByTarget.get(filePath) ?? [],
        importerCount: importersByTarget.get(filePath)?.length ?? 0,
        canonical: filePath === canonicalPath,
        canonicalPath,
        canonicalModuleOwner: canonicalOwner,
        canonicalContentHash,
        disposition,
        restoredRootCopy: directServiceRoot,
        restoredAfterPhase16Cleanup: directServiceRoot && hasDirectRootCopy,
        phase16RestorationClassification: directServiceRoot && hasDirectRootCopy
          ? 'restored-root-copy-after-phase-16-cleanup'
          : 'not-a-restored-root-copy',
        module: owner.module,
        owner: owner.owner,
        runtimeClassification: owner.runtimeClassification,
        browserReachability: owner.browserReachability,
        browserClassification: owner.browserClassification,
      };
    });
    const runtimeClassificationCounts = {};
    const browserClassificationCounts = {};
    for (const pathRecord of paths) {
      runtimeClassificationCounts[pathRecord.runtimeClassification] = (
        runtimeClassificationCounts[pathRecord.runtimeClassification] ?? 0
      ) + 1;
      browserClassificationCounts[pathRecord.browserClassification] = (
        browserClassificationCounts[pathRecord.browserClassification] ?? 0
      ) + 1;
    }

    return {
      basename: item.basename,
      reason: item.reason,
      disposition,
      duplicateClass: 'non-index-service-basename',
      approvedMultiEntrypoint: approvedMultiEntrypoint
        ? {
            owner: approvedMultiEntrypoint.owner,
            reason: approvedMultiEntrypoint.reason,
          }
        : null,
      canonicalPath,
      canonicalModuleOwner: canonicalOwner,
      canonicalContentHash,
      canonicalSha256: canonicalContentHash.value,
      runtimeClassification: canonicalOwner.runtimeClassification,
      browserClassification: canonicalOwner.browserClassification,
      runtimeClassificationCounts,
      browserClassificationCounts,
      importers: paths.flatMap((pathRecord) => (
        pathRecord.importers.map((importer) => ({
          ...importer,
          target: pathRecord.path,
        }))
      )),
      importerCount: paths.reduce((total, pathRecord) => total + pathRecord.importerCount, 0),
      restoredRootCopies: paths.filter((entry) => entry.restoredRootCopy).map((entry) => entry.path),
      paths,
    };
  });

  for (const entry of duplicateEntries) {
    const collisionId = `basename:${entry.basename}`;
    for (const fileRecord of serviceFileInventory.records.filter((item) => entry.paths.some((candidate) => candidate.path === item.path))) {
      fileRecord.collisionIds = [...new Set([...fileRecord.collisionIds, collisionId])].sort(compareStrings);
      if (entry.disposition !== 'explicitly-approved-multi-entrypoint') {
        fileRecord.disposition = fileRecord.path === entry.canonicalPath
          ? 'canonical-collision-candidate'
          : entry.disposition;
      }
    }
  }

  const restoredRootFiles = duplicateEntries
    .flatMap((entry) => entry.paths.filter((item) => item.restoredRootCopy).map((item) => ({
      basename: entry.basename,
      path: item.path,
      sha256: item.sha256,
      contentHash: item.contentHash,
      importerCount: item.importerCount,
      canonicalPath: entry.canonicalPath,
      canonicalModuleOwner: entry.canonicalModuleOwner,
      canonicalContentHash: entry.canonicalContentHash,
      disposition: entry.disposition,
      phase16RestorationClassification: item.phase16RestorationClassification,
      module: item.module,
      owner: item.owner,
      runtimeClassification: item.runtimeClassification,
      browserClassification: item.browserClassification,
    })))
    .sort((a, b) => a.path.localeCompare(b.path));

  const duplicatePaths = [...duplicatePathSet].sort(compareStrings);
  const allDuplicatePathRecords = duplicateEntries.flatMap((entry) => entry.paths);
  const unapprovedDuplicateEntries = duplicateEntries
    .filter((entry) => entry.disposition !== 'explicitly-approved-multi-entrypoint');
  const dispositionCounts = {};
  for (const entry of duplicateEntries) {
    dispositionCounts[entry.disposition] = (dispositionCounts[entry.disposition] ?? 0) + 1;
  }
  const runtimeClassificationCounts = {};
  const browserClassificationCounts = {};
  for (const entry of allDuplicatePathRecords) {
    runtimeClassificationCounts[entry.runtimeClassification] = (
      runtimeClassificationCounts[entry.runtimeClassification] ?? 0
    ) + 1;
    browserClassificationCounts[entry.browserClassification] = (
      browserClassificationCounts[entry.browserClassification] ?? 0
    ) + 1;
  }

  return {
    schemaVersion: 2,
    generatedDate: currentUtcDate(),
    taskId: provenance.taskId,
    source: {
      manifestPath,
      serviceRoot: 'src/services',
      auditScript: 'scripts/audit-source-modules.mjs',
      phase16CleanupEvidence: 'implementation_plan/docs/38-swissknife-repository-refactoring-plan-2026-07-08.todo.md#phase-16',
      sourceRevision: provenance.sourceRevision,
      recoveryProvenance: provenance.recoveryProvenance,
    },
    policy: {
      indexBasenamesIgnored: index.restoredServiceDuplicatePolicy.indexBasenamesIgnored,
      broadExemptionsAllowed: index.restoredServiceDuplicatePolicy.broadExemptionsAllowed,
      nonIndexBasenameDuplicatesAreFailuresByDefault: (
        index.restoredServiceDuplicatePolicy.nonIndexBasenameDuplicatesAreFailuresByDefault
      ),
      approvedMultiEntrypoints: index.restoredServiceDuplicatePolicy.approvedMultiEntrypoints,
      approvedIndexEntrypoints: index.restoredServiceDuplicatePolicy.approvedIndexEntrypoints,
      approvedContentHashes: index.restoredServiceDuplicatePolicy.approvedContentHashes,
      classifiedCollisions: index.restoredServiceDuplicatePolicy.classifiedCollisions,
      policyViolations,
      allowedDispositions: [
        'remove-restored-copy',
        'move-and-retarget',
        'explicitly-approved-multi-entrypoint',
        'explicitly-approved-content-hash',
        'content-shadow-review',
      ],
    },
    summary: {
      duplicateBasenames: duplicateEntries.length,
      unapprovedDuplicateBasenames: unapprovedDuplicateEntries.length,
      duplicatePaths: duplicatePaths.length,
      restoredRootFilesAfterPhase16Cleanup: restoredRootFiles.length,
      duplicateBasenamesWithRestoredRootCopies: duplicateEntries
        .filter((entry) => entry.restoredRootCopies.length > 0).length,
      duplicateBasenamesWithoutRestoredRootCopies: duplicateEntries
        .filter((entry) => entry.restoredRootCopies.length === 0).length,
      dispositionCounts,
      runtimeClassificationCounts,
      browserClassificationCounts,
      restoredServiceDuplicatePolicyViolations: policyViolations.length,
      approvedIndexBarrels: serviceIndexClassifications.approvedIndexBarrels.length,
      indexImplementationEntrypoints: serviceIndexClassifications.indexImplementationEntrypoints.length,
      indexShadowCopies: serviceIndexClassifications.indexShadowCopies.length,
      duplicateContentHashes: duplicateContentHashes.length,
      unapprovedDuplicateContentHashes: duplicateContentHashes.filter((entry) => entry.unapproved).length,
      executableServiceFiles: serviceFileInventory.records.length,
      basenameCollisions: serviceFileInventory.basenameCollisions.length,
      indexEntrypointBasenameCollisions: serviceFileInventory.basenameCollisions
        .filter((entry) => entry.kind === 'index-entrypoint-basename').length,
      unclassifiedBasenameCollisions: serviceFileInventory.basenameCollisions
        .filter((entry) => !entry.classified).length,
      normalizedContentCollisions: serviceFileInventory.normalizedContentCollisions.length,
      unclassifiedNormalizedContentCollisions: serviceFileInventory.normalizedContentCollisions
        .filter((entry) => !entry.classified).length,
      behavioralEquivalenceGroups: serviceFileInventory.behavioralEquivalenceGroups.length,
      unclassifiedBehavioralEquivalenceGroups: serviceFileInventory.behavioralEquivalenceGroups
        .filter((entry) => !entry.classified).length,
      totalImporters: serviceFileInventory.records.reduce((total, entry) => total + entry.importerCount, 0),
      uniqueImporterFiles: new Set(serviceFileInventory.records.flatMap((entry) => (
        entry.importers.map((importer) => importer.file)
      ))).size,
    },
    serviceFiles: serviceFileInventory.records,
    basenameCollisions: serviceFileInventory.basenameCollisions,
    normalizedContentCollisions: serviceFileInventory.normalizedContentCollisions,
    behavioralEquivalenceGroups: serviceFileInventory.behavioralEquivalenceGroups,
    serviceIndexClassifications,
    duplicateContentHashes,
    restoredRootFiles,
    duplicates: duplicateEntries,
  };
}

function collectLegacySprintServiceFiles(files) {
  return files
    .filter((filePath) => (
      filePath.startsWith('src/services/')
      && /(?:^|\/)(?:cec-sprint\d+|sprint\d+[-\w]*)\.[cm]?[jt]sx?$/.test(filePath)
    ))
    .map((filePath) => ({
      path: filePath,
      module: 'services',
      reason: 'legacy sprint-named service file should be renamed to the owned domain module',
    }))
    .sort(compareByPath);
}

function collectOwnershipConflicts(files, index) {
  return files
    .map((filePath) => {
      if (!filePath.startsWith('src/')) return null;
      const owners = new Set();
      if (isDirectRootFile(filePath) && index.rootFileOwners.has(filePath)) {
        owners.add(index.rootFileOwners.get(filePath));
      }
      if (isDirectServiceRootFile(filePath) && index.serviceRootFileOwners.has(filePath)) {
        owners.add(index.serviceRootFileOwners.get(filePath));
      }
      for (const owner of matchingPathOwners(filePath, index)) {
        owners.add(owner.module);
      }
      for (const entrypointOwner of index.entrypointOwners) {
        if (entrypointOwner.re.test(filePath)) owners.add(entrypointOwner.module);
      }
      return owners.size > 1
        ? {
            file: filePath,
            module: [...owners].sort(compareStrings).join(','),
            reason: 'file matches more than one ownership family in src/module-ownership.json',
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.file.localeCompare(b.file));
}

function matchesAnyGlob(filePath, patterns) {
  return patterns.some((item) => item.re.test(filePath));
}

function packageBrowserEntrypoints() {
  const packageJson = fs.existsSync(abs('package.json')) ? readJson('package.json') : {};
  return Object.entries(packageJson.exports ?? {})
    .flatMap(([exportName, value]) => {
      const leaves = flattenPackageExportTargets(value, exportName);
      const explicitBrowserLeaves = leaves.filter((entry) => entry.conditions.includes('browser'));
      const selected = explicitBrowserLeaves.length > 0
        ? explicitBrowserLeaves
        : leaves.filter((entry) => (
            !entry.conditions.some((condition) => ['node', 'host', 'require'].includes(condition))
            && (
              entry.conditions.length === 0
              || entry.conditions.some((condition) => ['import', 'module', 'default'].includes(condition))
            )
          ));
      return selected.map((entry) => ({
        exportName: entry.name,
        path: entry.target,
      }));
    })
    .filter((entry) => isSourceFile(entry.path))
    .sort((a, b) => a.exportName.localeCompare(b.exportName) || a.path.localeCompare(b.path));
}

function isDeclaredPublicEntrypoint(filePath, moduleName, index) {
  return (index.modules[moduleName]?.publicEntrypoints ?? [])
    .some((pattern) => globToRegExp(pattern).test(filePath));
}

function collectBrowserEntrypointPolicyViolations(index, serviceFileInventory) {
  const findings = [];
  const actual = packageBrowserEntrypoints();
  const actualKeys = new Set(actual.map((entry) => `${entry.exportName}\0${entry.path}`));
  const approvalKeys = new Set();
  const publicContracts = new Set();

  for (const [approvalIndex, approval] of index.browserPublicEntrypoints.entries()) {
    const policy = `audit.browserPublicEntrypoints[${approvalIndex}]`;
    const key = `${approval.exportName}\0${approval.path}`;
    if (approvalKeys.has(key)) {
      findings.push({
        file: approval.path ?? manifestPath,
        module: approval.owner ?? 'unknown',
        policy,
        reason: 'browser public entrypoint approvals must not duplicate an exact export and path',
      });
    }
    approvalKeys.add(key);
    const targetOwner = approval.path ? moduleForPath(approval.path, index) : null;
    if (
      !approval.exportName
      || !approval.exportName.startsWith('.')
      || hasGlobSyntax(approval.exportName)
      || !approval.path
      || !approval.path.startsWith('src/')
      || hasGlobSyntax(approval.path)
    ) {
      findings.push({
        file: approval.path ?? manifestPath,
        module: approval.owner ?? 'unknown',
        policy,
        reason: 'browser public entrypoint approval must name one exact package export and source path',
      });
    }
    if (!approval.owner || !index.modules[approval.owner] || targetOwner !== approval.owner) {
      findings.push({
        file: approval.path ?? manifestPath,
        module: approval.owner ?? 'unknown',
        policy,
        reason: 'browser public entrypoint approval must name the exact owning source module',
      });
    }
    if (!approval.publicContract?.trim()) {
      findings.push({
        file: approval.path ?? manifestPath,
        module: approval.owner ?? 'unknown',
        policy,
        reason: 'browser public entrypoint approval must document its supported public contract',
      });
    } else if (publicContracts.has(approval.publicContract.trim())) {
      findings.push({
        file: approval.path ?? manifestPath,
        module: approval.owner ?? 'unknown',
        policy,
        reason: 'browser public entrypoint approvals must name distinct supported public contracts',
      });
    } else {
      publicContracts.add(approval.publicContract.trim());
    }
    if (approval.path && approval.owner && !isDeclaredPublicEntrypoint(approval.path, approval.owner, index)) {
      findings.push({
        file: approval.path,
        module: approval.owner,
        policy,
        reason: 'browser public entrypoint path is not a declared module public entrypoint',
      });
    }
    if (!actualKeys.has(key)) {
      findings.push({
        file: approval.path ?? manifestPath,
        module: approval.owner ?? 'unknown',
        policy,
        reason: 'browser public entrypoint approval is stale or does not match package.json exports',
      });
    }
  }

  for (const entry of actual) {
    if (approvalKeys.has(`${entry.exportName}\0${entry.path}`)) continue;
    findings.push({
      file: entry.path,
      module: moduleForPath(entry.path, index) ?? 'unknown',
      exportName: entry.exportName,
      reason: 'browser public entrypoint is not declared in audit.browserPublicEntrypoints',
    });
  }

  const behaviorGroupsByPath = new Map();
  for (const group of serviceFileInventory.behavioralEquivalenceGroups) {
    for (const filePath of group.paths) behaviorGroupsByPath.set(filePath, group);
  }
  for (const entry of actual) {
    const group = behaviorGroupsByPath.get(entry.path);
    if (!group || group.classified) continue;
    findings.push({
      file: entry.path,
      module: moduleForPath(entry.path, index) ?? 'unknown',
      exportName: entry.exportName,
      collisionId: group.id,
      equivalentPaths: group.paths,
      reason: 'browser public entrypoint is behavior-equivalent to another service module without exact duplicate-policy approval',
    });
  }

  return findings.sort(compareFindings);
}

function collectUndocumentedServiceDeepImports(files, index) {
  const findings = [];
  const observedApprovals = new Set();
  for (const filePath of files.filter(isSourceFile)) {
    const importerModule = moduleForPath(filePath, index)
      ?? (filePath.startsWith('web/') ? 'browser' : null);
    if (!importerModule) continue;
    for (const item of extractImports(filePath)) {
      if (!isLocalSpecifier(item.specifier)) continue;
      const target = resolveLocalSpecifier(item.specifier, filePath);
      if (!target?.startsWith('src/services/')) continue;
      const targetModule = moduleForPath(target, index);
      if (!targetModule || targetModule === importerModule) continue;
      if (isDeclaredPublicEntrypoint(target, targetModule, index)) continue;
      const approval = index.documentedServiceDeepImports.find((entry) => (
        entry.importer === filePath
        && entry.target === target
        && entry.owner === targetModule
        && entry.reason?.trim()
      ));
      if (approval) {
        observedApprovals.add(`${approval.importer}\0${approval.target}\0${approval.owner}`);
        continue;
      }
      findings.push({
        file: filePath,
        kind: item.kind,
        line: item.line,
        module: importerModule,
        specifier: item.specifier,
        target,
        targetModule,
        reason: 'cross-family service import targets an undocumented private implementation path',
      });
    }
  }

  for (const entry of index.documentedServiceDeepImports) {
    const key = `${entry.importer}\0${entry.target}\0${entry.owner}`;
    if (observedApprovals.has(key)) continue;
    findings.push({
      file: entry.importer ?? manifestPath,
      module: entry.owner ?? 'unknown',
      target: entry.target,
      targetModule: entry.owner,
      reason: !entry.reason?.trim()
        ? 'documented service deep import requires a non-empty rationale'
        : 'documented service deep import is stale or no longer targets a private cross-family implementation',
    });
  }
  return findings.sort(compareFindings);
}

function builtinPackageName(specifier) {
  return stripNodePrefix(specifier).split('/')[0];
}

function externalPackageName(specifier) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0];
}

function collectBrowserUnsafeImports(index) {
  const browserOwnedFiles = [
    ...listFiles('src', (relative) => isSourceFile(relative)),
    ...listFiles('web', (relative) => isSourceFile(relative)),
  ].filter((filePath) => matchesAnyGlob(filePath, index.browserSafeSourceGlobs));
  const packageRoots = packageBrowserEntrypoints().map((entry) => ({
    file: entry.path,
    rootEntrypoint: entry.path,
    exportName: entry.exportName,
    chain: [entry.path],
  }));
  const packageRootPaths = new Set(packageRoots.map((entry) => entry.file));
  const queue = [
    ...packageRoots,
    ...browserOwnedFiles
      .filter((filePath) => !packageRootPaths.has(filePath))
      .map((filePath) => ({ file: filePath, rootEntrypoint: filePath, exportName: null, chain: [filePath] })),
  ];
  const visited = new Set();
  const findings = [];

  while (queue.length > 0) {
    const current = queue.shift();
    const filePath = current.file;
    if (visited.has(filePath) || !fs.existsSync(abs(filePath)) || !isSourceFile(filePath)) continue;
    visited.add(filePath);
    const importerModule = moduleForPath(filePath, index) ?? 'browser';
    for (const item of extractImports(filePath)) {
      const builtin = builtinPackageName(item.specifier);
      if (HOST_ONLY_BUILTINS.has(builtin)) {
        const transitive = current.chain.length > 1;
        findings.push({
          file: filePath,
          kind: item.kind,
          line: item.line,
          module: importerModule,
          specifier: item.specifier,
          targetModule: 'host-runtime',
          rootEntrypoint: current.rootEntrypoint,
          exportName: current.exportName,
          importChain: current.chain,
          reason: transitive
            ? 'browser public entrypoint transitively reaches a host-only Node builtin'
            : 'browser-safe ownership file imports a host-only Node builtin',
        });
        continue;
      }

      if (!isLocalSpecifier(item.specifier)) {
        const packageName = externalPackageName(item.specifier);
        if (index.browserHostOnlyPackages.has(packageName)) {
          findings.push({
            file: filePath,
            kind: item.kind,
            line: item.line,
            module: importerModule,
            specifier: item.specifier,
            targetModule: 'host-runtime',
            rootEntrypoint: current.rootEntrypoint,
            exportName: current.exportName,
            importChain: current.chain,
            reason: 'browser public entrypoint reaches a package classified as host-only',
          });
        }
        continue;
      }

      const target = resolveLocalSpecifier(item.specifier, filePath);
      if (!target) continue;
      const targetModule = moduleForPath(target, index);
      const targetDefinition = targetModule ? index.modules[targetModule] : null;
      if (
        targetDefinition
        && (
          ['host-only', 'host-ui'].includes(targetDefinition.runtimeClassification)
          || targetDefinition.browserReachability === 'forbidden'
        )
      ) {
        findings.push({
          file: filePath,
          kind: item.kind,
          line: item.line,
          module: importerModule,
          specifier: item.specifier,
          target,
          targetModule,
          rootEntrypoint: current.rootEntrypoint,
          exportName: current.exportName,
          importChain: [...current.chain, target],
          reason: 'browser public entrypoint transitively reaches a host-only owned module',
        });
        continue;
      }

      if (target.startsWith('src/services/') && !index.browserSafeServiceFiles.has(target)) {
        findings.push({
          file: filePath,
          kind: item.kind,
          line: item.line,
          module: importerModule,
          specifier: item.specifier,
          target,
          targetModule: targetModule ?? 'unknown-service',
          rootEntrypoint: current.rootEntrypoint,
          exportName: current.exportName,
          importChain: [...current.chain, target],
          reason: 'browser-safe ownership file imports a service file that is not listed in audit.browserSafeServiceFiles',
        });
        continue;
      }

      if (isSourceFile(target) && !visited.has(target)) {
        queue.push({
          file: target,
          rootEntrypoint: current.rootEntrypoint,
          exportName: current.exportName,
          chain: [...current.chain, target],
        });
      }
    }
  }

  return findings.sort(compareFindings);
}

function collectReleaseReadinessSurface(allSourceFiles, index) {
  const config = index.releaseReadinessSurface;
  if (!config) {
    return {
      enabled: false,
      summary: {
        producerManifestFiles: 0,
        ownedEntrypoints: 0,
        releaseBehaviorFiles: 0,
        violations: 0,
      },
      source: null,
      producerManifestFiles: [],
      entrypoints: [],
      releaseBehaviorFiles: [],
      violations: [],
    };
  }

  const violations = [];
  const producerManifestFiles = allSourceFiles
    .filter((filePath) => sourceDeclaresExportedConst(filePath, config.producerExport))
    .sort(compareStrings);
  const ownershipRecords = releaseEntrypointOwnershipRecords(
    config.manifestPath,
    config.entrypointOwnershipExport,
  );
  const ownershipPaths = new Set(ownershipRecords.map((entry) => entry.path).filter(Boolean));
  const requiredEntrypoints = new Set(config.requiredEntrypoints);
  const publicReleaseApiImporters = new Set(config.publicReleaseApiImporters);
  const ownedPortHelperImporters = new Set(config.ownedPortHelperImporters);

  if (!fs.existsSync(abs(config.manifestPath))) {
    violations.push({
      file: config.manifestPath,
      module: config.owner,
      reason: 'release producer manifest path does not exist',
    });
  } else if (!sourceDeclaresExportedConst(config.manifestPath, config.producerExport)) {
    violations.push({
      file: config.manifestPath,
      module: config.owner,
      reason: `release producer manifest must export const ${config.producerExport}`,
    });
  }

  for (const producerFile of producerManifestFiles) {
    if (producerFile === config.manifestPath) continue;
    violations.push({
      file: producerFile,
      module: config.owner,
      reason: `second executable producer manifest exports ${config.producerExport}; use ${config.manifestPath}`,
    });
  }

  if (producerManifestFiles.length === 0) {
    violations.push({
      file: config.manifestPath,
      module: config.owner,
      reason: `no executable release producer manifest exports ${config.producerExport}`,
    });
  }

  if (!sourceDeclaresExportedConst(config.manifestPath, config.entrypointOwnershipExport)) {
    violations.push({
      file: config.manifestPath,
      module: config.owner,
      reason: `release producer manifest must export const ${config.entrypointOwnershipExport}`,
    });
  }

  for (const required of config.requiredEntrypoints) {
    if (!ownershipPaths.has(required)) {
      violations.push({
        file: required,
        module: config.owner,
        reason: 'required release-readiness entrypoint is missing from the producer manifest ownership export',
      });
    }
  }

  for (const entry of ownershipRecords) {
    if (!entry.path) {
      violations.push({
        file: config.manifestPath,
        module: config.owner,
        reason: 'release entrypoint ownership record is missing an exact path',
      });
      continue;
    }
    if (entry.owner !== config.owner) {
      violations.push({
        file: entry.path,
        module: entry.owner ?? 'unknown',
        reason: `release entrypoint owner must be ${config.owner}`,
      });
    }
    if (!entry.runtime || hasGlobSyntax(entry.runtime)) {
      violations.push({
        file: entry.path,
        module: config.owner,
        reason: 'release entrypoint ownership record must include one exact runtime classification',
      });
    }
    if (!entry.auditDecision?.trim()) {
      violations.push({
        file: entry.path,
        module: config.owner,
        reason: 'release entrypoint ownership record must include an audit decision',
      });
    }
    if (!fs.existsSync(abs(entry.path)) || !isSourceFile(entry.path)) {
      violations.push({
        file: entry.path,
        module: config.owner,
        reason: 'release entrypoint path must be an existing executable source file',
      });
    }
  }

  for (const exportName of config.publicExports) {
    if (!sourceDeclaresExportedConst(config.manifestPath, exportName) && !exportedConstDeclarations(config.manifestPath).has(exportName)) {
      const source = fs.existsSync(abs(config.manifestPath))
        ? stripSourceComments(fs.readFileSync(abs(config.manifestPath), 'utf8'))
        : '';
      const functionRe = new RegExp(`\\bexport\\s+function\\s+${escapeRegExp(exportName)}\\s*\\(`);
      if (!functionRe.test(source)) {
        violations.push({
          file: config.manifestPath,
          module: config.owner,
          reason: `release public API export is missing: ${exportName}`,
        });
      }
    }
  }

  const helperSource = fs.existsSync(abs(config.ownedPortHelper))
    ? stripSourceComments(fs.readFileSync(abs(config.ownedPortHelper), 'utf8'))
    : '';
  for (const exportName of config.ownedPortExports) {
    const functionRe = new RegExp(`\\bexport\\s+async\\s+function\\s+${escapeRegExp(exportName)}\\s*\\(|\\bexport\\s+function\\s+${escapeRegExp(exportName)}\\s*\\(`);
    if (!functionRe.test(helperSource)) {
      violations.push({
        file: config.ownedPortHelper,
        module: config.owner,
        reason: `owned endpoint-leasing helper must export ${exportName}`,
      });
    }
  }

  const wrapperImports = fs.existsSync(abs(config.ownedPortWrapper))
    ? localImportTargets(config.ownedPortWrapper)
    : [];
  if (!wrapperImports.some((item) => item.target === config.ownedPortHelper)) {
    violations.push({
      file: config.ownedPortWrapper,
      module: config.owner,
      target: config.ownedPortHelper,
      reason: 'owned port wrapper must import the canonical endpoint-leasing helper',
    });
  }

  const releaseGateImports = fs.existsSync(abs(config.releaseGate))
    ? localImportTargets(config.releaseGate)
    : [];
  if (!releaseGateImports.some((item) => item.target === config.manifestPath)) {
    violations.push({
      file: config.releaseGate,
      module: config.owner,
      target: config.manifestPath,
      reason: 'release gate must import the authoritative producer manifest public API',
    });
  }

  for (const entrypointPath of [
    'build-tools/configs/playwright.live-behavior-proof.config.ts',
    'build-tools/configs/playwright.live-gateway.config.ts',
  ].filter((item) => requiredEntrypoints.has(item))) {
    if (!fs.existsSync(abs(entrypointPath))) continue;
    const source = stripSourceComments(fs.readFileSync(abs(entrypointPath), 'utf8'));
    if (/\breuseExistingServer\s*:\s*true\b/.test(source)) {
      violations.push({
        file: entrypointPath,
        module: config.owner,
        reason: 'browser Playwright release config must not reuse a foreign existing server',
      });
    }
    if (/\bpython(?:3)?\b|\bpyodide\b|\brunPython(?:Async)?\b/i.test(source)) {
      violations.push({
        file: entrypointPath,
        module: config.owner,
        reason: 'browser Playwright release config must not invoke Python or Pyodide',
      });
    }
  }

  const releaseBehaviorFiles = new Set([
    ...producerManifestFiles,
    ...ownershipRecords.map((entry) => entry.path).filter(Boolean),
  ]);

  for (const filePath of allSourceFiles) {
    const imports = localImportTargets(filePath);
    const importsProducerManifest = imports.some((item) => item.target === config.manifestPath);
    const importsOwnedPortHelper = imports.some((item) => item.target === config.ownedPortHelper);
    const declaresOwnership = sourceDeclaresExportedConst(filePath, config.entrypointOwnershipExport);
    if (importsProducerManifest || importsOwnedPortHelper || declaresOwnership) {
      releaseBehaviorFiles.add(filePath);
    }

    if (importsProducerManifest && !publicReleaseApiImporters.has(filePath)) {
      violations.push({
        file: filePath,
        module: config.owner,
        target: config.manifestPath,
        reason: 'direct release producer manifest import bypasses the owned release API import seam',
      });
    }
    if (importsOwnedPortHelper && !ownedPortHelperImporters.has(filePath)) {
      violations.push({
        file: filePath,
        module: config.owner,
        target: config.ownedPortHelper,
        reason: 'direct endpoint-leasing helper import bypasses the owned port wrapper seam',
      });
    }
  }

  for (const filePath of releaseBehaviorFiles) {
    if (!ownershipPaths.has(filePath) && filePath !== config.manifestPath) {
      violations.push({
        file: filePath,
        module: config.owner,
        reason: 'release-readiness behavior appears in a root script/config that is not classified in the producer manifest ownership export',
      });
    }
  }

  const dedupedViolations = [...new Map(violations.map((item) => [
    `${item.file}\0${item.target ?? ''}\0${item.reason}`,
    item,
  ])).values()].sort(compareFindings);

  return {
    enabled: true,
    source: {
      manifestPath: config.manifestPath,
      producerExport: config.producerExport,
      entrypointOwnershipExport: config.entrypointOwnershipExport,
      ownedPortHelper: config.ownedPortHelper,
      ownedPortWrapper: config.ownedPortWrapper,
      releaseGate: config.releaseGate,
    },
    summary: {
      producerManifestFiles: producerManifestFiles.length,
      ownedEntrypoints: ownershipRecords.length,
      releaseBehaviorFiles: releaseBehaviorFiles.size,
      violations: dedupedViolations.length,
    },
    producerManifestFiles,
    entrypoints: ownershipRecords,
    releaseBehaviorFiles: [...releaseBehaviorFiles].sort(compareStrings),
    violations: dedupedViolations,
  };
}

function audit(manifest, args) {
  const index = buildManifestIndex(manifest);
  const provenance = revalidationProvenance(manifest);
  const allFiles = listFiles('src', (relative) => isAuditedFile(relative));
  const allSourceFiles = listFiles('.', (relative) => isSourceFile(relative));
  const serviceDuplicateBasenames = collectServiceDuplicateBasenames(allFiles);
  const serviceIndexClassifications = collectServiceIndexClassifications(allFiles, index);
  const restoredServiceDuplicatePolicyViolations = collectRestoredServiceDuplicatePolicyViolations(
    index.restoredServiceDuplicatePolicy,
    index.modules,
  );
  index.invalidRestoredServiceDuplicatePolicyLocations = new Set(
    restoredServiceDuplicatePolicyViolations.map((finding) => finding.policy),
  );
  const serviceDuplicateContentHashes = collectServiceDuplicateContentHashes(allFiles, index);
  const importersByTarget = collectLocalImporters(allSourceFiles);
  const serviceFileInventory = collectServiceFileInventory(allFiles, importersByTarget, index);
  const restoredServiceDuplicateInventory = collectRestoredServiceDuplicateInventory({
    duplicateContentHashes: serviceDuplicateContentHashes,
    importersByTarget,
    index,
    serviceFileInventory,
    serviceIndexClassifications,
    policyViolations: restoredServiceDuplicatePolicyViolations,
    provenance,
    serviceDuplicateBasenames,
  });
  const legacySprintServiceFiles = collectLegacySprintServiceFiles(allFiles);
  const ownershipConflicts = collectOwnershipConflicts(allFiles, index);
  const browserUnsafeImports = collectBrowserUnsafeImports(index);
  const releaseReadinessSurface = collectReleaseReadinessSurface(allSourceFiles, index);
  const browserEntrypointPolicyViolations = collectBrowserEntrypointPolicyViolations(
    index,
    serviceFileInventory,
  );
  const undocumentedServiceDeepImports = collectUndocumentedServiceDeepImports([
    ...allFiles,
    ...listFiles('web', (relative) => isSourceFile(relative)),
  ], index);
  const unresolvedMergeMarkers = collectUnresolvedMergeMarkers(allFiles, index)
    .filter((item) => shouldIncludeModule(item.module, args));
  const moduleNames = Object.keys(index.modules).sort(compareStrings);
  const knownModuleFiles = new Map(moduleNames.map((moduleName) => [moduleName, []]));
  const rootDebt = [];
  const rootServiceImplementationViolations = [];
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

    if (
      isDirectServiceRootFile(filePath)
      && isServiceSourceFile(filePath)
      && serviceSourceContentKind(filePath) !== 'approved-index-barrel'
    ) {
      rootServiceImplementationViolations.push({
        file: filePath,
        module: owner ?? 'unknown',
        reason: 'executable service implementation is located directly under src/services',
      });
    }

    if (!owner) {
      if (isAuditedFile(filePath) && !index.ignoredRootFiles.has(filePath)) {
        unknownFiles.push({
          file: filePath,
          module: 'unknown',
          reason: isDirectServiceRootFile(filePath)
            ? 'root service file is not listed in audit.serviceRootFileOwners'
            : 'path is not listed in src/module-ownership.json',
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
    provenance,
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
      rootServiceImplementationViolations: rootServiceImplementationViolations.length,
      unknownFiles: scopedUnknownFiles.length,
      forbiddenImports: forbiddenImports.length,
      legacyCompatibilityShims: scopedLegacyShims.length,
      legacyRootImportSpecifiers: scopedLegacyRootImportSpecifiers.length,
      ownershipConflicts: ownershipConflicts.length,
      browserUnsafeImports: browserUnsafeImports.length,
      browserEntrypointPolicyViolations: browserEntrypointPolicyViolations.length,
      releaseReadinessSurfaceViolations: releaseReadinessSurface.summary.violations,
      undocumentedServiceDeepImports: undocumentedServiceDeepImports.length,
      unresolvedMergeMarkers: unresolvedMergeMarkers.length,
      serviceDuplicateBasenames: serviceDuplicateBasenames.length,
      unapprovedServiceDuplicateBasenames: restoredServiceDuplicateInventory.summary.unapprovedDuplicateBasenames,
      serviceDuplicateContentHashes: serviceDuplicateContentHashes.length,
      unapprovedServiceDuplicateContentHashes: serviceDuplicateContentHashes
        .filter((entry) => entry.unapproved).length,
      approvedServiceIndexBarrels: serviceIndexClassifications.approvedIndexBarrels.length,
      serviceIndexImplementationEntrypoints: serviceIndexClassifications.indexImplementationEntrypoints.length,
      serviceIndexShadowCopies: serviceIndexClassifications.indexShadowCopies.length,
      restoredServiceDuplicatePolicyViolations: restoredServiceDuplicatePolicyViolations.length,
      serviceExecutableFiles: serviceFileInventory.records.length,
      serviceNormalizedContentCollisions: serviceFileInventory.normalizedContentCollisions.length,
      unclassifiedServiceNormalizedContentCollisions: serviceFileInventory.normalizedContentCollisions
        .filter((entry) => !entry.classified).length,
      serviceBehavioralEquivalenceGroups: serviceFileInventory.behavioralEquivalenceGroups.length,
      unclassifiedServiceBehavioralEquivalenceGroups: serviceFileInventory.behavioralEquivalenceGroups
        .filter((entry) => !entry.classified).length,
      legacySprintServiceFiles: legacySprintServiceFiles.length,
      unclassifiedServiceBasenameCollisions: serviceFileInventory.basenameCollisions
        .filter((entry) => !entry.classified).length,
    },
    rootDebt: scopedRootDebt,
    rootServiceImplementationViolations: rootServiceImplementationViolations.sort(compareFindings),
    unknownFiles: scopedUnknownFiles,
    forbiddenImports: forbiddenImports.sort(compareFindings),
    ownershipConflicts,
    browserUnsafeImports,
    browserEntrypointPolicyViolations,
    releaseReadinessSurface,
    undocumentedServiceDeepImports,
    unresolvedMergeMarkers,
    restoredServiceDuplicatePolicyViolations,
    restoredServiceDuplicateInventory,
    serviceIndexClassifications,
    serviceDuplicateContentHashDetails: serviceDuplicateContentHashes,
    serviceNormalizedContentCollisionDetails: serviceFileInventory.normalizedContentCollisions,
    serviceBehavioralEquivalenceDetails: serviceFileInventory.behavioralEquivalenceGroups,
    legacyCompatibilityShims: scopedLegacyShims,
    legacyRootImportSpecifiers: scopedLegacyRootImportSpecifiers,
    serviceDuplicateBasenames: serviceDuplicateBasenames.length,
    serviceDuplicateBasenameDetails: serviceDuplicateBasenames,
    legacySprintServiceFiles,
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

function formatDuplicateBasenameLine(item) {
  return `  - ${item.basename}: ${item.reason}; paths=${item.paths.join(', ')}`;
}

function formatRestoredDuplicateImplementationLine(entry) {
  const shadows = entry.paths
    .filter((item) => !item.canonical)
    .map((item) => `${item.path} [${item.module}, ${item.contentKind}, sha256 ${shortHash(item.sha256)}, importers ${item.importerCount}]`)
    .join('; ');
  const restoredAction = entry.restoredRootCopies.length > 0
    ? `remove restored root copy ${entry.restoredRootCopies.join(', ')}`
    : 'move or retarget non-canonical implementation paths';
  return [
    `  - ${entry.basename}: ${restoredAction}`,
    `canonical ${entry.canonicalPath} [${entry.canonicalModuleOwner.module}, sha256 ${shortHash(entry.canonicalSha256)}]`,
    `shadows ${shadows || 'none'}`,
  ].join('; ');
}

function formatContentDuplicateLine(entry) {
  return [
    `  - sha256 ${shortHash(entry.sha256)}: ${entry.reason}`,
    `canonical ${entry.canonicalPath} [${entry.canonicalModuleOwner.module}]`,
    `disposition ${entry.disposition}`,
    `paths=${entry.paths.map((item) => `${item.path} [${item.module}, ${item.contentKind}]`).join(', ')}`,
  ].join('; ');
}

function formatIndexClassificationLine(item) {
  return `  - ${item.path} [${item.module}, sha256 ${shortHash(item.sha256)}]: ${item.reason}`;
}

function formatPolicyViolationLine(item) {
  const target = item.path ? ` (${item.path})` : '';
  return `  - ${item.policy}${target} [${item.module}]: ${item.reason}`;
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
  console.log(`root service implementation violations: ${result.summary.rootServiceImplementationViolations}`);
  console.log(`unknown files: ${result.summary.unknownFiles}`);
  console.log(`forbidden imports: ${result.summary.forbiddenImports}`);
  console.log(`ownership conflicts: ${result.summary.ownershipConflicts}`);
  console.log(`browser unsafe imports: ${result.summary.browserUnsafeImports}`);
  console.log(`browser entrypoint policy violations: ${result.summary.browserEntrypointPolicyViolations}`);
  console.log(`release-readiness surface violations: ${result.summary.releaseReadinessSurfaceViolations}`);
  console.log(`undocumented service deep imports: ${result.summary.undocumentedServiceDeepImports}`);
  console.log(`unresolved merge markers: ${result.summary.unresolvedMergeMarkers}`);
  console.log(`restored service duplicate policy violations: ${result.summary.restoredServiceDuplicatePolicyViolations}`);
  console.log(`legacy compatibility shims: ${result.summary.legacyCompatibilityShims}`);
  console.log(`legacy root import specifiers: ${result.summary.legacyRootImportSpecifiers}`);
  console.log(`service duplicate basenames: ${result.summary.serviceDuplicateBasenames}`);
  console.log(`unapproved service duplicate basenames: ${result.summary.unapprovedServiceDuplicateBasenames}`);
  console.log(`service duplicate content hashes: ${result.summary.serviceDuplicateContentHashes}`);
  console.log(`unapproved service duplicate content hashes: ${result.summary.unapprovedServiceDuplicateContentHashes}`);
  console.log(`service executable files inventoried: ${result.summary.serviceExecutableFiles}`);
  console.log(`unclassified service basename collisions: ${result.summary.unclassifiedServiceBasenameCollisions}`);
  console.log(`service normalized-content collisions: ${result.summary.serviceNormalizedContentCollisions}`);
  console.log(`unclassified service normalized-content collisions: ${result.summary.unclassifiedServiceNormalizedContentCollisions}`);
  console.log(`service behavioral-equivalence groups: ${result.summary.serviceBehavioralEquivalenceGroups}`);
  console.log(`unclassified service behavioral-equivalence groups: ${result.summary.unclassifiedServiceBehavioralEquivalenceGroups}`);
  console.log(`approved service index barrels: ${result.summary.approvedServiceIndexBarrels}`);
  console.log(`service index implementation entrypoints: ${result.summary.serviceIndexImplementationEntrypoints}`);
  console.log(`service index shadow copies: ${result.summary.serviceIndexShadowCopies}`);
  console.log(`legacy sprint service files: ${result.summary.legacySprintServiceFiles}`);
  console.log('');
  printSection(
    'restored service duplicate implementations',
    result.restoredServiceDuplicateInventory.duplicates
      .filter((entry) => entry.disposition !== 'explicitly-approved-multi-entrypoint'),
    formatRestoredDuplicateImplementationLine,
  );
  console.log('');
  printSection(
    'unapproved service duplicate content hashes',
    result.serviceDuplicateContentHashDetails.filter((entry) => entry.unapproved),
    formatContentDuplicateLine,
  );
  console.log('');
  printSection(
    'service index shadow copies',
    result.serviceIndexClassifications.indexShadowCopies,
    formatIndexClassificationLine,
  );
  console.log('');
  printSection('root files', result.rootDebt, formatFindingLine);
  console.log('');
  printSection('unknown files', result.unknownFiles, formatFindingLine);
  console.log('');
  printSection('forbidden imports', result.forbiddenImports, formatFindingLine);
  console.log('');
  printSection('ownership conflicts', result.ownershipConflicts, formatFindingLine);
  console.log('');
  printSection('browser unsafe imports', result.browserUnsafeImports, formatFindingLine);
  console.log('');
  printSection('browser entrypoint policy violations', result.browserEntrypointPolicyViolations, formatFindingLine);
  console.log('');
  printSection('release-readiness surface violations', result.releaseReadinessSurface.violations, formatFindingLine);
  console.log('');
  printSection('undocumented service deep imports', result.undocumentedServiceDeepImports, formatFindingLine);
  console.log('');
  printSection('unresolved merge markers', result.unresolvedMergeMarkers, formatFindingLine);
  console.log('');
  printSection('restored service duplicate policy violations', result.restoredServiceDuplicatePolicyViolations, formatPolicyViolationLine);
  console.log('');
  printSection('legacy compatibility shims', result.legacyCompatibilityShims, formatPathLine);
  console.log('');
  printSection('legacy root import specifiers', result.legacyRootImportSpecifiers, formatFindingLine);
  console.log('');
  printSection('service duplicate basenames', result.serviceDuplicateBasenameDetails, formatDuplicateBasenameLine);
  console.log('');
  printSection('legacy sprint service files', result.legacySprintServiceFiles, formatPathLine);
  console.log('');
  printSection('root service implementation violations', result.rootServiceImplementationViolations, formatFindingLine);
}

function writeJson(relativeOrAbsolutePath, result) {
  const outputPath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : abs(relativeOrAbsolutePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
}

function markdownTableRow(cells) {
  return `| ${cells.map((cell) => String(cell).replace(/\n/g, '<br>')).join(' | ')} |`;
}

function formatCountMap(counts) {
  return Object.entries(counts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => `${name}: ${count}`)
    .join(', ');
}

function writeRestoredServiceDuplicateInventoryMarkdown(relativeOrAbsolutePath, inventory) {
  const outputPath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : abs(relativeOrAbsolutePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const lines = [
    '# Restored Service Duplicate Inventory',
    '',
    `Task: ${inventory.taskId}`,
    '',
    'This report inventories every executable source file under `src/services` and independently classifies basename, normalized-content, and behavioral-equivalence collisions.',
    'Index basenames are reported through the per-file ledger and index classification. Broad exemptions are not allowed; every collision has exact paths, fingerprints, ownership, evidence, and a concrete disposition.',
    '',
    '## Summary',
    '',
    markdownTableRow(['Metric', 'Value']),
    markdownTableRow(['---', '---']),
    markdownTableRow(['Duplicate basenames', inventory.summary.duplicateBasenames]),
    markdownTableRow(['Unapproved duplicate basenames', inventory.summary.unapprovedDuplicateBasenames]),
    markdownTableRow(['Duplicate paths', inventory.summary.duplicatePaths]),
    markdownTableRow(['Restored root files after Phase 16 cleanup', inventory.summary.restoredRootFilesAfterPhase16Cleanup]),
    markdownTableRow(['Duplicate basenames with restored root copies', inventory.summary.duplicateBasenamesWithRestoredRootCopies]),
    markdownTableRow(['Duplicate basenames without restored root copies', inventory.summary.duplicateBasenamesWithoutRestoredRootCopies]),
    markdownTableRow(['Disposition counts', formatCountMap(inventory.summary.dispositionCounts)]),
    markdownTableRow(['Runtime classifications', formatCountMap(inventory.summary.runtimeClassificationCounts)]),
    markdownTableRow(['Browser classifications', formatCountMap(inventory.summary.browserClassificationCounts)]),
    markdownTableRow(['Restored duplicate policy violations', inventory.summary.restoredServiceDuplicatePolicyViolations]),
    markdownTableRow(['Approved index barrels', inventory.summary.approvedIndexBarrels]),
    markdownTableRow(['Index implementation entrypoints', inventory.summary.indexImplementationEntrypoints]),
    markdownTableRow(['Index shadow copies', inventory.summary.indexShadowCopies]),
    markdownTableRow(['Duplicate content hashes', inventory.summary.duplicateContentHashes]),
    markdownTableRow(['Unapproved duplicate content hashes', inventory.summary.unapprovedDuplicateContentHashes]),
    markdownTableRow(['Executable service files', inventory.summary.executableServiceFiles]),
    markdownTableRow(['All basename collision groups', inventory.summary.basenameCollisions]),
    markdownTableRow(['Module-scoped index basename groups', inventory.summary.indexEntrypointBasenameCollisions]),
    markdownTableRow(['Unclassified basename collisions', inventory.summary.unclassifiedBasenameCollisions]),
    markdownTableRow(['Normalized-content collisions', inventory.summary.normalizedContentCollisions]),
    markdownTableRow(['Unclassified normalized-content collisions', inventory.summary.unclassifiedNormalizedContentCollisions]),
    markdownTableRow(['Behavioral-equivalence groups', inventory.summary.behavioralEquivalenceGroups]),
    markdownTableRow(['Unclassified behavioral-equivalence groups', inventory.summary.unclassifiedBehavioralEquivalenceGroups]),
    markdownTableRow(['Total import specifiers targeting duplicate paths', inventory.summary.totalImporters]),
    markdownTableRow(['Unique importer files', inventory.summary.uniqueImporterFiles]),
    '',
    '## Policy',
    '',
    markdownTableRow(['Policy', 'Value']),
    markdownTableRow(['---', '---']),
    markdownTableRow(['Ignore index basenames', inventory.policy.indexBasenamesIgnored]),
    markdownTableRow(['Broad exemptions allowed', inventory.policy.broadExemptionsAllowed]),
    markdownTableRow(['Non-index basename duplicates fail by default', inventory.policy.nonIndexBasenameDuplicatesAreFailuresByDefault]),
    markdownTableRow(['Exact approved index entrypoints', inventory.policy.approvedIndexEntrypoints.length]),
    markdownTableRow(['Approved multi-entrypoints', inventory.policy.approvedMultiEntrypoints.length]),
    markdownTableRow(['Approved content hashes', inventory.policy.approvedContentHashes.length]),
    markdownTableRow(['Exact classified collisions', inventory.policy.classifiedCollisions.length]),
    markdownTableRow(['Policy violations', inventory.policy.policyViolations.length]),
  ];

  if (inventory.policy.policyViolations.length > 0) {
    lines.push('', 'Policy violations:', '');
    for (const item of inventory.policy.policyViolations) {
      const target = item.path ? ` \`${item.path}\`` : '';
      lines.push(`- \`${item.policy}\`${target}: ${item.reason}`);
    }
  }

  lines.push(
    '',
    '## Executable Service File Ledger',
    '',
    markdownTableRow(['Path', 'Declared owner', 'Canonical owner', 'Runtime', 'Disposition', 'Importers', 'Public entrypoints', 'Raw SHA-256', 'Normalized SHA-256', 'Behavior SHA-256', 'Collisions']),
    markdownTableRow(['---', '---', '---', '---', '---', '---', '---', '---', '---', '---', '---']),
  );
  for (const item of inventory.serviceFiles) {
    lines.push(markdownTableRow([
      `\`${item.path}\``,
      `\`${item.declaredOwner.module}\` (${item.declaredOwner.owner ?? 'unowned'})`,
      `\`${item.canonicalOwner.module}\` (${item.canonicalOwner.owner ?? 'unowned'})`,
      `\`${item.runtimeClass}\``,
      `\`${item.disposition}\``,
      item.importerCount,
      item.publicEntrypoints.map((entry) => `\`${entry.kind}:${entry.name}\``).join('<br>') || 'none',
      `\`${item.contentHash.value}\``,
      `\`${item.normalizedContentHash.value}\``,
      `\`${item.behaviorHash.value}\``,
      item.collisionIds.map((id) => `\`${id}\``).join('<br>') || 'none',
    ]));
  }

  for (const [heading, groups] of [
    ['Normalized Content Collisions', inventory.normalizedContentCollisions],
    ['Behavioral Equivalence Groups', inventory.behavioralEquivalenceGroups],
  ]) {
    lines.push(
      '',
      `## ${heading}`,
      '',
      markdownTableRow(['Fingerprint', 'Canonical path', 'Canonical owner', 'Disposition', 'Classified', 'Paths', 'Reason']),
      markdownTableRow(['---', '---', '---', '---', '---', '---', '---']),
    );
    for (const group of groups) {
      lines.push(markdownTableRow([
        `\`${group.fingerprint.value}\``,
        `\`${group.canonicalPath}\``,
        `\`${group.canonicalModuleOwner.module}\``,
        `\`${group.disposition}\``,
        group.classified ? 'yes' : 'no',
        group.paths.map((item) => `\`${item}\``).join('<br>'),
        group.reason,
      ]));
    }
  }

  lines.push(
    '',
    '## Basename Collisions',
    '',
    markdownTableRow(['Basename', 'Class', 'Canonical path', 'Disposition', 'Classified', 'Paths', 'Regression tests']),
    markdownTableRow(['---', '---', '---', '---', '---', '---', '---']),
  );
  for (const group of inventory.basenameCollisions) {
    lines.push(markdownTableRow([
      `\`${group.basename}\``,
      `\`${group.kind}\``,
      `\`${group.canonicalPath}\``,
      `\`${group.disposition}\``,
      group.classified ? 'yes' : 'no',
      group.paths.map((item) => `\`${item.path}\` (${item.canonicalOwner.module}; ${item.publicContract})`).join('<br>'),
      group.regressionTests.map((item) => `\`${item}\``).join('<br>') || 'none',
    ]));
  }

  lines.push(
    '',
    '## Restored Root Files',
    '',
    markdownTableRow(['Path', 'Basename', 'Canonical path', 'Canonical owner', 'Disposition', 'Runtime', 'Browser classification', 'Importers', 'SHA-256']),
    markdownTableRow(['---', '---', '---', '---', '---', '---', '---', '---', '---']),
  );

  for (const item of inventory.restoredRootFiles) {
    lines.push(markdownTableRow([
      `\`${item.path}\``,
      `\`${item.basename}\``,
      `\`${item.canonicalPath}\``,
      `\`${item.canonicalModuleOwner.module}\``,
      `\`${item.disposition}\``,
      `\`${item.runtimeClassification}\``,
      `\`${item.browserClassification}\``,
      item.importerCount,
      `\`${item.sha256}\``,
    ]));
  }

  lines.push(
    '',
    '## Service Index Classification',
    '',
    markdownTableRow(['Path', 'Classification', 'Module', 'Runtime', 'Browser classification', 'SHA-256', 'Reason']),
    markdownTableRow(['---', '---', '---', '---', '---', '---', '---']),
  );

  for (const item of [
    ...inventory.serviceIndexClassifications.approvedIndexBarrels,
    ...inventory.serviceIndexClassifications.indexImplementationEntrypoints,
    ...inventory.serviceIndexClassifications.indexShadowCopies,
  ]) {
    lines.push(markdownTableRow([
      `\`${item.path}\``,
      `\`${item.contentKind}\``,
      `\`${item.module}\``,
      `\`${item.runtimeClassification}\``,
      `\`${item.browserClassification}\``,
      `\`${item.sha256}\``,
      item.reason,
    ]));
  }

  lines.push(
    '',
    '## Duplicate Content Hashes',
    '',
    markdownTableRow(['SHA-256', 'Canonical path', 'Canonical owner', 'Restored root copies', 'Disposition', 'Paths']),
    markdownTableRow(['---', '---', '---', '---', '---', '---']),
  );

  for (const entry of inventory.duplicateContentHashes) {
    lines.push(markdownTableRow([
      `\`${entry.sha256}\``,
      `\`${entry.canonicalPath}\``,
      `\`${entry.canonicalModuleOwner.module}\``,
      entry.restoredRootCopies.map((item) => `\`${item}\``).join('<br>') || 'none',
      `\`${entry.disposition}\``,
      entry.paths.map((item) => `\`${item.path}\` (${item.module}, ${item.contentKind})`).join('<br>'),
    ]));
  }

  lines.push('', '## Duplicate Basenames', '');

  for (const entry of inventory.duplicates) {
    lines.push(
      `### ${entry.basename}`,
      '',
      `Disposition: \`${entry.disposition}\``,
      '',
      `Approved multi-entrypoint: ${entry.approvedMultiEntrypoint ? 'yes' : 'no'}`,
      '',
      `Canonical path: \`${entry.canonicalPath}\``,
      '',
      `Canonical module owner: \`${entry.canonicalModuleOwner.module}\` (${entry.canonicalModuleOwner.owner ?? 'unowned'}), runtime \`${entry.canonicalModuleOwner.runtimeClassification}\`, browser classification \`${entry.canonicalModuleOwner.browserClassification}\`.`,
      '',
      `Duplicate classification: runtime \`${entry.runtimeClassification}\`, browser \`${entry.browserClassification}\`; import specifiers targeting this basename: ${entry.importerCount}.`,
      '',
      `Path runtime classifications: ${formatCountMap(entry.runtimeClassificationCounts)}.`,
      '',
      `Path browser classifications: ${formatCountMap(entry.browserClassificationCounts)}.`,
      '',
      markdownTableRow(['Path', 'Canonical', 'Disposition', 'Restored root copy', 'Module', 'Canonical owner', 'Runtime', 'Browser classification', 'Importers', 'SHA-256']),
      markdownTableRow(['---', '---', '---', '---', '---', '---', '---', '---', '---', '---']),
    );
    for (const item of entry.paths) {
      lines.push(markdownTableRow([
        `\`${item.path}\``,
        item.canonical ? 'yes' : 'no',
        `\`${item.disposition}\``,
        item.restoredRootCopy ? 'yes' : 'no',
        `\`${item.module}\``,
        `\`${item.canonicalModuleOwner.module}\``,
        `\`${item.runtimeClassification}\``,
        `\`${item.browserClassification}\``,
        item.importerCount,
        `\`${item.sha256}\``,
      ]));
    }

    const importers = entry.paths.flatMap((item) => (
      item.importers.map((importer) => ({ ...importer, target: item.path }))
    ));
    if (importers.length > 0) {
      lines.push('', 'Importers:', '');
      for (const importer of importers) {
        lines.push(`- \`${importer.file}:${importer.line}\` -> \`${importer.target}\` (${importer.kind} \`${importer.specifier}\`)`);
      }
    } else {
      lines.push('', 'Importers: none');
    }
    lines.push('');
  }

  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
}

function writeServiceModulePublicApiMarkdown(relativeOrAbsolutePath, manifest) {
  const outputPath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : abs(relativeOrAbsolutePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const serviceModules = Object.entries(manifest.modules)
    .filter(([name]) => name === 'services' || name.startsWith('service-'))
    .sort(([left], [right]) => left.localeCompare(right));
  const migrations = [...(manifest.audit?.servicePublicApiMigrations ?? [])]
    .sort((left, right) => left.legacyPath.localeCompare(right.legacyPath));
  const packageJson = fs.existsSync(abs('package.json'))
    ? readJson('package.json')
    : { name: 'fixture', exports: {} };
  const packageEntrypoints = Object.entries(packageJson.exports ?? {})
    .filter(([name]) => ['./logic-language', './deontic-nlp', './proof-engine', './provers'].includes(name))
    .sort(([left], [right]) => left.localeCompare(right));

  const lines = [
    '# Service Module Public API',
    '',
    `Generated from \`src/module-ownership.json\` manifest \`${manifest.manifestVersion}\` by \`npm run services:audit\`.`,
    '',
    'Service implementations have exactly one owning family. Cross-family consumers must import a declared public entrypoint, and compatibility is limited to export-only barrels: a removed shadow must never be replaced with executable forwarding code.',
    '',
    '## Family Summary',
    '',
    markdownTableRow(['Family', 'Owner', 'Runtime', 'Browser-safe entrypoint', 'Public entrypoints']),
    markdownTableRow(['---', '---', '---', '---', '---']),
  ];

  for (const [name, definition] of serviceModules) {
    lines.push(markdownTableRow([
      `\`${name}\``,
      definition.owner ?? 'unowned',
      `\`${definition.runtimeClassification ?? 'unknown'}\``,
      definition.browserSafeEntrypoint ? `\`${definition.browserSafeEntrypoint}\`` : 'none',
      (definition.publicEntrypoints ?? []).length,
    ]));
  }

  lines.push('', '## Canonical Family APIs', '');
  for (const [name, definition] of serviceModules) {
    lines.push(
      `### ${name}`,
      '',
      `Owner: ${definition.owner ?? 'unowned'}. Runtime: \`${definition.runtimeClassification ?? 'unknown'}\`.`,
      '',
      'Public entrypoints:',
      '',
    );
    for (const entrypoint of definition.publicEntrypoints ?? []) {
      lines.push(`- \`${entrypoint}\``);
    }
    if ((definition.publicEntrypoints ?? []).length === 0) lines.push('- None; this is an ownership aggregate only.');
    lines.push('', 'Private implementation patterns (declared public entrypoints are excluded):', '');
    for (const privatePath of definition.privateImplementationPaths ?? []) {
      lines.push(`- \`${privatePath}\``);
    }
    if ((definition.privateImplementationPaths ?? []).length === 0) lines.push('- None declared.');
    lines.push('');
  }

  lines.push(
    '## Migration Paths',
    '',
    'The legacy files below were executable shadow copies and are deleted. Import the public family API shown; no compatibility implementation remains at the old path.',
    '',
    markdownTableRow(['Removed legacy path', 'Canonical implementation', 'Public family API', 'Compatibility']),
    markdownTableRow(['---', '---', '---', '---']),
  );
  for (const migration of migrations) {
    lines.push(markdownTableRow([
      `\`${migration.legacyPath}\``,
      `\`${migration.canonicalImplementation}\``,
      `\`${migration.publicEntrypoint}\``,
      migration.compatibility,
    ]));
  }

  lines.push(
    '',
    '## Package Subpath Migrations',
    '',
    markdownTableRow(['Package subpath', 'Browser target', 'Import/default target']),
    markdownTableRow(['---', '---', '---']),
  );
  for (const [name, definition] of packageEntrypoints) {
    const browserTarget = typeof definition === 'string'
      ? definition
      : definition.browser ?? definition.import ?? definition.default;
    const hostTarget = typeof definition === 'string'
      ? definition
      : definition.import ?? definition.default ?? definition.browser;
    lines.push(markdownTableRow([
      `\`${packageJson.name}${name.slice(1)}\``,
      `\`${browserTarget}\``,
      `\`${hostTarget}\``,
    ]));
  }

  lines.push(
    '',
    '## Behavioral Reconciliation',
    '',
    '- Deontic conflict reports use conflict entity membership, so one detected conflict is reported for every entity it names.',
    '- FOL NLP extraction keeps the Python-shaped predicate/statistics contract and the richer unary, binary, ternary, and semantic-role classification in one implementation; `normalisePredicate` retains lower snake-case behavior while `normalizePredicate` retains formula-symbol casing.',
    '- Logic API remainder helpers now live as executable canonical code in the logic API family instead of forwarding to a deleted root shadow.',
    '- `proof-engine-browser.ts` and `provers-browser.ts` are browser-specific runtime implementations, not index shadows. The browser proof facade delegates to a worker verifier, and the bounded prover executes its TypeScript truth-table runtime.',
    '- The proof-engine index resolves legacy star-export collisions explicitly: `ProofCache` is the persistent cache, `ExecutionProofCache` is the execution-local cache, `ProofResult` is the canonical result class, and `UtilityProofResult` is the lightweight utility result shape.',
    '- Cross-family proof-engine consumers import `src/services/proof-engine/index.ts`; runtime package consumers select `proof-engine-browser.ts` or `proof-engine-host.ts` through package export conditions.',
    '',
    '## Compatibility Barrels',
    '',
    'The canonical convenience entrypoints `src/services/apps/index.ts` and `src/services/logic/deontic/browser-nlp.ts` contain exports only. Other approved service `index.ts` files are classified individually by the duplicate inventory; executable index entrypoints remain implementations only when explicitly declared by policy.',
  );

  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
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
  const restoredInventoryJsonPath = args.restoredServiceDuplicateInventoryJson
    ?? (args.json ? DEFAULT_RESTORED_SERVICE_DUPLICATE_INVENTORY_JSON : null);
  const restoredInventoryMarkdownPath = args.restoredServiceDuplicateInventoryMarkdown
    ?? (args.json ? DEFAULT_RESTORED_SERVICE_DUPLICATE_INVENTORY_MARKDOWN : null);
  if (restoredInventoryJsonPath) {
    writeJson(restoredInventoryJsonPath, result.restoredServiceDuplicateInventory);
  }
  if (restoredInventoryMarkdownPath) {
    writeRestoredServiceDuplicateInventoryMarkdown(
      restoredInventoryMarkdownPath,
      result.restoredServiceDuplicateInventory,
    );
  }
  if (args.json) {
    writeServiceModulePublicApiMarkdown(DEFAULT_SERVICE_MODULE_PUBLIC_API_MARKDOWN, manifest);
  }

  const failures = [];
  if (args.failOnUnknown && result.summary.unknownFiles > 0) failures.push('unknown files');
  if (args.failOnUnknown && result.summary.ownershipConflicts > 0) failures.push('ownership conflicts');
  if (args.failOnForbidden && result.summary.forbiddenImports > 0) failures.push('forbidden imports');
  if (args.failOnForbidden && result.summary.browserUnsafeImports > 0) failures.push('browser unsafe imports');
  if (
    args.failOnForbidden
    && result.summary.browserEntrypointPolicyViolations > 0
  ) failures.push('browser entrypoint policy violations');
  if (
    args.failOnForbidden
    && result.summary.releaseReadinessSurfaceViolations > 0
  ) failures.push('release-readiness surface violations');
  if (
    args.failOnForbidden
    && result.summary.undocumentedServiceDeepImports > 0
  ) failures.push('undocumented service deep imports');
  if (args.failOnRootDebt && result.summary.rootFiles > 0) failures.push('root files');
  if (
    args.failOnLegacy
    && (
      result.summary.legacyCompatibilityShims > 0
      || result.summary.legacyRootImportSpecifiers > 0
      || result.summary.unapprovedServiceDuplicateBasenames > 0
      || result.summary.unapprovedServiceDuplicateContentHashes > 0
      || result.summary.unclassifiedServiceBasenameCollisions > 0
      || result.summary.unclassifiedServiceNormalizedContentCollisions > 0
      || result.summary.unclassifiedServiceBehavioralEquivalenceGroups > 0
      || result.summary.serviceIndexShadowCopies > 0
      || result.summary.rootServiceImplementationViolations > 0
      || result.summary.restoredServiceDuplicatePolicyViolations > 0
      || result.summary.legacySprintServiceFiles > 0
      || result.summary.unresolvedMergeMarkers > 0
    )
  ) {
    failures.push('legacy compatibility shims/imports or duplicate/sprint services');
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
