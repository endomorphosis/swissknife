import test from 'node:test';
import assert from 'node:assert/strict';
import { pilotAdmissionScenario, pilotObservations } from '../../scripts/svf-calculator-pilot.mjs';
import { validateScenario, VIEWPORTS } from '../../scripts/run-visual-functional-workflow.mjs';
import { loadCanonicalContracts, validateContracts, CONTRACT_PATH } from '../../scripts/capture-visual-functional-baseline.mjs';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('pilot scenario admits canonical input actions without granting full app acceptance', () => {
  const canonical = loadCanonicalContracts();
  const contracts = validateContracts(JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8')), canonical.manifest, canonical.backend);
  assert.equal(validateScenario(pilotAdmissionScenario(), contracts.apps.find(app => app.app_id === 'calculator')).app_id, 'calculator');
});

test('pilot requires actual arithmetic, keyboard and observed error recovery at both viewports', () => {
  const rows = VIEWPORTS.map(viewport => ({ viewport, actual_desktop: true, arithmetic: '50', keyboard: '42', recovered: '50', division_error_observed: true }));
  assert.equal(pilotObservations(rows).length, 3);
  for (const override of [{ actual_desktop: false }, { arithmetic: '12' }, { keyboard: '6*7' }, { recovered: 'error' }, { division_error_observed: false }]) {
    assert.throws(() => pilotObservations([{ ...rows[0], ...override }, rows[1]]));
  }
  assert.throws(() => pilotObservations(rows.slice(1)));
});

test('actual CLI pilot dispatch rejects invalid scope without an unsettled circular top-level await', () => {
  const runner = fileURLToPath(new URL('../../scripts/run-visual-functional-workflow.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [runner, '--foundation-check', 'pilot', '--output-dir', '/tmp/svf-disallowed-pilot-output'],
    { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /pilot output must remain in its campaign namespace/);
  assert.doesNotMatch(result.stderr, /unsettled top-level await/);
});
