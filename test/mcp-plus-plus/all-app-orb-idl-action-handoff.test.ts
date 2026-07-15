/**
 * @vitest-environment node
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_APP_LIVE_TOOL_BINDINGS } from '../../src/services/apps/all-app-live-tool-bindings';
import { AGENT_SUPERVISOR_CONSOLE_CONTRACT } from '../../src/services/mcp/agent-supervisor-console-gateway';
import {
  ALL_APP_ORB_IDL_ACTION_HANDOFF_SCHEMA,
  ALL_APP_ORB_IDL_ACTION_HANDOFF_TASK_ID,
  OrbIdlActionHandoffCompileError,
  buildEligibleAllAppOrbIdlActionRoutes,
  buildSimulatorActionHandoffDeviceCapabilities,
  compileAllAppOrbIdlActionHandoff,
} from '../../src/services/glasses/all-app-orb-idl-action-handoff';
import { buildVirtualDesktopOrbIdlCompleteCoverage } from '../../src/services/glasses/desktop-orb-idl-contract';

const EVIDENCE_PATH = join(
  process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb', 'all-app-orb-idl-action-handoff.json',
);
const GENERATED_AT = '2026-07-15T00:00:00.000Z';

function buildCatalog() {
  return compileAllAppOrbIdlActionHandoff(
    buildEligibleAllAppOrbIdlActionRoutes(),
    buildVirtualDesktopOrbIdlCompleteCoverage().descriptors,
    buildSimulatorActionHandoffDeviceCapabilities(),
    { generatedAt: GENERATED_AT },
  );
}

describe('SVD-110 exhaustive ORB/IDL action handoff contracts', () => {
  it('compiles every eligible live binding and Supervisor desktop action into reviewed evidence', () => {
    const catalog = buildCatalog();
    mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
    writeFileSync(EVIDENCE_PATH, `${JSON.stringify(catalog, null, 2)}\n`);

    expect(catalog).toMatchObject({
      schema: ALL_APP_ORB_IDL_ACTION_HANDOFF_SCHEMA,
      task_id: ALL_APP_ORB_IDL_ACTION_HANDOFF_TASK_ID,
      generated_at: GENERATED_AT,
      live_binding_packet_count: ALL_APP_LIVE_TOOL_BINDINGS.bindings.length,
      supervisor_action_packet_count: AGENT_SUPERVISOR_CONSOLE_CONTRACT.capabilities.length,
    });
    expect(catalog.packet_count).toBe(
      ALL_APP_LIVE_TOOL_BINDINGS.bindings.length + AGENT_SUPERVISOR_CONSOLE_CONTRACT.capabilities.length,
    );
    expect(new Set(catalog.packets.map(packet => packet.packet_id)).size).toBe(catalog.packet_count);
    expect(new Set(catalog.packets.map(packet => packet.packet_cid)).size).toBe(catalog.packet_count);
    expect(JSON.parse(readFileSync(EVIDENCE_PATH, 'utf8'))).toEqual(catalog);
  });

  it('includes every required deterministic handoff field with binding, DID, consent, provenance, rollback, and fallback', () => {
    const catalog = buildCatalog();
    for (const packet of catalog.packets) {
      expect(packet.packet_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(packet.interface_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(packet.action_id).toBeTruthy();
      expect(packet.binding_id).toBeTruthy();
      expect(packet.peer_did).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
      expect(packet.capability_profile.profile_id).toMatch(/^mcp\+\+:/);
      expect(packet.capability_profile.required_profiles).toEqual(expect.arrayContaining(['A', 'B', 'D', 'F']));
      expect(packet.capability_profile.transports).toEqual(expect.arrayContaining(['http']));
      expect(['permitted', 'confirmation_required', 'denied', 'unavailable']).toContain(packet.permission.state);
      expect(['not_required', 'required', 'granted', 'denied']).toContain(packet.permission.consent);
      expect(packet.correlation_id).toMatch(/^svd110-/);
      expect(packet.tool_ref.gateway_route).toBe('/mcp/tools/call');
      expect(packet.tool_refs).toEqual([packet.tool_ref]);
      expect(packet.receipt_refs).toHaveLength(1);
      expect(packet.receipt_refs[0].cid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(packet.event_dag_refs).toHaveLength(1);
      expect(packet.event_dag_refs[0].cid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(packet.modality_constraints.map(constraint => constraint.modality))
        .toEqual(['display', 'camera', 'speaker', 'microphone', 'input']);
      expect(packet.rollback.recovery_errors.length).toBeGreaterThan(0);
      expect(packet.selected_fallback.kind).toBeTruthy();
      expect(packet.selected_fallback.target_surface).toBeTruthy();
    }

    const steering = catalog.packets.find(packet => packet.action_id === 'supervisor.prompt-steering.request');
    expect(steering).toMatchObject({
      permission: { state: 'confirmation_required', consent: 'required', execution_allowed: false },
      selected_fallback: { selected: true, reason: 'consent_required' },
    });
  });

  it('is byte-deterministic regardless of route and descriptor input order', () => {
    const routes = buildEligibleAllAppOrbIdlActionRoutes();
    const descriptors = buildVirtualDesktopOrbIdlCompleteCoverage().descriptors;
    const device = buildSimulatorActionHandoffDeviceCapabilities();
    const first = compileAllAppOrbIdlActionHandoff(routes, descriptors, device, { generatedAt: GENERATED_AT });
    const repeated = compileAllAppOrbIdlActionHandoff([...routes].reverse(), [...descriptors].reverse(), device, {
      generatedAt: GENERATED_AT,
    });
    expect(JSON.stringify(repeated)).toBe(JSON.stringify(first));
  });

  it('rejects a route whose materialized live binding is missing', () => {
    const routes = buildEligibleAllAppOrbIdlActionRoutes();
    const missing = routes[0].binding_id;
    const liveBindings = {
      ...ALL_APP_LIVE_TOOL_BINDINGS,
      bindings: ALL_APP_LIVE_TOOL_BINDINGS.bindings.filter(binding => binding.binding_id !== missing),
    };
    expect(() => compileAllAppOrbIdlActionHandoff(
      routes,
      buildVirtualDesktopOrbIdlCompleteCoverage().descriptors,
      buildSimulatorActionHandoffDeviceCapabilities(),
      { liveBindings },
    )).toThrow(expect.objectContaining<Partial<OrbIdlActionHandoffCompileError>>({
      code: 'MISSING_LIVE_BINDING',
      subject: routes[0].route_id,
    }));
  });

  it('rejects invalid device capability declarations before emitting a partial packet catalog', () => {
    const device = buildSimulatorActionHandoffDeviceCapabilities();
    const invalidDevice = {
      ...device,
      modalities: device.modalities.map(capability => capability.modality === 'display'
        ? { ...capability, available: false, fallback_available: false }
        : capability),
    };
    expect(() => compileAllAppOrbIdlActionHandoff(
      buildEligibleAllAppOrbIdlActionRoutes(),
      buildVirtualDesktopOrbIdlCompleteCoverage().descriptors,
      invalidDevice,
    )).toThrow(expect.objectContaining<Partial<OrbIdlActionHandoffCompileError>>({
      code: 'INVALID_DEVICE_CAPABILITY',
      subject: 'display',
    }));
  });
});
