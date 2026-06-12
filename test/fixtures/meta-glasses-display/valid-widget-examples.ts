import {
  SWISSKNIFE_MCP_UI_PROFILE,
  SWISSKNIFE_MCP_UI_PROFILE_VERSION,
} from '../../../src/services/mcp-ui-profile';
import { createDefaultControlSurfaceContract } from '../../../src/services/control-surface-mediator';
import {
  META_GLASSES_DISPLAY_PROFILE,
  META_GLASSES_DISPLAY_PROFILE_PROPERTY,
  META_GLASSES_DISPLAY_PROFILE_VERSION,
  META_GLASSES_REQUIRED_METHODS,
  type MetaGlassesDisplayProfile,
  type MetaGlassesWidgetDescriptor,
} from '../../../src/services/meta-glasses-display-profile';

const OBJECT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
};

const DISPLAY_METHODS = [
  ...META_GLASSES_REQUIRED_METHODS,
  'status_summary',
  'subscribe_updates',
  'play_video',
] as const;

type ExampleName =
  | 'status'
  | 'task-progress'
  | 'confirmation'
  | 'notification-summary'
  | 'video-preview';

const EXAMPLE_TITLES: Record<ExampleName, string> = {
  status: 'HandsFree Status Widget',
  'task-progress': 'HandsFree Task Progress Widget',
  confirmation: 'HandsFree Confirmation Widget',
  'notification-summary': 'HandsFree Notification Summary Widget',
  'video-preview': 'HandsFree Video Preview Widget',
};

function method(name: string) {
  return {
    name,
    input_schema: OBJECT_SCHEMA,
    output_schema: OBJECT_SCHEMA,
  };
}

function operationContract(name: string) {
  return {
    method: name,
    input_schema: OBJECT_SCHEMA,
    output_schema: OBJECT_SCHEMA,
    ...(name === 'status_summary'
      ? {
        stream: {
          kind: 'telemetry' as const,
          correlation_id_field: 'correlation_id',
          event_schema: OBJECT_SCHEMA,
        },
      }
      : {}),
  };
}

function baseDescriptor(
  exampleName: ExampleName,
  displayProfile: MetaGlassesDisplayProfile,
): MetaGlassesWidgetDescriptor {
  const id = `handsfree-${exampleName}-display-widget`;

  const descriptor: MetaGlassesWidgetDescriptor = {
    name: id,
    namespace: 'org.handsfree.meta_glasses',
    version: '1.0.0',
    methods: DISPLAY_METHODS.map(method),
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
    semanticTags: ['meta-glasses', 'display-widget', exampleName],
    observability: { trace: true, provenance: true },
    interaction_patterns: { request_response: true, event_streams: true },
    meta: {
      profile: SWISSKNIFE_MCP_UI_PROFILE,
      profile_version: SWISSKNIFE_MCP_UI_PROFILE_VERSION,
      app_id: id,
      title: EXAMPLE_TITLES[exampleName],
      publisher: 'handsfree',
    },
    services: [
      {
        id: 'display-widget',
        interface_type: 'generic',
        transport: 'mcp-server',
        operations: [...DISPLAY_METHODS],
      },
    ],
    ui: {
      primary_template: 'dashboard',
      templates: [
        {
          kind: 'dashboard',
          title: EXAMPLE_TITLES[exampleName],
          operations: ['status_summary'],
          regions: [
            { id: 'summary', kind: 'status', operation: 'status_summary' },
          ],
        },
      ],
    },
    data_contracts: {
      operations: DISPLAY_METHODS.map(operationContract),
    },
    permissions: {
      default_deny: true,
      operations: Object.fromEntries(
        DISPLAY_METHODS.map(name => [name, ['display/widget']]),
      ),
    },
    state_model: {
      keys: ['title', 'summary', 'progress', 'selected_action', 'media_ref'],
      events: ['display.widget.updated'],
      replay: true,
    },
    [META_GLASSES_DISPLAY_PROFILE_PROPERTY]: displayProfile,
  };
  descriptor.control_surface_contract = createDefaultControlSurfaceContract(descriptor);

  return descriptor;
}

function baseProfile(
  exampleName: ExampleName,
  overrides: Partial<MetaGlassesDisplayProfile>,
): MetaGlassesDisplayProfile {
  const profile: MetaGlassesDisplayProfile = {
    profile: META_GLASSES_DISPLAY_PROFILE,
    profile_version: META_GLASSES_DISPLAY_PROFILE_VERSION,
    target: {
      display_class: 'meta-ray-ban-display',
      viewport: { width: 600, height: 600 },
      input: ['dpad', 'voice', 'mobile_action'],
      render_path: 'dat-native',
    },
    layout: {
      template: exampleName,
      regions: [
        {
          id: 'summary',
          kind: 'text',
          bounds: { x: 24, y: 24, width: 552, height: 300 },
          text: {
            source: 'state.summary',
            max_lines: 5,
            max_chars: 180,
            overflow: 'truncate',
          },
        },
        {
          id: 'primary-control',
          kind: 'action',
          bounds: { x: 24, y: 512, width: 552, height: 64 },
          action_id: 'primary',
        },
      ],
      focus_order: ['primary'],
    },
    actions: [
      {
        id: 'primary',
        method: 'activate',
        backend_action_id: `handsfree.widget.${exampleName}.primary`,
        label: 'Select',
      },
    ],
    constraints: {
      max_text_blocks: 4,
      max_actions: 3,
      requires_high_contrast: true,
      requires_focus_order: true,
      max_update_hz: 1,
      ttl_ms: 30000,
    },
    fallback: {
      when: [
        'dat_native_display_unavailable',
        'display_unsupported',
        'session_not_ready',
      ],
      render_path: 'mobile-card',
      message: 'Display unavailable. Showing the widget on phone.',
    },
  };

  return {
    ...profile,
    ...overrides,
  };
}

export const META_GLASSES_DISPLAY_WIDGET_EXAMPLES: Record<ExampleName, MetaGlassesWidgetDescriptor> = {
  status: baseDescriptor(
    'status',
    baseProfile('status', {
      layout: {
        template: 'status',
        regions: [
          {
            id: 'headline',
            kind: 'status',
            bounds: { x: 24, y: 24, width: 552, height: 120 },
            text: {
              source: 'state.title',
              max_lines: 2,
              max_chars: 80,
              overflow: 'truncate',
            },
          },
          {
            id: 'summary',
            kind: 'text',
            bounds: { x: 24, y: 168, width: 552, height: 280 },
            text: {
              source: 'state.summary',
              max_lines: 5,
              max_chars: 180,
              overflow: 'truncate',
            },
          },
          {
            id: 'dismiss-control',
            kind: 'action',
            bounds: { x: 24, y: 512, width: 552, height: 64 },
            action_id: 'dismiss',
          },
        ],
        focus_order: ['dismiss'],
      },
      actions: [
        {
          id: 'dismiss',
          method: 'activate',
          backend_action_id: 'handsfree.widget.status.dismiss',
          label: 'Dismiss',
        },
      ],
    }),
  ),
  'task-progress': baseDescriptor(
    'task-progress',
    baseProfile('task-progress', {
      layout: {
        template: 'task-progress',
        regions: [
          {
            id: 'summary',
            kind: 'text',
            bounds: { x: 24, y: 24, width: 552, height: 140 },
            text: {
              source: 'state.summary',
              max_lines: 3,
              max_chars: 140,
              overflow: 'truncate',
            },
          },
          {
            id: 'progress',
            kind: 'progress',
            bounds: { x: 24, y: 216, width: 552, height: 120 },
            text: {
              source: 'state.progress_label',
              max_lines: 1,
              max_chars: 40,
              overflow: 'truncate',
            },
          },
          {
            id: 'cancel-control',
            kind: 'action',
            bounds: { x: 24, y: 512, width: 552, height: 64 },
            action_id: 'cancel',
          },
        ],
        focus_order: ['cancel'],
      },
      actions: [
        {
          id: 'cancel',
          method: 'activate',
          backend_action_id: 'handsfree.widget.task_progress.cancel',
          label: 'Cancel',
        },
      ],
      constraints: {
        max_text_blocks: 4,
        max_actions: 2,
        requires_high_contrast: true,
        requires_focus_order: true,
        max_update_hz: 2,
        ttl_ms: 120000,
      },
    }),
  ),
  confirmation: baseDescriptor(
    'confirmation',
    baseProfile('confirmation', {
      layout: {
        template: 'confirmation',
        regions: [
          {
            id: 'prompt',
            kind: 'text',
            bounds: { x: 24, y: 32, width: 552, height: 280 },
            text: {
              source: 'state.prompt',
              max_lines: 5,
              max_chars: 160,
              overflow: 'wrap',
            },
          },
          {
            id: 'confirm-control',
            kind: 'action',
            bounds: { x: 24, y: 408, width: 264, height: 72 },
            action_id: 'confirm',
          },
          {
            id: 'deny-control',
            kind: 'action',
            bounds: { x: 312, y: 408, width: 264, height: 72 },
            action_id: 'deny',
          },
        ],
        focus_order: ['confirm', 'deny'],
      },
      actions: [
        {
          id: 'confirm',
          method: 'activate',
          backend_action_id: 'handsfree.widget.confirmation.confirm',
          label: 'Confirm',
        },
        {
          id: 'deny',
          method: 'activate',
          backend_action_id: 'handsfree.widget.confirmation.deny',
          label: 'Deny',
        },
      ],
    }),
  ),
  'notification-summary': baseDescriptor(
    'notification-summary',
    baseProfile('notification-summary', {
      layout: {
        template: 'notification-summary',
        regions: [
          {
            id: 'sender',
            kind: 'status',
            bounds: { x: 24, y: 24, width: 552, height: 96 },
            text: {
              source: 'state.sender',
              max_lines: 1,
              max_chars: 64,
              overflow: 'truncate',
            },
          },
          {
            id: 'summary',
            kind: 'list',
            bounds: { x: 24, y: 144, width: 552, height: 304 },
            text: {
              source: 'state.summary',
              max_lines: 5,
              max_chars: 180,
              overflow: 'truncate',
            },
          },
          {
            id: 'open-control',
            kind: 'action',
            bounds: { x: 24, y: 512, width: 552, height: 64 },
            action_id: 'open',
          },
        ],
        focus_order: ['open'],
      },
      actions: [
        {
          id: 'open',
          method: 'activate',
          backend_action_id: 'handsfree.widget.notification.open',
          label: 'Open',
        },
      ],
      fallback: {
        when: ['dat_native_display_unavailable', 'display_unsupported', 'session_not_ready'],
        render_path: 'notification',
        message: 'Display unavailable. Showing notification summary.',
      },
    }),
  ),
  'video-preview': baseDescriptor(
    'video-preview',
    baseProfile('video-preview', {
      layout: {
        template: 'video-preview',
        regions: [
          {
            id: 'caption',
            kind: 'text',
            bounds: { x: 24, y: 24, width: 552, height: 96 },
            text: {
              source: 'state.caption',
              max_lines: 2,
              max_chars: 96,
              overflow: 'truncate',
            },
          },
          {
            id: 'preview',
            kind: 'media',
            bounds: { x: 64, y: 144, width: 472, height: 300 },
            media: {
              type: 'video/mp4',
              transport: 'https',
              duration_ms: 30000,
              size_bytes: 5242880,
              fallback_text: 'Video preview unavailable',
            },
          },
          {
            id: 'play-control',
            kind: 'action',
            bounds: { x: 24, y: 512, width: 552, height: 64 },
            action_id: 'play',
          },
        ],
        focus_order: ['play'],
      },
      actions: [
        {
          id: 'play',
          method: 'play_video',
          backend_action_id: 'handsfree.widget.video.play',
          label: 'Play',
        },
      ],
      fallback: {
        when: ['dat_native_display_unavailable', 'display_unsupported', 'session_not_ready'],
        render_path: 'display-webapp',
        message: 'Display unavailable. Opening the video preview webapp.',
      },
    }),
  ),
};
