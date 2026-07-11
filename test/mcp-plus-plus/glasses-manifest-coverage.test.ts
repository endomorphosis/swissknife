/**
 * @vitest-environment node
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import type { AllToolsAppBindingMatrix } from '../../src/services/apps/all-tools-app-binding-matrix';
import type { AllToolsCompositeWorkflowCatalog } from '../../src/services/apps/all-tools-composite-workflows';
import type { AllToolsLedger } from '../../src/services/apps/all-tools-policy-classifier';
import {
  buildAllToolsGlassesProjectionCatalog,
  validateAllToolsGlassesProjectionCatalog,
} from '../../src/services/glasses/all-tools-glasses-projection';
import {
  buildAllToolsIDLDescriptorCatalog,
  validateAllToolsIDLDescriptorCatalog,
} from '../../src/services/mcp/all-tools-idl-generator';

const evidenceRoot = join(process.cwd(), 'test-results/virtual-desktop-ipfs-mcp-orb');
const servicesRoot = join(process.cwd(), 'src/services');

describe('SWR-006 glasses manifest ownership and coverage', () => {
  it('keeps product surface files under their owning service directories', () => {
    const expectedOwnership = {
      apps: [
        'all-tools-app-binding-matrix.ts',
        'all-tools-composite-workflows.ts',
        'all-tools-policy-classifier.ts',
        'all-tools-release-policy-gates.ts',
        'mcp-deontic-ui-manifest.ts',
        'mcp-generated-app-quality-gates.ts',
        'mcp-generated-app-state.ts',
        'meta-glasses-app-capability-registry.ts',
        'swissknife-mcp-capability-registry.ts',
      ],
      glasses: [
        'all-tools-glasses-projection.ts',
        'glasses-app-control-plane.ts',
        'glasses-enhanced-control-plane.ts',
        'idl-to-glasses-compiler.ts',
        'ipfs-glasses-widgets.ts',
        'meta-glasses-display-orb-adapter.ts',
        'meta-glasses-mobile-orb-bridge.ts',
        'meta-glasses-widget-compiler.ts',
      ],
      ipfs: [
        'ipfs-browser.ts',
        'ipfs-host.ts',
        'ipfs-idl-descriptors.ts',
        'ipfs-interface-registry.ts',
        'ipfs-orb-profiles.ts',
        'ipfs-proof-cache.ts',
        'ipfs-ui-profiles.ts',
        'mcp-ipfs-ui-descriptors.ts',
      ],
      mcp: [
        'all-tools-idl-generator.ts',
        'mcp-control-surface-mediator.ts',
        'libp2p-browser-runtime.ts',
        'mcp-idl.ts',
        'mcp-interface-registry.ts',
        'mcp-orb-capability-router.ts',
        'mcp-schema-ui-generator.ts',
        'mcp-transport.ts',
        'mcp-ui-profile.ts',
      ],
    } as const;

    for (const [owner, files] of Object.entries(expectedOwnership)) {
      for (const file of files) {
        const ownedPath = join(servicesRoot, owner, file);
        expect(existsSync(ownedPath)).toBe(true);
        expect(statSync(ownedPath).isFile()).toBe(true);
        expect(existsSync(join(servicesRoot, file))).toBe(false);
      }
    }
  });

  it('rebuilds ORB/IDL and glasses coverage from app-owned manifest inputs', () => {
    const ledger = readJson<AllToolsLedger>('all-tools-ledger.json');
    const bindingMatrix = readJson<AllToolsAppBindingMatrix>('all-tools-app-bindings.json');
    const workflowCatalog = readJson<AllToolsCompositeWorkflowCatalog>('all-tools-composite-workflows.json');
    const idlCatalog = buildAllToolsIDLDescriptorCatalog(
      ledger,
      bindingMatrix,
      workflowCatalog,
      { generatedAt: '2026-07-08T00:00:00.000Z' },
    );
    const glassesCatalog = buildAllToolsGlassesProjectionCatalog(idlCatalog, {
      generatedAt: '2026-07-08T00:00:00.000Z',
    });

    expect(validateAllToolsIDLDescriptorCatalog(
      idlCatalog,
      ledger,
      bindingMatrix,
      workflowCatalog,
    )).toEqual({ valid: true, errors: [], warnings: [] });
    expect(validateAllToolsGlassesProjectionCatalog(glassesCatalog, idlCatalog)).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
    expect(glassesCatalog.projection_count).toBe(idlCatalog.descriptor_count);
    expect(glassesCatalog.tool_coverage_count).toBe(bindingMatrix.rows.filter(row => row.app_visible).length);
    expect(glassesCatalog.hardware_free_replay_state_count).toBe(glassesCatalog.projection_count * 8);
    expect(glassesCatalog.behavior_counts.native_display).toBeGreaterThan(0);
    expect(glassesCatalog.behavior_counts.display_webapp).toBeGreaterThan(0);
    expect(glassesCatalog.behavior_counts.physical_device_only).toBeGreaterThan(0);
  });
});

function readJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(join(evidenceRoot, fileName), 'utf8')) as T;
}
