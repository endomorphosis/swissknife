// test/browser-compat/audit-browser-compat-scanner.test.js
//
// SWR-042 / SWR-036-FU-001 / SWR-036-FU-004: regression coverage for the
// `import()` scanner in `scripts/audit-browser-compat.mjs`. Before SWR-042,
// the scanner used a single greedy regex
// (`/\bimport\s*\(\s*([^"'`\s][^)]+)\)/g`) to detect non-literal dynamic
// imports. That regex had two classes of false positives:
//
//   1. Prose in comments/docstrings that merely *mentions* `import()` or
//      `import(<expr>)` syntax could match and then run on across
//      unrelated code until the next stray `)` character, sometimes many
//      lines away (see `web/src/apps/app-manifest-loader.ts`,
//      `src/services/apps/app-manifest.ts`).
//   2. Method/property calls literally named `import` (e.g.
//      `this.swissknife.models.import(...)`) were indistinguishable from
//      the `import()` expression keyword (see
//      `web/js/apps/model-browser.js`).
//
// `findNonLiteralDynamicImportLines` (and the related `side-effect-import`
// regex fix) replaced that single regex with logic that is immune to both
// false-positive classes while still reporting genuine non-literal dynamic
// imports (computed specifiers, CDN/NPM loader patterns, etc.).

const path = require('node:path');

const scannerModulePath = path.resolve(__dirname, '../../../scripts/audit-browser-compat.mjs');

describe('audit-browser-compat.mjs non-literal dynamic import scanner', () => {
  let findNonLiteralDynamicImportLines;
  let extractImports;

  beforeAll(async () => {
    ({ findNonLiteralDynamicImportLines, extractImports } = await import(scannerModulePath));
  });

  test('does not flag a genuine non-literal dynamic import (real positive)', () => {
    const text = "async function load(url) {\n  return await import(url);\n}\n";
    expect(findNonLiteralDynamicImportLines(text)).toEqual([2]);
  });

  test('does not flag comment prose that merely mentions import() syntax', () => {
    const text = [
      '/**',
      ' * Every entry in `BROWSER_APP_IMPORTERS` uses a literal `import()` specifier',
      ' * (not a computed/templated string) so bundlers can statically analyze it.',
      ' */',
      'export const noop = 1;',
    ].join('\n');
    expect(findNonLiteralDynamicImportLines(text)).toEqual([]);
  });

  test('does not flag multi-sentence comment prose spanning an unrelated trailing paren', () => {
    const text = [
      '/**',
      ' * Host-only/remote-capability apps never trigger an `import()` call: their',
      ' * module code (if it even exists) never enters the browser bundle graph.',
      ' */',
      'export function loadApp() {}',
    ].join('\n');
    expect(findNonLiteralDynamicImportLines(text)).toEqual([]);
  });

  test('does not flag a method/property named "import" (not the import() expression)', () => {
    const text = [
      'async function importModel(file) {',
      "  const result = await this.swissknife.models.import({ file, name: 'x' });",
      '  return result;',
      '}',
    ].join('\n');
    expect(findNonLiteralDynamicImportLines(text)).toEqual([]);
  });

  test('does not flag a literal string import preceded by a /* @vite-ignore */ comment', () => {
    const text = "const mod = await import(/* @vite-ignore */ 'https://esm.sh/@strudel.cycles/core?bundle');\n";
    expect(findNonLiteralDynamicImportLines(text)).toEqual([]);
  });

  test('does not flag empty parens import()', () => {
    const text = 'const note = "see import() for details";\n';
    expect(findNonLiteralDynamicImportLines(text)).toEqual([]);
  });

  test('still flags a non-literal dynamic import hidden behind a leading comment', () => {
    const text = "const mod = await import(/* @vite-ignore */ cfModule);\n";
    expect(findNonLiteralDynamicImportLines(text)).toEqual([1]);
  });

  test('side-effect-import regex does not treat a hyphenated string suffix as an import specifier', () => {
    const text = [
      "export const KINDS = [",
      "  'dynamic-import',",
      "  'remote-descriptor',",
      "  'unavailable',",
      '] as const;',
      '',
      "if (kind === 'dynamic-import') {",
      "  throw new Error('lazy_import.kind must be \"dynamic-import\".');",
      '}',
    ].join('\n');
    const imports = extractImports('fixture.ts', text);
    expect(imports.filter((item) => item.kind === 'side-effect-import')).toEqual([]);
  });

  test('side-effect-import regex still detects a genuine side-effect import statement', () => {
    const text = "import './styles.css';\n";
    const imports = extractImports('fixture.ts', text);
    const sideEffectImports = imports.filter((item) => item.kind === 'side-effect-import');
    expect(sideEffectImports).toEqual([
      expect.objectContaining({ kind: 'side-effect-import', specifier: './styles.css', line: 1 }),
    ]);
  });
});
