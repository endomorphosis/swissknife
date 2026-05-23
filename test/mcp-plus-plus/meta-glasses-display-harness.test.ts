import { readFileSync } from 'fs';
import { join } from 'path';
import {
  LocalMCPInterfaceRegistryBackend,
  MCPInterfaceDiscoveryRegistry,
} from '../../src/services/mcp-interface-registry';
import {
  MetaGlassesDisplayORBAdapter,
  createMetaGlassesDisplayORBDescriptorSource,
  type MetaGlassesDisplayBridge,
  type MetaGlassesDisplayORBOperation,
  type MetaGlassesDisplayORBOperationOutput,
} from '../../src/services/meta-glasses-display-orb-adapter';
import {
  compileMetaGlassesWidgetManifest,
} from '../../src/services/meta-glasses-widget-compiler';
import type { MetaGlassesWidgetDescriptor } from '../../src/services/meta-glasses-display-profile';

const FIXTURE_PATH = join(
  __dirname,
  '../fixtures/meta-glasses-display/valid-task-progress-widget.json',
);

const STATE = {
  title: 'Sync dataset',
  summary: 'Pinning and indexing a research collection for offline access.',
  progress: 0.42,
  progress_label: '42% complete',
  status: 'running',
  selected_action: null,
  updated_at: '2026-05-22T12:00:00.000Z',
};

const DISPLAY_CAPABILITIES = [
  'display/widget',
  'display/widget.confirmed',
  'display/action.confirmed',
];

const OBJECT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
};

function loadDescriptor(): MetaGlassesWidgetDescriptor {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as MetaGlassesWidgetDescriptor;
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

function bridgeStatus(operation: MetaGlassesDisplayORBOperation): string {
  if (operation === 'render_widget') return 'rendered';
  if (operation === 'update_widget') return 'updated';
  if (operation === 'clear_widget') return 'cleared';
  if (operation === 'focus_next' || operation === 'focus_previous') return 'focused';
  if (operation === 'activate') return 'activated';
  if (operation === 'reset_session') return 'reset';
  if (operation === 'play_video') return 'video';
  if (operation === 'subscribe_updates') return 'subscribed';
  return 'queued';
}

function outputOf(response: { output: unknown }): MetaGlassesDisplayORBOperationOutput {
  return response.output as MetaGlassesDisplayORBOperationOutput;
}

describe('Meta glasses hardware-free descriptor-to-mobile-render harness', () => {
  it('publishes, compiles, discovers, binds, invokes every widget operation, and records receipts', async () => {
    const descriptor = displayDescriptor();
    const registry = new MCPInterfaceDiscoveryRegistry(new LocalMCPInterfaceRegistryBackend());
    const interfaceCid = registry.publish(descriptor);
    const widgetId = 'task-progress-active';
    const bridgeEvents: Array<{
      operation: MetaGlassesDisplayORBOperation;
      action: string;
      widget_id: string;
      widget_cid?: string;
      update_count: number;
      receipt_cid?: string;
      correlation_id?: string;
      bridge_status: string;
    }> = [];
    const diagnostics = {
      active_widget_id: null as string | null,
      widget_cid: null as string | null,
      display_last_action: null as string | null,
      display_last_status: null as string | null,
      display_render_path: null as string | null,
      display_last_error: null as string | null,
      update_count: 0,
      focus_index: 0,
      session_generation: 0,
      activated_action_id: null as string | null,
      cleared: false,
    };
    const bridge: MetaGlassesDisplayBridge = ({ operation, mobile_action, session }) => {
      const status = bridgeStatus(operation);
      diagnostics.active_widget_id = operation === 'clear_widget' ? null : mobile_action.widget_id;
      diagnostics.widget_cid = mobile_action.widget_cid ?? session.widget_cid ?? null;
      diagnostics.display_last_action = mobile_action.type;
      diagnostics.display_last_status = status;
      diagnostics.display_render_path = 'native-dat';
      diagnostics.display_last_error = null;
      diagnostics.update_count = session.update_count;
      diagnostics.focus_index = session.focus_index;
      diagnostics.session_generation = session.session_generation;
      diagnostics.activated_action_id = mobile_action.activated_action?.id ?? null;
      diagnostics.cleared = operation === 'clear_widget';
      bridgeEvents.push({
        operation,
        action: mobile_action.type,
        widget_id: mobile_action.widget_id,
        widget_cid: mobile_action.widget_cid,
        update_count: session.update_count,
        correlation_id: mobile_action.correlation_id,
        bridge_status: status,
      });
      return {
        ok: true,
        status,
        metadata: {
          ...diagnostics,
          mobile_action_type: mobile_action.type,
          correlation_id: mobile_action.correlation_id,
        },
      };
    };
    const adapter = new MetaGlassesDisplayORBAdapter({ bridge });
    const source = createMetaGlassesDisplayORBDescriptorSource(descriptor, { interface_cid: interfaceCid });

    const discoveredRegistryEntries = await registry.discover({ ui_only: true });
    const compiledManifest = compileMetaGlassesWidgetManifest(descriptor, {
      interface_cid: interfaceCid,
      widget_id: widgetId,
      state: STATE,
    });
    const discoveredCapabilities = await adapter.router.discover({
      descriptors: [source],
      operation: 'render_widget',
    });

    expect(discoveredRegistryEntries.map(entry => entry.cid)).toContain(interfaceCid);
    expect(compiledManifest.interface_cid).toBe(interfaceCid);
    expect(compiledManifest.widget_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(discoveredCapabilities).toHaveLength(1);
    expect(discoveredCapabilities[0].lifecycle.map(record => record.phase)).toEqual(['discover']);

    const renderBinding = await adapter.bind({
      descriptor,
      interface_cid: interfaceCid,
      operation: 'render_widget',
    });
    const render = await adapter.invoke(
      renderBinding.handle,
      { request_id: 'render-1', widget_id: widgetId, state: STATE },
      { correlation_id: 'corr-render', capabilities: ['display/widget'] },
    );
    const renderOutput = render.output as Record<string, any>;

    const updateBinding = await adapter.bind({
      descriptor,
      interface_cid: interfaceCid,
      operation: 'update_widget',
    });
    const update = await adapter.invoke(
      updateBinding.handle,
      {
        request_id: 'update-1',
        widget_id: widgetId,
        patch: { progress: 0.43, progress_label: '43% complete' },
      },
      { correlation_id: 'corr-update', capabilities: ['display/widget'] },
    );

    const focusNextBinding = await adapter.bind({
      descriptor,
      interface_cid: interfaceCid,
      operation: 'focus_next',
    });
    const focusNext = await adapter.invoke(
      focusNextBinding.handle,
      { widget_id: widgetId },
      { correlation_id: 'corr-focus-next', capabilities: ['display/widget'] },
    );

    const focusPreviousBinding = await adapter.bind({
      descriptor,
      interface_cid: interfaceCid,
      operation: 'focus_previous',
    });
    const focusPrevious = await adapter.invoke(
      focusPreviousBinding.handle,
      { widget_id: widgetId },
      { correlation_id: 'corr-focus-previous', capabilities: ['display/widget'] },
    );

    const activateBinding = await adapter.bind({
      descriptor,
      interface_cid: interfaceCid,
      operation: 'activate',
    });
    const activate = await adapter.invoke(
      activateBinding.handle,
      { widget_id: widgetId },
      { correlation_id: 'corr-activate', capabilities: DISPLAY_CAPABILITIES },
    );

    const videoBinding = await adapter.bind({
      descriptor,
      interface_cid: interfaceCid,
      operation: 'play_video',
    });
    const video = await adapter.invoke(
      videoBinding.handle,
      {
        request_id: 'video-1',
        widget_id: widgetId,
        video: {
          uri: 'https://example.test/clip.mp4',
          content_type: 'video/mp4',
          duration_ms: 1200,
          fallback_text: 'Video preview unavailable',
        },
      },
      { correlation_id: 'corr-video', capabilities: ['display/widget'] },
    );

    const subscribeBinding = await adapter.bind({
      descriptor,
      interface_cid: interfaceCid,
      operation: 'subscribe_updates',
    });
    const subscribe = await adapter.invoke(
      subscribeBinding.handle,
      { widget_id: widgetId },
      { correlation_id: 'corr-subscribe', capabilities: ['display/widget'] },
    );

    const streamBinding = await adapter.bind({
      descriptor,
      interface_cid: interfaceCid,
      operation: 'subscribe_updates',
    });
    const subscription = await adapter.stream(streamBinding.handle, {
      correlation_id: 'corr-stream',
      capabilities: ['display/widget'],
      metadata: { widget_id: widgetId },
    });
    const streamEvent = await subscription.events[Symbol.asyncIterator]().next();

    const resetBinding = await adapter.bind({
      descriptor,
      interface_cid: interfaceCid,
      operation: 'reset_session',
    });
    const reset = await adapter.invoke(
      resetBinding.handle,
      { widget_id: widgetId },
      { correlation_id: 'corr-reset', capabilities: DISPLAY_CAPABILITIES },
    );

    const finalClearBinding = await adapter.bind({
      descriptor,
      interface_cid: interfaceCid,
      operation: 'clear_widget',
    });
    const clear = await adapter.invoke(
      finalClearBinding.handle,
      { widget_id: widgetId },
      { correlation_id: 'corr-clear', capabilities: DISPLAY_CAPABILITIES },
    );

    expect(render.denied).toBe(false);
    expect(render.receipt.lifecycle.map(record => record.phase)).toEqual([
      'discover',
      'bind',
      'authorize',
      'invoke',
    ]);
    expect(renderOutput.mobile_action).toMatchObject({
      type: 'mobile_render_display_widget',
      widget_id: widgetId,
      interface_cid: interfaceCid,
      widget_cid: compiledManifest.widget_cid,
    });
    expect(renderOutput.manifest).toMatchObject({
      widget_id: widgetId,
      widget_cid: compiledManifest.widget_cid,
      operation: 'render_widget',
    });
    expect((update.output as Record<string, any>).mobile_action).toMatchObject({
      type: 'mobile_update_display_widget',
      patch: { progress: 0.43, progress_label: '43% complete' },
    });
    expect((clear.output as Record<string, any>).mobile_action).toMatchObject({
      type: 'mobile_clear_display_widget',
      widget_id: widgetId,
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
    expect(outputOf(activate).activated_action).toMatchObject({
      id: 'pause',
      backend_action_id: 'handsfree.task.pause',
    });
    expect(outputOf(video).mobile_action).toMatchObject({
      type: 'mobile_play_display_widget_video',
      video: {
        uri: 'https://example.test/clip.mp4',
        content_type: 'video/mp4',
      },
    });
    expect(outputOf(subscribe).mobile_action).toMatchObject({
      type: 'mobile_subscribe_display_widget_updates',
      operation: 'subscribe_updates',
    });
    expect(streamEvent.value).toMatchObject({
      correlation_id: 'corr-stream',
      interface_cid: interfaceCid,
      operation: 'subscribe_updates',
      event: {
        type: 'display_widget_snapshot',
        widget_id: widgetId,
        widget_cid: outputOf(video).widget_cid,
        update_count: 1,
      },
      event_cid: expect.stringMatching(/^sha256:/),
      generation_key: `${interfaceCid}:${widgetId}:updates`,
      binding_generation: 0,
    });
    expect(subscription.receipt).toMatchObject({
      correlation_id: 'corr-stream',
      operation: 'subscribe_updates',
      policy_decision: expect.objectContaining({ outcome: 'permit' }),
    });
    expect(outputOf(reset)).toMatchObject({
      operation: 'reset_session',
      session_generation: 1,
    });
    expect(bridgeEvents.map(event => event.operation)).toEqual([
      'render_widget',
      'update_widget',
      'focus_next',
      'focus_previous',
      'activate',
      'play_video',
      'subscribe_updates',
      'reset_session',
      'clear_widget',
    ]);
    expect(bridgeEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'play_video',
        action: 'mobile_play_display_widget_video',
        correlation_id: 'corr-video',
        bridge_status: 'video',
      }),
      expect.objectContaining({
        operation: 'subscribe_updates',
        action: 'mobile_subscribe_display_widget_updates',
        correlation_id: 'corr-subscribe',
        bridge_status: 'subscribed',
      }),
    ]));
    expect(diagnostics).toMatchObject({
      active_widget_id: null,
      display_last_action: 'mobile_clear_display_widget',
      display_last_status: 'cleared',
      update_count: 1,
      session_generation: 1,
      cleared: true,
    });
    expect(adapter.getTaskMetadata()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: 'render_widget',
          correlation_id: 'corr-render',
          receipt_cid: render.receipt.receipt_cid,
          widget_cid: compiledManifest.widget_cid,
          denied: false,
        }),
        expect.objectContaining({
          operation: 'update_widget',
          correlation_id: 'corr-update',
          receipt_cid: update.receipt.receipt_cid,
          denied: false,
        }),
        expect.objectContaining({
          operation: 'clear_widget',
          correlation_id: 'corr-clear',
          receipt_cid: clear.receipt.receipt_cid,
          denied: false,
        }),
        expect.objectContaining({
          operation: 'play_video',
          correlation_id: 'corr-video',
          receipt_cid: video.receipt.receipt_cid,
          denied: false,
        }),
        expect.objectContaining({
          operation: 'subscribe_updates',
          correlation_id: 'corr-stream',
          receipt_cid: subscription.receipt.receipt_cid,
          denied: false,
        }),
      ]),
    );
    expect(adapter.getSessionSnapshot(widgetId, interfaceCid)).toMatchObject({
      widget_id: widgetId,
      interface_cid: interfaceCid,
      cleared: true,
      update_count: 1,
      session_generation: 1,
      receipt_cids: [
        render.receipt.receipt_cid,
        update.receipt.receipt_cid,
        focusNext.receipt.receipt_cid,
        focusPrevious.receipt.receipt_cid,
        activate.receipt.receipt_cid,
        video.receipt.receipt_cid,
        subscribe.receipt.receipt_cid,
        reset.receipt.receipt_cid,
        clear.receipt.receipt_cid,
      ],
      last_bridge_result: {
        ok: true,
        status: 'cleared',
      },
    });
  });

  it('records policy denial receipts without calling the mobile bridge', async () => {
    const descriptor = displayDescriptor();
    const adapter = new MetaGlassesDisplayORBAdapter({
      bridge: () => {
        throw new Error('bridge should not be called for denied operations');
      },
    });
    const binding = await adapter.bind({
      descriptor,
      operation: 'render_widget',
    });

    const denied = await adapter.invoke(
      binding.handle,
      { request_id: 'render-denied', widget_id: 'task-progress-active', state: STATE },
      { correlation_id: 'corr-denied', capabilities: [] },
    );

    expect(denied).toMatchObject({
      denied: true,
      receipt: {
        correlation_id: 'corr-denied',
        operation: 'render_widget',
        policy_decision: {
          outcome: 'deny',
          reasons: ['Missing capability: display/widget'],
        },
      },
      output: {
        error: 'ORB_INVOCATION_DENIED',
        reasons: ['Missing capability: display/widget'],
      },
    });
    expect(denied.receipt.receipt_cid).toMatch(/^sha256:/);
    expect(denied.receipt.lifecycle.map(record => record.phase)).toEqual([
      'discover',
      'bind',
      'authorize',
    ]);
    expect(adapter.getTaskMetadata()).toEqual([
      expect.objectContaining({
        operation: 'render_widget',
        correlation_id: 'corr-denied',
        receipt_cid: denied.receipt.receipt_cid,
        policy_outcome: 'deny',
        denied: true,
      }),
    ]);
  });

  it('preserves native-display-unavailable fallback diagnostics in the render receipt output', async () => {
    const descriptor = displayDescriptor();
    const adapter = new MetaGlassesDisplayORBAdapter({
      bridge: ({ mobile_action, session }) => ({
        ok: true,
        status: 'display_unavailable',
        native_display_unavailable: true,
        fallback_path: mobile_action.fallback?.render_path,
        metadata: {
          reason: 'dat_native_display_unavailable',
          displayLastError: 'dat_native_display_unavailable',
          displayRenderPath: mobile_action.fallback?.render_path,
          widget_id: session.widget_id,
          correlation_id: mobile_action.correlation_id,
        },
      }),
    });
    const binding = await adapter.bind({
      descriptor,
      operation: 'render_widget',
    });

    const render = await adapter.invoke(
      binding.handle,
      { request_id: 'render-fallback', widget_id: 'task-progress-active', state: STATE },
      { correlation_id: 'corr-fallback', capabilities: ['display/widget'] },
    );
    const output = outputOf(render);

    expect(render.denied).toBe(false);
    expect(output.mobile_action).toMatchObject({
      type: 'mobile_render_display_widget',
      fallback: {
        render_path: 'mobile-card',
        message: 'Display unavailable. Showing task progress on phone.',
      },
    });
    expect(output.bridge_result).toMatchObject({
      ok: true,
      status: 'display_unavailable',
      native_display_unavailable: true,
      fallback_path: 'mobile-card',
      metadata: {
        reason: 'dat_native_display_unavailable',
        displayLastError: 'dat_native_display_unavailable',
        correlation_id: 'corr-fallback',
      },
    });
    expect(adapter.getSessionSnapshot('task-progress-active')).toMatchObject({
      last_bridge_result: {
        status: 'display_unavailable',
        metadata: {
          reason: 'dat_native_display_unavailable',
        },
      },
      receipt_cids: [render.receipt.receipt_cid],
    });
  });

  it('records lifecycle error metadata when bridge retries are exhausted', async () => {
    const descriptor = displayDescriptor();
    const adapter = new MetaGlassesDisplayORBAdapter({
      bridge: () => {
        throw new Error('display lifecycle failed before content send');
      },
      operation_policies: {
        render_widget: {
          authorization: { required_capabilities: ['display/widget'] },
          idempotency: { required: true, key_field: 'request_id' },
          retry: { max_attempts: 1, backoff_ms: 0 },
          circuit_breaker: { failure_threshold: 2, cooldown_ms: 30_000 },
        },
      },
    });
    const binding = await adapter.bind({
      descriptor,
      operation: 'render_widget',
    });

    await expect(adapter.invoke(
      binding.handle,
      { request_id: 'render-lifecycle-error', widget_id: 'task-progress-active', state: STATE },
      { correlation_id: 'corr-lifecycle-error', capabilities: ['display/widget'] },
    )).rejects.toThrow('display lifecycle failed before content send');

    expect(binding.lifecycle).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: 'discover', status: 'ok' }),
      expect.objectContaining({ phase: 'bind', status: 'ok' }),
      expect.objectContaining({ phase: 'authorize', status: 'ok' }),
      expect.objectContaining({
        phase: 'invoke',
        status: 'error',
        message: 'display lifecycle failed before content send',
      }),
    ]));
    expect(adapter.getTaskMetadata()).toEqual([]);
  });
});
