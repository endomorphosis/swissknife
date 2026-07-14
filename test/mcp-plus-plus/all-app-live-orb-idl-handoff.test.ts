/**
 * @vitest-environment node
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { VIRTUAL_DESKTOP_APP_MANIFEST } from '../../src/services/apps/virtual-desktop-app-manifest';
import {
  ALL_APP_LIVE_ORB_IDL_HANDOFF_SCHEMA,
  ALL_APP_LIVE_ORB_IDL_HANDOFF_TASK_ID,
  OrbIdlHandoffCompileError,
  buildAgentSupervisorLiveRoutes,
  buildAllAppRoutesFromLiveBackendContract,
  compileAllAppLiveOrbIdlHandoff,
  type AllAppLiveBackendContract,
  type AllAppLiveOrbIdlHandoffCatalog,
  type LiveOrbIdlActionRoute,
} from '../../src/services/glasses/all-app-live-orb-idl-handoff';
import {
  buildVirtualDesktopOrbIdlCompleteCoverage,
  type DesktopOrbIdlAppDescriptor,
} from '../../src/services/glasses/desktop-orb-idl-contract';

const EVIDENCE_ROOT = join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const LIVE_CONTRACT_PATH = join(EVIDENCE_ROOT, 'app-backend-contract.json');
const HANDOFF_PATH = join(EVIDENCE_ROOT, 'all-app-live-orb-idl-handoff.json');
const GENERATED_AT = '2026-07-13T00:00:00.000Z';
const MODALITIES = ['display', 'camera', 'speaker', 'microphone', 'input'] as const;

let contract: AllAppLiveBackendContract;
let descriptors: DesktopOrbIdlAppDescriptor[];
let routes: LiveOrbIdlActionRoute[];
let catalog: AllAppLiveOrbIdlHandoffCatalog;

describe('SVD-098 current all-app live ORB/IDL handoff packets', () => {
  beforeAll(() => {
    contract = JSON.parse(readFileSync(LIVE_CONTRACT_PATH, 'utf8')) as AllAppLiveBackendContract;
    descriptors = [...buildVirtualDesktopOrbIdlCompleteCoverage(VIRTUAL_DESKTOP_APP_MANIFEST).descriptors];
    routes = [
      ...buildAllAppRoutesFromLiveBackendContract(contract, VIRTUAL_DESKTOP_APP_MANIFEST),
      ...buildAgentSupervisorLiveRoutes(),
    ];
    catalog = compileAllAppLiveOrbIdlHandoff(routes, descriptors, {
      generatedAt: GENERATED_AT,
      generatedFrom: [
        'test-results/virtual-desktop-ipfs-mcp-orb/app-backend-contract.json',
        'src/services/glasses/desktop-orb-idl-contract.ts',
        'src/services/mcp/agent-supervisor-console-gateway.ts',
      ],
    });
  });

  it('compiles every tested app action and every Supervisor Console route', () => {
    const appIds = new Set(catalog.packets.map(packet => packet.app_id));
    const primaryPackets = catalog.packets.filter(packet => packet.route_id.startsWith('app:'));
    const supervisorActions = catalog.packets.filter(packet => packet.route_id.startsWith('supervisor:'));

    expect(catalog).toMatchObject({
      schema: ALL_APP_LIVE_ORB_IDL_HANDOFF_SCHEMA,
      task_id: ALL_APP_LIVE_ORB_IDL_HANDOFF_TASK_ID,
      generated_at: GENERATED_AT,
      packet_count: VIRTUAL_DESKTOP_APP_MANIFEST.apps.length + 10,
      app_count: VIRTUAL_DESKTOP_APP_MANIFEST.apps.length,
      descriptor_count: VIRTUAL_DESKTOP_APP_MANIFEST.apps.length,
      interface_cid_count: VIRTUAL_DESKTOP_APP_MANIFEST.apps.length,
      supervisor_packet_count: 11,
    });
    expect([...appIds].sort()).toEqual(VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => app.id).sort());
    expect(primaryPackets).toHaveLength(VIRTUAL_DESKTOP_APP_MANIFEST.apps.length);
    expect(supervisorActions).toHaveLength(10);
    expect(supervisorActions.map(packet => packet.action_id).sort()).toEqual([
      'supervisor.goals.read',
      'supervisor.health.read',
      'supervisor.logs.read',
      'supervisor.prompt-steering.request',
      'supervisor.queue.read',
      'supervisor.receipts.read',
      'supervisor.run-history.search',
      'supervisor.subgoals.read',
      'supervisor.task-control.request',
      'supervisor.taskboard.links.read',
    ]);
    expect(existsSync(HANDOFF_PATH)).toBe(true);
    // The release packet is a checked-in handoff artifact, not a test side
    // effect. This equality check fails on descriptor/route drift until the
    // reviewed packet catalog is deliberately refreshed.
    expect(JSON.parse(readFileSync(HANDOFF_PATH, 'utf8'))).toEqual(catalog);
  });

  it('carries the complete deterministic ORB/IDL and provenance handoff envelope', () => {
    expect(new Set(catalog.packets.map(packet => packet.packet_id)).size).toBe(catalog.packet_count);
    expect(new Set(catalog.packets.map(packet => packet.packet_cid)).size).toBe(catalog.packet_count);

    for (const packet of catalog.packets) {
      expect(packet.packet_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(packet.interface_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(packet.action_id).toBeTruthy();
      expect(packet.method_id).toBeTruthy();
      expect(packet.backend_method_id).toBeTruthy();
      expect(packet.owner).toBeTruthy();
      expect(packet.correlation_id).toMatch(/^svd09[67]-/);
      expect(packet.capability_profile.profile_id).toMatch(/^mcp\+\+:/);
      expect(packet.capability_profile_id).toBe(packet.capability_profile.profile_id);
      expect(packet.capability_profile.required_profiles).toEqual(expect.arrayContaining(['A', 'B', 'D', 'F']));
      expect(packet.capability_profile.capabilities.length).toBeGreaterThan(0);
      expect(['permitted', 'confirmation_required', 'denied', 'unavailable'])
        .toContain(packet.permission.state);
      expect(packet.permission_state).toBe(packet.permission.state);
      expect(packet.receipt_refs).toHaveLength(1);
      expect(packet.receipt_refs[0].cid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(packet.event_dag_refs).toHaveLength(1);
      expect(packet.event_dag_refs[0].cid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(packet.rollback_behavior.semantics).toBeTruthy();
      expect(packet.fallback_selection.kind).toBeTruthy();
      expect(packet.fallback_selection.target_surface).toBeTruthy();
    }
  });

  it('encodes display and expanded I/O constraints with a visible deterministic fallback selection', () => {
    for (const packet of catalog.packets) {
      expect(packet.modality_constraints.map(constraint => constraint.modality)).toEqual(MODALITIES);
      expect(packet.modality_constraints).toHaveLength(5);
      for (const constraint of packet.modality_constraints) {
        expect(constraint.availability).toBeTruthy();
        expect(constraint.fallback_kind).toBeTruthy();
        expect(constraint.fallback_surface).toBeTruthy();
        expect(constraint.fallback_reason).toBeTruthy();
      }
    }

    const nonPermittedPackets = catalog.packets.filter(packet => packet.permission.state !== 'permitted');
    expect(nonPermittedPackets.every(packet => packet.fallback_selection.selected)).toBe(true);
    expect(nonPermittedPackets.every(packet => packet.fallback_selection.user_visible)).toBe(true);
    expect(catalog.packets
      .filter(packet => packet.fallback_selection.selected)
      .every(packet => packet.fallback_selection.reason !== 'direct_route_available')).toBe(true);

    const steering = catalog.packets.find(packet => packet.action_id === 'supervisor.prompt-steering.request');
    const taskControl = catalog.packets.find(packet => packet.action_id === 'supervisor.task-control.request');
    expect(steering).toMatchObject({
      app_id: 'agent-supervisor',
      method_id: 'request_prompt_steering',
      backend_method_id: 'agent_supervisor.prompt_steering.request',
      owner: 'ipfs_accelerate_py',
      requested_modality: 'input',
      permission: { state: 'confirmation_required', confirmation_required: true, execution_allowed: false },
      rollback_behavior: { mode: 'compensating_receipt', required: true },
      fallback_selection: { selected: true, reason: 'confirmation_required' },
    });
    expect(taskControl).toMatchObject({
      method_id: 'request_action',
      permission: { state: 'confirmation_required' },
      rollback_behavior: { mode: 'compensating_receipt', required: true },
    });
  });

  it('is byte-deterministic regardless of route and descriptor input order', () => {
    const repeated = compileAllAppLiveOrbIdlHandoff([...routes].reverse(), [...descriptors].reverse(), {
      generatedAt: GENERATED_AT,
      generatedFrom: [...catalog.generated_from].reverse(),
    });
    expect(JSON.stringify(repeated)).toBe(JSON.stringify(catalog));
  });

  it('fails closed when a live backend route has no matching descriptor', () => {
    const terminalDescriptor = descriptors.find(descriptor => descriptor.app_id === 'terminal');
    expect(terminalDescriptor).toBeTruthy();
    const withoutTerminal = descriptors.filter(descriptor => descriptor !== terminalDescriptor);

    expect(() => compileAllAppLiveOrbIdlHandoff(routes, withoutTerminal)).toThrow(
      expect.objectContaining<Partial<OrbIdlHandoffCompileError>>({
        code: 'DESCRIPTOR_NOT_FOUND',
        route_id: 'app:terminal:primary',
      }),
    );
  });

  it('fails closed when the descriptor does not expose the route method or its CID is stale', () => {
    const invalidMethodRoute = { ...routes[0], method_id: 'missing_live_backend_method' };
    expect(() => compileAllAppLiveOrbIdlHandoff([invalidMethodRoute], descriptors)).toThrow(
      expect.objectContaining<Partial<OrbIdlHandoffCompileError>>({ code: 'METHOD_NOT_FOUND' }),
    );

    const descriptor = descriptors.find(item => item.descriptor_id === routes[0].descriptor_id);
    if (!descriptor) {
      throw new Error(`Missing test descriptor ${routes[0].descriptor_id}`);
    }
    const staleDescriptor: DesktopOrbIdlAppDescriptor = {
      ...descriptor,
      idl_descriptor: {
        ...descriptor.idl_descriptor,
        semanticTags: [...(descriptor.idl_descriptor.semanticTags ?? []), 'stale-contract'],
      },
    };
    expect(() => compileAllAppLiveOrbIdlHandoff(
      [routes[0]],
      descriptors.map(item => item === descriptor ? staleDescriptor : item),
    )).toThrow(expect.objectContaining<Partial<OrbIdlHandoffCompileError>>({
      code: 'DESCRIPTOR_CID_MISMATCH',
    }));
  });
});
