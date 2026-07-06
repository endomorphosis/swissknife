#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'src/services/module-ownership.json');
const args = new Set(process.argv.slice(2));
const jsonOutput = args.has('--json');
const failOnUnknown = args.has('--fail-on-unknown');
const failOnForbidden = args.has('--fail-on-forbidden');
const failOnRootDebt = args.has('--fail-on-root-debt');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx|js|jsx|json)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    const next = glob[i + 1];
    if (ch === '*' && next === '*') {
      re += '.*';
      i += 1;
    } else if (ch === '*') {
      re += '[^/]*';
    } else if ('\\^$+?.()|{}[]'.includes(ch)) {
      re += `\\${ch}`;
    } else {
      re += ch;
    }
  }
  return new RegExp(`^${re}$`);
}

function normalizePath(file) {
  return file.split(path.sep).join('/');
}

function compileRules(rules) {
  return rules.map((rule) => ({
    ...rule,
    regexp: globToRegExp(rule.pattern),
  }));
}

function compileExclusions(manifest) {
  const files = new Set((manifest.excludedFiles ?? []).map(normalizePath));
  const patterns = (manifest.excludedPatterns ?? []).map((pattern) => globToRegExp(normalizePath(pattern)));
  return { files, patterns };
}

function isExcluded(relPath, exclusions) {
  const normalized = normalizePath(relPath);
  return exclusions.files.has(normalized) || exclusions.patterns.some((regexp) => regexp.test(normalized));
}

function classify(relPath, rules) {
  const normalized = normalizePath(relPath);
  for (const rule of rules) {
    if (rule.regexp.test(normalized)) {
      return {
        module: rule.module,
        rule: rule.pattern,
        legacyRoot: Boolean(rule.legacyRoot),
        legacyPath: Boolean(rule.legacyPath),
      };
    }
  }
  return {
    module: 'unknown',
    rule: null,
    legacyRoot: false,
    legacyPath: false,
  };
}

function resolveImport(sourceAbs, specifier) {
  if (!specifier.startsWith('.')) return null;
  const sourceDir = path.dirname(sourceAbs);
  const base = path.resolve(sourceDir, specifier);
  const candidates = [
    base,
    base.replace(/\.js$/, '.ts'),
    base.replace(/\.js$/, '.tsx'),
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function extractImports(source) {
  const imports = [];
  const staticRe = /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const re of [staticRe, dynamicRe]) {
    let match;
    while ((match = re.exec(source)) !== null) imports.push(match[1]);
  }
  return imports;
}

function moduleAllows(manifest, sourceModule, targetModule) {
  if (sourceModule === targetModule) return true;
  if (sourceModule === 'unknown' || targetModule === 'unknown') return false;
  const allowed = manifest.modules[sourceModule]?.allowedImports ?? [];
  return allowed.includes(targetModule);
}

function formatCounts(counts) {
  return Object.fromEntries([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

const manifest = readJson(manifestPath);
const rules = compileRules(manifest.pathRules ?? []);
const exclusions = compileExclusions(manifest);
const serviceRoot = path.join(repoRoot, manifest.sourceRoot);
const files = walk(serviceRoot).filter((abs) => !isExcluded(path.relative(repoRoot, abs), exclusions));
const fileRecords = [];
const moduleCounts = new Map();
const unknownFiles = [];
const rootFiles = [];
const rootCompatibilityShimFiles = [];
const legacyRootFiles = [];
const legacyPathFiles = [];

function isRootCompatibilityShim(record, source) {
  if (record.relToService.includes('/')) return false;
  if (!/\.(ts|tsx|js|jsx)$/.test(record.path)) return false;
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return false;
  return lines.every((line) => /^export (?:\*|\{[^}]+\}) from ['"]\.\/[^'"]+['"];?$/.test(line));
}

for (const abs of files) {
  const rel = normalizePath(path.relative(repoRoot, abs));
  const relToService = normalizePath(path.relative(serviceRoot, abs));
  const classification = classify(rel, rules);
  const record = { path: rel, relToService, ...classification };
  fileRecords.push(record);
  moduleCounts.set(record.module, (moduleCounts.get(record.module) ?? 0) + 1);
  if (record.module === 'unknown') unknownFiles.push(record.path);
  if (!record.relToService.includes('/')) rootFiles.push(record.path);
  if (isRootCompatibilityShim(record, fs.readFileSync(abs, 'utf8'))) rootCompatibilityShimFiles.push(record.path);
  if (record.legacyRoot) legacyRootFiles.push(record.path);
  if (record.legacyPath) legacyPathFiles.push(record.path);
}

const forbiddenImports = [];
const importEdges = [];
const byPath = new Map(fileRecords.map((record) => [record.path, record]));

for (const record of fileRecords) {
  if (!/\.(ts|tsx|js|jsx)$/.test(record.path)) continue;
  const abs = path.join(repoRoot, record.path);
  const source = fs.readFileSync(abs, 'utf8');
  for (const specifier of extractImports(source)) {
    const targetAbs = resolveImport(abs, specifier);
    if (!targetAbs) continue;
    const targetRel = normalizePath(path.relative(repoRoot, targetAbs));
    if (!targetRel.startsWith(`${manifest.sourceRoot}/`)) continue;
    const target = byPath.get(targetRel) ?? { module: classify(targetRel, rules).module, path: targetRel };
    const edge = {
      from: record.path,
      to: target.path,
      sourceModule: record.module,
      targetModule: target.module,
      specifier,
    };
    importEdges.push(edge);
    if (!moduleAllows(manifest, edge.sourceModule, edge.targetModule)) forbiddenImports.push(edge);
  }
}

const summary = {
  schemaVersion: manifest.schemaVersion,
  serviceFiles: fileRecords.length,
  rootFiles: rootFiles.length,
  rootCompatibilityShims: rootCompatibilityShimFiles.length,
  rootImplementationFiles: rootFiles.length - rootCompatibilityShimFiles.length,
  legacyRootFiles: legacyRootFiles.length,
  legacyPathFiles: legacyPathFiles.length,
  unknownFiles: unknownFiles.length,
  importEdges: importEdges.length,
  forbiddenImports: forbiddenImports.length,
  moduleCounts: formatCounts(moduleCounts),
  migrationTargets: manifest.migrationTargets,
};

const report = {
  summary,
  unknownFiles,
  rootFiles,
  rootCompatibilityShimFiles,
  legacyRootFiles,
  legacyPathFiles,
  forbiddenImports,
};

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('Services module audit');
  console.log(`  service files: ${summary.serviceFiles}`);
  console.log(`  root files: ${summary.rootFiles}`);
  console.log(`  root compatibility shims: ${summary.rootCompatibilityShims}`);
  console.log(`  root implementation files: ${summary.rootImplementationFiles}`);
  console.log(`  legacy root files: ${summary.legacyRootFiles}`);
  console.log(`  legacy path files: ${summary.legacyPathFiles}`);
  console.log(`  unknown files: ${summary.unknownFiles}`);
  console.log(`  import edges: ${summary.importEdges}`);
  console.log(`  forbidden imports: ${summary.forbiddenImports}`);
  console.log('');
  console.log('Files by module:');
  for (const [moduleId, count] of Object.entries(summary.moduleCounts)) {
    console.log(`  ${moduleId.padEnd(16)} ${count}`);
  }
  if (unknownFiles.length) {
    console.log('');
    console.log('Unknown files:');
    for (const file of unknownFiles.slice(0, 40)) console.log(`  ${file}`);
    if (unknownFiles.length > 40) console.log(`  ... ${unknownFiles.length - 40} more`);
  }
  if (forbiddenImports.length) {
    console.log('');
    console.log('Forbidden import samples:');
    for (const edge of forbiddenImports.slice(0, 40)) {
      console.log(`  ${edge.from} (${edge.sourceModule}) -> ${edge.to} (${edge.targetModule})`);
    }
    if (forbiddenImports.length > 40) console.log(`  ... ${forbiddenImports.length - 40} more`);
  }
}

let failed = false;
if (failOnUnknown && unknownFiles.length) failed = true;
if (failOnForbidden && forbiddenImports.length) failed = true;
if (failOnRootDebt && rootFiles.length > (manifest.migrationTargets?.maxRootFilesFinal ?? 20)) failed = true;

process.exitCode = failed ? 1 : 0;
