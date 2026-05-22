import {
  generateOperationForm,
  generateResultRenderer,
  generateSchemaDrivenUI,
  validateGeneratedOperationInput,
} from '../../src/services/mcp-schema-ui-generator';
import {
  ipfsAccelerateUIProfileDescriptor,
  ipfsDatasetsUIProfileDescriptor,
} from '../../src/services/mcp-ipfs-ui-descriptors';

describe('MCP schema-driven UI generator', () => {
  it('generates dataset commands, forms, renderers, and expected field widgets', () => {
    const generated = generateSchemaDrivenUI(ipfsDatasetsUIProfileDescriptor);
    const pinForm = generated.forms.find(form => form.operation === 'pin');
    const syncRenderer = generated.result_renderers.find(renderer => renderer.operation === 'sync_status');

    expect(generated.template).toBe('explorer');
    expect(generated.commands.map(command => command.operation)).toEqual(
      ['browse', 'get', 'index', 'pin', 'publish', 'sync_status'],
    );
    expect(pinForm?.fields.find(field => field.path === 'cid')?.widget).toBe('cid-picker');
    expect(syncRenderer?.fields.find(field => field.path === 'status')?.widget).toBe('status-badge');
    expect(syncRenderer?.fields.find(field => field.path === 'progress')?.widget).toBe('progress-timeline');
    expect(generated.widgets.some(widget => widget.widget === 'policy-denial-panel')).toBe(true);
    expect(generated.widgets.some(widget => widget.widget === 'provenance-panel')).toBe(true);
  });

  it('generates inference job controls and telemetry renderers', () => {
    const generated = generateSchemaDrivenUI(ipfsAccelerateUIProfileDescriptor);
    const runForm = generated.forms.find(form => form.operation === 'run_inference_job');
    const telemetryRenderer = generated.result_renderers.find(renderer => renderer.operation === 'telemetry');

    expect(generated.template).toBe('job-console');
    expect(runForm?.fields.find(field => field.path === 'dataset_cid')?.widget).toBe('cid-picker');
    expect(runForm?.fields.find(field => field.path === 'publish_artifacts')?.widget).toBe('checkbox');
    expect(telemetryRenderer?.fields.find(field => field.path === 'events')?.widget).toBe('list-editor');
    expect(generated.widgets.some(widget => widget.surface === 'stream' && widget.operation === 'telemetry')).toBe(true);
  });

  it('validates generated operation inputs against field schema constraints', () => {
    const operation = ipfsDatasetsUIProfileDescriptor.data_contracts.operations
      .find(candidate => candidate.method === 'publish');
    if (!operation) {
      throw new Error('publish operation missing');
    }
    const form = generateOperationForm(ipfsDatasetsUIProfileDescriptor, operation);

    expect(validateGeneratedOperationInput(form, {
      dataset_id: 'dataset-1',
      source_cid: 'bafybeigdyrzt5sample',
      destination: 'ipfs',
    }).valid).toBe(true);

    const invalid = validateGeneratedOperationInput(form, {
      dataset_id: 'dataset-1',
      destination: 'invalid-destination',
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors.map(error => error.path)).toEqual(
      expect.arrayContaining(['source_cid', 'destination']),
    );
  });

  it('selects renderer kinds from output schemas and stream profiles', () => {
    const browse = ipfsDatasetsUIProfileDescriptor.data_contracts.operations
      .find(candidate => candidate.method === 'browse');
    const pin = ipfsDatasetsUIProfileDescriptor.data_contracts.operations
      .find(candidate => candidate.method === 'pin');
    if (!browse || !pin) {
      throw new Error('fixture operations missing');
    }

    expect(generateResultRenderer(ipfsDatasetsUIProfileDescriptor, browse).kind).toBe('table');
    expect(generateResultRenderer(ipfsDatasetsUIProfileDescriptor, pin).kind).toBe('timeline');
  });
});
