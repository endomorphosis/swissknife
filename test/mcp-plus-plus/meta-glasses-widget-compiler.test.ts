import { readFileSync } from 'fs';
import { join } from 'path';
import {
  META_GLASSES_WIDGET_COMPILER_ERROR_CODES,
  META_GLASSES_WIDGET_MANIFEST_JSON_SCHEMA,
  META_GLASSES_WIDGET_MANIFEST_SCHEMA,
  META_GLASSES_WIDGET_MANIFEST_SCHEMA_VERSION,
  MetaGlassesWidgetCompileError,
  compileMetaGlassesWidgetManifest,
  type MetaGlassesWidgetCompileOptions,
  type MetaGlassesWidgetCompileIssue,
  type MetaGlassesWidgetManifest,
} from '../../src/services/glasses/meta-glasses-widget-compiler';
import {
  META_GLASSES_DISPLAY_PROFILE_PROPERTY,
  type MetaGlassesWidgetDescriptor,
} from '../../src/services/glasses/meta-glasses-display-profile';

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

function loadDescriptor(): MetaGlassesWidgetDescriptor {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as MetaGlassesWidgetDescriptor;
}

function cloneDescriptor(
  descriptor: MetaGlassesWidgetDescriptor = loadDescriptor(),
): MetaGlassesWidgetDescriptor {
  return JSON.parse(JSON.stringify(descriptor)) as MetaGlassesWidgetDescriptor;
}

function compileIssueCodes(
  descriptor: MetaGlassesWidgetDescriptor,
  state: Record<string, unknown> = STATE,
  options: Omit<MetaGlassesWidgetCompileOptions, 'state'> = {},
): string[] {
  return compileIssues(descriptor, state, options).map(issue => issue.code);
}

function compileIssues(
  descriptor: MetaGlassesWidgetDescriptor,
  state: Record<string, unknown> = STATE,
  options: Omit<MetaGlassesWidgetCompileOptions, 'state'> = {},
): MetaGlassesWidgetCompileIssue[] {
  try {
    compileMetaGlassesWidgetManifest(descriptor, { ...options, state });
  } catch (error) {
    expect(error).toBeInstanceOf(MetaGlassesWidgetCompileError);
    return (error as MetaGlassesWidgetCompileError).issues;
  }
  throw new Error('Expected compiler to reject descriptor.');
}

function snapshotManifest(manifest: MetaGlassesWidgetManifest) {
  return {
    ...manifest,
    widget_cid: '<widget-cid>',
    interface_cid: '<interface-cid>',
  };
}

describe('Meta glasses widget compiler', () => {
  it('compiles the task-progress fixture into a deterministic display manifest', () => {
    const descriptor = loadDescriptor();
    const manifest = compileMetaGlassesWidgetManifest(descriptor, { state: STATE });
    const reorderedState = {
      updated_at: STATE.updated_at,
      selected_action: STATE.selected_action,
      status: STATE.status,
      progress_label: STATE.progress_label,
      progress: STATE.progress,
      summary: STATE.summary,
      title: STATE.title,
    };
    const repeated = compileMetaGlassesWidgetManifest(descriptor, { state: reorderedState });
    const changed = compileMetaGlassesWidgetManifest(descriptor, {
      state: { ...STATE, progress_label: '43% complete' },
    });

    expect(manifest).toEqual(repeated);
    expect(manifest.widget_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(manifest.interface_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(changed.widget_cid).not.toBe(manifest.widget_cid);
    expect(manifest.viewport).toEqual({ width: 600, height: 600 });
    expect(manifest.regions.map(region => region.id)).toEqual([
      'title',
      'summary',
      'progress',
      'pause-control',
      'dismiss-control',
    ]);
    expect(manifest.focus_order).toEqual(['pause', 'dismiss']);
    expect(manifest.actions.map(action => [action.id, action.method, action.focus_index])).toEqual([
      ['pause', 'activate', 0],
      ['dismiss', 'clear_widget', 1],
    ]);
    expect(manifest.media).toEqual([]);
    expect(manifest.ttl_ms).toBe(45000);
    expect(manifest.fallback.when).toEqual([
      'dat_native_display_unavailable',
      'display_unsupported',
      'session_not_ready',
    ]);
    expect(manifest.renderer_hints.primary_render_path).toBe('dat-native');
    expect(manifest.state.values.progress_label).toBe('42% complete');
    expect(manifest.regions.find(region => region.id === 'summary')?.text?.value).toBe(
      'Pinning and indexing a research collection for offline access.',
    );

    expect(snapshotManifest(manifest)).toMatchInlineSnapshot(`
      {
        "actions": [
          {
            "backend_action_id": "handsfree.task.pause",
            "focus_index": 0,
            "focusable": true,
            "id": "pause",
            "label": "Pause",
            "method": "activate",
            "region_id": "pause-control",
            "service_id": "display-widget",
            "state_keys": [
              "selected_action",
            ],
          },
          {
            "backend_action_id": "handsfree.widget.dismiss",
            "focus_index": 1,
            "focusable": true,
            "id": "dismiss",
            "label": "Dismiss",
            "method": "clear_widget",
            "region_id": "dismiss-control",
            "service_id": "display-widget",
            "state_keys": [
              "selected_action",
            ],
          },
        ],
        "descriptor": {
          "name": "handsfree-task-progress-widget",
          "namespace": "org.handsfree.meta_glasses",
          "profile": "handsfree.meta-glasses/display-widget",
          "profile_version": "0.1.0",
          "version": "1.0.0",
        },
        "fallback": {
          "message": "Display unavailable. Showing task progress on phone.",
          "render_path": "mobile-card",
          "when": [
            "dat_native_display_unavailable",
            "display_unsupported",
            "session_not_ready",
          ],
        },
        "focus_order": [
          "pause",
          "dismiss",
        ],
        "interface_cid": "<interface-cid>",
        "media": [],
        "operation": "render_widget",
        "regions": [
          {
            "bounds": {
              "height": 72,
              "width": 552,
              "x": 24,
              "y": 24,
            },
            "id": "title",
            "kind": "text",
            "text": {
              "estimated_capacity_chars": 207,
              "max_chars": 64,
              "max_lines": 2,
              "overflow": "truncate",
              "source": "state.title",
              "value": "Sync dataset",
            },
          },
          {
            "bounds": {
              "height": 168,
              "width": 552,
              "x": 24,
              "y": 112,
            },
            "id": "summary",
            "kind": "status",
            "text": {
              "estimated_capacity_chars": 483,
              "max_chars": 180,
              "max_lines": 4,
              "overflow": "wrap",
              "source": "state.summary",
              "value": "Pinning and indexing a research collection for offline access.",
            },
          },
          {
            "bounds": {
              "height": 120,
              "width": 552,
              "x": 24,
              "y": 304,
            },
            "id": "progress",
            "kind": "progress",
            "text": {
              "estimated_capacity_chars": 345,
              "max_chars": 48,
              "max_lines": 2,
              "overflow": "truncate",
              "source": "state.progress_label",
              "value": "42% complete",
            },
          },
          {
            "action_id": "pause",
            "bounds": {
              "height": 80,
              "width": 264,
              "x": 24,
              "y": 464,
            },
            "id": "pause-control",
            "kind": "action",
          },
          {
            "action_id": "dismiss",
            "bounds": {
              "height": 80,
              "width": 264,
              "x": 312,
              "y": 464,
            },
            "id": "dismiss-control",
            "kind": "action",
          },
        ],
        "renderer_hints": {
          "display_webapp": {
            "fallback_allowed": false,
            "viewport": {
              "height": 600,
              "width": 600,
            },
          },
          "high_contrast_required": true,
          "max_update_hz": 2,
          "native_dat": {
            "display_class": "meta-ray-ban-display",
            "fixed_viewport": true,
            "session_required": true,
          },
          "primary_render_path": "dat-native",
          "supported_inputs": [
            "dpad",
            "gesture",
            "voice",
            "mobile_action",
          ],
        },
        "schema": "handsfree.meta-glasses/widget-manifest",
        "schema_version": "0.1.0",
        "state": {
          "keys": [
            "title",
            "summary",
            "progress",
            "progress_label",
            "status",
            "selected_action",
            "last_error",
            "updated_at",
          ],
          "values": {
            "last_error": null,
            "progress": 0.42,
            "progress_label": "42% complete",
            "selected_action": null,
            "status": "running",
            "summary": "Pinning and indexing a research collection for offline access.",
            "title": "Sync dataset",
            "updated_at": "2026-05-22T12:00:00.000Z",
          },
        },
        "ttl_ms": 45000,
        "viewport": {
          "height": 600,
          "width": 600,
        },
        "widget_cid": "<widget-cid>",
        "widget_id": "org.handsfree.meta_glasses.handsfree-task-progress-widget@1.0.0",
      }
    `);
  });

  it('exposes a manifest JSON Schema with required deterministic fields', () => {
    expect(META_GLASSES_WIDGET_MANIFEST_JSON_SCHEMA.properties.schema.const).toBe(
      META_GLASSES_WIDGET_MANIFEST_SCHEMA,
    );
    expect(META_GLASSES_WIDGET_MANIFEST_JSON_SCHEMA.properties.schema_version.const).toBe(
      META_GLASSES_WIDGET_MANIFEST_SCHEMA_VERSION,
    );
    expect(META_GLASSES_WIDGET_MANIFEST_JSON_SCHEMA.required).toEqual(
      expect.arrayContaining([
        'widget_id',
        'widget_cid',
        'interface_cid',
        'viewport',
        'regions',
        'focus_order',
        'actions',
        'media',
        'state',
        'ttl_ms',
        'fallback',
      ]),
    );
    expect(META_GLASSES_WIDGET_MANIFEST_JSON_SCHEMA.properties.regions.items.required).toEqual([
      'id',
      'kind',
      'bounds',
    ]);
    expect(META_GLASSES_WIDGET_MANIFEST_JSON_SCHEMA.properties.actions.items.required).toEqual([
      'id',
      'method',
      'backend_action_id',
      'focusable',
      'state_keys',
    ]);
    expect(META_GLASSES_WIDGET_MANIFEST_JSON_SCHEMA.properties.media.items.required).toEqual([
      'id',
      'region_id',
      'type',
      'transport',
      'size_bytes',
      'fallback_text',
    ]);
    expect(
      META_GLASSES_WIDGET_MANIFEST_JSON_SCHEMA.properties.fallback.properties.when.contains,
    ).toEqual({ const: 'dat_native_display_unavailable' });
    expect(
      META_GLASSES_WIDGET_MANIFEST_JSON_SCHEMA.properties.renderer_hints.properties.native_dat
        .properties.fixed_viewport,
    ).toEqual({ const: true });
  });

  it('supports non-render widget operations when declared by the descriptor', () => {
    const manifest = compileMetaGlassesWidgetManifest(loadDescriptor(), {
      operation: 'update_widget',
      state: STATE,
      widget_id: 'task-progress-active',
      interface_cid: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    });

    expect(manifest.operation).toBe('update_widget');
    expect(manifest.widget_id).toBe('task-progress-active');
    expect(manifest.interface_cid).toBe(
      'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    );
  });

  it('rejects operations not declared by the widget descriptor', () => {
    const descriptor = loadDescriptor();

    expect(() => compileMetaGlassesWidgetManifest(descriptor, {
      operation: 'delete_everything',
      state: STATE,
    })).toThrow(MetaGlassesWidgetCompileError);

    expect(compileIssueCodes(descriptor, STATE, { operation: 'delete_everything' })).toContain(
      META_GLASSES_WIDGET_COMPILER_ERROR_CODES.OPERATION_UNSUPPORTED,
    );
  });

  it('rejects unsafe region geometry and text fitting before manifest emission', () => {
    const descriptor = cloneDescriptor();
    const profile = descriptor[META_GLASSES_DISPLAY_PROFILE_PROPERTY];
    profile.layout.regions[1].bounds.y = 80;
    profile.layout.regions[2].bounds = { x: 24, y: 304, width: 40, height: 20 };
    profile.layout.regions[4].bounds.y = 560;

    expect(compileIssueCodes(descriptor)).toEqual(
      expect.arrayContaining([
        META_GLASSES_WIDGET_COMPILER_ERROR_CODES.REGION_COLLISION,
        META_GLASSES_WIDGET_COMPILER_ERROR_CODES.TEXT_FIT_UNSAFE,
        META_GLASSES_WIDGET_COMPILER_ERROR_CODES.REGION_BOUNDS_UNSAFE,
      ]),
    );
  });

  it('rejects unsafe focus order, actions, media, and state contracts', () => {
    const descriptor = cloneDescriptor();
    const profile = descriptor[META_GLASSES_DISPLAY_PROFILE_PROPERTY];
    profile.layout.focus_order = ['pause', 'pause', 'dismiss'];
    profile.actions?.push({
      id: 'background-refresh',
      method: 'update_widget',
      backend_action_id: '',
      focusable: false,
      state_keys: ['missing_state'],
    });
    profile.layout.regions.push({
      id: 'preview',
      kind: 'media',
      bounds: { x: 24, y: 560, width: 120, height: 32 },
      media: {
        type: 'image/png',
        transport: 'cid',
        fallback_text: 'Preview unavailable',
      },
    });
    profile.constraints.max_actions = 2;
    profile.constraints.max_text_blocks = 2;

    expect(compileIssueCodes(descriptor, { ...STATE, progress: Number.NaN })).toEqual(
      expect.arrayContaining([
        META_GLASSES_WIDGET_COMPILER_ERROR_CODES.FOCUS_ORDER_UNSAFE,
        META_GLASSES_WIDGET_COMPILER_ERROR_CODES.ACTION_UNSAFE,
        META_GLASSES_WIDGET_COMPILER_ERROR_CODES.ACTION_LIMIT,
        META_GLASSES_WIDGET_COMPILER_ERROR_CODES.TEXT_BLOCK_LIMIT,
        META_GLASSES_WIDGET_COMPILER_ERROR_CODES.MEDIA_UNSAFE,
        META_GLASSES_WIDGET_COMPILER_ERROR_CODES.STATE_UNSAFE,
      ]),
    );
  });

  it('wraps profile validation failures as compiler issues', () => {
    const descriptor = cloneDescriptor();
    const profile = descriptor[META_GLASSES_DISPLAY_PROFILE_PROPERTY];
    profile.target.render_path = 'native-html' as never;

    const issues = compileIssues(descriptor);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: META_GLASSES_WIDGET_COMPILER_ERROR_CODES.DESCRIPTOR_INVALID,
          path: 'meta_glasses_display.target.render_path',
        }),
      ]),
    );
  });
});
