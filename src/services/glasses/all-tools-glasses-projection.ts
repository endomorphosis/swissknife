import type {
  AllToolsIDLDescriptorCatalog,
  AllToolsIDLDescriptorRecord,
  AllToolsIDLMethodBinding,
} from '../mcp/all-tools-idl-generator.js';

export const ALL_TOOLS_GLASSES_PROJECTION_CATALOG_ID =
  'org.hallucinate.swissknife.all-mcp-tools-glasses-projection-catalog';

export type AllToolsGlassesBehavior =
  | 'native_display'
  | 'display_webapp'
  | 'mobile_card'
  | 'notification'
  | 'audio_summary'
  | 'physical_device_only'
  | 'not_displayable';

export type AllToolsGlassesReplayState =
  | 'open'
  | 'focus'
  | 'activate'
  | 'dispatch_result'
  | 'fallback'
  | 'clear'
  | 'recover'
  | 'policy_block';

export interface AllToolsGlassesReplayFrame {
  state: AllToolsGlassesReplayState;
  frame_id: string;
  surface: 'glasses_hud' | 'mobile_companion' | 'desktop_handoff' | 'notification_tray' | 'audio_channel';
  expected_render: string;
  policy_outcome: 'permit' | 'require_confirmation' | 'deny' | 'fallback';
  receipt_required: boolean;
  event_dag_required: boolean;
}

export interface AllToolsGlassesProjection {
  projection_id: string;
  descriptor_id: string;
  kind: 'tool_group' | 'workflow';
  app_id: string;
  service_id: string;
  category: string;
  interface_cid: string;
  behavior: AllToolsGlassesBehavior;
  displayable: boolean;
  adapter_required: boolean;
  method_count: number;
  method_refs: readonly string[];
  tool_ids: readonly string[];
  workflow_id?: string;
  widget_profile: {
    template: string;
    renderer: string;
    handoff: 'native-display' | 'display-webapp' | 'mobile-card' | 'notification' | 'audio-summary' | 'desktop-only' | 'not-displayable';
    summary: string;
  };
  replay: readonly AllToolsGlassesReplayFrame[];
  fallback_summary: string;
  policy_block_summary: string;
}

export interface AllToolsGlassesProjectionCatalog {
  catalog_id: typeof ALL_TOOLS_GLASSES_PROJECTION_CATALOG_ID;
  schema: 'swissknife.all-mcp-tools-glasses-projection-catalog.v1';
  version: string;
  generated_at?: string;
  generated_from: readonly string[];
  descriptor_count: number;
  projection_count: number;
  tool_family_projection_count: number;
  workflow_projection_count: number;
  displayable_projection_count: number;
  hardware_free_replay_state_count: number;
  adapter_required_projection_count: number;
  tool_coverage_count: number;
  workflow_coverage_count: number;
  behavior_counts: Record<AllToolsGlassesBehavior, number>;
  app_counts: Record<string, number>;
  service_counts: Record<string, number>;
  projections: readonly AllToolsGlassesProjection[];
}

export interface AllToolsGlassesProjectionValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const BEHAVIORS = [
  'native_display',
  'display_webapp',
  'mobile_card',
  'notification',
  'audio_summary',
  'physical_device_only',
  'not_displayable',
] as const satisfies readonly AllToolsGlassesBehavior[];

const REPLAY_STATES = [
  'open',
  'focus',
  'activate',
  'dispatch_result',
  'fallback',
  'clear',
  'recover',
  'policy_block',
] as const satisfies readonly AllToolsGlassesReplayState[];

export function buildAllToolsGlassesProjectionCatalog(
  idlCatalog: AllToolsIDLDescriptorCatalog,
  options: { generatedAt?: string; version?: string } = {},
): AllToolsGlassesProjectionCatalog {
  const projections = idlCatalog.descriptors
    .map(descriptor => buildProjection(descriptor))
    .sort((left, right) => left.projection_id.localeCompare(right.projection_id));

  return {
    catalog_id: ALL_TOOLS_GLASSES_PROJECTION_CATALOG_ID,
    schema: 'swissknife.all-mcp-tools-glasses-projection-catalog.v1',
    version: options.version ?? '2026-07-08',
    generated_at: options.generatedAt,
    generated_from: [idlCatalog.catalog_id],
    descriptor_count: idlCatalog.descriptor_count,
    projection_count: projections.length,
    tool_family_projection_count: projections.filter(projection => projection.kind === 'tool_group').length,
    workflow_projection_count: projections.filter(projection => projection.kind === 'workflow').length,
    displayable_projection_count: projections.filter(projection => projection.displayable).length,
    hardware_free_replay_state_count: projections.reduce((total, projection) => total + projection.replay.length, 0),
    adapter_required_projection_count: projections.filter(projection => projection.adapter_required).length,
    tool_coverage_count: idlCatalog.app_routable_tool_coverage_count,
    workflow_coverage_count: idlCatalog.workflow_coverage_count,
    behavior_counts: countBehaviors(projections),
    app_counts: countBy(projections, projection => projection.app_id),
    service_counts: countBy(projections, projection => projection.service_id),
    projections,
  };
}

export function validateAllToolsGlassesProjectionCatalog(
  catalog: AllToolsGlassesProjectionCatalog,
  idlCatalog: AllToolsIDLDescriptorCatalog,
): AllToolsGlassesProjectionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const descriptorIds = new Set(idlCatalog.descriptors.map(descriptor => descriptor.descriptor_id));
  const projectionDescriptorIds = new Set(catalog.projections.map(projection => projection.descriptor_id));

  if (catalog.projection_count !== catalog.projections.length) {
    errors.push(`projection_count ${catalog.projection_count} does not match projection length ${catalog.projections.length}`);
  }
  if (catalog.descriptor_count !== idlCatalog.descriptor_count) {
    errors.push(`descriptor_count ${catalog.descriptor_count} does not match IDL descriptor count ${idlCatalog.descriptor_count}`);
  }
  for (const descriptorId of descriptorIds) {
    if (!projectionDescriptorIds.has(descriptorId)) errors.push(`${descriptorId}: missing glasses projection`);
  }

  for (const projection of catalog.projections) {
    if (!descriptorIds.has(projection.descriptor_id)) {
      errors.push(`${projection.projection_id}: projection references unknown descriptor`);
    }
    if (!BEHAVIORS.includes(projection.behavior)) {
      errors.push(`${projection.projection_id}: unsupported behavior ${projection.behavior}`);
    }
    if (projection.replay.length !== REPLAY_STATES.length) {
      errors.push(`${projection.projection_id}: replay must cover ${REPLAY_STATES.length} states`);
    }
    const replayStates = projection.replay.map(frame => frame.state);
    for (const state of REPLAY_STATES) {
      if (!replayStates.includes(state)) errors.push(`${projection.projection_id}: missing replay state ${state}`);
    }
    if (!projection.fallback_summary) errors.push(`${projection.projection_id}: missing fallback summary`);
    if (!projection.policy_block_summary) errors.push(`${projection.projection_id}: missing policy block summary`);
    if (projection.displayable && projection.behavior === 'not_displayable') {
      errors.push(`${projection.projection_id}: not_displayable projection cannot be marked displayable`);
    }
    if (!projection.displayable && projection.behavior === 'native_display') {
      errors.push(`${projection.projection_id}: native display projection must be displayable`);
    }
    if (projection.method_refs.length !== projection.method_count) {
      errors.push(`${projection.projection_id}: method_refs length does not match method_count`);
    }
    if (projection.behavior === 'physical_device_only' && projection.replay.some(frame => frame.surface === 'glasses_hud')) {
      errors.push(`${projection.projection_id}: physical-device-only projection cannot render on glasses_hud`);
    }
    if (projection.adapter_required && !projection.fallback_summary.includes('adapter')) {
      warnings.push(`${projection.projection_id}: adapter-required projection should mention adapter fallback`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function buildProjection(descriptor: AllToolsIDLDescriptorRecord): AllToolsGlassesProjection {
  const behavior = behaviorForDescriptor(descriptor);
  const displayable = behavior !== 'physical_device_only' && behavior !== 'not_displayable';
  const adapterRequired = descriptor.method_bindings.some(binding => binding.adapter_required);
  const projectionId = `glasses.${descriptor.descriptor_id}`;
  const widgetProfile = widgetProfileFor(descriptor, behavior);

  return {
    projection_id: projectionId,
    descriptor_id: descriptor.descriptor_id,
    kind: descriptor.kind,
    app_id: descriptor.app_id,
    service_id: descriptor.service_id,
    category: descriptor.category,
    interface_cid: descriptor.interface_cid,
    behavior,
    displayable,
    adapter_required: adapterRequired,
    method_count: descriptor.method_count,
    method_refs: descriptor.method_bindings.map(binding => binding.method),
    tool_ids: descriptor.tool_ids,
    workflow_id: descriptor.workflow_id,
    widget_profile: widgetProfile,
    replay: REPLAY_STATES.map(state => replayFrame(state, descriptor, behavior, adapterRequired)),
    fallback_summary: fallbackSummary(descriptor, behavior, adapterRequired),
    policy_block_summary: policyBlockSummary(descriptor),
  };
}

function behaviorForDescriptor(descriptor: AllToolsIDLDescriptorRecord): AllToolsGlassesBehavior {
  const fallbacks = new Set(descriptor.method_bindings.map(binding => binding.glasses_fallback));
  if (fallbacks.has('desktop_or_mobile_only')) return 'physical_device_only';
  if (fallbacks.has('mobile_card')) return 'mobile_card';
  if (fallbacks.has('audio_summary')) return 'audio_summary';
  if (fallbacks.has('notification')) return 'notification';
  if (fallbacks.has('display_webapp')) return 'display_webapp';
  if (fallbacks.has('native_display')) return 'native_display';
  if (descriptor.template_kind === 'graph-viewer' || descriptor.template_kind === 'explorer') return 'native_display';
  if (descriptor.template_kind === 'job-console' || descriptor.template_kind === 'form-wizard') return 'display_webapp';
  return 'not_displayable';
}

function widgetProfileFor(
  descriptor: AllToolsIDLDescriptorRecord,
  behavior: AllToolsGlassesBehavior,
): AllToolsGlassesProjection['widget_profile'] {
  return {
    template: descriptor.template_kind,
    renderer: rendererForBehavior(behavior, descriptor.template_kind),
    handoff: handoffForBehavior(behavior),
    summary: `${descriptor.app_id} ${descriptor.category} uses ${behavior} for ${descriptor.method_count} methods.`,
  };
}

function replayFrame(
  state: AllToolsGlassesReplayState,
  descriptor: AllToolsIDLDescriptorRecord,
  behavior: AllToolsGlassesBehavior,
  adapterRequired: boolean,
): AllToolsGlassesReplayFrame {
  const receiptRequired = descriptor.method_bindings.some(binding => (
    binding.receipt_mapping.receipt_policy === 'required'
    || binding.receipt_mapping.receipt_policy === 'required_for_side_effects'
  ));
  const eventDagRequired = descriptor.method_bindings.some(binding => binding.receipt_mapping.event_dag_required);
  return {
    state,
    frame_id: `${descriptor.descriptor_id}.${state}`,
    surface: surfaceForState(state, behavior),
    expected_render: renderSummary(state, behavior, descriptor, adapterRequired),
    policy_outcome: policyOutcomeForState(state, behavior, adapterRequired),
    receipt_required: receiptRequired,
    event_dag_required: eventDagRequired,
  };
}

function surfaceForState(
  state: AllToolsGlassesReplayState,
  behavior: AllToolsGlassesBehavior,
): AllToolsGlassesReplayFrame['surface'] {
  if (behavior === 'physical_device_only') return 'desktop_handoff';
  if (behavior === 'audio_summary') return 'audio_channel';
  if (behavior === 'notification') return 'notification_tray';
  if (behavior === 'mobile_card') return 'mobile_companion';
  if (state === 'fallback' || state === 'policy_block') return 'mobile_companion';
  return 'glasses_hud';
}

function renderSummary(
  state: AllToolsGlassesReplayState,
  behavior: AllToolsGlassesBehavior,
  descriptor: AllToolsIDLDescriptorRecord,
  adapterRequired: boolean,
): string {
  if (state === 'policy_block') return `Policy block renders ${descriptor.category} denial with receipt details.`;
  if (state === 'fallback') {
    return adapterRequired
      ? `Fallback renders adapter-required ${behavior} handoff for ${descriptor.category}.`
      : `Fallback renders ${behavior} recovery for ${descriptor.category}.`;
  }
  if (state === 'dispatch_result') return `Dispatch result renders ${descriptor.method_count} method summaries.`;
  return `${state} renders ${behavior} frame for ${descriptor.app_id}/${descriptor.category}.`;
}

function policyOutcomeForState(
  state: AllToolsGlassesReplayState,
  behavior: AllToolsGlassesBehavior,
  adapterRequired: boolean,
): AllToolsGlassesReplayFrame['policy_outcome'] {
  if (state === 'policy_block') return 'deny';
  if (state === 'fallback' || adapterRequired || behavior === 'physical_device_only') return 'fallback';
  if (state === 'activate') return 'require_confirmation';
  return 'permit';
}

function fallbackSummary(
  descriptor: AllToolsIDLDescriptorRecord,
  behavior: AllToolsGlassesBehavior,
  adapterRequired: boolean,
): string {
  const adapter = adapterRequired ? ' Adapter-required methods route through desktop/mobile until the full endpoint adapter is available.' : '';
  if (behavior === 'physical_device_only') {
    return `Physical-device-only handoff for ${descriptor.descriptor_id}; glasses render only a redacted status card.${adapter}`;
  }
  return `${behavior} fallback for ${descriptor.descriptor_id} covers degraded, recovery, and policy-block states.${adapter}`;
}

function policyBlockSummary(descriptor: AllToolsIDLDescriptorRecord): string {
  const policies = unique(descriptor.method_bindings.map(binding => binding.policy_class));
  return `Policy block covers ${policies.join(', ')} methods with confirmation and receipt metadata.`;
}

function rendererForBehavior(
  behavior: AllToolsGlassesBehavior,
  template: string,
): string {
  if (behavior === 'native_display') return template === 'graph-viewer' ? 'hud-graph-summary' : 'hud-list-summary';
  if (behavior === 'display_webapp') return 'display-webapp-widget';
  if (behavior === 'mobile_card') return 'mobile-companion-card';
  if (behavior === 'notification') return 'notification-toast';
  if (behavior === 'audio_summary') return 'audio-summary';
  if (behavior === 'physical_device_only') return 'redacted-desktop-handoff';
  return 'not-displayable';
}

function handoffForBehavior(
  behavior: AllToolsGlassesBehavior,
): AllToolsGlassesProjection['widget_profile']['handoff'] {
  if (behavior === 'native_display') return 'native-display';
  if (behavior === 'display_webapp') return 'display-webapp';
  if (behavior === 'mobile_card') return 'mobile-card';
  if (behavior === 'notification') return 'notification';
  if (behavior === 'audio_summary') return 'audio-summary';
  if (behavior === 'physical_device_only') return 'desktop-only';
  return 'not-displayable';
}

function countBehaviors(
  projections: readonly AllToolsGlassesProjection[],
): Record<AllToolsGlassesBehavior, number> {
  const counts = Object.fromEntries(BEHAVIORS.map(behavior => [behavior, 0])) as Record<AllToolsGlassesBehavior, number>;
  for (const projection of projections) counts[projection.behavior] += 1;
  return counts;
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function countBy<T>(items: readonly T[], keyForItem: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyForItem(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
