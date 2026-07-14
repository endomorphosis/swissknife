/**
 * @vitest-environment node
 */

import { dirname, join } from 'path';
import {
  VIRTUAL_DESKTOP_APP_MANIFEST,
  type VirtualDesktopAppManifest,
} from '../../src/services/apps/virtual-desktop-app-manifest';
import {
  AGENT_SUPERVISOR_EXPANDED_IO_MAP_ID,
  AGENT_SUPERVISOR_EXPANDED_IO_MAP_SCHEMA,
  AGENT_SUPERVISOR_EXPANDED_IO_MAP_TASK_ID,
  EXPANDED_IO_MODALITIES,
  buildAgentSupervisorExpandedIOMap,
  findExpandedIOAppContract,
  listExpandedIOModalityContracts,
  validateAgentSupervisorExpandedIOMap,
  type AgentSupervisorExpandedIOMap,
} from '../../src/services/glasses/agent-supervisor-expanded-io-map';

const actualFs = jest.requireActual<typeof import('fs')>('fs');
const evidencePath = join(
  process.cwd(),
  'test-results',
  'virtual-desktop-ipfs-mcp-orb',
  'agent-supervisor-expanded-io-map.json',
);
const generatedAt = '2026-07-14T00:00:00.000Z';

let ioMap: AgentSupervisorExpandedIOMap;

describe('SVD-068 per-app expanded Meta glasses I/O capability map', () => {
  beforeAll(() => {
    ioMap = buildAgentSupervisorExpandedIOMap(VIRTUAL_DESKTOP_APP_MANIFEST, {
      generatedAt,
    });
    actualFs.mkdirSync(dirname(evidencePath), { recursive: true });
    actualFs.writeFileSync(evidencePath, `${JSON.stringify(ioMap, null, 2)}\n`);
  });

  it('publishes a valid deterministic artifact for every canonical virtual desktop app', () => {
    const artifact = JSON.parse(actualFs.readFileSync(evidencePath, 'utf8')) as AgentSupervisorExpandedIOMap;
    const validation = validateAgentSupervisorExpandedIOMap(artifact);
    const expectedAppIds = VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => app.id).sort();

    expect(validation).toEqual({ valid: true, errors: [] });
    expect(ioMap).toMatchObject({
      schema: AGENT_SUPERVISOR_EXPANDED_IO_MAP_SCHEMA,
      map_id: AGENT_SUPERVISOR_EXPANDED_IO_MAP_ID,
      task_id: AGENT_SUPERVISOR_EXPANDED_IO_MAP_TASK_ID,
      generated_at: generatedAt,
      hardware_validation: 'meta-device-simulator',
      physical_hardware_claimed: false,
      app_count: VIRTUAL_DESKTOP_APP_MANIFEST.apps.length,
      modality_contract_count: VIRTUAL_DESKTOP_APP_MANIFEST.apps.length * EXPANDED_IO_MODALITIES.length,
    });
    expect(ioMap.map_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(ioMap.contracts.map(contract => contract.app_id).sort()).toEqual(expectedAppIds);
    expect(new Set(ioMap.contracts.map(contract => contract.app_id)).size).toBe(expectedAppIds.length);
    expect(new Set(ioMap.contracts.map(contract => contract.contract_cid)).size).toBe(expectedAppIds.length);
    expect(artifact).toEqual(ioMap);
  });

  it('gives every app a visible display, photo, video, microphone, transcription, speaker, and headphone contract', () => {
    for (const contract of ioMap.contracts) {
      const modalities = listExpandedIOModalityContracts(contract);
      expect(modalities.map(item => item.modality).sort()).toEqual([...EXPANDED_IO_MODALITIES].sort());
      expect(modalities).toHaveLength(7);
      expect(contract.display).toMatchObject({
        modality: 'display.output',
        applicable: true,
        disposition: 'allowed',
        primary_surface: 'meta-glasses-display',
        safe_path: true,
        permission_scope: 'meta_glasses.display.render',
        operator_visible: true,
        physical_hardware_claimed: false,
        simulator_replay: 'required',
      });
      expect(contract.display.binding).toBeTruthy();
      expect(contract.contract_cid).toMatch(/^sha256:[0-9a-f]{64}$/);

      for (const modality of modalities) {
        expect(modality.reason).toBeTruthy();
        expect(modality.purpose).toBeTruthy();
        expect(modality.operator_visible).toBe(true);
        expect(modality.physical_hardware_claimed).toBe(false);
        expect(modality.fallback_order).toEqual(['mobile-card', 'desktop-only']);
      }
    }
  });

  it('allows only reviewed camera and microphone bindings with scoped permission, confirmation, redaction, and receipts', () => {
    const photo = findExpandedIOAppContract(ioMap, 'image-viewer')?.camera.photo_capture;
    const video = findExpandedIOAppContract(ioMap, 'cinema')?.camera.video_capture;
    const voice = findExpandedIOAppContract(ioMap, 'ai-chat')?.microphone.input;
    const transcript = findExpandedIOAppContract(ioMap, 'notes')?.microphone.transcription;

    expect(photo).toMatchObject({
      applicable: true,
      disposition: 'permission-required',
      primary_surface: 'meta-glasses-camera',
      permission_scope: 'meta_glasses.camera.photo',
      confirmation_required: true,
      receipt_required: true,
      redaction_policy: 'privacy-filtered',
    });
    expect(video).toMatchObject({
      applicable: true,
      disposition: 'permission-required',
      permission_scope: 'meta_glasses.camera.video',
    });
    expect(voice).toMatchObject({
      applicable: true,
      disposition: 'permission-required',
      primary_surface: 'meta-glasses-microphone',
      permission_scope: 'meta_glasses.microphone.capture',
    });
    expect(transcript).toMatchObject({
      applicable: true,
      disposition: 'permission-required',
      redaction_policy: 'transcript-redacted',
    });

    const applicableCapture = ioMap.contracts.flatMap(contract => [
      contract.camera.photo_capture,
      contract.camera.video_capture,
      contract.microphone.input,
      contract.microphone.transcription,
    ]).filter(modality => modality.applicable);
    expect(applicableCapture.length).toBeGreaterThan(0);
    expect(applicableCapture.every(modality => (
      modality.safe_path
      && Boolean(modality.binding)
      && Boolean(modality.permission_scope)
      && modality.confirmation_required
      && modality.receipt_required
      && modality.simulator_replay === 'required'
    ))).toBe(true);
  });

  it('defines permission-mediated speaker and headphone output only for audio-capable apps', () => {
    for (const appId of ['music-studio-unified', 'ai-chat', 'media-player', 'p2p-chat', 'agent-supervisor']) {
      const contract = findExpandedIOAppContract(ioMap, appId);
      for (const modality of [contract?.audio.speaker_output, contract?.audio.headphone_output]) {
        expect(modality).toMatchObject({
          applicable: true,
          disposition: 'permission-required',
          safe_path: true,
          permission_scope: 'meta_glasses.audio.playback',
          confirmation_required: true,
          simulator_replay: 'required',
        });
      }
    }

    const calculator = findExpandedIOAppContract(ioMap, 'calculator');
    expect(calculator?.audio.speaker_output).toMatchObject({
      applicable: false,
      disposition: 'denied',
      primary_surface: 'none',
      safe_path: false,
      binding: null,
      simulator_replay: 'denied-path',
    });
  });

  it('fails closed with an explicit denial and desktop fallback where no safe device route exists', () => {
    for (const contract of ioMap.contracts) {
      const unavailable = listExpandedIOModalityContracts(contract).filter(modality => !modality.safe_path);
      for (const modality of unavailable) {
        expect(['denied', 'desktop-only']).toContain(modality.disposition);
        expect(modality.applicable).toBe(false);
        expect(modality.binding).toBeNull();
        expect(modality.primary_surface).toBe('none');
        expect(modality.reason).toContain('explicitly denied');
        expect(modality.fallback_order).toContain('desktop-only');
      }
    }

    const apiKeys = findExpandedIOAppContract(ioMap, 'api-keys');
    const oauth = findExpandedIOAppContract(ioMap, 'oauth-login');
    for (const sensitive of [apiKeys, oauth]) {
      expect(sensitive?.display.redaction_policy).toBe('secret-values-blocked');
      expect(sensitive?.fallback_routes).toEqual(expect.arrayContaining([
        expect.objectContaining({ route: 'mobile-card', disposition: 'denied' }),
        expect.objectContaining({ route: 'desktop-only', disposition: 'allowed' }),
      ]));
      expect(listExpandedIOModalityContracts(sensitive!)
        .filter(modality => modality.modality !== 'display.output')
        .every(modality => modality.disposition === 'denied')).toBe(true);
    }
  });

  it('provides visible mobile-card and desktop-only fallback decisions for every app', () => {
    for (const contract of ioMap.contracts) {
      expect(contract.fallback_routes.map(route => route.route)).toEqual(['mobile-card', 'desktop-only']);
      for (const route of contract.fallback_routes) {
        expect(route.operator_visible).toBe(true);
        expect(route.preserves_receipts).toBe(true);
        expect(route.reason).toBeTruthy();
      }
      expect(contract.policy).toMatchObject({
        default_deny_capture: true,
        default_deny_unknown_binding: true,
        receipt_required_for_permission_decision: true,
        fallback_decision_operator_visible: true,
      });
    }
  });

  it('keeps Supervisor Console output read-safe while gating capture and steering input', () => {
    const supervisor = findExpandedIOAppContract(ioMap, 'agent-supervisor');

    expect(supervisor?.display).toMatchObject({
      disposition: 'allowed',
      redaction_policy: 'metadata-only',
      receipt_required: true,
    });
    expect(supervisor?.camera.photo_capture).toMatchObject({
      disposition: 'permission-required',
      binding: 'agent-supervisor.attach-evidence-photo',
    });
    expect(supervisor?.camera.video_capture).toMatchObject({
      disposition: 'permission-required',
      binding: 'agent-supervisor.record-replay-evidence',
    });
    expect(supervisor?.microphone.transcription).toMatchObject({
      disposition: 'permission-required',
      redaction_policy: 'transcript-redacted',
      binding: 'agent-supervisor.transcribe-steering-draft',
    });
    expect(supervisor?.microphone.transcription.purpose).toContain('separate confirmation');
  });

  it('is byte-deterministic and validation detects coverage or policy drift', () => {
    const reversedManifest: VirtualDesktopAppManifest = {
      ...VIRTUAL_DESKTOP_APP_MANIFEST,
      generated_from: [...VIRTUAL_DESKTOP_APP_MANIFEST.generated_from].reverse(),
      apps: [...VIRTUAL_DESKTOP_APP_MANIFEST.apps].reverse(),
    };
    const repeated = buildAgentSupervisorExpandedIOMap(reversedManifest, { generatedAt });
    expect(JSON.stringify(repeated)).toBe(JSON.stringify(ioMap));

    const missingApp = {
      ...ioMap,
      contracts: ioMap.contracts.slice(1),
    } as AgentSupervisorExpandedIOMap;
    const unsafeRoute = JSON.parse(JSON.stringify(ioMap)) as AgentSupervisorExpandedIOMap;
    unsafeRoute.contracts[0].camera.photo_capture.applicable = false;
    unsafeRoute.contracts[0].camera.photo_capture.safe_path = true;

    expect(validateAgentSupervisorExpandedIOMap(missingApp).valid).toBe(false);
    expect(validateAgentSupervisorExpandedIOMap(missingApp).errors.join('\n')).toContain('canonical manifest');
    expect(validateAgentSupervisorExpandedIOMap(unsafeRoute).valid).toBe(false);
    expect(validateAgentSupervisorExpandedIOMap(unsafeRoute).errors.join('\n')).toContain('safe route is missing its reviewed app binding');
  });
});
