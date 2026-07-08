/**
 * @vitest-environment node
 */

import { dirname, join } from 'path';
import type { AllToolsAppBindingMatrix } from '../../src/services/apps/all-tools-app-binding-matrix';
import {
  buildAllToolsCompositeWorkflowCatalog,
  validateAllToolsCompositeWorkflowCatalog,
  type AllToolsCompositeWorkflowCatalog,
} from '../../src/services/apps/all-tools-composite-workflows';

const actualFs = jest.requireActual<typeof import('fs')>('fs');
const evidenceRoot = join(process.cwd(), 'test-results/virtual-desktop-ipfs-mcp-orb');
const bindingsPath = join(evidenceRoot, 'all-tools-app-bindings.json');
const catalogPath = join(evidenceRoot, 'all-tools-composite-workflows.json');

let bindingMatrix: AllToolsAppBindingMatrix;
let catalog: AllToolsCompositeWorkflowCatalog;

describe('all MCP/MCP++ composite workflows', () => {
  beforeAll(() => {
    bindingMatrix = JSON.parse(actualFs.readFileSync(bindingsPath, 'utf8')) as AllToolsAppBindingMatrix;
    catalog = buildAllToolsCompositeWorkflowCatalog(bindingMatrix, {
      generatedAt: '2026-07-08T00:00:00.000Z',
    });
    actualFs.mkdirSync(dirname(catalogPath), { recursive: true });
    actualFs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  });

  it('writes a deterministic seven-workflow catalog from the app binding matrix', () => {
    expect(catalog.schema).toBe('swissknife.all-mcp-tools-composite-workflows.v1');
    expect(catalog.generated_from).toContain(bindingMatrix.matrix_id);
    expect(catalog.workflow_count).toBe(7);
    expect(catalog.step_count).toBe(27);
    expect(actualFs.existsSync(catalogPath)).toBe(true);
    expect(Object.values(catalog.required_category_coverage).every(Boolean)).toBe(true);
  });

  it('validates step metadata, cleanup references, and event DAG lineage', () => {
    const validation = validateAllToolsCompositeWorkflowCatalog(catalog, bindingMatrix);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);

    const rowsByToolId = new Map(bindingMatrix.rows.map(row => [row.tool_id, row]));
    for (const workflow of catalog.workflows) {
      expect(workflow.glasses_fallback_summary).toBeTruthy();
      expect(workflow.cleanup_behavior.strategy).toBeTruthy();
      expect(workflow.event_dag.nodes).toHaveLength(workflow.steps.length);
      expect(workflow.event_dag.root_event_cid).toBe(workflow.steps[0].event_node.event_cid);
      expect(workflow.event_dag.terminal_event_cid).toBe(workflow.steps[workflow.steps.length - 1].event_node.event_cid);

      for (const [index, step] of workflow.steps.entries()) {
        const row = rowsByToolId.get(step.tool_id);
        expect(row).toBeTruthy();
        expect(step.service_id).toBe(row?.service_id);
        expect(step.policy_class).toBe(row?.policy_class);
        expect(step.confirmation_policy).toBe(row?.confirmation_policy);
        expect(step.receipt_policy).toBe(row?.receipt_policy);
        expect(step.input_contract.consumes_state_keys).toBeDefined();
        expect(step.output_contract.produces_state_keys.length).toBeGreaterThan(0);
        expect(step.event_node.node_id).toBe(step.step_id);
        expect(step.event_node.event_cid).toMatch(/^bafyworkflow[0-9a-f]{16}$/);
        if (index === 0) {
          expect(step.event_node.parents).toEqual([]);
        } else {
          expect(step.event_node.parents).toEqual([workflow.steps[index - 1].step_id]);
        }
      }
    }
  });

  it('covers the required cross-service workflow chains', () => {
    expect(workflow('storage_to_provenance').service_chain).toEqual(['ipfs_kit_py', 'ipfs_datasets_py']);
    expect(workflow('dataset_to_vector').service_chain).toEqual(['ipfs_datasets_py']);
    expect(workflow('search_to_inference').service_chain).toEqual(['ipfs_datasets_py', 'ipfs_accelerate_py']);
    expect(workflow('media_generation_to_ipfs').service_chain).toEqual(['ipfs_datasets_py', 'ipfs_kit_py']);
    expect(workflow('hardware_selection_to_job').service_chain).toEqual(['ipfs_accelerate_py']);
    expect(workflow('admin_reporting').service_chain).toEqual([
      'ipfs_kit_py',
      'ipfs_datasets_py',
      'ipfs_accelerate_py',
    ]);

    expect(stepToolIds('storage_to_provenance')).toEqual([
      'ipfs_kit_py:IPFS.ipfs_add',
      'ipfs_datasets_py:provenance_tools.record_provenance',
      'ipfs_kit_py:pin_add',
    ]);
    expect(stepToolIds('search_to_inference')).toEqual([
      'ipfs_datasets_py:web_archive_tools.brave_search',
      'ipfs_datasets_py:file_converter_tools.generate_summary',
      'ipfs_accelerate_py:run_inference_job',
      'ipfs_accelerate_py:ProvenanceLogger.log_inference',
    ]);
  });

  it('keeps wallet and credential workflows as desktop or mobile handoffs', () => {
    const wallet = workflow('wallet_credential_safe');
    const credentialSteps = wallet.steps.filter(step => step.policy_class === 'credential');

    expect(wallet.requires_desktop_mobile_handoff).toBe(true);
    expect(credentialSteps.length).toBeGreaterThanOrEqual(3);
    for (const step of credentialSteps) {
      expect(step.app_visible).toBe(false);
      expect(step.normalized_disposition).toBe('unsafe_without_human_review');
      expect(step.confirmation_policy).toBe('desktop_or_mobile_only');
      expect(step.glasses.fallback).toBe('desktop_or_mobile_only');
      expect(step.glasses.directly_displayable).toBe(false);
    }
    expect(wallet.cleanup_behavior.cleanup_tool_ids).toContain('ipfs_datasets_py:wallet_tools.wallet_revoke_grant');
  });

  it('marks accelerate steps outside the configured compatibility bridge as adapter-required', () => {
    const searchInference = workflow('search_to_inference');
    const hardwareJob = workflow('hardware_selection_to_job');
    const adapterSteps = [...searchInference.steps, ...hardwareJob.steps]
      .filter(step => step.service_id === 'ipfs_accelerate_py' && step.adapter_required);

    expect(adapterSteps.map(step => step.tool_id)).toEqual([
      'ipfs_accelerate_py:run_inference_job',
      'ipfs_accelerate_py:ProvenanceLogger.log_inference',
      'ipfs_accelerate_py:submit_task',
      'ipfs_accelerate_py:job_status',
      'ipfs_accelerate_py:PrometheusMetrics.generate_metrics',
    ]);
    for (const step of adapterSteps) {
      expect(step.adapter_note).toContain('SVD-031');
    }
    expect(hardwareJob.steps.find(step => step.tool_id === 'ipfs_accelerate_py:hardware_recommend')?.adapter_required).toBe(false);
  });
});

function workflow(category: string) {
  const found = catalog.workflows.find(candidate => candidate.category === category);
  if (!found) throw new Error(`Missing workflow category ${category}`);
  return found;
}

function stepToolIds(category: string): string[] {
  return workflow(category).steps.map(step => step.tool_id);
}
