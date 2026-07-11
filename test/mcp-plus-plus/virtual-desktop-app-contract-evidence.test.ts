import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { VIRTUAL_DESKTOP_APP_MANIFEST } from '../../src/services/apps/virtual-desktop-app-manifest';

const evidenceRoot = join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const backendPath = join(evidenceRoot, 'app-backend-contract.json');
const workflowPath = join(evidenceRoot, 'app-workflow-matrix.json');
const pythonBackends = ['ipfs_accelerate_py', 'ipfs_kit_py', 'ipfs_datasets_py'];

describe('SWR-113 virtual desktop app contract evidence', () => {
  beforeAll(() => {
    execFileSync(process.execPath, ['scripts/build-virtual-desktop-app-contract-evidence.cjs'], {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: process.env,
    });
  });

  it('materializes one backend contract record for every canonical app', () => {
    const backend = readJson<any>(backendPath);
    expect(backend.schema).toBe('swissknife.virtual-desktop-app-backend-contract.v1');
    expect(backend.app_count).toBe(VIRTUAL_DESKTOP_APP_MANIFEST.apps.length);
    expect(backend.validation.errors).toEqual([]);

    const recordsByApp = new Map(backend.apps.map((record: any) => [record.app_id, record]));
    for (const app of VIRTUAL_DESKTOP_APP_MANIFEST.apps) {
      const record = recordsByApp.get(app.id) as any;
      expect(record, app.id).toBeTruthy();
      for (const serviceId of pythonBackends) {
        expect(record.assigned_backend_capabilities[serviceId], `${app.id}:${serviceId}`).toBeTruthy();
        expect(record.assigned_backend_capabilities[serviceId].coverage_status).toMatch(
          /covered|declared_no_tool_binding|not_declared/,
        );
      }
      expect(record.orb_idl.status, app.id).toBeTruthy();
      expect(record.glasses_strategy.kind, app.id).toBeTruthy();
    }
  });

  it('materializes executable behavior records with states, inputs, receipts, ORB/IDL, and glasses strategy', () => {
    const workflow = readJson<any>(workflowPath);
    expect(workflow.schema).toBe('swissknife.virtual-desktop-app-workflow-matrix.v1');
    expect(workflow.app_count).toBe(VIRTUAL_DESKTOP_APP_MANIFEST.apps.length);
    expect(workflow.validation.errors).toEqual([]);
    expect(workflow.summary.screenshot_only_count).toBe(0);

    const recordsByApp = new Map(workflow.apps.map((record: any) => [record.app_id, record]));
    for (const app of VIRTUAL_DESKTOP_APP_MANIFEST.apps) {
      const record = recordsByApp.get(app.id) as any;
      expect(record, app.id).toBeTruthy();
      expect(record.launch_path.route).toBe(`virtual-desktop://apps/${app.id}`);
      expect(record.primary_action || record.local_only_rationale, app.id).toBeTruthy();
      for (const state of ['success', 'fallback', 'error', 'denied']) {
        expect(record.states[state].covered, `${app.id}:${state}`).toBe(true);
      }
      expect(record.keyboard_checks.covered, app.id).toBe(true);
      expect(record.pointer_checks.covered, app.id).toBe(true);
      expect(typeof record.screenshot, app.id).toBe('string');
      expect(record.screenshot.length, app.id).toBeGreaterThan(0);
      expect(record.screenshot_evidence.status, app.id).toBe('present');
      expect(record.receipt_or_fixture.present, app.id).toBe(true);
      expect(record.orb_idl_descriptor.status, app.id).toBeTruthy();
      expect(record.glasses_strategy.kind, app.id).toBeTruthy();
      expect(record.evidence_quality.screenshot_only, app.id).toBe(false);
    }
  });
});

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}
