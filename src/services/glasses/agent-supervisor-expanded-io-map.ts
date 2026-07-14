import {
  VIRTUAL_DESKTOP_APP_MANIFEST,
  type VirtualDesktopAppManifest,
  type VirtualDesktopAppManifestEntry,
  type VirtualDesktopServiceFamily,
} from '../apps/virtual-desktop-app-manifest.js';
import { computeCID } from '../mcp/mcp-idl.js';

export const AGENT_SUPERVISOR_EXPANDED_IO_MAP_SCHEMA =
  'swissknife.agent-supervisor-expanded-io-map.v1' as const;
export const AGENT_SUPERVISOR_EXPANDED_IO_MAP_ID =
  'org.hallucinate.swissknife.agent-supervisor-expanded-io-map' as const;
export const AGENT_SUPERVISOR_EXPANDED_IO_MAP_TASK_ID = 'SVD-068' as const;

export const EXPANDED_IO_MODALITIES = [
  'display.output',
  'camera.photo_capture',
  'camera.video_capture',
  'microphone.input',
  'microphone.transcription',
  'speaker.output',
  'headphone.output',
] as const;

export type ExpandedIOModality = (typeof EXPANDED_IO_MODALITIES)[number];

export type ExpandedIODisposition =
  | 'allowed'
  | 'permission-required'
  | 'denied'
  | 'desktop-only';

export type ExpandedIOSurface =
  | 'meta-glasses-display'
  | 'meta-glasses-camera'
  | 'meta-glasses-microphone'
  | 'meta-glasses-speaker'
  | 'meta-glasses-headphones'
  | 'mobile-card'
  | 'desktop'
  | 'none';

export type ExpandedIOPermissionScope =
  | 'meta_glasses.display.render'
  | 'meta_glasses.camera.photo'
  | 'meta_glasses.camera.video'
  | 'meta_glasses.microphone.capture'
  | 'meta_glasses.audio.playback';

export type ExpandedIORedactionPolicy =
  | 'none'
  | 'privacy-filtered'
  | 'transcript-redacted'
  | 'metadata-only'
  | 'secret-values-blocked';

export interface ExpandedIOFallbackRoute {
  route: 'mobile-card' | 'desktop-only';
  surface: 'mobile-card' | 'desktop';
  disposition: 'allowed' | 'permission-required' | 'denied';
  operator_visible: true;
  preserves_receipts: true;
  reason: string;
}

export interface ExpandedIOModalityContract {
  modality: ExpandedIOModality;
  applicable: boolean;
  disposition: ExpandedIODisposition;
  primary_surface: ExpandedIOSurface;
  safe_path: boolean;
  permission_scope: ExpandedIOPermissionScope | null;
  confirmation_required: boolean;
  receipt_required: boolean;
  redaction_policy: ExpandedIORedactionPolicy;
  operator_visible: true;
  physical_hardware_claimed: false;
  simulator_replay: 'required' | 'denied-path';
  binding: string | null;
  purpose: string;
  reason: string;
  fallback_order: readonly ('mobile-card' | 'desktop-only')[];
}

export interface ExpandedIOAppContract {
  contract_id: string;
  contract_cid: string;
  app_id: string;
  app_title: string;
  category: string;
  service_families: readonly VirtualDesktopServiceFamily[];
  backend_capability_ids: readonly string[];
  display: ExpandedIOModalityContract;
  camera: {
    photo_capture: ExpandedIOModalityContract;
    video_capture: ExpandedIOModalityContract;
  };
  microphone: {
    input: ExpandedIOModalityContract;
    transcription: ExpandedIOModalityContract;
  };
  audio: {
    speaker_output: ExpandedIOModalityContract;
    headphone_output: ExpandedIOModalityContract;
  };
  fallback_routes: readonly [ExpandedIOFallbackRoute, ExpandedIOFallbackRoute];
  policy: {
    default_deny_capture: true;
    default_deny_unknown_binding: true;
    permission_prompt_required: boolean;
    receipt_required_for_permission_decision: true;
    fallback_decision_operator_visible: true;
  };
}

export interface AgentSupervisorExpandedIOMap {
  schema: typeof AGENT_SUPERVISOR_EXPANDED_IO_MAP_SCHEMA;
  map_id: typeof AGENT_SUPERVISOR_EXPANDED_IO_MAP_ID;
  map_cid: string;
  task_id: typeof AGENT_SUPERVISOR_EXPANDED_IO_MAP_TASK_ID;
  generated_at: string;
  generated_from: readonly string[];
  manifest_id: string;
  manifest_version: string;
  hardware_validation: 'meta-device-simulator';
  physical_hardware_claimed: false;
  app_count: number;
  modality_contract_count: number;
  applicable_modality_count: number;
  disposition_counts: Record<ExpandedIODisposition, number>;
  contracts: readonly ExpandedIOAppContract[];
}

export interface ExpandedIOMapValidationResult {
  valid: boolean;
  errors: string[];
}

export interface BuildExpandedIOMapOptions {
  generatedAt?: string;
  generatedFrom?: readonly string[];
}

interface ApplicableBinding {
  binding: string;
  purpose: string;
}

/*
 * Capture bindings are deliberately allow-listed. A capability name or app
 * category is not enough to authorize a privacy-sensitive device route.
 * Adding a new route therefore requires a reviewed entry here and causes the
 * checked evidence fixture to change.
 */
const PHOTO_BINDINGS: Readonly<Record<string, ApplicableBinding>> = {
  'ai-chat': {
    binding: 'ai-chat.attach-camera-photo',
    purpose: 'Attach a privacy-filtered still image to the current multimodal conversation.',
  },
  'image-viewer': {
    binding: 'image-viewer.capture-and-open',
    purpose: 'Capture a still image and open the resulting ephemeral image asset.',
  },
  'neural-photoshop': {
    binding: 'neural-photoshop.capture-source-photo',
    purpose: 'Capture a privacy-filtered source photo for an explicitly confirmed edit.',
  },
  'glasses-preview': {
    binding: 'glasses-preview.capture-fixture-photo',
    purpose: 'Capture a simulator fixture used to preview a governed camera route.',
  },
  'agent-supervisor': {
    binding: 'agent-supervisor.attach-evidence-photo',
    purpose: 'Attach a redacted still image to a confirmed evidence-capture action.',
  },
};

const VIDEO_BINDINGS: Readonly<Record<string, ApplicableBinding>> = {
  peertube: {
    binding: 'peertube.capture-video-draft',
    purpose: 'Capture a bounded video draft; publishing remains a separate confirmed action.',
  },
  cinema: {
    binding: 'cinema.capture-source-clip',
    purpose: 'Capture a bounded source clip for a confirmed cinema job.',
  },
  'glasses-preview': {
    binding: 'glasses-preview.capture-fixture-video',
    purpose: 'Capture a short simulator fixture used to preview a governed video route.',
  },
  'agent-supervisor': {
    binding: 'agent-supervisor.record-replay-evidence',
    purpose: 'Record a bounded, redacted simulator replay for confirmed release evidence.',
  },
};

const MICROPHONE_BINDINGS: Readonly<Record<string, ApplicableBinding>> = {
  terminal: { binding: 'terminal.voice-command', purpose: 'Capture a bounded voice command.' },
  vibecode: { binding: 'vibecode.voice-dictation', purpose: 'Capture bounded editor dictation.' },
  'music-studio-unified': { binding: 'music-studio-unified.record-input', purpose: 'Capture an audio take.' },
  'ai-chat': { binding: 'ai-chat.voice-message', purpose: 'Capture a bounded voice message.' },
  todo: { binding: 'todo.voice-task', purpose: 'Capture a spoken task or goal.' },
  navi: { binding: 'navi.voice-intent', purpose: 'Capture a navigation intent.' },
  'p2p-chat-unified': { binding: 'p2p-chat-unified.voice-message', purpose: 'Capture a voice message draft.' },
  notes: { binding: 'notes.voice-note', purpose: 'Capture a voice note.' },
  cinema: { binding: 'cinema.record-narration', purpose: 'Capture narration for a cinema draft.' },
  strudel: { binding: 'strudel.record-input', purpose: 'Capture bounded audio input for a local composition.' },
  'strudel-ai-daw': { binding: 'strudel-ai-daw.record-input', purpose: 'Capture bounded audio input for a DAW session.' },
  'music-studio': { binding: 'music-studio.record-input', purpose: 'Capture an audio take in the classic studio.' },
  'p2p-chat': { binding: 'p2p-chat.voice-message', purpose: 'Capture a voice message draft.' },
  'glasses-preview': { binding: 'glasses-preview.microphone-fixture', purpose: 'Capture a simulator microphone fixture.' },
  'agent-supervisor': {
    binding: 'agent-supervisor.voice-steering-draft',
    purpose: 'Capture a redacted steering draft; execution still requires desktop or mobile confirmation.',
  },
};

const TRANSCRIPTION_BINDINGS: Readonly<Record<string, ApplicableBinding>> = {
  terminal: { binding: 'terminal.transcribe-command', purpose: 'Transcribe a voice command before execution review.' },
  vibecode: { binding: 'vibecode.transcribe-dictation', purpose: 'Transcribe editor dictation before insertion.' },
  'ai-chat': { binding: 'ai-chat.transcribe-message', purpose: 'Transcribe and review a voice message.' },
  todo: { binding: 'todo.transcribe-task', purpose: 'Transcribe and review a task or goal.' },
  navi: { binding: 'navi.transcribe-intent', purpose: 'Transcribe and review a navigation intent.' },
  'p2p-chat-unified': { binding: 'p2p-chat-unified.transcribe-message', purpose: 'Transcribe a message draft before sending.' },
  notes: { binding: 'notes.transcribe-note', purpose: 'Transcribe a voice note before saving.' },
  'p2p-chat': { binding: 'p2p-chat.transcribe-message', purpose: 'Transcribe a message draft before sending.' },
  'glasses-preview': { binding: 'glasses-preview.transcription-fixture', purpose: 'Render a redacted simulator transcript fixture.' },
  'agent-supervisor': {
    binding: 'agent-supervisor.transcribe-steering-draft',
    purpose: 'Transcribe and redact steering text before a separate confirmation decision.',
  },
};

const EXPLICIT_AUDIO_APPS = new Set([
  'ai-chat',
  'navi',
  'glasses-preview',
  'agent-supervisor',
]);

const SENSITIVE_APPS = new Set(['api-keys', 'oauth-login']);

/** Build the reviewed expanded I/O contract for every canonical desktop app. */
export function buildAgentSupervisorExpandedIOMap(
  manifest: VirtualDesktopAppManifest = VIRTUAL_DESKTOP_APP_MANIFEST,
  options: BuildExpandedIOMapOptions = {},
): AgentSupervisorExpandedIOMap {
  const contracts = manifest.apps
    .map(buildAppContract)
    .sort((left, right) => left.app_id.localeCompare(right.app_id));
  const modalities = contracts.flatMap(listModalityContracts);
  const withoutCid = {
    schema: AGENT_SUPERVISOR_EXPANDED_IO_MAP_SCHEMA,
    map_id: AGENT_SUPERVISOR_EXPANDED_IO_MAP_ID,
    task_id: AGENT_SUPERVISOR_EXPANDED_IO_MAP_TASK_ID,
    generated_at: options.generatedAt ?? '2026-07-14T00:00:00.000Z',
    generated_from: [...(options.generatedFrom ?? [
      'src/services/apps/virtual-desktop-app-manifest.ts',
      'src/services/glasses/meta-glasses-io-profile.ts',
      'implementation_plan/docs/37-swissknife-virtual-desktop-ipfs-mcp-orb-meta-glasses-plan-2026-07-07.md#SVD-068',
    ])].sort(),
    manifest_id: manifest.manifest_id,
    manifest_version: manifest.version,
    hardware_validation: 'meta-device-simulator' as const,
    physical_hardware_claimed: false as const,
    app_count: contracts.length,
    modality_contract_count: modalities.length,
    applicable_modality_count: modalities.filter(modality => modality.applicable).length,
    disposition_counts: countDispositions(modalities),
    contracts,
  };
  return { ...withoutCid, map_cid: computeCID(JSON.stringify(withoutCid)) };
}

/**
 * Validate coverage and fail-closed semantics before publishing an evidence
 * map. This is intentionally independent of TypeScript's structural checks so
 * JSON loaded from an artifact receives the same validation.
 */
export function validateAgentSupervisorExpandedIOMap(
  map: AgentSupervisorExpandedIOMap,
  manifest: VirtualDesktopAppManifest = VIRTUAL_DESKTOP_APP_MANIFEST,
): ExpandedIOMapValidationResult {
  const errors: string[] = [];
  const expectedAppIds = [...manifest.apps.map(app => app.id)].sort();
  const actualAppIds = map.contracts.map(contract => contract.app_id).sort();

  if (map.schema !== AGENT_SUPERVISOR_EXPANDED_IO_MAP_SCHEMA) errors.push('schema is not the SVD-068 expanded I/O schema');
  if (map.map_id !== AGENT_SUPERVISOR_EXPANDED_IO_MAP_ID) errors.push('map_id is not the canonical expanded I/O map id');
  if (map.task_id !== AGENT_SUPERVISOR_EXPANDED_IO_MAP_TASK_ID) errors.push('task_id must be SVD-068');
  if (map.physical_hardware_claimed !== false) errors.push('physical glasses hardware must not be claimed by this map');
  if (map.hardware_validation !== 'meta-device-simulator') errors.push('hardware validation must use the Meta device simulator');
  if (map.app_count !== manifest.apps.length) errors.push(`app_count ${map.app_count} does not match manifest count ${manifest.apps.length}`);
  if (new Set(actualAppIds).size !== actualAppIds.length) errors.push('duplicate app contracts are not allowed');
  if (JSON.stringify(actualAppIds) !== JSON.stringify(expectedAppIds)) errors.push('app contracts do not exactly cover the canonical manifest');

  for (const contract of map.contracts) validateAppContract(contract, errors);

  const modalities = map.contracts.flatMap(listModalityContracts);
  if (map.modality_contract_count !== map.contracts.length * EXPANDED_IO_MODALITIES.length) {
    errors.push('modality_contract_count must contain all seven modalities for every app');
  }
  if (map.modality_contract_count !== modalities.length) errors.push('modality_contract_count does not match contract bodies');
  if (map.applicable_modality_count !== modalities.filter(modality => modality.applicable).length) {
    errors.push('applicable_modality_count does not match contract bodies');
  }
  if (JSON.stringify(map.disposition_counts) !== JSON.stringify(countDispositions(modalities))) {
    errors.push('disposition_counts do not match contract bodies');
  }

  const { map_cid: _mapCid, ...withoutCid } = map;
  if (map.map_cid !== computeCID(JSON.stringify(withoutCid))) errors.push('map_cid does not match the canonical map body');
  return { valid: errors.length === 0, errors };
}

export function findExpandedIOAppContract(
  map: AgentSupervisorExpandedIOMap,
  appId: string,
): ExpandedIOAppContract | undefined {
  return map.contracts.find(contract => contract.app_id === appId);
}

export function listExpandedIOModalityContracts(
  contract: ExpandedIOAppContract,
): readonly ExpandedIOModalityContract[] {
  return listModalityContracts(contract);
}

function buildAppContract(app: VirtualDesktopAppManifestEntry): ExpandedIOAppContract {
  const photo = captureContract(app, 'camera.photo_capture', PHOTO_BINDINGS[app.id]);
  const video = captureContract(app, 'camera.video_capture', VIDEO_BINDINGS[app.id]);
  const microphone = captureContract(app, 'microphone.input', MICROPHONE_BINDINGS[app.id]);
  const transcription = captureContract(app, 'microphone.transcription', TRANSCRIPTION_BINDINGS[app.id]);
  const audioApplicable = isAudioApplicable(app);
  const contractWithoutCid = {
    contract_id: `${AGENT_SUPERVISOR_EXPANDED_IO_MAP_ID}/app/${app.id}`,
    app_id: app.id,
    app_title: app.title,
    category: app.category,
    service_families: [...app.service_families],
    backend_capability_ids: app.backend_capabilities.map(capability => capability.id).sort(),
    display: displayContract(app),
    camera: { photo_capture: photo, video_capture: video },
    microphone: { input: microphone, transcription },
    audio: {
      speaker_output: audioContract(app, 'speaker.output', audioApplicable),
      headphone_output: audioContract(app, 'headphone.output', audioApplicable),
    },
    fallback_routes: fallbackRoutes(app),
    policy: {
      default_deny_capture: true as const,
      default_deny_unknown_binding: true as const,
      permission_prompt_required: [photo, video, microphone, transcription]
        .some(item => item.disposition === 'permission-required'),
      receipt_required_for_permission_decision: true as const,
      fallback_decision_operator_visible: true as const,
    },
  };
  return { ...contractWithoutCid, contract_cid: computeCID(JSON.stringify(contractWithoutCid)) };
}

function displayContract(app: VirtualDesktopAppManifestEntry): ExpandedIOModalityContract {
  const sensitive = SENSITIVE_APPS.has(app.id);
  return {
    modality: 'display.output',
    applicable: true,
    disposition: 'allowed',
    primary_surface: 'meta-glasses-display',
    safe_path: true,
    permission_scope: 'meta_glasses.display.render',
    confirmation_required: false,
    receipt_required: app.orb_idl_state.receipt_required || sensitive,
    redaction_policy: sensitive ? 'secret-values-blocked' : 'metadata-only',
    operator_visible: true,
    physical_hardware_claimed: false,
    simulator_replay: 'required',
    binding: `${app.id}.render-redacted-status`,
    purpose: sensitive
      ? `Render only a denial/status card for ${app.title}; credential and token values are never projected.`
      : `Render the bounded ${app.title} status and result projection.`,
    reason: `A bounded, operator-visible ${app.glasses_strategy.handoff} projection is defined; simulator validation does not claim paired hardware.`,
    fallback_order: ['mobile-card', 'desktop-only'],
  };
}

function captureContract(
  app: VirtualDesktopAppManifestEntry,
  modality: Extract<ExpandedIOModality, `camera.${string}` | `microphone.${string}`>,
  binding: ApplicableBinding | undefined,
): ExpandedIOModalityContract {
  if (!binding || SENSITIVE_APPS.has(app.id)) return deniedContract(app, modality);
  const camera = modality.startsWith('camera.');
  const transcription = modality === 'microphone.transcription';
  return {
    modality,
    applicable: true,
    disposition: 'permission-required',
    primary_surface: camera ? 'meta-glasses-camera' : 'meta-glasses-microphone',
    safe_path: true,
    permission_scope: modality === 'camera.photo_capture'
      ? 'meta_glasses.camera.photo'
      : modality === 'camera.video_capture'
        ? 'meta_glasses.camera.video'
        : 'meta_glasses.microphone.capture',
    confirmation_required: true,
    receipt_required: true,
    redaction_policy: transcription ? 'transcript-redacted' : 'privacy-filtered',
    operator_visible: true,
    physical_hardware_claimed: false,
    simulator_replay: 'required',
    binding: binding.binding,
    purpose: binding.purpose,
    reason: 'The reviewed app binding is available only after a visible, scoped permission decision and produces an MCP++ receipt.',
    fallback_order: ['mobile-card', 'desktop-only'],
  };
}

function audioContract(
  app: VirtualDesktopAppManifestEntry,
  modality: 'speaker.output' | 'headphone.output',
  applicable: boolean,
): ExpandedIOModalityContract {
  if (!applicable || SENSITIVE_APPS.has(app.id)) return deniedContract(app, modality);
  const headphones = modality === 'headphone.output';
  return {
    modality,
    applicable: true,
    disposition: 'permission-required',
    primary_surface: headphones ? 'meta-glasses-headphones' : 'meta-glasses-speaker',
    safe_path: true,
    permission_scope: 'meta_glasses.audio.playback',
    confirmation_required: true,
    receipt_required: app.orb_idl_state.receipt_required,
    redaction_policy: 'privacy-filtered',
    operator_visible: true,
    physical_hardware_claimed: false,
    simulator_replay: 'required',
    binding: `${app.id}.${headphones ? 'headphone' : 'speaker'}-output`,
    purpose: `Play policy-filtered ${app.title} audio or an audio summary over the selected ${headphones ? 'headphone' : 'speaker'} route.`,
    reason: 'Audio playback is applicable and remains permission-mediated, volume-bounded, and interruptible.',
    fallback_order: ['mobile-card', 'desktop-only'],
  };
}

function deniedContract(
  app: VirtualDesktopAppManifestEntry,
  modality: Exclude<ExpandedIOModality, 'display.output'>,
): ExpandedIOModalityContract {
  const noun = modality.replace('.', ' ');
  return {
    modality,
    applicable: false,
    disposition: 'denied',
    primary_surface: 'none',
    safe_path: false,
    permission_scope: permissionFor(modality),
    confirmation_required: false,
    receipt_required: true,
    redaction_policy: 'metadata-only',
    operator_visible: true,
    physical_hardware_claimed: false,
    simulator_replay: 'denied-path',
    binding: null,
    purpose: `No ${noun} payload is accepted by ${app.title}.`,
    reason: `${app.id} has no reviewed safe ${noun} binding; the route is explicitly denied and the operator is directed to the desktop-only fallback.`,
    fallback_order: ['mobile-card', 'desktop-only'],
  };
}

function fallbackRoutes(app: VirtualDesktopAppManifestEntry): [ExpandedIOFallbackRoute, ExpandedIOFallbackRoute] {
  const sensitive = SENSITIVE_APPS.has(app.id);
  return [
    {
      route: 'mobile-card',
      surface: 'mobile-card',
      disposition: sensitive ? 'denied' : 'allowed',
      operator_visible: true,
      preserves_receipts: true,
      reason: sensitive
        ? `${app.title} contains credential authority; mobile-card content is denied and only a desktop handoff notice is shown.`
        : `${app.title} can render a redacted companion-phone card when a glasses route is unavailable or declined.`,
    },
    {
      route: 'desktop-only',
      surface: 'desktop',
      disposition: 'allowed',
      operator_visible: true,
      preserves_receipts: true,
      reason: `${app.title} retains a desktop-only route for unsupported hardware, denied permissions, sensitive detail, and confirmation flows.`,
    },
  ];
}

function isAudioApplicable(app: VirtualDesktopAppManifestEntry): boolean {
  return EXPLICIT_AUDIO_APPS.has(app.id)
    || app.glasses_strategy.handoff === 'audio-summary'
    || app.capabilities.some(capability => /audio|media\.playback|notification/.test(capability));
}

function permissionFor(modality: Exclude<ExpandedIOModality, 'display.output'>): ExpandedIOPermissionScope {
  if (modality === 'camera.photo_capture') return 'meta_glasses.camera.photo';
  if (modality === 'camera.video_capture') return 'meta_glasses.camera.video';
  if (modality.startsWith('microphone.')) return 'meta_glasses.microphone.capture';
  return 'meta_glasses.audio.playback';
}

function listModalityContracts(contract: ExpandedIOAppContract): ExpandedIOModalityContract[] {
  return [
    contract.display,
    contract.camera.photo_capture,
    contract.camera.video_capture,
    contract.microphone.input,
    contract.microphone.transcription,
    contract.audio.speaker_output,
    contract.audio.headphone_output,
  ];
}

function countDispositions(
  modalities: readonly ExpandedIOModalityContract[],
): Record<ExpandedIODisposition, number> {
  const counts: Record<ExpandedIODisposition, number> = {
    allowed: 0,
    'permission-required': 0,
    denied: 0,
    'desktop-only': 0,
  };
  for (const modality of modalities) counts[modality.disposition] += 1;
  return counts;
}

function validateAppContract(contract: ExpandedIOAppContract, errors: string[]): void {
  const prefix = contract.app_id;
  const modalities = listModalityContracts(contract);
  const modalityNames = modalities.map(modality => modality.modality).sort();
  if (JSON.stringify(modalityNames) !== JSON.stringify([...EXPANDED_IO_MODALITIES].sort())) {
    errors.push(`${prefix}: must define each expanded I/O modality exactly once`);
  }
  if (contract.fallback_routes.map(route => route.route).join(',') !== 'mobile-card,desktop-only') {
    errors.push(`${prefix}: must define mobile-card and desktop-only fallbacks`);
  }
  if (contract.fallback_routes.some(route => !route.operator_visible || !route.preserves_receipts || !route.reason)) {
    errors.push(`${prefix}: fallback decisions must be visible, receipt-preserving, and explained`);
  }
  if (contract.display.disposition !== 'allowed' || contract.display.primary_surface !== 'meta-glasses-display') {
    errors.push(`${prefix}: must expose a bounded Meta glasses display projection`);
  }
  for (const modality of modalities) {
    const label = `${prefix}/${modality.modality}`;
    if (!modality.operator_visible || !modality.reason || !modality.purpose) errors.push(`${label}: disposition must be operator-visible and explained`);
    if (modality.physical_hardware_claimed) errors.push(`${label}: must not claim paired physical hardware`);
    if (modality.applicable && !modality.safe_path) errors.push(`${label}: applicable modality must have a reviewed safe path`);
    if (!modality.applicable && !['denied', 'desktop-only'].includes(modality.disposition)) {
      errors.push(`${label}: a modality without a safe path must be denied or desktop-only`);
    }
    if (modality.disposition === 'permission-required' && (!modality.permission_scope || !modality.confirmation_required)) {
      errors.push(`${label}: permission-required route needs a scope and visible confirmation`);
    }
    if (modality.safe_path && !modality.binding) errors.push(`${label}: safe route is missing its reviewed app binding`);
    if (!modality.safe_path && modality.binding) errors.push(`${label}: denied route cannot expose an app binding`);
    if (modality.fallback_order.join(',') !== 'mobile-card,desktop-only') {
      errors.push(`${label}: must preserve mobile-card then desktop-only fallback order`);
    }
  }
  const { contract_cid: _contractCid, ...withoutCid } = contract;
  if (contract.contract_cid !== computeCID(JSON.stringify(withoutCid))) errors.push(`${prefix}: contract_cid does not match contract body`);
}
