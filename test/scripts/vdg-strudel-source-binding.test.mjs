import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parse } = require('acorn');
const { captureInputFingerprint } = require('../../scripts/vdg-capture-fingerprint.cjs');
const { FAMILIES } = require('../../scripts/vdg-evidence.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function visit(node, callback) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') callback(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(item => visit(item, callback));
    else if (value && typeof value === 'object') visit(value, callback);
  }
}

test('the declared Strudel source is the same physical implementation imported by its real desktop factory', () => {
  const bootstrapPath = path.join(root, 'web/js/main-simple.js');
  const ast = parse(fs.readFileSync(bootstrapPath, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
  const factories = [];
  visit(ast, node => {
    if (node.type === 'MethodDefinition' && node.key.name === 'createGrandmaStrudelDAWApp') factories.push(node);
  });
  assert.equal(factories.length, 1);
  const imports = [];
  visit(factories[0], node => {
    if (node.type === 'ImportExpression' && typeof node.source.value === 'string') imports.push(node.source.value);
  });
  assert.deepEqual(imports, ['./apps/strudel-grandma.js']);
  assert.ok(FAMILIES['vdg-local'].apps.includes('strudel'));
  const declared = path.join(root, 'web/js/apps/strudel.js');
  const actual = path.resolve(path.dirname(bootstrapPath), imports[0]);
  assert.equal(fs.lstatSync(declared).isSymbolicLink(), true);
  assert.equal(fs.readlinkSync(declared), 'strudel-grandma.js');
  assert.equal(fs.realpathSync(declared), fs.realpathSync(actual));
  assert.equal(fs.statSync(declared).ino, fs.statSync(actual).ino);
  assert.deepEqual(fs.readFileSync(declared), fs.readFileSync(actual));
});

test('the production fingerprint rejects changed Strudel implementation bytes for both Local transports', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-strudel-binding-'));
  try {
    const apps = path.join(temporary, 'web/js/apps');
    fs.mkdirSync(apps, { recursive: true });
    fs.symlinkSync('strudel-grandma.js', path.join(apps, 'strudel.js'));
    const actual = path.join(apps, 'strudel-grandma.js');
    fs.writeFileSync(actual, 'export const creationEnabled = false;\n');
    const fingerprint = (family, transport) => captureInputFingerprint(family, transport, {
      sourceRoot: temporary, evidenceRoot: path.join(temporary, 'evidence'), definition: FAMILIES[family],
    });
    const before = Object.fromEntries(['http', 'libp2p'].map(transport => [transport, fingerprint('vdg-local', transport)]));
    const unchangedFamilies = Object.fromEntries(Object.keys(FAMILIES).filter(family => family !== 'vdg-local')
      .flatMap(family => ['http', 'libp2p'].map(transport => [`${family}:${transport}`, fingerprint(family, transport)])));
    fs.writeFileSync(actual, 'export const creationEnabled = true;\n');
    for (const transport of ['http', 'libp2p']) assert.notEqual(fingerprint('vdg-local', transport), before[transport]);
    for (const [key, expected] of Object.entries(unchangedFamilies)) {
      const [family, transport] = key.split(':');
      assert.equal(fingerprint(family, transport), expected, key);
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('a missing compatibility source cannot reuse the fingerprint that bound the real implementation', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-strudel-missing-binding-'));
  try {
    const apps = path.join(temporary, 'web/js/apps');
    fs.mkdirSync(apps, { recursive: true });
    fs.writeFileSync(path.join(apps, 'strudel-grandma.js'), 'export default class RealStrudel {}\n');
    const alias = path.join(apps, 'strudel.js');
    const fingerprint = () => captureInputFingerprint('vdg-local', 'http', {
      sourceRoot: temporary, evidenceRoot: path.join(temporary, 'evidence'), definition: FAMILIES['vdg-local'],
    });
    const unbound = fingerprint();
    fs.symlinkSync('strudel-grandma.js', alias);
    assert.notEqual(fingerprint(), unbound);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
