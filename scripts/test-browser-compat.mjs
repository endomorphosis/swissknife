#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, 'docs/browser-compatibility-report.json');
const WEB_SOURCE_ROOTS = ['web/js', 'web/css'];
const REQUIRED_FILES = [
  'web/index.html',
  'web/js/main-simple.js',
  'web/js/core/swissknife-core.js',
  'vite.web.config.ts',
  'web/tsconfig.json',
];
const REQUIRED_APPS = [
  'terminal',
  'ai-chat',
  'file-manager',
  'task-manager',
  'model-browser',
  'ipfs-explorer',
  'mcp-control',
  'p2p-network',
  'p2p-chat-unified',
];
const HOST_ONLY_PATTERNS = [
  /\bfrom\s+['"]node:(?:fs|child_process|net|tls|worker_threads|module)['"]/,
  /\brequire\(\s*['"](?:fs|child_process|net|tls|worker_threads|module)['"]\s*\)/,
  /\bprocess\.(?:cwd|exit|kill|chdir)\s*\(/,
  /\b__dirname\b/,
  /\b__filename\b/,
];
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.html', '.ts', '.tsx']);

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function walk(dir) {
  const absolute = path.join(ROOT, dir);
  if (!fs.existsSync(absolute)) return [];
  const entries = fs.readdirSync(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(absolute, entry.name);
    if (entry.isDirectory()) files.push(...walk(toPosix(path.relative(ROOT, full))));
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
  }
  return files.sort();
}

function check(name, passed, detail) {
  return { name, passed, detail };
}

function main() {
  const checks = [];

  for (const file of REQUIRED_FILES) {
    checks.push(check(`required file: ${file}`, fs.existsSync(path.join(ROOT, file)), file));
  }

  const indexPath = path.join(ROOT, 'web/index.html');
  const index = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
  checks.push(check('index has viewport meta', /<meta\s+name=["']viewport["']/i.test(index), 'web/index.html'));
  checks.push(
    check(
      'index loads browser module entry',
      /<script[^>]+type=["']module["'][^>]+src=["']\/js\/main-simple\.js["']/i.test(index),
      'web/index.html -> /js/main-simple.js',
    ),
  );

  for (const app of REQUIRED_APPS) {
    checks.push(check(`desktop app registered: ${app}`, index.includes(`data-app="${app}"`), `data-app="${app}"`));
  }

  const viteConfig = fs.existsSync(path.join(ROOT, 'vite.web.config.ts'))
    ? fs.readFileSync(path.join(ROOT, 'vite.web.config.ts'), 'utf8')
    : '';
  checks.push(check('vite web base is relative', /base:\s*['"]\.\/['"]/.test(viteConfig), 'base: ./'));
  checks.push(check('vite web target is es2020', /target:\s*['"]es2020['"]/.test(viteConfig), 'target: es2020'));
  checks.push(check('vite web aliases browser polyfills', /crypto-browserify/.test(viteConfig), 'crypto-browserify alias'));

  const hostOnlyMatches = [];
  for (const file of WEB_SOURCE_ROOTS.flatMap(walk)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of HOST_ONLY_PATTERNS) {
      if (pattern.test(source)) {
        hostOnlyMatches.push({
          file: toPosix(path.relative(ROOT, file)),
          pattern: String(pattern),
        });
      }
    }
  }
  checks.push(
    check(
      'web source excludes host-only node APIs',
      hostOnlyMatches.length === 0,
      hostOnlyMatches.length ? `${hostOnlyMatches.length} host-only matches` : 'no host-only matches',
    ),
  );

  const report = {
    schema: 'swissknife.browser_compatibility_check.v1',
    generatedAt: new Date().toISOString(),
    ok: checks.every(item => item.passed),
    summary: {
      checkCount: checks.length,
      passCount: checks.filter(item => item.passed).length,
      failCount: checks.filter(item => !item.passed).length,
      hostOnlyMatchCount: hostOnlyMatches.length,
    },
    checks,
    hostOnlyMatches,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  for (const item of checks) {
    console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}`);
  }
  console.log(`Wrote ${toPosix(path.relative(ROOT, REPORT_PATH))}`);

  if (!report.ok) process.exit(1);
}

main();
