import {
  escapeGeneratedUIText,
  generateOperationForm,
  generateResultRenderer,
  generateSchemaDrivenUI,
  validateGeneratedOperationInput,
} from '../../src/services/mcp/mcp-schema-ui-generator';
import {
  ipfsAccelerateUIProfileDescriptor,
  ipfsDatasetInferenceWorkflowDescriptor,
  ipfsDatasetsUIProfileDescriptor,
<<<<<<< HEAD
} from '../../src/services/mcp/mcp-ipfs-ui-descriptors';
=======
} from '../../src/services/ipfs/mcp-ipfs-ui-descriptors';
>>>>>>> 1569811 (chore: add pending swissknife staged changes)

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

  it('keeps a built-in audit/provenance region for generated workflow lineage', () => {
    const generated = generateSchemaDrivenUI(ipfsDatasetInferenceWorkflowDescriptor);

    expect(generated.regions.find(region => region.id === 'workflow-audit')?.kind).toBe('audit');
    expect(generated.result_renderers
      .find(renderer => renderer.operation === 'publish_artifact')
      ?.fields.find(field => field.path === 'provenance')?.widget).toBe('provenance-panel');
    expect(generated.widgets.some(widget => widget.widget === 'provenance-panel')).toBe(true);
  });

  it('renders policy-aware command states for permitted, denied, and hidden operations', () => {
    const generated = generateSchemaDrivenUI(ipfsDatasetsUIProfileDescriptor, undefined, {
      policy_decisions: {
        browse: { outcome: 'permit', visibility: 'enabled' },
        pin: { outcome: 'deny', visibility: 'disabled', reasons: ['Missing capability: <dataset/pin>'] },
        publish: { outcome: 'unavailable', visibility: 'hidden', reasons: ['Circuit breaker open'] },
      },
    });
    const browse = generated.commands.find(command => command.operation === 'browse');
    const pin = generated.commands.find(command => command.operation === 'pin');
    const publish = generated.commands.find(command => command.operation === 'publish');

    expect(browse?.policy_outcome).toBe('permit');
    expect(pin?.disabled_reason).toBe('Missing capability: &lt;dataset/pin&gt;');
    expect(pin?.denial_reasons).toEqual(['Missing capability: &lt;dataset/pin&gt;']);
    expect(publish?.hidden).toBe(true);
    expect(publish?.policy_outcome).toBe('unavailable');
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

  it('selects DID widgets and escapes generated UI text', () => {
    const descriptor = JSON.parse(JSON.stringify(ipfsDatasetsUIProfileDescriptor));
    const operation = {
      method: 'delegate',
      title: '<Delegate>',
      input_schema: {
        type: 'object',
        required: ['audience_did'],
        properties: {
          audience_did: { type: 'string' },
          capability: { type: 'string' },
        },
      },
      output_schema: {
        type: 'object',
        properties: {
          status: { type: 'string' },
        },
      },
    };
    descriptor.methods = [{ name: 'delegate' }];
    descriptor.data_contracts = { operations: [operation] };
    descriptor.permissions = { default_deny: true, operations: { delegate: ['ucan/delegate'] } };
    descriptor.ui = {
      primary_template: 'form-wizard',
      templates: [{ kind: 'form-wizard', operations: ['delegate'] }],
    };
    descriptor.services = [{ id: 'primary', interface_type: 'generic', operations: ['delegate'] }];

    const generated = generateSchemaDrivenUI(descriptor);
    const delegateForm = generated.forms[0];

    expect(delegateForm.fields.find(field => field.path === 'audience_did')?.widget).toBe('did-input');
    expect(generated.widgets.some(widget => widget.widget === 'policy-denial-panel')).toBe(true);
    expect(escapeGeneratedUIText('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
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

  it('keeps controls stable for optional fields, nested objects, arrays, enums, and type unions', () => {
    const descriptor = JSON.parse(JSON.stringify(ipfsDatasetsUIProfileDescriptor));
    const operation = {
      method: 'configure',
      input_schema: {
        type: 'object',
        required: ['mode', 'settings'],
        properties: {
          mode: { type: 'string', enum: ['fast', 'safe'] },
          tags: { type: 'array', items: { type: 'string' } },
          optional_note: { type: ['string', 'null'] },
          settings: {
            type: 'object',
            additionalProperties: false,
            required: ['retries'],
            properties: {
              retries: { type: 'integer', minimum: 0 },
              enabled: { type: 'boolean' },
            },
          },
        },
      },
      output_schema: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          rows: { type: 'array', items: { type: 'object' } },
        },
      },
    };
    descriptor.methods = [{ name: 'configure' }];
    descriptor.data_contracts = { operations: [operation] };
    descriptor.permissions = { default_deny: false, operations: { configure: [] } };
    descriptor.ui = {
      primary_template: 'form-wizard',
      templates: [{ kind: 'form-wizard', operations: ['configure'] }],
    };
    descriptor.services = [{ id: 'primary', interface_type: 'generic', operations: ['configure'] }];

    const form = generateOperationForm(descriptor, operation);
    const renderer = generateResultRenderer(descriptor, operation);

    expect(form.fields.map(field => field.path)).toEqual([
      'mode',
      'tags',
      'optional_note',
      'settings.retries',
      'settings.enabled',
    ]);
    expect(form.fields.find(field => field.path === 'mode')?.widget).toBe('select');
    expect(form.fields.find(field => field.path === 'tags')?.widget).toBe('list-editor');
    expect(form.fields.find(field => field.path === 'optional_note')?.required).toBe(false);
    expect(form.fields.find(field => field.path === 'settings.retries')?.required).toBe(true);
    expect(form.fields.find(field => field.path === 'settings.enabled')?.widget).toBe('checkbox');
    expect(renderer.kind).toBe('table');

    expect(validateGeneratedOperationInput(form, {
      mode: 'fast',
      tags: ['a'],
      optional_note: null,
      settings: { retries: 1, enabled: true },
    }).valid).toBe(true);
  });
});
