/**
 * @vitest-environment node
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const evidenceRoot = join(process.cwd(), 'test-results/virtual-desktop-ipfs-mcp-orb');
const matrixPath = join(evidenceRoot, 'capability-matrix.json');
const receiptPath = join(evidenceRoot, 'tool-ui-smoke-receipts.json');
const docPath = join(process.cwd(), 'docs/virtual-desktop-tool-ui-smoke-evidence.md');

describe('SWR-085 virtual desktop tool UI smoke evidence', () => {
  it('covers every tool-backed app with success, fallback, error receipts, and screenshots', () => {
    expect(existsSync(matrixPath)).toBe(true);
    expect(existsSync(receiptPath)).toBe(true);
    expect(existsSync(docPath)).toBe(true);

    const matrix = readJson<any>(matrixPath);
    const receipt = readJson<any>(receiptPath);
    const doc = readFileSync(docPath, 'utf8');
    const toolBackedRows = matrix.rows.filter((row: any) => row.binding_state === 'tool_backed');
    const receiptAppsById = new Map(receipt.apps.map((app: any) => [app.app_id, app]));

    expect(receipt).toMatchObject({
      schema: 'swissknife.virtual-desktop-tool-ui-smoke-evidence.v1',
      task_id: 'SWR-085',
      matrix_cid: matrix.matrix_cid,
    });
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'npm run test:e2e:mcp',
      'npm run evidence:mcp-glasses',
    ]));
    expect(receipt.required_states.sort()).toEqual(['error', 'fallback', 'success']);
    expect(receipt.app_count).toBe(toolBackedRows.length);
    expect([...receiptAppsById.keys()].sort()).toEqual(toolBackedRows.map((row: any) => row.app_id).sort());

    for (const row of toolBackedRows) {
      const app = receiptAppsById.get(row.app_id) as any;
      expect(app, row.app_id).toBeTruthy();
      expect(app.observed_states.sort()).toEqual(['error', 'fallback', 'success']);
      expect(app.service_families.sort()).toEqual((row.manifest_service_families ?? []).sort());
      expect(app.app_visible_tool_count).toBe(row.all_tools.app_visible_tool_count);
      expect(app.desktop_mobile_only_count).toBe(row.all_tools.desktop_mobile_only_count);
      expect(app.supervisor_only_count).toBe(row.all_tools.supervisor_only_count);
      expect(app.receipts).toHaveLength(3);
      expect(app.receipts.map((entry: any) => entry.state).sort()).toEqual(['error', 'fallback', 'success']);
      for (const entry of app.receipts) {
        expect(entry.receipt_cid).toMatch(/^sha256:[0-9a-f]+$/);
        expect(entry.ui_path).toEqual(expect.arrayContaining(['desktop-icon', 'tool-smoke-panel', entry.state]));
      }

      const screenshotPath = join(process.cwd(), app.screenshot);
      expect(existsSync(screenshotPath)).toBe(true);
      expect(statSync(screenshotPath).size).toBeGreaterThan(1024);
      expect(doc).toContain(`| ${row.app_id} |`);
    }
  });
});

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}
