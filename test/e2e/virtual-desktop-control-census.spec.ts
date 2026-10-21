import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const censusPath = path.resolve(
  __dirname,
  '../../test-results/virtual-desktop-ipfs-mcp-orb/control-census.json',
);

test('virtual desktop control census names every launch id', () => {
  const census = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
  expect(census.schema).toBe('swissknife.virtual-desktop-control-census.v1');
  expect(census.collection).toBe('source-template');
  expect(census.clicked).toBe(false);
  expect(census.rows.length).toBeGreaterThan(0);
  for (const row of census.rows) {
    expect(row.app_id).toEqual(expect.any(String));
    expect(row.launch_id).toEqual(expect.any(String));
    expect(row.selector).toEqual(expect.any(String));
    expect(row.role).toEqual(expect.any(String));
    expect(row.accessible_name).toEqual(expect.any(String));
    expect(row.data_action).toEqual(expect.any(String));
    expect(row.data_capability).toEqual(expect.any(String));
    expect(row.data_live_gateway_binding).toEqual(expect.any(String));
    expect(['unclassified', 'local-only']).toContain(row.disposition);
    expect(row.clicked).toBe(false);
  }
  const launchIds = new Set(census.rows.map(row => row.launch_id));
  for (const id of census.launch_ids) expect(launchIds.has(id)).toBe(true);
});
