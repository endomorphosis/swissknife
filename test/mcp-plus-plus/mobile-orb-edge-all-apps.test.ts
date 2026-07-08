import {
  META_GLASSES_MOBILE_ORB_CANONICAL_RENDER_TARGETS,
  MetaGlassesMobileORBBridgeAdapter,
  createMetaGlassesMobileORBAllAppFallbackPlan,
  normalizeMetaGlassesMobileORBRenderTarget,
  selectMetaGlassesMobileORBFallback,
  type MetaGlassesMobileORBDispatchResponseResponse,
  type MetaGlassesMobileORBRegisterResponse,
} from '../../src/services/glasses/meta-glasses-mobile-orb-bridge';
import { VIRTUAL_DESKTOP_APP_MANIFEST } from '../../src/services/apps/virtual-desktop-app-manifest';
import type { ControlSurfacePolicyEvaluationRequest } from '../../src/services/mcp/control-surface-mediator';

const ALL_CAPABILITIES = [
  'mobile/orb.edge',
  'mobile/orb.service.bind',
  'mobile/orb.service.invoke',
  'mobile/orb.subscription',
  'mobile/orb.response.dispatch',
  'mobile/orb.binding.revoke',
];

function outputAs<T>(response: { output: unknown }): T {
  return response.output as T;
}

function allowControlSurfaceEvaluation(request: ControlSurfacePolicyEvaluationRequest) {
  return {
    outcome: 'allow' as const,
    reasons: ['Test runtime policy evaluator allowed all-app mobile ORB fallback dispatch.'],
    explanation: `Allowed ${request.interaction_envelope.normalized_intent.method} for all-app fallback coverage.`,
  };
}

describe('mobile ORB edge fallback coverage for every SwissKnife app', () => {
  it('builds a canonical mobile ORB fallback plan for every manifest app', () => {
    const plan = createMetaGlassesMobileORBAllAppFallbackPlan();
    const manifestIds = VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => app.id).sort();
    const planIds = plan.entries.map(entry => entry.app_id).sort();
    const dispatchTargets = new Set(
      plan.entries.flatMap(entry =>
        entry.dispatch_render_targets.map(target => normalizeMetaGlassesMobileORBRenderTarget(target)),
      ),
    );
    const primaryAndSelectedTargets = new Set(
      plan.entries.flatMap(entry => [entry.primary_render_target, entry.selected_render_target]),
    );

    expect(plan.validation.errors).toEqual([]);
    expect(plan.validation.valid).toBe(true);
    expect(plan.app_count).toBe(VIRTUAL_DESKTOP_APP_MANIFEST.apps.length);
    expect(planIds).toEqual(manifestIds);
    expect([...dispatchTargets].sort()).toEqual(
      [...META_GLASSES_MOBILE_ORB_CANONICAL_RENDER_TARGETS].sort(),
    );
    expect([...primaryAndSelectedTargets]).toEqual(
      expect.arrayContaining([
        'native_display',
        'display_webapp',
        'mobile_card',
        'audio_summary',
      ]),
    );
  });

  it('dispatches every app class through the mobile ORB edge fallback selector', async () => {
    const plan = createMetaGlassesMobileORBAllAppFallbackPlan();
    const adapter = new MetaGlassesMobileORBBridgeAdapter({
      now: () => new Date('2026-07-07T12:00:00.000Z'),
      control_surface_policy_evaluator: allowControlSurfaceEvaluation,
    });
    const registeredResponse = await adapter.invoke(
      (await adapter.bind({ operation: 'register_edge_capabilities' })).handle,
      {
        edge_id: 'hardware-free-mobile-orb-edge',
        platform: 'simulator',
        device_id: 'mobile-orb-all-apps',
        device_model: 'Meta glasses hardware-free edge',
        dat_capabilities: plan.dat_capabilities,
        local_interface_cids: [
          'sha256:mobile-orb-edge',
          'sha256:display-widget-orb',
        ],
      },
      {
        correlation_id: 'corr-mobile-orb-all-apps-register',
        capabilities: ALL_CAPABILITIES,
      },
    );
    const registered = outputAs<MetaGlassesMobileORBRegisterResponse>(registeredResponse);
    const dispatchBinding = await adapter.bind({ operation: 'dispatch_glasses_response' });
    const selectedTargets = new Set<string>();

    for (const entry of plan.entries) {
      const response = await adapter.invoke(
        dispatchBinding.handle,
        {
          edge_session_id: registered.edge_session_id,
          result: {
            follow_up_actions: [
              {
                type: 'open_virtual_desktop_app',
                app_id: entry.app_id,
                target: entry.selected_render_target,
              },
            ],
            display_widget_action: entry.displayable
              ? {
                type: 'mobile_render_display_widget',
                operation: 'render_widget',
                widget_id: `all-apps-${entry.app_id}`,
                fallback: entry.selection.fallback,
              }
              : null,
            spoken_text: `${entry.app_title} routed to ${entry.selected_render_target}.`,
          },
          render_targets: entry.dispatch_render_targets,
          fallback: entry.selection.fallback,
          correlation_id: `corr-mobile-orb-all-apps-${entry.app_id}`,
          parent_receipt_cids: [registeredResponse.receipt.receipt_cid],
        },
        {
          correlation_id: `corr-mobile-orb-all-apps-${entry.app_id}`,
          capabilities: ALL_CAPABILITIES,
          parent_receipt_cids: [registeredResponse.receipt.receipt_cid],
        },
      );
      const output = outputAs<MetaGlassesMobileORBDispatchResponseResponse>(response);
      selectedTargets.add(output.fallback_selection?.selected_render_target ?? 'missing');

      expect(response.denied).toBe(false);
      expect(output.receipt_cid).toMatch(/^sha256:/);
      expect(output.fallback_selection).toEqual(entry.selection);
      expect(output.dispatched_actions[0]).toEqual(
        expect.objectContaining({
          app_id: entry.app_id,
          target: entry.selected_render_target,
        }),
      );
      expect(output.spoken_text).toContain(entry.selected_render_target);
    }

    expect([...selectedTargets]).toEqual(
      expect.arrayContaining([
        'display_webapp',
        'mobile_card',
        'audio_summary',
      ]),
    );
    expect(adapter.getTaskMetadata().filter(entry => entry.operation === 'dispatch_glasses_response')).toHaveLength(
      plan.entries.length,
    );
  });

  it('keeps native display and legacy target aliases selectable through one selector', () => {
    const native = selectMetaGlassesMobileORBFallback({
      render_targets: ['display_widget', 'display_webapp', 'mobile_card'],
      dat_capabilities: { display: true, webAppDisplay: true },
    });
    const webappFallback = selectMetaGlassesMobileORBFallback({
      render_targets: ['native_display', 'display_webapp', 'mobile_card'],
      fallback: { reason: 'native display unavailable', render_path: 'display-webapp' },
      dat_capabilities: { display: false, webAppDisplay: true },
    });
    const audio = selectMetaGlassesMobileORBFallback({
      render_targets: ['audio', 'notification'],
      dat_capabilities: { audio: true },
    });

    expect(native.primary_render_target).toBe('native_display');
    expect(native.selected_render_target).toBe('native_display');
    expect(webappFallback.fallback_render_target).toBe('display_webapp');
    expect(audio.primary_render_target).toBe('audio_summary');
    expect(audio.selected_render_target).toBe('audio_summary');
  });
});
