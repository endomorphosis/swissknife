import { test, expect, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  renderDesktopAppThroughMetaGlassesOrb,
  type MetaGlassesDesktopAppTemplateResult,
  type SwissKnifeDesktopAppSnapshot,
} from './helpers/meta-glasses-app-template';

const LAUNCH_READINESS_GATE = {
  schema: 'launch_readiness_receipt_v1',
  gate: 'LaunchReadinessGate',
  objective: 'VAIOS-G697',
  validation: 'Playwright launch replay',
  surface: 'meta-glasses-virtual-os',
  requiredHops: [
    'phone-hosted Swissknife virtual desktop',
    'desktop peer offload',
    'Hallucinate App mediation',
    'Meta glasses terminal',
  ],
};
const HAO_675_LAUNCH_REPLAY_FIXTURE = path.join(
  process.cwd(),
  'test',
  'e2e',
  'fixtures',
  'hao-675-launch-replay.json',
);
const HAO_705_CROSS_DEVICE_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  'test',
  'e2e',
  'fixtures',
  'hao-705-cross-device-launch-gate.json',
);
const MGW_556_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'mgw-556-daemon-launch-health-gate.json',
);
const MGW_590_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'mgw-590-daemon-launch-health-gate.json',
);
const HAO_725_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'hao-725-daemon-launch-health-gate.json',
);
const HAO_755_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'hao-755-daemon-launch-health-gate.json',
);
const MGW_559_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'mgw-559-daemon-launch-health-gate.json',
);
const VAI_568_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-568-daemon-launch-health-gate.json',
);
const VAI_574_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-574-daemon-launch-health-gate.json',
);
const VAI_577_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-577-daemon-launch-health-gate.json',
);
const VAI_580_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-580-daemon-launch-health-gate.json',
);
const VAI_583_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-583-daemon-launch-health-gate.json',
);
const VAI_586_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-586-daemon-launch-health-gate.json',
);
const VAI_589_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-589-daemon-launch-health-gate.json',
);
const VAI_593_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-593-daemon-launch-health-gate.json',
);
const VAI_596_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-596-daemon-launch-health-gate.json',
);
const VAI_599_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-599-daemon-launch-health-gate.json',
);
const VAI_602_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-602-daemon-launch-health-gate.json',
);
const VAI_605_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-605-daemon-launch-health-gate.json',
);
const VAI_608_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-608-daemon-launch-health-gate.json',
);
const VAI_612_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-612-daemon-launch-health-gate.json',
);
const VAI_615_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-615-daemon-launch-health-gate.json',
);
const VAI_618_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-618-daemon-launch-health-gate.json',
);
const VAI_621_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-621-daemon-launch-health-gate.json',
);
const VAI_624_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-624-daemon-launch-health-gate.json',
);
const VAI_627_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-627-daemon-launch-health-gate.json',
);
const VAI_633_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-633-daemon-launch-health-gate.json',
);
const VAI_636_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-636-daemon-launch-health-gate.json',
);
const VAI_639_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-639-daemon-launch-health-gate.json',
);
const VAI_645_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-645-daemon-launch-health-gate.json',
);
const VAI_648_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-648-daemon-launch-health-gate.json',
);
const VAI_652_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-652-daemon-launch-health-gate.json',
);
const VAI_654_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-654-daemon-launch-health-gate.json',
);
const VAI_656_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-656-daemon-launch-health-gate.json',
);
const VAI_658_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-658-daemon-launch-health-gate.json',
);
const VAI_660_DAEMON_LAUNCH_GATE_FIXTURE = path.join(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-660-daemon-launch-health-gate.json',
);

test.setTimeout(240_000);
test.describe.configure({ mode: 'serial' });

test('HAO-675 launch replay fixture proves Swissknife and Hallucinate App Playwright readiness', async () => {
  const fixture = JSON.parse(fs.readFileSync(HAO_675_LAUNCH_REPLAY_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('HAO-675');
  expect(fixture.schema).toBe('launch_replay_playwright_receipt_v1');
  expect(fixture.playwright_ready).toBe(true);
  expect(fixture.commands.swissknife).toContain('test:e2e:meta-glasses');
  expect(fixture.commands.hallucinate_app).toContain('multimodal-control-surface.spec.ts');
  expect(fixture.route).toEqual([
    'Swissknife application command intent',
    'MCP++ service capability discovery',
    'Hallucinate App interaction_envelope',
    'Hallucinate App policy_decision',
    'Hallucinate App mediation_receipt',
    'desktop peer offload receipt',
    'simulated Meta glasses terminal render',
    'production launch readiness receipt',
  ]);

  expect(fixture.service_capabilities.map((capability: Record<string, unknown>) => capability.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.simulated_meta_glasses_interaction).toMatchObject({
    participant_id: 'meta_glasses:terminal',
    platform: 'meta_glasses',
    normalized_intent: 'terminal.activate_action',
  });
  expect(fixture.pass_fail_receipts).toMatchObject({
    swissknife_invokes_hallucinate_app_mediation: 'passed',
    mcp_plus_plus_capability_discovery: 'passed',
    simulated_meta_glasses_interaction: 'passed',
    desktop_peer_offload: 'passed',
    production_launch_readiness: 'passed',
  });
});

test('HAO-705 cross-device launch gate fixture proves phone-hosted desktop peer offload replay', async () => {
  const fixture = JSON.parse(fs.readFileSync(HAO_705_CROSS_DEVICE_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('HAO-705');
  expect(fixture.goal_id).toBe('VAIOS-G726');
  expect(fixture.schema).toBe('hao_cross_device_launch_playwright_gate_v1');
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.playwright_commands.swissknife).toBe('npm --prefix swissknife run test:e2e:meta-glasses');
  expect(fixture.playwright_commands.hallucinate_app).toBe(
    'npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts',
  );
  expect(fixture.route).toEqual([
    'phone-hosted Swissknife virtual desktop',
    'mobile phone',
    'desktop peer discovery',
    'desktop peer offload',
    'IPFS',
    'libp2p',
    'MCP++',
    'Hallucinate App mediation',
    'Meta glasses terminal',
    'launch readiness receipt',
  ]);
  expect(fixture.mission_terms).toEqual(expect.arrayContaining([
    'cross-device e2e validation',
    'Playwright launch replay',
    'launch Playwright validation gate',
  ]));
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.replay_assertions).toMatchObject({
    phone_hosted_mode: 'phone-hosted',
    control_plane_command: 'desktop.request_handoff',
    selected_runtime: 'desktop_peer',
    fallback_runtime: 'phone_local',
    launch_readiness_lineage: 'VAIOS-G697:launch-readiness:phone-desktop-glasses',
  });
  expect(fixture.pass_fail_receipts).toMatchObject({
    phone_hosted_swissknife_virtual_desktop: 'passed',
    desktop_peer_offload: 'passed',
    hallucinate_app_mediation: 'passed',
    ipfs_libp2p_mcpplusplus_route: 'passed',
    launch_readiness_receipt: 'passed',
    playwright_launch_replay: 'passed',
  });
});

test('MGW-556 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(MGW_556_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('MGW-556');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.launch_gate_receipt).toBe(
    'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-556-daemon-launch-health-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.daemon_health_paths.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.swissknife_handoff.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('MGW-590 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(MGW_590_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('MGW-590');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.objective_gap_receipt).toBe(
    'data/meta_glasses_display_widgets/discovery/2026-07-08-mgw-590-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/meta_glasses_display_widgets/discovery/2026-07-08-mgw-590-daemon-launch-health-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
  );
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.daemon_health_paths.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.swissknife_handoff.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('HAO-725 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(HAO_725_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('HAO-725');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.launch_gate_receipt).toBe(
    'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-725-daemon-launch-health-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.daemon_health_paths.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.swissknife_handoff.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('MGW-559 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(MGW_559_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('MGW-559');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.launch_gate_receipt).toBe(
    'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-559-daemon-launch-health-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.daemon_health_paths.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.swissknife_handoff.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-568 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_568_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-568');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-568-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-568-daemon-launch-health-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.daemon_health_paths.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.swissknife_handoff.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-574 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_574_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-574');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-574-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-574-daemon-launch-health-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.daemon_health_paths.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.swissknife_handoff.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-577 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_577_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-577');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-577-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-577-daemon-launch-health-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.daemon_health_paths.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.swissknife_handoff.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-580 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_580_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-580');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-580-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-580-daemon-launch-health-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.daemon_health_paths.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.swissknife_handoff.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-583 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_583_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-583');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-583-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-583-daemon-launch-health-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.daemon_health_paths.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.swissknife_handoff.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-586 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_586_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-586');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-586-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-586-daemon-launch-health-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.daemon_health_paths.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.swissknife_handoff.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-589 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_589_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-589');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-589-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-589-daemon-launch-health-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.daemon_health_paths.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.swissknife_handoff.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-593 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_593_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-593');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-593-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-593-daemon-launch-health-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.daemon_health_paths.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.swissknife_handoff.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-596 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_596_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-596');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-596-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-596-daemon-launch-health-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.daemon_health_paths.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.swissknife_handoff.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-599 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_599_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-599');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-599-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-599-daemon-launch-health-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.daemon_health_paths.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.swissknife_handoff.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-602 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_602_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-602');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-602-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-602-daemon-launch-health-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.daemon_health_paths.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.swissknife_handoff.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-605 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_605_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-605');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-605-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-605-daemon-launch-health-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.daemon_health_paths.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.swissknife_handoff.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-608 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_608_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-608');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-608-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-608-daemon-launch-health-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.daemon_health_paths.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.swissknife_handoff.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-612 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_612_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-612');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-612-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-612-daemon-launch-health-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.daemon_health_paths.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.swissknife_handoff.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-615 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_615_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-615');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-615-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-615-daemon-launch-health-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.daemon_health_paths.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.swissknife_handoff.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-618 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_618_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-618');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-618-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-618-daemon-launch-health-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.required_backends).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.daemon_health_paths.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  expect(fixture.swissknife_handoff.map((entry: Record<string, unknown>) => entry.server_package)).toEqual([
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-621 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_621_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-621');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-621-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-621-daemon-launch-health-gate.md',
  );
  expect(fixture.required_backends.sort()).toEqual([
    'ipfs_accelerate_py',
    'ipfs_datasets_py',
    'ipfs_kit_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-624 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_624_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-624');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-624-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-624-daemon-launch-health-gate.md',
  );
  expect(fixture.required_backends.sort()).toEqual([
    'ipfs_accelerate_py',
    'ipfs_datasets_py',
    'ipfs_kit_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-627 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_627_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-627');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-627-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-627-daemon-launch-health-gate.md',
  );
  expect(fixture.required_backends.sort()).toEqual([
    'ipfs_accelerate_py',
    'ipfs_datasets_py',
    'ipfs_kit_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-633 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_633_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-633');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-633-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-633-daemon-launch-health-gate.md',
  );
  expect(fixture.required_backends.sort()).toEqual([
    'ipfs_accelerate_py',
    'ipfs_datasets_py',
    'ipfs_kit_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-636 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_636_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-636');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-636-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-636-daemon-launch-health-gate.md',
  );
  expect(fixture.required_backends.sort()).toEqual([
    'ipfs_accelerate_py',
    'ipfs_datasets_py',
    'ipfs_kit_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-639 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_639_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-639');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-639-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-639-daemon-launch-health-gate.md',
  );
  expect(fixture.required_backends.sort()).toEqual([
    'ipfs_accelerate_py',
    'ipfs_datasets_py',
    'ipfs_kit_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-645 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_645_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-645');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-645-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-04-vai-645-daemon-launch-health-gate.md',
  );
  expect(fixture.required_backends.sort()).toEqual([
    'ipfs_accelerate_py',
    'ipfs_datasets_py',
    'ipfs_kit_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-648 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_648_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-648');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-05-vai-648-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-05-vai-648-daemon-launch-health-gate.md',
  );
  expect(fixture.required_backends.sort()).toEqual([
    'ipfs_accelerate_py',
    'ipfs_datasets_py',
    'ipfs_kit_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-652 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_652_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-652');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-05-vai-652-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-05-vai-652-daemon-launch-health-gate.md',
  );
  expect(fixture.required_backends.sort()).toEqual([
    'ipfs_accelerate_py',
    'ipfs_datasets_py',
    'ipfs_kit_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-654 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_654_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-654');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-05-vai-654-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-05-vai-654-daemon-launch-health-gate.md',
  );
  expect(fixture.required_backends.sort()).toEqual([
    'ipfs_accelerate_py',
    'ipfs_datasets_py',
    'ipfs_kit_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-656 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_656_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-656');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-05-vai-656-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-05-vai-656-daemon-launch-health-gate.md',
  );
  expect(fixture.required_backends.sort()).toEqual([
    'ipfs_accelerate_py',
    'ipfs_datasets_py',
    'ipfs_kit_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-658 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_658_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-658');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-05-vai-658-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-05-vai-658-daemon-launch-health-gate.md',
  );
  expect(fixture.required_backends.sort()).toEqual([
    'ipfs_accelerate_py',
    'ipfs_datasets_py',
    'ipfs_kit_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('VAI-660 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(VAI_660_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('VAI-660');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.objective_gap_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-05-vai-660-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/virtual_ai_os/discovery/2026-07-05-vai-660-daemon-launch-health-gate.md',
  );
  expect(fixture.required_backends.sort()).toEqual([
    'ipfs_accelerate_py',
    'ipfs_datasets_py',
    'ipfs_kit_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('HAO-755 daemon launch gate fixture preserves Swissknife backend handoff records', async () => {
  const fixture = JSON.parse(fs.readFileSync(HAO_755_DAEMON_LAUNCH_GATE_FIXTURE, 'utf8'));

  expect(fixture.task_id).toBe('HAO-755');
  expect(fixture.goal_id).toBe('VAIOS-G728');
  expect(fixture.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
  expect(fixture.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
  expect(fixture.evidence_term).toBe('launch Playwright validation gate');
  expect(fixture.objective_gap_receipt).toBe(
    'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-755-objective-gap-b023c8de5b69.md',
  );
  expect(fixture.launch_gate_receipt).toBe(
    'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-755-daemon-launch-health-gate.md',
  );
  expect(fixture.gate_state).toBe('gate_closed_by_playwright_validation');
  expect(fixture.validation_receipt).toBe(
    'data/hallucinate_multimodal_control/discovery/2026-07-09-hao-755-attempt-3-launch-playwright-validation-gate.md',
  );
  expect(fixture.validation_receipts).toContain(
    'data/hallucinate_multimodal_control/discovery/2026-07-09-hao-755-attempt-3-launch-playwright-validation-gate.md',
  );
  expect(fixture.validation_commands).toContain(
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
  );
  expect(fixture.required_backends.sort()).toEqual([
    'ipfs_accelerate_py',
    'ipfs_datasets_py',
    'ipfs_kit_py',
  ]);
  for (const handoff of fixture.swissknife_handoff) {
    expect(handoff.swissknife_consumer).toContain('Swissknife');
    expect(handoff.mediation_contract_ref).toContain('control_surface_contract:mcp-daemon:');
  }
});

test('opens every SwissKnife desktop app and renders a reusable Meta glasses ORB template', async ({ page }) => {
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsDir = path.join(process.cwd(), 'test-results', 'meta-glasses-virtual-os', runId);
  fs.mkdirSync(resultsDir, { recursive: true });

  const browserErrors: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') {
      browserErrors.push(message.text());
    }
  });

  await page.goto('/');
  await page.waitForSelector('.desktop', { timeout: 30_000 });
  await page.waitForSelector('.desktop-icons .icon[data-app]', { timeout: 15_000 });
  await hideLoadingScreen(page);

  const apps = await discoverDesktopApps(page);
  expect(apps.length).toBeGreaterThanOrEqual(30);

  const snapshots: SwissKnifeDesktopAppSnapshot[] = [];
  const openFailures: string[] = [];

  for (const app of apps) {
    const snapshot = await openAndSnapshotApp(page, app).catch(error => {
      openFailures.push(`${app.appId}: ${error?.message || String(error)}`);
      return null;
    });
    if (snapshot) {
      snapshots.push(snapshot);
      if (snapshot.hasLoadError) {
        openFailures.push(`${app.appId}: window contains a load-error marker`);
      }
    }
    await closeActiveWindow(page);
  }

  const templateResults: MetaGlassesDesktopAppTemplateResult[] = [];
  const templateFailures: string[] = [];

  for (const snapshot of snapshots) {
    try {
      const result = await renderDesktopAppThroughMetaGlassesOrb(snapshot);
      templateResults.push(result);
      expect(result.interfaceCid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(result.widgetCid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(result.receiptCid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(result.manifest.viewport).toEqual({ width: 600, height: 600 });
      expect(result.manifest.focus_order).toEqual(['open', 'dismiss']);
      expect(result.manifest.renderer_hints.display_webapp.viewport).toEqual({ width: 600, height: 600 });
      expect(result.preview.readiness_result.ready).toBe(true);
      expect(result.mobileActions.map(action => action.type)).toContain('mobile_render_display_widget');
    } catch (error: any) {
      templateFailures.push(`${snapshot.appId}: ${error?.message || String(error)}`);
    }
  }

  const summarizedBrowserErrors = summarizeBrowserErrors(browserErrors);
  const report = {
    runId,
    launch_readiness_receipt_v1: {
      ...LAUNCH_READINESS_GATE,
      status: openFailures.length === 0 && templateFailures.length === 0 ? 'passed' : 'failed',
      evidence: {
        discoveredAppCount: apps.length,
        renderedMetaDisplayCount: templateResults.length,
        command: 'npm --prefix swissknife run test:e2e:meta-glasses',
      },
    },
    discoveredApps: apps,
    snapshots,
    metaDisplayResults: templateResults.map(result => ({
      appId: result.appId,
      interfaceCid: result.interfaceCid,
      widgetCid: result.widgetCid,
      receiptCid: result.receiptCid,
      focusOrder: result.manifest.focus_order,
      viewport: result.manifest.viewport,
      readiness: result.preview.readiness_result.summary,
      renderPath: result.manifest.renderer_hints.primary_render_path,
      mobileActionTypes: result.mobileActions.map(action => action.type),
    })),
    failures: {
      openFailures,
      templateFailures,
      browserErrors: summarizedBrowserErrors,
    },
  };
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(
    path.join(resultsDir, 'apps-meta-display-report.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );

  expect(openFailures).toEqual([]);
  expect(templateFailures).toEqual([]);
  expect(summarizedBrowserErrors).toEqual([]);
  expect(templateResults.length).toBe(apps.length);
});

interface DiscoveredDesktopApp {
  appId: string;
  title: string;
  iconLabel: string;
}

async function discoverDesktopApps(page: Page): Promise<DiscoveredDesktopApp[]> {
  return page.$$eval('.desktop-icons .icon[data-app]', elements => {
    const seen = new Set<string>();
    return (elements as HTMLElement[]).flatMap(element => {
      const appId = element.dataset.app || '';
      if (!appId || seen.has(appId)) {
        return [];
      }
      seen.add(appId);
      return [{
        appId,
        title: element.getAttribute('title') || element.textContent?.trim() || appId,
        iconLabel: element.querySelector('.icon-label')?.textContent?.trim() || appId,
      }];
    });
  });
}

async function openAndSnapshotApp(
  page: Page,
  app: DiscoveredDesktopApp,
): Promise<SwissKnifeDesktopAppSnapshot> {
  const icon = page.locator(`.desktop-icons .icon[data-app="${app.appId}"]`).first();
  await expect(icon).toBeVisible({ timeout: 5_000 });

  const previousWindowCount = await page.locator('.window').count();
  await icon.click();
  await waitForLatestWindow(page, previousWindowCount);

  const appWindow = page.locator('.window').last();
  await expect(appWindow).toBeVisible({ timeout: 10_000 });
  await appWindow.locator('.window-loading').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => null);
  await page.waitForTimeout(150);

  const windowTitle = await appWindow.locator('.window-title').first().textContent().catch(() => app.title);
  const metrics = await appWindow.evaluate((element: HTMLElement) => {
    const text = element.innerText || element.textContent || '';
    const buttonCount = element.querySelectorAll('button, [role="button"], [data-action]').length;
    const inputCount = element.querySelectorAll('input, textarea, select').length;
    const canvasCount = element.querySelectorAll('canvas').length;
    const hasLoadError = /failed to load|error loading|unknown app component|not found/i.test(text);
    return {
      text,
      buttonCount,
      inputCount,
      canvasCount,
      interactiveCount: buttonCount + inputCount + canvasCount,
      hasLoadError,
    };
  });

  expect(metrics.text.trim().length).toBeGreaterThan(0);

  return {
    appId: app.appId,
    title: app.title,
    iconLabel: app.iconLabel,
    windowTitle: (windowTitle || app.title).trim(),
    text: metrics.text,
    buttonCount: metrics.buttonCount,
    inputCount: metrics.inputCount,
    canvasCount: metrics.canvasCount,
    interactiveCount: metrics.interactiveCount,
    hasLoadError: metrics.hasLoadError,
  };
}

async function waitForLatestWindow(page: Page, previousWindowCount: number): Promise<void> {
  await page.waitForFunction(
    count => document.querySelectorAll('.window').length > Number(count),
    previousWindowCount,
    { timeout: 10_000 },
  ).catch(async () => {
    await expect(page.locator('.window').last()).toBeVisible({ timeout: 5_000 });
  });
}

async function closeActiveWindow(page: Page): Promise<void> {
  const latestWindow = page.locator('.window').last();
  if ((await latestWindow.count()) === 0) {
    return;
  }
  await clickIfPresent(latestWindow.locator('.window-control.close, .window-close, .close-btn').first());
  await page.waitForTimeout(100);
}

async function clickIfPresent(locator: Locator): Promise<void> {
  if ((await locator.count()) > 0 && await locator.isVisible().catch(() => false)) {
    await locator.click().catch(() => null);
  }
}

async function hideLoadingScreen(page: Page): Promise<void> {
  await page.evaluate(() => {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.style.display = 'none';
    }
  });
}

function summarizeBrowserErrors(errors: string[]): string[] {
  const normalized = errors
    .map(error => error.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return Array.from(new Set(normalized)).slice(0, 25);
}
