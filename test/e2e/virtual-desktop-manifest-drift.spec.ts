import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { expect, test } from '@playwright/test';

test.describe('virtual desktop manifest drift gate', () => {
  test('validates manifest source sets against current desktop, docs, tests, and glasses sources', () => {
    execFileSync('node', ['scripts/validate-virtual-desktop-manifest.cjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: 'pipe',
    });

    const reportPath = join(
      process.cwd(),
      'test-results',
      'virtual-desktop-ipfs-mcp-orb',
      'manifest-drift.json',
    );
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));

    expect(report.valid).toBe(true);
    expect(report.strict_sources.every((source: { ok: boolean }) => source.ok)).toBe(true);
    expect(report.playwright_app_lists
      .filter((list: { expected_source_set: string | null }) => list.expected_source_set)
      .every((list: { ok: boolean }) => list.ok)).toBe(true);
  });
});
