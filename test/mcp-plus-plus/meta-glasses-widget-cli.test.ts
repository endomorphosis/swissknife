import { tmpdir } from 'os';
import { join } from 'path';
import {
  META_GLASSES_WIDGET_GALLERY_TEMPLATE_IDS,
  createMetaGlassesWidgetDescriptor,
  lintMetaGlassesWidgetDescriptor,
  listMetaGlassesWidgetGalleryTemplates,
  runMetaGlassesWidgetCommand,
  type MetaGlassesWidgetInvocationEnvelope,
  type MetaGlassesWidgetPublishRecord,
} from '../../src/commands/meta-glasses-widget';
import {
  META_GLASSES_DISPLAY_PROFILE_PROPERTY,
  type MetaGlassesWidgetDescriptor,
} from '../../src/services/glasses/meta-glasses-display-profile';
import {
  compileMetaGlassesWidgetManifest,
  type MetaGlassesWidgetManifest,
} from '../../src/services/glasses/meta-glasses-widget-compiler';

const FIXED_NOW = new Date('2026-05-22T12:45:00.000Z');
const realFs = jest.requireActual('fs') as typeof import('fs');

function tempDir(): string {
  return realFs.mkdtempSync(join(tmpdir(), 'mgw-widget-cli-'));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(realFs.readFileSync(filePath, 'utf8')) as T;
}

describe('Meta glasses widget authoring CLI', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = tempDir();
  });

  afterEach(() => {
    realFs.rmSync(cwd, { recursive: true, force: true });
  });

  it('ships a compiling gallery for task progress, confirmation, summary, timer, media, checklist, and metric widgets', () => {
    const gallery = listMetaGlassesWidgetGalleryTemplates();
    const ids = gallery.map(entry => entry.id);

    expect(ids).toEqual([...META_GLASSES_WIDGET_GALLERY_TEMPLATE_IDS]);
    expect(ids).toEqual([
      'task-progress',
      'confirmation',
      'summary',
      'timer',
      'media',
      'checklist',
      'metric',
    ]);

    for (const entry of gallery) {
      const lint = lintMetaGlassesWidgetDescriptor(entry.descriptor, entry.sample_state);
      const manifest = compileMetaGlassesWidgetManifest(entry.descriptor, {
        state: entry.sample_state,
      });

      expect(lint.ok).toBe(true);
      expect(lint.errors).toEqual([]);
      expect(manifest.widget_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(manifest.viewport).toEqual({ width: 600, height: 600 });
      expect(manifest.actions.length).toBeGreaterThan(0);
      expect(manifest.fallback.when).toContain('dat_native_display_unavailable');
    }
  });

  it('initializes, lints, compiles, previews, publishes, and invokes a widget without native code edits', async () => {
    const init = await runMetaGlassesWidgetCommand([
      'widget',
      'init',
      '--template',
      'confirmation',
      '--name',
      'approval-widget',
      '--output',
      'approval.widget.json',
    ], { cwd });
    const descriptorPath = join(cwd, 'approval.widget.json');
    const statePath = join(cwd, 'approval.widget.state.json');

    expect(init.ok).toBe(true);
    expect(realFs.existsSync(descriptorPath)).toBe(true);
    expect(realFs.existsSync(statePath)).toBe(true);

    const lint = await runMetaGlassesWidgetCommand([
      'widget',
      'lint',
      '--descriptor',
      'approval.widget.json',
      '--state-file',
      'approval.widget.state.json',
    ], { cwd });

    expect(lint.ok).toBe(true);
    expect(lint.message).toContain('Meta glasses widget lint passed');

    const compile = await runMetaGlassesWidgetCommand([
      'widget',
      'compile',
      '--descriptor',
      'approval.widget.json',
      '--state-file',
      'approval.widget.state.json',
      '--output',
      'approval.manifest.json',
    ], { cwd });
    const manifest = readJson<MetaGlassesWidgetManifest>(join(cwd, 'approval.manifest.json'));

    expect(compile.ok).toBe(true);
    expect(manifest.widget_id).toBe('org.handsfree.meta_glasses.gallery.approval-widget@1.0.0');
    expect(manifest.operation).toBe('render_widget');

    const preview = await runMetaGlassesWidgetCommand([
      'widget',
      'preview',
      '--manifest',
      'approval.manifest.json',
      '--output',
      'approval.preview.html',
    ], { cwd });
    const previewHtml = realFs.readFileSync(join(cwd, 'approval.preview.html'), 'utf8');

    expect(preview.ok).toBe(true);
    expect(previewHtml).toContain('data-meta-glasses-widget-preview="true"');
    expect(previewHtml).toContain('approval-widget');

    const publish = await runMetaGlassesWidgetCommand([
      'widget',
      'publish',
      '--descriptor',
      'approval.widget.json',
      '--state-file',
      'approval.widget.state.json',
      '--output',
      'approval.publish.json',
    ], { cwd, now: () => FIXED_NOW });
    const publishRecord = readJson<MetaGlassesWidgetPublishRecord>(join(cwd, 'approval.publish.json'));

    expect(publish.ok).toBe(true);
    expect(publishRecord.native_code_required).toBe(false);
    expect(publishRecord.published_at).toBe('2026-05-22T12:45:00.000Z');
    expect(publishRecord.interface_cid).toBe(manifest.interface_cid);
    expect(publishRecord.widget_cid).toBe(manifest.widget_cid);

    const invoke = await runMetaGlassesWidgetCommand([
      'widget',
      'invoke',
      '--descriptor',
      'approval.widget.json',
      '--state-file',
      'approval.widget.state.json',
      '--operation',
      'render_widget',
      '--output',
      'approval.invoke.json',
    ], { cwd, now: () => FIXED_NOW });
    const invocation = readJson<MetaGlassesWidgetInvocationEnvelope>(join(cwd, 'approval.invoke.json'));

    expect(invoke.ok).toBe(true);
    expect(invocation.native_code_required).toBe(false);
    expect(invocation.mobile_action.type).toBe('mobile_render_display_widget');
    expect(invocation.mobile_action.manifest?.widget_cid).toBe(manifest.widget_cid);

    const activate = await runMetaGlassesWidgetCommand([
      'widget',
      'invoke',
      '--descriptor',
      'approval.widget.json',
      '--state-file',
      'approval.widget.state.json',
      '--operation',
      'activate',
      '--action-id',
      'confirm',
    ], { cwd, now: () => FIXED_NOW });
    const activateEnvelope = activate.output as MetaGlassesWidgetInvocationEnvelope;

    expect(activate.ok).toBe(true);
    expect(activateEnvelope.mobile_action.type).toBe('mobile_activate_display_widget_action');
    expect(activateEnvelope.mobile_action.activated_action?.backend_action_id).toBe(
      'handsfree.confirmation.confirm',
    );
  });

  it('explains why unsafe descriptors are rejected', async () => {
    const descriptor = createMetaGlassesWidgetDescriptor('summary');
    delete descriptor[META_GLASSES_DISPLAY_PROFILE_PROPERTY].fallback;
    const descriptorPath = join(cwd, 'invalid.widget.json');
    realFs.writeFileSync(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, 'utf8');
    expect(realFs.existsSync(descriptorPath)).toBe(true);

    const lint = await runMetaGlassesWidgetCommand([
      'widget',
      'lint',
      '--descriptor',
      'invalid.widget.json',
    ], { cwd });

    expect(lint.ok).toBe(false);
    expect(lint.exit_code).toBe(1);
    expect(lint.message).toContain('Why rejected:');
    expect(lint.message).toContain('MGW_FALLBACK_MISSING');
  });
});
