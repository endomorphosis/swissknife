import {
  APP_RESULT_ENVELOPE_SCHEMA,
} from '../../src/services/apps/app-result-envelope';
import {
  COMPOSITE_APP_DESCRIPTORS,
  getCompositeAppDescriptor,
  getCompositeAppDescriptorCatalog,
  validateCompositeAppDescriptorCatalog,
} from '../../src/services/apps/composite-app-descriptors';
import { getIPFSAppCapabilityRegistry } from '../../src/services/apps/ipfs-app-capability-registry';

const REQUIRED_WORKFLOWS = [
  'file-manager.pin-selected-file',
  'ai-chat.answer-with-cited-dataset-context',
  'training-manager.train-with-dataset',
  'neural-photoshop.generate-and-store-media',
  'task-manager.monitor-accelerate-jobs',
] as const;

describe('composite app descriptors', () => {
  const catalog = getCompositeAppDescriptorCatalog();
  const registry = getIPFSAppCapabilityRegistry();

  it('declares the required cross-service workflows', () => {
    expect(catalog.catalog_id).toBe('org.hallucinate.swissknife.composite-app-descriptors');
    expect(catalog.descriptors).toHaveLength(REQUIRED_WORKFLOWS.length);
    expect(catalog.descriptors.map(descriptor => descriptor.workflow_id).sort()).toEqual(
      [...REQUIRED_WORKFLOWS].sort(),
    );
    expect(COMPOSITE_APP_DESCRIPTORS).toBe(catalog.descriptors);
  });

  it('validates app ids, capability references, result envelopes, and receipt lineage', () => {
    const result = validateCompositeAppDescriptorCatalog(catalog);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    for (const descriptor of catalog.descriptors) {
      expect(descriptor.result_envelope.schema).toBe(APP_RESULT_ENVELOPE_SCHEMA);
      expect(descriptor.result_envelope.required_output_fields).toEqual(
        expect.arrayContaining(['step_results', 'receipt_lineage']),
      );
      expect(descriptor.steps.length).toBeGreaterThanOrEqual(2);
      expect(descriptor.receipt_lineage.required_step_ids).toEqual(
        expect.arrayContaining(
          descriptor.steps
            .filter(step => step.receipt_required)
            .map(step => step.step_id),
        ),
      );
    }
  });

  it('binds every workflow step to an app capability from the IPFS registry', () => {
    const capabilityKeys = new Set(
      registry.capabilities.map(capability => `${capability.app_id}::${capability.capability_id}`),
    );

    for (const descriptor of catalog.descriptors) {
      for (const step of descriptor.steps) {
        expect(capabilityKeys).toContain(`${step.app_id}::${step.capability_id}`);
        expect(descriptor.service_families).toContain(step.service_family);
        expect(step.input_schema.type).toBe('object');
        expect(step.result_schema.type).toBe('object');
      }
    }
  });

  it('models the requested representative workflows with expected service families', () => {
    expect(workflow('file-manager.pin-selected-file')?.service_families).toEqual([
      'ipfs_kit_py',
      'ipfs_datasets_py',
    ]);
    expect(workflow('ai-chat.answer-with-cited-dataset-context')?.service_families).toEqual([
      'ipfs_datasets_py',
      'ipfs_accelerate_py',
      'ipfs_kit_py',
    ]);
    expect(workflow('training-manager.train-with-dataset')?.steps.map(step => step.operation)).toEqual([
      'load_dataset',
      'submit_task',
      'ipfs_add',
    ]);
    expect(workflow('neural-photoshop.generate-and-store-media')?.steps.map(step => step.capability_id)).toEqual([
      'ipfs.accelerate.inference',
      'ipfs.accelerate.jobs',
      'ipfs.kit.storage',
    ]);
    expect(workflow('task-manager.monitor-accelerate-jobs')?.receipt_lineage.parent_links).toEqual([
      {
        step_id: 'record-job-provenance',
        parent_step_ids: ['poll-accelerate-job'],
      },
    ]);
  });

  it('keeps every side-effectful step receipt-backed and DAG-backed where required', () => {
    for (const descriptor of catalog.descriptors) {
      for (const step of descriptor.steps) {
        if (step.kind !== 'read') {
          expect(step.receipt_required).toBe(true);
        }
        if (step.kind === 'write' || step.kind === 'provenance') {
          expect(step.event_dag_required).toBe(true);
          expect(step.writes.length).toBeGreaterThan(0);
        }
      }
    }
  });

  function workflow(id: typeof REQUIRED_WORKFLOWS[number]) {
    return getCompositeAppDescriptor(id, catalog);
  }
});
