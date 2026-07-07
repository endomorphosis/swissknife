import {
  computeInterfaceCID,
  type InterfaceDescriptor,
  type MethodSignature,
} from '../../../src/services/mcp/mcp-idl';
import {
  MetaGlassesDisplayORBAdapter,
  type MetaGlassesDisplayBridge,
  type MetaGlassesDisplayMobileAction,
  type MetaGlassesDisplayORBOperationOutput,
} from '../../../src/services/glasses/meta-glasses-display-orb-adapter';
import {
  META_GLASSES_DISPLAY_PROFILE,
  META_GLASSES_DISPLAY_PROFILE_VERSION,
  META_GLASSES_DISPLAY_PROFILE_PROPERTY,
  META_GLASSES_DISPLAY_VIEWPORT,
  type MetaGlassesWidgetDescriptor,
} from '../../../src/services/glasses/meta-glasses-display-profile';
import {
  compileMetaGlassesWidgetManifest,
  type MetaGlassesWidgetManifest,
} from '../../../src/services/glasses/meta-glasses-widget-compiler';
import {
  renderMetaGlassesWebappPreview,
  type MetaGlassesWebappPreview,
} from '../../../src/services/glasses/meta-glasses-webapp-renderer';
import {
  SWISSKNIFE_MCP_UI_PROFILE,
  SWISSKNIFE_MCP_UI_PROFILE_VERSION,
} from '../../../src/services/mcp/mcp-ui-profile';

export interface SwissKnifeDesktopAppSnapshot {
  appId: string;
  title: string;
  iconLabel: string;
  windowTitle: string;
  text: string;
  buttonCount: number;
  inputCount: number;
  canvasCount: number;
  interactiveCount: number;
  hasLoadError: boolean;
}

export interface MetaGlassesDesktopAppTemplateResult {
  appId: string;
  interfaceCid: string;
  widgetCid: string;
  receiptCid: string;
  manifest: MetaGlassesWidgetManifest;
  preview: MetaGlassesWebappPreview;
  mobileActions: MetaGlassesDisplayMobileAction[];
}

const DISPLAY_METHODS = [
  'render_widget',
  'update_widget',
  'clear_widget',
  'focus_next',
  'focus_previous',
  'activate',
  'reset_session',
  'subscribe_updates',
  'status_summary',
] as const;

const OBJECT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
};

export function buildMetaGlassesDesktopAppDescriptor(
  app: SwissKnifeDesktopAppSnapshot,
): MetaGlassesWidgetDescriptor {
  const descriptorName = safeDescriptorName(app.appId);
  const methods: MethodSignature[] = DISPLAY_METHODS.map(name => ({
    name,
    input_schema: OBJECT_SCHEMA,
    output_schema: OBJECT_SCHEMA,
  }));

  return {
    name: descriptorName,
    namespace: 'org.swissknife.virtual_os.meta_glasses',
    version: '1.0.0',
    methods,
    errors: [
      { name: 'DisplayUnavailable' },
      { name: 'ActionDenied' },
      { name: 'SessionNotReady' },
    ],
    requires: [],
    compatibility: {
      compatible_with: [],
      supersedes: [],
    },
    semanticTags: ['swissknife', 'virtual-os', 'meta-glasses', app.appId],
    observability: {
      trace: true,
      provenance: true,
    },
    interaction_patterns: {
      request_response: true,
      event_streams: true,
    },
    meta: {
      profile: SWISSKNIFE_MCP_UI_PROFILE,
      profile_version: SWISSKNIFE_MCP_UI_PROFILE_VERSION,
      app_id: app.appId,
      title: app.windowTitle || app.title,
      description: `Meta display template for SwissKnife ${app.title}.`,
      publisher: 'swissknife',
      icon: app.iconLabel || 'SK',
    },
    services: [
      {
        id: 'display-widget',
        interface_type: 'generic',
        transport: 'local',
        operations: [...DISPLAY_METHODS],
      },
    ],
    ui: {
      primary_template: 'dashboard',
      templates: [
        {
          kind: 'dashboard',
          title: app.windowTitle || app.title,
          operations: ['status_summary', 'subscribe_updates'],
          regions: [
            {
              id: 'summary',
              kind: 'status',
              operation: 'status_summary',
            },
          ],
        },
      ],
    },
    data_contracts: {
      operations: DISPLAY_METHODS.map(method => {
        const operation = {
          method,
          title: titleize(method),
          input_schema: OBJECT_SCHEMA,
          output_schema: OBJECT_SCHEMA,
          idempotent: ['render_widget', 'update_widget', 'clear_widget', 'reset_session'].includes(method),
        } as {
          method: string;
          title: string;
          input_schema: typeof OBJECT_SCHEMA;
          output_schema: typeof OBJECT_SCHEMA;
          idempotent: boolean;
          stream?: {
            kind: 'events';
            correlation_id_field: string;
            event_schema: typeof OBJECT_SCHEMA;
          };
        };

        if (method === 'subscribe_updates') {
          operation.stream = {
            kind: 'events',
            correlation_id_field: 'correlation_id',
            event_schema: OBJECT_SCHEMA,
          };
        }

        return operation;
      }),
    },
    permissions: {
      default_deny: true,
      operations: Object.fromEntries(DISPLAY_METHODS.map(method => [method, ['display/widget']])),
    },
    state_model: {
      keys: [
        'title',
        'summary',
        'status',
        'interactive_count',
        'selected_action',
        'updated_at',
      ],
      events: [`swissknife.${app.appId}.meta_display`],
      replay: true,
    },
    [META_GLASSES_DISPLAY_PROFILE_PROPERTY]: {
      profile: META_GLASSES_DISPLAY_PROFILE,
      profile_version: META_GLASSES_DISPLAY_PROFILE_VERSION,
      target: {
        display_class: 'meta-ray-ban-display',
        viewport: META_GLASSES_DISPLAY_VIEWPORT,
        input: ['dpad', 'gesture', 'voice', 'mobile_action'],
        render_path: 'display-webapp',
      },
      layout: {
        template: 'status',
        regions: [
          {
            id: 'title',
            kind: 'text',
            bounds: { x: 24, y: 24, width: 552, height: 72 },
            text: {
              source: 'state.title',
              max_lines: 2,
              max_chars: 72,
              overflow: 'truncate',
            },
          },
          {
            id: 'summary',
            kind: 'status',
            bounds: { x: 24, y: 112, width: 552, height: 248 },
            text: {
              source: 'state.summary',
              max_lines: 6,
              max_chars: 220,
              overflow: 'wrap',
            },
          },
          {
            id: 'status',
            kind: 'status',
            bounds: { x: 24, y: 384, width: 552, height: 56 },
            text: {
              source: 'state.status',
              max_lines: 1,
              max_chars: 72,
              overflow: 'truncate',
            },
          },
          {
            id: 'open-control',
            kind: 'action',
            bounds: { x: 24, y: 464, width: 264, height: 80 },
            action_id: 'open',
          },
          {
            id: 'dismiss-control',
            kind: 'action',
            bounds: { x: 312, y: 464, width: 264, height: 80 },
            action_id: 'dismiss',
          },
        ],
        focus_order: ['open', 'dismiss'],
      },
      constraints: {
        max_text_blocks: 3,
        max_actions: 2,
        requires_high_contrast: true,
        requires_focus_order: true,
        max_update_hz: 2,
        ttl_ms: 45000,
      },
      fallback: {
        when: [
          'dat_native_display_unavailable',
          'display_unsupported',
          'session_not_ready',
        ],
        render_path: 'mobile-card',
        message: 'Meta display unavailable. Showing SwissKnife app summary on mobile.',
      },
      actions: [
        {
          id: 'open',
          method: 'activate',
          backend_action_id: `swissknife.${app.appId}.open`,
          label: 'Open',
          focusable: true,
          service_id: 'display-widget',
          state_keys: ['selected_action'],
        },
        {
          id: 'dismiss',
          method: 'clear_widget',
          backend_action_id: `swissknife.${app.appId}.dismiss`,
          label: 'Dismiss',
          focusable: true,
          service_id: 'display-widget',
          state_keys: ['selected_action'],
        },
      ],
    },
  };
}

export async function renderDesktopAppThroughMetaGlassesOrb(
  app: SwissKnifeDesktopAppSnapshot,
): Promise<MetaGlassesDesktopAppTemplateResult> {
  const descriptor = buildMetaGlassesDesktopAppDescriptor(app);
  const interfaceCid = computeInterfaceCID(descriptor as InterfaceDescriptor);
  const state = buildMetaGlassesState(app);
  const manifest = compileMetaGlassesWidgetManifest(descriptor, {
    state,
    interface_cid: interfaceCid,
    operation: 'render_widget',
    widget_id: `swissknife.${app.appId}.meta-display`,
  });
  const preview = renderMetaGlassesWebappPreview(manifest, {
    deployment_url: `https://example.com/swissknife/meta-glasses/${app.appId}`,
    title: `${app.title} Meta Display`,
  });
  const mobileActions: MetaGlassesDisplayMobileAction[] = [];
  const bridge: MetaGlassesDisplayBridge = ({ mobile_action }) => {
    mobileActions.push(mobile_action);
    return {
      ok: true,
      status: 'rendered',
      metadata: {
        app_id: app.appId,
        template: 'status',
      },
    };
  };
  const adapter = new MetaGlassesDisplayORBAdapter({ bridge });
  adapter.router.setControlSurfacePolicyEvaluator(() => ({
    outcome: 'allow',
    reasons: ['Meta glasses Playwright launch gate permits deterministic display-widget render.'],
    metadata: {
      launch_gate: 'meta-glasses-virtual-os',
    },
  }));
  const binding = await adapter.bind({
    descriptor,
    operation: 'render_widget',
    interface_cid: interfaceCid,
  });
  const response = await adapter.invoke(
    binding.handle,
    {
      request_id: `render-${app.appId}`,
      idempotency_key: `render-${app.appId}`,
      state,
      widget_id: manifest.widget_id,
    },
    {
      correlation_id: `meta-glasses-${app.appId}`,
      capabilities: ['display/widget'],
    },
  );
  const output = response.output as MetaGlassesDisplayORBOperationOutput;

  return {
    appId: app.appId,
    interfaceCid,
    widgetCid: output.widget_cid || manifest.widget_cid,
    receiptCid: response.receipt.receipt_cid,
    manifest: output.manifest || manifest,
    preview,
    mobileActions,
  };
}

function buildMetaGlassesState(app: SwissKnifeDesktopAppSnapshot): Record<string, unknown> {
  return {
    title: app.windowTitle || app.title,
    summary: summarizeWindowText(app.text),
    status: `${app.interactiveCount} controls, ${app.canvasCount} canvases`,
    interactive_count: app.interactiveCount,
    selected_action: null,
    updated_at: new Date(0).toISOString(),
  };
}

function summarizeWindowText(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'SwissKnife app opened, but no readable text was available in the desktop window.';
  }
  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
}

function safeDescriptorName(value: string): string {
  return `swissknife-${value}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function titleize(value: string): string {
  return value
    .split('_')
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}
