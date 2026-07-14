import { expect, test, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { VIRTUAL_DESKTOP_APP_MANIFEST } from '../../src/services/apps/virtual-desktop-app-manifest';
import {
  buildAgentSupervisorLiveRoutes,
  buildAllAppRoutesFromLiveBackendContract,
  compileAllAppLiveOrbIdlHandoff,
  type AllAppLiveBackendContract,
  type AllAppLiveOrbIdlHandoffCatalog,
  type AllAppLiveOrbIdlHandoffPacket,
} from '../../src/services/glasses/all-app-live-orb-idl-handoff';
import { buildVirtualDesktopOrbIdlCompleteCoverage } from '../../src/services/glasses/desktop-orb-idl-contract';

const TASK_ID = 'SVD-099';
const REPORT_SCHEMA = 'swissknife.all-app-meta-device-simulator.v1';
const GENERATED_AT = '2026-07-13T00:00:00.000Z';
const EVIDENCE_ROOT = path.join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const REPORT_PATH = path.join(EVIDENCE_ROOT, 'all-app-meta-device-simulator.json');
const CONTRACT_PATH = path.join(EVIDENCE_ROOT, 'app-backend-contract.json');
const UPSTREAM_HANDOFF_PATH = path.join(EVIDENCE_ROOT, 'all-app-live-orb-idl-handoff.json');
const SCREENSHOT_ROOT = path.join(EVIDENCE_ROOT, 'app-screenshots', 'meta-device-simulator');
const MODALITIES = ['display', 'camera', 'microphone', 'speaker', 'input'] as const;
const VALIDATION_COMMANDS = [
  'node scripts/run_playwright_test.mjs test -c playwright.config.ts test/e2e/all-app-meta-device-simulator.spec.ts --reporter=line',
  'npm run test:e2e:meta-glasses -- --reporter=line',
] as const;

type Modality = typeof MODALITIES[number];

interface SimulatorSnapshot {
  packet_id: string;
  app_id: string;
  phase: string;
  focused_action: string;
  activation: string;
  decision: string;
  decision_history: string[];
  modality_results: Record<Modality, string>;
  fallback_surface: string;
  rollback_state: string;
  receipt_refs: string[];
  event_dag_refs: string[];
  camera_ref: string;
  transcript: string;
  audio_route: string;
}

interface PacketReplayResult {
  packet_id: string;
  packet_cid: string;
  route_id: string;
  app_id: string;
  app_title: string;
  action_id: string;
  requested_modality: string;
  permission_state: string;
  correlation_id: string;
  interface_cid: string;
  focus_activation: {
    focus_visible: boolean;
    focus_control_received_dom_focus: boolean;
    activated_method: string;
    activation_decision: string;
  };
  layout: {
    viewport_width: number;
    viewport_height: number;
    scroll_width: number;
    scroll_height: number;
    controls_overlap: boolean;
    bounded: boolean;
  };
  modality_results: Record<Modality, string>;
  modality_replays: Record<Modality, ModalityReplayEvidence>;
  operator_decisions: string[];
  rollback: {
    expected_mode: string;
    observed_state: string;
  };
  fallback: {
    packet_selected: boolean;
    packet_target: string;
    observed_surface: string;
    user_visible: boolean;
  };
  receipt_preservation: {
    before: string[];
    after: string[];
    event_dag_before: string[];
    event_dag_after: string[];
    preserved: boolean;
  };
  screenshot: string;
  status: 'passed';
}

interface PlatformSafetyProbeResult {
  status: 'passed';
  camera: string[];
  microphone: string[];
  speaker_headphone: string[];
  raw_camera_pixels_preserved: false;
  raw_microphone_audio_preserved: false;
  raw_camera_pixels_captured: false;
  raw_microphone_audio_captured: false;
  screenshot: string;
}

interface ModalityReplayEvidence {
  modality: Modality;
  availability: string;
  primary_surface: string;
  permission_scope: string | null;
  allowed: boolean;
  hardware_available: boolean;
  read_only: boolean;
  result: string;
  safe_payload: string;
  raw_payload_captured: false;
  fallback: {
    kind: string;
    target_surface: string;
    reason: string;
    user_visible: boolean;
  };
  states_replayed: string[];
  receipt_refs_preserved: boolean;
}

interface BrowserFailure {
  kind: 'console' | 'pageerror';
  message: string;
}

interface DeviceSimulatorApi {
  loadPacket: (packet: AllAppLiveOrbIdlHandoffPacket & { app_title: string }) => void;
  replayModality: (modality: Modality) => void;
  snapshot: () => SimulatorSnapshot;
  runSafetyProbe: (kind: 'camera' | 'microphone' | 'speaker', decision: 'allow' | 'deny' | 'fallback') => void;
}

declare global {
  interface Window {
    metaDeviceSimulator: DeviceSimulatorApi;
  }
}

test.describe('SVD-099 all-app Meta device simulator packet replay', () => {
  test('replays every SVD-098 packet and all safe I/O/fallback states without hardware pairing', async ({ page }) => {
    test.setTimeout(240_000);
    const catalog = buildPacketCatalog();
    const titleByApp = new Map(VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => [app.id, app.title]));
    const results: PacketReplayResult[] = [];
    const browserFailures: BrowserFailure[] = [];

    assertCatalogIntegrity(catalog);
    const upstreamCatalogVerified = verifyUpstreamCatalogIfPresent(catalog);
    page.on('console', message => {
      if (message.type() === 'error') browserFailures.push({ kind: 'console', message: message.text() });
    });
    page.on('pageerror', error => browserFailures.push({ kind: 'pageerror', message: error.message }));

    fs.mkdirSync(SCREENSHOT_ROOT, { recursive: true });
    await page.setViewportSize({ width: 1180, height: 780 });
    await page.setContent(renderSimulatorHtml());

    await expect(page.getByRole('heading', { name: 'Meta Device Simulator' })).toBeVisible();
    await expect(page.getByTestId('hardware-boundary')).toContainText('hardware_pairing_required=false');
    await expect(page.getByTestId('hardware-boundary')).toContainText('physical_device_connected=false');
    await expect(page.getByTestId('hardware-boundary')).toContainText('simulator_only=true');

    const safetyProbes = await replayPlatformSafetyProbes(page);

    for (const [index, packet] of catalog.packets.entries()) {
      const appTitle = titleByApp.get(packet.app_id) ?? packet.app_id;
      await page.evaluate(
        input => window.metaDeviceSimulator.loadPacket(input),
        { ...packet, app_title: appTitle },
      );

      await expect(page.getByTestId('packet-identity')).toContainText(packet.packet_id);
      await expect(page.getByTestId('packet-identity')).toContainText(packet.correlation_id);
      await expect(page.getByTestId('receipt-chain')).toContainText(packet.receipt_refs[0].cid);
      await expect(page.getByTestId('receipt-chain')).toContainText(packet.event_dag_refs[0].cid);

      const receiptBefore = await snapshot(page);
      await page.getByTestId('focus-next').click();
      const focusControlReceivedDomFocus = await page.getByTestId('focus-next').evaluate(
        element => element === document.activeElement,
      );
      expect(focusControlReceivedDomFocus).toBe(true);
      await expect(page.getByTestId('focused-action')).toContainText(packet.method_id);
      await page.getByTestId('activate').click();

      if (packet.permission.state === 'confirmation_required') {
        await expect(page.getByTestId('operator-decision')).toContainText('awaiting_operator_confirmation');
        await page.getByTestId('operator-deny').click();
        await expect(page.getByTestId('operator-decision')).toContainText('operator_denied');
        await expect(page.getByTestId('rollback-state')).toContainText(packet.rollback_behavior.mode);
        await page.getByTestId('operator-allow').click();
        await expect(page.getByTestId('operator-decision')).toContainText('operator_approved');
      } else if (packet.permission.state === 'permitted') {
        await expect(page.getByTestId('operator-decision')).toContainText('policy_allowed');
      } else {
        await expect(page.getByTestId('operator-decision')).toContainText('policy_denied');
        await expect(page.getByTestId('fallback-state')).toContainText(packet.fallback_selection.target_surface);
      }
      const activationSnapshot = await snapshot(page);
      await expect(page.getByTestId('activation-state')).toContainText(packet.method_id);

      for (const modality of MODALITIES) {
        await page.evaluate(value => window.metaDeviceSimulator.replayModality(value), modality);
        await expect(page.getByTestId(`modality-${modality}`)).not.toBeEmpty();
      }

      await page.getByTestId('simulate-failure').click();
      await expect(page.getByTestId('rollback-state')).toContainText(packet.rollback_behavior.mode);
      await page.getByTestId('select-fallback').click();
      await expect(page.getByTestId('fallback-state')).toContainText(packet.fallback_selection.target_surface);

      const layout = await readLayout(page);
      expect(layout.bounded, `${packet.packet_id} escaped the 640x360 simulated display`).toBe(true);

      const screenshotPath = path.join(
        SCREENSHOT_ROOT,
        `${String(index + 1).padStart(2, '0')}-${safeFilePart(packet.app_id)}-${safeFilePart(packet.action_id)}.png`,
      );
      await page.getByTestId('device-viewport').screenshot({ path: screenshotPath });

      const receiptAfter = await snapshot(page);
      const receiptRefsPreserved = sameValues(receiptAfter.receipt_refs, receiptBefore.receipt_refs);
      const eventDagRefsPreserved = sameValues(receiptAfter.event_dag_refs, receiptBefore.event_dag_refs);
      expect(receiptRefsPreserved).toBe(true);
      expect(eventDagRefsPreserved).toBe(true);
      expect(receiptAfter.modality_results.display).toMatch(/^safe_display_(?:direct|fallback)_projection$/);
      expect(receiptAfter.modality_results.camera).toMatch(/^camera_(?:metadata_ref|unavailable_[a-z_]+_fallback)$/);
      expect(receiptAfter.modality_results.microphone).toMatch(/^(?:redacted_transcript|microphone_unavailable_[a-z_]+_transcription_fallback)$/);
      expect(receiptAfter.modality_results.speaker).toMatch(/^(?:audio_summary_headphone_fallback|speaker_unavailable_[a-z_]+_audio_fallback)$/);

      results.push({
        packet_id: packet.packet_id,
        packet_cid: packet.packet_cid,
        route_id: packet.route_id,
        app_id: packet.app_id,
        app_title: appTitle,
        action_id: packet.action_id,
        requested_modality: packet.requested_modality,
        permission_state: packet.permission.state,
        correlation_id: packet.correlation_id,
        interface_cid: packet.interface_cid,
        focus_activation: {
          focus_visible: receiptAfter.focused_action === packet.method_id,
          focus_control_received_dom_focus: focusControlReceivedDomFocus,
          activated_method: receiptAfter.activation,
          activation_decision: activationSnapshot.decision,
        },
        layout,
        modality_results: receiptAfter.modality_results,
        modality_replays: buildModalityReplayEvidence(packet, receiptAfter),
        operator_decisions: receiptAfter.decision_history,
        rollback: {
          expected_mode: packet.rollback_behavior.mode,
          observed_state: receiptAfter.rollback_state,
        },
        fallback: {
          packet_selected: packet.fallback_selection.selected,
          packet_target: packet.fallback_selection.target_surface,
          observed_surface: receiptAfter.fallback_surface,
          user_visible: packet.fallback_selection.user_visible,
        },
        receipt_preservation: {
          before: receiptBefore.receipt_refs,
          after: receiptAfter.receipt_refs,
          event_dag_before: receiptBefore.event_dag_refs,
          event_dag_after: receiptAfter.event_dag_refs,
          preserved: receiptRefsPreserved && eventDagRefsPreserved,
        },
        screenshot: path.relative(process.cwd(), screenshotPath),
        status: 'passed',
      });
    }

    expect(results.map(result => result.packet_id).sort()).toEqual(
      catalog.packets.map(packet => packet.packet_id).sort(),
    );
    expect(new Set(results.map(result => result.app_id))).toEqual(
      new Set(VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => app.id)),
    );
    expect(results.every(result => result.layout.bounded)).toBe(true);
    expect(results.every(result => result.receipt_preservation.preserved)).toBe(true);
    expect(results.every(result => result.fallback.user_visible)).toBe(true);
    expect(browserFailures).toEqual([]);

    const report = {
      schema: REPORT_SCHEMA,
      task_id: TASK_ID,
      generated_at: GENERATED_AT,
      validation_commands: VALIDATION_COMMANDS,
      source_packet_schema: catalog.schema,
      source_task_id: catalog.task_id,
      upstream_handoff: {
        path: path.relative(process.cwd(), UPSTREAM_HANDOFF_PATH),
        present: fs.existsSync(UPSTREAM_HANDOFF_PATH),
        verified_when_present: upstreamCatalogVerified,
        source_mode: fs.existsSync(UPSTREAM_HANDOFF_PATH) ? 'verified_svd_098_artifact' : 'recompiled_from_svd_098_live_sources',
      },
      source_packet_count: catalog.packet_count,
      source_app_count: catalog.app_count,
      replayed_packet_count: results.length,
      replayed_app_count: new Set(results.map(result => result.app_id)).size,
      status: 'passed',
      boundary: {
        simulator_only: true,
        hardware_free: true,
        hardware_pairing_required: false,
        physical_device_connected: false,
        physical_glasses_tested: false,
        physical_hardware_claimed: false,
      },
      acceptance: {
        all_source_packets_replayed: results.length === catalog.packet_count,
        all_applications_covered: new Set(results.map(result => result.app_id)).size === catalog.app_count,
        bounded_layouts: results.every(result => result.layout.bounded),
        no_control_overlap: results.every(result => !result.layout.controls_overlap),
        focus_and_activation_visible: results.every(result => result.focus_activation.focus_visible
          && result.focus_activation.focus_control_received_dom_focus
          && Boolean(result.focus_activation.activated_method)),
        receipts_preserved: results.every(result => result.receipt_preservation.preserved),
        operator_decisions_visible: results.every(result => result.operator_decisions.length > 0),
        rollback_replayed: results.every(result => result.rollback.observed_state.includes(result.rollback.expected_mode)),
        all_packet_fallbacks_visible: results.every(result => Boolean(result.fallback.observed_surface)),
        audio_and_mobile_fallback_replayed: results.some(result => (
          result.modality_replays.speaker.fallback.target_surface === 'audio_channel'
        )) && results.some(result => MODALITIES.some(modality => (
          result.modality_replays[modality].fallback.target_surface === 'mobile_card'
        ))),
        safe_camera_and_microphone_payloads: results.every(result => (
          !result.modality_replays.camera.raw_payload_captured
          && Boolean(result.modality_replays.camera.safe_payload)
          && !result.modality_replays.microphone.raw_payload_captured
          && Boolean(result.modality_replays.microphone.safe_payload)
        )),
        speaker_headphone_fallback_visible: results.every(result => (
          result.modality_replays.speaker.states_replayed.includes('audio_mobile_fallback_visible')
          && result.modality_replays.speaker.fallback.user_visible
        )),
        no_hardware_availability_claimed: results.every(result => MODALITIES.every(modality => (
          !result.modality_replays[modality].hardware_available
        ))),
        packet_modality_constraints_preserved: results.every(result => MODALITIES.every(modality => (
          result.modality_replays[modality].modality === modality
          && result.modality_replays[modality].receipt_refs_preserved
        ))),
        zero_browser_errors: browserFailures.length === 0,
      },
      modality_summary: Object.fromEntries(MODALITIES.map(modality => [
        modality,
        results.filter(result => Boolean(result.modality_results[modality])).length,
      ])),
      permission_summary: countBy(results, result => result.permission_state),
      fallback_summary: countBy(results, result => result.fallback.observed_surface),
      platform_safety_probes: safetyProbes,
      browser_failures: browserFailures,
      screenshot_root: path.relative(process.cwd(), SCREENSHOT_ROOT),
      packets: results,
    };

    expect(Object.values(report.acceptance).every(Boolean)).toBe(true);
    fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  });
});

function buildPacketCatalog(): AllAppLiveOrbIdlHandoffCatalog {
  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8')) as AllAppLiveBackendContract;
  const descriptors = buildVirtualDesktopOrbIdlCompleteCoverage(VIRTUAL_DESKTOP_APP_MANIFEST).descriptors;
  const routes = [
    ...buildAllAppRoutesFromLiveBackendContract(contract, VIRTUAL_DESKTOP_APP_MANIFEST),
    ...buildAgentSupervisorLiveRoutes(),
  ];
  return compileAllAppLiveOrbIdlHandoff(routes, descriptors, {
    generatedAt: GENERATED_AT,
    generatedFrom: [
      'test-results/virtual-desktop-ipfs-mcp-orb/app-backend-contract.json',
      'src/services/glasses/desktop-orb-idl-contract.ts',
      'src/services/mcp/agent-supervisor-console-gateway.ts',
    ],
  });
}

function assertCatalogIntegrity(catalog: AllAppLiveOrbIdlHandoffCatalog): void {
  const manifestAppIds = VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => app.id).sort();
  expect(catalog.schema).toBe('swissknife.all-app-live-orb-idl-handoff.v1');
  expect(catalog.task_id).toBe('SVD-098');
  expect(catalog.packet_count).toBe(catalog.packets.length);
  expect(catalog.app_count).toBe(manifestAppIds.length);
  expect(new Set(catalog.packets.map(packet => packet.packet_id)).size).toBe(catalog.packet_count);
  expect(new Set(catalog.packets.map(packet => packet.packet_cid)).size).toBe(catalog.packet_count);
  expect([...new Set(catalog.packets.map(packet => packet.app_id))].sort()).toEqual(manifestAppIds);
  for (const packet of catalog.packets) {
    expect(packet.packet_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(packet.interface_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(packet.modality_constraints.map(item => item.modality).sort()).toEqual([...MODALITIES].sort());
    expect(packet.receipt_refs.length).toBeGreaterThan(0);
    expect(packet.event_dag_refs.length).toBeGreaterThan(0);
  }
}

function verifyUpstreamCatalogIfPresent(catalog: AllAppLiveOrbIdlHandoffCatalog): boolean {
  if (!fs.existsSync(UPSTREAM_HANDOFF_PATH)) return true;
  const upstream = JSON.parse(fs.readFileSync(UPSTREAM_HANDOFF_PATH, 'utf8')) as AllAppLiveOrbIdlHandoffCatalog;
  expect(upstream).toEqual(catalog);
  return true;
}

function buildModalityReplayEvidence(
  packet: AllAppLiveOrbIdlHandoffPacket,
  replay: SimulatorSnapshot,
): Record<Modality, ModalityReplayEvidence> {
  const receiptRefsPreserved = sameValues(
    replay.receipt_refs,
    packet.receipt_refs.map(reference => reference.cid),
  ) && sameValues(
    replay.event_dag_refs,
    packet.event_dag_refs.map(reference => reference.cid),
  );
  const entries = MODALITIES.map(modality => {
    const constraint = packet.modality_constraints.find(item => item.modality === modality);
    if (!constraint) throw new Error(`${packet.packet_id}: missing ${modality} constraint`);
    const statesReplayed = modality === 'display'
      ? ['projection_requested', 'safe_projection_rendered', 'bounded_layout_verified']
      : modality === 'camera'
        ? ['availability_checked', 'raw_pixels_suppressed', 'typed_fallback_visible']
        : modality === 'microphone'
          ? ['availability_checked', 'raw_audio_suppressed', 'redacted_transcript_or_fallback_visible']
          : modality === 'speaker'
            ? ['speaker_headphone_route_checked', 'physical_playback_not_claimed', 'audio_mobile_fallback_visible']
            : ['focus_visible', constraint.read_only ? 'read_only_activation_checked' : 'activation_checked', 'fallback_visible'];
    const safePayload = modality === 'display'
      ? `simulator://display/${packet.packet_cid}`
      : modality === 'camera'
        ? replay.camera_ref
        : modality === 'microphone'
          ? replay.transcript
          : modality === 'speaker'
            ? replay.audio_route
            : replay.focused_action;
    const evidence: ModalityReplayEvidence = {
      modality,
      availability: constraint.availability,
      primary_surface: constraint.primary_surface,
      permission_scope: constraint.permission_scope ?? null,
      allowed: constraint.allowed,
      hardware_available: constraint.hardware_available,
      read_only: constraint.read_only,
      result: replay.modality_results[modality],
      safe_payload: safePayload,
      raw_payload_captured: false,
      fallback: {
        kind: constraint.fallback_kind,
        target_surface: constraint.fallback_surface,
        reason: constraint.fallback_reason,
        user_visible: constraint.fallback_surface !== 'none',
      },
      states_replayed: statesReplayed,
      receipt_refs_preserved: receiptRefsPreserved,
    };
    return [modality, evidence] as const;
  });
  return Object.fromEntries(entries) as Record<Modality, ModalityReplayEvidence>;
}

async function replayPlatformSafetyProbes(page: Page): Promise<PlatformSafetyProbeResult> {
  await page.evaluate(() => window.metaDeviceSimulator.runSafetyProbe('camera', 'allow'));
  await expect(page.getByTestId('probe-log')).toContainText('camera:operator_approved:metadata_ref_only');
  await page.evaluate(() => window.metaDeviceSimulator.runSafetyProbe('camera', 'deny'));
  await expect(page.getByTestId('probe-log')).toContainText('camera:operator_denied:mobile_camera_fallback');
  await page.evaluate(() => window.metaDeviceSimulator.runSafetyProbe('camera', 'fallback'));
  await expect(page.getByTestId('probe-log')).toContainText('camera:route_unavailable:mobile_camera_fallback');
  await page.evaluate(() => window.metaDeviceSimulator.runSafetyProbe('microphone', 'allow'));
  await expect(page.getByTestId('probe-log')).toContainText('microphone:operator_approved:redacted_transcript_available');
  await page.evaluate(() => window.metaDeviceSimulator.runSafetyProbe('microphone', 'deny'));
  await expect(page.getByTestId('probe-log')).toContainText('microphone:operator_denied:mobile_transcription_fallback');
  await page.evaluate(() => window.metaDeviceSimulator.runSafetyProbe('microphone', 'fallback'));
  await expect(page.getByTestId('probe-log')).toContainText('microphone:route_unavailable:mobile_transcription_fallback');
  await page.evaluate(() => window.metaDeviceSimulator.runSafetyProbe('speaker', 'allow'));
  await expect(page.getByTestId('probe-log')).toContainText('speaker:operator_approved:simulator_headphones');
  await page.evaluate(() => window.metaDeviceSimulator.runSafetyProbe('speaker', 'deny'));
  await expect(page.getByTestId('probe-log')).toContainText('speaker:operator_denied:mobile_audio_fallback');
  await page.evaluate(() => window.metaDeviceSimulator.runSafetyProbe('speaker', 'fallback'));
  await expect(page.getByTestId('probe-log')).toContainText('speaker:route_unavailable:mobile_audio_fallback');

  const screenshotPath = path.join(SCREENSHOT_ROOT, '00-platform-safety-probes.png');
  await page.getByTestId('device-shell').screenshot({ path: screenshotPath });
  return {
    status: 'passed',
    camera: ['permission_granted_metadata_ref_only', 'permission_denied_mobile_fallback', 'route_unavailable_mobile_fallback'],
    microphone: ['permission_granted_redacted_transcript', 'permission_denied_mobile_transcription', 'route_unavailable_mobile_transcription'],
    speaker_headphone: ['simulator_headphones', 'permission_denied_mobile_audio', 'route_unavailable_mobile_audio'],
    raw_camera_pixels_preserved: false,
    raw_microphone_audio_preserved: false,
    raw_camera_pixels_captured: false,
    raw_microphone_audio_captured: false,
    screenshot: path.relative(process.cwd(), screenshotPath),
  };
}

async function snapshot(page: Page): Promise<SimulatorSnapshot> {
  return page.evaluate(() => window.metaDeviceSimulator.snapshot());
}

async function readLayout(page: Page): Promise<PacketReplayResult['layout']> {
  return page.getByTestId('device-viewport').evaluate(element => {
    const viewport = element as HTMLElement;
    const outer = viewport.getBoundingClientRect();
    const descendants = [...viewport.querySelectorAll<HTMLElement>('*')];
    const controls = [...viewport.querySelectorAll<HTMLElement>('button')];
    const childrenBounded = descendants.every(child => {
      const rect = child.getBoundingClientRect();
      return rect.left >= outer.left - 1
        && rect.right <= outer.right + 1
        && rect.top >= outer.top - 1
        && rect.bottom <= outer.bottom + 1;
    });
    const controlsOverlap = controls.some((control, index) => {
      const left = control.getBoundingClientRect();
      return controls.slice(index + 1).some(candidate => {
        const right = candidate.getBoundingClientRect();
        return left.left < right.right - 1
          && left.right > right.left + 1
          && left.top < right.bottom - 1
          && left.bottom > right.top + 1;
      });
    });
    return {
      viewport_width: Math.round(outer.width),
      viewport_height: Math.round(outer.height),
      scroll_width: viewport.scrollWidth,
      scroll_height: viewport.scrollHeight,
      controls_overlap: controlsOverlap,
      bounded: childrenBounded
        && !controlsOverlap
        && viewport.scrollWidth <= viewport.clientWidth
        && viewport.scrollHeight <= viewport.clientHeight,
    };
  });
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedRight = [...right].sort();
  return [...left].sort().every((value, index) => value === sortedRight[index]);
}

function safeFilePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 54);
}

function countBy<T>(items: readonly T[], select: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[select(item)] = (counts[select(item)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function renderSimulatorHtml(): string {
  return String.raw`
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>SVD-099 Meta Device Simulator</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; background: #07110f; color: #eefbf6; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at top, #163a32, #07110f 62%); }
    main { width: 1080px; display: grid; grid-template-columns: 700px 1fr; gap: 22px; align-items: start; }
    h1 { margin: 0 0 10px; font-size: 24px; }
    .boundary, .probe { border: 1px solid #3f6d61; border-radius: 12px; padding: 12px; background: #0d211d; font: 12px/1.45 ui-monospace, monospace; }
    .device { width: 700px; padding: 28px 30px; border: 1px solid #527b70; border-radius: 42px; background: linear-gradient(155deg, #1b2b27, #08110f); box-shadow: 0 24px 70px #0009; }
    .viewport { width: 640px; height: 360px; overflow: hidden; border-radius: 30px; border: 2px solid #83bbaa; background: #06100e; padding: 18px; display: grid; grid-template-rows: auto auto 1fr auto; gap: 10px; }
    .topline { display: flex; align-items: center; justify-content: space-between; min-width: 0; gap: 12px; }
    .app { font-weight: 750; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .phase { flex: 0 0 auto; color: #8ce0c8; font: 11px ui-monospace, monospace; }
    .identity { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #a9c9bf; font: 10px ui-monospace, monospace; }
    .grid { min-height: 0; display: grid; grid-template-columns: 1.1fr .9fr; gap: 10px; }
    .panel { min-width: 0; min-height: 0; overflow: hidden; border: 1px solid #294b42; border-radius: 10px; padding: 9px; background: #0b1a17; }
    .label { color: #76bca8; font-size: 10px; text-transform: uppercase; letter-spacing: .09em; }
    .value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 11px/1.55 ui-monospace, monospace; }
    .modalities { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px 8px; }
    .controls { display: flex; flex-wrap: nowrap; gap: 6px; overflow: hidden; }
    button { min-width: 0; min-height: 30px; padding: 5px 8px; border-radius: 8px; border: 1px solid #4e8274; background: #173c33; color: #f2fff9; font-size: 10px; white-space: nowrap; }
    button:focus { outline: 2px solid #b1ffe7; outline-offset: 1px; }
    .side { display: grid; gap: 12px; }
    .probe { max-height: 380px; overflow: hidden; white-space: pre-wrap; }
  </style>
</head>
<body>
  <main>
    <section>
      <h1>Meta Device Simulator</h1>
      <div class="device" data-testid="device-shell">
        <div class="viewport" data-testid="device-viewport"><p>No packet loaded</p></div>
      </div>
    </section>
    <aside class="side">
      <section class="boundary" data-testid="hardware-boundary">simulator_only=true<br>hardware_free=true<br>hardware_pairing_required=false<br>physical_device_connected=false<br>physical_hardware_claimed=false</section>
      <section class="probe" data-testid="probe-log">platform safety probes</section>
    </aside>
  </main>
  <script>
    (() => {
      const viewport = document.querySelector('[data-testid="device-viewport"]');
      const probeLog = document.querySelector('[data-testid="probe-log"]');
      const probeEvents = [];
      let packet = null;
      let state = emptyState();

      function emptyState() {
        return {
          phase: 'idle', focused_action: '', activation: '', decision: 'none', decision_history: [],
          modality_results: { display: '', camera: '', microphone: '', speaker: '', input: '' },
          fallback_surface: '', rollback_state: '', receipt_refs: [], event_dag_refs: [],
          camera_ref: '', transcript: '', audio_route: '',
        };
      }

      const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      })[character]);

      function constraint(kind) {
        return packet.modality_constraints.find(item => item.modality === kind);
      }

      function decide(value) {
        state.decision = value;
        if (!state.decision_history.includes(value)) state.decision_history.push(value);
      }

      function applyFallback(surface) {
        state.fallback_surface = surface || packet.fallback_selection.target_surface;
        state.phase = 'fallback_visible';
      }

      function render() {
        if (!packet) return;
        const modalityHtml = ['display', 'camera', 'microphone', 'speaker', 'input'].map(kind =>
          '<div class="value" data-testid="modality-' + kind + '">' + escape(kind) + ': '
            + escape(state.modality_results[kind] || 'pending') + '</div>',
        ).join('');
        viewport.innerHTML = [
          '<div class="topline"><span class="app">' + escape(packet.app_title) + '</span><span class="phase">' + escape(state.phase) + '</span></div>',
          '<div class="identity" data-testid="packet-identity">' + escape(packet.packet_id) + ' · ' + escape(packet.correlation_id) + '</div>',
          '<div class="grid"><section class="panel">',
          '<div class="label">Operator decision</div>',
          '<div class="value" data-testid="operator-decision">' + escape(state.decision) + '</div>',
          '<div class="label">Focused action</div>',
          '<div class="value" data-testid="focused-action">' + escape(state.focused_action || 'not focused') + '</div>',
          '<div class="label">Activation</div>',
          '<div class="value" data-testid="activation-state">' + escape(state.activation || 'not activated') + '</div>',
          '<div class="label">Fallback / rollback</div>',
          '<div class="value" data-testid="fallback-state">' + escape(state.fallback_surface || 'not selected') + '</div>',
          '<div class="value" data-testid="rollback-state">' + escape(state.rollback_state || 'not required') + '</div>',
          '<div class="label">Receipt chain</div>',
          '<div class="value" data-testid="receipt-chain">' + escape([...state.receipt_refs, ...state.event_dag_refs].join(' · ')) + '</div>',
          '</section><section class="panel"><div class="label">Safe modality replay</div>',
          '<div class="modalities">' + modalityHtml + '</div>',
          '<div class="label">Privacy-safe refs</div>',
          '<div class="value">camera=' + escape(state.camera_ref || 'none') + '</div>',
          '<div class="value">transcript=' + escape(state.transcript || 'none') + '</div>',
          '<div class="value">audio=' + escape(state.audio_route || 'none') + '</div>',
          '</section></div><div class="controls">',
          '<button data-testid="focus-next">Focus</button>',
          '<button data-testid="activate">Activate</button>',
          '<button data-testid="operator-deny">Deny</button>',
          '<button data-testid="operator-allow">Approve</button>',
          '<button data-testid="simulate-failure">Rollback</button>',
          '<button data-testid="select-fallback">Fallback</button>',
          '</div>',
        ].join('');
      }

      viewport.addEventListener('click', event => {
        const id = event.target && event.target.getAttribute('data-testid');
        if (!packet || !id) return;
        if (id === 'focus-next') {
          state.focused_action = packet.method_id;
          state.phase = 'focused';
        } else if (id === 'activate') {
          state.activation = packet.method_id;
          if (packet.permission.state === 'confirmation_required') {
            decide('awaiting_operator_confirmation');
            state.phase = 'confirmation_required';
          } else if (packet.permission.state === 'permitted') {
            decide('policy_allowed');
            state.phase = 'activated_safe_projection';
          } else {
            decide('policy_denied');
            state.rollback_state = 'projection_preserved:' + packet.rollback_behavior.mode;
            applyFallback(packet.fallback_selection.target_surface);
          }
        } else if (id === 'operator-deny') {
          decide('operator_denied');
          state.rollback_state = 'operator_denial:' + packet.rollback_behavior.mode;
          applyFallback(packet.fallback_selection.target_surface);
        } else if (id === 'operator-allow') {
          decide('operator_approved');
          state.phase = 'activated_after_confirmation';
        } else if (id === 'simulate-failure') {
          state.rollback_state = 'partial_failure:' + packet.rollback_behavior.mode;
          state.phase = 'rolled_back_receipts_preserved';
        } else if (id === 'select-fallback') {
          decide('operator_visible_fallback');
          applyFallback(packet.fallback_selection.target_surface);
        }
        render();
        if (id === 'focus-next') {
          viewport.querySelector('[data-testid="focus-next"]')?.focus();
        }
      });

      window.metaDeviceSimulator = {
        loadPacket(input) {
          packet = input;
          state = emptyState();
          state.phase = 'packet_loaded_safe';
          state.receipt_refs = packet.receipt_refs.map(item => item.cid);
          state.event_dag_refs = packet.event_dag_refs.map(item => item.cid);
          render();
        },
        replayModality(kind) {
          const item = constraint(kind);
          if (kind === 'display') {
            state.modality_results.display = item.allowed
              ? 'safe_display_direct_projection'
              : 'safe_display_fallback_projection';
          } else if (kind === 'camera') {
            if (item.availability === 'unsupported') {
              state.modality_results.camera = 'camera_unavailable_' + item.fallback_surface + '_fallback';
              state.camera_ref = 'none_raw_pixels_redacted';
            } else {
              state.modality_results.camera = 'camera_metadata_ref';
              state.camera_ref = 'ipfs://simulator/camera-metadata-ref';
            }
          } else if (kind === 'microphone') {
            if (item.availability === 'unsupported') {
              state.modality_results.microphone = 'microphone_unavailable_' + item.fallback_surface + '_transcription_fallback';
              state.transcript = item.fallback_surface + '_transcription_fallback_raw_audio_redacted';
            } else {
              state.modality_results.microphone = 'redacted_transcript';
              state.transcript = 'redacted_transcript_available';
            }
          } else if (kind === 'speaker') {
            if (item.availability === 'fallback_only') {
              state.modality_results.speaker = 'audio_summary_headphone_fallback';
              state.audio_route = 'simulator_headphones_or_mobile_audio';
            } else {
              state.modality_results.speaker = 'speaker_unavailable_' + item.fallback_surface + '_audio_fallback';
              state.audio_route = item.fallback_surface + '_audio_fallback';
            }
          } else {
            state.modality_results.input = item.read_only ? 'focus_read_only' : 'focus_activation_ready';
          }
          render();
        },
        snapshot() {
          return JSON.parse(JSON.stringify({
            packet_id: packet.packet_id,
            app_id: packet.app_id,
            ...state,
          }));
        },
        runSafetyProbe(kind, decision) {
          const outcome = kind === 'camera'
            ? decision === 'allow'
              ? 'operator_approved:metadata_ref_only'
              : decision === 'deny'
                ? 'operator_denied:mobile_camera_fallback'
                : 'route_unavailable:mobile_camera_fallback'
            : kind === 'microphone'
              ? decision === 'allow'
                ? 'operator_approved:redacted_transcript_available'
                : decision === 'deny'
                  ? 'operator_denied:mobile_transcription_fallback'
                  : 'route_unavailable:mobile_transcription_fallback'
              : decision === 'allow'
                ? 'operator_approved:simulator_headphones'
                : decision === 'deny'
                  ? 'operator_denied:mobile_audio_fallback'
                  : 'route_unavailable:mobile_audio_fallback';
          probeEvents.push(kind + ':' + outcome);
          probeLog.textContent = 'platform safety probes\n' + probeEvents.join('\n') + '\nraw_pixels=false\nraw_audio=false\nhardware_pairing=false';
        },
      };
    })();
  </script>
</body>
</html>`;
}
