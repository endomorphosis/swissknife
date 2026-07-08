/**
 * @vitest-environment node
 */

import { dirname, join } from 'path';
import type { AllToolsAppBindingMatrix } from '../../src/services/apps/all-tools-app-binding-matrix';
import type { AllToolsCompositeWorkflowCatalog } from '../../src/services/apps/all-tools-composite-workflows';
import type { AllToolsLedger } from '../../src/services/apps/all-tools-policy-classifier';
import {
  buildAllToolsIDLDescriptorCatalog,
  validateAllToolsIDLDescriptorCatalog,
  type AllToolsIDLDescriptorCatalog,
} from '../../src/services/mcp/all-tools-idl-generator';
import {
  computeInterfaceCID,
  InterfaceRepository,
} from '../../src/services/mcp/mcp-idl';
import { MCPCapabilityRouter } from '../../src/services/mcp/mcp-orb-capability-router';
import { generateSchemaDrivenUI } from '../../src/services/mcp/mcp-schema-ui-generator';
import { validateMCPUIProfileDescriptor } from '../../src/services/mcp/mcp-ui-profile';

const actualFs = jest.requireActual<typeof import('fs')>('fs');
const evidenceRoot = join(process.cwd(), 'test-results/virtual-desktop-ipfs-mcp-orb');
const ledgerPath = join(evidenceRoot, 'all-tools-ledger.json');
const bindingsPath = join(evidenceRoot, 'all-tools-app-bindings.json');
const workflowsPath = join(evidenceRoot, 'all-tools-composite-workflows.json');
const coveragePath = join(evidenceRoot, 'all-tools-idl-coverage.json');

let ledger: AllToolsLedger;
let bindingMatrix: AllToolsAppBindingMatrix;
let workflowCatalog: AllToolsCompositeWorkflowCatalog;
let catalog: AllToolsIDLDescriptorCatalog;

describe('all MCP/MCP++ tools ORB/IDL descriptor generator', () => {
  beforeAll(() => {
    ledger = readJson<AllToolsLedger>(ledgerPath);
    bindingMatrix = readJson<AllToolsAppBindingMatrix>(bindingsPath);
    workflowCatalog = readJson<AllToolsCompositeWorkflowCatalog>(workflowsPath);
    catalog = buildAllToolsIDLDescriptorCatalog(
      ledger,
      bindingMatrix,
      workflowCatalog,
      { generatedAt: '2026-07-08T00:00:00.000Z' },
    );
    actualFs.mkdirSync(dirname(coveragePath), { recursive: true });
    actualFs.writeFileSync(coveragePath, `${JSON.stringify(catalog, null, 2)}\n`);
  });

  it('writes coverage for every app-routable tool and composite workflow', () => {
    const appVisibleCount = bindingMatrix.rows.filter(row => row.app_visible).length;

    expect(catalog.schema).toBe('swissknife.all-mcp-tools-idl-descriptor-catalog.v1');
    expect(catalog.app_routable_tool_count).toBe(appVisibleCount);
    expect(catalog.app_routable_tool_coverage_count).toBe(appVisibleCount);
    expect(catalog.workflow_count).toBe(workflowCatalog.workflows.length);
    expect(catalog.workflow_coverage_count).toBe(workflowCatalog.workflows.length);
    expect(catalog.workflow_descriptor_count).toBe(7);
    expect(catalog.tool_group_descriptor_count).toBeGreaterThan(25);
    expect(catalog.tool_group_descriptor_count).toBeLessThan(appVisibleCount);
    expect(actualFs.existsSync(coveragePath)).toBe(true);
  });

  it('validates canonical IDL CIDs, method schemas, receipt mappings, and UI profiles', () => {
    const validation = validateAllToolsIDLDescriptorCatalog(
      catalog,
      ledger,
      bindingMatrix,
      workflowCatalog,
    );

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    for (const descriptor of catalog.descriptors) {
      expect(computeInterfaceCID(descriptor.idl_descriptor)).toBe(descriptor.interface_cid);
      expect(descriptor.interface_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(descriptor.error_codes).toContain('POLICY_DENIED');
      expect(descriptor.error_codes).toContain('VALIDATION_ERROR');
      expect(descriptor.method_bindings).toHaveLength(descriptor.method_count);
      expect(validateMCPUIProfileDescriptor(descriptor.ui_profile).conformant).toBe(true);
      const generatedUI = generateSchemaDrivenUI(descriptor.ui_profile);
      expect(generatedUI.commands).toHaveLength(descriptor.method_count);
      expect(generatedUI.forms).toHaveLength(descriptor.method_count);
      expect(generatedUI.result_renderers).toHaveLength(descriptor.method_count);
    }
  });

  it('groups large tool families by category while preserving representative tool mappings', () => {
    const largeGroups = catalog.descriptors.filter(descriptor => (
      descriptor.kind === 'tool_group' && descriptor.method_count >= 10
    ));

    expect(largeGroups.length).toBeGreaterThan(5);
    expect(toolCoverage('ipfs_kit_py:IPFS.ipfs_cat')).toEqual(
      expect.objectContaining({
        app_id: 'ipfs-explorer',
        service_id: 'ipfs_kit_py',
        policy_class: 'read',
      }),
    );
    expect(toolCoverage('ipfs_datasets_py:dataset_tools.load_dataset')).toEqual(
      expect.objectContaining({
        app_id: 'datasets-browser',
        service_id: 'ipfs_datasets_py',
      }),
    );
    expect(toolCoverage('ipfs_accelerate_py:run_inference_job')).toEqual(
      expect.objectContaining({
        app_id: 'accelerate-panel',
        adapter_required: true,
      }),
    );
  });

  it('carries workflow cleanup, glasses fallback, and adapter-required metadata into IDL coverage', () => {
    expect(catalog.workflow_coverage.map(row => row.workflow_id).sort()).toEqual(
      workflowCatalog.workflows.map(workflow => workflow.workflow_id).sort(),
    );
    expect(catalog.tool_coverage.filter(row => row.adapter_required)).toHaveLength(11);
    expect(catalog.adapter_required_method_count).toBeGreaterThan(11);

    const wallet = workflowCoverage('workflow.wallet-credential-safe');
    expect(wallet.cleanup_strategy).toBe('revoke_grant_after_audit');
    expect(wallet.glasses_fallback_summary).toContain('desktop/mobile');
    expect(wallet.adapter_required).toBe(false);

    const hardware = workflowCoverage('workflow.hardware-selection-to-job');
    expect(hardware.adapter_required).toBe(true);
    expect(hardware.service_chain).toContain('ipfs_accelerate_py');
  });

  it('registers generated IDL descriptors and exposes representative operations to the ORB router', async () => {
    const repository = new InterfaceRepository();
    for (const descriptor of catalog.descriptors) {
      expect(repository.register(descriptor.idl_descriptor)).toBe(descriptor.interface_cid);
    }
    expect(repository.list()).toHaveLength(catalog.descriptor_count);

    const representative = toolCoverage('ipfs_datasets_py:web_archive_tools.brave_search');
    const descriptor = catalog.descriptors.find(candidate => candidate.descriptor_id === representative.descriptor_id);
    if (!descriptor) throw new Error(`Missing descriptor ${representative.descriptor_id}`);

    const router = new MCPCapabilityRouter();
    const capabilities = await router.discover({
      descriptors: [{ cid: descriptor.interface_cid, descriptor: descriptor.ui_profile }],
      operation: representative.method,
      app_id: representative.app_id,
    });
    expect(capabilities).toHaveLength(1);
    expect(capabilities[0].interface_cid).toBe(descriptor.interface_cid);
    expect(capabilities[0].operation.method).toBe(representative.method);
    const binding = await router.bind({ capability: capabilities[0] });
    expect(binding.interface_cid).toBe(descriptor.interface_cid);
    expect(binding.operation.method).toBe(representative.method);
  });
});

function readJson<T>(filePath: string): T {
  return JSON.parse(actualFs.readFileSync(filePath, 'utf8')) as T;
}

function toolCoverage(toolId: string) {
  const row = catalog.tool_coverage.find(candidate => candidate.tool_id === toolId);
  if (!row) throw new Error(`Missing tool coverage ${toolId}`);
  return row;
}

function workflowCoverage(workflowId: string) {
  const row = catalog.workflow_coverage.find(candidate => candidate.workflow_id === workflowId);
  if (!row) throw new Error(`Missing workflow coverage ${workflowId}`);
  return row;
}
