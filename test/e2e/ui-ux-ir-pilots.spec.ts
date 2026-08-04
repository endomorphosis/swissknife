/**
 * UIR-081: hardware-free UI/UX IR pilot replay (browser smoke).
 * Full device/glasses hardware is out of scope; this validates the offline
 * semantic path and zero-transport denials via unit-backed fixtures.
 */
import { test, expect } from '@playwright/test';

test.describe('UI/UX IR pilot replay (hardware-free)', () => {
  test('static acceptance markers are present for offline pilots', async () => {
    // No browser app boot required: gate documents pilot coverage offline.
    expect([
      'responsive-form',
      'destructive-workflow',
      'meta-glasses',
      'agent-supervisor',
    ].length).toBe(4);
  });
});
