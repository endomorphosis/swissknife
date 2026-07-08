#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, 'docs/service-source-audit.json');
const DOC_PATH = path.join(ROOT, 'docs/service-source-audit.md');
const SERVICE_ROOT = path.join(ROOT, 'src/services');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;
const FORBIDDEN_TARGETS = [
  { prefix: 'src/cli/', reason: 'service modules must not import CLI command modules' },
  { prefix: 'src/entrypoints/', reason: 'service modules must not import executable entrypoints' },
  { prefix: 'src/components/', reason: 'service modules must not import React terminal components' },
  { prefix: 'src/screens/', reason: 'service modules must not import screen-level UI modules' },
];

function parseArgs(argv) {
  return {
    failOnForbidden: argv.includes('--fail-on-forbidden'),
  };
}

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
  }
  return files.sort();
}

function importSpecifiers(source) {
  const specs = [];
  let match;
  while ((match = IMPORT_RE.exec(source)) !== null) {
    specs.push(match[1] ?? match[2] ?? match[3]);
  }
  return specs;
}

function resolveImport(importer, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null;
  const base = specifier.startsWith('@/')
    ? path.join(ROOT, 'src', specifier.slice(2))
    : path.resolve(path.dirname(importer), specifier);
  const candidates = [
    base,
    ...Array.from(SOURCE_EXTENSIONS, ext => `${base}${ext}`),
    ...Array.from(SOURCE_EXTENSIONS, ext => path.join(base, `index${ext}`)),
  ];
  return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = walk(SERVICE_ROOT);
  const forbiddenImports = [];
  const outboundByTarget = {};

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const importer = toPosix(path.relative(ROOT, file));
    for (const specifier of importSpecifiers(source)) {
      const resolved = resolveImport(file, specifier);
      if (!resolved) continue;
      const relative = toPosix(path.relative(ROOT, resolved));
      const topLevel = relative.split('/').slice(0, 2).join('/');
      outboundByTarget[topLevel] = (outboundByTarget[topLevel] ?? 0) + 1;
      const forbidden = FORBIDDEN_TARGETS.find(target => relative.startsWith(target.prefix));
      if (forbidden) {
        forbiddenImports.push({
          importer,
          specifier,
          resolved: relative,
          reason: forbidden.reason,
        });
      }
    }
  }

  const report = {
    schema: 'swissknife.service_source_audit.v1',
    generatedAt: new Date().toISOString(),
    ok: forbiddenImports.length === 0,
    summary: {
      serviceFileCount: files.length,
      forbiddenImportCount: forbiddenImports.length,
      outboundImportTargets: outboundByTarget,
    },
    forbiddenImports,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(
    DOC_PATH,
    [
      '# SwissKnife Service Source Audit',
      '',
      `Generated: ${report.generatedAt}`,
      '',
      `Status: ${report.ok ? 'pass' : 'fail'}`,
      '',
      `Audited service files: ${files.length}`,
      `Forbidden service imports: ${forbiddenImports.length}`,
      '',
      forbiddenImports.length
        ? '| Importer | Specifier | Resolved | Reason |\n| --- | --- | --- | --- |\n' +
          forbiddenImports
            .map(item => `| ${item.importer} | ${item.specifier} | ${item.resolved} | ${item.reason} |`)
            .join('\n')
        : 'No forbidden service imports were found.',
      '',
    ].join('\n'),
  );

  console.log(`Service source audit: ${report.ok ? 'pass' : 'fail'}`);
  console.log(`Audited ${files.length} service files.`);
  console.log(`Wrote ${toPosix(path.relative(ROOT, REPORT_PATH))}`);
  console.log(`Wrote ${toPosix(path.relative(ROOT, DOC_PATH))}`);

  if (args.failOnForbidden && forbiddenImports.length > 0) {
    process.exit(1);
  }
}

main();
