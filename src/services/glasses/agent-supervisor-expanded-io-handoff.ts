import {
  buildAgentSupervisorExpandedIOEnvelopes,
  validateAgentSupervisorExpandedIOEnvelopes,
  type AgentSupervisorExpandedIOEnvelope,
  type AgentSupervisorExpandedIOEnvelopeCatalog,
} from '../apps/agent-supervisor-expanded-io-envelopes.js';
import { computeCID, computeInterfaceCID } from '../mcp/mcp-idl.js';
import {
  buildAgentSupervisorExpandedIOMap,
  validateAgentSupervisorExpandedIOMap,
  type AgentSupervisorExpandedIOMap,
  type ExpandedIOModality,
} from './agent-supervisor-expanded-io-map.js';
import {
  buildVirtualDesktopOrbIdlCompleteCoverage,
  validateVirtualDesktopOrbIdlCompleteCoverage,
  type DesktopOrbIdlAppDescriptor,
} from './desktop-orb-idl-contract.js';
import { createMetaGlassesAudioAppRequirements } from './meta-glasses-audio-adapter.js';

export const AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_SCHEMA =
  'swissknife.agent-supervisor-expanded-io-handoff.v1' as const;
export const AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_CATALOG_ID =
  'org.hallucinate.swissknife.agent-supervisor-expanded-io-handoff' as const;
export const AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_TASK_ID = 'SVD-071' as const;

export type ExpandedIOHandoffSurface = 'display_webapp' | 'mobile_card' | 'audio_channel' | 'desktop';
export type ExpandedIOHandoffFallbackKind =
  | 'permission-fallback'
  | 'audio-summary'
  | 'mobile-card'
  | 'desktop-only';

export interface ExpandedIOOrbIdlReference {
  descriptor_id: string;
  interface_cid: string;
  descriptor_cid: string;
  method_id: 'read_status' | 'request_action' | 'request_fallback';
  method_cid: string;
}

export interface ExpandedIOControlPlaneRoute {
  binding_id: string;
  source_action_binding: string | null;
  capability: 'display.output' | 'camera.photo_capture' | 'camera.video_capture' | 'microphone.input' | 'speaker.output' | 'headphone.output';
  control_plane_route: 'swissknife.webapp_bridge.publish_display_event' | 'swissknife.mobile_orb.request_capture' | 'swissknife.mobile_orb.publish_glasses_event';
  orb_tool: 'swissknife.webapp_bridge.publish_display_event' | 'swissknife.mobile_orb.request_capture' | 'swissknife.mobile_orb.publish_glasses_event';
  fallback_tool: 'hallucinate_app.meta_glasses.display_fallback' | 'hallucinate_app.meta_glasses.camera_fallback' | 'hallucinate_app.meta_glasses.audio_fallback';
  raw_payload_forwarded: false;
}

export interface ExpandedIOHandoffFallbackDecision {
  kind: ExpandedIOHandoffFallbackKind;
  selected: boolean;
  target_surface: ExpandedIOHandoffSurface;
  tool: string;
  receipt_preserved: true;
  event_dag_preserved: true;
  operator_visible: true;
  redaction: 'metadata-only' | 'transcript-redacted';
  reason: string;
}

export interface ExpandedIOOperatorDecision {
  decision: 'direct-route' | 'permission-fallback' | 'redacted-fallback';
  visible: true;
  redacted: true;
  summary: string;
  details_excluded: readonly ['raw_audio', 'raw_pixels', 'secret_values', 'inline_asset_bytes'];
}

export interface AgentSupervisorExpandedIOHandoffPacket {
  packet_id: string;
  packet_cid: string;
  app_id: string;
  modality: ExpandedIOModality;
  correlation_id: string;
  orb_idl: ExpandedIOOrbIdlReference;
  control_plane: ExpandedIOControlPlaneRoute;
  permission: AgentSupervisorExpandedIOEnvelope['permission'];
  receipt: {
    receipt_cid: string;
    event_dag_ref: string;
    source_envelope_cid: string;
    preserved: true;
  };
  rollback: AgentSupervisorExpandedIOEnvelope['rollback'];
  fallbacks: readonly ExpandedIOHandoffFallbackDecision[];
  operator_decision: ExpandedIOOperatorDecision;
  physical_hardware_claimed: false;
}

export interface AgentSupervisorExpandedIOHandoffCatalog {
  schema: typeof AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_SCHEMA;
  catalog_id: typeof AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_CATALOG_ID;
  catalog_cid: string;
  task_id: typeof AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_TASK_ID;
  generated_at: string;
  generated_from: readonly string[];
  source_map_cid: string;
  source_envelope_catalog_cid: string;
  app_count: number;
  packet_count: number;
  modality_counts: Record<ExpandedIOModality, number>;
  fallback_counts: Record<ExpandedIOHandoffFallbackKind, number>;
  operator_decision_counts: Record<ExpandedIOOperatorDecision['decision'], number>;
  packets: readonly AgentSupervisorExpandedIOHandoffPacket[];
  physical_hardware_claimed: false;
}

export interface BuildAgentSupervisorExpandedIOHandoffOptions {
  generatedAt?: string;
  generatedFrom?: readonly string[];
}

export interface ExpandedIOHandoffValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Compiles every reviewed expanded I/O envelope into a routeable ORB/IDL
 * packet. This is intentionally declarative: it preserves the safe dry-run
 * semantics of SVD-069 and never opens a device route while compiling.
 */
export function buildAgentSupervisorExpandedIOHandoff(
  ioMap: AgentSupervisorExpandedIOMap = buildAgentSupervisorExpandedIOMap(),
  envelopes: AgentSupervisorExpandedIOEnvelopeCatalog = buildAgentSupervisorExpandedIOEnvelopes(ioMap),
  descriptors: readonly DesktopOrbIdlAppDescriptor[] = buildVirtualDesktopOrbIdlCompleteCoverage().descriptors,
  options: BuildAgentSupervisorExpandedIOHandoffOptions = {},
): AgentSupervisorExpandedIOHandoffCatalog {
  const mapValidation = validateAgentSupervisorExpandedIOMap(ioMap);
  const envelopeValidation = validateAgentSupervisorExpandedIOEnvelopes(envelopes, ioMap);
  const descriptorValidation = validateVirtualDesktopOrbIdlCompleteCoverage({
    ...buildVirtualDesktopOrbIdlCompleteCoverage(), descriptors,
  });
  if (!mapValidation.valid || !envelopeValidation.valid || !descriptorValidation.valid) {
    throw new Error([
      ...mapValidation.errors,
      ...envelopeValidation.errors,
      ...descriptorValidation.errors,
    ].join('; '));
  }

  const descriptorByApp = new Map(descriptors.map(descriptor => [descriptor.app_id, descriptor]));
  const packets = envelopes.envelopes.map(envelope => {
    const descriptor = descriptorByApp.get(envelope.app_id);
    if (!descriptor) throw new Error(`${envelope.app_id}/${envelope.modality}: missing ORB/IDL descriptor`);
    return compilePacket(envelope, descriptor);
  }).sort((left, right) => left.packet_id.localeCompare(right.packet_id));
  const withoutCid = {
    schema: AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_SCHEMA,
    catalog_id: AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_CATALOG_ID,
    task_id: AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_TASK_ID,
    generated_at: options.generatedAt ?? '2026-07-14T00:00:00.000Z',
    generated_from: [...(options.generatedFrom ?? [
      'src/services/glasses/agent-supervisor-expanded-io-map.ts',
      'src/services/apps/agent-supervisor-expanded-io-envelopes.ts',
      'src/services/glasses/desktop-orb-idl-contract.ts',
      'src/services/glasses/meta-glasses-control-plane-router.ts',
      'implementation_plan/docs/37-swissknife-virtual-desktop-ipfs-mcp-orb-meta-glasses-plan-2026-07-07.md#SVD-071',
    ])].sort(),
    source_map_cid: ioMap.map_cid,
    source_envelope_catalog_cid: envelopes.catalog_cid,
    app_count: new Set(packets.map(packet => packet.app_id)).size,
    packet_count: packets.length,
    modality_counts: count(packets, packet => packet.modality, [
      'display.output', 'camera.photo_capture', 'camera.video_capture', 'microphone.input',
      'microphone.transcription', 'speaker.output', 'headphone.output',
    ] as const),
    fallback_counts: count(packets.flatMap(packet => packet.fallbacks), fallback => fallback.kind, [
      'permission-fallback', 'audio-summary', 'mobile-card', 'desktop-only',
    ] as const),
    operator_decision_counts: count(packets, packet => packet.operator_decision.decision, [
      'direct-route', 'permission-fallback', 'redacted-fallback',
    ] as const),
    packets,
    physical_hardware_claimed: false as const,
  };
  return { ...withoutCid, catalog_cid: cid(withoutCid) };
}

export function validateAgentSupervisorExpandedIOHandoff(
  catalog: AgentSupervisorExpandedIOHandoffCatalog,
  ioMap: AgentSupervisorExpandedIOMap = buildAgentSupervisorExpandedIOMap(),
  envelopes: AgentSupervisorExpandedIOEnvelopeCatalog = buildAgentSupervisorExpandedIOEnvelopes(ioMap),
  descriptors: readonly DesktopOrbIdlAppDescriptor[] = buildVirtualDesktopOrbIdlCompleteCoverage().descriptors,
): ExpandedIOHandoffValidationResult {
  const errors: string[] = [];
  const mapValidation = validateAgentSupervisorExpandedIOMap(ioMap);
  const envelopeValidation = validateAgentSupervisorExpandedIOEnvelopes(envelopes, ioMap);
  if (!mapValidation.valid) errors.push(...mapValidation.errors.map(error => `SVD-068 source: ${error}`));
  if (!envelopeValidation.valid) errors.push(...envelopeValidation.errors.map(error => `SVD-069 source: ${error}`));
  if (catalog.schema !== AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_SCHEMA) errors.push('catalog schema is not canonical');
  if (catalog.catalog_id !== AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_CATALOG_ID) errors.push('catalog id is not canonical');
  if (catalog.task_id !== AGENT_SUPERVISOR_EXPANDED_IO_HANDOFF_TASK_ID) errors.push('task id must be SVD-071');
  if (catalog.source_map_cid !== ioMap.map_cid) errors.push('source map CID does not match SVD-068');
  if (catalog.source_envelope_catalog_cid !== envelopes.catalog_cid) errors.push('source envelope catalog CID does not match SVD-069');
  if (catalog.physical_hardware_claimed !== false) errors.push('handoff must not claim physical hardware');
  if (catalog.packet_count !== envelopes.envelope_count || catalog.packets.length !== envelopes.envelope_count) {
    errors.push('packet count must equal the complete SVD-069 envelope count');
  }
  if (catalog.app_count !== ioMap.app_count) errors.push('app count must equal the SVD-068 map');
  if (new Set(catalog.packets.map(packet => packet.packet_id)).size !== catalog.packets.length) errors.push('packet ids must be unique');

  const descriptorByApp = new Map(descriptors.map(descriptor => [descriptor.app_id, descriptor]));
  for (const packet of catalog.packets) {
    const label = `${packet.app_id}/${packet.modality}`;
    const envelope = envelopes.envelopes.find(candidate => (
      candidate.app_id === packet.app_id && candidate.modality === packet.modality
    ));
    const descriptor = descriptorByApp.get(packet.app_id);
    if (!envelope) errors.push(`${label}: matching SVD-069 envelope is missing`);
    if (!descriptor) {
      errors.push(`${label}: ORB/IDL descriptor is missing`);
      continue;
    }
    if (packet.orb_idl.descriptor_id !== descriptor.descriptor_id
      || packet.orb_idl.interface_cid !== descriptor.interface_cid
      || packet.orb_idl.descriptor_cid !== descriptor.descriptor_cid) errors.push(`${label}: ORB/IDL descriptor lineage drifted`);
    if (computeInterfaceCID(descriptor.idl_descriptor) !== descriptor.interface_cid) errors.push(`${label}: ORB/IDL interface CID is stale`);
    const method = descriptor.idl_descriptor.methods.find(candidate => candidate.name === packet.orb_idl.method_id);
    if (!method || packet.orb_idl.method_cid !== cid(method)) errors.push(`${label}: ORB/IDL method is missing or stale`);
    if (envelope && (
      packet.correlation_id !== envelope.correlation_id
      || JSON.stringify(packet.permission) !== JSON.stringify(envelope.permission)
      || packet.receipt.receipt_cid !== envelope.receipt_cid
      || packet.receipt.event_dag_ref !== envelope.event_dag_ref
      || packet.receipt.source_envelope_cid !== envelope.envelope_cid
      || JSON.stringify(packet.rollback) !== JSON.stringify(envelope.rollback)
    )) errors.push(`${label}: receipt preservation or rollback lineage drifted`);
    if (envelope && (
      packet.orb_idl.method_id !== methodFor(envelope)
      || JSON.stringify(packet.control_plane) !== JSON.stringify(controlPlaneFor(envelope))
      || JSON.stringify(packet.fallbacks) !== JSON.stringify(fallbackFor(envelope))
      || JSON.stringify(packet.operator_decision) !== JSON.stringify(operatorDecisionFor(envelope))
    )) errors.push(`${label}: compiled control-plane or fallback decision drifted`);
    if (packet.control_plane.raw_payload_forwarded !== false) errors.push(`${label}: raw payload forwarding is forbidden`);
    const kinds = packet.fallbacks.map(fallback => fallback.kind).sort().join(',');
    if (kinds !== 'audio-summary,desktop-only,mobile-card,permission-fallback') {
      errors.push(`${label}: all permission, audio-summary, mobile-card, and desktop fallbacks are required`);
    }
    if (packet.fallbacks.some(fallback => !fallback.operator_visible || !fallback.receipt_preserved
      || !fallback.event_dag_preserved || !fallback.reason)) errors.push(`${label}: fallbacks must be visible and preserve provenance`);
    const audio = packet.fallbacks.find(fallback => fallback.kind === 'audio-summary');
    const mobile = packet.fallbacks.find(fallback => fallback.kind === 'mobile-card');
    if (audio?.target_surface !== 'audio_channel' || audio.redaction !== 'transcript-redacted') errors.push(`${label}: audio-summary must be transcript-redacted on audio_channel`);
    if (mobile?.target_surface !== 'mobile_card' || mobile.redaction !== 'metadata-only') errors.push(`${label}: mobile-card must be metadata-redacted`);
    if (!packet.operator_decision.visible || !packet.operator_decision.redacted
      || packet.operator_decision.details_excluded.join(',') !== 'raw_audio,raw_pixels,secret_values,inline_asset_bytes') {
      errors.push(`${label}: operator fallback decision must be visibly redacted`);
    }
    const { packet_cid: _packetCid, packet_id: _packetId, ...withoutPacketCid } = packet;
    if (packet.packet_cid !== cid(withoutPacketCid)) errors.push(`${label}: packet CID does not match packet body`);
  }
  if (!same(catalog.modality_counts, count(catalog.packets, packet => packet.modality, [
    'display.output', 'camera.photo_capture', 'camera.video_capture', 'microphone.input',
    'microphone.transcription', 'speaker.output', 'headphone.output',
  ] as const))) errors.push('modality counts do not match packets');
  if (!same(catalog.fallback_counts, count(catalog.packets.flatMap(packet => packet.fallbacks), fallback => fallback.kind, [
    'permission-fallback', 'audio-summary', 'mobile-card', 'desktop-only',
  ] as const))) errors.push('fallback counts do not match packets');
  if (!same(catalog.operator_decision_counts, count(catalog.packets, packet => packet.operator_decision.decision, [
    'direct-route', 'permission-fallback', 'redacted-fallback',
  ] as const))) errors.push('operator decision counts do not match packets');
  const { catalog_cid: _catalogCid, ...withoutCatalogCid } = catalog;
  if (catalog.catalog_cid !== cid(withoutCatalogCid)) errors.push('catalog CID does not match catalog body');
  return { valid: errors.length === 0, errors };
}

function compilePacket(envelope: AgentSupervisorExpandedIOEnvelope, descriptor: DesktopOrbIdlAppDescriptor): AgentSupervisorExpandedIOHandoffPacket {
  const methodId = methodFor(envelope);
  const method = descriptor.idl_descriptor.methods.find(candidate => candidate.name === methodId);
  if (!method) throw new Error(`${envelope.app_id}/${envelope.modality}: ${methodId} is not present in ORB/IDL descriptor`);
  const withoutCid = {
    app_id: envelope.app_id,
    modality: envelope.modality,
    correlation_id: envelope.correlation_id,
    orb_idl: {
      descriptor_id: descriptor.descriptor_id,
      interface_cid: descriptor.interface_cid,
      descriptor_cid: descriptor.descriptor_cid,
      method_id: methodId,
      method_cid: cid(method),
    },
    control_plane: controlPlaneFor(envelope),
    permission: envelope.permission,
    receipt: {
      receipt_cid: envelope.receipt_cid,
      event_dag_ref: envelope.event_dag_ref,
      source_envelope_cid: envelope.envelope_cid,
      preserved: true as const,
    },
    rollback: envelope.rollback,
    fallbacks: fallbackFor(envelope),
    operator_decision: operatorDecisionFor(envelope),
    physical_hardware_claimed: false as const,
  };
  const packetCid = cid(withoutCid);
  return { packet_id: `svd-071:${envelope.app_id}:${envelope.modality}:${packetCid.slice(-12)}`, packet_cid: packetCid, ...withoutCid };
}

function methodFor(envelope: AgentSupervisorExpandedIOEnvelope): ExpandedIOOrbIdlReference['method_id'] {
  if (envelope.modality === 'display.output') return 'read_status';
  return envelope.permission.decision === 'deny' || envelope.binding === null ? 'request_fallback' : 'request_action';
}

function controlPlaneFor(envelope: AgentSupervisorExpandedIOEnvelope): ExpandedIOControlPlaneRoute {
  if (envelope.modality === 'display.output') return {
    binding_id: 'display.output.render.binding', source_action_binding: envelope.binding,
    capability: 'display.output', control_plane_route: 'swissknife.webapp_bridge.publish_display_event',
    orb_tool: 'swissknife.webapp_bridge.publish_display_event', fallback_tool: 'hallucinate_app.meta_glasses.display_fallback', raw_payload_forwarded: false,
  };
  if (envelope.modality === 'camera.photo_capture' || envelope.modality === 'camera.video_capture') return {
    binding_id: envelope.modality === 'camera.photo_capture'
      ? 'camera.photo_capture.capture_photo.binding' : 'camera.video_capture.start_video_stream.binding',
    source_action_binding: envelope.binding, capability: envelope.modality,
    control_plane_route: 'swissknife.mobile_orb.request_capture', orb_tool: 'swissknife.mobile_orb.request_capture',
    fallback_tool: 'hallucinate_app.meta_glasses.camera_fallback', raw_payload_forwarded: false,
  };
  const capability = envelope.modality === 'microphone.transcription' ? 'microphone.input' : envelope.modality;
  const requirement = createMetaGlassesAudioAppRequirements(envelope.app_id)
    .find(candidate => candidate.capability === capability);
  if (!requirement) throw new Error(`${envelope.app_id}/${envelope.modality}: Meta audio route is missing`);
  return {
    binding_id: requirement.binding_id, source_action_binding: envelope.binding, capability,
    control_plane_route: 'swissknife.mobile_orb.publish_glasses_event', orb_tool: 'swissknife.mobile_orb.publish_glasses_event',
    fallback_tool: 'hallucinate_app.meta_glasses.audio_fallback', raw_payload_forwarded: false,
  };
}

function fallbackFor(envelope: AgentSupervisorExpandedIOEnvelope): ExpandedIOHandoffFallbackDecision[] {
  const selectedPermission = envelope.permission.decision !== 'permit';
  const selectedRedacted = envelope.permission.decision === 'deny';
  return [
    {
      kind: 'permission-fallback', selected: selectedPermission, target_surface: 'mobile_card',
      tool: 'swissknife.mobile_orb.show_permission_card', receipt_preserved: true, event_dag_preserved: true,
      operator_visible: true, redaction: 'metadata-only',
      reason: selectedPermission ? 'Permission is pending or denied; a redacted confirmation decision is shown.' : 'Available when permission changes after route selection.',
    },
    {
      kind: 'audio-summary', selected: selectedRedacted || envelope.modality !== 'display.output', target_surface: 'audio_channel',
      tool: 'hallucinate_app.meta_glasses.audio_fallback', receipt_preserved: true, event_dag_preserved: true,
      operator_visible: true, redaction: 'transcript-redacted',
      reason: 'Audio fallback conveys only a redacted outcome summary and never forwards raw media or transcript content.',
    },
    {
      kind: 'mobile-card', selected: selectedPermission, target_surface: 'mobile_card',
      tool: 'swissknife.mobile_orb.show_mobile_card', receipt_preserved: true, event_dag_preserved: true,
      operator_visible: true, redaction: 'metadata-only',
      reason: 'Companion card presents a metadata-only route decision and its preserved receipt reference.',
    },
    {
      kind: 'desktop-only', selected: selectedRedacted, target_surface: 'desktop',
      tool: 'swissknife.desktop_orb.show_handoff', receipt_preserved: true, event_dag_preserved: true,
      operator_visible: true, redaction: 'metadata-only',
      reason: 'Desktop retains the governed detail when a device route is unsafe, denied, or unavailable.',
    },
  ];
}

function operatorDecisionFor(envelope: AgentSupervisorExpandedIOEnvelope): ExpandedIOOperatorDecision {
  const decision = envelope.permission.decision === 'permit' ? 'direct-route'
    : envelope.permission.decision === 'pending' ? 'permission-fallback' : 'redacted-fallback';
  return {
    decision, visible: true, redacted: true,
    summary: decision === 'direct-route'
      ? 'Approved route is visible with metadata-only receipt references.'
      : decision === 'permission-fallback'
        ? 'Permission confirmation is pending; the operator sees a redacted fallback decision.'
        : 'Route is denied; the operator sees a redacted fallback decision with preserved provenance.',
    details_excluded: ['raw_audio', 'raw_pixels', 'secret_values', 'inline_asset_bytes'],
  };
}

function cid(value: unknown): string {
  return computeCID(JSON.stringify(value));
}

function count<T, K extends string>(items: readonly T[], value: (item: T) => K, keys: readonly K[]): Record<K, number> {
  const result = Object.fromEntries(keys.map(key => [key, 0])) as Record<K, number>;
  for (const item of items) result[value(item)] += 1;
  return result;
}

function same(left: Record<string, number>, right: Record<string, number>): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
