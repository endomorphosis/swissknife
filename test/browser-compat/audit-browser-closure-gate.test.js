const path = require('node:path');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

const scannerModulePath = path.resolve(__dirname, '../../scripts/audit-browser-compat.mjs');

describe('SWR-137 browser closure gate', () => {
  function runCliFixture(source) {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swissknife-browser-closure-'));
    const scriptPath = path.join(fixtureDir, 'scripts', 'audit-browser-compat.mjs');
    const jsonPath = path.join(fixtureDir, 'docs', 'fixture.json');
    try {
      fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
      fs.mkdirSync(path.join(fixtureDir, 'web', 'js', 'apps'), { recursive: true });
      fs.copyFileSync(scannerModulePath, scriptPath);
      fs.writeFileSync(path.join(fixtureDir, 'package.json'), '{}\n');
      fs.writeFileSync(
        path.join(fixtureDir, 'web', 'index.html'),
        '<!doctype html><script type="module" src="/js/apps/fixture.js"></script>\n',
      );
      fs.writeFileSync(path.join(fixtureDir, 'web', 'js', 'apps', 'fixture.js'), source);

      const result = childProcess.spawnSync(process.execPath, [
        'scripts/audit-browser-compat.mjs',
        '--json', 'docs/fixture.json',
        '--fail-on-host-imports',
      ], {
        cwd: fixtureDir,
        encoding: 'utf8',
      });
      return {
        ...result,
        inventory: JSON.parse(fs.readFileSync(jsonPath, 'utf8')),
      };
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  }

  function runFixtures(fixtures) {
    const program = [
      `import { analyzeSourceText, browserGateFailures } from ${JSON.stringify(pathToFileURL(scannerModulePath).href)};`,
      `const fixtures = ${JSON.stringify(fixtures)};`,
      'const results = fixtures.map(({ path, source, classification = "host-only", kind = "browser-entry", findings }) => {',
      '  const analysis = source === undefined ? { path, findings } : analyzeSourceText(path, source);',
      '  return { path, kind, classification, findings: analysis.findings };',
      '});',
      'console.log(JSON.stringify({ results, failures: browserGateFailures(results).map(item => item.path) }));',
    ].join('\n');
    return JSON.parse(childProcess.execFileSync(process.execPath, ['--input-type=module', '--eval', program], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
    }));
  }

  it('fails fixture Node and Python execution edges from executable browser roots', () => {
    const audit = runFixtures([
      {
        path: 'web/js/apps/node-execution-fixture.js',
        source: "import { spawn } from 'node:child_process';\nexport const run = () => spawn('node', ['tool.js']);\n",
      },
      {
        path: 'web/js/apps/python-execution-fixture.js',
        source: 'export const run = code => window.desktop.swissknife.python.execute(code);\n',
      },
    ]);
    const [nodeFixture, pythonFixture] = audit.results;

    expect(nodeFixture.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'node', severity: 'host-only' }),
      expect.objectContaining({ category: 'subprocess', severity: 'host-only' }),
    ]));
    expect(pythonFixture.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'python', severity: 'host-only' }),
    ]));

    expect(audit.failures).toEqual([
      'web/js/apps/node-execution-fixture.js',
      'web/js/apps/python-execution-fixture.js',
    ]);
  });

  it('fails Pyodide execution and unresolved executable browser paths closed', () => {
    const audit = runFixtures([
      {
        path: 'web/js/apps/pyodide-execution-fixture.js',
        source: 'export const run = code => window.pyodide.runPythonAsync(code);\n',
      },
      {
        path: 'web/js/apps/unresolved-fixture.js',
        classification: 'unknown',
        findings: [{
          category: 'unresolved-import', severity: 'unknown', file: 'web/js/apps/unresolved-fixture.js', line: 1, message: 'fixture unresolved browser import',
        }],
      },
      {
        path: 'web/debug-fixture.html',
        findings: [{
          category: 'node', severity: 'host-only', file: 'web/debug-fixture.html', line: 1, message: 'simulated fixture',
        }],
      },
    ]);
    const [pyodideFixture] = audit.results;
    expect(pyodideFixture.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'pyodide', severity: 'host-only' }),
    ]));

    expect(audit.failures).toEqual([
      'web/js/apps/pyodide-execution-fixture.js',
      'web/js/apps/unresolved-fixture.js',
      'web/debug-fixture.html',
    ]);
  });

  it('makes the CLI gate reject Node and Python execution fixture imports', () => {
    const nodeResult = runCliFixture(
      "import { execFile } from 'node:child_process';\nexport const execute = () => execFile('node', ['tool.js']);\n",
    );
    const pythonResult = runCliFixture(
      'export const execute = code => window.desktop.swissknife.python.execute(code);\n',
    );

    for (const [result, expectedEvidence] of [
      [nodeResult, 'imports Node host module "node:child_process"'],
      [pythonResult, 'Python execution wrapper'],
    ]) {
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain('Browser closure gate failed');
      expect(`${result.stdout}\n${result.stderr}`).toContain(expectedEvidence);
      expect(result.inventory.summary.browserReachableHostOnlyImports).toBeGreaterThan(0);
      expect(result.inventory.summary.gatePassed).toBe(false);
    }
  });

  it('does not treat simulated test HTML as an executable product-browser path', () => {
    const audit = runFixtures([{
      path: 'web/debug-fixture.html',
      kind: 'simulated-test-html',
      classification: 'unknown',
      findings: [],
    }]);
    expect(audit.failures).toEqual([]);
  });
});
