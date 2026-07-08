/**
 * Tests for the Deontic UI Manifest bridge (Round 52) — the headless transform
 * from a formal-logic policy + interface contract into a JSON-serialisable UI
 * manifest, the deontic-enforcing action binding, and the tool-list → IDL
 * descriptor adapter. No browser, React, or backend required.
 */

import {
  buildDeonticUIManifest,
  invokeControl,
  interfaceDescriptorFromToolList,
  type DeonticUIControl,
  type ManifestToolInvoker,
} from '../../src/services/apps/mcp-deontic-ui-manifest';
import { ipfsDatasetsUIProfileDescriptor } from '../../src/services/ipfs/mcp-ipfs-ui-descriptors';
import {
  RemoteDeonticEngine,
  type DeonticLogicConnector,
} from '../../src/services/mcp/mcp-remote-deontic-engine';
import type { InterfaceDescriptor } from '../../src/services/mcp/mcp-idl';
import type { Policy, DeviceInteractionProfile } from '../../src/services/mcp/mcp-deontic-interface-broker';

// --- fixtures ---------------------------------------------------------------

function datasetDescriptor(): InterfaceDescriptor {
  return ipfsDatasetsUIProfileDescriptor as InterfaceDescriptor;
}

function syntheticDescriptor(methods: Array<string | { name: string; input_schema?: Record<string, unknown> }>): InterfaceDescriptor {
  return {
    name: 'synthetic-service',
    namespace: 'test',
    version: '1.0.0',
    methods: methods.map(m => (typeof m === 'string' ? { name: m } : m)),
    errors: [],
    requires: [],
    compatibility: {},
  };
}

function permitAll(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'p',
    version: '1.0.0',
    permissions: [{ cap: '*', rsc: '*' }],
    prohibitions: [],
    obligations: [],
    ...overrides,
  };
}

function permitAllExceptPublish(): Policy {
  return {
    id: 'dataset-policy',
    version: '1.0.0',
    permissions: [{ cap: '*', rsc: '*' }],
    prohibitions: [{ cap: 'mcp++/invoke:publish', rsc: '*' }],
    obligations: [],
  };
}

const glasses: DeviceInteractionProfile = {
  device_id: 'meta-glasses',
  max_actions: 3,
  input_modalities: ['gesture', 'voice'],
  output_modalities: ['display', 'audio'],
  has_display: true,
  has_audio: true,
};

const HEALTHY = { status: 'healthy', healthy: 3, total: 3, modules: {} };

class MockLogicConnector implements DeonticLogicConnector {
  constructor(private readonly responses: Record<string, unknown> = {}) {}
  async dispatch(_category: string, tool: string, _params: Record<string, unknown>): Promise<unknown> {
    return this.responses[tool] ?? { success: false, error: `no mock for ${tool}` };
  }
}

// --- default panel ----------------------------------------------------------

describe('buildDeonticUIManifest — default panel', () => {
  it('emits one default panel; prohibited methods are hidden, permitted are enabled', async () => {
    const manifest = await buildDeonticUIManifest(datasetDescriptor(), permitAllExceptPublish(), {
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(manifest.panels).toHaveLength(1);
    const panel = manifest.panels[0];
    expect(panel.device_id).toBe('__default__');
    expect(manifest.default_device_id).toBe('__default__');

    // publish is prohibited → suppressed from controls, recorded as hidden.
    expect(panel.hidden_methods).toContain('publish');
    expect(panel.controls.map(c => c.method)).not.toContain('publish');

    // browse is permitted → an enabled control with the invoke capability.
    const browse = panel.controls.find(c => c.method === 'browse');
    expect(browse).toBeDefined();
    expect(browse!.state).toBe('enabled');
    expect(browse!.capability).toBe('mcp++/invoke:browse');
    expect(browse!.label).toBe('Browse');

    // metadata
    expect(manifest.consistent).toBe(true);
    expect(manifest.remote_checked).toBe(false);
    expect(manifest.interface.name).toBe(datasetDescriptor().name);
    expect(manifest.generated_at).toBe('2026-07-01T00:00:00.000Z');
    expect(manifest.interface_cid).toMatch(/^sha256:/);
  });

  it('produces a fully JSON-serialisable manifest (round-trips unchanged)', async () => {
    const manifest = await buildDeonticUIManifest(datasetDescriptor(), permitAllExceptPublish(), {
      now: new Date('2026-07-01T00:00:00.000Z'),
    });
    const round = JSON.parse(JSON.stringify(manifest));
    expect(round).toEqual(manifest);
  });

  it('maps no-permission methods to disabled controls carrying a reason', async () => {
    const policy = permitAll({ permissions: [{ cap: 'mcp++/invoke:browse', rsc: '*' }] });
    const manifest = await buildDeonticUIManifest(syntheticDescriptor(['browse', 'pin', 'sync']), policy);
    const panel = manifest.panels[0];

    const browse = panel.controls.find(c => c.method === 'browse')!;
    const pin = panel.controls.find(c => c.method === 'pin')!;
    expect(browse.state).toBe('enabled');
    expect(pin.state).toBe('disabled');
    expect(typeof pin.reason).toBe('string');
    expect(pin.reason!.length).toBeGreaterThan(0);
    expect(pin.required).toBe(false);
    // nothing prohibited here
    expect(panel.hidden_methods).toHaveLength(0);
  });
});

// --- obligations + ordering -------------------------------------------------

describe('buildDeonticUIManifest — obligations & ordering', () => {
  it('pins obligated controls first, hides prohibited, disables the un-permitted, numbers order', async () => {
    const policy = permitAll({
      permissions: [
        { cap: 'mcp++/invoke:act', rsc: '*' },
        { cap: 'mcp++/invoke:wait', rsc: '*' },
      ],
      prohibitions: [{ cap: 'mcp++/invoke:banned', rsc: '*' }],
      obligations: [{ description: 'Record an audit entry', requiredCap: 'mcp++/invoke:audit', rsc: '*' }],
    });
    const manifest = await buildDeonticUIManifest(
      syntheticDescriptor(['act', 'wait', 'banned', 'unknown']),
      policy,
    );
    const panel = manifest.panels[0];

    // banned prohibited → hidden, not a control
    expect(panel.hidden_methods).toContain('banned');

    const byMethod = Object.fromEntries(panel.controls.map(c => [c.method, c]));
    expect(byMethod.act.state).toBe('obligated');
    expect(byMethod.wait.state).toBe('obligated');
    expect(byMethod.unknown.state).toBe('disabled');

    // obligated pinned before disabled
    expect(byMethod.act.order).toBeLessThan(byMethod.unknown.order);
    expect(byMethod.wait.order).toBeLessThan(byMethod.unknown.order);

    // obligated carries the obligation payload + required flag
    expect(byMethod.act.required).toBe(true);
    expect(byMethod.act.obligations.length).toBeGreaterThan(0);
    expect(byMethod.act.obligations[0].description).toBe('Record an audit entry');
    expect(byMethod.unknown.required).toBe(false);

    // order fields are a dense 0..n-1 sequence
    const orders = panel.controls.map(c => c.order).sort((a, b) => a - b);
    expect(orders).toEqual(panel.controls.map((_, i) => i));
  });

  it('carries an obligation deadline through to the control', async () => {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const policy = permitAll({
      obligations: [{ description: 'Confirm within the hour', deadline }],
    });
    const manifest = await buildDeonticUIManifest(syntheticDescriptor(['go']), policy);
    const go = manifest.panels[0].controls.find(c => c.method === 'go')!;
    expect(go.state).toBe('obligated');
    expect(go.obligations[0].deadline).toBe(deadline);
  });
});

// --- device panels ----------------------------------------------------------

describe('buildDeonticUIManifest — device panels', () => {
  it('conforms to a device: budget cap, over-budget list, chosen output modalities', async () => {
    const policy = permitAll({
      obligations: [{ description: 'Ack', requiredCap: 'mcp++/invoke:ack', rsc: '*' }],
    });
    const manifest = await buildDeonticUIManifest(
      syntheticDescriptor(['a', 'b', 'c', 'd', 'e']),
      policy,
      { devices: [glasses] },
    );

    expect(manifest.panels).toHaveLength(1);
    const panel = manifest.panels[0];
    expect(panel.device_id).toBe('meta-glasses');
    expect(manifest.default_device_id).toBe('meta-glasses');

    // 5 obligated actions, budget 3 → 3 rendered, 2 over budget
    expect(panel.controls).toHaveLength(3);
    expect(panel.over_budget_methods).toHaveLength(2);
    expect(panel.controls.every(c => c.state === 'obligated')).toBe(true);

    // output modality resolved from the device profile
    expect(panel.primary_output).toBe('display');
    // input modality bound from the device's preference order
    expect(panel.controls[0].input_modality).toBe('gesture');
  });
});

// --- invokeControl (deontic enforcement at the call boundary) ---------------

describe('invokeControl — deontic enforcement + connector binding', () => {
  function control(overrides: Partial<DeonticUIControl>): DeonticUIControl {
    return {
      method: 'ping',
      label: 'Ping',
      capability: 'mcp++/invoke:ping',
      state: 'enabled',
      required: false,
      obligations: [],
      input_modality: null,
      order: 0,
      ...overrides,
    };
  }

  it('dispatches an enabled dotted control by (category, tool)', async () => {
    const calls: Array<{ category: string; tool: string; params: unknown }> = [];
    const connector: ManifestToolInvoker = {
      async dispatch(category, tool, params) {
        calls.push({ category, tool, params });
        return { ok: true };
      },
    };
    const res = await invokeControl(control({ method: 'system.health_check', state: 'enabled' }), connector, { a: 1 });
    expect(res).toEqual({ ok: true });
    expect(calls).toEqual([{ category: 'system', tool: 'health_check', params: { a: 1 } }]);
  });

  it('falls back to callTool for a bare method when no dispatch exists', async () => {
    const calls: Array<{ name: string; args: unknown }> = [];
    const connector: ManifestToolInvoker = {
      async callTool(name, args) {
        calls.push({ name, args });
        return { content: [] };
      },
    };
    await invokeControl(control({ method: 'ping', state: 'enabled' }), connector, { x: 2 });
    expect(calls).toEqual([{ name: 'ping', args: { x: 2 } }]);
  });

  it('honours an explicit category override', async () => {
    const calls: Array<{ category: string; tool: string }> = [];
    const connector: ManifestToolInvoker = {
      async dispatch(category, tool) {
        calls.push({ category, tool });
        return null;
      },
    };
    await invokeControl(control({ method: 'read_file', state: 'obligated' }), connector, {}, { category: 'Files' });
    expect(calls).toEqual([{ category: 'Files', tool: 'read_file' }]);
  });

  it('refuses to invoke a hidden (prohibited) control', async () => {
    const connector: ManifestToolInvoker = { async dispatch() { throw new Error('should not be called'); } };
    await expect(
      invokeControl(control({ state: 'hidden', reason: 'Prohibited by policy' }), connector),
    ).rejects.toThrow(/prohibited/i);
  });

  it('refuses to invoke a disabled (unavailable) control', async () => {
    const connector: ManifestToolInvoker = { async callTool() { throw new Error('should not be called'); } };
    await expect(
      invokeControl(control({ state: 'disabled', reason: 'No matching permission' }), connector),
    ).rejects.toThrow(/unavailable/i);
  });
});

// --- tool-list → IDL descriptor adapter -------------------------------------

describe('interfaceDescriptorFromToolList', () => {
  it('turns a hierarchical tool listing into an IDL descriptor with schemas', async () => {
    const descriptor = interfaceDescriptorFromToolList(
      { name: 'ipfs-kit', namespace: 'ipfs_kit_py', version: '0.2.0' },
      [
        { name: 'system.health_check', inputSchema: { type: 'object', properties: {} } },
        { name: 'files.read_file' },
      ],
    );
    expect(descriptor.name).toBe('ipfs-kit');
    expect(descriptor.namespace).toBe('ipfs_kit_py');
    expect(descriptor.methods).toHaveLength(2);

    // Feed it straight through the manifest pipeline.
    const manifest = await buildDeonticUIManifest(descriptor, permitAll());
    const panel = manifest.panels[0];
    const health = panel.controls.find(c => c.method === 'system.health_check')!;
    expect(health.state).toBe('enabled');
    expect(health.label).toBe('Health Check');
    expect(health.input_schema).toEqual({ type: 'object', properties: {} });
  });
});

// --- remote consistency augmentation ----------------------------------------

describe('buildDeonticUIManifest — remote TDFOL consistency', () => {
  it('folds a prover-detected contradiction into the manifest', async () => {
    const engine = new RemoteDeonticEngine({
      connector: new MockLogicConnector({ logic_health: HEALTHY, tdfol_prove: { proved: true } }),
    });
    const manifest = await buildDeonticUIManifest(syntheticDescriptor(['x']), permitAll(), {
      remoteEngine: engine,
    });
    expect(manifest.remote_checked).toBe(true);
    expect(manifest.remote_inconsistent).toBe(true);
    expect(manifest.consistent).toBe(false);
    expect(manifest.conflicts.length).toBeGreaterThan(0);
  });

  it('reports consistent when the prover cannot derive a contradiction', async () => {
    const engine = new RemoteDeonticEngine({
      connector: new MockLogicConnector({ logic_health: HEALTHY, tdfol_prove: { proved: false } }),
    });
    const manifest = await buildDeonticUIManifest(syntheticDescriptor(['x']), permitAll(), {
      remoteEngine: engine,
    });
    expect(manifest.remote_checked).toBe(true);
    expect(manifest.remote_inconsistent).toBe(false);
    expect(manifest.consistent).toBe(true);
  });

  it('retains local result when the remote engine is unavailable', async () => {
    const engine = new RemoteDeonticEngine({
      connector: new MockLogicConnector({ logic_health: { status: 'unavailable' } }),
    });
    const manifest = await buildDeonticUIManifest(syntheticDescriptor(['x']), permitAll(), {
      remoteEngine: engine,
    });
    expect(manifest.remote_checked).toBe(false);
    expect(manifest.consistent).toBe(true);
  });
});
