/**
 * @vitest-environment node
 */

import { dirname, join } from 'path';
import {
  buildAllToolsPolicyMatrix,
  type AllToolsLedger,
  type AllToolsPolicyMatrix,
} from '../../src/services/apps/all-tools-policy-classifier';
import {
  buildAllToolsAppBindingMatrix,
  renderAllToolsAppBindingsMarkdown,
  validateAllToolsAppBindingMatrix,
  type AllToolsAppBindingMatrix,
} from '../../src/services/apps/all-tools-app-binding-matrix';
import { getIPFSAppCapabilityRegistry } from '../../src/services/apps/ipfs-app-capability-registry';
import { VIRTUAL_DESKTOP_APP_MANIFEST } from '../../src/services/apps/virtual-desktop-app-manifest';

const actualFs = jest.requireActual<typeof import('fs')>('fs');
const evidenceRoot = join(process.cwd(), 'test-results/virtual-desktop-ipfs-mcp-orb');
const ledgerPath = join(evidenceRoot, 'all-tools-ledger.json');
const jsonPath = join(evidenceRoot, 'all-tools-app-bindings.json');
const markdownPath = join(evidenceRoot, 'all-tools-app-bindings.md');

let ledger: AllToolsLedger;
let policyMatrix: AllToolsPolicyMatrix;
let bindingMatrix: AllToolsAppBindingMatrix;

describe('all MCP/MCP++ tools app binding matrix', () => {
  beforeAll(() => {
    ledger = JSON.parse(actualFs.readFileSync(ledgerPath, 'utf8')) as AllToolsLedger;
    policyMatrix = buildAllToolsPolicyMatrix(ledger, {
      generatedAt: '2026-07-08T00:00:00.000Z',
    });
    bindingMatrix = buildAllToolsAppBindingMatrix(
      ledger,
      policyMatrix,
      VIRTUAL_DESKTOP_APP_MANIFEST,
      getIPFSAppCapabilityRegistry(VIRTUAL_DESKTOP_APP_MANIFEST),
      { generatedAt: '2026-07-08T00:00:00.000Z' },
    );
    actualFs.mkdirSync(dirname(jsonPath), { recursive: true });
    actualFs.writeFileSync(jsonPath, `${JSON.stringify(bindingMatrix, null, 2)}\n`);
    actualFs.writeFileSync(markdownPath, renderAllToolsAppBindingsMarkdown(bindingMatrix));
  });

  it('binds every ledger tool exactly once and writes evidence artifacts', () => {
    expect(bindingMatrix.tool_count).toBe(ledger.tools.length);
    expect(bindingMatrix.rows).toHaveLength(ledger.tools.length);
    expect(new Set(bindingMatrix.rows.map(row => row.tool_id)).size).toBe(ledger.tools.length);
    expect(actualFs.existsSync(jsonPath)).toBe(true);
    expect(actualFs.existsSync(markdownPath)).toBe(true);
  });

  it('validates app-visible schema, renderer, fallback, and policy references', () => {
    const result = validateAllToolsAppBindingMatrix(
      bindingMatrix,
      ledger,
      policyMatrix,
      VIRTUAL_DESKTOP_APP_MANIFEST,
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    for (const row of bindingMatrix.rows.filter(candidate => candidate.app_visible)) {
      expect(row.policy_ref).toContain(row.tool_id);
      expect(row.normalized_disposition).toBeTruthy();
      expect(row.input_schema_available).toBe(true);
      expect(row.result_renderer).toBeTruthy();
      expect(row.glasses_fallback).toBeTruthy();
      expect(row.app_id).toBeTruthy();
      expect(row.capability_id).toBeTruthy();
    }
  });

  it('maps representative tools to existing, generated, desktop-only, and supervisor-only dispositions', () => {
    expect(row('ipfs_kit_py:IPFS.ipfs_cat')).toEqual(
      expect.objectContaining({
        disposition: 'existing_app_capability',
        app_id: 'ipfs-explorer',
        capability_id: 'ipfs.kit.tool.ipfs_cat',
      }),
    );
    expect(row('ipfs_datasets_py:web_archive_tools.brave_search')).toEqual(
      expect.objectContaining({
        disposition: 'generated_descriptor_app_capability',
        app_id: 'datasets-browser',
      }),
    );
    expect(row('ipfs_datasets_py:wallet_tools.wallet_create')).toEqual(
      expect.objectContaining({
        disposition: 'desktop_mobile_only',
        normalized_disposition: 'unsafe_without_human_review',
        app_visible: false,
      }),
    );
    expect(row('ipfs_accelerate_py:tools_dispatch')).toEqual(
      expect.objectContaining({
        disposition: 'supervisor_only_internal',
        normalized_disposition: 'server_internal',
        app_visible: false,
      }),
    );
  });

  it('does not leave app-visible tools without confirmation when policy requires it', () => {
    const riskyVisible = bindingMatrix.rows.filter(row => (
      row.app_visible && row.policy_class !== 'read'
    ));

    expect(riskyVisible.length).toBeGreaterThan(0);
    for (const row of riskyVisible) {
      expect(row.confirmation_policy).not.toBe('none');
      expect(row.receipt_policy).toBe('required_for_side_effects');
      expect(row.glasses_exposure).not.toBe('native_display_allowed');
    }
  });
});

function row(toolId: string) {
  const found = bindingMatrix.rows.find(candidate => candidate.tool_id === toolId);
  if (!found) throw new Error(`Missing binding row ${toolId}`);
  return found;
}
