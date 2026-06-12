import {
  SWISSKNIFE_MCP_UI_PROFILE,
  SWISSKNIFE_MCP_UI_PROFILE_VERSION,
  validateMCPUIProfileDescriptor,
} from '../../src/services/mcp-ui-profile';
import { createDefaultControlSurfaceContract } from '../../src/services/control-surface-mediator';
import {
  META_GLASSES_DISPLAY_ERROR_CODES,
  META_GLASSES_DISPLAY_PROFILE,
  META_GLASSES_DISPLAY_PROFILE_PROPERTY,
  META_GLASSES_DISPLAY_PROFILE_VERSION,
  META_GLASSES_REQUIRED_METHODS,
  assertMetaGlassesWidgetDescriptor,
  validateMetaGlassesDisplayProfile,
  validateMetaGlassesWidgetDescriptor,
  type MetaGlassesDisplayProfile,
  type MetaGlassesWidgetDescriptor,
} from '../../src/services/meta-glasses-display-profile';
import { META_GLASSES_DISPLAY_WIDGET_EXAMPLES } from '../fixtures/meta-glasses-display/valid-widget-examples';

const OBJECT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
};

const STATUS_EVENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    correlation_id: { type: 'string' },
    status: { type: 'string' },
    progress: { type: 'number' },
  },
  required: ['correlation_id', 'status'],
};

const METHOD_NAMES = [
  ...META_GLASSES_REQUIRED_METHODS,
  'status_summary',
] as const;

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
          event_schema: STATUS_EVENT_SCHEMA,
        },
      }
      : {}),
  };
}

function permissions() {
  return Object.fromEntries(
    METHOD_NAMES.map(name => [name, ['display/widget']]),
  );
}

function baseDisplayProfile(
  overrides: Partial<MetaGlassesDisplayProfile> = {},
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
      template: 'status',
      regions: [
        {
          id: 'summary',
          kind: 'text',
          bounds: { x: 24, y: 24, width: 552, height: 180 },
          text: {
            source: 'state.summary',
            max_lines: 4,
            max_chars: 160,
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
        backend_action_id: 'handsfree.widget.dismiss',
        label: 'Dismiss',
      },
    ],
    constraints: {
      max_text_blocks: 4,
      max_actions: 2,
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
      message: 'Display unavailable. Showing task status on phone.',
    },
  };

  return {
    ...profile,
    ...overrides,
  };
}

function displayWidgetDescriptor(
  displayOverrides: Partial<MetaGlassesDisplayProfile> = {},
  descriptorOverrides: Partial<MetaGlassesWidgetDescriptor> = {},
): MetaGlassesWidgetDescriptor {
  const descriptor: MetaGlassesWidgetDescriptor = {
    name: 'handsfree-task-status-widget',
    namespace: 'org.handsfree.meta_glasses',
    version: '1.0.0',
    methods: METHOD_NAMES.map(method),
    errors: [{ name: 'DisplayUnavailable' }, { name: 'ActionDenied' }],
    requires: [],
    compatibility: {
      compatible_with: [],
      supersedes: [],
    },
    semanticTags: ['meta-glasses', 'display-widget'],
    observability: { trace: true, provenance: true },
    interaction_patterns: { request_response: true, event_streams: true },
    meta: {
      profile: SWISSKNIFE_MCP_UI_PROFILE,
      profile_version: SWISSKNIFE_MCP_UI_PROFILE_VERSION,
      app_id: 'handsfree-task-status-widget',
      title: 'HandsFree Task Status Widget',
      publisher: 'handsfree',
    },
    services: [
      {
        id: 'display-widget',
        interface_type: 'generic',
        transport: 'mcp-server',
        operations: [...METHOD_NAMES],
      },
    ],
    ui: {
      primary_template: 'dashboard',
      templates: [
        {
          kind: 'dashboard',
          operations: ['status_summary'],
          regions: [
            { id: 'summary', kind: 'status', operation: 'status_summary' },
          ],
        },
      ],
    },
    data_contracts: {
      operations: METHOD_NAMES.map(operationContract),
    },
    permissions: {
      default_deny: true,
      operations: permissions(),
    },
    state_model: {
      keys: ['summary', 'selected_action', 'progress'],
      events: ['display.status.telemetry'],
      replay: true,
    },
    [META_GLASSES_DISPLAY_PROFILE_PROPERTY]: baseDisplayProfile(displayOverrides),
  };

  const withOverrides = {
    ...descriptor,
    ...descriptorOverrides,
  };
  if (withOverrides.control_surface_contract === undefined) {
    withOverrides.control_surface_contract = createDefaultControlSurfaceContract(withOverrides);
  }

  return withOverrides;
}

describe('Meta glasses display profile conformance', () => {
  it('accepts a descriptor that is both a SwissKnife MCP UI profile and a display widget profile', () => {
    const descriptor = displayWidgetDescriptor();

    expect(validateMCPUIProfileDescriptor(descriptor).conformant).toBe(true);

    const displayResult = validateMetaGlassesWidgetDescriptor(descriptor);
    expect(displayResult.conformant).toBe(true);
    expect(displayResult.errors).toEqual([]);
    expect(displayResult.warnings).toEqual([]);
    expect(() => assertMetaGlassesWidgetDescriptor(descriptor)).not.toThrow();
  });

  it.each(Object.entries(META_GLASSES_DISPLAY_WIDGET_EXAMPLES))(
    'accepts the %s widget descriptor example',
    (_name, descriptor) => {
      expect(validateMCPUIProfileDescriptor(descriptor).conformant).toBe(true);
      expect(validateMetaGlassesWidgetDescriptor(descriptor).conformant).toBe(true);
    },
  );

  it('validates a display profile independently when MCP-IDL methods are provided', () => {
    const result = validateMetaGlassesDisplayProfile(
      baseDisplayProfile(),
      new Set(METHOD_NAMES),
    );

    expect(result.conformant).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('emits stable error codes for unsafe display contracts', () => {
    const descriptor = displayWidgetDescriptor();
    const profile = descriptor[META_GLASSES_DISPLAY_PROFILE_PROPERTY];
    const unsafe: Partial<MetaGlassesWidgetDescriptor> = {
      ...descriptor,
      methods: descriptor.methods.filter(
        entry => entry.name !== 'clear_widget' && entry.name !== 'reset_session',
      ),
      [META_GLASSES_DISPLAY_PROFILE_PROPERTY]: {
        ...profile,
        target: {
          ...profile.target,
          viewport: undefined,
          render_path: 'native-html',
        },
        layout: {
          ...profile.layout,
          focus_order: undefined,
          regions: [
            {
              id: 'summary',
              kind: 'text',
              bounds: { x: 24, y: 24, width: 552, height: 180 },
              text: {
                source: 'state.summary',
                max_lines: 4,
                overflow: 'truncate',
              },
            },
            {
              id: 'preview',
              kind: 'media',
              bounds: { x: 24, y: 220, width: 552, height: 220 },
              media: {
                type: 'text/html',
                transport: 'https',
                fallback_text: 'Preview unavailable',
              },
            },
            {
              id: 'missing-action-control',
              kind: 'action',
              bounds: { x: 24, y: 512, width: 552, height: 64 },
              action_id: 'missing-action',
            },
          ],
        },
        actions: [
          {
            id: 'dismiss',
            method: 'archive_widget',
            backend_action_id: 'handsfree.widget.dismiss',
          },
        ],
        constraints: {
          ...profile.constraints,
          max_update_hz: 60,
        },
        fallback: {
          when: ['session_not_ready'],
          render_path: 'unsafe-overlay',
          message: '',
        },
      } as unknown as MetaGlassesDisplayProfile,
    };

    const result = validateMetaGlassesWidgetDescriptor(unsafe);
    const codes = result.errors.map(error => error.code);

    expect(result.conformant).toBe(false);
    expect(codes).toEqual(
      expect.arrayContaining([
        META_GLASSES_DISPLAY_ERROR_CODES.DISPLAY_VIEWPORT_MISSING,
        META_GLASSES_DISPLAY_ERROR_CODES.RENDER_PATH_UNSUPPORTED,
        META_GLASSES_DISPLAY_ERROR_CODES.FOCUS_ORDER_MISSING,
        META_GLASSES_DISPLAY_ERROR_CODES.TEXT_UNBOUNDED,
        META_GLASSES_DISPLAY_ERROR_CODES.MEDIA_TYPE_UNSUPPORTED,
        META_GLASSES_DISPLAY_ERROR_CODES.ACTION_METHOD_UNBOUND,
        META_GLASSES_DISPLAY_ERROR_CODES.METHOD_NOT_PRESENT,
        META_GLASSES_DISPLAY_ERROR_CODES.UPDATE_RATE_UNSAFE,
        META_GLASSES_DISPLAY_ERROR_CODES.CLEAR_RESET_MISSING,
        META_GLASSES_DISPLAY_ERROR_CODES.FALLBACK_MISSING,
      ]),
    );
  });
});
