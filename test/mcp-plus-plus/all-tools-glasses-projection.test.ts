/**
 * @vitest-environment node
 */

import { dirname, join } from 'path';
import {
  buildAllToolsGlassesProjectionCatalog,
  validateAllToolsGlassesProjectionCatalog,
  type AllToolsGlassesProjectionCatalog,
  type AllToolsGlassesReplayState,
} from '../../src/services/glasses/all-tools-glasses-projection';
import type { AllToolsIDLDescriptorCatalog } from '../../src/services/mcp/all-tools-idl-generator';

const actualFs = jest.requireActual<typeof import('fs')>('fs');
const evidenceRoot = join(process.cwd(), 'test-results/virtual-desktop-ipfs-mcp-orb');
const idlCoveragePath = join(evidenceRoot, 'all-tools-idl-coverage.json');
const glassesCoveragePath = join(evidenceRoot, 'all-tools-glasses-coverage.json');

const expectedReplayStates: AllToolsGlassesReplayState[] = [
  'open',
  'focus',
  'activate',
  'dispatch_result',
  'fallback',
  'clear',
  'recover',
  'policy_block',
];

let idlCatalog: AllToolsIDLDescriptorCatalog;
let catalog: AllToolsGlassesProjectionCatalog;

describe('all MCP/MCP++ tools Meta glasses projections', () => {
  beforeAll(() => {
    idlCatalog = readJson<AllToolsIDLDescriptorCatalog>(idlCoveragePath);
    catalog = buildAllToolsGlassesProjectionCatalog(idlCatalog, {
      generatedAt: '2026-07-08T00:00:00.000Z',
    });
    actualFs.mkdirSync(dirname(glassesCoveragePath), { recursive: true });
    actualFs.writeFileSync(glassesCoveragePath, `${JSON.stringify(catalog, null, 2)}\n`);
  });

  it('writes one projection for every generated IDL descriptor', () => {
    expect(catalog.schema).toBe('swissknife.all-mcp-tools-glasses-projection-catalog.v1');
    expect(catalog.descriptor_count).toBe(idlCatalog.descriptor_count);
    expect(catalog.projection_count).toBe(idlCatalog.descriptor_count);
    expect(catalog.tool_family_projection_count).toBe(idlCatalog.tool_group_descriptor_count);
    expect(catalog.workflow_projection_count).toBe(idlCatalog.workflow_descriptor_count);
    expect(catalog.tool_coverage_count).toBe(418);
    expect(catalog.workflow_coverage_count).toBe(7);
    expect(actualFs.existsSync(glassesCoveragePath)).toBe(true);
  });

  it('validates behavior assignments and hardware-free replay states', () => {
    const validation = validateAllToolsGlassesProjectionCatalog(catalog, idlCatalog);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    for (const projection of catalog.projections) {
      expect(projection.method_refs).toHaveLength(projection.method_count);
      expect(projection.replay.map(frame => frame.state)).toEqual(expectedReplayStates);
      expect(projection.replay.every(frame => frame.expected_render.length > 0)).toBe(true);
      expect(projection.replay.find(frame => frame.state === 'policy_block')?.policy_outcome).toBe('deny');
      expect(projection.fallback_summary).toBeTruthy();
      expect(projection.policy_block_summary).toBeTruthy();
    }
    expect(catalog.hardware_free_replay_state_count).toBe(catalog.projection_count * expectedReplayStates.length);
  });

  it('covers native, display-webapp, and physical handoff behaviors for representative families', () => {
    const datasetBrowse = projectionForTool('ipfs_datasets_py:browse');
    const accelerate = projectionForTool('ipfs_accelerate_py:run_inference_job');
    const wallet = projectionForWorkflow('workflow.wallet-credential-safe');

    expect(datasetBrowse.behavior).toBe('native_display');
    expect(datasetBrowse.displayable).toBe(true);
    expect(accelerate.behavior).toBe('display_webapp');
    expect(accelerate.adapter_required).toBe(true);
    expect(accelerate.fallback_summary).toContain('Adapter-required');
    expect(wallet.behavior).toBe('physical_device_only');
    expect(wallet.displayable).toBe(false);
    expect(wallet.replay.every(frame => frame.surface !== 'glasses_hud')).toBe(true);
  });

  it('maps every app-visible tool coverage row back to a projection', () => {
    const projectionIds = new Set(catalog.projections.map(projection => projection.descriptor_id));
    for (const row of idlCatalog.tool_coverage) {
      expect(projectionIds.has(row.descriptor_id)).toBe(true);
      const projection = catalog.projections.find(candidate => candidate.descriptor_id === row.descriptor_id);
      expect(projection?.method_refs).toContain(row.method);
    }
  });

  it('records behavior, app, service, and adapter summary counts', () => {
    expect(catalog.behavior_counts.native_display).toBeGreaterThan(0);
    expect(catalog.behavior_counts.display_webapp).toBeGreaterThan(0);
    expect(catalog.behavior_counts.physical_device_only).toBeGreaterThan(0);
    expect(catalog.displayable_projection_count).toBeLessThan(catalog.projection_count);
    expect(catalog.adapter_required_projection_count).toBeGreaterThan(0);
    expect(catalog.app_counts['datasets-browser']).toBeGreaterThan(0);
    expect(catalog.service_counts.ipfs_datasets_py).toBeGreaterThan(0);
  });
});

function readJson<T>(filePath: string): T {
  return JSON.parse(actualFs.readFileSync(filePath, 'utf8')) as T;
}

function projectionForTool(toolId: string) {
  const row = idlCatalog.tool_coverage.find(candidate => candidate.tool_id === toolId);
  if (!row) throw new Error(`Missing IDL coverage for ${toolId}`);
  const projection = catalog.projections.find(candidate => candidate.descriptor_id === row.descriptor_id);
  if (!projection) throw new Error(`Missing glasses projection for ${row.descriptor_id}`);
  return projection;
}

function projectionForWorkflow(workflowId: string) {
  const projection = catalog.projections.find(candidate => candidate.workflow_id === workflowId);
  if (!projection) throw new Error(`Missing glasses projection for ${workflowId}`);
  return projection;
}
