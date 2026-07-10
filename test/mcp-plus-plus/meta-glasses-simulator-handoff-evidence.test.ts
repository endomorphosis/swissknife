/**
 * @vitest-environment node
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import {
  META_GLASSES_SIMULATOR_HANDOFF_SCHEMA,
  META_GLASSES_SIMULATOR_HANDOFF_TASK_ID,
  validateMetaGlassesSimulatorHandoffEvidence,
  type MetaGlassesSimulatorCapability,
  type MetaGlassesSimulatorHandoffEvidence,
} from '../../src/services/glasses/meta-glasses-simulator-handoff';

const evidenceRoot = join(process.cwd(), 'test-results/virtual-desktop-ipfs-mcp-orb');
const evidencePath = join(evidenceRoot, 'glasses-simulator-handoff.json');
const docPath = join(process.cwd(), 'docs/meta-glasses-simulator-evidence.md');

describe('SWR-086 Meta glasses simulator handoff evidence', () => {
  it('validates simulator-driven ORB/IDL handoff evidence without physical glasses pairing', () => {
    expect(existsSync(evidencePath)).toBe(true);
    expect(existsSync(docPath)).toBe(true);

    const evidence = readJson<MetaGlassesSimulatorHandoffEvidence>(evidencePath);
    const doc = readFileSync(docPath, 'utf8');
    const validation = validateMetaGlassesSimulatorHandoffEvidence(evidence);

    expect(validation).toMatchObject({ valid: true, errors: [] });
    expect(evidence).toMatchObject({
      schema: META_GLASSES_SIMULATOR_HANDOFF_SCHEMA,
      task_id: META_GLASSES_SIMULATOR_HANDOFF_TASK_ID,
      hardware_free: true,
      simulator_driven: true,
      physical_glasses_required: false,
      direct_desktop_pairing_required: false,
    });
    expect(evidence.validation_commands).toEqual(expect.arrayContaining([
      'npm run test:e2e:meta-glasses',
      'npm run evidence:mcp-glasses',
    ]));
    expect(evidence.simulator).toMatchObject({
      platform: 'simulator',
      paired_physical_glasses: false,
      capabilities: {
        'display.output': true,
        'camera.photo_capture': true,
        'microphone.input': true,
        'speaker.output': true,
      },
    });

    const capabilityMap = new Map(
      evidence.capability_evidence.map(capability => [capability.capability, capability]),
    );
    for (const capability of [
      'display.output',
      'camera.photo_capture',
      'microphone.input',
      'speaker.output',
    ] satisfies MetaGlassesSimulatorCapability[]) {
      const entry = capabilityMap.get(capability);
      expect(entry, capability).toBeTruthy();
      expect(entry?.source).toBe('simulator');
      expect(entry?.interface_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(entry?.idl_projection.projection_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(entry?.idl_projection.method_count).toBeGreaterThan(0);
    }

    expect(capabilityMap.get('display.output')?.simulator_visible_states?.map(state => state.state)).toEqual([
      'rendered',
      'updated',
      'focused',
      'activated',
      'cleared',
    ]);
    expect(
      capabilityMap.get('display.output')?.simulator_visible_states?.every(state => (
        state.visible_in_simulator
        && /^sha256:[0-9a-f]{64}$/.test(state.receipt_cid)
      )),
    ).toBe(true);

    const cameraStates = capabilityMap.get('camera.photo_capture')?.camera_permission_states ?? [];
    expect(cameraStates.map(state => state.state)).toEqual([
      'permission_denied',
      'fallback',
      'accepted',
    ]);
    expect(cameraStates.find(state => state.state === 'permission_denied')?.policy_outcome).toBe('deny');
    expect(cameraStates.find(state => state.state === 'fallback')?.selected_surface).toBe('mobile-fallback');
    expect(cameraStates.find(state => state.state === 'accepted')?.selected_surface).toBe('simulator');

    const microphoneStates = capabilityMap.get('microphone.input')?.audio_policy_states ?? [];
    expect(microphoneStates.map(state => state.policy_outcome)).toEqual(
      expect.arrayContaining(['require_confirmation', 'fallback']),
    );
    expect(microphoneStates.every(state => state.raw_audio_redacted)).toBe(true);
    expect(microphoneStates.some(state => state.route_provider === 'simulator')).toBe(true);

    const speakerStates = capabilityMap.get('speaker.output')?.audio_policy_states ?? [];
    expect(speakerStates.some(state => state.granted)).toBe(true);
    expect(speakerStates.every(state => state.route_provider === 'simulator')).toBe(true);
    expect(speakerStates.every(state => state.raw_audio_redacted)).toBe(true);

    expect(evidence.handoff_paths.map(path => path.scenario)).toEqual([
      'desktop_to_mobile_orb_to_simulator',
      'mobile_to_desktop_resume',
      'policy_denied_camera_to_mobile_fallback',
    ]);
    expect(evidence.handoff_paths.every(path => (
      path.direct_desktop_pairing === false
      && path.physical_glasses_required === false
      && path.receipts.length > 0
    ))).toBe(true);
    expect(evidence.acceptance_matrix).toEqual({
      display_states_proven: true,
      audio_policy_states_proven: true,
      microphone_policy_states_proven: true,
      camera_permission_fallback_states_proven: true,
      desktop_mobile_handoff_proven: true,
      no_direct_desktop_physical_pairing: true,
    });
    expect(evidence.playwright_probe).toMatchObject({ status: 'passed' });
    if (evidence.playwright_probe?.screenshot) {
      const screenshotPath = join(process.cwd(), evidence.playwright_probe.screenshot);
      expect(existsSync(screenshotPath)).toBe(true);
      expect(statSync(screenshotPath).size).toBeGreaterThan(1024);
    }

    expect(doc).toContain('glasses-simulator-handoff.json');
    expect(doc).toContain('display.output');
    expect(doc).toContain('camera.photo_capture');
    expect(doc).toContain('microphone.input');
    expect(doc).toContain('speaker.output');
    expect(doc).toContain('No direct desktop pairing');
  });
});

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}
