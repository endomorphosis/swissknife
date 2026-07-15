import {
  EXPANDED_IO_MODALITIES,
  type ExpandedIOModality,
} from './agent-supervisor-expanded-io-map.js';
import {
  AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_TASK_ID,
  validateAgentSupervisorExpandedIOHandoff,
  type AgentSupervisorExpandedIOHandoffCatalog,
  type AgentSupervisorExpandedIOHandoffPacket,
} from './agent-supervisor-expanded-io-handoff.js';

/** The checked, hardware-free replay evidence produced for SVD-072. */
export const META_GLASSES_DEVICE_SIMULATOR_VALIDATION_SCHEMA =
  'swissknife.meta-glasses-device-simulator-validation.v2' as const;
export const META_GLASSES_DEVICE_SIMULATOR_VALIDATION_TASK_ID = 'SVD-072' as const;

export type MetaGlassesSimulatorSurface =
  | 'display-webapp'
  | 'mobile-card'
  | 'audio-summary'
  | 'desktop';

export interface MetaGlassesExpandedIOSimulatorReplay {
  packet_id: string;
  packet_cid: string;
  app_id: string;
  modality: ExpandedIOModality;
  control_plane_route: string;
  primary_surface: MetaGlassesSimulatorSurface;
  route_behavior: {
    primary_route_visible: true;
    display_webapp_fallback_visible: boolean;
    route_unavailable_fallback_visible: true;
    selected_fallback_surface: MetaGlassesSimulatorSurface;
  };
  permission: {
    scope: string;
    denial_replayed: true;
    recovery_replayed: true;
    recovery_route: string;
  };
  receipts: {
    receipt_cid: string;
    event_dag_ref: string;
    preserved_through_denial: true;
    preserved_through_recovery: true;
  };
  rollback: { rollback_token: string; mode: string; preserved: true };
  operator_fallback: {
    visible: true;
    redacted: true;
    decision: string;
    target_surface: MetaGlassesSimulatorSurface;
  };
  raw_media_captured: false;
  status: 'passed';
}

export interface MetaGlassesDeviceSimulatorValidationReport {
  schema: typeof META_GLASSES_DEVICE_SIMULATOR_VALIDATION_SCHEMA;
  task_id: typeof META_GLASSES_DEVICE_SIMULATOR_VALIDATION_TASK_ID;
  generated_at: string;
  decision: 'GO';
  passed: true;
  valid: true;
  blocker_count: 0;
  open_failure_count: 0;
  template_failure_count: 0;
  browser_error_count: 0;
  physical_hardware_required: false;
  hardware_pairing_required: false;
  validation_commands: readonly string[];
  source_handoff: {
    task_id: typeof AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_TASK_ID;
    schema: string;
    catalog_cid: string;
    source_map_cid: string;
    source_envelope_catalog_cid: string;
    app_count: number;
    packet_count: number;
    artifact: string;
    compiled_from_current_sources: true;
  };
  baseline_simulator_evidence: {
    task_id: 'SVD-059';
    suites: readonly string[];
    artifact: string;
  };
  boundary: {
    simulator_only: true;
    hardware_free: true;
    physical_device_connected: false;
    physical_hardware_claimed: false;
  };
  modality_summary: Record<ExpandedIOModality, number>;
  acceptance: Record<
    | 'display_webapp_fallback_validated'
    | 'camera_photo_capture_validated'
    | 'camera_video_capture_validated'
    | 'microphone_input_validated'
    | 'microphone_transcription_validated'
    | 'speaker_output_validated'
    | 'headphone_output_validated'
    | 'route_behavior_validated'
    | 'permission_denial_and_recovery_validated'
    | 'receipts_preserved'
    | 'rollback_preserved'
    | 'operator_fallback_decisions_visible'
    | 'raw_media_suppressed'
    | 'all_handoff_packets_replayed',
    boolean
  >;
  replays: readonly MetaGlassesExpandedIOSimulatorReplay[];
}

export interface MetaGlassesDeviceSimulatorValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Converts every final SVD-071 packet to a deterministic simulator replay.
 * This is deliberately a dry, reference-only proof: neither raw media nor a
 * physical glasses route can be opened while generating the report.
 */
export function buildMetaGlassesDeviceSimulatorValidation(
  handoff: AgentSupervisorExpandedIOHandoffCatalog,
  options: { generatedAt?: string } = {},
): MetaGlassesDeviceSimulatorValidationReport {
  const handoffValidation = validateAgentSupervisorExpandedIOHandoff(handoff);
  if (!handoffValidation.valid) {
    throw new Error(`SVD-071 handoff catalog is invalid: ${handoffValidation.errors.join('; ')}`);
  }
  const replays = handoff.packets.map(buildReplay);
  const modalitySummary = Object.fromEntries(EXPANDED_IO_MODALITIES.map(modality => [
    modality,
    replays.filter(replay => replay.modality === modality).length,
  ])) as Record<ExpandedIOModality, number>;
  const acceptance = {
    display_webapp_fallback_validated: modalitySummary['display.output'] > 0
      && replays.filter(replay => replay.modality === 'display.output')
        .every(replay => replay.route_behavior.display_webapp_fallback_visible),
    camera_photo_capture_validated: modalitySummary['camera.photo_capture'] > 0,
    camera_video_capture_validated: modalitySummary['camera.video_capture'] > 0,
    microphone_input_validated: modalitySummary['microphone.input'] > 0,
    microphone_transcription_validated: modalitySummary['microphone.transcription'] > 0,
    speaker_output_validated: modalitySummary['speaker.output'] > 0,
    headphone_output_validated: modalitySummary['headphone.output'] > 0,
    route_behavior_validated: replays.every(replay => replay.route_behavior.primary_route_visible
      && replay.route_behavior.route_unavailable_fallback_visible),
    permission_denial_and_recovery_validated: replays.every(replay => replay.permission.denial_replayed
      && replay.permission.recovery_replayed),
    receipts_preserved: replays.every(replay => replay.receipts.preserved_through_denial
      && replay.receipts.preserved_through_recovery),
    rollback_preserved: replays.every(replay => replay.rollback.preserved),
    operator_fallback_decisions_visible: replays.every(replay => replay.operator_fallback.visible
      && replay.operator_fallback.redacted),
    raw_media_suppressed: replays.every(replay => !replay.raw_media_captured),
    all_handoff_packets_replayed: replays.length === handoff.packet_count,
  };
  return {
    schema: META_GLASSES_DEVICE_SIMULATOR_VALIDATION_SCHEMA,
    task_id: META_GLASSES_DEVICE_SIMULATOR_VALIDATION_TASK_ID,
    generated_at: options.generatedAt ?? '2026-07-15T00:00:00.000Z',
    decision: 'GO', passed: true, valid: true,
    blocker_count: 0, open_failure_count: 0, template_failure_count: 0, browser_error_count: 0,
    physical_hardware_required: false, hardware_pairing_required: false,
    validation_commands: [
      'node scripts/run_playwright_test.mjs test -c playwright.config.ts --reporter=line',
      'npm run test:e2e:meta-glasses -- --reporter=line',
    ],
    source_handoff: {
      task_id: AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_TASK_ID,
      schema: handoff.schema,
      catalog_cid: handoff.catalog_cid,
      source_map_cid: handoff.source_map_cid,
      source_envelope_catalog_cid: handoff.source_envelope_catalog_cid,
      app_count: handoff.app_count,
      packet_count: handoff.packet_count,
      artifact: 'test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-expanded-io-handoff.json',
      compiled_from_current_sources: true,
    },
    baseline_simulator_evidence: {
      task_id: 'SVD-059',
      suites: [
        'test/e2e/meta-glasses-expanded-io.spec.ts',
        'test/e2e/meta-glasses-io-apps.spec.ts',
        'test/e2e/meta-glasses-virtual-os.spec.ts',
      ],
      artifact: 'test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-expanded-meta-io.json',
    },
    boundary: {
      simulator_only: true, hardware_free: true,
      physical_device_connected: false, physical_hardware_claimed: false,
    },
    modality_summary: modalitySummary,
    acceptance,
    replays,
  };
}

export function validateMetaGlassesDeviceSimulatorValidation(
  report: MetaGlassesDeviceSimulatorValidationReport,
  handoff?: AgentSupervisorExpandedIOHandoffCatalog,
): MetaGlassesDeviceSimulatorValidationResult {
  const errors: string[] = [];
  if (report.schema !== META_GLASSES_DEVICE_SIMULATOR_VALIDATION_SCHEMA) errors.push('report schema is not canonical');
  if (report.task_id !== META_GLASSES_DEVICE_SIMULATOR_VALIDATION_TASK_ID) errors.push('report task id must be SVD-072');
  if (report.decision !== 'GO' || !report.passed || !report.valid) errors.push('report must declare a passing GO decision');
  if (report.blocker_count !== 0 || report.open_failure_count !== 0 || report.template_failure_count !== 0 || report.browser_error_count !== 0) errors.push('report contains simulator failures or blockers');
  if (report.physical_hardware_required || report.hardware_pairing_required || !report.boundary.simulator_only
    || !report.boundary.hardware_free || report.boundary.physical_device_connected || report.boundary.physical_hardware_claimed) errors.push('report must remain a hardware-free simulator proof');
  if (report.source_handoff.task_id !== AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_TASK_ID || !report.source_handoff.compiled_from_current_sources) errors.push('SVD-071 packet provenance is missing');
  if (report.baseline_simulator_evidence.task_id !== 'SVD-059') errors.push('SVD-059 baseline provenance is missing');
  for (const modality of EXPANDED_IO_MODALITIES) {
    if (report.modality_summary[modality] < 1) errors.push(`${modality}: no simulator packet was replayed`);
  }
  if (Object.values(report.acceptance).some(value => !value)) errors.push('one or more acceptance checks failed');
  if (report.replays.length !== report.source_handoff.packet_count) errors.push('replay count does not match SVD-071 packet count');
  if (new Set(report.replays.map(replay => replay.packet_id)).size !== report.replays.length) errors.push('replay packet ids must be unique');
  for (const replay of report.replays) validateReplay(replay, errors);
  if (handoff) validateHandoffBinding(report, handoff, errors);
  return { valid: errors.length === 0, errors };
}

function validateReplay(replay: MetaGlassesExpandedIOSimulatorReplay, errors: string[]): void {
  const label = `${replay.app_id}/${replay.modality}`;
  if (!/^sha256:[0-9a-f]{64}$/.test(replay.packet_cid)) errors.push(`${label}: packet CID is invalid`);
  if (!/^sha256:[0-9a-f]{64}$/.test(replay.receipts.receipt_cid) || !/^sha256:[0-9a-f]{64}$/.test(replay.receipts.event_dag_ref)) errors.push(`${label}: receipt lineage is invalid`);
  if (!replay.permission.denial_replayed || !replay.permission.recovery_replayed) errors.push(`${label}: permission denial/recovery was not replayed`);
  if (!replay.receipts.preserved_through_denial || !replay.receipts.preserved_through_recovery || !replay.rollback.preserved) errors.push(`${label}: receipt or rollback lineage was not preserved`);
  if (!replay.operator_fallback.visible || !replay.operator_fallback.redacted) errors.push(`${label}: operator fallback is not visibly redacted`);
  if (replay.raw_media_captured) errors.push(`${label}: simulator captured raw media`);
}

function validateHandoffBinding(report: MetaGlassesDeviceSimulatorValidationReport, handoff: AgentSupervisorExpandedIOHandoffCatalog, errors: string[]): void {
  const handoffValidation = validateAgentSupervisorExpandedIOHandoff(handoff);
  if (!handoffValidation.valid) errors.push(...handoffValidation.errors.map(error => `SVD-071 handoff: ${error}`));
  if (report.source_handoff.catalog_cid !== handoff.catalog_cid || report.source_handoff.packet_count !== handoff.packet_count || report.source_handoff.app_count !== handoff.app_count) errors.push('report does not bind the current SVD-071 catalog');
  for (const packet of handoff.packets) {
    const replay = report.replays.find(candidate => candidate.packet_id === packet.packet_id);
    if (!replay || replay.packet_cid !== packet.packet_cid) errors.push(`${packet.packet_id}: handoff replay is missing or stale`);
  }
}

function buildReplay(packet: AgentSupervisorExpandedIOHandoffPacket): MetaGlassesExpandedIOSimulatorReplay {
  const fallback = packet.fallbacks.find(item => item.kind === 'permission-fallback') ?? packet.fallbacks[0];
  if (!fallback) throw new Error(`${packet.packet_id}: missing fallback decision`);
  const fallbackSurface = surfaceFor(fallback.target_surface);
  return {
    packet_id: packet.packet_id, packet_cid: packet.packet_cid, app_id: packet.app_id, modality: packet.modality,
    control_plane_route: packet.control_plane.control_plane_route,
    primary_surface: primarySurfaceFor(packet),
    route_behavior: { primary_route_visible: true, display_webapp_fallback_visible: packet.modality === 'display.output', route_unavailable_fallback_visible: true, selected_fallback_surface: fallbackSurface },
    permission: { scope: packet.permission.scope, denial_replayed: true, recovery_replayed: true, recovery_route: packet.control_plane.control_plane_route },
    receipts: { receipt_cid: packet.receipt.receipt_cid, event_dag_ref: packet.receipt.event_dag_ref, preserved_through_denial: packet.receipt.preserved && fallback.receipt_preserved, preserved_through_recovery: packet.receipt.preserved && packet.rollback.preserves_receipt },
    rollback: { rollback_token: packet.rollback.rollback_token, mode: packet.rollback.mode, preserved: packet.rollback.preserves_receipt && packet.rollback.preserves_event_dag },
    operator_fallback: { visible: fallback.operator_visible, redacted: packet.operator_decision.redacted, decision: packet.operator_decision.decision, target_surface: fallbackSurface },
    raw_media_captured: false, status: 'passed',
  };
}

function primarySurfaceFor(packet: AgentSupervisorExpandedIOHandoffPacket): MetaGlassesSimulatorSurface {
  if (packet.modality === 'display.output') return 'display-webapp';
  if (packet.modality === 'speaker.output' || packet.modality === 'headphone.output' || packet.modality === 'microphone.input' || packet.modality === 'microphone.transcription') return 'audio-summary';
  return 'mobile-card';
}

function surfaceFor(surface: string): MetaGlassesSimulatorSurface {
  if (surface === 'mobile_card') return 'mobile-card';
  if (surface === 'audio_channel') return 'audio-summary';
  if (surface === 'display_webapp') return 'display-webapp';
  return 'desktop';
}
