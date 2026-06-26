import {
  META_GLASSES_CONTROL_PLANE_DEMO_APP_ID,
  createMetaGlassesControlPlaneDemo,
  runMetaGlassesControlPlaneDemoScenario,
} from '../../examples/meta-glasses-control-plane-demo';
import type { MetaGlassesIOCapabilityKind } from '../../src/services/meta-glasses-io-profile';

const CID_PATTERN = /^sha256:[a-f0-9]{64}$/;

const REQUIRED_VISIBLE_CAPABILITIES: MetaGlassesIOCapabilityKind[] = [
  'camera.photo_capture',
  'microphone.input',
  'speaker.output',
  'headphone.output',
  'display.output',
  'neural_band.input',
  'captouch.input',
  'motion.orientation',
  'phone_gps.context',
];

describe('Meta glasses control-plane demo bindings', () => {
  it('binds expanded Meta glasses I/O routes to visible demo actions and diagnostics', () => {
    const demo = createMetaGlassesControlPlaneDemo();
    const bindings = demo.listBindings();

    expect(bindings.map(binding => binding.capability)).toEqual(expect.arrayContaining([
      ...REQUIRED_VISIBLE_CAPABILITIES,
      'camera.video_capture',
    ]));
    expect(bindings.every(binding => binding.app_id === META_GLASSES_CONTROL_PLANE_DEMO_APP_ID)).toBe(true);

    const state = demo.runMockScenario();
    const diagnosticCapabilities = state.diagnostics.map(diagnostic => diagnostic.capability);

    expect(state.mock_only).toBe(true);
    expect(diagnosticCapabilities).toEqual(expect.arrayContaining(REQUIRED_VISIBLE_CAPABILITIES));
    expect(Object.keys(state.visible_actions)).toEqual(expect.arrayContaining(REQUIRED_VISIBLE_CAPABILITIES));

    for (const capability of REQUIRED_VISIBLE_CAPABILITIES) {
      const diagnostic = state.diagnostics.find(item => item.capability === capability);
      expect(diagnostic).toEqual(expect.objectContaining({
        capability,
        binding_id: expect.any(String),
        visible_label: expect.any(String),
        receipt_cid: expect.stringMatching(CID_PATTERN),
      }));
    }

    expect(state.diagnostics.find(item => item.capability === 'neural_band.input')).toEqual(expect.objectContaining({
      action: 'commands.confirm_selection',
      status: 'accepted',
    }));
    expect(state.diagnostics.find(item => item.capability === 'captouch.input')).toEqual(expect.objectContaining({
      action: 'views.navigate_timeline',
      status: 'accepted',
    }));
    expect(state.diagnostics.find(item => item.capability === 'motion.orientation')).toEqual(expect.objectContaining({
      action: 'views.reflow_hud',
      status: 'accepted',
    }));
    expect(state.diagnostics.find(item => item.capability === 'phone_gps.context')).toEqual(expect.objectContaining({
      action: 'agent.update_location_context',
      status: 'accepted',
    }));
  });

  it('emits control-plane handoff receipts and fallback panels for unavailable native DAT/Web Apps routes', () => {
    const state = runMetaGlassesControlPlaneDemoScenario();

    expect(state.handoff_receipts.length).toBe(state.diagnostics.length);
    expect(state.handoff_receipts.every(receipt => CID_PATTERN.test(receipt))).toBe(true);

    expect(state.fallback_panels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        capability: 'camera.photo_capture',
        route_status: 'fallback',
        tool: 'hallucinate_app.meta_glasses.camera_fallback',
      }),
      expect.objectContaining({
        capability: 'display.output',
        route_status: 'unsupported',
        tool: 'hallucinate_app.meta_glasses.display_fallback',
      }),
    ]));

    const fallbackDiagnostics = state.diagnostics.filter(diagnostic => diagnostic.fallback_visible);
    expect(fallbackDiagnostics.map(diagnostic => diagnostic.capability)).toEqual(expect.arrayContaining([
      'camera.photo_capture',
      'display.output',
    ]));
    for (const panel of state.fallback_panels) {
      expect(panel.message).toBeTruthy();
      expect(panel.binding_id).toBeTruthy();
    }
  });

  it('records content-addressed capture references only when persistence is policy-allowed', () => {
    const demo = createMetaGlassesControlPlaneDemo();

    const allowed = demo.capturePhoto({
      correlation_id: 'demo-camera-persist-allowed',
      persist_capture: true,
      policy_outcome: 'allow',
    });
    const ephemeral = demo.capturePhoto({
      correlation_id: 'demo-camera-persist-not-requested',
      persist_capture: false,
      policy_outcome: 'allow',
    });
    const denied = demo.capturePhoto({
      correlation_id: 'demo-camera-persist-denied',
      persist_capture: true,
      policy_outcome: 'deny',
    });

    expect(allowed.status).toBe('accepted');
    expect(allowed.payload_refs[0]).toEqual(expect.objectContaining({
      cid: expect.stringMatching(CID_PATTERN),
      retention_policy: 'pinned',
    }));
    expect(ephemeral.status).toBe('accepted');
    expect(ephemeral.payload_refs[0]).toEqual(expect.objectContaining({
      cid: expect.stringMatching(CID_PATTERN),
      retention_policy: 'policy_controlled',
    }));
    expect(denied.status).toBe('denied');

    expect(demo.state.capture_references).toHaveLength(1);
    expect(demo.state.capture_references[0]).toEqual(expect.objectContaining({
      cid: allowed.payload_refs[0].cid,
      purpose: 'photo',
      retention_policy: 'pinned',
      redaction: 'privacy_filtered',
    }));
    expect(demo.state.capture_references.map(ref => ref.cid)).not.toContain(ephemeral.payload_refs[0].cid);
    expect(demo.state.capture_references.map(ref => ref.cid)).not.toContain(denied.payload_refs[0]?.cid);
  });
});
