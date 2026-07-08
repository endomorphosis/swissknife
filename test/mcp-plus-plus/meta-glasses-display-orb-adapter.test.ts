import { join } from 'path';
import {
  MetaGlassesDisplayORBAdapter,
  createMetaGlassesDisplayORBOperationPolicies,
  type MetaGlassesDisplayBridge,
  type MetaGlassesDisplayMobileAction,
  type MetaGlassesDisplayORBOperation,
  type MetaGlassesDisplayORBOperationOutput,
} from '../../src/services/glasses/meta-glasses-display-orb-adapter';
import type { ControlSurfacePolicyEvaluationRequest } from '../../src/services/mcp/control-surface-mediator';
import type { MetaGlassesWidgetDescriptor } from '../../src/services/glasses/meta-glasses-display-profile';
<<<<<<< HEAD

const nodeFs = (globalThis.process as unknown as {
  getBuiltinModule?: (specifier: string) => unknown;
}).getBuiltinModule?.('fs') as {
  readFileSync: (path: string, encoding: BufferEncoding) => string;
} | undefined;

if (!nodeFs) {
  throw new Error('node:fs builtin module is required for meta-glasses display fixture tests');
}
=======
>>>>>>> 1569811 (chore: add pending swissknife staged changes)

const FIXTURE_PATH = join(
  __dirname,
  '../fixtures/meta-glasses-display/valid-task-progress-widget.json',
);

const DISPLAY_CAPABILITIES = [
  'display/widget',
  'display/widget.confirmed',
  'display/action.confirmed',
];

const STATE = {
  title: 'Sync dataset',
  summary: 'Pinning and indexing a research collection for offline access.',
  progress: 0.42,
  progress_label: '42% complete',
  status: 'running',
  selected_action: null,
  updated_at: '2026-05-22T12:00:00.000Z',
};

const OBJECT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
};

function loadDescriptor(): MetaGlassesWidgetDescriptor {
  return JSON.parse(nodeFs.readFileSync(FIXTURE_PATH, 'utf8')) as MetaGlassesWidgetDescriptor;
}

function displayDescriptor(): MetaGlassesWidgetDescriptor {
  const descriptor = loadDescriptor();
  descriptor.methods.push({
    name: 'play_video',
    input_schema: OBJECT_SCHEMA,
    output_schema: OBJECT_SCHEMA,
  });
  descriptor.services[0].operations.push('play_video');
  descriptor.data_contracts.operations.push({
    method: 'play_video',
    title: 'Play display video',
    input_schema: OBJECT_SCHEMA,
    output_schema: OBJECT_SCHEMA,
  });
  descriptor.permissions.operations.play_video = ['display/widget'];
  return descriptor;
}

async function bind(
  adapter: MetaGlassesDisplayORBAdapter,
  operation: MetaGlassesDisplayORBOperation,
  descriptor = displayDescriptor(),
) {
  return adapter.bind({ descriptor, operation });
}

function outputOf(response: { output: unknown }): MetaGlassesDisplayORBOperationOutput {
  return response.output as MetaGlassesDisplayORBOperationOutput;
}

function allowControlSurfaceEvaluation(request: ControlSurfacePolicyEvaluationRequest) {
  return {
    outcome: 'allow',
    reasons: ['Test runtime policy evaluator allowed display ORB invocation.'],
    explanation: `Test runtime policy evaluator allowed ${request.interaction_envelope.normalized_intent.method}.`,
  };
}

describe('Meta glasses display ORB adapter', () => {
  it('handles render/update/focus/activate/clear/reset/video/subscribe operations with receipts and mobile actions', async () => {
    const actions: MetaGlassesDisplayMobileAction[] = [];
    const bridge: MetaGlassesDisplayBridge = ({ mobile_action, operation }) => {
      actions.push(mobile_action);
      return {
        ok: true,
        status: operation === 'render_widget' ? 'rendered' : 'queued',
        metadata: { operation },
      };
    };
    const adapter = new MetaGlassesDisplayORBAdapter({
      bridge,
      control_surface_policy_evaluator: allowControlSurfaceEvaluation,
    });
    const descriptor = displayDescriptor();

    const renderBinding = await bind(adapter, 'render_widget', descriptor);
    const render = await adapter.invoke(
      renderBinding.handle,
      { request_id: 'render-1', state: STATE },
      { correlation_id: 'corr-render', capabilities: ['display/widget'] },
    );
    const renderOutput = outputOf(render);

    const updateBinding = await bind(adapter, 'update_widget', descriptor);
    const update = await adapter.invoke(
      updateBinding.handle,
      {
        request_id: 'update-1',
        widget_id: renderOutput.widget_id,
        patch: { progress_label: '43% complete', progress: 0.43 },
      },
      { correlation_id: 'corr-update', capabilities: ['display/widget'] },
    );

    const focusNext = await adapter.invoke(
      (await bind(adapter, 'focus_next', descriptor)).handle,
      { widget_id: renderOutput.widget_id },
      { correlation_id: 'corr-focus-next', capabilities: ['display/widget'] },
    );
    const focusPrevious = await adapter.invoke(
      (await bind(adapter, 'focus_previous', descriptor)).handle,
      { widget_id: renderOutput.widget_id },
      { correlation_id: 'corr-focus-previous', capabilities: ['display/widget'] },
    );
    const activate = await adapter.invoke(
      (await bind(adapter, 'activate', descriptor)).handle,
      { widget_id: renderOutput.widget_id },
      { correlation_id: 'corr-activate', capabilities: DISPLAY_CAPABILITIES },
    );
    const clear = await adapter.invoke(
      (await bind(adapter, 'clear_widget', descriptor)).handle,
      { widget_id: renderOutput.widget_id },
      { correlation_id: 'corr-clear', capabilities: DISPLAY_CAPABILITIES },
    );
    const reset = await adapter.invoke(
      (await bind(adapter, 'reset_session', descriptor)).handle,
      { widget_id: renderOutput.widget_id },
      { correlation_id: 'corr-reset', capabilities: DISPLAY_CAPABILITIES },
    );
    const video = await adapter.invoke(
      (await bind(adapter, 'play_video', descriptor)).handle,
      {
        request_id: 'video-1',
        widget_id: renderOutput.widget_id,
        video: {
          uri: 'https://example.test/clip.mp4',
          content_type: 'video/mp4',
          duration_ms: 1200,
          fallback_text: 'Video preview unavailable',
        },
      },
      { correlation_id: 'corr-video', capabilities: ['display/widget'] },
    );
    const subscribe = await adapter.invoke(
      (await bind(adapter, 'subscribe_updates', descriptor)).handle,
      { widget_id: renderOutput.widget_id },
      { correlation_id: 'corr-subscribe', capabilities: ['display/widget'] },
    );

    expect(render.denied).toBe(false);
    expect(render.receipt.receipt_cid).toMatch(/^sha256:/);
    expect(render.receipt.lifecycle.map(record => record.phase)).toEqual([
      'discover',
      'bind',
      'authorize',
      'invoke',
    ]);
    expect(renderOutput.mobile_action.type).toBe('mobile_render_display_widget');
    expect(renderOutput.mobile_action.manifest?.widget_cid).toBe(renderOutput.widget_cid);
    expect(outputOf(update).mobile_action.type).toBe('mobile_update_display_widget');
    expect(outputOf(update).mobile_action.patch).toEqual({
      progress: 0.43,
      progress_label: '43% complete',
    });
    expect(outputOf(focusNext).focus).toEqual({
      direction: 'next',
      action_id: 'dismiss',
      focus_index: 1,
    });
    expect(outputOf(focusPrevious).focus).toEqual({
      direction: 'previous',
      action_id: 'pause',
      focus_index: 0,
    });
    expect(outputOf(activate).activated_action?.backend_action_id).toBe('handsfree.task.pause');
    expect(outputOf(clear).mobile_action.type).toBe('mobile_clear_display_widget');
    expect(outputOf(reset).session_generation).toBe(1);
    expect(outputOf(video).mobile_action.video).toEqual(
      expect.objectContaining({
        uri: 'https://example.test/clip.mp4',
        content_type: 'video/mp4',
      }),
    );
    expect(outputOf(subscribe).mobile_action.type).toBe('mobile_subscribe_display_widget_updates');
    expect(actions.map(action => action.type)).toEqual([
      'mobile_render_display_widget',
      'mobile_update_display_widget',
      'mobile_focus_display_widget',
      'mobile_focus_display_widget',
      'mobile_activate_display_widget_action',
      'mobile_clear_display_widget',
      'mobile_reset_display_widget_session',
      'mobile_play_display_widget_video',
      'mobile_subscribe_display_widget_updates',
    ]);
    expect(adapter.getTaskMetadata().map(entry => entry.receipt_cid)).toContain(render.receipt.receipt_cid);
    expect(adapter.getSessionSnapshot(renderOutput.widget_id)?.receipt_cids).toContain(reset.receipt.receipt_cid);
  });

  it('denies operations by policy before they reach the mobile bridge', async () => {
    let bridgeCalls = 0;
    const adapter = new MetaGlassesDisplayORBAdapter({
      control_surface_policy_evaluator: allowControlSurfaceEvaluation,
      bridge: () => {
        bridgeCalls += 1;
        return { ok: true, status: 'queued' };
      },
    });
    const binding = await bind(adapter, 'render_widget');

    const denied = await adapter.invoke(
      binding.handle,
      { request_id: 'render-denied', state: STATE },
      { correlation_id: 'corr-denied', capabilities: [] },
    );

    expect(denied.denied).toBe(true);
    expect(denied.receipt.policy_decision.outcome).toBe('deny');
    expect(denied.receipt.policy_decision.reasons).toContain('Missing capability: display/widget');
    expect(bridgeCalls).toBe(0);
    expect(adapter.getTaskMetadata()[0]).toEqual(
      expect.objectContaining({
        correlation_id: 'corr-denied',
        denied: true,
        policy_outcome: 'deny',
      }),
    );
  });

  it('requires render idempotency keys and caches successful idempotent results', async () => {
    let bridgeCalls = 0;
    const adapter = new MetaGlassesDisplayORBAdapter({
      control_surface_policy_evaluator: allowControlSurfaceEvaluation,
      bridge: () => {
        bridgeCalls += 1;
        return { ok: true, status: 'rendered' };
      },
    });
    const binding = await bind(adapter, 'render_widget');

    const missingKey = await adapter.invoke(
      binding.handle,
      { state: STATE },
      { correlation_id: 'corr-missing-key', capabilities: ['display/widget'] },
    );
    const first = await adapter.invoke(
      binding.handle,
      { request_id: 'render-once', state: STATE },
      { correlation_id: 'corr-idempotent-1', capabilities: ['display/widget'] },
    );
    const second = await adapter.invoke(
      binding.handle,
      { request_id: 'render-once', state: STATE },
      { correlation_id: 'corr-idempotent-2', capabilities: ['display/widget'] },
    );

    expect(missingKey.denied).toBe(true);
    expect(missingKey.receipt.policy_decision.reasons.join('\n')).toContain('Idempotency key required');
    expect(first.denied).toBe(false);
    expect(second.denied).toBe(false);
    expect(outputOf(second).widget_cid).toBe(outputOf(first).widget_cid);
    expect(bridgeCalls).toBe(1);
  });

  it('applies rate limits to widget updates', async () => {
    const adapter = new MetaGlassesDisplayORBAdapter({
      control_surface_policy_evaluator: allowControlSurfaceEvaluation,
      operation_policies: {
        update_widget: {
          authorization: { required_capabilities: ['display/widget'] },
          idempotency: { required: true, key_field: 'request_id' },
          rate_limit: { max_invocations: 1, window_ms: 60_000 },
        },
      },
    });
    const descriptor = displayDescriptor();
    const render = await adapter.invoke(
      (await bind(adapter, 'render_widget', descriptor)).handle,
      { request_id: 'render-rate', state: STATE },
      { correlation_id: 'corr-render-rate', capabilities: ['display/widget'] },
    );
    const updateBinding = await bind(adapter, 'update_widget', descriptor);
    const first = await adapter.invoke(
      updateBinding.handle,
      {
        request_id: 'update-rate-1',
        widget_id: outputOf(render).widget_id,
        patch: { progress_label: '44% complete' },
      },
      { correlation_id: 'corr-update-rate-1', capabilities: ['display/widget'] },
    );
    const second = await adapter.invoke(
      updateBinding.handle,
      {
        request_id: 'update-rate-2',
        widget_id: outputOf(render).widget_id,
        patch: { progress_label: '45% complete' },
      },
      { correlation_id: 'corr-update-rate-2', capabilities: ['display/widget'] },
    );

    expect(first.denied).toBe(false);
    expect(second.denied).toBe(true);
    expect(second.receipt.policy_decision.reasons.join('\n')).toContain('Rate limit exceeded');
  });

  it('retries stale display bridge failures before returning a receipt', async () => {
    let bridgeCalls = 0;
    const adapter = new MetaGlassesDisplayORBAdapter({
      control_surface_policy_evaluator: allowControlSurfaceEvaluation,
      bridge: () => {
        bridgeCalls += 1;
        if (bridgeCalls === 1) {
          throw new Error('stale display session');
        }
        return { ok: true, status: 'rendered' };
      },
    });
    const binding = await bind(adapter, 'render_widget');

    const response = await adapter.invoke(
      binding.handle,
      { request_id: 'render-retry', state: STATE },
      { correlation_id: 'corr-retry', capabilities: ['display/widget'] },
    );

    expect(response.denied).toBe(false);
    expect(bridgeCalls).toBe(2);
    expect(response.receipt.policy_decision.outcome).toBe('permit');
  });

  it('opens circuit breakers after repeated display bridge failures', async () => {
    let bridgeCalls = 0;
    const adapter = new MetaGlassesDisplayORBAdapter({
      control_surface_policy_evaluator: allowControlSurfaceEvaluation,
      bridge: () => {
        bridgeCalls += 1;
        throw new Error('display bridge unavailable');
      },
      operation_policies: {
        render_widget: {
          authorization: { required_capabilities: ['display/widget'] },
          idempotency: { required: true, key_field: 'request_id' },
          retry: { max_attempts: 1, backoff_ms: 0 },
          circuit_breaker: { failure_threshold: 1, cooldown_ms: 60_000 },
        },
      },
    });
    const binding = await bind(adapter, 'render_widget');

    await expect(adapter.invoke(
      binding.handle,
      { request_id: 'render-breaker-1', state: STATE },
      { correlation_id: 'corr-breaker-1', capabilities: ['display/widget'] },
    )).rejects.toThrow('display bridge unavailable');

    const denied = await adapter.invoke(
      binding.handle,
      { request_id: 'render-breaker-2', state: STATE },
      { correlation_id: 'corr-breaker-2', capabilities: ['display/widget'] },
    );

    expect(denied.denied).toBe(true);
    expect(denied.receipt.policy_decision.reasons.join('\n')).toContain('Circuit breaker open');
    expect(bridgeCalls).toBe(1);
  });

  it('recovers widget streams and suppresses stale stream generations', async () => {
    const adapter = new MetaGlassesDisplayORBAdapter({
      control_surface_policy_evaluator: allowControlSurfaceEvaluation,
      stream_source: async function* () {
        yield { status: 'running', progress: 0.5 };
        yield { status: 'complete', progress: 1 };
      },
    });
    const descriptor = displayDescriptor();
    const render = await adapter.invoke(
      (await bind(adapter, 'render_widget', descriptor)).handle,
      { request_id: 'render-stream', state: STATE },
      { correlation_id: 'corr-render-stream', capabilities: ['display/widget'] },
    );
    const streamBinding = await bind(adapter, 'subscribe_updates', descriptor);

    const subscription = await adapter.stream(streamBinding.handle, {
      correlation_id: 'corr-stream',
      capabilities: ['display/widget'],
      metadata: { widget_id: outputOf(render).widget_id },
    });
    const iterator = subscription.events[Symbol.asyncIterator]();
    const first = await iterator.next();
    const recovery = await adapter.router.recover(
      streamBinding.handle,
      { correlation_id: 'corr-stream' },
      'display reconnect',
    );
    const staleSecond = await iterator.next();
    const recovered = await adapter.stream(streamBinding.handle, {
      correlation_id: 'corr-stream',
      capabilities: ['display/widget'],
      metadata: { widget_id: outputOf(render).widget_id },
    });
    const afterRecovery = await recovered.events[Symbol.asyncIterator]().next();

    expect(subscription.receipt.lifecycle.map(record => record.phase)).toEqual([
      'discover',
      'bind',
      'authorize',
      'stream',
    ]);
    expect(first.value.event).toEqual(
      expect.objectContaining({
        status: 'running',
        progress: 0.5,
        widget_id: outputOf(render).widget_id,
      }),
    );
    expect(first.value.binding_generation).toBe(0);
    expect(recovery.recovered).toBe(true);
    expect(staleSecond.done).toBe(true);
    expect(afterRecovery.value.binding_generation).toBe(1);
    expect(afterRecovery.value.recovery_lineage).toEqual([
      expect.objectContaining({
        generation: 1,
        previous_generation: 0,
        reason: 'display reconnect',
      }),
    ]);
    expect(adapter.getTaskMetadata().map(entry => entry.operation)).toContain('subscribe_updates');
  });

  it('exposes default operation policies for display confirmation and streaming limits', () => {
    const policies = createMetaGlassesDisplayORBOperationPolicies();

    expect(policies.clear_widget.authorization?.required_capabilities).toEqual(
      expect.arrayContaining(['display/widget.confirmed']),
    );
    expect(policies.activate.authorization?.required_capabilities).toEqual(
      expect.arrayContaining(['display/action.confirmed']),
    );
    expect(policies.subscribe_updates.rate_limit).toEqual({
      max_invocations: 2,
      window_ms: 1000,
    });
  });
});
