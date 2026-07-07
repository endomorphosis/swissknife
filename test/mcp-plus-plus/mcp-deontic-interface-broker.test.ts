import {
  projectDeonticInterface,
  checkPolicyConsistency,
  conformProjectionToDevice,
  buildConstrainedInterfaceModel,
  createDeonticORBEvaluator,
  interfaceToIDLProfile,
  defaultInvokeCapability,
  PolicyEngine,
  type DeviceInteractionProfile,
  type Policy,
} from '../../src/services/mcp/mcp-deontic-interface-broker';
import {
  MCPCapabilityRouter,
  LocalORBTransportAdapter,
  createDefaultORBAdapters,
  type ORBDescriptorSource,
} from '../../src/services/mcp/mcp-orb-capability-router';
import { generateSchemaDrivenUI } from '../../src/services/mcp/mcp-schema-ui-generator';
import { compileIDLToGlassesDisplay } from '../../src/services/glasses/idl-to-glasses-compiler';
import { ipfsDatasetsUIProfileDescriptor } from '../../src/services/mcp/mcp-ipfs-ui-descriptors';
import type { InterfaceDescriptor } from '../../src/services/mcp/mcp-idl';
import type { MCPUIProfileDescriptor } from '../../src/services/mcp/mcp-ui-profile';
import type { ControlSurfacePolicyEvaluationRequest } from '../../src/services/mcp/control-surface-mediator';

const DATASET_INTERFACE_CID = 'sha256:dataset-fixture';

function datasetDescriptor(): InterfaceDescriptor {
  return ipfsDatasetsUIProfileDescriptor as InterfaceDescriptor;
}

/** Permit everything, then carve out `publish` with an explicit prohibition. */
function permitAllExceptPublish(): Policy {
  return {
    id: 'dataset-policy',
    version: '1.0.0',
    permissions: [{ cap: '*', rsc: '*' }],
    prohibitions: [{ cap: 'mcp++/invoke:publish', rsc: '*' }],
    obligations: [],
  };
}

// A synthetic descriptor with N simple methods for device-conform tests.
function syntheticDescriptor(methods: string[]): InterfaceDescriptor {
  return {
    name: 'synthetic-service',
    namespace: 'test',
    version: '1.0.0',
    methods: methods.map(name => ({ name })),
    errors: [],
    requires: [],
    compatibility: {},
  };
}

describe('Deontic Interface Broker — projection', () => {
  it('projects permitted / prohibited states onto a real interface descriptor', () => {
    const projection = projectDeonticInterface(datasetDescriptor(), permitAllExceptPublish());

    expect(projection.interface_cid).toMatch(/^sha256:/);
    expect(projection.prohibited).toEqual(['publish']);
    expect(projection.permitted).toEqual(
      expect.arrayContaining(['browse', 'get', 'index', 'pin', 'sync_status']),
    );
    // prohibited => hidden + deny; permitted => enabled + permit
    expect(projection.policy_decisions.publish).toEqual(
      expect.objectContaining({ outcome: 'deny', visibility: 'hidden' }),
    );
    expect(projection.policy_decisions.browse).toEqual(
      expect.objectContaining({ outcome: 'permit', visibility: 'enabled' }),
    );
  });

  it('marks methods without a matching permission as unavailable (default-deny fragment)', () => {
    const policy: Policy = {
      id: 'read-only',
      version: '1.0.0',
      permissions: [{ cap: defaultInvokeCapability('browse'), rsc: '*' }],
      prohibitions: [],
      obligations: [],
    };
    const projection = projectDeonticInterface(datasetDescriptor(), policy);

    expect(projection.permitted).toEqual(['browse']);
    expect(projection.unavailable).toEqual(
      expect.arrayContaining(['get', 'index', 'pin', 'publish', 'sync_status']),
    );
    expect(projection.policy_decisions.get).toEqual(
      expect.objectContaining({ outcome: 'unavailable', visibility: 'disabled' }),
    );
  });

  it('projects obligations onto permitted methods without denying them', () => {
    const policy: Policy = {
      id: 'audited',
      version: '1.0.0',
      permissions: [{ cap: '*', rsc: '*' }],
      prohibitions: [],
      obligations: [
        { description: 'Record access in the audit log', requiredCap: 'mcp++/audit' },
      ],
    };
    const projection = projectDeonticInterface(datasetDescriptor(), policy);

    expect(projection.obligated).toEqual(
      expect.arrayContaining(['browse', 'get', 'pin', 'publish']),
    );
    expect(projection.permitted).toEqual([]);
    const browse = projection.methods.find(m => m.method === 'browse')!;
    expect(browse.state).toBe('obligated');
    expect(browse.obligations.map(o => o.description)).toContain('Record access in the audit log');
    // Still invokable in the UI (enabled), with the obligation surfaced as a reason.
    expect(projection.policy_decisions.browse.outcome).toBe('permit');
    expect(projection.policy_decisions.browse.reasons?.[0]).toMatch(/Obligation:/);
  });

  it('does not mutate the shared runtime obligation ledger during projection', () => {
    const engine = PolicyEngine.getInstance();
    const before = engine.getActiveObligations().length;
    projectDeonticInterface(datasetDescriptor(), {
      id: 'p', version: '1', permissions: [{ cap: '*', rsc: '*' }], prohibitions: [],
      obligations: [{ description: 'x' }],
    });
    // projection uses a throwaway engine — the singleton ledger is untouched.
    expect(PolicyEngine.getInstance().getActiveObligations().length).toBe(before);
  });
});

describe('Deontic Interface Broker — consistency', () => {
  it('treats a broad permission with a narrow prohibition as consistent (exception, not contradiction)', () => {
    const result = checkPolicyConsistency(permitAllExceptPublish());
    expect(result.consistent).toBe(true);
    expect(result.conflicts).toEqual([]);
  });

  it('flags an identical permission+prohibition as a dead-permission contradiction', () => {
    const result = checkPolicyConsistency({
      id: 'c', version: '1',
      permissions: [{ cap: 'mcp++/invoke:pin', rsc: 'sha256:x' }],
      prohibitions: [{ cap: 'mcp++/invoke:pin', rsc: 'sha256:x' }],
      obligations: [],
    });
    expect(result.consistent).toBe(false);
    expect(result.conflicts[0].kind).toBe('permission_prohibition');
  });

  it('flags an obligation whose required capability is prohibited (unsatisfiable)', () => {
    const result = checkPolicyConsistency({
      id: 'c', version: '1',
      permissions: [{ cap: '*', rsc: '*' }],
      prohibitions: [{ cap: 'mcp++/audit', rsc: '*' }],
      obligations: [{ description: 'audit', requiredCap: 'mcp++/audit' }],
    });
    expect(result.consistent).toBe(false);
    expect(result.conflicts.some(c => c.kind === 'obligation_prohibition')).toBe(true);
  });
});

describe('Deontic Interface Broker — device conform', () => {
  const glasses: DeviceInteractionProfile = {
    device_id: 'meta-glasses',
    max_actions: 3,
    max_text_blocks: 4,
    update_hz: 2,
    input_modalities: ['gesture', 'voice'],
    output_modalities: ['display', 'audio'],
    has_display: true,
    has_audio: true,
  };

  it('drops prohibited methods and caps surviving actions to the device action budget', () => {
    const descriptor = syntheticDescriptor(['a', 'b', 'c', 'd', 'e']);
    const policy: Policy = {
      id: 'p', version: '1',
      permissions: [{ cap: '*', rsc: '*' }],
      prohibitions: [{ cap: defaultInvokeCapability('e'), rsc: '*' }],
      obligations: [],
    };
    const projection = projectDeonticInterface(descriptor, policy);
    const conformed = conformProjectionToDevice(projection, glasses);

    expect(conformed.excluded_prohibited).toEqual(['e']);
    expect(conformed.actions).toHaveLength(3); // capped at max_actions
    expect(conformed.excluded_over_budget).toEqual(['d']); // a,b,c surfaced; d over budget; e prohibited
    expect(conformed.actions.every(a => a.input_modality === 'gesture')).toBe(true);
    expect(conformed.primary_output).toBe('display');
    expect(conformed.auto_compile_options.maxActions).toBe(3);
  });

  it('prioritizes obligated actions and warns when an obligation exceeds the action budget', () => {
    const descriptor = syntheticDescriptor(['a', 'b', 'c', 'd']);
    const policy: Policy = {
      id: 'p', version: '1',
      permissions: [{ cap: '*', rsc: '*' }],
      prohibitions: [],
      obligations: [{ description: 'confirm each write', requiredCap: 'mcp++/confirm' }],
    };
    const projection = projectDeonticInterface(descriptor, policy);
    const twoActionDevice: DeviceInteractionProfile = { ...glasses, max_actions: 2 };
    const conformed = conformProjectionToDevice(projection, twoActionDevice);

    expect(conformed.actions).toHaveLength(2);
    expect(conformed.required_actions).toEqual(conformed.actions.map(a => a.method));
    expect(conformed.warnings.some(w => /undischargeable/i.test(w))).toBe(true);
  });

  it('drops unavailable methods and falls back to audio output on a display-less device', () => {
    const descriptor = syntheticDescriptor(['a', 'b']);
    const policy: Policy = {
      id: 'p', version: '1',
      permissions: [{ cap: defaultInvokeCapability('a'), rsc: '*' }],
      prohibitions: [],
      obligations: [],
    };
    const projection = projectDeonticInterface(descriptor, policy);
    const earbuds: DeviceInteractionProfile = {
      device_id: 'audio-only',
      max_actions: 3,
      input_modalities: ['voice'],
      output_modalities: ['audio'],
      has_display: false,
      has_audio: true,
    };
    const conformed = conformProjectionToDevice(projection, earbuds);

    // 'b' is unavailable and there is no display to show it disabled -> dropped.
    expect(conformed.actions.map(a => a.method)).toEqual(['a']);
    expect(conformed.primary_output).toBe('audio');
  });
});

describe('Deontic Interface Broker — end-to-end constrained model', () => {
  it('drives both the desktop UI generator and the glasses compiler from one formal-logic policy', () => {
    const glasses: DeviceInteractionProfile = {
      device_id: 'meta-glasses',
      max_actions: 3,
      input_modalities: ['gesture', 'voice'],
      output_modalities: ['display', 'audio'],
      has_display: true,
      has_audio: true,
    };

    const model = buildConstrainedInterfaceModel(datasetDescriptor(), permitAllExceptPublish(), {
      devices: [glasses],
      ui: { display_name: 'Datasets', category: 'storage' },
    });

    expect(model.consistency.consistent).toBe(true);
    expect(model.devices['meta-glasses']).toBeDefined();
    // permitted_idl_profile excludes the prohibited method.
    expect(model.permitted_idl_profile.methods.map(m => m.name)).not.toContain('publish');

    // Desktop: feed policy_decisions into the existing schema-driven UI generator.
    const ui = generateSchemaDrivenUI(
      ipfsDatasetsUIProfileDescriptor as MCPUIProfileDescriptor,
      undefined,
      { policy_decisions: model.projection.policy_decisions },
    );
    const publishCmd = ui.commands.find(c => c.operation === 'publish');
    const browseCmd = ui.commands.find(c => c.operation === 'browse');
    expect(publishCmd?.hidden).toBe(true);
    expect(browseCmd?.hidden).toBeFalsy();

    // Glasses: compile the permitted profile with the device-conformed options.
    const display = compileIDLToGlassesDisplay(
      model.permitted_idl_profile,
      model.devices['meta-glasses'].auto_compile_options,
    );
    expect(display.constraints.max_actions).toBe(3);
    expect(display.actions.length).toBeLessThanOrEqual(3);
    // The prohibited method never reaches the HUD.
    expect(display.actions.every(a => !JSON.stringify(a).includes('publish'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ORB runtime wiring: the same formal logic gates real invocations
// ---------------------------------------------------------------------------

function localDatasetSource(): ORBDescriptorSource {
  const descriptor = JSON.parse(JSON.stringify(ipfsDatasetsUIProfileDescriptor)) as MCPUIProfileDescriptor;
  descriptor.services = descriptor.services.map(service => ({
    ...service,
    transport: 'local',
    endpoint: 'local://ipfs_datasets_py',
  }));
  return { cid: DATASET_INTERFACE_CID, descriptor };
}

function allowControlSurface(request: ControlSurfacePolicyEvaluationRequest) {
  return {
    outcome: 'allow' as const,
    reasons: ['test allow'],
    explanation: `allowed ${request.interaction_envelope.normalized_intent.method}`,
    metadata: {},
  };
}

describe('Deontic Interface Broker — ORB evaluator', () => {
  it('maps PolicyEngine outcomes into the ORB deontic evaluation shape', () => {
    const engine = new PolicyEngine();
    const cid = engine.registerPolicy({
      id: 'p', version: '1',
      permissions: [{ cap: '*', rsc: '*' }],
      prohibitions: [{ cap: 'mcp++/invoke:publish', rsc: '*' }],
      obligations: [{ description: 'audit access' }],
    });
    const evaluator = createDeonticORBEvaluator(engine);

    const permit = evaluator.evaluate({ policy_cid: cid, capability: 'mcp++/invoke:browse', resource: 'sha256:x' });
    expect(permit.outcome).toBe('OBLIGATION_SPAWNED');
    expect(permit.obligations.map(o => o.description)).toContain('audit access');

    const deny = evaluator.evaluate({ policy_cid: cid, capability: 'mcp++/invoke:publish', resource: 'sha256:x' });
    expect(deny.outcome).toBe('DENY');
    expect(deny.reasons.join(' ')).toMatch(/Prohibited/);
  });

  it('attaches deontic obligations to a permitted ORB authorization', async () => {
    const engine = new PolicyEngine();
    const policyCid = engine.registerPolicy({
      id: 'p', version: '1',
      permissions: [{ cap: '*', rsc: '*' }],
      prohibitions: [],
      obligations: [{ description: 'record provenance', requiredCap: 'mcp++/audit' }],
    });
    const local = new LocalORBTransportAdapter();
    local.registerHandler('browse', () => ({ entries: [] }));
    const router = new MCPCapabilityRouter({
      adapters: createDefaultORBAdapters(local),
      control_surface_policy_evaluator: allowControlSurface,
      deontic_evaluator: createDeonticORBEvaluator(engine),
    });
    const binding = await router.bind({ descriptors: [localDatasetSource()], operation: 'browse' });

    const decision = await router.authorize(binding.handle, { root: '/' }, {
      capabilities: ['dataset/read'],
      policy_cid: policyCid,
    });

    expect(decision.outcome).toBe('permit');
    expect(decision.obligations?.map(o => o.description)).toContain('record provenance');
  });

  it('flips a capability-permitted authorization to deny when the deontic policy prohibits it', async () => {
    const engine = new PolicyEngine();
    const policyCid = engine.registerPolicy({
      id: 'p', version: '1',
      permissions: [{ cap: '*', rsc: '*' }],
      prohibitions: [{ cap: 'mcp++/invoke:browse', rsc: '*' }],
      obligations: [],
    });
    const local = new LocalORBTransportAdapter();
    local.registerHandler('browse', () => ({ entries: [] }));
    const router = new MCPCapabilityRouter({
      adapters: createDefaultORBAdapters(local),
      control_surface_policy_evaluator: allowControlSurface,
      deontic_evaluator: createDeonticORBEvaluator(engine),
    });
    const binding = await router.bind({ descriptors: [localDatasetSource()], operation: 'browse' });

    const decision = await router.authorize(binding.handle, { root: '/' }, {
      capabilities: ['dataset/read'],
      policy_cid: policyCid,
    });

    expect(decision.outcome).toBe('deny');
    expect(decision.reasons.join(' ')).toMatch(/Prohibited/);
  });

  it('is a no-op when no deontic evaluator is configured (backward compatible)', async () => {
    const local = new LocalORBTransportAdapter();
    local.registerHandler('browse', () => ({ entries: [] }));
    const router = new MCPCapabilityRouter({
      adapters: createDefaultORBAdapters(local),
      control_surface_policy_evaluator: allowControlSurface,
    });
    const binding = await router.bind({ descriptors: [localDatasetSource()], operation: 'browse' });

    const decision = await router.authorize(binding.handle, { root: '/' }, {
      capabilities: ['dataset/read'],
      policy_cid: 'sha256:ignored',
    });

    expect(decision.outcome).toBe('permit');
    expect(decision.obligations).toBeUndefined();
  });
});

describe('Deontic Interface Broker — IDL adapter', () => {
  it('adapts an interface descriptor to an IDL profile, restricting to allowed methods', () => {
    const profile = interfaceToIDLProfile(datasetDescriptor(), { methods: ['browse', 'get'] });
    expect(profile.methods.map(m => m.name)).toEqual(['browse', 'get']);
    expect(profile.methods[0].inputSchema.type).toBe('object');
  });
});
