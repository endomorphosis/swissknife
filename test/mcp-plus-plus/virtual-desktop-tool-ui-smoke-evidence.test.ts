/**
 * @vitest-environment node
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const evidenceRoot = join(process.cwd(), 'test-results/virtual-desktop-ipfs-mcp-orb');
const matrixPath = join(evidenceRoot, 'capability-matrix.json');
const receiptPath = join(evidenceRoot, 'tool-ui-smoke-receipts.json');
const docPath = join(process.cwd(), 'docs/virtual-desktop-tool-ui-smoke-evidence.md');

const REQUIRED_BROWSER_SAFETY = {
  browser_context: true,
  node_builtins_required: false,
  python_wrappers_required: false,
  host_subprocess_required: false,
  physical_glasses_required: false,
  unavailable_native_adapters_required: false,
};

describe('SWR-096 virtual desktop tool UI smoke evidence', () => {
  it('covers every tool-backed app with browser-safe success, fallback, error receipts, and screenshots', () => {
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
      task_id: 'SWR-096',
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
      expect(['browser-safe', 'hybrid']).toContain(app.manifest_runtime_class);
      expect(app.manifest_lazy_import_kind).toBe('dynamic-import');
      expect(app.manifest_browser_supported).toBe(true);
      expect(app.browser_safety).toMatchObject(REQUIRED_BROWSER_SAFETY);
      expect(app.browser_safety.allowed_transports).toEqual(['http', 'https', 'websocket', 'libp2p']);
      expect(app.browser_safety.fallback_paths).toEqual(expect.arrayContaining([
        'browser-fallback-ui',
        'desktop-mobile-confirmation',
        'simulator-only-glasses-handoff',
      ]));
      expect(app.app_visible_tool_count).toBe(row.all_tools.app_visible_tool_count);
      expect(app.desktop_mobile_only_count).toBe(row.all_tools.desktop_mobile_only_count);
      expect(app.supervisor_only_count).toBe(row.all_tools.supervisor_only_count);
      expect(app.receipts).toHaveLength(3);
      expect(app.receipts.map((entry: any) => entry.state).sort()).toEqual(['error', 'fallback', 'success']);
      for (const entry of app.receipts) {
        expect(entry.receipt_cid).toMatch(/^sha256:[0-9a-f]+$/);
        expect(entry.ui_path).toEqual(expect.arrayContaining([
          'desktop-icon',
          'browser-safe-gate',
          'tool-smoke-panel',
          entry.state,
        ]));
        expect(entry.browser_safety).toMatchObject(REQUIRED_BROWSER_SAFETY);
        expect(entry.browser_safety.bundled_runtime_classes).toEqual([app.manifest_runtime_class]);
        expect(entry.browser_safety.allowed_transports).toEqual(['http', 'https', 'websocket', 'libp2p']);
      }

      const screenshotPath = join(process.cwd(), app.screenshot);
      expect(existsSync(screenshotPath)).toBe(true);
      expect(statSync(screenshotPath).size).toBeGreaterThan(1024);
      expect(doc).toContain(`| ${row.app_id} |`);
    }

    expect(doc).toContain('SWR-096');
    expect(doc).toContain('Browser Safety Contract');
    expect(doc).toContain('no Node builtins');
    expect(doc).toContain('no app smoke path requires Node builtins, Python wrappers, host subprocesses, physical glasses, or unavailable native adapters');
  });
});

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}
