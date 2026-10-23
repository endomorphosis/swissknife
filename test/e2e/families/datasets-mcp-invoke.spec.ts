import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { runVdgFamilyCapture } from '../helpers/vdg-family-capture';

const require = createRequire(import.meta.url);
const { writeFamilyEvidence } = require('../../../scripts/vdg-evidence.cjs');

test('vdg-datasets proves originating calls, connector receipts and governed negatives', async ({ page }) => {
  test.setTimeout(14_400_000);
  // Replay verifies existing real evidence; the default captures real clicks.
  if (process.env.VDG_EVIDENCE_REPLAY !== '1') {
    await runVdgFamilyCapture(page, 'datasets');
  }
  const evidence = writeFamilyEvidence('vdg-datasets');
  expect(evidence.reasons, JSON.stringify(evidence.gap_counts)).toEqual([]);
  expect(evidence.decision).toBe('GO');
  expect(evidence.passed).toBe(true);
});
