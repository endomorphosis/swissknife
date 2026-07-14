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
const REPLAY_SCENARIOS = ['primary', 'permission_denied', 'route_unavailable'] as const;
const VALIDATION_COMMANDS = [
  'node scripts/run_playwright_test.mjs test -c playwright.config.ts test/e2e/all-app-meta-device-simulator.spec.ts --reporter=line',
  'npm run test:e2e:meta-glasses -- --reporter=line',
] as const;

type Modality = typeof MODALITIES[number];
type ReplayScenario = typeof REPLAY_SCENARIOS[number];

interface SimulatorModalityFlow {
  scenario: ReplayScenario;
  result: string;
  decision: string;
  fallback_surface: string;
  fallback_user_visible: boolean;
  rollback_state: string;
  operator_decision_visible: boolean;
  raw_payload_captured: false;
  receipt_refs: string[];
  event_dag_refs: string[];
}

interface VisibleTextEvidence {
  text: string;
  rendered: boolean;
  fully_visible: boolean;
}

interface PermissionReplayEvidence {
  declared_state: string;
  declared_policy_class: string;
  activation_decision: string;
  prompt_required: boolean;
  prompt_replayed: boolean;
  packet_denial_replayed: boolean;
  packet_approval_replayed: boolean;
  policy_resolution_replayed: boolean;
  denial_rollback_visible: boolean;
  denial_fallback_visible: boolean;
  modality_denial_replayed: boolean;
  receipts_preserved: boolean;
  decisions: VisibleTextEvidence[];
}

interface SimulatorSnapshot {
  packet_id: string;
  app_id: string;
  phase: string;
  focused_action: string;
  activation: string;
  decision: string;
  decision_history: string[];
  modality_results: Record<Modality, string>;
  modality_scenarios: Record<Modality, ReplayScenario | ''>;
  modality_history: Record<Modality, SimulatorModalityFlow[]>;
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
    focused_action_text_fully_visible: boolean;
    focus_control_received_dom_focus: boolean;
    final_control_received_dom_focus: boolean;
    final_focus_ring_visible: boolean;
    activated_method: string;
    activation_text_fully_visible: boolean;
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
  permission_replay: PermissionReplayEvidence;
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
    observed_text_fully_visible: boolean;
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
  flows: Array<SimulatorModalityFlow & { receipt_refs_preserved: boolean }>;
  receipt_refs_preserved: boolean;
}

interface BrowserFailure {
  kind: 'console' | 'pageerror';
  message: string;
}

interface AppReplayCoverage {
  app_id: string;
  app_title: string;
  packet_ids: string[];
  requested_modalities: string[];
  replayed_modalities: Modality[];
  replayed_scenarios: ReplayScenario[];
  packet_count: number;
  flow_count: number;
  bounded_layouts: boolean;
  focus_and_activation_visible: boolean;
  permission_and_denial_replayed: boolean;
  receipts_preserved: boolean;
  operator_decisions_visible: boolean;
  rollback_visible: boolean;
  fallback_visible: boolean;
  status: 'passed';
}

interface DeviceSimulatorApi {
  loadPacket: (packet: AllAppLiveOrbIdlHandoffPacket & { app_title: string }) => void;
  replayModality: (modality: Modality, scenario: ReplayScenario) => void;
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

    prepareScreenshotRoot();
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
      const focusedActionPresentation = await readVisibleTextEvidence(page, 'focused-action');
      expect(focusedActionPresentation).toMatchObject({
        text: packet.method_id,
        rendered: true,
        fully_visible: true,
      });
      await page.getByTestId('activate').click();

      const activationSnapshot = await snapshot(page);
      const permissionDecisions: VisibleTextEvidence[] = [
        await readVisibleTextEvidence(page, 'operator-decision'),
      ];
      let denialSnapshot: SimulatorSnapshot | undefined;
      let approvalSnapshot: SimulatorSnapshot | undefined;
      let denialRollbackFullyVisible = false;
      let denialFallbackFullyVisible = false;

      if (packet.permission.state === 'confirmation_required') {
        await expect(page.getByTestId('operator-decision')).toContainText('awaiting_operator_confirmation');
        await page.getByTestId('operator-deny').click();
        await expect(page.getByTestId('operator-decision')).toContainText('operator_denied');
        await expect(page.getByTestId('rollback-state')).toContainText(packet.rollback_behavior.mode);
        denialSnapshot = await snapshot(page);
        permissionDecisions.push(await readVisibleTextEvidence(page, 'operator-decision'));
        denialRollbackFullyVisible = (await readVisibleTextEvidence(page, 'rollback-state')).fully_visible;
        denialFallbackFullyVisible = (await readVisibleTextEvidence(page, 'fallback-state')).fully_visible;
        expect(denialRollbackFullyVisible).toBe(true);
        expect(denialFallbackFullyVisible).toBe(true);
        await page.getByTestId('operator-allow').click();
        await expect(page.getByTestId('operator-decision')).toContainText('operator_approved');
        approvalSnapshot = await snapshot(page);
        permissionDecisions.push(await readVisibleTextEvidence(page, 'operator-decision'));
      } else if (packet.permission.state === 'permitted') {
        await expect(page.getByTestId('operator-decision')).toContainText('policy_allowed');
      } else {
        await expect(page.getByTestId('operator-decision')).toContainText('policy_denied');
        await expect(page.getByTestId('fallback-state')).toContainText(packet.fallback_selection.target_surface);
      }
      await expect(page.getByTestId('activation-state')).toContainText(packet.method_id);
      const activationPresentation = await readVisibleTextEvidence(page, 'activation-state');
      expect(activationPresentation).toMatchObject({
        text: packet.method_id,
        rendered: true,
        fully_visible: true,
      });
      expect(permissionDecisions.every(decision => decision.fully_visible)).toBe(true);

      for (const modality of MODALITIES) {
        for (const scenario of REPLAY_SCENARIOS) {
          await page.evaluate(
            input => window.metaDeviceSimulator.replayModality(input.modality, input.scenario),
            { modality, scenario },
          );
          await expect(page.getByTestId(`modality-${modality}`)).toContainText(`${scenario}:`);
          await expect(page.getByTestId('operator-decision')).toContainText(
            scenario === 'primary'
              ? `modality_${modality}_policy_`
              : scenario === 'permission_denied'
                ? `modality_${modality}_operator_denied`
                : `modality_${modality}_route_unavailable`,
          );
          const replaySnapshot = await snapshot(page);
          const observedFlow = replaySnapshot.modality_history[modality].at(-1);
          expect(observedFlow).toMatchObject({
            scenario,
            raw_payload_captured: false,
            operator_decision_visible: true,
          });
          expect(sameValues(observedFlow?.receipt_refs ?? [], receiptBefore.receipt_refs)).toBe(true);
          expect(sameValues(observedFlow?.event_dag_refs ?? [], receiptBefore.event_dag_refs)).toBe(true);
          await expect(page.getByTestId('decision-history')).toContainText(observedFlow?.decision ?? '');
          await expect(page.getByTestId('operator-decision')).toBeVisible();
          if (observedFlow?.fallback_user_visible) {
            await expect(page.getByTestId('fallback-state')).toContainText(observedFlow.fallback_surface);
          }
          if (scenario !== 'primary') {
            expect(observedFlow?.fallback_user_visible).toBe(true);
            await expect(page.getByTestId('rollback-state')).toContainText(packet.rollback_behavior.mode);
          }
        }
      }

      await page.getByTestId('simulate-failure').click();
      await expect(page.getByTestId('rollback-state')).toContainText(packet.rollback_behavior.mode);
      await page.getByTestId('select-fallback').click();
      await expect(page.getByTestId('fallback-state')).toContainText(packet.fallback_selection.target_surface);
      const fallbackPresentation = await readVisibleTextEvidence(page, 'fallback-state');
      expect(fallbackPresentation).toMatchObject({ rendered: true, fully_visible: true });
      const finalFocus = await readFocusState(page, 'select-fallback');
      expect(finalFocus).toEqual({ received_dom_focus: true, focus_ring_visible: true });

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
      for (const modality of MODALITIES) {
        expect(receiptAfter.modality_history[modality].map(flow => flow.scenario)).toEqual(REPLAY_SCENARIOS);
      }

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
          focused_action_text_fully_visible: focusedActionPresentation.fully_visible,
          focus_control_received_dom_focus: focusControlReceivedDomFocus,
          final_control_received_dom_focus: finalFocus.received_dom_focus,
          final_focus_ring_visible: finalFocus.focus_ring_visible,
          activated_method: receiptAfter.activation,
          activation_text_fully_visible: activationPresentation.fully_visible,
          activation_decision: activationSnapshot.decision,
        },
        layout,
        modality_results: receiptAfter.modality_results,
        modality_replays: buildModalityReplayEvidence(packet, receiptAfter),
        permission_replay: buildPermissionReplayEvidence(
          packet,
          receiptBefore,
          receiptAfter,
          activationSnapshot,
          denialSnapshot,
          approvalSnapshot,
          denialRollbackFullyVisible,
          denialFallbackFullyVisible,
          permissionDecisions,
        ),
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
          observed_text_fully_visible: fallbackPresentation.fully_visible,
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
    const appCoverage = buildAppReplayCoverage(results);
    expect(appCoverage.map(app => app.app_id).sort()).toEqual(
      VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => app.id).sort(),
    );
    expect(appCoverage.every(app => app.status === 'passed')).toBe(true);
    const declaredScreenshots = [safetyProbes.screenshot, ...results.map(result => result.screenshot)];
    const screenshotsCreated = declaredScreenshots.every(relativePath => {
      const absolutePath = path.resolve(process.cwd(), relativePath);
      return fs.existsSync(absolutePath) && fs.statSync(absolutePath).size > 0;
    });
    const screenshotsOnDisk = fs.readdirSync(SCREENSHOT_ROOT)
      .filter(fileName => fileName.endsWith('.png'))
      .map(fileName => path.relative(process.cwd(), path.join(SCREENSHOT_ROOT, fileName)))
      .sort();

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
      replay_scenarios: REPLAY_SCENARIOS,
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
          && result.focus_activation.focused_action_text_fully_visible
          && result.focus_activation.focus_control_received_dom_focus
          && result.focus_activation.final_control_received_dom_focus
          && result.focus_activation.final_focus_ring_visible
          && result.focus_activation.activation_text_fully_visible
          && Boolean(result.focus_activation.activated_method)),
        permission_and_denial_flows_replayed: results.every(result => (
          result.permission_replay.modality_denial_replayed
          && result.permission_replay.receipts_preserved
          && result.permission_replay.decisions.every(decision => decision.fully_visible)
          && (result.permission_replay.prompt_required
            ? result.permission_replay.prompt_replayed
              && result.permission_replay.packet_denial_replayed
              && result.permission_replay.packet_approval_replayed
              && result.permission_replay.denial_rollback_visible
              && result.permission_replay.denial_fallback_visible
            : result.permission_replay.policy_resolution_replayed)
        )),
        receipts_preserved: results.every(result => result.receipt_preservation.preserved),
        operator_decisions_visible: results.every(result => result.operator_decisions.length > 0),
        rollback_replayed: results.every(result => result.rollback.observed_state.includes(result.rollback.expected_mode)),
        all_packet_fallbacks_visible: results.every(result => (
          Boolean(result.fallback.observed_surface) && result.fallback.observed_text_fully_visible
        )),
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
        primary_denial_and_unavailable_flows_replayed: results.every(result => MODALITIES.every(modality => (
          sameValues(
            result.modality_replays[modality].flows.map(flow => flow.scenario),
            REPLAY_SCENARIOS,
          )
        ))),
        receipts_preserved_across_every_modality_flow: results.every(result => MODALITIES.every(modality => (
          result.modality_replays[modality].flows.every(flow => flow.receipt_refs_preserved)
        ))),
        rollback_visible_across_denial_and_unavailable_flows: results.every(result => MODALITIES.every(modality => (
          result.modality_replays[modality].flows
            .filter(flow => flow.scenario !== 'primary')
            .every(flow => flow.rollback_state.includes(result.rollback.expected_mode))
        ))),
        operator_decisions_visible_across_every_modality_flow: results.every(result => MODALITIES.every(modality => (
          result.modality_replays[modality].flows.every(flow => flow.operator_decision_visible)
        ))),
        typed_fallback_visible_across_denial_and_unavailable_flows: results.every(result => MODALITIES.every(modality => (
          result.modality_replays[modality].flows
            .filter(flow => flow.scenario !== 'primary')
            .every(flow => flow.fallback_user_visible && Boolean(flow.fallback_surface))
        ))),
        raw_media_suppressed_across_every_modality_flow: results.every(result => MODALITIES.every(modality => (
          result.modality_replays[modality].flows.every(flow => !flow.raw_payload_captured)
        ))),
        report_and_screenshots_created: screenshotsCreated
          && declaredScreenshots.length === catalog.packet_count + 1
          && sameValues(screenshotsOnDisk, declaredScreenshots),
        every_app_has_complete_replay_evidence: appCoverage.every(app => app.status === 'passed'),
        zero_browser_errors: browserFailures.length === 0,
      },
      modality_summary: Object.fromEntries(MODALITIES.map(modality => [
        modality,
        results.filter(result => Boolean(result.modality_results[modality])).length,
      ])),
      permission_summary: countBy(results, result => result.permission_state),
      fallback_summary: countBy(results, result => result.fallback.observed_surface),
      platform_safety_probes: safetyProbes,
      applications: appCoverage,
      browser_failures: browserFailures,
      screenshot_root: path.relative(process.cwd(), SCREENSHOT_ROOT),
      output_manifest: {
        report: path.relative(process.cwd(), REPORT_PATH),
        screenshot_count: declaredScreenshots.length,
        screenshots: declaredScreenshots,
      },
      packets: results,
    };

    expect(Object.values(report.acceptance).every(Boolean)).toBe(true);
    fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    expect(fs.statSync(REPORT_PATH).size).toBeGreaterThan(0);
    expect(JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'))).toEqual(report);
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
    const flows = replay.modality_history[modality].map(flow => ({
      ...flow,
      receipt_refs_preserved: sameValues(
        flow.receipt_refs,
        packet.receipt_refs.map(reference => reference.cid),
      ) && sameValues(
        flow.event_dag_refs,
        packet.event_dag_refs.map(reference => reference.cid),
      ),
    }));
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
      flows,
      receipt_refs_preserved: receiptRefsPreserved && flows.every(flow => flow.receipt_refs_preserved),
    };
    return [modality, evidence] as const;
  });
  return Object.fromEntries(entries) as Record<Modality, ModalityReplayEvidence>;
}

function buildPermissionReplayEvidence(
  packet: AllAppLiveOrbIdlHandoffPacket,
  before: SimulatorSnapshot,
  after: SimulatorSnapshot,
  activation: SimulatorSnapshot,
  denial: SimulatorSnapshot | undefined,
  approval: SimulatorSnapshot | undefined,
  denialRollbackFullyVisible: boolean,
  denialFallbackFullyVisible: boolean,
  decisions: VisibleTextEvidence[],
): PermissionReplayEvidence {
  const promptRequired = packet.permission.state === 'confirmation_required';
  const expectedPolicyDecision = packet.permission.state === 'permitted'
    ? 'policy_allowed'
    : packet.permission.state === 'denied'
      ? 'policy_denied'
      : 'awaiting_operator_confirmation';
  const modalityDenialReplayed = MODALITIES.every(modality => (
    after.modality_history[modality].some(flow => (
      flow.scenario === 'permission_denied'
      && flow.decision === `modality_${modality}_operator_denied`
      && flow.operator_decision_visible
      && flow.fallback_user_visible
      && flow.rollback_state.includes(packet.rollback_behavior.mode)
    ))
  ));
  const receiptsPreserved = [activation, denial, approval, after]
    .filter((snapshot): snapshot is SimulatorSnapshot => Boolean(snapshot))
    .every(snapshot => (
      sameValues(snapshot.receipt_refs, before.receipt_refs)
      && sameValues(snapshot.event_dag_refs, before.event_dag_refs)
    ));

  return {
    declared_state: packet.permission.state,
    declared_policy_class: packet.permission.policy_class,
    activation_decision: activation.decision,
    prompt_required: promptRequired,
    prompt_replayed: promptRequired
      ? activation.decision === 'awaiting_operator_confirmation'
      : false,
    packet_denial_replayed: denial?.decision === 'operator_denied',
    packet_approval_replayed: approval?.decision === 'operator_approved',
    policy_resolution_replayed: !promptRequired && activation.decision === expectedPolicyDecision,
    denial_rollback_visible: denialRollbackFullyVisible
      && (denial?.rollback_state.includes(packet.rollback_behavior.mode) ?? false),
    denial_fallback_visible: denialFallbackFullyVisible
      && denial?.fallback_surface === packet.fallback_selection.target_surface,
    modality_denial_replayed: modalityDenialReplayed,
    receipts_preserved: receiptsPreserved,
    decisions,
  };
}

function buildAppReplayCoverage(results: readonly PacketReplayResult[]): AppReplayCoverage[] {
  const titleByApp = new Map(VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => [app.id, app.title]));
  const packetsByApp = new Map<string, PacketReplayResult[]>();
  for (const result of results) {
    const appPackets = packetsByApp.get(result.app_id) ?? [];
    appPackets.push(result);
    packetsByApp.set(result.app_id, appPackets);
  }

  return VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => {
    const packets = packetsByApp.get(app.id) ?? [];
    expect(packets.length, `${app.id} has no SVD-098 packet to replay`).toBeGreaterThan(0);
    const flows = packets.flatMap(packet => MODALITIES.flatMap(modality => (
      packet.modality_replays[modality].flows
    )));
    const nonPrimaryFlows = flows.filter(flow => flow.scenario !== 'primary');
    const coverage: AppReplayCoverage = {
      app_id: app.id,
      app_title: titleByApp.get(app.id) ?? app.id,
      packet_ids: packets.map(packet => packet.packet_id).sort(),
      requested_modalities: [...new Set(packets.map(packet => packet.requested_modality))].sort(),
      replayed_modalities: [...MODALITIES],
      replayed_scenarios: [...REPLAY_SCENARIOS],
      packet_count: packets.length,
      flow_count: flows.length,
      bounded_layouts: packets.every(packet => packet.layout.bounded && !packet.layout.controls_overlap),
      focus_and_activation_visible: packets.every(packet => (
        packet.focus_activation.focus_visible
        && packet.focus_activation.focused_action_text_fully_visible
        && packet.focus_activation.focus_control_received_dom_focus
        && packet.focus_activation.final_control_received_dom_focus
        && packet.focus_activation.final_focus_ring_visible
        && packet.focus_activation.activation_text_fully_visible
        && Boolean(packet.focus_activation.activated_method)
      )),
      permission_and_denial_replayed: packets.every(packet => (
        packet.permission_replay.modality_denial_replayed
        && packet.permission_replay.receipts_preserved
        && packet.permission_replay.decisions.every(decision => decision.fully_visible)
        && (packet.permission_replay.prompt_required
          ? packet.permission_replay.prompt_replayed
            && packet.permission_replay.packet_denial_replayed
            && packet.permission_replay.packet_approval_replayed
            && packet.permission_replay.denial_rollback_visible
            && packet.permission_replay.denial_fallback_visible
          : packet.permission_replay.policy_resolution_replayed)
      )),
      receipts_preserved: packets.every(packet => packet.receipt_preservation.preserved)
        && flows.every(flow => flow.receipt_refs_preserved),
      operator_decisions_visible: flows.every(flow => flow.operator_decision_visible),
      rollback_visible: nonPrimaryFlows.every(flow => Boolean(flow.rollback_state)),
      fallback_visible: nonPrimaryFlows.every(flow => flow.fallback_user_visible && Boolean(flow.fallback_surface)),
      status: 'passed',
    };
    expect(coverage.flow_count).toBe(coverage.packet_count * MODALITIES.length * REPLAY_SCENARIOS.length);
    expect([
      coverage.bounded_layouts,
      coverage.focus_and_activation_visible,
      coverage.permission_and_denial_replayed,
      coverage.receipts_preserved,
      coverage.operator_decisions_visible,
      coverage.rollback_visible,
      coverage.fallback_visible,
    ].every(Boolean), `${app.id} has incomplete simulator evidence`).toBe(true);
    return coverage;
  });
}

function prepareScreenshotRoot(): void {
  fs.mkdirSync(SCREENSHOT_ROOT, { recursive: true });
  for (const fileName of fs.readdirSync(SCREENSHOT_ROOT)) {
    const filePath = path.join(SCREENSHOT_ROOT, fileName);
    if (fileName.endsWith('.png') && fs.statSync(filePath).isFile()) fs.rmSync(filePath);
  }
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
  await page.locator('main').screenshot({ path: screenshotPath });
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

async function readFocusState(
  page: Page,
  testId: string,
): Promise<{ received_dom_focus: boolean; focus_ring_visible: boolean }> {
  return page.getByTestId(testId).evaluate(element => {
    const style = window.getComputedStyle(element);
    return {
      received_dom_focus: element === document.activeElement,
      focus_ring_visible: style.outlineStyle !== 'none'
        && style.outlineWidth !== '0px'
        && style.outlineColor !== 'transparent',
    };
  });
}

async function readVisibleTextEvidence(page: Page, testId: string): Promise<VisibleTextEvidence> {
  return page.getByTestId(testId).evaluate(element => {
    const viewport = element.closest('[data-testid="device-viewport"]') as HTMLElement | null;
    const node = element as HTMLElement;
    const style = window.getComputedStyle(node);
    const bounds = node.getBoundingClientRect();
    const viewportBounds = viewport?.getBoundingClientRect();
    const rendered = style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity) > 0
      && bounds.width > 0
      && bounds.height > 0;
    const insideViewport = Boolean(viewportBounds)
      && bounds.left >= viewportBounds!.left - 1
      && bounds.right <= viewportBounds!.right + 1
      && bounds.top >= viewportBounds!.top - 1
      && bounds.bottom <= viewportBounds!.bottom + 1;
    return {
      text: node.textContent?.trim() ?? '',
      rendered,
      fully_visible: rendered
        && insideViewport
        && node.scrollWidth <= node.clientWidth + 1
        && node.scrollHeight <= node.clientHeight + 1,
    };
  });
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
    [data-testid="focused-action"], [data-testid="activation-state"] { min-height: 21px; max-height: 21px; white-space: normal; overflow-wrap: anywhere; text-overflow: clip; font-size: 9px; line-height: 1.15; }
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
          policy_authorized: false,
          modality_results: { display: '', camera: '', microphone: '', speaker: '', input: '' },
          modality_scenarios: { display: '', camera: '', microphone: '', speaker: '', input: '' },
          modality_history: { display: [], camera: [], microphone: [], speaker: [], input: [] },
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
            + escape(state.modality_scenarios[kind] || 'pending') + ': '
            + escape(state.modality_results[kind] || 'pending') + '</div>',
        ).join('');
        viewport.innerHTML = [
          '<div class="topline"><span class="app">' + escape(packet.app_title) + '</span><span class="phase">' + escape(state.phase) + '</span></div>',
          '<div class="identity" data-testid="packet-identity">' + escape(packet.packet_id) + ' · ' + escape(packet.correlation_id) + '</div>',
          '<div class="grid"><section class="panel">',
          '<div class="label">Operator decision</div>',
          '<div class="value" data-testid="operator-decision">' + escape(state.decision) + '</div>',
          '<div class="value" data-testid="decision-history">history: ' + escape(state.decision_history.join(' → ')) + '</div>',
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

      function textFullyVisible(testId, expectedText) {
        const element = viewport.querySelector('[data-testid="' + testId + '"]');
        if (!element || !element.textContent.includes(expectedText)) return false;
        const style = window.getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        const viewportBounds = viewport.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity) > 0
          && bounds.width > 0
          && bounds.height > 0
          && bounds.left >= viewportBounds.left - 1
          && bounds.right <= viewportBounds.right + 1
          && bounds.top >= viewportBounds.top - 1
          && bounds.bottom <= viewportBounds.bottom + 1
          && element.scrollWidth <= element.clientWidth + 1
          && element.scrollHeight <= element.clientHeight + 1;
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
            state.policy_authorized = true;
            decide('policy_allowed');
            state.phase = 'activated_safe_projection';
          } else {
            state.policy_authorized = false;
            decide('policy_denied');
            state.rollback_state = 'projection_preserved:' + packet.rollback_behavior.mode;
            applyFallback(packet.fallback_selection.target_surface);
          }
        } else if (id === 'operator-deny') {
          state.policy_authorized = false;
          decide('operator_denied');
          state.rollback_state = 'operator_denial:' + packet.rollback_behavior.mode;
          applyFallback(packet.fallback_selection.target_surface);
        } else if (id === 'operator-allow') {
          state.policy_authorized = packet.permission.state === 'confirmation_required';
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
        viewport.querySelector('[data-testid="' + id + '"]')?.focus();
      });

      window.metaDeviceSimulator = {
        loadPacket(input) {
          packet = input;
          state = emptyState();
          state.phase = 'packet_loaded_safe';
          state.policy_authorized = packet.permission.state === 'permitted';
          state.receipt_refs = packet.receipt_refs.map(item => item.cid);
          state.event_dag_refs = packet.event_dag_refs.map(item => item.cid);
          render();
        },
        replayModality(kind, scenario) {
          const item = constraint(kind);
          const fallbackSurface = item.fallback_surface || packet.fallback_selection.target_surface;
          const primaryAllowed = item.availability === 'available'
            && (item.allowed || (
              kind === packet.requested_modality
              && packet.permission.state === 'confirmation_required'
              && state.policy_authorized
            ));
          state.modality_scenarios[kind] = scenario;
          if (scenario === 'primary') {
            decide('modality_' + kind + '_policy_' + (primaryAllowed ? 'allowed' : 'degraded'));
            state.rollback_state = 'not_required';
            if (!primaryAllowed) applyFallback(fallbackSurface);
            state.phase = primaryAllowed ? 'safe_modality_primary_visible' : 'safe_modality_fallback_visible';
          } else if (scenario === 'permission_denied') {
            decide('modality_' + kind + '_operator_denied');
            state.rollback_state = 'operator_denial:' + packet.rollback_behavior.mode;
            applyFallback(fallbackSurface);
            state.phase = 'modality_denied_fallback_visible';
          } else {
            decide('modality_' + kind + '_route_unavailable');
            state.rollback_state = 'route_unavailable:' + packet.rollback_behavior.mode;
            applyFallback(fallbackSurface);
            state.phase = 'modality_unavailable_fallback_visible';
          }
          if (kind === 'display') {
            state.modality_results.display = scenario === 'primary' && primaryAllowed
              ? 'safe_display_direct_projection'
              : 'safe_display_fallback_projection';
          } else if (kind === 'camera') {
            if (scenario !== 'primary' || !primaryAllowed) {
              state.modality_results.camera = 'camera_unavailable_' + fallbackSurface + '_fallback';
              state.camera_ref = 'none_raw_pixels_redacted';
            } else {
              state.modality_results.camera = 'camera_metadata_ref';
              state.camera_ref = 'ipfs://simulator/camera-metadata-ref';
            }
          } else if (kind === 'microphone') {
            if (scenario !== 'primary' || !primaryAllowed) {
              state.modality_results.microphone = 'microphone_unavailable_' + fallbackSurface + '_transcription_fallback';
              state.transcript = fallbackSurface + '_transcription_fallback_raw_audio_redacted';
            } else {
              state.modality_results.microphone = 'redacted_transcript';
              state.transcript = 'redacted_transcript_available';
            }
          } else if (kind === 'speaker') {
            if (scenario === 'primary' && item.availability === 'fallback_only') {
              state.modality_results.speaker = 'audio_summary_headphone_fallback';
              state.audio_route = 'simulator_headphones_or_mobile_audio';
            } else {
              state.modality_results.speaker = 'speaker_unavailable_' + fallbackSurface + '_audio_fallback';
              state.audio_route = fallbackSurface + '_audio_fallback';
            }
          } else {
            state.modality_results.input = scenario === 'primary'
              ? item.read_only ? 'focus_read_only' : 'focus_activation_ready'
              : 'input_' + scenario + '_' + fallbackSurface + '_fallback';
          }
          const fallbackExpected = scenario !== 'primary' || !primaryAllowed;
          const flow = {
            scenario,
            result: state.modality_results[kind],
            decision: state.decision,
            fallback_surface: scenario === 'primary' && primaryAllowed ? item.primary_surface : fallbackSurface,
            fallback_user_visible: false,
            rollback_state: state.rollback_state,
            operator_decision_visible: false,
            raw_payload_captured: false,
            receipt_refs: [...state.receipt_refs],
            event_dag_refs: [...state.event_dag_refs],
          };
          state.modality_history[kind].push(flow);
          render();
          flow.operator_decision_visible = textFullyVisible('operator-decision', flow.decision);
          flow.fallback_user_visible = fallbackExpected
            ? textFullyVisible('fallback-state', fallbackSurface)
            : false;
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
